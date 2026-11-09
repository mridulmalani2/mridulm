/**
 * SPEC §23 [v2.2.0] partial exits / IPO selldown — the engine held to the adjudicated golden
 * G11-SELL (tests/goldens/G11SELL; both blind passes signed) and to every §23.13 directed
 * fixture, (i)–(xii), for the branches no golden can see.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runModel } from '../lib/engine2/facade';
import { GOLDEN_DEALS, g2DownsideAssumptions } from './fixtures/engine2-golden-deals';
import type { DealAssumptions } from '../lib/engine2/types';

const load = (n: string) => JSON.parse(readFileSync(join(__dirname, 'goldens', n, 'expected.json'), 'utf8'));
const host = GOLDEN_DEALS.G2DIST;
const G11 = GOLDEN_DEALS.G11SELL;
const withSell = (a: DealAssumptions, sd: DealAssumptions['structure']['selldown']): DealAssumptions => ({ ...a, structure: { ...a.structure, selldown: sd } });
const sumOf = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const DISPLAY = 0.0075; // ±$0.005m display bar + 2dp fixture rounding (§15)

describe('G11-SELL — the engine against the adjudicated golden', () => {
  const o = runModel(G11.facts, G11.assumptions);
  const g = load('G11SELL');

  it('the selldown block matches the fixture leaves (EV, equity, proceeds)', () => {
    const s = o.selldown!;
    expect(s.year).toBe(3);
    expect(s.fraction).toBe(0.25);
    for (const k of ['implied_event_ev', 'implied_event_equity', 'selldown_proceeds'] as const) {
      expect(Math.abs(s[k] - g.selldown[k]), k).toBeLessThan(DISPLAY);
    }
  });

  it('the reference-derived asserts: event net debt 289.85, buyer Δ 62.91, sponsor Δ 434.86, NO below-cost WARN', () => {
    const s = o.selldown!;
    expect(Math.abs(s.implied_event_ev - s.implied_event_equity - 289.85)).toBeLessThan(DISPLAY);
    expect(Math.abs(o.bridge.walkdown.selldown_buyer_delta - 62.91)).toBeLessThan(DISPLAY);
    expect(Math.abs(o.bridge.walkdown.sponsor_net_delta - 434.86)).toBeLessThan(DISPLAY);
    expect(o.coherence.map((f) => f.code)).not.toContain('selldown_below_cost');
  });

  it('sponsor IRR FALLS and MOIC falls vs the host — the sold slice ran above the deal’s own rate', () => {
    const h = runModel(host.facts, host.assumptions);
    expect(o.returns.sponsor_net.irr!).toBeLessThan(h.returns.sponsor_net.irr!);
    expect(o.returns.sponsor_net.moic!).toBeLessThan(h.returns.sponsor_net.moic!);
    expect(Math.abs(o.returns.sponsor_net.irr! - 0.131313)).toBeLessThan(1e-5);
  });

  it('(xi-deal) DPI steps up at the selldown year by proceeds ÷ sponsor equity — the realized basis', () => {
    const h = runModel(host.facts, host.assumptions);
    const se = o.sources_uses.sponsor_equity;
    expect(o.returns.dpi[1]).toBeCloseTo(h.returns.dpi[1], 12);
    expect(o.returns.dpi[2] - h.returns.dpi[2]).toBeCloseTo(o.selldown!.selldown_proceeds / se, 9);
    for (let t = 0; t < 5; t++) expect(Math.abs(o.returns.dpi[t] - g.returns.dpi[t]), `dpi[${t}]`).toBeLessThan(5e-4);
  });
});

describe('§23.13 directed fixtures', () => {
  it('(i) selldown null ⇒ every numeric output identical to the same run (the compatibility gate)', () => {
    const a = runModel(host.facts, host.assumptions);
    const b = runModel(host.facts, withSell(host.assumptions, null));
    expect(b.exit.selldown_buyer_share).toBe(0);
    expect(b.bridge.walkdown.selldown_buyer_delta).toBe(0);
    expect(b.selldown).toBeNull();
    expect(b.returns).toEqual(a.returns);
    expect(b.exit).toEqual(a.exit);
  });

  it('(ii) the five Build rejections, one case each', () => {
    const sd = { year: 3, fraction: 0.25, event_multiple: 8.5 };
    expect(() => runModel(host.facts, { ...withSell(host.assumptions, sd), rollover_equity: 10 })).toThrow(/rollover/);
    const g9 = GOLDEN_DEALS.G9SWEET;
    expect(() => runModel(g9.facts, withSell(g9.assumptions, sd))).toThrow(/sweet-equity strip/);
    for (const f of [0, 1, -0.1]) expect(() => runModel(host.facts, withSell(host.assumptions, { ...sd, fraction: f }))).toThrow(/strictly between 0% and 100%/);
    for (const y of [0, 5, 2.5]) expect(() => runModel(host.facts, withSell(host.assumptions, { ...sd, year: y }))).toThrow(/whole year from 1 to 4/);
    for (const m of [0, -1]) expect(() => runModel(host.facts, withSell(host.assumptions, { ...sd, event_multiple: m }))).toThrow(/greater than 0/);
  });

  it('(iii) with a promote: X and the promote are IDENTICAL to the no-event run, and the partition is taken AFTER the promote', () => {
    const mip = { pool_pct: 0.15, hurdle_moic: 1.5, ratchet: null };
    const base = { ...host.assumptions, mip };
    const off = runModel(host.facts, base);
    const on = runModel(host.facts, withSell(base, { year: 3, fraction: 0.25, event_multiple: 8.5 }));
    expect(off.exit.mip_payout).toBeGreaterThan(0); // the promote is live, so the test bites
    expect(on.exit.mip_payout).toBe(off.exit.mip_payout); // (α) proceeds never enter X
    const E = on.exit.exit_equity_pre_mip_total;
    const M = on.exit.mip_payout;
    expect(on.exit.sponsor_share).toBeCloseTo(0.75 * (E - M), 9); // (β) NOT 0.75 × E
    expect(on.exit.selldown_buyer_share).toBeCloseTo(0.25 * (E - M), 9);
    // the six-term mirror closes exactly — a pre-promote partition would over-close by f × M
    const x = on.exit;
    expect(x.sponsor_share + x.rollover_share + x.mip_payout + x.management_ordinary_share + x.warrant_payout_net + x.selldown_buyer_share).toBeCloseTo(E, 9);
  });

  it('(iv) the year-t distribution belongs to the SELLER; only later years are partitioned', () => {
    const h = runModel(host.facts, host.assumptions);
    const o = runModel(G11.facts, G11.assumptions);
    const paid = h.waterfall.map((w) => w.distribution_paid);
    expect(paid[2]).toBeGreaterThan(0); // a year-3 distribution exists, so the boundary is observable
    expect(o.returns.sponsor_net.cashflows[3]).toBeCloseTo(paid[2] + o.selldown!.selldown_proceeds, 9);
    expect(o.returns.sponsor_net.cashflows[4]).toBeCloseTo(0.75 * paid[3], 9);
  });

  it('(v) payback REACHABILITY: a large selldown alone repays the cheque (arm 1); a negative-proceeds sale lowers DPI in that year only (arm 2)', () => {
    const arm1 = runModel(host.facts, withSell(host.assumptions, { year: 3, fraction: 0.9, event_multiple: 8.5 }));
    expect(arm1.returns.payback_year).toBe(3);
    const arm2 = runModel(host.facts, withSell(host.assumptions, { year: 2, fraction: 0.25, event_multiple: 2.0 }));
    expect(arm2.selldown!.implied_event_equity).toBeLessThan(0);
    expect(arm2.returns.dpi[1]).toBeLessThan(arm2.returns.dpi[0]);
    for (let t = 2; t < 5; t++) expect(arm2.returns.dpi[t]).toBeGreaterThanOrEqual(arm2.returns.dpi[t - 1] - 1e-12);
    expect(arm2.coherence.map((f) => f.code)).toContain('selldown_below_cost');
  });

  it('(vi)/(g) company invariance: operating, tax, tranches, waterfall, balance sheet, credit, S&U byte-identical', () => {
    const h = runModel(host.facts, host.assumptions);
    const o = runModel(G11.facts, G11.assumptions);
    for (const k of ['operating', 'tax', 'tranches', 'revolver', 'waterfall', 'balance_sheet', 'credit', 'sources_uses'] as const) {
      expect(o[k], k).toEqual(h[k]);
    }
    expect(o.returns.unlevered).toEqual(h.returns.unlevered);
    expect(o.returns.pre_promote).toEqual(h.returns.pre_promote); // the proceeds are not a pre-promote line
  });

  it('(vii) ONE walk-down term, recomputed directly, AND the reconciliation residual at zero', () => {
    const o = runModel(G11.facts, G11.assumptions);
    expect(o.bridge.walkdown.selldown_buyer_delta).toBeCloseTo(o.exit.selldown_buyer_share - o.selldown!.selldown_proceeds, 9);
    // the sponsor's TOTAL delta is every sponsor inflow (incl. the proceeds) less the cheque
    expect(o.bridge.walkdown.sponsor_net_delta).toBeCloseTo(sumOf(o.returns.sponsor_net.cashflows), 9);
    expect(o.bridge.reconciliation_residual).toBeLessThan(0.005);
  });

  it('(viii) the event terms are frozen across a downside scenario, but the proceeds re-price lower', () => {
    const base = runModel(G11.facts, G11.assumptions);
    const down = runModel(G11.facts, { ...g2DownsideAssumptions(), structure: { ...g2DownsideAssumptions().structure, distributions: G11.assumptions.structure.distributions, selldown: G11.assumptions.structure.selldown } });
    expect(down.selldown!.selldown_proceeds).toBeLessThan(base.selldown!.selldown_proceeds);
  });

  it('(ix) selldown_below_cost fires inside the $0.005m band and not outside it', () => {
    // solve the multiple that puts the proceeds exactly AT f × sponsor equity, then step ±
    const o = runModel(G11.facts, G11.assumptions);
    const s = o.selldown!;
    const netDebt = s.implied_event_ev - s.implied_event_equity;
    const ebitda = s.implied_event_ev / 8.5;
    const atCost = (0.25 * o.sources_uses.sponsor_equity / 0.25 + netDebt) / ebitda;
    const flags = (m: number) => runModel(G11.facts, withSell(G11.assumptions, { year: 3, fraction: 0.25, event_multiple: m })).coherence.map((f) => f.code);
    const dm = 0.006 / 0.25 / ebitda; // a $0.006m move in proceeds
    expect(flags(atCost - dm)).toContain('selldown_below_cost');
    expect(flags(atCost - dm / 3)).not.toContain('selldown_below_cost'); // −$0.002m: inside the tolerance
    expect(flags(atCost + dm)).not.toContain('selldown_below_cost');
  });

  it('(x) with a warrant: the partition is taken post-warrant and §22.6 conservation closes', () => {
    const a = { ...withSell(host.assumptions, { year: 3, fraction: 0.25, event_multiple: 8.5 }), warrant: { holder_label: 'Mezz', pct_of_ordinary: 0.05, strike_total: 5 } };
    const o = runModel(host.facts, a);
    expect(o.exit.warrant_payout_net).toBeGreaterThan(0);
    const pot = o.exit.exit_equity_pre_mip_total - o.exit.mip_payout - o.exit.warrant_payout_net;
    expect(o.exit.selldown_buyer_share).toBeCloseTo(0.25 * pot, 9);
    expect(o.exit.sponsor_share + o.exit.selldown_buyer_share + o.exit.warrant_payout_net + o.exit.mip_payout).toBeCloseTo(o.exit.exit_equity_pre_mip_total, 9);
  });

  it('(xi) the fund leg: LP conservation includes the proceeds, and the fund DPI steps up at the selldown year', () => {
    const fundA = { committed_capital: null, mgmt_fee_pct: 0.02, fee_basis: 'invested' as const, carry_pct: 0.2, pref_rate: 0.08, catchup_pct: 1, waterfall: 'european' as const, fee_offset_pct: 1 };
    const on = runModel(G11.facts, { ...G11.assumptions, fund: fundA });
    const off = runModel(host.facts, { ...host.assumptions, fund: fundA });
    const s = on.selldown!;
    const inflow = sumOf(on.returns.sponsor_net.cashflows.slice(1));
    expect(sumOf(on.fund!.lp_distributions) + sumOf(on.fund!.gp_carry)).toBeCloseTo(inflow, 6);
    expect(on.fund!.lp_distributions[2] + on.fund!.gp_carry[2]).toBeCloseTo(on.returns.sponsor_net.cashflows[3], 9); // proceeds reach the year-3 leg
    expect(s.selldown_proceeds).toBeGreaterThan(100);
    expect(on.fund!.fund_lp_net.dpi[2] - on.fund!.fund_lp_net.dpi[1]).toBeGreaterThan(off.fund!.fund_lp_net.dpi[2] - off.fund!.fund_lp_net.dpi[1] + 0.2);
    // the (1 − f) partition reaches the fund leg: year-4 inflow is 75% of the host's
    expect(on.fund!.lp_distributions[3] + on.fund!.gp_carry[3]).toBeCloseTo(0.75 * (off.fund!.lp_distributions[3] + off.fund!.gp_carry[3]), 6);
  });

  it('(xii) mid-year display: the proceeds shift with the interim flows; the period-end IRR is unchanged', () => {
    const a = runModel(G11.facts, G11.assumptions);
    const b = runModel(G11.facts, { ...G11.assumptions, mid_year_irr: true });
    expect(b.returns.sponsor_net.irr).toBe(a.returns.sponsor_net.irr);
    expect(a.returns.sponsor_net.irr_mid_year!).toBeGreaterThan(a.returns.sponsor_net.irr!);
    expect(Math.abs(a.returns.sponsor_net.irr_mid_year! - 0.135917)).toBeLessThan(1e-5); // the G11-SELL leaf
  });
});
