# §22 step-3 documented mutants — all RED, all reverted byte-identically (2026-08-14)

Discipline: each mutant applied by string-replace with `count == 1` asserted, the targeted
tests run expecting RED, reverted by string-replace, and the file verified BYTE-IDENTICAL
by SHA-256 against its pre-mutation hash. Baseline after the full run: vitest 717/717.
Mutants are derived FROM the §22.13 properties (each fixture names the mutant it excludes),
not from convenience — every §22.13 mutant clause is covered.

| # | Mutant (file) | What REDs | §22.13 |
|---|---|---|---|
| M1 | tier count `>` → `≥` (exit.ts) | boundary fixture count 0→1, money unchanged | (iii) |
| M2 | warrant ATM `>` → `≥` (exit.ts) | ATM false/0/0 → true/2/2, all three asserts | (vi) |
| M3 | `V_final ← V₀` on the P≤0 arm (exit.ts) | institution_moic −0.25 → 0.00 | (v)(α) |
| M4 | delete the trailing `M += s·rem` line (exit.ts) | fixture (xii) REDs while **G9's engine-vs-fixture stays GREEN under the mutant** — verified both ways, exactly §22.12's no-trailing-remainder claim | (xii) |
| M5 | §8 equity drops the subscription (openingBalance.ts) | the goodwill identity in the with/without pair | (x) |
| M6 | fund inflow ← total paid (fund.ts) | §19.6(a) conservation under a strip | (xi) |
| M7 | §12 interim term ← pari-passu (facade.ts) | the direct walkdown-term assert (invisible in the residual — it cancels) | (xi) |
| M8 | §14.9(b) un-amended to three terms (bridge.ts) | G9 reconciliation_residual ~0 → ≈28.73 | (ix) |
| M9 | §22.4 whole-excess at s_n (exit.ts) | G10 engine-vs-fixture + goldens agreement (19.13 → 28.93; §22.13(i) pins it on G10 because it is VACUOUS on an empty ratchet) | (i) |
| M10 | drop the §22.4 exit-equity cap (exit.ts) | the cap-binding fixture (mip 10 → 185) | (ii) |
| M11 | the r1 clamp `pot ← max(0,E) − redeemed` (exit.ts) | (v)(β)'s direct rollover_share assert (−6.25 → 0) | (v)(β) |
| M12 | interim redemption unclamped `r = paid` (sequence.ts) | the year-1 exceeds-balance split | (vii) |
| M13 | year-0 loan-note accretion (sequence.ts) | G9's LN[5] = 515.83 fixture leaf | §14.23(a) |
| M14 | strike not paid in `P = (1−w)·P₀` (exit.ts) | G9 ordinary_pot 180.5 + the five-term mirror | §14.23(c) |
| M15 | §22.3(vi) gate unqualified (sourcesUses.ts) | the committed insolvency test inside §14.23(f)'s domain — proving the `sweet_equity` qualifier is LOAD-BEARING | (viii)/§22.3(vi) |

## Audit-closure mutants (2026-08-14, after the step-3 hostile accuracy audit)

The audit REFUSED with 2 confirmed blocking findings (B1: the §22.3(vi) sensitivity-grid
pre-test was unimplemented, so a plug-killing entry axis destroyed the WHOLE grid — clause
(e); B2: no committed test exercised the `loan_notes_unredeemed` EMISSION, so a check.ts
mutant family passed green — clause (c)). Both fixed (grid pre-test via the refactored
single-condition `stripPlugRejection`; fixtures (xiii)/(xiv) added incl. the ±band pin),
and the closure mutants run under the same discipline:

| # | Mutant (file) | What REDs |
|---|---|---|
| M16a | `loan_notes_unredeemed` emission disabled (check.ts) | fixture (xiv)'s firing arm |
| M16b | the §14.23(g) band widened 0.005 → 5 (check.ts) | fixture (xiv)'s threshold pin |
| M17 | the grid pre-test disabled (scenarios.ts) | fixture (xiii) — the grid dies on the RangeError |
| M15r | the plug gate unqualified, re-anchored post-refactor (sourcesUses.ts) | the committed insolvency test |

Process note, recorded for honesty: M4's FIRST run used an empty-string revert, which
re-inserted the deleted line at file position 0 — caught immediately by the driver's own
SHA-256 check and the red baseline, repaired by string-replace, and the file verified
byte-identical to the committed blob before the clean re-run above. The driver's per-mutant
hash check is exactly the fence the runbook prescribes; it fired as designed.

Second process note: M17's FIRST run repeated the M4 empty-string-revert misfire on the
deletion form — caught again by the hash/count fence, restored by string-replace, and
re-run as a guard TOGGLE (`if (false && …)`), which reverts symmetrically. Deletion
mutants are now always expressed as toggles.

## Step-4 display-provenance mutants (2026-08-14) — all RED, byte-identical reverts

| # | Mutant | What REDs |
|---|---|---|
| D1 | EquityStrip net row shows GROSS (OutputTabs) | the value-provenance pin (7.50 vs 9.50) |
| D2 | tier-count label drops its §22.5 basis (OutputTabs) | the basis-label pin (§9 naming rule) |
| D3 | strip block rendered unconditionally (OutputTabs) | the §22.10 absent-when-off pin |
| D4 | the React §15 row deleted (OutputTabs) | the methodology-row pin |
| D5 | Excel Equity row drops the subscription fold (excelExport) | the M10 parity pin |
| D6 | Excel derivation row reads the WRONG named field (redeemed for subscribed) | the sanctioned-derivation parity pin |
