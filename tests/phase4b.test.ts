/**
 * Phase 4 — PR B: debt instrument features.
 *   P4-4  PIK toggle (per-year PIK vs cash election)
 *   P4-13 cash-trap / restricted-payment block
 *
 * Both opt-in: absent the new fields the engine is unchanged (existing suites).
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { canonicalDeals, tranche } from './fixtures/canonicalDeals';
import type { ModelState } from '../lib/dealEngineTypes';

function pikDeal(): ModelState {
  const s = canonicalDeals[0].build();
  s.debt_tranches = [
    tranche({ name: 'Senior TLB', principal: 70, amortization_type: 'bullet' }),
    tranche({ name: 'PIK Note', tranche_type: 'pik_note', principal: 30, amortization_type: 'PIK', pik_rate: 0.12, cash_interest: false }),
  ];
  return s;
}

describe('P4-4 PIK toggle', () => {
  it('always-PIK (no toggle) accretes the balance and pays no cash interest', () => {
    const s = fullRecalc(pikDeal());
    const pik = s.debt_schedule.tranche_schedules[1];
    expect(pik[0].pik_accrual).toBeGreaterThan(0);
    expect(pik[0].cash_interest).toBe(0);
    expect(pik[pik.length - 1].ending_balance).toBeGreaterThan(30); // accreted above par
  });

  it('electing cash every year pays cash interest, accretes nothing', () => {
    const d = pikDeal();
    d.debt_tranches[1].pik_toggle = true;
    d.debt_tranches[1].pik_election_by_year = [false, false, false, false, false];
    const s = fullRecalc(d);
    const pik = s.debt_schedule.tranche_schedules[1];
    for (const y of pik) {
      expect(y.pik_accrual).toBe(0);
      expect(y.cash_interest).toBeGreaterThan(0);
    }
    expect(pik[pik.length - 1].ending_balance).toBeCloseTo(30, 6); // bullet, no accretion
  });

  it('mixed election: PIK early, cash later', () => {
    const d = pikDeal();
    d.debt_tranches[1].pik_toggle = true;
    d.debt_tranches[1].pik_election_by_year = [true, true, false, false, false];
    const s = fullRecalc(d);
    const pik = s.debt_schedule.tranche_schedules[1];
    expect(pik[0].pik_accrual).toBeGreaterThan(0);
    expect(pik[0].cash_interest).toBe(0);
    expect(pik[2].pik_accrual).toBe(0);
    expect(pik[2].cash_interest).toBeGreaterThan(0);
    expect(s.balance_sheet.closes).toBe(true); // toggle stays close-safe
  });
});

describe('P4-13 cash-trap / dividend restriction', () => {
  function distDeal(): ModelState {
    // senior 80 bullet, EBITDA ~22; net leverage at the year-2 decision point
    // (cash before the distribution nets against debt) is ~2.4x.
    const s = canonicalDeals[0].build();
    s.exit.interim_distributions = [0, 3, 0, 0, 0];
    return s;
  }

  it('blocks the distribution when leverage breaches the trigger', () => {
    const s = distDeal();
    s.credit_covenants = { ...s.credit_covenants, distribution_block_leverage: 2.0 };
    const out = fullRecalc(s);
    expect(out.debt_schedule.distributions_paid_by_year[1]).toBe(0);
    expect(out.debt_schedule.distribution_blocked_by_year[1]).toBe(true);
    expect(out.balance_sheet.closes).toBe(true);
  });

  it('pays the distribution when the trigger is not breached', () => {
    const s = distDeal();
    s.credit_covenants = { ...s.credit_covenants, distribution_block_leverage: 10.0 };
    const out = fullRecalc(s);
    expect(out.debt_schedule.distributions_paid_by_year[1]).toBeGreaterThan(0);
    expect(out.debt_schedule.distribution_blocked_by_year[1]).toBe(false);
  });

  it('blocking retains cash on the balance sheet vs the unblocked case', () => {
    const blocked = fullRecalc((() => { const s = distDeal(); s.credit_covenants = { ...s.credit_covenants, distribution_block_leverage: 2.0 }; return s; })());
    const paid = fullRecalc((() => { const s = distDeal(); s.credit_covenants = { ...s.credit_covenants, distribution_block_leverage: 10.0 }; return s; })());
    expect(blocked.debt_schedule.cash_balance_by_year[1]).toBeGreaterThan(paid.debt_schedule.cash_balance_by_year[1]);
  });
});
