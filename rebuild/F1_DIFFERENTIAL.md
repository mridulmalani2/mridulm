# Phase F1 — Bounded differential report (old `lib/engine` vs `lib/engine2`)

Generated 2026-07-24 by `scripts/f1/runF1.ts` over the SPEC §17 golden regimes
(G1–G5, `tests/fixtures/engine2-golden-deals.ts`) — the clean-room set adjudicated by
`tests/goldens/` (goldens are the arbiter; engine2 reproduces them byte-for-byte in CI).

**Exclusions (§F1.1):** old-engine features with no v2 counterpart are never exercised —
add-on acquisitions, partial exits, interim distributions, PIK toggles/elections,
refinancing events, monitoring fees, fund-level economics, sweet equity. Redefined
quantities (return-series variants, scenario outputs, operating-NWC facts) are not
diffed — they are redefinitions with SPEC refs (C-6/C-7/C-11/C-12/C-16).

**Verdict legend:** MATCH = agrees within $0.02m · EXPLAINED = delta equals the
quantified ledger-row prediction exactly · ATTRIBUTED = divergent BY DESIGN, covered by
the cited rows, numbers printed · INVESTIGATE = unexplained (gate-failing).

## G1

| Quantity | Verdict | Ledger rows | Detail |
|---|---|---|---|
| entry EV | MATCH | — | old 200.00 vs new 200.00 |
| debt at par | MATCH | — | old 0.00 vs new 0.00 |
| sponsor equity plug | EXPLAINED | C-9 | Δ(new−old) = 5.000; expected components: min_cash 5 (C-9), fee-base 0.000 (C-21) |
| cash taxes | MATCH | — | identical (5.50, 5.50, 5.50, 5.50, 5.50) |
| balance sheet close (new) | MATCH | — | worst /check/ = 0.00e+0 |
| sponsor IRR/MOIC | EXPLAINED | C-9, L-16 | Δout 5.000 = min_cash 5 (C-9); Δin 87.500 = min_cash + L-16 dropped cash 82.50; IRR -0.70% → 6.36% (705.8bp) |

## G2

| Quantity | Verdict | Ledger rows | Detail |
|---|---|---|---|
| entry EV | MATCH | — | old 990.00 vs new 990.00 |
| debt at par | MATCH | — | old 440.00 vs new 440.00 |
| sponsor equity plug | EXPLAINED | C-9, C-21 | Δ(new−old) = 10.825; expected components: min_cash 10 (C-9), fee-base 0.825 (C-21) |
| TLB: mandatory amort | MATCH | — | amort on face agrees |
| TLB: cash interest | EXPLAINED | C-1, L-8, C-4 | both engines self-consistent; Σ/Δinterest/ = 2.900 (avg-balance vs beginning-balance on C-4-divergent paths) |
| TLB: sweep + ending balance | ATTRIBUTED | C-4, L-6 | Σsweep old 281.78 vs new 267.12; Y5 end old 136.22 vs new 150.88 |
| Revolver: commitment fee (undrawn years) | MATCH | — | undrawn-year fees agree |
| cash taxes | ATTRIBUTED | C-1, C-4, C-10, C-19 | Σ old 101.24 vs new 99.96 — interest base + ordering conventions |
| balance sheet close (new) | MATCH | — | worst /check/ = 1.14e-13 |
| sponsor IRR/MOIC | ATTRIBUTED | C-1, C-4, C-9, C-10, C-21, C-2 | old 13.44% / 1.879x vs new 13.19% / 1.858x — composite of the levered convention set |

## G3

| Quantity | Verdict | Ledger rows | Detail |
|---|---|---|---|
| entry EV | MATCH | — | old 765.00 vs new 765.00 |
| debt at par | MATCH | — | old 405.00 vs new 405.00 |
| sponsor equity plug | EXPLAINED | C-9 | Δ(new−old) = 8.000; expected components: min_cash 8 (C-9), fee-base 0.000 (C-21) |
| Senior: mandatory amort | MATCH | — | amort on face agrees |
| Senior: cash interest | EXPLAINED | C-1, L-8, C-4 | both engines self-consistent; Σ/Δinterest/ = 10.958 (avg-balance vs beginning-balance on C-4-divergent paths) |
| Senior: sweep + ending balance | ATTRIBUTED | C-4, L-6 | Σsweep old 183.44 vs new 176.65; Y5 end old 19.06 vs new 25.85 |
| PIK Note: PIK schedule | MATCH | — | accretion path identical |
| cash taxes | ATTRIBUTED | C-1, C-4, C-10, C-19 | Σ old 72.07 vs new 70.29 — interest base + ordering conventions |
| balance sheet close (new) | MATCH | — | worst /check/ = 5.68e-14 |
| sponsor IRR/MOIC | ATTRIBUTED | C-1, C-4, C-9, C-10, C-21, C-13, C-2 | old 12.29% / 1.785x vs new 11.85% / 1.751x — composite of the levered convention set |

## G4

| Quantity | Verdict | Ledger rows | Detail |
|---|---|---|---|
| entry EV | MATCH | — | old 84.00 vs new 84.00 |
| debt at par | MATCH | — | old 42.00 vs new 42.00 |
| sponsor equity plug | EXPLAINED | C-9 | Δ(new−old) = 3.000; expected components: min_cash 3 (C-9), fee-base 0.000 (C-21) |
| Unitranche: mandatory amort | MATCH | — | amort on face agrees |
| Unitranche: cash interest | EXPLAINED | C-1, L-8, C-4 | both engines self-consistent; Σ/Δinterest/ = 1.080 (avg-balance vs beginning-balance on C-4-divergent paths) |
| Unitranche: sweep + ending balance | ATTRIBUTED | C-4, L-6 | Σsweep old 35.32 vs new 39.90; Y5 end old 4.58 vs new 0.00 |
| cash taxes | ATTRIBUTED | C-1, C-4, C-10, C-18, C-20, C-19 | Σ old 8.48 vs new 8.44 — interest base + ordering conventions |
| balance sheet close (new) | MATCH | — | worst /check/ = 2.13e-14 |
| sponsor IRR/MOIC | ATTRIBUTED | C-1, C-4, C-9, C-10, C-21, L-16, C-2 | old 42.42% / 5.859x vs new 43.23% / 6.028x — composite of the levered convention set; old drops 23.62 surplus cash at exit (L-16) |

## G5

| Quantity | Verdict | Ledger rows | Detail |
|---|---|---|---|
| entry EV | MATCH | — | old 112.00 vs new 112.00 |
| debt at par | MATCH | — | old 48.00 vs new 48.00 |
| sponsor equity plug | EXPLAINED | C-9, C-21 | Δ(new−old) = 4.300; expected components: min_cash 4 (C-9), fee-base 0.300 (C-21) |
| Senior: mandatory amort | MATCH | — | amort on face agrees |
| Senior: cash interest | EXPLAINED | C-1, L-8, C-4 | both engines self-consistent; Σ/Δinterest/ = 2.261 (avg-balance vs beginning-balance on C-4-divergent paths) |
| Senior: sweep + ending balance | ATTRIBUTED | C-4, L-6 | Σsweep old 19.06 vs new 12.11; Y5 end old 4.94 vs new 11.89 |
| Revolver: commitment fee (undrawn years) | MATCH | — | undrawn-year fees agree |
| cash taxes | ATTRIBUTED | C-1, C-4, C-10, C-19 | Σ old 16.20 vs new 15.94 — interest base + ordering conventions |
| balance sheet close (new) | MATCH | — | worst /check/ = 4.26e-14 |
| sponsor IRR/MOIC | ATTRIBUTED | C-1, C-4, C-9, C-10, C-21, C-2 | old 16.80% / 2.174x vs new 15.96% / 2.097x — composite of the levered convention set |

## Gate

**ZERO open INVESTIGATE cells — the §F1 gate is CLEAN.** Every diff is a categorized,
pre-authorized divergence (L-x known old defects / C-x intentional convention changes).
