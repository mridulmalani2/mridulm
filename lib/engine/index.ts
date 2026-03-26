/** Full recalc pipeline orchestrator. */

import type { ModelState } from '../dealEngineTypes';
import { deriveEntryFields, ensureListLengths } from './modelState';
import { buildProjections, updateProjectionsWithDebt } from './projections';
import { buildDebtSchedule } from './debtSchedule';
import { calculateReturns, decomposeValueDrivers } from './returns';
import { runRealityCheck } from './realityCheck';

export function fullRecalc(state: ModelState): ModelState {
  deriveEntryFields(state);
  ensureListLengths(state);

  const proj = buildProjections(state);
  const ds = buildDebtSchedule(state, proj);

  // Second pass with actual debt data
  const hp = state.exit.holding_period;
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

  const updatedProj = updateProjectionsWithDebt(
    proj, state, ds.total_cash_interest_by_year, pikByYear, ds.total_repayment_by_year,
  );

  const ret = calculateReturns(state, updatedProj, ds);
  const vd = decomposeValueDrivers(state, updatedProj, ds, ret);
  const rc = runRealityCheck(state, updatedProj, ds, ret);

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
