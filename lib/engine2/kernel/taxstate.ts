/**
 * kernel/taxstate.ts — the SPEC §6 tax state machine (v1.0: fully determined, two NOL pools).
 *
 * Kernel rule: pure functions, zero imports except other kernel modules.
 *
 * Per year, on the running state {acquired NOL, post-close NOL, §163(j) carryforward}:
 *   1. §163(j) interest deduction on the CAPPED pool (cash interest + PIK accrual + OID
 *      amortization); financing-fee amortization, commitment fees and the exit-year
 *      write-off are UNCAPPED deductions (Treas. Reg. §1.163(j)-1(b)(22)) — the caller
 *      splits the pools (§6.1).
 *   2. taxable_before_NOL = EBIT − deductible − uncapped; explicit LOSS BRANCH: banks the
 *      loss into the post-close pool, zero tax, no NOL usage (§6.2).
 *   3. NOL usage — TWO pools, acquired first: acquired capped by §382 (static annual
 *      limit) and its layer cap (pre-2018 ⇒ 100%, else 80%); post-close capped by the 80%
 *      aggregate — shared with a post-2017 acquired layer on the full base; after a
 *      pre-2018 acquired layer the 80% applies to the RESIDUAL income (IRC
 *      §172(a)(2)(B)(ii); aggregate usage ≤ taxable in both branches) (§6.3 [v1.0.3]).
 *   4. cash tax = max(rate × (taxable − used), min_rate × PRE-NOL taxable); NOL usage is
 *      consumed in full even when the floor binds (§6.4).
 *
 * ATI-basis resolution ('ebitda' → EBITDA_adj, 'ebit' → EBITDA_adj − D&A) and pool
 * assembly happen in the engine's tax module (Phase C); the kernel takes ATI and the two
 * deduction pools as numbers so it stays deal-agnostic. The same function serves the
 * unlevered stream (§9): zero interest pools, tax base passed as EBIT-of-the-unlevered-run.
 */

export interface KernelTaxPolicy {
  /** Statutory rate on post-NOL taxable income (§6.4). */
  rate: number;
  /** false = BEAT-style permanent disallowance: deductible = 0, NOTHING accrues (§6.1). */
  interest_deductible: boolean;
  /** false = §163(j) small-business exception: capped pool fully deductible (§6.1). */
  s163j_applies: boolean;
  /** §163(j) cap = max(0, ati_pct × ATI) — negative-ATI floor (§6.1). */
  ati_pct: number;
  /** false ⇒ acquired pool is never consumed (survival default OFF — §6.3, C-18). */
  acquired_usable: boolean;
  /** Acquired layer cap: pre-2018 ⇒ 100% of taxable, else 80% (§6.3, IRC §172). */
  arose_pre_2018: boolean;
  /** Static §382 annual limit on the acquired pool; null = no limit (§6.3). */
  s382_annual_limit: number | null;
  /** Minimum-tax floor rate on the PRE-NOL base; 0 = off (§6.4). */
  minimum_rate: number;
}

export interface KernelTaxState {
  acquired_nol: number;
  postclose_nol: number;
  s163j_carryforward: number;
}

export interface KernelTaxYearIn {
  /** Book EBIT (EBITDA_adj − D&A) — the §6.2 taxable base before deductions. */
  ebit: number;
  /** Resolved ATI value (basis resolution is the caller's job — §6.1). */
  ati: number;
  /** §163(j) CAPPED pool: cash interest + PIK accrual + OID amortization (§6.1). */
  capped_interest_pool: number;
  /** UNCAPPED: financing-fee amortization + commitment fees + exit-year write-off (§6.1). */
  uncapped_deductions: number;
}

export interface KernelTaxYearOut {
  deductible_capped_interest: number;
  s163j_carryforward_end: number;
  taxable_before_nol: number;
  acquired_nol_used: number;
  postclose_nol_used: number;
  /** Loss years bank −taxable into the post-close pool (§6.2/§6.3). */
  nol_banked: number;
  /** rate × (taxable − used); 0 in the loss branch. */
  regular_tax: number;
  /** min_rate × PRE-NOL taxable; 0 in the loss branch (the floor never goes negative — §6.2). */
  minimum_tax: number;
  cash_tax: number;
  state_end: KernelTaxState;
}

export function taxYear(
  policy: KernelTaxPolicy,
  state: KernelTaxState,
  year: KernelTaxYearIn,
): KernelTaxYearOut {
  validate(policy, state, year);

  // ── §6.1 interest deduction ──
  let deductible: number;
  let carryforwardEnd: number;
  if (!policy.interest_deductible) {
    // Permanent disallowance — nothing accrues under a BEAT-style flag.
    deductible = 0;
    carryforwardEnd = 0;
  } else if (!policy.s163j_applies) {
    deductible = year.capped_interest_pool + state.s163j_carryforward; // fully released
    carryforwardEnd = 0;
  } else {
    const available = year.capped_interest_pool + state.s163j_carryforward;
    const cap = Math.max(0, policy.ati_pct * year.ati); // negative-ATI floor
    deductible = Math.min(available, cap);
    carryforwardEnd = available - deductible; // ≥ 0; indefinite
  }

  // ── §6.2 taxable income & the explicit loss branch ──
  const taxable = year.ebit - deductible - year.uncapped_deductions;
  if (taxable <= 0) {
    const banked = -taxable;
    return {
      deductible_capped_interest: deductible,
      s163j_carryforward_end: carryforwardEnd,
      taxable_before_nol: taxable,
      acquired_nol_used: 0,
      postclose_nol_used: 0,
      nol_banked: banked,
      regular_tax: 0,
      minimum_tax: 0,
      cash_tax: 0,
      state_end: {
        acquired_nol: state.acquired_nol,
        postclose_nol: state.postclose_nol + banked,
        s163j_carryforward: carryforwardEnd,
      },
    };
  }

  // ── §6.3 NOL usage — acquired first, then post-close under the 80% aggregate ──
  const acquiredCapPct = policy.arose_pre_2018 ? 1.0 : 0.8;
  const acquiredUsed = policy.acquired_usable
    ? Math.min(
        state.acquired_nol,
        policy.s382_annual_limit ?? Infinity,
        acquiredCapPct * taxable,
      )
    : 0;
  // Post-2017 acquired layer: shared 80% aggregate cap on the FULL base. Pre-2018
  // acquired layer: 100% cap of its own, and the post-close 80% cap applies to the
  // RESIDUAL income after it — IRC §172(a)(2)(B)(ii) computes the 80% base as income
  // after pre-2018 NOL usage [CORRECTED v1.0.3: the v1.0 form let aggregate usage
  // exceed taxable income, burning post-close NOLs for zero benefit]. Aggregate
  // usage ≤ taxable income holds in both branches by construction.
  const postcloseUsed = Math.min(
    state.postclose_nol,
    Math.max(
      0,
      0.8 * (taxable - (policy.arose_pre_2018 ? acquiredUsed : 0)) -
        (policy.arose_pre_2018 ? 0 : acquiredUsed),
    ),
  );

  // ── §6.4 cash tax with the minimum floor on the PRE-NOL base ──
  const regularTax = policy.rate * (taxable - acquiredUsed - postcloseUsed);
  const minimumTax = policy.minimum_rate * taxable;
  const cashTax = Math.max(regularTax, minimumTax);

  return {
    deductible_capped_interest: deductible,
    s163j_carryforward_end: carryforwardEnd,
    taxable_before_nol: taxable,
    acquired_nol_used: acquiredUsed,
    postclose_nol_used: postcloseUsed,
    nol_banked: 0,
    regular_tax: regularTax,
    minimum_tax: minimumTax,
    cash_tax: cashTax,
    state_end: {
      acquired_nol: state.acquired_nol - acquiredUsed,
      postclose_nol: state.postclose_nol - postcloseUsed,
      s163j_carryforward: carryforwardEnd,
    },
  };
}

function validate(policy: KernelTaxPolicy, state: KernelTaxState, year: KernelTaxYearIn): void {
  assertRate(policy.rate, 'policy.rate');
  assertRate(policy.ati_pct, 'policy.ati_pct');
  assertRate(policy.minimum_rate, 'policy.minimum_rate');
  if (policy.s382_annual_limit !== null) {
    assertNonNegative(policy.s382_annual_limit, 'policy.s382_annual_limit');
  }
  assertNonNegative(state.acquired_nol, 'state.acquired_nol');
  assertNonNegative(state.postclose_nol, 'state.postclose_nol');
  assertNonNegative(state.s163j_carryforward, 'state.s163j_carryforward');
  assertFinite(year.ebit, 'year.ebit'); // may be negative
  assertFinite(year.ati, 'year.ati'); // may be negative (negative-ATI floor — §6.1)
  assertNonNegative(year.capped_interest_pool, 'year.capped_interest_pool');
  assertNonNegative(year.uncapped_deductions, 'year.uncapped_deductions');
}

function assertFinite(x: number, name: string): void {
  if (!Number.isFinite(x)) throw new RangeError(`kernel/taxstate: ${name} must be finite, got ${x}`);
}

function assertNonNegative(x: number, name: string): void {
  assertFinite(x, name);
  if (x < 0) throw new RangeError(`kernel/taxstate: ${name} must be ≥ 0, got ${x}`);
}

function assertRate(x: number, name: string): void {
  assertNonNegative(x, name);
  if (x > 1) throw new RangeError(`kernel/taxstate: ${name} is a decimal fraction ≤ 1, got ${x}`);
}
