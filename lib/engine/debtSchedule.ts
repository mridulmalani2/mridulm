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
    total_mandatory_amort_by_year: [],
    total_interest_tax_shield_by_year: [],
    ecf_by_year: [],
    total_commitment_fees_by_year: [],
    cash_balance_by_year: [],
  };

  if (!tranches.length) return empty;

  // Tranches drawn at entry start at full principal; tranches with a later
  // draw_year_index (e.g. add-on acquisition debt) start at zero and are drawn
  // at the beginning of their draw year inside the loop below.
  const balances = tranches.map((t) => ((t.draw_year_index ?? 0) <= 0 ? t.principal : 0));
  const trancheYears: DebtScheduleYear[][] = tranches.map(() => []);

  // Cash balance roll-forward: tracks actual cash on the balance sheet each year.
  // min_cash is a floor, not an annual rebuild cost — only the incremental gap
  // between the floor and current balance constrains sweep each period.
  let cashBalance = 0;
  const cashBalanceByYear: number[] = [];

  for (let yrIdx = 0; yrIdx < hp; yrIdx++) {
    const yr = yrIdx + 1;
    const projYr = yrIdx < projections.length ? projections[yrIdx] : null;
    const fcfPreDebt = projYr ? projYr.fcf_pre_debt : 0;

    let totalMandatoryAmort = 0;
    let totalCashInterest = 0;
    let totalCommitmentFees = 0;
    const yearEntries: DebtScheduleYear[] = [];

    // First pass: interest and mandatory amortization
    for (let tIdx = 0; tIdx < tranches.length; tIdx++) {
      const tranche = tranches[tIdx];

      // Draw mid-hold debt (add-on acquisition financing) at the start of its draw year.
      const drawYear = tranche.draw_year_index ?? 0;
      if (drawYear > 0 && drawYear === yrIdx) {
        balances[tIdx] = tranche.principal;
      }
      const begBal = balances[tIdx];

      let effRate: number;
      if (tranche.rate_type === 'floating') {
        effRate = Math.max(tranche.base_rate + tranche.spread, tranche.floor);
      } else {
        effRate = tranche.interest_rate;
      }

      const pikAccrual = tranche.amortization_type === 'PIK' ? begBal * tranche.pik_rate : 0;

      const sched = tranche.amortization_schedule;
      const scheduledRepayment = yrIdx < sched.length
        ? Math.min(sched[yrIdx], begBal + pikAccrual)
        : 0;

      // Standard LBO convention: interest accrues on average balance (beginning +
      // post-mandatory-amort) / 2, reflecting that principal is repaid throughout the year.
      let cashInterest: number;
      if (tranche.amortization_type === 'PIK') {
        cashInterest = 0;
      } else {
        const avgBal = (begBal + Math.max(0, begBal - scheduledRepayment)) / 2;
        cashInterest = tranche.cash_interest ? avgBal * effRate : 0;
      }

      // Commitment fee: for revolvers charge on the UNDRAWN portion;
      // for all other tranches commitment_fee represents an OID / upfront fee
      // amortised as a running cost on the outstanding balance (typically 0 for
      // term debt, non-zero only when explicitly set by user).
      const undrawnBal = tranche.tranche_type === 'revolver'
        ? Math.max(0, tranche.principal - begBal)   // fee on undrawn capacity
        : begBal;                                    // legacy: user-specified running fee on drawn
      const commitmentFeePaid = undrawnBal * tranche.commitment_fee;

      totalMandatoryAmort += scheduledRepayment;
      totalCashInterest += cashInterest;
      totalCommitmentFees += commitmentFeePaid;

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

    // Second pass: cash sweep — tiered by sweep_priority, pro-rata within each tier.
    // Available for sweep = post-service FCF minus the incremental floor shortfall.
    const minCash = state.entry.min_cash_balance || 0;
    const floorShortfall = Math.max(0, minCash - cashBalance);
    const ecf = fcfPreDebt - totalMandatoryAmort - totalCashInterest - totalCommitmentFees - floorShortfall;
    let availableForSweep = Math.max(0, ecf);

    // Group sweep-eligible tranche indices by priority (lower = senior).
    // Tranches without an explicit sweep_priority default to their array index,
    // preserving backwards-compatible ordering for legacy models.
    const sweepIndices = tranches
      .map((_t, i) => i)
      .filter((i) => tranches[i].amortization_type === 'cash_sweep');

    const priorityTiers = new Map<number, number[]>();
    for (const idx of sweepIndices) {
      const priority = tranches[idx].sweep_priority ?? idx;
      const bucket = priorityTiers.get(priority) ?? [];
      bucket.push(idx);
      priorityTiers.set(priority, bucket);
    }

    for (const priority of [...priorityTiers.keys()].sort((a, b) => a - b)) {
      if (availableForSweep <= 0) break;
      const tierIndices = priorityTiers.get(priority)!;

      // Max each tranche can absorb: outstanding balance capped by cash_sweep_pct
      let tierCapacity = 0;
      const tierMax: number[] = [];
      for (const tIdx of tierIndices) {
        const entry = yearEntries[tIdx];
        const outstanding = Math.max(0, entry.beginning_balance + entry.pik_accrual - entry.scheduled_repayment);
        const cap = outstanding * tranches[tIdx].cash_sweep_pct;
        tierMax.push(cap);
        tierCapacity += cap;
      }

      if (tierCapacity <= 0) continue;
      const tierAlloc = Math.min(availableForSweep, tierCapacity);

      for (let k = 0; k < tierIndices.length; k++) {
        const tIdx = tierIndices[k];
        const entry = yearEntries[tIdx];
        const share = tierMax[k] / tierCapacity;
        entry.sweep_repayment = share * tierAlloc;
        availableForSweep -= entry.sweep_repayment;
      }
    }

    // Third pass: finalize
    let periodTotalRepayment = 0;
    for (let tIdx = 0; tIdx < tranches.length; tIdx++) {
      const entry = yearEntries[tIdx];
      entry.total_repayment = entry.scheduled_repayment + entry.sweep_repayment;
      entry.ending_balance = Math.max(
        0,
        entry.beginning_balance + entry.pik_accrual - entry.total_repayment,
      );
      // PIK interest is tax-deductible as it accrues, so include alongside cash interest.
      entry.interest_tax_shield = shield ? (entry.cash_interest + entry.pik_accrual) * taxRate : 0;
      balances[tIdx] = entry.ending_balance;
      trancheYears[tIdx].push(entry);
      periodTotalRepayment += entry.total_repayment;
    }

    // Roll forward: ending cash = beginning cash + FCF − cash interest − commitment fees − repayments.
    cashBalance = Math.max(0, cashBalance + fcfPreDebt - totalCashInterest - totalCommitmentFees - periodTotalRepayment);
    cashBalanceByYear.push(cashBalance);
  }

  // Aggregate metrics
  const totalDebtByYear: number[] = [];
  const netDebtByYear: number[] = [];
  const leverageByYear: number[] = [];
  const coverageByYear: number[] = [];
  const dscrByYear: number[] = [];
  const cashInterestByYear: number[] = [];
  const repaymentByYear: number[] = [];
  const mandatoryAmortByYear: number[] = [];
  const shieldByYear: number[] = [];
  const ecfByYear: number[] = [];
  const commitmentFeesByYear: number[] = [];

  for (let yrIdx = 0; yrIdx < hp; yrIdx++) {
    let totDebt = 0;
    let totCashInt = 0;
    let totRepay = 0;
    let totMandatoryAmort = 0;
    let totShield = 0;
    let totCommFees = 0;

    for (let t = 0; t < tranches.length; t++) {
      const entry = trancheYears[t][yrIdx];
      totDebt += entry.ending_balance;
      totCashInt += entry.cash_interest;
      totRepay += entry.total_repayment;
      totMandatoryAmort += entry.scheduled_repayment;
      totShield += entry.interest_tax_shield;
      totCommFees += entry.commitment_fee_paid;
    }

    const projYr = yrIdx < projections.length ? projections[yrIdx] : null;
    const ebitdaAdj = projYr ? projYr.ebitda_adj : 1;
    const fcfPre = projYr ? projYr.fcf_pre_debt : 0;

    // ECF: post-service FCF minus the incremental floor shortfall for this year.
    const minCash = state.entry.min_cash_balance || 0;
    const cashHeld = cashBalanceByYear[yrIdx] ?? 0;
    const aggFloorShortfall = Math.max(0, minCash - (yrIdx > 0 ? cashBalanceByYear[yrIdx - 1] : 0));
    const ecf = fcfPre - totMandatoryAmort - totCashInt - totCommFees - aggFloorShortfall;

    // DSCR: FCF pre-debt / (Cash Interest + Commitment Fees + Mandatory Amortization).
    // Commitment fees are a real recurring cash cost borne before any equity — including them
    // prevents overstating coverage when undrawn revolvers carry non-zero commitment fees.
    const debtService = totCashInt + totCommFees + totMandatoryAmort;

    totalDebtByYear.push(totDebt);
    // Net debt = gross debt − actual cash on balance sheet (not a conceptual reserve).
    netDebtByYear.push(Math.max(0, totDebt - cashHeld));
    // Use 9999 sentinel when EBITDA ≤ 0 — returning 0 is misleading (implies no debt).
    leverageByYear.push(ebitdaAdj > 0 ? totDebt / ebitdaAdj : 9999);
    // 9999 = "no interest / no debt service" sentinel; capped in display layer.
    coverageByYear.push(totCashInt > 0 ? ebitdaAdj / totCashInt : 9999);
    dscrByYear.push(debtService > 0 ? fcfPre / debtService : 9999);
    cashInterestByYear.push(totCashInt);
    repaymentByYear.push(totRepay);
    mandatoryAmortByYear.push(totMandatoryAmort);
    shieldByYear.push(totShield);
    ecfByYear.push(ecf);
    commitmentFeesByYear.push(totCommFees);
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
    total_mandatory_amort_by_year: mandatoryAmortByYear,
    total_interest_tax_shield_by_year: shieldByYear,
    ecf_by_year: ecfByYear,
    total_commitment_fees_by_year: commitmentFeesByYear,
    cash_balance_by_year: cashBalanceByYear,
  };
}
