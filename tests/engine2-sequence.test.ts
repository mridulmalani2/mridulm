/**
 * engine2/sequence.ts — the FIRST END-TO-END run (Phase C5 gate, PHASE_C build order #5).
 *
 * No injection anywhere: runCore consumes only the SPEC §17 facts/assumptions and must
 * reproduce every golden block it owns — operating, tax, tranche schedules, revolver,
 * waterfall, balance sheet (t0-anchored) — at FULL precision against the 2dp fixtures
 * (±$0.0075 per line, the §15 golden tolerance + display rounding). This is the §15
 * integration tolerance applied module-complete; exit/returns/credit/bridge follow in
 * C6–C9.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runCore } from '../lib/engine2/sequence';
import { GOLDEN_DEALS as DEALS } from './fixtures/engine2-golden-deals';

const ROOT = join(__dirname, '..');
const load = (n: string) => JSON.parse(readFileSync(join(ROOT, 'tests/goldens', n, 'expected.json'), 'utf8'));
const TOL = 0.0075;

function assertBlockMatches(actual: Record<string, unknown>[], fixture: Record<string, unknown>[], label: string, tol = TOL) {
  expect(actual.length, `${label} length`).toBe(fixture.length);
  for (let i = 0; i < fixture.length; i++) {
    for (const key of Object.keys(fixture[i])) {
      const f = fixture[i][key];
      const a = (actual[i] as Record<string, unknown>)[key];
      if (typeof f === 'number') {
        expect(typeof a, `${label}[${i}].${key} present`).toBe('number');
        expect(Math.abs((a as number) - f), `${label}[${i}].${key}`).toBeLessThan(tol);
      } else if (typeof f === 'boolean') {
        expect(a, `${label}[${i}].${key}`).toBe(f);
      }
    }
  }
}

describe('§7 early retirement — the deferred tax deduction lands in t+1 (accuracy-audit gate hole, 2026-07-24)', () => {
  // Golden-uncovered BY DESIGN (spec_calc.py raises on early retirement), so this is the
  // ONE committed end-to-end pin: a small priority-1 tranche with OID under a 100% sweep
  // retires early; the unamortized OID+fee remainder must hit the UNCAPPED pool exactly
  // one year later (book write-off in year t, deduction in t+1 — SPEC v1.0.3 §7).
  it('retirement year carries only scheduled amortization; t+1 jumps by exactly the remainder', () => {
    const facts = DEALS.G2.facts;
    const base = DEALS.G2.assumptions;
    const a = {
      ...base,
      structure: {
        ...base.structure,
        sweep: { base_pct: 1, grid: null },
        tranches: [
          { name: 'Stub TL', type: 'senior' as const, size: { amount: 6 }, pricing: { kind: 'floating' as const, base_rate: 0.036, spread: 0.05, floor: 0 }, amort_pct_of_face: 0, maturity_years: 6, oid_pct: 0.05, sweep: { participates: true, priority: 0 } },
          ...base.structure.tranches,
        ],
      },
    };
    const core = runCore(facts, a);
    const stub = core.tranches[0];
    expect(stub[0].name).toBe('Stub TL');
    // find the retirement year t: ending balance hits 0 with a positive beginning balance
    const t = stub.findIndex((r) => r.beginning_balance > 1e-9 && r.ending_balance <= 1e-9);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(4); // engineered to retire well before exit (year-N merges instead)
    // remainder = unamortized OID+fee at the END of year t under straight-line-to-maturity
    const fee = a.fees.financing_pct_of_commitments * 6;
    const oid = 0.05 * 6;
    const perYear = (fee + oid) / 6;
    const remainder = fee + oid - perYear * (t + 1);
    expect(remainder).toBeGreaterThan(0.01); // the test is vacuous if nothing remains
    // t+1's uncapped pool = that year's own scheduled amortization + commitment fees + the remainder
    const scheduledPlusFees = (y: number) => core.operating[y].financing_fee_amortization
      + (core.revolver ? core.revolver[y].commitment_fee : 0);
    expect(core.tax[t].uncapped_deductions).toBeCloseTo(scheduledPlusFees(t), 9);
    expect(core.tax[t + 1].uncapped_deductions - scheduledPlusFees(t + 1)).toBeCloseTo(remainder, 9);
    // and the balance sheet closes at full precision through the retirement
    for (const bs of core.balance_sheet) expect(Math.abs(bs.check)).toBeLessThan(1e-9);
  });
});

describe('runCore — first end-to-end: every golden block at full precision, zero injection (C5 gate)', () => {

  for (const golden of ['G1', 'G2', 'G3', 'G4', 'G5', 'G2DIST', 'G3DIST', 'G2DISTD']) {
    it(`${golden}: operating, tax, tranches, revolver, waterfall, balance sheet`, () => {
      const g = load(golden);
      const core = runCore(DEALS[golden].facts, DEALS[golden].assumptions);

      // derived + S&U
      expect(Math.abs(core.derived.enterprise_value - g.derived.enterprise_value)).toBeLessThan(TOL);
      expect(Math.abs(core.derived.sponsor_equity - g.derived.sponsor_equity)).toBeLessThan(TOL);
      expect(Math.abs(core.derived.total_debt_at_par - g.derived.total_debt_at_par)).toBeLessThan(TOL);
      expect(Math.abs(core.sources_uses.total_uses - g.sources_uses.total_uses)).toBeLessThan(TOL);
      // §11 [v1.1.2]: this is a HEADLINE displayed number (Summary tile, Excel Summary
      // sheet, downloaded IC memo) and it had NO engine-side coverage — every reference was
      // to the FIXTURE. Proved by mutation: swapping sequence.ts to the net definition, and
      // hard-coding the §11-banned sentinel 99.0, BOTH passed 373/373.
      expect(Math.abs(core.derived.entry_gross_leverage_fy - g.derived.entry_gross_leverage_fy), `${golden} entry_gross_leverage_fy`).toBeLessThan(5e-5);

      // per-year blocks — every numeric column in the fixture
      assertBlockMatches(core.operating as unknown as Record<string, unknown>[], g.operating, `${golden} operating`);
      // fixture tax rows carry s163j_carryforward_open (not in TaxYear) — compare shared keys
      const taxFixture = g.tax.map((r: Record<string, unknown>) => {
        const { s163j_carryforward_open: _open, ...rest } = r;
        return rest;
      });
      assertBlockMatches(core.tax as unknown as Record<string, unknown>[], taxFixture, `${golden} tax`);
      const trancheNames = Object.keys(g.tranches);
      expect(core.tranches).toHaveLength(trancheNames.length);
      for (let k = 0; k < trancheNames.length; k++) {
        assertBlockMatches(
          core.tranches[k] as unknown as Record<string, unknown>[],
          g.tranches[core.tranches[k][0]?.name ?? trancheNames[k]],
          `${golden} tranche ${trancheNames[k]}`,
        );
      }
      if (g.revolver) {
        expect(core.revolver).not.toBeNull();
        assertBlockMatches(core.revolver! as unknown as Record<string, unknown>[], g.revolver, `${golden} revolver`);
      } else {
        expect(core.revolver).toBeNull();
      }
      assertBlockMatches(core.waterfall as unknown as Record<string, unknown>[], g.waterfall, `${golden} waterfall`);
      assertBlockMatches(core.balance_sheet as unknown as Record<string, unknown>[], g.balance_sheet, `${golden} balance sheet`);

      // §14.2 at full precision: BS closes to machine epsilon, not just fixture tolerance
      for (const row of core.balance_sheet) expect(Math.abs(row.check)).toBeLessThan(1e-9);
      // exit write-off matches the golden ExitBlock line
      expect(Math.abs(core.exit_writeoff - g.exit.unamortized_fees_written_off)).toBeLessThan(TOL);
      // §9 payoff carried for C6: par + accrued PIK + drawn revolver
      const payoff = core.final_debt_state.term_balances.reduce((a, b) => a + b, 0) + core.final_debt_state.revolver_drawn;
      expect(Math.abs(payoff - g.exit.debt_payoff_at_par_plus_pik)).toBeLessThan(TOL);
      // unlevered interim flows match the committed stream (§9 fee-membership table)
      const cfs: number[] = g.returns.unlevered.cashflows;
      for (let t = 0; t < core.unlevered_fcf.length - 1; t++) {
        expect(Math.abs(core.unlevered_fcf[t] - cfs[t + 1]), `${golden} UFCF Y${t + 1}`).toBeLessThan(TOL);
      }
      const exitUfcf = cfs[cfs.length - 1] - (g.exit.exit_ev - g.exit.exit_fees);
      expect(Math.abs(core.unlevered_fcf[core.unlevered_fcf.length - 1] - exitUfcf), `${golden} UFCF exit year`).toBeLessThan(0.015);
    });
  }
});
