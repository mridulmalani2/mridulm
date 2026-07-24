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
    for (const g of ['G1', 'G2', 'G3', 'G4', 'G5', 'G2D', 'G2DIST', 'G3DIST']) {
      const fresh = readFileSync(join(tmp, g, 'expected.json'), 'utf8');
      const committed = readFileSync(join(ROOT, 'tests/goldens', g, 'expected.json'), 'utf8');
      expect(committed, `${g} fixture drifted from the reference derivation`).toBe(fresh);
    }
  });
});

describe('SPEC §17 committed assertions', () => {
  let g1: any, g2: any, g3: any, g4: any, g5: any, g2d: any, g2dist: any, g3dist: any;
  beforeAll(() => {
    [g1, g2, g3, g4, g5, g2d, g2dist, g3dist] =
      ['G1', 'G2', 'G3', 'G4', 'G5', 'G2D', 'G2DIST', 'G3DIST'].map(load);
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
        // DPI monotone non-decreasing, and computed on distributions alone.
        if (i > 0) expect(g.returns.dpi[i]).toBeGreaterThanOrEqual(g.returns.dpi[i - 1]);
      });
      expect(g.distributions.cumulative_paid).toBeCloseTo(cum, 2);
      // Payback: distributions ALONE; exit proceeds never count (L-10). No golden reaches it
      // (the engine PR covers the reached branch with a module fixture — DERIVATION.md).
      if (cum >= g.derived.sponsor_equity) expect(g.returns.payback_year).toBeGreaterThan(0);
      else expect(g.returns.payback_year).toBeNull();
      // Distributions are excluded from the unlevered stream (§9 membership).
      expect(g.returns.unlevered.cashflows.length).toBe(g.waterfall.length + 1);
    }
  });

  it('balance sheet closes every year, every golden (§14.2)', () => {
    for (const g of [g1, g2, g3, g4, g5, g2d, g2dist, g3dist]) {
      for (const row of g.balance_sheet) expect(Math.abs(row.check)).toBeLessThan(0.005);
    }
  });
});
