/** Returns calculator (IRR, MOIC, bridge) and value driver decomposition. */

import type {
  ModelState,
  AnnualProjectionYear,
  DebtScheduleResult,
  Returns,
  ValueDriverDecomposition,
  ValueDriverRanking,
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


/**
 * Solve IRR with arbitrary time vectors: sum(cf_i / (1+r)^t_i) = 0.
 * Supports mid-year convention where cash flows occur at fractional periods.
 */
export function solveIrrTimed(cashflows: number[], times: number[]): number | null {
  if (!cashflows.length || cashflows.length !== times.length) return null;
  if (cashflows.every((cf) => cf >= 0) || cashflows.every((cf) => cf <= 0)) return null;

  // Newton-Raphson
  let r = 0.1;
  for (let iter = 0; iter < 200; iter++) {
    let npv = 0;
    let dnpv = 0;
    for (let i = 0; i < cashflows.length; i++) {
      npv += cashflows[i] / Math.pow(1 + r, times[i]);
      dnpv += -times[i] * cashflows[i] / Math.pow(1 + r, times[i] + 1);
    }
    if (Math.abs(dnpv) < 1e-15) break;
    const step = npv / dnpv;
    r -= step;
    if (Math.abs(step) < 1e-10 && r >= -0.999 && r <= 100) return r;
  }

  if (r >= -0.999 && r <= 100) {
    let npv = 0;
    for (let i = 0; i < cashflows.length; i++) {
      npv += cashflows[i] / Math.pow(1 + r, times[i]);
    }
    if (Math.abs(npv) < 0.01) return r;
  }

  // Fallback: bisection
  let lo = -0.999;
  let hi = 100.0;
  const npvAt = (rate: number) => {
    let s = 0;
    for (let i = 0; i < cashflows.length; i++) {
      s += cashflows[i] / Math.pow(1 + rate, times[i]);
    }
    return s;
  };

  let fLo = npvAt(lo);
  if (fLo * npvAt(hi) > 0) return null;

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


function buildTimeVector(hp: number, midYear: boolean): number[] | null {
  if (!midYear) return null;
  return [0, ...Array.from({ length: hp }, (_, t) => t + 0.5)];
}


function solveIrrAuto(cashflows: number[], times: number[] | null): number | null {
  if (times) return solveIrrTimed(cashflows, times);
  return solveIrr(cashflows);
}


// ── Returns Calculation ─────────────────────────────────────────────────

export function calculateReturns(
  state: ModelState,
  projections: AnnualProjectionYear[],
  debtSchedule: DebtScheduleResult,
): Returns {
  const hp = state.exit.holding_period;
  const midYear = state.exit.mid_year_convention ?? false;
  const times = buildTimeVector(hp, midYear);

  const financingFees = state.fees.financing_fee_pct * state.entry.total_debt_raised;
  // Transaction costs: use explicit amount if set, otherwise derive from entry_fee_pct * EV
  const txnCosts = state.fees.transaction_costs > 0
    ? state.fees.transaction_costs
    : state.fees.entry_fee_pct * state.entry.enterprise_value;
  const entryEquity =
    state.entry.enterprise_value + txnCosts + financingFees - state.entry.total_debt_raised;

  if (entryEquity <= 0) {
    return {
      irr: null, moic: 0, dpi: 0, rvpi: 0, cash_yield_avg: 0, payback_years: 0,
      irr_gross: null, irr_levered: null, irr_unlevered: null,
      irr_convergence_failed: true, entry_equity: entryEquity,
      exit_equity: 0, exit_ev: 0, exit_net_debt: 0, mip_payout: 0,
      total_distributions: 0, dpi_by_year: [], rvpi_by_year: [],
      convergence_iterations: 1, convergence_delta: 0,
    };
  }

  const exitYr = projections.length ? projections[projections.length - 1] : null;
  const exitEbitda = exitYr ? exitYr.ebitda_adj : 0;
  const exitEv = (state.exit.exit_ev_override != null && state.exit.exit_ev_override > 0)
    ? state.exit.exit_ev_override
    : exitEbitda * state.exit.exit_ebitda_multiple;
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

  // ── Interim distributions (dividend recaps) ──
  const rawDist = state.exit.interim_distributions || [];
  const distributions: number[] = [];
  for (let i = 0; i < hp; i++) {
    distributions.push(i < rawDist.length ? rawDist[i] : 0);
  }
  const totalDistributions = distributions.reduce((s, d) => s + d, 0);

  // MOIC includes all distributions
  const moic = entryEquity > 0 ? (exitEquity + totalDistributions) / entryEquity : 0;

  // DPI by year (cumulative distributions / entry equity)
  const dpiByYear: number[] = [];
  let cumulDist = 0;
  for (const d of distributions) {
    cumulDist += d;
    dpiByYear.push(entryEquity > 0 ? cumulDist / entryEquity : 0);
  }

  // RVPI by year
  const rvpiByYear: number[] = [];
  for (let yrIdx = 0; yrIdx < hp; yrIdx++) {
    if (yrIdx === hp - 1) {
      rvpiByYear.push(0);
    } else if (yrIdx < projections.length) {
      const yr = projections[yrIdx];
      const estEv = yr.ebitda_adj * state.exit.exit_ebitda_multiple;
      const estDebt = yrIdx < debtSchedule.total_debt_by_year.length ? debtSchedule.total_debt_by_year[yrIdx] : 0;
      rvpiByYear.push(entryEquity > 0 ? Math.max(0, estEv - estDebt) / entryEquity : 0);
    } else {
      rvpiByYear.push(0);
    }
  }

  // ── Equity IRR (with distributions) ──
  const equityCfs: number[] = [-entryEquity];
  for (let i = 0; i < hp; i++) {
    if (i === hp - 1) {
      equityCfs.push(exitEquity + distributions[i]);
    } else {
      equityCfs.push(distributions[i]);
    }
  }
  const irr = solveIrrAuto(equityCfs, times);

  // Levered pre-fee IRR
  const entryEquityLevered = state.entry.enterprise_value - state.entry.total_debt_raised;
  const exitEquityLevered = exitEv - exitNetDebt;
  const leveredCfs: number[] = [-entryEquityLevered];
  for (let i = 0; i < hp; i++) {
    if (i === hp - 1) {
      leveredCfs.push(exitEquityLevered + distributions[i]);
    } else {
      leveredCfs.push(distributions[i]);
    }
  }
  const irrLevered = entryEquityLevered > 0 ? solveIrrAuto(leveredCfs, times) : null;

  // Gross IRR
  const exitEquityGross = exitEv - exitNetDebt - exitFee;
  const grossCfs: number[] = [-entryEquity];
  for (let i = 0; i < hp; i++) {
    if (i === hp - 1) {
      grossCfs.push(exitEquityGross + distributions[i]);
    } else {
      grossCfs.push(distributions[i]);
    }
  }
  const irrGross = entryEquity > 0 ? solveIrrAuto(grossCfs, times) : null;

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
  const irrUnlevered = solveIrrAuto(unlevCfs, times);

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
    dpi: dpiByYear.length ? dpiByYear[dpiByYear.length - 1] : moic,
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
    total_distributions: totalDistributions,
    dpi_by_year: dpiByYear,
    rvpi_by_year: rvpiByYear,
    convergence_iterations: 1,
    convergence_delta: 0,
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
  const vdFinancingFees = state.fees.financing_fee_pct * state.entry.total_debt_raised;
  const vdTxnCosts = state.fees.transaction_costs > 0
    ? state.fees.transaction_costs
    : state.fees.entry_fee_pct * state.entry.enterprise_value;
  const exitFee = state.fees.exit_fee_pct * exitEv;
  const feesDrag = vdTxnCosts + vdFinancingFees + exitFee + returns.mip_payout;

  const totalDistributions = returns.total_distributions ?? 0;
  const totalGain = exitEquity + totalDistributions - entryEquity;
  const computedGain = deltaRev + deltaMargin + deltaMultiple + deltaDebt - feesDrag + totalDistributions;
  const reconDelta = Math.abs(computedGain - totalGain);

  const pct = (x: number) => (totalGain !== 0 ? (x / totalGain) * 100 : 0);

  // Build ranked drivers (sorted by absolute contribution, fees always last)
  const driverEntries: { driver: string; contribution_pct: number; contribution_abs: number }[] = [
    { driver: 'Revenue Growth', contribution_pct: pct(deltaRev), contribution_abs: deltaRev },
    { driver: 'Margin Expansion', contribution_pct: pct(deltaMargin), contribution_abs: deltaMargin },
    { driver: 'Multiple Expansion', contribution_pct: pct(deltaMultiple), contribution_abs: deltaMultiple },
    { driver: 'Deleveraging', contribution_pct: pct(deltaDebt), contribution_abs: deltaDebt },
  ];
  driverEntries.sort((a, b) => Math.abs(b.contribution_abs) - Math.abs(a.contribution_abs));

  const rankedDrivers: ValueDriverRanking[] = driverEntries.map((d, i) => ({
    ...d, rank: i + 1,
  }));
  // Fees always last
  rankedDrivers.push({
    driver: 'Fees / Leakage',
    contribution_pct: pct(-feesDrag),
    contribution_abs: -feesDrag,
    rank: rankedDrivers.length + 1,
  });

  // Operational vs financial engineering split
  const operationalAbs = Math.abs(deltaRev) + Math.abs(deltaMargin);
  const totalAbsDrivers = Math.abs(deltaRev) + Math.abs(deltaMargin) + Math.abs(deltaMultiple) + Math.abs(deltaDebt);
  const operationalPct = totalAbsDrivers > 0 ? (operationalAbs / totalAbsDrivers) * 100 : 0;
  const financialPct = 100 - operationalPct;

  const primaryDriver = rankedDrivers[0]?.driver || 'N/A';

  // IC-level insights
  const insights: string[] = [];
  insights.push(
    `Returns primarily driven by ${primaryDriver.toLowerCase()} (${Math.abs(rankedDrivers[0]?.contribution_pct ?? 0).toFixed(0)}%)`,
  );

  if (operationalPct < 20) {
    insights.push('Less than 20% of value from operations — financial engineering heavy');
  }

  const multPct = Math.abs(pct(deltaMultiple));
  if (multPct > 40) {
    insights.push(`${multPct.toFixed(0)}% from multiple expansion — exit risk elevated`);
  }

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
    ranked_drivers: rankedDrivers,
    operational_pct: operationalPct,
    financial_engineering_pct: financialPct,
    primary_driver: primaryDriver,
    insights,
  };
}
