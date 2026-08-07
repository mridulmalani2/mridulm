# PHASE G — Staged feature re-entry (one at a time, spec-first)

Every deferred feature re-enters through the same template. **Never two features in flight.**

## The template (per feature) — TIERED [amended 2026-07-25, owner-approved]

The full 5-step template is correct for anything that changes a computed number, but it
runs steps that ADJUDICATE NOTHING on features that add no engine arithmetic (a "golden
extension" for a pure-exposure feature is a literal no-op; an adjudication has no new number
to check). Three tiers, assigned by **what a feature actually computes**, not by how big it
feels. The gate is never self-declared loosely — a lighter tier must PROVE it qualifies, and
the conformance review checks that proof against the DIFF, not the author's summary.

**Tier is assigned PER CHANGED NUMBER, not per feature [hostile review 2026-07-25].** A
feature with even one Tier-A component IS Tier A, OR must be DECOMPOSED into separately-gated
PRs with the arithmetic component gated as full Tier A. "That part is Tier A" is a hard
decomposition requirement, never a parenthetical the author self-applies.

**THE ADMISSION TICKET IS SOURCE-CONTAINMENT, NOT GOLDEN-OUTPUT [hostile review 2026-07-25 —
this replaces the original byte-identity ticket, which was VACUOUS].** "Engine goldens
regenerate byte-identically" is NECESSARY but NOT SUFFICIENT to prove a feature is data-side:
this project's own `tests/goldens/DERIVATION.md` records engine-arithmetic mutations that
left every golden byte-identical (the §10 `total→share` hurdle mutation passed 402/402;
dropping the blocked-flag request term passed 402/402), and whole `runModel` regions are
golden-uncovered by design (NTM basis, static-vs-forward rates, the §12 walk-down, EBITDA_adj
≤ 0). Byte-identity proves only "no GOLDEN-COVERED arithmetic moved." The real ticket is a
**mechanical, coverage-independent git-diff, expressed as a POSITIVE ALLOWLIST so it fails
CLOSED** [strengthened after review round 2 — a denylist "touch nothing on THIS path" fails
OPEN: any number-computing file not enumerated escapes, e.g. `suggest.ts` is golden-uncovered
AND was outside the fence]:

> **Reference sets.**
> - **ENGINE ARITHMETIC PATH** (computes engine numbers) = `lib/engine2/kernel/**` +
>   `lib/engine2/{operating,tax,debt,sequence,exit,returns,credit,bridge,sourcesUses,openingBalance,scenarios,facade,check,fund}.ts`
>   [fund.ts added v1.4.0 — the §19 overlay is engine arithmetic; the display-gate regex fences it identically].
>   `facade.ts` ASSEMBLES the model and does NO display math — display-derivation helpers live in
>   the display layer (`lib/engine2/display.ts`), OFF this path, so a `facade.ts` diff still cleanly
>   means "engine arithmetic changed" [round-4 (b)]. New `*Display` helpers go in the display layer.
> - **SUGGESTION PATH** (computes DISPLAYED suggested values the user accepts INTO the model) =
>   `lib/engine2/suggest.ts` + `lib/engine2/suggestions/**`. Golden-uncovered (never runs in
>   `runModel`), so a new computed suggested value is ADJUDICATED like any Tier-B number. A display
>   surface may not IMPORT it to recompute either — the import-scan fences it alongside `factsAdapter`
>   [round-4 (4)].
> - **DISPLAY-SURFACE SET** (renders numbers to a human) = `components/deal-engine/**` +
>   `lib/format/**` + `lib/engine2/display.ts` + `lib/engine2/excelExport.ts` + `lib/ai2/memo.ts`. (Explicitly includes
>   the Excel export, the downloaded memo, and the display-derivation module — the exact surfaces
>   that carried v1.1.2, plus the ONE home where a display-only derived number (the entry/exit
>   multiple) is computed and which every render surface IMPORTS rather than reconstructs.) The
>   committed guard DERIVES its scan set by WALKING these roots
>   (`tests/governance-display-surface.test.ts`), never a hand-maintained file list — a hardcoded
>   4-file scan let a live §4 second-path in `AssumptionsPanel` sit green [R3-1]. A meta-test binds
>   this declared set to the walk in BOTH directions [round-4 (a)], so guard/doc drift is a red test.
>
> **Tier-B allowlist:** the PR's diff is CONFINED TO `lib/edgar/**`, `lib/engine2/factsAdapter.ts`,
> the SUGGESTION PATH, purely-additive Class-A/C `types.ts` fields, the DISPLAY-SURFACE SET,
> `tests/**`, and docs — and is EMPTY over the ENGINE ARITHMETIC PATH. Any diff to a file
> OUTSIDE the allowlist trips the gate (fail-closed) and forces re-justification or escalation.
> New SUGGESTION-PATH arithmetic carries the full Tier-B adjudication (DERIVATION.md method).
> **Tier-C allowlist:** diff CONFINED TO the DISPLAY-SURFACE SET + `tests/**` + docs — EMPTY
> over the engine arithmetic path, the suggestion path, `types.ts`, `lib/edgar/**`, and
> `factsAdapter.ts`. A new number-producing line anywhere escalates.
>
> Verified by `git diff origin/main --<allowlist>` (must be the WHOLE diff) in the conformance
> review. Byte-identical goldens remain a REQUIRED secondary check — but the allowlist diff is
> what actually distinguishes "data-side" from a golden-uncovered engine/suggestion edit.

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
### engine arithmetic path is UNTOUCHED)
Same rigour, redirected at the NEW computation with the SAME enforceable mechanisms Tier A's
goldens carry — "same rigour" means the MECHANISM, not the adjective:
1. **Spec amendment PR** (as Tier A) — the new data convention + formula + rejected
   alternative + independent hostile sign-off.
2. **Data-layer fixtures + independent adjudication BOUND TO THE `DERIVATION.md` METHOD
   VERBATIM**: a reference derivation in a DIFFERENT LANGUAGE with ZERO imports of the code
   under test, TWO independent hand-derivation passes, the SAME ±$0.005m / ±0.1bp golden-adjudication bar (§15),
   "gospel only after signed" — AND a **CI regeneration gate** for the new fixtures
   equivalent to `tests/goldens.test.ts` (a scheduled test re-runs the reference derivation
   and fails on any drift). An ordinary same-language fixture with no regeneration gate is
   NOT acceptable — that is the "adjudicated by the same logic that computes it" failure.
3. **Extraction/adapter PR** + the source-containment diff proof (empty diff over the engine
   arithmetic path) + an accuracy audit SCOPED to the new computation (independence, no
   rounded value re-entering, drift bound).
4. **UI PR** (disclosure tier + badge basis; e.g. staleness badges) — under Tier C's display
   rules (mechanical field-trace + label mutation tests, below).
5. **Adversarial conformance review** (verifies the diff proof + the tier choice) + the
   three-issuer walkthrough.
Backlog Tier B: #2 quarter-stitched LTM, #4 reality-check comps, #10 market-data suggestions,
#11 covenant step-downs (a step-down SCHEDULE is data the engine consumes — see the table).

### Tier C — PURE EXPOSURE (no new arithmetic, no new engine/type code)
For features that only render or wire fields that ALREADY exist and are already SPEC-traced:
1. **Spec note** (convention + rejected alternative if any) + changelog row + **independent
   hostile sign-off** (thin on a convention that gates a DISPLAYED state — e.g. a covenant
   label — is still governance; a Tier-C spec note is NOT exempt from sign-off).
2. **UI PR** (input/output surface at the right disclosure tier).
3. **Adversarial conformance review** + the three-issuer walkthrough.
NO golden extension, NO adjudication of a NEW number — there is none. But the DISPLAY gate is
NOT weaker than Tier A/B; it is the same, because the v1.1.2/v1.1.3 defects (correct value,
WRONG basis label, on displayed surfaces) were pre-existing, survived every prior walkthrough,
and were caught by ADJUDICATORS + directed MUTATION tests, never by goldens:
**HARD ESCALATION + DISPLAY GATE (mechanical, checked against the diff):**
- (a) **Source containment**: the git-diff over the engine arithmetic path AND `types.ts` is
  EMPTY. Fail ⇒ escalate (a new engine field ⇒ A; a new derived data value ⇒ B).
- (b) **Every displayed value resolves to a NAMED `ModelOutput` field (or the ONE facade display
  helper), through `lib/format`** — enforced by a COMMITTED CI CHECK, not a reviewer's grep
  [R2-2], GLOB-derived over the DISPLAY-SURFACE SET so it covers every current AND future display
  file [R3-1]. `tests/governance-display-surface.test.ts` fails on:
  - (i) an import of an engine ARITHMETIC module into a display surface, UNLESS it is a SANCTIONED
    single-source primitive — a pure helper the engine ITSELF uses (`allInRate`,
    `entryGrossLeverageFromAssumptions`, `rescaleTermTranchesToLeverage`), imported so an INPUT
    panel's pre-build PREVIEW shares ONE definition with the engine. Importing the shared primitive
    is the CURE for a second path; re-implementing its formula inline is the disease (this is
    exactly what `AssumptionsPanel`'s `max(base,floor)+spread` was). Each sanctioned import is
    enumerated with its reason — fail-closed: a NEW engine import fails until justified.
  - (ii) any array AGGREGATION (`.reduce` / `Math.max` / `Math.min`) over a model value that is not
    an allowlisted PRESENTATIONAL derivation — a Σ-tranche-balances inline instead of a ModelOutput
    field FAILS the build.
  - (iii) any inline reconstruction of a SINGLE-SOURCED derived number (registry-driven): the exit
    EV/EBITDA multiple was reconstructed inline on THREE surfaces before `exitMultipleDisplay`; it
    must now flow through that facade helper.

  All three proven by mutation. **HONEST SCOPE [R3-2].** What is NOT regex-policed is scalar
  arithmetic on named fields — net debt (par − cash), covenant headroom (EBITDA − threshold), a
  multiple (A / B), an IRR (`Math.pow`) — because a blanket operator ban WOULD false-positive on
  legitimate presentational math (the memo's cap table alone computes several %-of-cap and
  ×-EBITDA cells from named fields). This residual is NOT "benign ratios," and it is NOT covered by
  gate (c)'s label tests — those assert a field's LABEL, never that its displayed VALUE equals its
  source. It is closed instead by: (1) SINGLE-SOURCING any derived number shown on >1 surface
  through one facade helper — guard (iii) pins the known ones; (2) a VALUE-PROVENANCE test per
  displayed derived number (recompute from named `ModelOutput` fields, assert equality — e.g. the
  `entryMultipleDisplay` / `exitMultipleDisplay` tests); and (3) the conformance diff-review as the
  human backstop. The guard closes the mechanically-closable vectors and names the one it does not.
- (c) **LABEL COVERAGE**: every displayed field — new OR relabelled — carries a
  MUTATION-TESTED basis/label assertion (the v1.1.2/v1.1.3 lesson: "zero label assertions
  were added for a defect that WAS a label"). A feature that renders numbers ANNOTATED with a
  basis or SPEC-section (trace v2, covenant labels) additionally carries the label-adjudication
  that caught v1.1.2/v1.1.3 — it does NOT skip adjudication merely for adding "no new number":
  a mislabel of a correct number is exactly what Tier C must catch.
Backlog Tier C: #12 trace mode v2 (renders existing ModelOutput with SPEC-section links —
its native failure mode IS the mislabel class, so gate (c) is load-bearing here).

**Why this is safe — with the fix.** The 100%-accuracy guarantee is defended by TWO things:
the ENGINE goldens/adjudication for arithmetic, and the displayed-number rules (field-trace +
label mutation tests) for surfaces. Every tier defends both — but the ADMISSION TICKET is now
the mechanical source-containment diff (coverage-independent), not golden byte-identity
(coverage-dependent, and provably passable by golden-uncovered engine edits). Tier B redirects
the SAME adjudication mechanism (different-language reference + two passes + regeneration gate)
at the new computation; Tier C adds no number and mutation-tests every label. A lighter tier
means "the diff proves there is nothing here to adjudicate" — which is checkable — NOT "we
adjudicated less." (The original doc's "byte-identity IS the evidence" claim was the exact
vacuous-proof pattern G-1 spent three hostile rounds learning to distrust; it is retracted.)

**The recurring enforcement failure — named, so it stops.** A hand-maintained ENUMERATED list
has been the containment hole three rounds running: a DENYLIST that failed open (R1, `suggest.ts`
outside the fence), then a HARDCODED display-scan list that covered 1 of 9 components while a live
§4 second-path sat green under it (R3). The fix is the same each time: enforce by CONSTRUCTION, not
by a list someone must remember to extend — a fail-closed positive allowlist for the diff fence, a
GLOB-derived scan set for the display gate, a meta-test binding guard to doc. If a future gate is a
hand-kept list of what to check, assume it already has a hole.

## Ordered backlog (re-derived from the audit + product review; owner may reorder)

| # | Tier | Feature | Notes for its spec |
|---|---|---|---|
| 1 | A | ✅ **DONE 2026-07-25** — **Interim distributions + cash trap** | Unlocks DPI/RVPI/TVPI + payback properly (ILPA defs from DR-2); the feared same-year cycle DISSOLVED: §3.7's pro-forma test is linear in the payment, so rp_max has a closed form and the no-solver rule holds (SPEC v1.1.0 §5). Shipped as SPEC v1.1.0/v1.1.1 + goldens G2-DIST / G3-DIST / G2-DIST-D + engine + UI |
| 2 | **B** | **Quarter-stitched LTM** | FY + YTD − prior-YTD, Q4 = FY − 9M, 52/53-week fixtures; FPI stays FY with staleness badge. DATA-SIDE: computes a more-current LTM fact the engine consumes. Admission ticket = EMPTY git-diff over the engine arithmetic path (NOT golden byte-identity — that is necessary-secondary). Adjudicate the STITCH with a different-language reference derivation + two passes + a CI regeneration gate (the DERIVATION.md method) |
| 3 | A | **Fund/LP overlay** | Net-to-LP after fees/carry (European/American), reuses old fundReturns spec knowledge; feeds a fourth return row clearly labelled fund-level |
| 4 | B | **Reality check, done right** | Only now: comps from a real source (FMP/Damodaran per old roadmap 2C), sector bands with citations, no hardcoded thresholds; extends the D5 trading anchor |
| 5 | A | **Refinancing events** | Repricing, premium, extend; OID/DFC write-off interplay already spec'd in §7/§9 |
| 6 | A | **PIK toggle (per-year election)** | Extends the v1 fixed PIK note; AHYDO disclosure from DR-3.4 (changes the §4 PIK accrual path ⇒ engine arithmetic) |
| 7 | A | **Partial exits / IPO selldown** | Interacts with MIP cap (SPEC §10 already forward-compatible) |
| 8 | A | **MIP ratchets + sweet equity** | Sweet equity as a REAL strip structure (institutional loan notes + ordinaries) — the v1 promote stays separate; never blend the two instruments |
| 9 | A | **Add-on acquisitions** | The old engine's deepest wound (debt discarded, scenario bases diverged): spec must state add-on debt enters the SAME waterfall, scenario/sensitivity bases include add-ons by construction (single code path guarantees it) |
| 10 | **B/A** | **Market-data suggestions** | FRED SOFR curve + spreads by rating → SUGGESTED (market) badge tier goes live. The suggestion VALUES are Tier B (data-side). **But a forward base-rate path into §4 interest is Tier A** and MUST be a separate PR gated as full Tier A (golden extension + accuracy audit) — static rates are golden-uncovered, so byte-identity would hide it. Per-changed-number decomposition, not one B stamp |
| 11 | **B** | **Covenant step-downs / springing** | A step-down SCHEDULE and the springing trigger are DATA the engine consumes to decide a breach STATE that is then displayed — not pure exposure. No golden trips a covenant (G5 is "no breach"), so this is the un-disprovable golden-uncovered case: it must PROVE source-containment (empty engine-arithmetic diff) and mutation-test the displayed breach label, or escalate |
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
- **Tier assignment is a claim to be PROVEN by a mechanical diff, not a label.** The
  admission ticket for B and C is an EMPTY git-diff over the engine arithmetic path
  (`lib/engine2/kernel/**` + the arithmetic modules behind `facade.ts`); Tier C additionally
  requires an empty `types.ts` diff, a field-trace of every displayed value to a ModelOutput
  field, and a mutation-tested label assertion for every displayed/relabelled field. Byte-
  identical goldens are a REQUIRED secondary check but never the proof (they are passable by
  golden-uncovered engine edits — DERIVATION.md documents two). A failed proof escalates.
- **Tier is per changed number.** A feature with any Tier-A component is decomposed; the
  arithmetic PR runs full Tier A. No mixed-tier single PR.
- **A hostile independent reviewer signs off the TIER CHOICE and the diff proof** for every
  Tier B/C feature (not just the code) — the cheapest place to catch an under-gated feature
  is before it ships, and the accuracy guarantee is only as strong as the tier boundary.
