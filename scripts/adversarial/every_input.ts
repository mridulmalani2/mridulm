/**
 * Every-input-matters sweep. Three maximal deals (every feature that can coexist is ON);
 * every numeric leaf of the assumptions is perturbed one at a time, every choice is flipped to
 * each alternative, and the full ModelOutput is diffed against the base run. An input that
 * moves NOTHING is printed — it is either legitimately inert (with a reason) or disconnected.
 */
import { runModel } from '../../lib/engine2/facade';
import { GOLDEN_DEALS } from '../../tests/fixtures/engine2-golden-deals';
import type { DealAssumptions, DealFacts } from '../../lib/engine2/types';

const VAL = { risk_free: 0.04, mrp: 0.06, asset_beta: 0.9, debt_beta: 0.1, long_run_growth: 0.025, leverage_timing: 'end_of_year' as const };
const g2 = GOLDEN_DEALS.G2;
// Deal A — promote + ratchet, warrant, rollover, monitoring fee, scheduled distributions under a
// trap, leverage-grid sweep, covenants incl. springing, a toggled PIK note, a refinancing, the fund
// overlay and valuation; multi-tranche with a revolver; 163(j) on, acquired NOLs, minimum tax.
const A: DealAssumptions = {
  ...g2.assumptions,
  deal_name: 'A',
  rollover_equity: 30,
  fees: { transaction_pct_of_ev: 0.02, financing_pct_of_commitments: 0.015, monitoring: { annual: 3, termination_years: 3, discount_rate: 0.08 } },
  structure: {
    ...g2.assumptions.structure,
    min_cash: 12,
    tranches: [
      { name: 'TLB', type: 'senior', size: { x_ebitda: 3.5 }, pricing: { kind: 'floating', base_rate: 0.04, spread: 0.035, floor: 0.045 }, amort_pct_of_face: 0.01, maturity_years: 7, oid_pct: 0.01, sweep: { participates: true, priority: 1 } },
      { name: 'Mezz', type: 'mezzanine', size: { amount: 60 }, pricing: { kind: 'fixed', rate: 0.11 }, amort_pct_of_face: 0.02, maturity_years: 8, oid_pct: 0.02, sweep: { participates: true, priority: 2 } },
      { name: 'PIK', type: 'pik_note', size: { amount: 40 }, cash_coupon: 0.06, pik_coupon: 0.1, amort_pct_of_face: 0, maturity_years: 8, oid_pct: 0.01, sweep: { participates: false, priority: 3 }, elections: ['pik', 'cash', 'pik', 'cash', 'pik'] },
      { name: 'RCF', type: 'revolver', commitment: { amount: 60 }, pricing: { kind: 'floating', base_rate: 0.04, spread: 0.03, floor: 0 }, commitment_fee: 0.005, maturity_years: 6, drawn_at_close: 0 },
    ],
    sweep: { base_pct: 0.5, grid: { tiers: [{ above_net_leverage: 4.0, pct: 0.75 }, { above_net_leverage: 3.0, pct: 0.5 }], else_pct: 0.25 } },
    distributions: [5, 10, 15, 20, 25],
    refinancing: [{ tranche_name: 'TLB', year: 3, new_pricing: { kind: 'floating', base_rate: 0.036, spread: 0.0275, floor: 0.01 }, call_premium_pct: 0.01, new_maturity_years: 6, new_oid_pct: 0.005, new_financing_fee_pct: 0.01, new_amort_pct_of_face: 0.01 }],
  },
  covenants: { leverage_max: [6, 5.5, 5, 4.5, 4], dscr_min: 1.2, fccr_min: 1.0, springing: { metric: 'leverage', max: 5.5, revolver_draw_trigger_pct: 0.3 }, rp_trap: { metric: 'net_leverage', level: 3.5 } },
  tax: { rate: 0.25, interest_deductible: true, s163j: { applies: true, ati_basis: 'ebitda', ati_pct: 0.3 }, nol: { acquired_opening: 40, acquired_usable: true, arose_pre_2018: false, s382_annual_limit: 6 }, minimum_rate: 0.15 },
  mip: { pool_pct: 0.1, hurdle_moic: 1.3, ratchet: [{ hurdle_moic: 1.8, share_pct: 0.2 }] },
  warrant: { holder_label: 'Mezz', pct_of_ordinary: 0.04, strike_total: 10 },
  fund: { committed_capital: 900, mgmt_fee_pct: 0.015, fee_basis: 'committed', carry_pct: 0.2, pref_rate: 0.08, catchup_pct: 0.5, waterfall: 'european', fee_offset_pct: 0.8 },
  valuation: VAL,
};
// Deal B — the sweet-equity strip with a ratchet, a warrant, the fund, surplus distributions.
const B: DealAssumptions = {
  ...GOLDEN_DEALS.G9SWEET.assumptions,
  deal_name: 'B',
  structure: { ...GOLDEN_DEALS.G9SWEET.assumptions.structure, surplus_distribution: { payout_pct: 0.6, start: 'immediately' } },
  fund: { committed_capital: null, mgmt_fee_pct: 0.02, fee_basis: 'invested', carry_pct: 0.2, pref_rate: 0.08, catchup_pct: 1, waterfall: 'american', fee_offset_pct: 1 },
  valuation: { ...VAL, leverage_timing: 'start_of_year' },
};
// Deal C — a partial exit beside a promote, NTM on both ends, case-driven forecast lines.
const C: DealAssumptions = {
  ...GOLDEN_DEALS.G2DIST.assumptions,
  deal_name: 'C',
  entry: { ...GOLDEN_DEALS.G2DIST.assumptions.entry, basis: 'ntm' },
  exit: { ...GOLDEN_DEALS.G2DIST.assumptions.exit, basis: 'ntm' },
  operations: {
    ...GOLDEN_DEALS.G2DIST.assumptions.operations,
    lines: {
      revenue: { mode: 'grown', year1: 530, growth: [0.05, 0.04, 0.04, 0.03] },
      ebitda: { measure: 'ebitda', mode: 'explicit', values: [117, 122, 128, 133, 137] },
      da: null, capex: { mode: 'pct_of_da', pct: 1.1 },
      delta_nwc: { mode: 'explicit', values: [3, 3.5, 3, 2.5, 2] },
      year_n_plus_1_growth: 0.03,
    },
  },
  mip: { pool_pct: 0.15, hurdle_moic: 1.5, ratchet: null },
  structure: { ...GOLDEN_DEALS.G2DIST.assumptions.structure, selldown: { year: 3, fraction: 0.25, event_multiple: 8.5 } },
  valuation: VAL,
};

type J = unknown;
function leaves(x: J, path: string[] = [], out: { path: string[]; value: J }[] = []) {
  if (x === null || x === undefined) return out;
  if (typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean') { out.push({ path, value: x }); return out; }
  if (Array.isArray(x)) { x.forEach((v, i) => leaves(v, [...path, String(i)], out)); return out; }
  for (const [k, v] of Object.entries(x as object)) leaves(v, [...path, k], out);
  return out;
}
function setAt<T>(obj: T, path: string[], value: J): T {
  const clone = structuredClone(obj) as Record<string, J>;
  let cur = clone as Record<string, J>;
  for (const k of path.slice(0, -1)) cur = cur[k] as Record<string, J>;
  cur[path[path.length - 1]] = value;
  return clone as T;
}
const CHOICES: Record<string, J[]> = {
  basis: ['fy', 'ntm'], margin_path: ['linear', 'front_loaded', 'back_loaded'], method: ['pct', 'days'], kind: [],
  ati_basis: ['ebitda', 'ebit'], fee_basis: ['invested', 'committed'], waterfall: ['european', 'american'],
  leverage_timing: ['end_of_year', 'start_of_year'], start: ['immediately', 'after_debt_repaid'], measure: [], mode: [], type: [],
  metric: [], driver: [], holder_label: [], deal_name: [], name: [], tranche_name: [],
};
const diff = (a: J, b: J): boolean => JSON.stringify(a) !== JSON.stringify(b);

for (const [label, deal, facts] of [['A', A, g2.facts], ['B', B, GOLDEN_DEALS.G9SWEET.facts], ['C', C, GOLDEN_DEALS.G2DIST.facts]] as [string, DealAssumptions, DealFacts][]) {
  const base = runModel(facts, deal);
  const strip = (o: ReturnType<typeof runModel>) => ({ ...o, assumptions: null, facts: null });
  const b0 = strip(base);
  let tried = 0, inert: string[] = [], rejected: string[] = [];
  for (const { path, value } of leaves(deal)) {
    const key = path[path.length - 1];
    const alts: J[] = typeof value === 'number'
      ? [value === 0 ? 0.01 : value * 1.07]
      : typeof value === 'boolean' ? [!value]
      : (CHOICES[key] ?? []).filter((c) => c !== value).concat(key === 'elections' || /^\d+$/.test(key) ? (value === 'pik' ? ['cash'] : value === 'cash' ? ['pik'] : []) : []);
    for (const alt of alts) {
      tried++;
      // integers that must stay integers (years, hold, maturities, priorities)
      let a2: J = alt;
      if (typeof value === 'number' && Number.isInteger(value) && /year|hold|maturity|priority|termination_years/.test(path.join('.'))) a2 = value + 1;
      try {
        const o = runModel(facts, setAt(deal, path, a2));
        if (!diff(strip(o), b0)) inert.push(`${path.join('.')} = ${JSON.stringify(value)} → ${JSON.stringify(a2)}`);
      } catch (e) {
        rejected.push(`${path.join('.')} → ${JSON.stringify(a2)}: ${String(e).slice(0, 110)}`);
      }
    }
  }
  console.log(`\n=== deal ${label}: ${tried} single-input changes; ${inert.length} moved NOTHING; ${rejected.length} rejected at Build`);
  inert.forEach((s) => console.log('  INERT    ', s));
  rejected.forEach((s) => console.log('  REJECTED ', s));
}
