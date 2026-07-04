# PHASE A — SPEC v1.0 + dual-engine regime (timeboxed: 5 working days)

**Goal:** turn `rebuild/02_SPEC_SKELETON.md` into approved `engine2/SPEC.md` v1.0, and make
the temporary two-engine period safe. **No engine2 arithmetic is written in this phase.**

**Timebox & authority:** 5 working days including research. Sign-off = the owner, after ONE
adversarial review round. (Review-paralysis is this project's documented failure mode; the
spec is versioned afterward, so perfection now is not required — explicitness is.)

## Read first
- `rebuild/00_MASTER_PLAN.md`, `rebuild/02_SPEC_SKELETON.md` (the draft to complete)
- `FINANCIAL_DEFINITIONS.md` (the closest existing artifact to a spec — harvest, don't lose)
- `ENGINE_ARCHITECTURE.md` (governance to amend)
- `rebuild/DIFF_LEDGER.md` (seeded; this phase extends it)

## Work items

### A1 — Research pass
Run the five prompts in `rebuild/01_DEEP_RESEARCH_PROMPTS.md` (Claude deep research). Save
results to `rebuild/research/DR-<n>-results.md`. Resolve every `[RESEARCH-CONFIRM]` marker in
the spec with finding + citation; log any change to a [DECIDED] entry in the spec changelog.
Extract DR-4 into `engine2/suggestions/conventions.json` (value, citation, as-of date) and
define the 2–3 capital-structure TEMPLATES from DR-1/DR-4.

### A2 — Complete the spec
- Resolve the three [OWNER] items (master plan §7: Phase 0 FCF exhibit, saved-model policy,
  trading-multiple anchor) and record them.
- Write the input schema as types-in-prose: every `DealFacts` field with its extraction
  contract (per PHASE_D), every `DealAssumptions` field with class, badge basis, bounds, and
  progressive-disclosure tier; every `ModelOutput` field with its defining SPEC section.
- Write the golden-deal definitions (G1–G4 in PHASE_B) as input tables in the spec appendix,
  so the workbooks and the engine build from the same stated inputs.

### A3 — Adversarial spec review (one round)
Multi-lens review (finance / credit / tax / architecture) of the completed spec. Every
finding is either (a) accepted → spec edit, or (b) rejected with a written reason in the
changelog. Then owner signs v1.0. No second round — later discoveries use the amendment path.

### A4 — Enact the dual-engine regime (this is what makes the parallel period safe)
1. **Amend `ENGINE_ARCHITECTURE.md` NOW** (not at Phase F): document the temporary two-engine
   period, its rules, and its sunset (Phase F gate).
2. **Freeze `lib/engine/`**: CI job fails any PR touching `lib/engine/**` or
   `lib/dealEngineTypes.ts` unless the PR carries a `FREEZE-EXCEPTION` label; every exception
   requires a row in `rebuild/DIFF_LEDGER.md`. Old engine receives render-breaking hotfixes
   only; every prod bug found during the window is fixed in engine2 + ledgered instead.
3. **Import-boundary lint** (eslint `no-restricted-imports` or dependency-cruiser):
   `lib/engine2/**` may not import from `lib/engine/**` or `lib/dealEngineTypes.ts`;
   no module outside `lib/engine2` may import from both engines.
4. Create `lib/engine2/` containing only: `SPEC.md`, `types.ts` (`DealFacts`,
   `DealAssumptions`, `ModelOutput` — types only, no arithmetic), `suggestions/conventions.json`.
   The types are needed early so PHASE_D can run in parallel with B–C.

## Deliverables
`engine2/SPEC.md` v1.0 (+ changelog + citations appendix) · `engine2/types.ts` ·
`engine2/suggestions/conventions.json` · amended `ENGINE_ARCHITECTURE.md` · CI freeze job ·
import lint · extended `rebuild/DIFF_LEDGER.md` (every intentional convention change vs the
old engine gets a row NOW, while the differences are fresh — seed list is in the ledger).

## Gate
Spec v1.0 signed by owner; all [RESEARCH-CONFIRM]/[OWNER] markers resolved; CI freeze + lint
demonstrably firing (one dummy PR each); ledger rows for every convention change identified
in the spec review; golden-deal input tables in the spec appendix.
