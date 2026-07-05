/** Full recalc pipeline orchestrator. */

import type { ModelState } from '../dealEngineTypes';
import { deriveEntryFields, ensureListLengths } from './modelState';
import { decomposeValueDrivers } from './returns';
import { runConvergedModel } from './converge';
import { runRealityCheck } from './realityCheck';
import { computeSourcesAndUses } from './sourcesUses';
import { computeCreditAnalysis } from './creditAnalysis';
import { computeEBITDABridge } from './ebitdaBridge';
import { computeBalanceSheet } from './balanceSheet';
import { computeFragility } from './fragility';
import { injectAddOns, stripSyntheticAddOnTranches } from './addOns';
import { computeFundReturns } from './fundReturns';

export function fullRecalc(state: ModelState): ModelState {
  // Ensure new fields exist (backwards compatibility for older saved models)
  if (!state.revenue_segments) state.revenue_segments = [];
  if (!state.add_on_acquisitions) state.add_on_acquisitions = [];
  if (state.exit.mid_year_convention === undefined) state.exit.mid_year_convention = false;
  if (!state.exit.interim_distributions) state.exit.interim_distributions = [];
  if (state.exit.exit_ev_override === undefined) state.exit.exit_ev_override = null;
  if (!state.credit_covenants) {
    // PHASE 0: 1.10 matches createDefaultModelState (rebuild/DIFF_LEDGER.md L-2/L-7) — 1.25 made the default deal self-breach.
    state.credit_covenants = { leverage_covenant: 6.0, dscr_covenant: 1.10, fccr_covenant: 1.15 };
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

  // Single shared solver — the same projections → debt → returns convergence the
  // scenario and fragility runners use (lib/engine/converge.ts). The state already
  // carries the injected synthetic add-on tranches, so the schedule, leverage,
  // coverage, interest and sweep all reflect the financing cost. `ret` arrives with
  // convergence diagnostics (iterations / delta / debt_convergence_failed) stamped.
  const { projections: updatedProj, debtSchedule: ds, returns: ret } = runConvergedModel(state);

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
  // Fund-level (LP-facing) overlay — only when fund_assumptions is configured (P4-2).
  state.fund_returns = computeFundReturns(state, ret);
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
// freeze-guard demo — this PR must FAIL the engine-freeze job
