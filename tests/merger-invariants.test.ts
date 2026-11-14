/**
 * Merger model invariants (SPEC §29.9), each over GM1 and the variants that stress it.
 */
import { describe, expect, it } from 'vitest';
import { runMerger } from '../lib/engine2/merger/facade';
import { ADDITIVE_LINES, type MergerAssumptions, type MergerFacts } from '../lib/engine2/merger/types';
import { GM1_ASSUMPTIONS, GM1_FACTS } from './fixtures/merger-gm1';

const A = (patch: (a: MergerAssumptions) => void): MergerAssumptions => { const a = structuredClone(GM1_ASSUMPTIONS); patch(a); return a; };
const F = (patch: (f: MergerFacts) => void): MergerFacts => { const f = structuredClone(GM1_FACTS); patch(f); return f; };

const variants: [string, MergerFacts, MergerAssumptions][] = [
  ['GM1', GM1_FACTS, GM1_ASSUMPTIONS],
  ['debt assumed', GM1_FACTS, A((a) => { a.target_debt = 'assume_all'; a.funding.acquisition_debt.amount = 3000; })],
  ['year-0 cash carried, interest on deal cash', GM1_FACTS, A((a) => { a.year0_cash_carried = true; a.interest_on_impact_cash = 0.03; })],
  ['phased synergies, priced on equity value', GM1_FACTS, A((a) => { a.synergies.phasing = [0, 0.5, 0.9, 1]; a.price = { driver: 'equity_value', equity_value: 5700 }; })],
  ['solved debt', GM1_FACTS, A((a) => { a.funding.acquisition_debt.amount = null; a.funding.solve = 'max_debt_at_cap'; })],
];

describe.each(variants)('%s', (_name, facts, a) => {
  const o = runMerger(facts, a);
  it('sources equal uses', () => expect(Math.abs(o.checks.sources_minus_uses)).toBeLessThan(0.005));
  it('sum = acquirer + target and combined = sum + impact, every additive line, every year', () => {
    for (const k of ADDITIVE_LINES) o.blocks.combined.forEach((r, t) => {
      expect(Math.abs(o.blocks.sum[t][k] - o.blocks.acquirer[t][k] - o.blocks.target[t][k]), `sum ${k} ${t}`).toBeLessThan(1e-9);
      expect(Math.abs(r[k] - o.blocks.sum[t][k] - o.blocks.impact[t][k]), `combined ${k} ${t}`).toBeLessThan(1e-9);
    });
  });
  it('each block rolls its cash: end = begin + change, next begin = this end', () => {
    for (const b of ['acquirer', 'target', 'combined'] as const) o.blocks[b].forEach((r, t) => {
      expect(Math.abs(r.cash_end - r.cash_begin - r.cash_change)).toBeLessThan(1e-9);
      if (t > 0 && b !== 'combined') expect(r.cash_begin).toBe(o.blocks[b][t - 1].cash_end);
    });
    o.checks.combined_cash.forEach((c) => expect(Math.abs(c)).toBeLessThan(1e-9));
  });
  it('shares: combined = acquirer + new shares; the target\'s are cancelled', () => {
    o.blocks.combined.forEach((r, t) => {
      expect(o.blocks.target[t].shares).toBe(0);
      expect(Math.abs(r.shares - facts.acquirer.shares! - o.deal.new_shares)).toBeLessThan(1e-12);
    });
  });
});

describe('neutrality and break-even identities', () => {
  it('a deal for nothing, funded by nothing, leaves the acquirer exactly as it was', () => {
    const facts = F((f) => {
      for (const k of Object.keys(f.target.year0) as (keyof MergerFacts['target']['year0'])[]) f.target.year0[k] = 0;
      f.target.net_debt = 0;
    });
    const a = A((a) => {
      const z = [0, 0, 0];
      a.standalone.target = { ...a.standalone.target, revenue_growth: z, ebitda_margin: z, da: z, other_cash_items: z, delta_nwc: z, capex_pct_revenue: z, other_items: z };
      a.price = { driver: 'enterprise_value', enterprise_value: 0 };
      a.funding.acquisition_debt.amount = 0;
      a.synergies.run_rate = 0;
    });
    const o = runMerger(facts, a);
    for (const k of ADDITIVE_LINES) o.blocks.combined.forEach((r, t) => expect(Math.abs(r[k] - o.blocks.acquirer[t][k]), `${k} ${t}`).toBeLessThan(1e-9));
    o.eps.accretion.forEach((x) => expect(Math.abs(x!)).toBeLessThan(1e-12));
  });

  it('all stock at the acquirer\'s own P/E, no synergies, no fees, no debt: year-0 EPS is unchanged', () => {
    const base = runMerger(GM1_FACTS, GM1_ASSUMPTIONS);
    const acqEps0 = base.eps.acquirer[0]!;
    const tgtNi0 = base.blocks.target[0].net_income_group;
    const price = 24;
    const a = A((a) => {
      a.price = { driver: 'equity_value', equity_value: (tgtNi0 / acqEps0) * price };
      a.target_debt = 'assume_all';
      a.fees.advisory.value = 0;
      a.funding.acquisition_debt.amount = 0;
      a.synergies.run_rate = 0;
    });
    const o = runMerger(GM1_FACTS, a);
    expect(Math.abs(o.eps.accretion[0]!)).toBeLessThan(1e-12);
    expect(o.deal.pct_stock).toBeCloseTo(1, 12);
  });

  it('carrying year-0 deal cash moves it into year 1; not carrying it restarts at zero', () => {
    const carried = runMerger(GM1_FACTS, A((a) => { a.year0_cash_carried = true; }));
    const not = runMerger(GM1_FACTS, GM1_ASSUMPTIONS);
    expect(carried.blocks.impact[1].cash_begin).toBe(carried.blocks.impact[0].cash_end);
    expect(not.blocks.impact[1].cash_begin).toBe(0);
    expect(not.blocks.impact[0].cash_in_net_debt).toBe(0);
  });

  it('interest on deal cash is the rate times the block\'s beginning cash', () => {
    const r = 0.05;
    const o = runMerger(GM1_FACTS, A((a) => { a.interest_on_impact_cash = r; }));
    const base = runMerger(GM1_FACTS, GM1_ASSUMPTIONS);
    expect(Math.abs(o.blocks.impact[1].net_interest - base.blocks.impact[1].net_interest)).toBeLessThan(1e-12); // year 1 opens at zero
    expect(Math.abs(o.blocks.impact[2].net_interest - (-0.04 * 7759 + r * o.blocks.impact[2].cash_begin))).toBeLessThan(1e-9);
  });

  it('assumed debt: nothing refinanced, and the target keeps its own interest', () => {
    const facts = F((f) => { f.target.year0.net_interest = -60; f.target.year0.debt = 2500; });
    const o = runMerger(facts, A((a) => { a.target_debt = 'assume_all'; a.funding.acquisition_debt.amount = 3000; a.standalone.target.net_interest = [-60, -60, -60]; a.standalone.target.debt = [2500, 2500, 2500]; }));
    expect(o.deal.refinanced_net_debt).toBe(0);
    expect(o.deal.total_uses).toBeCloseTo(5700 + 114, 9);
    expect(o.blocks.target[1].net_interest).toBe(-60);
    expect(o.blocks.target[1].bank_debt).toBe(2500);
  });
});

describe('the leverage sizing at its edges', () => {
  const solve = (max: number) => runMerger(GM1_FACTS, A((a) => { a.funding.acquisition_debt.amount = null; a.funding.solve = 'max_debt_at_cap'; a.funding.leverage_cap = { max, test_year: 2 }; }));
  it('a cap that never binds: all debt, no new shares, and it says so', () => {
    const o = solve(50);
    expect(o.deal.equity_issued).toBeCloseTo(0, 9);
    expect(o.leverage.solve!.binding).toBe(false);
    expect(o.flags.map((f) => f.code)).toContain('leverage_cap_not_binding');
  });
  it('a cap breached even with no debt: no debt, and it says so (never clamped)', () => {
    const o = solve(0.5);
    expect(o.deal.debt_issued).toBe(0);
    expect(o.leverage.cap!.actual!).toBeGreaterThan(0.5);
    expect(o.flags.map((f) => f.code)).toContain('leverage_cap_breached');
  });
});

describe('Build rejections name what is missing', () => {
  const rejects = (facts: MergerFacts, a: MergerAssumptions, re: RegExp) => expect(() => runMerger(facts, a)).toThrow(re);
  it('blank inputs are refused, never defaulted', () => {
    rejects(F((f) => { f.target.net_debt = null; }), GM1_ASSUMPTIONS, /net debt/);
    rejects(F((f) => { f.acquirer.shares = null; }), GM1_ASSUMPTIONS, /shares outstanding/);
    rejects(F((f) => { f.acquirer.year0.capex = Number.NaN; }), GM1_ASSUMPTIONS, /missing capex/);
    rejects(GM1_FACTS, A((a) => { a.standalone.target.da = [1, 2]; }), /da needs one value/);
    rejects(GM1_FACTS, A((a) => { a.synergies.phasing = [1, 1, 1]; }), /phasing/);
    rejects(GM1_FACTS, A((a) => { a.funding.acquisition_debt.amount = null; }), /acquisition debt/);
    rejects(GM1_FACTS, A((a) => { a.funding.solve = 'max_debt_at_cap'; a.funding.leverage_cap = null; }), /needs a leverage cap/);
    rejects(GM1_FACTS, A((a) => { a.funding.acquisition_debt.amount = 9000; }), /more than the total uses/);
  });
});
