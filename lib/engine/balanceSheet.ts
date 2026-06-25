/**
 * Year-by-year balance sheet (refactor plan P3-1) — the third statement that
 * lets the P&L (projections), cash flow (debt-schedule roll-forward) and balance
 * sheet be checked for joint consistency.
 *
 * The statement closes BY CONSTRUCTION when the engine's flows are mutually
 * consistent: every flow that moves cash also moves an offsetting balance-sheet
 * account. `balance_check` is therefore a genuine integrity test — a non-zero
 * value means a flow inconsistency (e.g. cash floored at zero because operations
 * couldn't fund debt service), which is surfaced rather than hidden.
 *
 * Opening (t=0) is anchored with goodwill as the purchase-accounting residual,
 * exactly as a real LBO opening balance sheet is built.
 */

import type {
  ModelState,
  AnnualProjectionYear,
  DebtScheduleResult,
  Returns,
  BalanceSheet,
  BalanceSheetYear,
} from '../dealEngineTypes';
import type { AddOnImpact } from './addOns';
import { nwcBalance } from './projections';
import { oidTotal, oidAmortFromSchedule } from './oid';

const CLOSE_TOLERANCE = 0.01; // £m — joint-consistency tolerance

export function computeBalanceSheet(
  state: ModelState,
  projections: AnnualProjectionYear[],
  debtSchedule: DebtScheduleResult,
  returns: Returns,
  addOnImpact?: AddOnImpact,
): BalanceSheet {
  const hp = state.exit.holding_period;
  const addOnDebtByYear = addOnImpact?.debt_added_by_year ?? [];
  const addOnEquityByYear = addOnImpact?.equity_deployed_by_year ?? [];

  const financingFees = state.fees.financing_fee_pct * state.entry.total_debt_raised;
  const finFeeAmortPerYear = hp > 0 ? financingFees / hp : 0;

  // ── Opening balances (t = 0) ──
  const entryEquity = returns.entry_equity;            // sponsor capital contributed
  const openingDebt = state.entry.total_debt_raised;   // gross debt at close
  const openingCash = 0;                               // engine cash roll-forward starts at zero
  // Entry NWC under the active method (days-based or revenue peg). The cumulative ΔNWC
  // telescopes onto this opening level (P4-9); matches the projection's NWC definition.
  const openingNwc = nwcBalance(state.revenue.base_revenue, state.margins.base_ebitda_margin, state.margins);
  const openingPpe = 0;                                // net PP&E builds from capex − D&A over the hold
  // Capitalised financing costs = upfront bank fees + OID (P4-14); both amortise over the hold.
  const oidTot = oidTotal(state);
  // Schedule-aware OID write-down (Phase 0B) — the SAME series the converged projections
  // deducted for tax, so the deferred-cost asset and the tax/net-income flows stay consistent
  // (and the statement still closes) even when a tranche prepays or refinances early.
  const oidAmort = oidAmortFromSchedule(state, debtSchedule);
  const openingDefFin = financingFees + oidTot;
  // Goodwill is the residual that closes the opening balance sheet (purchase accounting).
  const openingGoodwill =
    (openingDebt + entryEquity) - openingCash - openingNwc - openingPpe - openingDefFin;

  // ── Roll forward year by year ──
  const years: BalanceSheetYear[] = [];
  let cumNetIncome = 0;
  let cumDistributions = 0;
  let cumCommitmentFees = 0;
  let cumRefinancingPremium = 0;
  let cumOidAmort = 0;
  let cumDeltaNwc = 0;
  let cumCapexLessDa = 0;
  // Bolt-on consideration is booked as acquired goodwill, funded by the add-on debt
  // (already in debtSchedule) and fresh sponsor equity — both sides move together.
  let cumAcquisitionCost = 0;
  let cumAddOnEquity = 0;

  let maxAbsCheck = 0;

  for (let i = 0; i < hp; i++) {
    const yr = projections[i];
    if (!yr) continue;

    cumNetIncome += yr.net_income;
    cumDeltaNwc += yr.delta_nwc;
    cumCapexLessDa += yr.total_capex - yr.da;
    cumDistributions += debtSchedule.distributions_paid_by_year[i] ?? 0;
    cumCommitmentFees += debtSchedule.total_commitment_fees_by_year[i] ?? 0;
    cumRefinancingPremium += debtSchedule.refinancing_premium_by_year?.[i] ?? 0;
    cumOidAmort += oidAmort[i] ?? 0;
    const addOnDebt = addOnDebtByYear[i] ?? 0;
    const addOnEquity = addOnEquityByYear[i] ?? 0;
    cumAcquisitionCost += addOnDebt + addOnEquity;
    cumAddOnEquity += addOnEquity;

    const cash = debtSchedule.cash_balance_by_year[i] ?? 0;
    const netWorkingCapital = openingNwc + cumDeltaNwc;
    const netPpe = openingPpe + cumCapexLessDa;
    const deferredFinancingCosts = Math.max(0, openingDefFin - finFeeAmortPerYear * (i + 1) - cumOidAmort);
    const goodwill = openingGoodwill + cumAcquisitionCost;
    const totalAssets = cash + netWorkingCapital + netPpe + deferredFinancingCosts + goodwill;

    const totalDebt = debtSchedule.total_debt_by_year[i] ?? 0;
    const deferredTaxLiability = 0; // not modelled (no book/tax depreciation timing) — kept explicit
    const totalLiabilities = totalDebt + deferredTaxLiability;

    // Equity = contributed + fresh bolt-on equity + retained earnings − distributions
    // − financing cash costs. Commitment fees are a financing cash cost not routed
    // through the P&L; charging them to equity keeps the statements consistent (zero
    // for typical term debt).
    const shareholdersEquity =
      entryEquity + cumAddOnEquity + cumNetIncome - cumDistributions - cumCommitmentFees - cumRefinancingPremium;
    const totalLiabilitiesAndEquity = totalLiabilities + shareholdersEquity;

    const balanceCheck = totalAssets - totalLiabilitiesAndEquity;
    maxAbsCheck = Math.max(maxAbsCheck, Math.abs(balanceCheck));

    years.push({
      year: i + 1,
      cash,
      net_working_capital: netWorkingCapital,
      net_ppe: netPpe,
      deferred_financing_costs: deferredFinancingCosts,
      goodwill,
      total_assets: totalAssets,
      total_debt: totalDebt,
      deferred_tax_liability: deferredTaxLiability,
      total_liabilities: totalLiabilities,
      shareholders_equity: shareholdersEquity,
      total_liabilities_and_equity: totalLiabilitiesAndEquity,
      balance_check: balanceCheck,
      is_balanced: Math.abs(balanceCheck) < CLOSE_TOLERANCE,
    });
  }

  return {
    years,
    closes: years.every((y) => y.is_balanced),
    max_abs_check: maxAbsCheck,
  };
}
