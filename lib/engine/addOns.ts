/** Add-on acquisition modeling — injects bolt-on revenue/EBITDA into projections. */

import type { ModelState } from '../dealEngineTypes';

export interface AddOnImpact {
  /** Additional revenue injected per year (cumulative from all acquisitions closed by that year). */
  revenue_by_year: number[];
  /** Additional EBITDA injected per year. */
  ebitda_by_year: number[];
  /** Total acquisition cost funded by equity (affects IRR timing). */
  equity_deployed_by_year: number[];
  /** Total acquisition cost funded by debt. */
  debt_added_by_year: number[];
  /** One-time integration costs by year. */
  integration_cost_by_year: number[];
  /** Synergy revenue by year (cumulative). */
  synergy_revenue_by_year: number[];
  /** Cost synergies by year (cumulative). */
  cost_synergies_by_year: number[];
}

export function computeAddOnImpact(state: ModelState): AddOnImpact {
  const hp = state.exit.holding_period;
  const addOns = state.add_on_acquisitions || [];

  const revenueByYear = Array(hp).fill(0);
  const ebitdaByYear = Array(hp).fill(0);
  const equityByYear = Array(hp).fill(0);
  const debtByYear = Array(hp).fill(0);
  const integrationByYear = Array(hp).fill(0);
  const synergyRevByYear = Array(hp).fill(0);
  const costSynByYear = Array(hp).fill(0);

  for (const addon of addOns) {
    const acqYear = addon.year; // 1-indexed
    if (acqYear < 1 || acqYear > hp) continue;

    const purchasePrice = addon.revenue * addon.ebitda_margin * addon.purchase_multiple;
    const debtPortion = addon.funding === 'debt' ? purchasePrice
      : addon.funding === 'equity' ? 0
      : purchasePrice * addon.debt_pct;
    const equityPortion = purchasePrice - debtPortion;

    // Costs in acquisition year
    const yrIdx = acqYear - 1;
    equityByYear[yrIdx] += equityPortion;
    debtByYear[yrIdx] += debtPortion;
    integrationByYear[yrIdx] += addon.integration_cost;

    // Revenue and EBITDA from acquisition year onwards (assume full year from year of acquisition)
    for (let i = yrIdx; i < hp; i++) {
      const yearsOwned = i - yrIdx;
      // Simple: add-on revenue grows at the same rate as the base business
      const addOnGrowth = yearsOwned > 0 && i < state.revenue.growth_rates.length
        ? state.revenue.growth_rates.slice(yrIdx, i).reduce((acc, g) => acc * (1 + g), 1)
        : 1;

      revenueByYear[i] += addon.revenue * addOnGrowth + (yearsOwned > 0 ? addon.synergy_revenue : 0);
      ebitdaByYear[i] += addon.revenue * addOnGrowth * addon.ebitda_margin + (yearsOwned > 0 ? addon.synergy_cost : 0);
      if (yearsOwned > 0) {
        synergyRevByYear[i] += addon.synergy_revenue;
        costSynByYear[i] += addon.synergy_cost;
      }
    }
  }

  return {
    revenue_by_year: revenueByYear,
    ebitda_by_year: ebitdaByYear,
    equity_deployed_by_year: equityByYear,
    debt_added_by_year: debtByYear,
    integration_cost_by_year: integrationByYear,
    synergy_revenue_by_year: synergyRevByYear,
    cost_synergies_by_year: costSynByYear,
  };
}
