/**
 * SPEC §9.1 [v2.3.0] limited liability — equity is worth zero at worst; when the exit does not
 * cover the debt the lenders take the shortfall, and no equity holder pays in. Directed fixtures
 * (no golden has an exit below its debt).
 */
import { describe, expect, it } from 'vitest';
import { runModel } from '../lib/engine2/facade';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';
import type { DealAssumptions } from '../lib/engine2/types';

const atExit = (base: { facts: typeof GOLDEN_DEALS.G2.facts; assumptions: DealAssumptions }, multiple: number) =>
  runModel(base.facts, { ...base.assumptions, exit: { ...base.assumptions.exit, multiple } });

describe('§9.1 limited liability at exit', () => {
  const deep = atExit(GOLDEN_DEALS.G2DIST, 1.0);
  const residual = deep.exit.exit_ev - deep.exit.debt_payoff_at_par_plus_pik + deep.exit.cash_at_exit - deep.exit.exit_fees - deep.exit.monitoring_termination;

  it('equity is floored at zero and the shortfall is exactly the uncovered debt', () => {
    expect(residual).toBeLessThan(-1);
    expect(deep.exit.exit_equity_pre_mip_total).toBe(0);
    expect(deep.exit.debt_shortfall_at_exit).toBeCloseTo(-residual, 9);
    expect(deep.exit.sponsor_share).toBe(0);
  });

  it('the sponsor never pays in: every flow after close is ≥ 0, the interim distributions are kept, MOIC is what was realized', () => {
    const cfs = deep.returns.sponsor_net.cashflows;
    expect(cfs.slice(1).every((c) => c >= 0)).toBe(true);
    const interim = deep.waterfall.reduce((s, w) => s + w.distribution_paid, 0);
    expect(deep.returns.sponsor_net.moic!).toBeCloseTo(interim / deep.sources_uses.sponsor_equity, 9);
  });

  it('the value bridge still reconciles: the shortfall is the walk-down term between the bars and equity’s loss', () => {
    expect(deep.bridge.walkdown.debt_shortfall_at_exit).toBeCloseTo(deep.exit.debt_shortfall_at_exit, 12);
    expect(deep.bridge.reconciliation_residual).toBeLessThan(0.005);
  });

  it('the WARN names the lenders’ loss; a covered exit carries a zero shortfall and no WARN', () => {
    expect(deep.coherence.map((f) => f.code)).toContain('exit_debt_shortfall');
    const ok = runModel(GOLDEN_DEALS.G2DIST.facts, GOLDEN_DEALS.G2DIST.assumptions);
    expect(ok.exit.debt_shortfall_at_exit).toBe(0);
    expect(ok.coherence.map((f) => f.code)).not.toContain('exit_debt_shortfall');
  });

  it('the boundary is continuous: just covered and just short both read ~0 equity, never a jump', () => {
    // find the multiple at which the exit exactly covers the debt, then step either side
    const base = atExit(GOLDEN_DEALS.G2, 9);
    const covered = base.exit.debt_payoff_at_par_plus_pik - base.exit.cash_at_exit;
    const mStar = covered / (base.exit.exit_ebitda_basis_value * (1 - base.assumptions.exit.fees_pct));
    const above = atExit(GOLDEN_DEALS.G2, mStar + 1e-6);
    const below = atExit(GOLDEN_DEALS.G2, mStar - 1e-6);
    expect(above.exit.exit_equity_pre_mip_total).toBeGreaterThan(0);
    expect(above.exit.exit_equity_pre_mip_total).toBeLessThan(1e-3);
    expect(below.exit.exit_equity_pre_mip_total).toBe(0);
    expect(below.exit.debt_shortfall_at_exit).toBeLessThan(1e-3);
  });

  it('valuation: the flow-to-equity exit value is the floored equity — the claim is worth zero at worst', () => {
    const v = { risk_free: 0.04, mrp: 0.06, asset_beta: 0.9, debt_beta: 0, long_run_growth: 0.025, leverage_timing: 'end_of_year' as const };
    const o = runModel(GOLDEN_DEALS.G2.facts, { ...GOLDEN_DEALS.G2.assumptions, exit: { ...GOLDEN_DEALS.G2.assumptions.exit, multiple: 0.5 }, valuation: v });
    expect(o.valuation!.assumed.exit_equity_total).toBe(0);
    // at zero exit equity the re-levered cost of equity is undefined (leverage → ∞), so the
    // recursion reports N/A — never a fabricated value
    expect(o.valuation!.assumed.equity_value_at_entry).toBeNull();
    expect(o.valuation!.assumed.equity_irr === null || o.valuation!.assumed.equity_irr < -0.5).toBe(true);
  });
});
