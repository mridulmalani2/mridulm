/**
 * Test helper: an analyst who has ENTERED every input (v2.0.0 "blank until entered"). The
 * store starts every deal blank; tests that need a built model enter one explicitly through
 * the same `editAssumptions` path the UI uses — never through a default.
 */
import { useEngine2Model } from '../../store/engine2Model';
import { blankAssumptions, CHOICE_PATHS, setPath } from '../../lib/engine2/draft';
import { suggestionsFor } from '../../lib/engine2/suggest';
import type { DealAssumptions, DealFacts } from '../../lib/engine2/types';

/** A complete, typical US LBO as an analyst would enter it (every number stated). */
export function enteredAssumptions(N = 5, over: Partial<DealAssumptions> = {}): DealAssumptions {
  return {
    deal_name: 'Entered deal',
    entry: { driver: 'multiple', entry_multiple: 9, enterprise_value: null, basis: 'fy', hold_years: N },
    structure: {
      tranches: [
        { name: 'TLB', type: 'senior', size: { x_ebitda: 4 }, pricing: { kind: 'floating', base_rate: 0.04, spread: 0.0375, floor: 0.005 }, amort_pct_of_face: 0.01, maturity_years: N + 2, oid_pct: 0.005, sweep: { participates: true, priority: 1 } },
        { name: 'RCF', type: 'revolver', commitment: { x_ebitda: 0.5 }, pricing: { kind: 'floating', base_rate: 0.04, spread: 0.03, floor: 0 }, commitment_fee: 0.005, maturity_years: N + 1, drawn_at_close: 0 },
      ],
      min_cash: 20, sweep: { base_pct: 0.5, grid: null }, distributions: null, surplus_distribution: null, refinancing: null, selldown: null,
    },
    operations: {
      growth: Array.from({ length: N }, () => 0.05), target_margin: 0.22, margin_path: 'linear',
      da_pct_revenue: 0.04, maint_capex_pct_revenue: 0.045, growth_capex: Array.from({ length: N }, () => 0),
      nwc: { method: 'pct', pct_revenue: 0.1 }, lines: null,
    },
    tax: { rate: 0.24, interest_deductible: true, s163j: { applies: true, ati_basis: 'ebitda', ati_pct: 0.3 }, nol: { acquired_opening: 0, acquired_usable: false, arose_pre_2018: false, s382_annual_limit: null }, minimum_rate: 0 },
    fees: { transaction_pct_of_ev: 0.02, financing_pct_of_commitments: 0.015, monitoring: null },
    rollover_equity: 0,
    exit: { multiple: 9, basis: 'fy', fees_pct: 0.01 },
    mip: null, sweet_equity: null, warrant: null,
    covenants: { leverage_max: null, dscr_min: null, fccr_min: null, springing: null, rp_trap: null },
    fund: null, mid_year_irr: false, valuation: null,
    ...over,
  };
}

/** Enter a whole deal into the store as the analyst (every choice made, every field typed). */
export function enterDeal(a: DealAssumptions): void {
  const s = useEngine2Model.getState();
  if (!s.assumptions || s.assumptions.entry.hold_years !== a.entry.hold_years) s.setHoldYears(a.entry.hold_years);
  // every leaf the analyst typed wears YOU, exactly as field-by-field entry would leave it
  const leaves: string[] = [];
  const walk = (node: unknown, path: string) => {
    if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
      for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
    } else if (path) leaves.push(path);
  };
  walk(a, '');
  useEngine2Model.getState().editAssumptions(a, [...CHOICE_PATHS, ...leaves]);
}

/**
 * The analyst who ACCEPTS every catalogue proposal for a filing and TYPES the inputs no
 * proposal can stand behind (the values below are this test-analyst's explicit entries).
 */
export function analystDeal(facts: DealFacts, N = 5): DealAssumptions {
  let a = blankAssumptions(`${facts.entity_name} LBO`, N);
  for (const [key, sug] of Object.entries(suggestionsFor(facts, N))) {
    if (key.includes('@')) continue;
    a = setPath(a, key, sug.value);
  }
  const entries: [string, unknown][] = [
    ['structure.min_cash', 0.02 * (facts.fy_revenue ?? 0)],
    ['structure.sweep.base_pct', 0.5],
    ['exit.fees_pct', 0.015],
    ['rollover_equity', 0],
    ['tax.minimum_rate', 0],
    ['operations.growth_capex', Array.from({ length: N }, () => 0)],
  ];
  for (const [p, v] of entries) a = setPath(a, p, v);
  // fields with no proposal for THIS filing — the test-analyst types them explicitly
  const typed: [string, (x: DealAssumptions) => boolean, unknown][] = [
    ['tax.nol.acquired_opening', (x) => !Number.isFinite(x.tax.nol.acquired_opening), 0],
    ['tax.rate', (x) => !Number.isFinite(x.tax.rate), 0.25],
    ['operations.growth', (x) => !Number.isFinite(x.operations.growth[0]), Array.from({ length: N }, () => 0.03)],
    ['operations.da_pct_revenue', (x) => !Number.isFinite(x.operations.da_pct_revenue), 0.03],
    ['operations.maint_capex_pct_revenue', (x) => !Number.isFinite(x.operations.maint_capex_pct_revenue), 0.03],
    ['operations.target_margin', (x) => !Number.isFinite(x.operations.target_margin), facts.fy_ebitda_margin],
    ['operations.nwc', (x) => x.operations.nwc.method === 'pct' && !Number.isFinite(x.operations.nwc.pct_revenue), { method: 'pct', pct_revenue: 0.1 }],
    ['tax.s163j', (x) => !Number.isFinite(x.tax.s163j.ati_pct), { applies: false, ati_basis: 'ebitda', ati_pct: 0.3 }],
  ];
  for (const [p, needs, v] of typed) if (needs(a)) a = setPath(a, p, v);
  if (a.structure.tranches[0] && a.structure.tranches[0].type !== 'revolver') {
    const t = a.structure.tranches[0];
    if (t.type !== 'pik_note' && t.pricing.kind === 'floating') a = setPath(a, 'structure.tranches.0.pricing.base_rate', 0.043);
    a = setPath(a, 'structure.tranches.0.maturity_years', N + 2);
  }
  a = setPath(a, 'exit.multiple', a.entry.entry_multiple);
  return a;
}
