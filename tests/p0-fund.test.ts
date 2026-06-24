/**
 * P0 fix — fund economics (Bug 6).
 *   • GP catch-up: a fully-clearing deal gives the GP carry% of ALL profit above capital.
 *   • Paid-in capital includes follow-on (add-on) equity; interim draws are capital calls.
 *   • Preferred return accrues on outstanding capital (time-weighted).
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { canonicalDeals, debtFundedAddOn } from './fixtures/canonicalDeals';
import type { ModelState, FundAssumptions } from '../lib/dealEngineTypes';

const baseDeal = (): ModelState => canonicalDeals[0].build();
const fund = (o: Partial<FundAssumptions> = {}): FundAssumptions => ({
  management_fee_pct: 0.02, management_fee_basis: 'invested', carry_rate: 0.20,
  preferred_return: 0.08, carry_waterfall: 'european', fund_size: 1000, deal_allocation_pct: 0.1, ...o,
});

describe('Bug 6 — fund waterfall', () => {
  it('100% GP catch-up: carry equals carry% of total profit above capital (fees off)', () => {
    const s = baseDeal();
    s.fund_assumptions = fund({ management_fee_pct: 0 }); // isolate carry from the fee drag
    const fr = fullRecalc(s).fund_returns!;
    const profitAboveCapital = fr.lp_distributions + fr.carried_interest - fr.lp_paid_in;
    expect(profitAboveCapital).toBeGreaterThan(0);
    // After a full catch-up the GP nets exactly carry% of the whole profit (pref is only a
    // timing tier, not a permanent giveaway) — the old no-catch-up code gave strictly less.
    expect(fr.carried_interest / profitAboveCapital).toBeCloseTo(0.20, 3);
  });

  it('paid-in capital includes follow-on add-on equity', () => {
    const s = baseDeal();
    s.add_on_acquisitions = [{ ...debtFundedAddOn(), funding: 'equity', debt_pct: 0 }];
    s.fund_assumptions = fund();
    const out = fullRecalc(s);
    const fr = out.fund_returns!;
    expect(out.returns.add_on_equity_invested).toBeGreaterThan(0); // equity-funded bolt-on
    expect(fr.lp_paid_in).toBeCloseTo(out.returns.entry_equity + out.returns.add_on_equity_invested, 3);
  });

  it('an unbeatable preferred return leaves no carry and a positive shortfall', () => {
    const s = baseDeal();
    s.fund_assumptions = fund({ preferred_return: 0.5 }); // ~660% over 5y
    const fr = fullRecalc(s).fund_returns!;
    expect(fr.carried_interest).toBe(0);
    expect(fr.preferred_return_shortfall).toBeGreaterThan(0);
  });
});
