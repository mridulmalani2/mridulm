/**
 * engine2/suggest.ts — Class-B suggestion assembly (PHASE_D §D7).
 *
 * Pure function: (DealFacts, conventions) → suggested DealAssumptions + a BASIS record
 * per field. Class rules (SPEC §16 / master plan Part 2): a suggestion ALWAYS names its
 * basis — history (≥ MIN_HISTORY_POINTS usable full-year points of that metric, D1 gate),
 * cited convention (conventions.json, per-value citation), facts (straight from the
 * filing), or template (a structural default the user is expected to review). Nothing is
 * silently defaulted; nothing here is a fact.
 *
 * The §14.13 invariant lives on this module's output: an all-suggested model must run
 * with ZERO coherence warnings (tests/engine2-suggest.test.ts, against a realistic
 * large-cap fixture).
 *
 * No imports from lib/engine (boundary test).
 */

import conventionsJson from './suggestions/conventions.json';
import type { DealAssumptions, DealFacts, TrancheAssumption } from './types';

export interface SuggestionBasis {
  kind: 'history' | 'convention' | 'facts' | 'template';
  detail: string;
}

export interface SuggestedAssumptions {
  assumptions: DealAssumptions;
  /** fieldPath → why this number (rendered as the basis badge on every input). */
  basis: Record<string, SuggestionBasis>;
}

/** D1 gate re-stated here (suggest.ts must not import lib/edgar): ≥3 usable points. */
const MIN_HISTORY_POINTS = 3;

const cv = (path: string[], fallback: number): number => {
  let node: unknown = conventionsJson;
  for (const key of path) {
    if (typeof node !== 'object' || node === null || !(key in node)) return fallback;
    node = (node as Record<string, unknown>)[key];
  }
  if (typeof node === 'number') return node;
  if (typeof node === 'object' && node !== null && 'value' in node && typeof (node as { value: unknown }).value === 'number') {
    return (node as { value: number }).value;
  }
  return fallback;
};

export function suggestAssumptions(
  facts: DealFacts,
  opts: { hold_years?: number } = {},
): SuggestedAssumptions {
  const N = opts.hold_years ?? 5;
  const basis: Record<string, SuggestionBasis> = {};
  const b = (path: string, kind: SuggestionBasis['kind'], detail: string) => {
    basis[path] = { kind, detail };
  };

  // ── Entry multiple: SCALE-band convention. The sector medians in conventions.json are
  //    flagged verifyBeforeDisplay (blended NA+Europe PE+corporate, not buyout-entry) —
  //    citation honesty forbids suggesting from them until verified against the primary
  //    source; the trading anchor (§16 coherence gate) is the deal-specific check. ──
  const largeCap = facts.fy_ebitda >= 100;
  const entryMultiple = largeCap
    ? cv(['entryMultiples', 'usBuyoutOverall'], 12.0)
    : cv(['entryMultiples', 'middleMarket10to500'], 7.2);
  b('entry.entry_multiple', 'convention',
    `${largeCap ? 'US buyout overall' : 'middle-market $10–500m'} median — conventions.json entryMultiples (sector medians withheld: verifyBeforeDisplay)`);
  b('entry.hold_years', 'convention', 'owner decision: 5-year hold (DR-4 notes 7yr alternative)');

  // ── Growth: history CAGR when the D1 gate passes (≥3 full-year revenue points) ──
  const revHist = facts.history.filter((h) => h.revenue !== null);
  let growth: number[];
  if (revHist.length >= MIN_HISTORY_POINTS) {
    const first = revHist[0];
    const last = revHist[revHist.length - 1];
    const spanDays = (Date.parse(last.period_end) - Date.parse(first.period_end)) / 86_400_000;
    if (first.revenue! > 0 && last.revenue! > 0 && spanDays >= 350) {
      const cagr = Math.pow(last.revenue! / first.revenue!, 365.25 / spanDays) - 1;
      growth = Array.from({ length: N }, () => cagr);
      b('operations.growth', 'history', `${revHist.length}-point revenue CAGR over the true ${(spanDays / 365.25).toFixed(1)}y span (${first.period_end} → ${last.period_end})`);
    } else {
      growth = Array.from({ length: N }, () => 0.03);
      b('operations.growth', 'template', 'flat 3% — history endpoints unusable (sign/span); review');
    }
  } else {
    growth = Array.from({ length: N }, () => 0.03);
    b('operations.growth', 'template', `flat 3% — only ${revHist.length} usable history point(s) (< ${MIN_HISTORY_POINTS}); review`);
  }

  // ── Margin: hold at the filing margin (flat path — expansion needs a thesis) ──
  b('operations.target_margin', 'facts', `FY${facts.fiscal_year} EBITDA margin held flat — margin expansion requires an explicit thesis`);
  b('operations.maint_capex_pct_revenue', 'facts', `FY${facts.fiscal_year} capex ÷ revenue from the filing`);

  // ── NWC: days method ONLY when every gated day survived D2; else % of revenue ──
  const nwc: DealAssumptions['operations']['nwc'] =
    facts.dso !== null && facts.dio !== null && facts.dpo !== null
      ? { method: 'days', dso: facts.dso, dio: facts.dio, dpo: facts.dpo }
      : { method: 'pct', pct_revenue: facts.nwc_pct_revenue ?? 0 };
  b('operations.nwc', nwc.method === 'days' ? 'facts' : facts.nwc_pct_revenue !== null ? 'facts' : 'template',
    nwc.method === 'days'
      ? `filing days (DSO ${facts.dso!.toFixed(0)} / DIO ${facts.dio!.toFixed(0)} / DPO ${facts.dpo!.toFixed(0)}, D2-gated)`
      : facts.nwc_pct_revenue !== null
        ? 'operating NWC % of revenue from the filing (days un-derivable — see days_notes)'
        : 'no NWC facts — 0% placeholder basis, REVIEW REQUIRED');

  // ── Structure: scale-banded template with cited pricing/leverage conventions ──
  const lev = largeCap
    ? cv(['leverage', 'largeCap', 'totalDebtToEbitda'], 5.0)
    : cv(['leverage', 'middleMarket', 'totalDebtToEbitda'], 4.0);
  const spreadBps = largeCap ? cv(['pricing', 'tlbSpreadBps'], 375) : cv(['pricing', 'unitrancheSpreadBps'], 500);
  const oidPct = largeCap ? cv(['pricing', 'tlbOidPct'], 0.005) : cv(['pricing', 'unitrancheOidPct'], 0.025);
  const amortPct = largeCap ? cv(['amortization', 'tlbUsPctPerYear'], 0.01) : 0;
  const baseRate = 0.043; // static SOFR assumption (v1 static rates — SPEC §4; verify on review)
  const tranches: TrancheAssumption[] = [
    largeCap
      ? {
          name: 'TLB', type: 'senior', size: { x_ebitda: lev },
          pricing: { kind: 'floating', base_rate: baseRate, spread: spreadBps / 10_000, floor: cv(['pricing', 'sofrFloor'], 0) },
          amort_pct_of_face: amortPct, maturity_years: N + 2, oid_pct: oidPct,
          sweep: { participates: true, priority: 1 },
        }
      : {
          name: 'Unitranche', type: 'unitranche', size: { x_ebitda: lev },
          pricing: { kind: 'floating', base_rate: baseRate, spread: spreadBps / 10_000, floor: 0.0075 },
          amort_pct_of_face: amortPct, maturity_years: N + 2, oid_pct: oidPct,
          sweep: { participates: true, priority: 1 },
        },
    {
      name: 'RCF', type: 'revolver', commitment: { x_ebitda: Math.max(0.5, lev * 0.1) },
      pricing: { kind: 'floating', base_rate: baseRate, spread: spreadBps / 10_000, floor: 0 },
      commitment_fee: cv(['pricing', 'revolverCommitmentFeeBps'], 50) / 10_000,
      maturity_years: N + 1, drawn_at_close: 0,
    },
  ];
  b('structure.tranches', 'convention', `${largeCap ? 'large-cap TLB' : 'middle-market unitranche'} template: ${lev.toFixed(1)}x total, ${spreadBps}bps spread, ${(oidPct * 100).toFixed(1)}% OID — conventions.json leverage/pricing (base rate is a STATIC template value; verify)`);
  b('structure.min_cash', 'template', '2% of FY revenue — operating cash floor');
  b('structure.sweep', 'convention', '50% flat base sweep (LSTA level; flat = DECIDED v1 simplification, grid preset available)');

  // ── Tax ──
  b('tax.rate', 'facts', `effective rate from the filing (FY${facts.fiscal_year})`);
  b('tax.nol', 'convention', 'acquired NOL usable = OFF (C-18 — survival is deal-specific); extracted floor carried');

  const assumptions: DealAssumptions = {
    deal_name: `${facts.entity_name} LBO`,
    entry: { driver: 'multiple', entry_multiple: entryMultiple, enterprise_value: null, basis: 'fy', hold_years: N },
    structure: {
      tranches,
      min_cash: 0.02 * facts.fy_revenue,
      sweep: { base_pct: 0.5, grid: null },
    // §16: the suggestion layer proposes NEITHER distributions nor a trap — a distribution
    // policy is a sponsor decision with no history/convention basis. Fields start OFF, so
    // every suggested model is byte-identical to pre-v1.1.0. §18: refinancing is likewise a
    // sponsor decision with no history/convention basis — proposed OFF (null).
    distributions: null,
    refinancing: null,
    },
    operations: {
      growth,
      target_margin: facts.fy_ebitda_margin,
      margin_path: 'linear',
      da_pct_revenue: facts.da_pct_revenue,
      maint_capex_pct_revenue: facts.maint_capex_pct_revenue,
      growth_capex: Array.from({ length: N }, () => 0),
      nwc,
    },
    tax: {
      rate: facts.effective_tax_rate,
      interest_deductible: true,
      s163j: { applies: true, ati_basis: 'ebitda', ati_pct: 0.3 }, // 30% of ATI — IRC §163(j) statute
      nol: {
        acquired_opening: facts.nol_carryforward_floor ?? 0,
        acquired_usable: false,
        arose_pre_2018: false,
        s382_annual_limit: null,
      },
      minimum_rate: 0,
    },
    fees: {
      transaction_pct_of_ev: cv(['fees', 'buySideAdvisoryPctOfEv'], 0.02),
      financing_pct_of_commitments: cv(['fees', 'financingFeePctOfDebt'], 0.015),
      monitoring: null,
    },
    rollover_equity: 0,
    exit: { multiple: entryMultiple, basis: 'fy', fees_pct: 0.015 },
    mip: { pool_pct: cv(['mip', 'poolPctOfFdEquity'], 0.15), hurdle_moic: cv(['mip', 'hurdleMoic'], 2.0), ratchet: null },
    // §22 [v1.7.0]: the suggestion layer proposes NO strip, NO promote ratchet and NO
    // warrant — a cap-table structure is a negotiated term with no history/convention
    // basis (the distributions/refi/fund/elections precedent). Fields start off; the
    // badge is TEMPLATE via template paths, YOU when set (§16).
    sweet_equity: null,
    warrant: null,
    covenants: { leverage_max: null, dscr_min: null, fccr_min: null, springing: null, rp_trap: null },
    // §19/§16: the suggestion layer proposes NO fund overlay — an LP-agreement fact with no
    // history/convention basis (the distributions/refinancing precedent). Starts null = OFF.
    fund: null,
    mid_year_irr: false,
  };
  b('fees', 'convention', 'buy-side 2.0% of EV; financing 1.5% of total commitments — conventions.json fees (DR-4 Cat.6)');
  b('exit.multiple', 'convention', 'exit = entry (flat) — multiple expansion is usually unjustifiable (DR-4 Cat.7)');
  b('mip', 'convention', '15% pool / 2.0x MOIC hurdle — conventions.json mip (Goodwin 2024)');
  b('covenants', 'convention', 'cov-lite (BSL >90% of new issue — DR-4 Cat.4); MM preset available');

  return { assumptions, basis };
}
