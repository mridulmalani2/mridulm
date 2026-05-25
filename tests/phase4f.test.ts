/**
 * Phase 4 — PR E2: DSO/DIO/DPO working capital (P4-9). Opt-in; absent the days
 * fields the engine uses the revenue peg (unchanged).
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { nwcBalance } from '../lib/engine/projections';
import { canonicalDeals } from './fixtures/canonicalDeals';

describe('P4-9 DSO/DIO/DPO working capital', () => {
  it('nwcBalance is days-based when DSO/DIO/DPO are set, else the revenue peg', () => {
    const pegOnly = { nwc_pct_revenue: 0.1 } as any;
    expect(nwcBalance(100, 0.2, pegOnly)).toBeCloseTo(10, 6);

    const days = { nwc_pct_revenue: 0.1, nwc_dso: 73, nwc_dio: 73, nwc_dpo: 36.5 } as any;
    // rev=100, cogs=80: A/R=100×73/365=20, Inv=80×73/365=16, A/P=80×36.5/365=8 ⇒ 28.
    expect(nwcBalance(100, 0.2, days)).toBeCloseTo(28, 6);
  });

  it('extending DPO lowers the working-capital balance', () => {
    const tight = { nwc_pct_revenue: 0.1, nwc_dso: 60, nwc_dio: 60, nwc_dpo: 30 } as any;
    const extended = { nwc_pct_revenue: 0.1, nwc_dso: 60, nwc_dio: 60, nwc_dpo: 90 } as any;
    expect(nwcBalance(100, 0.2, extended)).toBeLessThan(nwcBalance(100, 0.2, tight));
  });

  it('days-based NWC drives ΔNWC and the three-statement model still closes', () => {
    const peg = fullRecalc(canonicalDeals[0].build());
    const s = canonicalDeals[0].build();
    s.margins.nwc_dso = 90;
    s.margins.nwc_dio = 75;
    s.margins.nwc_dpo = 45;
    const days = fullRecalc(s);
    // ΔNWC differs from the peg method.
    const diff = days.projections.years.some((y, i) => Math.abs(y.delta_nwc - peg.projections.years[i].delta_nwc) > 1e-6);
    expect(diff).toBe(true);
    expect(days.balance_sheet.closes).toBe(true);
    // The reported NWC balance equals the days-based balance at exit.
    const exitYr = days.projections.years.length - 1;
    const expected = nwcBalance(days.projections.years[exitYr].revenue, days.projections.years[exitYr].ebitda_margin, s.margins);
    expect(days.balance_sheet.years[exitYr].net_working_capital).toBeCloseTo(expected, 3);
  });

  it('absent the days fields, ΔNWC is identical to the revenue peg', () => {
    const a = fullRecalc(canonicalDeals[0].build());
    const b = fullRecalc(canonicalDeals[0].build());
    for (let i = 0; i < a.projections.years.length; i++) {
      expect(a.projections.years[i].delta_nwc).toBeCloseTo(b.projections.years[i].delta_nwc, 9);
    }
  });
});
