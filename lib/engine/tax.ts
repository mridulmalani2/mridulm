/**
 * Annual corporate-tax computation (Phase 0A).
 *
 * The single, shared tax line used by BOTH projection passes (the pre-debt estimate in
 * `buildProjections` and the post-debt true-up in `updateProjectionsWithDebt`). Extracting
 * it here guarantees the two blocks cannot silently diverge — historically they were copied
 * by hand.
 *
 * Correct sequencing when income is positive (each step feeds the next):
 *   1. §163(j) limits the deductible business interest (cap = pct × ATI), with disallowed
 *      interest carried forward.
 *   2. taxable income = EBIT − deductible interest.
 *   3. NOL offsets taxable income, capped at 80% of it for post-2017 losses (and at any
 *      §382 annual ownership-change limit).
 *   4. the minimum tax applies last (greater of regular tax and the minimum effective rate).
 *
 * Backward compatibility: with the default assumptions (`tax_shield_on_interest = true`,
 * `section_163j_enabled` absent/false, `nol_carryforward = 0`, `minimum_tax_rate = 0`),
 * `deductibleInterest === totalInterest`, so `taxableIncomeBeforeNol === ebt` and the result
 * is identical to the previous inline logic — no existing deal moves.
 */

import type { TaxAssumptions } from '../dealEngineTypes';

/** TCJA post-2017 cap: NOLs offset at most 80% of taxable income (before the NOL deduction). */
export const DEFAULT_NOL_LIMITATION_PCT = 0.80;
/** §163(j): deductible business interest capped at 30% of ATI. */
export const DEFAULT_SECTION_163J_ATI_PCT = 0.30;

export interface TaxLineInput {
  /** Operating profit after D&A (EBIT), already net of the monitoring fee. */
  ebit: number;
  /** Book interest expense for the year (cash + PIK) — the P&L interest line. */
  interestExpense: number;
  /** Other amortised financing costs deductible this year (financing-fee amort + OID amort).
   *  These are interest for §163(j) purposes, so they share the interest-limitation base. */
  financingDeductions: number;
  /** EBITDA (monitoring-fee-adjusted) — used only when the §163(j) ATI basis is 'ebitda'. */
  ebitdaForAti: number;
}

export interface TaxRunningState {
  /** Remaining NOL carryforward balance. Depleted as it is used across the hold. */
  nolRemaining: number;
  /** Running §163(j) disallowed-interest carryforward, retested against the cap each year. */
  s163jCarryforward: number;
}

export interface TaxLineResult {
  /** Book pretax income = EBIT − interestExpense − financingDeductions (unchanged definition). */
  ebt: number;
  /** Interest actually allowed as a tax deduction this year. */
  deductibleInterest: number;
  /** Interest denied this year — §163(j) disallowance (carried forward) or, when the shield
   *  is off, the non-deductible interest (permanent, not carried). */
  disallowedInterest: number;
  /** Taxable income after interest disallowance and the NOL offset, floored at 0. */
  taxableIncome: number;
  /** NOL actually used this year. */
  nolUsed: number;
  /** Cash tax for the year. */
  tax: number;
}

/** Seed the running tax state from the assumptions (opening NOL + any §163(j) carryforward). */
export function initTaxState(tax: TaxAssumptions): TaxRunningState {
  return {
    nolRemaining: tax.nol_carryforward ?? 0,
    s163jCarryforward: tax.section_163j_carryforward ?? 0,
  };
}

/**
 * Compute one year's tax, mutating `run` (NOL balance + §163(j) carryforward) so a multi-year
 * loop threads the carryforwards forward. Pure aside from that explicit running state.
 */
export function computeAnnualTax(
  input: TaxLineInput,
  tax: TaxAssumptions,
  run: TaxRunningState,
): TaxLineResult {
  const { ebit, interestExpense, financingDeductions, ebitdaForAti } = input;

  // Book pretax income (drives net income / the P&L) — full interest always deducted here;
  // the tax *base* may differ when interest is limited below.
  const ebt = ebit - interestExpense - financingDeductions;

  // Total business interest subject to the deductibility rules.
  const totalInterest = interestExpense + financingDeductions;

  // ── (1) Interest deductibility: the tax-shield switch, then the §163(j) ATI cap ──
  let deductibleInterest: number;
  let disallowedInterest: number;
  if (!tax.tax_shield_on_interest) {
    // No interest tax shield (e.g. a BEAT / non-deductible structure). Interest is
    // permanently non-deductible — a structural assumption, not a timing limit — so
    // nothing carries forward.
    deductibleInterest = 0;
    disallowedInterest = totalInterest;
    run.s163jCarryforward = 0;
  } else if (tax.section_163j_enabled) {
    // §163(j): deductible business interest capped at pct × ATI. Post-2022 ATI is EBIT-based;
    // the optional 'ebitda' basis (pre-2022) uses EBITDA. Current-year interest plus any prior
    // disallowed carryforward is retested; the excess carries forward indefinitely.
    const atiPct = tax.section_163j_ati_pct ?? DEFAULT_SECTION_163J_ATI_PCT;
    const ati = tax.section_163j_ati_basis === 'ebitda' ? ebitdaForAti : ebit;
    const subject = totalInterest + run.s163jCarryforward;
    const maxDeductible = Math.max(0, atiPct * Math.max(0, ati));
    deductibleInterest = Math.min(subject, maxDeductible);
    disallowedInterest = subject - deductibleInterest;
    run.s163jCarryforward = disallowedInterest;
  } else {
    deductibleInterest = totalInterest;
    disallowedInterest = 0;
    run.s163jCarryforward = 0;
  }

  // ── (2) Taxable income before the NOL deduction ──
  // With the shield on and §163(j) disabled (the default), deductibleInterest === totalInterest
  // so this equals `ebt` exactly, preserving the historical tax base.
  const taxableBeforeNol = ebit - deductibleInterest;

  // ── (3) NOL offset — post-2017 80%-of-taxable-income cap (pre-2017 NOLs offset 100%);
  //         optional §382 ownership-change annual limit ──
  let nolUsed = 0;
  if (taxableBeforeNol > 0 && run.nolRemaining > 0) {
    const limitPct = tax.nol_is_pre_2017 ? 1 : (tax.nol_limitation_pct ?? DEFAULT_NOL_LIMITATION_PCT);
    const annual382 = tax.section_382_annual_limit && tax.section_382_annual_limit > 0
      ? tax.section_382_annual_limit
      : Infinity;
    nolUsed = Math.min(run.nolRemaining, limitPct * taxableBeforeNol, annual382);
    run.nolRemaining -= nolUsed;
  }
  const taxableIncome = Math.max(0, taxableBeforeNol - nolUsed);

  // ── (4) Minimum tax applies last: the greater of regular tax and the minimum effective
  //         rate (Pillar Two / CAMT proxy). Default minimum_tax_rate = 0 ⇒ regular tax. ──
  const regularTax = taxableIncome * tax.tax_rate;
  const minimumTax = taxableIncome * (tax.minimum_tax_rate ?? 0);
  const tax_ = Math.max(regularTax, minimumTax);

  return { ebt, deductibleInterest, disallowedInterest, taxableIncome, nolUsed, tax: tax_ };
}
