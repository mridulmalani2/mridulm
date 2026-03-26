/** Returns calculator (IRR, MOIC, bridge) and value driver decomposition. */

import type {
  ModelState,
  AnnualProjectionYear,
  DebtScheduleResult,
  Returns,
  ValueDriverDecomposition,
} from '../dealEngineTypes';

// ── IRR Solver ──────────────────────────────────────────────────────────

export function solveIrr(cashflows: number[]): number | null {
  if (!cashflows.length) return null;
  if (cashflows.every((cf) => cf >= 0) || cashflows.every((cf) => cf <= 0)) return null;

  // Newton-Raphson with analytical derivative
  let r = 0.1;
  for (let iter = 0; iter < 200; iter++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      const disc = Math.pow(1 + r, t);
      npv += cashflows[t] / disc;
      dnpv += -t * cashflows[t] / Math.pow(1 + r, t + 1);
    }
    if (Math.abs(dnpv) < 1e-15) break;
    const step = npv / dnpv;
    r -= step;
    if (Math.abs(step) < 1e-10 && r >= -0.999 && r <= 100) return r;
  }

  // If Newton failed, check if the result is reasonable
  if (r >= -0.999 && r <= 100) {
    let npv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      npv += cashflows[t] / Math.pow(1 + r, t);
    }
    if (Math.abs(npv) < 0.01) return r;
  }

  // Fallback: bisection (Brent-like)
  let lo = -0.999;
  let hi = 100.0;

  const npvAt = (rate: number) => {
    let s = 0;
    for (let t = 0; t < cashflows.length; t++) {
      s += cashflows[t] / Math.pow(1 + rate, t);
    }
    return s;
  };

  let fLo = npvAt(lo);
  const fHi = npvAt(hi);
  if (fLo * fHi > 0) return null;

  for (let iter = 0; iter < 500; iter++) {
    const mid = (lo + hi) / 2;
    const fMid = npvAt(mid);
    if (Math.abs(fMid) < 1e-10 || (hi - lo) < 1e-12) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }

  return null;
}

// ── Returns Calculation ─────────────────────────────────────────────────

export function calculateReturns(
  state: ModelState,
  projections: AnnualProjectionYear[],
  debtSchedule: DebtScheduleResult,
): Returns {
  const hp = state.exit.holding_period;

  const financingFees = state.fees.financing_fee_pct * state.entry.total_debt_raised;
  const entryEquity =
    state.entry.enterprise_value + state.fees.transaction_costs + financingFees - state.entry.total_debt_raised;

  if (entryEquity <= 0) {
    return {
      irr: null, moic: 0, dpi: 0, rvpi: 0, cash_yield_avg: 0, payback_years: 0,
      irr_gross: null, irr_levered: null, irr_unlevered: null,
      irr_convergence_failed: true, entry_equity: entryEquity,
      exit_equity: 0, exit_ev: 0, exit_net_debt: 0, mip_payout: 0,
    };
  }

  const exitYr = projections.length ? projections[projections.length - 1] : null;
  const exitEbitda = exitYr ? exitYr.ebitda_adj : 0;
  const exitEv = exitEbitda * state.exit.exit_ebitda_multiple;
  const exitNetDebt = debtSchedule.total_debt_by_year.length
    ? debtSchedule.total_debt_by_year[debtSchedule.total_debt_by_year.length - 1]
    : 0;
  const exitFee = state.fees.exit_fee_pct * exitEv;

  const exitEquityPreMip = exitEv - exitNetDebt - exitFee;
  const grossMoic = entryEquity > 0 ? exitEquityPreMip / entryEquity : 0;

  const mipPayout = grossMoic >= state.mip.hurdle_moic
    ? state.mip.mip_pool_pct * exitEquityPreMip
    : 0;

  const exitEquity = exitEquityPreMip - mipPayout;
  const moic = entryEquity > 0 ? exitEquity / entryEquity : 0;

  // Equity IRR
  const equityCfs = [-entryEquity, ...Array(hp - 1).fill(0), exitEquity];
  const irr = solveIrr(equityCfs);

  // Levered pre-fee IRR
  const entryEquityLevered = state.entry.enterprise_value - state.entry.total_debt_raised;
  const exitEquityLevered = exitEv - exitNetDebt;
  const leveredCfs = [-entryEquityLevered, ...Array(hp - 1).fill(0), exitEquityLevered];
  const irrLevered = entryEquityLevered > 0 ? solveIrr(leveredCfs) : null;

  // Gross IRR
  const exitEquityGross = exitEv - exitNetDebt - exitFee;
  const grossCfs = [-entryEquity, ...Array(hp - 1).fill(0), exitEquityGross];
  const irrGross = entryEquity > 0 ? solveIrr(grossCfs) : null;

  // Unlevered IRR
  const entryCostUnlev = state.entry.enterprise_value + state.fees.transaction_costs;
  const unlevCfs: number[] = [-entryCostUnlev];
  for (let i = 0; i < projections.length - 1; i++) {
    unlevCfs.push(projections[i].fcf_pre_debt);
  }
  if (projections.length) {
    const lastYr = projections[projections.length - 1];
    unlevCfs.push(lastYr.fcf_pre_debt + exitEv - exitFee);
  }
  const irrUnlevered = solveIrr(unlevCfs);

  // Payback
  let cumulative = 0;
  let payback = hp;
  for (let t = 0; t < equityCfs.length; t++) {
    cumulative += equityCfs[t];
    if (cumulative >= 0 && t > 0) {
      payback = t;
      break;
    }
  }

  // Cash yield
  const totalFcfEq = projections.reduce((s, yr) => s + yr.fcf_to_equity, 0);
  const cashYieldAvg = entryEquity > 0 && hp > 0 ? (totalFcfEq / hp) / entryEquity : 0;

  return {
    irr,
    moic,
    dpi: moic,
    rvpi: 0,
    cash_yield_avg: cashYieldAvg,
    payback_years: payback,
    irr_gross: irrGross,
    irr_levered: irrLevered,
    irr_unlevered: irrUnlevered,
    irr_convergence_failed: irr === null,
    entry_equity: entryEquity,
    exit_equity: exitEquity,
    exit_ev: exitEv,
    exit_net_debt: exitNetDebt,
    mip_payout: mipPayout,
  };
}

// ── Value Driver Decomposition ──────────────────────────────────────────

export function decomposeValueDrivers(
  state: ModelState,
  projections: AnnualProjectionYear[],
  _debtSchedule: DebtScheduleResult,
  returns: Returns,
): ValueDriverDecomposition {
  const entryEv = state.entry.enterprise_value;
  const entryMargin = state.margins.base_ebitda_margin;
  const entryMultiple = state.entry.entry_ebitda_multiple;

  const exitYr = projections.length ? projections[projections.length - 1] : null;
  const exitRevenue = exitYr ? exitYr.revenue : 0;
  const exitEbitdaAdj = exitYr ? exitYr.ebitda_adj : 0;
  const exitMarginAdj = exitRevenue > 0 ? exitEbitdaAdj / exitRevenue : entryMargin;

  const entryEquity = returns.entry_equity;
  const exitEquity = returns.exit_equity;
  const exitEv = returns.exit_ev;

  // Revenue growth contribution
  const hypoEvRevGrowth = exitRevenue * entryMargin * entryMultiple;
  const deltaRev = hypoEvRevGrowth - entryEv;

  // Margin expansion
  const hypoEvMargin = exitRevenue * exitMarginAdj * entryMultiple;
  const deltaMargin = hypoEvMargin - hypoEvRevGrowth;

  // Multiple expansion
  const deltaMultiple = exitEv - hypoEvMargin;

  // Debt paydown
  const entryNetDebt = state.entry.total_debt_raised;
  const exitNetDebt = returns.exit_net_debt;
  const deltaDebt = entryNetDebt - exitNetDebt;

  // Fees drag
  const financingFees = state.fees.financing_fee_pct * state.entry.total_debt_raised;
  const exitFee = state.fees.exit_fee_pct * exitEv;
  const feesDrag = state.fees.transaction_costs + financingFees + exitFee + returns.mip_payout;

  const totalGain = exitEquity - entryEquity;
  const computedGain = deltaRev + deltaMargin + deltaMultiple + deltaDebt - feesDrag;
  const reconDelta = Math.abs(computedGain - totalGain);

  const pct = (x: number) => (totalGain !== 0 ? (x / totalGain) * 100 : 0);

  return {
    revenue_growth_contribution_pct: pct(deltaRev),
    margin_expansion_contribution_pct: pct(deltaMargin),
    multiple_expansion_contribution_pct: pct(deltaMultiple),
    debt_paydown_contribution_pct: pct(deltaDebt),
    fees_drag_contribution_pct: pct(-feesDrag),
    revenue_growth_contribution_abs: deltaRev,
    margin_expansion_contribution_abs: deltaMargin,
    multiple_expansion_contribution_abs: deltaMultiple,
    debt_paydown_contribution_abs: deltaDebt,
    fees_drag_contribution_abs: -feesDrag,
    entry_equity: entryEquity,
    exit_equity: exitEquity,
    total_equity_gain: totalGain,
    reconciliation_delta: reconDelta,
  };
}
