# PHASE C — Core engine (module per PR, two-tier gates)

**Goal:** implement `runModel(facts, assumptions): ModelOutput` to SPEC v1.x.

**Gate design (two tiers — this ordering makes each PR testable):**
- **Per-module PRs** are gated on unit tests against SPEC formulas using **golden intermediate
  columns as fixtures** — upstream values are *injected from the goldens*, so a module is
  verifiable before the whole pipeline exists (e.g. `debt.ts` is tested against G2/G3's
  interest/amort/sweep columns with the tax line injected as fixed golden values).
- **One end-to-end integration gate** after the last module: all four goldens reproduced
  within SPEC §15 tolerances (flows ±$0.005m, IRR ±0.1bp), full invariant suite green.

## Build order (each = one PR: module + tests + spec-section cross-references in comments)

1. `operating.ts` — SPEC §7. Fixtures: G1 operating columns.
2. `sourcesUses.ts` + `openingBalance.ts` — SPEC §2, §8 (incl. goodwill plug, cash-to-BS).
   Fixtures: all four goldens' t=0 columns.
3. `tax.ts` — SPEC §6 wrapping `kernel/taxstate`. Fixtures: G4 tax block, G3 §163(j) block
   (interest injected).
4. `debt.ts` — SPEC §3–§5 wrapping `kernel/waterfall`; strict year loop, no solver.
   Fixtures: G2/G3 debt blocks (FCF_pre_debt injected).
5. `sequence.ts` + `facade.ts` — wire 1–4 into the §5 evaluation order; `check.ts` coherence
   flags (post-run, same output object). **First end-to-end run happens here.**
6. `exit.ts` + `returns.ts` — SPEC §9–§10 (three streams, fee-membership table implemented
   as data, MIP cap). Fixtures: golden return blocks.
7. `credit.ts` — SPEC §11 (N/A semantics — no sentinels anywhere in ModelOutput).
8. `bridge.ts` — SPEC §12; exact-reconciliation invariant test.
9. `scenarios.ts` — SPEC §13: delta-set application with **frozen entry structure**,
   sensitivity grids as full re-runs; §14.7/§14.8 invariants (downside ⇒ IRR ≤ base).

→ **Integration gate** (all goldens end-to-end + invariant suite §14.1–14).

## Rules
- No imports from `lib/engine/**` or `lib/dealEngineTypes.ts` (lint enforces).
- Any spec gap discovered (they will exist: negative pool edge, revolver exhausted +
  floor unreachable, §163(j)+NOL in loss years, OID write-off on partial retirement) →
  **spec amendment PR first** (changelog + golden update if numbers move), then code. Never
  resolve a gap in code alone.
- Every module's public function documents its SPEC section in the doc comment.
- Adversarial review per PR checks **code-vs-spec conformance only**.

## Gate (phase)
Integration gate green · invariant suite green (incl. coherent-suggestions test §14.13 once
suggestions exist — else deferred to D) · adversarial conformance review of `facade.ts`
pipeline · zero spec deviations open.
