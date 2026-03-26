/** EBITDA Bridge — decomposes entry-to-exit EBITDA walk. */

import type { ModelState, EBITDABridge, AnnualProjectionYear } from '../dealEngineTypes';

export function computeEBITDABridge(
  state: ModelState,
  projections: AnnualProjectionYear[],
): EBITDABridge {
  const entryEbitda = state.revenue.base_revenue * state.margins.base_ebitda_margin;
  const exitYr = projections.length > 0 ? projections[projections.length - 1] : null;
  const exitEbitda = exitYr ? exitYr.ebitda_adj : entryEbitda;
  const exitRevenue = exitYr ? exitYr.revenue : state.revenue.base_revenue;
  const entryRevenue = state.revenue.base_revenue;

  // Revenue growth at entry margin (what revenue growth contributes at constant margin)
  const organicRevenueContribution = (exitRevenue - entryRevenue) * state.margins.base_ebitda_margin;

  // Margin expansion contribution (on exit revenue, difference from base margin)
  const exitMargin = exitYr ? exitYr.ebitda_margin : state.margins.base_ebitda_margin;
  const marginExpansionContribution = exitRevenue * (exitMargin - state.margins.base_ebitda_margin);

  // Add-on EBITDA
  let addOnEbitda = 0;
  let integrationCosts = 0;
  let costSynergies = 0;
  for (const addon of (state.add_on_acquisitions || [])) {
    addOnEbitda += addon.revenue * addon.ebitda_margin;
    integrationCosts += addon.integration_cost;
    costSynergies += addon.synergy_cost;
  }

  // Monitoring fees (cumulative drag over holding period, but bridge shows annual)
  const monitoringFees = state.fees.monitoring_fee_annual * state.exit.holding_period;

  return {
    entry_ebitda: entryEbitda,
    organic_revenue_contribution: organicRevenueContribution,
    margin_expansion_contribution: marginExpansionContribution,
    cost_synergies: costSynergies,
    add_on_ebitda: addOnEbitda,
    integration_costs: integrationCosts,
    monitoring_fees: monitoringFees,
    exit_ebitda: exitEbitda,
  };
}
