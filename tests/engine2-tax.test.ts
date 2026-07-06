/**
 * engine2/tax.ts vs SPEC §6 and the golden tax blocks (Phase C3 gate,
 * rebuild/PHASE_C_ENGINE.md build order #3).
 *
 * Beyond the B2 kernel fixtures (which injected the POOLS), this gate tests the module's
 * own responsibilities: ATI basis resolution, capped/uncapped pool ASSEMBLY from the raw
 * finance lines (interest / PIK / OID / fee amortization / commitment fees / exit
 * write-off), policy mapping, and the §9 UNLEVERED variant — the latter pinned against
 * the goldens by backing the unlevered tax out of the committed unlevered cashflows.
 *
 * Tolerances as in the kernel fixture suite: fixture lines are 2dp display values.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import fc from 'fast-check';
import {
  openingTaxState,
  runTaxYear,
  runUnleveredTaxYear,
  toKernelPolicy,
  type KernelTaxState,
  type TaxYearInputs,
} from '../lib/engine2/tax';
import type { TaxAssumption } from '../lib/engine2/types';

const ROOT = join(__dirname, '..');
const load = (n: string) => JSON.parse(readFileSync(join(ROOT, 'tests/goldens', n, 'expected.json'), 'utf8'));

const TOL_CHAIN = 0.03; // one tax year assembled from ~7 injected 2dp fixture lines
const TOL_UNLEV = 0.05; // unlevered back-out: ~5 injected lines + chained NOL state

const BASE_TAX: TaxAssumption = {
  // SPEC §17 golden defaults
  rate: 0.25,
  interest_deductible: true,
  s163j: { applies: true, ati_basis: 'ebitda', ati_pct: 0.3 },
  nol: { acquired_opening: 0, acquired_usable: false, arose_pre_2018: false, s382_annual_limit: null },
  minimum_rate: 0,
};

const G4_TAX: TaxAssumption = {
  rate: 0.25,
  interest_deductible: true,
  s163j: { applies: true, ati_basis: 'ebitda', ati_pct: 0.3 },
  nol: { acquired_opening: 40, acquired_usable: true, arose_pre_2018: false, s382_annual_limit: 3 },
  minimum_rate: 0.15,
};

const TAXES: Record<string, TaxAssumption> = { G1: BASE_TAX, G2: BASE_TAX, G2D: BASE_TAX, G3: BASE_TAX, G4: G4_TAX, G5: BASE_TAX };

/** Assemble the §6 inputs for year y ENTIRELY from fixture columns (per-year injection). */
function inputsFromFixture(g: any, y: number): TaxYearInputs {
  const N = g.tax.length;
  const pik = Object.values(g.tranches as Record<string, any[]>).reduce(
    (s, sched) => s + (sched[y]?.pik_accrual ?? 0),
    0,
  );
  return {
    ebitda_adj: g.operating[y].ebitda_adj,
    da: g.operating[y].da,
    cash_interest_total: g.waterfall[y].cash_interest_total,
    pik_accrual_total: pik,
    oid_amortization: g.operating[y].oid_amortization,
    financing_fee_amortization: g.operating[y].financing_fee_amortization,
    commitment_fees: g.waterfall[y].commitment_fees,
    retirement_writeoff: y === N - 1 ? g.exit.unamortized_fees_written_off : 0,
  };
}

function stateFromFixture(g: any, y: number, tax: TaxAssumption): KernelTaxState {
  if (y === 0) return openingTaxState(tax);
  const prev = g.tax[y - 1];
  return {
    acquired_nol: prev.acquired_nol_end,
    postclose_nol: prev.postclose_nol_end,
    s163j_carryforward: prev.s163j_carryforward_end,
  };
}

describe('tax.ts reproduces the golden tax blocks — pools assembled from raw lines (C3 gate)', () => {
  for (const golden of ['G1', 'G2', 'G2D', 'G3', 'G4', 'G5']) {
    it(`${golden}: ATI, pool assembly, deduction, NOL usage, floor, cash tax — every year`, () => {
      const g = load(golden);
      const tax = TAXES[golden];
      for (let y = 0; y < g.tax.length; y++) {
        const row = g.tax[y];
        const { row: out } = runTaxYear(tax, stateFromFixture(g, y, tax), inputsFromFixture(g, y));
        const ctx = `${golden} Y${y + 1}`;
        expect(Math.abs(out.ati - row.ati), `${ctx} ati`).toBeLessThan(TOL_CHAIN);
        expect(Math.abs(out.capped_interest_pool - row.capped_interest_pool), `${ctx} capped pool`).toBeLessThan(TOL_CHAIN);
        expect(Math.abs(out.uncapped_deductions - row.uncapped_deductions), `${ctx} uncapped`).toBeLessThan(TOL_CHAIN);
        expect(Math.abs(out.deductible_capped_interest - row.deductible_capped_interest), `${ctx} deductible`).toBeLessThan(TOL_CHAIN);
        expect(Math.abs(out.s163j_carryforward_end - row.s163j_carryforward_end), `${ctx} cf end`).toBeLessThan(TOL_CHAIN);
        expect(Math.abs(out.taxable_before_nol - row.taxable_before_nol), `${ctx} taxable`).toBeLessThan(TOL_CHAIN);
        expect(Math.abs(out.acquired_nol_used - row.acquired_nol_used), `${ctx} acquired used`).toBeLessThan(TOL_CHAIN);
        expect(Math.abs(out.postclose_nol_used - row.postclose_nol_used), `${ctx} postclose used`).toBeLessThan(TOL_CHAIN);
        expect(Math.abs(out.nol_banked - row.nol_banked), `${ctx} banked`).toBeLessThan(TOL_CHAIN);
        expect(Math.abs(out.acquired_nol_end - row.acquired_nol_end), `${ctx} acquired end`).toBeLessThan(TOL_CHAIN);
        expect(Math.abs(out.postclose_nol_end - row.postclose_nol_end), `${ctx} postclose end`).toBeLessThan(TOL_CHAIN);
        expect(Math.abs(out.cash_tax - row.cash_tax), `${ctx} cash tax`).toBeLessThan(TOL_CHAIN);
      }
    });
  }

  it('G4: minimum_tax = 15% × pre-NOL taxable and equals cash_tax in the floor-binding years (§6.4)', () => {
    const g = load('G4');
    for (let y = 0; y < g.tax.length; y++) {
      const row = g.tax[y];
      const { row: out } = runTaxYear(G4_TAX, stateFromFixture(g, y, G4_TAX), inputsFromFixture(g, y));
      if (out.taxable_before_nol > 0) {
        expect(out.minimum_tax).toBeCloseTo(0.15 * out.taxable_before_nol, 9);
        if (Math.abs(row.cash_tax - 0.15 * row.taxable_before_nol) < 0.005 && row.cash_tax > 0) {
          expect(out.cash_tax).toBeCloseTo(out.minimum_tax, 9); // the floor binds
          expect(out.minimum_tax).toBeGreaterThan(out.regular_tax - 1e-9);
        }
      }
    }
  });
});

describe('tax.ts §9 unlevered variant vs the golden unlevered cashflows (C3 gate)', () => {
  // u_tax backed out of the committed stream: UFCF = EBITDA − u_tax − capex − ΔNWC (§7/§9),
  // exit-year flow carries + exit EV − exit fees (fee-membership table §9).
  for (const golden of ['G1', 'G2', 'G2D', 'G3', 'G4', 'G5']) {
    it(`${golden}: chained unlevered tax matches the reference stream year by year`, () => {
      const g = load(golden);
      const tax = TAXES[golden];
      const cfs: number[] = g.returns.unlevered.cashflows;
      const N = g.operating.length;
      let state = openingTaxState(tax);
      for (let y = 0; y < N; y++) {
        const op = g.operating[y];
        const flow = y < N - 1 ? cfs[y + 1] : cfs[N] - (g.exit.exit_ev - g.exit.exit_fees);
        const backedOutTax = op.ebitda - (op.maint_capex + op.growth_capex) - op.delta_nwc - flow;
        const out = runUnleveredTaxYear(tax, state, { ebitda: op.ebitda, da: op.da });
        expect(Math.abs(out.cash_tax - backedOutTax), `${golden} Y${y + 1} unlevered tax`).toBeLessThan(TOL_UNLEV);
        state = out.state_end;
      }
    });
  }
});

describe('tax.ts §6 properties', () => {
  const money = (min: number, max: number) => fc.double({ min, max, noNaN: true });

  const inputsArb: fc.Arbitrary<TaxYearInputs> = fc.record({
    ebitda_adj: fc.double({ min: -100, max: 500, noNaN: true }),
    da: money(0, 100),
    cash_interest_total: money(0, 80),
    pik_accrual_total: money(0, 40),
    oid_amortization: money(0, 5),
    financing_fee_amortization: money(0, 5),
    commitment_fees: money(0, 2),
    retirement_writeoff: money(0, 10),
  });

  const taxArb: fc.Arbitrary<TaxAssumption> = fc.record({
    rate: money(0, 0.4),
    interest_deductible: fc.boolean(),
    s163j: fc.record({
      applies: fc.boolean(),
      ati_basis: fc.constantFrom('ebitda' as const, 'ebit' as const),
      ati_pct: money(0.1, 0.5),
    }),
    nol: fc.record({
      acquired_opening: money(0, 200),
      acquired_usable: fc.boolean(),
      arose_pre_2018: fc.boolean(),
      s382_annual_limit: fc.option(money(0, 50), { nil: null }),
    }),
    minimum_rate: money(0, 0.2),
  });

  it('§6.1 ATI basis: ebitda ⇒ ATI = EBITDA_adj; ebit ⇒ ATI = EBITDA_adj − D&A; pools assemble per the §6.1 split', () => {
    fc.assert(
      fc.property(taxArb, inputsArb, (tax, y) => {
        const { row } = runTaxYear(tax, openingTaxState(tax), y);
        expect(row.ati).toBe(tax.s163j.ati_basis === 'ebitda' ? y.ebitda_adj : y.ebitda_adj - y.da);
        expect(row.capped_interest_pool).toBe(y.cash_interest_total + y.pik_accrual_total + y.oid_amortization);
        expect(row.uncapped_deductions).toBe(y.financing_fee_amortization + y.commitment_fees + y.retirement_writeoff);
        expect(row.s163j_disallowed_added).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('§9 unlevered independence: the unlevered run never sees interest, §163(j) or the monitoring fee — identical for any finance inputs', () => {
    fc.assert(
      fc.property(taxArb, money(0, 300), money(0, 100), (tax, ebitda, da) => {
        const a = runUnleveredTaxYear(tax, openingTaxState(tax), { ebitda, da });
        const flipped: TaxAssumption = {
          ...tax,
          interest_deductible: !tax.interest_deductible,
          s163j: { ...tax.s163j, applies: !tax.s163j.applies, ati_pct: 0.99 },
        };
        const b = runUnleveredTaxYear(flipped, openingTaxState(flipped), { ebitda, da });
        expect(b.cash_tax).toBe(a.cash_tax);
        expect(b.taxable_before_nol).toBe(a.taxable_before_nol);
        // and the base is EBITDA − D&A, with NOL/§382 still live
        expect(a.taxable_before_nol).toBe(ebitda - da);
      }),
    );
  });

  it('policy/state mapping is total and literal (§16 → kernel)', () => {
    fc.assert(
      fc.property(taxArb, (tax) => {
        const p = toKernelPolicy(tax);
        expect(p.rate).toBe(tax.rate);
        expect(p.interest_deductible).toBe(tax.interest_deductible);
        expect(p.s163j_applies).toBe(tax.s163j.applies);
        expect(p.ati_pct).toBe(tax.s163j.ati_pct);
        expect(p.acquired_usable).toBe(tax.nol.acquired_usable);
        expect(p.arose_pre_2018).toBe(tax.nol.arose_pre_2018);
        expect(p.s382_annual_limit).toBe(tax.nol.s382_annual_limit);
        expect(p.minimum_rate).toBe(tax.minimum_rate);
        const s = openingTaxState(tax);
        expect(s).toEqual({ acquired_nol: tax.nol.acquired_opening, postclose_nol: 0, s163j_carryforward: 0 });
      }),
    );
  });
});
