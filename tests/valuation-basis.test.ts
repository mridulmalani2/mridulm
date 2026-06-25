/**
 * Phase 0D — LTM vs NTM EBITDA valuation basis.
 *
 * The entry/exit multiple can be quoted on last-twelve-months (LTM, default) or
 * next-twelve-months (NTM, forward) EBITDA. NTM applies the same multiple to forward EBITDA,
 * so it implies a higher EV on a growing target. Leverage stays on LTM EBITDA; the default
 * (LTM) reproduces the existing numbers exactly.
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { canonicalDeals } from './fixtures/canonicalDeals';
import type { ModelState } from '../lib/dealEngineTypes';

const base = () => canonicalDeals[0].build(); // EBITDA 20 (rev 100 × 0.20), multiple 10×, growth [0.06,…,0.04]

describe('entry EBITDA basis (Phase 0D)', () => {
  it('NTM raises entry EV by the Y1 growth factor, same multiple; leverage stays on LTM', () => {
    const ltm = fullRecalc((() => { const s = base(); s.entry.entry_ebitda_basis = 'ltm'; return s; })());
    const ntm = fullRecalc((() => { const s = base(); s.entry.entry_ebitda_basis = 'ntm'; return s; })());

    const y1 = ltm.revenue.growth_rates[0]; // 0.06
    expect(ntm.entry.enterprise_value).toBeCloseTo(ltm.entry.enterprise_value * (1 + y1), 6);
    expect(ntm.entry.enterprise_value).toBeGreaterThan(ltm.entry.enterprise_value);
    // Leverage is quoted on LTM EBITDA regardless of the valuation basis ⇒ unchanged.
    expect(ntm.entry.leverage_ratio).toBeCloseTo(ltm.entry.leverage_ratio, 9);
    expect(ntm.balance_sheet.closes).toBe(true);
  });

  it('default (unset) basis equals explicit LTM', () => {
    const def = fullRecalc(base());
    const ltm = fullRecalc((() => { const s = base(); s.entry.entry_ebitda_basis = 'ltm'; return s; })());
    expect(def.entry.enterprise_value).toBeCloseTo(ltm.entry.enterprise_value, 9);
    expect(def.returns.irr ?? 0).toBeCloseTo(ltm.returns.irr ?? 0, 9);
  });
});

describe('exit EBITDA basis (Phase 0D)', () => {
  it('NTM raises exit EV by the terminal growth factor, same multiple', () => {
    const ltm = fullRecalc((() => { const s = base(); s.exit.exit_ebitda_basis = 'ltm'; return s; })());
    const ntm = fullRecalc((() => { const s = base(); s.exit.exit_ebitda_basis = 'ntm'; return s; })());

    const terminal = ltm.revenue.growth_rates[ltm.exit.holding_period - 1]; // 0.04
    expect(ntm.returns.exit_ev).toBeCloseTo(ltm.returns.exit_ev * (1 + terminal), 4);
    expect(ntm.returns.exit_ev).toBeGreaterThan(ltm.returns.exit_ev);
    // A higher exit EV ⇒ higher exit equity ⇒ higher IRR.
    expect(ntm.returns.irr ?? 0).toBeGreaterThan(ltm.returns.irr ?? 0);
    expect(ntm.balance_sheet.closes).toBe(true);
  });

  it('an exit EV override still wins over the NTM basis', () => {
    const s = base();
    s.exit.exit_ebitda_basis = 'ntm';
    s.exit.exit_ev_override = 250;
    const o = fullRecalc(s);
    expect(o.returns.exit_ev).toBeCloseTo(250, 6);
  });
});

describe('LTM/NTM compose on both ends', () => {
  it('NTM entry + NTM exit both close and value off forward EBITDA', () => {
    const s: ModelState = base();
    s.entry.entry_ebitda_basis = 'ntm';
    s.exit.exit_ebitda_basis = 'ntm';
    const o = fullRecalc(s);
    expect(o.balance_sheet.closes).toBe(true);
    expect(o.entry.enterprise_value).toBeGreaterThan(200); // > LTM EV of 20 × 10
  });
});
