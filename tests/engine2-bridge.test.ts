/**
 * engine2/bridge.ts vs SPEC §12 / §14.9 (Phase C8 gate, per the v1.0.3 amendment).
 *
 * The goldens carry no bridge block (spec_calc derives schedules, not exhibits), so the
 * gate is the EXACT reconciliation invariant §14.9 run end-to-end on every golden
 * (runCore → buildExit → buildBridge, all full precision — the residual is an internal
 * identity, independent of fixture rounding), plus hand fixtures for the legs the goldens
 * leave at zero (multiple change via G2-D, monitoring, rollover, MIP interplay).
 */
import { describe, it, expect } from 'vitest';
import { buildBridge, type BridgeInputs } from '../lib/engine2/bridge';
import { buildExit, type ExitInputs } from '../lib/engine2/exit';
import { runCore, type EngineCore } from '../lib/engine2/sequence';
import { GOLDEN_DEALS, g2DownsideAssumptions } from './fixtures/engine2-golden-deals';
import type { DealAssumptions, ExitBlock } from '../lib/engine2/types';

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
  };
  return buildExit(assumptions, inputs);
}

function bridgeInputs(core: EngineCore, exit: ExitBlock, assumptions: DealAssumptions): BridgeInputs {
  const su = core.sources_uses;
  return {
    entry_multiple: core.derived.entry_multiple,
    entry_ebitda: core.derived.enterprise_value / core.derived.entry_multiple,
    entry_net_debt: core.derived.total_debt_at_par - su.cash_to_balance_sheet,
    entry_costs: su.transaction_costs + su.financing_fees + su.oid_funded,
    entry_equity_pre_promote_total: su.sponsor_equity + su.rollover_equity,
    exit_multiple: assumptions.exit.multiple,
    exit_ebitda: exit.exit_ebitda_basis_value,
    exit_net_debt: exit.debt_payoff_at_par_plus_pik - exit.cash_at_exit,
    exit_costs: exit.exit_fees + exit.monitoring_termination,
    exit_equity_pre_mip_total: exit.exit_equity_pre_mip_total,
    mip_payout: exit.mip_payout,
    rollover_share: exit.rollover_share,
    rollover_equity: su.rollover_equity,
    sponsor_share: exit.sponsor_share,
    sponsor_equity: su.sponsor_equity,
    monitoring_annual_total: 0,
  };
}

describe('bridge.ts — §14.9 exact reconciliation on every golden (C8 gate)', () => {
  const cases: [string, DealAssumptions][] = [
    ...(['G1', 'G2', 'G3', 'G4', 'G5'] as const).map(
      (g): [string, DealAssumptions] => [g, GOLDEN_DEALS[g].assumptions],
    ),
    ['G2D', g2DownsideAssumptions()],
  ];

  for (const [golden, assumptions] of cases) {
    const factsKey = golden === 'G2D' ? 'G2' : golden;
    it(`${golden}: residual ≡ 0 to machine precision; bars carry the §12 signs`, () => {
      const core = runCore(GOLDEN_DEALS[factsKey].facts, assumptions);
      const exit = exitFromCore(core, assumptions);
      const b = buildBridge(bridgeInputs(core, exit, assumptions));
      // §14.9 both identities, exact (scaled machine epsilon)
      expect(Math.abs(b.reconciliation_residual)).toBeLessThan(1e-9);
      // flat-multiple goldens: multiple bar and interaction are EXACTLY zero
      if (golden !== 'G2D') {
        expect(b.multiple_change_bar).toBe(0);
        expect(b.interaction).toBe(0);
      } else {
        // G2-D: 9.0x → 8.5x on grown EBITDA: negative multiple bar, negative interaction
        expect(b.multiple_change_bar).toBeCloseTo(-0.5 * 110, 9);
        expect(b.interaction).toBeLessThan(0);
      }
      // paydown bar: positive whenever debt delevers net of cash build (all goldens)
      expect(b.net_debt_paydown).toBeGreaterThan(0);
      expect(b.walkdown.sponsor_net_delta).toBeCloseTo(exit.sponsor_share - core.sources_uses.sponsor_equity, 9);
      expect(b.walkdown.mip).toBe(exit.mip_payout);
    });
  }

  it('G1 hand numbers (§12 algebra, derivable from the SPEC §17 check values)', () => {
    const core = runCore(GOLDEN_DEALS.G1.facts, GOLDEN_DEALS.G1.assumptions);
    const exit = exitFromCore(core, GOLDEN_DEALS.G1.assumptions);
    const b = buildBridge(bridgeInputs(core, exit, GOLDEN_DEALS.G1.assumptions));
    expect(b.ebitda_growth_at_entry_multiple).toBeCloseTo(0, 9); // flat ops
    // ND0 = 0 − 5 = −5; ND1 = 0 − 87.5 = −87.5 ⇒ paydown 82.5 (cash build IS deleveraging)
    expect(b.net_debt_paydown).toBeCloseTo(82.5, 6);
    // walk-down: 82.5 − 4 (txn) − 3 (exit fees) = 75.5 = 284.5 − 209
    expect(b.walkdown.entry_costs).toBeCloseTo(4, 6);
    expect(b.walkdown.exit_costs).toBeCloseTo(3, 6);
    expect(b.walkdown.sponsor_net_delta).toBeCloseTo(75.5, 4);
  });

  it('monitoring + rollover + MIP (golden-uncovered): identities stay exact when every friction is live', () => {
    // coherent §2/§9 hand case: EV0=800, M0=8, B0=100; par 400, min cash 10 → ND0=390;
    // costs 30; E0 = 800 + 30 + 10 − 400 = 440 (sponsor 340 + rollover 100)
    const E0 = 440;
    const sponsorEquity = 340;
    // exit: M1=8.5, B1=120 → EV1=1020; payoff 260, cash 40 → ND1=220; exit fees 15.3, termination 5
    const E1 = 1020 - 260 + 40 - 15.3 - 5; // 779.7
    const mip = 20;
    const rolloverShare = (E1 - mip) * (100 / 440);
    const sponsorShare = E1 - mip - rolloverShare;
    const b = buildBridge({
      entry_multiple: 8, entry_ebitda: 100, entry_net_debt: 390, entry_costs: 30,
      entry_equity_pre_promote_total: E0,
      exit_multiple: 8.5, exit_ebitda: 120, exit_net_debt: 220, exit_costs: 20.3,
      exit_equity_pre_mip_total: E1, mip_payout: mip,
      rollover_share: rolloverShare, rollover_equity: 100,
      sponsor_share: sponsorShare, sponsor_equity: sponsorEquity,
      monitoring_annual_total: 8,
    });
    expect(Math.abs(b.reconciliation_residual)).toBeLessThan(1e-9);
    expect(b.ebitda_growth_at_entry_multiple).toBeCloseTo(8 * 20, 9);
    expect(b.multiple_change_bar).toBeCloseTo(0.5 * 100, 9);
    expect(b.interaction).toBeCloseTo(0.5 * 20, 9);
    expect(b.net_debt_paydown).toBeCloseTo(170, 9);
    // bar sum 160 + 50 + 10 + 170 = 390 = ΔEV + ΔND; walk-down: 390 − 30 − 20.3 − 20 − rollover Δ…
    expect(b.walkdown.monitoring_leakage).toBe(8); // memo — inside the paydown bar, not re-subtracted
  });
});
