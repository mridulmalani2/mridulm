/** Annual projection engine — P&L, capex, NWC, FCF build. */

import type { ModelState, AnnualProjectionYear } from '../dealEngineTypes';

export function buildProjections(state: ModelState): AnnualProjectionYear[] {
  const hp = state.exit.holding_period;
  const baseRevenue = state.revenue.base_revenue;
  const monitoringFee = state.fees.monitoring_fee_annual;
  const daPct = state.margins.da_pct_revenue;
  const capexPct = state.margins.capex_pct_revenue;
  const nwcPct = state.margins.nwc_pct_revenue;
  const taxRate = state.tax.tax_rate;
  const minTaxRate = state.tax.minimum_tax_rate;
  let nolRemaining = state.tax.nol_carryforward;

  const totalDebt = state.entry.total_debt_raised;
  const financingFees = state.fees.financing_fee_pct * totalDebt;
  const finFeeAmort = hp > 0 ? financingFees / hp : 0;

  let prevRevenue = baseRevenue;
  const years: AnnualProjectionYear[] = [];

  for (let t = 0; t < hp; t++) {
    const growth = state.revenue.growth_rates[t];
    const acqRev = state.revenue.acquisition_revenue[t] || 0;

    const revenue = prevRevenue * (1 + growth) + acqRev;
    const margin = state.margins.margin_by_year[t];

    const ebitda = revenue * margin;
    const ebitdaAdj = ebitda - monitoringFee;
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

    const ebt = ebit - interestEstimate - finFeeAmort;

    let tax: number;
    let nolUsage = 0;
    if (ebt > 0) {
      const rawTax = ebt * taxRate;
      nolUsage = nolRemaining > 0 ? Math.min(nolRemaining, rawTax) : 0;
      const taxAfterNol = rawTax - nolUsage;
      const minTax = ebt * minTaxRate;
      tax = Math.max(taxAfterNol, minTax);
      nolRemaining -= nolUsage;
    } else {
      tax = 0;
      nolUsage = 0;
    }

    const netIncome = ebt - tax;
    const nopat = ebit * (1 - taxRate);
    const mCapex = revenue * capexPct;
    const gCapex = state.margins.growth_capex[t] || 0;
    const totalCapex = mCapex + gCapex;

    let deltaNwc: number;
    if (state.margins.nwc_movement_method === 'pct_change') {
      deltaNwc = (revenue - prevRevenue) * nwcPct;
    } else {
      deltaNwc = 0;
    }

    const fcfPreDebt = ebitdaAdj - tax - totalCapex - deltaNwc;

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
      nol_used: ebt > 0 ? nolUsage : 0,
      net_income: netIncome,
      nopat,
      maintenance_capex: mCapex,
      growth_capex: gCapex,
      total_capex: totalCapex,
      delta_nwc: deltaNwc,
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
): AnnualProjectionYear[] {
  const hp = state.exit.holding_period;
  let nolRemaining = state.tax.nol_carryforward;
  const financingFees = state.fees.financing_fee_pct * state.entry.total_debt_raised;
  const finFeeAmort = hp > 0 ? financingFees / hp : 0;

  for (let i = 0; i < projections.length; i++) {
    const yr = projections[i];
    const actualCashInterest = i < cashInterestByYear.length ? cashInterestByYear[i] : 0;
    const actualPik = i < pikAccrualByYear.length ? pikAccrualByYear[i] : 0;
    const totalInterestExpense = actualCashInterest + actualPik;

    yr.interest_expense = totalInterestExpense;
    yr.ebt = yr.ebit - totalInterestExpense - finFeeAmort;

    if (yr.ebt > 0) {
      const rawTax = yr.ebt * state.tax.tax_rate;
      const nolUsage = nolRemaining > 0 ? Math.min(nolRemaining, rawTax) : 0;
      const taxAfterNol = rawTax - nolUsage;
      const minTax = yr.ebt * state.tax.minimum_tax_rate;
      yr.tax = Math.max(taxAfterNol, minTax);
      yr.nol_used = nolUsage;
      nolRemaining -= nolUsage;
    } else {
      yr.tax = 0;
      yr.nol_used = 0;
    }

    yr.net_income = yr.ebt - yr.tax;
    yr.fcf_pre_debt = yr.ebitda_adj - yr.tax - yr.total_capex - yr.delta_nwc;

    const actualRepayment = i < totalRepaymentByYear.length ? totalRepaymentByYear[i] : 0;
    yr.fcf_to_equity = yr.fcf_pre_debt - actualCashInterest - actualRepayment;
  }

  return projections;
}
