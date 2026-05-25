/**
 * A3 UI-wiring contract: credit-covenant inputs (cash trap, springing, recovery
 * haircuts) and days-based working capital drive these engine fields, which the
 * CreditPanel / BalanceSheetTable read back. Pin the contract. Pure engine.
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { nwcBalance } from '../lib/engine/projections';
import { canonicalDeals } from './fixtures/canonicalDeals';

const base = () => canonicalDeals[0].build();

describe('A3 — Cash trap (distribution block)', () => {
  it('blocks the interim distribution when the leverage trigger is hit', () => {
    const open = base();
    open.exit.interim_distributions = [10, 0, 0, 0, 0];
    const a = fullRecalc(open);
    expect(a.debt_schedule.distributions_paid_by_year[0]).toBeGreaterThan(0);
    expect(a.debt_schedule.distribution_blocked_by_year[0]).toBe(false);

    const trapped = base();
    trapped.exit.interim_distributions = [10, 0, 0, 0, 0];
    trapped.credit_covenants.distribution_block_leverage = 0.1; // leverage always > 0.1 ⇒ block
    const b = fullRecalc(trapped);
    expect(b.debt_schedule.distribution_blocked_by_year[0]).toBe(true);
    expect(b.debt_schedule.distributions_paid_by_year[0]).toBe(0);
  });
});

describe('A3 — Springing DSCR covenant', () => {
  it('exposes a per-year breach array (length hp) when configured', () => {
    const s = base();
    s.credit_covenants.springing_dscr_covenant = 1.5;
    s.credit_covenants.springing_utilization_threshold = 0.35;
    const r = fullRecalc(s);
    expect(Array.isArray(r.credit_analysis.springing_breach_by_year)).toBe(true);
    expect(r.credit_analysis.springing_breach_by_year!.length).toBe(r.exit.holding_period);
  });
});

describe('A3 — Recovery haircuts', () => {
  it('surfaces default year + distressed EV, and a bigger EBITDA haircut lowers the distressed EV', () => {
    const r = fullRecalc(base());
    expect(r.credit_analysis.recovery_default_year).toBeGreaterThan(0);
    expect(r.credit_analysis.recovery_stress_ev).toBeGreaterThan(0);
    expect(r.credit_analysis.recovery_waterfall.length).toBeGreaterThan(0);

    const harsher = base();
    harsher.credit_covenants.recovery_ebitda_haircut = 0.7; // vs default 0.4
    const h = fullRecalc(harsher);
    expect(h.credit_analysis.recovery_stress_ev!).toBeLessThan(r.credit_analysis.recovery_stress_ev!);
  });
});

describe('A3 — Days-based working capital', () => {
  it('uses the DSO/DIO/DPO formula and still closes the balance sheet', () => {
    const rev = 100;
    const margin = 0.2;
    const pegOnly = { nwc_pct_revenue: 0.08 } as Parameters<typeof nwcBalance>[2];
    const days = { nwc_pct_revenue: 0.08, nwc_dso: 45, nwc_dio: 60, nwc_dpo: 45 } as Parameters<typeof nwcBalance>[2];
    expect(nwcBalance(rev, margin, days)).not.toBeCloseTo(nwcBalance(rev, margin, pegOnly), 6);

    const s = base();
    s.margins.nwc_dso = 45; s.margins.nwc_dio = 60; s.margins.nwc_dpo = 45;
    const r = fullRecalc(s);
    expect(r.balance_sheet.closes).toBe(true);
  });
});
