/**
 * Phase 4 — PR E4: Original Issue Discount (P4-14). Returns-affecting only when oid_pct
 * is set: OID is funded by extra equity at close and amortised as non-cash, tax-deductible
 * interest over the tranche maturity. Absent ⇒ unchanged.
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { oidTotal, oidAmortByYear } from '../lib/engine/oid';
import { canonicalDeals } from './fixtures/canonicalDeals';
import type { ModelState } from '../lib/dealEngineTypes';

function oidDeal(oidPct = 0.02, maturity?: number): ModelState {
  const s = canonicalDeals[0].build(); // single senior 80 bullet
  s.debt_tranches[0].oid_pct = oidPct;
  if (maturity != null) s.debt_tranches[0].debt_maturity_years = maturity;
  return s;
}

describe('P4-14 OID', () => {
  it('oidTotal and the amort schedule are computed from par', () => {
    const s = oidDeal(0.02);
    expect(oidTotal(s)).toBeCloseTo(1.6, 6); // 2% × 80
    // No maturity ⇒ amortise over the 5y hold: 0.32/yr.
    expect(oidAmortByYear(s).every((a) => Math.abs(a - 0.32) < 1e-6)).toBe(true);
  });

  it('raises entry equity by the OID and lowers returns; BS still closes', () => {
    const base = fullRecalc(canonicalDeals[0].build());
    const out = fullRecalc(oidDeal(0.02));
    expect(out.returns.entry_equity - base.returns.entry_equity).toBeCloseTo(1.6, 2);
    expect(out.returns.moic).toBeLessThan(base.returns.moic);
    expect(out.balance_sheet.closes).toBe(true);
  });

  it('amortises as non-cash interest expense (lowers EBT by OID/maturity)', () => {
    const base = fullRecalc(canonicalDeals[0].build());
    const out = fullRecalc(oidDeal(0.02));
    // Year 1 EBT is lower by the OID amortisation (£0.32m); interest is unchanged.
    expect(base.projections.years[0].ebt - out.projections.years[0].ebt).toBeCloseTo(0.32, 3);
  });

  it('honours debt_maturity_years beyond the hold (closes; partial amort)', () => {
    const s = oidDeal(0.02, 8); // amortise 1.6 over 8y ⇒ 0.2/yr, only 5y within the hold
    const amort = oidAmortByYear(s);
    expect(amort.every((a) => Math.abs(a - 0.2) < 1e-6)).toBe(true);
    expect(fullRecalc(s).balance_sheet.closes).toBe(true);
  });

  it('no OID ⇒ unchanged', () => {
    const a = fullRecalc(canonicalDeals[0].build());
    const b = fullRecalc(canonicalDeals[0].build());
    expect(a.returns.entry_equity).toBeCloseTo(b.returns.entry_equity, 9);
    expect(oidTotal(canonicalDeals[0].build())).toBe(0);
  });
});
