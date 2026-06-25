/** EBITDA Bridge — decomposes entry-to-exit EBITDA walk. */

import type { ModelState, EBITDABridge, AnnualProjectionYear } from '../dealEngineTypes';
import type { AddOnImpact } from './addOns';

export function computeEBITDABridge(
  state: ModelState,
  projections: AnnualProjectionYear[],
  addOnImpact?: AddOnImpact,
): EBITDABridge {
  const baseMargin = state.margins.base_ebitda_margin;
  const entryRevenue = state.revenue.base_revenue;
  const entryEbitda = entryRevenue * baseMargin;
  const exitYr = projections.length > 0 ? projections[projections.length - 1] : null;
  const exitEbitda = exitYr ? exitYr.ebitda_adj : entryEbitda;
  const exitIdx = projections.length - 1;

  // Walk the PARENT (organic) business only, then add the add-on contribution separately, so
  // the components reconcile to consolidated exit EBITDA without double-counting acquired
  // revenue (Phase 0C). Organic exit revenue and the parent margin come from the projection.
  const parentExitRevenue = exitYr ? exitYr.organic_revenue : entryRevenue;
  const parentExitMargin = exitYr ? (state.margins.margin_by_year[exitIdx] ?? baseMargin) : baseMargin;

  // Revenue growth at the entry margin (constant-margin organic growth contribution).
  const organicRevenueContribution = (parentExitRevenue - entryRevenue) * baseMargin;
  // Margin expansion on the organic base (parent margin lift vs base).
  const marginExpansionContribution = parentExitRevenue * (parentExitMargin - baseMargin);

  // Add-on EBITDA at the add-on's OWN margin (excluding cost synergies, which are a separate
  // bar) and cost synergies — both at the exit year (full run-rate).
  let addOnEbitda = 0;
  let integrationCosts = 0;
  let costSynergies = 0;
  if (addOnImpact) {
    costSynergies = exitIdx >= 0 ? (addOnImpact.cost_synergies_by_year[exitIdx] ?? 0) : 0;
    addOnEbitda = (exitIdx >= 0 ? (addOnImpact.ebitda_by_year[exitIdx] ?? 0) : 0) - costSynergies;
    integrationCosts = addOnImpact.integration_cost_by_year.reduce((s, v) => s + v, 0);
  } else {
    for (const addon of (state.add_on_acquisitions || [])) {
      addOnEbitda += addon.revenue * addon.ebitda_margin;
      integrationCosts += addon.integration_cost;
      costSynergies += addon.synergy_cost;
    }
  }

  // Monitoring fees: annual fee already deducted from each year's ebitda_adj in projections,
  // so the bridge shows the annual amount (what reduces the exit year EBITDA vs unadjusted)
  const monitoringFees = state.fees.monitoring_fee_annual;

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
