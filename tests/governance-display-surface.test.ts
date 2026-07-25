/**
 * GOVERNANCE gate (b) — the committed CI check the tiered template's Tier-C/display rule
 * requires (rebuild/PHASE_G_EXTENSIONS.md, hostile review round 2 finding R2-2). It replaces
 * "the conformance reviewer greps" with a mechanical, fail-closed check over the DEFINED
 * DISPLAY-SURFACE SET, so a second calculation path for a displayed number cannot slip in
 * silently (the one thing ENGINE_ARCHITECTURE §4 forbids; a hard-coded 99.0 sentinel once
 * "passed 373/373" as a displayed value — DERIVATION.md — because nothing scanned the surface).
 *
 * Two mechanical guards:
 *  1. IMPORT-SCAN (zero false positives): a display surface may read numbers off ModelOutput
 *     (via `facade` types / the display helpers) and format them (`lib/format`), but must not
 *     IMPORT an engine ARITHMETIC module — importing one to recompute is a second path.
 *  2. AGGREGATION TRIPWIRE (fail-closed via an allowlist): reconstructing a TOTAL or EXTREME
 *     over a model array (`.reduce` / `Math.max` / `Math.min`) in a display file is the second-
 *     path smell the review flagged (a Σ tranche balances inline instead of a ModelOutput
 *     field). Every such site must be an explicitly-allowlisted PRESENTATIONAL derivation (a
 *     value that is NOT itself a ModelOutput field); a new, un-allowlisted aggregation FAILS,
 *     forcing the author to read a ModelOutput field or justify the derivation in review.
 *
 * NOT a complete proof: a benign RATIO of two named ModelOutput fields (a multiple = A/B) is a
 * legitimate presentational derivation and is NOT policed here — a blanket arithmetic ban would
 * false-positive on correct code. That residual is covered by gate (c)'s label mutation tests
 * (every displayed field is label-asserted) + the conformance diff-review. This guard closes
 * the two mechanical vectors; it does not claim to close all of them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

/** The DISPLAY-SURFACE SET (rebuild/PHASE_G_EXTENSIONS.md). Extend here AND in the doc together. */
const DISPLAY_SURFACES = [
  'components/deal-engine/v2/OutputTabs.tsx',
  'lib/engine2/excelExport.ts',
  'lib/ai2/memo.ts',
  'lib/format/index.ts',
];

/** Engine ARITHMETIC modules — importing one into a display surface is a second calc path. */
const ENGINE_ARITHMETIC_MODULES =
  /from ['"].*\/(kernel\/|operating|tax|debt|sequence|exit|returns|credit|bridge|sourcesUses|openingBalance|scenarios|check)['"]/;

/**
 * Allowlisted PRESENTATIONAL aggregations — each is a value the engine does NOT expose as a
 * ModelOutput field, computed for display only. Keyed by a stable source substring. Adding a
 * row is a reviewer-visible decision: prove the aggregate is not already a ModelOutput field.
 */
const ALLOWED_AGGREGATIONS: { file: string; snippet: string; why: string }[] = [
  {
    file: 'components/deal-engine/v2/OutputTabs.tsx',
    snippet: 'Math.max(0, w.closing_cash + w.distribution_paid - o.assumptions.structure.min_cash)',
    why: '§3-step-7 "cash above floor" display column — presentational, not a ModelOutput field',
  },
  {
    file: 'components/deal-engine/v2/OutputTabs.tsx',
    snippet: 'Math.min(...s.waterfall.map((w) => w.closing_cash))',
    why: '§13 scenario slim block: min closing cash across the scenario years — presentational',
  },
  {
    file: 'components/deal-engine/v2/OutputTabs.tsx',
    snippet: 's.waterfall.reduce((t, w) => t + w.distribution_paid, 0)',
    why: '§13 scenario slim block: total distributions paid in the scenario — presentational',
  },
  {
    file: 'lib/format/index.ts',
    snippet: 'Math.max(0, Math.floor((today.getTime() - endMs) / (30.44 * 86_400_000)))',
    why: 'a DATE formatter (months-elapsed for a staleness/"N months ago" label) — arithmetic on dates, not on any ModelOutput financial value; lib/format is the formatting-primitive layer where presentational math is expected',
  },
];

const AGGREGATION = /\.reduce\(|Math\.(max|min)\(/;

describe('governance gate (b): display surfaces cannot open a second calculation path', () => {
  for (const rel of DISPLAY_SURFACES) {
    const src = readFileSync(join(ROOT, rel), 'utf8');

    it(`${rel}: imports no engine ARITHMETIC module (must read ModelOutput, not recompute)`, () => {
      const offenders = src.split('\n')
        .map((l, i) => [i + 1, l] as const)
        .filter(([, l]) => l.includes('import') && ENGINE_ARITHMETIC_MODULES.test(l));
      expect(offenders, `${rel} imports an engine arithmetic module — read the value off ModelOutput instead:\n${offenders.map(([n, l]) => `  ${n}: ${l.trim()}`).join('\n')}`).toEqual([]);
    });

    it(`${rel}: every array aggregation is an allowlisted presentational derivation (fail-closed)`, () => {
      const allowedForFile = ALLOWED_AGGREGATIONS.filter((a) => a.file === rel).map((a) => a.snippet);
      const hits = src.split('\n')
        .map((l, i) => [i + 1, l.trim()] as const)
        .filter(([, l]) => AGGREGATION.test(l))
        // a hit is OK only if the line contains an allowlisted snippet verbatim
        .filter(([, l]) => !allowedForFile.some((snip) => l.includes(snip)));
      expect(hits, `${rel}: un-allowlisted aggregation over a model value (possible second calc path). Read a ModelOutput field, or add the site to ALLOWED_AGGREGATIONS with a justification:\n${hits.map(([n, l]) => `  ${n}: ${l}`).join('\n')}`).toEqual([]);
    });
  }

  it('the allowlist stays honest: every allowlisted snippet still exists at its file (no dead entries)', () => {
    for (const a of ALLOWED_AGGREGATIONS) {
      const src = readFileSync(join(ROOT, a.file), 'utf8');
      expect(src.includes(a.snippet), `stale allowlist entry — "${a.snippet}" no longer in ${a.file}; remove it`).toBe(true);
    }
  });
});
