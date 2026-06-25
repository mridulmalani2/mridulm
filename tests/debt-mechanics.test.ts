/**
 * Phase 0B — debt mechanics.
 *
 * (1) The cash sweep draws on ACCUMULATED balance-sheet cash above the min-cash floor, not
 *     only the current year's FCF. The decisive proof: a year whose own FCF is negative can
 *     still pay down sweep debt by deploying cash banked in an earlier (cap-constrained) year.
 * (2) The sweep never breaches the min-cash floor and never double-counts (the cash
 *     roll-forward identity holds), and zero-leverage / canonical structures still close.
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { oidAmortFromSchedule, oidAmortByYear, oidTotal } from '../lib/engine/oid';
import { canonicalDeals, tranche } from './fixtures/canonicalDeals';
import type { ModelState } from '../lib/dealEngineTypes';

/**
 * Bank cash in year 1 (a low 25% sweep cap binds against strong FCF, so excess piles up on
 * the balance sheet), then crater year-2 FCF with a one-off growth-capex spike. Year 2's own
 * ECF is negative — any year-2 paydown must come from the year-1 cash pile.
 */
function bankThenCrash(): ModelState {
  const s = canonicalDeals[0].build();
  s.deal_name = 'Bank-then-crash sweep';
  s.revenue.growth_rates = [0, 0, 0, 0, 0];
  s.margins.base_ebitda_margin = 0.50;
  s.margins.target_ebitda_margin = 0.50;
  s.margins.capex_pct_revenue = 0.02;
  s.margins.da_pct_revenue = 0.02;
  s.margins.nwc_pct_revenue = 0;
  s.margins.growth_capex = [0, 40, 0, 0, 0]; // year-2 FCF crash
  s.entry.min_cash_balance = 2;
  s.debt_tranches = [
    tranche({ name: 'TLB', principal: 80, amortization_type: 'cash_sweep', cash_sweep_pct: 0.25, interest_rate: 0.06 }),
  ];
  return s;
}

describe('cash sweep deploys accumulated balance-sheet cash (Phase 0B)', () => {
  const s = fullRecalc(bankThenCrash());
  const proj = s.projections.years;
  const ds = s.debt_schedule;
  const minCash = s.entry.min_cash_balance;

  it('year 1 banks cash above the floor (the 25% cap binds)', () => {
    expect(ds.cash_balance_by_year[0]).toBeGreaterThan(minCash + 1); // excess piled up
  });

  it('year 2 pays down sweep debt even though its own FCF is negative — only the banked cash explains it', () => {
    expect(proj[1].fcf_pre_debt).toBeLessThan(0);                       // the crash
    expect(ds.total_debt_by_year[1]).toBeLessThan(ds.total_debt_by_year[0] - 0.5); // debt still fell
    expect(ds.cash_balance_by_year[1]).toBeLessThan(ds.cash_balance_by_year[0]);   // the pile was spent
  });

  it('the sweep never breaches the min-cash floor', () => {
    for (let i = 0; i < proj.length; i++) {
      expect(ds.cash_balance_by_year[i]).toBeGreaterThanOrEqual(minCash - 1e-6);
    }
  });

  it('cash roll-forward identity holds every year (no double-count)', () => {
    // ending cash = beginning + FCF − cash interest − commitment fees − total repayment
    //               − refinancing premium − distributions paid
    let beginning = 0;
    for (let i = 0; i < proj.length; i++) {
      const totalRepay = ds.total_repayment_by_year[i];
      const expected = beginning + proj[i].fcf_pre_debt
        - ds.total_cash_interest_by_year[i]
        - ds.total_commitment_fees_by_year[i]
        - totalRepay
        - ds.refinancing_premium_by_year[i]
        - ds.distributions_paid_by_year[i];
      expect(Math.abs(expected - ds.cash_balance_by_year[i])).toBeLessThan(1e-2);
      beginning = ds.cash_balance_by_year[i];
    }
  });

  it('three-statement model still closes', () => {
    expect(s.balance_sheet.closes).toBe(true);
  });
});

describe('the accumulated-cash sweep does not disturb zero-leverage or canonical deals', () => {
  it('all-equity deal closes and never sweeps', () => {
    const s = fullRecalc((() => { const x = canonicalDeals[0].build(); x.debt_tranches = []; return x; })());
    expect(s.balance_sheet.closes).toBe(true);
    expect(s.debt_schedule.total_repayment_by_year.every((r) => Math.abs(r) < 1e-9)).toBe(true);
  });

  it('every canonical structure still closes', () => {
    for (const d of canonicalDeals) {
      expect(fullRecalc(d.build()).balance_sheet.closes, d.name).toBe(true);
    }
  });
});

describe('OID amortisation: schedule-aware effective-interest + write-off (Phase 0B)', () => {
  it('a held bullet is unchanged — schedule-aware OID equals the straight-line seed', () => {
    const s = canonicalDeals[0].build();
    s.debt_tranches = [
      tranche({ name: 'TLB', principal: 80, amortization_type: 'bullet', interest_rate: 0.07, oid_pct: 0.05, debt_maturity_years: 7 }),
    ];
    const out = fullRecalc(s);
    const schedule = oidAmortFromSchedule(s, out.debt_schedule);
    const seed = oidAmortByYear(s);
    schedule.forEach((v, i) => expect(v).toBeCloseTo(seed[i], 9)); // telescopes to oid/maturity
    // maturity (7) > hold (5): the tail stays unamortised on the books, mirroring prior behaviour.
    expect(schedule.reduce((a, b) => a + b, 0)).toBeLessThan(oidTotal(s) - 1e-6);
    expect(out.balance_sheet.closes).toBe(true);
  });

  it('writes off the remaining discount when a tranche is swept to zero', () => {
    const s = canonicalDeals[0].build();
    s.debt_tranches = [
      tranche({ name: 'TLB', principal: 20, amortization_type: 'cash_sweep', cash_sweep_pct: 1.0, interest_rate: 0.06, oid_pct: 0.08, debt_maturity_years: 5 }),
    ];
    const out = fullRecalc(s);
    const tr = out.debt_schedule.tranche_schedules[0];
    const schedule = oidAmortFromSchedule(s, out.debt_schedule);
    const payoffYear = tr.findIndex((y) => y.ending_balance <= 1e-6);
    expect(payoffYear).toBeGreaterThanOrEqual(0);                 // it does pay off in-hold
    // ALL the OID is recognised by exit (none left amortising on debt that no longer exists),
    // unlike the held bullet above whose tail persists.
    expect(schedule.reduce((a, b) => a + b, 0)).toBeCloseTo(oidTotal(s), 6);
    // Nothing is recognised after the tranche is gone.
    for (let i = payoffYear + 1; i < schedule.length; i++) expect(schedule[i]).toBeCloseTo(0, 9);
    expect(out.balance_sheet.closes).toBe(true);
  });

  it('writes off the remaining discount in the refinancing year', () => {
    const s = canonicalDeals[0].build();
    s.debt_tranches = [
      tranche({
        name: 'TLB', principal: 80, amortization_type: 'bullet', interest_rate: 0.07, oid_pct: 0.05, debt_maturity_years: 7,
        refinancing: { year: 3, new_spread: 0.08, new_floor: 0, prepayment_premium: 0.02, extend_maturity_by: 3 },
      }),
    ];
    const out = fullRecalc(s);
    const schedule = oidAmortFromSchedule(s, out.debt_schedule);
    const straightSlice = oidTotal(s) / 7;
    // The refi year (index 2) accelerates the whole remaining discount, far above one slice.
    expect(schedule[2]).toBeGreaterThan(straightSlice * 2);
    expect(schedule.slice(3).every((v) => v <= 1e-9)).toBe(true); // none left after the refi
    expect(schedule.reduce((a, b) => a + b, 0)).toBeCloseTo(oidTotal(s), 6);
    expect(out.balance_sheet.closes).toBe(true);
  });
});
