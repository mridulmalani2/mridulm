/** Exit reality check — all 8 rules. */

import type {
  ModelState,
  AnnualProjectionYear,
  DebtScheduleResult,
  Returns,
  ExitFlag,
  ExitRealityCheck,
} from '../dealEngineTypes';
import { solveIrr } from './returns';

const SECTOR_MEDIANS: Record<string, number> = {
  Technology: 16.0,
  Healthcare: 12.0,
  Industrials: 8.5,
  Consumer: 9.0,
  'Financial Services': 10.5,
  'Real Estate': 12.0,
  Energy: 7.5,
  'Business Services': 11.0,
  Other: 10.0,
};

export function runRealityCheck(
  state: ModelState,
  projections: AnnualProjectionYear[],
  _debtSchedule: DebtScheduleResult,
  returns: Returns,
): ExitRealityCheck {
  const flags: ExitFlag[] = [];
  const hp = state.exit.holding_period;

  const entryMultiple = state.entry.entry_ebitda_multiple;
  const exitMultiple = state.exit.exit_ebitda_multiple;
  const entryMargin = state.margins.base_ebitda_margin;
  const exitYr = projections.length ? projections[projections.length - 1] : null;
  const exitMargin = exitYr ? exitYr.ebitda_margin : entryMargin;
  const exitEbitda = exitYr ? exitYr.ebitda_adj : 0;
  const exitRevenue = exitYr ? exitYr.revenue : 0;
  const exitEv = returns.exit_ev;
  const exitNetDebt = returns.exit_net_debt;
  const entryLeverage = state.entry.leverage_ratio;
  const exitLeverage = exitEbitda > 0 ? exitNetDebt / exitEbitda : 0;

  const entryGrowth = state.revenue.growth_rates[0] || 0;
  const exitGrowth = state.revenue.growth_rates[state.revenue.growth_rates.length - 1] || 0;

  // RULE 1 — Multiple Expansion + Margin Expansion
  if (exitMultiple > entryMultiple && exitMargin > entryMargin + 0.03) {
    const impactEv = exitEbitda * entryMultiple;
    const impactEq = impactEv - exitNetDebt - state.fees.exit_fee_pct * impactEv - returns.mip_payout;
    const impactCfs = [-returns.entry_equity, ...Array(hp - 1).fill(0), impactEq];
    const impactIrr = solveIrr(impactCfs);
    const deltaBps = returns.irr != null && impactIrr != null
      ? Math.round((returns.irr - impactIrr) * 10000) : 0;
    flags.push({
      flag_type: 'multiple_expansion_with_margin_expansion',
      severity: 'warning',
      description: 'Exit assumes both multiple expansion and margin improvement — buyers typically pay less as margin improves.',
      quantified_impact: `${deltaBps}bps IRR compression if multiple reverts to entry (${entryMultiple.toFixed(1)}x)`,
    });
  }

  // RULE 2 — Multiple Expansion + Leverage Increase
  if (exitMultiple > entryMultiple && exitLeverage > entryLeverage) {
    const impactNetDebt = entryLeverage * exitEbitda;
    const impactEq = exitEv - impactNetDebt - state.fees.exit_fee_pct * exitEv - returns.mip_payout;
    const impactCfs = [-returns.entry_equity, ...Array(hp - 1).fill(0), impactEq];
    const impactIrr = solveIrr(impactCfs);
    const deltaBps = returns.irr != null && impactIrr != null
      ? Math.round((returns.irr - impactIrr) * 10000) : 0;
    flags.push({
      flag_type: 'multiple_expansion_with_leverage_increase',
      severity: 'critical',
      description: 'Exit leverage exceeds entry leverage with simultaneous multiple expansion — rarely seen in practice.',
      quantified_impact: `${deltaBps}bps IRR impact at entry leverage (${entryLeverage.toFixed(1)}x)`,
    });
  }

  // RULE 3 — Implied Buyer Return Too Low
  const impliedBuyerIrr = computeImpliedBuyerIrr(state, exitEv, exitEbitda, exitMargin, exitGrowth, entryMultiple);
  if (impliedBuyerIrr != null && impliedBuyerIrr < 0.15) {
    flags.push({
      flag_type: 'implied_buyer_return_too_low',
      severity: 'critical',
      description: `Implied buyer IRR of ${(impliedBuyerIrr * 100).toFixed(1)}% is below 15% — no rational financial buyer pays this price.`,
      quantified_impact: `Buyer IRR: ${(impliedBuyerIrr * 100).toFixed(1)}%`,
    });
  }

  // RULE 4 — Growth Deceleration Inconsistency
  if (exitGrowth < 0.5 * entryGrowth && exitMultiple >= entryMultiple) {
    flags.push({
      flag_type: 'growth_deceleration_inconsistency',
      severity: 'warning',
      description: "Growth decelerates significantly but exit multiple doesn't compress — multiples typically follow growth.",
      quantified_impact: `Growth: ${(entryGrowth * 100).toFixed(1)}% → ${(exitGrowth * 100).toFixed(1)}%, multiple unchanged at ${exitMultiple.toFixed(1)}x`,
    });
  }

  // RULE 5 — Exit Leverage Above Threshold
  const threshold = ['Industrials', 'Energy', 'Consumer Discretionary'].includes(state.sector) ? 3.5 : 4.0;
  if (exitLeverage > threshold) {
    flags.push({
      flag_type: 'leverage_at_exit_above_threshold',
      severity: 'warning',
      description: `Exit leverage of ${exitLeverage.toFixed(1)}x exceeds ${threshold.toFixed(1)}x threshold — reduces buyer universe.`,
      quantified_impact: `Exit net debt/EBITDA: ${exitLeverage.toFixed(1)}x`,
    });
  }

  // RULE 6 — Entry Premium vs Comparable Deals
  const sectorMedian = SECTOR_MEDIANS[state.sector] ?? 10.0;
  if (entryMultiple > sectorMedian * 1.25) {
    const ebitdaEntry = state.revenue.base_revenue * state.margins.base_ebitda_margin;
    const altEv = ebitdaEntry * sectorMedian;
    const altEquity = altEv + state.fees.transaction_costs + state.fees.financing_fee_pct * state.entry.total_debt_raised - state.entry.total_debt_raised;
    if (altEquity > 0) {
      const altExitEq = returns.exit_ev - returns.exit_net_debt - state.fees.exit_fee_pct * returns.exit_ev - returns.mip_payout;
      const altCfs = [-altEquity, ...Array(hp - 1).fill(0), altExitEq];
      const altIrr = solveIrr(altCfs);
      const delta = altIrr != null && returns.irr != null
        ? Math.round((altIrr - returns.irr) * 10000) : 0;
      flags.push({
        flag_type: 'exit_premium_vs_entry',
        severity: 'warning',
        description: `Entry multiple of ${entryMultiple.toFixed(1)}x is >25% above sector median (${sectorMedian.toFixed(1)}x).`,
        quantified_impact: `+${delta}bps IRR at sector median entry`,
      });
    }
  }

  // RULE 7 — NWC Deterioration
  const entryNwcPct = state.margins.nwc_pct_revenue;
  if (exitYr && state.revenue.base_revenue > 0) {
    const entryNwc = state.revenue.base_revenue * entryNwcPct;
    const exitNwc = exitRevenue * entryNwcPct;
    if (exitNwc > entryNwc * 1.2 && entryNwc > 0) {
      const nwcBuild = exitNwc - entryNwc;
      flags.push({
        flag_type: 'nwc_deterioration',
        severity: 'warning',
        description: `NWC grows from £${entryNwc.toFixed(1)}m to £${exitNwc.toFixed(1)}m — cash tied up in working capital.`,
        quantified_impact: `£${nwcBuild.toFixed(1)}m cumulative NWC build`,
      });
    }
  }

  // RULE 8 — D&A vs Capex Divergence
  const daPct = state.margins.da_pct_revenue;
  const capexPct = state.margins.capex_pct_revenue;
  if (daPct > capexPct * 1.5 && capexPct > 0) {
    flags.push({
      flag_type: 'capex_intensity_change',
      severity: 'warning',
      description: `D&A (${(daPct * 100).toFixed(1)}% of rev) exceeds capex (${(capexPct * 100).toFixed(1)}%) by >50% — unsustainable for asset-heavy businesses.`,
      quantified_impact: `D&A/Capex ratio: ${(daPct / capexPct).toFixed(1)}x`,
    });
  }

  // RULE 9 — Post-Recap Leverage Check (dividend recapitalization)
  const distributions = state.exit.interim_distributions || [];
  if (distributions.some((d) => d > 0)) {
    const leverageThreshold = ['Technology', 'Healthcare'].includes(state.sector) ? 5.0 : 4.0;
    for (let tIdx = 0; tIdx < distributions.length; tIdx++) {
      if (distributions[tIdx] > 0 && tIdx < _debtSchedule.leverage_ratio_by_year.length) {
        const leverageAtT = _debtSchedule.leverage_ratio_by_year[tIdx];
        if (leverageAtT > leverageThreshold) {
          flags.push({
            flag_type: 'post_recap_leverage_excessive',
            severity: 'warning',
            description: `Year ${tIdx + 1} distribution of ${distributions[tIdx].toFixed(0)}m occurs at ${leverageAtT.toFixed(1)}x leverage — above ${leverageThreshold.toFixed(0)}x sector threshold.`,
            quantified_impact: `Post-distribution leverage: ${leverageAtT.toFixed(1)}x`,
          });
        }
      }
    }
  }

  // Verdict
  const criticalCount = flags.filter((f) => f.severity === 'critical').length;
  let verdict: 'aggressive' | 'realistic' | 'conservative';
  if (criticalCount > 0) {
    verdict = 'aggressive';
  } else if (flags.length === 0 || (flags.length > 0 && exitMultiple < entryMultiple)) {
    verdict = exitMultiple < entryMultiple ? 'conservative' : 'realistic';
  } else {
    verdict = 'realistic';
  }

  const evRevenueExit = exitRevenue > 0 ? exitEv / exitRevenue : 0;
  const evEbitdaExit = exitEbitda > 0 ? exitEv / exitEbitda : 0;

  return {
    flags,
    implied_buyer_irr: impliedBuyerIrr,
    ev_revenue_at_exit: evRevenueExit,
    ev_ebitda_at_exit: evEbitdaExit,
    public_comps_multiple_range: [sectorMedian * 0.8, sectorMedian * 1.2],
    multiple_delta: exitMultiple - entryMultiple,
    verdict,
    narrative: '',
  };
}

function computeImpliedBuyerIrr(
  state: ModelState,
  exitEv: number,
  exitEbitda: number,
  exitMargin: number,
  exitGrowth: number,
  entryMultiple: number,
): number | null {
  const buyerHold = 5;
  const buyerLeverage = state.entry.leverage_ratio;
  const buyerDebt = exitEbitda * buyerLeverage;
  const buyerEquity = exitEv - buyerDebt;

  if (buyerEquity <= 0) return null;

  let rev = exitMargin > 0 ? exitEbitda / exitMargin : 0;
  let futureEbitda = exitEbitda;
  for (let i = 0; i < buyerHold; i++) {
    rev *= 1 + exitGrowth;
    futureEbitda = rev * exitMargin;
  }

  const buyerExitEv = futureEbitda * entryMultiple;
  const buyerExitEquity = buyerExitEv - buyerDebt * 0.7;

  const buyerCfs = [-buyerEquity, ...Array(buyerHold - 1).fill(0), buyerExitEquity];
  return solveIrr(buyerCfs);
}
