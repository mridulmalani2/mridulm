/**
 * engine2/operating.ts vs SPEC §7 and the golden operating columns (Phase C1 gate,
 * rebuild/PHASE_C_ENGINE.md build order #1).
 *
 * Fixture pattern per PHASE_C: the module is fed EXACT SPEC §17 inputs; the one upstream
 * value it cannot know (cash tax, §6) is INJECTED from the goldens to verify the §7 FCF
 * identity. Tolerances: module output is FULL precision; fixtures store 2dp display values
 * → ±0.0075 per directly-compared line, ±0.02 where an injected 2dp input compounds.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import fc from 'fast-check';
import {
  buildAmortizingCostSchedules,
  buildOperating,
  buildRevenue,
  fcfPreDebt,
  marginPath,
  nwcBalance,
  type AmortizingCostInput,
} from '../lib/engine2/operating';
import type { OperationsAssumption } from '../lib/engine2/types';

const ROOT = join(__dirname, '..');
const load = (n: string) => JSON.parse(readFileSync(join(ROOT, 'tests/goldens', n, 'expected.json'), 'utf8'));

const TOL = 0.0075; // full-precision module line vs one 2dp fixture line
const TOL_INJ = 0.02; // line combining an injected 2dp fixture input (cash tax)

/** SPEC §17 inputs per golden — facts, operations, and the fee-amortization structure. */
interface GoldenSpec {
  fy_revenue: number;
  fy_ebitda_margin: number;
  growth: number[];
  target_margin: number;
  da_pct: number;
  maint_capex_pct: number;
  growth_capex: number[];
  nwc: OperationsAssumption['nwc'];
  cost_inputs: AmortizingCostInput[];
}

const SPECS: Record<string, GoldenSpec> = {
  G1: {
    fy_revenue: 100, fy_ebitda_margin: 0.25, growth: [0, 0, 0, 0, 0], target_margin: 0.25,
    da_pct: 0.03, maint_capex_pct: 0.03, growth_capex: [0, 0, 0, 0, 0],
    nwc: { method: 'pct', pct_revenue: 0.1 }, cost_inputs: [],
  },
  G2: {
    fy_revenue: 500, fy_ebitda_margin: 0.22, growth: [0.06, 0.05, 0.04, 0.04, 0.03], target_margin: 0.22,
    da_pct: 0.035, maint_capex_pct: 0.03, growth_capex: [0, 0, 0, 0, 0],
    nwc: { method: 'pct', pct_revenue: 0.08 },
    cost_inputs: [
      { name: 'TLB', commitment: 440, maturity_years: 7, oid_amount: 0 },
      { name: 'Revolver', commitment: 55, maturity_years: 5, oid_amount: 0 },
    ],
  },
  G2D: {
    fy_revenue: 500, fy_ebitda_margin: 0.22, growth: [0.04, 0.03, 0.02, 0.02, 0.01], target_margin: 0.22,
    da_pct: 0.035, maint_capex_pct: 0.03, growth_capex: [0, 0, 0, 0, 0],
    nwc: { method: 'pct', pct_revenue: 0.08 },
    cost_inputs: [
      { name: 'TLB', commitment: 440, maturity_years: 7, oid_amount: 0 },
      { name: 'Revolver', commitment: 55, maturity_years: 5, oid_amount: 0 },
    ],
  },
  G3: {
    fy_revenue: 300, fy_ebitda_margin: 0.3, growth: [0.05, 0.04, 0.04, 0.03, 0.03], target_margin: 0.3,
    da_pct: 0.04, maint_capex_pct: 0.035, growth_capex: [0, 0, 0, 0, 0],
    nwc: { method: 'days', dso: 45, dio: 30, dpo: 40 },
    cost_inputs: [
      { name: 'Senior', commitment: 270, maturity_years: 7, oid_amount: 0 },
      { name: 'PIK Note', commitment: 135, maturity_years: 8, oid_amount: 135 * 0.02 },
    ],
  },
  G4: {
    fy_revenue: 200, fy_ebitda_margin: 0.06, growth: [0.02, 0.03, 0.04, 0.05, 0.05], target_margin: 0.16,
    da_pct: 0.07, maint_capex_pct: 0.04, growth_capex: [0, 0, 0, 0, 0],
    nwc: { method: 'pct', pct_revenue: 0.09 },
    cost_inputs: [{ name: 'Unitranche', commitment: 42, maturity_years: 7, oid_amount: 42 * 0.025 }],
  },
  G5: {
    fy_revenue: 80, fy_ebitda_margin: 0.2, growth: [0.1, 0.08, 0.06, 0.05, 0.04], target_margin: 0.2,
    da_pct: 0.04, maint_capex_pct: 0.035, growth_capex: [6, 0, 0, 0, 0],
    nwc: { method: 'pct', pct_revenue: 0.12 },
    cost_inputs: [
      { name: 'Senior', commitment: 48, maturity_years: 6, oid_amount: 0 },
      { name: 'Revolver', commitment: 20, maturity_years: 5, oid_amount: 0 },
    ],
  },
};

function build(spec: GoldenSpec) {
  return buildOperating(
    { fy_revenue: spec.fy_revenue, fy_ebitda_margin: spec.fy_ebitda_margin },
    {
      entry: { driver: 'multiple', entry_multiple: null, enterprise_value: null, basis: 'fy', hold_years: 5 },
      operations: {
        growth: spec.growth,
        target_margin: spec.target_margin,
        margin_path: 'linear',
        da_pct_revenue: spec.da_pct,
        maint_capex_pct_revenue: spec.maint_capex_pct,
        growth_capex: spec.growth_capex,
        nwc: spec.nwc,
      },
      fees: { transaction_pct_of_ev: 0.02, financing_pct_of_commitments: 0.015, monitoring: null },
    },
    spec.cost_inputs,
  );
}

describe('operating.ts reproduces the golden operating columns (C1 gate)', () => {
  for (const golden of ['G1', 'G2', 'G2D', 'G3', 'G4', 'G5']) {
    it(`${golden}: revenue, margin path, EBITDA/adj, D&A, EBIT, capex, NWC, OID & fee amortization — every year`, () => {
      const g = load(golden);
      const out = build(SPECS[golden]);
      expect(out.years).toHaveLength(g.operating.length);
      for (let i = 0; i < g.operating.length; i++) {
        const row = g.operating[i];
        const y = out.years[i];
        const ctx = `${golden} Y${i + 1}`;
        expect(Math.abs(y.revenue - row.revenue), `${ctx} revenue`).toBeLessThan(TOL);
        expect(Math.abs(y.margin - row.margin), `${ctx} margin`).toBeLessThan(5e-5); // fixture 4dp
        expect(Math.abs(y.ebitda - row.ebitda), `${ctx} ebitda`).toBeLessThan(TOL);
        expect(Math.abs(y.ebitda_adj - row.ebitda_adj), `${ctx} ebitda_adj`).toBeLessThan(TOL);
        expect(Math.abs(y.da - row.da), `${ctx} da`).toBeLessThan(TOL);
        expect(Math.abs(y.ebit - row.ebit), `${ctx} ebit`).toBeLessThan(TOL);
        expect(Math.abs(y.maint_capex - row.maint_capex), `${ctx} maint_capex`).toBeLessThan(TOL);
        expect(Math.abs(y.growth_capex - row.growth_capex), `${ctx} growth_capex`).toBeLessThan(TOL);
        expect(Math.abs(y.nwc_balance - row.nwc_balance), `${ctx} nwc_balance`).toBeLessThan(TOL);
        expect(Math.abs(y.delta_nwc - row.delta_nwc), `${ctx} delta_nwc`).toBeLessThan(TOL);
        expect(Math.abs(y.oid_amortization - row.oid_amortization), `${ctx} oid_amortization`).toBeLessThan(TOL);
        expect(Math.abs(y.financing_fee_amortization - row.financing_fee_amortization), `${ctx} fee_amortization`).toBeLessThan(TOL);
        // §7 FCF identity with the §6 cash tax INJECTED from the golden (§14.16 single source)
        expect(Math.abs(fcfPreDebt(y, g.tax[i].cash_tax) - row.fcf_pre_debt), `${ctx} fcf_pre_debt`).toBeLessThan(TOL_INJ);
      }
    });
  }

  it('G4 margin trajectory is the §7 linear path: 8/10/12/14/16% (SPEC §17)', () => {
    const margins = marginPath(0.06, 0.16, 'linear', 5);
    expect(margins.map((m) => Math.round(m * 1000) / 1000)).toEqual([0.08, 0.1, 0.12, 0.14, 0.16]);
  });

  it('G3 NWC days method: nwc0 uses the §7 formulas on facts revenue/margin (adjudicated v1.0.2)', () => {
    const nwc0 = nwcBalance({ method: 'days', dso: 45, dio: 30, dpo: 40 }, 300, 0.3);
    const cogs = 300 * 0.7;
    expect(nwc0).toBeCloseTo((45 / 365) * 300 + (30 / 365) * cogs - (40 / 365) * cogs, 9);
    const g = load('G3');
    // nwc0 is not a fixture column, but ΔNWC Y1 pins it: nwc[1] − Δnwc[1] = nwc0
    expect(Math.abs(g.operating[0].nwc_balance - g.operating[0].delta_nwc - nwc0)).toBeLessThan(0.015);
  });

  it('monitoring fee (golden-uncovered, SPEC §7/§9): reduces EBITDA_adj in years 1..N−1, dropped in the exit year, EBIT stays consistent', () => {
    const spec = SPECS.G1;
    const withFee = buildOperating(
      { fy_revenue: spec.fy_revenue, fy_ebitda_margin: spec.fy_ebitda_margin },
      {
        entry: { driver: 'multiple', entry_multiple: null, enterprise_value: null, basis: 'fy', hold_years: 5 },
        operations: {
          growth: spec.growth, target_margin: spec.target_margin, margin_path: 'linear',
          da_pct_revenue: spec.da_pct, maint_capex_pct_revenue: spec.maint_capex_pct,
          growth_capex: spec.growth_capex, nwc: spec.nwc,
        },
        fees: {
          transaction_pct_of_ev: 0.02, financing_pct_of_commitments: 0.015,
          monitoring: { annual: 2, termination_years: 3, discount_rate: 0.1 },
        },
      },
      [],
    );
    for (let i = 0; i < 5; i++) {
      const y = withFee.years[i];
      const isExit = i === 4;
      expect(y.monitoring_fee).toBe(isExit ? 0 : 2);
      expect(y.ebitda_adj).toBeCloseTo(y.ebitda - (isExit ? 0 : 2), 12);
      expect(y.ebit).toBeCloseTo(y.ebitda_adj - y.da, 12);
    }
  });
});

describe('operating.ts §7 properties', () => {
  const pctArb = fc.double({ min: 0.01, max: 0.6, noNaN: true });

  it('margin path: hits the target EXACTLY in year N; monotone toward the target; front ≥ linear ≥ back when improving. Domain: base, target ∈ [1%, 60%], N ∈ [1, 12]', () => {
    fc.assert(
      fc.property(pctArb, pctArb, fc.integer({ min: 1, max: 12 }), (base, target, n) => {
        for (const path of ['linear', 'front_loaded', 'back_loaded'] as const) {
          const m = marginPath(base, target, path, n);
          expect(m).toHaveLength(n);
          expect(m[n - 1]).toBeCloseTo(target, 12);
          for (let i = 1; i < n; i++) {
            if (target >= base) expect(m[i]).toBeGreaterThanOrEqual(m[i - 1] - 1e-12);
            else expect(m[i]).toBeLessThanOrEqual(m[i - 1] + 1e-12);
          }
        }
        if (target > base) {
          const [front, linear, back] = (['front_loaded', 'linear', 'back_loaded'] as const).map(
            (p) => marginPath(base, target, p, n),
          );
          for (let i = 0; i < n; i++) {
            expect(front[i]).toBeGreaterThanOrEqual(linear[i] - 1e-12);
            expect(linear[i]).toBeGreaterThanOrEqual(back[i] - 1e-12);
          }
        }
      }),
    );
  });

  it('revenue compounding: rev[t] = fy × Π(1+g); flat growth ⇒ flat revenue. Domain: g ∈ [−20%, +30%]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 1e4, noNaN: true }),
        fc.array(fc.double({ min: -0.2, max: 0.3, noNaN: true }), { minLength: 1, maxLength: 10 }),
        (fy, growth) => {
          const rev = buildRevenue(fy, growth);
          let acc = fy;
          for (let i = 0; i < growth.length; i++) {
            acc *= 1 + growth[i];
            expect(rev[i]).toBeCloseTo(acc, 9);
          }
        },
      ),
    );
  });

  it('fee amortization: allocation is pro-rata by commitment and sums to pct × total commitments; schedules never amortize past the balance (§7/§2). Domain: 1–4 tranches', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            commitment: fc.double({ min: 1, max: 500, noNaN: true }),
            maturity_years: fc.integer({ min: 1, max: 10 }),
            oid_frac: fc.double({ min: 0, max: 0.05, noNaN: true }),
          }),
          { minLength: 1, maxLength: 4 },
        ),
        fc.double({ min: 0, max: 0.03, noNaN: true }),
        fc.integer({ min: 1, max: 10 }),
        (raw, feePct, hold) => {
          const inputs = raw.map((r, i) => ({
            name: `T${i}`,
            commitment: r.commitment,
            maturity_years: r.maturity_years,
            oid_amount: r.commitment * r.oid_frac,
          }));
          const total = inputs.reduce((s, t) => s + t.commitment, 0);
          const schedules = buildAmortizingCostSchedules(inputs, feePct, hold);
          const feeSum = schedules.reduce((s, t) => s + t.fee_allocated, 0);
          expect(feeSum).toBeCloseTo(feePct * total, 8);
          schedules.forEach((s, idx) => {
            const maturity = inputs[idx].maturity_years;
            const oidSum = s.oid_amortization.reduce((a, b) => a + b, 0);
            expect(oidSum).toBeLessThanOrEqual(s.oid_amount + 1e-9);
            for (const r of s.oid_remaining_end) expect(r).toBeGreaterThanOrEqual(-1e-9);
            for (const r of s.fee_remaining_end) expect(r).toBeGreaterThanOrEqual(-1e-9);
            // straight-line: constant while the balance lasts
            if (s.oid_amount > 0 && hold <= maturity) {
              for (const a of s.oid_amortization) expect(a).toBeCloseTo(s.oid_amount / maturity, 8);
            }
          });
        },
      ),
    );
  });

  it('§14.16 FCF identity: fcfPreDebt = ebitda_adj − tax − capex − ΔNWC, exactly', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 500, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: -50, max: 50, noNaN: true }),
        (adj, tax, mcap, gcap, dnwc) => {
          const y = {
            revenue: 0, margin: 0, ebitda: 0, ebitda_adj: adj, monitoring_fee: 0, da: 0, ebit: 0,
            maint_capex: mcap, growth_capex: gcap, nwc_balance: 0, delta_nwc: dnwc,
            oid_amortization: 0, financing_fee_amortization: 0,
          };
          expect(fcfPreDebt(y, tax)).toBe(adj - tax - (mcap + gcap) - dnwc);
        },
      ),
    );
  });

  it('input-length guard: growth/growth_capex arrays must match hold_years', () => {
    expect(() =>
      buildOperating(
        { fy_revenue: 100, fy_ebitda_margin: 0.2 },
        {
          entry: { driver: 'multiple', entry_multiple: null, enterprise_value: null, basis: 'fy', hold_years: 5 },
          operations: {
            growth: [0.1], target_margin: 0.2, margin_path: 'linear',
            da_pct_revenue: 0.03, maint_capex_pct_revenue: 0.03,
            growth_capex: [0, 0, 0, 0, 0], nwc: { method: 'pct', pct_revenue: 0.1 },
          },
          fees: { transaction_pct_of_ev: 0.02, financing_pct_of_commitments: 0.015, monitoring: null },
        },
        [],
      ),
    ).toThrow(RangeError);
  });
});
