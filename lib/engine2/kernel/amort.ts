/**
 * kernel/amort.ts — mandatory-amortization schedules (SPEC §3 step 3, invariant §14.15).
 *
 * Kernel rule: pure functions, zero imports except other kernel modules.
 *
 * THE convention (SPEC §3.3, DR-1 Item 7): mandatory amortization is a % of the ORIGINAL
 * FACE per schedule, capped at outstanding — never a % of the declining balance
 * (beginning-balance amort is a named reviewer flag). The engine's v1 input schema only
 * carries straight-line % (types.ts `amort_pct_of_face`); the kernel is deliberately a
 * superset (bullet / straight-line / custom per-year %) so it stays deal-agnostic.
 */

export type KernelAmortSchedule =
  | { kind: 'bullet' }
  | { kind: 'straight_line_pct'; pct_of_face: number }
  /** Per-year % of ORIGINAL face, 0-indexed; years beyond the array amortize 0. */
  | { kind: 'custom'; pct_of_face_by_year: number[] };

/**
 * Scheduled (UNCAPPED) amortization for hold year `yearIndex` (0-indexed): % × original
 * face. The cap at outstanding is a separate step (`capAtOutstanding`) because the cap's
 * base — beginning balance + current-year PIK accrual — is waterfall state (§3/§4).
 */
export function scheduledAmort(
  schedule: KernelAmortSchedule,
  originalFace: number,
  yearIndex: number,
): number {
  assertNonNegative(originalFace, 'originalFace');
  if (!Number.isInteger(yearIndex) || yearIndex < 0) {
    throw new RangeError(`kernel/amort: yearIndex must be a non-negative integer, got ${yearIndex}`);
  }
  switch (schedule.kind) {
    case 'bullet':
      return 0;
    case 'straight_line_pct':
      assertPct(schedule.pct_of_face, 'pct_of_face');
      return schedule.pct_of_face * originalFace;
    case 'custom': {
      const pct = schedule.pct_of_face_by_year[yearIndex] ?? 0;
      assertPct(pct, `pct_of_face_by_year[${yearIndex}]`);
      return pct * originalFace;
    }
  }
}

/** Uncapped schedule for years 0..years−1 (convenience over `scheduledAmort`). */
export function amortScheduleYears(
  schedule: KernelAmortSchedule,
  originalFace: number,
  years: number,
): number[] {
  if (!Number.isInteger(years) || years < 0) {
    throw new RangeError(`kernel/amort: years must be a non-negative integer, got ${years}`);
  }
  return Array.from({ length: years }, (_, i) => scheduledAmort(schedule, originalFace, i));
}

/**
 * SPEC §3.3: mandatory amort = min(scheduled, outstanding), never negative. `outstanding`
 * is the balance the repayment can retire at that step — beginning balance plus the
 * current year's PIK accrual (the reference derivation caps against balance + accrual).
 */
export function capAtOutstanding(scheduled: number, outstanding: number): number {
  assertNonNegative(scheduled, 'scheduled');
  assertFinite(outstanding, 'outstanding');
  return Math.min(scheduled, Math.max(0, outstanding));
}

function assertFinite(x: number, name: string): void {
  if (!Number.isFinite(x)) throw new RangeError(`kernel/amort: ${name} must be finite, got ${x}`);
}

function assertNonNegative(x: number, name: string): void {
  assertFinite(x, name);
  if (x < 0) throw new RangeError(`kernel/amort: ${name} must be ≥ 0, got ${x}`);
}

function assertPct(x: number, name: string): void {
  assertNonNegative(x, name);
  if (x > 1) throw new RangeError(`kernel/amort: ${name} is a decimal fraction ≤ 1, got ${x}`);
}
