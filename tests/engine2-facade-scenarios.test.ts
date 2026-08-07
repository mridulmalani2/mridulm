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
import { entryMultipleDisplay, exitMultipleDisplay } from '../lib/engine2/display';
import { waterfallYear } from '../lib/engine2/kernel/waterfall';
import { applyAxis, applyScenarioDeltas, buildSensitivityGrid, runModelWithScenarios, runScenario } from '../lib/engine2/scenarios';
import { entryGrossLeverageFromAssumptions } from '../lib/engine2/sourcesUses';
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
  // G6REFI [v1.3.0] joins the mirror/bridge/coherence gate: a refinancing raises NO coherence
  // flag by itself (§18.8), the §14.9 bridge STILL reconciles with the refi's cash costs embedded
  // in the paydown bar (no new bar/walk-down line — §18.7), and gp_fee_income stays null.
  for (const golden of ['G1', 'G2', 'G3', 'G4', 'G5', 'G6REFI']) {
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
      // §16: every golden is a coherent deal — ZERO flags. §17 [v1.1.1] amends this
      // deliberately for the DIST goldens: G2-DIST and G2-DIST-D are DESIGNED to trip
      // §3.7's `distribution_blocked` WARN, and a blocked distribution is the trap doing
      // its job, not an incoherent deal. Exactly one WARN, listing exactly the blocked
      // years the fixture records.
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

    // §8 [v1.0.5] negative goodwill: asset-heavy at a low multiple ⇒ the SIGNED plug goes
    // negative and the WARN fires — never clamped, never silent. Trigger = sign of the plug.
    const assetHeavy = runModel({ ...facts, net_ppe: facts.fy_ebitda * 10 }, assumptions);
    expect(assetHeavy.balance_sheet[0].goodwill).toBeLessThan(0);
    expect(assetHeavy.balance_sheet[0].goodwill).toBe(assetHeavy.balance_sheet[5].goodwill); // t=0 plug, never amortized
    const ngw = assetHeavy.coherence.find((f) => f.code === 'negative_goodwill');
    expect(ngw?.severity).toBe('warn');
    expect(ngw?.message).toContain('bargain-purchase');
    for (const bs of assetHeavy.balance_sheet) expect(Math.abs(bs.check)).toBeLessThan(0.005); // §14.2 sign-agnostic
    // …and the base case (positive plug) stays silent
    expect(runModel(facts, assumptions).coherence.some((f) => f.code === 'negative_goodwill')).toBe(false);

    // covenant breach in base case (G2 Y1 runs ≈3.26x net)
    const covBreach = runModel(GOLDEN_DEALS.G2.facts, {
      ...GOLDEN_DEALS.G2.assumptions,
      covenants: { leverage_max: 3.0, dscr_min: null, fccr_min: null, springing: null, rp_trap: null },
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
        sweep: { base_pct: 0, grid: null }, distributions: null, refinancing: null,
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

/**
 * The INPUT surface's "Total leverage" field (AssumptionsPanel) and the OUTPUT surface's
 * `derived.entry_gross_leverage_fy` must be the same number, and editing the field must be
 * the §13 `leverage` axis. Both were broken (hostile sign-off of SPEC v1.1.2, finding F7):
 * the panel read `x_ebitda` off the FIRST senior/unitranche tranche only — 3.0x beside a
 * 4.5x headline on G3 — and its writer put the typed value on EVERY tranche, so typing 4.0
 * on a two-tranche deal produced 8.0x of actual leverage under a field labelled "total".
 */
describe('entry leverage: one definition across the input and output surfaces (§11 v1.1.2)', () => {
  for (const golden of ['G1', 'G2', 'G3', 'G4', 'G5'] as const) {
    it(`${golden}: the panel's read ≡ derived.entry_gross_leverage_fy`, () => {
      const { facts, assumptions } = GOLDEN_DEALS[golden];
      const panel = entryGrossLeverageFromAssumptions(facts, assumptions);
      const model = runModel(facts, assumptions).derived.entry_gross_leverage_fy;
      expect(panel).not.toBeNull();
      expect(panel!).toBeCloseTo(model, 12);
    });
  }

  it('G3 (senior 3.0x + PIK note 1.5x) is the case the old reader got wrong: total is 4.5x, not 3.0x', () => {
    const { facts, assumptions } = GOLDEN_DEALS.G3;
    // the defect, reproduced exactly: first senior/unitranche tranche's x_ebitda
    const firstTermOnly = assumptions.structure.tranches.find(
      (t) => t.type === 'senior' || t.type === 'unitranche',
    );
    expect(firstTermOnly && 'size' in firstTermOnly ? firstTermOnly.size.x_ebitda : null).toBe(3.0);
    // what the panel must actually show — and what the Summary tile shows
    expect(entryGrossLeverageFromAssumptions(facts, assumptions)).toBeCloseTo(4.5, 12);
    expect(runModel(facts, assumptions).derived.entry_gross_leverage_fy).toBeCloseTo(4.5, 12);
  });

  it('editing the field is the §13 leverage axis: typing X yields total leverage X, not X per tranche', () => {
    for (const golden of ['G2', 'G3'] as const) {
      const { facts, assumptions } = GOLDEN_DEALS[golden];
      for (const typed of [3.0, 4.0, 5.5]) {
        const next = applyAxis(facts, assumptions, 'leverage', typed);
        // round-trip through the SAME reader the panel renders
        expect(entryGrossLeverageFromAssumptions(facts, next), `${golden} typed ${typed}`).toBeCloseTo(typed, 12);
        // and through the engine, so the input and output surfaces still agree after an edit
        expect(runModel(facts, next).derived.entry_gross_leverage_fy).toBeCloseTo(typed, 12);
        // proportional, not uniform: G3's 2:1 senior:PIK split must survive the rescale
        const terms = next.structure.tranches.filter((t) => t.type !== 'revolver');
        if (golden === 'G3') {
          const [senior, pik] = terms.map((t) => ('size' in t ? t.size.x_ebitda! : 0));
          expect(senior / pik).toBeCloseTo(2.0, 12);
        }
      }
    }
  });

  it('the old writer is what a "total" field must never do: X on every tranche multiplies leverage', () => {
    const { facts, assumptions } = GOLDEN_DEALS.G3;
    const oldWriter = {
      ...assumptions,
      structure: {
        ...assumptions.structure,
        tranches: assumptions.structure.tranches.map((t) =>
          t.type === 'revolver' || !('size' in t) || t.size.x_ebitda === undefined ? t : { ...t, size: { x_ebitda: 4.0 } },
        ),
      },
    };
    expect(entryGrossLeverageFromAssumptions(facts, oldWriter)).toBeCloseTo(8.0, 12); // typed 4.0 → 8.0x
    expect(entryGrossLeverageFromAssumptions(facts, applyAxis(facts, assumptions, 'leverage', 4.0))).toBeCloseTo(4.0, 12);
  });

  it('non-positive FY EBITDA renders N/A, never a sentinel (§11/§15)', () => {
    const { facts, assumptions } = GOLDEN_DEALS.G2;
    expect(entryGrossLeverageFromAssumptions({ ...facts, fy_ebitda: 0 }, assumptions)).toBeNull();
    expect(entryGrossLeverageFromAssumptions({ ...facts, fy_ebitda: -5 }, assumptions)).toBeNull();
  });
});


/**
 * §3.7 / §17 [v1.1.1] — the ONE deliberate exception to "every golden runs coherence-CLEAN".
 * G2-DIST and G2-DIST-D are built to make the restricted-payment trap bind, so they must
 * carry exactly one WARN naming exactly the blocked years the fixtures record. G3-DIST runs
 * the trap OFF and must stay clean, which is what makes this a real discriminator rather
 * than a blanket exemption for anything with a distribution schedule.
 */
describe('§3.7 distribution_blocked WARN (the amended coherence convention)', () => {
  const blockedFixture = (n: string) => load(n).distributions.blocked_years as number[];

  for (const golden of ['G2DIST', 'G2DISTD'] as const) {
    it(`${golden}: exactly one WARN, listing the fixture's blocked years`, () => {
      const { facts, assumptions } = GOLDEN_DEALS[golden];
      const flags = runModel(facts, assumptions).coherence;
      expect(flags).toHaveLength(1);
      expect(flags[0].code).toBe('distribution_blocked');
      expect(flags[0].severity).toBe('warn'); // the trap working is not a broken model
      for (const y of blockedFixture(golden)) expect(flags[0].message).toContain(String(y));
    });
  }

  it('G3DIST: trap OFF ⇒ no distributions are blocked ⇒ still coherence-CLEAN', () => {
    const { facts, assumptions } = GOLDEN_DEALS.G3DIST;
    expect(blockedFixture('G3DIST')).toEqual([]);
    expect(runModel(facts, assumptions).coherence).toEqual([]);
  });

  it('§13: the scenario slim block carries paid/blocked per year, and the policy is FROZEN', () => {
    const { facts, assumptions } = GOLDEN_DEALS.G2DIST;
    const base = runModel(facts, assumptions);
    const down = runScenario(facts, assumptions, base, 'downside', G2_DOWNSIDE);
    expect(down.waterfall[0]).toHaveProperty('distribution_paid');
    expect(down.waterfall[0]).toHaveProperty('distribution_blocked');
    // same policy, different binding — Y2 pays in the base and is fully blocked in the downside
    const g2dist = load('G2DIST');
    const g2distd = load('G2DISTD');
    expect(g2dist.distributions.requested).toEqual(g2distd.distributions.requested);
    expect(g2dist.waterfall[1].distribution_paid).toBeGreaterThan(0);
    expect(down.waterfall[1].distribution_paid).toBe(0);
    expect(down.waterfall[1].distribution_blocked).toBe(true);
  });
});

/**
 * SPEC §17 [v1.1.1] "golden-uncovered by design" — every branch on that list needs an
 * engine-side fixture, because no §17 workbook can produce it. Each test names its item.
 */
describe('§17 golden-uncovered branches (the list each needs a fixture for)', () => {
  const g2 = () => GOLDEN_DEALS.G2;

  it('(ii) accrued PIK is INSIDE gross_debt_end when the trap binds', () => {
    // G3-DIST has the PIK note but runs the trap OFF; G2-DIST has the trap but no PIK.
    // Turning the trap ON over G3's stack is the only way to see the PIK in the metric.
    const { facts, assumptions } = GOLDEN_DEALS.G3DIST;
    const withTrap = { ...assumptions, covenants: { ...assumptions.covenants, rp_trap: { metric: 'net_leverage' as const, level: 3.5 } } };
    const out = runModel(facts, withTrap);
    out.waterfall.forEach((w, i) => {
      if (w.rp_max === null) return;
      const gross = out.tranches.reduce((a, t) => a + t[i].ending_balance, 0) + (out.revolver?.[i].ending_drawn ?? 0);
      // the PIK leg is a real part of the trap's debt measure
      const pikEnd = out.tranches.find((t) => t[0].name === 'PIK Note')![i].ending_balance;
      expect(pikEnd).toBeGreaterThan(0);
      expect(gross).toBeGreaterThan(pikEnd);
      expect(w.rp_max).toBeCloseTo(Math.max(0, (w.closing_cash + w.distribution_paid) - (gross - 3.5 * out.operating[i].ebitda_adj)), 6);
    });
  });

  it('(iii) the exact §3.7 TIE: rp_max == the cash-capped amount ⇒ NOT blocked', () => {
    // Unconstructible from a full model chain in float, so it is pinned at the kernel.
    const base = {
      opening_cash: 100, fcf_pre_debt: 0, min_cash: 10, sweep_pct: 0,
      tranches: [], revolver: null, ebitda_adj: 100,
    };
    // cash at step 7 = 100, floor 10 ⇒ cash cap 90. Choose L so rp_max is EXACTLY 90.
    const out = waterfallYear({ ...base, distribution_request: 1000, rp_trap_level: -0.1 });
    expect(out.rp_max).toBeCloseTo(90, 12); // 100 − (0 − (−0.1 × 100)) = 90
    expect(out.distribution_paid).toBeCloseTo(90, 12);
    expect(out.distribution_blocked).toBe(false); // ties ⇒ false
  });

  it('(iv) §10 exit-equity CAP binds and TRUNCATES the promote with no accrual', () => {
    const { facts } = g2();
    const a = {
      ...g2().assumptions,
      mip: { pool_pct: 1.0, hurdle_moic: 0 }, // pool 100%, no hurdle ⇒ uncapped ≫ exit equity
      structure: { ...g2().assumptions.structure, distributions: [10, 10, 10, 10, 10] },
    };
    const out = runModel(facts, a);
    const cum = out.waterfall.reduce((s, w) => s + w.distribution_paid, 0);
    const uncapped = 1.0 * (out.exit.exit_equity_pre_mip_total + cum);
    expect(uncapped).toBeGreaterThan(out.exit.exit_equity_pre_mip_total); // the cap is live
    expect(out.exit.mip_payout).toBeCloseTo(out.exit.exit_equity_pre_mip_total, 6); // truncated
    expect(out.exit.sponsor_share).toBeCloseTo(0, 6);
  });

  it('(v) payback REACHED in-hold, and it counts distributions ALONE', () => {
    const { facts } = g2();
    const huge = [400, 400, 400, 400, 400]; // far above the cash caps; paid is what matters
    const out = runModel(facts, { ...g2().assumptions, structure: { ...g2().assumptions.structure, distributions: huge } });
    const cum: number[] = [];
    out.waterfall.reduce((s, w) => { cum.push(s + w.distribution_paid); return s + w.distribution_paid; }, 0);
    const expected = cum.findIndex((c) => c >= out.derived.sponsor_equity);
    expect(out.returns.payback_year).toBe(expected === -1 ? null : expected + 1);
    // and the exit — however large — never contributes
    expect(out.exit.sponsor_share).toBeGreaterThan(out.derived.sponsor_equity);
    if (expected === -1) expect(out.returns.payback_year).toBeNull();
  });

  it('(vi) step 7 inside a floor-breach year pays 0 by arithmetic, and is NOT flagged blocked', () => {
    const out = waterfallYear({
      opening_cash: 5, fcf_pre_debt: -50, min_cash: 10, sweep_pct: 0,
      tranches: [], revolver: { beginning_drawn: 0, commitment: 5, cash_interest: 0, commitment_fee: 0 },
      distribution_request: 25, rp_trap_level: null, ebitda_adj: 100,
    });
    expect(out.cash_floor_breach).toBe(true);
    expect(out.distribution_paid).toBe(0);
    expect(out.distribution_blocked).toBe(false); // cash stopped it, not the trap
  });

  it('(viii) rollover > 0: the sponsor takes its PARI-PASSU share of each distribution', () => {
    const { facts } = g2();
    const a = { ...g2().assumptions, rollover_equity: 100, structure: { ...g2().assumptions.structure, distributions: [20, 20, 20, 20, 20] } };
    const out = runModel(facts, a);
    const share = out.sources_uses.sponsor_equity / (out.sources_uses.sponsor_equity + out.sources_uses.rollover_equity);
    expect(share).toBeLessThan(1); // rollover is live
    for (let t = 1; t < out.returns.sponsor_net.cashflows.length - 1; t++) {
      expect(out.returns.sponsor_net.cashflows[t]).toBeCloseTo(out.waterfall[t - 1].distribution_paid * share, 9);
      // the pre-promote stream takes the TOTAL (§9 membership)
      expect(out.returns.pre_promote.cashflows[t]).toBeCloseTo(out.waterfall[t - 1].distribution_paid, 9);
    }
    // §12/§14.9 (x): the walk-down adds back only the SPONSOR slice; both identities exact
    expect(Math.abs(out.bridge.reconciliation_residual)).toBeLessThan(1e-6);
    const cumSponsor = out.waterfall.reduce((s, w) => s + w.distribution_paid * share, 0);
    expect(out.bridge.walkdown.interim_distributions_sponsor).toBeCloseTo(cumSponsor, 9);
    expect(out.bridge.walkdown.interim_distributions_sponsor)
      .toBeLessThan(out.waterfall.reduce((s, w) => s + w.distribution_paid, 0)); // NOT the total
  });

  it('(x) §10 hurdle base takes the TOTAL distributions, not the sponsor share — the rollover∧MIP∧dist case no golden makes (accuracy audit B, 2026-07-25)', () => {
    // SPEC §17(x): §10's hurdle takes the TOTAL cumulative distributions while §12's
    // walk-down adds back only the SPONSOR share; they coincide at rollover 0, which is every
    // golden. The audit proved a `total→share` mutation of facade.ts:43 passed 402/402 — only
    // the §12 half was pinned. This is the missing §10 fixture: rollover > 0 ∧ MIP ∧ dist.
    const { facts } = g2();
    const a = {
      ...g2().assumptions,
      rollover_equity: 100,
      mip: { pool_pct: 0.15, hurdle_moic: 1.0 }, // low hurdle ⇒ promote in the money
      structure: { ...g2().assumptions.structure, distributions: [20, 20, 20, 20, 20] },
    };
    const out = runModel(facts, a);
    const invested = out.sources_uses.sponsor_equity + out.sources_uses.rollover_equity;
    const share = out.sources_uses.sponsor_equity / invested;
    const cumTotal = out.waterfall.reduce((s, w) => s + w.distribution_paid, 0);
    const cumSponsor = cumTotal * share;
    expect(share).toBeLessThan(1);                  // rollover live
    expect(cumTotal).toBeGreaterThan(0);            // distributions paid
    expect(out.exit.mip_payout).toBeGreaterThan(0); // promote in the money

    const exitEq = out.exit.exit_equity_pre_mip_total;
    const mipTotal = Math.min(0.15 * Math.max(0, exitEq + cumTotal - invested), Math.max(0, exitEq));
    const mipShare = Math.min(0.15 * Math.max(0, exitEq + cumSponsor - invested), Math.max(0, exitEq));
    // the engine matches the TOTAL base and NOT the sponsor-share base:
    expect(out.exit.mip_payout).toBeCloseTo(mipTotal, 6);
    expect(Math.abs(mipTotal - mipShare)).toBeGreaterThan(0.5);            // genuinely discriminating
    expect(Math.abs(out.exit.mip_payout - mipShare)).toBeGreaterThan(0.5); // the mutation would fail here

    // §12/§14.9 identity (b), asserted DIRECTLY on sponsor_net_delta with distributions
    // present (accuracy audit A): the reconciliation_residual re-encodes identity (a) — the
    // distribution term cancels out of it — so the walk-down's sponsor-total delta must be
    // pinned against an independent recomputation here, not via the residual.
    const cumSponsorPaid = out.waterfall.reduce((s, w) => s + w.distribution_paid * share, 0);
    const sponsorTotalDelta = out.exit.sponsor_share + cumSponsorPaid - out.sources_uses.sponsor_equity;
    expect(out.bridge.walkdown.sponsor_net_delta).toBeCloseTo(sponsorTotalDelta, 6);
    expect(out.bridge.walkdown.interim_distributions_sponsor).toBeCloseTo(cumSponsorPaid, 9);
    // and the §14.9 frictionless-bar identity (a) still reconciles
    expect(Math.abs(out.bridge.reconciliation_residual)).toBeLessThan(1e-6);
  });

  it('(ix) distributions never enter DSCR/FCCR/ICR or FCF conversion (§14.18)', () => {
    const { facts } = g2();
    const withDist = { ...g2().assumptions, structure: { ...g2().assumptions.structure, distributions: [20, 20, 20, 20, 20] } };
    const a = runModel(facts, g2().assumptions);
    const b = runModel(facts, withDist);
    // Y1 is the clean comparison: its credit metrics are built from Y1 flows, and the
    // distribution is paid at the END of Y1 — after every ratio's inputs are fixed.
    expect(b.credit[0].dscr).toBeCloseTo(a.credit[0].dscr!, 12);
    expect(b.credit[0].fccr).toBeCloseTo(a.credit[0].fccr!, 12);
    expect(b.credit[0].icr).toBeCloseTo(a.credit[0].icr!, 12);
    expect(b.credit[0].fcf_conversion).toBeCloseTo(a.credit[0].fcf_conversion!, 12);
    // net leverage DOES move — cash left the balance sheet, which is the honest effect
    expect(b.credit[0].net_leverage).toBeGreaterThan(a.credit[0].net_leverage!);
  });
});

/**
 * §11 entry-multiple basis display (ticket: 'Entry multiple (FY)' hard-coded but NTM-based
 * under an NTM entry). NTM is golden-uncovered by design, so this is a directed test with a
 * mutation partner. G2 growth[0] = 6%, so NTM EBITDA = FY × 1.06 and the two multiples must
 * genuinely differ under an NTM entry.
 */
describe('entryMultipleDisplay — §11 "shows both, LTM canonical"', () => {
  const ntm = (): DealAssumptions => ({
    ...GOLDEN_DEALS.G2.assumptions,
    entry: { ...GOLDEN_DEALS.G2.assumptions.entry, basis: 'ntm' },
  });

  it('FY entry: label FY, one figure, fy_canonical null (byte-identical to before)', () => {
    const o = runModel(GOLDEN_DEALS.G2.facts, GOLDEN_DEALS.G2.assumptions);
    const em = entryMultipleDisplay(o);
    expect(em.basis_label).toBe('FY');
    expect(em.valuation).toBeCloseTo(o.derived.entry_multiple, 12);
    expect(em.fy_canonical).toBeNull(); // FY ⇒ the two coincide ⇒ only one line shown
    // and the canonical formula, if it were computed, equals the valuation for an FY deal
    expect(o.derived.enterprise_value / o.derived.entry_ebitda_for_sizing).toBeCloseTo(o.derived.entry_multiple, 12);
  });

  it('NTM entry: label NTM, valuation on NTM EBITDA, fy_canonical = EV ÷ FY EBITDA, genuinely different', () => {
    const o = runModel(GOLDEN_DEALS.G2.facts, ntm());
    const em = entryMultipleDisplay(o);
    expect(em.basis_label).toBe('NTM');
    // driver=multiple ⇒ the displayed valuation multiple is the user's 9x, applied to NTM EBITDA
    expect(em.valuation).toBeCloseTo(9, 12);
    expect(em.fy_canonical).not.toBeNull();
    // FY-canonical = 9 × (NTM/FY) = 9 × 1.06 = 9.54 — the "9x NTM is 9.54x FY" honesty
    expect(em.fy_canonical!).toBeCloseTo(9 * 1.06, 6);
    expect(em.fy_canonical!).toBeGreaterThan(em.valuation); // the two are NOT the same number
    // pins the mutation "hard-code basis_label 'FY'": that would make basis_label wrong here
    expect(em.basis_label).not.toBe('FY');
  });
});

describe('exitMultipleDisplay — §9 single-source + value provenance', () => {
  // The exit multiple was reconstructed inline as `exit_ev / exit_ebitda_basis_value` on THREE
  // surfaces (OutputTabs, excelExport, memo); this pins the one helper they now share.
  it('recovers the exit multiple ASSUMPTION exactly (provenance: exit_ev = multiple × basis)', () => {
    for (const key of ['G1', 'G2', 'G3'] as const) {
      const deal = GOLDEN_DEALS[key];
      const o = runModel(deal.facts, deal.assumptions);
      // exit.ts builds exit_ev = assumptions.exit.multiple × exit_ebitda_basis_value, so the
      // displayed ratio traces to the exit multiple assumption — a value-provenance check, the
      // thing label-mutation tests do NOT do (they assert the label, not that value == source).
      expect(exitMultipleDisplay(o)).toBeCloseTo(deal.assumptions.exit.multiple, 10);
    }
  });

  it('catches a reciprocal/wrong-field mutation (non-vacuous)', () => {
    const o = runModel(GOLDEN_DEALS.G2.facts, GOLDEN_DEALS.G2.assumptions);
    const canonical = exitMultipleDisplay(o);
    // a helper that divided basis ÷ ev (the reciprocal) would NOT recover the assumption
    expect(o.exit.exit_ebitda_basis_value / o.exit.exit_ev).not.toBeCloseTo(GOLDEN_DEALS.G2.assumptions.exit.multiple, 2);
    // and it is genuinely a >1x number here, so the reciprocal is a distinct value
    expect(canonical).toBeGreaterThan(1);
  });
});

describe('G-2 fixture (viii) — the NTM base on a STITCHED LTM fact [B1, engine half]', () => {
  // The stitch (data-side) produces LTM EBITDA 328 for fixture (viii); this pins the ENGINE half:
  // under an NTM entry the valuation base is LTM × (1 + growth[0]) with growth[0] the annualized
  // rate, and entry_ebitda_for_sizing is the LTM sizing basis — NOT the stale FY, NOT the projected base.
  const LTM_EBITDA = 328, LTM_REVENUE = 1320;
  const factsLtm = { ...GOLDEN_DEALS.G2.facts, fy_ebitda: LTM_EBITDA, fy_revenue: LTM_REVENUE,
    fy_ebitda_margin: LTM_EBITDA / LTM_REVENUE, sizing_basis: 'LTM' as const };
  const ntm: DealAssumptions = { ...GOLDEN_DEALS.G2.assumptions,
    entry: { ...GOLDEN_DEALS.G2.assumptions.entry, basis: 'ntm' } };

  it('EV = entry_multiple × (LTM × (1+growth[0])); sizing EBITDA is the LTM, not a stale FY', () => {
    const o = runModel(factsLtm, ntm);
    const g0 = ntm.operations.growth[0];
    const ntmBase = LTM_EBITDA * (1 + g0);
    expect(o.derived.enterprise_value).toBeCloseTo(o.derived.entry_multiple * ntmBase, 6);
    // leverage / FY-canonical size on the LTM fact itself (the §11 "FY(LTM)" basis)
    expect(o.derived.entry_ebitda_for_sizing).toBeCloseTo(LTM_EBITDA, 6);
    // mutation guard: sizing the NTM base off a stale FY (e.g. 250) would move EV materially
    expect(o.derived.enterprise_value).not.toBeCloseTo(o.derived.entry_multiple * 250 * (1 + g0), 2);
  });
});
