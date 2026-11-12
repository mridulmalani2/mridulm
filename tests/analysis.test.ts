/**
 * lib/analysis holds no model arithmetic: every figure is a run of the one engine. These tests
 * pin that claim against the reviewed primitives (the §13 grid and scenario runner), and pin the
 * module's boundary so a second calculation path cannot be added to it quietly.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runModel } from '../lib/engine2/facade';
import { buildSensitivityGrid, runScenario } from '../lib/engine2/scenarios';
import { breakEvens, customGrid, diffInputs, flexDrivers, flexRun, gridAxes, headlineOf, irrWalk, tornado, tryRun } from '../lib/analysis';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';
import { EA_ASSUMPTIONS, EA_FACTS } from './fixtures/ea-oos';

const G2 = GOLDEN_DEALS.G2;
const base = runModel(G2.facts, G2.assumptions);
const driver = (id: string) => flexDrivers(G2.facts, G2.assumptions, base).find((d) => d.id === id)!;

describe('lib/analysis — flexes are engine runs', () => {
  it('a flex of nil is the base run itself', () => {
    for (const d of flexDrivers(G2.facts, G2.assumptions, base)) {
      expect(flexRun(G2.facts, G2.assumptions, base, d, 0).irr).toBe(base.returns.sponsor_net.irr);
    }
  });

  it('operating flexes equal the §13 scenario runner (entry frozen at the base close)', () => {
    const g = G2.assumptions.operations.growth;
    const viaScenario = (deltas: Parameters<typeof runScenario>[4]) => runScenario(G2.facts, G2.assumptions, base, 't', deltas).returns.sponsor_net.irr;
    expect(flexRun(G2.facts, G2.assumptions, base, driver('exit_multiple'), 1).irr).toBe(viaScenario({ exit_multiple: G2.assumptions.exit.multiple + 1 }));
    expect(flexRun(G2.facts, G2.assumptions, base, driver('growth'), -0.01).irr).toBe(viaScenario({ operations: { growth: g.map((x) => x - 0.01) } }));
    expect(flexRun(G2.facts, G2.assumptions, base, driver('margin'), 0.01).irr).toBe(viaScenario({ operations: { target_margin: G2.assumptions.operations.target_margin + 0.01 } }));
    // growth and margin are different drivers and must not return the same figure
    expect(flexRun(G2.facts, G2.assumptions, base, driver('growth'), 0.01).irr).not.toBe(flexRun(G2.facts, G2.assumptions, base, driver('margin'), 0.01).irr);
  });

  it('entry-side flexes equal the §13 grid (entry re-priced)', () => {
    const m = base.derived.entry_multiple;
    const grid = buildSensitivityGrid(G2.facts, G2.assumptions, base, {
      row_axis: 'entry_multiple', col_axis: 'exit_multiple', row_values: [m - 1, m, m + 1], col_values: [8, 9, 10], base_row_index: 1, base_col_index: 1,
    });
    expect(flexRun(G2.facts, G2.assumptions, base, driver('entry_multiple'), -1).irr).toBe(grid.irr[0][1]);
    expect(flexRun(G2.facts, G2.assumptions, base, driver('entry_multiple'), 1).irr).toBe(grid.irr[2][1]);
    expect(flexRun(G2.facts, G2.assumptions, base, driver('exit_multiple'), 1).irr).toBe(grid.irr[1][2]);
  });

  it('the tornado is sorted widest first and each side is the matching flex', () => {
    const bars = tornado(G2.facts, G2.assumptions, base, { exit_multiple: 0.5 });
    for (let i = 1; i < bars.length; i++) expect(bars[i - 1].swing).toBeGreaterThanOrEqual(bars[i].swing);
    const exit = bars.find((b) => b.driver.id === 'exit_multiple')!;
    expect(exit.step).toBe(0.5);
    expect(exit.high.irr).toBe(flexRun(G2.facts, G2.assumptions, base, exit.driver, 0.5).irr);
    expect(exit.high.irr!).toBeGreaterThan(exit.low.irr!);
  });

  it('a driver the deal does not use is never offered (entered lines: no growth or margin flex)', () => {
    const eaBase = runModel(EA_FACTS, EA_ASSUMPTIONS);
    const ids = flexDrivers(EA_FACTS, EA_ASSUMPTIONS, eaBase).map((d) => d.id);
    expect(ids).not.toContain('growth');
    expect(ids).not.toContain('margin');
    expect(ids).toContain('ebitda');
    // scaling the entered EBITDA line up raises the return, with entry held
    const d = flexDrivers(EA_FACTS, EA_ASSUMPTIONS, eaBase).find((x) => x.id === 'ebitda')!;
    expect(flexRun(EA_FACTS, EA_ASSUMPTIONS, eaBase, d, 0.05).irr!).toBeGreaterThan(eaBase.returns.sponsor_net.irr!);
    expect(gridAxes(EA_FACTS, EA_ASSUMPTIONS, eaBase).map((a) => a.axis)).not.toContain('growth');
  });
});

describe('lib/analysis — grid, break-evens, headline', () => {
  it('the centre of a custom grid is the base run; the grid is the reviewed primitive', () => {
    const axes = gridAxes(G2.facts, G2.assumptions, base);
    const row = axes.find((a) => a.axis === 'exit_multiple')!;
    const col = axes.find((a) => a.axis === 'margin')!;
    const g = customGrid(G2.facts, G2.assumptions, base, row, col)!;
    expect(g.irr[2][2]).toBe(base.returns.sponsor_net.irr);
    expect(g.irr[2][3]).toBe(flexRun(G2.facts, G2.assumptions, base, driver('margin'), col.step).irr);
    expect(customGrid(G2.facts, G2.assumptions, base, row, row)).toBeNull(); // one input cannot be both axes
  });

  it('a break-even, put back into the model, returns the target', () => {
    const be = breakEvens(G2.facts, G2.assumptions, base, 0.1).find((b) => b.lever === 'exit_multiple')!;
    expect(be.value).not.toBeNull();
    const at = runScenario(G2.facts, G2.assumptions, base, 't', { exit_multiple: be.value! }).returns.sponsor_net.irr!;
    expect(at).toBeCloseTo(0.1, 3);
  });

  it('the headline reads the output; blanks are reported, never filled', () => {
    const h = headlineOf(base);
    expect(h.irr).toBe(base.returns.sponsor_net.irr);
    expect(h.equity).toBe(base.sources_uses.sponsor_equity);
    for (const w of base.waterfall) expect(h.min_cash).toBeLessThanOrEqual(w.closing_cash);
    const blank = { ...G2.assumptions, exit: { ...G2.assumptions.exit, multiple: Number.NaN } };
    const r = tryRun(G2.facts, blank, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('1 input blank');
  });
});

describe('lib/analysis — what changed between two builds', () => {
  const to = { ...G2.assumptions, exit: { ...G2.assumptions.exit, multiple: 10 }, operations: { ...G2.assumptions.operations, growth: [0.07, 0.06, 0.05, 0.04, 0.03] }, tax: { ...G2.assumptions.tax, rate: 0.21 } };

  it('lists each changed input once; a per-year line is one change', () => {
    expect(diffInputs(G2.assumptions, to).map((c) => c.path).sort()).toEqual(['exit.multiple', 'operations.growth', 'tax.rate']);
    expect(diffInputs(G2.assumptions, G2.assumptions)).toEqual([]);
  });

  it('the walk starts and ends on the two builds and its moves add up to the difference', () => {
    const w = irrWalk(G2.facts, G2.assumptions, to);
    expect(w.from_irr).toBe(base.returns.sponsor_net.irr);
    expect(w.to_irr).toBe(runModel(G2.facts, to).returns.sponsor_net.irr);
    expect(w.steps[w.steps.length - 1].irr).toBe(w.to_irr);
    expect(w.steps.reduce((t, s) => t + s.irr_move!, 0)).toBeCloseTo(w.to_irr! - w.from_irr!, 12);
  });
});

describe('lib/analysis — boundary', () => {
  it('reaches the engine only through the run, the §13 primitives and pure helpers', () => {
    const src = readFileSync(join(__dirname, '..', 'lib/analysis/index.ts'), 'utf8');
    const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(['../ai2/goalseek', '../engine2/display', '../engine2/draft', '../engine2/facade', '../engine2/scenarios', '../engine2/sourcesUses', '../engine2/types']);
    // the only extremes it forms are the two presentational ones in headlineOf (lowest cash, tightest
    // headroom across the years) and the tornado's ranking; none is a figure the engine exposes
    expect((src.match(/Math\.(min|max)\(/g) ?? []).length).toBe(3);
    expect(src).not.toMatch(/\.reduce\(/);
  });
});
