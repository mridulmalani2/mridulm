/**
 * SPEC §3.8 [v2.1.0] — the surplus-cash distribution policy: directed fixtures for every
 * branch the goldens (G12 leverage table, G13-SURPLUS, G13-SURPLUS-GATED) leave uncovered.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { waterfallYear, type WaterfallYearIn } from '../lib/engine2/kernel/waterfall';
import { runModel } from '../lib/engine2/facade';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';
import type { DealAssumptions } from '../lib/engine2/types';

const year = (over: Partial<WaterfallYearIn>): WaterfallYearIn => ({
  opening_cash: 10, fcf_pre_debt: 50, min_cash: 10, sweep_pct: 0.5, tranches: [], revolver: null,
  distribution_request: 0, rp_trap_level: null, ebitda_adj: 100, ...over,
});
const senior = (outstanding: number) => ({
  name: 'TL', outstanding, scheduled_amort: 0, cash_interest: 0, sweep_participates: true, sweep_priority: 1,
});

describe('kernel/waterfall: §3.8 surplus policy', () => {
  it('pays payout × the cash above the floor AFTER the sweep; nothing is ever revolver-funded or below the floor', () => {
    fc.assert(fc.property(
      fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: -50, max: 200, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }),
      (payout, fcf, sweep) => {
        const out = waterfallYear(year({ fcf_pre_debt: fcf, sweep_pct: sweep, tranches: [senior(40)], surplus: { payout_pct: payout, after_debt_repaid: false } }));
        const cashAfterSweep = 10 + fcf - out.sweep_applied_total;
        const expected = payout * Math.max(0, cashAfterSweep - 10);
        expect(out.distribution_requested).toBeCloseTo(expected, 9);
        expect(out.distribution_paid).toBeCloseTo(expected, 9);
        expect(out.closing_cash).toBeGreaterThanOrEqual(Math.min(10, cashAfterSweep) - 1e-9);
      }));
  });

  it("'after_debt_repaid' holds while term debt remains, opens the year it is retired", () => {
    const held = waterfallYear(year({ sweep_pct: 0.5, tranches: [senior(40)], surplus: { payout_pct: 1, after_debt_repaid: true } }));
    expect(held.distribution_paid).toBe(0); // 50 surplus, 25 swept, 15 still owed
    const opens = waterfallYear(year({ sweep_pct: 1, tranches: [senior(40)], surplus: { payout_pct: 1, after_debt_repaid: true } }));
    expect(opens.tranches[0].ending_outstanding).toBe(0);
    expect(opens.distribution_paid).toBeCloseTo(10, 9); // 50 − 40 swept, all of it out
  });

  // The revolver clause of the gate can never be the deciding one: step 4 repays the revolver
  // from ALL cash above the floor before step 7, and step 6 draws only below it — so a revolver
  // still drawn at step 7 always means a zero surplus (the gate-ignores-revolver mutant is
  // equivalent by construction). This fixture pins the observable consequence.
  it("a drawn revolver is repaid before any surplus exists: nothing is paid while it is drawn", () => {
    const rcf = { beginning_drawn: 30, commitment: 50, cash_interest: 0, commitment_fee: 0 };
    const out = waterfallYear(year({ fcf_pre_debt: 20, revolver: rcf, surplus: { payout_pct: 1, after_debt_repaid: true } }));
    expect(out.revolver_ending_drawn).toBe(10);
    expect(out.distribution_paid).toBe(0);
    const imm = waterfallYear(year({ fcf_pre_debt: 40, revolver: rcf, surplus: { payout_pct: 1, after_debt_repaid: false } }));
    expect(imm.revolver_ending_drawn).toBe(0);
    expect(imm.distribution_paid).toBeCloseTo(10, 9);
  });

  it('the §3.7 trap still clips the surplus, and flags it', () => {
    const out = waterfallYear(year({ sweep_pct: 0, tranches: [senior(300)], rp_trap_level: 2.5, surplus: { payout_pct: 1, after_debt_repaid: false } }));
    // gross debt 300, L × EBITDA = 250 ⇒ rp_max = cash − 50 = 10; surplus 50
    expect(out.rp_max).toBeCloseTo(10, 9);
    expect(out.distribution_paid).toBeCloseTo(10, 9);
    expect(out.distribution_blocked).toBe(true);
  });

  it('rejects a payout outside [0, 1] and a surplus policy beside a requested amount', () => {
    expect(() => waterfallYear(year({ surplus: { payout_pct: 1.2, after_debt_repaid: false } }))).toThrow(/payout_pct/);
    expect(() => waterfallYear(year({ distribution_request: 5, surplus: { payout_pct: 1, after_debt_repaid: false } }))).toThrow(/mutually exclusive/);
  });
});

describe('engine: §3.8 Build rejections and equivalences', () => {
  const g5 = GOLDEN_DEALS.G5;
  const withPolicy = (sd: DealAssumptions['structure']['surplus_distribution'], distributions: number[] | null = null): DealAssumptions => ({
    ...g5.assumptions, structure: { ...g5.assumptions.structure, distributions, surplus_distribution: sd },
  });

  it('one policy per deal: a schedule AND a surplus policy is rejected by name', () => {
    expect(() => runModel(g5.facts, withPolicy({ payout_pct: 1, start: 'immediately' }, [1, 1, 1, 1, 1]))).toThrow(/choose ONE policy/);
  });
  it('an unknown start is rejected', () => {
    expect(() => runModel(g5.facts, withPolicy({ payout_pct: 1, start: 'eventually' as 'immediately' }))).toThrow(/starts 'immediately' or 'after_debt_repaid'/);
  });
  it('payout 0% is byte-identical to no policy at all', () => {
    const a = runModel(g5.facts, withPolicy(null));
    const b = runModel(g5.facts, withPolicy({ payout_pct: 0, start: 'immediately' }));
    expect(b.returns).toEqual(a.returns);
    expect(b.balance_sheet).toEqual(a.balance_sheet);
  });
  it("an unswept PIK note keeps the 'after_debt_repaid' gate shut for the whole hold; 'immediately' pays out", () => {
    const g3 = GOLDEN_DEALS.G3;
    const run = (start: 'immediately' | 'after_debt_repaid') => runModel(g3.facts, { ...g3.assumptions, structure: { ...g3.assumptions.structure, surplus_distribution: { payout_pct: 1, start } } });
    expect(run('after_debt_repaid').waterfall.every((w) => w.distribution_paid === 0)).toBe(true);
    expect(run('immediately').waterfall.some((w) => w.distribution_paid > 0)).toBe(true);
  });
  it('the policy is frozen across a downside scenario; the amounts move with the cash', () => {
    const g = GOLDEN_DEALS.G13SURPLUS;
    const base = runModel(g.facts, g.assumptions);
    const down = runModel(g.facts, { ...g.assumptions, operations: { ...g.assumptions.operations, growth: g.assumptions.operations.growth.map((x) => x - 0.03) } });
    const sum = (o: typeof base) => o.waterfall.reduce((s, w) => s + w.distribution_paid, 0);
    expect(sum(down)).toBeLessThan(sum(base));
  });
});
