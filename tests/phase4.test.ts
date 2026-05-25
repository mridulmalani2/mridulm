/**
 * Phase 4 — PR A: returns-module IC features.
 *   P4-1 MIP ratchet / dual hurdle
 *   P4-2 fund-level (LP-facing) returns
 *   P4-5 partial exit / IPO selldown
 *
 * Every feature is opt-in: with the new fields absent, results are byte-identical
 * to the pre-Phase-4 engine (asserted explicitly below + by the existing suites).
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { canonicalDeals } from './fixtures/canonicalDeals';
import type { ModelState, FundAssumptions } from '../lib/dealEngineTypes';

function baseDeal(): ModelState {
  return canonicalDeals[0].build();
}

/** Effective MIP pool % implied by the post-MIP outputs (no partial exits ⇒
 *  exit_equity = preMip − mip; pool = mip / (exit_equity + mip)). */
function impliedPool(r: { mip_payout: number; exit_equity: number }): number {
  const preMip = r.exit_equity + r.mip_payout;
  return preMip > 0 ? r.mip_payout / preMip : 0;
}

describe('P4-1 MIP ratchet / dual hurdle', () => {
  // Pre-MIP MOIC of the canonical deal, measured with MIP switched off.
  const noMip = baseDeal();
  noMip.mip.hurdle_moic = 99; // never clears ⇒ payout 0 ⇒ exit_equity == full pre-MIP
  const noMipR = fullRecalc(noMip).returns;
  const preMipMoic = noMipR.exit_equity / noMipR.entry_equity;

  it('a single-tier ratchet equal to the legacy hurdle reproduces single-hurdle behaviour', () => {
    const legacy = fullRecalc(baseDeal()).returns; // default pool 0.15, hurdle 2.0
    const r = baseDeal();
    r.mip.ratchet_tiers = [{ moic_threshold: r.mip.hurdle_moic, pool_pct: r.mip.mip_pool_pct }];
    const ratchet = fullRecalc(r).returns;
    expect(Math.abs(ratchet.mip_payout - legacy.mip_payout)).toBeLessThan(1e-6);
    expect(Math.abs((ratchet.irr ?? 0) - (legacy.irr ?? 0))).toBeLessThan(1e-9);
  });

  it('selects the highest cleared MOIC tier', () => {
    const r = baseDeal();
    r.mip.ratchet_tiers = [
      { moic_threshold: preMipMoic - 1.0, pool_pct: 0.10 },
      { moic_threshold: preMipMoic - 0.2, pool_pct: 0.18 }, // highest cleared
      { moic_threshold: preMipMoic + 1.0, pool_pct: 0.25 }, // not cleared
    ];
    const out = fullRecalc(r).returns;
    expect(impliedPool(out)).toBeCloseTo(0.18, 4);
  });

  it('dual hurdle: an unreachable IRR threshold disqualifies its tier', () => {
    const r = baseDeal();
    r.mip.ratchet_tiers = [
      { moic_threshold: preMipMoic - 1.0, pool_pct: 0.10 },                    // clears (MOIC only)
      { moic_threshold: preMipMoic - 0.2, pool_pct: 0.18, irr_threshold: 5.0 }, // blocked by 500% IRR hurdle
    ];
    const out = fullRecalc(r).returns;
    expect(impliedPool(out)).toBeCloseTo(0.10, 4); // falls back to the MOIC-only tier
  });

  it('pays nothing when no tier clears', () => {
    const r = baseDeal();
    r.mip.ratchet_tiers = [{ moic_threshold: preMipMoic + 5, pool_pct: 0.20 }];
    const out = fullRecalc(r).returns;
    expect(out.mip_payout).toBe(0);
  });
});

describe('P4-2 fund-level returns', () => {
  const fund: FundAssumptions = {
    management_fee_pct: 0.02,
    management_fee_basis: 'invested',
    carry_rate: 0.20,
    preferred_return: 0.08,
    carry_waterfall: 'european',
    fund_size: 1000,
    deal_allocation_pct: 0.1,
  };

  it('is undefined when no fund_assumptions are set', () => {
    expect(fullRecalc(baseDeal()).fund_returns).toBeUndefined();
  });

  it('net IRR/MOIC sit below gross, with a positive gross-to-net spread', () => {
    const s = baseDeal();
    s.fund_assumptions = { ...fund };
    const out = fullRecalc(s);
    const fr = out.fund_returns!;
    expect(fr).toBeDefined();
    expect(fr.management_fees_total).toBeGreaterThan(0);
    expect(fr.carried_interest).toBeGreaterThan(0);
    expect(fr.net_moic).toBeLessThan(fr.gross_moic);
    expect(fr.net_irr!).toBeLessThan(fr.gross_irr!);
    expect(fr.gross_to_net_spread!).toBeGreaterThan(0);
  });

  it('zero fees and zero carry ⇒ net == gross', () => {
    const s = baseDeal();
    s.fund_assumptions = { ...fund, management_fee_pct: 0, carry_rate: 0 };
    const out = fullRecalc(s);
    const fr = out.fund_returns!;
    expect(fr.carried_interest).toBe(0);
    expect(fr.management_fees_total).toBe(0);
    expect(Math.abs(fr.net_moic - fr.gross_moic)).toBeLessThan(1e-6);
    expect(Math.abs((fr.net_irr ?? 0) - (fr.gross_irr ?? 0))).toBeLessThan(1e-9);
  });

  it('a preferred return above total profit leaves no carry (European)', () => {
    const s = baseDeal();
    s.fund_assumptions = { ...fund, preferred_return: 0.5 }; // ~659% over 5y — unbeatable
    const fr = fullRecalc(s).fund_returns!;
    expect(fr.carried_interest).toBe(0);
    expect(fr.preferred_return_shortfall).toBeGreaterThan(0);
  });
});

describe('P4-5 partial exit / IPO selldown', () => {
  const base = fullRecalc(baseDeal());
  const hp = base.exit.holding_period;

  it('books proceeds at the event year and reduces the residual at exit', () => {
    const s = baseDeal();
    s.exit.partial_exits = [{ year: 3, pct_sold: 0.3, exit_multiple: s.exit.exit_ebitda_multiple, exit_fee_pct: 0 }];
    const out = fullRecalc(s);
    const cf = out.returns.equity_cashflows;
    expect(cf[3]).toBeGreaterThan(0);                       // proceeds booked in year 3
    expect(cf[3]).toBeGreaterThan(base.returns.equity_cashflows[3]); // base had ~0 there
    expect(cf[hp]).toBeLessThan(base.returns.equity_cashflows[hp]);  // smaller residual at exit
  });

  it('MOIC reconciles to (exit_equity + distributions) / entry, and gives up growth vs full hold', () => {
    const s = baseDeal();
    s.exit.partial_exits = [{ year: 3, pct_sold: 0.3, exit_multiple: s.exit.exit_ebitda_multiple, exit_fee_pct: 0 }];
    const r = fullRecalc(s).returns;
    const recon = (r.exit_equity + r.total_distributions) / r.entry_equity;
    expect(Math.abs(r.moic - recon)).toBeLessThan(1e-6);
    expect(r.moic).toBeGreaterThan(1);
    // Selling 30% early at the same multiple forgoes later growth ⇒ total MOIC not above base.
    expect(r.moic).toBeLessThan(base.returns.moic + 1e-6);
  });

  it('a 100% sale mid-hold leaves no residual at exit', () => {
    const s = baseDeal();
    s.exit.partial_exits = [{ year: 2, pct_sold: 1.0, exit_multiple: s.exit.exit_ebitda_multiple, exit_fee_pct: 0 }];
    const out = fullRecalc(s);
    const cf = out.returns.equity_cashflows;
    expect(cf[2]).toBeGreaterThan(0);            // everything realised in year 2
    expect(Math.abs(cf[hp])).toBeLessThan(1e-6); // nothing left at exit
  });
});
