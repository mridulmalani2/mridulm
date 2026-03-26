/** Full debt waterfall engine. */

import type {
  ModelState,
  AnnualProjectionYear,
  DebtScheduleYear,
  DebtScheduleResult,
} from '../dealEngineTypes';

export function buildDebtSchedule(
  state: ModelState,
  projections: AnnualProjectionYear[],
): DebtScheduleResult {
  const hp = state.exit.holding_period;
  const tranches = state.debt_tranches;
  const taxRate = state.tax.tax_rate;
  const shield = state.tax.tax_shield_on_interest;

  const empty: DebtScheduleResult = {
    tranche_schedules: [],
    total_debt_by_year: [],
    net_debt_by_year: [],
    leverage_ratio_by_year: [],
    interest_coverage_by_year: [],
    dscr_by_year: [],
    total_cash_interest_by_year: [],
    total_repayment_by_year: [],
    total_interest_tax_shield_by_year: [],
  };

  if (!tranches.length) return empty;

  const balances = tranches.map((t) => t.principal);
  const trancheYears: DebtScheduleYear[][] = tranches.map(() => []);

  for (let yrIdx = 0; yrIdx < hp; yrIdx++) {
    const yr = yrIdx + 1;
    const projYr = yrIdx < projections.length ? projections[yrIdx] : null;
    const fcfPreDebt = projYr ? projYr.fcf_pre_debt : 0;

    let totalMandatoryAmort = 0;
    let totalCashInterest = 0;
    const yearEntries: DebtScheduleYear[] = [];

    // First pass: interest and mandatory amortization
    for (let tIdx = 0; tIdx < tranches.length; tIdx++) {
      const tranche = tranches[tIdx];
      const begBal = balances[tIdx];

      let effRate: number;
      if (tranche.rate_type === 'floating') {
        effRate = Math.max(tranche.base_rate + tranche.spread, tranche.floor);
      } else {
        effRate = tranche.interest_rate;
      }

      let cashInterest: number;
      let pikAccrual: number;
      if (tranche.amortization_type === 'PIK') {
        cashInterest = 0;
        pikAccrual = begBal * tranche.pik_rate;
      } else {
        cashInterest = tranche.cash_interest ? begBal * effRate : 0;
        pikAccrual = 0;
      }

      const sched = tranche.amortization_schedule;
      const scheduledRepayment = yrIdx < sched.length
        ? Math.min(sched[yrIdx], begBal + pikAccrual)
        : 0;

      const commitmentFeePaid = begBal * tranche.commitment_fee;

      totalMandatoryAmort += scheduledRepayment;
      totalCashInterest += cashInterest;

      yearEntries.push({
        year: yr,
        tranche_name: tranche.name,
        beginning_balance: begBal,
        cash_interest: cashInterest,
        pik_accrual: pikAccrual,
        scheduled_repayment: scheduledRepayment,
        sweep_repayment: 0,
        total_repayment: 0,
        ending_balance: 0,
        effective_rate: effRate,
        interest_tax_shield: 0,
        commitment_fee_paid: commitmentFeePaid,
      });
    }

    // Second pass: cash sweep
    let availableForSweep = fcfPreDebt - totalMandatoryAmort - totalCashInterest;
    for (let tIdx = 0; tIdx < tranches.length; tIdx++) {
      const tranche = tranches[tIdx];
      const entry = yearEntries[tIdx];
      if (tranche.amortization_type === 'cash_sweep' && availableForSweep > 0) {
        const maxSweep = Math.max(0, availableForSweep * tranche.cash_sweep_pct);
        const remaining = entry.beginning_balance + entry.pik_accrual - entry.scheduled_repayment;
        entry.sweep_repayment = Math.min(maxSweep, Math.max(0, remaining));
        availableForSweep -= entry.sweep_repayment;
      }
    }

    // Third pass: finalize
    for (let tIdx = 0; tIdx < tranches.length; tIdx++) {
      const entry = yearEntries[tIdx];
      entry.total_repayment = entry.scheduled_repayment + entry.sweep_repayment;
      entry.ending_balance = Math.max(
        0,
        entry.beginning_balance + entry.pik_accrual - entry.total_repayment,
      );
      entry.interest_tax_shield = shield ? entry.cash_interest * taxRate : 0;
      balances[tIdx] = entry.ending_balance;
      trancheYears[tIdx].push(entry);
    }
  }

  // Aggregate metrics
  const totalDebtByYear: number[] = [];
  const netDebtByYear: number[] = [];
  const leverageByYear: number[] = [];
  const coverageByYear: number[] = [];
  const dscrByYear: number[] = [];
  const cashInterestByYear: number[] = [];
  const repaymentByYear: number[] = [];
  const shieldByYear: number[] = [];

  for (let yrIdx = 0; yrIdx < hp; yrIdx++) {
    let totDebt = 0;
    let totCashInt = 0;
    let totRepay = 0;
    let totShield = 0;
    let mandatoryAmort = 0;

    for (let t = 0; t < tranches.length; t++) {
      const entry = trancheYears[t][yrIdx];
      totDebt += entry.ending_balance;
      totCashInt += entry.cash_interest;
      totRepay += entry.total_repayment;
      totShield += entry.interest_tax_shield;
      mandatoryAmort += entry.scheduled_repayment;
    }

    const projYr = yrIdx < projections.length ? projections[yrIdx] : null;
    const ebitdaAdj = projYr ? projYr.ebitda_adj : 1;
    const fcfPre = projYr ? projYr.fcf_pre_debt : 0;

    totalDebtByYear.push(totDebt);
    netDebtByYear.push(totDebt);
    leverageByYear.push(ebitdaAdj > 0 ? totDebt / ebitdaAdj : 0);
    coverageByYear.push(totCashInt > 0 ? ebitdaAdj / totCashInt : 99);
    const debtService = totCashInt + mandatoryAmort;
    dscrByYear.push(debtService > 0 ? fcfPre / debtService : 99);
    cashInterestByYear.push(totCashInt);
    repaymentByYear.push(totRepay);
    shieldByYear.push(totShield);
  }

  return {
    tranche_schedules: trancheYears,
    total_debt_by_year: totalDebtByYear,
    net_debt_by_year: netDebtByYear,
    leverage_ratio_by_year: leverageByYear,
    interest_coverage_by_year: coverageByYear,
    dscr_by_year: dscrByYear,
    total_cash_interest_by_year: cashInterestByYear,
    total_repayment_by_year: repaymentByYear,
    total_interest_tax_shield_by_year: shieldByYear,
  };
}
