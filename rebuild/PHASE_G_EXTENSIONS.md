# PHASE G — Staged feature re-entry (one at a time, spec-first)

Every deferred feature re-enters through the same template. **Never two features in flight.**

## The template (per feature) — TIERED [amended 2026-07-25, owner-approved]

The full 5-step template is correct for anything that changes a computed number, but it
runs steps that ADJUDICATE NOTHING on features that add no engine arithmetic (a "golden
extension" for a pure-exposure feature is a literal no-op; an adjudication has no new number
to check). Three tiers, assigned by **what a feature actually computes**, not by how big it
feels. The gate is never self-declared loosely — a lighter tier must PROVE it qualifies (the
escalation rule below), and the conformance review checks that proof.

### Tier A — touches ENGINE ARITHMETIC (adds/changes a number inside `runModel`)
The full five steps, unchanged (this is exactly what G-1 ran):
1. **Spec amendment PR**: new SPEC section (convention + formula + rejected alternative),
   changelog entry, fee/flow-membership table updates if returns are touched; independent
   hostile sign-off, iterating until GRANTED.
2. **Golden extension**: extend a golden workbook or add one (same three artifacts +
   independent adjudication rule as Phase B), re-derived where numbers move.
3. **Engine PR** + per-module fixtures + invariant additions with domains, then an
   **independent hostile ACCURACY AUDIT** over the math and the proof system.
4. **UI PR**: input surface (correct disclosure tier + badge basis) + output surface.
5. **Adversarial conformance review** (code-vs-spec) + the three-issuer live walkthrough.
Backlog Tier A: #3 fund overlay, #5 refinancing, #7 partial exits, #8 sweet equity, #9
add-ons.

### Tier B — its OWN arithmetic, but DATA-SIDE (computes a FACT the engine consumes; the
### engine's own numbers are unchanged)
Same rigour, redirected at the NEW computation instead of the engine goldens:
1. **Spec amendment PR** (as Tier A) — the new data convention + formula + rejected
   alternative + independent hostile sign-off.
2. **Data-layer fixtures + independent adjudication** of the new arithmetic (e.g. the LTM
   stitch `FY + YTD − prior-YTD`), NOT an engine-golden regen. **PROOF OBLIGATION: every
   existing `tests/goldens/*` fixture must regenerate BYTE-IDENTICALLY** — that byte-identity
   IS the evidence the feature is data-side and not Tier A. If any golden moves, it is Tier A.
3. **Extraction/adapter PR** + fixtures + an accuracy audit SCOPED to the new computation
   (independence, no rounded value re-entering, drift bound).
4. **UI PR** (disclosure tier + badge basis; e.g. staleness badges).
5. **Adversarial conformance review** + the three-issuer walkthrough.
Backlog Tier B: #2 quarter-stitched LTM, #4 reality-check comps, #10 market-data suggestions.

### Tier C — PURE EXPOSURE (no new arithmetic anywhere)
For features that only render or wire fields that ALREADY exist and are already SPEC-traced:
1. **Spec note** (convention + rejected alternative if any) + changelog row.
2. **UI PR** (input/output surface at the right disclosure tier).
3. **Adversarial conformance review** + the three-issuer walkthrough.
NO golden extension, NO adjudication — there is nothing to adjudicate.
**HARD ESCALATION GATE (checked by the conformance review, not self-declared):** a feature
is Tier C only if it PROVES both — (a) all engine goldens regenerate byte-identically, and
(b) it introduces no DISPLAYED number that is not already a ModelOutput field tracing to a
SPEC section. Fail (a) ⇒ Tier A. Fail (b) with a new derived value ⇒ Tier B (adjudicate the
derivation) or Tier A (if it enters `runModel`). Any new UI assertion still gets the
mutation check (the G-1 vacuous-assertion lesson applies at every tier).
Backlog Tier C: #11 covenant step-downs UI/springing (engine fields exist from v1),
#12 trace mode v2 (renders existing ModelOutput with SPEC-section links).

**Why this is safe.** The 100%-accuracy guarantee lives in the ENGINE goldens + the
displayed-number-traces-to-SPEC rule, and every tier still defends both: Tier A re-derives
them, Tier B PROVES them byte-unchanged (that proof is the tier's admission ticket), and
Tier C proves them byte-unchanged AND no new untraced number. A lighter tier can only ever
mean "there is demonstrably nothing here to adjudicate," never "we adjudicated less."

## Ordered backlog (re-derived from the audit + product review; owner may reorder)

| # | Tier | Feature | Notes for its spec |
|---|---|---|---|
| 1 | A | ✅ **DONE 2026-07-25** — **Interim distributions + cash trap** | Unlocks DPI/RVPI/TVPI + payback properly (ILPA defs from DR-2); the feared same-year cycle DISSOLVED: §3.7's pro-forma test is linear in the payment, so rp_max has a closed form and the no-solver rule holds (SPEC v1.1.0 §5). Shipped as SPEC v1.1.0/v1.1.1 + goldens G2-DIST / G3-DIST / G2-DIST-D + engine + UI |
| 2 | **B** | **Quarter-stitched LTM** | FY + YTD − prior-YTD, Q4 = FY − 9M, 52/53-week fixtures; FPI stays FY with staleness badge. DATA-SIDE: computes a more-current LTM fact the engine consumes; the engine's own arithmetic is unchanged (engine goldens must stay byte-identical — that is the Tier-B proof). Adjudicate the STITCH, not the engine goldens |
| 3 | A | **Fund/LP overlay** | Net-to-LP after fees/carry (European/American), reuses old fundReturns spec knowledge; feeds a fourth return row clearly labelled fund-level |
| 4 | B | **Reality check, done right** | Only now: comps from a real source (FMP/Damodaran per old roadmap 2C), sector bands with citations, no hardcoded thresholds; extends the D5 trading anchor |
| 5 | A | **Refinancing events** | Repricing, premium, extend; OID/DFC write-off interplay already spec'd in §7/§9 |
| 6 | A | **PIK toggle (per-year election)** | Extends the v1 fixed PIK note; AHYDO disclosure from DR-3.4 (changes the §4 PIK accrual path ⇒ engine arithmetic) |
| 7 | A | **Partial exits / IPO selldown** | Interacts with MIP cap (SPEC §10 already forward-compatible) |
| 8 | A | **MIP ratchets + sweet equity** | Sweet equity as a REAL strip structure (institutional loan notes + ordinaries) — the v1 promote stays separate; never blend the two instruments |
| 9 | A | **Add-on acquisitions** | The old engine's deepest wound (debt discarded, scenario bases diverged): spec must state add-on debt enters the SAME waterfall, scenario/sensitivity bases include add-ons by construction (single code path guarantees it) |
| 10 | B | **Market-data suggestions** | FRED SOFR curve + spreads by rating → SUGGESTED (market) badge tier goes live; forward base-rate paths into §4 (data-side suggestion values; the ENGINE arithmetic is unchanged — but if a forward-curve path enters `runModel`'s interest, that part is Tier A) |
| 11 | **C** | **Covenant step-downs UI / springing** | Engine fields exist from v1 spec; expose + scenario integration. Must PROVE the escalation gate (goldens byte-identical, no new untraced number) or escalate |
| 12 | **C** | **Trace mode v2** | Rebuilt against ModelOutput with SPEC-section links in trace cards; renders existing ModelOutput, adds no number (the spec makes traces meaningful: each node cites its formula) |

## v2 items deferred by SPEC but not yet scheduled (pull into the backlog when prioritized)

Recorded so every spec deferral has a tracked re-entry path (verifier finding, 2026-07-05):
- **Step-up purchase accounting** (asset / §338(h)(10) / §336(e): §197 15-yr goodwill
  amortization, permanent 100% bonus depreciation post-OBBBA, DTL unwind) — SPEC §8.
- **Call-protection module** (private-credit 102/101 hard call, CoC 101 put, HY make-whole)
  — SPEC §3/§9 disclosed omissions; pairs with backlog #5 (refinancing).
- **XIRR on actual close/exit dates with first-year stub** — SPEC §1's stated upgrade path
  (retires the mid-year toggle; DR-2's preferred practice).
- **Quarterly engine periods** — SPEC §1 deferral (distinct from backlog #2's LTM
  quarter-stitching, which is data-side).
- **Actual/360 day-count gross-up per tranche** — SPEC §4 v2 refinement (~1.0–1.4% interest
  understatement disclosed meanwhile).
- **Transaction-cost 70/30 success-fee split** (Rev. Proc. 2011-29) — SPEC §6 v2 refinement.
- **Mezzanine warrants / equity kicker** (2–8% of equity — DR-4) — belongs with backlog #8
  (sweet equity/strips).

## Standing rules
- A feature that would add a second calculation path for an existing number is rejected by
  construction — it must flow through `runModel`.
- Each feature's UI enters at the right disclosure tier (almost always Advanced).
- After every feature: the three-issuer live walkthrough (E gate script) re-runs.
- **Tier assignment is a claim to be PROVEN, not a label.** Tier B's admission ticket is
  byte-identical engine goldens; Tier C's is that PLUS no new untraced displayed number. The
  conformance review verifies the ticket; a failed proof escalates the tier. The lighter
  tiers never mean "adjudicated less" — only "demonstrably nothing here to adjudicate."
- **A hostile independent reviewer signs off the TIER CHOICE** for every Tier B/C feature
  (not just the code) — the cheapest place to catch an under-gated feature is before it
  ships, and the accuracy guarantee is only as strong as the tier boundary.
