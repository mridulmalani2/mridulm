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

import type { ModelState } from '../dealEngineTypes';

/** Total OID across all tranches (par × oid_pct) — the upfront discount funded at close. */
export function oidTotal(state: ModelState): number {
  return state.debt_tranches.reduce((s, t) => s + (t.oid_pct ?? 0) * t.principal, 0);
}

/** Per-hold-year OID amortisation, straight-line over each tranche's maturity
 *  (debt_maturity_years, falling back to the holding period), summed across tranches. */
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
