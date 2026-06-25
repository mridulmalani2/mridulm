/**
 * Original Issue Discount (P4-14).
 *
 * OID is an upfront debt financing cost: a tranche owes par (`principal`, what sits in
 * the debt schedule and exit net debt) but the issuer receives par × (1 − oid_pct) in
 * cash at close. The discount is therefore funded by additional sponsor equity at entry
 * and amortised as a non-cash, tax-deductible interest cost over the tranche life (a
 * deferred-cost write-down on the balance sheet, mirroring financing-fee treatment).
 *
 * Absent oid_pct the totals are zero, so deals without OID are unchanged.
 */

import type { ModelState, DebtScheduleResult } from '../dealEngineTypes';

const OID_WRITEOFF_TOL = 1e-6;

/** Total OID across all tranches (par × oid_pct) — the upfront discount funded at close. */
export function oidTotal(state: ModelState): number {
  return state.debt_tranches.reduce((s, t) => s + (t.oid_pct ?? 0) * t.principal, 0);
}

/** Per-hold-year OID amortisation, straight-line over each tranche's maturity
 *  (debt_maturity_years, falling back to the holding period), summed across tranches.
 *  Used as the pre-debt SEED estimate; the converged projections and the balance sheet use
 *  the schedule-aware `oidAmortFromSchedule` below. */
export function oidAmortByYear(state: ModelState): number[] {
  const hp = state.exit.holding_period;
  const out = new Array<number>(hp).fill(0);
  for (const t of state.debt_tranches) {
    const oid = (t.oid_pct ?? 0) * t.principal;
    if (oid <= 0) continue;
    const maturity = t.debt_maturity_years && t.debt_maturity_years > 0 ? t.debt_maturity_years : hp;
    const perYear = oid / maturity;
    for (let i = 0; i < hp && i < maturity; i++) out[i] += perYear;
  }
  return out;
}

/**
 * Schedule-aware OID amortisation (Phase 0B). Refines the straight-line seed using each
 * tranche's ACTUAL balance trajectory from the debt schedule:
 *  - effective-interest style — the annual slice is the greater of the straight-line-over-
 *    remaining-life amount and the share implied by the principal actually retired this year,
 *    so a tranche that prepays faster than schedule recognises its discount faster; and
 *  - write-off — any remaining unamortised OID is recognised in full the year a tranche is
 *    swept to zero or refinanced (the instrument no longer exists to amortise against).
 *
 * The straight-line-over-remaining-life term telescopes to `oid/maturity` for a bullet held
 * to maturity (no repayment in-schedule, no refi — bullets carry their balance to exit), so a
 * deal without an early prepayment or refinancing is byte-for-byte unchanged. Returns
 * all-zeros when no tranche carries OID. Must be the SAME series used for the tax deduction
 * (projections) and the deferred-cost write-down (balance sheet), or the close breaks.
 */
export function oidAmortFromSchedule(state: ModelState, ds: DebtScheduleResult): number[] {
  const hp = state.exit.holding_period;
  const out = new Array<number>(hp).fill(0);
  const tranches = state.debt_tranches;

  for (let tIdx = 0; tIdx < tranches.length; tIdx++) {
    const t = tranches[tIdx];
    const oid = (t.oid_pct ?? 0) * t.principal;
    if (oid <= 0) continue;
    const maturity = t.debt_maturity_years && t.debt_maturity_years > 0 ? t.debt_maturity_years : hp;
    const sched = ds.tranche_schedules[tIdx] ?? [];
    const refiYearIdx = t.refinancing ? t.refinancing.year - 1 : -1;
    // A tranche drawn mid-hold (add-on acquisition debt) has no OID to amortise before it is
    // drawn — its balance is 0 in those years. Amortise only from the draw year, over the
    // post-draw remaining life. Entry-drawn tranches (drawIdx = 0) are unchanged.
    const drawIdx = t.draw_year_index ?? 0;

    let remaining = oid;
    for (let i = 0; i < hp; i++) {
      if (remaining <= OID_WRITEOFF_TOL) break;
      if (i < drawIdx) continue; // tranche not yet drawn — nothing to amortise
      const yr = sched[i];
      const begBal = yr ? yr.beginning_balance : 0;
      const endBal = yr ? yr.ending_balance : 0;

      // Write off in full the year the instrument disappears (refinanced, or swept to zero).
      const sweptToZero = begBal > OID_WRITEOFF_TOL && endBal <= OID_WRITEOFF_TOL;
      if (i === refiYearIdx || sweptToZero) {
        out[i] += remaining;
        remaining = 0;
        continue;
      }

      const yearsLeft = Math.max(1, maturity - (i - drawIdx));
      const timeSlice = remaining / yearsLeft;                          // ≡ oid/maturity for a held bullet
      const retired = Math.max(0, begBal - endBal);
      const prepayShare = begBal > OID_WRITEOFF_TOL ? remaining * (retired / begBal) : 0;
      const amort = Math.min(remaining, Math.max(timeSlice, prepayShare));
      out[i] += amort;
      remaining -= amort;
    }
    // A bullet with maturity > hold leaves its tail unamortised on the books (written off
    // against exit proceeds in returns) — preserved by NOT force-recognising the remainder.
  }
  return out;
}
