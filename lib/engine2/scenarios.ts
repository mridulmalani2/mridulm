/**
 * engine2/scenarios.ts — SPEC §13 scenarios & sensitivity (Phase C build order #9).
 *
 * A scenario = a field-level typed delta-set (`ScenarioDeltas`: post-close operating
 * fields + exit MULTIPLE only) merged onto base assumptions — arrays replace whole.
 * **Entry EV, debt quantum, tranche sizes and sponsor equity are FROZEN at base-case
 * close** (the rule that closes live bug L-1): the scenario run re-enters with
 * `driver: 'ev'` pinned to the BASE enterprise value, so even an NTM-basis entry cannot
 * silently re-price (a growth delta would otherwise move the NTM proxy). Every scenario
 * is a FULL engine re-run reporting the same credit dashboard as base (DR-5).
 *
 * Sensitivity grids are full re-runs too; ENTRY-side axes (entry_multiple, leverage) DO
 * re-price entry — they are entry variables; operating axes (exit_multiple, growth,
 * margin) run entry-frozen like scenarios. In a MIXED grid the cell's entry is derived
 * from base assumptions + the ENTRY-side axis values ALONE, then frozen — an operating
 * co-axis must never reach entry pricing (§13; under an NTM entry basis a growth delta
 * would otherwise move the §9 valuation proxy — C9 review F1, the L-1 pattern). Axis
 * semantics: growth is a per-year SHIFT vs the base path (delta in decimal points —
 * an absolute flat-growth axis would be inconsistent with a non-flat base path and
 * break §14.11 monotonicity across the base row; center = 0); margin sets
 * target_margin (absolute; center = base target); exit/entry multiples absolute;
 * leverage scales every term-tranche size proportionally so total debt = axis × FY
 * EBITDA (absolute; center = base total). Center cell ≡ base (§14.7, exact — it is
 * the base run's own numbers, and axis semantics make the neighbors consistent).
 *
 * No imports from lib/engine (boundary test).
 */

import { runModel, type Engine2ModelOutput } from './facade';
import { buildSourcesUses, deriveEntry, rescaleTermTranchesToLeverage, sizeStructure, stripPlugRejection } from './sourcesUses';
import type {
  DealAssumptions,
  DealFacts,
  ScenarioDeltas,
  ScenarioResult,
  SensitivityAxis,
  SensitivityGrid,
} from './types';
import { covenantBreachYear } from './credit';

/** §13 field-level merge: only named fields change; growth/growth_capex arrays replace whole. */
export function applyScenarioDeltas(base: DealAssumptions, deltas: ScenarioDeltas): DealAssumptions {
  return {
    ...base,
    operations: { ...base.operations, ...(deltas.operations ?? {}) },
    exit: deltas.exit_multiple !== undefined ? { ...base.exit, multiple: deltas.exit_multiple } : base.exit,
  };
}

/** Freeze entry at the BASE close (§13): re-enter with driver 'ev' pinned to base EV. */
function frozenEntry(base: DealAssumptions, baseEv: number): DealAssumptions['entry'] {
  return { ...base.entry, driver: 'ev', enterprise_value: baseEv, entry_multiple: null };
}

export function runScenario(
  facts: DealFacts,
  baseAssumptions: DealAssumptions,
  base: Engine2ModelOutput,
  name: string,
  deltas: ScenarioDeltas,
): ScenarioResult {
  const merged = applyScenarioDeltas(baseAssumptions, deltas);
  const scenarioAssumptions: DealAssumptions = {
    ...merged,
    entry: frozenEntry(merged, base.derived.enterprise_value),
  };
  const run = runModel(facts, scenarioAssumptions);

  const baseIrr = base.returns.sponsor_net.irr;
  const scenarioIrr = run.returns.sponsor_net.irr;
  return {
    name,
    deltas,
    returns: run.returns,
    credit: run.credit,
    waterfall: run.waterfall.map((w) => ({
      revolver_draw: w.revolver_draw,
      revolver_repayment: w.revolver_repayment,
      sweep_applied_total: w.sweep_applied_total,
      closing_cash: w.closing_cash,
      cash_floor_breach: w.cash_floor_breach,
      // §13 [v1.1.0]: a downside that traps the sponsor's distributions is precisely what
      // the credit dashboard exists to show. The request schedule and the trap are
      // structure/policy and are FROZEN across scenarios — only the BINDING moves.
      distribution_paid: w.distribution_paid,
      distribution_blocked: w.distribution_blocked,
    })),
    covenant_breach_year: covenantBreachYear(scenarioAssumptions.covenants, run.credit),
    irr_delta_vs_base: baseIrr !== null && scenarioIrr !== null ? scenarioIrr - baseIrr : null,
  };
}

const ENTRY_SIDE_AXES: ReadonlySet<SensitivityAxis> = new Set(['entry_multiple', 'leverage']);

/**
 * Apply one sensitivity-axis value as a pure FIELD change (§13 axis semantics; see module
 * header). Entry freezing is the GRID's job (`buildSensitivityGrid`), not the setter's —
 * an operating axis must never overwrite an entry-side axis's re-pricing on the same cell.
 */
export function applyAxis(
  facts: DealFacts,
  assumptions: DealAssumptions,
  axis: SensitivityAxis,
  value: number,
): DealAssumptions {
  switch (axis) {
    case 'entry_multiple': // entry-side: re-prices
      return { ...assumptions, entry: { ...assumptions.entry, driver: 'multiple', entry_multiple: value, enterprise_value: null } };
    case 'leverage': {
      // entry-side: scale every TERM tranche proportionally to total = value × FY EBITDA.
      // Shared with the AssumptionsPanel's "Total leverage" field — one implementation, so
      // the input and output surfaces cannot drift apart (§11 v1.1.2).
      return rescaleTermTranchesToLeverage(facts, assumptions, value);
    }
    case 'exit_multiple': // operating-side (absolute)
      return { ...assumptions, exit: { ...assumptions.exit, multiple: value } };
    case 'growth': // operating-side: per-year SHIFT vs the base path (delta; center = 0)
      return {
        ...assumptions,
        operations: {
          ...assumptions.operations,
          growth: assumptions.operations.growth.map((g) => g + value),
        },
      };
    case 'margin': // operating-side (absolute target)
      return { ...assumptions, operations: { ...assumptions.operations, target_margin: value } };
  }
}

export function buildSensitivityGrid(
  facts: DealFacts,
  baseAssumptions: DealAssumptions,
  base: Engine2ModelOutput,
  spec: { row_axis: SensitivityAxis; col_axis: SensitivityAxis; row_values: number[]; col_values: number[]; base_row_index: number; base_col_index: number },
): SensitivityGrid {
  const irr: (number | null)[][] = [];
  const moic: (number | null)[][] = [];
  for (let r = 0; r < spec.row_values.length; r++) {
    const irrRow: (number | null)[] = [];
    const moicRow: (number | null)[] = [];
    for (let c = 0; c < spec.col_values.length; c++) {
      if (r === spec.base_row_index && c === spec.base_col_index) {
        // §14.7: the center cell IS the base run — same object, not a re-computation
        irrRow.push(base.returns.sponsor_net.irr);
        moicRow.push(base.returns.sponsor_net.moic);
        continue;
      }
      const withRow = applyAxis(facts, baseAssumptions, spec.row_axis, spec.row_values[r]);
      const withBoth = applyAxis(facts, withRow, spec.col_axis, spec.col_values[c]);
      // §13: operating axes run ENTRY-FROZEN. With an entry-side axis on the grid, the
      // cell's entry is derived from base assumptions + the ENTRY axes ALONE and then
      // frozen — the operating co-axis must never reach entry pricing (under an NTM
      // basis a growth delta would move the §9 proxy: C9 review F1). withBoth keeps the
      // leverage axis's structure re-size (operating axes never touch structure).
      const anyEntryAxis = ENTRY_SIDE_AXES.has(spec.row_axis) || ENTRY_SIDE_AXES.has(spec.col_axis);
      let cellEv = base.derived.enterprise_value;
      if (anyEntryAxis) {
        let entryPricing = baseAssumptions;
        if (ENTRY_SIDE_AXES.has(spec.row_axis)) entryPricing = applyAxis(facts, entryPricing, spec.row_axis, spec.row_values[r]);
        if (ENTRY_SIDE_AXES.has(spec.col_axis)) entryPricing = applyAxis(facts, entryPricing, spec.col_axis, spec.col_values[c]);
        cellEv = deriveEntry(facts, entryPricing).enterprise_value;
      }
      const cell: DealAssumptions = { ...withBoth, entry: frozenEntry(withBoth, cellEv) };
      // §22.3(vi) [v1.7.0]: test the gate's condition BEFORE calling runModel for this
      // cell — runModel THROWS on it and this loop has no try/catch, so an entry-side
      // axis re-deriving a non-positive plug under a strip would otherwise destroy the
      // WHOLE grid. Same single condition (`stripPlugRejection`), same arithmetic path
      // (`buildSourcesUses`); the cell renders null — N/A semantics, never a sentinel.
      if (cell.sweet_equity) {
        const cellEntry = deriveEntry(facts, cell);
        const cellSized = sizeStructure(cell.structure, cellEntry.entry_ebitda_for_sizing);
        if (stripPlugRejection(buildSourcesUses(cellEntry, cellSized, cell), cell) !== null) {
          irrRow.push(null);
          moicRow.push(null);
          continue;
        }
      }
      const run = runModel(facts, cell);
      irrRow.push(run.returns.sponsor_net.irr);
      moicRow.push(run.returns.sponsor_net.moic);
    }
    irr.push(irrRow);
    moic.push(moicRow);
  }
  return {
    row_axis: spec.row_axis,
    col_axis: spec.col_axis,
    row_values: spec.row_values,
    col_values: spec.col_values,
    base_row_index: spec.base_row_index,
    base_col_index: spec.base_col_index,
    irr,
    moic,
  };
}

/** The composed §13 entry point: base run + named scenarios + grids on one output object. */
export function runModelWithScenarios(
  facts: DealFacts,
  assumptions: DealAssumptions,
  options: {
    scenarios?: { name: string; deltas: ScenarioDeltas }[];
    sensitivity?: { row_axis: SensitivityAxis; col_axis: SensitivityAxis; row_values: number[]; col_values: number[]; base_row_index: number; base_col_index: number }[];
  } = {},
): Engine2ModelOutput {
  const base = runModel(facts, assumptions);
  return {
    ...base,
    scenarios:
      options.scenarios && options.scenarios.length
        ? options.scenarios.map((s) => runScenario(facts, assumptions, base, s.name, s.deltas))
        : null,
    sensitivity:
      options.sensitivity && options.sensitivity.length
        ? options.sensitivity.map((g) => buildSensitivityGrid(facts, assumptions, base, g))
        : null,
  };
}
