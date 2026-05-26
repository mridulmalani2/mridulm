/**
 * A1 UI-wiring contract: the Fund/Returns UI surface reads these engine fields
 * and helpers and relies on the fund overlay being purely additive. These tests
 * pin that contract (field names + invariants) so a future engine rename can't
 * silently break the panels. Pure engine — no DOM.
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { monitoringTerminationPayment } from '../lib/engine/returns';
import { canonicalDeals } from './fixtures/canonicalDeals';
import type { ModelState } from '../lib/dealEngineTypes';

const buildBase = () => canonicalDeals[0].build();

describe('A1 — Fund Economics overlay (FundReturnsPanel)', () => {
  it('is purely additive: deal-level IRR/MOIC are unchanged when fund_assumptions is set', () => {
    const base = fullRecalc(buildBase());

    const withFund = buildBase();
    withFund.fund_assumptions = {
      management_fee_pct: 0.02,
      management_fee_basis: 'invested',
      carry_rate: 0.2,
      preferred_return: 0.08,
      carry_waterfall: 'european',
      fund_size: 1000,
      deal_allocation_pct: 0.1,
    };
    const fundState = fullRecalc(withFund);

    expect(fundState.returns.irr).toBe(base.returns.irr);
    expect(fundState.returns.moic).toBe(base.returns.moic);

    const fr = fundState.fund_returns;
    expect(fr, 'fund_returns must be computed when fund_assumptions is set').toBeDefined();
    expect(fr!.gross_irr).toBe(fundState.returns.irr);
    expect(Number.isFinite(fr!.net_moic)).toBe(true);
    // Fees + carry are a drag: net ≤ gross.
    expect(fr!.net_moic).toBeLessThanOrEqual(fr!.gross_moic + 1e-9);
    expect(fr!.management_fees_total).toBeGreaterThan(0);
  });

  it('leaves fund_returns undefined when fund_assumptions is absent', () => {
    expect(fullRecalc(buildBase()).fund_returns).toBeUndefined();
  });
});

describe('A1 — MIP ratchet resolution (SponsorReturnsDetail)', () => {
  it('a cleared ratchet tier overrides the single hurdle and the UI pre-MIP MOIC matches', () => {
    const s = buildBase();
    s.mip.mip_pool_pct = 0.1;
    s.mip.hurdle_moic = 99; // scalar hurdle never clears → scalar pays 0
    s.mip.ratchet_tiers = [{ moic_threshold: 1.2, pool_pct: 0.15 }];
    const r = fullRecalc(s);

    // The UI recomputes pre-MIP full-exit MOIC from exposed fields; replicate it here.
    const ret = r.returns;
    const monTerm = monitoringTerminationPayment(r);
    const exitFee = r.fees.exit_fee_pct * ret.exit_ev;
    const preMipMoic = (ret.exit_ev - ret.exit_net_debt - exitFee - monTerm) / ret.entry_equity;

    expect(preMipMoic).toBeGreaterThanOrEqual(1.2); // tier is cleared
    expect(ret.mip_payout).toBeGreaterThan(0);      // ratchet pool applied despite scalar hurdle = 99x
  });
});

describe('A1 — Partial exits (SponsorReturnsDetail)', () => {
  it('books interim proceeds into equity_cashflows and MOIC reconciles', () => {
    const s: ModelState = buildBase();
    s.exit.partial_exits = [{ year: 2, pct_sold: 0.3, exit_multiple: 10, exit_fee_pct: 0.01 }];
    const r = fullRecalc(s);

    const cfs = r.returns.equity_cashflows;
    expect(cfs.length).toBe(s.exit.holding_period + 1); // [t0..hp]
    expect(cfs[2]).toBeGreaterThan(0);                   // proceeds booked at the event year
    // exit_equity = realised residual + interim partials, so MOIC ties out.
    const moicCheck = (r.returns.exit_equity + r.returns.total_distributions) / r.returns.entry_equity;
    expect(Math.abs(moicCheck - r.returns.moic)).toBeLessThan(1e-6);
  });
});

describe('A1 — Monitoring-fee termination (SponsorReturnsDetail)', () => {
  it('matches the analytic annuity PV and reduces equity IRR as an exit cost', () => {
    const noTerm = buildBase();
    noTerm.fees.monitoring_fee_annual = 2;
    noTerm.fees.monitoring_fee_termination_years = 0;
    const a = fullRecalc(noTerm);

    const withTerm = buildBase();
    withTerm.fees.monitoring_fee_annual = 2;
    withTerm.fees.monitoring_fee_termination_years = 3;
    withTerm.fees.monitoring_fee_discount_rate = 0.1;
    const b = fullRecalc(withTerm);

    const annuityPv = (1 - Math.pow(1.1, -3)) / 0.1;
    expect(monitoringTerminationPayment(withTerm)).toBeCloseTo(2 * annuityPv, 6);
    expect(monitoringTerminationPayment(noTerm)).toBe(0);
    // The accelerated termination payment is an extra exit cost → lower equity IRR.
    expect(b.returns.irr!).toBeLessThanOrEqual(a.returns.irr!);
  });
});
