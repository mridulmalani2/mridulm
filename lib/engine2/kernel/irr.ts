/**
 * kernel/irr.ts — NPV/IRR primitives (SPEC §1 timing, §9 return streams, §14.14 closed form).
 *
 * Kernel rule: pure functions, zero imports except other kernel modules.
 *
 * IRR is Newton–Raphson with a guaranteed-bracket bisection fallback over
 * rate ∈ (−1, 10]. An undefined IRR (no sign change, degenerate stream) returns null —
 * N/A semantics, never a sentinel (SPEC §11/§15). Solved far below the ±0.1bp golden
 * tolerance (§15).
 */

const RATE_LO = -0.9999; // keep 1 + r > 0 so fractional (mid-year) exponents are defined
const RATE_HI = 10.0;
const MAX_ITER = 200;

/**
 * NPV at `rate` of `cashflows[i]` occurring at time `times?.[i] ?? i` (years).
 * Periods are annual, flows at period end; year 0 = close (SPEC §1).
 */
export function npv(rate: number, cashflows: number[], times?: number[]): number {
  if (!Number.isFinite(rate) || rate <= -1) {
    throw new RangeError(`kernel/irr: npv rate must be finite and > −1, got ${rate}`);
  }
  if (times && times.length !== cashflows.length) {
    throw new RangeError('kernel/irr: times length must match cashflows length');
  }
  let v = 0;
  for (let i = 0; i < cashflows.length; i++) {
    const cf = cashflows[i];
    if (!Number.isFinite(cf)) throw new RangeError(`kernel/irr: cashflows[${i}] must be finite`);
    const t = times ? times[i] : i;
    if (!Number.isFinite(t) || t < 0) throw new RangeError(`kernel/irr: times[${i}] must be ≥ 0`);
    v += cf / Math.pow(1 + rate, t);
  }
  return v;
}

/**
 * SPEC §1 mid-year convention (display option, IRR only): interim flows shift to t − 0.5;
 * the flow at t = 0 (close) and the EXIT flow (t = N) never shift. `flowCount` = N + 1
 * (t0-anchored series, types.ts indexing contract).
 */
export function midYearTimes(flowCount: number): number[] {
  if (!Number.isInteger(flowCount) || flowCount < 1) {
    throw new RangeError(`kernel/irr: flowCount must be a positive integer, got ${flowCount}`);
  }
  return Array.from({ length: flowCount }, (_, i) =>
    i === 0 || i === flowCount - 1 ? i : i - 0.5,
  );
}

/**
 * IRR of a t0-anchored stream (times default to 0..n−1; pass `midYearTimes(n)` for the §1
 * display option). Returns null when undefined: fewer than 2 flows, no sign change, or no
 * SIGN-CHANGING root in (−0.9999, 10] (a bracketing method cannot see even-multiplicity
 * tangential roots, and the search floor is −0.9999, not −1 — total-loss streams with
 * IRR ∈ (−1, −0.9999) render N/A). With multiple sign changes the root found in the
 * bracket is returned (golden streams have exactly one sign change).
 */
export function irr(cashflows: number[], times?: number[]): number | null {
  if (cashflows.length < 2) return null;
  const hasPos = cashflows.some((c) => c > 0);
  const hasNeg = cashflows.some((c) => c < 0);
  if (!hasPos || !hasNeg) return null;
  const scale = cashflows.reduce((s, c) => s + Math.abs(c), 0);
  // Below any economic magnitude (units are $m) the npvTol floor would accept the Newton
  // seed unsolved — silent plausible-looking garbage. N/A instead.
  if (scale < 1e-6) return null;

  const f = (r: number) => npv(r, cashflows, times);
  // |NPV| convergence tolerance scaled to flow magnitude (a fixed absolute tolerance is
  // unreachable in float64 for large flows); far inside the ±0.1bp golden tolerance (§15).
  const npvTol = 1e-12 * Math.max(1, scale);
  let lo = RATE_LO;
  let hi = RATE_HI;
  let fLo = f(lo);
  let fHi = f(hi);
  // Extreme times can overflow the discounting at an endpoint into Inf − Inf = NaN; a NaN
  // endpoint corrupts every sign test below (the march lands on RATE_HI, not a root), so
  // it is N/A, not a solve. A ±Inf endpoint keeps a usable sign and still solves.
  if (Number.isNaN(fLo) || Number.isNaN(fHi)) return null;
  if (fLo === 0) return lo;
  if (fHi === 0) return hi;
  if (fLo * fHi > 0) return null; // no sign-changing root in the economic range

  // Newton–Raphson from a neutral start, constrained to the bracket; every evaluation
  // tightens the bracket so the bisection fallback always converges.
  let x = 0.1;
  if (x <= lo || x >= hi) x = (lo + hi) / 2;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    const fx = f(x);
    if (Math.abs(fx) < npvTol) return x;
    if (fLo * fx <= 0) {
      hi = x;
      fHi = fx;
    } else {
      lo = x;
      fLo = fx;
    }
    // d(NPV)/dr with the same times the NPV uses
    let d = 0;
    for (let i = 0; i < cashflows.length; i++) {
      const t = times ? times[i] : i;
      if (t > 0) d += (-t * cashflows[i]) / Math.pow(1 + x, t + 1);
    }
    let next = d !== 0 ? x - fx / d : NaN;
    if (!Number.isFinite(next) || next <= lo || next >= hi) next = (lo + hi) / 2; // bisect
    if (Math.abs(next - x) < 1e-15) return next;
    x = next;
  }
  return (lo + hi) / 2; // bracket is far tighter than the ±0.1bp tolerance by now
}

/**
 * SPEC §14.14: a zero-debt, zero-growth, flat-margin deal has exactly two flows
 * [−outflow at t=0, +inflow at t=N] ⇒ IRR = (inflow/outflow)^(1/N) − 1, closed form.
 * Returns null when undefined (non-positive flow or years ≤ 0).
 */
export function closedFormTwoFlowIrr(outflow: number, inflow: number, years: number): number | null {
  if (!Number.isFinite(outflow) || !Number.isFinite(inflow) || !Number.isFinite(years)) return null;
  if (outflow <= 0 || inflow <= 0 || years <= 0) return null;
  return Math.pow(inflow / outflow, 1 / years) - 1;
}
