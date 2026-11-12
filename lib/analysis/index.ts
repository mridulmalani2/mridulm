/**
 * lib/analysis — the questions an analyst asks OF a model: what moves the return most, what the
 * return is at any two inputs, how far an input can move before the deal stops working, and
 * which edit moved the answer.
 *
 * There is NO model arithmetic here. Every figure is a full run of the one engine (`runModel`)
 * on changed inputs, through the reviewed primitives: `buildSensitivityGrid` for anything that
 * re-prices entry, and a run with entry FROZEN at the base close for operating changes (the
 * SPEC §13 rule: a downside never silently re-prices entry). A run the engine calls not
 * meaningful is reported as null, never as a number.
 */
import { runModel, type Engine2ModelOutput } from '../engine2/facade';
import { buildSensitivityGrid } from '../engine2/scenarios';
import { entryGrossLeverageFromAssumptions } from '../engine2/sourcesUses';
import { headlineNotMeaningful } from '../engine2/display';
import { missingInputs, setPath } from '../engine2/draft';
import { solveForIrr, type GoalSeekLever } from '../ai2/goalseek';
import type { DealAssumptions, DealFacts, SensitivityAxis, SensitivityGrid } from '../engine2/types';

// ── headline ────────────────────────────────────────────────────────────────────────────────

export interface Headline {
  irr: number | null;
  moic: number | null;
  equity: number;
  enterprise_value: number;
  /** Lowest closing cash in any year of the hold. */
  min_cash: number;
  /** Tightest leverage-covenant headroom in any year (null when no leverage covenant is set). */
  min_leverage_headroom: number | null;
  net_leverage_exit: number | null;
  meaningful: boolean;
}

export function headlineOf(o: Engine2ModelOutput): Headline {
  const meaningful = !headlineNotMeaningful(o);
  const heads = o.credit.map((c) => c.leverage_headroom).filter((h): h is number => h !== null);
  return {
    irr: meaningful ? o.returns.sponsor_net.irr : null,
    moic: meaningful ? o.returns.sponsor_net.moic : null,
    equity: o.sources_uses.sponsor_equity,
    enterprise_value: o.derived.enterprise_value,
    min_cash: Math.min(...o.waterfall.map((w) => w.closing_cash)),
    min_leverage_headroom: heads.length ? Math.min(...heads) : null,
    net_leverage_exit: o.credit[o.credit.length - 1]?.net_leverage ?? null,
    meaningful,
  };
}

export type RunResult = { ok: true; output: Engine2ModelOutput } | { ok: false; reason: string };

/** Run a set of inputs if it is complete. Blank inputs are reported, never filled. */
export function tryRun(facts: DealFacts, a: DealAssumptions, pending: readonly string[]): RunResult {
  const blank = missingInputs(facts, a, pending);
  if (blank.length) return { ok: false, reason: `${blank.length} input${blank.length === 1 ? '' : 's'} blank` };
  try {
    return { ok: true, output: runModel(facts, a) };
  } catch (e: unknown) {
    return { ok: false, reason: (e as Error).message };
  }
}

// ── flexing one driver ──────────────────────────────────────────────────────────────────────

export type FlexId = 'entry_multiple' | 'leverage' | 'exit_multiple' | 'growth' | 'margin' | 'ebitda' | 'capex' | 'tax_rate' | 'base_rate';
export type FlexUnit = 'x' | 'pts' | 'pct';

export interface FlexDriver {
  id: FlexId;
  label: string;
  /** How the flex is stated: turns of a multiple, percentage points, or a percent of the line. */
  unit: FlexUnit;
  /** The step first offered. It is a starting point the analyst can change, not a finding. */
  default_step: number;
  /** The base value, where one number describes it (null for a line flexed in percent). */
  base: number | null;
}

const frozen = (a: DealAssumptions, base: Engine2ModelOutput): DealAssumptions['entry'] => ({
  ...a.entry, driver: 'ev', enterprise_value: base.derived.enterprise_value, entry_multiple: null,
});

const scaleLine = <T extends { mode: string }>(spec: T, k: number): T => {
  const s = spec as unknown as { mode: string; values?: number[]; year1?: number; pct?: number };
  if (s.mode === 'explicit' && s.values) return { ...spec, values: s.values.map((v) => v * k) };
  if (s.mode === 'grown' && s.year1 !== undefined) return { ...spec, year1: s.year1 * k };
  if (s.mode === 'pct_of_da' && s.pct !== undefined) return { ...spec, pct: s.pct * k };
  return spec;
};

/** The drivers this deal can be flexed on. A driver the deal does not use is never offered. */
export function flexDrivers(facts: DealFacts, a: DealAssumptions, base: Engine2ModelOutput): FlexDriver[] {
  const lines = a.operations.lines;
  const out: FlexDriver[] = [];
  out.push({ id: 'entry_multiple', label: 'Entry multiple', unit: 'x', default_step: 1, base: base.derived.entry_multiple });
  out.push({ id: 'exit_multiple', label: 'Exit multiple', unit: 'x', default_step: 1, base: a.exit.multiple });
  const lev = entryGrossLeverageFromAssumptions(facts, a);
  if (lev !== null && lev > 0) out.push({ id: 'leverage', label: 'Debt at close (× EBITDA)', unit: 'x', default_step: 0.5, base: lev });
  if (!lines?.revenue && facts.fy_revenue !== null) out.push({ id: 'growth', label: 'Revenue growth, every year', unit: 'pts', default_step: 0.01, base: null });
  if (!lines?.ebitda && facts.fy_ebitda_margin !== null) out.push({ id: 'margin', label: 'EBITDA margin target', unit: 'pts', default_step: 0.01, base: a.operations.target_margin });
  if (lines?.ebitda) out.push({ id: 'ebitda', label: `${lines.ebitda.measure === 'ebit' ? 'EBIT' : 'EBITDA'}, every year`, unit: 'pct', default_step: 0.05, base: null });
  out.push({ id: 'capex', label: 'Capex, every year', unit: 'pct', default_step: 0.1, base: null });
  out.push({ id: 'tax_rate', label: 'Tax rate', unit: 'pts', default_step: 0.02, base: a.tax.rate });
  if (a.structure.tranches.some((t) => t.type !== 'pik_note' && t.pricing.kind === 'floating')) {
    out.push({ id: 'base_rate', label: 'Base rate on floating debt', unit: 'pts', default_step: 0.01, base: null });
  }
  return out;
}

/** The inputs with one driver moved by `delta` (signed, in the driver's unit). */
function flexed(a: DealAssumptions, id: Exclude<FlexId, 'entry_multiple' | 'leverage'>, delta: number): DealAssumptions {
  const ops = a.operations;
  const lines = ops.lines;
  switch (id) {
    case 'exit_multiple': return { ...a, exit: { ...a.exit, multiple: a.exit.multiple + delta } };
    case 'growth': return { ...a, operations: { ...ops, growth: ops.growth.map((g) => g + delta) } };
    case 'margin': return { ...a, operations: { ...ops, target_margin: ops.target_margin + delta } };
    case 'ebitda': return lines?.ebitda ? { ...a, operations: { ...ops, lines: { ...lines, ebitda: scaleLine(lines.ebitda, 1 + delta) } } } : a;
    case 'capex':
      return lines?.capex
        ? { ...a, operations: { ...ops, lines: { ...lines, capex: scaleLine(lines.capex, 1 + delta) } } }
        : { ...a, operations: { ...ops, maint_capex_pct_revenue: ops.maint_capex_pct_revenue * (1 + delta), growth_capex: ops.growth_capex.map((g) => g * (1 + delta)) } };
    case 'tax_rate': return { ...a, tax: { ...a.tax, rate: a.tax.rate + delta } };
    case 'base_rate':
      return {
        ...a,
        structure: {
          ...a.structure,
          tranches: a.structure.tranches.map((t) => (t.type !== 'pik_note' && t.pricing.kind === 'floating'
            ? { ...t, pricing: { ...t.pricing, base_rate: t.pricing.base_rate + delta } } : t)) as DealAssumptions['structure']['tranches'],
        },
      };
  }
}

export interface FlexPoint { irr: number | null; moic: number | null }

/** Sponsor IRR and money multiple with ONE driver moved by `delta`. Null = not meaningful there. */
export function flexRun(facts: DealFacts, a: DealAssumptions, base: Engine2ModelOutput, driver: FlexDriver, delta: number): FlexPoint {
  if (delta === 0) {
    const h = headlineOf(base);
    return { irr: h.irr, moic: h.moic };
  }
  try {
    if (driver.id === 'entry_multiple' || driver.id === 'leverage') {
      if (driver.base === null) return { irr: null, moic: null };
      // entry-side: the reviewed grid primitive re-prices entry; the exit axis is held at base
      const g = buildSensitivityGrid(facts, a, base, {
        row_axis: driver.id, col_axis: 'exit_multiple', row_values: [driver.base + delta], col_values: [a.exit.multiple],
        base_row_index: -1, base_col_index: -1,
      });
      return { irr: g.irr[0][0], moic: g.moic[0][0] };
    }
    const next = flexed(a, driver.id, delta);
    const run = runModel(facts, { ...next, entry: frozen(next, base) });
    if (headlineNotMeaningful(run)) return { irr: null, moic: null };
    return { irr: run.returns.sponsor_net.irr, moic: run.returns.sponsor_net.moic };
  } catch {
    return { irr: null, moic: null };
  }
}

export interface TornadoBar { driver: FlexDriver; step: number; low: FlexPoint; high: FlexPoint; /** Largest absolute IRR move of the two sides (0 when neither is meaningful). */ swing: number }

/** One bar per driver: the return with the driver one step down and one step up, widest first. */
export function tornado(facts: DealFacts, a: DealAssumptions, base: Engine2ModelOutput, steps: Partial<Record<FlexId, number>> = {}): TornadoBar[] {
  const baseIrr = headlineOf(base).irr;
  return flexDrivers(facts, a, base)
    .map((driver) => {
      const step = steps[driver.id] ?? driver.default_step;
      const low = flexRun(facts, a, base, driver, -step);
      const high = flexRun(facts, a, base, driver, step);
      const move = (p: FlexPoint) => (p.irr === null || baseIrr === null ? 0 : Math.abs(p.irr - baseIrr));
      return { driver, step, low, high, swing: Math.max(move(low), move(high)) };
    })
    .sort((x, y) => y.swing - x.swing);
}

// ── two-way sensitivity on any pair of the engine's axes ────────────────────────────────────

export interface AxisChoice { axis: SensitivityAxis; label: string; base: number; step: number; unit: 'x' | 'pts' }

/** The engine's sensitivity axes that apply to this deal, each with its base value and a step. */
export function gridAxes(facts: DealFacts, a: DealAssumptions, base: Engine2ModelOutput): AxisChoice[] {
  const lines = a.operations.lines;
  const out: AxisChoice[] = [
    { axis: 'entry_multiple', label: 'Entry multiple', base: base.derived.entry_multiple, step: 0.5, unit: 'x' },
    { axis: 'exit_multiple', label: 'Exit multiple', base: a.exit.multiple, step: 0.5, unit: 'x' },
  ];
  const lev = entryGrossLeverageFromAssumptions(facts, a);
  if (lev !== null && lev > 0) out.push({ axis: 'leverage', label: 'Debt at close (× EBITDA)', base: lev, step: 0.5, unit: 'x' });
  if (!lines?.revenue && facts.fy_revenue !== null) out.push({ axis: 'growth', label: 'Revenue growth shift', base: 0, step: 0.01, unit: 'pts' });
  if (!lines?.ebitda && facts.fy_ebitda_margin !== null) out.push({ axis: 'margin', label: 'EBITDA margin target', base: a.operations.target_margin, step: 0.01, unit: 'pts' });
  return out;
}

/** A 5 × 5 grid centred on the base case. The centre cell is the base run itself. */
export function customGrid(facts: DealFacts, a: DealAssumptions, base: Engine2ModelOutput, row: AxisChoice, col: AxisChoice, rowStep = row.step, colStep = col.step): SensitivityGrid | null {
  if (row.axis === col.axis || !(rowStep > 0) || !(colStep > 0)) return null;
  const around = (c: number, s: number) => [c - 2 * s, c - s, c, c + s, c + 2 * s];
  try {
    return buildSensitivityGrid(facts, a, base, {
      row_axis: row.axis, col_axis: col.axis, row_values: around(row.base, rowStep), col_values: around(col.base, colStep),
      base_row_index: 2, base_col_index: 2,
    });
  } catch {
    return null;
  }
}

// ── break-evens ─────────────────────────────────────────────────────────────────────────────

export interface BreakEven { lever: GoalSeekLever; label: string; base: number | null; value: number | null }

const LEVER_LABEL: Record<GoalSeekLever, string> = {
  exit_multiple: 'Exit multiple', entry_multiple: 'Entry multiple', leverage: 'Debt at close (× EBITDA)', growth_shift: 'Revenue growth shift, every year',
};

/** For each lever the deal has: the value at which sponsor IRR equals `targetIrr`, all else held. */
export function breakEvens(facts: DealFacts, a: DealAssumptions, base: Engine2ModelOutput, targetIrr: number): BreakEven[] {
  const levers: { lever: GoalSeekLever; base: number | null }[] = [
    { lever: 'exit_multiple', base: a.exit.multiple },
    { lever: 'entry_multiple', base: base.derived.entry_multiple },
  ];
  const lev = entryGrossLeverageFromAssumptions(facts, a);
  if (lev !== null && lev > 0) levers.push({ lever: 'leverage', base: lev });
  if (!a.operations.lines?.revenue && facts.fy_revenue !== null) levers.push({ lever: 'growth_shift', base: 0 });
  return levers.map(({ lever, base: b }) => {
    let value: number | null = null;
    try { value = solveForIrr(facts, a, lever, targetIrr)?.value ?? null; } catch { value = null; }
    return { lever, label: LEVER_LABEL[lever], base: b, value };
  });
}

// ── what changed between two sets of inputs ─────────────────────────────────────────────────

export interface InputChange { path: string; from: unknown; to: unknown }

const isPlain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (x: unknown, y: unknown): boolean => {
  if (typeof x === 'number' && typeof y === 'number') return x === y || (Number.isNaN(x) && Number.isNaN(y));
  return JSON.stringify(x) === JSON.stringify(y);
};

/**
 * The inputs that differ, as dotted paths. A per-year array is one change (the path of the
 * array); a list whose length changed (tranches added or removed) is one change too, because
 * its members cannot be matched one to one.
 */
export function diffInputs(from: DealAssumptions, to: DealAssumptions): InputChange[] {
  const out: InputChange[] = [];
  const walk = (x: unknown, y: unknown, path: string) => {
    if (same(x, y)) return;
    if (isPlain(x) && isPlain(y)) {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], path ? `${path}.${k}` : k);
      return;
    }
    if (Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.every(isPlain) && y.every(isPlain)) {
      x.forEach((v, i) => walk(v, y[i], `${path}.${i}`));
      return;
    }
    out.push({ path, from: x, to: y });
  };
  walk(from, to, '');
  return out.filter((c) => c.path !== 'deal_name');
}

export interface WalkStep extends InputChange { irr: number | null; irr_move: number | null }
export interface IrrWalk { from_irr: number | null; to_irr: number | null; steps: WalkStep[] }

/**
 * Apply the changes one at a time, in the order given, and record the sponsor IRR after each.
 * The moves sum to the total change exactly; how the total is SPLIT depends on the order, as in
 * any sequential attribution, so the order is the one the changes are listed in.
 */
export function irrWalk(facts: DealFacts, from: DealAssumptions, to: DealAssumptions): IrrWalk {
  const irrOf = (a: DealAssumptions): number | null => {
    try {
      const run = runModel(facts, a);
      return headlineNotMeaningful(run) ? null : run.returns.sponsor_net.irr;
    } catch { return null; }
  };
  const fromIrr = irrOf(from);
  let cur = from;
  let prev = fromIrr;
  const steps: WalkStep[] = diffInputs(from, to).map((c) => {
    cur = setPath<DealAssumptions>(cur, c.path, c.to);
    const irr = irrOf(cur);
    const step: WalkStep = { ...c, irr, irr_move: irr !== null && prev !== null ? irr - prev : null };
    prev = irr;
    return step;
  });
  return { from_irr: fromIrr, to_irr: irrOf(to), steps };
}
