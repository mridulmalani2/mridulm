/**
 * §19 fund/LP overlay — the C-gate (engine ≡ the adjudicated G7-FUND gospel) plus the
 * §19.10 golden-uncovered branches as DIRECTED fixtures and the §14.20 invariants.
 * MUTANTS (each run RED during development via string-replace, then reverted — named in
 * comments): (M-a) dropping the 'european' fee-into-base line reds the C-gate (gp drifts
 * to the american figure); (M-b) using TOTAL distributions instead of the sponsor share
 * reds fixture (vii); (M-c) swapping the accrue/draw order reds the C-gate (B8's exact
 * failure: the bound breaks by carry × fee_N).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runModel } from '../lib/engine2/facade';
import { buildFundOverlay } from '../lib/engine2/fund';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';
import type { DealAssumptions, FundOverlayAssumption } from '../lib/engine2/types';

const ROOT = join(__dirname, '..');
const g7fix = JSON.parse(readFileSync(join(ROOT, 'tests/goldens/G7FUND/expected.json'), 'utf8'));

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const FUND_EU: FundOverlayAssumption = {
  committed_capital: null, mgmt_fee_pct: 0.02, fee_basis: 'invested',
  carry_pct: 0.20, pref_rate: 0.08, catchup_pct: 1.0, waterfall: 'european', fee_offset_pct: 1.0,
};
function withFund(base: keyof typeof GOLDEN_DEALS, fund: FundOverlayAssumption | null, mutate?: (a: DealAssumptions) => void) {
  const d = clone(GOLDEN_DEALS[base]);
  d.assumptions.fund = fund;
  mutate?.(d.assumptions);
  return d;
}
const sum = (a: number[]) => { let s = 0; for (const x of a) s += x; return s; };

describe('C-gate: the engine reproduces the adjudicated G7-FUND gospel at full precision', () => {
  const { facts, assumptions } = GOLDEN_DEALS.G7FUND;
  const o = runModel(facts, assumptions);
  const f = o.fund!;
  const ff = g7fix.fund;

  it('every fund vector matches the fixture (±$0.005m / 6dp ratios)', () => {
    expect(f).not.toBeNull();
    for (const k of ['lp_contributions', 'lp_distributions', 'gp_carry', 'mgmt_fees_net'] as const) {
      expect(f[k].length).toBe(ff[k].length);
      f[k].forEach((v, i) => expect(v, `${k}[${i}]`).toBeCloseTo(ff[k][i], 4));
    }
    expect(f.paid_in_total).toBeCloseTo(ff.paid_in_total, 4);
    expect(f.committed_capital).toBeCloseTo(ff.committed_capital, 4);
    expect(f.fund_lp_net.irr!).toBeCloseTo(ff.fund_lp_net.irr, 6);
    expect(f.fund_lp_net.moic).toBeCloseTo(ff.fund_lp_net.moic, 6);
    f.fund_lp_net.dpi.forEach((v, i) => expect(v, `dpi[${i}]`).toBeCloseTo(ff.fund_lp_net.dpi[i], 6));
    expect(f.fund_lp_net.payback_year).toBeNull();
  });

  it('§19.6(c)/§19.7 additivity: every NON-fund output is deep-equal to the fund-null run of the same deal', () => {
    const off = runModel(facts, { ...clone(assumptions), fund: null });
    expect(off.fund).toBeNull();
    for (const k of Object.keys(off) as (keyof typeof off)[]) {
      if (k === 'fund' || k === 'assumptions') continue;
      expect(o[k], `output.${String(k)} must be untouched by the overlay`).toEqual(off[k]);
    }
  });
});

describe('§19.10 directed fixtures — the golden-uncovered branches', () => {
  it("(i) american vs european on the SAME deal: fee draws in vs out of the hurdle move pref AND carry; both bounds bind at equality", () => {
    const eu = runModel(GOLDEN_DEALS.G7FUND.facts, GOLDEN_DEALS.G7FUND.assumptions).fund!;
    const amDeal = withFund('G7FUND', { ...FUND_EU, waterfall: 'american' });
    const am = runModel(amDeal.facts, amDeal.assumptions).fund!;
    const invested = eu.lp_contributions[0];
    const gpEu = sum(eu.gp_carry);
    const gpAm = sum(am.gp_carry);
    const totalEu = sum(eu.lp_distributions) + gpEu;
    const totalAm = sum(am.lp_distributions) + gpAm;
    expect(totalAm).toBeCloseTo(totalEu, 6); // conservation fixes the pie; the split moves
    expect(gpAm).toBeGreaterThan(gpEu); // smaller hurdle base ⇒ more carry
    // full catch-up reached under both ⇒ each bound binds at EQUALITY on its own base
    expect(gpEu).toBeCloseTo(0.2 * (totalEu - eu.paid_in_total), 4);
    expect(gpAm).toBeCloseTo(0.2 * (totalAm - invested), 4);
    expect(am.paid_in_total).toBeCloseTo(eu.paid_in_total, 6); // fees drawn identically either way
  });

  it('(ii) catchup_pct = 0 (hard hurdle) ≡ catchup_pct = carry_pct (the domain floor) — the same split by two routes', () => {
    const hard = runModel(GOLDEN_DEALS.G7FUND.facts, withFund('G7FUND', { ...FUND_EU, catchup_pct: 0 }).assumptions).fund!;
    const floor = runModel(GOLDEN_DEALS.G7FUND.facts, withFund('G7FUND', { ...FUND_EU, catchup_pct: 0.20 }).assumptions).fund!;
    expect(sum(hard.gp_carry)).toBeCloseTo(sum(floor.gp_carry), 9);
    expect(sum(hard.lp_distributions)).toBeCloseTo(sum(floor.lp_distributions), 9);
    // and the hard hurdle strictly reduces carry vs full catch-up (no catch-up on the pref)
    const full = runModel(GOLDEN_DEALS.G7FUND.facts, GOLDEN_DEALS.G7FUND.assumptions).fund!;
    expect(sum(hard.gp_carry)).toBeLessThan(sum(full.gp_carry));
  });

  it('(iii) a deal that never clears the pref: carry = 0 exactly, the LP absorbs the shortfall', () => {
    const d = withFund('G7FUND', { ...FUND_EU, pref_rate: 0.60 }); // pref compounds past every inflow
    const f = runModel(d.facts, d.assumptions).fund!;
    expect(sum(f.gp_carry)).toBe(0);
    expect(f.fund_lp_net.moic).toBeLessThan(1.8553); // below the sponsor gross multiple
    // conservation still exact
    const o = runModel(d.facts, d.assumptions);
    const inflows = sum(o.waterfall.map((w) => w.distribution_paid)) + o.exit.sponsor_share;
    expect(sum(f.lp_distributions) + sum(f.gp_carry)).toBeCloseTo(inflows, 6);
  });

  it('(iv) LIVE fee offset: monitoring income reduces the draw and the zero floor BINDS in the termination year; §19.6(a) holds through it', () => {
    const d = withFund('G7FUND', FUND_EU, (a) => {
      a.fees.monitoring = { annual: 6.0, termination_years: 3, discount_rate: 0.04 }; // PV ≈ 16.65 > the 11.74 fee ⇒ the floor BINDS at N
    });
    const o = runModel(d.facts, d.assumptions);
    const f = o.fund!;
    // years 1..N-1: fee = 2% × invested − 6.0 (offset live, floor not binding)
    const invested = f.lp_contributions[0];
    for (let t = 0; t < f.mgmt_fees_net.length - 1; t++) {
      expect(f.mgmt_fees_net[t]).toBeCloseTo(Math.max(0, 0.02 * invested - 6.0), 6);
      expect(f.mgmt_fees_net[t]).toBeGreaterThan(0);
    }
    // year N: annual (dropped in exit year → 0) + termination lump ⇒ offset ≥ fee ⇒ FLOOR BINDS
    expect(f.mgmt_fees_net[f.mgmt_fees_net.length - 1]).toBe(0);
    const inflows = sum(o.waterfall.map((w) => w.distribution_paid)) + o.exit.sponsor_share;
    expect(sum(f.lp_distributions) + sum(f.gp_carry)).toBeCloseTo(inflows, 6);
  });

  it("(v) committed explicit: fee-on-committed > fee-on-invested; the TWO §16 rejections throw", () => {
    const d = withFund('G7FUND', { ...FUND_EU, committed_capital: 700, fee_basis: 'committed' });
    const f = runModel(d.facts, d.assumptions).fund!;
    f.mgmt_fees_net.forEach((x) => expect(x).toBeCloseTo(14.0, 9)); // 2% × 700 > 2% × 587.22
    expect(f.committed_capital).toBe(700);
    expect(() => runModel(d.facts, withFund('G7FUND', { ...FUND_EU, fee_basis: 'committed' }).assumptions))
      .toThrow(/circular/); // committed null ∧ 'committed' basis
    expect(() => runModel(d.facts, withFund('G7FUND', { ...FUND_EU, committed_capital: 600, fee_basis: 'committed' }).assumptions))
      .toThrow(/below the required contributions/); // 600 < 587.22 + 5×12
  });

  it('(vi) fund = null ⇒ output.fund null on EVERY golden (the §19.6(c) byte-identity gate)', () => {
    for (const g of ['G1', 'G2', 'G3', 'G4', 'G5', 'G2DIST', 'G6REFI'] as const) {
      const { facts, assumptions } = GOLDEN_DEALS[g];
      expect(runModel(facts, assumptions).fund).toBeNull();
    }
  });

  it('(vii) rollover_equity > 0: the LP inflow is the SPONSOR share — a total-based mutant moves every fund number', () => {
    const d = withFund('G2DIST', FUND_EU, (a) => { a.rollover_equity = 100; });
    const o = runModel(d.facts, d.assumptions);
    const f = o.fund!;
    const se = o.sources_uses.sponsor_equity;
    const share = se / (se + o.sources_uses.rollover_equity);
    expect(share).toBeLessThan(1);
    // year-2 LP receipt = share × the TOTAL distribution paid (12.09 on the G2-DIST schedule)
    const paid2 = o.waterfall[1].distribution_paid;
    expect(paid2).toBeGreaterThan(0);
    expect(f.lp_distributions[1]).toBeCloseTo(share * paid2, 9);
    expect(f.lp_distributions[1]).toBeLessThan(paid2); // the B1 discriminator
    // conservation on the SPONSOR-share basis (§19.6(a))
    const inflows = sum(o.waterfall.map((w) => w.distribution_paid)) * share + o.exit.sponsor_share;
    expect(sum(f.lp_distributions) + sum(f.gp_carry)).toBeCloseTo(inflows, 6);
  });
});

describe('§19.10 (viii) — the B8 event-order pin, unit-level (the only branch where the order is observable)', () => {
  // On every runModel fixture the catch-up completes in the exit year, where the pref
  // CANCELS out of the GP total (gp = carry × (D − capital) regardless of pref) — so the
  // rejected draw-before-accrue order is invisible there. It is observable exactly when
  // catch-up does NOT complete: a hard-hurdle micro-deal, hand-derived per §19.4.
  // CORRECT order (accrue on PRE-DRAW 100 → draw 10 → walk 130): RoC 110 → pref 8 →
  // (no catch-up) → split 12 → GP 2.4 / LP 127.6. The MUTANT order accrues on 110 →
  // pref 8.8 → split 11.2 → GP 2.24 — this assert is what kills mutant M-c.
  it('hard-hurdle N=1 micro-deal: GP = 2.4 exactly (pref accrued on the PRE-draw base)', () => {
    const f = buildFundOverlay(
      { committed_capital: null, mgmt_fee_pct: 0.10, fee_basis: 'invested',
        carry_pct: 0.20, pref_rate: 0.08, catchup_pct: 0, waterfall: 'european', fee_offset_pct: 1.0 },
      { distributions_paid: [0], exit_sponsor_share: 130,
        sources_uses: { sponsor_equity: 100, rollover_equity: 0 }, gp_fee_income: null },
    );
    expect(f.gp_carry[0]).toBeCloseTo(2.4, 12);
    expect(f.lp_distributions[0]).toBeCloseTo(127.6, 12);
    expect(f.paid_in_total).toBeCloseTo(110, 12);
    expect(f.fund_lp_net.moic).toBeCloseTo(127.6 / 110, 12);
  });
});

describe('§14.20 invariants on live overlays', () => {
  const cases: [string, DealAssumptions][] = [
    ['G7-FUND (european)', GOLDEN_DEALS.G7FUND.assumptions],
    ['american', withFund('G7FUND', { ...FUND_EU, waterfall: 'american' }).assumptions],
    ['hard hurdle', withFund('G7FUND', { ...FUND_EU, catchup_pct: 0 }).assumptions],
  ];
  for (const [name, assumptions] of cases) {
    it(`${name}: conservation, irr ordering, the per-election GP bound, dpi[N] ≡ moic`, () => {
      const o = runModel(GOLDEN_DEALS.G7FUND.facts, assumptions);
      const f = o.fund!;
      const inflows = sum(o.waterfall.map((w) => w.distribution_paid)) + o.exit.sponsor_share;
      expect(sum(f.lp_distributions) + sum(f.gp_carry)).toBeCloseTo(inflows, 6); // (a)
      expect(f.fund_lp_net.irr).not.toBeNull();
      expect(f.fund_lp_net.irr as number).toBeLessThan(o.returns.sponsor_net.irr as number); // (b) fees+carry live; both non-null on these deals
      const gp = sum(f.gp_carry);
      const base = assumptions.fund!.waterfall === 'european' ? f.paid_in_total : f.lp_contributions[0];
      expect(gp).toBeLessThanOrEqual(0.2 * Math.max(0, sum(f.lp_distributions) + gp - base) + 1e-6); // (c)
      const dpi = f.fund_lp_net.dpi;
      expect(dpi[dpi.length - 1]).toBeCloseTo(f.fund_lp_net.moic, 9); // (d)
      let cum = 0;
      for (const x of f.lp_distributions) { expect(x).toBeGreaterThanOrEqual(0); cum += x; }
      expect(cum).toBeGreaterThan(0);
    });
  }
});
