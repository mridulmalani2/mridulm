/**
 * A2 UI-wiring contract: the debt-instrument inputs (PIK toggle, refinancing,
 * OID) drive these engine fields/helpers, and the DebtScheduleTable reads them
 * back. Pin the contract so a rename can't silently break the panel. Pure engine.
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { oidTotal, oidAmortByYear } from '../lib/engine/oid';
import { canonicalDeals } from './fixtures/canonicalDeals';

const base = () => canonicalDeals[0].build();              // simple-bullet, one 80 tranche
const pikDeal = () => canonicalDeals.find((d) => d.name === 'pik')!.build(); // [Senior, PIK note]

describe('A2 — OID (per-tranche)', () => {
  it('is funded by extra entry equity and amortises straight-line to the OID total', () => {
    const b = fullRecalc(base());

    const s = base();
    s.debt_tranches[0].oid_pct = 0.02;
    s.debt_tranches[0].debt_maturity_years = 5;
    const r = fullRecalc(s);

    const total = oidTotal(r);
    expect(total).toBeCloseTo(0.02 * s.debt_tranches[0].principal, 9);
    // OID raises entry equity by exactly the upfront discount; exit (par) unchanged.
    expect(r.returns.entry_equity - b.returns.entry_equity).toBeCloseTo(total, 6);

    const amort = oidAmortByYear(r);
    expect(amort.length).toBe(r.exit.holding_period);
    expect(amort.reduce((a, c) => a + c, 0)).toBeCloseTo(total, 6); // maturity == hp ⇒ fully amortised
  });
});

describe('A2 — Refinancing premium (per-tranche)', () => {
  it('books a one-time premium in the refi year equal to premium × opening balance', () => {
    const s = base();
    s.debt_tranches[0].refinancing = { year: 3, new_spread: 0.08, new_floor: 0, prepayment_premium: 0.02, extend_maturity_by: 0 };
    const r = fullRecalc(s);

    const prem = r.debt_schedule.refinancing_premium_by_year;
    expect(prem.length).toBe(r.exit.holding_period);
    const openingY3 = r.debt_schedule.tranche_schedules[0][2].beginning_balance;
    expect(prem[2]).toBeCloseTo(0.02 * openingY3, 6);
    expect(prem.filter((_, i) => i !== 2).every((v) => v === 0)).toBe(true);
  });
});

describe('A2 — PIK toggle election (per-tranche)', () => {
  it('cash election pays cash interest and does not accrete; PIK election accretes', () => {
    const always = fullRecalc(pikDeal()); // no toggle → always PIK
    const pikIdx = 1;
    expect(always.debt_schedule.tranche_schedules[pikIdx][0].pik_accrual).toBeGreaterThan(0);
    expect(always.debt_schedule.tranche_schedules[pikIdx][0].cash_interest).toBe(0);

    const s = pikDeal();
    s.debt_tranches[pikIdx].pik_toggle = true;
    s.debt_tranches[pikIdx].pik_election_by_year = [false, true, true, true, true]; // year 1 cash
    const r = fullRecalc(s);
    const y1 = r.debt_schedule.tranche_schedules[pikIdx][0];
    const y2 = r.debt_schedule.tranche_schedules[pikIdx][1];
    expect(y1.cash_interest).toBeGreaterThan(0);
    expect(y1.pik_accrual).toBe(0);
    expect(y2.pik_accrual).toBeGreaterThan(0);
    expect(y2.cash_interest).toBe(0);
  });
});
