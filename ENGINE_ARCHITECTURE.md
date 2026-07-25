# Engine Architecture & Source of Truth

**Status:** Governance reference. Read before changing any financial calculation.

---

## 0. SINGLE ENGINE: `lib/engine2` (dual-engine regime SUNSET 2026-07-24)

**The engine is `lib/engine2/`, governed by `lib/engine2/SPEC.md` (versioned, changelog-
governed) and adjudicated by `tests/goldens/` (GOLDENS ARE GOSPEL).** Read the SPEC before
touching any financial calculation; a spec gap becomes an amendment PR (changelog entry +
golden re-derivation where numbers move + independent sign-off) BEFORE code.

**Sunset record.** The 2026-07 rebuild ran a temporary dual-engine regime (old `lib/engine`
frozen behind CI while engine2 was built spec-first — the full program lives in `rebuild/`).
It ended in two steps:
- **Cutover (2026-07-24, PR #98):** engine2 became the live default after the Phase E gate
  ran against live EDGAR (Apple / Crocs / SAP / Ericsson) and the Phase F1 bounded
  differential came back CLEAN — every old-vs-new divergence categorized against
  `rebuild/DIFF_LEDGER.md` (now frozen as the historical record; the differential report is
  `rebuild/F1_DIFFERENTIAL.md`, FINAL). The differential itself found a previously unknown
  old-engine defect (L-16: surplus cash silently dropped from exit proceeds).
- **Deletion (2026-07-24, owner-accelerated; the one-clean-week soak was waived by owner
  decision):** `lib/engine/**`, `lib/dealEngineTypes.ts`, the old exporter, screens, store
  surface and test suite were deleted. The last pre-deletion tree is preserved at tag
  **`pre-deletion-lib-engine`**; rollback = revert the deletion PR. Previous-engine .json
  saves no longer open (the UI says so and points to re-import); the AI provider plumbing
  the old gateway hosted moved to `lib/ai2/gateway/`.

Guards that remain: `tests/engine2-boundary.test.ts` (the deleted paths stay deleted;
nothing reimports them) and the golden gate (runModel reproduces `tests/goldens/` exactly —
this is the regression baseline, derived from adjudicated numbers, not from history).

The sections below describe the CURRENT engine.

---

## 1. Source of truth

One engine, one spec, one arbiter:
- **Arithmetic**: `lib/engine2/` — kernel (`kernel/{rates,amort,irr,waterfall,taxstate}.ts`)
  + modules (`operating, sourcesUses, openingBalance, tax, debt, sequence, exit, returns,
  credit, bridge, check, scenarios, suggest`) behind the ONE entry point
  `runModel(facts, assumptions)` in `facade.ts`. No second calculation path exists for any
  displayed number; `check.ts` coherence runs post-hoc over the SAME ModelOutput.
- **Conventions**: `lib/engine2/SPEC.md` — versioned with a changelog; every formula and
  every rejected alternative is written down. Amendments: changelog entry + golden
  re-derivation where numbers move + independent sign-off, BEFORE code.
- **Adjudication**: `tests/goldens/` + `tests/goldens/DERIVATION.md` (reference derivation
  `scripts/goldens/spec_calc.py`). Engine modules are WRONG wherever they disagree with the
  goldens; disputes reopen only via spec amendment + re-derivation. This is also the
  regression baseline (golden-adjudicated numbers, not history).

## 2. Data & display boundaries

- **Extraction** (`lib/edgar/`): mappers (`mapXbrl`, `mapCompanyFactsIfrs`, `mapIfrs`) emit
  `RawHistoricals` — facts with provenance; a fact the filing lacks is a GAP, never a
  default. `lib/engine2/factsAdapter.ts` adapts to `DealFacts`; REQUIRED gaps gate Build
  (`missing`), degradations surface as notes, defaulted inputs carry template bases.
- **Stores**: `store/dealEngine.ts` = the slim IMPORT store (every route — EDGAR / ESEF /
  manual — feeds engine2 through ONE feeder; D5 trading anchor resolves best-effort behind
  the honest-anchor gate). `store/engine2Model.ts` = the model lifecycle
  (import → suggest → badged edits → ATOMIC build → ModelOutput).
- **Display** (`lib/format/`): THE formatting boundary — §15 rules, null ⇒ N/A (never
  sentinels), exactly-once percent↔decimal, ISO-code money for non-modelled currencies.
  UI (`components/deal-engine/v2/`) renders ModelOutput through it; nothing in the UI
  computes engine arithmetic.
- **AI** (`lib/ai2/`): suggest/redline/memo/goal-seek over the same contracts; provider
  plumbing in `lib/ai2/gateway/`; keys stay in the browser.
- **Server** (`api/edgar.ts`): the ONE server surface — allowlisted EDGAR/ESEF/quote proxy.

## 3. Test gates (all must pass on every PR)

`npx vitest run` (golden gate + invariants §14 + module fixtures + extraction fixtures +
SSR smokes + the single-engine guard in `tests/engine2-boundary.test.ts`) and
`npm run build`. Financial-logic changes additionally require adversarial agent review
before merge. Post-deploy: `node scripts/smoke-production.mjs`.

## 4. Rules for changing a calculation

1. Read `lib/engine2/SPEC.md` for the section that owns the number.
2. If the spec already decides it: fix code to match the spec; goldens must stay green.
3. If the spec is silent or wrong: SPEC AMENDMENT FIRST (changelog + golden re-derivation
   where numbers move + independent sign-off), then code, test-first.
4. Never introduce a second path to an existing number; never patch display formatting
   outside `lib/format`; never let a placeholder reach a displayed value.
