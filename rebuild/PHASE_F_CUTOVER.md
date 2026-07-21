# PHASE F — Differential, flag cutover, old-engine deletion

**Goal:** prove v2 ⊃ v1 correctness in a bounded, categorized way, ship engine2, delete
`lib/engine`. Prerequisite: Phase E gate.

## F1 — Differential report (bounded by construction)

The naive version ("run both engines, explain every diff in writing") cannot terminate —
nearly every number differs by design. Instead:

1. **Input adapter** `scripts/adapt-v1-inputs.ts`: v1 `DealAssumptions` → old `ModelState`.
   Comparison set = the clean-room regimes **expressible in the v1 schema** (drop the
   partial-exit / add-on / distribution / PIK-election regimes — they're v2 features; list
   the exclusions in the report header).
2. **Compare only definition-stable quantities**: per-tranche debt schedules, balance-sheet
   close, cash taxes, sponsor IRR/MOIC where fee membership is identical under both specs.
   Redefined quantities (return-series variants, scenario outputs, NWC under the new
   operating definition) are *not* diffed — they're listed as redefinitions with SPEC refs.
3. **Categorize against `rebuild/DIFF_LEDGER.md`**: every diff matches a ledger row (known
   old bug L-x, or intentional convention change C-x) or it is an **investigation item**.
   The report is a matrix: regime × quantity → {match, L-x, C-x, INVESTIGATE}.
4. **Arbiter: spec + goldens beat both engines.** An investigation ends in a golden-derived
   verdict, then either an engine2 fix or a new ledger row.

Gate F1: zero INVESTIGATE cells open.

## F2 — Flag cutover
- Ship one release with **both** engines behind `ENGINE=2` flag, default engine2. Rollback =
  flip the flag. The Phase E walkthrough re-runs on production with the flag on.
- After one clean week: delete `lib/engine/**`, `lib/dealEngineTypes.ts`, the old exporter,
  old engine tests (goldens/invariants replace them); regenerate the regression baseline from
  engine2 (this baseline is now derived from golden-adjudicated numbers, not history).
- Old localStorage saves: banner per [OWNER DECISION #2].

## F3 — Documentation turnover
- `ENGINE_ARCHITECTURE.md` v2: single engine = `lib/engine2` (consider renaming to
  `lib/engine` at this point — one `git mv`, after deletion, so history stays clean);
  dual-engine regime section replaced by its sunset record.
- `FINANCIAL_DEFINITIONS.md`: retired — SPEC.md is the registry now (add a redirect stub).
- `rebuild/`: mark phases complete; DIFF_LEDGER frozen as the historical record.
- Update CLAUDE.md/memory pointers to SPEC.md as the read-before-touching-finance doc.

## Gate (phase)
F1 matrix clean · production runs engine2 for a week with no flag flips · old engine deleted,
CI green · docs turned over · Phase G backlog groomed with owner priorities.
