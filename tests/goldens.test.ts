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
    for (const g of ['G1', 'G2', 'G3', 'G4', 'G5', 'G2D']) {
      const fresh = readFileSync(join(tmp, g, 'expected.json'), 'utf8');
      const committed = readFileSync(join(ROOT, 'tests/goldens', g, 'expected.json'), 'utf8');
      expect(committed, `${g} fixture drifted from the reference derivation`).toBe(fresh);
    }
  });
});

describe('SPEC §17 committed assertions', () => {
  let g1: any, g2: any, g3: any, g4: any, g5: any, g2d: any;
  beforeAll(() => { [g1, g2, g3, g4, g5, g2d] = ['G1', 'G2', 'G3', 'G4', 'G5', 'G2D'].map(load); });

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
  it('balance sheet closes every year, every golden (§14.2)', () => {
    for (const g of [g1, g2, g3, g4, g5, g2d]) {
      for (const row of g.balance_sheet) expect(Math.abs(row.check)).toBeLessThan(0.005);
    }
  });
});
