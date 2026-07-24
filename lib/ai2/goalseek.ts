/**
 * lib/ai2/goalseek.ts — the v2 /cetpar goal-seek (PHASE_E §E4). PURE: bisection over
 * runModel — no LLM, no solver state. Levers are restricted BY CONSTRUCTION to true
 * Class-B inputs (the old "derived-field lever" no-op bug class is impossible):
 * entry_multiple · exit_multiple · leverage (total x) · growth_shift (parallel bps).
 * Entry-side levers re-price entry; operating levers leave it frozen — exactly the
 * §13 axis semantics (reusing applyAxis, the reviewed grid primitive).
 */

import { runModel } from '../engine2/facade';
import { applyAxis } from '../engine2/scenarios';
import type { DealAssumptions, DealFacts } from '../engine2/types';

export type GoalSeekLever = 'entry_multiple' | 'exit_multiple' | 'leverage' | 'growth_shift';

export interface GoalSeekResult {
  lever: GoalSeekLever;
  /** The solved lever value (absolute for multiples/leverage; SHIFT in decimals for growth). */
  value: number;
  achieved_irr: number;
  iterations: number;
}

/** Lever domains — the same plausibility rails the suggestion layer uses. */
const DOMAIN: Record<GoalSeekLever, [number, number]> = {
  entry_multiple: [1, 30],
  exit_multiple: [1, 30],
  leverage: [0.5, 8],
  growth_shift: [-0.15, 0.15],
};

function irrAt(facts: DealFacts, base: DealAssumptions, lever: GoalSeekLever, v: number): number | null {
  const axis = lever === 'growth_shift' ? 'growth' : lever;
  const withLever = applyAxis(facts, base, axis, v);
  try {
    return runModel(facts, withLever).returns.sponsor_net.irr;
  } catch {
    return null; // e.g. insolvent entry at extreme leverage — treated as unreachable
  }
}

/**
 * Solve lever so sponsor IRR ≈ target (±0.5bp). Returns null when the target is not
 * bracketed inside the lever's plausibility domain — N/A semantics, never a clamp
 * presented as an answer.
 */
export function solveForIrr(
  facts: DealFacts,
  assumptions: DealAssumptions,
  lever: GoalSeekLever,
  targetIrr: number,
): GoalSeekResult | null {
  const [loD, hiD] = DOMAIN[lever];
  let lo = loD;
  let hi = hiD;
  let fLo = irrAt(facts, assumptions, lever, lo);
  let fHi = irrAt(facts, assumptions, lever, hi);
  if (fLo === null && fHi === null) return null;
  // A dead endpoint (insolvent entry / undefined IRR) is walked to the VALIDITY
  // BOUNDARY by bisection against the live endpoint — preserving nearly the whole
  // reachable domain (a naive halving overshoots past the base case and loses it).
  const walkToBoundary = (dead: number, live: number): { x: number; f: number } | null => {
    let d = dead;
    let l = live;
    let fl = irrAt(facts, assumptions, lever, l);
    for (let k = 0; k < 14; k++) {
      const mid = (d + l) / 2;
      const fm = irrAt(facts, assumptions, lever, mid);
      if (fm === null) d = mid;
      else { l = mid; fl = fm; }
    }
    return fl === null ? null : { x: l, f: fl };
  };
  if (fLo === null) {
    const b = walkToBoundary(lo, hi);
    if (!b) return null;
    lo = b.x; fLo = b.f;
  }
  if (fHi === null) {
    const b = walkToBoundary(hi, lo);
    if (!b) return null;
    hi = b.x; fHi = b.f;
  }
  const g = (x: number | null) => (x === null ? Number.NaN : x - targetIrr);
  if (g(fLo) === 0) return { lever, value: lo, achieved_irr: fLo, iterations: 0 };
  if (g(fHi) === 0) return { lever, value: hi, achieved_irr: fHi, iterations: 0 };
  if (g(fLo) * g(fHi) > 0) return null; // target outside what this lever can reach
  let iterations = 0;
  for (; iterations < 60; iterations++) {
    const mid = (lo + hi) / 2;
    const fMid = irrAt(facts, assumptions, lever, mid);
    if (fMid === null) return null;
    if (Math.abs(fMid - targetIrr) < 5e-5) return { lever, value: mid, achieved_irr: fMid, iterations };
    if ((fMid - targetIrr) * g(fLo) <= 0) { hi = mid; fHi = fMid; } else { lo = mid; fLo = fMid; }
  }
  const v = (lo + hi) / 2;
  const f = irrAt(facts, assumptions, lever, v);
  return f === null ? null : { lever, value: v, achieved_irr: f, iterations };
}
