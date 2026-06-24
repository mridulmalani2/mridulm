/** Scenario engine and sensitivity table generator. */

import type { ModelState, ScenarioSet, SensitivityTable, ValueDriverDecomposition } from '../dealEngineTypes';
import { deriveEntryFields, ensureListLengths } from './modelState';
import { decomposeValueDrivers } from './returns';
import { runConvergedModel } from './converge';
import { injectAddOns, stripSyntheticAddOnTranches } from './addOns';

interface ScenarioMetrics {
  irr: number | null;
  moic: number;
  exitEquity: number;
  dscr_by_year: number[];
  leverage_by_year: number[];
  covenant_breach_year: number | null;
  survives_hold: boolean;
  value_drivers: ValueDriverDecomposition;
}

/** Run the full model for a scenario and extract returns, per-year credit metrics,
 *  covenant-breach timing, survival, and the value-driver bridge. */
function scenarioMetrics(state: ModelState): ScenarioMetrics {
  const { returns: ret, projections, debtSchedule: ds } = runFullModel(state);
  const cov = state.credit_covenants;
  const levCov = (i: number) => cov?.leverage_covenant_by_year?.[i] ?? cov?.leverage_covenant ?? 6.0;
  const dscrCov = (i: number) => cov?.dscr_covenant_by_year?.[i] ?? cov?.dscr_covenant ?? 1.25;
  const dscr = ds.dscr_by_year;
  const lev = ds.leverage_ratio_by_year;
  let breach: number | null = null;
  for (let i = 0; i < lev.length; i++) {
    if (lev[i] > levCov(i) || dscr[i] < dscrCov(i)) { breach = i + 1; break; }
  }
  return {
    irr: ret.irr,
    moic: ret.moic,
    exitEquity: ret.exit_equity,
    dscr_by_year: dscr,
    leverage_by_year: lev,
    covenant_breach_year: breach,
    survives_hold: ds.ecf_by_year.every((e) => e >= 0),
    value_drivers: decomposeValueDrivers(state, projections, ds, ret),
  };
}

function runFullModel(state: ModelState) {
  stripSyntheticAddOnTranches(state);
  deriveEntryFields(state);
  ensureListLengths(state);
  // Inject add-on revenue + synthetic acquisition-debt tranches so scenario and
  // sensitivity outputs use the same revenue/leverage base as the base case.
  const { originalTranches } = injectAddOns(state);

  // Single shared solver (lib/engine/converge.ts) — identical loop, cap and
  // tolerance to fullRecalc, so scenarios can never diverge from the base case.
  const { returns, projections, debtSchedule } = runConvergedModel(state);

  // Restore real entry tranches so callers / subsequent clones never see synthetics.
  state.debt_tranches = originalTranches;
  return { returns, projections, debtSchedule };
}

function quickIrrMoic(state: ModelState): { irr: number | null; moic: number; exitEquity: number } {
  const { returns: ret } = runFullModel(state);
  return { irr: ret.irr, moic: ret.moic, exitEquity: ret.exit_equity };
}

function deepClone(state: ModelState): ModelState {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Resize the capital structure to a target total debt by adjusting ONLY the most
 * junior tranche. Senior commitments are fixed at close, so all stress/sizing
 * deltas flow to the junior tranche — scaling every tranche pro-rata produces
 * capital structures no lender would agree to (the BUG-08 class of error).
 * Shared by the bear scenario and the leverage sensitivity table.
 */
// Juniority rank: higher = more junior. Used to pick which tranche absorbs a debt-sizing
// delta. Revolvers are senior commitments fixed at close and are never the flex tranche.
function juniorityRank(trancheType: string): number {
  if (trancheType === 'pik_note') return 3;
  if (trancheType === 'mezzanine') return 2;
  if (trancheType === 'revolver') return -1; // never flexed
  return 1; // senior / unitranche
}

export function resizeJuniorToDebt(state: ModelState, targetDebt: number): void {
  if (!state.debt_tranches.length) return;
  const total = state.debt_tranches.reduce((s, t) => s + t.principal, 0);
  const delta = targetDebt - total;
  // Pick the MOST JUNIOR tranche by seniority, not by array position. The last array
  // element is not necessarily the most junior, so flexing it could shrink SENIOR debt —
  // a capital structure no lender would agree to (the BUG-08 class of error). Choose the
  // highest juniority rank; ties break to the later array position; revolvers are excluded.
  let juniorIdx = -1;
  let bestRank = -Infinity;
  for (let i = 0; i < state.debt_tranches.length; i++) {
    const rank = juniorityRank(state.debt_tranches[i].tranche_type);
    if (rank < 0) continue; // revolver — never the flex tranche
    if (rank >= bestRank) { bestRank = rank; juniorIdx = i; }
  }
  if (juniorIdx < 0) juniorIdx = state.debt_tranches.length - 1; // all-revolver fallback
  state.debt_tranches[juniorIdx].principal = Math.max(0, state.debt_tranches[juniorIdx].principal + delta);
  state.debt_tranches[juniorIdx].amortization_schedule = [];
}

// ── Scenario Generation ─────────────────────────────────────────────────

export function generateScenarios(state: ModelState): ScenarioSet[] {
  // Strip synthetic add-on tranches before any cloning/resizing so bear debt-sizing
  // targets a real junior tranche; runFullModel re-injects add-ons per scenario.
  stripSyntheticAddOnTranches(state);
  const hp = state.exit.holding_period;
  const baseGrowth = [...state.revenue.growth_rates];
  const baseExitMult = state.exit.exit_ebitda_multiple;
  const baseMarginExpansion = state.margins.target_ebitda_margin - state.margins.base_ebitda_margin;
  const scenarios: ScenarioSet[] = [];

  // Base
  const baseM = scenarioMetrics(state);
  scenarios.push({
    name: 'base',
    growth_rates: baseGrowth,
    margin_by_year: [...state.margins.margin_by_year],
    exit_multiple: baseExitMult,
    leverage_ratio: state.entry.leverage_ratio,
    irr: baseM.irr,
    moic: baseM.moic,
    exit_equity: baseM.exitEquity,
    description: 'Base case using current assumptions.',
    dscr_by_year: baseM.dscr_by_year,
    leverage_by_year: baseM.leverage_by_year,
    covenant_breach_year: baseM.covenant_breach_year,
    survives_hold: baseM.survives_hold,
    value_drivers: baseM.value_drivers,
  });

  // Downside (internal id 'bear')
  const bear = deepClone(state);
  bear.revenue.growth_rates = baseGrowth.map((g) => Math.max(g - 0.02, -0.1));
  bear.exit.exit_ebitda_multiple = Math.max(baseExitMult - 1.5, 1.0);
  bear.margins.target_ebitda_margin = state.margins.base_ebitda_margin + baseMarginExpansion * 0.5;
  bear.margins.margin_by_year = [];
  const bearLeverage = Math.max(state.entry.leverage_ratio - 0.5, 0);
  // BUG-09 fix: size bear debt against forward Year-1 EBITDA (bear scenario's own revenue
  // and margin), not base EBITDA. Base EBITDA overstates debt capacity when bear
  // assumptions imply lower revenue or margins.
  const bearY1Revenue = state.revenue.base_revenue * (1 + bear.revenue.growth_rates[0]);
  const bearY1Margin = state.margins.base_ebitda_margin
    + (1 / hp) * (bear.margins.target_ebitda_margin - state.margins.base_ebitda_margin);
  const bearFwdEbitda = bearY1Revenue * bearY1Margin;
  const bearDebt = bearLeverage * bearFwdEbitda;
  // BUG-08 fix: preserve senior tranches; only the most junior tranche absorbs the
  // debt-sizing delta (shared helper — same logic as the leverage sensitivity table).
  resizeJuniorToDebt(bear, bearDebt);
  ensureListLengths(bear);
  deriveEntryFields(bear);
  const bearM = scenarioMetrics(bear);
  scenarios.push({
    name: 'bear',
    growth_rates: bear.revenue.growth_rates,
    margin_by_year: bear.margins.margin_by_year,
    exit_multiple: bear.exit.exit_ebitda_multiple,
    leverage_ratio: bear.entry.leverage_ratio,
    irr: bearM.irr,
    moic: bearM.moic,
    exit_equity: bearM.exitEquity,
    description: 'Downside: −200bps growth, −1.5x exit multiple, 50% margin expansion. Debt sized off downside forward EBITDA.',
    dscr_by_year: bearM.dscr_by_year,
    leverage_by_year: bearM.leverage_by_year,
    covenant_breach_year: bearM.covenant_breach_year,
    survives_hold: bearM.survives_hold,
    value_drivers: bearM.value_drivers,
  });

  // Bull
  const bull = deepClone(state);
  bull.revenue.growth_rates = baseGrowth.map((g) => g + 0.02);
  bull.exit.exit_ebitda_multiple = baseExitMult + 1.0;
  bull.margins.target_ebitda_margin = state.margins.base_ebitda_margin + baseMarginExpansion * 1.3;
  bull.margins.margin_by_year = [];
  ensureListLengths(bull);
  deriveEntryFields(bull);
  const bullM = scenarioMetrics(bull);
  scenarios.push({
    name: 'bull',
    growth_rates: bull.revenue.growth_rates,
    margin_by_year: bull.margins.margin_by_year,
    exit_multiple: bull.exit.exit_ebitda_multiple,
    leverage_ratio: bull.entry.leverage_ratio,
    irr: bullM.irr,
    moic: bullM.moic,
    exit_equity: bullM.exitEquity,
    description: 'Bull: +200bps growth, +1.0x exit multiple, 130% margin expansion.',
    dscr_by_year: bullM.dscr_by_year,
    leverage_by_year: bullM.leverage_by_year,
    covenant_breach_year: bullM.covenant_breach_year,
    survives_hold: bullM.survives_hold,
    value_drivers: bullM.value_drivers,
  });

  // Severe Downside (internal id 'stress')
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
  stress.exit.exit_ebitda_multiple = Math.max(baseExitMult - 1.0, 1.0);
  stress.margins.target_ebitda_margin = state.margins.base_ebitda_margin;
  stress.margins.margin_by_year = [];
  ensureListLengths(stress);
  deriveEntryFields(stress);
  const stressM = scenarioMetrics(stress);
  scenarios.push({
    name: 'stress',
    growth_rates: stress.revenue.growth_rates,
    margin_by_year: stress.margins.margin_by_year,
    exit_multiple: stress.exit.exit_ebitda_multiple,
    leverage_ratio: stress.entry.leverage_ratio,
    irr: stressM.irr,
    moic: stressM.moic,
    exit_equity: stressM.exitEquity,
    description: 'Severe downside: 0% growth yr1-2, halved thereafter, −1.0x exit multiple, flat margin.',
    dscr_by_year: stressM.dscr_by_year,
    leverage_by_year: stressM.leverage_by_year,
    covenant_breach_year: stressM.covenant_breach_year,
    survives_hold: stressM.survives_hold,
    value_drivers: stressM.value_drivers,
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
  // Strip synthetic add-on tranches so the leverage-sensitivity resize (case 4)
  // and clones operate on the real entry capital structure.
  stripSyntheticAddOnTranches(state);
  // Use CAGR (geometric mean) as the sensitivity center — arithmetic mean overstates
  // true compound growth when rates vary across the hold period.
  const baseGrowthAvg = (() => {
    const rates = state.revenue.growth_rates;
    if (!rates.length) return 0.05;
    const cagr = Math.pow(
      rates.reduce((prod, g) => prod * (1 + g), 1),
      1 / rates.length,
    ) - 1;
    return cagr;
  })();
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
          // Junior-only resize (mirrors the BUG-08 bear-scenario fix): senior commitments
          // are fixed at close, so the most-junior tranche absorbs the full leverage delta.
          const ebitdaVal = s.revenue.base_revenue * s.margins.base_ebitda_margin;
          resizeJuniorToDebt(s, leverage * ebitdaVal);
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
