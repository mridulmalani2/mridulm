/**
 * engine2/valuation.ts — SPEC §25 [v2.0.0] flow-to-equity valuation primitives + the §24.3
 * forecast-line gates that need the whole assumptions object.
 *
 * Pure functions only. The facade orchestrates the two exit cases by calling the SAME §9/§10/
 * §12 functions on the SAME EngineCore (§25.3 — no second calculation path); this module
 * supplies the CAPM recursion, the Gordon terminal value and the bracketed root finder.
 *
 * No solver in the recursion: both leverage-timing conventions close in closed form (§25.5).
 *
 * No imports from lib/engine (boundary test).
 */

import { irr } from './kernel/irr';
import type { DealAssumptions, ValuationAssumption } from './types';

/** §24.3 R7 (+ the lines/axis coupling R8 lives in scenarios.ts, where the axes are). */
export function validateForecastLines(assumptions: Pick<DealAssumptions, 'operations' | 'exit' | 'valuation'>): void {
  const lines = assumptions.operations.lines ?? null;
  if (lines === null) return;
  const needs = assumptions.exit.basis === 'ntm' || (assumptions.valuation ?? null) !== null;
  const g = lines.year_n_plus_1_growth;
  if (needs && g === null) {
    throw new RangeError(
      'forecast: enter the growth rate from the final hold year into year N+1 — the NTM exit and the flow-to-equity terminal value both need year N+1 (§24.3 R7)',
    );
  }
  if (g !== null && (!Number.isFinite(g) || g <= -1)) {
    throw new RangeError('forecast: year N+1 growth must be finite and > −100% (§24.3 R7)');
  }
}

/** §25.1 structural gates. */
export function validateValuation(v: ValuationAssumption): void {
  const fields: [string, number][] = [
    ['risk-free rate', v.risk_free],
    ['market risk premium', v.mrp],
    ['asset beta', v.asset_beta],
    ['debt beta', v.debt_beta],
    ['long-run growth', v.long_run_growth],
  ];
  for (const [name, x] of fields) {
    if (!Number.isFinite(x)) throw new RangeError(`valuation: ${name} must be a finite number (§25.1)`);
  }
  if (v.mrp < 0) throw new RangeError('valuation: market risk premium must be ≥ 0 (§25.1)');
  if (v.asset_beta < 0) throw new RangeError('valuation: asset beta must be ≥ 0 (§25.1)');
  if (v.debt_beta < 0) throw new RangeError('valuation: debt beta must be ≥ 0 (§25.1)');
  const t = v.terminal ?? null;
  if (t !== null) {
    if (!Number.isFinite(t.capex_pct_of_da) || t.capex_pct_of_da < 0) {
      throw new RangeError('valuation: terminal capex ÷ D&A must be a finite number ≥ 0 (§28.1)');
    }
    if (!Number.isFinite(t.delta_nwc_before_growth)) {
      throw new RangeError('valuation: the terminal increase in NWC must be a finite number (§28.1)');
    }
  }
}

/**
 * §28.2 [v2.6.0]: the year-N-terms lines the terminal cash flow is built on. With no terminal
 * statement they are year N's own (v2.0.0). With one, capex is `capex_pct_of_da × D&A_N` and
 * ΔNWC is the stated amount; EBITDA and D&A are never touched. The ONE place this is decided —
 * `terminalUfcf`, the steady-state WARN and the workbook all read the result.
 */
export function resolveTerminalYear(
  yearN: { ebitda: number; da: number; capex: number; delta_nwc: number },
  terminal: ValuationAssumption['terminal'],
): { ebitda: number; da: number; capex: number; delta_nwc: number; normalised: boolean } {
  const t = terminal ?? null;
  if (t === null) return { ...yearN, normalised: false };
  return { ebitda: yearN.ebitda, da: yearN.da, capex: t.capex_pct_of_da * yearN.da, delta_nwc: t.delta_nwc_before_growth, normalised: true };
}

/**
 * §24.5 / §28.4: what in the terminal year cannot last for ever — capex below D&A (the asset
 * base is run down in perpetuity) and a working-capital INFLOW (released for ever). Empty when
 * the terminal year is a steady state. Tolerance: a relative 1e-9, so capex ≡ D&A never trips.
 */
export function terminalSteadyStateIssues(t: { da: number; capex: number; delta_nwc: number }): string[] {
  const issues: string[] = [];
  const eps = 1e-9 * Math.max(1, Math.abs(t.da));
  if (t.capex < t.da - eps) issues.push(`capex (${t.capex.toFixed(1)}) is below D&A (${t.da.toFixed(1)}) for ever`);
  if (t.delta_nwc < -eps) issues.push(`working capital releases cash (${t.delta_nwc.toFixed(1)}) for ever`);
  return issues;
}

/** §25.2 rU = rf + βA × MRP. */
export function unleveredCost(v: Pick<ValuationAssumption, 'risk_free' | 'asset_beta' | 'mrp'>): number {
  return v.risk_free + v.asset_beta * v.mrp;
}

/**
 * §25.2 terminal unlevered FCF: the year-N-terms lines (as resolved by `resolveTerminalYear`,
 * §28.2) grown by g_{N+1}, EBIT taxed at the statutory rate (a perpetuity carries no NOL /
 * §163(j) state). EBITDA is pre-monitoring-fee.
 */
export function terminalUfcf(
  yearN: { ebitda: number; da: number; capex: number; delta_nwc: number },
  taxRate: number,
  gN1: number,
): number {
  const ebit = yearN.ebitda - yearN.da;
  return (1 + gN1) * (ebit * (1 - taxRate) + yearN.da - yearN.capex - yearN.delta_nwc);
}

/** §25.2 Gordon EV; null-with-reason when rU ≤ g. */
export function gordonEv(ufcf: number, rU: number, g: number): { ev: number | null; reason: string | null } {
  if (!(rU > g)) {
    return { ev: null, reason: `unlevered cost of capital ${(rU * 100).toFixed(2)}% is not above long-run growth ${(g * 100).toFixed(2)}% — a perpetuity has no finite value` };
  }
  return { ev: ufcf / (rU - g), reason: null };
}

/** §25.5 βE of a claim worth E against operating assets worth D + E − C (cash β = 0). */
export function equityBeta(v: ValuationAssumption, e: number, d: number, c: number): number {
  return v.asset_beta + (v.asset_beta * (d - c) - v.debt_beta * d) / e;
}

export interface RecursionInputs {
  /** ECF_1..ECF_N — total equity distributions paid in each hold year. */
  ecf: number[];
  /** E_N — total exit equity (exit_equity_pre_mip_total). */
  exit_equity: number;
  /** D_0..D_N closing debt at par + accrued PIK. */
  debt: number[];
  /** C_0..C_N closing cash. */
  cash: number[];
  invested: number;
  equity_irr: number | null;
}

export interface RecursionResult {
  equity_value: number[] | null;
  equity_weight: number[] | null;
  beta_equity: number[] | null;
  cost_of_equity: (number | null)[] | null;
  equity_value_at_entry: number | null;
  npv: number | null;
  value_per_dollar: number | null;
  required_return: number | null;
  excess_return: number | null;
  recursion_null_reason: string | null;
}

const NULL_RECURSION = (reason: string): RecursionResult => ({
  equity_value: null,
  equity_weight: null,
  beta_equity: null,
  cost_of_equity: null,
  equity_value_at_entry: null,
  npv: null,
  value_per_dollar: null,
  required_return: null,
  excess_return: null,
  recursion_null_reason: reason,
});

/** §25.5 the backward recursion (both timing conventions, closed form) + §25.6 reconciliation. */
export function fteRecursion(v: ValuationAssumption, x: RecursionInputs): RecursionResult {
  const N = x.ecf.length;
  if (x.debt.length !== N + 1 || x.cash.length !== N + 1) {
    throw new RangeError('valuation: debt and cash paths must have hold_years + 1 entries');
  }
  const E: number[] = new Array(N + 1);
  E[N] = x.exit_equity;
  if (!(E[N] > 0)) return NULL_RECURSION(`exit equity is not positive (${E[N].toFixed(2)}) — the equity beta of a non-positive claim is undefined`);
  const rE: (number | null)[] = new Array(N + 1).fill(null);
  for (let t = N; t >= 1; t--) {
    if (v.leverage_timing === 'end_of_year') {
      const r = v.risk_free + equityBeta(v, E[t], x.debt[t], x.cash[t]) * v.mrp;
      rE[t] = r;
      E[t - 1] = (E[t] + x.ecf[t - 1]) / (1 + r);
    } else {
      // E_{t−1}(1 + rf + MRP·βA) + MRP·(βA(D−C) − βD·D) = E_t + ECF_t, all at t−1 leverage.
      const d = x.debt[t - 1];
      const c = x.cash[t - 1];
      E[t - 1] =
        (E[t] + x.ecf[t - 1] - v.mrp * (v.asset_beta * (d - c) - v.debt_beta * d)) /
        (1 + v.risk_free + v.asset_beta * v.mrp);
    }
    if (!(E[t - 1] > 0)) {
      return NULL_RECURSION(`equity value at the end of year ${t - 1} is not positive — the flow-to-equity recursion is undefined there`);
    }
    if (v.leverage_timing === 'start_of_year') {
      rE[t] = v.risk_free + equityBeta(v, E[t - 1], x.debt[t - 1], x.cash[t - 1]) * v.mrp;
    }
  }
  const beta = E.map((e, t) => equityBeta(v, e, x.debt[t], x.cash[t]));
  // index 0 under end_of_year: the year-0 leverage's rate (display only, as the reference shows it)
  if (v.leverage_timing === 'end_of_year') rE[0] = v.risk_free + beta[0] * v.mrp;
  const weight = E.map((e, t) => e / (x.debt[t] + e));
  const required = irr([-E[0], ...x.ecf.slice(0, -1), x.ecf[N - 1] + E[N]]);
  return {
    equity_value: E,
    equity_weight: weight,
    beta_equity: beta,
    cost_of_equity: rE,
    equity_value_at_entry: E[0],
    npv: E[0] - x.invested,
    value_per_dollar: E[0] / x.invested,
    required_return: required,
    excess_return: x.equity_irr !== null && required !== null ? x.equity_irr - required : null,
    recursion_null_reason: null,
  };
}

/**
 * §25.7 bracketed bisection: find x with f(x) = 0. The bracket is found by monotone
 * expansion from `base` in steps of `step`, doubling, inside [lo, hi] (the admissible
 * domain). Returns null-with-reason when no sign change exists in the domain or f is
 * undefined (null) at a probe.
 */
export function solveRoot(
  f: (x: number) => number | null,
  base: number,
  step: number,
  lo: number,
  hi: number,
): { value: number | null; reason: string | null } {
  const f0 = f(base);
  if (f0 === null) return { value: null, reason: 'the valuation is undefined at the base case' };
  if (f0 === 0) return { value: base, reason: null };
  let a = base;
  let fa = f0;
  let b: number | null = null;
  let fb: number | null = null;
  for (const dir of [1, -1]) {
    let s = step;
    let prev = base;
    let fprev = f0;
    for (let k = 0; k < 60; k++) {
      const x = Math.min(hi, Math.max(lo, base + dir * s));
      const fx = f(x);
      if (fx !== null && Math.sign(fx) !== Math.sign(fprev)) {
        a = prev; fa = fprev; b = x; fb = fx;
        break;
      }
      if (fx !== null) { prev = x; fprev = fx; }
      if (x === lo || x === hi) break;
      s *= 2;
    }
    if (b !== null) break;
  }
  if (b === null || fb === null) {
    return { value: null, reason: 'no value in the admissible range brings the NPV to zero' };
  }
  let hiX: number = b;
  for (let k = 0; k < 200; k++) {
    const m: number = (a + hiX) / 2;
    const fm = f(m);
    if (fm === null) return { value: null, reason: 'the valuation becomes undefined inside the bracket' };
    if (fm === 0 || Math.abs(hiX - a) < 1e-12) return { value: m, reason: null };
    if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else { hiX = m; }
  }
  return { value: (a + hiX) / 2, reason: null };
}
