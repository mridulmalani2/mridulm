/** Credit analysis module — FCCR, covenant headroom, debt capacity, recovery waterfall. */

import type {
  ModelState,
  CreditAnalysis,
  CreditMetricsYear,
  AnnualProjectionYear,
  DebtScheduleResult,
} from '../dealEngineTypes';

export function computeCreditAnalysis(
  state: ModelState,
  projections: AnnualProjectionYear[],
  debtSchedule: DebtScheduleResult,
): CreditAnalysis {
  const hp = state.exit.holding_period;
  const entryEbitda = state.revenue.base_revenue * state.margins.base_ebitda_margin;
  const entryDebt = state.entry.total_debt_raised;

  const metricsByYear: CreditMetricsYear[] = [];
  let cumulativePaydown = 0;

  for (let i = 0; i < hp; i++) {
    const yr = projections[i];
    if (!yr) continue;

    const cashInterest = debtSchedule.total_cash_interest_by_year[i] || 0;
    const mandatoryAmort = debtSchedule.total_repayment_by_year[i] || 0;
    const totalDebt = debtSchedule.total_debt_by_year[i] || 0;
    const debtService = cashInterest + mandatoryAmort;

    cumulativePaydown += mandatoryAmort;

    // Fixed Charge Coverage Ratio: (EBITDA - Capex - Tax) / (Cash Interest + Mandatory Amort)
    const numeratorFCCR = yr.ebitda_adj - yr.total_capex - yr.tax;
    const fccr = debtService > 0 ? numeratorFCCR / debtService : 99;

    // Interest coverage: EBITDA / Cash Interest
    const icr = cashInterest > 0 ? yr.ebitda_adj / cashInterest : 99;

    // DSCR: FCF pre-debt / Debt Service
    const dscr = debtService > 0 ? yr.fcf_pre_debt / debtService : 99;

    // Leverage: Net Debt / EBITDA
    const leverage = yr.ebitda_adj > 0 ? totalDebt / yr.ebitda_adj : 0;

    // Senior leverage (first tranche only as proxy)
    const seniorDebt = debtSchedule.tranche_schedules.length > 0
      ? debtSchedule.tranche_schedules[0][i]?.ending_balance || 0
      : 0;
    const seniorLeverage = yr.ebitda_adj > 0 ? seniorDebt / yr.ebitda_adj : 0;

    metricsByYear.push({
      year: i + 1,
      fccr: Math.min(fccr, 99),
      interest_coverage: Math.min(icr, 99),
      dscr: Math.min(dscr, 99),
      leverage,
      senior_leverage: seniorLeverage,
      total_debt: totalDebt,
      cumulative_debt_paydown: cumulativePaydown,
      debt_paydown_pct: entryDebt > 0 ? cumulativePaydown / entryDebt : 0,
    });
  }

  // Debt capacity at various leverage thresholds
  const exitEbitda = projections.length > 0 ? projections[projections.length - 1].ebitda_adj : entryEbitda;
  const maxDebt4x = entryEbitda * 4;
  const maxDebt5x = entryEbitda * 5;
  const maxDebt6x = entryEbitda * 6;

  // Covenant headroom (vs 6x leverage covenant)
  const covenantHeadroom = metricsByYear.map((m) => Math.max(0, 6.0 - m.leverage));

  // Refinancing risk: check if any bullet maturity falls during holding period
  let refinancingRisk = false;
  let refinancingDetail = 'No maturity wall during holding period.';
  for (const tranche of state.debt_tranches) {
    if (tranche.amortization_type === 'bullet' && tranche.principal > 0) {
      // Bullet matures at end of holding period — if it's > 50% of total debt, flag it
      if (tranche.principal / entryDebt > 0.5) {
        refinancingRisk = true;
        refinancingDetail = `${tranche.name} (${((tranche.principal / entryDebt) * 100).toFixed(0)}% of total debt) matures at exit — refinancing required.`;
      }
    }
  }

  // Recovery waterfall (simplified: in a 50% EV haircut scenario)
  const stressEV = state.entry.enterprise_value * 0.5;
  let remainingValue = stressEV;
  const recoveryWaterfall = state.debt_tranches.map((t) => {
    const recovery = Math.min(remainingValue, t.principal);
    remainingValue = Math.max(0, remainingValue - t.principal);
    return {
      tranche: t.name,
      recovery_pct: t.principal > 0 ? recovery / t.principal : 0,
    };
  });

  // Credit rating estimate (simplified heuristic)
  const entryLeverage = entryDebt / entryEbitda;
  let rating = 'BB';
  if (entryLeverage <= 3) rating = 'BBB';
  else if (entryLeverage <= 4) rating = 'BB+';
  else if (entryLeverage <= 5) rating = 'BB';
  else if (entryLeverage <= 6) rating = 'BB-';
  else if (entryLeverage <= 7) rating = 'B+';
  else rating = 'B';

  return {
    metrics_by_year: metricsByYear,
    max_debt_capacity_at_4x: maxDebt4x,
    max_debt_capacity_at_5x: maxDebt5x,
    max_debt_capacity_at_6x: maxDebt6x,
    covenant_headroom_by_year: covenantHeadroom,
    refinancing_risk: refinancingRisk,
    refinancing_risk_detail: refinancingDetail,
    recovery_waterfall: recoveryWaterfall,
    credit_rating_estimate: rating,
  };
}
