/**
 * kernel/waterfall.ts — the SPEC §3 annual cash waterfall primitive.
 *
 * Kernel rule: pure functions, zero imports except other kernel modules. Deal-agnostic:
 * one running cash variable, ordered steps, ECF pool, sweep by priority tier with pro-rata
 * within a tier, revolver draw/repay. Interest, fees and PIK accrual amounts are computed
 * by the caller from BEGINNING balances (SPEC §4, kernel/rates) and injected — the
 * waterfall only moves cash, so double-counting between revolver repayment and the sweep
 * is structurally impossible (invariant §14.3).
 *
 * Step order (SPEC §3): cash = opening + FCF_pre_debt, then
 *   1. − cash interest (all tranches + revolver)
 *   2. − commitment fee (beginning undrawn × fee — computed by caller)
 *   3. − mandatory amortization (% of ORIGINAL face, capped at outstanding — §14.15)
 *   4. − voluntary revolver repayment down to 0 from cash above min_cash (repay FIRST,
 *        ahead of term-loan sweeps — DR-1 Item 2/3)
 *   5. ECF sweep: pool = max(0, cash − min_cash); sweepable = pct × POOL (never % of
 *      balance); applied by tranche sweep priority asc, pro-rata within a tier, capped at
 *      each tranche's remaining outstanding; unapplied sweepable stays in cash
 *   6. + revolver draw if cash < min_cash, capped at undrawn commitment; if still short →
 *      floor-breach flag (§14.4/§14.6); closing cash stays below the floor (and can be
 *      negative for a deep enough hole) — conservation (§14.3) is never clamped
 */

import { capAtOutstanding } from './amort';

/** Tolerances mirroring the reference derivation (scripts/goldens/spec_calc.py). */
const DRAW_EPS = 1e-12; // shortfall below this is float noise, not a draw
const BREACH_EPS = 1e-9; // shortfall below this is float noise, not a breach

export interface WaterfallTrancheIn {
  name: string;
  /**
   * Balance the year's repayments can retire: beginning balance + current-year PIK
   * accrual (PIK compounds into the balance at year end — SPEC §4; repayment caps apply
   * to balance + accrual, per the reference derivation).
   */
  outstanding: number;
  /** UNCAPPED scheduled mandatory amort (% × ORIGINAL face — kernel/amort, §14.15). */
  scheduled_amort: number;
  /** Cash interest on the beginning balance (kernel/rates — §4). PIK pays no cash. */
  cash_interest: number;
  sweep_participates: boolean;
  /** Lower = repaid first. Only meaningful when sweep_participates. */
  sweep_priority: number;
}

export interface WaterfallRevolverIn {
  beginning_drawn: number;
  commitment: number;
  /** On beginning DRAWN balance (§4). */
  cash_interest: number;
  /** On beginning UNDRAWN commitment (§4). */
  commitment_fee: number;
}

export interface WaterfallYearIn {
  opening_cash: number;
  fcf_pre_debt: number;
  min_cash: number;
  /** Resolved sweep % for the year (base or grid tier — resolved by the caller, §3.5). */
  sweep_pct: number;
  tranches: WaterfallTrancheIn[];
  revolver: WaterfallRevolverIn | null;
}

export interface WaterfallTrancheOut {
  name: string;
  mandatory_amort: number;
  sweep_repayment: number;
  /** outstanding − mandatory − sweep (PIK accrual already inside `outstanding`). */
  ending_outstanding: number;
}

export interface WaterfallYearOut {
  cash_interest_total: number;
  commitment_fees: number;
  mandatory_amort_total: number;
  revolver_repayment: number;
  /** max(0, cash − min_cash) at step 5. */
  sweep_pool: number;
  sweep_pct_applied: number;
  /** sweep_pct × pool — the amount OFFERED to the tranches. */
  sweepable: number;
  /** Σ per-tranche applications ≤ sweepable (unapplied stays in cash). */
  sweep_applied_total: number;
  revolver_draw: number;
  revolver_ending_drawn: number;
  closing_cash: number;
  cash_floor_breach: boolean;
  tranches: WaterfallTrancheOut[];
}

export function waterfallYear(input: WaterfallYearIn): WaterfallYearOut {
  validate(input);
  const { min_cash, revolver } = input;

  let cash = input.opening_cash + input.fcf_pre_debt;

  // 1. cash interest
  const cashInterestTotal =
    sum(input.tranches.map((t) => t.cash_interest)) + (revolver?.cash_interest ?? 0);
  cash -= cashInterestTotal;

  // 2. commitment fee
  const commitmentFees = revolver?.commitment_fee ?? 0;
  cash -= commitmentFees;

  // 3. mandatory amortization, capped at outstanding (§14.15)
  const mandatory = input.tranches.map((t) => capAtOutstanding(t.scheduled_amort, t.outstanding));
  const mandatoryTotal = sum(mandatory);
  cash -= mandatoryTotal;

  // 4. voluntary revolver repayment — FIRST, ahead of the sweep (DR-1 Item 2/3)
  const revolverRepayment = revolver
    ? Math.min(revolver.beginning_drawn, Math.max(0, cash - min_cash))
    : 0;
  cash -= revolverRepayment;
  let drawn = revolver ? revolver.beginning_drawn - revolverRepayment : 0;

  // 5. ECF sweep — % of the POOL, by priority tier, pro-rata within a tier
  const pool = Math.max(0, cash - min_cash);
  const sweepable = input.sweep_pct * pool;
  const sweeps = input.tranches.map(() => 0);
  let remaining = sweepable;
  const capacities = input.tranches.map((t, i) => Math.max(0, t.outstanding - mandatory[i]));
  const priorities = [
    ...new Set(
      input.tranches.filter((t) => t.sweep_participates).map((t) => t.sweep_priority),
    ),
  ].sort((a, b) => a - b);
  for (const priority of priorities) {
    if (remaining <= 0) break;
    const tier = input.tranches
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.sweep_participates && t.sweep_priority === priority);
    const tierCapacity = sum(tier.map(({ i }) => capacities[i]));
    if (tierCapacity <= 0) continue;
    const alloc = Math.min(remaining, tierCapacity);
    for (const { i } of tier) {
      // Full tier retirement assigns each capacity EXACTLY (the pro-rata quotient can
      // overshoot capacity by 1 ulp → negative ending balance → §14.5 violation and a
      // next-year validator throw); partial allocations clamp for the same reason.
      sweeps[i] =
        alloc === tierCapacity
          ? capacities[i]
          : Math.min((alloc * capacities[i]) / tierCapacity, capacities[i]);
    }
    remaining -= alloc;
  }
  const sweepAppliedTotal = sum(sweeps);
  cash -= sweepAppliedTotal;

  // 6. revolver draw to the floor; breach flag if commitment exhausts (§14.4/§14.6).
  // When the commitment exhausts, closing cash stays below the floor (and can be < 0 for
  // a deep enough hole) — the kernel keeps §14.3 conservation exact and flags the breach;
  // rendering/blocking is the engine's coherence layer (Phase C check.ts).
  let draw = 0;
  if (revolver && cash < min_cash - DRAW_EPS) {
    const need = min_cash - cash;
    const headroom = revolver.commitment - drawn;
    if (need >= headroom) {
      // Full-draw arm: set drawn to the commitment EXACTLY (drawn + (commitment − drawn)
      // can overshoot the commitment by 1 ulp → next-year validator throw).
      draw = headroom;
      drawn = revolver.commitment;
    } else {
      draw = need;
      drawn += draw;
    }
    cash += draw;
  }
  const breach = cash < min_cash - BREACH_EPS;

  return {
    cash_interest_total: cashInterestTotal,
    commitment_fees: commitmentFees,
    mandatory_amort_total: mandatoryTotal,
    revolver_repayment: revolverRepayment,
    sweep_pool: pool,
    sweep_pct_applied: input.sweep_pct,
    sweepable,
    sweep_applied_total: sweepAppliedTotal,
    revolver_draw: draw,
    revolver_ending_drawn: drawn,
    closing_cash: cash,
    cash_floor_breach: breach,
    tranches: input.tranches.map((t, i) => ({
      name: t.name,
      mandatory_amort: mandatory[i],
      sweep_repayment: sweeps[i],
      ending_outstanding: t.outstanding - mandatory[i] - sweeps[i],
    })),
  };
}

function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

function validate(input: WaterfallYearIn): void {
  // Opening cash may be NEGATIVE: §3 step 6 post-breach semantics [v1.0.3] — a breach
  // year closes below the floor (possibly < 0) and subsequent years run on the inherited
  // opening cash with the block-severity flag carried by the engine's coherence layer.
  assertFinite(input.opening_cash, 'opening_cash');
  assertFinite(input.fcf_pre_debt, 'fcf_pre_debt'); // may be negative
  assertNonNegative(input.min_cash, 'min_cash');
  assertFinite(input.sweep_pct, 'sweep_pct');
  if (input.sweep_pct < 0 || input.sweep_pct > 1) {
    throw new RangeError(`kernel/waterfall: sweep_pct must be in [0, 1], got ${input.sweep_pct}`);
  }
  for (const t of input.tranches) {
    assertNonNegative(t.outstanding, `${t.name}.outstanding`);
    assertNonNegative(t.scheduled_amort, `${t.name}.scheduled_amort`);
    assertNonNegative(t.cash_interest, `${t.name}.cash_interest`);
    assertFinite(t.sweep_priority, `${t.name}.sweep_priority`);
  }
  const r = input.revolver;
  if (r) {
    assertNonNegative(r.beginning_drawn, 'revolver.beginning_drawn');
    assertNonNegative(r.commitment, 'revolver.commitment');
    assertNonNegative(r.cash_interest, 'revolver.cash_interest');
    assertNonNegative(r.commitment_fee, 'revolver.commitment_fee');
    if (r.beginning_drawn > r.commitment) {
      throw new RangeError('kernel/waterfall: revolver drawn exceeds commitment');
    }
  }
}

function assertFinite(x: number, name: string): void {
  if (!Number.isFinite(x)) throw new RangeError(`kernel/waterfall: ${name} must be finite, got ${x}`);
}

function assertNonNegative(x: number, name: string): void {
  assertFinite(x, name);
  if (x < 0) throw new RangeError(`kernel/waterfall: ${name} must be ≥ 0, got ${x}`);
}
