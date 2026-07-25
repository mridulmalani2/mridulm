/**
 * engine2/exit.ts + returns.ts vs SPEC §9/§10 and the golden exit & return blocks
 * (Phase C6 gate, rebuild/PHASE_C_ENGINE.md build order #6).
 *
 * Full-precision end-to-end (runCore → buildExit → buildReturns), zero injection:
 * flows at ±$0.0075m, IRRs at the TRUE §15 gate of ±0.1bp — the engine computes
 * full-precision cashflows, so no fixture-rounding allowance applies here.
 * Golden-uncovered §9/§10 legs (monitoring termination, rollover split, MIP cap,
 * out-of-the-money promote, NTM basis) are gated by hand fixtures.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runCore, type EngineCore } from '../lib/engine2/sequence';
import { buildExit, exitBasisValue, monitoringTermination, type ExitInputs } from '../lib/engine2/exit';
import { buildGpFeeIncome, buildReturns } from '../lib/engine2/returns';
import { GOLDEN_DEALS, g2DownsideAssumptions } from './fixtures/engine2-golden-deals';
import type { DealAssumptions, ExitBlock } from '../lib/engine2/types';

const ROOT = join(__dirname, '..');
const load = (n: string) => JSON.parse(readFileSync(join(ROOT, 'tests/goldens', n, 'expected.json'), 'utf8'));
const TOL = 0.0075;
const IRR_TOL = 1e-5; // ±0.1bp — SPEC §15, no rounding allowance at full precision

function exitFromCore(core: EngineCore, assumptions: DealAssumptions): ExitBlock {
  const N = assumptions.entry.hold_years;
  const inputs: ExitInputs = {
    exit_year_ebitda_adj: core.operating[N - 1].ebitda_adj,
    last_growth: assumptions.operations.growth[N - 1],
    debt_payoff:
      core.final_debt_state.term_balances.reduce((a, b) => a + b, 0) + core.final_debt_state.revolver_drawn,
    closing_cash: core.waterfall[N - 1].closing_cash,
    unamortized_writeoff: core.exit_writeoff,
    invested_equity_total: core.sources_uses.sponsor_equity + core.sources_uses.rollover_equity,
    rollover_equity: core.sources_uses.rollover_equity,
    // §10 [v1.1.0]: the hurdle base is exit equity PLUS cumulative TOTAL distributions.
    // Passing 0 here gives G3-DIST a promote of 1.82 instead of 16.53 — the golden’s
    // 9.1x discriminator caught exactly that while this gate was being extended.
    cumulative_distributions: core.distributions_paid.reduce((a, b) => a + b, 0),
  };
  return buildExit(assumptions, inputs);
}

describe('exit.ts + returns.ts reproduce the golden exit & return blocks (C6 gate)', () => {
  const cases: [string, DealAssumptions][] = [
    ...(['G1', 'G2', 'G3', 'G4', 'G5'] as const).map(
      (g): [string, DealAssumptions] => [g, GOLDEN_DEALS[g].assumptions],
    ),
    ['G2D', g2DownsideAssumptions()],
    ['G2DIST', GOLDEN_DEALS.G2DIST.assumptions],
    ['G3DIST', GOLDEN_DEALS.G3DIST.assumptions],
    ['G2DISTD', GOLDEN_DEALS.G2DISTD.assumptions],
  ];

  for (const [golden, assumptions] of cases) {
    const factsKey = golden === 'G2D' ? 'G2' : golden;
    it(`${golden}: ExitBlock and all three return streams at full precision; IRRs within ±0.1bp`, () => {
      const g = load(golden);
      const core = runCore(GOLDEN_DEALS[factsKey].facts, assumptions);
      const exit = exitFromCore(core, assumptions);

      for (const key of Object.keys(g.exit) as (keyof ExitBlock)[]) {
        expect(Math.abs((exit[key] as number) - (g.exit[key] as number)), `${golden} exit.${key}`).toBeLessThan(TOL);
      }
      // §14.16 mirror: sponsor + rollover + MIP ≡ pre-MIP total, exact
      expect(exit.sponsor_share + exit.rollover_share + exit.mip_payout).toBeCloseTo(exit.exit_equity_pre_mip_total, 9);

      const returns = buildReturns(assumptions, {
        sponsor_equity: core.sources_uses.sponsor_equity,
        rollover_equity: core.sources_uses.rollover_equity,
        enterprise_value: core.derived.enterprise_value,
        transaction_costs: core.sources_uses.transaction_costs,
        unlevered_fcf: core.unlevered_fcf,
        distributions_paid: core.distributions_paid,
        exit,
        hold_years: assumptions.entry.hold_years,
      });
      for (const streamName of ['sponsor_net', 'pre_promote', 'unlevered'] as const) {
        const mine = returns[streamName];
        const fix = g.returns[streamName];
        expect(mine.cashflows.length, `${golden} ${streamName} length`).toBe(fix.cashflows.length);
        for (let i = 0; i < fix.cashflows.length; i++) {
          expect(Math.abs(mine.cashflows[i] - fix.cashflows[i]), `${golden} ${streamName} cf[${i}]`).toBeLessThan(TOL);
        }
        expect(mine.irr, `${golden} ${streamName} irr defined`).not.toBeNull();
        expect(Math.abs(mine.irr! - fix.irr), `${golden} ${streamName} irr`).toBeLessThan(IRR_TOL);
        expect(mine.moic, `${golden} ${streamName} moic defined`).not.toBeNull();
        expect(Math.abs(mine.moic! - fix.moic), `${golden} ${streamName} moic`).toBeLessThan(5e-4); // fixture 4dp
        // §14.10: MOIC ≡ inflows / outflow, exact
        const inflows = mine.cashflows.reduce((s, c) => (c > 0 ? s + c : s), 0);
        expect(mine.moic!).toBeCloseTo(inflows / -mine.cashflows[0], 9);
        // §1 [v1.1.1]: the mid-year alternative is carried on the SPONSOR-SIDE streams and
        // ONLY there — the unlevered stream always uses period-end times.
        if (streamName === 'unlevered') {
          expect((mine as Record<string, unknown>).irr_mid_year).toBeUndefined();
        } else {
          expect((mine as { irr_mid_year: number | null }).irr_mid_year).not.toBeNull();
          expect(Math.abs((mine as { irr_mid_year: number }).irr_mid_year - fix.irr_mid_year), `${golden} ${streamName} irr_mid_year`).toBeLessThan(IRR_TOL);
        }
      }
      // §9 [v1.1.0] DPI and payback — asserted against the fixtures, on every golden.
      expect(returns.dpi).toHaveLength(g.returns.dpi.length);
      for (let i = 0; i < g.returns.dpi.length; i++) {
        expect(Math.abs(returns.dpi[i] - g.returns.dpi[i]), `${golden} dpi[${i}]`).toBeLessThan(5e-4);
      }
      expect(returns.payback_year, `${golden} payback_year`).toBe(g.returns.payback_year);
      // §14.16 [v1.1.0]: final sponsor_net cashflow ≡ sponsor_share + the SPONSOR SHARE of
      // paid[N] — one period-N flow, because a year-N distribution and the exit settle in
      // the same annual period. Every golden runs rollover = 0, so the sponsor share is the
      // full amount; the DIST goldens make the second term NON-ZERO and are what turns this
      // from a degenerate restatement into a real assertion.
      const paidN = g.distributions.paid[g.distributions.paid.length - 1];
      expect(returns.sponsor_net.cashflows[returns.sponsor_net.cashflows.length - 1])
        .toBeCloseTo(exit.sponsor_share + paidN, 6);
      // and the interim flows ARE the paid distributions, in order
      for (let t = 1; t < returns.sponsor_net.cashflows.length - 1; t++) {
        expect(Math.abs(returns.sponsor_net.cashflows[t] - g.distributions.paid[t - 1]), `${golden} interim cf[${t}]`).toBeLessThan(TOL);
      }
      // gp fee income: null when monitoring is OFF (§9 memo)
      expect(buildGpFeeIncome(assumptions.fees.monitoring, [], exit.monitoring_termination)).toBeNull();
    });
  }

  it('G3 §17 asserts: promote strictly in the money; PIK payoff at par + accrued', () => {
    const core = runCore(GOLDEN_DEALS.G3.facts, GOLDEN_DEALS.G3.assumptions);
    const exit = exitFromCore(core, GOLDEN_DEALS.G3.assumptions);
    expect(exit.mip_payout).toBeGreaterThan(0);
    expect(exit.debt_payoff_at_par_plus_pik).toBeGreaterThan(135 * Math.pow(1.12, 5) - TOL); // PIK leg alone
  });

  it('G2-D §14.17: sponsor IRR ≤ base with entry S&U identical (frozen)', () => {
    const base = runCore(GOLDEN_DEALS.G2.facts, GOLDEN_DEALS.G2.assumptions);
    const down = runCore(GOLDEN_DEALS.G2.facts, g2DownsideAssumptions());
    expect(down.sources_uses).toEqual(base.sources_uses);
    const baseExit = exitFromCore(base, GOLDEN_DEALS.G2.assumptions);
    const downExit = exitFromCore(down, g2DownsideAssumptions());
    const r = (core: EngineCore, exit: ExitBlock, a: DealAssumptions) =>
      buildReturns(a, {
        sponsor_equity: core.sources_uses.sponsor_equity,
        rollover_equity: 0,
        enterprise_value: core.derived.enterprise_value,
        transaction_costs: core.sources_uses.transaction_costs,
        unlevered_fcf: core.unlevered_fcf,
        distributions_paid: core.distributions_paid,
        exit,
        hold_years: 5,
      });
    const baseIrr = r(base, baseExit, GOLDEN_DEALS.G2.assumptions).sponsor_net.irr!;
    const downIrr = r(down, downExit, g2DownsideAssumptions()).sponsor_net.irr!;
    expect(downIrr).toBeLessThanOrEqual(baseIrr);
  });
});

describe('§9/§10 golden-uncovered legs (hand fixtures)', () => {
  it('monitoring termination: NPV of the remaining fee; r = 0 degenerates to annual × T (§9)', () => {
    expect(monitoringTermination(null)).toBe(0);
    expect(monitoringTermination({ annual: 2, termination_years: 3, discount_rate: 0 })).toBe(6);
    const npv = monitoringTermination({ annual: 2, termination_years: 3, discount_rate: 0.1 });
    expect(npv).toBeCloseTo(2 / 1.1 + 2 / 1.21 + 2 / 1.331, 9);
    // and it reduces exit equity as a real Use
    const base: ExitInputs = {
      exit_year_ebitda_adj: 100, last_growth: 0.03, debt_payoff: 200, closing_cash: 30,
      unamortized_writeoff: 0, invested_equity_total: 400, rollover_equity: 0,
    cumulative_distributions: 0,
    };
    const a = (monitoring: DealAssumptions['fees']['monitoring']): DealAssumptions['fees'] =>
      ({ transaction_pct_of_ev: 0.02, financing_pct_of_commitments: 0.015, monitoring });
    const noFee = buildExit({ exit: { multiple: 8, basis: 'fy', fees_pct: 0.015 }, mip: null, fees: a(null) }, base);
    const withFee = buildExit(
      { exit: { multiple: 8, basis: 'fy', fees_pct: 0.015 }, mip: null, fees: a({ annual: 2, termination_years: 3, discount_rate: 0.1 }) },
      base,
    );
    expect(noFee.exit_equity_pre_mip_total - withFee.exit_equity_pre_mip_total).toBeCloseTo(npv, 9);
  });

  it('NTM exit basis: ×(1 + g[N−1]) proxy (§9, flagged golden-uncovered)', () => {
    expect(exitBasisValue(100, 'fy', 0.04)).toBe(100);
    expect(exitBasisValue(100, 'ntm', 0.04)).toBeCloseTo(104, 9);
  });

  it('§10 MIP: out of the money ⇒ 0; in the money ⇒ pool × excess over hurdle; capped at available equity', () => {
    const mk = (exitEquityDriver: number, mip: DealAssumptions['mip']): ExitBlock =>
      buildExit(
        { exit: { multiple: 1, basis: 'fy', fees_pct: 0 }, mip, fees: { transaction_pct_of_ev: 0, financing_pct_of_commitments: 0, monitoring: null } },
        {
          exit_year_ebitda_adj: exitEquityDriver, last_growth: 0, debt_payoff: 0, closing_cash: 0,
          unamortized_writeoff: 0, invested_equity_total: 100, rollover_equity: 0, cumulative_distributions: 0,
        },
      );
    // hurdle 2.0x on 100 invested = 200; exit equity 150 → out of the money
    expect(mk(150, { pool_pct: 0.15, hurdle_moic: 2 }).mip_payout).toBe(0);
    // exit equity 300 → excess 100 → 15
    expect(mk(300, { pool_pct: 0.15, hurdle_moic: 2 }).mip_payout).toBeCloseTo(15, 9);
    // cap: pool 100% of excess over a 0x hurdle, equity 50 → capped at 50
    expect(mk(50, { pool_pct: 1, hurdle_moic: 0 }).mip_payout).toBeCloseTo(50, 9);
  });

  it('rollover splits the post-MIP pot pari-passu pro-rata; §14.16 holds with rollover (golden-uncovered)', () => {
    const exit = buildExit(
      { exit: { multiple: 8, basis: 'fy', fees_pct: 0.015 }, mip: { pool_pct: 0.15, hurdle_moic: 1.5 }, fees: { transaction_pct_of_ev: 0.02, financing_pct_of_commitments: 0.015, monitoring: null } },
      {
        exit_year_ebitda_adj: 120, last_growth: 0, debt_payoff: 300, closing_cash: 25,
        unamortized_writeoff: 3, invested_equity_total: 400, rollover_equity: 100, cumulative_distributions: 0,
      },
    );
    expect(exit.sponsor_share + exit.rollover_share + exit.mip_payout).toBeCloseTo(exit.exit_equity_pre_mip_total, 9);
    // pro-rata: rollover / invested = 25% of the post-MIP pot
    expect(exit.rollover_share).toBeCloseTo((exit.exit_equity_pre_mip_total - exit.mip_payout) * 0.25, 9);
    expect(exit.sponsor_share).toBeCloseTo((exit.exit_equity_pre_mip_total - exit.mip_payout) * 0.75, 9);
  });
});
