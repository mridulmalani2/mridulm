/**
 * GOVERNANCE gate (b) — the committed CI check the tiered template's Tier-C/display rule
 * requires (rebuild/PHASE_G_EXTENSIONS.md; hostile review R2-2, hardened R3-1/R3-2). It
 * replaces "the conformance reviewer greps" with a mechanical, FAIL-CLOSED check over the
 * DISPLAY-SURFACE SET, so a second calculation path for a displayed number cannot slip in
 * silently (the one thing ENGINE_ARCHITECTURE §4 forbids; a hard-coded 99.0 sentinel once
 * "passed 373/373" as a displayed value — DERIVATION.md — because nothing scanned the surface).
 *
 * The scan set is GLOB-DERIVED, not a hand-maintained file list (R3-1). A hand-maintained list
 * was the containment failure TWICE — a denylist that failed open (R1), then a hardcoded 4-file
 * scan under which a live §4 second-path (AssumptionsPanel's inline `max(base,floor)+spread`) sat
 * green (R3). Walking the display roots means every current AND future display file is scanned by
 * construction; the guard cannot lag its own spec.
 *
 * THREE mechanical guards + a doc-binding meta-test:
 *  1. IMPORT-SCAN (fail-closed): a display surface may read numbers off ModelOutput (via `facade`
 *     types / display helpers) and format them (`lib/format`), but importing an engine ARITHMETIC
 *     module is forbidden UNLESS the import is a SANCTIONED single-source primitive — a pure helper
 *     the engine ITSELF uses, imported so the display shares one definition (the CURE for a second
 *     path, not a second path). An INPUT panel has no ModelOutput to read at input time, so it must
 *     single-source its previews through such a primitive; every one is enumerated with its reason.
 *  2. AGGREGATION TRIPWIRE (fail-closed): reconstructing a TOTAL or EXTREME over a model array
 *     (`.reduce` / `Math.max` / `Math.min`) is the second-path smell R2 flagged (a Σ tranche
 *     balances inline instead of a ModelOutput field). Every such site must be an allowlisted
 *     PRESENTATIONAL derivation (a value that is NOT itself a ModelOutput field).
 *  3. SINGLE-SOURCE REGISTRY (fail-closed): derived numbers that must flow through ONE facade
 *     display helper — their inline reconstruction is forbidden in EVERY display surface. The exit
 *     EV/EBITDA multiple was reconstructed inline on THREE surfaces (OutputTabs, excelExport, memo)
 *     before `exitMultipleDisplay`; this stops it drifting back.
 *
 * WHAT THIS DOES NOT MECHANIZE — stated honestly (R3-2). The unpoliced residual is NOT "benign
 * ratios" and is NOT covered by label-mutation tests (those assert a field's LABEL, never that the
 * displayed value equals its source). It is scalar arithmetic on named fields — net debt (par − cash),
 * covenant headroom (EBITDA − threshold), any multiple (A / B), an IRR (Math.pow) — and it is not
 * regex-policed because a blanket operator ban WOULD false-positive on legitimate presentational math
 * (the memo's cap table alone computes several % -of-cap and ×-EBITDA cells from named fields). That
 * class is closed instead by: (i) SINGLE-SOURCING any derived number shown on more than one surface
 * through one facade helper — guard 3 above pins the known ones; (ii) a VALUE-PROVENANCE test per
 * displayed derived number (recompute from named ModelOutput fields, assert equality — e.g.
 * entryMultipleDisplay / exitMultipleDisplay tests in engine2-facade-scenarios); (iii) the conformance
 * diff-review as the final, human backstop. This guard closes the mechanically-closable vectors and
 * says plainly which it does not.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const DOC = 'rebuild/PHASE_G_EXTENSIONS.md';

/**
 * The DISPLAY-SURFACE SET is DERIVED by walking these roots (declared identically in the doc — the
 * meta-test below fails on any drift). Adding a display file anywhere under a root is scanned
 * automatically; there is no list to forget to update.
 */
const DISPLAY_ROOTS: { dir: string; exts: string[] }[] = [
  { dir: 'components/deal-engine', exts: ['.tsx', '.ts'] },
  { dir: 'lib/format', exts: ['.ts'] },
];
const DISPLAY_FILES_EXPLICIT = ['lib/engine2/excelExport.ts', 'lib/ai2/memo.ts'];

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(rel, exts));
    else if (exts.some((x) => e.name.endsWith(x))) out.push(rel);
  }
  return out;
}

const DISPLAY_SURFACES = [
  ...DISPLAY_ROOTS.flatMap((r) => walk(r.dir, r.exts)),
  ...DISPLAY_FILES_EXPLICIT,
].sort();

/** Engine ARITHMETIC modules — importing one into a display surface is a second calc path unless sanctioned. */
const ENGINE_ARITHMETIC_MODULES =
  /from ['"].*\/(kernel\/|operating|tax|debt|sequence|exit|returns|credit|bridge|sourcesUses|openingBalance|scenarios|check)['"]/;

/**
 * SANCTIONED single-source imports — the ONLY engine-arithmetic imports allowed into a display
 * surface. Each is a pure primitive the engine itself uses; importing it makes the display share
 * ONE definition (single-sourcing), which is the cure for a second path. Keyed by (file, import
 * substring). Adding a row is a reviewer-visible decision: prove the imported symbol is a pure,
 * engine-shared derivation and that the surface has no ModelOutput field to read instead.
 */
const SANCTIONED_ENGINE_IMPORTS: { file: string; snippet: string; why: string }[] = [
  {
    file: 'components/deal-engine/v2/AssumptionsPanel.tsx',
    snippet: "from '../../../lib/engine2/sourcesUses'",
    why: 'INPUT panel single-sources the entry-leverage PREVIEW (entryGrossLeverageFromAssumptions / rescaleTermTranchesToLeverage) through the SAME pure helper the §13 leverage axis uses. No ModelOutput exists at input time; re-deriving leverage inline is what finding F7 caught.',
  },
  {
    file: 'components/deal-engine/v2/AssumptionsPanel.tsx',
    snippet: "from '../../../lib/engine2/kernel/rates'",
    why: 'INPUT panel single-sources the §4 all-in-rate PREVIEW (allInRate) — the SAME primitive debt.ts charges interest with. Re-implementing max(base,floor)+spread inline (the prior code, R3-1) WAS the second path this guard exists to stop.',
  },
];

/**
 * Allowlisted PRESENTATIONAL aggregations — each a value the engine does NOT expose as a
 * ModelOutput field, computed for display only. Keyed by a stable source substring.
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

/**
 * Single-source REGISTRY — derived numbers that MUST flow through one facade display helper. Their
 * inline reconstruction is forbidden in EVERY display surface (the facade, which is NOT a display
 * surface, is where the one definition lives). Fail-closed for the listed numbers.
 */
const FORBIDDEN_INLINE: { pattern: RegExp; helper: string; number: string }[] = [
  {
    pattern: /exit_ev\s*\/\s*[\w.]*exit_ebitda_basis_value/,
    helper: 'exitMultipleDisplay',
    number: 'exit EV/EBITDA multiple',
  },
];

const AGGREGATION = /\.reduce\(|Math\.(max|min)\(/;

describe('governance gate (b): display surfaces cannot open a second calculation path', () => {
  it('the scan set is glob-derived and binds to the doc (drift is red; fail-closed by construction)', () => {
    const doc = readFileSync(join(ROOT, DOC), 'utf8');
    // the doc must declare the SAME roots the walk uses — divergence between guard and doc is itself a failure
    for (const r of DISPLAY_ROOTS) expect(doc, `${DOC} must declare display root "${r.dir}"`).toContain(r.dir);
    for (const f of DISPLAY_FILES_EXPLICIT) expect(doc, `${DOC} must declare display file "${f}"`).toContain(f);
    // and the walk actually reached the known surfaces (a floor: a broken/empty walk is red, not silently green)
    for (const known of [
      'components/deal-engine/v2/OutputTabs.tsx',
      'components/deal-engine/v2/AssumptionsPanel.tsx',
      'components/deal-engine/v2/HistoryTable.tsx',
      'components/deal-engine/v2/BasisBadge.tsx',
      'components/deal-engine/MemoModal.tsx',
      'lib/format/index.ts',
      'lib/engine2/excelExport.ts',
      'lib/ai2/memo.ts',
    ]) {
      expect(DISPLAY_SURFACES, `${known} must be in the globbed scan set`).toContain(known);
    }
  });

  for (const rel of DISPLAY_SURFACES) {
    const src = readFileSync(join(ROOT, rel), 'utf8');

    it(`${rel}: engine-arithmetic imports are sanctioned single-source primitives only (fail-closed)`, () => {
      const sanctioned = SANCTIONED_ENGINE_IMPORTS.filter((s) => s.file === rel).map((s) => s.snippet);
      const offenders = src.split('\n')
        .map((l, i) => [i + 1, l] as const)
        .filter(([, l]) => l.includes('import') && ENGINE_ARITHMETIC_MODULES.test(l))
        .filter(([, l]) => !sanctioned.some((snip) => l.includes(snip)));
      expect(offenders, `${rel} imports an engine arithmetic module that is not a sanctioned single-source primitive — read the value off ModelOutput, or add it to SANCTIONED_ENGINE_IMPORTS with a justification:\n${offenders.map(([n, l]) => `  ${n}: ${l.trim()}`).join('\n')}`).toEqual([]);
    });

    it(`${rel}: every array aggregation is an allowlisted presentational derivation (fail-closed)`, () => {
      const allowedForFile = ALLOWED_AGGREGATIONS.filter((a) => a.file === rel).map((a) => a.snippet);
      const hits = src.split('\n')
        .map((l, i) => [i + 1, l.trim()] as const)
        .filter(([, l]) => AGGREGATION.test(l))
        .filter(([, l]) => !allowedForFile.some((snip) => l.includes(snip)));
      expect(hits, `${rel}: un-allowlisted aggregation over a model value (possible second calc path). Read a ModelOutput field, or add the site to ALLOWED_AGGREGATIONS with a justification:\n${hits.map(([n, l]) => `  ${n}: ${l}`).join('\n')}`).toEqual([]);
    });

    it(`${rel}: no forbidden inline reconstruction of a single-sourced derived number`, () => {
      const hits = src.split('\n')
        .map((l, i) => [i + 1, l.trim()] as const)
        .flatMap(([n, l]) => FORBIDDEN_INLINE.filter((f) => f.pattern.test(l)).map((f) => `  ${n}: ${l}  →  use ${f.helper}() (the ${f.number} is single-sourced there)`));
      expect(hits, `${rel}: a derived number that must go through its facade helper is reconstructed inline:\n${hits.join('\n')}`).toEqual([]);
    });
  }

  it('the aggregation allowlist stays honest: every allowlisted snippet still exists at its file (no dead entries)', () => {
    for (const a of ALLOWED_AGGREGATIONS) {
      const src = readFileSync(join(ROOT, a.file), 'utf8');
      expect(src.includes(a.snippet), `stale allowlist entry — "${a.snippet}" no longer in ${a.file}; remove it`).toBe(true);
    }
  });

  it('the sanctioned-import allowlist stays honest: every sanctioned import still exists at its file (no dead entries)', () => {
    for (const s of SANCTIONED_ENGINE_IMPORTS) {
      const src = readFileSync(join(ROOT, s.file), 'utf8');
      expect(src.includes(s.snippet), `stale sanctioned-import entry — "${s.snippet}" no longer in ${s.file}; remove it`).toBe(true);
    }
  });
});
