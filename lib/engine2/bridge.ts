/**
 * engine2/bridge.ts — SPEC §12 value bridge (Phase C build order #8), per the v1.0.3
 * amendment which pinned the arithmetic (the v1.0.2 §12 bars could not reconcile exactly):
 *
 *   Bars decompose the FRICTIONLESS pre-promote delta (EV − net debt at both ends):
 *     growth       = M₀ × (B₁ − B₀)          (ΔEBITDA at the entry multiple)
 *     multiple bar = (M₁ − M₀) × B₀           (the rigorous school — on-exit-EBITDA folds
 *                                              the cross term in by construction, §12's
 *                                              own rejected alternative)
 *     interaction  = (M₁ − M₀) × (B₁ − B₀)    (explicit bar)
 *     paydown      = ND₀ − ND₁                (ND₀ = par − funded min cash;
 *                                              ND₁ = payoff − closing cash)
 *   Walk-down from the bar sum to the sponsor:
 *     − entry costs (txn + financing fees + OID) − exit costs (exit fees + monitoring
 *     termination) − MIP − rollover Δ (rollover exit share − rollover contributed)
 *     = sponsor net Δ.
 *   §14.9 tests BOTH identities exactly:
 *     (a) Σ bars ≡ exit_equity_pre_promote_total − entry_equity_pre_promote_total
 *                  + entry_costs + exit_costs
 *     (b) Σ bars − entry_costs − exit_costs − MIP − rollover Δ ≡ sponsor net Δ.
 *   Monitoring ANNUAL leakage is embedded in the paydown bar via cash — never
 *   double-counted; the §9 gp_fee_income memo carries the display breakout.
 *
 * Typed against the canonical types.ts `ValueBridge` contract (landed with v1.0.3:
 * walkdown.exit_costs + rollover_delta, multiple_change_bar rename).
 *
 * No imports from lib/engine (boundary test).
 */

import type { ValueBridge } from './types';

/** @deprecated alias retained for the C-draft import surface; use `ValueBridge`. */
export type Engine2ValueBridge = ValueBridge;

export interface BridgeInputs {
  entry_multiple: number;
  /** Entry valuation-basis EBITDA (B₀ — §2/§9 basis value). */
  entry_ebitda: number;
  /** ND₀ = total par − funded min cash (§2 opening cash). */
  entry_net_debt: number;
  /** txn + financing fees + OID (§2 uses above EV). */
  entry_costs: number;
  entry_equity_pre_promote_total: number;
  exit_multiple: number;
  /** Exit-basis EBITDA (B₁ — §9, NTM proxy already applied). */
  exit_ebitda: number;
  /** ND₁ = payoff − closing cash (§9). */
  exit_net_debt: number;
  /** exit fees + monitoring termination (§9 exit uses). */
  exit_costs: number;
  exit_equity_pre_mip_total: number;
  mip_payout: number;
  rollover_share: number;
  /** Rollover equity contributed at close (§2 sources). */
  rollover_equity: number;
  sponsor_share: number;
  sponsor_equity: number;
  /** Σ annual monitoring fees (memo only — inside the paydown bar). */
  monitoring_annual_total: number;
  /**
   * §12 [v1.1.0] cumulative SPONSOR-SHARE interim distributions. Paid amounts left via
   * cash, so they already shrank the paydown bar (and, second-order, later sweeps — all
   * truthfully inside ND₁, which is measured on the ACTUAL path). The walk-down adds the
   * sponsor slice back and reconciles to the sponsor's TOTAL delta. The ROLLOVER's slice is
   * deliberately never added back: it is not sponsor money and it left through the same
   * smaller bar. 0 whenever the schedule is empty ⇒ the pre-v1.1.0 identity is the
   * degenerate case.
   */
  interim_distributions_sponsor: number;
}

export function buildBridge(i: BridgeInputs): ValueBridge {
  const deltaB = i.exit_ebitda - i.entry_ebitda;
  const deltaM = i.exit_multiple - i.entry_multiple;
  const growth = i.entry_multiple * deltaB;
  const multipleBar = deltaM * i.entry_ebitda;
  const interaction = deltaM * deltaB;
  const paydown = i.entry_net_debt - i.exit_net_debt;
  const barSum = growth + multipleBar + interaction + paydown;

  // §12 [v1.1.0]: the sponsor's TOTAL delta — exit inflow PLUS cumulative sponsor-share
  // distributions, less the outflow. Degenerates to the exit-only delta when none was paid.
  const sponsorNetDelta =
    i.sponsor_share + i.interim_distributions_sponsor - i.sponsor_equity;
  const rolloverDelta = i.rollover_share - i.rollover_equity;
  // §14.9(a): bars ≡ pre-promote equity Δ grossed back for the two friction blocks.
  // Unchanged by distributions: ND₁ is measured on the ACTUAL path, so a payment shrinks
  // the paydown bar and exit equity by the same amount and the identity is preserved.
  const residualA =
    barSum -
    (i.exit_equity_pre_mip_total - i.entry_equity_pre_promote_total + i.entry_costs + i.exit_costs);
  // §14.9(b): the walk-down lands exactly on the sponsor. Adding the sponsor slice back is
  // EXACT by the same §9 algebra — barSum − costs ≡ exit equity total − entry equity total,
  // and exit equity total = sponsor_share + rollover_share + mip.
  const residualB =
    barSum -
    i.entry_costs -
    i.exit_costs -
    i.mip_payout -
    rolloverDelta +
    i.interim_distributions_sponsor -
    sponsorNetDelta;

  return {
    entry_equity_pre_promote_total: i.entry_equity_pre_promote_total,
    ebitda_growth_at_entry_multiple: growth,
    multiple_change_bar: multipleBar,
    net_debt_paydown: paydown,
    interaction,
    exit_equity_pre_promote_total: i.exit_equity_pre_mip_total,
    walkdown: {
      entry_costs: i.entry_costs,
      exit_costs: i.exit_costs,
      monitoring_leakage: i.monitoring_annual_total,
      mip: i.mip_payout,
      rollover_delta: rolloverDelta,
      interim_distributions_sponsor: i.interim_distributions_sponsor,
      sponsor_net_delta: sponsorNetDelta,
    },
    reconciliation_residual: Math.max(Math.abs(residualA), Math.abs(residualB)),
  };
}
