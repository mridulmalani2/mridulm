/**
 * engine2/suggest.ts — the SUGGESTION CATALOGUE (v2.0.0, owner rule 2026-11-09: "blank until
 * entered").
 *
 * v1 pre-filled every assumption — including uncited template guesses (flat 3% growth, a
 * static 4.3% SOFR, min cash = 2% of revenue, a 50% sweep, a default-ON MIP) — and asked the
 * analyst to review them. v2.0.0 pre-fills NOTHING. This module only proposes values the
 * analyst may ACCEPT one at a time, and every proposal must carry a real basis:
 *   - 'facts'      — straight from the filing (named line, named year),
 *   - 'history'    — computed from ≥ MIN_HISTORY_POINTS filed full years (the D1 gate),
 *   - 'convention' — a CITED market convention from conventions.json (the citation string
 *                    travels with the value) or a statute.
 * A value with no such basis is never proposed — the field stays blank and Build stays
 * gated (`draft.ts`). Nothing here is a fact; nothing here reaches the engine unaccepted.
 *
 * No imports from lib/engine (boundary test).
 */

import conventionsJson from './suggestions/conventions.json';
import type { DealAssumptions, DealFacts, TrancheAssumption } from './types';
import { buildOperating } from './operating';
import { deriveEntry } from './sourcesUses';

export interface SuggestionBasis {
  kind: 'history' | 'convention' | 'facts' | 'template' | 'ai';
  detail: string;
}

export interface Suggestion<T = unknown> {
  value: T;
  basis: SuggestionBasis;
}

/** fieldPath → the proposal for that field (absent ⇔ nothing defensible to propose). */
export type SuggestionCatalogue = Record<string, Suggestion>;

/** D1 gate re-stated here (suggest.ts must not import lib/edgar): ≥3 usable points. */
export const MIN_HISTORY_POINTS = 3;

/** A CITED convention: the numeric value and its citation, or null when either is absent. */
function cited(path: string[]): { value: number; citation: string } | null {
  let node: unknown = conventionsJson;
  for (const key of path) {
    if (typeof node !== 'object' || node === null || !(key in node)) return null;
    node = (node as Record<string, unknown>)[key];
  }
  if (typeof node !== 'object' || node === null) return null;
  const o = node as Record<string, unknown>;
  const citation = (o.citation ?? o.source ?? o.cite) as unknown;
  if (typeof o.value !== 'number' || typeof citation !== 'string' || citation.length === 0) return null;
  return { value: o.value, citation };
}

/**
 * A cited figure stored under its own key (the base rate, the sweep level, the springing trigger):
 * the value at `valueKey`, with the citation and as-of date of the node at `path`.
 */
function citedAt(path: string[], valueKey: string[]): { value: number; citation: string; asOf: string | null } | null {
  let node: unknown = conventionsJson;
  for (const key of path) {
    if (typeof node !== 'object' || node === null || !(key in node)) return null;
    node = (node as Record<string, unknown>)[key];
  }
  if (typeof node !== 'object' || node === null) return null;
  const o = node as Record<string, unknown>;
  let v: unknown = o;
  for (const key of valueKey) {
    if (typeof v !== 'object' || v === null || !(key in v)) return null;
    v = (v as Record<string, unknown>)[key];
  }
  if (typeof v !== 'number' || typeof o.citation !== 'string' || o.citation.length === 0) return null;
  return { value: v, citation: o.citation, asOf: typeof o.asOf === 'string' ? o.asOf : null };
}
const asOfText = (asOf: string | null) => (asOf ? `, as of ${asOf}` : '');

const pctText = (x: number) => `${(x * 100).toFixed(1)}%`;

/**
 * The holding period is the first input (it sizes every per-year line), so its proposal exists
 * before the draft does. Five years is the underwriting convention recorded in conventions.json.
 */
export function holdSuggestion(): Suggestion<number> | null {
  const node = (conventionsJson as { deal?: { holdPeriodYears?: { suggested?: unknown; citation?: unknown; asOf?: unknown } } }).deal?.holdPeriodYears;
  if (!node || typeof node.suggested !== 'number' || typeof node.citation !== 'string') return null;
  return {
    value: node.suggested,
    basis: { kind: 'convention', detail: `${node.suggested} years is the usual underwriting hold (realised holds run longer, about 7 years at exit). Source: ${node.citation}${asOfText(typeof node.asOf === 'string' ? node.asOf : null)}` },
  };
}

/**
 * Build the catalogue for one deal. `hold_years` sizes the per-year proposals; `current`
 * lets proposals that depend on another input (exit = entry) follow what was entered.
 */
export function suggestionsFor(
  facts: DealFacts,
  hold_years: number,
  current?: Pick<DealAssumptions, 'entry'> & Partial<Pick<DealAssumptions, 'operations' | 'fees' | 'valuation' | 'structure'>>,
  /** Choices not yet made (the draft's `pending`): a proposal never reads an unchosen basis. */
  pending: readonly string[] = [],
): SuggestionCatalogue {
  const out: SuggestionCatalogue = {};
  const put = (path: string, value: unknown, kind: SuggestionBasis['kind'], detail: string) => {
    out[path] = { value, basis: { kind, detail } };
  };
  const N = hold_years;
  const fy = facts.fiscal_year === null ? 'latest FY' : `FY${facts.fiscal_year}`;

  // ── Entry multiple: the cited SCALE-band median (sector medians are withheld:
  //    verifyBeforeDisplay — citation honesty). Needs historical EBITDA for the band.
  // The size band and every cited figure here are US-DOLLAR market data ($10–500m, US buyout
  // medians, TLB/unitranche terms). They are proposed for USD deals only: ¥100m of EBITDA is not
  // a large-cap US buyout. Other currencies get no proposal until a cited regional source exists.
  const usd = facts.currency === 'USD';
  if (usd && facts.fy_ebitda !== null && facts.fy_ebitda > 0) {
    const largeCap = facts.fy_ebitda >= 100;
    const c = cited(['entryMultiples', largeCap ? 'usBuyoutOverall' : 'middleMarket10to500']);
    if (c) put('entry.entry_multiple', c.value, 'convention', `${largeCap ? 'US buyout overall' : 'middle-market $10–500m'} median EV/EBITDA, ${c.citation}`);
  }

  // ── Growth: the history CAGR over the TRUE span (≥3 full-year revenue points) ──
  const revHist = facts.history.filter((h) => h.revenue !== null);
  if (revHist.length >= MIN_HISTORY_POINTS) {
    const first = revHist[0];
    const last = revHist[revHist.length - 1];
    const spanDays = (Date.parse(last.period_end) - Date.parse(first.period_end)) / 86_400_000;
    if (first.revenue! > 0 && last.revenue! > 0 && spanDays >= 350) {
      const cagr = Math.pow(last.revenue! / first.revenue!, 365.25 / spanDays) - 1;
      put('operations.growth', Array.from({ length: N }, () => cagr), 'history',
        `${revHist.length}-point revenue CAGR ${pctText(cagr)} over the true ${(spanDays / 365.25).toFixed(1)}y span (${first.period_end} → ${last.period_end}), held flat`);
    }
  }

  // ── Filing ratios (each a forecast assumption — proposed, never pre-filled) ──
  if (facts.fy_ebitda_margin !== null) {
    put('operations.target_margin', facts.fy_ebitda_margin, 'facts', `${fy} EBITDA margin ${pctText(facts.fy_ebitda_margin)} held flat: expansion needs an explicit thesis`);
  }
  if (facts.da_pct_revenue !== null) put('operations.da_pct_revenue', facts.da_pct_revenue, 'facts', `${fy} D&A ÷ revenue from the filing`);
  if (facts.maint_capex_pct_revenue !== null) put('operations.maint_capex_pct_revenue', facts.maint_capex_pct_revenue, 'facts', `${fy} capex ÷ revenue from the filing`);
  if (facts.dso !== null && facts.dio !== null && facts.dpo !== null) {
    put('operations.nwc', { method: 'days', dso: facts.dso, dio: facts.dio, dpo: facts.dpo }, 'facts',
      `${fy} filing days (DSO ${facts.dso.toFixed(0)} / DIO ${facts.dio.toFixed(0)} / DPO ${facts.dpo.toFixed(0)})`);
  } else if (facts.nwc_pct_revenue !== null) {
    put('operations.nwc', { method: 'pct', pct_revenue: facts.nwc_pct_revenue }, 'facts', `${fy} operating NWC ÷ revenue from the filing`);
  }
  if (facts.effective_tax_rate !== null) put('tax.rate', facts.effective_tax_rate, 'facts', `${fy} effective tax rate from the filing`);
  if (facts.nol_carryforward_floor !== null) {
    put('tax.nol.acquired_opening', facts.nol_carryforward_floor, 'facts', `${fy} NOL carryforward (a FLOOR: companyfacts is non-dimensional)`);
  }

  // ── Statute: IRC §163(j) applies to US filers only ──
  if (facts.source === 'edgar' && facts.currency === 'USD') {
    put('tax.s163j', { applies: true, ati_basis: 'ebitda', ati_pct: 0.3 }, 'convention', 'IRC §163(j): 30% of ATI, EBITDA-based ATI post-OBBBA (US filer)');
  }

  // ── Cited financing conventions ──
  const fee = cited(['fees', 'buySideAdvisoryPctOfEv']);
  if (fee) put('fees.transaction_pct_of_ev', fee.value, 'convention', `buy-side fees ${pctText(fee.value)} of EV, ${fee.citation}`);
  const fin = cited(['fees', 'financingFeePctOfDebt']);
  if (fin) put('fees.financing_pct_of_commitments', fin.value, 'convention', `financing fees ${pctText(fin.value)} of commitments, ${fin.citation}`);

  // Debt structure template: cited leverage/spread/OID/amortization; the BASE RATE and the
  // MATURITY are left blank (NaN) on purpose — no cited live value exists in the repo, so the
  // analyst enters them and `draft.ts` keeps Build gated until they do.
  if (usd && facts.fy_ebitda !== null && facts.fy_ebitda > 0) {
    const largeCap = facts.fy_ebitda >= 100;
    const lev = cited(['leverage', largeCap ? 'largeCap' : 'middleMarket', 'totalDebtToEbitda']);
    const spread = cited(['pricing', largeCap ? 'tlbSpreadBps' : 'unitrancheSpreadBps']);
    const oid = cited(['pricing', largeCap ? 'tlbOidPct' : 'unitrancheOidPct']);
    const amort = largeCap ? cited(['amortization', 'tlbUsPctPerYear']) : cited(['amortization', 'notesSecondLienMezz']);
    if (lev && spread && oid && amort) {
      const t: TrancheAssumption = {
        name: largeCap ? 'TLB' : 'Unitranche',
        type: largeCap ? 'senior' : 'unitranche',
        size: { x_ebitda: lev.value },
        pricing: { kind: 'floating', base_rate: Number.NaN, spread: spread.value / 10_000, floor: 0 },
        amort_pct_of_face: amort.value,
        maturity_years: Number.NaN,
        oid_pct: oid.value,
        sweep: { participates: true, priority: 1 },
      };
      put('structure.tranches', [t], 'convention',
        `${t.name}: ${lev.value.toFixed(1)}x (${lev.citation}); spread ${spread.value}bps (${spread.citation}); OID ${pctText(oid.value)} (${oid.citation}); amortization ${pctText(amort.value)}/yr (${amort.citation}). Base rate and maturity are left for you; no cited live value.`);
    }
  }

  // ── Exit = entry: the "no multiple expansion" convention, following what was entered ──
  // Priced by a multiple: that multiple. Priced by a purchase price: the multiple the price
  // IMPLIES, taken from the engine's own entry derivation (deriveEntry over buildOperating) at
  // full precision, so "exit at the entry multiple" never depends on a hand-typed rounding of
  // EV ÷ EBITDA. Offered only once every input that derivation reads has been entered.
  const entryMultiple = impliedEntryMultiple(facts, current, pending);
  if (entryMultiple !== null) {
    const priced = current?.entry.driver === 'ev';
    put('exit.multiple', entryMultiple, 'convention',
      `exit at the entry multiple${priced ? ` (${entryMultiple.toFixed(4)}x = purchase price ÷ ${current?.entry.basis === 'ntm' ? 'forecast year-1' : 'historical'} EBITDA)` : ''}: multiple expansion is usually unjustifiable (DR-4 Cat.7)`);
  }

  // ── Terminal year (§28): offered only once the analyst has chosen to state one ──
  if (current?.valuation?.terminal) {
    put('valuation.terminal.capex_pct_of_da', 1, 'convention',
      'steady state: capex replaces what depreciates, so capex = D&A. Below 1.00 the asset base is run down for ever; above it, the business is still investing for growth beyond g');
  }

  // ── A proposal for each single field that has a cited basis (owner direction 2026-11-12: a
  //    recommendation on every assumption field, each with its source). Still proposals only:
  //    nothing is applied unless accepted, and a field with no defensible basis gets none. ──
  const hold = holdSuggestion();
  if (hold) out['entry.hold_years'] = hold;

  // Bases: the historical year where there is one (what filings report), and the exit on the
  // entry's basis so the two multiples can be compared (SPEC §9/§11).
  if (facts.fy_ebitda !== null && facts.fy_ebitda > 0) {
    put('entry.basis', 'fy', 'convention', `price on the historical year (${facts.sizing_basis === 'LTM' ? 'LTM' : fy}), the figure the source reports; choose NTM only if the price was struck on forecast EBITDA (SPEC §9)`);
  }
  if (current && !pending.includes('entry.basis')) {
    put('exit.basis', current.entry.basis, 'convention', 'the same basis as the entry multiple, so the change between entry and exit multiples is a like-for-like comparison (SPEC §9/§11)');
  }

  // Single figures from the filing, for a field entered on its own.
  if (facts.nwc_pct_revenue !== null) put('operations.nwc.pct_revenue', facts.nwc_pct_revenue, 'facts', `${fy} operating NWC ÷ revenue from the filing`);
  if (facts.dso !== null) put('operations.nwc.dso', facts.dso, 'facts', `${fy} receivables ÷ revenue × 365 from the filing`);
  if (facts.dio !== null) put('operations.nwc.dio', facts.dio, 'facts', `${fy} inventory ÷ cost of sales × 365 from the filing`);
  if (facts.dpo !== null) put('operations.nwc.dpo', facts.dpo, 'facts', `${fy} payables ÷ cost of sales × 365 from the filing`);

  // US statute, for a US filer only.
  const usFiler = facts.source === 'edgar' && facts.currency === 'USD';
  if (usFiler) {
    if (facts.effective_tax_rate === null) put('tax.rate', 0.21, 'convention', 'US federal statutory rate, 21% (IRC §11(b)). State and foreign taxes are not included: use the effective rate if you know it');
    put('tax.interest_deductible', true, 'convention', 'interest is deductible (IRC §163(a)), subject to the §163(j) cap entered below');
    put('tax.s163j.ati_pct', 0.3, 'convention', 'IRC §163(j): interest is capped at 30% of adjusted taxable income');
    put('tax.s163j.ati_basis', 'ebitda', 'convention', 'adjusted taxable income is EBITDA-based for tax years beginning after 2024 (OBBBA, P.L. 119-21)');
  }
  const nolUsable = (conventionsJson as { tax?: { acquiredNolUsable?: { suggested?: unknown; citation?: unknown } } }).tax?.acquiredNolUsable;
  if (nolUsable && typeof nolUsable.suggested === 'boolean' && typeof nolUsable.citation === 'string') {
    put('tax.nol.acquired_usable', nolUsable.suggested, 'convention', `a target's losses generally do not survive a sponsor acquisition structure (asset purchase, §338(h)(10), §336(e)). Source: ${nolUsable.citation}`);
  }

  // Cited US financing terms, per facility. USD deals only (the figures are US market data).
  if (usd) {
    const sweep = citedAt(['sweep', 'basePreset'], ['sweepPct']);
    if (sweep) put('structure.sweep.base_pct', sweep.value, 'convention', `${pctText(sweep.value)} of excess cash is the usual sweep level; many agreements step it down as leverage falls. Source: ${sweep.citation}${asOfText(sweep.asOf)}`);
    const trigger = citedAt(['covenants', 'bslPreset'], ['springing', 'revolverDrawTrigger']);
    if (trigger) put('covenants.springing.revolver_draw_trigger_pct', trigger.value, 'convention', `the springing test usually applies once the revolver is drawn above 35 to 40% of the commitment. Source: ${trigger.citation}${asOfText(trigger.asOf)}`);

    const base = citedAt(['pricing', 'baseRate'], ['termSofr3m']);
    const floor = cited(['pricing', 'sofrFloor']);
    const mezz = { cash: citedAt(['pricing', 'mezzanine'], ['cashCouponPct']), pik: citedAt(['pricing', 'mezzanine'], ['pikCouponPct']) };
    const tranches = current?.structure?.tranches ?? [];
    const terms = tranches.filter((t) => t.type !== 'revolver');
    tranches.forEach((t, i) => {
      const at = `structure.tranches.${i}`;
      if (t.type === 'pik_note') {
        if (mezz.cash) put(`${at}.cash_coupon`, mezz.cash.value, 'convention', `mezzanine cash coupon ${pctText(mezz.cash.value)}. Source: ${mezz.cash.citation}${asOfText(mezz.cash.asOf)}`);
        if (mezz.pik) put(`${at}.pik_coupon`, mezz.pik.value, 'convention', `mezzanine PIK coupon ${pctText(mezz.pik.value)}. Source: ${mezz.pik.citation}${asOfText(mezz.pik.asOf)}`);
        return;
      }
      if (t.pricing.kind === 'floating') {
        if (base) put(`${at}.pricing.base_rate`, base.value, 'convention', `3-month term SOFR ${pctText(base.value)}${asOfText(base.asOf)}. Rates move: check today's rate before relying on it. Source: ${base.citation}`);
        if (floor) put(`${at}.pricing.floor`, floor.value, 'convention', `a ${pctText(floor.value)} floor is standard on top credits; 0.5% appears, higher floors are legacy or private credit. Source: ${floor.citation}`);
      }
      if (t.type === 'revolver') return;
      const bsl = t.type === 'senior';
      const spread = t.type === 'senior' ? cited(['pricing', 'tlbSpreadBps']) : t.type === 'unitranche' ? cited(['pricing', 'unitrancheSpreadBps']) : null;
      if (spread && t.pricing.kind === 'floating') put(`${at}.pricing.spread`, spread.value / 10_000, 'convention', `${bsl ? 'term loan B' : 'unitranche'} spread ${spread.value}bps over the base rate. Source: ${spread.citation}`);
      const oid = t.type === 'senior' ? cited(['pricing', 'tlbOidPct']) : t.type === 'unitranche' ? cited(['pricing', 'unitrancheOidPct']) : null;
      if (oid) put(`${at}.oid_pct`, oid.value, 'convention', `${bsl ? 'term loan B' : 'unitranche'} original issue discount ${pctText(oid.value)} of par. Source: ${oid.citation}`);
      const amort = t.type === 'senior' ? cited(['amortization', 'tlbUsPctPerYear']) : t.type === 'mezzanine' ? cited(['amortization', 'notesSecondLienMezz']) : null;
      if (amort) put(`${at}.amort_pct_of_face`, amort.value, 'convention', `${bsl ? 'a US term loan B amortizes 1% of face a year' : 'notes, second-lien and mezzanine debt do not amortize'}. Source: ${amort.citation}`);
      // total leverage, only when this is the one term facility (two facilities each at the total would double it)
      if (terms.length === 1 && facts.fy_ebitda !== null && facts.fy_ebitda > 0 && t.size.x_ebitda !== undefined) {
        const lev = cited(['leverage', facts.fy_ebitda >= 100 ? 'largeCap' : 'middleMarket', 'totalDebtToEbitda']);
        if (lev) put(`${at}.size.x_ebitda`, lev.value, 'convention', `total debt ${lev.value.toFixed(1)}x EBITDA, the ${facts.fy_ebitda >= 100 ? 'large-cap' : 'middle-market'} median. Source: ${lev.citation}`);
      }
    });
  }

  // ── MIP terms (offered only when the analyst switches a MIP on) ──
  const pool = cited(['mip', 'poolPctOfFdEquity']);
  const hurdle = cited(['mip', 'hurdleMoic']);
  if (pool && hurdle) {
    put('mip', { pool_pct: pool.value, hurdle_moic: hurdle.value, ratchet: null }, 'convention', `${pctText(pool.value)} pool (${pool.citation}) / ${hurdle.value.toFixed(1)}x hurdle (${hurdle.citation})`);
    put('mip.pool_pct', pool.value, 'convention', `management promote pool ${pctText(pool.value)} of the gain above the hurdle. Source: ${pool.citation}`);
    put('mip.hurdle_moic', hurdle.value, 'convention', `the promote starts once the sponsor has ${hurdle.value.toFixed(1)}x its money. Source: ${hurdle.citation}`);
  }

  return out;
}

/**
 * The entry multiple as the engine will derive it, or null while it cannot be derived yet.
 * Never a second definition: the same `deriveEntry(buildOperating(...).years[0].ebitda)` the
 * build sequence runs (SPEC §2, §24.4).
 */
function impliedEntryMultiple(
  facts: DealFacts,
  current: (Pick<DealAssumptions, 'entry'> & Partial<Pick<DealAssumptions, 'operations' | 'fees'>>) | undefined,
  pending: readonly string[],
): number | null {
  if (!current) return null;
  const { entry } = current;
  if (entry.driver === 'multiple') {
    return entry.entry_multiple !== null && Number.isFinite(entry.entry_multiple) ? entry.entry_multiple : null;
  }
  if (entry.enterprise_value === null || !Number.isFinite(entry.enterprise_value)) return null;
  if (pending.includes('entry.basis')) return null; // the price implies no multiple until its basis is chosen
  try {
    let year1Ebitda = Number.NaN;
    if (entry.basis === 'ntm') {
      if (!current.operations || !current.fees) return null;
      year1Ebitda = buildOperating(facts, { entry, operations: current.operations, fees: current.fees }, []).years[0].ebitda;
      if (!Number.isFinite(year1Ebitda)) return null;
    }
    const m = deriveEntry(facts, { entry }, year1Ebitda).entry_multiple;
    return Number.isFinite(m) && m > 0 ? m : null;
  } catch {
    return null; // an input the derivation needs is still blank or invalid
  }
}
