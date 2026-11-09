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

const pctText = (x: number) => `${(x * 100).toFixed(1)}%`;

/**
 * Build the catalogue for one deal. `hold_years` sizes the per-year proposals; `current`
 * lets proposals that depend on another input (exit = entry) follow what was entered.
 */
export function suggestionsFor(
  facts: DealFacts,
  hold_years: number,
  current?: Pick<DealAssumptions, 'entry'>,
): SuggestionCatalogue {
  const out: SuggestionCatalogue = {};
  const put = (path: string, value: unknown, kind: SuggestionBasis['kind'], detail: string) => {
    out[path] = { value, basis: { kind, detail } };
  };
  const N = hold_years;
  const fy = facts.fiscal_year === null ? 'latest FY' : `FY${facts.fiscal_year}`;

  // ── Entry multiple: the cited SCALE-band median (sector medians are withheld:
  //    verifyBeforeDisplay — citation honesty). Needs historical EBITDA for the band.
  if (facts.fy_ebitda !== null && facts.fy_ebitda > 0) {
    const largeCap = facts.fy_ebitda >= 100;
    const c = cited(['entryMultiples', largeCap ? 'usBuyoutOverall' : 'middleMarket10to500']);
    if (c) put('entry.entry_multiple', c.value, 'convention', `${largeCap ? 'US buyout overall' : 'middle-market $10–500m'} median EV/EBITDA — ${c.citation}`);
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
    put('operations.target_margin', facts.fy_ebitda_margin, 'facts', `${fy} EBITDA margin ${pctText(facts.fy_ebitda_margin)} held flat — expansion needs an explicit thesis`);
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
    put('tax.nol.acquired_opening', facts.nol_carryforward_floor, 'facts', `${fy} NOL carryforward (a FLOOR — companyfacts is non-dimensional)`);
  }

  // ── Statute: IRC §163(j) applies to US filers only ──
  if (facts.source === 'edgar' && facts.currency === 'USD') {
    put('tax.s163j', { applies: true, ati_basis: 'ebitda', ati_pct: 0.3 }, 'convention', 'IRC §163(j): 30% of ATI, EBITDA-based ATI post-OBBBA (US filer)');
  }

  // ── Cited financing conventions ──
  const fee = cited(['fees', 'buySideAdvisoryPctOfEv']);
  if (fee) put('fees.transaction_pct_of_ev', fee.value, 'convention', `buy-side fees ${pctText(fee.value)} of EV — ${fee.citation}`);
  const fin = cited(['fees', 'financingFeePctOfDebt']);
  if (fin) put('fees.financing_pct_of_commitments', fin.value, 'convention', `financing fees ${pctText(fin.value)} of commitments — ${fin.citation}`);

  // Debt structure template: cited leverage/spread/OID/amortization; the BASE RATE and the
  // MATURITY are left blank (NaN) on purpose — no cited live value exists in the repo, so the
  // analyst enters them and `draft.ts` keeps Build gated until they do.
  if (facts.fy_ebitda !== null && facts.fy_ebitda > 0) {
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
        `${t.name}: ${lev.value.toFixed(1)}x (${lev.citation}); spread ${spread.value}bps (${spread.citation}); OID ${pctText(oid.value)} (${oid.citation}); amortization ${pctText(amort.value)}/yr (${amort.citation}). Base rate and maturity are left for you — no cited live value.`);
    }
  }

  // ── Exit = entry: the "no multiple expansion" convention, following what was entered ──
  const entryMultiple = current?.entry.entry_multiple ?? null;
  if (entryMultiple !== null && Number.isFinite(entryMultiple)) {
    put('exit.multiple', entryMultiple, 'convention', 'exit at the entry multiple — multiple expansion is usually unjustifiable (DR-4 Cat.7)');
  }

  // ── MIP terms (offered only when the analyst switches a MIP on) ──
  const pool = cited(['mip', 'poolPctOfFdEquity']);
  const hurdle = cited(['mip', 'hurdleMoic']);
  if (pool && hurdle) {
    put('mip', { pool_pct: pool.value, hurdle_moic: hurdle.value, ratchet: null }, 'convention', `${pctText(pool.value)} pool (${pool.citation}) / ${hurdle.value.toFixed(1)}x hurdle (${hurdle.citation})`);
  }

  return out;
}
