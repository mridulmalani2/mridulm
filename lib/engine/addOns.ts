/** Add-on acquisition modeling — injects bolt-on revenue/EBITDA into projections
 *  and bolt-on acquisition debt into the debt schedule. */

import type { ModelState, DebtTranche } from '../dealEngineTypes';

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

/**
 * Build synthetic debt tranches representing acquisition financing for add-ons.
 * One bullet tranche per year with incremental add-on debt, drawn in that year
 * (via draw_year_index) and carried to exit (captured in exit net debt). Rate
 * fields are copied from a reference senior tranche so the cost of the
 * acquisition financing flows through interest, leverage, coverage and sweep.
 */
export function buildAddOnDebtTranches(state: ModelState, impact: AddOnImpact): DebtTranche[] {
  const hp = state.exit.holding_period;
  const ref = state.debt_tranches.find((t) => t.tranche_type === 'senior') ?? state.debt_tranches[0];
  const out: DebtTranche[] = [];

  for (let yrIdx = 0; yrIdx < impact.debt_added_by_year.length; yrIdx++) {
    const amt = impact.debt_added_by_year[yrIdx];
    if (amt <= 0) continue;
    out.push({
      name: `Add-on Debt (Yr ${yrIdx + 1})`,
      tranche_type: 'senior',
      principal: amt,
      interest_rate: ref ? ref.interest_rate : 0.08,
      rate_type: ref ? ref.rate_type : 'fixed',
      base_rate: ref ? ref.base_rate : 0,
      spread: ref ? ref.spread : 0,
      amortization_type: 'bullet',
      // All-zero schedule: principal carries to exit and is captured in exit net debt
      // (repaid from exit proceeds), matching the bullet-at-exit convention.
      amortization_schedule: Array(hp).fill(0),
      pik_rate: 0,
      cash_interest: true,
      commitment_fee: 0,
      floor: ref ? ref.floor : 0,
      cash_sweep_pct: 0,
      draw_year_index: yrIdx,
      _synthetic_addon: true,
    });
  }
  return out;
}

/**
 * Apply add-on impact to a model state for a single compute pass:
 *   1. strip any pre-existing synthetic tranches (idempotent across recalcs),
 *   2. inject add-on revenue into acquisition_revenue,
 *   3. transiently append synthetic acquisition-debt tranches.
 *
 * Returns the impact plus the original (non-synthetic) tranche list. Callers
 * MUST restore `state.debt_tranches = originalTranches` after computing the
 * schedule so the synthetic tranches never leak into the input panel, scenario
 * clones, or persisted state.
 */
export function injectAddOns(state: ModelState): { impact: AddOnImpact; originalTranches: DebtTranche[] } {
  const baseTranches = state.debt_tranches.filter((t) => !t._synthetic_addon);
  state.debt_tranches = baseTranches;

  const impact = computeAddOnImpact(state);
  state.revenue.acquisition_revenue = impact.revenue_by_year;

  const synthetic = buildAddOnDebtTranches(state, impact);
  if (synthetic.length) {
    state.debt_tranches = [...baseTranches, ...synthetic];
  }
  return { impact, originalTranches: baseTranches };
}

/** Remove any synthetic add-on tranches (defensive idempotency guard). */
export function stripSyntheticAddOnTranches(state: ModelState): void {
  if (state.debt_tranches.some((t) => t._synthetic_addon)) {
    state.debt_tranches = state.debt_tranches.filter((t) => !t._synthetic_addon);
  }
}
