/**
 * Phase 4 — PR C: refinancing (P4-3).
 *   • repricing from the refi year (fixed → new all-in rate; floating → new spread/floor)
 *   • one-time prepayment/call premium charged in cash (and to equity on the BS)
 *   • maturity extension clears the refinancing-risk flag
 *
 * Opt-in: absent `refinancing` the engine is unchanged.
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { canonicalDeals, tranche } from './fixtures/canonicalDeals';
import type { ModelState } from '../lib/dealEngineTypes';

function fixedBulletDeal(): ModelState {
  const s = canonicalDeals[0].build();
  s.debt_tranches = [tranche({ name: 'Senior TLB', principal: 80, interest_rate: 0.07, amortization_type: 'bullet' })];
  return s;
}

describe('P4-3 refinancing — repricing', () => {
  it('resets a fixed tranche rate from the refi year onward', () => {
    const s = fixedBulletDeal();
    s.debt_tranches[0].refinancing = { year: 3, new_spread: 0.05, new_floor: 0, prepayment_premium: 0, extend_maturity_by: 0 };
    const out = fullRecalc(s);
    const sched = out.debt_schedule.tranche_schedules[0];
    expect(sched[0].effective_rate).toBeCloseTo(0.07, 6); // pre-refi
    expect(sched[2].effective_rate).toBeCloseTo(0.05, 6); // year-3 reprice
    expect(sched[2].cash_interest).toBeLessThan(sched[0].cash_interest);
  });

  it('a cheaper refinance (no premium) does not reduce returns vs base', () => {
    const base = fullRecalc(fixedBulletDeal());
    const s = fixedBulletDeal();
    s.debt_tranches[0].refinancing = { year: 3, new_spread: 0.05, new_floor: 0, prepayment_premium: 0, extend_maturity_by: 0 };
    const refi = fullRecalc(s);
    expect((refi.returns.irr ?? 0)).toBeGreaterThanOrEqual((base.returns.irr ?? 0) - 1e-9);
  });
});

describe('P4-3 refinancing — prepayment premium', () => {
  it('books the premium in the refi year and drains cash; BS still closes', () => {
    const noPrem = fixedBulletDeal();
    noPrem.debt_tranches[0].refinancing = { year: 3, new_spread: 0.07, new_floor: 0, prepayment_premium: 0, extend_maturity_by: 0 };
    const withPrem = fixedBulletDeal();
    withPrem.debt_tranches[0].refinancing = { year: 3, new_spread: 0.07, new_floor: 0, prepayment_premium: 0.02, extend_maturity_by: 0 };
    const a = fullRecalc(noPrem);
    const b = fullRecalc(withPrem);
    // ~2% of the ~£80m balance ≈ £1.6m, booked in year 3 (index 2).
    expect(b.debt_schedule.refinancing_premium_by_year[2]).toBeGreaterThan(1.4);
    expect(b.debt_schedule.refinancing_premium_by_year[2]).toBeLessThan(1.8);
    expect(b.debt_schedule.cash_balance_by_year[2]).toBeLessThan(a.debt_schedule.cash_balance_by_year[2]);
    expect(b.balance_sheet.closes).toBe(true);
  });
});

describe('P4-3 refinancing — maturity extension clears the wall', () => {
  it('a bullet >50% of debt flags refinancing risk; extending maturity beyond the hold clears it', () => {
    const base = fullRecalc(fixedBulletDeal());
    expect(base.credit_analysis.refinancing_risk).toBe(true); // bullet matures at exit

    const s = fixedBulletDeal();
    s.debt_tranches[0].refinancing = { year: 3, new_spread: 0.07, new_floor: 0, prepayment_premium: 0, extend_maturity_by: 5 }; // 3+5 > hp 5
    const out = fullRecalc(s);
    expect(out.credit_analysis.refinancing_risk).toBe(false);
  });
});
