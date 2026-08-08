# engine2 Financial Specification — v1.5.0 (SIGNED lineage; Phase A gate passed 2026-07-05)

**This is the governing document for every calculation in `lib/engine2/`.** Code may never
deviate from the current spec version; disputes are adjudicated by this document plus the
golden workbooks (`tests/goldens/`). Every section states the convention, the formula, and
the **rejected alternative** (so reviews stop re-litigating). Markers:
- **[DECIDED]** — locked; a review challenges it only with a citation.
- **[CONFIRMED DR-x]** — the Phase A research pass (results in `rebuild/research/`) confirmed
  the draft convention; citation recorded.
- **[AMENDED DR-x]** — the research pass **changed** the draft convention; old → new recorded
  in the Changelog below.
- **[OWNER]** — needs the owner's call before v1.0.

The spec is **versioned**: v1.0 at Phase A sign-off; amendments during B–E via changelog entry
+ golden-workbook update, re-reviewing only the touched section. Code may never deviate from
the current spec version.

---

## §1 Periodicity & timing [CONFIRMED DR-2]

Annual periods, flows at period end. Year 0 = close. Hold = N years; exit flows at t = N.
Mid-year convention (display option on IRR only): interim flows shift to t−0.5; **the exit
flow never shifts.** **What the toggle does NOT do [v1.1.1 — resolved; the governing
document previously left it open]: it never REPLACES an engine output.** ModelOutput always
carries BOTH — `irr` is always the period-end convention and `irr_mid_year` always the
shifted one — and `mid_year_irr` selects only which the UI HEADLINES. "Display option"
means exactly that: swapping the meaning of `irr` under a toggle would make a stored
`ModelOutput` ambiguous without its assumptions, and would deny the UI the ability to show
the timing effect as a difference (which §15's disclosure discipline requires). DR-2 Item 3 confirms this is "School B" — the internally consistent
convention, because an exit-multiple sale is a point-in-time year-end event; pulling exit to
t−0.5 while the debt schedule accrues full-year exit-year interest contradicts quantum with
timing (Macabacus end-period default; *Sunbelt Beverage* Delaware appraisal caution against
mixed conventions). Interim sponsor flows exist exactly when interim distributions are on
[v1.1.0 — §3 step 7]: under mid-year, a distribution paid in year t < N shifts to t−0.5
like any interim flow, while the YEAR-N distribution is part of the year-N sponsor flow and
NEVER shifts (it rides the exit event — one period-N flow, School B kept internally
consistent). **Stream scope [v1.1.1 — stated; already the shipped behaviour]:** the option
applies to the SPONSOR-SIDE streams only (sponsor net + pre-promote); the unlevered stream
always uses period-end times. That scope is what makes the inertness claim true — the
unlevered stream carries interim UFCF in every deal, so a model-wide mid-year option would
never be inert. With an empty distribution schedule the option is therefore numerically
inert and the UI says so. Pinned by G2-DIST (§17): sponsor IRR 13.3906% period-end vs
**13.4572% mid-year**, and `irr_mid_year ≡ irr` on all six pre-G-1 goldens.
**Magnitude [CORRECTED v1.1.1 — the drafted "~0.5–1.0pp" was wrong for this engine]:** that
range describes a model whose interim flows carry real weight. Here the NON-shifting exit
flow dominates the stream, so the measured uplift is far smaller: **+6.7bp on G2-DIST and
+22.0bp on G3-DIST** — and exactly **zero** with an empty schedule. Disclosed as timing,
never as alpha; the UI must not promise a percentage-point effect the engine cannot produce.
v2 upgrade path: XIRR on actual close/exit dates with a first-year stub (DR-2's preferred
practice), which retires the convention toggle entirely.

## §1.1 Entry EBITDA basis — LTM quarter-stitch [v1.2.0 — G-2; DATA-SIDE, engine unchanged]

**The problem this closes.** §11 sizes leverage and tests covenants on "FY(LTM) EBITDA", but
the extraction layer today feeds the engine the latest COMPLETE fiscal year only — which can
be up to ~15 months stale by the time a deal is modelled (a filer 11 months into its next
year, plus the ~45-day 10-Q / ~60–90-day 10-K filing lag). For a fast-growing or
recently-impaired target that materially misstates current EBITDA, and every downstream
number (entry EV at a fixed multiple, leverage, the whole model) inherits the error. G-2
makes the sizing figure the most-current TRAILING-TWELVE-MONTHS value when interim filings
allow, and DISCLOSES the as-of date and basis when they do not.

**This is a DATA-SIDE feature (Tier B).** The ENGINE is unchanged: it still consumes exactly
one EBITDA number (`DealFacts.fy_ebitda`) and one revenue number, through the same arithmetic.
G-2 only changes WHAT that number is (a stitched LTM instead of the last FY) and adds its
provenance/as-of. **Tier-B admission ticket [corrected 2026-07-25 after the tier-governance
review]: an EMPTY git-diff over the ENGINE ARITHMETIC PATH** (`lib/engine2/kernel/**` + the
arithmetic modules behind `facade.ts`; changes confined to `lib/edgar/**`, `factsAdapter.ts`,
additive Class-A `types.ts` fields, and display) — a mechanical, coverage-INDEPENDENT proof.
Golden byte-identity is a REQUIRED secondary check but NOT the ticket: this project's
`DERIVATION.md` documents engine mutations that leave every golden byte-identical, and
`fy_ebitda`'s consumers are golden-covered anyway, so byte-identity alone cannot distinguish
"data-side" from a golden-uncovered engine edit. The STITCH is adjudicated by DATA-LAYER
fixtures bound to the `DERIVATION.md` method — a DIFFERENT-LANGUAGE reference derivation with
zero imports of the code under test, two independent hand-derivation passes, the same
±$0.005m / ±0.1bp golden-adjudication bar (§15), and a CI regeneration gate equivalent to `tests/goldens.test.ts`. (The
stitch is DISTINCT from the deferred *quarterly engine periods* below — that would change §1's
period model and is Tier A; this does not touch the engine arithmetic path at all.)

**Convention.** The sizing EBITDA (and revenue) is the most-current 12-month figure available:
- **LTM-stitched** when the filer has interim filings covering a partial current year; else
- **the latest complete fiscal year (FY)**, with staleness disclosed;
- **never** an annualized partial period (see rejected alternatives).

**The stitch (normative formula).** For a duration metric M, with the latest complete fiscal
year FY covering [Y_start, Y_end] and the most-recent interim period ending at date `e` (the
current partial year running from the current fiscal start `C_start` to `e`):
```
LTM(M) = FY(M)  +  YTD_current(M)  −  YTD_prior(M)
  FY(M)           = M over [Y_start, Y_end]                       (the last full year)
  YTD_current(M)  = M over [C_start, e]                           (this year, through e)
  YTD_prior(M)    = M over [C_start − 1yr, e − 1yr]               (last year, same span)
```
The telescoping to "the 12 months ending at `e`" holds ONLY under the alignment preconditions
below; it is NOT an unconditional identity, and a violation produces a silently-wrong number
that compounds through the whole model — so the preconditions are EXECUTABLE GATES, not prose.

**Alignment preconditions [F1/F7 — the stitch REFUSES → FY fallback if any fails].**
1. **FY abuts the current partial year:** `Y_end + 1 day = C_start`. A fiscal-year change (a
   FYE move, e.g. Dec-31 → Jun-30) leaves the latest full-year FY NON-adjacent to the current
   partial; `FY + YTD_current − YTD_prior` then spans a >12-month window with a hole and is
   garbage. The day-count windows CANNOT catch this — a transition H1 (181 days) sits inside
   the 6-month window and each YTD still passes its own window; only the abutment date check
   catches it. Refuse and fall back to the most-recent GENUINE full year, staleness disclosed.
2. **Neither YTD span crosses a fiscal-year-end:** `[C_start, e]` and its prior-year mate lie
   within a single fiscal year each. A YTD that straddles a FYE is not a clean partial-year
   cumulative and breaks the subtraction.
3. **YTD_prior is the filer's REPORTED prior-year COMPARATIVE for the same fiscal-period ROLE,
   matched by role + END date — NEVER a calendar "date − 365".** `[C_start − 1yr, e − 1yr]`
   above is notation; the implementation must select the filed prior-year span of the same
   role (9-month vs 9-month), because a 52/53-week filer's prior-year 9-month can be 39 or 40
   weeks (273 or 280 days). Where the two YTD spans differ by the 53rd week, the stitch is off
   by ≤ 1 week of the metric (~2% of a year) — this 52/53 approximation is DISCLOSED in
   provenance, not silently absorbed. The threshold is EXACT, not prose: a 53-week fiscal year
   carries exactly ONE extra week, so a legitimate 53rd-week span difference is **exactly 7
   days**. Therefore **|Δspan| ≤ 7 days is accepted-with-disclosure; |Δspan| > 7 days REFUSES**
   → FY fallback (a real misalignment, not the 53rd-week case). [Q1 — day count pinned so it is
   not re-litigated in code.]
**Q4-standalone fallback:** US GAAP filers report YTD figures in 10-Qs and only the FULL year
in the 10-K (a standalone Q4 is rarely filed). When only YTD + FY exist, the standalone final
stub is `Q_last = FY − YTD_9M`; the stitch above never needs a standalone quarter, but a stub
is required to build a clean quarterly SERIES for display and is computed this way — and the
stub is itself REFUSED (leaves a hole in the display series, never a fake) when FY or YTD_9M is
absent (the D1 honesty rule extends to the stub).

**Derived EBITDA stitches per COMPONENT.** EBITDA is not a filed tag; it is
OperatingIncome + D&A (or the §7 component chain). LTM EBITDA = LTM(operating income) +
LTM(D&A) — each component stitched independently and combined ONLY where all three spans
(FY, YTD_current, YTD_prior) resolve for EVERY component. If any component is missing at any
of the three spans, the stitch is REFUSED for EBITDA and the basis falls back to FY with a
disclosed note — never a partial-component fake total (the D1 honesty rule, history.ts rule 5).
**Interim-D&A is the load-bearing reliability gate [F5]:** operating income is reliably on the
interim income statement, but D&A lives in the interim cash-flow statement and its tag
frequently switches between a combined concept and split concepts across FY vs 10-Q — so
**EBITDA falls back to FY more often than revenue**, and the amendment does NOT oversell
"currency" for the one number that matters most. The feature's honest promise is "LTM when the
components are all there, FY otherwise, always disclosed."

**Single-basis rule for the sizing PAIR [F4 — revenue and EBITDA must share ONE basis].**
Revenue is a single filed tag (stitches whenever interims exist); EBITDA is component-derived
and refuses more readily. They must NOT land on different bases: if EITHER the revenue stitch
OR any EBITDA component refuses, **BOTH `fy_revenue` and `fy_ebitda` fall back to FY**, and the
margin is recomputed from the same-basis pair. Otherwise `factsAdapter` would form
`fy_ebitda_margin = FY_EBITDA ÷ LTM_revenue` (neither the FY nor a true LTM margin) and the
engine would project the whole trajectory from LTM revenue while leverage was sized on FY
EBITDA — the year-0 implied EBITDA would no longer equal the entry EBITDA it was sized on, an
internal inconsistency in the core fact pair that drives every downstream number. One basis for
the pair, or FY for the pair.

**52/53-week filers and fiscal-year changes.** Spans are identified by FISCAL-PERIOD role
(full year / 9-month YTD / quarter), NOT by exact day count, because 52/53-week retailers and
mid-history fiscal-year changes make exact counts unreliable. The day-count windows widen
accordingly and extend the existing history.ts full-year rule (350–380 days): full year
350–380, 9-month YTD 250–285, 6-month YTD 165–200, quarter 80–100. A span whose duration
falls in no window is not used for stitching (it stays a hole, honestly). Period identity
remains END-DATE-keyed (D1 rule 3); tags resolve per-period (rule 1) and a stitching metric whose
WINNING tag differs across the three stitch spans **REFUSES → FY** [accuracy audit tightening]: a
mixed tag (e.g. `Revenues` at FY vs `RevenueFromContractWithCustomer…` at the interims) mixes two
revenue DEFINITIONS in the sizing figure, so — like the vintage (F3) and single-basis-pair (F4)
rules — it fails CLOSED rather than shipping a disclosed-but-possibly-wrong LTM. (The rule-1 "flag"
is display-only; the SIZING basis needs the stricter refusal because its blast radius is the whole
model. The goldens use single canonical tags; this bites only the production multi-tag path, which a
directed conformance test pins.)

**Cross-span vintage/basis consistency [F3 — per-period latest-vintage does NOT deliver it;
this was a real hole].** `history.ts` resolves each `(start, end)` group to ITS OWN latest
`filed` vintage INDEPENDENTLY — there is no cross-span coordination. In the ordinary mid-year
case the three stitch spans come from three different filings, and the prior-YTD's winning
vintage is typically NEWER than the FY's: a discontinued-operations / segment reclassification
during the current year restates the prior-year COMPARATIVE (in the new 10-Q) to a
continuing-only basis, while the latest FY total (from the older 10-K) still INCLUDES the
reclassified segment. `LTM = FY_incl + YTD_cont − prior-YTD_cont` then mixes an
inclusive FY with continuing-only interim pieces and overstates sizing EBITDA (a worked case
runs ~12% high) — straight into EV and leverage. **Per-period latest-vintage is exactly what
CREATES this mix; it is not a defense against it.**

The rule is **FAIL-CLOSED [M1 — corrected from a fail-open draft; condition (a) re-formalized in
round 3 as vintage-PRESENCE, not `filed`-equality].** The hazard is a VALUE change — a span whose
figure was RESTATED (discontinued-ops / segment reclassification) after the FY was filed — so the
test is the restatement note, gated by whether that note is even MEANINGFUL:
- (a) **The restatement check is EVALUABLE.** For every restatement-risk span (the prior-YTD, and
  any span carrying a prior-period comparative), the ORIGINALLY-filed vintage is RETAINED alongside
  the latest, so history.ts has both to compare. EDGAR/companyfacts retains all filed vintages, so
  this holds on the domestic path. If only a SINGLE vintage per period was captured (an ESEF/IFRS
  extraction that kept just the latest), there is nothing to compare against — the check is
  VACUOUS — so the stitch REFUSES rather than proceeds blind. **This is NOT a `filed`-date-equality
  test:** in the ordinary mid-year stitch the prior-YTD's winning vintage is a newer 10-Q's
  re-reported comparative and NECESSARILY post-dates the FY 10-K — that is the normal state, not the
  hazard, and must not by itself refuse (an earlier draft that required equal `filed` dates was
  UNSATISFIABLE — a 10-K full year and a 10-Q interim never share a filing — and would have made the
  stitch a silent FY-only no-op). AND
- (b) **history.ts's ">1% restated vs originally-filed" note does NOT fire on ANY span.** This is
  the operative test: a VALUE divergence between a span's original and latest vintage is what mixes
  bases. Fire on any span ⇒ refuse.

**Operative rule: stitch iff (b) is meaningfully evaluable (original vintages present) AND no >1%
restatement note fires on any span; otherwise refuse → FY fallback (disclosed).** This inverts the
earlier fail-open draft ("proceed UNLESS a divergence is caught," leaning on an
"independently-available prior-year Q4 stub" US-GAAP filers do not report — the only prior-Q4 is
`FY − prior_YTD`, circular; the same fail-open posture R2-1 rejected for the tier ticket), WITHOUT
over-refusing the normal case. Worked checks: (1) discontinued-ops reclassification — original 9M
(760) and restated 9M (700) both retained, |Δ| = 7.9% > 1% ⇒ note fires ⇒ **refuse**; (2) normal
grower — original and re-reported 9M agree within 1% ⇒ no note ⇒ **stitch**; (3) ESEF single-vintage
— nothing to compare ⇒ **refuse**. The vintage check detects comparative-RESTATING events (they
leave a >1% footprint on a retained prior vintage). **Known bounded limitation [round-4 MINOR,
disclosed not caught]:** a purely-PROSPECTIVE accounting-standard adoption applied to the current
period WITHOUT restating comparatives (e.g. a modified-retrospective revenue/lease transition)
leaves NO restatement footprint in tagged facts — so there is no numeric signal to fail-closed on,
and the stitch may mix an old-basis prior stub with a new-basis current YTD over the ~one-quarter
non-overlap. This is rare in the modelling window (ASC 606/842 predate 2026), bounded, and — like
the day-count and static-rate simplifications — DISCLOSED in §15 rather than caught. So the three
spans are on a mutually-consistent RESTATEMENT vintage, or the stitch is not taken; a prospective
basis change with no comparative restatement is the disclosed exception.

**Foreign private issuers (FPI) / no-interim filers.** A 20-F filer (e.g. SAP) files
ANNUALLY only — no 10-Q, no YTD points — so the stitch is impossible and the basis is the
latest FY. This is the CORRECT behaviour, not a degradation, but it must be DISCLOSED: the
sizing EBITDA carries an as-of date (the FY period end) and a **staleness badge** by the age
of that anchor relative to the import date:
```
fresh   : anchor ≤ 4.5 months old   (no required filing is yet overdue)
aging   : 4.5–14.5 months           (a filing is overdue, or the next annual is imminent)
stale   : > 14.5 months             (a full annual period has closed AND its filing is overdue)
```
**Threshold derivation [F6 — glossed by FILING-OVERDUE, not "unreported quarter"].** The
boundaries follow regulatory cadence exactly, and the gloss is stated precisely because a
quarter *closes* at 3 months (mid-"fresh"), so "no unreported quarter" would be the wrong
reading: `4.5m` = one quarter (3m) + the ~45-day 10-Q lag = "the next quarterly filing is not
yet overdue"; `14.5m` = one year (12m) + the ~2.5-month 10-K lag (60–90 days) = "the next annual
filing is now overdue." For an FPI the 20-F lag is LONGER (~4 months), so 14.5m is CONSERVATIVE
there — it flags `stale` ~1.5m before the 20-F is even due; a badge that errs toward flagging
staleness is the safe direction (it never changes a number, only the disclosure). Regulatory
cadence, not empirical sector data — so NOT the hardcoded-threshold class the reality-check
feature (#4) forbids; a disclosed convention with its arithmetic shown. (Corrected from the
draft's 13.5, which under-counted the annual lag, and from a "looser bound" gloss [M3] that
mis-stated which lag 14.5m is built on — it is the 10-K's 2.5m, conservative for the 20-F.) A STITCHED LTM also carries an as-of (its
`e`) and the same badge scale (rarely worse than `aging`). The badge marks the AS-OF; it never
changes a number.

**Provenance [F10 — structured fields authoritative, string display-only].** The AUTHORITATIVE
provenance is STRUCTURED (`edgar/types.ts::Provenance`): `as_of` (the LTM end `e`, or the FY
period end on fallback), `basis: 'ltm_stitched' | 'fy'`, `source`, and the per-span tags/filed
vintages. A human-readable STRING (`LTM ending <e> = FY<year> <v1> + YTD <span> <v2> −
prior-YTD <v3>`, or `FY<year> as-of <period_end>, <n> months overdue — no interim filings`) is
DERIVED from those fields for display only — no consumer parses the string. The number traces
to the three filed spans (the §15 traceability rule at the data boundary). Neither path invents
a value: a metric the stitch cannot build stays FY (or MISSING if even FY is absent), never a
default.

**Naming honesty [F8 — reconcile with ledger L-11/C-6].** The rebuild deliberately RENAMED the
old engine's `ltm_*` fields to `fy_*` (DIFF_LEDGER L-11/C-6, PHASE_D D3) precisely because the
old engine MISLABELLED FY figures as LTM. G-2 now writes an LTM value INTO `fy_ebitda`/
`fy_revenue`, which re-opens that hazard — so the mitigation is strict: **basis travels
INSEPARABLY with the value via the structured `basis` field, and NO consumer may infer basis
from the `fy_` field NAME** (the exact failure L-11 named). The `types.ts` doc comment that
today reads "fy_* naming is deliberate — extraction is fiscal-year basis … not LTM" MUST be
updated in the G-2 data PR to "the field holds the §1.1 sizing basis (LTM-stitched or FY), read
`provenance.basis` — never the name." The field name is retained (engine-contract stability);
its meaning is "the current sizing-basis figure," carried with its basis. **The SAME data PR must
also fix the OUTPUT-side comments F8 missed [M2]:** `types.ts::derived.entry_ebitda_for_sizing`
reads `// ALWAYS FY (SPEC §11)` and `entryMultipleDisplay`'s docstring says the FY-canonical figure
is "ALWAYS FY" — both become FALSE once `entry_ebitda_for_sizing` carries the LTM stitch (it is the
sizing basis, which §1.1 makes FY(LTM)). They must read "the §1.1 FY(LTM) sizing basis." These are
CURRENTLY correct (no stitch has landed) and go stale exactly when the data PR flips the fact — the
same field-name-lies-about-basis hazard L-11/C-6 exists to prevent, now on the output side.

**Blast radius [F9 — this is not merely "the sizing fact"].** `fy_revenue`/`fy_ebitda` is the
BASE of the entire model: the projection compounds from it (§7 `rev[t] = rev[t−1] × (1+g)`),
the entry and NTM valuation multiply it (§2/§9), and the exit EBITDA descends from it. Flipping
it to LTM shifts EVERY production deal's entry EV, trajectory, exit, and returns. The Tier-B
classification is still correct (the engine ARITHMETIC is unchanged — it consumes one number
the same way), but the byte-identical §17 goldens therefore say NOTHING about production impact
(they use frozen manual inputs, never the extraction path); the real-data effect is what the
three-issuer walkthrough measures.

**NTM valuation base — the LTM flip × `growth[0]` [B1 — the interaction the sign-off surfaced].**
§9/§11 define the NTM entry valuation as `EV = entry_multiple × (fy_ebitda × (1 + growth[0]))`.
G-2 makes `fy_ebitda` the LTM anchored at `e`, so this becomes `EV = multiple × (LTM × (1 +
growth[0]))` — the projection base changes meaning, and NTM entry is golden-uncovered (§9), so
nothing downstream would catch a wrong resolution. It is DECIDED here, not left to a future
engineer:
- **`growth[0]` is an ANNUALIZED rate, not a fixed "FY_next ÷ FY_this" step.** The suggestion
  layer derives it FY-over-FY from CONSECUTIVE year-ends (`history.ts::yoyGrowths`, 335–395-day
  pairs; `cagrOverTrueSpan`) — a per-annum rate, VERIFIED in the code, not assumed. Applying a
  one-year annualized step to any trailing-twelve-month base is therefore well-typed:
  `LTM(ending e) × (1 + growth[0])` = "the twelve months FOLLOWING `e`."
- **This makes NTM MORE literal, not a category error.** Pre-G-2, `FY × (1 + growth[0])` advanced
  a possibly-15-month-stale FY base by a year → a window ending ~FYE + 1yr, which is NOT "the next
  twelve months" from the deal date. Post-G-2 the base is the twelve months after the most recent
  ACTUAL data — which is what an NTM basis is meant to be. The re-timing is the intended currency
  improvement (the same reason the FY→LTM flip exists), not an over-projection; it is ~0.67·g of
  EV at most (the LTM/FY centre offset), and in the CORRECT direction.
- **The FY-entry path is unaffected at entry** (`EV = multiple × LTM`, no growth multiply); it
  simply sizes off the more-current base, and the projection/exit advance from it as intended. B1
  is narrowly the NTM valuation base, coherent under the annualized-`growth[0]` semantics.
- **Disclosure already fits.** `entryMultipleDisplay`'s "FY/LTM canonical" line (§11 [v1.1.3])
  shows `EV ÷ entry_ebitda_for_sizing`, which §1.1 makes the FY(LTM) sizing basis — the label reads
  "FY/LTM," correct by construction once the fact flips (with the M2 comment fix). A directed NTM
  fixture (viii) pins it, since NTM is golden-uncovered.

**Rejected alternatives.**
1. *Latest complete FY only* (the status quo). Rejected — up to ~15 months stale; badly
   misstates current EBITDA for a fast mover or a company past a recent impairment/step-change,
   and the error compounds through entry EV → leverage → the whole model.
2. *Annualize the latest quarter × 4* (or the latest YTD ÷ fraction × 1). Rejected — ignores
   SEASONALITY; a Q4-heavy retailer's Q1 × 4 is wildly wrong. The stitch uses a full trailing
   year and is seasonality-neutral by construction.
3. *Average four standalone quarters.* Rejected — fragile: filers report YTD, not always
   standalone quarters, and a standalone Q4 is rarely filed. The YTD-based stitch uses figures
   filers actually report and needs fewer of them.
4. *Change the engine to quarterly periods* to get currency. Rejected here — that is the
   Tier-A "quarterly engine periods" deferral (below), a different and larger change; LTM
   stitching gets currency on the SIZING FACT without touching the annual engine.

**Golden/adjudication [Tier B].** Adjudicated by DATA-LAYER fixtures — synthetic
companyfacts-shaped inputs with quarterly/YTD points — whose stitched output is derived by a
DIFFERENT-LANGUAGE reference implementation (zero imports of the extraction code under test)
and hand-checked by TWO independent passes at the ±$0.005m / ±0.1bp golden-adjudication bar (§15), then pinned by a CI
regeneration gate that re-runs the reference and fails on drift (the `tests/goldens.test.ts`
mechanism, redirected at the stitch — NOT an ordinary same-language fixture, which would be
adjudicated by the same logic it checks). Required fixtures (each hand-derived; the REFUSAL cases assert the FY-fallback + disclosure,
which is where the silent-wrong-number bugs the sign-off found actually live):
(i) a clean US GAAP domestic filer mid-year (Q3 interim) — the FY + YTD − prior-YTD path,
    exercising the D&A-PRESENT three-span EBITDA stitch explicitly (not just revenue) [F5]; the
    prior-YTD's winning vintage is a NEWER 10-Q's re-reported comparative at an UNCHANGED value (the
    normal state) — assert the stitch PROCEEDS, i.e. the M1 vintage rule does NOT refuse merely
    because that vintage post-dates the FY 10-K (pins the silent FY-only no-op regression) [M1];
(ii) a 52/53-week filer — the widened day-count windows incl. a 53rd-week quarter, AND a
     prior-year 9M that is 280 days vs a current 273-day 9M — assert role-matched selection and
     the ≤1-week approximation disclosed, not a silent mismatched subtraction [F7];
(iii) an FPI / annual-only filer — the FY-fallback + staleness badge, no stitch;
(iv) a missing-EBITDA-COMPONENT case — the per-component refusal → BOTH revenue and EBITDA drop
     to FY (the single-basis-pair rule), margin recomputed same-basis [F4];
(v) an ABUTMENT-FAILURE case (a fiscal-year-end change: a genuine full-year FY present but
    NON-adjacent to the current partial, each span individually passing its window) — assert
    the abutment date check REFUSES → FY fallback, NOT a garbage stitch [F1];
(vi) a RESTATED prior-YTD across filing vintages (a discontinued-ops reclassification: FY from
     the older 10-K on the inclusive basis, prior-YTD restated continuing-only in the newer
     10-Q) — assert the stitch REFUSES → FY fallback (the >1% restatement note / vintage
     divergence rule), because per-period latest-vintage would otherwise MIX bases and overstate
     [F3 — corrected from the draft, which falsely asserted latest-vintage kept it consistent];
(vii) a revenue-stitchable-but-EBITDA-refuses case — assert BOTH fall to FY, not a mixed pair;
(viii) an NTM-ENTRY case on a stitched LTM base [B1] — assert the NTM valuation base is
     `LTM × (1 + growth[0])` with `growth[0]` the ANNUALIZED FY-over-FY rate (not an FY-step),
     the entry multiple labels NTM, and the FY/LTM-canonical figure (`EV ÷ entry_ebitda_for_sizing`)
     sits on the SAME LTM basis — directed + mutation (mutate `growth[0]`'s semantics and the base
     to the stale FY), since NTM is golden-uncovered;
(ix) an ESEF/IFRS filer with a SINGLE vintage retained per period — assert the restatement check is
     un-evaluable ⇒ the stitch REFUSES → FY fallback (fail-closed on an unverifiable vintage), not a
     blind proceed [M1].
The engine goldens are NOT regenerated; their byte-identity is a REQUIRED secondary check, and
the PRIMARY Tier-B ticket is the empty engine-arithmetic-path git-diff (above).

Deferred: quarterly ENGINE periods (a §1 period-model change, Tier A — distinct from the
data-side LTM stitch above), day-count computation (disclosed-bias note in §4 instead).

## §2 Sources & Uses at close [CONFIRMED DR-2]

Convention: **cash-free / debt-free acquisition**; the model transacts on EV.

```
USES:    Enterprise value
       + Transaction & advisory costs (buy-side)          [suggested 2.0% of EV — DR-4 Cat.6]
       + Financing fees (capitalized, §7)                 [suggested 1.5% of debt — DR-4 Cat.6;
         base = total commitments INCLUDING the undrawn revolver — DR-2 Item 1 flags the
         forgotten-revolver-fee error explicitly]
       + OID (= Σ tranche par × oid_pct; funded at close, capitalized)
       + Cash to balance sheet  (= min_cash floor — funds opening cash so §3 is coherent from Y1)
SOURCES: Debt at par (Σ tranche principal)                ← always FACE value; OID sits in uses
       + Management rollover equity
       + Sponsor equity (plug)
```
DR-2 Item 1 confirms: fees and OID sit in Uses and increase the sponsor check; debt is raised
at face with OID separate (netting proceeds into the source line is a flagged error); rollover
reduces the sponsor's cash check and returns are computed on the sponsor-only check.
Solvency check: sponsor equity > 0. Sources ≡ uses by construction.
Rejected: opening cash = 0 with silent Y1 revolver draw; target cash as a source; net-of-OID
debt sources (double-count risk — DR-1 Item 5 reviewer-flag).

## §3 Annual cash waterfall [DECIDED mechanics; grid CONFIRMED DR-1/DR-4]

One **running cash variable** `cash` per year; every step depletes or feeds it exactly once
(double-counting between revolver repay and sweep is structurally impossible; invariant §14.3).

```
cash = opening_cash + FCF_pre_debt                    (FCF_pre_debt from §7 — after cash taxes)
1. − cash interest (all tranches, §4)
2. − commitment fees (undrawn revolver × fee)
2R. − refinancing cash cost [v1.3.0 — §18.4]: for any tranche refinanced THIS year, a
     mandatory financing use = call premium + new OID + new financing fees, senior to
     mandatory amort/sweep/distributions (0 when no refi lands this year). See §18.
3. − mandatory amortization: straight-line % of ORIGINAL FACE per schedule, capped at
     outstanding (DR-1 Item 7: amort is computed on original principal, never the declining
     balance — beginning-balance amort is a named reviewer flag)
4. − voluntary revolver repayment: repay drawn revolver down to 0 from cash above min_cash
     (DR-1 Item 2/3: revolver is repaid FIRST, ahead of term-loan sweeps)
5. ECF sweep:
     pool         = max(0, cash − min_cash)
     sweepable    = sweep_pct × pool                   ← sweep % applies to the POOL
                    (DR-1 Item 2 confirms the modeling convention: % of cash flow available —
                     including beginning excess cash above the floor — never % of balance)
     step-downs   : sweep_pct steps down on a net-leverage grid. Each tier is the leverage
                    STRICTLY EXCEEDED (`above_net_leverage`, strict `>`), so a value exactly on a
                    threshold takes the LOWER tier: 75% (>4.5x) → 50% (>3.5x, ≤4.5x) → 0% (≤3.5x).
                    The 50% base LEVEL and this lender-friendly grid are
                    [CONFIRMED DR-4 Cat.5, LSTA via CT Acquisitions]; running the base preset
                    FLAT (no step-downs) is a [DECIDED] v1 simplification — DR-4's own
                    recommended base is 50% with step-downs, available via the grid preset
     application  : by tranche sweep_priority (asc), pro-rata within a tier,
                    each application capped at that tranche's outstanding balance;
                    unapplied sweepable (all sweepable debt retired) stays in cash
6. + revolver draw: if cash < min_cash, draw min(shortfall, undrawn commitment);
     if still short → cash floor breach flag (§14.6). Post-breach semantics [v1.0.3]:
     the year closes below the floor with the flag set; closing cash MAY be negative;
     conservation (§14.3) is never clamped. Every subsequent year runs with the
     inherited (possibly negative) opening cash and carries a block-severity
     `cash_floor_breach` coherence flag; the run's outputs render with the insolvency
     warning. ("Never negative cash" described the draw-to-floor design goal, not a
     clamp — a deep enough hole is reported, not hidden.)
7. − interim distribution [v1.1.0 — G-1]: pay the year's REQUESTED distribution, capped
     twice and floored at zero:
       paid = max(0, min( request[t],
                          cash − min_cash,                    ← never dip below the floor
                          rp_max ))                           ← restricted-payment trap, below
     No step feeds cash after this — a distribution can never be revolver-funded (step 6
     precedes it; a draw exists only to reach min_cash, and cash − min_cash caps at what
     sits ABOVE the floor). Blocked-or-clipped amounts are NOT accrued — no catch-up claim
     carries forward (rejected alternative: an owed-distributions ledger — complexity with
     no v1 need; real RP baskets don't accrue unused capacity by default either). In a
     `cash_floor_breach` year (cash < min_cash entering step 7) paid = 0 by arithmetic.
     (Voluntary prepayments credited against the ECF requirement — DR-1 Item 2's
     real-agreement nuance — REMAINS DEFERRED; it is a sweep-credit mechanism, not a
     distributions mechanism, and re-enters on its own spec line when prioritized.)
closing_cash = cash
```

**§3.7 Restricted-payment trap (the cash-trap covenant) [v1.1.0 — G-1].** The trap is the
credit-agreement RP test: a distribution is permitted only if, PRO FORMA for the payment,
the tested metric still passes (real agreements test giving effect to the payment). With
the v1 metric `net_leverage` the pro-forma test is LINEAR in the paid amount, so the
maximum permitted distribution has a CLOSED FORM — no solver, no iteration, sequentiality
preserved (the no-solver rule stays intact; the backlog's feared "first true same-year
cycle" dissolves because interest is beginning-balance (§4) and the year's debt service is
already fixed when step 7 runs):

```
trap OFF (covenants.rp_trap = null)  ⇒ rp_max = +∞ (the two cash caps still bind)
trap ON  (metric 'net_leverage', level L):
  rp_max = max(0, cash − (gross_debt_end − L × EBITDA_adj[t]))     ← NORMATIVE, all EBITDA
  gross_debt_end = post-step-1..6 par outstanding incl. accrued PIK to date (same debt
  definition as §11 net leverage; EBITDA_adj[t] = the year's adjusted EBITDA, §11 basis)
```

**The closed form is normative for ALL values of EBITDA_adj (including ≤ 0).** For
EBITDA_adj > 0 it is algebraically equivalent to the ratio statement "pro forma,
(gross_debt_end − (cash − paid)) / EBITDA_adj[t] ≤ L"; for EBITDA_adj ≤ 0 the ratio form
INVERTS (dividing by a negative number; undefined at zero) and would absurdly permit unlimited payouts in
exactly the loss years a lender locks down — the closed form's money inequality
(post-payment net debt ≤ L × EBITDA_adj) is the economically meaningful reading and yields
rp_max = 0 whenever L × EBITDA_adj[t] ≤ gross_debt_end − cash [REJECTED alternative: the
literal ratio test for E ≤ 0].

**Draw-invariance [v1.1.1 — adjudication finding].** `rp_max` is INVARIANT to a step-6
revolver draw: a draw of *d* adds *d* to `cash` AND *d* to `gross_debt_end`, and the two
cancel inside `cash − (gross_debt_end − L × EBITDA_adj)`. So "a distribution can never be
revolver-funded" holds for a SECOND, independent reason beyond step ordering — a draw
creates exactly zero RP capacity, and after a draw-to-floor the `cash − min_cash` cap is
zero as well. The guarantee does not rest on the step order alone.

A year is **trap-blocked** — `distribution_blocked[t] = true` on the waterfall row — iff
the trap clipped what cash alone would have allowed:
`rp_max < min(request[t], max(0, cash − min_cash))` (ties: when rp_max exactly equals the
cash-capped amount, the trap did not bind and the flag stays false). Any blocked year raises the
coherence WARN `distribution_blocked` once per run (message lists the blocked years) — a
sponsor plan that assumes blocked distributions must see it. Metric `'dscr'` for the trap
is REJECTED in v1: DSCR's numerator (§11) is the year's own FCF, which the distribution
does not change, making the "pro-forma" framing vacuous — a DSCR-triggered trap variant
re-enters only with evidence it is tested pro-forma in practice. Distributions never enter
DSCR/FCCR/ICR or FCF conversion (§11 discipline: discretionary equity flows sit below the
line, exactly like sweeps).
Rejected (the old engine's mechanic): "sweep % × outstanding" as a per-tranche cap with no %
applied to the pool — DR-1 Item 2 (WSO worked example) confirms the standard interpretation
is "% of cash flow available," and the difference materially changes deleveraging speed.
PIK notes never participate in the sweep unless `sweep_priority` explicitly set [DECIDED].
Call protection: **BSL soft call ignored in v1 — research-backed** [CONFIRMED DR-1 Item 6]:
101 soft call runs only ~6 months and **ECF sweeps and mandatory amortization are exempt**;
the premium applies only to repricing/refinancing (a v2 feature). **Disclosed v1 limitation
(DR-1 reviewer flags):** that exemption is BSL-TLB-specific — private-credit tranches
(unitranche/mezz) typically carry **102/101 HARD call** applying to voluntary and certain
mandatory prepayments, and a change-of-control 101 put can bind at exit; v1 ignores both,
stated on the assumptions page, with re-entry via the Phase G call-protection/refinancing
module. HY make-whole likewise enters only with Phase G refinancing.
**v1 structural constraint [v1.0.3; refined v1.3.0]:** every term-tranche maturity must
exceed `hold_years` — no balloon repayment inside the hold. A **refinancing** (§18) does NOT
relax this: it re-terms a tranche mid-hold but the NEW maturity must still exceed the
remaining hold (`(R−1) + new_maturity_years > hold_years`, §18.3). Violation is an input-gate
rejection, not a computed default.

## §4 Interest & rates [CONFIRMED DR-1 — kept as disclosed minority convention]

- **Cash interest = beginning-of-year balance × all-in rate.** DR-1 Item 1: the dominant
  teaching convention is average(beg, end) with a circularity toggle, but beginning-balance
  is the named alternative "used by some banks that ban circular refs for stability,
  accepting a small conservative bias," and **"what a reviewer will not accept is an
  undisclosed choice"** — so this stays, disclosed, because it makes the model strictly
  sequential (§5), hand-auditable, and exactly golden-reproducible. Bias: slightly overstates
  interest on amortizing/swept tranches (conservative for returns).
  **Day-count disclosure [CONFIRMED DR-1 Item 1]:** annual accrual understates Actual/360
  cash interest by ~1.0–1.4% of the interest figure; the day-count basis is **stated per
  tranche** (Actual/360 loans, 30/360 notes) in the methodology footnote, and a per-tranche
  365/360 gross-up factor is a v2 refinement.
  Rejected: average-of-beginning-and-ending (creates circularity, needs a solver, blocks
  exact goldens); the old engine's beginning/post-mandatory-amort hybrid (nonstandard).
- **Floating: all-in = max(base, floor) + spread** [CONFIRMED DR-1 Item 4 — floor applies to
  the base rate before margin, "modeled as a MAX, never an addition"]. Base = Term SOFR
  (LIBOR ceased June 30, 2023 — a legacy-LIBOR reference is a reviewer flag). Floor
  suggestions: 0.00–0.50% US BSL, 0.00% Europe; 0.75–1.00% only for private-credit tranches
  (DR-1/DR-4). Static base rate in v1; forward curve v2.
- **PIK: accrual = beginning balance × pik_rate**, compounds into balance at year end; no
  cash. The fixed-rate `pik_note` (BOTH legs every year: cash_coupon paid + pik_coupon
  accrued) is the base shape; the PER-YEAR whole-coupon cash/PIK ELECTION is §20 [v1.5.0]
  (`elections: null` ≡ this fixed shape). AHYDO note in §6/§20.4.
- **Commitment fee** on BEGINNING-of-year undrawn commitment (draws happen at waterfall step 6, year-end) [CONFIRMED DR-1 Item 8; adjudication 2026-07-05]: sits in
  the finance-cost line and **in DSCR debt service**; not in ICR's interest. Agency/L-C fee
  granularity is deliberately out of scope ("overkill for an annual LBO" — DR-1).
- Revolver interest on **beginning drawn balance** (DR-1 Item 3 names this the
  circularity-avoiding alternative; draw/repay happen at year-end in §3).

## §5 Evaluation order — no solver [DECIDED]

For each year t: rates → interest & fees (from opening balances) → tax (§6, interest now
known) → FCF pre-debt (§7) → waterfall (§3) → closing balances/cash → next year. There is no
intra-year circular dependency under §4's convention; engine2 v1 contains **no fixed-point
iteration**. Goldens reproduce exactly; convergence flags/tolerances don't exist. DR-1
confirms the industry's own reason for the average-balance toggle is precisely to escape this
circularity — we escape it by convention instead. If a v2 feature introduces a true cycle,
the solver enters as its own spec'd module. (The once-feared exemplar — a same-year
covenant-triggered distribution trap — turned out NOT to be one: §3.7's pro-forma test is
linear in the payment, closed-form, cycle-free [v1.1.0]. A genuine cycle would be e.g.
average-balance interest, or a trap whose metric depends on the payment with NO closed-form
inverse — dependence alone is not a cycle; non-invertibility is.)

## §6 Tax [v1.0 — fully determined state machine; two NOL pools]

Per year, on the running tax state {acquired NOL, post-close NOL, §163(j) carryforward}.
All quantities defined; no step is left to inference.

```
ATI basis        : 'ebitda' → ATI = EBITDA_adj   (post-OBBBA default; monitoring fee is a
                   deducted expense, so ATI is on the ADJUSTED figure)
                   'ebit'   → ATI = EBITDA_adj − D&A   (pre-2025 fiscal years)
capped pool      = cash interest + PIK accrual + OID amortization        (§163(j) interest)
uncapped deds    = financing-fee amortization + commitment fees
                   + exit-year unamortized-fee write-off (year N only, §9)
                   (debt issuance costs & commitment fees are NOT §163(j) interest —
                    Treas. Reg. §1.163(j)-1(b)(22); deducted in full)

1. Interest deduction:
   if !interest_deductible:        deductible = 0; carryforward stays 0 (permanent
                                   disallowance — nothing accrues under a BEAT-style flag)
   elif !s163j.applies:            deductible = capped pool (+ carryforward, fully released)
   else:
     available   = capped pool + opening 163j_carryforward
     cap         = max(0, ati_pct × ATI)            (negative-ATI floor)
     deductible  = min(available, cap)
     new 163j_carryforward = available − deductible (≥ 0; indefinite)
   The carryforward is POST-CLOSE ONLY in v1 (opening balance = 0 at close); acquired
   §163(j) carryforwards and their §1.383-1(d) absorption ordering are out of scope,
   disclosed on the assumptions page.

2. taxable_before_NOL = EBIT − deductible − uncapped deds
   LOSS BRANCH (explicit): if taxable_before_NOL ≤ 0:
     NOL usage = 0 (both pools); post-close NOL += −taxable_before_NOL; cash tax = 0;
     skip steps 3–4 (the min-rate floor never produces negative tax).

3. NOL usage — TWO pools, acquired first (absorption ordering):
   acquired_cap_pct = arose_pre_2018 ? 1.00 : 0.80
   acquired_used  = acquired_usable
                    ? min(acquired_NOL, s382_annual_limit ?? ∞,
                          acquired_cap_pct × taxable_before_NOL)
                    : 0
   postclose_used = min(postclose_NOL,
                        max(0, 0.80 × (taxable_before_NOL
                                       − (arose_pre_2018 ? acquired_used : 0))
                               − (arose_pre_2018 ? 0 : acquired_used)))
                    (post-close NOLs are post-2017 by construction. Post-2017 acquired
                     layer: shared 80% aggregate cap on the FULL base. Pre-2018 acquired
                     layer: its own 100% cap; the post-close 80% cap then applies to the
                     RESIDUAL income after the pre-2018 layer — IRC §172(a)(2)(B)(ii)
                     computes the 80% base as income after pre-2018 NOL usage.
                     [CORRECTED v1.0.3 — the v1.0 form put the 80% cap on the full base
                     alongside an unreduced 100% layer, so aggregate usage could exceed
                     taxable income, silently burning post-close NOLs for zero benefit
                     and overtaxing later years. Aggregate usage ≤ taxable income now
                     holds in both branches by construction. Golden-uncovered: every
                     golden runs arose_pre_2018 = false; fixtures unchanged.])
   §382 applies ONLY to the acquired pool; post-close NOLs are unrestricted [DECIDED].
   The §382 limit is STATIC per year (unused limitation carryforward omitted —
   conservative, disclosed). Basis: target (loss corporation) equity value immediately
   before the ownership change × LTTER — in this model's cash-free/debt-free frame the
   target's pre-change equity value = EV (the target has no pre-close net debt at the
   moment of change). [CORRECTED v1.0 — the v0.96 "sponsor + rollover" gloss was wrong.]

4. cash tax = max(rate × (taxable_before_NOL − acquired_used − postclose_used),
                  min_rate × taxable_before_NOL)
   Minimum on the PRE-NOL base [DECIDED]. NOL usage from step 3 is consumed in full even
   when the floor binds (no min-tax credit, no usage optimization — conservative,
   disclosed on the assumptions page).
```

Ordering §163(j) → §382-limited acquired NOL → 80% cap → cash tax [CONFIRMED DR-3].
**Acquired-NOL survival default = OFF** [AMENDED DR-3 Item 3; ledger C-18]: the extracted
NOL fact is displayed; `acquired_usable` is an explicit cited assumption. AHYDO ignored with
disclosure [CONFIRMED DR-3 Item 4]. Transaction costs: capitalized, no deduction in v1
(70/30 safe harbor is a disclosed v2 refinement) [CONFIRMED DR-3 Item 5]. Minimum-tax CAMT
caveat: binds only >$1B AFSI. OBBBA post-12/31/2025 sub-changes out of scope (no interest
capitalization, no CFC modeling — disclosed per §15). §163(j) small-business exception
expressible via s163j.applies = false (<$31M avg gross receipts, IRS FS-2025-09).
**Unlevered stream (§9): the unlevered run flips BOTH interest and monitoring to zero —
tax base is EBITDA (not EBITDA_adj), no §163(j) (no interest); NOL/§382 still apply.**

## §7 Operating build & FCF [DECIDED]

Revenue: `rev[t] = rev[t−1] × (1 + g[t])` (churn folded into g — one number per year).
**Margin trajectory (explicit formula)**: `margin[t] = base + (target − base) × w(t)/w(N)`,
t = 1..N; linear: w(t) = t (year 1 takes the first step); front_loaded: w(t) = √t;
back_loaded: w(t) = t². `EBITDA = rev × margin`; `EBITDA_adj = EBITDA − monitoring fee (if
ON; the ANNUAL fee is dropped in the exit year — the §9 termination payment replaces it, no
double count)`. D&A = da_pct × rev. Capex = maint_pct × rev + growth_capex[t].
NWC: **operating NWC** (excludes cash/debt) via **days** or **% of revenue**.
**Days formulas (365 basis)**: AR = DSO/365 × revenue; Inventory = DIO/365 × COGS;
AP = DPO/365 × COGS; **COGS proxy = revenue × (1 − EBITDA margin)** (disclosed proxy).
`ΔNWC[t] = NWC[t] − NWC[t−1]`; NWC[0] from facts (pct method: pct × facts revenue; days method: the §7 formulas on facts revenue/margin).
**Fee amortization — two separate lines** (§6 treats them differently):
- **OID amortization**: straight-line over the tranche's maturity; §163(j)-capped interest.
- **Financing-fee amortization**: total fee = pct × total commitments, allocated pro-rata by
  commitment/par across tranches (incl. the revolver), straight-line over EACH tranche's
  maturity; an UNCAPPED ordinary deduction (Treas. Reg. §1.163(j)-1(b)(22)).
Both: remaining balance **written off on full early retirement** (non-cash; year-N tax
treatment per §6 uncapped line); both flow to the interest line for book EBIT, never D&A
(DR-2 Item 1 flag); both added back in FCF. **Early-retirement timing [v1.0.3]:** the
BOOK write-off lands in the retirement year; the TAX deduction enters the FOLLOWING
year's uncapped pool (§5 strict sequentiality — retirement is only known post-waterfall,
after that year's tax is computed). If retirement occurs in year N it merges into the
exit-year deduction (§9). **A §18 refinancing reuses this exact timing** — the old
tranche's unamortized OID/DFC (and the call premium) write off in book year R with the
tax deduction in year R+1's uncapped pool, merging into the exit deduction when R+1 = N.
`FCF_pre_debt = EBITDA_adj − cash tax − capex − ΔNWC` (D&A and fee amortization non-cash;
cash tax single-sourced from the §6 computation — mirror invariant §14.16).

## §8 Opening balance sheet & purchase accounting [CONFIRMED DR-3 Item 7]

Stock deal, **no §338(h)(10)/§336(e) election, no tax step-up**, v1. At t=0: assets =
min-cash + opening NWC + PP&E (seed = facts net PP&E, else 0 with note) + capitalized
financing fees + OID + **goodwill (plug)**; liabilities = debt at **par**; equity = sponsor +
rollover. Goodwill = plug that closes the BS at t=0; not amortized thereafter. **The plug is
SIGNED and never clamped [v1.0.5]**: a purchase price (plus capitalized transaction costs)
below the carrying value of net identifiable assets (asset-heavy filer at a low entry
multiple — reachable since net PP&E is extracted, D-layer 2026-07-24) yields NEGATIVE
goodwill — the normative trigger is the SIGN OF THE PLUG itself — disclosed via coherence WARN
`negative_goodwill` (§16 gate). Economically this is the bargain-purchase signal; a formal
ASC 805-30-25 bargain-purchase GAIN recognition is out of scope in v1's simplified
carryover-basis opening BS (Phase G step-up module) — the signed plug plus the WARN is the
honest presentation of that simplification, and the analyst sees the condition instead of a
silent residual. Display/coherence only — no arithmetic path changes. **PP&E roll
(explicit)**: ppe[t] = ppe[t−1] + capex[t] − D&A[t] — purely mechanical; may go negative
(coherence WARN `negative_ppe`); D&A stays %-of-revenue-driven (the §7 disclosure refers to
depreciation detail, not the BS roll). **Equity roll [v1.1.1 — NEW normative rule, not a restatement]**: equity[t] =
equity[t−1] + net income[t] − **interim distribution paid[t]** (§3 step 7). v1.1.0 shipped
§3 step 7 without saying where the second leg lands, so this fills a hole rather than
describing existing behaviour. A distribution leaves the entity as cash and as book equity
in the SAME year; §14.2 (the BS closes every year, |check| < $0.005m) forces *an*
offsetting entry — it does NOT by itself pick this one, and saying otherwise overstates the
argument. The two alternatives that also close the balance sheet are rejected on their own
grounds:
- **Expense treatment** (`equity += NI − paid` with `paid` routed through the P&L) produces
  an IDENTICAL balance sheet, so §14.2 cannot distinguish it. REJECTED because a
  distribution is a return of capital to owners, not a cost of earning income: routing it
  through the P&L would understate net income, contaminate EBIT, and — fatally — change the
  §6 tax base. Distributions must never touch NI, EBIT or tax.
- **Contra-asset / "distributions in excess of earnings" presentation** (cash falls, equity
  held flat, the payment parked as a negative asset) also closes. REJECTED because it
  misstates *both* sides for a v1 opening BS that carries no such account, and because it
  would leave `equity` overstating the owners' remaining claim. Unlike the expense
  treatment, the committed fixtures DO discriminate it: `balance_sheet[].equity` and
  `total_assets` differ. Carryover tax basis → **no
incremental tax D&A, no tax-deductible goodwill**; book/tax divergence and deferred taxes
legitimately ignored in v1 (no DTL arises on the goodwill excess in a nontaxable stock deal —
ASC 805-740-25-9). Debt carried at par with OID as a separate deferred cost (avoids the
book-vs-payoff trap at exit, §9). Step-up structures (asset/338(h)(10), §197 15-yr goodwill
amortization, permanent 100% bonus depreciation post-OBBBA) are a Phase G module.

## §9 Exit & the three return streams [CONFIRMED DR-2]

Exit EV = exit multiple × exit-year EBITDA_adj (basis FY, or NTM = ×(1+g[N+1] proxy)).
Exit-multiple suggestion = **entry multiple (flat)** [CONFIRMED DR-4 Cat.7 — "industry best
practice… multiple expansion usually an unjustifiable assumption"]. **Debt payoff = par +
accrued PIK.** Unamortized OID/financing fees: written off (non-cash); affect exit only via
the exit-year tax deduction — **never reduce cash proceeds**. No call premia v1 (§3
call-protection note: BSL soft call legitimately exempt; private-credit hard call and the
change-of-control 101 put are DISCLOSED omissions, Phase G re-entry). Net debt at exit uses
closing cash (same cash definition as credit metrics).
**Exit equity (pre-MIP, total) = exit EV − payoff + closing cash − exit fees − monitoring
termination.** (Closing cash conveys — equivalently EV − NET debt at exit; the formula and
the net-debt sentence now agree literally.) **Exit advisory fees = fees_pct × exit EV.**
The ANNUAL monitoring fee is dropped in year N; the accelerated-NPV termination payment
replaces it (a real exit Use — DR-2 Item 5; no double count). NTM exit basis uses
growth[N−1] as the year-N+1 proxy (NTM is golden-uncovered — flagged). **Entry NTM basis
[v1.0.3]:** entry valuation under `basis: 'ntm'` uses fy_ebitda × (1 + growth[0]) — the
mirror of the exit-side proxy (symmetry; golden-uncovered, disclosed). **When §1.1's LTM stitch
makes `fy_ebitda` an LTM figure, this base is `LTM × (1 + growth[0])` and `growth[0]` is the
annualized FY-over-FY rate, so the base is "the twelve months following the LTM anchor" — see
§1.1 [B1] for why the flip is coherent, not an over-projection.** The year-N §6 run
includes the retirement-triggered unamortized-fee write-off as an UNCAPPED deduction.

**Naming [CONFIRMED DR-2 Item 2]:** the pre-carry series is labelled **"pre-promote IRR"**
— never "gross" (ILPA/GIPS reserve "gross" for the before-fund-fees-and-carry concept). It is
defined once: net of transaction costs and portfolio-company fees, before management
incentive, not an LP return.

**Fee/flow membership table (the table every past review fought about):**

**Legend [v1.1.1 — stated after an adjudicator misread it on first pass]:** **`out (−)`** means
the item is IN the stream, as part of the t=0 OUTFLOW. **`excluded`** means the item is NOT
in the stream at all. **`in (−)`** / **`in (+)`** are later-period flows. `n/a` means the
concept does not exist for that stream. The two words are not synonyms — "out" is a
direction, "excluded" is a membership decision.
**Net-to-LP (§19) membership addendum [v1.4.0]:** management fees in (−, drawn years 1..N — later-period flows per the legend, not t=0); GP carry in (−) — and note carry is a REDUCTION already inside `lp_distributions`, never a second negative flow (per-period nets identical either way); monitoring fees EXCLUDED from LP inflows (they OFFSET the fee draw — never re-added; the §5 sponsor-consolidation rule); sponsor share of §3-step-7 distributions in (+); `exit.sponsor_share` in (+) at N (already post-§10-promote — the promote is NOT re-deducted); rollover flows EXCLUDED entirely (§19.1); transaction/financing costs already inside the t=0 equity check (unchanged).

| Item | (1) Sponsor net | (2) Unlevered | (3) Pre-promote |
|---|---|---|---|
| EV at entry | out (−) | out (−) | out (−) |
| Transaction/advisory costs | out (−) | out (−) (exist regardless of leverage — DR-2 Item 6) | out (−) |
| Financing fees + OID | out (−) | **excluded** (leverage artifacts — DR-2 Item 6) | out (−) |
| Debt proceeds | netted (−) | n/a | netted (−) |
| Management rollover | netted (−) | n/a | netted (−) |
| Monitoring fee (if ON) | reduces FCF & exit; memo line "GP fee income" shown separately (the consolidated-sponsor-economics view, DR-2 Item 5 — never silently dropped, never double-counted) | **excluded** | reduces FCF & exit |
| Exit advisory fees | in (−) | in (−) | in (−) |
| MIP promote | in (−) | n/a | **excluded** |
| Rollover share of exit | excluded (sponsor stream is sponsor-only; rollover pari-passu pro-rata) | n/a | excluded |
| Interim distributions [v1.1.0] | in (+ at year t; sponsor-only share when rollover > 0 — pari-passu pro-rata, same rule as exit) | **excluded** (an equity/financing flow — the unlevered stream is capital-structure-blind) | in (+ at year t, pre-promote total) |

Unlevered taxes on **EBIT** — letting the interest tax shield leak into the unlevered stream
is DR-2 Item 6's #1 flagged error. Sponsor MOIC = sponsor inflows / sponsor outflow
(inflows now include interim distributions [v1.1.0]).
**DPI & payback [v1.1.0 — de-degenerated]:** DPI[t] = cumulative sponsor distributions
through t ÷ sponsor outflow at close (deal-level paid-in = the single t=0 equity check;
ILPA's fund-level paid-in maps to it 1:1 in a single-deal frame). Payback = the first year
cumulative distributions alone reach the outflow; N/A when never reached inside the hold
(exit proceeds do NOT count toward payback — that is what made the old headline degenerate,
L-10). Both are headline-eligible ONLY when at least one distribution was paid; otherwise
they stay de-headlined exactly as before. RVPI stays OUT in v1.1.0 (rejected: it needs an
interim NAV mark, and the engine carries no interim marks — reporting cost basis or a
multiple-through would fabricate a valuation); TVPI at exit ≡ MOIC and is not shown twice.

## §10 MIP [CONFIRMED DR-2 Item 4 — one instrument]

v1 models the **US-style promote pool only**: `MIP = min(pool_pct × max(0, pre-MIP total
equity proceeds − hurdle_moic × total invested equity incl. fees), exit equity available)`.
Carry-above-hurdle (not a cliff), capped at available exit equity. **[v1.1.0] “pre-MIP total
equity proceeds” explicitly INCLUDES cumulative interim distributions** (§3 step 7) —
**the TOTAL paid, not the sponsor share [disambiguated v1.1.1]**, because both sides of the
test are already stated on a TOTAL basis (the hurdle multiplies TOTAL invested equity incl.
rollover, and the proceeds term is the pre-MIP TOTAL). Mixing a sponsor-share numerator
into a total-equity hurdle would understate the promote whenever rollover > 0. Note this
deliberately differs from §12's walk-down, which adds back only the SPONSOR share — there
the identity reconciles to the sponsor's own delta. Golden-uncovered (§17 item (x)): every
golden runs rollover = 0, where the two coincide. The
hurdle tests total value returned, and the promote is computed and paid AT EXIT ONLY, from
exit proceeds (the existing cap term — no interim carry, no clawback machinery; rejected
alternative: per-distribution carry with clawback, a fund-accounting construct that has no
place in a single-deal promote). DISCLOSED consequence: the exit-equity cap — previously
unreachable for pool_pct ≤ 1 — can now genuinely bind (large cumulative distributions,
small exit residual) and TRUNCATES the promote below the uncapped formula with no accrual;
that is the deliberate price of exit-only settlement. Carried through §14.16's FIRST mirror
clause unchanged (mip_payout still settles inside exit_equity_pre_mip_total; the
final-cashflow clause is separately amended for year-N distributions). DR-2 confirms the
draft's core rule verbatim: layering a promote on a sweet-equity cap table **double-counts**
management upside — sweet-equity strips (institutional strip + ordinaries, the UK/European
structure) are a separate Phase G module, modeled through the actual instrument, never
blended. Sizing suggestions [DR-2/DR-4]: pool 10–20% of FD equity; hurdles most commonly
MOIC-based (~2/3 of plans MOIC-only, Goodwin 2024), typically 2.0–3.0x.

## §11 Credit metrics [DECIDED — carry over FINANCIAL_DEFINITIONS.md, with fixes]

Net leverage = (gross − cash)/EBITDA_adj (SIGNED — net cash renders negative, never
clamped); senior leverage by tranche **type**, net, floored at 0 (a senior stack cannot
be "net short"), ≤ total **whenever total ≥ 0** [WORDING v1.0.4 — in the net-cash regime
total goes negative while senior floors at 0; the unqualified inequality was inherited
from the old engine's definitions and is arithmetically unreachable there];
ICR = EBITDA_adj / cash interest; FCCR = (EBITDA_adj − maint capex − cash tax) / (cash
interest + commitment fees + mandatory amort); DSCR = FCF_pre_debt / (same denominator).
**Only scheduled service in the DSCR denominator — never discretionary sweeps** [CONFIRMED
DR-1 Item 8]. **Leverage sizing and every covenant test use FY(LTM) EBITDA even when the
valuation basis is NTM** — lender convention; the "(LTM)" is realized by §1.1's quarter-stitch [v1.2.0] (the sizing fact is the trailing-twelve-months figure when interim filings allow, else the latest FY with staleness disclosed); if entry is NTM-based the UI shows both, LTM
canonical. **[v1.1.3 — now implemented]** the entry multiple (`derived.entry_multiple`) is
the multiple on the VALUATION basis — EV ÷ FY EBITDA under an FY entry, but EV ÷ (FY ×
(1 + growth[0])) under an NTM entry (§9). Every surface that shows it therefore LABELS it by
its actual basis (`entryMultipleDisplay` in `facade.ts`) — a bare "(FY)" was FALSE under an
NTM entry — and, when NTM, shows the FY/LTM-canonical figure (EV ÷ `entry_ebitda_for_sizing`, the
§1.1 FY(LTM) sizing basis — FY today, the LTM stitch once G-2 lands [B1/M2]) alongside it. FY
deals render exactly one line, unchanged. NTM is golden-uncovered
(§9), so this is pinned by DIRECTED tests + mutation on the three surfaces (Excel Summary
sheet, downloaded memo, Summary tile), not by a golden. [REJECTED alternative: label the
valuation multiple "(FY)" unconditionally — the defect this fixes; the value is right, the
label was not, exactly as in the v1.1.2 entry-leverage rename.]

**Entry leverage is GROSS; the per-year credit metric is NET [v1.1.2 — stated; the value
was always gross, the NAME said net].** `derived.entry_gross_leverage_fy` = total debt at
PAR ÷ FY EBITDA — the quoted, term-sheet number, and the same basis §17 sizes every tranche
on ("TLB 4.0x FY (440.0)"). It is deliberately NOT netted against the funded min-cash, even
though §2 does put `min_cash` on the t=0 balance sheet, so at t = 0 the §11 net definition
would give (par − min_cash) ÷ EBITDA — a genuinely different number (G2 4.0x gross vs
3.909x net; G3 4.5x vs 4.4111x). Reasons, weakest to strongest:
(i) gross is what the market quotes and what the credit agreement sizes, so a "net" headline
would disagree with the tranche multiples the user typed — true, but largely a restatement
of the convention rather than an argument for it;
(ii) netting would make the headline move with a min-cash FLOOR assumption rather than with
the capital structure: raise `min_cash` from 5.0 to 10.0 with the debt stack untouched and a
"net" entry leverage falls, which is a bad property for the number a term sheet is quoted on;
(iii) **[v1.1.2, added after the hostile sign-off found (i) circular] minimum operating cash
is NOT surplus cash.** Credit agreements typically net only *unrestricted* cash and
frequently cap the netting; speculative-grade rating methodologies generally decline to
credit cash against debt at all. The model's own §3.7 RP trap already treats floor cash as
unavailable (a distribution may only be paid from cash ABOVE `min_cash`), and §14.12
describes trapped cash in exactly these terms. So there is a substantive credit-analytical
reason not to net the floor at t = 0, independent of market quoting convention — this is the
argument a credit committee would actually give, and it is the load-bearing one.
[REJECTED alternative: reporting entry leverage net of funded min-cash as the headline.] **[CORRECTED v1.1.2]** the previous code comment
justified the gross value by asserting that in the cash-free/debt-free frame "entry net debt
≡ par because min-cash is new money" — that premise is FALSE. Min-cash being newly funded
explains why it is there, not why it fails to count as cash; the t=0 balance sheet holds it.
The value is right for the reason above, not for that one.
**Disclosed gap:** ModelOutput carries NO entry-date NET leverage. `credit[].net_leverage`
is net from year 1 onward, so a gross-at-entry → net-at-exit comparison spans two bases and
OVERSTATES deleveraging by the min-cash artifact at the entry end. Every surface that shows
both must label each explicitly (the Excel export and the AI memo prompt previously labelled
the entry figure "net", making the two look like one series). Adding an entry-date net
figure is DEFERRED — but the deferral is a product call about what to put on screen, not a
measure of effort: the numerator already exists and is already displayed. `facade.ts`
computes `entry_net_debt = total_debt_at_par − cash_to_balance_sheet` and feeds it to §12's
paydown bar, so the remaining work is one division and one additive golden key. What is
being deferred is the decision to add a fourth leverage figure to the headline surfaces,
which is the owner's, not the engine's.

Undefined ratios render **N/A with reason** — 9999/99 sentinels banned. Covenant
headroom signed (breach = negative). Step-downs optional per covenant. Springing leverage
test: applies only in years where revolver drawn/commitment exceeds the trigger
(`springing_test_active` per year). Deleveraging
subtotals [CONFIRMED DR-5 Item 5 — "make deleveraging first-class"]: **FCF conversion %
(FCF/EBITDA_adj** — the adjusted basis, consistent with every other §11 credit metric; the
numerator FCF is already net of the monitoring fee, so numerator and denominator share ONE basis.
Differs from raw FCF/EBITDA only when a monitoring fee is present [accuracy-audit clarification])
and **cumulative debt paydown as % of entry debt** are first-class ModelOutput
fields rendered on the debt-schedule footer. Covenant suggestions
[DR-4 Cat.4]: BSL preset = cov-lite (>90% of new issue) with a springing revolver test at
35–40% draw; MM preset = maintenance covenants at 30–35% EBITDA headroom to base case.

## §12 Value bridge [CONFIRMED DR-2 Item 7 / DR-5 Item 4]

Bridge reconciles to **pre-promote total equity Δ** — DR-2 verbatim: "reconcile to
pre-promote equity first (management incentive is a distribution of value, not a source of
it)." **Bar arithmetic [v1.0.3 — pinned; the bars could not reconcile exactly as first
drafted]:** the four bars decompose the FRICTIONLESS pre-promote delta (EV − net debt at
both ends, before all fees/costs): growth bar = M₀ × ΔB; multiple bar = ΔM × B₀;
**interaction = ΔM × ΔB (explicit bar)** [CONFIRMED — DR-2/DR-5 name the explicit
cross-term bar the rigorous school; the "Δmultiple on exit EBITDA" form folds the cross
term into the multiple bar by construction and is this section's rejected alternative];
paydown = ND₀ − ND₁, where ND₀ = par − funded min cash and ND₁ = payoff − closing cash.
Walk-down from the bar sum: − entry costs (transaction + financing fees + OID) − exit
costs (exit advisory fees + monitoring termination) − MIP − rollover Δ (rollover exit
share − rollover contributed) = sponsor net Δ. The ANNUAL monitoring leakage is embedded
in the paydown bar via cash (never double-counted in the walk-down); the walk-down's
monitoring item is the termination component within exit costs, with the annual drag
shown as a memo from `gp_fee_income`. **Interim distributions [v1.1.0]**: paid amounts
leave via cash, so they shrink the paydown bar (and, second-order, any subsequent-year
sweeps — truthfully embedded in ND₁'s actual path, exactly like the monitoring drag);
the walk-down gains a final **“+ interim distributions (sponsor share)”** line and the
§14.9 identity reconciles to the sponsor-net TOTAL delta (cumulative SPONSOR-SHARE
distributions + exit inflow − outflow; the rollover's distribution slice exits via the
smaller paydown bar and is never added back — it is not sponsor money). The extension is exact by the same §9 algebra — ND₁ is measured
on the actual path, so no distribution-driven divergence can leak outside the bars.
Both identities exact by construction (§14.9). **Testing note [v1.1.2 — accuracy audit
2026-07-25]:** `bridge.reconciliation_residual` is the max of the two residuals, but the
`walkdown.sponsor_net_delta` term is DEFINED as `sponsor_share + interim_distributions_sponsor
− sponsor_equity`, so the distribution term cancels out of identity (b)'s residual and the
residual effectively re-verifies only identity (a) (the frictionless-bar reconciliation).
Identity (b)'s content — that the walk-down lands on the sponsor's TOTAL delta including the
distribution add-back — is therefore pinned DIRECTLY (an independent recomputation of
`sponsor_net_delta` on a rollover > 0 ∧ distributions deal), not via the self-cancelling
residual. Also rendered on a MOIC basis: each bar ÷
**entry (pre-promote total) equity** [CONFIRMED DR-5 Item 4, Mosaic MOIC Decomp — corrected
v0.96 from ÷ sponsor equity, which is inconsistent whenever rollover exists; the sponsor-net
walk-down may separately be shown ÷ sponsor equity, labelled as such]. EBITDA bridge: entry →
organic growth → margin → exit (add-on bars return in Phase G).

## §13 Scenario semantics [CONFIRMED DR-5 Item 3 — the entry-fixed rule is named best practice]

A scenario = a **field-level typed delta-set** (`ScenarioDeltas`: operating fields + exit
MULTIPLE only — exit basis/fees are NOT flexible) merged onto base assumptions (arrays
replace whole). `irr_delta_vs_base` = sponsor-net stream. Each scenario carries the slim
waterfall block (revolver draw/repay, sweep, closing cash, floor breach; **plus
distributions paid/blocked per year [v1.1.0]** — a downside that traps the sponsor's
distributions is precisely what the credit dashboard exists to show) for the DR-5
credit dashboard. A scenario changes **post-close operating assumptions and the exit
multiple only** — the distribution REQUEST schedule and the RP trap are structure/policy
fields, frozen across scenarios like the rest of the entry structure [v1.1.0]; what varies
is whether the trap BINDS under each scenario's operating path.
**Entry EV, debt quantum, tranche sizes, and sponsor equity are frozen at base-case close.**
DR-5 confirms this as the critical IC convention: "entry price and deal structure are held
fixed within operating cases… Never let a downside case silently re-price entry" — financing
flexes are a separate exercise. (This closes live bug L-1.) Every scenario runs the full
engine and reports the same credit metrics as base — DR-5: credit dashboard (leverage,
coverage, DSCR, breach flags, sweep/revolver behavior) belongs beside downside equity
returns. Single-factor stress rows are scenarios under the same rule. Sensitivity tables:
full re-runs; entry-side axes (entry multiple, leverage) DO re-price entry — they are entry
variables; operating axes do not. Presentation [DR-5 Item 2]: paired IRR + MOIC grids,
5×5 default, base case centered, banding at the fund hurdle (default ~20% IRR). Center cell
≡ base, tested.

## §14 Invariant catalogue (each with its validity domain)

1. Sources ≡ uses (always).
2. BS closes every year, |check| < $0.005m (always).
3. Running-cash conservation: Σ(waterfall applications) ≤ opening cash + FCF + draws (always).
4. closing cash ≥ min_cash, OR revolver exhausted + floor-breach flag set (always).
5. Tranche balances ≥ 0; PIK balance monotone ↑ until repaid (always).
6. Floor-breach flag ⇒ rendered warning (always).
7. Sensitivity center cell ≡ base; scenario with empty delta-set ≡ base (always).
8. **Operating-downside delta-set ⇒ sponsor IRR ≤ base** (domain: deltas restricted to
   growth↓/margin↓/exit multiple↓).
9. Bridge (two exact identities, §12): growth + multiple + interaction + paydown ≡
   frictionless pre-promote Δ (EV − ND at both ends); bar sum − entry costs − exit costs
   − MIP − rollover Δ + interim distributions (sponsor share) ≡ sponsor net TOTAL Δ
   (always; the distributions term is 0 whenever the schedule is empty — the pre-v1.1.0
   identity is the degenerate case) [v1.1.0].
10. Sponsor MOIC ≡ sponsor inflows / outflow (always).
11. IRR↑ in exit multiple (domain: exit equity > 0 across tested range).
12. Leverage↑ ⇒ IRR↑ (domain: frictionless config only — zero fees/OID, bullet cash-pay debt,
    no revolver, no min-cash bind, unlevered return > cost of debt, **empty distribution
    schedule / trap off [v1.1.0]** — a binding trap converts marginal debt into trapped
    zero-yield cash and can strictly reverse the sign).
13. All-suggested model ⇒ zero coherence warnings (always).
14. Zero-debt, zero-growth, flat-margin deal ⇒ IRR matches closed form (domain: empty
    distribution schedule [v1.1.0] — interim flows make the stream multi-point).
15. Mandatory amortization per year ≡ schedule % × original face, capped at outstanding
    (always — DR-1 Item 7 flag).
16. Mirror identities (single-source rule): waterfall totals ≡ Σ tranche + revolver rows;
    FCF's tax term ≡ tax[i].cash_tax; sources_uses.enterprise_value ≡
    derived.enterprise_value; sponsor_share + rollover_share + mip_payout ≡
    exit_equity_pre_mip_total; final sponsor_net cashflow ≡ sponsor_share + the sponsor
    share of paid[N] [v1.1.0 — the model is annual, one flow per period; a year-N
    distribution and the exit settle in the same period-N number] (always).
17. Committed downside scenario (G2): sponsor IRR ≤ base AND entry S&U identical to base
    (entry-frozen rule §13) (always).
18. Distributions [v1.1.0]: paid[t] ≤ request[t]; paid[t] ≤ max(0, cash − min_cash) at
    step 7; trap ON AND paid[t] > 0 ⇒ gross_debt_end − closing_cash ≤
    L × EBITDA_adj[t] + $0.005m (the MONEY form of the pro-forma test — stated on money,
    not on the ratio, so it holds for all EBITDA_adj including ≤ 0; a fully-blocked year
    that STARTED above L trivially satisfies the invariant with paid = 0); blocked
    capacity never accrues (paid[t] ≤ request[t] per year — no later catch-up above the
    year's own request); DPI monotone non-decreasing; distributions never enter
    DSCR/FCCR/ICR or the §11 FCF-conversion numerator (always).
19. Refinancing [v1.3.0 — §18] (domain: a `structure.refinancing` event exists; the clauses
    are trivially satisfied when the schedule is empty — the pre-v1.3.0 degenerate case):
    (a) **par-for-par at the refi** — the refinanced tranche's ending balance in year R equals
    its beginning balance in year R minus year-R mandatory amort and sweep, with NO principal
    step from the refi itself (the new face = the old beginning balance `B`; the refi moves no
    principal, only re-prices/re-terms); (b) **BS closes in the refi year**, |check| < $0.005m
    (§14.2 already asserts this every year — restated as a refi-specific check because §18.6's
    equity/DFC/cash legs must net exactly); (c) **the write-off + call-premium tax deduction is
    in year R+1's UNCAPPED pool** (or merges into the year-N exit uncapped pool when R+1 = N),
    never in year R's; (d) **`refinancing_cash_cost[R] = call_premium + new_OID + new_fees`**
    and it is a cash use of that year's running-cash variable (§14.3 conservation includes it).

20. Fund/LP overlay [v1.4.0 — §19] (domain: `fund` non-null; all trivially satisfied /
    absent when null — §19.6(c) byte-identity): (a) sponsor-side conservation §19.6(a) at
    1e-9; (b) `fund_lp_net.irr ≤ sponsor_net.irr` where both defined (`kernel/irr`
    multi-root/endpoint policy; fee/carry > 0); (c) the PER-ELECTION GP-share bound §19.6(d) — 'european' on
    paid-in, 'american' on invested capital (the single-bound form is FALSE under
    'american': sign-off round 1, worked counterexample); (d) cumulative
    `lp_distributions` is monotone non-decreasing, and `dpi[N] ≡ fund_lp_net.moic` (the
    to-date ratio at N has denominator paid_in_total by construction) — the to-date `dpi[]`
    itself is NOT monotone (fee-only years grow the denominator; round-2 B10 — the deal-level
    §14.18 monotone-DPI claim does not port to a growing base); (e) §19.6(e) is an explicit
    NON-claim — no ordering between the elections' IRRs is asserted.

21. PIK toggle [v1.5.0 — §20] (domain: a `pik_note` with `elections` non-null; all
    trivially satisfied when null — §20.6(c) byte-identity): (a) the toggle balance closed
    form B_t = face × Π_{s≤t, e_s='pik'} (1 + pik_coupon) — DOMAIN: amort = 0 ∧ sweep off
    (with either configured, the closed form yields to the §3 walk and only pik_accrual_t =
    0 in cash years is pinned); (b) cash_interest_t = B_{t−1} × cash_coupon × [e_t='cash']
    (fixed mode: unconditional); (c) `elections: null` ⇒ byte-identity with the v1.4.0
    engine on EVERY output (the C5-class gate); (d) the §6 capped pool's per-year PIK term
    = the year's accrual (zero in cash years) and its cash term includes the note's cash
    interest (zero in pik years) — §14.13's pool mirror extended per election; (e) the
    `ahydo_shape` flag fires exactly on `maturity_years > 5` ∧ (an accruing year exists:
    elections null ∧ pik_coupon > 0, OR any e_t = 'pik') — structural legs only, the §163(i)
    yield leg stated in the flag text, never tested (needs the monthly AFR); (f) an explicit
    NON-claim: no ordering between all-cash and all-PIK sponsor IRRs (cash elections drain
    sweep fuel while PIK compounds the exit payoff — the §19.6(e) precedent).

## §15 Units, precision, display [CONFIRMED DR-5 Item 6]

Engine: float64 end-to-end, unit = millions of deal currency, **no intermediate rounding**.
Golden tolerances: flows ±$0.005m; IRR ±0.1bp. Display (UI boundary module, never engine):
thousands separators; money 1 decimal of millions; IRR/percentages 1 decimal; multiples 1
decimal + "x"; percent-vs-decimal conversion happens exactly once at the input boundary.
**Assumptions & methodology page** [CONFIRMED DR-5]: a dedicated page (not buried footnotes)
listing every material simplification matter-of-factly as a scope choice, each paired with
why it is immaterial or conservative: annual periods; beginning-balance interest
(conservative); day-count basis per tranche (Actual/360 understatement ~1.0–1.4% of
interest); static rates; constant tax rate; period-end flows; exit = entry multiple;
static §382 limit (unused-limitation carryforward omitted, conservative); NOL usage is
not optimized across years — consumed in full per §6.3 even when the minimum-tax floor
binds or the current-year benefit is nil (no credit carryforward); acquired §163(j)
carryforwards out of scope; exit-year fee write-off deducted UNCAPPED; PP&E rolls
mechanically and may go negative (warned); post-2025 OBBBA §163(j) sub-changes out of
scope; interim distributions [v1.1.0] pay at year-end after full debt service (never
revolver-funded), blocked capacity does not accrue, and the RP trap is the closed-form
pro-forma net-leverage test (§3.7 — no solver); the fund/LP overlay [v1.4.0 — §19] is a FUND-OF-ONE on the sponsor side only (annual fee on a constant basis — no step-downs/NAV; no subscription line; no GP commitment; no clawback — nothing to claw back by construction; 'european' = all-contributions hurdle+pref base vs 'american' = invested-capital base with NO fee-recovery tier; the §10 promote is portfolio-level, never fund carry; the year-N fee draws BEFORE the final distribution); the PIK toggle [v1.5.0 — §20] is a PER-YEAR WHOLE-COUPON election on the `pik_note` (no partial/50-50 elections; elections frozen across scenarios; PIK deducted as accrued with AHYDO a disclosed omission carrying the structural `ahydo_shape` WARN — the §163(i) yield leg needs the monthly AFR and is stated, not tested; PIK notes stay non-refinanceable and sweep-exempt by default); refinancing [v1.3.0 — §18] is a SCHEDULED
per-tranche event (no forward-curve or covenant-cure trigger), one refi per tranche,
par-for-par (no dividend recap / upsizing), cash-pay term tranches only (no PIK refi), the
repricing effective for the whole of the refi year (no mid-year proration), and the old
OID/DFC write-off plus the call premium deducted UNCAPPED in the FOLLOWING year (vs the
Treas. Reg. §1.1001-3 same-year-capped reading — conservative, ≤1-year, inert without a
binding §163(j)), with sweep priority carried over unchanged. Framing:
"a model is a range, not a point" — the sensitivity/scenario exhibits are themselves the
primary caveat mechanism.

---

## §16 Input schema [DECIDED — structural]

The contract lives in [`types.ts`](types.ts): `DealFacts` (Class A — facts, FY-anchored,
provenance handled at the extraction layer), `DealAssumptions` (Class B — every field carries
a UI basis badge), `ModelOutput` (Class C derived values + all computed series; nothing on it
is editable). Class rules (master plan Part 2): a missing fact is MISSING, never defaulted; a
suggestion always names its basis (history / cited convention / template / AI); REQUIRED
fields gate Build; the single-driver rule governs entry (multiple XOR EV). Money in millions
of deal currency; rates as decimal fractions; per-year arrays 0-indexed over `hold_years`.
Structural gate [v1.0.3]: term-tranche maturity > `hold_years` (§3) is validated at Build.
Structural gates [v1.0.4 — stated; already enforced]: tranche NAMES are unique (they key
the §7 write-off schedules and retirement reporting); the revolver's `drawn_at_close` = 0
in v1 (§2 has no drawn-revolver source line).
Schema additions [v1.2.0 — G-2, Class A / data-side, realized in the G-2 data PR]:
`DealFacts.fy_ebitda` / `fy_revenue` keep their names and engine role but their VALUE becomes
the §1.1 LTM-stitched figure when interim filings allow; the fact gains an `as_of` date (the
LTM end `e`, or the FY period end on fallback), a `basis: 'ltm_stitched' | 'fy'` marker, and
a staleness tier — Class A provenance the UI renders as a badge (§1.1). The ENGINE contract is
unchanged (it still reads one EBITDA/revenue number); this is a data-layer enrichment, so
every §17 golden (manual inputs) is byte-identical. No new REQUIRED field: a metric the stitch
cannot build falls back to FY, and FY-absent stays MISSING exactly as today.
Schema additions [v1.1.0 — G-1]: `structure.distributions: number[] | null` — the per-year
REQUESTED distribution amounts ($m, length `hold_years`; null ≡ all-zero ≡ feature off, so
every pre-v1.1.0 deal and every suggestion default is byte-identical to before); and
`covenants.rp_trap: { metric: 'net_leverage'; level: number } | null` — the §3.7
restricted-payment test (null = no trap; the two cash caps always bind regardless). Both
are Class B with basis badges; the suggestion layer proposes NEITHER (a distribution
policy is a sponsor decision with no history/convention basis — fields start empty/off,
badge TEMPLATE when touched via template paths, YOU when set by the user). Structural
gate: `distributions` entries must be ≥ 0 and the array length must equal `hold_years`.
Schema additions [v1.3.0 — G-5, §18]: `structure.refinancing: RefinancingEvent[] | null` —
zero or more per-tranche refinancing events (null ≡ [] ≡ feature OFF, so every pre-v1.3.0 deal
and every suggestion default is byte-identical to before). Each event =
`{ tranche_name: string; year: number; new_pricing: TranchePricing; call_premium_pct: number;
new_maturity_years: number; new_oid_pct: number; new_financing_fee_pct: number;
new_amort_pct_of_face: number }`. Class B with basis badges; the suggestion layer proposes NO
refinancing (a refi decision has no history/convention basis — starts empty, badge TEMPLATE via
template paths, YOU when set). **Structural gates (validated at Build — input-gate REJECTIONS,
never computed defaults, §18.1–§18.3):** `tranche_name` names an existing **cash-pay term**
tranche (not the revolver, not a `pik_note`); **at most ONE event per tranche**;
`1 ≤ year ≤ hold_years − 1`; `(year − 1) + new_maturity_years > hold_years` (no balloon inside
the hold); `call_premium_pct`, `new_oid_pct`, `new_financing_fee_pct`, `new_amort_pct_of_face`
each ≥ 0; `new_maturity_years ≥ 1`.
**ModelOutput additions [v1.3.0 — G-5]:** `TrancheYear` gains `refinanced: boolean` (true only
in the refi year for the refinanced tranche) and `refinancing_cash_cost: number` (the year's
`call_premium + new_OID + new_fees`, 0 otherwise) and `unamortized_writeoff: number` (the old
OID+DFC written off at the refi, 0 otherwise) — the DISPLAYED refi surface (§18.8) reads these
named fields, never a recomputation. All Class C, emitted UNCONDITIONALLY (0/false when no refi),
so pre-v1.3.0 goldens carry committed `0.0`/`false` columns exactly like the G-1 additions.
**ModelOutput additions [v1.1.1 — stated here rather than left normative-by-fixture]:**
`WaterfallYear` gains `distribution_requested`, `rp_max: number | null` (**null ⇔ the trap
is OFF ⇔ +∞** — N/A semantics, never a sentinel, per §11/§15), `distribution_paid` and
`distribution_blocked`. `ReturnStreams` gains `dpi: number[]` (length `hold_years`, NOT
t0-anchored) and `payback_year: number | null` (1-indexed), and its two SPONSOR-SIDE streams
gain `irr_mid_year: number | null`. `ValueBridge.walkdown` gains
`interim_distributions_sponsor`. `CoherenceFlag.code` gains `distribution_blocked` ([v1.3.1] and `refi_noop` — §18.8; [v1.5.0] `ahydo_shape` — §20.6(e), WARN class, per qualifying pik_note). [v1.4.0] `assumptions.fund: FundOverlayAssumption | null` — `{committed_capital: number|null, mgmt_fee_pct: ≥0, fee_basis: 'committed'|'invested', carry_pct: [0,1), pref_rate: ≥0, catchup_pct: {0} ∪ [carry_pct, 1], waterfall: 'european'|'american', fee_offset_pct: [0,1]}; null ≡ OFF (byte-identity §19.6(c)). Input-gate REJECTIONS: committed_capital = null ∧ fee_basis = 'committed' (circular — §19.2); explicit committed below total contributions; every domain violation above. `ModelOutput.fund` (Class C): null when OFF; when ON, `{lp_contributions[], lp_distributions[], gp_carry[], mgmt_fees_net[], paid_in_total, committed_capital, fund_lp_net: {irr, moic, dpi[], payback_year}}` — named fields, unconditional emission within the non-null object; `lp_contributions` length N+1 (t=0..N), the other four arrays length N (years 1..N, NOT t0-anchored), `payback_year` 1-indexed or null (the v1.1.1 contract precedent). The suggestion layer proposes NO fund overlay (§19 preamble). [v1.5.0] `PikNoteAssumption` gains `elections: ('cash' | 'pik')[] | null` (default null ≡ the v1 FIXED both-legs note — byte-identity §20.6(c)). Input-gate REJECTIONS (§20.2): non-null length ≠ `hold_years`; any entry outside the union; non-null ∧ `cash_coupon ≤ 0` (a 0%-cash toggle year is a free coupon holiday no term sheet grants — the FIXED cash-0 note stays available as null); non-null ∧ `pik_coupon < cash_coupon` (the PIK premium is non-negative — market shape, DR-3.4). NO new ModelOutput fields — `TrancheYear.{cash_interest, pik_accrual}` already carry the per-year split. The suggestion layer proposes NO elections (D7 structures carry no pik_note; a user-added note starts null — the toggle is opt-in per year). [v1.3.2] ALL THREE source unions — `DealFacts.source`, `RawHistoricals.origin`, and the extraction-layer `ProvenanceSource` — gain `'upload'` (the uploaded-filing route; normative conventions in `lib/edgar/IXBRL_SPEC.md`; purely additive — no fetch route ever produces it, no engine arithmetic reads `source`, and stamping origin explicitly keeps factsAdapter's legacy fallback from mislabelling an upload as 'edgar'/'esef').
`ScenarioResult.waterfall`'s slim block gains `distribution_paid` and `distribution_blocked`
(§13). The reference derivation additionally records a top-level `distributions` block —
`requested`, `paid`, `sponsor_share_paid`, `cumulative_paid`, `trap_level`, `blocked_years`
— which is a FIXTURE-ONLY convenience for adjudication, NOT a ModelOutput surface: every
one of its values is derivable from `waterfall[]` + `returns`, and adding it to ModelOutput
would create a second path to numbers the waterfall already owns. All ModelOutput additions
are Class C — derived, never editable. Every one is emitted UNCONDITIONALLY (zeros / false /
null when the feature is off), never only-when-on: a conditionally-present field would make
the pre-v1.1.0 goldens' committed `0.0`/`false` columns unassertable.
The coherence gate (`check.ts`) is a post-run check over ModelOutput from the SAME `runModel`
call — never a second calculation path (architecture-review finding, 2026-07-04).

## §17 Golden deal definitions (Phase B builds the workbooks from EXACTLY these inputs)

Facts per §16 units ($m, decimal fractions). All goldens: ati_pct = 30% and minimum_rate = 0
unless stated (G4 overrides minimum_rate = 15%); rollover = 0; growth_capex = 0 every year
(stated capex is MAINT capex); financing-fee base = total commitments incl. revolver,
allocated pro-rata by commitment over each tranche's maturity (§7); exit fees = fees_pct ×
exit EV (§9); **mid-year off** — i.e. the goldens' DISPLAYED convention is period-end
(`mid_year_irr: false`), while `irr_mid_year` is recorded alongside on every golden per §1's
always-both rule [clarified v1.1.1]. Workbook construction may surface infeasibilities — those flow
back as spec amendments, never as silent workbook-side tweaks (adjudication rule, PHASE_B
§B1). Qualitative asserts (BINDS / draws / in-the-money) are verified during workbook
construction; if one fails, the golden or the assert is amended by the spec-change process
BEFORE the workbook is committed.

**G1 — all-equity baseline** (proves §7 operating build, §6 tax w/o interest, §9 exit,
closed-form IRR invariant §14.14):
facts: revenue 100.0, EBITDA 25.0 (margin 25%), D&A 3%, maint capex 3%, net PP&E 20.0,
NWC 10% (pct method), tax 25%. assumptions: growth 0 all years; margin flat 25% (target =
base); hold 5; entry 8.0x FY (EV 200); exit 8.0x FY; transaction 2%; financing n/a (no
debt); exit fees 1.5%; min cash 5.0; no debt; MIP null; monitoring null; NOL pools 0;
§163(j) applies (no interest → inert).
Check values: sponsor equity = 200 + 4 + 5 = 209.0; annual FCF = 25 − 5.5 − 3 − 0 = 16.5;
exit equity = 200 − 0 + (5 + 5×16.5) − 3 = 284.5; MOIC = 284.5/209 = 1.3612;
IRR = (284.5/209)^(1/5) − 1 = 6.3622% (corrected v1.0.1 — the v1.0 hand-approximation 6.3618% was 0.4bp off, outside the ±0.1bp tolerance). (PP&E rolls flat at 20.0: capex = D&A.)

**G2 — TLB + revolver, 75% sweep, committed downside scenario** (proves §3 waterfall order,
ECF pool, commitment fee, §13 scenario semantics):
facts: revenue 500.0, EBITDA 110.0 (22%), D&A 3.5%, maint capex 3.0%, net PP&E 100.0,
NWC 8% (pct), tax 25%. assumptions: growth [6,5,4,4,3]%; margin flat 22%; hold 5; entry
9.0x FY (EV 990); exit 9.0x; TLB 4.0x FY (440.0) floating base 3.60% + 375bps floor 0,
amort 1% of face, sweep {participates, priority 1}, maturity 7, OID 0; revolver commitment
0.5x (55.0), spread 350bps, commitment fee 0.50%, maturity 5, drawn 0; sweep base 75% flat
(step-down grid exercised by kernel fixtures, not this golden); min cash 10.0; transaction
2%; financing 1.5% × 495 = 7.425 (pro-rata: TLB 6.60 over 7yrs, revolver 0.825 over 5yrs);
exit fees 1.5%; covenants: all null (cov-lite); MIP null; §163(j) EBITDA basis — assert it
does NOT bind (positive headroom every year); commitment fee is an UNCAPPED deduction (§6).
Assert: revolver never draws (cash stays above floor); sweep pool positive every year.
**Committed scenario (G2-D, proves §13/§14.8/§14.17):** deltas = {growth: each year
−200bps, exit_multiple: 8.5}. Assert: sponsor IRR ≤ base; S&U and entry debt IDENTICAL to
base (entry frozen); scenario waterfall shows smaller sweep every year.

**G3 — senior + fixed-rate PIK note, in-the-money promote** (proves §4 PIK compounding,
§9 payoff at par+accrued, §2/§7 OID, §10 promote, §6 §163(j) binding EVERY year):
facts: revenue 300.0, EBITDA 90.0 (30%), D&A 4%, maint capex 3.5%, net PP&E 70.0, NWC days
{DSO 45, DIO 30, DPO 40} (§7 formulas, COGS proxy = revenue × 0.70), tax 25%.
assumptions: growth [5,4,4,3,3]%; margin flat 30%; hold 5; entry 8.5x FY (EV 765); exit
8.5x; senior 3.0x (270.0) floating 3.60% + 450bps floor 0.75% (inert), amort 5% of face,
sweep {participates, priority 1}, maturity 7; pik_note 1.5x (135.0) cash coupon 0, PIK 12%,
OID 2% (2.70), maturity 8, no amort, no sweep; sweep base 50% flat; min cash 8.0;
transaction 2%; financing 1.5% × 405 = 6.075; exit fees 1.5%; **MIP {pool 15%, hurdle
1.5x}** — assert the promote is STRICTLY in the money at exit; §163(j) EBITDA basis —
assert it BINDS in EVERY year of the hold (PIK compounding outruns senior paydown) and the
disallowed carryforward GROWS monotonically (assert final carryforward > 0; the
never-releases path is the tested path).
Check value: PIK payoff at exit = 135 × 1.12^5 = **237.9161** (par + accrued — §9/C-8).

**G4 — loss-maker turnaround: loss banking, two NOL pools, §382, minimum tax** (proves the
full §6 state machine EXCEPT §163(j) binding — asserted non-binding here; G3 covers it):
facts: revenue 200.0, EBITDA 12.0 (6%), **D&A 7%**, maint capex 4%, net PP&E 60.0, NWC 9%
(pct), tax 25%. assumptions: growth [2,3,4,5,5]%; target margin 16% linear (§7: margins
[8,10,12,14,16]% in years 1–5); hold 5; entry 7.0x FY (EV 84); exit 7.0x; unitranche 3.5x
(42.0) floating 3.60% + 500bps floor 0.75% (inert), OID 2.5% (1.05), amort 1% of face,
sweep {participates, priority 1}, maturity 7; sweep base 50% flat; min cash 3.0;
transaction 2%; financing 1.5% × 42 = 0.63; exit fees 1.5%; MIP null; tax: rate 25%,
minimum rate 15% (pre-NOL floor §6.4), acquired NOL 40.0 usable=TRUE arose post-2017 (80%
layer cap), **§382 annual limit 3.0 (= 84 × 3.58% LTTER — basis: target pre-change equity
value = EV in the cash-free/debt-free frame, §6.3)**; §163(j) EBITDA basis.
Asserts: Y1 is a genuine TAX LOSS (banks a post-close NOL — loss branch §6.2); the 15%
floor BINDS in at least one profitable year; the §382 limit is the binding constraint on
acquired-NOL usage in later years; §163(j) does NOT bind in any year (headroom positive);
both pools tracked separately with acquired consumed first.

**G5 — revolver draw/repay cycle** (proves §3 step 6, invariant §14.4, and repay-first
ordering — the leg G2 leaves unexercised):
facts: revenue 80.0, EBITDA 16.0 (20%), D&A 4%, maint capex 3.5%, net PP&E 15.0, NWC 12%
(pct), tax 25%. assumptions: growth [10,8,6,5,4]%; margin flat 20%; hold 5; entry 7.0x FY
(EV 112); exit 7.0x; senior 3.0x (48.0) floating 3.60% + 425bps floor 0, amort 10% of face,
sweep {participates, priority 1}, maturity 6; revolver commitment 20.0, spread 400bps,
commitment fee 0.50%, maturity 5, drawn 0; sweep base 50% flat; min cash 4.0; transaction
2%; financing 1.5% × 68 = 1.02; exit fees 1.5%; MIP null; covenants null;
**growth_capex = [6,0,0,0,0]** (the Y1 spike that forces the draw — exception to the
all-goldens growth_capex=0 rule, deliberate).
Asserts: revolver DRAWS in Y1 (draw > 0; closing cash = floor); repays ahead of the sweep
in later years (step 4 before step 5 — assert sweep = 0 in any year with drawn balance
outstanding at step 4 exit only if pool exhausted by repay; concretely: drawn balance = 0
by end Y3); cash never below floor; no floor-breach flag (revolver never exhausts).
Floor-breach itself (revolver exhausted) is covered by a kernel fixture, not a golden.

**G2-DIST — interim distributions under a BINDING restricted-payment trap [v1.1.1 — G-1]**
(proves §3 step 7's three-way cap, §3.7's closed form and blocked flag, §14.16's period-N
clause, §1 mid-year × distributions): **every field identical to G2** — facts, entry,
financing, operating case, exit, tax, fees — plus exactly two: `structure.distributions =
[25.0, 25.0, 25.0, 10.0, 8.0]` and `covenants.rp_trap = { metric: 'net_leverage', level:
2.75 }`. Holding the base constant is the point: every difference from G2 is attributable
to step 7 alone. Asserts: **entry S&U byte-identical to G2** (step 7 is post-close, so it
cannot re-price entry — the §13 entry-frozen discipline applied to a structure field);
Y1 **fully blocked** (rp_max = 0 while cash above the floor is positive — the trap, not the
cash, is what stops it); Y2 **partially blocked** (paid = rp_max, strictly below BOTH the
request and the cash cap, and the payment lands pro-forma net leverage exactly on 2.75);
Y3 **cash-capped and NOT blocked** (closing cash = the 10.0 floor; rp_max above the
request); Y4/Y5 **request-capped**; the Y5 payment settles inside the period-N sponsor flow;
the unlevered stream is byte-identical to G2's (§9 excludes distributions).
Check values: paid = [0.00, 12.09, 15.34, 10.00, 8.00]; blocked = [T, T, F, F, F];
cumulative 45.43; sponsor stream [−587.22, 0.00, 12.09, 15.34, 10.00, **1052.06**] where the
final flow = sponsor_share 1044.06 + paid[5] 8.00 (§14.16); sponsor IRR **13.3906%**
period-end and **13.4572% mid-year** (the §1 check value); MOIC 1.8553; DPI ends 0.0774,
payback N/A. Note the economics the golden also pins: distributions RAISE the IRR (+19.6bp
vs G2's 13.1946% — earlier cash) while LOWERING the MOIC (1.8553 vs 1.8584 — the cash paid
out no longer sweeps, so more interest accrues). Timing, not alpha.

**G3-DIST — distributions with the trap OFF and a distribution-inflated promote [v1.1.1 —
G-1]** (proves the null-trap branch under LIVE requests, §10's amended hurdle base, §9's
unlevered exclusion on a PIK/OID/days-NWC deal): **every field identical to G3** plus
`structure.distributions = [20.0, 15.0, 25.0, 22.0, 20.0]` and `covenants.rp_trap = null`.
Asserts: entry S&U byte-identical to G3; rp_max renders **N/A every year** and NO year is
blocked (trap off ⇒ only the two cash caps bind — the branch every existing golden leaves
untested, because they all request zero); Y1/Y3 cash-capped to the 8.0 floor, Y2/Y4/Y5
request-capped; the unlevered stream byte-identical to G3's; the promote strictly in the
money. Check value: **MIP = 0.15 × (600.23 + 98.09 − 1.5 × 392.08) = 16.53** — under the
pre-v1.1.0 hurdle base (exit equity alone) the SAME deal pays 1.82, so the fixture
discriminates the §10 amendment by 9.1×. Sponsor IRR 12.5305% (mid-year 12.7509%),
MOIC 1.7389; pre-promote IRR 13.0918%, MOIC 1.7811; DPI ends 0.2502, payback N/A.

**G2-DIST-D — the §13 scenario × distributions golden [v1.1.1]** (proves that the request
schedule and the trap are FROZEN across scenarios while the BINDING is not): G2-DIST's
distribution schedule and trap level **unchanged**, with G2-D's operating deltas laid over
the top — `{growth: each year −200bps, exit_multiple: 8.5}`. A scenario is an operating
case; it may not re-write a distribution POLICY. Asserts: `distributions.requested` and
`trap_level` identical to G2-DIST; entry S&U identical to G2 (§13/§14.17); sponsor IRR ≤
G2-DIST's (§14.8); the unlevered stream identical to G2-D's (its own operating path, same
§9 exclusion rule).
Check value — **the discriminator is year 2**: the base case PAYS 12.09 there (the trap
clipping to exactly 2.75x), while the downside pays **0.00 with `rp_max` = 0 and
`distribution_blocked` = true**. Same policy, weaker EBITDA, and the pro-forma test that
just cleared now fails outright. Cumulative paid falls 45.43 → **35.25**, DPI ends 0.0774 →
**0.0600**, and the sponsor IRR falls 13.3906% → **8.9638%**. This is the exhibit §13 means
when it says a downside that traps the sponsor's distributions is what the credit dashboard
exists to show.

**Golden-uncovered by design [v1.1.1]** — each covered by a kernel/module fixture in the
G-1 engine PR, for the reason stated (same precedent as the floor-breach case above).
Items (i)–(v) were identified when the goldens were built; **(vi)–(ix) were found by the
two independent adjudicators (pass 4) and added here — the list is part of what the
adjudication checks, so it is maintained, not written once. **ENGINE FIXTURES NOW EXIST**
for items (i)–(x) in `tests/engine2-facade-scenarios.test.ts` (the §17-uncovered describe
block) and `tests/engine2-kernel.test.ts` (the directed waterfall cases) — the accuracy
audit (2026-07-25) confirmed CLEAN numbers but flagged that (vii) and the §10 half of (x)
were still UNGUARDED (their mutants passed 402/402); both are now pinned and mutation-tested,
as is the §3.7 EBITDA_adj ≤ 0 corner WITH a payment.**:
(i) §3.7 with `EBITDA_adj ≤ 0` (no financeable golden has a non-positive EBITDA — the
normative closed form's whole point is that it still yields rp_max = 0 there);
(ii) `gross_debt_end` INCLUDING accrued PIK inside a binding trap (G3-DIST has the PIK note
but runs the trap off; G2-DIST has the trap but no PIK);
(iii) the §3.7 exact TIE (`rp_max` exactly equal to the cash-capped amount ⇒ NOT blocked) —
not constructible in float from a full model chain;
(iv) §10's exit-equity CAP binding on the promote (needs cumulative distributions large
against a near-zero exit residual). Note the consequence: **dropping the `min()` entirely
would produce a byte-identical G3-DIST**, so the cap needs its own fixture or it is untested;
(v) payback REACHED inside the hold (needs cumulative distributions ≥ the entry check);
(vi) step 7 inside a REVOLVER-DRAW or floor-breach year — the "paid = 0 by arithmetic"
clause of §3 (G2-DIST never draws; G5 draws but requests nothing). The draw-invariance
result in §3.7 argues it, but no golden exercises it;
(vii) the INNER `min(request, cash cap)` of the blocked test — no golden year has `rp_max`
strictly between the request and the cash cap, so the fixtures cannot distinguish
`min(request, cash cap)` from `cash cap` alone in the FLAG (they do distinguish it in
`paid`). **Now pinned** by a directed kernel case (rp_max 30 strictly between request 10 and
cash cap 50 ⇒ blocked FALSE; the drop-request-term mutant reads TRUE) — accuracy audit C;
(viii) `rollover_equity > 0` — the sponsor's pari-passu pro-rata share of a paid
distribution. Every §17 golden runs rollover = 0, so `sponsor_share_paid ≡ paid` throughout
and the split is untested;
(ix) §14.18's credit-metric exclusion (distributions never enter DSCR/FCCR/ICR or the §11
FCF-conversion numerator). The reference derivation emits no `credit` block, so the clause
is ASSERTED by the spec and by construction, never exercised by a fixture;
(x) **§12/§14.9's amended walk-down** — the "+ interim distributions (sponsor share)" term
and the reconciliation to the sponsor-net TOTAL delta. No golden carries a `bridge` block at
all (the reference derivation emits none), so the amended identity is unexercised. It is
also the one place where §10's and §12's "cumulative distributions" differ: §10's hurdle
base takes the **TOTAL** paid, §12's walk-down adds back only the **SPONSOR SHARE**. Both
degenerate to the same number at rollover = 0 — which every golden runs — so a fixture
CANNOT distinguish them and the engine fixture must (found by the hostile sign-off, round 1).
**Now pinned** by a rollover > 0 ∧ MIP ∧ distributions case that asserts `mip_payout` matches
the TOTAL-base formula and differs from the sponsor-share base by > $0.5m (the `total→share`
mutant fails it), and asserts `walkdown.sponsor_net_delta` directly (closing accuracy audit
findings A and B);
(xi) **§3.7's coherence WARN `distribution_blocked`** — the reference derivation emits no
`coherence` block (the same reason as item (ix)'s missing `credit` block), so the WARN's
existence, severity and once-per-run message are unexercised by any fixture; only its
CONDITION is pinned, via `distributions.blocked_years` on G2-DIST and G2-DIST-D.
**Convention amendment that comes with it [v1.1.1]:** `tests/engine2-facade-scenarios.test.ts`
asserts `coherence == []` for every golden under the rule "every golden is a coherent deal —
ZERO flags". **G2-DIST and G2-DIST-D are deliberate exceptions**: they are designed to trip
`distribution_blocked`, and a blocked distribution is a *coherent* outcome (the trap doing
its job), not a broken model. When the engine PR extends that gate to the DIST goldens it
must allow exactly this one WARN on those two — amended here on purpose, so it is a decision
rather than something discovered as a red test (found by the hostile sign-off, round 2).

---

## §18 Refinancing events [v1.3.0 — G-5; Tier A, engine arithmetic] [DECIDED — independent hostile sign-off round 1 REFUSED → round 2 GRANTED 2026-07-26]

A **refinancing** re-prices, re-terms and (optionally) re-issues an existing cash-pay term
tranche mid-hold, without changing the deal's leverage quantum. Economically it is a
**RETIREMENT of the old tranche + ORIGINATION of a new one at the same par** — the exact two
events §7 (early-retirement write-off) and §2/§7 (origination: OID/fees capitalized and
amortized) already model, fired simultaneously in the refi year, plus a **call premium** paid
in cash. This section reuses those primitives and states only what is genuinely new.

**§18.1 The trigger — an explicit, scheduled event [DECIDED v1-simple].** A refinancing is an
input assumption on a named cash-pay term tranche: `{ tranche_name, year R, new_pricing,
call_premium_pct, new_maturity_years, new_oid_pct, new_financing_fee_pct, new_amort_pct_of_face }`
(schema in §16). It is **not** covenant- or rate-condition-triggered. `R` is the 1-indexed
hold year the refi takes effect. **At most ONE refinancing per tranche in v1** and **at most
one refi per year across the structure is not required — each tranche's refi is independent**,
but a tranche may be refinanced only once.
REJECTED alternatives, each disclosed in §15: (a) a **forward-curve / rate-condition trigger**
("refi when SOFR falls 100bp") — needs a forward base-rate path (backlog #10's Tier-A half) and
a decision rule that is really an optimiser; v2. (b) a **covenant-breach-triggered refi**
(refinance to cure a breach) — a solver-shaped feedback loop (the refi terms depend on the
breach the refi is meant to fix); v2. (c) a **dividend-recap / upsizing refi** (new par > old
outstanding, the excess distributed) — that CHANGES leverage and is really a re-leveraging +
distribution, belonging with backlog #8/#9 and the §3-step-7 distribution machinery, not here;
v1 refis are **par-for-par**. (d) **multiple refis per tranche** — no v1 need; the single-refi
constraint keeps the write-off/origination bookkeeping a single event per tranche.

**§18.2 Scope of what is refinanceable [DECIDED v1-simple].**
- **Cash-pay term tranches only** (`senior` / `unitranche` / `mezzanine`). **PIK notes are NOT
  refinanceable in v1** (a PIK refi interacts with the §6 AHYDO/accrual path and the payoff =
  par + accrued-PIK identity; deferred, §15). The revolver is never refinanced this way.
- **Par-for-par**: the new tranche's face = the OLD tranche's **beginning balance at the start
  of year R** (post years 1..R−1 amortization/sweep). Call it `B`. No upsizing, no paydown
  beyond what the year would do anyway.
- **Sweep participation and priority are carried over UNCHANGED** by the refi (the refi
  re-prices and re-terms; it does not re-rank the sweep). Disclosed §15.

**§18.3 Timing — the refi takes effect at the START of year R [DECIDED].** Consequences,
each a deliberate annual-period convention (§1):
1. **Repricing is effective for the whole of year R.** Year-R cash interest = `B × new_all_in`
   (floating: `max(new_base, new_floor) + new_spread`; §4). The refi year is the FIRST full
   year at the new pricing — the point of a repricing feature is to SHOW the rate benefit in
   the year it lands. REJECTED: mid-year proration of the rate (needs sub-annual periods —
   out of scope with §1's annual periods; the whole-year convention is the same simplification
   §4 already makes for beginning-balance interest).
2. **Maturity extension** re-bases the straight-line schedules. The new tranche's amortization
   horizon = `new_maturity_years` (measured from year R). New **mandatory amort** =
   `new_amort_pct_of_face × B` per year, capped at outstanding (§14.15 — the "original face"
   for the new incarnation is `B`). New **OID amortization** = `(new_oid_pct × B) /
   new_maturity_years` (capped §163(j) interest, §6/§7). New **financing-fee amortization** =
   `(new_financing_fee_pct × B) / new_maturity_years` (uncapped, §6/§7). All three amortize
   starting in year R (a tranche originated at the start of year R amortizes from year R,
   exactly as a close-originated tranche amortizes from year 1).
   **Structural gate (§16):** `(R − 1) + new_maturity_years > hold_years` — the new tranche
   must still mature AFTER the hold, preserving §3/§16's "no balloon inside the hold" rule for
   the new incarnation. `1 ≤ R ≤ hold_years − 1` (a refi in the exit year is just the exit).

**§18.4 The cash cost — a mandatory financing use in the year-R waterfall [DECIDED].** In the
par-for-par gross-up frame §2 uses at close (debt raised at face; OID a separate USE), the
company retires `B` of old par + `call_premium`, pays `new_financing_fees`, and raises only
`B − new_OID` net from the new lenders. The cash it must fund from its OWN cash is therefore:

```
refinancing_cash_cost(R) = call_premium + new_OID + new_financing_fees
  call_premium = call_premium_pct × B          (e.g. 0.01 = a 101 soft-call premium)
  new_OID      = new_oid_pct × B               (funded, then capitalized — §2/§7 analogue)
  new_fees     = new_financing_fee_pct × B      (paid, then capitalized — §2/§7 analogue)
```

This is a **mandatory** use, senior to the discretionary sweep (§3 step 5) and any interim
distribution (§3 step 7). It is inserted as **§3 step 2R** — after commitment fees (step 2),
before mandatory amortization (step 3): `cash −= refinancing_cash_cost`. Placement matters
only when cash is scarce (it correctly shrinks the sweep pool and can pull cash toward a
revolver draw / floor breach, §3 step 6 / §14.4); for a healthy deal it depletes the same
running-cash variable as every other use, so §14.3 conservation holds unchanged. The cash cost
is **never revolver-funded by construction of a distribution** — it PRECEDES the sweep and
distribution, so if it forces a draw, that is a genuine liquidity event the floor-breach
machinery reports, not a hidden one. REJECTED: funding the refi from a fresh sponsor equity
check at R (v1 has no mid-hold equity injection — that is a follow-on, backlog #9-adjacent);
netting OID/fees into the new debt's par (that is the net-of-OID sources error §2 already
rejects — debt is carried at face).

**§18.5 The old-tranche write-off — book in year R, tax deferred to R+1 [DECIDED; reuses §7].**
At the start of year R the old tranche's **unamortized OID + unamortized financing fees** (the
`oidRemaining`/`feeRemaining` balances after years 1..R−1) are written off. The **BOOK** charge
lands in year R — it reduces deferred financing costs and flows through net income to equity
(§8), together with the **call premium** (a loss on extinguishment, expensed in year R; the new
OID/fees are NOT expensed — they are capitalized). The **TAX** deduction — of the write-off AND
the call premium together — enters year **R+1**'s UNCAPPED §163(j) pool, via the SAME
`pendingRetirementDeduction` mechanism §7 uses for early retirement. If `R + 1 = N` it merges
into the exit-year deduction (§9), exactly as §7 already specifies for a year-N retirement.
**The deferral is a deliberate CHOICE, not a sequencing necessity — stated plainly so it is
neither over-justified nor mis-implemented.** The refi is SCHEDULED and its write-off amount
(old unamortized OID + DFC after years 1..R−1) is deterministic and **known BEFORE the year-R
waterfall** — exactly like the exit-year write-off (§9), which the engine computes pre-waterfall
and deducts SAME-YEAR. A par-for-par refi does **not** retire the tranche (its balance continues
at `B` — §14.19(a)/§18.2), so it **never trips §7's balance-crossing `fully_retired` detection**;
the engine must add the refi write-off + premium to the year-R+1 `pendingRetirementDeduction`
bucket by **EXPLICIT refi handling**, reusing only the deferral bucket — never the retirement-
detection path. v1 chooses to defer (rather than deduct same-year like §9) for two reasons: a
**single write-off deferral code path** (no third tax-timing branch beyond exit-same-year and
retirement-deferred) and a **≤1-year deferral of a deduction, conservative on TIMING** (the same
flavour of disclosed conservative bias as beginning-balance interest, §4). REJECTED — and this
is the technically more precise reading, named so it is not mistaken for an oversight: under
Treas. Reg. §1.1001-3 a repricing that moves yield materially is a "significant modification" =
debt extinguishment, whose unamortized OID/DIC and repayment premium are deductible in the YEAR
of the refi (year R, same-year, and the premium as capped §163(j) interest at that). v1 deducts
them a year later and UNCAPPED. The two directions of the resulting bias, split honestly (the
spec is otherwise scrupulous about this — §8/§11): the **timing** deferral (R vs R+1) is
conservative (defers a deduction); the **uncapped** treatment of the call premium (vs the
capped-§163(j) reading) is *anti-*conservative — it OVER-deducts — but ONLY when §163(j) binds
AND the premium is large, and it is INERT otherwise. The refi golden (G6-REFI) is built with
positive §163(j) headroom so capped ≡ uncapped there; the binding case is disclosed (§15) and
exercised by the directed fixture §18.11(ii). Same-year, capped, pre-waterfall treatment would
fork the §6 tax path for a ≤1-year difference. The write-off never reduces cash (it is non-cash
— §9's rule); only the call premium and the new OID/fees move cash (§18.4).

**§18.6 Balance-sheet coherence (the refi closes the BS in year R) [DECIDED].** With `WO =
old_unamortized_OID + old_unamortized_DFC`:

```
Δcash    = −(call_premium + new_OID + new_fees)          (§18.4)
Δdfc     = −WO + (new_OID + new_fees)                    (write-off out, new deferred cost in)
Δdebt    = 0                                             (par-for-par: B → B)
Δequity  = −(WO + call_premium)                          (book loss via NI — §8)
⇒ ΔAssets (= Δcash + Δdfc) = −call_premium − WO = Δdebt + Δequity   ✓ §14.2 closes
```

The equity leg is the ordinary §8 roll (`equity += NI − distribution_paid`) with the refi's book
loss already inside NI; no new equity rule. The new OID/fees are capitalized (they sit in DFC and
amortize), so they do NOT hit equity directly — only the write-off and premium do.

**§18.7 Composition with the rest of the model [DECIDED].**
- **§3 cash sweep**: the refi cost (§18.4) is subtracted before the sweep, so it reduces the
  sweep pool in year R by construction — no special coupling. The new (lower) mandatory amort
  and interest change the pool from year R onward through the ordinary running-cash variable.
- **§3.7 RP trap / §3 step 7 distributions**: the refi is **par-for-par**, so `gross_debt_end`
  (the trap's debt term) is UNCHANGED by the refi itself; the trap and the distribution caps
  compose automatically — the refi simply consumes cash earlier in the same waterfall, lowering
  what sits above the floor. No amendment to §3.7's closed form.
- **§11 covenants**: from year R the new pricing changes cash interest → ICR / FCCR / DSCR move;
  net leverage is unchanged AT the refi (par-for-par) and then deleverages on the new schedule.
  Covenant tests read the post-refi lines with no special handling.
- **§12 value bridge**: the refi's cash costs leave via cash, so they are embedded in `ND₁ =
  payoff − closing_cash` and shrink the **paydown bar** — exactly as the annual monitoring drag
  and interim distributions are (§12 "second-order effects live truthfully inside the paydown
  bar"). They are **NOT** a new walk-down line and add **no new bar**: the two §14.9 identities
  hold unchanged because ND₁ is measured on the actual path. The non-cash write-off does not
  touch the bars. (Disclosed: the refi's interest SAVING and its up-front cash cost both live
  inside the paydown bar via closing cash; the bridge does not decompose "refi benefit" as its
  own bar in v1 — a memo-level attribution is a v2 nicety.)
- **§9 exit**: unchanged. Payoff = Σ balances + drawn (the new tranche's balance feeds in
  naturally); the exit-year write-off is the remaining unamortized OID/fees on ALL tranches,
  now including the new tranche's residual new_OID/new_fees. No §9 formula changes.

**§18.8 Disclosure (§15) and the coherence surface.** A refinancing is a modelled structural
event, not a warning, so it raises **no coherence flag by itself**; the refi year's premium,
write-off and new-tranche terms are DISPLAYED (§18 output surface, UI PR).
**[v1.3.1] The one exception — the retired-balance no-op.** A tranche may enter its scheduled
refi year at or below the §7 economically-retired tolerance (fully swept to zero, or retired in
an earlier year with the v1.0.3 write-off already taken and a dust residual persisting — a model
OUTCOME the §16 input gate cannot know without running the model, so an input-time rejection is
solver-shaped and REJECTED like every solver). The refi then executes as a NO-OP — stamped
`refinanced: true`; premium, new OID/fees and write-off are EXACTLY zero in the swept-to-zero
case and sub-tolerance dust (≤ pct × ε) on a retired residual (the terms swap executes on
≤-tolerance operands — nothing observable restarts) — and the §16 coherence gate emits a
**`refi_noop` WARN flag** naming the tranche and year and stating that the stamped costs are ~0,
because a scheduled structural event that did nothing must say so. The flag is a POST-RUN read of
the named `TrancheYear` fields: `refinanced` ∧ beginning balance ≤ **ε = `RETIRED_TOL` (§7's
economically-retired threshold, = the §15 flow tolerance ±$0.005m)** — ONE tolerance, so the
flagged class ≡ the engine-retired class; check.ts recomputes nothing (its charter). REJECTED
alternatives: (a) input-gate rejection — solver-shaped, above; (b) the silent no-op — the
pre-v1.3.1 behaviour, retired: a per-run OUTCOME belongs on the §16 coherence surface, not in
silence; (c) severity `block` — nothing about the model's economics is broken; the debt was
simply repaid before the event; (d) a tighter ε (machine epsilon) — REJECTED by sign-off round 1:
a tranche at a residual in (0, `RETIRED_TOL`] is already engine-RETIRED (§7 write-off taken), so
its refi is exactly the no-op class; flagging only exact zeros would let a refi run "live" on
dust the engine itself calls retired. The v1 simplifications
in §18.1–§18.5 are each listed on the assumptions & methodology page (§15): scheduled trigger
only (no forward-curve/covenant trigger); single refi per tranche; par-for-par (no dividend
recap); cash-pay term tranches only (no PIK refi); whole-year repricing at the start of year R
(no mid-year proration); write-off + premium deducted UNCAPPED in year R+1 (vs the §1.1001-3
same-year capped reading — conservative, ≤1-year, inert without a binding §163(j)); sweep
priority carried over unchanged.

**§18.9 Golden re-derivation plan [where numbers move].** The `refinancing` assumption defaults
**absent/null** (feature OFF), and **no** existing §17 golden sets it, so the regeneration is
**purely ADDITIVE** (the G-1 discipline, phrased as G-1 was): on every G1–G5 / G2-D / G2-DIST /
G3-DIST / G2-DIST-D fixture **0 values change, 0 are removed**, and the only additions are the
new unconditionally-emitted `TrancheYear` columns (`refinanced` = false, `refinancing_cash_cost`
= 0, `unamortized_writeoff` = 0), proved leaf-by-leaf in the golden PR. **No pre-existing number
moves.** The FEATURE is exercised by ONE new golden, **G6-REFI** (§18.10), plus directed engine
fixtures for the golden-uncovered refi branches (§18.11).

**§18.10 The refinancing golden — G6-REFI [built in G-5 step 2].** `G6-REFI` = **every field of
G2 held constant** plus a single `refinancing` event on the **TLB at year R = 3**, so every
difference from G2 is attributable to §18 alone (the G-1 variant discipline). Refi terms: new
floating **base 3.60% + spread 275bps** (a 100bp repricing down from G2's 375bps), **call
premium 1.0%** (101 soft call), **new maturity 6 years** (from the refi; absolute maturity year
8 > hold 5), **new OID 0.5%**, **new financing fee 1.0%**, **new amort 1.0% of the new face**.
Asserts: entry S&U byte-identical to G2 (§18 is post-close — the refi cannot re-price entry);
years 1–2 byte-identical to G2 (the refi is a year-3 event); year-3 TLB cash interest FALLS
(repricing) and the year-3 waterfall carries the refi cash cost (premium + new OID + new fees);
the year-3 BOOK write-off of the old TLB's unamortized OID/fees lands in year 3 while its TAX
deduction lands in year 4's uncapped pool; §163(j) never binds (positive headroom every year, so
the capped/uncapped write-off treatment is inert — G2's property, preserved by the lower post-
refi interest); the BS closes every year (§14.2); the unlevered stream is byte-identical to G2's
(§9 is capital-structure-blind — a refinancing is a financing event). Check values are fixed by
the reference derivation (`scripts/goldens/spec_calc.py`) and adjudicated at ±$0.005m / ±0.1bp.

**§18.11 Golden-uncovered by design [v1.3.0]** — each covered by a directed kernel/module fixture
in the G-5 engine PR, mutation-tested against the exact wrong reading it discriminates (the same
discipline §17 [v1.1.1] applies to the distribution branches):
(i) **refi where `R + 1 = N`** — the deferred write-off/premium deduction MERGES into the exit-
year uncapped pool (§18.5 / §9); G6-REFI runs R = 3, N = 5, so the deduction lands cleanly in
year 4 and never merges. A fixture must exercise the merge or the merge path is untested;
(ii) **refi under a BINDING §163(j)** — where the year-R+1 uncapped write-off/premium deduction
and the capped-vs-uncapped call-premium simplification (§18.5) actually MOVE cash tax; G6-REFI
has positive headroom every year, so capped ≡ uncapped there and the simplification is inert —
untested without a directed binding-headroom fixture;
(iii) **refi cash cost forcing a revolver DRAW / floor breach** — §18.4's "senior to the sweep,
can pull cash toward the floor" clause; G6-REFI stays well above the floor, so the interaction of
the refi use with §3 step 6 is unexercised by the golden;
(iv) **refi + a live §3-step-7 distribution / RP trap in the SAME deal** — §18.7's "composes
automatically, par-for-par leaves `gross_debt_end` unchanged" claim; G6-REFI requests no
distributions, so the joint path is untested by a golden;
(v) **the structural gates** — `(R−1)+new_maturity_years ≤ hold_years` (balloon inside hold),
`R = hold_years` (refi in the exit year), refi naming a PIK note or the revolver, refi naming a
tranche that does not exist: each an input-gate REJECTION (§16), not a computed default, and none
constructible inside a passing golden — pinned by directed rejection fixtures;
(vi) **refi of a term tranche with a NON-ZERO unamortized OID balance** — G6-REFI refinances the
G2 TLB, which carries **OID = 0** (§17), so at the refi the OLD-OID write-off and the
OLD-OID-amortization-STOP sub-paths run with all-zero inputs. The engine keeps OID and financing
fees in SEPARATE schedules (`oidRemaining` vs `feeRemaining`, `oid_amortization` vs
`financing_fee_amortization`), so the OID side must be independently written off and stopped at
the refi; G6-REFI exercises the FEE side (the TLB has a fee allocation) and the NEW-OID side (new
OID 0.5% > 0, amortized then exit-written-off), but NOT the OLD-OID transition. A directed fixture
MUST refinance an OID-bearing tranche and be mutation-tested against (a) **old unamortized OID not
written off at the refi** and (b) **old OID amortization not stopped** (old + new OID
double-amortizing) — both of which pass G6-REFI byte-for-byte. This is the mainstream case
(TLBs at 99–99.5, unitranche — cf. G3/G4 OID) and closes the sign-off's blocking finding;
(vii) **multiple independent refis in one deal** (§18.1 permits one refi per tranche across
several tranches). The write-offs/premiums co-accumulate into the single year-R+1
`pendingRetirementDeduction` and the cash costs sum at step 2R — additive and independent, the
same summing the exit-year write-off already does across tranches. Covered by construction, but a
one-line directed fixture (two tranches refinanced in different years) pins the accumulation;
(viii) **the retired-balance no-op [v1.3.1]** — a tranche fully swept/retired to zero before its
scheduled refi year: the event is a stamped no-op and the §16 `refi_noop` WARN fires — and it must
NOT fire for any live-balance refi (G6-REFI flags nothing). The directed fixture is mutation-tested
THREE ways: (a) drop the flag emission → the no-op deal's assertion reddens; (b) widen the
condition (flag every refi) → the live-balance negative assertion reddens; (c) a DUST-balance deal —
amortization leaves a residual in (0, `RETIRED_TOL`] before the refi year (engine-retired, dust
persists) — asserts the flag STILL fires, which pins ε to the §7 tolerance (any tighter ε, e.g.
machine epsilon, reddens it).


## §19 Fund/LP overlay — net-to-LP returns on a fund-of-one [v1.4.0 — Phase 2 / backlog #3; Tier A, engine arithmetic] [DECIDED — rounds 1–2 REFUSED (7 + 3 blocking), all applied; round 3 GRANTED 2026-08-08, fingerprint-anchored @ 01f0ec8, zero conditions]

The deal's SPONSOR-side cash flows become the portfolio flows of a HYPOTHETICAL single-asset
fund ("fund-of-one"), and a fourth return stream — **net to LP after management fees and
carried interest** — is computed per the ILPA definitions DR-2 pins (Net IRR = "net of
management fees and carried interest"; TVPI/DPI on PAID-IN capital). Default `fund: null` =
feature OFF ⇒ every pre-v1.4.0 model is byte-identical; `ModelOutput.fund` is null and the
stream is ABSENT (never a zero row) when OFF. **The suggestion layer proposes NO fund
overlay** (a fund structure is an LP-agreement fact with no history/convention basis — the
distributions/refinancing precedent); the §19.2 parenthetical conventions become field-level
suggestion material only AFTER the user turns the overlay on [round-1 B7].

**§19.1 The frame — fund-of-one, SPONSOR side only [DECIDED v1-simple].** One deal, one
fund: LP contributions fund the SPONSOR equity check at t=0 and the annual management fee as
drawn; distributions to the fund are the SPONSOR SHARE of the §3-step-7 interim
distributions plus the §9 SPONSOR exit proceeds (`exit.sponsor_share` — post-§10-promote,
post-rollover). **Rollover holders are NOT LPs of the fund-of-one** — their pari-passu slice
of every distribution (the §9/§10 v1.1.1 rule, `sponsorShareOfDistributions`) stays outside
the overlay entirely [round-1 B1]. REJECTED alternatives: (a) a multi-deal fund with
commitment pacing/recycling — a portfolio model, not a deal model (v2; ILPA's
subscription-line with/without presentation goes with it, DISCLOSED as omitted); (b)
treating the §10 MIP/promote as fund carry — the promote is PORTFOLIO-COMPANY-level
management incentive, already deducted BEFORE `exit.sponsor_share` (exit.ts computes postMip
before the rollover split); fund carry is a DIFFERENT layer on the sponsor-to-LP boundary
(DR-2's four-layer stack: unlevered → pre-promote → sponsor net → net-to-LP). Conflating
them is the double-count DR-2 Item 4 warns about; (c) overlaying the TOTAL equity
distributions — credits the LP fund with the rollover holders' money [B1].

**§19.2 Inputs (`fund` — §16 schema below; all rates decimals).**
`committed_capital: number | null` — null ⇒ committed is DERIVED for REPORTING as total LP
contributions (invested equity + fees drawn). **Input gate [round-1 B5]: `committed_capital
= null` ∧ `fee_basis = 'committed'` is REJECTED** — the fee would depend on committed which
depends on fees drawn (a fixed point; §5's no-solver rule forbids resolving it). An explicit
`committed_capital` below required contributions is likewise REJECTED (§16).
`mgmt_fee_pct` (convention 2.0%; domain ≥ 0), `fee_basis: 'committed' | 'invested'`
(invested = the t=0 sponsor equity check, constant — v1 has no NAV basis; fee step-down
schedules and post-investment-period basis switches are REJECTED → v2, DISCLOSED).
`carry_pct` (20%; domain [0, 1)), `pref_rate` (8%, COMPOUNDED annually; domain ≥ 0),
`catchup_pct` — domain **{0} ∪ [carry_pct, 1]** [round-1 minor 2: a catch-up share below the
carry share can never reach the step-3 target, silently stranding the waterfall in step 3
with a GP profit share BELOW the hard-hurdle case; gated, not defaulted].
`waterfall: 'european' | 'american'` (§19.4). `fee_offset_pct` (domain [0, 1]; ILPA
principle: 1.0) — the §5 monitoring-fee income (`gp_fee_income.annual[t]`, plus
`.termination` in year N) offsets the fee, FLOORED at zero per year (an offset never becomes
a negative fee); `gp_fee_income = null` ⇒ offset 0 [round-1 minor 5].

**§19.3 LP cash-flow assembly (annual, engine periods; year-end order pinned in §19.4).**
- t=0 outflow: `sources_uses.sponsor_equity` (§2 plug — the INVESTED capital).
- Year t (1..N) outflow: `fee_t = max(0, mgmt_fee_pct × basis − fee_offset_pct ×
  (gp_fee_income.annual[t] + [t=N] gp_fee_income.termination))`. `mgmt_fees_net[t] ≡ fee_t`
  — the FLOORED draw (an unfloored "post-offset" reading breaks §19.6(a) exactly in a
  floor-binding year) [round-1 minor 3]. Fees are LP capital DRAWN: they enter paid-in and,
  under 'european' ONLY, the return-of-capital hurdle base and the pref-accrual base (§19.4).
- Year t inflow: `sponsorShareOfDistributions(distributions_paid, sponsor_equity,
  rollover_equity)[t]` — the SPONSOR share, never the total [B1] — and, at t=N additionally,
  `exit.sponsor_share`.
- All flows year-end (§1); the §1 mid-year IRR display toggle applies to the LP stream
  exactly as to the sponsor streams (display-only; year-N flows never shift).

**§19.4 The distribution waterfall (per year, running state; event order PINNED [B3]).**
Running state per election: `unreturned` — 'european': ALL paid-in not yet returned
(invested + fee draws); 'american': the INVESTED capital not yet returned (fee draws NEVER
enter `unreturned` and NEVER accrue pref under 'american') [round-1 B3]. `pref_accrued`
compounds at `pref_rate` on `(unreturned + pref_accrued)` — the election's own base.
**Year-end event ORDER (each t): (1) ACCRUE pref on the PRE-DRAW state; (2) DRAW `fee_t`
(it enters paid-in now and — 'european' only — `unreturned`; accrual already ran this
year-end, so a fee first accrues pref at the NEXT year-end); (3) APPLY the year's
distribution through the steps below.** At t=N the fee draws at step (2) and the exit
proceeds ride step (3) — so under 'european' the final fee IS inside the exit
distribution's hurdle base: "all contributions whole first" holds LITERALLY, and the
§19.6(d) 'european' bound is exact [round-2 B8 — the draw-AFTER order silently gave
`fee_N` the 'american' treatment and broke the bound by carry_pct × fee_N; REJECTED]. [B3]
Distribution walk (amount D):
1. **Return of capital**: pay down `unreturned` (the election's own base, above).
2. **Preferred return**: pay `pref_accrued`.
3. **GP catch-up**: the GP receives `catchup_pct` of each marginal dollar until
   `gp_carry_paid = carry_pct × (pref paid + catch-up paid + lp profit paid)` — the GP
   reaches its carry share of PROFITS DISTRIBUTED SO FAR (profits INCLUDE the pref — the
   market-standard base; at catchup_pct = 1 this yields the classic `carry/(1−carry) × pref`
   catch-up). `catchup_pct = 0` skips (hard hurdle). The LHS includes later step-4 carry
   while the RHS is evaluated during step 3 — equivalent under 'american', and under
   'european' only while no NEW pref accrues after a step-4 dollar (base extinguished, both
   sides growing in the carry ratio). The equivalence is NOT universal under 'european':
   later fee draws re-seed `unreturned`, new pref accrues, and `carry_pct × (pref + catch-up
   + LP-profit paid)` can overtake `gp_carry_paid` — step 3 then RUNS AGAIN. The normative
   stop-equation above governs on cumulative state (GP stays within the §19.6(d) bound —
   conservative), and the re-trigger case is pinned by directed fixture §19.10(x)
   [round-1 minor 7, RESCOPED by the step-3 accuracy audit 2026-08-08: the original "no
   re-trigger exists on every reachable state" claim was refuted by a worked 'european'
   counterexample (fees re-seed the base); the normative equation is UNCHANGED and the
   implementation already followed it].
4. **Carry split**: remaining D splits `(1 − carry_pct)` LP / `carry_pct` GP. This tier is
   TERMINAL — nothing ranks after it.
**Under 'american' there is NO fee-recovery tier [round-1 B2]: fee draws are simply never
part of the hurdle — the LP recovers them only through its profit share. That asymmetry IS
the entire, deliberate difference between the elections for a single-asset fund** (carry
becomes payable once the DEAL's capital + pref are back; European makes ALL contributions
whole first). REJECTED: (a) deal-by-deal carry across multiple deals (no second deal
exists); (b) GP clawback mechanics (single deal, carry paid only on realized distributions
in waterfall order — nothing to claw back by construction; DISCLOSED); (c) GP commitment
(LPs are 100% external; v2); (d) a fee-recovery tier junior to the terminal split (dead by
construction — the round-1 B2 finding).

**§19.5 Outputs (`ModelOutput.fund`, null when OFF).**
`lp_contributions[t]` (t=0..N; [0] = sponsor equity), `lp_distributions[t]`, `gp_carry[t]`,
`mgmt_fees_net[t]`, `paid_in_total`, `committed_capital` (echo, or derived-for-reporting),
and the stream `fund_lp_net: {irr, moic, dpi[], payback_year}` where:
- `moic = Σ lp_distributions ÷ paid_in_total` — TVPI ≡ DPI at exit (everything REALIZED at
  N; no RVPI row exists; the display labels the multiple "TVPI (= DPI — fully realized)").
- `dpi[t] = (cumulative lp_distributions through t) ÷ (cumulative lp_contributions through
  t)` — the ILPA to-date ratio on the GROWING paid-in, NOT ÷ paid_in_total [round-1 B6].
- `payback_year` = the first year cumulative `lp_distributions` ≥ cumulative
  `lp_contributions` to date, counting INTERIM distributions only — the year-N exit inflow
  does not count (the §9/L-10 rule, applied at the LP layer) [B6]; null when never reached (the pass-2 sentinel pin).
  [Layer note, audit 2026-08-08 N2: at THIS layer ALL of year N is excluded — the §14.16
  merged period-N flow makes year-N interim inseparable from exit post-waterfall — whereas
  the sponsor-layer rule counts year-N interim distributions separately; a deal repaying on
  year-N interim alone shows sponsor payback = N, fund payback = null. Engine and reference
  both implement this reading.]
Labels carry the ILPA basis: "Net to LP — after fund fees & carry (fund-of-one overlay)".
The §12 bridge is UNCHANGED (the overlay is value SHARING on the sponsor-LP boundary, not
value creation — DR-2 Item 7); a memo line "less: fund fees & carry → net to LP" may render
on the returns surface only.

**§19.6 Invariants (→ §14.20, domains stated).**
(a) CONSERVATION [restated, round-1 minor 3]: `Σ lp_distributions + Σ gp_carry ≡
Σ sponsor-share inflows (sponsor share of distributions_paid + exit.sponsor_share)` at 1e-9
— every dollar the deal pays the SPONSOR side lands with the LP or the GP; fee draws are LP
capital (they cancel identically between contribution and `mgmt_fees_net` and are therefore
NOT in this identity — the offset money is GP fee income, not a deal flow).
(b) `fund_lp_net.irr ≤ returns.sponsor_net.irr` whenever any fee or carry > 0. Domain: both
IRRs defined per `kernel/irr`'s multi-root/endpoint policy (the policy §14.12/§14.14's domains also lean on) — LP streams with fee-only years carry extra
sign changes; where `kernel/irr` returns null under its multi-root policy the comparison is
N/A, never a fabricated pass [round-1 minor 4].
(c) `fund = null` ⇒ `ModelOutput.fund = null` and every other output byte-identical.
(d) GP-share bound, PER ELECTION [round-1 B4 — the single-bound form is FALSE under
'american'; worked counterexample recorded in the sign-off]: 'european':
`gp_carry_total ≤ carry_pct × max(0, Σ lp_distributions + Σ gp_carry − paid_in_total)`;
'american': the same bound with `sources_uses.sponsor_equity` (INVESTED capital) in place of
`paid_in_total`. Both at 1e-9.
(e) 'american' net-to-LP IRR ≥ 'european' net-to-LP IRR is NOT an invariant (carry timing
cuts both ways with interim distributions) — explicitly a non-claim.

**§19.7 Composition.** Reads ONLY sponsor-side outputs — `distributions_paid` WITH
`sources_uses.{sponsor_equity, rollover_equity}` through the ONE share rule
(`sponsorShareOfDistributions`), `exit.sponsor_share`, and `gp_fee_income` [B1] — a
POST-ENGINE layer inside `runModel` after §9/§10, before §16 coherence; it touches NO
waterfall/tax/BS arithmetic (the §14.19 refi invariants, §3.7 trap, §11 covenants are
upstream and unaffected). Scenarios (§13) recompute the overlay per scenario from that
scenario's sponsor flows; LP CONTRIBUTIONS are scenario-invariant in EVERY configuration
[round-1 minor 5 — the carve-out the r1 draft carried was self-contradictory and is
retracted]: sponsor_equity is entry-frozen (§13), the fee basis is a constant, and the
offset's monitoring income is a FIXED annual dollar amount (§5) — none is touched by
`ScenarioDeltas` (operations + exit_multiple only). LP DISTRIBUTIONS vary by scenario, as
they must. [v1 reality, audit 2026-08-08 N1: each scenario's full re-run computes the
overlay from that scenario's flows and then DISCARDS it — the spec-pinned slim
`ScenarioResult` schema (§16) carries no fund field, so no stale overlay can carry over;
SURFACING per-scenario LP-net is a v2 exposure item, tracked, not a silent omission.]

**§19.8 Disclosure (§15 row).** Fund-of-one overlay; annual fee on a constant basis (no
step-downs, no NAV basis); no subscription line (ILPA's with/without presentation N/A); no
GP commitment; no clawback (nothing to claw back by construction); 'european' =
all-contributions hurdle and pref base, 'american' = invested-capital hurdle and pref base
with NO fee-recovery tier; the §10 promote is portfolio-level and NOT fund carry; the year-N fee draws BEFORE the
final distribution (inside its hurdle base under 'european') [B8].

**§19.9 Golden plan.** New golden **G7-FUND** = G2-DIST (live interim distributions — the
pref/return-of-capital ordering is exercised mid-hold, not only at exit) + overlay
`{committed_capital: null, mgmt_fee_pct: 0.02, fee_basis: 'invested' [B5 — the 'committed'
election on a null committed is now input-gated], carry_pct: 0.20, pref_rate: 0.08,
catchup_pct: 1.0, waterfall: 'european', fee_offset_pct: 1.0}`. **G2-DIST carries NO
monitoring fees (verified: §17 G2 sets none; the fixture's monitoring_termination = 0.0), so
the golden's offset is INERT by construction** [round-1 minor 1 — pinned, no question mark];
the LIVE offset is §19.10(iv)'s directed fixture. `scripts/goldens/spec_calc.py` gains an
independent fund-waterfall path. Regeneration of existing goldens: byte-identical (feature
OFF everywhere else). Adjudication: the standard two independent passes.

**§19.10 Golden-uncovered by design** (directed fixtures, mutation-tested): (i) 'american'
vs 'european' on the SAME deal — with fee draws > 0 the hurdle/pref-base difference must
move BOTH the pref paid and the carry (well-defined under B2/B3's pinned mechanics);
(ii) `catchup_pct = 0` (hard hurdle) and `catchup_pct = carry_pct` (the domain floor);
(iii) a deal that never clears the pref (carry = 0 exactly; the LP absorbs the shortfall);
(iv) LIVE fee offset (monitoring fees reduce the draw; the zero floor BINDS in at least one
year, and §19.6(a) still holds through it); (v) `committed_capital` explicit >
contributions with `fee_basis: 'committed'` (fee-on-committed > fee-on-invested) plus the
TWO §16 rejections (null ∧ committed-basis; committed below contributions); (vi) `fund =
null` byte-identity (§19.6(c), the C5-style gate); (vii) `rollover_equity > 0` with the
overlay ON — the LP inflow must be the SPONSOR share (the B1 discriminator: a total-based
mutant moves every fund number); (viii) [step 3, 2026-08-08] the B8 EVENT-ORDER pin at unit
level — observable ONLY where catch-up does not complete (a hand-derived hard-hurdle N=1
micro-deal: accrue-on-pre-draw gives GP 2.4; the rejected draw-first order gives 2.24 —
every runModel fixture is order-blind because same-year catch-up completion cancels pref
out of GP); (ix) [accuracy audit 2026-08-08, finding B1] the COMPOUNDED-PREF-MAGNITUDE pin
— hard-hurdle exit-only deal where GP = carry × (proceeds − capital − capital×(1.08⁵ − 1));
a simple-interest mutant survived every prior fixture because catchup-completing shapes are
algebraically pref-magnitude-blind; (x) [accuracy audit 2026-08-08, finding B1] the
'european' catch-up RE-TRIGGER — fee draws re-seed `unreturned` after a completed catch-up,
new pref accrues, and step 3 runs AGAIN (the §19.4 minor-7 rescope's worked counterexample;
pins the stop condition's step3+step4 memory terms, which a dropped-`step4Lp` mutant
otherwise passes).

## §20 PIK toggle — per-year cash/PIK election on the PIK note [v1.5.0 — Phase 3 / backlog #6; Tier A, engine arithmetic] [DRAFT — hostile sign-off round 1 pending]

**§20.1 The frame [DECIDED v1-simple].** The v1 `pik_note` (§4) is FIXED: every year it pays
`cash_coupon` in cash AND accrues `pik_coupon` into the balance — both legs, unconditionally.
§20 adds the market PIK-TOGGLE shape (the DR-3.4 "PIK Toggles Are Back" class — HY and
private-credit notes whose issuer elects per interest period): a per-year ELECTION
`e_t ∈ {'cash','pik'}` choosing how year t's coupon is served — 'cash' pays
`beginning × cash_coupon` in cash and accrues NOTHING; 'pik' accrues
`beginning × pik_coupon` into the balance and pays NOTHING. The note's two existing rate
fields ARE the two election rates (the PIK rate carrying the market premium — §20.2 gates
it non-negative). Elections are an ISSUER DECISION under the indenture, made by the sponsor:
the suggestion layer proposes NONE (the distributions/refi/fund precedent), and
`elections: null` ≡ the v1 FIXED note — every pre-v1.5.0 model byte-identical (§20.6(c)).
REJECTED alternatives: (a) partial/50-50 elections (real indentures sometimes allow a
half-PIK election — v2, DISCLOSED §20.8); (b) a `pik_premium` field with pik = cash +
premium (a second way to state what two rates already state; schema stability wins);
(c) an election OPTIMIZER (picks elections to maximize IRR) — a modeling decision presented
as a fact (the §19-preamble/B7 lesson), and coupon strategy is a liquidity/covenant
negotiation, not an arithmetic optimum; (d) treating the fixed note as sugar for all-'pik'
elections — a FALSE equivalence: the fixed note runs BOTH legs in the SAME year (cash paid
AND accrual), which no election sequence reproduces; the fixed note REMAINS the
null-election semantics, stated so nobody "simplifies" the union later.

**§20.2 Inputs (§16 schema above).** `PikNoteAssumption.elections: ('cash' | 'pik')[] |
null`, default null. Input-gate REJECTIONS: (i) non-null length ≠ `hold_years` (the schedule
is per HOLD year; the note's maturity extends past the hold like every tranche); (ii) any
entry outside the union; (iii) non-null ∧ `cash_coupon ≤ 0` — a toggle whose cash option
costs 0% is a free coupon holiday no lender signs; the FIXED cash-0 accreting note (G3's
shape) remains available as `elections: null`; (iv) non-null ∧ `pik_coupon < cash_coupon` —
the PIK premium compensates deferral (DR-3.4 market shape); a PIK rate below cash would
make 'pik' lender-worse in every state. REJECTED: silently clamping/normalizing any of
these — elections are indenture terms, not UI slips; reject loudly (§16).

**§20.3 Mechanics (§4 convention, §5 order unchanged).** Per year t on the note's beginning
balance B (opening balance — §4's beginning-balance convention applies verbatim):
- `e_t = 'cash'`: cash interest = B × cash_coupon — joins the §4 cash-interest line (ICR
  interest, DSCR service, the §3 waterfall's interest leg); pik_accrual = 0; the balance is
  unchanged by the coupon (mandatory amort and any configured sweep still apply — §20.5).
- `e_t = 'pik'`: pik_accrual = B × pik_coupon, compounding into the balance at year end
  exactly as §4's fixed accrual; cash interest = 0.
- `elections: null`: BOTH legs — §4's fixed semantics verbatim.
Elections are DATA read at each year's interest step; the §5 evaluation order gains no new
dependency and no cycle enters (rates → interest from opening balances → tax → FCF →
waterfall, unchanged).

**§20.4 Tax (§6).** The §6 machine is UNCHANGED; only the capped pool's per-year COMPOSITION
becomes election-dependent — 'cash' contributes the note's cash interest, 'pik' contributes
the accrual, null contributes both (the pool already sums cash + PIK + OID amort).
Deducting PIK as it ACCRUES remains the v1 convention. **AHYDO** — IRC §163(e)(5)/§163(i):
an applicable high-yield discount obligation (maturity > 5 years, YTM ≥ AFR + 5pts,
significant OID — accrued PIK counts) has its OID/PIK deduction DEFERRED until actually
paid, and the disqualified portion (yield above AFR + 6pts, pro-rata) PERMANENTLY
disallowed — remains a DISCLOSED OMISSION (§20.8) with a STRUCTURAL coherence flag
(§20.6(e)), not a computed adjustment. REJECTED: modeling the AHYDO catch-up payment and
the disqualified-portion split in v1 — it needs the monthly AFR (external data), the
constant-yield OID method, and an indenture-level catch-up term; v2, WITH the flag so no
deal wears the omission silently. [DR-3.4: most real PIK/toggle indentures carry a
contractual AHYDO catch-up payment curing the deferral by the 5th-anniversary accrual
period — the flag names exactly when that cure is being ASSUMED.]

**§20.5 Composition.** Sweep/amort: UNCHANGED — PIK notes still never participate in the
sweep unless `sweep.priority` is explicitly set (§3/§4), and `amort_pct_of_face` applies
(capped at outstanding, §14.15) regardless of election — a 'cash' year with amort pays
coupon + amort like any cash tranche, and a 'pik' year with amort both accrues and
amortizes (the §20.10(iv) directed case). Refinancing (§18): PIK notes remain NOT
refinanceable — the §18.2 gate reads the tranche TYPE, not the election (a cash-electing
toggle is still a pik_note). §9 exit payoff = par + accrued to date — formula unchanged,
path now election-dependent. §11 credit: ICR/DSCR read the year's CASH interest — a 'pik'
year raises coverage exactly as the market intends the toggle to (that is its point). §12
bridge: unchanged (net-debt paydown reads closing balances incl. accrued PIK). §13
scenarios: elections are STRUCTURE/POLICY — FROZEN across scenarios (the
distribution-schedule precedent); what varies by scenario is whether cash-election years
strain the min-cash floor. §19 fund overlay: composes unchanged (reads sponsor-side
outputs only). §10 MIP: unchanged (reads exit equity).

**§20.6 Invariants (→ §14.21, domains stated).**
(a) Toggle balance closed form — DOMAIN: elections non-null ∧ amort = 0 ∧ sweep off:
`B_t = face × Π_{s ≤ t, e_s='pik'} (1 + pik_coupon)`; with amort or sweep configured the
closed form yields to the §3 walk, and only `pik_accrual_t = 0 in cash years` stays pinned.
(b) Cash-interest identity: `cash_interest_t = B_{t−1} × cash_coupon × [e_t = 'cash']`
(toggle mode); fixed mode: unconditional.
(c) `elections: null` ⇒ BYTE-IDENTITY with the v1.4.0 engine on every output (the C5-class
gate; every existing golden regenerates byte-identically — no golden sets elections).
(d) Capped-pool membership per §20.4 — §14.13's pool mirror extended per election: the
pool's PIK term is the year's accrual (zero in cash years); its cash term includes the
note's cash interest (zero in pik years).
(e) `ahydo_shape` (WARN, per qualifying tranche, deterministic on terms alone):
fires exactly on `maturity_years > 5` ∧ (an accruing year exists — elections null ∧
pik_coupon > 0, OR any `e_t = 'pik'`). The §163(i) YIELD leg (YTM ≥ AFR + 5pts) requires
the monthly AFR and is STATED in the flag text, never tested; the text also names the
assumed contractual catch-up cure. Boundary: `> 5`, not `≥ 5` (§163(i)(1)).
(f) Explicit NON-claim: no ordering between all-cash and all-PIK sponsor IRRs — cash
elections drain the sweep pool's fuel while PIK compounds the exit payoff; the direction
depends on the rate stack vs the deal's deleveraging profile (the §19.6(e) precedent).

**§20.7 Outputs.** NO new ModelOutput fields: `TrancheYear.{cash_interest, pik_accrual}`
already carry the per-year split (the election is legible from the schedule, and the
assumptions object rides the output for trace). Display surfaces render elections from
`assumptions.structure` (input surface) and the existing schedule columns (output surface)
— no new derived display number exists.

**§20.8 Disclosure (§15 row).** Per-year WHOLE-coupon election only (no partial/50-50 —
v2); elections frozen across scenarios; PIK deducted as ACCRUED with AHYDO
(§163(e)(5)/§163(i)) a disclosed omission — deferral-until-paid and the
disqualified-portion disallowance are NOT modeled; the `ahydo_shape` flag marks every
qualifying note structurally (maturity > 5y + an accruing year), with the yield leg stated
as untested (needs the monthly AFR) and the contractual catch-up cure named as assumed;
PIK notes remain non-refinanceable (§18.2) and sweep-exempt by default (§4).

**§20.9 Golden plan.** New golden **G8-PIKT** = G3's facts and structure with the pik note
toggled: `{cash_coupon: 0.09, pik_coupon: 0.12, elections: ['pik','pik','cash','cash','pik']}`
— senior tranche, OID 2%, MIP, everything else IDENTICAL to G3. Closed-form checks:
balance 135 → ×1.12 (151.2000) → ×1.12 (169.3440) → flat → flat → ×1.12 ⇒ **exit payoff
135 × 1.12³ = 189.665280** (par + accrued, §9); cash-election years 3–4 each pay
0.09 × 169.3440 = **15.240960**. The §6 binding pattern under the mixed pool is ADJUDICATED
during workbook construction, never assumed (G3's binds-every-year assert does NOT port;
per §17's rule a failed qualitative assert amends the golden or the assert spec-side before
commit). Regeneration of existing goldens: byte-identical (elections null everywhere —
§20.6(c)). Reference: `scripts/goldens/spec_calc.py` gains the election branch in ITS OWN
debt walk (no engine reuse — the independence rule). Adjudication: the standard two
independent passes.

**§20.10 Golden-uncovered by design** (directed fixtures, mutation-tested):
(i) all-'cash' elections — the note behaves as a bullet cash tranche (accrual identically
zero; payoff = par); (ii) all-'pik' at rate r vs the FIXED cash-0 note at the SAME r —
EQUAL on every output (the two shapes coincide exactly when the fixed note's cash leg is
0); then cash_coupon > 0 breaks the equality via the fixed note's second leg (the
both-legs discriminator — kills a sugar-for-all-pik mutant); (iii) the FOUR §16 rejections
(length ≠ hold; out-of-union entry; cash_coupon ≤ 0 with elections; pik < cash);
(iv) elections on a note WITH mandatory amort — a 'cash' year pays coupon + amort and the
balance DECREASES; a 'pik' year accrues AND amortizes (the §20.6(a) domain edge);
(v) `ahydo_shape`: fires on maturity 8 ∧ any 'pik' year; fires on the FIXED accreting note
(G3's shape — null elections, pik_coupon > 0, maturity 8); does NOT fire on maturity 5
(boundary: > 5) nor on an all-'cash' toggle; (vi) §163(j) pool composition flips between
legs — a directed fixture where the cap BINDS in a 'pik' year and RELEASES in a 'cash'
year (the pool-membership mutant discriminator: a mutant deducting the wrong leg moves
cash tax); (vii) elections ∧ sweep participation — the balance DECREASES through accrual
years via the sweep (the closed form correctly yields to the walk).

---

## Changelog

| Ver | Date | Change | Basis |
|---|---|---|---|
| v1.5.0 | 2026-08-08 | **PHASE-3 FEATURE AMENDMENT (spec-first; NO engine/UI code in this version) — PIK toggle (backlog #6). TIER A.** §20 added: a per-year WHOLE-coupon cash/PIK ELECTION on the `pik_note` — 'cash' pays `beginning × cash_coupon` with NO accrual, 'pik' accrues `beginning × pik_coupon` with NO cash, `elections: null` ≡ the v1 FIXED both-legs note ⇒ byte-identity on every existing model (§20.6(c)). §16 gates: non-null length ≡ hold_years; entries in the union; `cash_coupon > 0` ∧ `pik_coupon ≥ cash_coupon` when non-null (a 0%-cash toggle is a free coupon holiday; the PIK premium is non-negative — DR-3.4 market shape). Tax: the §6 machine unchanged, the capped pool's per-year composition follows the elected leg (§20.4); **AHYDO stays a DISCLOSED omission** plus the new STRUCTURAL `ahydo_shape` WARN — fires on maturity > 5y ∧ an accruing year, yield leg (AFR + 5pts) stated-not-tested, the assumed contractual catch-up cure named (§20.6(e)/§20.8). Composition unchanged by construction: §5 order (elections are data), §3/§4 sweep-exemption + amort, §18.2 non-refinanceability (gate reads TYPE, not election), §9 par+accrued payoff, §13 elections FROZEN across scenarios, §19 unaffected. NO new ModelOutput fields (`TrancheYear` already splits cash/PIK). Invariants §14.21 (a)–(f) incl. the closed-form balance (domain-scoped), the null-elections byte-identity gate, the per-election pool mirror, and the all-cash-vs-all-PIK IRR NON-claim. Golden plan: **G8-PIKT** (= G3 + `{cash 9%, pik 12%, elections [pik,pik,cash,cash,pik]}`; payoff closed form 135 × 1.12³ = 189.665280; cash years pay 15.240960; the §6 binding pattern ADJUDICATED, not ported from G3) + SEVEN directed uncovered fixtures (§20.10 (i)–(vii), incl. the both-legs discriminator, the pool-membership flip, and the ahydo_shape boundary set). REJECTED: partial/50-50 elections (v2, disclosed), a `pik_premium` field, election optimizers, fixed-note-as-all-pik sugar — each recorded with its reason (§20.1). | Phase-3 step 1 (Tier A template, rebuild/PHASE_G_EXTENSIONS.md); backlog #6; hostile sign-off round 1 PENDING |
| v1.4.0 | 2026-08-07 | **PHASE-2 FEATURE AMENDMENT (spec-first; NO engine/UI code in this version) — fund/LP overlay (backlog #3). TIER A.** §19 added: a fund-of-one overlay computing the FOURTH return stream (net-to-LP after management fees and carried interest, per the ILPA definitions DR-2 pins). LP flows = sponsor equity at t=0 + annual fee draws (2%/basis, ILPA 100% monitoring-fee offset, floored at 0) vs deal distributions + exit proceeds; waterfall = return-of-capital → 8% compounded pref → catch-up (domain {0} ∪ [carry_pct, 1]) → TERMINAL carry split, with 'european' (all-contributions hurdle + pref base; year-N fee drawn before the final distribution) vs 'american' (invested-capital hurdle + pref base; NO fee-recovery tier — fees recovered only through the LP profit share) as the SPEC'D single difference for a single-asset fund. §10 promote explicitly NOT fund carry (different layer — the DR-2 double-count trap). Default `fund: null` = OFF ⇒ byte-identity; stream ABSENT when OFF. Invariants §19.6 incl. the LP+GP ≡ sponsor-share-inflows conservation (fee draws cancel identically; the offset is GP fee income, not a deal flow) and the explicit NON-claim on american-vs-european ordering. Golden plan: G7-FUND on G2-DIST + SEVEN directed uncovered fixtures (§19.10 (i)–(vii), incl. the rollover sponsor-share discriminator). REJECTED: multi-deal funds, subscription lines, clawback (nothing to claw back by construction), GP commitment, fee step-downs — each disclosed (§19.8). | Phase-2 step 1 (Tier A template); hostile sign-off round 1 REFUSED — 7 blocking (total-vs-sponsor-share LP inflow; dead 'american' fee-recovery tier; unpinned pref base/event order; §19.6(d) false under 'american' (worked counterexample); circular committed ∧ committed-basis under the golden; unbound dpi/payback; unwritten §14/§15/§16 integration + suggestion stance) — ALL applied in r2; round 2 REFUSED (3 closure-of-closure: the draw-after fee order broke the 'european' GP bound via fee_N — order flipped to accrue→draw→distribute; the Change column still described r1 — resynced; §14.20(d)'s dpi monotonicity false on the to-date basis — replaced with cum-dist monotone + dpi[N] ≡ moic) — ALL applied in r3; **round 3 GRANTED** (fingerprint-anchored @ 01f0ec8, zero conditions; both GP-share bounds machine-verified to EQUALITY on the reviewer's worked deal under both elections). **Post-grant step-3 accuracy-audit dispositions applied IN-VERSION (2026-08-08, commit 6d611d3; conformance-ruled no-new-version — normative surface untouched):** §19.4 minor-7 equivalence note RESCOPED on a worked 'european' re-trigger counterexample (the normative stop-equation UNCHANGED; the implementation already conformed); §19.5 layer note + §19.7 v1-reality note added; §19.10 extended (viii)–(x) (event-order, pref-magnitude, re-trigger pins — two of the three close audit coverage holes θ/δ). The granted text is @ 01f0ec8; audit deltas are annotated inline with their finding tags |
| v1.3.2 | 2026-08-07 | **DATA-SIDE AMENDMENT (Tier B; engine arithmetic untouched) — uploaded-filing extraction.** The upload path goes live for ANNUAL documents (interim/10-Q uploads REJECTED up-front — the reused mapper would anchor nothing and the import would be all-gap): SEC 10-K/20-F iXBRL `.htm`, UK Companies House accounts iXBRL (THE private-company filing form; v1 extracts IDENTITY only — every financial field an honest gap the user confirms, FRC alias mapping a named later extension), and ESEF `.zip` packages (nested `**/reports/*.xhtml`), all parsed ENTIRELY in the browser (privacy: a private target's accounts never leave the machine — server-side parsing REJECTED on exactly that) into the OIM shape `mapIfrsReport` already consumes, or (us-gaap) into a synthesized CompanyFacts consumed by `mapCompanyFacts` VERBATIM — zero new mapping logic; the adjudicated mappers are reused as-is. New arithmetic is confined to transform/scale/sign evaluation and fact grouping, spec'd normatively in `lib/edgar/IXBRL_SPEC.md` (supported ixt subset with drop-with-note for the rest — a dropped fact can only produce a GAP, never a wrong number; fixture set incl. a REAL Apple FY2024 10-K trim + a REAL 19KB Companies House FRC filing; independent Python reference extraction + two adjudication passes + CI regeneration gate — the DERIVATION.md method). Schema: the THREE source unions gain `'upload'` (additive; provenance restamp appends `· uploaded <filename>` to mapper details, never replacing the audit strings). Dedup is decimals-aware and order-INDEPENDENT (the real Apple 10-K carries 70 duplicate keys — an order-dependent pick is $38m wrong on UnrecognizedTaxBenefits); only DIMENSION-FREE facts enter the CompanyFacts synthesis (segment members must never impersonate consolidated totals). Documented degradations vs fetch: single-vintage history (no restatement dedup), the §1.1 LTM stitch RUNS and REFUSES on three proven grounds → FY basis + staleness badge does the honest work. | Phase-1 upload parser (owner-approved formats 2026-08-07); Tier-B template rebuild/PHASE_G_EXTENSIONS.md; hostile sign-off round 1 REFUSED — 9 blocking (transform registry contradicted by BOTH real samples: TR2 unhyphenated names, TR5 namespace missing — two of three classes would extract ZERO; order-dependent dedup; dimensional leakage; 10-Q all-gap story; unproven stitch claim; provenance restamp + third union; FRC classification inverted; ESEF glob; allowlist deltas) — then rounds 2–3 REFUSED (3 + 1 further blockers: FRC period-end self-contradiction, restamp erasing the 'default' statutory tag, the un-runnable Apple dup pin, the JS 0!=null fabricated-URL/pseudo-CIK path) — ALL applied through IXBRL_SPEC r4; **round 4 GRANTED** (fingerprint-anchored @ fb8021e) |
| v1.3.1 | 2026-08-07 | **§18.8 amendment — the retired-balance refi no-op gets a VOICE (post-#113 review NOTE-8, owner-approved).** A tranche can enter its scheduled refi year with a zero balance (swept/retired earlier — a model OUTCOME, unknowable at input time). Pre-v1.3.1 this ran as a SILENT no-op (stamped `refinanced: true`, all zeros). Now: the no-op semantics are UNCHANGED (still stamped; costs EXACTLY zero when swept to zero, ≤ pct × RETIRED_TOL dust on a retired residual; the terms swap runs on ≤-tolerance operands — nothing observable restarts, and no golden-covered number moves anywhere), and the §16 coherence gate emits a **`refi_noop` WARN** naming the tranche and year — a POST-RUN read of named `TrancheYear` fields (`refinanced` ∧ beginning balance ≤ **`RETIRED_TOL`** — §7's economically-retired threshold = §15's ±$0.005m; sign-off round 1 REFUSED for an unbound ε contradicting the gloss — a dust residual in (0, RETIRED_TOL] is engine-retired yet a machine-epsilon ε would run its refi "live"; pinned to the ONE existing tolerance so flag-class ≡ retired-class), consistent with check.ts's no-second-path charter. REJECTED: input-gate rejection (solver-shaped — needs the model's own sweep outcome); silent no-op (a per-run OUTCOME belongs on the §16 coherence surface, not in silence); `block` severity (economics aren't broken — the debt was simply repaid early). §16 schema: `CoherenceFlag.code` gains `refi_noop`. §18.11 gains (viii): the directed fixture, mutation-tested THREE ways (emission dropped ⇒ red; condition widened to every refi ⇒ the G6-REFI/live-balance negative reddens; a dust-balance deal pins ε = RETIRED_TOL ⇒ a tighter ε reddens). Goldens: byte-identical (no golden constructs a zero-balance refi; flags are not golden columns). | Post-merge NOTE-8 disposition (PR #113 review 2026-08-07); mini Tier-A (engine-path file check.ts + types.ts union); hostile sign-off round 1 REFUSED (B1: ε unbound) → fixes → round 2 GRANTED (2026-08-07, fingerprint-anchored) |
| v1.3.0 | 2026-07-26 | **PHASE G-5 FEATURE AMENDMENT (spec-first; NO engine/UI code in this version) — refinancing events. TIER A (touches engine arithmetic — full five-step template).** §18 added: a scheduled per-tranche refinancing modelled as a RETIREMENT of the old tranche + ORIGINATION of a new one at the SAME par, plus a call premium. Reuses §7 (early-retirement write-off) and §2/§7 (origination: OID/fees capitalized + amortized) verbatim. (1) **Trigger** = an explicit event `{tranche_name, year R, new_pricing, call_premium_pct, new_maturity_years, new_oid_pct, new_financing_fee_pct, new_amort_pct_of_face}` — NOT covenant/rate-condition-triggered (§18.1; forward-curve and covenant-cure triggers REJECTED → v2). (2) **Effective at the START of year R**: year-R interest at the NEW rate (repricing shown in the year it lands; mid-year proration REJECTED — §1 annual periods), new straight-line amort/OID/fee horizon = `new_maturity_years`, structural gate `(R−1)+new_maturity_years > hold_years` (§18.3). (3) **Par-for-par** — new face = old beginning balance `B` at year R; no upsizing (dividend-recap/upsizing REJECTED → §8/#9); cash-pay term tranches only (PIK refi REJECTED → v1 AHYDO interaction); one refi per tranche (§18.2). (4) **Cash cost** = `call_premium + new_OID + new_financing_fees`, a MANDATORY §3 **step 2R** use (after commitment fees, before mandatory amort), senior to sweep/distributions, never revolver-funded-by-a-distribution by construction (§18.4). (5) **Old write-off** (unamortized OID + DFC): BOOK in year R (NI/equity/§8), TAX deduction of the write-off AND the call premium in year **R+1**'s UNCAPPED §163(j) pool via the §7 `pendingRetirementDeduction` path (merges into the exit deduction if R+1=N); the §1.1001-3 same-year-capped reading is the technically-more-precise REJECTED alternative (v1 defers — ≤1yr, conservative, single code path, inert without a binding §163(j)) (§18.5). (6) **BS closes** in year R by construction (§18.6 algebra). (7) **Composition**: refi cost shrinks the sweep pool via the running-cash variable; par-for-par leaves `gross_debt_end` unchanged so the §3.7 RP trap composes automatically; §11 covenants read the new interest; §12's bridge embeds the refi costs in the paydown bar via closing cash (NO new bar/walk-down line — §14.9 unchanged); §9 exit unchanged (§18.7). (8) §16 schema `structure.refinancing: RefinancingEvent[] | null` + structural gates; §14.19 invariants (par-for-par at refi; BS close; write-off/premium in R+1 uncapped); §15 disclosure lines. **Golden re-derivation: purely ADDITIVE — every existing G1–G5/G2-D/G2-DIST/G3-DIST/G2-DIST-D fixture has 0 values changed / 0 removed**, only the new unconditionally-emitted `TrancheYear` columns (`refinanced`=false, `refinancing_cash_cost`=0, `unamortized_writeoff`=0) added (feature default OFF, no golden sets it — proved leaf-by-leaf in step 2); the feature is exercised by ONE new golden **G6-REFI** (= G2 + a TLB refi at year 3: −100bp, 101 premium, 6-yr maturity, 0.5% OID, 1% fee) plus directed engine fixtures for the golden-uncovered branches (§18.11: R+1=N merge, binding §163(j), refi-forced draw, refi+distribution, the structural-gate rejections, the **non-zero old-OID refi**, multi-tranche refis). **Independent hostile sign-off round 1 REFUSED** (2 blocking, both about COVERAGE/CONSISTENCY — "not disputing a single committed value"; the §18.6 BS algebra, §18.4 gross-up frame, §18.7 bridge/RP-trap composition and buildability were verified SOUND), all applied here: (B1) §18.11's golden-uncovered list omitted the **non-zero old-OID refi transition** — G6-REFI refis the OID=0 TLB, so a mutant that fails to write off / stop old OID ships green; added as §18.11(vi) with a mutation-tested directed fixture. (B2) §18.5 justified the R+1 deferral as "known post-waterfall like a sweep retirement" — FALSE (the refi is scheduled/pre-waterfall and par-for-par does NOT retire the tranche, so it never trips §7's `fully_retired` detection); restated as a deliberate CHOICE (single deferral code path + conservative ≤1yr timing) with explicit EXPLICIT-refi-handling wiring, not the retirement-detection path. Minors applied: additive-not-byte-identical phrasing (§18.9); the "conservative" label split into timing-conservative vs premium-uncapped-anti-conservative (§18.5); multi-tranche refis noted (§18.11(vii)); header marked decided-pending-sign-off. **Round 2 GRANTED (2026-07-26)** — both blocking closures verified INDEPENDENTLY against the on-disk text (not the summary); the §18.6 BS-closure algebra, §18.4 gross-up cash frame vs §2, §18.7 bridge/RP-trap composition, no-cycle buildability and Tier-A classification were confirmed sound in round 1 and undisturbed by the fixes. Four non-blocking residuals carried into steps 2–3: (1) the §18.11(vi) fixture must use old_OID>0 ∧ new_OID>0 on the SAME tranche with R+1<N (both schedule transitions + a discrete non-merged deferral year); (2) `scripts/goldens/spec_calc.py` gets a FULL independent refi path (rate switch, OID/fee schedule swap on base B, `pendingRetirementDeduction`, step-2R cash cost) — no reuse of the engine's swap logic; (3) `sequence.ts` `netIncome` gains a call-premium extinguishment-loss term for §18.6's equity leg (G6-REFI's BS-close assert discriminates a missing term); (4) the refi financing-fee basis is `new_fee_pct × B` (tranche face), NEVER re-allocated pro-rata from the §2 stack fee. | Phase G-5 template step 1 (Tier A, rebuild/PHASE_G_EXTENSIONS.md); backlog #5; pairs with the deferred call-protection module; hostile sign-off round 1 REFUSED → round 2 GRANTED |
| v1.2.0 | 2026-07-25 | **PHASE G-2 FEATURE AMENDMENT (spec-first; NO engine/UI/data code in this version) — quarter-stitched LTM sizing basis. DATA-SIDE (Tier B): the ENGINE arithmetic is unchanged; only the extraction layer changes WHAT `fy_ebitda`/`fy_revenue` is. Admission ticket = an EMPTY git-diff over the engine arithmetic path (byte-identical goldens are a necessary SECONDARY check, not the proof — corrected after the tier-governance review).** §1.1 added: the sizing EBITDA/revenue becomes the most-current trailing-twelve-months figure — `LTM(M) = FY(M) + YTD_current(M) − YTD_prior(M)` (normative), telescoping to the 12 months ending at the latest interim period end `e`; Q4-standalone stub `= FY − YTD_9M` for the display series; derived EBITDA stitches PER COMPONENT (OI + D&A) and refuses (→ FY fallback + note) if any component is absent at any of the three spans (D1 no-fake-total rule). Spans identified by fiscal-period ROLE with widened day-count windows (full year 350–380, 9M 250–285, 6M 165–200, quarter 80–100) for 52/53-week filers and fiscal-year changes; END-date keyed, per-period tag resolution (history.ts D1 rules reused), and a CROSS-SPAN vintage/basis-consistency REFUSAL (per-period latest-vintage does not by itself keep the three spans consistent — see F3). FPI / annual-only filers (20-F, e.g. SAP) cannot stitch ⇒ latest FY with an as-of and a **staleness badge** (fresh ≤4.5m / aging 4.5–14.5m / stale >14.5m — filing-overdue cadence, cited, not a magic number). Provenance records the three filed spans (or the FY-fallback age); no value is invented — a metric the stitch cannot build stays FY or MISSING, never a default. §11's "FY(LTM)" is now realized by §1.1. Rejected: latest-FY-only (status quo, up to ~15m stale); annualize a partial period ×4 (ignores seasonality); average 4 standalone quarters (fragile — filers report YTD); change the engine to quarterly periods (that is the Tier-A deferral, a different change). Adjudicated by DATA-LAYER fixtures (US-GAAP mid-year stitch / 52-53-week / FPI-fallback / missing-component refusal / span-hole), independently hand-derived; engine goldens NOT regenerated. **Independent hostile sign-off round 1 REFUSED** — the Tier-B classification and the (corrected) admission ticket were CONFIRMED SOUND, but the STITCH arithmetic had 3 BLOCKING silent-wrong-number bugs on ordinary corporate events, all now fixed: (F1) no abutment guard — a fiscal-year-end change left the latest full-year FY non-adjacent to the current partial and produced a >12-month garbage LTM that the day-count windows could not catch; now an executable precondition (`Y_end+1d = C_start`, no YTD crosses a FYE) refuses → FY. (F3) my restated-vintage fixture claim was FALSE — per-period latest-vintage CREATES a cross-vintage mix (inclusive FY 10-K vs continuing-only restated prior-YTD in a newer 10-Q, ~12% overstatement); now the stitch refuses on a >1% restatement note or FY/prior-YTD vintage divergence. (F4) revenue (single tag) could stitch while EBITDA (component-derived) fell back, giving `FY_EBITDA ÷ LTM_revenue` and a trajectory projected off LTM revenue but sized on FY EBITDA; now a single-basis-pair rule drops BOTH to FY if either refuses. Minors also applied: interim-D&A is the load-bearing EBITDA reliability gate (F5); staleness re-glossed FILING-OVERDUE with 13.5→14.5m annual (F6); YTD_prior is role+END-date matched, not calendar −365, ≤1-week 52/53 disclosed (F7); the `fy_*`-holds-LTM naming reconciled with ledger L-11/C-6, basis inseparable from the value, no consumer reads basis from the field name (F8); blast-radius stated — this fact is the base of the WHOLE model (F9); provenance structured-fields authoritative, string display-only, Q4-stub refusable (F10). Fixtures (i)–(vii) rewritten so the REFUSAL branches are pinned. **Round 2 REFUSED** — round-1's F1/F3/F4 confirmed genuinely fixed (F1 abutment proven fail-safe, F3 discontinued-ops caught by the restatement-note rule, F4 pair-consistency sound), but one BLOCKING interaction the fixes EXPOSED plus minors, all now applied: (B1) the LTM flip collides with §9/§11's NTM valuation base `FY × (1+growth[0])` — DECIDED: `growth[0]` is an annualized FY-over-FY rate (verified: `history.ts::yoyGrowths`/`cagrOverTrueSpan` over consecutive year-ends), so `LTM × (1+growth[0])` = "the twelve months following the anchor" — MORE literal-NTM than the old FY base, not an over-projection; §9/§11 cross-referenced, `entry_ebitda_for_sizing` "always FY" comment flagged for the data PR, directed NTM fixture (viii) added. (M1) the F3 vintage check was fail-OPEN (proceed-unless-caught, leaning on a prior-year Q4 stub US-GAAP filers don't file) — inverted to FAIL-CLOSED (stitch only if the three spans are POSITIVELY one vintage-era; else refuse), the same fail-open posture R2-1 rejected for the tier ticket. (M2) `entry_ebitda_for_sizing`'s and `entryMultipleDisplay`'s "ALWAYS FY" OUTPUT-side comments flagged for the data PR (F8 caught only the input `fy_*` comment). (M3) the F6 "looser bound" gloss corrected — 14.5m is built on the 10-K's 2.5m lag, CONSERVATIVE for the 20-F's 4m. (Q1) the 52/53-week tolerance pinned to EXACTLY 7 days (>7d refuses). **Round 3 REFUSED** — B1 CONFIRMED correctly resolved and sound (annualized-growth[0] decision code-verified), M2/M3/Q1 closed, but the M1 rewrite OVER-corrected: fail-closed condition (a) was formalized as `filed`-date EQUALITY, which is UNSATISFIABLE (a 10-K full year and a 10-Q prior-year interim never share a filing; the prior-YTD's winning vintage always post-dates the FY 10-K — the normal state), so the stitch would ALWAYS refuse and G-2 would ship as a silent FY-only no-op. FIXED: condition (a) re-formalized as vintage-PRESENCE (is the restatement check EVALUABLE — original vintage retained alongside latest?), not filed-equality; operative rule = stitch iff (b)'s >1% restatement note is meaningfully evaluable AND does not fire. Worked checks pinned (discontinued-ops restatement → refuse; normal grower → stitch; ESEF single-vintage → refuse); fixture (i) now asserts the normal case PROCEEDS (no-op regression guard) and (ix) added for the ESEF refusal. Re-sent for round 4; no code until GRANTED. | Phase G-2 template step 1 (Tier B, rebuild/PHASE_G_EXTENSIONS.md); backlog #2; hostile sign-off rounds 1–3 REFUSED → fixes |
| v1.1.3 | 2026-07-25 | **DISPLAY-ONLY LABEL FIX — zero arithmetic change, no golden touched.** The entry multiple was hard-labelled `'Entry multiple (FY)'` in the Excel Summary sheet and stated as `at X FY EBITDA` in the downloaded memo, but `derived.entry_multiple` is on the VALUATION basis — NTM-based under an NTM entry (§9), where those labels are FALSE (same defect class as the v1.1.2 entry-leverage rename: the value is correct, the label was not). §11 already decided the convention ("if entry is NTM-based the UI shows both, LTM canonical"); this IMPLEMENTS it via one shared display helper `entryMultipleDisplay` (`facade.ts`) used by all three surfaces (Excel, memo, Summary tile): the multiple is labelled by its actual basis, and under NTM the FY/LTM-canonical figure (EV ÷ `entry_ebitda_for_sizing`, always FY) is shown alongside. FY deals are byte-identical. NTM is golden-uncovered (§9), so it is pinned by DIRECTED tests + mutation on each surface (hard-coding the basis label, dropping the canonical row, and reverting the memo clause each turn a test red). No spec GAP — §11 was already decided; this is code catching up to it. | Open ticket (pre-existing, deferred from G-1); no amendment needed (implements existing §11) |
| v1.1.2 | 2026-07-24 | **NAMING + LABEL CORRECTION — zero arithmetic change; every golden VALUE byte-identical (one fixture KEY renamed, proved leaf-by-leaf: 1 removed / 1 added per golden, 0 changed).** `derived.entry_net_leverage_fy` was named "net" but always computed GROSS (total par ÷ FY EBITDA). Both Phase G-1 adjudicators flagged it independently. **The value is correct and stays** — gross is what the market quotes and what §17 sizes tranches on — so this is option (a), a rename, not a re-derivation: field → **`entry_gross_leverage_fy`**, and §11 now states the convention with its rejected alternative (netting against funded min-cash) and the reason. **The defect reached three DISPLAYED surfaces, two of them falsely**: the Excel export row `'Entry net leverage (FY)'` and the same line in the DOWNLOADED IC MEMO (`memoSkeleton` → `<Entity>_memo.md`; **not** a prompt — the first draft of this row called it one, which the hostile sign-off corrected) each sat directly above a genuinely-net final-year figure, so both read as one series across two bases and OVERSTATED deleveraging by the min-cash artifact (G2 would show 4.0x → 0.86x where the like-for-like gross entry figure is 4.0x and the net entry figure is 3.909x). All three labels now say GROSS, the basis divergence is disclosed in the memo's `## Caveats` section, on the Excel `Methodology` sheet and in the Credit tab/sheet headers, and all three labels are now ASSERTED by tests — they were not, which is why the original defect was undetectable. **The old code comment is also corrected**: it justified the value by asserting that in the cash-free/debt-free frame "entry net debt ≡ par because min-cash is new money" — a false premise (the t=0 BS holds the cash; being newly funded explains why it is there, not why it is not cash). §11 records the remaining disclosed gap: ModelOutput carries no entry-date NET leverage; §11 now also states that the deferral is a product call about headline surfaces, not a measure of effort (the numerator already exists in `facade.ts` and is already displayed via §12's paydown bar). **Hostile sign-off round 1 REFUSED** with 5 blocking findings, all applied: the displayed number had ZERO engine-side test coverage (proved by mutation — the net definition AND a hard-coded 99.0 sentinel both passed 373/373); the added assertion reduced algebraically to `min_cash > 0`; the memo 'fix' wrote an IMPERATIVE into a user-facing deliverable; a second copy of the false-premise comment survived; §11's new labelling rule was breached by the very artifacts this change shipped; and zero label assertions were added for a defect that WAS a label. §11's rejection also gained its strongest argument (minimum operating cash is not surplus cash — credit agreements net only unrestricted cash, and §3.7 already treats floor cash as unavailable), the first two reasons having been circular and secondary. **Round 2 GRANTED (2026-07-25)** — an independent reviewer reproduced every fix on an isolated tree: both round-1 mutations (net definition AND the 99.0 sentinel) now go RED through the new C5-gate assertion; the imperative is out of the downloaded memo; the false-premise duplicate is gone; all three labels are mutation-tested; the zero-arithmetic claim reproduces (changed=0, one key renamed per golden). Three new residuals, all cosmetic and non-blocking: F2's gap assertion is algebraically a `gross == Σpar/EBITDA` test (insensitive to the cash VALUE, though it decisively catches the net-definition drift it targets); the fc210d3 message said "nine goldens" where the C5 loop is 8 (G2-D shares G2's entry S&U, covered by the C2 gate); the UI Credit tab header is still bare "Net lev" with the basis in the note directly below. | Independently flagged by BOTH Phase G-1 adjudicating agents, 2026-07-24 (adjudication passes 4a and 4b, `tests/goldens/DERIVATION.md`); owner-directed fix; independent hostile sign-off round 1 REFUSED → round 2 GRANTED |
| v1.1.1 | 2026-07-24 | **PHASE G-1 GOLDEN EXTENSION (template step 2; still NO engine/UI code).** Three new §17 goldens, each holding its base golden constant so every difference is attributable to §3 step 7 alone: **G2-DIST** (= G2 + `distributions [25,25,25,10,8]` + `rp_trap {net_leverage, 2.75}`) exercises all four cap branches — fully trap-blocked / partially trap-blocked / cash-capped / request-capped — plus a year-N payment and the §1 mid-year check value (sponsor IRR 13.3906% period-end vs 13.4572% mid-year); **G3-DIST** (= G3 + `distributions [20,15,25,22,20]`, trap OFF) exercises the null-trap branch under LIVE requests and pins §10's amended hurdle base (MIP 16.53 vs 1.82 under the pre-v1.1.0 rule — a 9.1× discriminator). Both assert entry S&U byte-identical to their base (step 7 is post-close) and an unlevered stream byte-identical to their base (§9 exclusion). **Existing fixtures: ZERO numeric movement — the regeneration is provably ADDITIVE** (leaf-by-leaf: 0 changed, 0 removed, 270 added across G1–G5/G2-D; all six schedule.csv diffs are pure appends). New fixture columns: `waterfall[].distribution_requested / rp_max / distribution_paid / distribution_blocked`, `returns.dpi / payback_year`, `returns.{sponsor_net,pre_promote}.irr_mid_year`, and a `distributions` block. **G2-DIST-D** (= G2-DIST + G2-D's operating deltas, with the request schedule and trap level UNCHANGED) proves §13's freeze rule: same policy, weaker EBITDA, and year 2 flips from paid 12.09 to fully BLOCKED (rp_max 0) — cumulative 45.43 → 35.25, sponsor IRR 13.3906% → 8.9638%. One wording clarification the goldens FORCED, matching shipped behaviour with zero numeric change: **§1 stream scope** — the mid-year option applies to the sponsor-side streams only (this is what makes v1.1.0's inertness claim true: the unlevered stream carries interim UFCF in every deal); And one NEW normative rule filling a hole v1.1.0 shipped with (NOT a clarification — there was no prior behaviour to match): **§8 equity roll** — equity[t] = equity[t−1] + NI[t] − paid[t]. §14.2's BS-close forces *an* offsetting entry but does not by itself pick this one, so §8 now REJECTS the two alternatives that also close: expense treatment (identical BS — rejected because it would contaminate NI/EBIT and the §6 tax base) and the contra-asset presentation (which the fixtures DO discriminate). §17 also records the branches left golden-uncovered BY DESIGN, each with its reason and a required engine-side fixture. **Adjudication pass 4 (two independent hand-derivations, 392 + 397 lines, ZERO mismatches beyond tolerance — SIGNED; DERIVATION.md) also returned four findings applied in this version**: (a) the golden-uncovered list was INCOMPLETE — added (vi) step 7 inside a revolver-draw/floor-breach year, (vii) the inner `min(request, cash cap)` of the blocked FLAG, (viii) `rollover_equity > 0`'s pari-passu split, (ix) §14.18's credit-metric exclusion (the reference derivation emits no `credit` block); (b) §3.7 gains the DRAW-INVARIANCE result — `rp_max` is unchanged by a step-6 draw because *d* enters `cash` and `gross_debt_end` alike, so "never revolver-funded" holds independently of the step order; (c) §9's membership table gains a LEGEND — `out (−)` (in the stream, as t=0 outflow) vs `excluded` (not in the stream) are not synonyms, and an adjudicator misread it on first pass; (d) §1's drafted "~0.5–1.0pp" mid-year magnitude is CORRECTED — the non-shifting exit flow dominates, so the measured uplift is +6.7bp (G2-DIST) and +22.0bp (G3-DIST), and the UI must not promise a pp-scale effect. Both passes separately flagged a PRE-EXISTING out-of-scope defect (`derived.entry_net_leverage_fy` is gross while §11 defines net) — ticketed, not folded in. **Independent hostile sign-off round 1 REFUSED** — explicitly "not disputing a single committed value", but with 5 BLOCKING coverage/gate findings, all applied here: (i) the uncovered list still omitted §12/§14.9's walk-down term (no golden carries a `bridge` block) — now item (x), with the §10-TOTAL vs §12-SPONSOR-SHARE divergence that no rollover-0 fixture can distinguish; (ii) §13's scenario × distributions was neither covered nor listed — closed with the **G2-DIST-D golden**, not a list entry; (iii) the `PENDING_G1_KEYS` guard probed a deal with NO schedule, so an engine emitting the columns only when the feature is ON would have slipped past it and left the C5 gate skipping them on G1–G5 forever — the guard now probes a LIVE schedule and §16 requires unconditional emission; (iv) `returns.dpi` / `payback_year` / `irr_mid_year` / the `distributions` block had NO guard at all — a matching self-deleting guard now sits in the C6 gate; (v) the unlevered-membership assertion tested only stream LENGTH (vacuous — adding `paid[t]` to every UFCF passes it) — replaced with the byte-identity actually claimed. Minors also applied: DPI's VALUE now asserted against `cum ÷ sponsor_equity`; §16 states the ModelOutput contract (incl. `rp_max` null ⇔ +∞ and unconditional emission); §1 resolves what `irr` means under `mid_year_irr: true` (both always carried; the toggle only selects the headline). **Round 2 GRANTED** with three text-only conditions, applied here: (a) a duplicated clause my §10 edit left behind, removed; (b) §17 item **(xi)** for §3.7's coherence WARN — the reference derivation emits no `coherence` block, so only the WARN's CONDITION is pinned — together with the convention amendment it forces: `engine2-facade-scenarios.test.ts` asserts `coherence == []` for every golden, and G2-DIST/G2-DIST-D are deliberate exceptions (a blocked distribution is the trap working, not an incoherent deal), decided here rather than discovered as a red test; (c) §16's output-contract omissions closed — `ScenarioResult.waterfall`'s two added fields, plus a statement that the fixtures' top-level `distributions` block is FIXTURE-ONLY and must not become a ModelOutput surface (every value is derivable from `waterfall[]`, so it would be a second path). Round 2 verified the guards by MUTATION on an isolated tree: the conditional-emission engine that defeated the round-1 guard is caught by the round-2 guard, and `rp_max: null` / `payback_year: null` — the natural feature-off values that a `toBeFalsy()` would have let through — are caught too. | Phase G-1 template step 2; reference derivation `scripts/goldens/spec_calc.py`; adjudication pass 4a/4b + independent hostile sign-off (round 1 REFUSED → round 2 GRANTED) recorded in `tests/goldens/DERIVATION.md` |
| v1.1.0 | 2026-07-24 | **PHASE G-1 FEATURE AMENDMENT (spec-first; NO engine/UI code in this version): interim distributions + restricted-payment cash trap.** All pre-existing output fields numerically unchanged for every existing deal (when code lands, ModelOutput additionally GAINS paid/blocked rows + DPI — additive fields only): the feature is default-OFF (`distributions: null ≡ zeros`, `rp_trap: null`), no §17 golden sets either field, and the suggestion layer proposes neither — **golden regeneration NOT needed for this amendment; the FEATURE requires a golden EXTENSION (template step 2: a distributions variant workbook + derivation + adjudication) BEFORE any engine code lands.** (1) §3 step 7 goes live: paid = max(0, min(request[t], cash − min_cash, rp_max)); never revolver-funded (step-6 ordering + the floor cap); blocked/clipped capacity NOT accrued (rejected: owed-distributions ledger). (2) §3.7 RP trap: pro-forma net-leverage test (real agreements test giving effect to the payment); LINEAR in the paid amount ⇒ closed-form rp_max = max(0, cash − (gross_debt_end − L × EBITDA_adj)) — **the no-solver rule holds; the backlog's feared same-year cycle dissolves** (interest is beginning-balance, debt service already fixed at step 7). DSCR-metric trap REJECTED v1 (numerator unchanged by the payment — vacuous pro-forma). New coherence WARN `distribution_blocked`. (3) §9 membership row (sponsor +, pre-promote +, unlevered EXCLUDED — capital-structure-blind); DPI/payback de-degenerated (DPI on the t=0 equity check; payback on distributions alone — exit does not count, the L-10 lesson); RVPI stays out (no interim marks — would fabricate a valuation). (4) §10 pre-MIP total proceeds INCLUDE cumulative distributions; promote computed and paid AT EXIT only (rejected: interim carry + clawback). (5) §12/§14.9 walk-down gains "+ interim distributions (sponsor share)"; identity reconciles to sponsor TOTAL Δ, exact by the §9 algebra (second-order sweep effects live truthfully inside the paydown bar). (6) §13: request schedule + trap frozen across scenarios (structure/policy); slim credit block gains paid/blocked per year. (7) §14.18 invariant — the pro-forma clause stated in the MONEY form conditioned on paid > 0 (holds for all EBITDA_adj incl. ≤ 0; a ratio-form tolerance would be dimensionally incoherent), pointwise no-accrual (paid[t] ≤ request[t], no catch-up), DPI monotone, credit-metric exclusion. (8) §16 schema: `structure.distributions`, `covenants.rp_trap` + structural gates (≥ 0, length = hold_years). (9) §15 disclosure line. (10) §1 mid-year × distributions pinned: t < N distributions shift to t−0.5; the year-N distribution rides the period-N exit flow and NEVER shifts; inertness now conditioned on an empty schedule. (11) §14.16 final-cashflow clause amended: final sponsor_net flow ≡ sponsor_share + sponsor share of paid[N]. (12) §14.12/§14.14 domains gain "empty distribution schedule / trap off" (a binding trap converts marginal debt into trapped zero-yield cash and can reverse §14.12's sign; interim flows break §14.14's closed form). (13) §3.7 blocked-flag tie-break: `distribution_blocked[t] ⇔ rp_max < min(request[t], max(0, cash − min_cash))`, ties false. (14) §5 solver-exemplar corrected (the distribution trap is the named NON-cycle; genuine cycles require non-invertibility, not mere dependence). DR-1 Item 2's voluntary-prepayment ECF credit REMAINS deferred (sweep-credit mechanism, separate line). Independent sign-off round 1 REFUSED (5 blocking findings — §14.16/§14.18 falsity, E ≤ 0 normativity, §1 contradiction, §14.12/14 domains); all applied; round 2 GRANTED with 4 minor residuals, applied in this commit. | Phase G-1 template step 1; hostile independent sign-off: REFUSED then GRANTED (2 rounds, 2026-07-24) |
| v1.0.5 | 2026-07-24 | **Disclosure only — ZERO numeric change; golden regeneration NOT needed (no arithmetic path touched; no golden produces the condition, coherence arrays on all §17 goldens byte-unchanged — asserted in the PR).** §8 goodwill-plug sign semantics stated: the plug is SIGNED and never clamped; negative goodwill (asset-heavy filer at a low entry multiple — reachable since the D-layer net-PP&E extraction, 2026-07-24) is disclosed via new coherence WARN `negative_goodwill` instead of rendering silently in the BS tab (adversarial cutover review, Finding 5). ASC 805 bargain-purchase gain recognition explicitly out of scope (Phase G step-up module) — the signed plug + WARN is the disclosed simplification. | Adversarial cutover review 2026-07-24 (PR #98 review, deferred item); independent sign-off recorded in the amendment PR |
| v1.0.4 | 2026-07-22 | **Wording only — zero numeric change (goldens regeneration byte-identical, asserted in the PR).** (1) §11 senior-leverage inequality qualified: "≤ total **whenever total ≥ 0**" + net-leverage SIGNED/senior-floored-at-0 semantics stated (the unqualified claim was inherited from FINANCIAL_DEFINITIONS and is false in the net-cash regime — C7 independent review F1). (2) §16 states the two structural gates the build already enforces: unique tranche names (they key §7 write-off schedules + retirement reporting — C5 review's mis-attribution hazard) and revolver drawn_at_close = 0 in v1 (C2 review F1). | Independent C5–C9 conformance re-review (5 agents, 2026-07-22; PR #83 carries the code/test findings) |
| v1.0.3 | 2026-07-21 | Phase B2/C build pass. (1) **Goldens corrected** — spec_calc.py read the r2-ROUNDED recorded display EBITDA_adj for the §9 exit block (intermediate rounding, violating §15); re-derived at full precision. Only exit blocks + return streams move (≤ $0.04m, ≤ 0.23bp measured); G1's closed-form values and every per-year schedule are byte-unchanged. (2) **§3 step 6 post-breach semantics pinned**: the breach year closes below the floor (closing cash may be negative), conservation §14.3 never clamped, subsequent years run on the inherited opening cash and carry a block-severity `cash_floor_breach` flag ("never negative cash" described the draw-to-floor goal, not a clamp); kernel opening-cash assert relaxed to allow continuation. (3) **v1 structural constraint**: term-tranche maturity > hold_years (input-gate rejection; balloon/refi is Phase G). (4) **§7 early-retirement write-off timing pinned**: book write-off in the retirement year; TAX deduction enters the FOLLOWING year's uncapped pool (§5 sequentiality); year-N retirement merges into the exit-year deduction. (5) **§12 bridge arithmetic pinned** (bars could not reconcile exactly as drafted): four bars decompose the FRICTIONLESS pre-promote delta (EV − ND both ends) — growth M₀ΔB, multiple bar ΔM×B₀ (rigorous school; on-exit-EBITDA form folds the cross term and is the rejected alternative), interaction ΔM×ΔB, paydown ND₀−ND₁ (ND₀ = par − funded min cash, ND₁ = payoff − closing cash); walk-down − entry costs − exit costs (advisory + monitoring termination) − MIP − rollover Δ = sponsor net Δ; §14.9 restated as the two exact identities; types.ts ValueBridge.walkdown gains `exit_costs`, `multiple_change_on_exit_ebitda` renamed `multiple_change_bar` (naming contradicted the explicit-interaction convention); annual monitoring leakage embedded in the paydown bar via cash, termination component in exit costs, annual drag a memo from gp_fee_income. (6) **§9 entry-NTM basis pinned by symmetry**: entry `basis: 'ntm'` = fy_ebitda × (1 + growth[0]) (golden-uncovered, disclosed). (7) **§6.3 pre-2018 aggregate bound CORRECTED** [B2 adversarial review, 2 independent lenses]: the 80% post-close cap now applies to the residual income after a pre-2018 acquired layer (IRC §172(a)(2)(B)(ii)); previously aggregate usage could exceed taxable income, burning post-close NOLs for zero benefit; aggregate ≤ taxable now holds in both branches; golden-uncovered, fixtures unchanged. §15 assumptions line extended: NOL usage is not optimized across years. | B2/C build (PR #69 review + comment); goldens re-derived + independently re-adjudicated (DERIVATION.md) |
| v1.0.2 | 2026-07-05 | Adjudication pass (2 independent derivers, 167 lines, ZERO mismatches — goldens signed gospel). Ambiguities they resolved now stated explicitly: §17 golden defaults (ati_pct 30%, min_rate 0, rollover 0); §4 commitment fee on BEGINNING-of-year undrawn; §7 NWC[0] reading. Noted: fixtures store 2dp display values (±0.005 boundary artifacts are display precision, not engine values); BS merges DFC + unamortized OID into one line | Adjudication `wf_01aabc2d` |
| v1.0.1 | 2026-07-05 | Phase B derivation: G1 IRR check value corrected to 6.3622% (closed form, was a 0.4bp hand-approximation error); all 22 §17 asserts verified against the committed reference derivation (tests/goldens/, scripts/goldens/spec_calc.py) | Phase B1 |
| **v1.0** | 2026-07-05 | **Phase A3 review round applied (3 lenses, 47 findings) and SIGNED under the owner's standing decision authority.** §6 rewritten as a fully determined state machine: two NOL pools (acquired: §382 + layer cap, consumed first; post-close: banked losses, 80% cap, §382-free), explicit loss branch, negative-ATI floor, ATI = EBITDA_adj, §163(j) carryforward post-close-only with defined roll-forward, capped pool (cash + PIK + OID amort) split from UNCAPPED deductions (financing-fee amort + commitment fees + exit write-off — Treas. Reg. §1.163(j)-1(b)(22)); §382 basis corrected to EV in the CFDF frame (the v0.96 sponsor+rollover gloss was wrong). §7: margin-trajectory formula, NWC days formulas + COGS proxy, split OID/fee amortization with pro-rata allocation. §8: explicit PP&E roll. §9: exit-equity formula includes closing cash (matches G1); exit-fee base = exit EV; exit-year monitoring fee drop rule. §13: typed field-level deltas; scenario waterfall block. §14: mirror invariants (16) + committed-scenario invariant (17). §17 goldens re-derived after recomputation falsified three committed asserts: G3 PIK payoff 237.9161 (was misrounded), G3 §163(j) binds EVERY year / never releases (tested as such), G3 hurdle 1.5x (2.0x promote was out of the money), G4 rebuilt (D&A 7%) to produce a genuine Y1 tax loss + floor/§382 binds with §163(j) explicitly non-binding, per-golden net-PP&E facts (PP&E stays positive), G2 gains revolver maturity + committed downside scenario G2-D, NEW G5 forces the revolver draw/repay cycle. types.ts restructured to match (discriminated tranche unions, RevolverYear schedule, two NOL pools, ScenarioDeltas, sensitivity base anchors, ExitBlock cash line, GP-fee-income memo, indexing contract). | A3 review `wf_a8ea0357`; ledger C-19/C-20 |
| v0.9 | 2026-07-04 | Initial skeleton; all conventions drafted, 12 [RESEARCH-CONFIRM] markers open | 4-lens adversarial review of the overhaul plan |
| v0.97 | 2026-07-05 | Promoted to canonical location `lib/engine2/SPEC.md` (skeleton in rebuild/ is now a pointer stub). Added §16 (input schema — the `types.ts` contract + class rules) and §17 (golden deal definitions G1–G4 with concrete inputs and check values, incl. G1 closed form and the G3 PIK payoff 135×1.12^5). Dual-engine guardrails enacted (CI engine-freeze job, tests/engine2-boundary.test.ts, ENGINE_ARCHITECTURE §0) | Phase A4/A2 |
| v0.96 | 2026-07-05 | Post-ingestion verification pass (2 adversarial verifiers, 20 findings) applied. **Corrections:** §382 basis fixed to target pre-change equity value (was wrongly "sponsor equity"); §12 MOIC-basis denominator fixed to entry total equity; `nol_is_pre_2017` renamed `nol_arose_pre_2018` (off-by-one vs IRC §172); "50% flat" base sweep re-tagged [DECIDED] simplification (research confirms the level + the grid, not flatness); §2 financing-fee base explicitly includes undrawn revolver commitments; §6 gains `section_163j_applies` toggle (small-business exception), the §382 static-limit disclosed simplification, and the OBBBA post-2025 out-of-scope note; §3/§9 disclose the private-credit 102/101 hard-call + CoC-put omission (the soft-call exemption is BSL-only); §11 gains FCF-conversion % and cumulative-paydown-% subtotals (DR-5). conventions.json: citation-honesty fixes (hold=5 marked OWNER-pending vs DR-4's 7-yr recommendation; commitment-fee level marked not-research-covered; mezz template resized to 4.0x GF-supported total; per-category staleness cadence + DR-4 threshold triggers added; TLB-spread internal-conflict note) | Verifier findings, `wf_9d35de81` |
| v0.95 | 2026-07-05 | Research pass ingested (DR-1…DR-5 in `rebuild/research/`). **Amendments:** (1) §6 §163(j) ATI basis default EBIT → **EBITDA** — OBBBA (P.L. 119-21, Jul 2025) permanently restored EBITDA-based ATI for TY beginning after 12/31/2024; the draft described superseded law. Ledger row C-17. (2) §6 **acquired-NOL survival default = OFF** — DR-3: target NOLs generally do not survive the structures sponsors actually use; extracted NOL fact displayed, usability is an explicit cited assumption. Ledger row C-18. **Confirmations (kept as drafted, now cited):** beginning-balance interest as a disclosed minority convention (DR-1 — "what a reviewer will not accept is an undisclosed choice"); max(base,floor)+spread (DR-1); ECF-pool sweep with 50% base / 75-50-0 lender-friendly grid (DR-1/DR-4, LSTA); revolver-repay-before-sweep (DR-1); mandatory amort on original face — new invariant §14.15 (DR-1); soft-call ignorable in v1 since sweeps/mandatory are exempt (DR-1); commitment fee in DSCR, sweeps never in DSCR (DR-1); School-B mid-year (DR-2); "pre-promote" naming (DR-2); unlevered stream excludes financing fees/OID, taxes on EBIT (DR-2); promote-only MIP, sweet equity = separate instrument (DR-2); monitoring-fee no-double-count + GP-income memo (DR-2); tax ordering incl. §382 before 80% cap (DR-3); AHYDO/transaction-cost/CAMT v1 simplifications defensible-if-disclosed (DR-3); no-step-up purchase accounting (DR-3); entry-fixed scenarios (DR-5); pre-promote bridge with explicit cross-term + MOIC basis (DR-2/DR-5); exit = entry multiple suggestion (DR-4); assumptions-page disclosure style (DR-5) | `rebuild/research/DR-1…5-results.md` |

## Appendix — Convention citations
Full citation detail lives in the research files (`rebuild/research/DR-<n>-results.md`), each
finding with practitioner/primary sources (Rosenbaum & Pearl, Macabacus, Wall Street Prep,
LSTA, ILPA, GIPS, IRC/Treas. Reg. sections, OBBBA P.L. 119-21, PitchBook LCD, GF Data, Bain
GPE Report 2026, Travers Smith, Goodwin, law-firm primers). Suggested market values extracted
to `lib/engine2/suggestions/conventions.json` with per-value citation + as-of date; values
older than 12 months render with an "as of <date>" staleness warning.
