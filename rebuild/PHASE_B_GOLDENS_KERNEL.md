# PHASE B — Golden deals + finance kernel

**Goal:** create the independent ground truth (golden workbooks) and the pure-math kernel.
The goldens are the credibility instrument every past review lacked: disputes end at the
workbook, not in review threads.

**Prerequisite:** SPEC v1.0 (Phase A). The golden input tables live in the spec appendix.

## B1 — Golden deal workbooks

Four regimes, all expressible in the v1 schema (SPEC §2–§13). Because engine2 v1 is strictly
sequential (no solver, beginning-balance interest — SPEC §4/§5), a hand spreadsheet reproduces
the engine **exactly**; there is no tolerance dance.

| ID | Regime | What it proves |
|---|---|---|
| G1 | All-equity, no debt, flat ops | Operating build, tax without interest, exit, closed-form IRR (invariant §14.14) |
| G2 | TLB (S+400, 1% amort, 75% sweep) + revolver, growing ops | Waterfall order, ECF pool mechanics, revolver draw/repay, credit metrics |
| G3 | Senior TLB + fixed-rate PIK note | PIK compounding, payoff at par+accrued, OID amortization & exit write-off, §163(j) binding |
| G4 | Loss-making Y1–2, NOL opening balance, §382 limit, minimum tax | Full tax state machine incl. carryforwards |

**Process amendment (2026-07-05, standing authority; supersedes the xlsx requirement):**
the "hand workbook" is realized as a SPEC-literal derivation script in a DIFFERENT language
from the engine (`scripts/goldens/spec_calc.py` — Python, no TS imports), because a binary
xlsx is undiffable/unreviewable in PRs (architecture-review finding) and no formula
evaluator exists in CI. Independence is preserved by (a) the different-language rule,
(b) the committed SPEC §17 check values derived by hand during the A3 review, and (c) the
adjudication pass below (separate agents hand-re-derive selected lines from SPEC).

Per golden, commit THESE artifacts under `tests/goldens/G<n>/`:
1. `expected.json` — full per-year intermediates (per-tranche interest, sweep pool & per-
   tranche application, tax lines: ATI, deductible, NOL pools, cash tax, BS rows) — what
   Phase C's per-module gates test against.
2. `schedule.csv` — the same numbers as a human-auditable table (the "workbook face").
3. `DERIVATION.md` — each line's SPEC section + the adjudication sign-off record.
The **agreement check** (vitest) asserts expected.json is byte-identical to a fresh run of
the derivation script (guards against silent fixture edits).

**Adjudication rule (binding):** when engine and workbook disagree, the disputed line is
re-derived a third time directly from SPEC formulas by a different person/agent than the
workbook's author. The workbook is corrected or the engine is — the spec is the arbiter. A
golden becomes gospel only after this independent pass signs it off (record sign-off in
`tests/goldens/G<n>/DERIVATION.md`, which also documents each column's SPEC section).
**Budget real time for workbook debugging — hand models have their own cell errors.**

## B2 — Kernel (`lib/engine2/kernel/`)

Pure functions, zero imports from anywhere except each other:
- `irr.ts` — Newton + bisection fallback; mid-year shift; the closed-form check for §14.14.
- `rates.ts` — all-in rate (`max(base, floor) + spread`), fixed, PIK accrual.
- `amort.ts` — schedule generation (bullet, straight-line %, custom), cap-at-outstanding.
- `waterfall.ts` — the §3 primitive: one running cash variable, ordered steps, ECF pool,
  sweep-by-priority-tier with pro-rata within tier, revolver draw/repay. Deal-agnostic.
- `taxstate.ts` — the §6 state machine ({NOL, 163j carryforward} in/out per year).

Property tests per kernel module (fast-check or hand grids), each invariant tagged with its
SPEC §14 number and **domain** (e.g. monotonicity tests only generate frictionless configs).

## Files
Create: `lib/engine2/kernel/*.ts`, `tests/engine2-kernel.test.ts`, `tests/goldens/**`,
`scripts/extract-golden.ts`. Modify: nothing outside engine2/tests/scripts (freeze is active).

## Gate
- Four goldens signed off per the adjudication rule (DERIVATION.md complete).
- Kernel property tests green; `waterfall.ts` reproduces G2's sweep-pool and per-tranche
  application columns from fixture inputs (kernel-level check — full engine comes in C).
- Agreement checks green in CI.
