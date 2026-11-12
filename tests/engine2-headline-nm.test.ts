/**
 * Adversarial review F1 (2026-11-10): a run carrying a BLOCK-severity flag is not economically
 * meaningful, so no HEADLINE surface may present its returns as if it were. The predicate lives
 * once, in lib/engine2/display.ts; the downloadable IC memo is held to it here (the UI surfaces
 * in engine2-workbench-smoke).
 */
import { describe, expect, it } from 'vitest';
import { runModel } from '../lib/engine2/facade';
import { headlineNotMeaningful } from '../lib/engine2/display';
import { memoSkeleton } from '../lib/ai2/memo';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';
import { pct } from '../lib/format';

const g2 = GOLDEN_DEALS.G2;
const breach = runModel(g2.facts, {
  ...g2.assumptions,
  structure: {
    ...g2.assumptions.structure,
    tranches: [{ name: 'TLB', type: 'senior', size: { x_ebitda: 8 }, pricing: { kind: 'fixed', rate: 0.12 }, amort_pct_of_face: 0.05, maturity_years: 7, oid_pct: 0, sweep: { participates: true, priority: 1 } }],
  },
  operations: { ...g2.assumptions.operations, growth: [-0.1, -0.05, 0, 0, 0] },
});
const healthy = runModel(g2.facts, g2.assumptions);

describe('headline returns are withheld on a BLOCK run, and only then', () => {
  it('the predicate reads the block severity and nothing else', () => {
    expect(breach.coherence.some((f) => f.code === 'cash_floor_breach' && f.severity === 'block')).toBe(true);
    expect(headlineNotMeaningful(breach)).toBe(true);
    expect(headlineNotMeaningful(healthy)).toBe(false);
    expect(headlineNotMeaningful({ coherence: [{ code: 'distribution_blocked', severity: 'warn', message: '' }] })).toBe(false);
  });
  it('the IC memo says "not meaningful" on a BLOCK run and never prints its sponsor IRR as a headline', () => {
    const memo = memoSkeleton(breach, 'USD');
    expect(memo).toContain('**Not meaningful on this run**');
    expect(memo).not.toContain(`Sponsor net ${pct(breach.returns.sponsor_net.irr)} IRR`);
    expect(memo).toContain('- BLOCK: Cash floor breached');
  });
  it('a healthy memo headlines its returns as before', () => {
    expect(memoSkeleton(healthy, 'USD')).toContain(`Sponsor net ${pct(healthy.returns.sponsor_net.irr)} IRR`);
  });
});

import { buildSensitivityGrid } from '../lib/engine2/scenarios';

describe('a sensitivity cell whose own run is not meaningful reads N/A, never a number (F1, grid surface)', () => {
  it('leverage × exit: cells that breach their cash floor (equity still POSITIVE, an IRR still computable) are null', () => {
    // no revolver; the term loan at a fixed 14% — from ~6× the business cannot carry its interest
    const a = {
      ...g2.assumptions,
      structure: { ...g2.assumptions.structure, tranches: g2.assumptions.structure.tranches.filter((t) => t.type !== 'revolver').map((t) => ({ ...t, pricing: { kind: 'fixed' as const, rate: 0.14 } })) as typeof g2.assumptions.structure.tranches },
    };
    const base = runModel(g2.facts, a);
    const grid = buildSensitivityGrid(g2.facts, a, base, {
      row_axis: 'leverage', col_axis: 'exit_multiple', row_values: [3, 7, 8], col_values: [8, 9, 10], base_row_index: 0, base_col_index: 1,
    });
    // the premise, for the 7× row: breach flagged, sponsor equity positive, IRR a number
    const at7 = runModel(g2.facts, { ...a, structure: { ...a.structure, tranches: a.structure.tranches.map((t) => ({ ...t, size: { x_ebitda: 7 } })) as typeof a.structure.tranches } });
    expect(headlineNotMeaningful(at7)).toBe(true);
    expect(at7.sources_uses.sponsor_equity).toBeGreaterThan(0);
    expect(typeof at7.returns.sponsor_net.irr).toBe('number');
    expect(grid.irr[1].every((x) => x === null)).toBe(true);
    expect(grid.irr[2].every((x) => x === null)).toBe(true);
    expect(grid.moic[1].every((x) => x === null)).toBe(true);
    expect(grid.irr[0].every((x) => typeof x === 'number')).toBe(true); // the feasible row is untouched
  });
});

import { solveForIrr } from '../lib/ai2/goalseek';
import { applyAxis } from '../lib/engine2/scenarios';

describe('goal-seek never answers with a structure the engine calls not meaningful (F1, goal-seek surface)', () => {
  const a = {
    ...g2.assumptions,
    structure: { ...g2.assumptions.structure, tranches: g2.assumptions.structure.tranches.filter((t) => t.type !== 'revolver').map((t) => ({ ...t, pricing: { kind: 'fixed' as const, rate: 0.14 } })) as typeof g2.assumptions.structure.tranches },
  };
  it('a target reachable only inside the cash-floor-breach zone is unreachable (null), not "7.6×"', () => {
    // premise: 6% is hit only at ~7.6× leverage, where the run breaches
    const at76 = runModel(g2.facts, applyAxis(g2.facts, a, 'leverage', 7.6));
    expect(headlineNotMeaningful(at76)).toBe(true);
    expect(Math.abs(at76.returns.sponsor_net.irr! - 0.06)).toBeLessThan(0.01);
    expect(solveForIrr(g2.facts, a, 'leverage', 0.06)).toBeNull();
  });
  it('a target reachable by a feasible structure still solves, and the answer is feasible', () => {
    const r = solveForIrr(g2.facts, a, 'leverage', 0.1)!;
    expect(r).not.toBeNull();
    expect(Math.abs(r.achieved_irr - 0.1)).toBeLessThan(5e-5);
    expect(headlineNotMeaningful(runModel(g2.facts, applyAxis(g2.facts, a, 'leverage', r.value)))).toBe(false);
  });
});
