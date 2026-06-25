/** Annual projection engine — P&L, capex, NWC, FCF build. */

import type { ModelState, AnnualProjectionYear, MarginAssumptions } from '../dealEngineTypes';
import { oidAmortByYear } from './oid';
import { computeAnnualTax, initTaxState } from './tax';

/**
 * Net working capital balance for a given revenue and EBITDA margin (P4-9).
 * Days-based when any of DSO/DIO/DPO is set: A/R on revenue, Inventory and A/P on the
 * cost base (revenue × (1 − EBITDA margin)) as a COGS proxy — the model has no separate
 * COGS line. Otherwise the simple revenue × nwc_pct_revenue peg. The pct path is
 * unchanged, so existing deals are identical.
 */
export function nwcBalance(revenue: number, ebitdaMargin: number, m: MarginAssumptions): number {
  const usesDays = m.nwc_dso != null || m.nwc_dio != null || m.nwc_dpo != null;
  if (usesDays) {
    const cogs = revenue * (1 - ebitdaMargin);
    const ar = revenue * (m.nwc_dso ?? 0) / 365;
    const inv = cogs * (m.nwc_dio ?? 0) / 365;
    const ap = cogs * (m.nwc_dpo ?? 0) / 365;
    return ar + inv - ap;
  }
  return revenue * m.nwc_pct_revenue;
}

export function buildProjections(state: ModelState): AnnualProjectionYear[] {
  const hp = state.exit.holding_period;
  const baseRevenue = state.revenue.base_revenue;
  const monitoringFee = state.fees.monitoring_fee_annual;
  const daPct = state.margins.da_pct_revenue;
  const capexPct = state.margins.capex_pct_revenue;
  const taxRate = state.tax.tax_rate;
  // Shared running tax state (NOL balance + §163(j) carryforward) threaded across the hold.
  const taxRun = initTaxState(state.tax);

  const totalDebt = state.entry.total_debt_raised;
  const financingFees = state.fees.financing_fee_pct * totalDebt;
  const finFeeAmort = hp > 0 ? financingFees / hp : 0;
  const oidAmort = oidAmortByYear(state); // non-cash, tax-deductible OID amort (P4-14)

  // Track organic and total revenue separately (Phase 0C). The organic (parent) base is what
  // compounds at the growth rate; add-on revenue is grown independently by the add-on module
  // and added ON TOP — compounding the total again double-counted the add-on (pre-0C bug).
  let prevOrganic = baseRevenue;
  let prevTotal = baseRevenue;
  const years: AnnualProjectionYear[] = [];

  for (let t = 0; t < hp; t++) {
    const growth = state.revenue.growth_rates[t];
    const acqRev = state.revenue.acquisition_revenue[t] || 0;          // add-on revenue, already grown
    const acqEbitda = state._addon_ebitda_by_year?.[t] ?? 0;           // add-on EBITDA at its own margin + cost synergies
    const integrationCost = state._addon_integration_by_year?.[t] ?? 0; // one-time, acquisition year
    // Churn hits the organic base; the add-on path is grown by the add-on module.
    const churnDrag = state.revenue.churn_rate > 0 ? prevOrganic * state.revenue.churn_rate : 0;

    const organicRevenue = prevOrganic * (1 + growth) - churnDrag;
    const revenue = organicRevenue + acqRev;
    const margin = state.margins.margin_by_year[t];

    // Consolidated EBITDA: organic revenue at the PARENT margin PLUS each add-on's own EBITDA
    // (its revenue at its own margin) and cost synergies. The reported margin is the blend —
    // not the parent margin applied to acquired revenue (the pre-0C error).
    const ebitda = organicRevenue * margin + acqEbitda;
    // Monitoring-fee termination at exit (P4-11): the agreement terminates on sale, so
    // no monitoring fee in the final hold year.
    const monFeeThisYr = t === hp - 1 ? 0 : monitoringFee;
    const ebitdaAdj = ebitda - monFeeThisYr;
    const ebitdaMargin = revenue > 0 ? ebitda / revenue : margin;
    const da = revenue * daPct;
    const ebit = ebitdaAdj - da;

    let interestEstimate = 0;
    for (const tranche of state.debt_tranches) {
      if (tranche.cash_interest) {
        if (tranche.rate_type === 'fixed') {
          interestEstimate += tranche.principal * tranche.interest_rate;
        } else {
          const effRate = Math.max(tranche.base_rate + tranche.spread, tranche.floor);
          interestEstimate += tranche.principal * effRate;
        }
      } else if (tranche.amortization_type === 'PIK') {
        interestEstimate += tranche.principal * tranche.pik_rate;
      }
    }

    // Tax: §163(j) interest limit → taxable income → NOL (80% cap) → minimum tax.
    // Shared with the post-debt true-up so the two passes cannot diverge (see tax.ts).
    const taxLine = computeAnnualTax(
      {
        ebit,
        interestExpense: interestEstimate,
        financingDeductions: finFeeAmort + (oidAmort[t] ?? 0),
        otherDeductions: integrationCost, // one-time integration cost, deductible (Phase 0C)
        ebitdaForAti: ebitdaAdj,
      },
      state.tax,
      taxRun,
    );
    const ebt = taxLine.ebt;
    const tax = taxLine.tax;
    const nolUsage = taxLine.nolUsed;

    const netIncome = ebt - tax;
    const nopat = ebit * (1 - taxRate);
    const mCapex = revenue * capexPct;
    const gCapex = state.margins.growth_capex[t] || 0;
    const totalCapex = mCapex + gCapex;

    // ΔNWC: explicit per-year override wins; otherwise the change in the NWC balance
    // (days-based when DSO/DIO/DPO set, else the revenue peg — identical to before).
    let deltaNwc: number;
    const explicit = state.margins.nwc_explicit_by_year;
    if (state.margins.nwc_movement_method === 'explicit' && explicit && explicit.length > 0) {
      deltaNwc = explicit[t] ?? 0;
    } else {
      const prevMargin = t === 0 ? state.margins.base_ebitda_margin : state.margins.margin_by_year[t - 1];
      // NWC tracks the TOTAL business (organic + acquired), so the change is measured against
      // the prior-year total revenue.
      deltaNwc = nwcBalance(revenue, margin, state.margins) - nwcBalance(prevTotal, prevMargin, state.margins);
    }

    // FCF pre-debt: adjusted EBITDA (clean) less cash tax, capex, ΔNWC and any one-time add-on
    // integration cost (a real cash outflow, kept out of EBITDA but deductible above) (Phase 0C).
    const fcfPreDebt = ebitdaAdj - tax - totalCapex - deltaNwc - integrationCost;
    // Operating FCF before growth investment (P4-6) = total FCF pre-debt + growth capex.
    const operatingFcfPreGrowth = fcfPreDebt + gCapex;

    years.push({
      year: t + 1,
      revenue,
      revenue_growth: growth,
      organic_revenue: organicRevenue,
      acquisition_revenue: acqRev,
      ebitda,
      ebitda_margin: ebitdaMargin,
      ebitda_adj: ebitdaAdj,
      da,
      ebit,
      interest_expense: interestEstimate,
      financing_fee_amort: finFeeAmort,
      ebt,
      tax,
      nol_used: nolUsage,
      disallowed_interest: taxLine.disallowedInterest,
      integration_cost: integrationCost,
      net_income: netIncome,
      nopat,
      maintenance_capex: mCapex,
      growth_capex: gCapex,
      total_capex: totalCapex,
      delta_nwc: deltaNwc,
      operating_fcf_pre_growth_capex: operatingFcfPreGrowth,
      fcf_pre_debt: fcfPreDebt,
      fcf_to_equity: 0,
    });

    prevOrganic = organicRevenue; // organic compounds; the add-on path is grown separately
    prevTotal = revenue;
  }

  return years;
}

export function updateProjectionsWithDebt(
  projections: AnnualProjectionYear[],
  state: ModelState,
  cashInterestByYear: number[],
  pikAccrualByYear: number[],
  totalRepaymentByYear: number[],
  /** Schedule-aware OID amortisation derived from the actual debt schedule (Phase 0B). The
   *  caller (converge.ts) passes `oidAmortFromSchedule(state, ds)` so the tax deduction
   *  matches the balance-sheet write-down. Falls back to the straight-line seed. */
  oidAmortOverride?: number[],
): AnnualProjectionYear[] {
  const hp = state.exit.holding_period;
  const taxRun = initTaxState(state.tax);
  const financingFees = state.fees.financing_fee_pct * state.entry.total_debt_raised;
  const finFeeAmort = hp > 0 ? financingFees / hp : 0;
  const oidAmort = oidAmortOverride ?? oidAmortByYear(state); // P4-14, schedule-aware (Phase 0B)

  for (let i = 0; i < projections.length; i++) {
    const yr = projections[i];
    const actualCashInterest = i < cashInterestByYear.length ? cashInterestByYear[i] : 0;
    const actualPik = i < pikAccrualByYear.length ? pikAccrualByYear[i] : 0;
    const totalInterestExpense = actualCashInterest + actualPik;

    yr.interest_expense = totalInterestExpense;
    // Re-run the shared tax line on the converged interest (same ordering as buildProjections),
    // keeping the one-time integration cost deductible (Phase 0C).
    const taxLine = computeAnnualTax(
      {
        ebit: yr.ebit,
        interestExpense: totalInterestExpense,
        financingDeductions: finFeeAmort + (oidAmort[i] ?? 0),
        otherDeductions: yr.integration_cost,
        ebitdaForAti: yr.ebitda_adj,
      },
      state.tax,
      taxRun,
    );
    yr.ebt = taxLine.ebt;
    yr.tax = taxLine.tax;
    yr.nol_used = taxLine.nolUsed;
    yr.disallowed_interest = taxLine.disallowedInterest;

    yr.net_income = yr.ebt - yr.tax;
    yr.fcf_pre_debt = yr.ebitda_adj - yr.tax - yr.total_capex - yr.delta_nwc - yr.integration_cost;
    yr.operating_fcf_pre_growth_capex = yr.fcf_pre_debt + yr.growth_capex;

    const actualRepayment = i < totalRepaymentByYear.length ? totalRepaymentByYear[i] : 0;
    yr.fcf_to_equity = yr.fcf_pre_debt - actualCashInterest - actualRepayment;
  }

  return projections;
}
