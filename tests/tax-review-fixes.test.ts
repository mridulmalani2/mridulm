/**
 * Adversarial-review fixes on the Phase 0 tax/debt logic.
 *   • NOL generation: a loss year banks a carryforward (the engine never did — it
 *     overstated future tax). This also preserves a §163(j) deduction released above
 *     current income, which previously evaporated.
 *   • OID on a mid-hold-drawn tranche no longer amortises before the tranche is drawn.
 */

import { describe, it, expect } from 'vitest';
import { computeAnnualTax, initTaxState } from '../lib/engine/tax';
import { oidAmortFromSchedule } from '../lib/engine/oid';
import type { TaxAssumptions, ModelState, DebtScheduleResult } from '../lib/dealEngineTypes';

const baseTax = (over: Partial<TaxAssumptions> = {}): TaxAssumptions => ({
  tax_rate: 0.25, tax_shield_on_interest: true, dtl_unwind_years: 0,
  nol_carryforward: 0, minimum_tax_rate: 0, ...over,
});

describe('NOL generation — a loss year banks a carryforward', () => {
  it('an operating loss creates an NOL used (80%-capped) in a later profitable year', () => {
    const tax = baseTax();
    const run = initTaxState(tax);
    // Year 1: EBIT 50, interest 150 → pretax loss 100 → bank NOL 100, no tax.
    const y1 = computeAnnualTax({ ebit: 50, interestExpense: 150, financingDeductions: 0, ebitdaForAti: 50 }, tax, run);
    expect(y1.tax).toBe(0);
    expect(run.nolRemaining).toBeCloseTo(100, 6);
    // Year 2: EBIT 200, no interest → taxable 200; NOL 100 used (under the 160 cap); tax on 100.
    const y2 = computeAnnualTax({ ebit: 200, interestExpense: 0, financingDeductions: 0, ebitdaForAti: 200 }, tax, run);
    expect(y2.nolUsed).toBeCloseTo(100, 6);
    expect(y2.tax).toBeCloseTo(25, 6);
    expect(run.nolRemaining).toBeCloseTo(0, 6);
  });

  it('§163(j) interest released above current income is preserved as an NOL, not destroyed', () => {
    const tax = baseTax({ section_163j_enabled: true, section_163j_ati_basis: 'ebitda', section_163j_ati_pct: 0.30 });
    const run = initTaxState(tax);
    // Year 1: EBITDA 200, EBIT 100, interest 200. Cap = 0.30×200 = 60 → disallow 140 carried
    // forward; taxable = 100 − 60 = 40 (positive, no NOL banked yet).
    const y1 = computeAnnualTax({ ebit: 100, interestExpense: 200, financingDeductions: 0, ebitdaForAti: 200 }, tax, run);
    expect(run.s163jCarryforward).toBeCloseTo(140, 6);
    expect(run.nolRemaining).toBeCloseTo(0, 6);
    expect(y1.tax).toBeCloseTo(10, 6);
    // Year 2: EBITDA 1000, EBIT 5, interest 0. Cap 300 releases all 140 → taxableBeforeNol =
    // 5 − 140 = −135. The 135 excess is banked as a fresh NOL instead of evaporating.
    const y2 = computeAnnualTax({ ebit: 5, interestExpense: 0, financingDeductions: 0, ebitdaForAti: 1000 }, tax, run);
    expect(y2.tax).toBe(0);
    expect(run.s163jCarryforward).toBeCloseTo(0, 6);
    expect(run.nolRemaining).toBeCloseTo(135, 6); // preserved, previously evaporated
  });
});

describe('OID on a mid-hold-drawn tranche does not amortise before the draw year', () => {
  it('zero OID amortisation in pre-draw years; recognised only from the draw year', () => {
    const state = {
      exit: { holding_period: 5 },
      debt_tranches: [{ oid_pct: 0.02, principal: 100, draw_year_index: 2, debt_maturity_years: 5 }],
    } as unknown as ModelState;
    const yr = (b: number, e: number) => ({ beginning_balance: b, ending_balance: e });
    const ds = {
      tranche_schedules: [[yr(0, 0), yr(0, 0), yr(100, 100), yr(100, 100), yr(100, 100)]],
    } as unknown as DebtScheduleResult;

    const oid = oidAmortFromSchedule(state, ds);
    expect(oid[0]).toBe(0); // not drawn yet
    expect(oid[1]).toBe(0); // not drawn yet
    expect(oid[2]).toBeGreaterThan(0); // amortises from the draw year
    // Never amortise more than the total discount (0.02 × 100 = 2).
    expect(oid.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(2 + 1e-9);
  });
});
