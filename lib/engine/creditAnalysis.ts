/** Credit analysis module — FCCR, covenant headroom, debt capacity, recovery waterfall. */

import type {
  ModelState,
  CreditAnalysis,
  CreditMetricsYear,
  AnnualProjectionYear,
  DebtScheduleResult,
} from '../dealEngineTypes';

// Default covenant thresholds (used when no overrides are set on the model)
const DEFAULT_LEVERAGE_COV = 6.0;
const DEFAULT_DSCR_COV = 1.15;
const DEFAULT_FCCR_COV = 1.10;

export function computeCreditAnalysis(
  state: ModelState,
  projections: AnnualProjectionYear[],
  debtSchedule: DebtScheduleResult,
): CreditAnalysis {
  const hp = state.exit.holding_period;
  const entryEbitda = state.revenue.base_revenue * state.margins.base_ebitda_margin;
  const entryDebt = state.entry.total_debt_raised;

  // Pull configurable covenant thresholds (with sensible defaults for legacy models)
  const cov = state.credit_covenants ?? {
    leverage_covenant: DEFAULT_LEVERAGE_COV,
    dscr_covenant: DEFAULT_DSCR_COV,
    fccr_covenant: DEFAULT_FCCR_COV,
  };
  const leverageCov = cov.leverage_covenant;
  const dscrCov = cov.dscr_covenant;
  const fccrCov = cov.fccr_covenant;

  const metricsByYear: CreditMetricsYear[] = [];
  let cumulativePaydown = 0;

  const dscrHeadroomByYear: number[] = [];
  const fccrHeadroomByYear: number[] = [];
  const insolvencyWarningByYear: boolean[] = [];
  const ecfByYear: number[] = [];

  for (let i = 0; i < hp; i++) {
    const yr = projections[i];
    if (!yr) continue;

    const cashInterest = debtSchedule.total_cash_interest_by_year[i] || 0;
    // Use mandatory-only amortization for covenant ratios (excludes discretionary sweeps)
    const mandatoryAmort = debtSchedule.total_mandatory_amort_by_year[i] || 0;
    const totalRepayment = debtSchedule.total_repayment_by_year[i] || 0;
    const totalDebt = debtSchedule.total_debt_by_year[i] || 0;

    // Total mandatory debt service = cash interest + contractual principal
    const mandatoryDebtService = cashInterest + mandatoryAmort;

    // Cumulative paydown tracks ALL repayments (mandatory + sweep) for balance-sheet accuracy
    cumulativePaydown += totalRepayment;

    // Fixed Charge Coverage Ratio: (EBITDA - Capex - Tax) / (Cash Interest + Mandatory Amort)
    const numeratorFCCR = yr.ebitda_adj - yr.total_capex - yr.tax;
    const fccr = mandatoryDebtService > 0 ? numeratorFCCR / mandatoryDebtService : 99;

    // Interest Coverage Ratio: EBITDA / Cash Interest
    const icr = cashInterest > 0 ? yr.ebitda_adj / cashInterest : 99;

    // DSCR: FCF pre-debt / (Cash Interest + Mandatory Scheduled Amortization)
    // The denominator includes contractual principal — lender standard definition.
    // FCF pre-debt = EBITDA Adj − Tax − Capex − ΔNWC (matches projections.fcf_pre_debt)
    const fcfPreDebt = yr.fcf_pre_debt;
    const dscr = mandatoryDebtService > 0 ? fcfPreDebt / mandatoryDebtService : 99;

    // Leverage: Net Debt / EBITDA
    const leverage = yr.ebitda_adj > 0 ? totalDebt / yr.ebitda_adj : 0;

    // Senior leverage (first tranche only as proxy)
    const seniorDebt = debtSchedule.tranche_schedules.length > 0
      ? debtSchedule.tranche_schedules[0][i]?.ending_balance || 0
      : 0;
    const seniorLeverage = yr.ebitda_adj > 0 ? seniorDebt / yr.ebitda_adj : 0;

    // Excess Cash Flow = FCF pre-debt minus all mandatory obligations.
    // Negative ECF means the company cannot cover mandatory debt service from operations
    // and would need to draw on cash reserves or external financing — a default-risk signal.
    const ecf = debtSchedule.ecf_by_year[i] ?? (fcfPreDebt - mandatoryDebtService);

    const insolvencyWarning = ecf < 0;

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
      ecf,
    });

    dscrHeadroomByYear.push(Math.min(dscr, 99) - dscrCov);
    fccrHeadroomByYear.push(Math.min(fccr, 99) - fccrCov);
    insolvencyWarningByYear.push(insolvencyWarning);
    ecfByYear.push(ecf);
  }

  // Debt capacity at various leverage thresholds
  const maxDebt4x = entryEbitda * 4;
  const maxDebt5x = entryEbitda * 5;
  const maxDebt6x = entryEbitda * 6;

  // Covenant headroom (leverage): headroom = covenant_leverage − actual leverage
  const covenantHeadroom = metricsByYear.map((m) => Math.max(0, leverageCov - m.leverage));

  // Refinancing risk: flag if any bullet maturity > 50% of total debt
  let refinancingRisk = false;
  let refinancingDetail = 'No maturity wall during holding period.';
  for (const tranche of state.debt_tranches) {
    if (tranche.amortization_type === 'bullet' && tranche.principal > 0 && entryDebt > 0) {
      if (tranche.principal / entryDebt > 0.5) {
        refinancingRisk = true;
        refinancingDetail = `${tranche.name} (${((tranche.principal / entryDebt) * 100).toFixed(0)}% of total debt) matures at exit — refinancing required.`;
      }
    }
  }

  // Recovery waterfall (simplified: 50% EV haircut scenario)
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
  const entryLeverage = entryDebt > 0 && entryEbitda > 0 ? entryDebt / entryEbitda : 0;
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
    dscr_headroom_by_year: dscrHeadroomByYear,
    fccr_headroom_by_year: fccrHeadroomByYear,
    insolvency_warning_by_year: insolvencyWarningByYear,
    ecf_by_year: ecfByYear,
    refinancing_risk: refinancingRisk,
    refinancing_risk_detail: refinancingDetail,
    recovery_waterfall: recoveryWaterfall,
    credit_rating_estimate: rating,
  };
}
