/**
 * engine2/tax.ts — SPEC §6 tax, wrapping kernel/taxstate (Phase C build order #3).
 *
 * The kernel owns the state machine; this module owns everything deal-shaped:
 *  - ATI basis resolution (§6.1): 'ebitda' → ATI = EBITDA_adj (post-OBBBA default);
 *    'ebit' → ATI = EBITDA_adj − D&A.
 *  - Pool assembly (§6.1): CAPPED = cash interest + PIK accrual + OID amortization;
 *    UNCAPPED = financing-fee amortization + commitment fees + exit-year write-off
 *    (Treas. Reg. §1.163(j)-1(b)(22)).
 *  - Policy/state mapping from the §16 TaxAssumption (carryforward opens at 0 — v1 is
 *    post-close-only; acquired NOL pool opens at the assumed balance).
 *  - The §9 UNLEVERED variant: interest and monitoring flipped to zero, tax base EBITDA
 *    (not EBITDA_adj), no §163(j) (no interest), NOL/§382 still apply — implemented by
 *    reusing the SAME kernel with zeroed pools so the two runs cannot drift.
 *
 * No imports from lib/engine (boundary test).
 */

import { taxYear, type KernelTaxPolicy, type KernelTaxState } from './kernel/taxstate';
import type { TaxAssumption, TaxYear } from './types';

export type { KernelTaxState } from './kernel/taxstate';

export function toKernelPolicy(tax: TaxAssumption): KernelTaxPolicy {
  return {
    rate: tax.rate,
    interest_deductible: tax.interest_deductible,
    s163j_applies: tax.s163j.applies,
    ati_pct: tax.s163j.ati_pct,
    acquired_usable: tax.nol.acquired_usable,
    arose_pre_2018: tax.nol.arose_pre_2018,
    s382_annual_limit: tax.nol.s382_annual_limit,
    minimum_rate: tax.minimum_rate,
  };
}

/** §6: acquired pool opens at the assumed balance; post-close pool and the §163(j) carryforward open at 0 (v1 post-close-only). */
export function openingTaxState(tax: TaxAssumption): KernelTaxState {
  return {
    acquired_nol: tax.nol.acquired_opening,
    postclose_nol: 0,
    s163j_carryforward: 0,
  };
}

/** The per-year finance/operating amounts §6 consumes (all computed upstream in the §5 order). */
export interface TaxYearInputs {
  ebitda_adj: number;
  da: number;
  /** All tranches + revolver (§4). */
  cash_interest_total: number;
  pik_accrual_total: number;
  /** §163(j)-capped interest (§6.1/§7). */
  oid_amortization: number;
  /** UNCAPPED ordinary deduction (§6.1/§7). */
  financing_fee_amortization: number;
  commitment_fees: number;
  /** Unamortized OID + financing fees written off on retirement — exit year, or a full early retirement (§6.2/§7/§9). 0 otherwise. */
  retirement_writeoff: number;
}

export interface TaxYearResult {
  row: TaxYear;
  state_end: KernelTaxState;
}

/** One levered tax year per §6; EBIT = EBITDA_adj − D&A (book EBIT — fee amortization flows to the interest line, never D&A — §7). */
export function runTaxYear(
  tax: TaxAssumption,
  state: KernelTaxState,
  y: TaxYearInputs,
): TaxYearResult {
  const ati = tax.s163j.ati_basis === 'ebitda' ? y.ebitda_adj : y.ebitda_adj - y.da;
  const capped = y.cash_interest_total + y.pik_accrual_total + y.oid_amortization;
  const uncapped = y.financing_fee_amortization + y.commitment_fees + y.retirement_writeoff;
  const out = taxYear(toKernelPolicy(tax), state, {
    ebit: y.ebitda_adj - y.da,
    ati,
    capped_interest_pool: capped,
    uncapped_deductions: uncapped,
  });
  return {
    row: {
      ati,
      capped_interest_pool: capped,
      uncapped_deductions: uncapped,
      deductible_capped_interest: out.deductible_capped_interest,
      // net NEW disallowance this year (a release year nets to 0 here and shows as a
      // carryforward decrease); display-only — the roll itself is pinned by _end
      s163j_disallowed_added: Math.max(0, out.s163j_carryforward_end - state.s163j_carryforward),
      s163j_carryforward_end: out.s163j_carryforward_end,
      taxable_before_nol: out.taxable_before_nol,
      acquired_nol_used: out.acquired_nol_used,
      postclose_nol_used: out.postclose_nol_used,
      nol_banked: out.nol_banked,
      acquired_nol_end: out.state_end.acquired_nol,
      postclose_nol_end: out.state_end.postclose_nol,
      regular_tax: out.regular_tax,
      minimum_tax: out.minimum_tax,
      cash_tax: out.cash_tax,
    },
    state_end: out.state_end,
  };
}

export interface UnleveredTaxYearResult {
  taxable_before_nol: number;
  acquired_nol_used: number;
  postclose_nol_used: number;
  cash_tax: number;
  state_end: KernelTaxState;
}

/**
 * §6/§9 unlevered stream: BOTH interest and monitoring are zero — tax base = EBITDA − D&A
 * (EBITDA, not EBITDA_adj), no §163(j) (no interest exists), NOL/§382 still apply. Reuses
 * the kernel with zeroed pools + s163j_applies=false so unlevered tax can never diverge
 * from the §6 machine (DR-2 Item 6: an interest tax shield leaking into the unlevered
 * stream is the #1 flagged error).
 */
export function runUnleveredTaxYear(
  tax: TaxAssumption,
  state: KernelTaxState,
  y: { ebitda: number; da: number },
): UnleveredTaxYearResult {
  const out = taxYear(
    { ...toKernelPolicy(tax), s163j_applies: false },
    state,
    { ebit: y.ebitda - y.da, ati: 0, capped_interest_pool: 0, uncapped_deductions: 0 },
  );
  return {
    taxable_before_nol: out.taxable_before_nol,
    acquired_nol_used: out.acquired_nol_used,
    postclose_nol_used: out.postclose_nol_used,
    cash_tax: out.cash_tax,
    state_end: out.state_end,
  };
}
