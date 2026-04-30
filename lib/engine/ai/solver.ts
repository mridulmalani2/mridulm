/** Local bisection solver for ceteris paribus goal-seeking. No API calls. */

import type { ModelState } from '../../dealEngineTypes';
import { fullRecalc } from '../index';

// ── Output key registry ─────────────────────────────────────────────────

export type OutputKey =
  | 'irr'
  | 'moic'
  | 'dpi'
  | 'gross_irr'
  | 'leverage_y1'
  | 'leverage_y2'
  | 'leverage_y3'
  | 'icr_y1'
  | 'exit_ev';

export const OUTPUT_KEY_META: Record<OutputKey, { label: string; format: (v: number) => string }> = {
  irr:          { label: 'IRR',              format: (v) => `${(v * 100).toFixed(1)}%` },
  moic:         { label: 'MOIC',             format: (v) => `${v.toFixed(2)}x` },
  dpi:          { label: 'DPI',              format: (v) => `${v.toFixed(2)}x` },
  gross_irr:    { label: 'Gross IRR',        format: (v) => `${(v * 100).toFixed(1)}%` },
  leverage_y1:  { label: 'Year 1 Leverage',  format: (v) => `${v.toFixed(1)}x` },
  leverage_y2:  { label: 'Year 2 Leverage',  format: (v) => `${v.toFixed(1)}x` },
  leverage_y3:  { label: 'Year 3 Leverage',  format: (v) => `${v.toFixed(1)}x` },
  icr_y1:       { label: 'Year 1 ICR',       format: (v) => `${v.toFixed(1)}x` },
  exit_ev:      { label: 'Exit EV',          format: (v) => `${v.toFixed(0)}M` },
};

function getOutput(state: ModelState, key: OutputKey): number | null {
  switch (key) {
    case 'irr':         return state.returns.irr ?? null;
    case 'moic':        return state.returns.moic;
    case 'dpi':         return state.returns.dpi;
    case 'gross_irr':   return state.returns.irr_gross ?? null;
    case 'leverage_y1': return state.debt_schedule.leverage_ratio_by_year[0] ?? null;
    case 'leverage_y2': return state.debt_schedule.leverage_ratio_by_year[1] ?? null;
    case 'leverage_y3': return state.debt_schedule.leverage_ratio_by_year[2] ?? null;
    case 'icr_y1':      return state.debt_schedule.interest_coverage_by_year[0] ?? null;
    case 'exit_ev':     return state.returns.exit_ev;
    default:            return null;
  }
}

// ── Parameter bounds ────────────────────────────────────────────────────

const EXACT_BOUNDS: Record<string, [number, number]> = {
  'exit.exit_ebitda_multiple':    [2,    25],
  'exit.exit_revenue_multiple':   [0.3,  10],
  'exit.holding_period':          [1,    10],
  'entry.leverage_ratio':         [0.5,  8],
  'margins.base_ebitda_margin':   [0.02, 0.75],
  'margins.target_ebitda_margin': [0.02, 0.80],
  'margins.capex_pct_revenue':    [0.005,0.40],
  'margins.nwc_pct_revenue':      [-0.20,0.40],
  'margins.da_pct_revenue':       [0.005,0.30],
  'tax.tax_rate':                 [0.01, 0.50],
};

function getBounds(path: string): [number, number] {
  if (EXACT_BOUNDS[path]) return EXACT_BOUNDS[path];
  if (/^revenue\.growth_rates\.\d+$/.test(path))  return [-0.30, 0.60];
  if (/^revenue\.organic_growth\.\d+$/.test(path)) return [-0.30, 0.60];
  if (/^margins\.margin_by_year\.\d+$/.test(path)) return [0.02,  0.80];
  if (/^margins\.growth_capex\.\d+$/.test(path))   return [0,     500];
  return [0, 100];
}

// ── Nested object helpers ───────────────────────────────────────────────

function getNestedNum(obj: Record<string, unknown>, path: string): number {
  const keys = path.split('.');
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur == null) return 0;
    cur = /^\d+$/.test(k)
      ? (cur as unknown[])[parseInt(k)]
      : (cur as Record<string, unknown>)[k];
  }
  return typeof cur === 'number' ? cur : 0;
}

function setNestedNum(obj: Record<string, unknown>, path: string, value: number): void {
  const keys = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cur = /^\d+$/.test(k)
      ? (cur as unknown as unknown[])[parseInt(k)] as Record<string, unknown>
      : cur[k] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (/^\d+$/.test(last)) {
    (cur as unknown as unknown[])[parseInt(last)] = value;
  } else {
    cur[last] = value;
  }
}

// ── Solver ──────────────────────────────────────────────────────────────

export interface SolverResult {
  requiredValue: number;
  achievedOutput: number;
  feasible: boolean;
  bestAchievableOutput?: number;
  bestAchievableValue?: number;
}

export function getCurrentValue(state: ModelState, path: string): number {
  return getNestedNum(state as unknown as Record<string, unknown>, path);
}

export function solveForTarget(
  baseState: ModelState,
  outputKey: OutputKey,
  paramPath: string,
  targetValue: number,
  customBounds?: [number, number],
): SolverResult {
  const [lo, hi] = customBounds ?? getBounds(paramPath);
  const MAX_ITER = 65;
  const TOL = 0.00005;

  const evalAt = (val: number): number | null => {
    const clone = JSON.parse(JSON.stringify(baseState)) as Record<string, unknown>;
    setNestedNum(clone, paramPath, val);
    const recalced = fullRecalc(clone as unknown as ModelState);
    return getOutput(recalced, outputKey);
  };

  const loOut = evalAt(lo);
  const hiOut = evalAt(hi);
  if (loOut == null || hiOut == null) return { requiredValue: 0, achievedOutput: 0, feasible: false };

  const increasing = hiOut > loOut;
  const minOut = increasing ? loOut : hiOut;
  const maxOut = increasing ? hiOut : loOut;

  if (targetValue < minOut) {
    return {
      requiredValue: increasing ? lo : hi,
      achievedOutput: minOut,
      feasible: false,
      bestAchievableOutput: minOut,
      bestAchievableValue: increasing ? lo : hi,
    };
  }
  if (targetValue > maxOut) {
    return {
      requiredValue: increasing ? hi : lo,
      achievedOutput: maxOut,
      feasible: false,
      bestAchievableOutput: maxOut,
      bestAchievableValue: increasing ? hi : lo,
    };
  }

  let a = lo;
  let b = hi;

  for (let i = 0; i < MAX_ITER; i++) {
    const mid = (a + b) / 2;
    const midOut = evalAt(mid);
    if (midOut == null) break;

    if (Math.abs(midOut - targetValue) < TOL) {
      return { requiredValue: mid, achievedOutput: midOut, feasible: true };
    }

    if (increasing ? midOut < targetValue : midOut > targetValue) {
      a = mid;
    } else {
      b = mid;
    }

    if (b - a < TOL * 0.1) {
      const final = (a + b) / 2;
      return { requiredValue: final, achievedOutput: evalAt(final) ?? targetValue, feasible: true };
    }
  }

  const final = (a + b) / 2;
  return { requiredValue: final, achievedOutput: evalAt(final) ?? targetValue, feasible: true };
}
