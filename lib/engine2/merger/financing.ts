/**
 * lib/engine2/merger/financing.ts — the acquisition debt schedule (SPEC §29.13). Interest on
 * BEGINNING balances (SPEC §4); no circularity: the sweep is applied after everything it depends on.
 */
import type { MergerTranche, TrancheYear } from './types';

/** Year 0, the pro forma view: every tranche outstanding at its amount, a full year of interest and fees. */
export function trancheYear0(t: MergerTranche, amount: number): TrancheYear {
  const fee = t.fee_pct * amount;
  return { begin: amount, scheduled: 0, sweep: 0, end: amount, interest: t.rate * amount, fee_amortisation: Math.min(fee, fee / t.fee_years) };
}

/**
 * Year t ≥ 1 before the sweep. `prev` is the previous FORECAST year (null in year 1, which begins
 * at the amount); `feeLeft` the unamortised fee at the start of the year. A tranche that begins the
 * year fully repaid writes off what is left of its fee (§29.13).
 */
export function trancheYearPreSweep(t: MergerTranche, amount: number, prev: TrancheYear | null, feeLeft: number, s: number, year: number): TrancheYear {
  const begin = prev === null ? amount : prev.end;
  const scheduled = Math.min(t.repayment[year - 1], begin);
  const fee = t.fee_pct * amount;
  const feeAm = begin <= 1e-9 ? feeLeft : Math.min(feeLeft, (fee / t.fee_years) * s);
  return { begin, scheduled, sweep: 0, end: begin - scheduled, interest: t.rate * begin * s, fee_amortisation: feeAm };
}

/** §29.13: the sweep, applied to sweeping tranches in their listed order, each capped at its outstanding. */
export function applySweep(tranches: MergerTranche[], years: TrancheYear[], amount: number): TrancheYear[] {
  let left = amount;
  return years.map((y, i) => {
    if (!tranches[i].sweep || left <= 0) return y;
    const take = Math.min(left, y.end);
    left -= take;
    return { ...y, sweep: take, end: y.end - take };
  });
}
