/**
 * Shared convergence core — the single projections → debt → returns solver.
 *
 * Projections and the debt schedule are mutually dependent (cash interest feeds
 * FCF; FCF feeds the sweep that changes balances and therefore interest). This
 * module owns the one iteration that resolves that feedback. `fullRecalc`
 * (index.ts), the scenario runner (scenarios.ts) and the fragility runner
 * (fragility.ts) all call this, so the three can never silently diverge — a
 * change to the loop, the iteration cap, or the tolerance is made in exactly one
 * place. The `engine-parity` test pins them together.
 */

import type { ModelState, AnnualProjectionYear } from '../dealEngineTypes';
import { buildProjections, updateProjectionsWithDebt } from './projections';
import { buildDebtSchedule } from './debtSchedule';
import { calculateReturns } from './returns';

// PIK interest compounds onto principal each period, so the interest/tax feedback
// loop can take more cycles to stabilise than a plain cash-pay deal. One cap, used
// by every caller.
export const MAX_CONVERGENCE_ITER = 10;

// Convergence tolerance scales with deal size: a flat £0.01m guard is ~1bp on a
// £1bn deal (useless) and overly strict on a £10m deal. Floor at £0.01m.
export function convergenceToleranceFor(state: ModelState): number {
  return Math.max(0.01, state.revenue.base_revenue * 0.0001);
}

type DebtSchedule = ReturnType<typeof buildDebtSchedule>;
type Returns = ReturnType<typeof calculateReturns>;

export interface ConvergenceResult {
  projections: AnnualProjectionYear[];
  debtSchedule: DebtSchedule;
  iterations: number;
  convergenceDelta: number;
  debtConvergenceFailed: boolean;
}

/**
 * Run the iterative projections → debt schedule → updated projections loop until
 * cash interest stabilises (PIK/sweep feedback), then report convergence
 * diagnostics. `state` must already be prepared by the caller (deriveEntryFields,
 * ensureListLengths, and any add-on injection). This function does not mutate the
 * tranche list — add-on bookkeeping stays with the caller.
 */
export function runConvergenceLoop(state: ModelState): ConvergenceResult {
  const hp = state.exit.holding_period;
  const tolerance = convergenceToleranceFor(state);

  let proj = buildProjections(state);
  let ds = buildDebtSchedule(state, proj);
  let updatedProj: AnnualProjectionYear[] = proj;
  let prevTotalInterest = 0;
  let iterations = 0;
  let convergenceDelta = 0;

  for (let iter = 0; iter < MAX_CONVERGENCE_ITER; iter++) {
    iterations = iter + 1;
    ds = buildDebtSchedule(state, updatedProj);

    const pikByYear: number[] = [];
    for (let yrIdx = 0; yrIdx < hp; yrIdx++) {
      let pik = 0;
      if (ds.tranche_schedules.length) {
        for (let t = 0; t < ds.tranche_schedules.length; t++) {
          pik += ds.tranche_schedules[t][yrIdx].pik_accrual;
        }
      }
      pikByYear.push(pik);
    }

    updatedProj = updateProjectionsWithDebt(
      proj, state, ds.total_cash_interest_by_year, pikByYear, ds.total_repayment_by_year,
    );

    // Check convergence on total cash interest (the quantity the feedback loop moves).
    const currentTotalInterest = ds.total_cash_interest_by_year.reduce((a, b) => a + b, 0);
    convergenceDelta = Math.abs(currentTotalInterest - prevTotalInterest);
    // Allow iteration 0 to exit early (e.g. an all-equity / already-converged deal).
    if (convergenceDelta < tolerance) break;
    prevTotalInterest = currentTotalInterest;

    // Feed corrected projections back for the next iteration.
    proj = updatedProj;
  }

  // If we exhausted all iterations and the delta still exceeds tolerance, the
  // balance sheet is unbalanced — flag it so the UI and Excel can warn the user.
  const debtConvergenceFailed = convergenceDelta > tolerance;

  return { projections: updatedProj, debtSchedule: ds, iterations, convergenceDelta, debtConvergenceFailed };
}

/**
 * Run the convergence loop and compute returns, stamping the convergence
 * diagnostics onto the returns object. The scenario and fragility runners use
 * this directly; `fullRecalc` calls `runConvergenceLoop` and computes returns
 * itself because it interleaves add-on bookkeeping with downstream analytics.
 */
export function runConvergedModel(
  state: ModelState,
): ConvergenceResult & { returns: Returns } {
  const loop = runConvergenceLoop(state);
  const ret = calculateReturns(state, loop.projections, loop.debtSchedule);
  ret.convergence_iterations = loop.iterations;
  ret.convergence_delta = loop.convergenceDelta;
  ret.debt_convergence_failed = loop.debtConvergenceFailed;
  return { ...loop, returns: ret };
}
