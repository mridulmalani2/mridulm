/**
 * MISSING-value taint (Phase 1). The invariant is NOT merely "render the empty input" — it is:
 * **no value DERIVED from an unconfirmed ('missing') factual input may be presented as real.**
 *
 * A factual field the filing lacks keeps a neutral PLACEHOLDER number in `ModelState` only so the
 * engine's solve doesn't divide-by-zero (the engine math is untouched and stays the source of
 * truth). But any DISPLAYED figure computed from such a placeholder is fabricated, so the UI must
 * show "N/C" (not computed) instead of the number. This module is the single, shared definition of
 * which displayed outputs depend on which factual inputs, so every surface (review preview, derived
 * rows, AI prompt, …) gates the same way and the rule can't drift per-component.
 */

import type { ProvenanceMap } from './types';

/** Factual inputs that can be 'missing' (the filing didn't provide them; tax always has a
 *  statutory 'default', so it is never 'missing'). Drives the Build gate and `anyFactualMissing`. */
export const FACTUAL_INPUT_PATHS = [
  'revenue.base_revenue',
  'margins.base_ebitda_margin',
  'margins.da_pct_revenue',
  'margins.capex_pct_revenue',
  'margins.nwc_pct_revenue',
  'entry.net_debt_at_entry',
] as const;

/**
 * Which factual inputs each DISPLAYED derived figure actually depends on (traced to the engine):
 *  • Enterprise value & the derived entry multiple are `multiple × revenue × EBITDA-margin`
 *    (LTM/NTM) — they depend ONLY on revenue + margin.
 *  • The implied RETURNS (entry equity, IRR, MOIC) run the full projection / debt schedule / exit,
 *    so they are treated as depending on EVERY factual input (`FACTUAL_INPUT_PATHS`): conservative
 *    and honest — we do not present "final" returns while any balance-sheet fact is unconfirmed.
 */
export const DERIVED_DEPENDENCIES: Record<string, readonly string[]> = {
  'entry.enterprise_value': ['revenue.base_revenue', 'margins.base_ebitda_margin'],
  'entry.entry_ebitda_multiple': ['revenue.base_revenue', 'margins.base_ebitda_margin'],
  'returns.entry_equity': FACTUAL_INPUT_PATHS,
  'returns.irr': FACTUAL_INPUT_PATHS,
  'returns.moic': FACTUAL_INPUT_PATHS,
};

/** True if the input at `path` is an unconfirmed placeholder (provenance 'missing'). */
export const isMissing = (prov: ProvenanceMap, path: string): boolean => prov[path]?.source === 'missing';

/** True if ANY factual input is still 'missing' (gates Build; nothing factual may be guessed). */
export const anyFactualMissing = (prov: ProvenanceMap): boolean =>
  FACTUAL_INPUT_PATHS.some((p) => isMissing(prov, p));

/**
 * True if the displayed output at `outputPath` is computed from at least one 'missing' placeholder
 * and must therefore be shown as N/C. An unknown output path is treated conservatively (tainted if
 * anything factual is missing) so a new display surface fails safe rather than leaking a placeholder.
 */
export const dependsOnMissing = (prov: ProvenanceMap, outputPath: string): boolean => {
  const deps = DERIVED_DEPENDENCIES[outputPath];
  return deps ? deps.some((d) => isMissing(prov, d)) : anyFactualMissing(prov);
};
