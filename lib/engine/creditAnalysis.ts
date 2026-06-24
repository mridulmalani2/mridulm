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

// First-lien / senior tranche types for the senior-leverage metric
// (revolver is pari-passu senior).
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
  const springingBreachByYear: boolean[] = [];

  // Springing covenant (P4-8): a DSCR test that only bites when revolver utilisation
  // exceeds the threshold. Identify revolver tranches once for the per-year check.
  const revolverIdx = state.debt_tranches
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.tranche_type === 'revolver');
  const springingActive = (i: number): boolean => {
    if (cov.springing_dscr_covenant == null || cov.springing_utilization_threshold == null) return false;
    for (const { t, i: tIdx } of revolverIdx) {
      const drawn = debtSchedule.tranche_schedules[tIdx]?.[i]?.ending_balance ?? 0;
      const commitment = t.commitment ?? t.principal;
      if (commitment > 0 && drawn / commitment > cov.springing_utilization_threshold) return true;
    }
    return false;
  };

  for (let i = 0; i < hp; i++) {
    const yr = projections[i];
    if (!yr) continue;

    const cashInterest = debtSchedule.total_cash_interest_by_year[i] || 0;
    // Use mandatory-only amortization for covenant ratios (excludes discretionary sweeps)
    const mandatoryAmort = debtSchedule.total_mandatory_amort_by_year[i] || 0;
    const totalRepayment = debtSchedule.total_repayment_by_year[i] || 0;
    const totalDebt = debtSchedule.total_debt_by_year[i] || 0;
    const netDebt = debtSchedule.net_debt_by_year[i] || 0;
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

    // Leverage: Net Debt / EBITDA (cash nets against debt — the standard LBO
    // total-net-leverage covenant basis); 9999 sentinel when EBITDA ≤ 0 (distressed).
    const leverage = yr.ebitda_adj > 0 ? netDebt / yr.ebitda_adj : 9999;

    // Senior leverage = sum of ALL first-lien/senior tranche balances (filter by
    // type, not array position). Using position [0] mis-reported senior leverage
    // when a revolver — often listed first and undrawn at entry — sat in slot 0.
    const seniorDebt = state.debt_tranches.reduce((sum, tranche, tIdx) => {
      if (!SENIOR_TRANCHE_TYPES.has(tranche.tranche_type)) return sum;
      return sum + (debtSchedule.tranche_schedules[tIdx]?.[i]?.ending_balance ?? 0);
    }, 0);
    // Net cash against the senior tier — cash is available to the most-senior creditors
    // first — so senior NET leverage is on the same basis as total net leverage and can
    // never exceed it (a gross-senior vs net-total mix could report senior > total).
    const cashHeld = debtSchedule.cash_balance_by_year[i] ?? 0;
    const seniorNetDebt = Math.max(0, seniorDebt - cashHeld);
    const seniorLeverage = yr.ebitda_adj > 0 ? seniorNetDebt / yr.ebitda_adj : 9999;

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

    // Springing DSCR test (P4-8): when active, the binding covenant for the year is the
    // tighter of the base and springing levels; headroom is measured against that.
    const isSpringing = springingActive(i);
    const effDscr = isSpringing && cov.springing_dscr_covenant != null
      ? Math.max(effDscrCov(i), cov.springing_dscr_covenant)
      : effDscrCov(i);
    const dscrCapped = Math.min(dscr, 99);
    dscrHeadroomByYear.push(dscrCapped - effDscr);
    springingBreachByYear.push(isSpringing && dscrCapped < (cov.springing_dscr_covenant ?? 0));
    fccrHeadroomByYear.push(Math.min(fccr, 99) - effFccrCov(i));
    // No floor: a breach (leverage > covenant) must surface as NEGATIVE headroom — the
    // magnitude of the breach — consistent with DSCR/FCCR headroom. Clamping to 0 hid it.
    leverageHeadroomByYear.push(effLevCov(i) - leverage);
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
        // A modelled refinancing (P4-3) that terms the maturity out beyond the hold
        // clears the wall; otherwise the bullet still requires refinancing at exit.
        const refi = tranche.refinancing;
        const termedOutBeyondHold = refi != null && (refi.year + refi.extend_maturity_by) > hp;
        if (termedOutBeyondHold) {
          refinancingDetail = `${tranche.name} refinanced in year ${refi!.year} (maturity extended beyond the hold).`;
        } else {
          refinancingRisk = true;
          refinancingDetail = `${tranche.name} (${((tranche.principal / entryDebt) * 100).toFixed(0)}% of total debt) matures at exit — refinancing required.`;
        }
      }
    }
  }

  // Recovery waterfall (P4-10): distressed EV at the YEAR OF DEFAULT — the peak-leverage
  // hold year, the most likely default point — not a static entry-EV × 50%. EV =
  // (year EBITDA × (1 − EBITDA haircut)) × (entry multiple × (1 − multiple haircut)) less
  // distressed sale costs. Recovered against that year's tranche balances, senior first.
  const ebitdaHaircut = cov.recovery_ebitda_haircut ?? 0.4;
  const multipleHaircut = cov.recovery_multiple_haircut ?? 0.5;
  const distressedCostPct = cov.recovery_distressed_cost_pct ?? 0.10;

  // Default year = peak NET leverage over the hold, considering ONLY years with positive
  // EBITDA. The leverage series uses a 9999 sentinel when EBITDA ≤ 0; selecting such a
  // year would compute the distressed EV on non-positive EBITDA and report 0% recovery for
  // every tranche — exactly the distress case this waterfall exists to analyse. Fall back
  // to the last modelled year only if no year has positive EBITDA.
  let defaultYrIdx = metricsByYear.length - 1;
  let peakLev = -Infinity;
  for (let i = 0; i < metricsByYear.length; i++) {
    const projYr = projections[i];
    if (!projYr || projYr.ebitda_adj <= 0) continue; // skip the 9999 sentinel
    const lev = metricsByYear[i].leverage;
    if (lev > peakLev) { peakLev = lev; defaultYrIdx = i; }
  }
  if (defaultYrIdx < 0) defaultYrIdx = 0;
  const defaultProj = projections[defaultYrIdx];
  const defaultEbitda = defaultProj ? defaultProj.ebitda_adj : 0;
  const distressedEv = defaultEbitda * (1 - ebitdaHaircut)
    * (state.entry.entry_ebitda_multiple * (1 - multipleHaircut));
  const stressEV = Math.max(0, distressedEv * (1 - distressedCostPct));

  // Order tranches by seniority for the waterfall (senior/unitranche/revolver → mezz → PIK/junior).
  const seniorityRank = (t: string): number => {
    if (SENIOR_TRANCHE_TYPES.has(t)) return 0;
    if (t === 'mezzanine') return 1;
    return 2; // pik_note / anything junior
  };
  const orderedTrancheIdx = state.debt_tranches
    .map((t, i) => ({ i, rank: seniorityRank(t.tranche_type) }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.i);

  let remainingValue = stressEV;
  const recoveryWaterfall = orderedTrancheIdx.map((tIdx) => {
    const t = state.debt_tranches[tIdx];
    const bal = debtSchedule.tranche_schedules[tIdx]?.[defaultYrIdx]?.ending_balance ?? t.principal;
    const recovery = Math.min(remainingValue, bal);
    remainingValue = Math.max(0, remainingValue - bal);
    return {
      tranche: t.name,
      recovery_pct: bal > 0 ? recovery / bal : 0,
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
    recovery_default_year: defaultYrIdx + 1,
    recovery_stress_ev: stressEV,
    springing_breach_by_year: springingBreachByYear,
    leverage_assessment: leverageAssessment,
  };
}
