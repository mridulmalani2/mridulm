/**
 * Fund-level (LP-facing) return overlay — refactor plan P4-2.
 *
 * Translates the deal's gross equity cashflow stream into NET LP returns after
 * (1) management fees and (2) GP carried interest over a preferred return. This
 * is a clean overlay on `returns.equity_cashflows` — it never touches the core
 * deal engine, so deal-level IRR/MOIC are unchanged.
 *
 * Modelling conventions (documented simplifications — kept deliberately simple
 * and defensible rather than a full fund waterfall):
 *   • Management fees are a per-year drag on the equity cashflow (years 1..hp).
 *     Basis = invested capital (deal equity) or committed (fund_size × deal share).
 *   • Net MOIC = net value to LPs / invested capital (net multiple on invested).
 *   • Preferred return accrues on capital OUTSTANDING each year (time-weighted),
 *     not as a flat compounded amount on full capital for the whole hold.
 *   • Full waterfall per distribution: return of capital → preferred → 100% GP
 *     catch-up to carry% of (pref + catch-up) → carry% of the residual.
 *   • European (whole-fund): carry crystallised at exit. American (deal-by-deal):
 *     carry taken as distributions clear each tier.
 *   • Paid-in capital includes follow-on (add-on) equity; interim negative flows
 *     are capital calls, not carry-eligible distributions.
 *   • No clawback (single-deal scope).
 */

import type { ModelState, Returns, FundReturns, FundAssumptions } from '../dealEngineTypes';
import { solveIrr, solveIrrTimed } from './returns';

function fundTimeVector(hp: number, midYear: boolean): number[] | null {
  if (!midYear) return null;
  return [0, ...Array.from({ length: hp - 1 }, (_, t) => t + 0.5), hp];
}

function solveIrrAuto(cfs: number[], times: number[] | null): number | null {
  return times ? solveIrrTimed(cfs, times) : solveIrr(cfs);
}

export function computeFundReturns(state: ModelState, returns: Returns): FundReturns | undefined {
  const fa: FundAssumptions | undefined = state.fund_assumptions;
  if (!fa) return undefined;

  const hp = state.exit.holding_period;
  const cfs = returns.equity_cashflows ?? [];
  const invested = returns.entry_equity;
  const grossIrr = returns.irr;
  const grossMoic = returns.moic;

  // Degenerate deal (no solvable equity stream): return a zeroed overlay.
  if (invested <= 0 || cfs.length < 2) {
    return {
      net_irr: null, net_moic: 0, gross_irr: grossIrr, gross_moic: grossMoic,
      gross_to_net_spread: null, management_fees_total: 0, carried_interest: 0,
      preferred_return_shortfall: 0, lp_paid_in: Math.max(0, invested), lp_distributions: 0,
    };
  }

  // Gross inflows by hold year (index 0 = year 1 … hp-1 = year hp). A NEGATIVE entry is an
  // interim CAPITAL CALL (e.g. an equity-funded add-on draw), not a distribution — it adds
  // to paid-in capital, not to carry-eligible proceeds.
  const grossInflows: number[] = [];
  for (let i = 1; i <= hp; i++) grossInflows.push(cfs[i] ?? 0);

  // Total LP paid-in capital = entry equity + follow-on (add-on) equity called over the hold
  // (Bug 6: the overlay previously ignored follow-on capital, understating paid-in).
  const addOnEquity = returns.add_on_equity_invested ?? 0;
  const paidIn = invested + addOnEquity;

  // ── Management fee (annual drag, years 1..hp) ──
  const feeBasis = fa.management_fee_basis === 'committed'
    ? fa.fund_size * Math.max(0, Math.min(1, fa.deal_allocation_pct))
    : paidIn; // invested basis now includes follow-on capital
  const feePerYear = Math.max(0, fa.management_fee_pct) * Math.max(0, feeBasis);
  const feeByYear = grossInflows.map(() => feePerYear);
  const managementFeesTotal = feeByYear.reduce((s, f) => s + f, 0);

  // ── Carry waterfall (time-weighted, with 100% GP catch-up) ──
  // Per positive distribution: (1) return of capital, (2) preferred return accrued on
  // capital OUTSTANDING (time-weighted, not a flat compounded amount), (3) GP catch-up to
  // carry% of (pref + catch-up), (4) carry% of the residual. American crystallises carry as
  // distributions clear; European defers all carry to exit. Interim negative flows raise
  // outstanding capital (a capital call), never trigger carry.
  const pref = Math.max(0, fa.preferred_return);
  const carryRate = Math.max(0, Math.min(0.99, fa.carry_rate));
  const european = fa.carry_waterfall !== 'american';
  const carryByYear = new Array<number>(hp).fill(0);
  let remainingCapital = invested;
  let accruedPref = 0;
  let cumPrefPaid = 0;
  let cumCarry = 0;
  let grossDistributions = 0;
  for (let i = 0; i < hp; i++) {
    accruedPref += remainingCapital * pref; // accrue on capital outstanding this year
    let receipt = grossInflows[i];
    if (receipt < 0) { remainingCapital += -receipt; continue; } // interim capital call
    grossDistributions += receipt;
    // (1) return of capital
    const capReturn = Math.min(receipt, remainingCapital);
    remainingCapital -= capReturn; receipt -= capReturn;
    // (2) preferred return
    const prefPaid = Math.min(receipt, accruedPref);
    accruedPref -= prefPaid; cumPrefPaid += prefPaid; receipt -= prefPaid;
    // (3) GP catch-up to carry% of (pref + catch-up): target cumCarry = r/(1−r) × cumPrefPaid
    const catchUpTarget = carryRate < 1 ? (carryRate / (1 - carryRate)) * cumPrefPaid : Infinity;
    const catchUp = Math.max(0, Math.min(receipt, catchUpTarget - cumCarry));
    cumCarry += catchUp; receipt -= catchUp;
    // (4) residual carry split
    const split = carryRate * receipt;
    cumCarry += split; receipt -= split;
    if (!european) carryByYear[i] = catchUp + split; // American: pay as you go
  }
  const carriedInterest = cumCarry;
  if (european) carryByYear[hp - 1] = carriedInterest; // European: all carry crystallised at exit
  // Preferred shortfall = pref still accrued and unpaid at the end (time-weighted).
  const preferredShortfall = Math.max(0, accruedPref);

  // ── Net LP cashflows ──
  const times = fundTimeVector(hp, state.exit.mid_year_convention ?? false);
  const lpCfs: number[] = [-invested];
  for (let i = 0; i < hp; i++) {
    lpCfs.push(grossInflows[i] - feeByYear[i] - carryByYear[i]);
  }
  const netIrr = solveIrrAuto(lpCfs, times);

  // Distributions to LPs = positive proceeds less fees and carry, over total paid-in.
  const lpDistributions = grossDistributions - managementFeesTotal - carriedInterest;
  const netMoic = paidIn > 0 ? lpDistributions / paidIn : 0;
  const grossToNetSpread = grossIrr != null && netIrr != null ? grossIrr - netIrr : null;

  return {
    net_irr: netIrr,
    net_moic: netMoic,
    gross_irr: grossIrr,
    gross_moic: grossMoic,
    gross_to_net_spread: grossToNetSpread,
    management_fees_total: managementFeesTotal,
    carried_interest: carriedInterest,
    preferred_return_shortfall: preferredShortfall,
    lp_paid_in: paidIn,
    lp_distributions: lpDistributions,
  };
}
