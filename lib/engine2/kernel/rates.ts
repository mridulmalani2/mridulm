/**
 * kernel/rates.ts — rate & accrual primitives (SPEC §4).
 *
 * Kernel rule (rebuild/PHASE_B_GOLDENS_KERNEL.md §B2): pure functions, zero imports from
 * anywhere except other kernel modules. The kernel defines its own minimal structural types;
 * Phase C's engine modules map lib/engine2/types.ts onto them.
 *
 * Everything here is a beginning-of-year convention: interest, PIK accrual and commitment
 * fees all accrue on OPENING balances (SPEC §4 — the disclosed, strictly sequential
 * convention that makes the model solver-free per §5).
 */

/** Structural twin of types.ts TranchePricing (kernel stays import-free). */
export type KernelPricing =
  | { kind: 'fixed'; rate: number }
  | { kind: 'floating'; base_rate: number; spread: number; floor: number };

/**
 * SPEC §4: floating all-in = max(base, floor) + spread — the floor applies to the BASE
 * rate before margin, "modeled as a MAX, never an addition" (DR-1 Item 4). Fixed: the rate.
 */
export function allInRate(pricing: KernelPricing): number {
  if (pricing.kind === 'fixed') {
    assertFinite(pricing.rate, 'fixed rate');
    return pricing.rate;
  }
  assertFinite(pricing.base_rate, 'base_rate');
  assertFinite(pricing.spread, 'spread');
  assertFinite(pricing.floor, 'floor');
  return Math.max(pricing.base_rate, pricing.floor) + pricing.spread;
}

/** SPEC §4: cash interest = BEGINNING-of-year balance × all-in rate. */
export function cashInterest(beginningBalance: number, allIn: number): number {
  assertNonNegative(beginningBalance, 'beginningBalance');
  assertFinite(allIn, 'allIn');
  return beginningBalance * allIn;
}

/**
 * SPEC §4: PIK accrual = beginning balance × pik rate; compounds into the balance at year
 * end (the year's repayment caps in §3 apply to balance + accrual — see kernel/waterfall).
 */
export function pikAccrual(beginningBalance: number, pikRate: number): number {
  assertNonNegative(beginningBalance, 'beginningBalance');
  assertNonNegative(pikRate, 'pikRate');
  return beginningBalance * pikRate;
}

/**
 * SPEC §4 [adjudicated 2026-07-05]: commitment fee on BEGINNING-of-year undrawn commitment
 * (draws happen at waterfall step 6, year-end). Sits in the finance-cost line and in DSCR
 * debt service; an UNCAPPED tax deduction (§6) — never §163(j) interest.
 */
export function commitmentFee(beginningUndrawn: number, feeRate: number): number {
  assertNonNegative(beginningUndrawn, 'beginningUndrawn');
  assertNonNegative(feeRate, 'feeRate');
  return beginningUndrawn * feeRate;
}

function assertFinite(x: number, name: string): void {
  if (!Number.isFinite(x)) throw new RangeError(`kernel/rates: ${name} must be finite, got ${x}`);
}

function assertNonNegative(x: number, name: string): void {
  assertFinite(x, name);
  if (x < 0) throw new RangeError(`kernel/rates: ${name} must be ≥ 0, got ${x}`);
}
