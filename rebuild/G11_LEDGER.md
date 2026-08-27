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

### Round 1 hostile review — PARTIAL. CONTRACTS lens REFUSED (3 blocking, all applied).

Round 1 was re-run against the POST-FLIP §23 (the original workflow `wf_8ee9e1df-f24` died
with its session). Three lenses were launched; **a session usage limit killed two of them
mid-read.** The CONTRACTS lens completed and REFUSED with three blocking findings. Every one
was verified against the file before it was acted on, and every one was real.

| # | Rule | Finding | Disposition |
|---|---|---|---|
| C-B1 | (a)(d) | **§14.9 clause 9 was never amended.** The bridge identity has TWO homes that each restate it IN FULL — §12's walk-down enumeration and §14's clause 9 — and the B1 fix landed only in §12. Clause 9 carries domain "always", so as committed it was FALSE by exactly `selldown Δ` (≈$62.90m on G11-SELL) on every selldown run, and §23.8 asserted it had been amended "there, its single home". This is the §22 ≈$28.73m G9-SWEET residual repeated, and clause 9's own text records that precedent. | FIXED. Clause 9 amended; §23.8's "single home" claim corrected to name both homes. |
| C-B2 | (a) | **§19's LP interim leg was un-amended in BOTH directions**, while §23.7 asserted the conservation extends. (i) `selldown_proceeds` is absent from §19.3's closed inflow enumeration and from §19.6(a)'s RHS — so §19.6(a) was false by ≈$198.11m on a `selldown ∧ fund` run, which §23.3 permits. (ii) §14.24(c)'s `(1 − f)` partition never reached the fund layer at all: §19.3 reads `sponsorShareOfDistributions`, which returns 100% at rollover 0 — and §23.3(i) FORCES rollover 0 wherever a selldown exists — over-crediting the LP by ≈$4.5m. This is §22's round-1 three-call-site finding verbatim, which §22.8 closed with an explicit rule §23 lacked. | FIXED. §19.3's inflow line takes both amendments; §19.6(a)'s RHS widened. The reference derivation's `fund_overlay` now implements both (inert on committed goldens — no fixture moved). |
| C-B3 | (e)(a) | **A negative `implied_event_equity` reaches §19.4's waterfall, which has no arm for it.** §23.2 makes `D < 0` reachable on an interim leg for the first time; every §19.4 step presupposes `D ≥ 0`, so `lp_distributions[year]`, `gp_carry[year]` and all four `fund_lp_net` outputs were undefined on a reachable input. §14.20(d) (`lp_distributions` monotone, no exception) was violated on the same run — §14.24(h) had carved out §14.18 for exactly this cause and missed its fund-layer sibling. | FIXED. §19.4 pins the negative-D arm (no pref, no carry, re-seeds `unreturned` by `\|D\|` — the only reading that keeps §19.6(a) exact) with both alternatives rejected in place; §14.20(d) takes the matching one-year carve-out. |

Two ledger items were PROMOTED and fixed in the same pass, because step 2a had just made
them false rather than merely untidy: **C-L1** — §23.13(i)'s unqualified "EVERY output
byte-identical" contradicts §14.24(d) and is false against the `exit.selldown_buyer_share`
zero column now committed (the §14.23(f) shorthand this document has paid for once already);
**C-L2** — §14.24(d) and §16 cited "§23.12's fixture-SHAPE zero key", but §23.12 is G11-SELL,
whose event is non-null; the zero column lands on the PRE-EXISTING goldens.

The lens also independently re-derived the whole G11-SELL chain from §23 text and the host
fixture and reproduced it to the cent, including B2's corrected IRR direction (13.1316% on
2dp seeds vs the reference's full-precision 13.1313%) and the sold slice's ≈15.85% implied
return. That is corroboration, **not** an adjudication pass — it was not blind.

### LEDGER, round 1 (non-blocking; fix in ONE pass before conformance)

| # | Class | Item |
|---|---|---|
| C-L3 | contract gap | §23.10 says `selldown_buyer_share` is unconditional `0.0` but is silent on `selldown_buyer_delta`'s null-arm value (only §12 states it), while §16 closes with a blanket "All Class C, all REQUIRED-with-null" that would type both `number \| null`. Every committed sibling is non-nullable `number`. State "unconditional `0.0`" for both and exempt them from the blanket. |
| C-L4 | omission | §23.10 declares itself the outputs home but omits `walkdown.sponsor_net_delta`, which §23.8 and §16 both amend. |
| C-L5 | two-home restatement | §23.10 restates the below-cost condition in a different algebraic form from §14.24(f)'s. Identical algebraically, but §23.9's charter says §23 states no rule of its own, and two forms of one quantity is the §14.23(d) shape that produced a 4.1% float disagreement in round 9. Cite, don't restate. |
| C-L6 | stale narration | The changelog says "§14.24 (a)–(g) AMENDED"; §14.24 now runs (a)–(h). |

### STILL OWED

1. **Round 1's ARITHMETIC and COHERENCE lenses** — both died mid-read at a session usage
   limit. Re-run them against the current §23. Under the round cap this still counts as
   round 1; a round 2 is available after it.
2. **Step 2b — the TWO blind adjudication passes on G11-SELL.** Both died at the same limit.
   Until they sign, §23.12's actuals are the reference derivation's word alone and
   `tests/goldens/DERIVATION.md` carries no §23 record. **Do not treat G11-SELL as GOSPEL
   and do not start step 3's mutants against it until they have run.**
