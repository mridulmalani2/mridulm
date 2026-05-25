/** Credit analysis module — FCCR, covenant headroom, debt capacity, recovery waterfall. */

import type {
  ModelState,
  CreditAnalysis,
  CreditMetricsYear,
  AnnualProjectionYear,
  DebtScheduleResult,
} from '../dealEngineTypes';

// Default covenant thresholds (used when no overrides are set on the model).
// DSCR/FCCR raised to reflect typical bank-arranged LBO terms — 1.15x DSCR was
// too aggressive and understated covenant tightness across the whole model.
const DEFAULT_LEVERAGE_COV = 6.0;
const DEFAULT_DSCR_COV = 1.25;
const DEFAULT_FCCR_COV = 1.15;

// First-lien / senior tranche types for the senior-leverage metric. Mirrors the
// Python backend `_is_senior_tranche` classification (revolver is pari-passu senior).
const SENIOR_TRANCHE_TYPES = new Set(['senior', 'unitranche', 'revolver']);

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
  // Resolve the effective covenant for a given year, honouring an optional
  // step-down schedule (real credit agreements tighten covenants over the hold).
  const effLevCov = (i: number) => cov.leverage_covenant_by_year?.[i] ?? cov.leverage_covenant;
  const effDscrCov = (i: number) => cov.dscr_covenant_by_year?.[i] ?? cov.dscr_covenant;
  const effFccrCov = (i: number) => cov.fccr_covenant_by_year?.[i] ?? cov.fccr_covenant;

  const metricsByYear: CreditMetricsYear[] = [];
  let cumulativePaydown = 0;

  const dscrHeadroomByYear: number[] = [];
  const fccrHeadroomByYear: number[] = [];
  const leverageHeadroomByYear: number[] = [];
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
    const commitmentFees = debtSchedule.total_commitment_fees_by_year[i] || 0;

    // Mandatory debt service includes commitment fees — they are a real recurring cash cost.
    const mandatoryDebtService = cashInterest + commitmentFees + mandatoryAmort;

    // Cumulative paydown tracks ALL repayments (mandatory + sweep) for balance-sheet accuracy
    cumulativePaydown += totalRepayment;

    // Fixed Charge Coverage Ratio: (EBITDA - Maintenance Capex - Tax) / (Cash Interest + Mandatory Amort).
    // Credit agreements define FCCR on maintenance capex only — growth capex is
    // discretionary and excluded. total_capex remains in FCF (cash is cash).
    const numeratorFCCR = yr.ebitda_adj - yr.maintenance_capex - yr.tax;
    // 9999 = "no debt service" sentinel; capped at 99 in output for display.
    const fccr = mandatoryDebtService > 0 ? numeratorFCCR / mandatoryDebtService : 9999;

    // Interest Coverage Ratio: EBITDA / Cash Interest
    const icr = cashInterest > 0 ? yr.ebitda_adj / cashInterest : 9999;

    // DSCR: FCF pre-debt / (Cash Interest + Mandatory Scheduled Amortization)
    const fcfPreDebt = yr.fcf_pre_debt;
    const dscr = mandatoryDebtService > 0 ? fcfPreDebt / mandatoryDebtService : 9999;

    // Leverage: Net Debt / EBITDA; 9999 sentinel when EBITDA ≤ 0 (distressed).
    const leverage = yr.ebitda_adj > 0 ? totalDebt / yr.ebitda_adj : 9999;

    // Senior leverage = sum of ALL first-lien/senior tranche balances (filter by
    // type, not array position). Using position [0] mis-reported senior leverage
    // when a revolver — often listed first and undrawn at entry — sat in slot 0.
    const seniorDebt = state.debt_tranches.reduce((sum, tranche, tIdx) => {
      if (!SENIOR_TRANCHE_TYPES.has(tranche.tranche_type)) return sum;
      return sum + (debtSchedule.tranche_schedules[tIdx]?.[i]?.ending_balance ?? 0);
    }, 0);
    const seniorLeverage = yr.ebitda_adj > 0 ? seniorDebt / yr.ebitda_adj : 9999;

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

    dscrHeadroomByYear.push(Math.min(dscr, 99) - effDscrCov(i));
    fccrHeadroomByYear.push(Math.min(fccr, 99) - effFccrCov(i));
    leverageHeadroomByYear.push(Math.max(0, effLevCov(i) - leverage));
    insolvencyWarningByYear.push(insolvencyWarning);
    ecfByYear.push(ecf);
  }

  // Debt capacity at various leverage thresholds
  const maxDebt4x = entryEbitda * 4;
  const maxDebt5x = entryEbitda * 5;
  const maxDebt6x = entryEbitda * 6;

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

  // Indicative leverage-tier characterisation (entry leverage only). Deliberately
  // NOT a credit-rating letter grade: a model-generated "BB+" implies precision the
  // methodology cannot support (no coverage, industry, business-quality or
  // jurisdiction inputs). Surfaced with a disclaimer in the UI.
  const entryLeverage = entryDebt > 0 && entryEbitda > 0 ? entryDebt / entryEbitda : 0;
  let leverageAssessment: string;
  if (entryLeverage <= 0) leverageAssessment = 'Unlevered';
  else if (entryLeverage <= 3) leverageAssessment = 'Conservative';
  else if (entryLeverage <= 4) leverageAssessment = 'Moderate';
  else if (entryLeverage <= 5) leverageAssessment = 'Leveraged';
  else if (entryLeverage <= 6) leverageAssessment = 'Highly Leveraged';
  else leverageAssessment = 'Aggressive';

  return {
    metrics_by_year: metricsByYear,
    max_debt_capacity_at_4x: maxDebt4x,
    max_debt_capacity_at_5x: maxDebt5x,
    max_debt_capacity_at_6x: maxDebt6x,
    covenant_headroom_by_year: leverageHeadroomByYear,
    dscr_headroom_by_year: dscrHeadroomByYear,
    fccr_headroom_by_year: fccrHeadroomByYear,
    insolvency_warning_by_year: insolvencyWarningByYear,
    ecf_by_year: ecfByYear,
    refinancing_risk: refinancingRisk,
    refinancing_risk_detail: refinancingDetail,
    recovery_waterfall: recoveryWaterfall,
    leverage_assessment: leverageAssessment,
  };
}
