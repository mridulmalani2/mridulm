/** Full recalc pipeline orchestrator. */

import type { ModelState, AnnualProjectionYear } from '../dealEngineTypes';
import { deriveEntryFields, ensureListLengths } from './modelState';
import { buildProjections, updateProjectionsWithDebt } from './projections';
import { buildDebtSchedule } from './debtSchedule';
import { calculateReturns, decomposeValueDrivers } from './returns';
import { runRealityCheck } from './realityCheck';
import { computeSourcesAndUses } from './sourcesUses';
import { computeCreditAnalysis } from './creditAnalysis';
import { computeEBITDABridge } from './ebitdaBridge';
import { computeFragility } from './fragility';

const MAX_CONVERGENCE_ITER = 5;
const CONVERGENCE_TOLERANCE = 0.01; // £m

export function fullRecalc(state: ModelState): ModelState {
  // Ensure new fields exist (backwards compatibility for older saved models)
  if (!state.revenue_segments) state.revenue_segments = [];
  if (!state.add_on_acquisitions) state.add_on_acquisitions = [];
  if (state.exit.mid_year_convention === undefined) state.exit.mid_year_convention = false;
  if (!state.exit.interim_distributions) state.exit.interim_distributions = [];
  if (state.exit.exit_ev_override === undefined) state.exit.exit_ev_override = null;
  for (const t of state.debt_tranches) {
    if (!t.tranche_type) {
      t.tranche_type = 'senior';
    }
  }

  deriveEntryFields(state);
  ensureListLengths(state);

  // Sources & Uses (computed from entry assumptions)
  state.sources_and_uses = computeSourcesAndUses(state);

  // ── Iterative convergence loop: projections → debt → update ──
  const hp = state.exit.holding_period;
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

    // Check convergence
    const currentTotalInterest = ds.total_cash_interest_by_year.reduce((a, b) => a + b, 0);
    convergenceDelta = Math.abs(currentTotalInterest - prevTotalInterest);
    if (convergenceDelta < CONVERGENCE_TOLERANCE && iter > 0) break;
    prevTotalInterest = currentTotalInterest;

    // Feed corrected projections back for next iteration
    proj = updatedProj;
  }

  const ret = calculateReturns(state, updatedProj, ds);
  ret.convergence_iterations = iterations;
  ret.convergence_delta = convergenceDelta;

  const vd = decomposeValueDrivers(state, updatedProj, ds, ret);
  const rc = runRealityCheck(state, updatedProj, ds, ret);

  // Credit analysis (from projections + debt schedule)
  state.credit_analysis = computeCreditAnalysis(state, updatedProj, ds);

  // EBITDA bridge
  state.ebitda_bridge = computeEBITDABridge(state, updatedProj);

  // Fragility analysis (stress testing)
  state.fragility = computeFragility(state);

  state.projections = { years: updatedProj };
  state.debt_schedule = ds;
  state.returns = ret;
  state.value_drivers = vd;
  state.exit_reality_check = rc;

  // Update exit derived fields
  if (updatedProj.length) {
    const lastYr = updatedProj[updatedProj.length - 1];
    state.exit.exit_ebitda = lastYr.ebitda_adj;
    state.exit.exit_ev = ret.exit_ev;
    state.exit.exit_net_debt = ret.exit_net_debt;
    state.exit.exit_equity = ret.exit_equity;
    state.exit.mip_payout = ret.mip_payout;
  }

  return state;
}

export { deriveEntryFields, ensureListLengths, createDefaultModelState } from './modelState';
export { generateScenarios, generateSensitivityTable, generateAllSensitivityTables } from './scenarios';
