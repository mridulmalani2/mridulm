# G11 (#7 partial exits / IPO selldown) — LEDGER

Non-blocking items under `rebuild/PHASE_G_EXTENSIONS.md`'s bounded sign-off rule. These are
fixed in ONE pass before the feature's conformance review and NEVER block a step. A finding
is BLOCKING only if it (a) changes a NUMBER, (b) breaks a gate, (c) makes a fixture/mutant
VACUOUS, (d) states something FALSE about committed code, or (e) leaves a REQUIRED output
undefined on a reachable path.

---

## Step 1 — spec §23

### BLOCKING, found and FIXED in-draft 2026-08-27 (recorded here for the audit trail only —
### these did not go to the ledger, they were applied)

| # | Rule | Finding | Disposition |
|---|---|---|---|
| B1 | (a) | **§23.8/§14.9(b)'s walk-down double-counted the proceeds.** The draft gave the bridge TWO terms, `+ selldown_proceeds_sponsor` and `− buyer Δ (buyer exit share − proceeds)`. With the company path byte-identical (§14.24(g)) the required correction to the sponsor's delta is `proceeds − buyer_share` and nothing else, i.e. **minus the buyer Δ alone**. On G11-SELL the two-term form lands on +135.2125 where −62.90125 is required — a $198.11375m error exactly equal to the proceeds. Residual (b) could never have caught it: the v1.1.2 accuracy audit established that residual (b) re-verifies only identity (a). | FIXED. §14.9 (the single home) now carries ONE term with the proof; §23.8, §23.10, §16 and §23.13(vii) restated; the TWO-TERM form became a documented mutant that must RED. |
| B2 | (a) | **§23.12 asserted the WRONG IRR direction.** The draft claimed sponsor IRR RISES vs G2-DIST's 13.3906% on the reasoning "earlier money at an 8.5× event multiple below the 9× exit". It FALLS, to ≈13.13%, and MOIC falls 1.8553 → ≈1.7406. The discriminant is closed-form: the sold slice runs [−198.11375, +2.5, +263.015] from t=3, an implied ≈15.85% — ABOVE the deal's own rate — so releasing it early gives up return. "Earlier money lifts IRR" holds only when the money is released at or below the deal's own rate; an 8.5× event multiple under a 9× exit is precisely what puts the slice above it. Left standing, this was the fixture's stated sanity line and would have been asserted the wrong way at step 2. | FIXED. §23.12 states the direction, both display figures and the discriminant; the changelog row records the correction. |

Both were found by re-deriving the golden by hand under the Q-A flip, not by review — which
is the runbook's own point about where accuracy lives (steps 2–3, not prose).

### LEDGER (non-blocking; fix in one pass before conformance)

| # | Class | Item | Note |
|---|---|---|---|
| L1 | wording | §23.9's clause map now needs an `(h)` row for §14.24(h) (the realized-basis clause added by the Q-A flip). | Domain: `selldown` non-null. Pure cross-reference upkeep; §14.24 governs on any divergence, so nothing is undefined meanwhile. |
| L2 | consistency | §17's golden-uncovered list has no entry for the realized-basis DPI on a NEGATIVE-proceeds run. §23.13(v)'s companion arm covers it as a directed fixture, so coverage exists; only the §17 index entry is missing. | Add alongside the other §23 entries. |
| L3 | wording | §23.6 is now the longest subsection in §23 (the Q-A rationale lives there). The rationale belongs in `OWNER_QUESTIONS.md` Q-A, which carries it in full. | Trim §23.6 to the rule + the three consequences once round 1 has read it; keep the pointer. |

### ROUND 1 — CLOSED. Three lenses, all REFUSED. EIGHT blocking findings, all applied.

Re-run against the POST-FLIP §23 (the original workflow `wf_8ee9e1df-f24` died with its
session; two later attempts were killed mid-read by usage limits and were relaunched).

**The pattern is the finding.** All three lenses independently re-derived §23's own
arithmetic and found it CLEAN. Every one of the eight blocking defects sat in a **companion
home** that §23 amended by reference but did not actually amend, or that §23 over-claimed
about: §14.9 clause 9, §19.3, §19.4, §19.6(a), §14.20(d), §23.7, §23.13(vii)/(xi). Two were
verbatim repeats of §22 findings (the G9-SWEET bridge residual; the §22.7 three-call-site
rule). One corrected a fix made earlier in this same round.

| # | Lens | Rule | Finding | Disposition |
|---|---|---|---|---|
| C-B1 | contracts | (a)(d) | §14.9 clause 9 — the bridge identity's OTHER full-restatement home — was never amended. Domain "always", so false by `selldown Δ` (≈$62.90m) on every selldown run, while §23.8 asserted it HAD been amended. The §22 ≈$28.73m G9-SWEET residual repeated. | FIXED — clause 9 amended, §23.8's "single home" claim corrected to name both. |
| C-B2 | contracts | (a) | §19's LP interim leg un-amended in BOTH directions: proceeds absent from §19.3's closed enumeration and §19.6(a)'s RHS (≈$198.11m on a `selldown ∧ fund` run, which §23.3 permits); and §14.24(c)'s (1−f) partition never reached the fund layer at all (≈$4.5m), because §23.3(i) forces rollover 0 — exactly the case where the pari-passu share is 100%. §22's three-call-site finding verbatim. | FIXED — both amended; `spec_calc.py`'s `fund_overlay` implements both (inert on committed goldens). |
| C-B3 | contracts | (e)(a) | A negative `implied_event_equity` reaches §19.4's waterfall, which had no `D < 0` arm — four `fund_lp_net` outputs undefined on a reachable input; §14.20(d) violated. | FIXED — §19.4's arm pinned (no pref, no carry, re-seeds `unreturned` by \|D\| — the only reading keeping §19.6(a) exact, later verified by the arithmetic lens); §14.20(d) carved. **Bound corrected by A-B3 below.** |
| CO-B1 | coherence | (d)(c) | §23.7 and both §15-SELL homes claimed the layers "differ ONLY by fees, carry and denominator". FALSE against committed G7-FUND by 20× at year N: the fund `dpi[]` counts the final exit, the deal `dpi[]` never does (`fund dpi[N] ≡ fund moic` proves it). §23.13(xi) was commissioned off that sentence and had NO version that both passed and discriminated. **My error** — the Q-A flip turned the layer note to "agreement" without checking the one axis where the layers were never in agreement. | FIXED — agreement SCOPED to the proceeds, the exit restored as a stated basis difference in all three homes, §23.13(xi) restated to assert the step-up on both layers. |
| CO-B2 | coherence | (c) | §23.13(vii)'s TWO-TERM mutant could not RED on the detector §23.8 prescribed — it leaves `selldown_buyer_delta` and `sponsor_net_delta` untouched. And the detector §23.8 explicitly disclaimed is the one that catches it (`residualB = residualA + proceeds` = 198.11). My v1.1.2 citation was over-generalized. | FIXED — disclaimer narrowed to the symmetric case, (vii) now requires BOTH asserts and names which mutant each catches. |
| A-B1/A-B2 | arithmetic | — | Independently re-found CO-B1 and CO-B2 (a 3.6× year-N gap on the selldown+fund run, and the residual reading exactly 198.1089). Corroboration, applied above. | — |
| A-B3 | arithmetic | (d)(a) | **Corrected a fix made earlier in this round.** §19.4's new arm justified itself with "an exit share reaching the LP leg is non-negative" — FALSE about committed `exit.ts`, which never clamps the ordinary split (§22 verified the v1 identity at `E = −25`). So a year-N `D < 0` was ALREADY reachable pre-v1.8.0, and C-B3's §14.20(d) carve-out — scoped to "a selldown year, that ONE year, no other" — was false in BOTH directions. Counterexample with NO selldown: G2-DIST + G7 overlay at `exit.multiple = 1.0` (legal) ⇒ cumulative `lp_distributions` [0, 12.09, 27.43, 37.43, **14.72**], falling at year 5. Re-run and confirmed. | FIXED — §19.4's arm restated as GENERIC in D with both causes named; §14.20(d) widened to any year whose `D < 0`. §14.18's deal-layer carve-out correctly stays scoped: the deal numerator excludes the exit, so a negative exit share cannot move it. |

### Step 2b — BOTH BLIND ADJUDICATION PASSES SIGNED (2026-08-27). AGREE, zero mismatches.

Recorded in `tests/goldens/DERIVATION.md`; pass 2 agreed to **delta 0.0 exactly**. Neither
seeded from §23.12's display values — both rebuilt the entire G2-DIST run at full precision
from §17's deck and verified it reproduces every committed host leaf first. The arithmetic
lens independently reproduced the same chain a third time. Four results folded into the spec:

- **The display-seed chain moves FIVE leaves**, one (`selldown_buyer_delta`, Δ 0.005237)
  OUTSIDE §15's own flow tolerance — and §12's worked proof had been written from those
  seeds, landing on 62.90 where the fixture carries 62.91. Fixed at source. `event_multiple`
  is the amplifier (0.0028 at EBITDA → 0.0238 at the EV). `selldown_proceeds` survives by
  $0.00016m; at `fraction = 0.5` it would not.
- **§14.18's carve-out is EXACTLY TIGHT, provably** — a legal violating input exists
  (`{year: 2, fraction: 0.25, event_multiple: 2.0}` ⇒ proceeds −22.96, `dpi[2]` −0.0185), and
  no other year CAN fall. §23.13(v) now carries both arms as CONSTRUCTED inputs.
- **The pre-vs-post-promote swap is EXACTLY VACUOUS on G11-SELL** (`mip: null` ⇒ both give
  261.02). §23.13(iii) now carries its closed-form tell: the mirror over-closes by exactly
  `f × mip_payout`.
- **G11-SELL is the first fixture where "sponsor share" ≠ "paid"**, so `dpi[4]`/`dpi[5]`
  discriminate the §23.5 partition too. §14.24(h) now says which share.

### STATUS

Round 1 is CLOSED. Under the bounded rule a round 2 is available and, given that round 1
produced eight number-moving findings, **it should be run before the GRANT** — pointed at the
COMPANION homes (§9, §12, §14.9/.16/.18/.20/.24, §16, §17, §19) at least as hard as at §23,
since that is where every defect has been. If round 2 also moves numbers, §4 of the runbook
says STOP and escalate rather than run a third.

Not yet done: the ledger pass below, the GRANT + fingerprint stamp + SPEC header bump to
v1.8.0, then step 3 (engine + §23.13 fixtures + documented mutants RED and reverted).

### LEDGER PASS — DONE (one commit). All eight open items applied.

| # | Item | Applied as |
|---|---|---|
| L1 | §23.9's clause map had no `(h)` row | Added, with the carve-out's proof sketch and an explicit pointer that §14.20(d)'s fund-layer carve-out is deliberately WIDER |
| L2 | §17 had no entry for the realized-basis DPI on a negative-proceeds run | Folded into item (v) alongside CO-L5 |
| L3 | §23.6 carried the whole Q-A rationale, duplicating `OWNER_QUESTIONS.md` | Trimmed to the rule + its three consequences; the evidence and rejected alternatives live in `OWNER_QUESTIONS.md` alone |
| C-L3 | `selldown_buyer_delta`'s null-arm value unstated; §16's blanket would have typed it nullable | §23.10 now states both new `number` fields are unconditional `0.0` and are the two exceptions to the REQUIRED-with-null blanket, with the reason (nullable would break the §14.16 mirror on every pre-v1.8.0 run) |
| C-L4 | §23.10 omitted `walkdown.sponsor_net_delta` | Named in §23.10, its outputs home |
| C-L5 | §23.10 restated §14.24(f)'s below-cost condition in a second algebraic form | Replaced by a citation; §23.10 now carries rationale only, per §23.9's charter |
| CO-L2 | §19.7's closed enumeration was one home short | Extended, with the point that matters: the `(1 − fraction)` scaling sits AFTER the share rule, because that rule returns 100% at rollover 0 and §23.3(i) forces rollover 0 |
| CO-L5 | §17 items (v) and (x) stale under the realized basis | Both restated; (x) also gains the selldown walk-down term and the note that G11-SELL is the first golden where "sponsor share" ≠ "total paid" without a rollover |

### OPEN LEDGER — carried to the conformance pass

| # | Class | Item |
|---|---|---|
| L4 | prose length | §23 is **332 lines** against PHASE_G's ~250 guideline. Two drivers: §23.13's constructed fixture inputs (genuinely normative — step 3 needs them) and inline round-1 attributions, which rule 4 says belong in the changelog row, not in normative text. Strip the attributions at conformance; keep the "un-amended, this is false by X" protective notes, which follow the committed §22 style. |
