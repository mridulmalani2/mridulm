# Adversarial review — 2026-11-10 (engine v2.3.0 → v2.3.1)

Owner's brief: prove the deterministic engine is financially accurate on paths the reference
model does not have, and that nothing is a placeholder, shortcut or hard-coded value; fix only
proven defects, completely, with tests that fail before and pass after. Tools:
`scripts/adversarial/` (README there).

## What was run

| # | Check | Scale | Result |
|---|---|---|---|
| 1 | Professor's workbook ("LBO and FTE — worked example"), all 12 inputs randomized, every formula untouched, LibreOffice-recalculated, vs the engine | 40 deals, ~5,770 values | 36 exact (1e-9); 3 differ ONLY by the §9.1 limited-liability floor (the reference shows negative exit equity); 2 reference IRR cells fail to converge (`#N/A`) where the engine's rate zeroes the reference's own flows to ~1e-12; 1 deal cannot service its debt (→ F1) |
| 2 | An INDEPENDENT challenger workbook written from first principles (no engine code consulted): drivers, fees + OID amortization, minimum cash, two tranches with amortization and a priority sweep, floating rates with floors, revolver + commitment fee, losses carried forward, early-retirement write-offs, exit fees; then a PIK note, §163(j), acquired NOLs + §382, minimum tax, monitoring fee + termination, distributions under the RP trap, a two-tier promote, rollover; then the leverage sweep grid, PIK elections, days-based NWC, front/back-loaded margins, a warrant | 315 deals (random, stress, cap-targeted), ~52,000 values | **0 mismatches**; every targeted path measured as exercised (e.g. revolver draws 23+16, NOLs banked and used, §382 binding 47, promote tier 2 34 and capped 19, both grid tiers and the floor, mixed PIK years 48) |
| 3 | Every-input-matters: three maximal deals, every numeric input ×1.07, every choice flipped | 297 single-input runs | every input moves an output, or is PROVED inert (binding floors, an undrawn revolver, a sweep the senior absorbs, a target margin equal to today's, a non-binding cap, a grid replacing the flat %, case-driven lines replacing drivers, carry% under an incomplete 50% catch-up — proved: GP holds 11.9% < 20%, and at 100% catch-up the same change moves carry 64.9 → 69.4) |
| 4 | The exported workbook edited input by input IN EXCEL, recalculated by LibreOffice, vs the engine on the changed deal | 245 workbooks, 177,485 cells | **0 mismatches**; and 0 inputs that move the engine without an Inputs-sheet cell (nothing baked into a formula) |
| 5 | Every numeric literal in the engine source (AST, comments excluded) | 53 | all statute (80% NOL, 100% pre-2018, AHYDO 5y, 365-day basis), tolerance ($0.005m, float epsilons), warning-only thresholds, display ×100, or solver brackets that fail SAFE (N/A with a reason) |

## Findings and dispositions

**F1 — FIXED (v2.3.1).** A run carrying a BLOCK flag (a cash-floor breach with the revolver
exhausted, or a non-positive sponsor plug) is "not economically meaningful" by the engine's own
message, yet four surfaces presented its returns as answers: the Summary tiles and the Build line
(the warning rendered BELOW all tabs), the IC memo, the §13 sensitivity grid (silently, per
cell) and goal-seek (which would answer with a breaching structure). Root cause: no rule tied the
block severity to any surface. Fix: ONE predicate (`headlineNotMeaningful`, lib/engine2/display.ts)
used by all four — "N/M" headlines with the warning moved above the tabs; the memo states the run is
not meaningful; a block-flagged grid cell is null (the existing strip-plug N/A semantics); goal-seek
treats such structures as unreachable. Detail tabs keep every number for diagnosis; the workbook
Summary gains live cash-shortfall and uncovered-exit rows. Tests: tests/engine2-headline-nm.test.ts,
engine2-workbench-smoke (F1 block), engine2-workbook-parity (Summary integrity) — each shown to FAIL
on the pre-fix code; 4 mutants (predicate never/always, grid and goal-seek bypass) all red. No
engine arithmetic changed; every golden byte-identical.

**F2 — NOT FIXED, by decision.** `nwc.method = 'days'` without DSO/DIO/DPO crashes on NaN instead
of a named rejection. Unreachable: the type requires the three fields and every `runModel` caller
(Build, scenarios, grid, goal-seek, the workbook's sensitivity) starts from gate-validated inputs.
Changing it would be a fix for a state the product cannot produce.

**Harness defects found and corrected during the review (not engine):** `compare.py` printed only
80 mismatches (a truncated list read as "two left"); the challenger's own IRR used a 10% guess and
failed on deep losses; reference IRR `#N/A` cells were spreadsheet non-convergence.

## Follow-up decided by the owner — write-off tax character and timing (v2.4.0)

Raised here as a disclosed simplification (write-offs and call premiums deducted UNCAPPED, a
refinancing's deduction a year late). Owner direction: research it; use the standard if there is
one, else make it a setting. There is a standard, so it is applied as a rule (SPEC §7.1): OID and
call premium are repurchase premium — §163(j) interest, capped (Treas. Reg. §1.163-7(c)); debt-
issuance costs are not interest — uncapped; the exit and a scheduled refinancing deduct in their
own year. Only the sweep-driven retirement keeps a one-year lag (its year would otherwise be
circular), now split by the same character. Evidence: the reference re-derived first (7 goldens
move, sponsor IRR within ±0.74bp, measured in DERIVATION.md); the challenger rebuilt to the
standard from first principles (`make_v5_from_v4.py`) — **0 mismatches on 26,190 values across
135 deals**, while the old-rule challenger now diverges on every one of them; the workbook at
parity including two new deals on the moved paths; 9 mutants of the change, every one red.

## Not independently challenged here

The sweet-equity strip, the fund/LP overlay, refinancing and partial exits were not rebuilt in
the challenger; they rest on their adjudicated goldens (G9-SWEET, G7-FUND, G6-REFI, G11-SELL —
each derived by the separate `spec_calc.py` reference and signed by two blind passes) and on
phases 3–4 of this review (their every input moves the engine and the exported workbook exactly).
