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

  let prevRevenue = baseRevenue;
  const years: AnnualProjectionYear[] = [];

  for (let t = 0; t < hp; t++) {
    const growth = state.revenue.growth_rates[t];
    const acqRev = state.revenue.acquisition_revenue[t] || 0;
    const churnDrag = state.revenue.churn_rate > 0 ? prevRevenue * state.revenue.churn_rate : 0;

    const revenue = prevRevenue * (1 + growth) - churnDrag + acqRev;
    const margin = state.margins.margin_by_year[t];

    const ebitda = revenue * margin;
    // Monitoring-fee termination at exit (P4-11): the agreement terminates on sale, so
    // no monitoring fee in the final hold year.
    const monFeeThisYr = t === hp - 1 ? 0 : monitoringFee;
    const ebitdaAdj = ebitda - monFeeThisYr;
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
      deltaNwc = nwcBalance(revenue, margin, state.margins) - nwcBalance(prevRevenue, prevMargin, state.margins);
    }

    const fcfPreDebt = ebitdaAdj - tax - totalCapex - deltaNwc;
    // Operating FCF before growth investment (P4-6) = total FCF pre-debt + growth capex.
    const operatingFcfPreGrowth = fcfPreDebt + gCapex;

    years.push({
      year: t + 1,
      revenue,
      revenue_growth: growth,
      organic_revenue: prevRevenue * (1 + growth),
      acquisition_revenue: acqRev,
      ebitda,
      ebitda_margin: margin,
      ebitda_adj: ebitdaAdj,
      da,
      ebit,
      interest_expense: interestEstimate,
      financing_fee_amort: finFeeAmort,
      ebt,
      tax,
      nol_used: nolUsage,
      disallowed_interest: taxLine.disallowedInterest,
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

    prevRevenue = revenue;
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
    // Re-run the shared tax line on the converged interest (same ordering as buildProjections).
    const taxLine = computeAnnualTax(
      {
        ebit: yr.ebit,
        interestExpense: totalInterestExpense,
        financingDeductions: finFeeAmort + (oidAmort[i] ?? 0),
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
    yr.fcf_pre_debt = yr.ebitda_adj - yr.tax - yr.total_capex - yr.delta_nwc;
    yr.operating_fcf_pre_growth_capex = yr.fcf_pre_debt + yr.growth_capex;

    const actualRepayment = i < totalRepaymentByYear.length ? totalRepaymentByYear[i] : 0;
    yr.fcf_to_equity = yr.fcf_pre_debt - actualCashInterest - actualRepayment;
  }

  return projections;
}
