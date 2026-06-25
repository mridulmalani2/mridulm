/**
 * Phase 0A — corporate tax realism.
 *
 * Unit-tests the shared tax line (computeAnnualTax) for the mandated sequencing
 *   §163(j) interest cap → taxable income → NOL (80% cap) → minimum tax
 * and integration-tests via fullRecalc that the tax_shield flag and the NOL cap now
 * actually move the model (the pre-fix engine ignored both).
 */

import { describe, it, expect } from 'vitest';
import { computeAnnualTax, initTaxState, type TaxRunningState } from '../lib/engine/tax';
import { fullRecalc } from '../lib/engine/index';
import { canonicalDeals } from './fixtures/canonicalDeals';
import type { TaxAssumptions } from '../lib/dealEngineTypes';

const baseTax = (over: Partial<TaxAssumptions> = {}): TaxAssumptions => ({
  tax_rate: 0.25,
  tax_shield_on_interest: true,
  dtl_unwind_years: 0,
  nol_carryforward: 0,
  minimum_tax_rate: 0,
  ...over,
});

const line = (ebit: number, interestExpense: number, financingDeductions = 0, ebitdaForAti = ebit) =>
  ({ ebit, interestExpense, financingDeductions, ebitdaForAti });

describe('computeAnnualTax — default path equals the legacy inline logic', () => {
  it('shield on, no NOL, no §163(j): taxable income = EBT, tax = EBT × rate', () => {
    const tax = baseTax();
    const run = initTaxState(tax);
    const r = computeAnnualTax(line(100, 30), tax, run);
    expect(r.ebt).toBe(70);
    expect(r.deductibleInterest).toBe(30);
    expect(r.disallowedInterest).toBe(0);
    expect(r.taxableIncome).toBe(70);
    expect(r.nolUsed).toBe(0);
    expect(r.tax).toBeCloseTo(17.5, 9);
  });

  it('a pretax loss pays no tax, uses no NOL, and banks the loss as a fresh carryforward', () => {
    const tax = baseTax({ nol_carryforward: 100 });
    const run = initTaxState(tax);
    const r = computeAnnualTax(line(20, 40), tax, run); // EBT = −20, taxable base −20
    expect(r.ebt).toBe(-20);
    expect(r.taxableIncome).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.nolUsed).toBe(0);
    expect(run.nolRemaining).toBe(120); // banks the 20 loss (post-2017 NOLs carry forward)
  });

  it('a loss year banks an NOL that offsets a later profitable year (80% cap)', () => {
    const tax = baseTax({ nol_carryforward: 0 });
    const run = initTaxState(tax);
    // Year 1: loss of 50 (EBIT 0, interest 50) → banks 50 NOL, no tax.
    const y1 = computeAnnualTax(line(0, 50), tax, run);
    expect(y1.tax).toBe(0);
    expect(run.nolRemaining).toBeCloseTo(50, 9);
    // Year 2: profit 100 → the banked 50 is below the 80% cap (80), so it is fully used.
    const y2 = computeAnnualTax(line(100, 0), tax, run);
    expect(y2.nolUsed).toBeCloseTo(50, 9);
    expect(y2.taxableIncome).toBeCloseTo(50, 9);
    expect(y2.tax).toBeCloseTo(12.5, 9);
    expect(run.nolRemaining).toBeCloseTo(0, 9);
  });
});

describe('tax_shield_on_interest flag gates the interest deduction', () => {
  it('shield off: interest is added back to the tax base (book EBT unchanged)', () => {
    const tax = baseTax({ tax_shield_on_interest: false });
    const run = initTaxState(tax);
    const r = computeAnnualTax(line(100, 30), tax, run);
    expect(r.ebt).toBe(70);                  // book pretax still nets interest
    expect(r.deductibleInterest).toBe(0);    // ...but none of it is deductible
    expect(r.disallowedInterest).toBe(30);
    expect(r.taxableIncome).toBe(100);       // tax base = EBIT
    expect(r.tax).toBeCloseTo(25, 9);        // vs 17.5 with the shield on
  });
});

describe('NOL 80% limitation (post-2017) + §382 annual limit', () => {
  it('post-2017 NOL offsets at most 80% of taxable income', () => {
    const tax = baseTax({ nol_carryforward: 200 });
    const run = initTaxState(tax);
    const r = computeAnnualTax(line(100, 0), tax, run);
    expect(r.nolUsed).toBeCloseTo(80, 9);          // 0.80 × 100
    expect(r.taxableIncome).toBeCloseTo(20, 9);
    expect(r.tax).toBeCloseTo(5, 9);               // 20 × 0.25
    expect(run.nolRemaining).toBeCloseTo(120, 9);
  });

  it('pre-2017 NOL offsets 100% of taxable income (cap bypassed)', () => {
    const tax = baseTax({ nol_carryforward: 200, nol_is_pre_2017: true });
    const run = initTaxState(tax);
    const r = computeAnnualTax(line(100, 0), tax, run);
    expect(r.nolUsed).toBeCloseTo(100, 9);
    expect(r.taxableIncome).toBe(0);
    expect(r.tax).toBe(0);
  });

  it('§382 annual limit caps NOL usage below the 80% cap', () => {
    const tax = baseTax({ nol_carryforward: 200, section_382_annual_limit: 50 });
    const run = initTaxState(tax);
    const r = computeAnnualTax(line(100, 0), tax, run);
    expect(r.nolUsed).toBeCloseTo(50, 9);          // min(200, 80, 50)
    expect(r.taxableIncome).toBeCloseTo(50, 9);
    expect(r.tax).toBeCloseTo(12.5, 9);
  });
});

describe('§163(j) interest cap (30% of ATI) with carryforward', () => {
  it('caps deductible interest and carries the excess forward, absorbing it next year', () => {
    const tax = baseTax({ section_163j_enabled: true, section_163j_ati_pct: 0.30 });
    const run: TaxRunningState = initTaxState(tax);

    // Year 1: interest 40 vs cap 30 → 10 disallowed, carried forward.
    const y1 = computeAnnualTax(line(100, 40, 0, 130), tax, run);
    expect(y1.deductibleInterest).toBeCloseTo(30, 9);
    expect(y1.disallowedInterest).toBeCloseTo(10, 9);
    expect(run.s163jCarryforward).toBeCloseTo(10, 9);
    expect(y1.taxableIncome).toBeCloseTo(70, 9);   // 100 − 30
    expect(y1.tax).toBeCloseTo(17.5, 9);

    // Year 2: interest 20 + 10 carryforward = 30 = cap → fully absorbed, carryforward clears.
    const y2 = computeAnnualTax(line(100, 20, 0, 130), tax, run);
    expect(y2.deductibleInterest).toBeCloseTo(30, 9);
    expect(y2.disallowedInterest).toBeCloseTo(0, 9);
    expect(run.s163jCarryforward).toBeCloseTo(0, 9);
    expect(y2.taxableIncome).toBeCloseTo(70, 9);
  });

  it("'ebitda' ATI basis (pre-2022) lifts the cap by adding D&A back", () => {
    const tax = baseTax({ section_163j_enabled: true, section_163j_ati_basis: 'ebitda' });
    const run = initTaxState(tax);
    // ATI = EBITDA 130 → cap 39; interest 35 < 39 → fully deductible.
    const r = computeAnnualTax(line(100, 35, 0, 130), tax, run);
    expect(r.deductibleInterest).toBeCloseTo(35, 9);
    expect(r.disallowedInterest).toBeCloseTo(0, 9);
  });
});

describe('full ordering in one year: §163(j) → taxable income → NOL → minimum tax', () => {
  it('applies all four steps in sequence', () => {
    const tax = baseTax({
      tax_rate: 0.21,
      section_163j_enabled: true,
      section_163j_ati_pct: 0.30,
      nol_carryforward: 1000,
      nol_limitation_pct: 0.80,
      minimum_tax_rate: 0.15,
    });
    const run = initTaxState(tax);
    const r = computeAnnualTax(line(100, 50, 0, 130), tax, run);
    // §163(j): cap 30, interest 50 → deduct 30, disallow 20.
    expect(r.disallowedInterest).toBeCloseTo(20, 9);
    // taxable before NOL = 100 − 30 = 70; NOL = 0.80 × 70 = 56 → taxable = 14.
    expect(r.nolUsed).toBeCloseTo(56, 9);
    expect(r.taxableIncome).toBeCloseTo(14, 9);
    // min tax: max(14×0.21, 14×0.15) = max(2.94, 2.10) = 2.94.
    expect(r.tax).toBeCloseTo(2.94, 9);
  });

  it('the minimum tax binds when its rate exceeds the regular rate', () => {
    const tax = baseTax({ tax_rate: 0.10, minimum_tax_rate: 0.15 });
    const run = initTaxState(tax);
    const r = computeAnnualTax(line(100, 0), tax, run);
    expect(r.tax).toBeCloseTo(15, 9); // max(10, 15)
  });
});

describe('integration via fullRecalc — the flags now move the model', () => {
  it('switching the interest tax shield off raises total cash tax and lowers IRR', () => {
    const withShield = fullRecalc((() => { const s = canonicalDeals[0].build(); s.tax.tax_shield_on_interest = true; return s; })());
    const noShield = fullRecalc((() => { const s = canonicalDeals[0].build(); s.tax.tax_shield_on_interest = false; return s; })());

    const totalTax = (s: typeof withShield) => s.projections.years.reduce((a, y) => a + y.tax, 0);
    expect(totalTax(noShield)).toBeGreaterThan(totalTax(withShield) + 1e-6);
    // Less cash retained ⇒ lower equity IRR.
    expect((noShield.returns.irr ?? 0)).toBeLessThan((withShield.returns.irr ?? 0));
  });

  it('post-2017 NOL cap still taxes 20% of income in year 1; pre-2017 NOL shelters it fully', () => {
    const post2017 = fullRecalc((() => { const s = canonicalDeals[0].build(); s.tax.nol_carryforward = 500; return s; })());
    const pre2017 = fullRecalc((() => { const s = canonicalDeals[0].build(); s.tax.nol_carryforward = 500; s.tax.nol_is_pre_2017 = true; return s; })());

    expect(post2017.projections.years[0].tax).toBeGreaterThan(0.001); // 80% cap leaves 20% taxable
    expect(pre2017.projections.years[0].tax).toBeLessThan(0.001);     // 100% offset
    expect(post2017.projections.years[0].nol_used).toBeGreaterThan(0);
  });

  it('§163(j) raises cash tax on a levered deal when interest exceeds 30% of ATI', () => {
    // A 12% coupon on the canonical 80 bullet ⇒ interest ≈ 9.6 vs a ~30%×EBIT≈5.7 cap, so
    // §163(j) bites while the deal stays solvent (≈3.6x leverage, ICR ≈ 2.3x) and closes.
    const makeLevered = (enable163j: boolean) => {
      const s = canonicalDeals[0].build();
      s.debt_tranches = s.debt_tranches.map((t) => ({ ...t, interest_rate: 0.12 }));
      s.tax.section_163j_enabled = enable163j;
      return fullRecalc(s);
    };
    const on = makeLevered(true);
    const off = makeLevered(false);

    const totalTax = (s: typeof on) => s.projections.years.reduce((a, y) => a + y.tax, 0);
    // Less interest deductible ⇒ more tax than the identical deal with §163(j) off.
    expect(totalTax(on)).toBeGreaterThan(totalTax(off) + 1e-6);
    expect(on.projections.years.some((y) => y.disallowed_interest > 0)).toBe(true);
    expect(off.projections.years.every((y) => y.disallowed_interest === 0)).toBe(true);
    // A higher tax base must still tie out the three statements (cash tax flows to both
    // net income and FCF, so the balance sheet closes by construction).
    expect(on.balance_sheet.closes).toBe(true);
  });
});
