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

Per golden, commit THREE artifacts under `tests/goldens/G<n>/`:
1. `G<n>.xlsx` — the workbook, formulas visible, **labeled intermediate columns** (per-tranche
   interest, sweep pool, ECF applied per tranche, tax lines: ATI, deductible interest, NOL
   used, cash tax) — these intermediates are what Phase C's per-module gates test against.
2. `expected.json` — extracted values (script `scripts/extract-golden.ts` reads the xlsx and
   emits it; committed output).
3. The **agreement check**: a vitest test asserting `expected.json` matches a fresh extraction
   of the committed xlsx (guards against silent divergence between workbook and fixture).

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
