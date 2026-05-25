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
import { computeBalanceSheet } from './balanceSheet';
import { computeFragility } from './fragility';
import { injectAddOns, stripSyntheticAddOnTranches } from './addOns';

// Increase iterations to give PIK-heavy structures enough room to converge.
// PIK interest compounds onto the principal each period, so the interest/tax
// feedback loop can take more cycles to stabilise than a plain cash-pay deal.
const MAX_CONVERGENCE_ITER = 10;

// Convergence tolerance scales with deal size: a flat £0.01m guard is ~1bp on a
// £1bn deal (useless) and overly strict on a £10m deal. Floor at £0.01m.
function convergenceToleranceFor(state: ModelState): number {
  return Math.max(0.01, state.revenue.base_revenue * 0.0001);
}

export function fullRecalc(state: ModelState): ModelState {
  // Ensure new fields exist (backwards compatibility for older saved models)
  if (!state.revenue_segments) state.revenue_segments = [];
  if (!state.add_on_acquisitions) state.add_on_acquisitions = [];
  if (state.exit.mid_year_convention === undefined) state.exit.mid_year_convention = false;
  if (!state.exit.interim_distributions) state.exit.interim_distributions = [];
  if (state.exit.exit_ev_override === undefined) state.exit.exit_ev_override = null;
  if (!state.credit_covenants) {
    state.credit_covenants = { leverage_covenant: 6.0, dscr_covenant: 1.25, fccr_covenant: 1.15 };
  }
  // Defensive: clear any synthetic add-on tranches left over from a prior pass so
  // entry leverage / equity (derived below) are computed on real entry debt only.
  stripSyntheticAddOnTranches(state);
  for (const t of state.debt_tranches) {
    if (!t.tranche_type) {
      t.tranche_type = 'senior';
    }
  }

  deriveEntryFields(state);
  ensureListLengths(state);

  // Sources & Uses (computed from entry assumptions)
  state.sources_and_uses = computeSourcesAndUses(state);

  // Add-on acquisitions: inject bolt-on revenue into acquisition_revenue AND
  // transiently append synthetic acquisition-debt tranches so the debt schedule,
  // leverage, coverage, interest and sweep all reflect the financing cost. The
  // original tranche list is restored after credit analysis (below) so synthetic
  // tranches never leak into the input panel or persisted state.
  const { impact: addOnImpact, originalTranches } = injectAddOns(state);

  // ── Iterative convergence loop: projections → debt → update ──
  const hp = state.exit.holding_period;
  const convergenceTolerance = convergenceToleranceFor(state);
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
    // Allow iteration 0 to exit early (e.g. an all-equity / already-converged deal).
    if (convergenceDelta < convergenceTolerance) break;
    prevTotalInterest = currentTotalInterest;

    // Feed corrected projections back for next iteration
    proj = updatedProj;
  }

  // Detect debt-model convergence failure: if we exhausted all iterations and the
  // delta still exceeds tolerance the balance sheet is unbalanced.  Flag it so
  // the UI and Excel report can warn the user rather than silently showing
  // incorrect numbers.
  const debtConvergenceFailed = convergenceDelta > convergenceTolerance;

  const ret = calculateReturns(state, updatedProj, ds);
  ret.convergence_iterations = iterations;
  ret.convergence_delta = convergenceDelta;
  ret.debt_convergence_failed = debtConvergenceFailed;

  const vd = decomposeValueDrivers(state, updatedProj, ds, ret);
  const rc = runRealityCheck(state, updatedProj, ds, ret);

  // Credit analysis (from projections + debt schedule)
  state.credit_analysis = computeCreditAnalysis(state, updatedProj, ds);

  // EBITDA bridge
  state.ebitda_bridge = computeEBITDABridge(state, updatedProj, addOnImpact);

  // Balance sheet (three-statement close) — ds carries add-on debt here, and
  // addOnImpact supplies the acquired-goodwill / fresh-equity offsets.
  state.balance_sheet = computeBalanceSheet(state, updatedProj, ds, ret, addOnImpact);

  // Restore the real entry tranche list now that all augmented-schedule consumers
  // (returns, value drivers, reality check, credit analysis) have run. Synthetic
  // add-on tranches live only inside the computed debt_schedule from here on.
  state.debt_tranches = originalTranches;

  // Fragility analysis (stress testing) — clones state and re-applies add-ons itself.
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
