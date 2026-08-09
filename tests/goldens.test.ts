/**
 * Golden agreement + assertion gate (Phase B1, rebuild/PHASE_B_GOLDENS_KERNEL.md).
 * 1. Agreement: re-runs the SPEC-literal reference derivation and fails on ANY drift from
 *    the committed fixtures (guards against silent fixture edits).
 * 2. Re-asserts the SPEC §17 committed assertions in CI, permanently.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const load = (n: string) => JSON.parse(readFileSync(join(ROOT, 'tests/goldens', n, 'expected.json'), 'utf8'));

describe('golden agreement check', () => {
  it('committed fixtures match a fresh run of the reference derivation', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'goldens-'));
    execFileSync('python3', [join(ROOT, 'scripts/goldens/spec_calc.py'), tmp], { stdio: 'pipe' });
    for (const g of ['G1', 'G2', 'G3', 'G4', 'G5', 'G2D', 'G2DIST', 'G3DIST', 'G2DISTD', 'G6REFI', 'G7FUND', 'G8PIKT']) {
      const fresh = readFileSync(join(tmp, g, 'expected.json'), 'utf8');
      const committed = readFileSync(join(ROOT, 'tests/goldens', g, 'expected.json'), 'utf8');
      expect(committed, `${g} fixture drifted from the reference derivation`).toBe(fresh);
    }
  });
});

describe('SPEC §17 committed assertions', () => {
  let g1: any, g2: any, g3: any, g4: any, g5: any, g2d: any, g2dist: any, g3dist: any, g2distd: any, g6refi: any;
  beforeAll(() => {
    [g1, g2, g3, g4, g5, g2d, g2dist, g3dist, g2distd, g6refi] =
      ['G1', 'G2', 'G3', 'G4', 'G5', 'G2D', 'G2DIST', 'G3DIST', 'G2DISTD', 'G6REFI'].map(load);
  });

  it('G1 closed-form check values (§14.14)', () => {
    expect(g1.derived.sponsor_equity).toBe(209.0);
    for (const o of g1.operating) expect(o.fcf_pre_debt).toBeCloseTo(16.5, 2);
    expect(g1.exit.exit_equity_pre_mip_total).toBeCloseTo(284.5, 2);
    expect(g1.returns.sponsor_net.moic).toBeCloseTo(1.3612, 4);
    expect(Math.abs(g1.returns.sponsor_net.irr - 0.063622)).toBeLessThan(0.00001); // ±0.1bp
  });
  it('G2: §163(j) never binds; revolver never draws; sweep pool positive', () => {
    for (const t of g2.tax) expect(t.s163j_carryforward_end).toBe(0);
    for (const r of g2.revolver) expect(r.draw).toBe(0);
    for (const w of g2.waterfall) expect(w.sweep_pool).toBeGreaterThan(0);
  });
  it('G2-D: entry frozen, downside IRR ≤ base (§13/§14.8/§14.17)', () => {
    expect(g2d.sources_uses).toEqual(g2.sources_uses);
    expect(g2d.returns.sponsor_net.irr).toBeLessThanOrEqual(g2.returns.sponsor_net.irr);
  });
  it('G3: §163(j) binds every year, carryforward monotone, PIK payoff, promote in the money', () => {
    const cf = g3.tax.map((t: any) => t.s163j_carryforward_end);
    for (const t of g3.tax) {
      expect(t.deductible_capped_interest).toBeLessThan(t.capped_interest_pool + t.s163j_carryforward_open);
    }
    for (let i = 1; i < cf.length; i++) expect(cf[i]).toBeGreaterThan(cf[i - 1]);
    expect(cf[cf.length - 1]).toBeGreaterThan(0);
    const pik = g3.tranches['PIK Note'];
    expect(pik[pik.length - 1].ending_balance).toBeCloseTo(237.92, 2); // 135 × 1.12^5
    expect(g3.exit.mip_payout).toBeGreaterThan(0);
  });
  it('G4: Y1 banks a loss; floor binds; §382 caps at 3.0; §163(j) inert; pool survives', () => {
    expect(g4.tax[0].nol_banked).toBeGreaterThan(0);
    expect(g4.tax.some((t: any) => t.cash_tax > 0 && Math.abs(t.cash_tax - 0.15 * t.taxable_before_nol) < 0.005)).toBe(true);
    expect(g4.tax.some((t: any) => Math.abs(t.acquired_nol_used - 3.0) < 0.005)).toBe(true);
    for (const t of g4.tax) expect(t.s163j_carryforward_end).toBe(0);
    expect(g4.tax[g4.tax.length - 1].acquired_nol_end).toBeGreaterThan(0);
  });
  it('G5: revolver draw/repay cycle (§3 step 6, §14.4)', () => {
    expect(g5.revolver[0].draw).toBeGreaterThan(0);
    expect(g5.waterfall[0].closing_cash).toBeCloseTo(4.0, 2);
    expect(g5.revolver[2].ending_drawn).toBe(0);
    for (const w of g5.waterfall) expect(w.cash_floor_breach).toBe(false);
  });
  it('G2-DIST: the RP trap blocks Y1–Y2 and every §3-step-7 cap branch is exercised', () => {
    const w = g2dist.waterfall;
    // §3 step 7 runs post-close: a distribution can never move sources & uses.
    expect(g2dist.sources_uses).toEqual(g2.sources_uses);
    // Y1 — FULLY blocked: trap capacity is zero while cash above the floor was positive.
    expect(w[0].rp_max).toBe(0);
    expect(w[0].distribution_paid).toBe(0);
    expect(w[0].distribution_blocked).toBe(true);
    expect(w[0].closing_cash - 10.0).toBeGreaterThan(0); // cash alone would have allowed a payment
    // Y2 — PARTIALLY blocked: the trap clips below both the request and the cash cap, and
    // the payment lands the pro-forma metric EXACTLY on the level (slack 0.0025 at 2dp).
    expect(w[1].distribution_paid).toBe(w[1].rp_max);
    expect(w[1].distribution_paid).toBeLessThan(w[1].distribution_requested);
    expect(w[1].distribution_paid).toBeLessThan(w[1].closing_cash + w[1].distribution_paid - 10.0);
    expect(w[1].distribution_blocked).toBe(true);
    // Y3 — CASH-capped, not trap-blocked: pays out to exactly the min-cash floor.
    expect(w[2].distribution_blocked).toBe(false);
    expect(w[2].distribution_paid).toBeLessThan(w[2].distribution_requested);
    expect(w[2].closing_cash).toBeCloseTo(10.0, 2);
    expect(w[2].rp_max).toBeGreaterThan(w[2].distribution_requested);
    // Y4/Y5 — REQUEST-capped; Y5 pays in the exit year (rides the period-N flow, §14.16).
    for (const i of [3, 4]) {
      expect(w[i].distribution_paid).toBe(w[i].distribution_requested);
      expect(w[i].distribution_blocked).toBe(false);
    }
    expect(w[4].distribution_paid).toBeGreaterThan(0);
    expect(g2dist.distributions.blocked_years).toEqual([1, 2]);
  });

  it('G3-DIST: trap OFF pays under the cash cap alone; §10 hurdle includes cumulative distributions', () => {
    const w = g3dist.waterfall;
    expect(g3dist.sources_uses).toEqual(g3.sources_uses);
    for (const r of w) {
      expect(r.rp_max).toBeNull();          // trap OFF ⇒ rp_max is +∞, rendered N/A
      expect(r.distribution_blocked).toBe(false);
    }
    expect(g3dist.distributions.blocked_years).toEqual([]);
    // Y1/Y3 cash-capped (out to the floor), Y2/Y4/Y5 request-capped.
    for (const i of [0, 2]) {
      expect(w[i].distribution_paid).toBeLessThan(w[i].distribution_requested);
      expect(w[i].closing_cash).toBeCloseTo(8.0, 2);
    }
    for (const i of [1, 3, 4]) expect(w[i].distribution_paid).toBe(w[i].distribution_requested);
    // §10 [v1.1.0]: the promote's hurdle test is on exit equity PLUS cumulative distributions.
    const cum = g3dist.distributions.cumulative_paid;
    const invested = g3dist.derived.sponsor_equity;
    const uncapped = 0.15 * (g3dist.exit.exit_equity_pre_mip_total + cum - 1.5 * invested);
    expect(g3dist.exit.mip_payout).toBeCloseTo(uncapped, 1);
    // The pre-v1.1.0 rule (exit equity alone) would pay 1.82 on the SAME deal — a 9.1×
    // discriminator, so no implementation can pass this fixture with the old hurdle base.
    const preAmendment = 0.15 * (g3dist.exit.exit_equity_pre_mip_total - 1.5 * invested);
    expect(preAmendment).toBeCloseTo(1.82, 1);
    expect(g3dist.exit.mip_payout).toBeCloseTo(16.53, 2);
    expect(g3dist.exit.mip_payout).toBeLessThan(g3dist.exit.exit_equity_pre_mip_total); // cap inert here
  });

  it('§1 mid-year × distributions: sponsor-side only, exit never shifts', () => {
    // Inert wherever no interim sponsor flow exists (every pre-G1 golden) — the option is
    // scoped to the sponsor-side streams, so the unlevered stream carries no mid-year value.
    for (const g of [g1, g2, g3, g4, g5, g2d]) {
      for (const s of ['sponsor_net', 'pre_promote']) {
        expect(g.returns[s].irr_mid_year).toBe(g.returns[s].irr);
      }
      expect(g.returns.unlevered.irr_mid_year).toBeUndefined();
    }
    // Live once distributions exist: interim flows at t−0.5 lift the IRR; the year-N
    // distribution rides the un-shifted exit flow.
    expect(g2dist.returns.sponsor_net.irr_mid_year).toBeCloseTo(0.134572, 6);
    expect(g2dist.returns.sponsor_net.irr).toBeCloseTo(0.133906, 6);
    expect(g3dist.returns.sponsor_net.irr_mid_year).toBeGreaterThan(g3dist.returns.sponsor_net.irr);
  });

  it('§14.18 distribution invariants hold on every golden', () => {
    for (const [name, g] of Object.entries({ G1: g1, G2: g2, G3: g3, G4: g4, G5: g5, G2D: g2d, G2DIST: g2dist, G3DIST: g3dist })) {
      const L = g.distributions.trap_level;
      let cum = 0;
      g.waterfall.forEach((w: any, i: number) => {
        const cashAtStep7 = w.closing_cash + w.distribution_paid;
        expect(w.distribution_paid, `${name} Y${i + 1}: paid ≤ request`).toBeLessThanOrEqual(w.distribution_requested);
        // balance_sheet[0].cash ≡ min_cash — §2 funds opening cash to exactly the floor.
        expect(w.distribution_paid, `${name} Y${i + 1}: paid ≤ cash above the floor`)
          .toBeLessThanOrEqual(Math.max(0, cashAtStep7 - g.balance_sheet[0].cash) + 0.005);
        if (L !== null && w.distribution_paid > 0) {
          const gross = Object.values(g.tranches).reduce((s: number, t: any) => s + t[i].ending_balance, 0)
            + (g.revolver ? g.revolver[i].ending_drawn : 0);
          // §14.18 pro-forma test in the MONEY form (holds for all EBITDA_adj, incl. ≤ 0).
          expect(gross - w.closing_cash, `${name} Y${i + 1}: pro-forma net debt ≤ L × EBITDA_adj`)
            .toBeLessThanOrEqual(L * g.operating[i].ebitda_adj + 0.005);
        }
        cum += w.distribution_paid;
        // §9 DPI is a VALUE, not just a shape: cumulative sponsor distributions ÷ the
        // sponsor's t=0 check. Asserting monotonicity alone would pass any wrong
        // denominator (e.g. pre-promote total) — hostile review finding 6, 2026-07-24.
        expect(g.returns.dpi[i], `${name} Y${i + 1} DPI value`)
          .toBeCloseTo(cum / g.derived.sponsor_equity, 3);
        if (i > 0) expect(g.returns.dpi[i]).toBeGreaterThanOrEqual(g.returns.dpi[i - 1]);
      });
      expect(g.distributions.cumulative_paid).toBeCloseTo(cum, 2);
      // Payback: distributions ALONE; exit proceeds never count (L-10). No golden reaches it
      // (the engine PR covers the reached branch with a module fixture — DERIVATION.md), so
      // assert the FIRST-year semantics against the series rather than the dead live arm.
      const firstReached = g.returns.dpi.findIndex((d: number) => d >= 1);
      expect(g.returns.payback_year).toBe(firstReached === -1 ? null : firstReached + 1);
    }
  });

  it('§9 membership: distributions are EXCLUDED from the unlevered stream (byte-identical to base)', () => {
    // The unlevered stream is capital-structure-blind, so adding a distribution to a deal
    // must not move it AT ALL. Asserting only the stream LENGTH would pass an implementation
    // that added paid[t] to every interim UFCF — hostile review finding 5, 2026-07-24. This
    // is the §17/DERIVATION claim stated as the equality it actually is.
    expect(g2dist.returns.unlevered).toEqual(g2.returns.unlevered);
    expect(g3dist.returns.unlevered).toEqual(g3.returns.unlevered);
    // The downside variant's unlevered stream tracks ITS OWN operating case, so it matches
    // the plain downside scenario rather than the base — same rule, different path.
    expect(g2distd.returns.unlevered).toEqual(g2d.returns.unlevered);
  });

  it('G2-DIST-D (§13): the request schedule and trap are FROZEN across scenarios; only the BINDING moves', () => {
    // §13: distributions and the RP trap are structure/policy fields, frozen like the rest of
    // the entry structure. What a downside changes is whether the trap BINDS — which §13
    // names as the credit dashboard's reason to exist (hostile review finding 2, 2026-07-24).
    expect(g2distd.distributions.requested).toEqual(g2dist.distributions.requested);
    expect(g2distd.distributions.trap_level).toBe(g2dist.distributions.trap_level);
    expect(g2distd.sources_uses).toEqual(g2.sources_uses); // entry frozen (§13/§14.17)
    // Y2 is the discriminator: PAID 12.09 in the base case, FULLY BLOCKED in the downside —
    // same policy, weaker EBITDA, so the pro-forma test that just cleared now fails.
    expect(g2dist.waterfall[1].distribution_paid).toBeCloseTo(12.09, 2);
    expect(g2distd.waterfall[1].distribution_paid).toBe(0);
    expect(g2distd.waterfall[1].rp_max).toBe(0);
    expect(g2distd.waterfall[1].distribution_blocked).toBe(true);
    // Less cash reaches the sponsor, later — and §14.8's downside monotonicity still holds.
    expect(g2distd.distributions.cumulative_paid).toBeLessThan(g2dist.distributions.cumulative_paid);
    expect(g2distd.returns.sponsor_net.irr).toBeLessThanOrEqual(g2dist.returns.sponsor_net.irr);
  });

  it('G6-REFI (§18): a TLB refi at year 3 — reprice, premium, extend, write-off deferred to Y4', () => {
    const tlb = g6refi.tranches['TLB'];
    // §18 is post-close, so it cannot re-price entry; §9 is capital-structure-blind.
    expect(g6refi.sources_uses).toEqual(g2.sources_uses);
    expect(g6refi.returns.unlevered).toEqual(g2.returns.unlevered);
    // The refi is a YEAR-3 event: years 1–2 of every per-year block are byte-identical to G2.
    for (const blk of ['operating', 'tax', 'waterfall'] as const) {
      expect(g6refi[blk].slice(0, 2)).toEqual(g2[blk].slice(0, 2));
    }
    expect(tlb.slice(0, 2)).toEqual(g2.tranches['TLB'].slice(0, 2));
    // Year 3 carries the refi: the flag, the cash cost (premium 3.50 + new OID 1.75 + new fee
    // 3.50 = 8.76 on B = 350.27), and the old unamortized DFC write-off (4.71). Only year 3.
    expect(tlb[2].refinanced).toBe(true);
    expect(tlb[2].refinancing_cash_cost).toBeCloseTo(8.76, 2);
    expect(tlb[2].unamortized_writeoff).toBeCloseTo(4.71, 2);
    for (const i of [0, 1, 3, 4]) {
      expect(tlb[i].refinanced).toBe(false);
      expect(tlb[i].refinancing_cash_cost).toBe(0);
      expect(tlb[i].unamortized_writeoff).toBe(0);
    }
    // §18.3 repricing: year-3 TLB cash interest FALLS vs G2 (100bp off 350.27 ≈ 3.5 lower) and
    // year-3 mandatory amort is on the NEW face 350.27 (1% = 3.50), below G2's 4.40 on 440.
    expect(tlb[2].cash_interest).toBeLessThan(g2.tranches['TLB'][2].cash_interest - 3);
    expect(tlb[2].cash_interest).toBeCloseTo(350.27 * (0.036 + 0.0275), 1);
    expect(tlb[2].mandatory_amort).toBeCloseTo(3.5, 2);
    // §18.5 tax deferral: the write-off (4.71) + call premium (3.50) hit year 4's UNCAPPED pool,
    // NOT year 3's. Year-3 uncapped is only the ongoing fee amort + commitment fee.
    expect(g6refi.tax[3].uncapped_deductions).toBeCloseTo(9.24, 2); // 0.75 fee + 0.28 commit + 8.22 deferred
    expect(g6refi.tax[3].uncapped_deductions - g6refi.tax[2].uncapped_deductions).toBeCloseTo(8.22, 1);
    // §18.5: G6-REFI is built with §163(j) positive headroom every year, so capped ≡ uncapped
    // (the write-off/premium-uncapped simplification is inert here — the binding case is a
    // directed engine fixture, §18.11(ii)).
    for (const t of g6refi.tax) expect(t.s163j_carryforward_end).toBe(0);
    // §18.7/§9: the exit-year write-off now includes the NEW tranche's residual new OID + new fee.
    expect(g6refi.exit.unamortized_fees_written_off).toBeCloseTo(2.63, 2);
    // The refi field defaults OFF on every pre-v1.3.0 golden: additive columns, all 0/false.
    for (const g of [g1, g2, g3, g4, g5, g2d, g2dist, g3dist, g2distd]) {
      for (const name of Object.keys(g.tranches)) {
        for (const row of g.tranches[name]) {
          expect(row.refinanced).toBe(false);
          expect(row.refinancing_cash_cost).toBe(0);
          expect(row.unamortized_writeoff).toBe(0);
        }
      }
    }
  });

  it('balance sheet closes every year, every golden (§14.2)', () => {
    for (const g of [g1, g2, g3, g4, g5, g2d, g2dist, g3dist, g2distd, g6refi]) {
      for (const row of g.balance_sheet) expect(Math.abs(row.check)).toBeLessThan(0.005);
    }
  });
});

describe('SPEC §19 committed assertions — G7-FUND (fund-of-one overlay; adjudicated values)', () => {
  const g7 = JSON.parse(readFileSync(join(ROOT, 'tests/goldens/G7FUND/expected.json'), 'utf8'));
  const g2dist = JSON.parse(readFileSync(join(ROOT, 'tests/goldens/G2DIST/expected.json'), 'utf8'));
  const f = g7.fund;

  it('§19.7 additivity: every non-fund block is byte-identical to G2-DIST (post-engine overlay)', () => {
    for (const k of Object.keys(g2dist)) {
      expect(g7[k], `G7-FUND ${k} must equal G2-DIST`).toEqual(g2dist[k]);
    }
  });
  it('the adjudicated fund walk (full-precision reseed, passes A+B re-signed; european/2%-invested/8%-pref/20%-carry/full catch-up)', () => {
    expect(f.paid_in_total).toBeCloseTo(645.9475, 4);         // 587.225 + 5 × 11.7445 = 1.1 × se, EXACT
    expect(f.paid_in_total).toBeCloseTo(1.1 * f.lp_contributions[0], 6);
    expect(f.mgmt_fees_net.every((x: number) => Math.abs(x - 11.7445) < 1e-6)).toBe(true);
    const lp = f.lp_distributions.reduce((a: number, b: number) => a + b, 0);
    const gp = f.gp_carry.reduce((a: number, b: number) => a + b, 0);
    expect(lp).toBeCloseTo(1000.783468, 4);
    expect(gp).toBeCloseTo(88.708992, 4);
    expect(f.fund_lp_net.moic).toBeCloseTo(1.549326, 6);
    expect(f.fund_lp_net.irr).toBeCloseTo(0.098058, 6);
    expect(f.fund_lp_net.payback_year).toBeNull();            // interim-only rule: never repaid mid-hold
  });
  it('§19.6(a) conservation: LP + GP ≡ sponsor-share inflows, exact', () => {
    const lp = f.lp_distributions.reduce((a: number, b: number) => a + b, 0);
    const gp = f.gp_carry.reduce((a: number, b: number) => a + b, 0);
    // the fixture's waterfall/exit rows are r2-DISPLAY values (±0.005 each); the fund block
    // is full-precision-seeded (v1.0.3 rule) — compare at the display tolerance, and note the
    // EXACT identity is asserted inside the reference itself at 1e-9 on the internals
    const inflows = g7.waterfall.reduce((a: number, w: any) => a + w.distribution_paid, 0) + g7.exit.sponsor_share;
    expect(lp + gp).toBeCloseTo(inflows, 1);                  // ≈1089.49 at display precision
  });
  it("§19.6(d) 'european' GP-share bound BINDS with equality at full catch-up", () => {
    const lp = f.lp_distributions.reduce((a: number, b: number) => a + b, 0);
    const gp = f.gp_carry.reduce((a: number, b: number) => a + b, 0);
    expect(gp).toBeCloseTo(0.2 * Math.max(0, lp + gp - f.paid_in_total), 4);
  });
  it('§14.20(d): dpi[N] ≡ moic; cumulative lp_distributions monotone (and dpi itself is NOT — fee-only years)', () => {
    const dpi = f.fund_lp_net.dpi;
    expect(dpi[dpi.length - 1]).toBeCloseTo(f.fund_lp_net.moic, 6);
    let cum = 0;
    for (const d of f.lp_distributions) { expect(d).toBeGreaterThanOrEqual(0); cum += d; }
    expect(cum).toBeGreaterThan(0);
    // the exact adjudicated to-date sequence (G7-FUND distributes EVERY year 2-5, so the
    // general non-monotonicity of dpi[] — §14.20(d)'s stated caveat — is not exercised
    // HERE; it is a spec-text truth, honestly not pinned by this golden)
    for (const [i, v] of [0, 0.019796, 0.044069, 0.05902, 1.549326].entries()) {
      expect(dpi[i]).toBeCloseTo(v, 6);
    }
  });
  it('§19.6(b): net-to-LP IRR strictly below the sponsor-net IRR (fees + carry both live)', () => {
    expect(f.fund_lp_net.irr).toBeLessThan(g7.returns.sponsor_net.irr); // 9.81% < 13.39%
  });
});

describe('SPEC §20 committed assertions — G8-PIKT (PIK toggle; GOSPEL — both adjudication passes SIGNED)', () => {
  const g8 = JSON.parse(readFileSync(join(ROOT, 'tests/goldens/G8PIKT/expected.json'), 'utf8'));
  const g3 = JSON.parse(readFileSync(join(ROOT, 'tests/goldens/G3/expected.json'), 'utf8'));
  const note = g8.tranches['PIK Note'];

  it('entry and operating are FROZEN vs G3 (coupon mechanics are post-close; the dist_variant discipline)', () => {
    expect(g8.sources_uses).toEqual(g3.sources_uses);
    expect(g8.operating).toEqual(g3.operating);
    expect(g8.returns.unlevered).toEqual(g3.returns.unlevered); // §9 capital-structure-blind
  });

  it('§20.9 closed forms: the elected walk [pik,pik,cash,cash,pik] to the digit', () => {
    // pik years accrue at 12% on beginning balance; cash years pay 9% with NO accrual
    expect(note[0].pik_accrual).toBeCloseTo(16.2, 2);      // 135 × 0.12
    expect(note[1].pik_accrual).toBeCloseTo(18.14, 2);     // 151.2 × 0.12 = 18.144
    expect(note[2].cash_interest).toBeCloseTo(15.24, 2);   // 169.344 × 0.09 = 15.240960
    expect(note[3].cash_interest).toBeCloseTo(15.24, 2);   // beginning balance FLAT in cash years
    expect(note[4].pik_accrual).toBeCloseTo(20.32, 2);     // 169.344 × 0.12 = 20.32128
    for (const [i, e] of (['pik', 'pik', 'cash', 'cash', 'pik'] as const).entries()) {
      expect(note[i].cash_interest === 0).toBe(e === 'pik');   // whole-coupon: never both legs
      expect(note[i].pik_accrual === 0).toBe(e === 'cash');
    }
    expect(note[2].beginning_balance).toBeCloseTo(169.34, 2);
    expect(note[4].ending_balance).toBeCloseTo(189.67, 2); // 135 × 1.12³ = 189.665280 (§9 par + accrued)
  });

  it('the toggle moves the whole deal coherently (adjudicated values, r2 display)', () => {
    expect(g8.exit.debt_payoff_at_par_plus_pik).toBeCloseTo(241.53, 2); // senior 51.87 + note 189.67 at full precision
    expect(g8.exit.mip_payout).toBeCloseTo(19.7, 1);                    // promote stays IN the money (§20.9/G3 base)
    expect(g8.returns.sponsor_net.irr).toBeCloseTo(0.122823, 6);
    expect(g8.returns.sponsor_net.moic).toBeCloseTo(1.7847, 4);
    // §20.6(f) is an explicit NON-claim: the fixture happens to beat G3's all-accrual shape
    // (12.28% > 11.85%) but NO ordering between election patterns is asserted as a rule —
    // the round-1 sign-off constructed the counter-direction numerically.
  });
});
