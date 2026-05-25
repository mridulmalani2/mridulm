/**
 * Workstream D — equity-funded add-on acquisitions book the sponsor-equity outflow
 * in returns. Previously only debt-funded bolt-ons paid their way (via synthetic
 * debt); equity/mixed-funded bolt-ons gave the EBITDA uplift for free, overstating
 * IRR/MOIC. The fix books the equity portion as a follow-on outflow at the
 * acquisition year and includes it in the invested base for MOIC.
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { canonicalDeals } from './fixtures/canonicalDeals';
import type { AddOnAcquisition } from '../lib/dealEngineTypes';

// purchase price = 50 × 0.2 × 8 = 80
const addon = (funding: AddOnAcquisition['funding'], debt_pct = 0): AddOnAcquisition => ({
  name: 'Bolt-on', year: 2, revenue: 50, ebitda_margin: 0.2, purchase_multiple: 8,
  funding, debt_pct, synergy_revenue: 0, synergy_cost: 0, integration_cost: 0,
});

describe('D — add-on equity outflow in returns', () => {
  it('debt-funded bolt-on: no sponsor equity outflow; MOIC denominator stays entry equity', () => {
    const s = canonicalDeals[0].build();
    s.add_on_acquisitions = [addon('debt', 1)];
    const r = fullRecalc(s).returns;
    expect(r.add_on_equity_invested).toBeCloseTo(0, 6);
    expect(r.moic).toBeCloseTo((r.exit_equity + r.total_distributions) / r.entry_equity, 6);
  });

  it('equity-funded bolt-on: books the full purchase price as follow-on equity', () => {
    const s = canonicalDeals[0].build();
    s.add_on_acquisitions = [addon('equity')];
    const r = fullRecalc(s).returns;
    expect(r.add_on_equity_invested).toBeCloseTo(80, 6);
    // MOIC denominator = entry equity + add-on equity (multi-round invested base).
    expect(r.moic).toBeCloseTo((r.exit_equity + r.total_distributions) / (r.entry_equity + 80), 6);
    // The outflow lands at the acquisition year (year 2 ⇒ index 2 of [t0..hp]).
    expect(r.equity_cashflows[2]).toBeCloseTo(-80, 6);
  });

  it('mixed-funded bolt-on: only the equity portion is booked', () => {
    const s = canonicalDeals[0].build();
    s.add_on_acquisitions = [addon('mixed', 0.5)];
    const r = fullRecalc(s).returns;
    expect(r.add_on_equity_invested).toBeCloseTo(40, 6); // 50% of 80
    expect(r.equity_cashflows[2]).toBeCloseTo(-40, 6);
  });

  it('charging the equity outflow lowers IRR vs ignoring it (debt-funded baseline higher)', () => {
    const eq = canonicalDeals[0].build();
    eq.add_on_acquisitions = [addon('equity')];
    const debt = canonicalDeals[0].build();
    debt.add_on_acquisitions = [addon('debt', 1)];
    const eqRet = fullRecalc(eq).returns;
    const debtRet = fullRecalc(debt).returns;
    // Same bolt-on EBITDA either way, but equity funding requires real sponsor cash
    // up front (no leverage), so its MOIC is lower than the debt-funded structure.
    expect(eqRet.moic).toBeLessThan(debtRet.moic);
  });

  it('no add-ons: add_on_equity_invested is 0 (unchanged path)', () => {
    expect(fullRecalc(canonicalDeals[0].build()).returns.add_on_equity_invested).toBe(0);
  });
});
