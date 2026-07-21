/**
 * engine2/debt.ts vs SPEC §3–§5 and the golden debt blocks (Phase C4 gate,
 * rebuild/PHASE_C_ENGINE.md build order #4).
 *
 * Unlike the B2 kernel fixtures (per-year injection), this gate runs the module's own
 * CHAINED year loop — balances, PIK compounding and revolver state thread through
 * `state_end` at full precision; only FCF_pre_debt (and opening cash Y1) is injected from
 * the goldens, exactly as PHASE_C specifies. Chained tolerance stays at ±$0.03m: the only
 * injected error source is FCF (±0.005/yr) and the sweep absorbs most of it into balances.
 *
 * The §3.5 step-down grid is golden-uncovered by design (SPEC §17 G2 note) — it is gated
 * here by hand fixtures on the DR-4 lender-friendly grid.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import fc from 'fast-check';
import {
  financeLines,
  openingDebtState,
  resolveSweepPct,
  runDebtYear,
  validateStructureForHold,
} from '../lib/engine2/debt';
import { sizeStructure } from '../lib/engine2/sourcesUses';
import type { DealAssumptions, TrancheAssumption } from '../lib/engine2/types';

const ROOT = join(__dirname, '..');
const load = (n: string) => JSON.parse(readFileSync(join(ROOT, 'tests/goldens', n, 'expected.json'), 'utf8'));
const TOL = 0.03;

const floating = (spread: number, floor = 0) =>
  ({ kind: 'floating', base_rate: 0.036, spread, floor }) as const;

/** SPEC §17 structures (fy_ebitda for sizing; min_cash; flat sweep pct). */
const SPECS: Record<string, { fy_ebitda: number; min_cash: number; sweep_pct: number; tranches: TrancheAssumption[] }> = {
  G2: {
    fy_ebitda: 110, min_cash: 10, sweep_pct: 0.75,
    tranches: [
      { name: 'TLB', type: 'senior', size: { x_ebitda: 4 }, pricing: floating(0.0375), amort_pct_of_face: 0.01, maturity_years: 7, oid_pct: 0, sweep: { participates: true, priority: 1 } },
      { name: 'Revolver', type: 'revolver', commitment: { x_ebitda: 0.5 }, pricing: floating(0.035), commitment_fee: 0.005, maturity_years: 5, drawn_at_close: 0 },
    ],
  },
  G3: {
    fy_ebitda: 90, min_cash: 8, sweep_pct: 0.5,
    tranches: [
      { name: 'Senior', type: 'senior', size: { x_ebitda: 3 }, pricing: floating(0.045, 0.0075), amort_pct_of_face: 0.05, maturity_years: 7, oid_pct: 0, sweep: { participates: true, priority: 1 } },
      { name: 'PIK Note', type: 'pik_note', size: { x_ebitda: 1.5 }, cash_coupon: 0, pik_coupon: 0.12, amort_pct_of_face: 0, maturity_years: 8, oid_pct: 0.02, sweep: { participates: false, priority: 2 } },
    ],
  },
  G4: {
    fy_ebitda: 12, min_cash: 3, sweep_pct: 0.5,
    tranches: [
      { name: 'Unitranche', type: 'unitranche', size: { x_ebitda: 3.5 }, pricing: floating(0.05, 0.0075), amort_pct_of_face: 0.01, maturity_years: 7, oid_pct: 0.025, sweep: { participates: true, priority: 1 } },
    ],
  },
  G5: {
    fy_ebitda: 16, min_cash: 4, sweep_pct: 0.5,
    tranches: [
      { name: 'Senior', type: 'senior', size: { x_ebitda: 3 }, pricing: floating(0.0425), amort_pct_of_face: 0.1, maturity_years: 6, oid_pct: 0, sweep: { participates: true, priority: 1 } },
      { name: 'Revolver', type: 'revolver', commitment: { amount: 20 }, pricing: floating(0.04), commitment_fee: 0.005, maturity_years: 5, drawn_at_close: 0 },
    ],
  },
};
SPECS.G2D = SPECS.G2;

function sized(golden: string) {
  const spec = SPECS[golden];
  const structure: DealAssumptions['structure'] = {
    tranches: spec.tranches,
    min_cash: spec.min_cash,
    sweep: { base_pct: spec.sweep_pct, grid: null },
  };
  return sizeStructure(structure, spec.fy_ebitda);
}

describe('debt.ts chained year loop reproduces the golden debt blocks — FCF injected (C4 gate)', () => {
  for (const golden of ['G2', 'G2D', 'G3', 'G4', 'G5']) {
    it(`${golden}: tranche schedule, revolver cycle, waterfall — balances chained at full precision`, () => {
      const g = load(golden);
      const spec = SPECS[golden];
      const s = sized(golden);
      let state = openingDebtState(s);
      let cash = g.waterfall[0].opening_cash; // = min_cash at close (§2)

      for (let y = 0; y < g.waterfall.length; y++) {
        const lines = financeLines(s, state);
        const pct = resolveSweepPct({ base_pct: spec.sweep_pct, grid: null }, 0, 0, 1);
        const out = runDebtYear(s, state, lines, {
          opening_cash: cash,
          fcf_pre_debt: g.waterfall[y].fcf_pre_debt, // INJECTED per PHASE_C
          min_cash: spec.min_cash,
          sweep_pct: pct,
        });
        const ctx = `${golden} Y${y + 1}`;

        for (let i = 0; i < out.tranche_rows.length; i++) {
          const row = out.tranche_rows[i];
          const fix = g.tranches[row.name][y];
          expect(Math.abs(row.beginning_balance - fix.beginning_balance), `${ctx} ${row.name} beginning`).toBeLessThan(TOL);
          expect(Math.abs(row.cash_interest - fix.cash_interest), `${ctx} ${row.name} interest`).toBeLessThan(TOL);
          expect(Math.abs(row.pik_accrual - fix.pik_accrual), `${ctx} ${row.name} pik`).toBeLessThan(TOL);
          expect(Math.abs(row.mandatory_amort - fix.mandatory_amort), `${ctx} ${row.name} mandatory`).toBeLessThan(TOL);
          expect(Math.abs(row.sweep_repayment - fix.sweep_repayment), `${ctx} ${row.name} sweep`).toBeLessThan(TOL);
          expect(Math.abs(row.ending_balance - fix.ending_balance), `${ctx} ${row.name} ending`).toBeLessThan(TOL);
          // row identity: ending = beginning + PIK − mandatory − sweep, exact
          expect(row.ending_balance).toBeCloseTo(
            row.beginning_balance + row.pik_accrual - row.mandatory_amort - row.sweep_repayment,
            9,
          );
        }
        if (out.revolver_row) {
          const fix = g.revolver[y];
          expect(Math.abs(out.revolver_row.beginning_drawn - fix.beginning_drawn), `${ctx} rcf beginning`).toBeLessThan(TOL);
          expect(Math.abs(out.revolver_row.cash_interest - fix.cash_interest), `${ctx} rcf interest`).toBeLessThan(TOL);
          expect(Math.abs(out.revolver_row.commitment_fee - fix.commitment_fee), `${ctx} rcf fee`).toBeLessThan(TOL);
          expect(Math.abs(out.revolver_row.repayment - fix.repayment), `${ctx} rcf repayment`).toBeLessThan(TOL);
          expect(Math.abs(out.revolver_row.draw - fix.draw), `${ctx} rcf draw`).toBeLessThan(TOL);
          expect(Math.abs(out.revolver_row.ending_drawn - fix.ending_drawn), `${ctx} rcf ending`).toBeLessThan(TOL);
          expect(Math.abs(out.revolver_row.undrawn_commitment - fix.undrawn_commitment), `${ctx} rcf undrawn`).toBeLessThan(TOL);
        }
        const wf = g.waterfall[y];
        expect(Math.abs(out.waterfall_row.cash_interest_total - wf.cash_interest_total), `${ctx} interest total`).toBeLessThan(TOL);
        expect(Math.abs(out.waterfall_row.mandatory_amort_total - wf.mandatory_amort_total), `${ctx} amort total`).toBeLessThan(TOL);
        expect(Math.abs(out.waterfall_row.sweep_pool - wf.sweep_pool), `${ctx} pool`).toBeLessThan(TOL);
        expect(Math.abs(out.waterfall_row.sweep_applied_total - wf.sweep_applied_total), `${ctx} swept`).toBeLessThan(TOL);
        expect(Math.abs(out.waterfall_row.closing_cash - wf.closing_cash), `${ctx} closing cash`).toBeLessThan(TOL);
        expect(out.waterfall_row.cash_floor_breach, `${ctx} breach`).toBe(wf.cash_floor_breach);
        expect(out.waterfall_row.sweep_pct_applied).toBe(wf.sweep_pct_applied);

        cash = out.waterfall_row.closing_cash;
        state = out.state_end;
      }

      // G3: full-precision PIK payoff after the chained loop = 135 × 1.12^5 (§4/§9 check value)
      if (golden === 'G3') {
        expect(state.term_balances[1]).toBeCloseTo(135 * Math.pow(1.12, 5), 9);
      }
      // G5: revolver fully repaid by end Y3 (§17 assert), never breaches
      if (golden === 'G5') {
        expect(state.revolver_drawn).toBe(0);
      }
    });
  }

  it('retirement detection: no golden retires a tranche PRE-exit (the reference raises on that path); G4 retires its Unitranche in the EXIT year, absorbed by the §9 write-off', () => {
    for (const golden of ['G2', 'G3', 'G4', 'G5']) {
      const g = load(golden);
      const spec = SPECS[golden];
      const s = sized(golden);
      const N = g.waterfall.length;
      let state = openingDebtState(s);
      let cash = g.waterfall[0].opening_cash;
      for (let y = 0; y < N; y++) {
        const lines = financeLines(s, state);
        const out = runDebtYear(s, state, lines, {
          opening_cash: cash,
          fcf_pre_debt: g.waterfall[y].fcf_pre_debt,
          min_cash: spec.min_cash,
          sweep_pct: spec.sweep_pct,
        });
        if (y < N - 1) {
          expect(out.fully_retired, `${golden} Y${y + 1}`).toEqual([]);
        } else {
          expect(out.fully_retired, `${golden} exit year`).toEqual(golden === 'G4' ? ['Unitranche'] : []);
        }
        cash = out.waterfall_row.closing_cash;
        state = out.state_end;
      }
    }
  });
});

describe('debt.ts §3.5 sweep grid (golden-uncovered by design — hand fixtures on the DR-4 grid)', () => {
  const grid = { tiers: [{ above_net_leverage: 4.5, pct: 0.75 }, { above_net_leverage: 3.5, pct: 0.5 }], else_pct: 0 };
  const sweep = { base_pct: 0.99, grid }; // base MUST be ignored when a grid is set

  it('75% above 4.5x, 50% in (3.5, 4.5], 0% at or below 3.5x — thresholds are strict "exceeds"', () => {
    // leverage = (gross − cash)/EBITDA
    expect(resolveSweepPct(sweep, 550, 50, 100)).toBe(0.75); // 5.0x
    expect(resolveSweepPct(sweep, 460, 10, 100)).toBe(0.5); // 4.5x — NOT > 4.5
    expect(resolveSweepPct(sweep, 410, 10, 100)).toBe(0.5); // 4.0x
    expect(resolveSweepPct(sweep, 360, 10, 100)).toBe(0); // 3.5x — NOT > 3.5
    expect(resolveSweepPct(sweep, 200, 50, 100)).toBe(0); // 1.5x
  });

  it('EBITDA ≤ 0 reads as infinite leverage → highest tier; no grid → base_pct; unsorted tiers are sorted internally', () => {
    expect(resolveSweepPct(sweep, 100, 0, 0)).toBe(0.75);
    expect(resolveSweepPct(sweep, 100, 0, -5)).toBe(0.75);
    expect(resolveSweepPct({ base_pct: 0.6, grid: null }, 550, 50, 100)).toBe(0.6);
    const shuffled = { base_pct: 0, grid: { tiers: [grid.tiers[1], grid.tiers[0]], else_pct: 0 } };
    expect(resolveSweepPct(shuffled, 550, 50, 100)).toBe(0.75);
  });
});

describe('debt.ts §3–§5 properties & guards', () => {
  it('financeLines: senior = balance × all-in, PIK note = balance × coupons, totals are the sums (§4). Domain: balances ∈ [0, 500]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 500, noNaN: true }),
        fc.double({ min: 0, max: 500, noNaN: true }),
        fc.double({ min: 0, max: 0.15, noNaN: true }),
        (seniorBal, pikBal, pikRate) => {
          const s = sizeStructure(
            {
              tranches: [
                { name: 'S', type: 'senior', size: { amount: seniorBal }, pricing: { kind: 'fixed', rate: 0.08 }, amort_pct_of_face: 0.01, maturity_years: 8, oid_pct: 0, sweep: { participates: true, priority: 1 } },
                { name: 'P', type: 'pik_note', size: { amount: pikBal }, cash_coupon: 0.02, pik_coupon: pikRate, amort_pct_of_face: 0, maturity_years: 9, oid_pct: 0, sweep: { participates: false, priority: 2 } },
              ],
              min_cash: 5,
              sweep: { base_pct: 0.5, grid: null },
            },
            100,
          );
          const lines = financeLines(s, openingDebtState(s));
          expect(lines.per_tranche[0].cash_interest).toBeCloseTo(seniorBal * 0.08, 9);
          expect(lines.per_tranche[0].pik_accrual).toBe(0);
          expect(lines.per_tranche[1].cash_interest).toBeCloseTo(pikBal * 0.02, 9);
          expect(lines.per_tranche[1].pik_accrual).toBeCloseTo(pikBal * pikRate, 9);
          expect(lines.cash_interest_total).toBeCloseTo(seniorBal * 0.08 + pikBal * 0.02, 9);
          expect(lines.pik_accrual_total).toBeCloseTo(pikBal * pikRate, 9);
        },
      ),
    );
  });

  it('a sweep that retires a tranche reports it in fully_retired exactly once', () => {
    const s = sizeStructure(
      {
        tranches: [
          { name: 'Stub', type: 'senior', size: { amount: 10 }, pricing: { kind: 'fixed', rate: 0.08 }, amort_pct_of_face: 0, maturity_years: 8, oid_pct: 0, sweep: { participates: true, priority: 1 } },
        ],
        min_cash: 0,
        sweep: { base_pct: 1, grid: null },
      },
      100,
    );
    let state = openingDebtState(s);
    const y1 = runDebtYear(s, state, financeLines(s, state), { opening_cash: 0, fcf_pre_debt: 100, min_cash: 0, sweep_pct: 1 });
    expect(y1.fully_retired).toEqual(['Stub']);
    expect(y1.state_end.term_balances[0]).toBe(0);
    const y2 = runDebtYear(s, y1.state_end, financeLines(s, y1.state_end), { opening_cash: y1.waterfall_row.closing_cash, fcf_pre_debt: 50, min_cash: 0, sweep_pct: 1 });
    expect(y2.fully_retired).toEqual([]); // already retired at open — not re-reported
  });

  it('§3.6 [v1.0.3] wrapper-level post-breach chaining (C4 review): breach year → negative opening runs → cure year repays and clears the flag', () => {
    // No golden breaches (all five have cash_floor_breach: false every year), so the
    // v1.0.3 continuation must be pinned at wrapper level too, not just in the kernel.
    const s = sizeStructure(
      {
        tranches: [
          { name: 'RCF', type: 'revolver', commitment: { amount: 5 }, pricing: { kind: 'fixed', rate: 0.07 }, commitment_fee: 0.005, maturity_years: 8, drawn_at_close: 0 },
        ],
        min_cash: 2,
        sweep: { base_pct: 0, grid: null },
      },
      100,
    );
    let state = openingDebtState(s);
    // Y1: deep hole — full draw to the commitment, closing far below the floor
    const y1 = runDebtYear(s, state, financeLines(s, state), { opening_cash: 2, fcf_pre_debt: -50, min_cash: 2, sweep_pct: 0 });
    expect(y1.revolver_row!.ending_drawn).toBe(5); // exact commitment (ulp contract)
    expect(y1.waterfall_row.cash_floor_breach).toBe(true);
    expect(y1.waterfall_row.closing_cash).toBeLessThan(0);
    // Y2: RUNS on the inherited negative opening cash (pre-v1.0.3 kernels threw here)
    const l2 = financeLines(s, y1.state_end);
    const y2 = runDebtYear(s, y1.state_end, l2, { opening_cash: y1.waterfall_row.closing_cash, fcf_pre_debt: 10, min_cash: 2, sweep_pct: 0 });
    expect(y2.waterfall_row.cash_floor_breach).toBe(true);
    // conservation, not clamping: closing = opening + FCF − interest (commitment fully drawn ⇒ no fee, no headroom to draw)
    expect(y2.waterfall_row.closing_cash).toBeCloseTo(y1.waterfall_row.closing_cash + 10 - l2.cash_interest_total - l2.commitment_fee, 9);
    // Y3: cure — repays the revolver in full, flag clears
    const l3 = financeLines(s, y2.state_end);
    const y3 = runDebtYear(s, y2.state_end, l3, { opening_cash: y2.waterfall_row.closing_cash, fcf_pre_debt: 60, min_cash: 2, sweep_pct: 0 });
    expect(y3.revolver_row!.repayment).toBeCloseTo(5, 9);
    expect(y3.state_end.revolver_drawn).toBe(0);
    expect(y3.waterfall_row.cash_floor_breach).toBe(false);
  });

  it('v1 scope guard: a term tranche maturing inside the hold throws; at hold+1 it passes; the revolver is exempt', () => {
    const term = (maturity: number): TrancheAssumption => ({
      name: 'T', type: 'senior', size: { amount: 100 }, pricing: { kind: 'fixed', rate: 0.08 },
      amort_pct_of_face: 0.01, maturity_years: maturity, oid_pct: 0, sweep: { participates: true, priority: 1 },
    });
    const rcf: TrancheAssumption = {
      name: 'RCF', type: 'revolver', commitment: { amount: 20 }, pricing: { kind: 'fixed', rate: 0.07 },
      commitment_fee: 0.005, maturity_years: 5, drawn_at_close: 0,
    };
    const structureWith = (t: TrancheAssumption) =>
      sizeStructure({ tranches: [t, rcf], min_cash: 0, sweep: { base_pct: 0, grid: null } }, 100);
    expect(() => validateStructureForHold(structureWith(term(5)), 5)).toThrow(RangeError);
    expect(() => validateStructureForHold(structureWith(term(4)), 5)).toThrow(RangeError);
    expect(() => validateStructureForHold(structureWith(term(6)), 5)).not.toThrow();
  });
});
