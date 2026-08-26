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
| B2 | (a) | **§23.12 asserted the WRONG IRR direction.** The draft claimed sponsor IRR RISES vs G2-DIST's 13.3906% on the reasoning "earlier money at an 8.5× event multiple below the 9× exit". It FALLS, to ≈13.13%, and MOIC falls 1.8553 → ≈1.7406. The discriminant is closed-form: the sold slice runs [−198.11375, +2.5, +263.015] from t=3, an implied ≈15.9% — ABOVE the deal's own rate — so releasing it early gives up return. "Earlier money lifts IRR" holds only when the money is released at or below the deal's own rate; an 8.5× event multiple under a 9× exit is precisely what puts the slice above it. Left standing, this was the fixture's stated sanity line and would have been asserted the wrong way at step 2. | FIXED. §23.12 states the direction, both display figures and the discriminant; the changelog row records the correction. |

Both were found by re-deriving the golden by hand under the Q-A flip, not by review — which
is the runbook's own point about where accuracy lives (steps 2–3, not prose).

### LEDGER (non-blocking; fix in one pass before conformance)

| # | Class | Item | Note |
|---|---|---|---|
| L1 | wording | §23.9's clause map now needs an `(h)` row for §14.24(h) (the realized-basis clause added by the Q-A flip). | Domain: `selldown` non-null. Pure cross-reference upkeep; §14.24 governs on any divergence, so nothing is undefined meanwhile. |
| L2 | consistency | §17's golden-uncovered list has no entry for the realized-basis DPI on a NEGATIVE-proceeds run. §23.13(v)'s companion arm covers it as a directed fixture, so coverage exists; only the §17 index entry is missing. | Add alongside the other §23 entries. |
| L3 | wording | §23.6 is now the longest subsection in §23 (the Q-A rationale lives there). The rationale belongs in `OWNER_QUESTIONS.md` Q-A, which carries it in full. | Trim §23.6 to the rule + the three consequences once round 1 has read it; keep the pointer. |

### Round 1 hostile review — status

Round 1 is OWED and has NOT run. The prior session launched it as workflow `wf_8ee9e1df-f24`
and then ended; that result is unrecoverable. **Do not wait on it — re-run it.** The section
it must review is the POST-FLIP §23 (fingerprint stamped at grant), not the `13d450c` draft:
the Q-A flip and the two B-fixes above changed numbers in §9, §14.9, §14.18, §14.24, §16,
§23.6–§23.13 and the changelog, so a review of the old text would be reviewing a document
that no longer exists.
