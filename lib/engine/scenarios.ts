/** Scenario engine and sensitivity table generator. */

import type { ModelState, ScenarioSet, SensitivityTable } from '../dealEngineTypes';
import { deriveEntryFields, ensureListLengths } from './modelState';
import { buildProjections, updateProjectionsWithDebt } from './projections';
import { buildDebtSchedule } from './debtSchedule';
import { calculateReturns } from './returns';

function runFullModel(state: ModelState) {
  deriveEntryFields(state);
  ensureListLengths(state);
  const proj = buildProjections(state);
  const ds = buildDebtSchedule(state, proj);

  const pikByYear: number[] = [];
  for (let yrIdx = 0; yrIdx < state.exit.holding_period; yrIdx++) {
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
  return { returns: ret, projections: updatedProj, debtSchedule: ds };
}

function quickIrrMoic(state: ModelState): { irr: number | null; moic: number; exitEquity: number } {
  const { returns: ret } = runFullModel(state);
  return { irr: ret.irr, moic: ret.moic, exitEquity: ret.exit_equity };
}

function deepClone(state: ModelState): ModelState {
  return JSON.parse(JSON.stringify(state));
}

// ── Scenario Generation ─────────────────────────────────────────────────

export function generateScenarios(state: ModelState): ScenarioSet[] {
  const hp = state.exit.holding_period;
  const baseGrowth = [...state.revenue.growth_rates];
  const baseExitMult = state.exit.exit_ebitda_multiple;
  const baseEntryMult = state.entry.entry_ebitda_multiple;
  const baseMarginExpansion = state.margins.target_ebitda_margin - state.margins.base_ebitda_margin;
  const scenarios: ScenarioSet[] = [];

  // Base
  const { irr: irrBase, moic: moicBase, exitEquity: eqBase } = quickIrrMoic(state);
  scenarios.push({
    name: 'base',
    growth_rates: baseGrowth,
    margin_by_year: [...state.margins.margin_by_year],
    exit_multiple: baseExitMult,
    leverage_ratio: state.entry.leverage_ratio,
    irr: irrBase,
    moic: moicBase,
    exit_equity: eqBase,
    description: 'Base case using current assumptions.',
  });

  // Bear
  const bear = deepClone(state);
  bear.revenue.growth_rates = baseGrowth.map((g) => Math.max(g - 0.02, -0.1));
  bear.exit.exit_ebitda_multiple = Math.max(baseExitMult - 1.5, 1.0);
  bear.margins.target_ebitda_margin = state.margins.base_ebitda_margin + baseMarginExpansion * 0.5;
  bear.margins.margin_by_year = [];
  const bearLeverage = Math.max(state.entry.leverage_ratio - 0.5, 0);
  const ebitda = state.revenue.base_revenue * state.margins.base_ebitda_margin;
  const bearDebt = bearLeverage * ebitda;
  const oldTotal = bear.debt_tranches.reduce((s, t) => s + t.principal, 0);
  if (oldTotal > 0) {
    const scale = bearDebt / oldTotal;
    for (const t of bear.debt_tranches) {
      t.principal *= scale;
      t.amortization_schedule = [];
    }
  }
  ensureListLengths(bear);
  deriveEntryFields(bear);
  const { irr: irrBear, moic: moicBear, exitEquity: eqBear } = quickIrrMoic(bear);
  scenarios.push({
    name: 'bear',
    growth_rates: bear.revenue.growth_rates,
    margin_by_year: bear.margins.margin_by_year,
    exit_multiple: bear.exit.exit_ebitda_multiple,
    leverage_ratio: bear.entry.leverage_ratio,
    irr: irrBear,
    moic: moicBear,
    exit_equity: eqBear,
    description: 'Bear: -200bps growth, -1.5x exit multiple, 50% margin expansion.',
  });

  // Bull
  const bull = deepClone(state);
  bull.revenue.growth_rates = baseGrowth.map((g) => g + 0.02);
  bull.exit.exit_ebitda_multiple = baseExitMult + 1.0;
  bull.margins.target_ebitda_margin = state.margins.base_ebitda_margin + baseMarginExpansion * 1.3;
  bull.margins.margin_by_year = [];
  ensureListLengths(bull);
  deriveEntryFields(bull);
  const { irr: irrBull, moic: moicBull, exitEquity: eqBull } = quickIrrMoic(bull);
  scenarios.push({
    name: 'bull',
    growth_rates: bull.revenue.growth_rates,
    margin_by_year: bull.margins.margin_by_year,
    exit_multiple: bull.exit.exit_ebitda_multiple,
    leverage_ratio: bull.entry.leverage_ratio,
    irr: irrBull,
    moic: moicBull,
    exit_equity: eqBull,
    description: 'Bull: +200bps growth, +1.0x exit multiple, 130% margin expansion.',
  });

  // Stress
  const stress = deepClone(state);
  const stressGrowth: number[] = [];
  for (let t = 0; t < hp; t++) {
    if (t < 2) {
      stressGrowth.push(0);
    } else {
      stressGrowth.push(t < baseGrowth.length ? baseGrowth[t] * 0.5 : 0);
    }
  }
  stress.revenue.growth_rates = stressGrowth;
  stress.exit.exit_ebitda_multiple = Math.max(baseEntryMult - 1.0, 1.0);
  stress.margins.target_ebitda_margin = state.margins.base_ebitda_margin;
  stress.margins.margin_by_year = [];
  ensureListLengths(stress);
  deriveEntryFields(stress);
  const { irr: irrStress, moic: moicStress, exitEquity: eqStress } = quickIrrMoic(stress);
  scenarios.push({
    name: 'stress',
    growth_rates: stress.revenue.growth_rates,
    margin_by_year: stress.margins.margin_by_year,
    exit_multiple: stress.exit.exit_ebitda_multiple,
    leverage_ratio: stress.entry.leverage_ratio,
    irr: irrStress,
    moic: moicStress,
    exit_equity: eqStress,
    description: 'Stress: 0% growth yr1-2, halved thereafter, -1.0x exit multiple, flat margin.',
  });

  return scenarios;
}

// ── Sensitivity Tables ──────────────────────────────────────────────────

function buildTable(
  state: ModelState,
  tableId: number,
  rowVar: string,
  colVar: string,
  rowValues: number[],
  colValues: number[],
  applyFn: (s: ModelState, rv: number, cv: number) => void,
): SensitivityTable {
  const irrMatrix: (number | null)[][] = [];
  const moicMatrix: number[][] = [];

  for (const rv of rowValues) {
    const irrRow: (number | null)[] = [];
    const moicRow: number[] = [];
    for (const cv of colValues) {
      const s = deepClone(state);
      applyFn(s, rv, cv);
      s.margins.margin_by_year = [];
      ensureListLengths(s);
      deriveEntryFields(s);
      const { irr, moic } = quickIrrMoic(s);
      irrRow.push(irr);
      moicRow.push(moic);
    }
    irrMatrix.push(irrRow);
    moicMatrix.push(moicRow);
  }

  return {
    table_id: tableId,
    row_variable: rowVar,
    col_variable: colVar,
    row_values: rowValues,
    col_values: colValues,
    irr_matrix: irrMatrix,
    moic_matrix: moicMatrix,
  };
}

export function generateSensitivityTable(state: ModelState, tableId: number): SensitivityTable {
  const baseGrowthAvg = state.revenue.growth_rates.length
    ? state.revenue.growth_rates.reduce((a, b) => a + b, 0) / state.revenue.growth_rates.length
    : 0.05;
  const baseExitMult = state.exit.exit_ebitda_multiple;
  const baseEntryMult = state.entry.entry_ebitda_multiple;
  const baseExitMargin = state.margins.target_ebitda_margin;

  const growthRange = Array.from({ length: 9 }, (_, i) => baseGrowthAvg + (i - 4) * 0.01);
  const exitMultRange = Array.from({ length: 9 }, (_, i) => baseExitMult + (i - 4) * 0.5);
  const marginRange = Array.from({ length: 9 }, (_, i) => baseExitMargin + (i - 4) * 0.015);
  const entryMultRange = Array.from({ length: 9 }, (_, i) => baseEntryMult + (i - 4) * 0.5);
  const baseLev = state.entry.leverage_ratio;
  const leverageRange = Array.from({ length: 9 }, (_, i) => Math.max(0, baseLev + (i - 4) * 0.5));

  switch (tableId) {
    case 1:
      return buildTable(state, 1, 'revenue_growth', 'exit_multiple', growthRange, exitMultRange,
        (s, growth, exitMult) => {
          s.revenue.growth_rates = Array(s.exit.holding_period).fill(growth);
          s.exit.exit_ebitda_multiple = Math.max(exitMult, 1);
        });
    case 2:
      return buildTable(state, 2, 'revenue_growth', 'ebitda_margin', growthRange, marginRange,
        (s, growth, margin) => {
          s.revenue.growth_rates = Array(s.exit.holding_period).fill(growth);
          s.margins.target_ebitda_margin = Math.max(Math.min(margin, 0.95), 0.01);
        });
    case 3:
      return buildTable(state, 3, 'entry_multiple', 'exit_multiple', entryMultRange, exitMultRange,
        (s, entryMult, exitMult) => {
          s.entry.entry_ebitda_multiple = Math.max(entryMult, 1);
          s.entry.enterprise_value = 0;
          s.exit.exit_ebitda_multiple = Math.max(exitMult, 1);
        });
    case 4:
      return buildTable(state, 4, 'leverage', 'exit_multiple', leverageRange, exitMultRange,
        (s, leverage, exitMult) => {
          const ebitdaVal = s.revenue.base_revenue * s.margins.base_ebitda_margin;
          const newDebt = leverage * ebitdaVal;
          const total = s.debt_tranches.reduce((sum, tr) => sum + tr.principal, 0);
          if (total > 0 && s.debt_tranches.length) {
            const scale = newDebt / total;
            for (const tr of s.debt_tranches) {
              tr.principal *= scale;
              tr.amortization_schedule = [];
            }
          } else if (s.debt_tranches.length) {
            s.debt_tranches[0].principal = newDebt;
          }
          s.exit.exit_ebitda_multiple = Math.max(exitMult, 1);
        });
    default:
      return buildTable(state, tableId, 'revenue_growth', 'exit_multiple', growthRange, exitMultRange,
        (s, growth, exitMult) => {
          s.revenue.growth_rates = Array(s.exit.holding_period).fill(growth);
          s.exit.exit_ebitda_multiple = Math.max(exitMult, 1);
        });
  }
}

export function generateAllSensitivityTables(state: ModelState): SensitivityTable[] {
  return [1, 2, 3, 4].map((id) => generateSensitivityTable(state, id));
}
