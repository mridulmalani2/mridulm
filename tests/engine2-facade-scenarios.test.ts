/**
 * engine2/facade.ts + check.ts + scenarios.ts — SPEC §5/§13/§16 and the §14 invariant
 * suite (Phase C5 facade/coherence + C9 scenarios; the integration gate lives in
 * tests/engine2-integration.test.ts once all module PRs land).
 *
 * runModel is pure assembly, so this file gates: (a) the assembled ModelOutput's mirror
 * invariants (§14.16), (b) coherence-flag behavior (§16 — every golden runs CLEAN),
 * (c) §13 scenario semantics (G2-D fixture + frozen entry + credit dashboard),
 * (d) sensitivity grids (§14.7 center ≡ base, §14.11/§14.12 monotonicity domains).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runModel } from '../lib/engine2/facade';
import { applyScenarioDeltas, buildSensitivityGrid, runModelWithScenarios, runScenario } from '../lib/engine2/scenarios';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';
import type { DealAssumptions, DealFacts, ScenarioDeltas } from '../lib/engine2/types';

const ROOT = join(__dirname, '..');
const load = (n: string) => JSON.parse(readFileSync(join(ROOT, 'tests/goldens', n, 'expected.json'), 'utf8'));
const TOL = 0.0075;

const G2_DOWNSIDE: ScenarioDeltas = {
  operations: { growth: GOLDEN_DEALS.G2.assumptions.operations.growth.map((g) => g - 0.02) },
  exit_multiple: 8.5,
};

describe('facade.ts — assembled ModelOutput mirrors & coherence (C5 gate)', () => {
  for (const golden of ['G1', 'G2', 'G3', 'G4', 'G5']) {
    it(`${golden}: §14.16 mirror identities hold on the ASSEMBLED output; coherence is CLEAN`, () => {
      const { facts, assumptions } = GOLDEN_DEALS[golden];
      const out = runModel(facts, assumptions);

      // §14.16 single-source mirrors — exact, on the assembled object
      expect(out.sources_uses.enterprise_value).toBe(out.derived.enterprise_value);
      for (let y = 0; y < out.waterfall.length; y++) {
        const rowSum =
          out.tranches.reduce((s, tr) => s + tr[y].cash_interest, 0) +
          (out.revolver ? out.revolver[y].cash_interest : 0);
        expect(out.waterfall[y].cash_interest_total).toBeCloseTo(rowSum, 9);
        expect(out.operating[y].fcf_pre_debt).toBeCloseTo(
          out.operating[y].ebitda_adj - out.tax[y].cash_tax - out.operating[y].maint_capex - out.operating[y].growth_capex - out.operating[y].delta_nwc,
          9,
        );
      }
      expect(out.exit.sponsor_share + out.exit.rollover_share + out.exit.mip_payout).toBeCloseTo(
        out.exit.exit_equity_pre_mip_total,
        9,
      );
      expect(out.returns.sponsor_net.cashflows[out.returns.sponsor_net.cashflows.length - 1]).toBeCloseTo(
        out.exit.sponsor_share,
        9,
      );
      // §14.1 / §14.2 / §14.9 on the assembled object
      expect(out.sources_uses.total_sources).toBeCloseTo(out.sources_uses.total_uses, 9);
      for (const row of out.balance_sheet) expect(Math.abs(row.check)).toBeLessThan(1e-9);
      expect(Math.abs(out.bridge.reconciliation_residual)).toBeLessThan(1e-9);
      // credit populated for every hold year; no sentinels anywhere
      expect(out.credit).toHaveLength(assumptions.entry.hold_years);
      for (const c of out.credit) {
        for (const v of Object.values(c)) {
          if (typeof v === 'number') expect(Math.abs(v)).toBeLessThan(9000); // 9999/99 banned
        }
      }
      // §16: every golden is a coherent deal — ZERO flags
      expect(out.coherence).toEqual([]);
      expect(out.gp_fee_income).toBeNull(); // monitoring OFF in all goldens
      expect(out.scenarios).toBeNull();
      expect(out.sensitivity).toBeNull();
    });
  }

  it('§14.9 real-wiring, full friction (C8 review coverage note): monitoring ON + rollover + MIP + NTM both ends through runModel ⇒ both bridge identities exact on the ASSEMBLED output', () => {
    // The bridge suite's full-friction legs hand-build BridgeInputs, duplicating the
    // facade mapping (drift-prone). Pin the identity on the real wiring: every friction
    // live at once, asserted on runModel's own bridge block.
    const { facts, assumptions } = GOLDEN_DEALS.G2;
    const out = runModel(facts, {
      ...assumptions,
      entry: { ...assumptions.entry, basis: 'ntm' as const },
      exit: { ...assumptions.exit, basis: 'ntm' as const },
      rollover_equity: 60,
      fees: {
        ...assumptions.fees,
        monitoring: { annual: 2, termination_years: 3, discount_rate: 0.1 },
      },
      mip: { pool_pct: 0.15, hurdle_moic: 1.0 },
    });
    expect(Math.abs(out.bridge.reconciliation_residual)).toBeLessThan(1e-9);
    expect(out.bridge.walkdown.rollover_delta).not.toBe(0); // rollover leg genuinely live
    expect(out.exit.mip_payout).toBeGreaterThan(0); // MIP leg live
    expect(out.gp_fee_income).not.toBeNull(); // monitoring leg live
    // walk-down ties to the sponsor stream exactly (§14.9 identity (b) on real wiring)
    const sponsorDelta = out.returns.sponsor_net.cashflows[out.returns.sponsor_net.cashflows.length - 1] + out.returns.sponsor_net.cashflows[0];
    expect(Math.abs(out.bridge.walkdown.sponsor_net_delta - sponsorDelta)).toBeLessThan(1e-9);
  });

  it('coherence flags fire on engineered defects (§16 — each code reachable, right severity)', () => {
    const { facts, assumptions } = GOLDEN_DEALS.G5;
    // negative sponsor equity: par above total uses — cheap bullet debt so ONLY the
    // solvency flag fires (no cash-flow collapse muddying the case)
    const insolvent = runModel(facts, {
      ...assumptions,
      structure: {
        ...assumptions.structure,
        tranches: [
          {
            name: 'Jumbo', type: 'senior', size: { amount: 200 }, pricing: { kind: 'fixed', rate: 0.005 },
            amort_pct_of_face: 0, maturity_years: 10, oid_pct: 0, sweep: { participates: false, priority: 1 },
          },
        ],
      },
    });
    expect(insolvent.sources_uses.sponsor_equity).toBeLessThan(0);
    expect(insolvent.coherence.some((f) => f.code === 'negative_sponsor_equity' && f.severity === 'block')).toBe(true);

    // floor breach MID-HOLD (v1.0.3 §3.6 continuation, end-to-end): the Y3 hole exhausts
    // the revolver, Y4/Y5 still run on the inherited negative opening cash, the flag is
    // block-severity, and conservation is never clamped
    const breach = runModel(facts, {
      ...assumptions,
      operations: { ...assumptions.operations, growth_capex: [0, 0, 40, 0, 0] },
    });
    expect(breach.coherence.some((f) => f.code === 'cash_floor_breach' && f.severity === 'block')).toBe(true);
    expect(breach.waterfall[2].cash_floor_breach).toBe(true);
    expect(breach.waterfall[2].closing_cash).toBeLessThan(0);
    expect(breach.waterfall).toHaveLength(5); // Y4/Y5 computed — the run never halts
    expect(breach.balance_sheet).toHaveLength(6);
    for (const bs of breach.balance_sheet) expect(Math.abs(bs.check)).toBeLessThan(0.005); // §14.2 holds through the breach

    // §8 PP&E fallback note reaches the boundary (C2 review F3): null net_ppe ⇒ WARN
    const noPpe = runModel({ ...facts, net_ppe: null }, assumptions);
    expect(noPpe.coherence.some((f) => f.code === 'ppe_seeded_at_zero' && f.severity === 'warn')).toBe(true);
    expect(noPpe.balance_sheet[0].ppe).toBe(0);

    // negative PP&E: D&A far above capex
    const wornOut = runModel(facts, {
      ...assumptions,
      operations: { ...assumptions.operations, da_pct_revenue: 0.12 },
    });
    expect(wornOut.coherence.some((f) => f.code === 'negative_ppe' && f.severity === 'warn')).toBe(true);

    // covenant breach in base case (G2 Y1 runs ≈3.26x net)
    const covBreach = runModel(GOLDEN_DEALS.G2.facts, {
      ...GOLDEN_DEALS.G2.assumptions,
      covenants: { leverage_max: 3.0, dscr_min: null, fccr_min: null, springing: null },
    });
    expect(covBreach.coherence.some((f) => f.code === 'covenant_breach_base_case' && f.severity === 'warn')).toBe(true);

    // basis mismatch entry fy / exit ntm
    const mismatch = runModel(facts, { ...assumptions, exit: { ...assumptions.exit, basis: 'ntm' } });
    expect(mismatch.coherence.some((f) => f.code === 'basis_mismatch' && f.severity === 'warn')).toBe(true);

    // implausible days
    const silly = runModel(GOLDEN_DEALS.G3.facts, {
      ...GOLDEN_DEALS.G3.assumptions,
      operations: { ...GOLDEN_DEALS.G3.assumptions.operations, nwc: { method: 'days', dso: 400, dio: 30, dpo: 40 } },
    });
    expect(silly.coherence.some((f) => f.code === 'implausible_days' && f.severity === 'warn')).toBe(true);

    // entry multiple far above the trading anchor (facts-anchored — Phase D populates)
    const rich = runModel(
      { ...GOLDEN_DEALS.G2.facts, implied_trading_ev_ebitda: 7.0 },
      GOLDEN_DEALS.G2.assumptions,
    );
    expect(rich.coherence.some((f) => f.code === 'entry_multiple_vs_trading' && f.severity === 'warn')).toBe(true);
  });
});

describe('scenarios.ts — §13 semantics on the committed G2-D scenario (C9 gate)', () => {
  it('G2-D reproduces the committed fixture: frozen S&U, returns, smaller sweep every year, credit dashboard attached', () => {
    const g2 = load('G2');
    const g2d = load('G2D');
    const base = runModel(GOLDEN_DEALS.G2.facts, GOLDEN_DEALS.G2.assumptions);
    const scenario = runScenario(GOLDEN_DEALS.G2.facts, GOLDEN_DEALS.G2.assumptions, base, 'committed downside', G2_DOWNSIDE);

    // §14.17: entry frozen — base S&U ≡ fixture ≡ scenario runs (scenario re-runs share the object shape)
    expect(Math.abs(base.sources_uses.sponsor_equity - g2.sources_uses.sponsor_equity)).toBeLessThan(TOL);
    for (const stream of ['sponsor_net', 'pre_promote', 'unlevered'] as const) {
      const fix = g2d.returns[stream];
      for (let i = 0; i < fix.cashflows.length; i++) {
        expect(Math.abs(scenario.returns[stream].cashflows[i] - fix.cashflows[i]), `${stream} cf[${i}]`).toBeLessThan(TOL);
      }
      expect(Math.abs(scenario.returns[stream].irr! - fix.irr), `${stream} irr`).toBeLessThan(1e-5);
    }
    // §14.8: downside ⇒ sponsor IRR ≤ base; delta reported
    expect(scenario.returns.sponsor_net.irr!).toBeLessThanOrEqual(base.returns.sponsor_net.irr!);
    expect(scenario.irr_delta_vs_base!).toBeLessThan(0);
    // §17 G2-D: smaller sweep EVERY year
    for (let y = 0; y < scenario.waterfall.length; y++) {
      expect(scenario.waterfall[y].sweep_applied_total, `Y${y + 1} sweep`).toBeLessThan(
        base.waterfall[y].sweep_applied_total,
      );
    }
    expect(scenario.covenant_breach_year).toBeNull(); // cov-lite
    expect(scenario.credit).toHaveLength(5);
  });

  it('§14.7: an EMPTY delta-set reproduces the base run exactly (flows, IRR, credit)', () => {
    const base = runModel(GOLDEN_DEALS.G2.facts, GOLDEN_DEALS.G2.assumptions);
    const identity = runScenario(GOLDEN_DEALS.G2.facts, GOLDEN_DEALS.G2.assumptions, base, 'noop', {});
    expect(identity.returns.sponsor_net.cashflows).toEqual(base.returns.sponsor_net.cashflows);
    expect(identity.returns.sponsor_net.irr).toBe(base.returns.sponsor_net.irr);
    expect(identity.irr_delta_vs_base).toBe(0);
    expect(identity.credit).toEqual(base.credit);
  });

  it('§13 merge is field-level; arrays replace whole; untouched fields are shared', () => {
    const merged = applyScenarioDeltas(GOLDEN_DEALS.G2.assumptions, G2_DOWNSIDE);
    const expected = [0.04, 0.03, 0.02, 0.02, 0.01];
    merged.operations.growth.forEach((g, i) => expect(g).toBeCloseTo(expected[i], 12));
    expect(merged.exit.multiple).toBe(8.5);
    expect(merged.exit.fees_pct).toBe(GOLDEN_DEALS.G2.assumptions.exit.fees_pct); // NOT flexible (§13)
    expect(merged.structure).toBe(GOLDEN_DEALS.G2.assumptions.structure); // frozen by type
    expect(merged.operations.target_margin).toBe(0.22);
  });
});

describe('scenarios.ts — sensitivity grids (§13/§14.7/§14.11/§14.12)', () => {
  it('§14.7: the center cell IS the base run; operating axes leave S&U frozen; entry axis re-prices', () => {
    const { facts, assumptions } = GOLDEN_DEALS.G2;
    const out = runModelWithScenarios(facts, assumptions, {
      sensitivity: [
        {
          // growth axis is a SHIFT vs the base path (center = 0 — §13 axis semantics)
          row_axis: 'exit_multiple', col_axis: 'growth',
          row_values: [8, 8.5, 9, 9.5, 10], col_values: [-0.015, 0, 0.015],
          base_row_index: 2, base_col_index: 1,
        },
      ],
    });
    const grid = out.sensitivity![0];
    expect(grid.irr[2][1]).toBe(out.returns.sponsor_net.irr); // §14.7 exact — same object
    // §14.11: IRR strictly increasing down the exit-multiple axis, in EVERY growth column
    // (consistent axis semantics — the base row is not a discontinuity)
    for (let c = 0; c < grid.col_values.length; c++) {
      for (let r = 1; r < grid.row_values.length; r++) {
        expect(grid.irr[r][c]!, `row ${r} col ${c}`).toBeGreaterThan(grid.irr[r - 1][c]!);
      }
    }
    // §14.8 flavor: the downside growth column is below the base column everywhere
    for (let r = 0; r < grid.row_values.length; r++) {
      expect(grid.irr[r][0]!).toBeLessThan(grid.irr[r][1]! + 1e-12);
    }
  });

  it('§14.12 (frictionless domain): leverage ↑ ⇒ sponsor IRR ↑ — zero fees/OID, bullet fixed-rate debt, no revolver, no floor bind, unlevered return > cost of debt', () => {
    const facts: DealFacts = { ...GOLDEN_DEALS.G1.facts };
    const frictionless: DealAssumptions = {
      ...GOLDEN_DEALS.G1.assumptions,
      operations: { ...GOLDEN_DEALS.G1.assumptions.operations, growth: [0.05, 0.05, 0.05, 0.05, 0.05] },
      structure: {
        min_cash: 0,
        sweep: { base_pct: 0, grid: null },
        tranches: [
          {
            name: 'Bullet', type: 'senior', size: { x_ebitda: 1 }, pricing: { kind: 'fixed', rate: 0.03 },
            amort_pct_of_face: 0, maturity_years: 10, oid_pct: 0, sweep: { participates: false, priority: 1 },
          },
        ],
      },
      fees: { transaction_pct_of_ev: 0, financing_pct_of_commitments: 0, monitoring: null },
    };
    const base = runModel(facts, frictionless);
    expect(base.returns.unlevered.irr!).toBeGreaterThan(0.03); // domain precondition
    const grid = buildSensitivityGrid(facts, frictionless, base, {
      row_axis: 'leverage', col_axis: 'exit_multiple',
      row_values: [0.5, 1, 2, 3, 4], col_values: [8],
      base_row_index: 1, base_col_index: 0,
    });
    for (let r = 1; r < grid.row_values.length; r++) {
      expect(grid.irr[r][0]!, `leverage ${grid.row_values[r]}x`).toBeGreaterThan(grid.irr[r - 1][0]!);
    }
  });

  it('§13 [C9 review F1]: an operating co-axis NEVER re-prices entry in a mixed grid — NTM basis, entry axis at its base value ⇒ cell ≡ the entry-frozen scenario oracle', () => {
    // Under entry.basis 'ntm', deriveEntry prices EV off growth[0]; a growth co-axis in a
    // mixed grid must not reach entry pricing (the L-1 pattern — probed at ~69bp optimistic
    // pre-fix). With the entry axis pinned AT its base value, every cell must equal the
    // §13 scenario path (verified entry-frozen) for the same growth delta.
    const facts = GOLDEN_DEALS.G2.facts;
    const ntmAssumptions: DealAssumptions = {
      ...GOLDEN_DEALS.G2.assumptions,
      entry: { ...GOLDEN_DEALS.G2.assumptions.entry, basis: 'ntm' as const },
    };
    const base = runModel(facts, ntmAssumptions);
    const growthDelta: ScenarioDeltas = {
      operations: { growth: ntmAssumptions.operations.growth.map((g) => g - 0.02) },
    };
    const oracle = runScenario(facts, ntmAssumptions, base, 'downside oracle', growthDelta);

    // (a) leverage × growth — leverage row fixed at the base total (4.0× FY on G2)
    const baseLeverage =
      base.derived.total_debt_at_par / facts.fy_ebitda;
    const levGrid = buildSensitivityGrid(facts, ntmAssumptions, base, {
      row_axis: 'leverage',
      col_axis: 'growth',
      row_values: [baseLeverage],
      col_values: [0, -0.02],
      base_row_index: 0,
      base_col_index: 0,
    });
    expect(levGrid.irr[0][0]).toBe(base.returns.sponsor_net.irr); // center ≡ base (§14.7)
    expect(levGrid.irr[0][1]).not.toBeNull();
    expect(Math.abs(levGrid.irr[0][1]! - oracle.returns.sponsor_net.irr!)).toBeLessThan(1e-12);

    // (b) entry_multiple × growth — multiple row fixed at the base multiple
    const mulGrid = buildSensitivityGrid(facts, ntmAssumptions, base, {
      row_axis: 'entry_multiple',
      col_axis: 'growth',
      row_values: [base.derived.entry_multiple],
      col_values: [0, -0.02],
      base_row_index: 0,
      base_col_index: 0,
    });
    expect(mulGrid.irr[0][1]).not.toBeNull();
    expect(Math.abs(mulGrid.irr[0][1]! - oracle.returns.sponsor_net.irr!)).toBeLessThan(1e-12);
  });

  it('entry-side axis re-prices entry (S&U moves); §13 sensitivity contract', () => {
    const { facts, assumptions } = GOLDEN_DEALS.G2;
    const base = runModel(facts, assumptions);
    const grid = buildSensitivityGrid(facts, assumptions, base, {
      row_axis: 'entry_multiple', col_axis: 'exit_multiple',
      row_values: [8, 9, 10], col_values: [9],
      base_row_index: 1, base_col_index: 0,
    });
    // richer entry, same exit ⇒ lower IRR
    expect(grid.irr[0][0]!).toBeGreaterThan(grid.irr[1][0]!);
    expect(grid.irr[2][0]!).toBeLessThan(grid.irr[1][0]!);
  });
});
