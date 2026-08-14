/**
 * engine2/sourcesUses.ts — SPEC §2 sources & uses at close (Phase C build order #2).
 *
 * Convention: cash-free / debt-free acquisition; the model transacts on EV. Fees and OID
 * sit in USES and increase the sponsor check; debt is raised at FACE value (net-of-OID
 * sources are a flagged error — DR-2 Item 1); rollover reduces the sponsor's cash check.
 * Sponsor equity is the PLUG, so sources ≡ uses by construction (invariant §14.1).
 *
 * No imports from lib/engine (boundary test).
 */

import type { DealAssumptions, DealFacts, RevolverAssumption, SourcesUses, TermTrancheAssumption, TrancheSize } from './types';

/** §16 single-driver sizing: x_ebitda × the §1.1 FY(LTM) sizing EBITDA (never NTM — §11) or amount. */
export function trancheSize(size: TrancheSize, fyEbitda: number): number {
  if (size.x_ebitda !== undefined) return size.x_ebitda * fyEbitda;
  return size.amount;
}

/**
 * Σ TERM-tranche par (the revolver is a commitment, never part of leverage at close).
 * THE one definition — `sizeStructure`, the §13 `leverage` sensitivity axis and the input
 * panel all read it, so "total debt at par" cannot mean two things in one product.
 */
export function totalTermParFromAssumptions(
  facts: Pick<DealFacts, 'fy_ebitda'>,
  assumptions: Pick<DealAssumptions, 'structure'>,
): number {
  return assumptions.structure.tranches.reduce(
    (s, t) => (t.type === 'revolver' ? s : s + trancheSize(t.size, facts.fy_ebitda)),
    0,
  );
}

/**
 * §11 [v1.1.2] entry leverage, GROSS: Σ term par ÷ FY EBITDA. Numerically identical to
 * `ModelOutput.derived.entry_gross_leverage_fy` BY CONSTRUCTION — `entry_ebitda_for_sizing`
 * is always `facts.fy_ebitda` (see `deriveEntry`) and `sizeStructure.total_par` is this same
 * sum. Exists so the INPUT surface can show the leverage being chosen BEFORE a build exists,
 * without inventing a second definition of the number the output surface reports.
 * Returns null when FY EBITDA is non-positive — N/A, never a sentinel (§11/§15).
 */
export function entryGrossLeverageFromAssumptions(
  facts: Pick<DealFacts, 'fy_ebitda'>,
  assumptions: Pick<DealAssumptions, 'structure'>,
): number | null {
  if (!(facts.fy_ebitda > 0)) return null;
  return totalTermParFromAssumptions(facts, assumptions) / facts.fy_ebitda;
}

/**
 * Scale every TERM tranche PROPORTIONALLY so total par = `targetLeverage` × FY EBITDA,
 * preserving the stack's relative shape (a 2:1 senior:PIK split stays 2:1). The inverse of
 * `entryGrossLeverageFromAssumptions`, and the ONLY way to set total leverage: writing the
 * target onto each tranche multiplies it by the tranche count.
 * Lives here, not in scenarios.ts, so the §13 `leverage` axis and the input panel share one
 * implementation without the UI importing the whole engine through `facade`.
 */
export function rescaleTermTranchesToLeverage<A extends Pick<DealAssumptions, 'structure'>>(
  facts: Pick<DealFacts, 'fy_ebitda'>,
  assumptions: A,
  targetLeverage: number,
): A {
  const currentTotal = totalTermParFromAssumptions(facts, assumptions);
  if (currentTotal <= 0) {
    throw new RangeError('sourcesUses: rescaling total leverage needs at least one term tranche to scale');
  }
  const factor = (targetLeverage * facts.fy_ebitda) / currentTotal;
  const tranches = assumptions.structure.tranches.map((t) => {
    if (t.type === 'revolver') return t;
    const size = t.size.x_ebitda !== undefined
      ? { x_ebitda: t.size.x_ebitda * factor }
      : { amount: t.size.amount * factor };
    return { ...t, size };
  });
  return { ...assumptions, structure: { ...assumptions.structure, tranches } };
}

export interface EntryDerivation {
  enterprise_value: number;
  entry_multiple: number;
  /** the §1.1 FY(LTM) sizing basis (FY, or the LTM stitch) — never NTM; read facts.sizing_basis, not the "fy_" name (SPEC §11, §1.1, C-14) [G-2/M2]. */
  entry_ebitda_for_sizing: number;
  /** The valuation-basis EBITDA the multiple applies to (FY, or the §9-symmetric NTM proxy). */
  entry_ebitda_for_valuation: number;
}

/**
 * §2/§16 entry: single-driver rule — the other side is derived. NTM valuation basis uses
 * the §9 proxy pattern (fy_ebitda × (1 + growth[0])); goldens are FY (NTM golden-uncovered,
 * flagged in SPEC §9).
 */
export function deriveEntry(
  facts: Pick<DealFacts, 'fy_ebitda'>,
  assumptions: Pick<DealAssumptions, 'entry' | 'operations'>,
): EntryDerivation {
  const { entry } = assumptions;
  const fy = facts.fy_ebitda;
  if (fy <= 0) throw new RangeError('sourcesUses: fy_ebitda must be > 0 to derive entry');
  const valuationEbitda = entry.basis === 'fy' ? fy : fy * (1 + assumptions.operations.growth[0]);
  let ev: number;
  let multiple: number;
  if (entry.driver === 'multiple') {
    if (entry.entry_multiple === null) throw new RangeError('sourcesUses: entry_multiple required when driver = multiple');
    multiple = entry.entry_multiple;
    ev = multiple * valuationEbitda;
  } else {
    if (entry.enterprise_value === null) throw new RangeError('sourcesUses: enterprise_value required when driver = ev');
    ev = entry.enterprise_value;
    multiple = ev / valuationEbitda;
  }
  return {
    enterprise_value: ev,
    entry_multiple: multiple,
    entry_ebitda_for_sizing: fy,
    entry_ebitda_for_valuation: valuationEbitda,
  };
}

export interface SizedStructure {
  /** Term tranches with resolved par (FACE) amounts, §16 order preserved. */
  terms: { assumption: TermTrancheAssumption; par: number; oid_amount: number }[];
  revolver: { assumption: RevolverAssumption; commitment: number } | null;
  total_par: number;
  /** Financing-fee base: total commitments INCLUDING the undrawn revolver (§2, DR-2 flag). */
  total_commitments: number;
  oid_total: number;
}

export function sizeStructure(
  structure: DealAssumptions['structure'],
  fyEbitda: number,
): SizedStructure {
  const revolvers = structure.tranches.filter((t): t is RevolverAssumption => t.type === 'revolver');
  if (revolvers.length > 1) throw new RangeError('sourcesUses: at most ONE revolver per deal (§16)');
  // Tranche names must be unique (C5 review): retirement reporting and the write-off
  // schedules are name-keyed — duplicates mis-attribute early-retirement write-offs
  // (wrong tranche's OID written off, the retired one keeps amortizing). Same input-gate
  // family as drawn_at_close and maturity > hold.
  const names = new Set<string>();
  for (const t of structure.tranches) {
    if (names.has(t.name)) {
      throw new RangeError(`sourcesUses: duplicate tranche name "${t.name}" — names key the §7 write-off schedules and retirement reporting`);
    }
    names.add(t.name);
  }
  const terms = structure.tranches
    .filter((t): t is TermTrancheAssumption => t.type !== 'revolver')
    .map((assumption) => {
      const par = trancheSize(assumption.size, fyEbitda);
      if (par < 0) throw new RangeError(`sourcesUses: ${assumption.name} par must be ≥ 0`);
      return { assumption, par, oid_amount: par * assumption.oid_pct };
    });
  const revolver = revolvers.length
    ? { assumption: revolvers[0], commitment: trancheSize(revolvers[0].commitment, fyEbitda) }
    : null;
  if (revolver && revolver.commitment < 0) {
    throw new RangeError('sourcesUses: revolver commitment must be ≥ 0 (it feeds the §2 fee base)');
  }
  // v1 input gate (C2 review F1): a revolver drawn at close would put interest-bearing
  // debt on the opening BS whose proceeds never entered §2 sources (the goodwill plug
  // would silently absorb it) — types.ts pins v1 drawn_at_close = 0; enforce it here,
  // same pattern as the v1.0.3 maturity gate.
  if (revolver && revolver.assumption.drawn_at_close !== 0) {
    throw new RangeError('sourcesUses: drawn_at_close must be 0 in v1 (§2 has no drawn-revolver source line)');
  }
  const totalPar = terms.reduce((s, t) => s + t.par, 0);
  return {
    terms,
    revolver,
    total_par: totalPar,
    total_commitments: totalPar + (revolver?.commitment ?? 0),
    oid_total: terms.reduce((s, t) => s + t.oid_amount, 0),
  };
}

/**
 * §2 S&U. Uses: EV + transaction costs + financing fees (on TOTAL commitments) + OID
 * (funded at close, capitalized) + cash to balance sheet (= min_cash floor). Sources:
 * debt at par + rollover + sponsor plug. Solvency (sponsor > 0) is checked by the §16
 * coherence gate, not here — this module never blocks, it computes.
 */
export function buildSourcesUses(
  entry: EntryDerivation,
  sized: SizedStructure,
  assumptions: Pick<DealAssumptions, 'fees' | 'structure' | 'rollover_equity' | 'sweet_equity'>,
): SourcesUses {
  const transactionCosts = assumptions.fees.transaction_pct_of_ev * entry.enterprise_value;
  const financingFees = assumptions.fees.financing_pct_of_commitments * sized.total_commitments;
  const cashToBs = assumptions.structure.min_cash;
  const totalUses =
    entry.enterprise_value + transactionCosts + financingFees + sized.oid_total + cashToBs;
  // §22.8 [v1.7.0]: the management subscription is its OWN source line and the sponsor
  // plug is the residual AFTER it (0 when the strip is null — byte-identical arithmetic).
  const managementSubscription = assumptions.sweet_equity?.management_subscription ?? 0;
  const sponsorEquity =
    totalUses - sized.total_par - assumptions.rollover_equity - managementSubscription;

  return {
    enterprise_value: entry.enterprise_value,
    transaction_costs: transactionCosts,
    financing_fees: financingFees,
    oid_funded: sized.oid_total,
    cash_to_balance_sheet: cashToBs,
    total_uses: totalUses,
    debt_at_par: sized.terms.map((t) => ({ name: t.assumption.name, amount: t.par })),
    rollover_equity: assumptions.rollover_equity,
    sponsor_equity: sponsorEquity,
    // §22.10 [v1.7.0]: a DISPLAYED source entering total_sources — `sources ≡ uses`
    // (§14.1, "always") is preserved BY CONSTRUCTION because the plug is the residual.
    management_subscription: managementSubscription,
    total_sources:
      sized.total_par + assumptions.rollover_equity + sponsorEquity + managementSubscription,
  };
}

/**
 * §22.3(vi) [v1.7.0]: the ONE statement of the strip-plug Build rejection — WITH a strip,
 * a subscription leaving a non-positive §2 residual plug makes the ordinary/loan-note
 * split incoherent. QUALIFIED on `sweet_equity`: unqualified it would reject runs v1
 * merely FLAGS (`negative_sponsor_equity`), killing a committed insolvency test inside
 * §14.23(f)'s domain — the qualifier is LOAD-BEARING. Returns the rejection message, or
 * null when the run may proceed. `runCore` THROWS on it (the Build enforcement point);
 * §13's sensitivity grid tests it BEFORE calling runModel for a cell and renders a NULL
 * cell instead — same condition, same home, two consumers.
 */
export function stripPlugRejection(
  su: Pick<SourcesUses, 'sponsor_equity'>,
  assumptions: Pick<DealAssumptions, 'sweet_equity'>,
): string | null {
  if (assumptions.sweet_equity && !(su.sponsor_equity > 0)) {
    return `sourcesUses: the management subscription leaves a non-positive sponsor plug (${su.sponsor_equity.toFixed(4)}) — rejected at Build (SPEC §22.3(vi))`;
  }
  return null;
}
