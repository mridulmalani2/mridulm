/**
 * engine2/display.ts — the DISPLAY-DERIVATION single-source layer.
 *
 * Display-only derived numbers (the entry/exit multiples) computed ONCE here, so every render
 * surface (OutputTabs, excelExport, memo) imports the one definition instead of reconstructing it.
 * This module is OFF the ENGINE ARITHMETIC PATH by design (tier-governance sign-off round 4): it
 * does no engine arithmetic — it reads existing `ModelOutput` fields and formats a display value —
 * so a diff here never means "engine arithmetic changed," keeping the source-containment fence's
 * `facade.ts` signal clean. It is IN the DISPLAY-SURFACE SET (walked by the governance guard), and
 * is the single-source HOME the FORBIDDEN_INLINE registry points render surfaces at (they may not
 * reconstruct these ratios inline; they import from here). Provenance for each number is pinned by a
 * value-provenance test (engine2-facade-scenarios).
 */
import type { Engine2ModelOutput } from './facade';

/**
 * §11 display helper — the entry multiple's BASIS, and the FY/LTM-canonical figure to show
 * alongside it under an NTM entry. `derived.entry_multiple` is the multiple on the
 * VALUATION basis: EV ÷ FY EBITDA when `entry.basis === 'fy'`, but EV ÷ (FY × (1 + growth[0]))
 * when `basis === 'ntm'` (§9). Labelling it "(FY)" unconditionally is therefore FALSE for an
 * NTM entry — and §11 states that "leverage sizing and every covenant test use FY(LTM)
 * EBITDA even when the valuation basis is NTM … if entry is NTM-based the UI shows both, LTM
 * canonical." This returns the data every displayed surface needs to obey that: the basis
 * label, the valuation multiple, and the FY-canonical multiple (EV ÷ `entry_ebitda_for_sizing`,
 * the §1.1 FY(LTM) sizing basis) — `fy_canonical` is null under an FY entry, where the two
 * coincide and only one line is shown (byte-identical to before for every FY deal). Pure display
 * LOGIC, not arithmetic: both numbers are already fully determined by existing `derived` fields,
 * so this introduces no second calculation path for any engine value.
 */
/**
 * The SIZING basis label ('FY' or the §1.1 'LTM' quarter-stitch) — the ONE place this string is
 * decided, so no surface hardcodes "FY EBITDA" against a fact that is actually the LTM stitch (the
 * mislabel class that hit v1.1.2's "Entry net leverage" and v1.1.3's "Entry multiple (FY)"). Read
 * off `DealFacts.sizing_basis`; default 'FY' (manual entry / pre-G-2). Distinct from the VALUATION
 * basis (FY vs NTM) returned by `entryMultipleDisplay.basis_label`.
 */
export const sizingBasisLabel = (b?: 'FY' | 'LTM'): 'FY' | 'LTM' => (b === 'LTM' ? 'LTM' : 'FY');

export function entryMultipleDisplay(o: Pick<Engine2ModelOutput, 'derived' | 'assumptions' | 'facts'>): {
  basis_label: 'FY' | 'NTM';
  sizing_label: 'FY' | 'LTM';
  valuation: number;
  fy_canonical: number | null;
} {
  const ntm = o.assumptions.entry.basis === 'ntm';
  return {
    basis_label: ntm ? 'NTM' : 'FY',
    // the leverage / FY-canonical figures size on entry_ebitda_for_sizing = the §1.1 sizing basis
    sizing_label: sizingBasisLabel(o.facts.sizing_basis),
    valuation: o.derived.entry_multiple,
    fy_canonical: ntm ? o.derived.enterprise_value / o.derived.entry_ebitda_for_sizing : null,
  };
}

/**
 * §9 display helper — the exit EV/EBITDA multiple, single-sourced. `exit_ev` is built as
 * `assumptions.exit.multiple × exit_ebitda_basis_value` (exit.ts), so this ratio recovers the
 * exit multiple exactly; expressing it once here — rather than inline in OutputTabs, excelExport
 * AND memo (three copies before this) — removes the drift risk of a derived number reconstructed
 * on three surfaces. Its provenance is pinned by test (== `assumptions.exit.multiple`). Returns a
 * finite number for every well-formed model (basis EBITDA > 0 by §9); a degenerate ≤0 basis is an
 * upstream invariant breach, not something this display layer silently papers over.
 */
export function exitMultipleDisplay(o: Pick<Engine2ModelOutput, 'exit'>): number {
  return o.exit.exit_ev / o.exit.exit_ebitda_basis_value;
}
