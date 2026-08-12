# engine2 Financial Specification — v1.6.0 (SIGNED lineage; Phase A gate passed 2026-07-05)

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
incentive, not an LP return. **[v1.7.0] The "before management incentive" clause covers TWO
different instruments and the basis is stated rather than left to the reader (the
v1.1.2/v1.1.3 mislabel class): on a §10 PROMOTE deal the incentive is EXCLUDED from the
stream, while on a §22 STRIP deal management's sweet-equity share settles INSIDE
`exit_equity_pre_mip_total` — the stream's own exit inflow — and their subscription is netted
into its t=0 outflow (§22.8). Same label, two bases; every surface rendering this stream
alongside a strip must say which. The WARRANT needs its own clause [round-3 gov-M5]: it is
neither a transaction cost, a portfolio-company fee, nor a management incentive, so the
definition above does not reach it — the stream's exit inflow is `exit_equity_pre_mip_total`,
which is PRE-warrant, so a warrant deal's pre-promote figure is GROSS of a genuine third-party
equity claim. And the HEADLINE-vs-REALIZED MOIC divergence belongs here rather than only in
§22 [round-3 gov-M4]: `moic` sums STRICTLY POSITIVE inflows (v1.1.0), so on ANY deal whose
final sponsor flow is negative — strip or not — the headline exceeds the realized multiple;
§14.23(d)'s ratchet mirror is struck on the realized figure.**

**Fee/flow membership table (the table every past review fought about):**

**Legend [v1.1.1 — stated after an adjudicator misread it on first pass]:** **`out (−)`** means
the item is IN the stream, as part of the t=0 OUTFLOW. **`excluded`** means the item is NOT
in the stream at all. **`in (−)`** / **`in (+)`** are later-period flows. `n/a` means the
concept does not exist for that stream. The two words are not synonyms — "out" is a
direction, "excluded" is a membership decision.
**Legend addendum [v1.7.0 — round-2 gov-M3].** `excluded` covers TWO distinct situations and
the rows now say which: (1) the item genuinely never touches the stream; (2) **"excluded as a
LINE"** — the item is already NETTED inside a figure the stream does take (the rollover share
and management's sweet share settle inside `exit_equity_pre_mip_total`; the warrant AND the §10 MIP
promote both net inside `sponsor_share`), so adding it again would double-count. **Per COLUMN [round-9 M9]: in the PRE-PROMOTE column every claimant on
`exit_equity_pre_mip_total` is situation (2) by construction, because the stream takes the GROSS
total — so `excluded` there ALWAYS means excluded as a LINE.** The pre-existing rollover row
carries situation (1) in column (1) and situation (2) and was always read that way; stating it stops the next reader
rediscovering the ambiguity.
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
| MIP promote | **excluded as a LINE** [v1.7.0 — round-3 gov-M1] — already NETTED inside `exit.sponsor_share` (`exit.ts` computes `postMip = E − mip` then splits), by the IDENTICAL mechanism the warrant row below describes; an `in (−)` line would double-count | n/a | **excluded** |
| Rollover share of exit | excluded (sponsor stream is sponsor-only; rollover pari-passu pro-rata) | n/a | excluded |
| Interim distributions [v1.1.0] | in (+ at year t; sponsor-only share when rollover > 0 — pari-passu pro-rata, same rule as exit. **[v1.7.0] Under a sweet-equity strip the sponsor share is the §22.7 INSTITUTIONAL split — loan-note redemption + (1 − s₀) × the ordinary remainder — NOT the pari-passu fraction; §22.7 names all three committed call sites that must read it**) | **excluded** (an equity/financing flow — the unlevered stream is capital-structure-blind) | in (+ at year t, pre-promote total) |
| Management subscription (sweet equity) [v1.7.0] | netted (−) — it reduces the sponsor's own cheque exactly as rollover does (§22.8/§2) | n/a | netted (−) — it is part of the TOTAL pre-incentive equity in |
| Management sweet-equity share of exit [v1.7.0] | excluded (the sponsor stream is sponsor-only — the same treatment as the rollover share) | n/a | excluded as a LINE: it settles INSIDE `exit_equity_pre_mip_total`, which is the stream's exit inflow (again the rollover-share treatment) |
| Warrant net payout [v1.7.0] | **excluded as a LINE** — it is already NETTED inside `exit.sponsor_share` (the warrant is taken at §22.7 stage 3, ahead of the ordinary split), so adding it again as a later-period flow would DOUBLE-COUNT [round-2 arith-M2]; it dilutes a ROLLOVER holder pro-rata exactly as it dilutes the sponsor | n/a | **excluded** (the stream's inflow is `exit_equity_pre_mip_total`, which is PRE-warrant) |

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
clause — which v1.7.0 EXTENDS to five claimants (§22.9(b)/§14.23(b)); the promote's own
treatment there is unchanged [round-9 M6b] (mip_payout still settles inside exit_equity_pre_mip_total; the
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

**Domain convention for DOTTED fields [v1.7.0 — round-9 F01].** Where a domain names a dotted
field as NULL, an ABSENT PARENT satisfies it: `mip.ratchet null` covers `mip: null`, and
`elections NULL` covers a deal with no `pik_note`. A domain naming a dotted field as NON-null
requires the parent. Stated once here rather than per clause, because item 21(c) and item 23(f)
are the same construct written to one template — editing either alone would make two clauses
disagree about the same question, and editing both by hand is the re-sync failure PHASE_G names.
This only ever WIDENS a null-domain, which is the intended direction in every case.

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
   − MIP − rollover Δ − sweet-equity Δ − warrant net payout + interim distributions
   (sponsor share) ≡ sponsor net TOTAL Δ (always; the distributions term is 0 whenever the
   schedule is empty — the pre-v1.1.0 identity is the degenerate case [v1.1.0]; the
   sweet-equity and warrant terms are 0 whenever their instruments are null — the pre-v1.7.0
   identity is likewise the degenerate case [v1.7.0 — §22.8/§22.13(ix); un-amended, this
   clause reports a ≈$28.73m residual on the G9-SWEET shape]).
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
    derived.enterprise_value; sponsor_share + rollover_share + mip_payout +
    management_ordinary_share + warrant_payout_net ≡ exit_equity_pre_mip_total
    [v1.7.0 — §22.9(b)/§14.23(b); the two new terms are 0 whenever their instruments are null,
    so the pre-v1.7.0 THREE-term form is the degenerate case. Amended HERE, in place, because
    §14.23(b) and §22.9(b) both describe themselves as this clause EXTENDED rather than a
    parallel one — leaving the three-term form standing at domain "(always)" made the catalogue
    carry two clauses that cannot both hold, false by $30.73m on G9-SWEET (round-8, found
    independently by two lenses; the identical shape to round 1's un-amended §14.9(b), one
    catalogue item over)]; final sponsor_net cashflow ≡ sponsor_share + the sponsor
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

21. PIK toggle [v1.5.0 — §20] (domains PER CLAUSE [round-1 B2 — a blanket non-null domain
    contradicted (b)/(c)/(e), and check.ts coded to it would never flag fixed notes]):
    (a) [domain: elections non-null ∧ amort = 0 ∧ sweep off] the toggle balance closed form
    B_t = face × Π_{s≤t, e_s='pik'} (1 + pik_coupon) — with amort or sweep configured the
    closed form yields to the §3 walk and only pik_accrual_t = 0 in cash years is pinned;
    (b) [domain: both modes] cash_interest_t = B_{t−1} × cash_coupon × [e_t='cash'] in
    toggle mode; fixed mode: unconditional; (c) [domain: elections NULL — the load-bearing
    compatibility gate, nothing trivial about it] every NUMERIC output and every serialized
    fixture byte is IDENTICAL to the v1.4.0 engine; the ONE carve-out is `coherence`, which
    gains `ahydo_shape` on qualifying fixed notes (G3/G3-DIST — the §20.9 spec-side-decided
    exception) [round-1 B1]; (d) [domain: elections non-null] the §6 capped pool's per-year
    PIK term = the year's accrual (zero in cash years) and its cash term includes the
    note's cash interest (zero in pik years) — the §6 capped-pool DEFINITION extended per
    election [round-1 B3 — the prior "§14.13 pool mirror" citation was dangling; §6.1's
    pool line is the real anchor]; (e) [domain: ANY `pik_note`, elections null or not] the
    `ahydo_shape` flag fires exactly on `maturity_years > 5` ∧ (an accruing year exists:
    elections null ∧ pik_coupon > 0, OR any e_t = 'pik') — structural legs only: the
    §163(i) YIELD leg is stated in the flag text, never tested (needs the monthly AFR), and
    the SIGNIFICANT-OID leg is likewise PROXIED by "an accruing year" — over-fires
    conservatively on small coupons (a WARN, the safe direction) and under-fires only on
    issue-OID-only cash tranches (immaterial at v1's ≤2.5% OID scale) [round-1 M3];
    (f) [domain: elections non-null] an explicit NON-claim: no ordering between all-cash
    and all-PIK sponsor IRRs (both directions constructed numerically in the round-1
    sign-off — cash elections drain sweep fuel while PIK compounds the exit payoff; the
    §19.6(e) precedent).

22. Sector comps band [v1.6.0 — §21; DATA-SIDE, so these are FACT invariants, not engine
    ones] (domains PER CLAUSE): (a) [band non-null ∧ basis `'sector'`] `low ≤ median ≤ high`
    (universally true: `k(p) = min{k : c_k ≥ p·W}` is non-decreasing in p over an ascending
    value list) and each is a value that OCCURS among the included constituents;
    (b) [basis `'sector'`] `industries_used ≥ 1 ⇔ band non-null` and `firms` = Σ n_i over
    INCLUDED constituents — an NA / non-positive / n=0 industry contributes to NEITHER the
    value set nor the weight total; **[basis `'total_market_ex_financials'`]
    `industries_used = 0` with a NON-null band and `firms` = the aggregate row's own count —
    the biconditional does NOT apply** [round-1 B4: `Other` was a live counterexample to the
    draft's unscoped clause]; (c) [all] `bands.json` is a pure function of the committed CSVs
    + map + the §21.5 first-row rule, reproduced byte-identically by the §21.10 gate;
    (d) [all] the feature adds NO engine output — every existing golden regenerates
    byte-identically (the fixtures do not serialize `facts`) and the only `ModelOutput` change
    is one additive `facts` field; (e) an explicit NON-CLAIM: the band is a PUBLIC-MARKET
    trading range, not a buyout-entry range, and no ordering between a deal's entry multiple
    and the band is asserted to be right or wrong (§21.8(e)).

23. Sweet equity / ratchets / warrants [v1.7.0 — §22] (domains PER CLAUSE): (a) [sweet_equity
    non-null] the loan-note walk §22.9(a) — `LN[t] = LN[t−1] × (1 + rate) − redeemed[t]`,
    `LN[t] ≥ 0` (guaranteed by §22.3(vi)'s Build rejection, not by hope), and
    `LN[N] = LN[0] × (1 + rate)^N` on the no-distribution path, with NO year-0 accretion;
    (b) [ALL] → **§14.16's exit-mirror clause**, which STATES the five-term identity and is its
    single home. Not restated here [round-9 §5(5)]: the round-9 fix to §14.16 closed a
    contradiction but left the SAME identity in two hand-synced places, which is the generator
    rather than the instance — the failure this document already names for hand-kept lists. The
    §22-specific content is the DOMAIN and the reason: it holds for SIGNED
    `exit_equity_pre_mip_total` INCLUDING negative values, because §22.7 carries the residual
    signed rather than clamping it, and it is asserted on the UNCONDITIONAL `ExitBlock`
    carriers [round-2 gov-B3/arith-M3: the r2 draft named `management_ordinary_share`, which
    lives ONLY on the nullable `equity_strip` and therefore does not exist across most of this
    clause's own `[ALL]` domain — the same defect the r2 fix correctly applied to (g). §22.6's
    ONE-NAME rule is extended: `management_ordinary_share` is THE name on BOTH carriers, and
    `ExitBlock.sweet_equity_management` is renamed to `ExitBlock.management_ordinary_share`];
    the v1 THREE-term form is the degenerate case, both new terms being 0 when their
    instruments are null; (c) [warrant non-null ∧
    exercised] `ordinary_pot + warrant_payout_gross ≡ ordinary_pot_pre_warrant +
    warrant_strike_paid` and `0 ≤ warrant_payout_net ≡ ordinary_pot_pre_warrant −
    ordinary_pot` — the warrant never dilutes the class by more than its own value;
    (d) [sweet_equity non-null **∧ sponsor_equity > 0 ∧ the period-N sponsor flow ≥ 0** —
    of the THREE conditions the THIRD is load-bearing; the SECOND (`sponsor_equity > 0`) is now
    REDUNDANT inside this clause's own domain and [round-7 arith-B1 — the round-6 "correction"
    said the FIRST was redundant, which names `sweet_equity non-null`, the domain's CORE, without
    which there is no strip and nothing to assert; the clause's own justification two sentences
    on describes the PLUG condition, i.e. the second. A fix landing in the governing home and
    making it WORSE than its companion, for the fourth time]
    is kept only as belt-and-braces [round-4 arith-M1 — its r1 justification was "a non-positive
    plug is REACHABLE as a run (`negative_sponsor_equity` is a coherence flag, not a Build
    rejection)", and round 2 made that FALSE: §22.3(vi) turned a non-positive plug into a BUILD
    REJECTION whenever `sweet_equity` is non-null, which is exactly this domain, and clause (a)
    already cites that gate correctly. The qualifier is harmless; the reason is withdrawn]. The
    THIRD [round-2 blocking, BOTH reviewers]: `returns.ts` sums STRICTLY POSITIVE cashflows
    (`c > 0 ? s + c : s`), a v1.1.0 convention, so a NEGATIVE period-N flow is silently dropped
    from `moic` — which the r1 clamp had been accidentally hiding by forcing `sponsor_share ≥ 0`,
    and which fixing the clamp exposed on the very fixture §22.13(v) mandates (worked: I = 100,
    LN[N] = 132.2395, E = −25 ⇒ realized MOIC −0.25 vs headline 0.00; with a year-1
    distribution of 300 the two even disagree on the COUNT at a 2.6 hurdle). The divergence is
    a PRE-EXISTING v1 property §22 surfaces rather than introduces, and it is DISCLOSED in §15
    rather than repaired here — repairing it would change `moic` on the v1 path and break
    §14.23(f)] the §22.5 SINGLE-SOURCE MIRROR —
    `ratchet_tiers_reached ≡ #{ j : institution_moic_at_ratchet > hurdle_moic_j }` (STRICT)
    with `|returns.sponsor_net.moic − institution_moic_at_ratchet| ≤ max(1e-9 × |moic|, 1e-12)`
    — the ABSOLUTE floor matters [round-2 arith-B2]: a purely relative bound anchored on `moic`
    degenerates to an exact-equality demand whenever `moic` is 0, which is reachable.
    **DEFINITIONS — these are DEFINITIONS, not domain-gated assertions: they hold at EVERY sign of
    the pot and of the period-N flow, INDEPENDENTLY of (d)'s validity domain above [round-10: the
    §22.13(v)(α) fixture sits OUTSIDE (d)'s domain — its period-N flow is negative — yet needs the
    definition, so gating it on (d) left a REQUIRED output undefined exactly where a fixture
    asserts it]. Stated HERE because this clause READS them and round 4 deleted their only
    other statement [round-4 arith-B3 — the removed §22.5 "COMPARISON RULE" paragraph was the
    ONLY text binding the field to the walk, so a REQUIRED output had no normative definition
    anywhere, and this clause was left carrying the project's FOURTH dangling cite]:
    `institution_moic_at_ratchet ≡ V_final / I`, where `V_final` is §22.5's walk value at EVERY
    sign of the pot and `I` is the §2 sponsor plug; and
    `management_effective_ordinary_pct ≡ M / P`, NULL at `P ≤ 0`.
    COMPARISON RULE [round-1 arith-M5, restated here as its home]: the tier COUNT is taken on
    `institution_moic_at_ratchet` — the engine's own walk value — and `returns.sponsor_net.moic`
    is checked against it on MONEY. One assert on money, one on counts; never a count-vs-count
    race across two float paths at exactly the boundary §22.13(iii) makes normative.** And
    `institution_ordinary_share + loan_notes_redeemed ≡ sponsor_share`: the ratchet's own test
    must agree with the MOIC the UI headlines, or one of them is lying; (e) [sweet_equity
    non-null **∧ ordinary_pot > 0** — at `P = 0` the ratio is `0/0`, which §22.10's own
    `management_effective_ordinary_pct: number | null` concedes is reachable]
    `management_ordinary_share` is CONTINUOUS, non-decreasing and piecewise-linear in the
    ordinary pot, with `0 ≤ M ≤ P` and `M/P ∈ [s₀, s_n]` — the marginal rule's defining
    properties, and exactly what the REJECTED cliff violates; (f) [sweet_equity null ∧ warrant
    null ∧ (mip.ratchet null OR EMPTY) — the load-bearing compatibility gate, nothing trivial
    about it. **The EMPTY list is IN domain** [round-7 gov-B3]: §22.3 pins `null ≡ [] ≡ v1` and
    §22.4's one-term sum IS §10 verbatim, so `[]` produces v1 numbers too — and this is the
    clause asserting v1 NUMERIC IDENTITY. Round 7 widened (h) to admit `[]` and, applying the
    mirror image, briefly NARROWED (f) to exclude it, which would have let a compatibility
    regression on the empty-list representation ship green]
    every NUMERIC output is IDENTICAL to the v1.6.0 engine and every golden's every
    pre-existing leaf is byte-unchanged; the ONE carve-out is the fixture SHAPE (three added
    zero-valued keys per golden — §22.12), DECIDED spec-side, never discovered as a red test;
    (g) [**equity_strip non-null** — the domain is stated because the fields it reads do not
    exist when the block is null] `loan_notes_unredeemed` (WARN, once per run) fires exactly on
    `loan_notes_accrued_balance > loan_notes_redeemed + $0.005m`, on §22.2's pinned measurement
    pair (balance grown to exit and BEFORE the exit redemption; redeemed = the EXIT redemption
    alone); named for its CONDITION, so the flag cannot mislabel what it detects;
    (h) [**mip.ratchet non-null ∧ invested_equity_total > 0**] the UNCAPPED bracket sum is
    MONOTONE non-decreasing and
    CONTINUOUS in the pre-promote total X, equals the §10 single-tier value whenever `ratchet`
    is empty, and is bounded by `s_0 × max(0, X − T_0) ≤ promote_uncapped ≤ s_n × max(0, X −
    T_0)` — it can never escape the two flat-rate envelopes. **The `invested_equity_total > 0`
    qualifier is LOAD-BEARING [round-8]: `T_j = hurdle_moic_j × invested_equity_total`, so at a
    NEGATIVE invested equity the thresholds INVERT (ascending hurdles produce DESCENDING
    thresholds) and the envelope is FALSE — measured at invested = −100, X = 500, tiers
    {1.5→0.15, 2.0→0.25}: the bracket sum is 175.0 against an envelope of [97.5, 162.5]. The
    case is REACHABLE: `facade.ts` derives `invested_equity_total` from the §2 plug plus
    rollover, and a non-positive plug is a COHERENCE FLAG, not a Build rejection, so the run
    still produces output. Clause (d) already carries the equivalent qualifier; (h) omitted
    it.** All four statements are about
    `promote_uncapped`, NOT about `mip_payout` [round-2 gov-M7: the r2 clause opened on "the
    ratcheted promote" and closed on the uncapped sum, and §10's
    `min(·, max(0, exit_equity_pre_mip_total))` cap makes them different numbers]. **The scoping
    is right; the ORIGINAL reason given for it was WRONG and is corrected HERE [round-3 arith-M2,
    re-filed into the NORMATIVE home in round 4 — arith-B2 caught the correction sitting only in
    §22.9(h), which round 4 had just declared SUBORDINATE, so the new precedence rule was
    promoting the FALSE claim]: at a FIXED `E` the cap is a CONSTANT and `min` of two
    non-decreasing functions is still non-decreasing (measured twice independently: 0
    non-monotone steps over 3,000 X values), so "the cap breaks monotonicity in X" is FALSE.
    `mip_payout` departs from the uncapped sum only along the engine manifold where rising
    cumulative distributions lower `E` — which §10 already discloses.**; (i) an explicit
    NON-CLAIM: no ordering is asserted between a strip deal's sponsor IRR and the same deal run
    with a §10 promote — different instruments, different payoffs, and which is dearer depends
    on the exit level (the §19.6(e)/§20.6(f) precedent).

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
pro-forma net-leverage test (§3.7 — no solver); the fund/LP overlay [v1.4.0 — §19] is a FUND-OF-ONE on the sponsor side only (annual fee on a constant basis — no step-downs/NAV; no subscription line; no GP commitment; no clawback — nothing to claw back by construction; 'european' = all-contributions hurdle+pref base vs 'american' = invested-capital base with NO fee-recovery tier; the §10 promote is portfolio-level, never fund carry; the year-N fee draws BEFORE the final distribution); the PIK toggle [v1.5.0 — §20] is a PER-YEAR WHOLE-COUPON election on the `pik_note` (no partial/50-50 elections; elections frozen across scenarios; PIK deducted as accrued with AHYDO a disclosed omission carrying the structural `ahydo_shape` WARN — the §163(i) yield leg needs the monthly AFR and is stated, not tested, and the significant-OID leg is PROXIED, over-firing conservatively; PIK notes stay non-refinanceable and sweep-exempt by default); the sector comps band [v1.6.0 — §21] is a COMMITTED-DATASET reality check (Damodaran industry averages, annual vintage stated per band — no live feed; PUBLIC-MARKET trading multiples, NOT buyout-entry multiples; each figure is an INDUSTRY AGGREGATE — aggregate EV ÷ aggregate EBITDA, not a median firm — on data trailing through the prior year's Q3; positive-EBITDA block only, with NA and non-positive values excluded; the displayed `firms` is the industry POPULATION count, which includes firms outside the ratio's own aggregate; the 94→8 sector map is a stated convention whose forced assignments are listed in §21.5; financials are NOT uniformly unavailable — the US bank/broker rows are NA and drop out, leaving a band set by asset managers and non-bank financials, while Europe and India enter through BROKER multiples only — their bank rows are NA too — and only Japan publishes an actual bank multiple; a band may collapse to a point under a dominant constituent; region is inferred from reporting currency, a proxy for listing market, and displayed; ESEF/upload deals carry no sector source and show the unavailable state); <!--§15-BOUND-->sweet equity, ratchets and warrants [v1.7.0 — §22] model the institutional loan notes as EQUITY — outside §11 leverage/ICR/FCCR/DSCR, outside the §3 waterfall and the §9 debt payoff, and with NO interest deduction (jurisdiction-specific — UK CTA 2009 Part 5, hybrid-mismatch, US §385 — so v1 claims none, which is NEVER ANTI-CONSERVATIVE: neutral only where §163(j) binds in EVERY year so the disallowance is never released (G3's shape), lower-return elsewhere), accruing only, never cash-pay, with NO year-0 accretion; ratchets are MARGINAL top-slice step functions on MOIC struck at EXIT ONLY, never cliffs (a cliff on a REALIZED-return hurdle has NO SOLUTION OVER AN INTERVAL OF EXIT VALUES — §22.5 carries the worked counterexample), with a value exactly ON a tier threshold taking the LOWER tier (strict >, the §3 sweep-grid convention) and IRR-based ratchets deferred to v2; the §10 promote ratchet and the sweet-equity ratchet are struck on DELIBERATELY DIFFERENT bases (total pre-promote proceeds vs the institution's own realized value — §22.5); the strip, the ratchet and the warrant are FROZEN across scenarios; MANAGEMENT'S SUBSCRIPTION REDUCES THE SPONSOR'S OWN CHEQUE (a §2 source line — material to every sponsor return number on the page); a promote and a strip may NOT coexist (DR-2's double-count, an input-gate rejection) and a strip may not coexist with a rollover in v1 (the strip/sweet allocation of a rollover is negotiated, with no defensible default — §22.3(ii)); when exit equity does not cover the accreted loan notes the ordinary pot is zero, management's sweet equity is worthless and the `loan_notes_unredeemed` WARN fires, and when exit equity is NEGATIVE the ordinary pot is likewise NEGATIVE (not zero) and the whole shortfall stays with the pre-existing §9 claimants (management's ords cannot go negative) — and whenever the FINAL SPONSOR FLOW is negative — which is the true trigger, NOT a negative exit equity, since a year-N distribution can outweigh a negative exit residual and leave the flow positive — the HEADLINE sponsor MOIC exceeds the realized one, because `returns` has summed POSITIVE inflows only since v1.1.0 and a negative final flow does not reduce it (a pre-existing convention §22 surfaces rather than introduces; the §22.5 ratchet is struck on the REALIZED figure, never the headline — §14.23(d)); AT MOST ONE warrant, rationally exercised on full dilution with the strike paid in, NOT exercised exactly at-the-money, diluting a ROLLOVER holder pro-rata exactly as it dilutes the sponsor, NOT participating in interim distributions (an option is not a distribution right), and its association with a mezzanine TRANCHE is a LABEL ONLY — no arithmetic depends on it; management's subscription price and their ordinary % are INDEPENDENT inputs, so the model never checks that the terms are actually sweet)<!--/§15-BOUND-->; refinancing [v1.3.0 — §18] is a SCHEDULED
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
`interim_distributions_sponsor`. `CoherenceFlag.code` gains `distribution_blocked` ([v1.3.1] and `refi_noop` — §18.8; [v1.5.0] `ahydo_shape` — §20.6(e), WARN class, per qualifying pik_note). [v1.4.0] `assumptions.fund: FundOverlayAssumption | null` — `{committed_capital: number|null, mgmt_fee_pct: ≥0, fee_basis: 'committed'|'invested', carry_pct: [0,1), pref_rate: ≥0, catchup_pct: {0} ∪ [carry_pct, 1], waterfall: 'european'|'american', fee_offset_pct: [0,1]}; null ≡ OFF (byte-identity §19.6(c)). Input-gate REJECTIONS: committed_capital = null ∧ fee_basis = 'committed' (circular — §19.2); explicit committed below total contributions; every domain violation above. `ModelOutput.fund` (Class C): null when OFF; when ON, `{lp_contributions[], lp_distributions[], gp_carry[], mgmt_fees_net[], paid_in_total, committed_capital, fund_lp_net: {irr, moic, dpi[], payback_year}}` — named fields, unconditional emission within the non-null object; `lp_contributions` length N+1 (t=0..N), the other four arrays length N (years 1..N, NOT t0-anchored), `payback_year` 1-indexed or null (the v1.1.1 contract precedent). The suggestion layer proposes NO fund overlay (§19 preamble). [v1.5.0] `PikNoteAssumption` gains `elections: ('cash' | 'pik')[] | null` (default null ≡ the v1 FIXED both-legs note — numeric/fixture identity with the coherence carve-out, §20.6(c)/§20.9). Input-gate REJECTIONS (§20.2): non-null length ≠ `hold_years`; any entry outside the union; non-null ∧ `cash_coupon ≤ 0` (a 0%-cash toggle year is a free coupon holiday no term sheet grants — the FIXED cash-0 note stays available as null); non-null ∧ `pik_coupon < cash_coupon` (the PIK premium is non-negative — market shape, DR-3.4). NO new ModelOutput fields — `TrancheYear.{cash_interest, pik_accrual}` already carry the per-year split. The suggestion layer proposes NO elections [rescoped, round-1 M2]: the D7 ASSEMBLY builds no pik_note, but the layer's own data ships one — conventions.json's `mm-senior-mezz` template carries a Mezzanine Note (pik_note, cash 10% + PIK 3%, NO elections) — so a template-built mezz deal whose note matures past year 5 wears `ahydo_shape` permanently (template badge ≠ suggested badge, so §14.13's all-SUGGESTED-clean invariant is untouched); either way no elections are ever proposed and a user-added note starts null (the toggle is opt-in per year). [v1.6.0] `DealFacts.sic_code: string | null` (additive Class-A — the EDGAR numeric SIC, the §21.5 bucket key; null on ESEF/upload and on any route with no published SIC; manual deals use the dropdown instead) and `DealFacts.sector_comps: SectorCompsBand | null`: `{region: 'US'|'Europe'|'Japan'|'India'` — **FOUR regions, the only ones a deal can select** (currency is coerced to the five modelled values, so Global/Emerging/China are unreachable and are NOT vendored — §21.6) — `vintage: string (the source file's own stated date), bucket: string (the §21.5 comps bucket or 'Other' — NOT `facts.sector`, which keeps carrying the raw SIC description untouched), low, median, high: number, industries_used: number, firms: number, basis: 'sector' | 'total_market_ex_financials', citation: string}`. **THREE distinct null causes, all emitting `sector_comps: null`:** (1) no sector information at all — the ESEF/upload routes, which publish no SIC and have no dropdown; (2) the PHASE_D §D6 IFRS-in-SEC route when EDGAR publishes no SIC for that filer — the plumbing gap that once made this cause universal on the route was CLOSED in step 3 (`mapCompanyFactsIfrs` takes `sicCode`; `store/dealEngine` passes it; pinned live by §21.11(xi)), so the route now behaves exactly like (1) and differs only in why the code is absent [round-3 B1, closed]; and (3) a bucket that resolves but has ZERO included constituents in that region (§21.4's honest-null rule). The surface distinguishes them in the reason it shows. NO input gate: the value is derived from committed data, not user input, so there is nothing to reject — a malformed committed dataset is caught by the §21.10 regeneration, SHA-256 and vintage gates at CI, not at Build. `ModelOutput` gains NOTHING beyond these `facts` fields (§21.8(d)), and the suggestion layer proposes no comps value. [v1.3.2] ALL THREE source unions — `DealFacts.source`, `RawHistoricals.origin`, and the extraction-layer `ProvenanceSource` — gain `'upload'` (the uploaded-filing route; normative conventions in `lib/edgar/IXBRL_SPEC.md`; purely additive — no fetch route ever produces it, no engine arithmetic reads `source`, and stamping origin explicitly keeps factsAdapter's legacy fallback from mislabelling an upload as 'edgar'/'esef').
[v1.7.0] `assumptions.sweet_equity: SweetEquityAssumption | null` — `{sponsor_ordinary_pct: (0,1], loan_note_rate: ≥0, management_subscription: ≥0, management_ordinary_pct: [0,1), ratchet: RatchetTier[] | null}`; `assumptions.warrant: WarrantAssumption | null` — `{holder_label: string, pct_of_ordinary: (0,1), strike_total: ≥0}`, SINGULAR by construction (two warrants' exercise decisions are mutually dependent and admit multiple rational-exercise equilibria — "at most one" is a TYPE, not a gate someone must remember to write, §22.3); `assumptions.mip` gains `ratchet: RatchetTier[] | null`; `RatchetTier = {hurdle_moic: > 0, share_pct: [0, 1)}`. All three null ≡ OFF ≡ **NUMERIC identity**, with the §22.12 fixture-SHAPE carve-out — never the unqualified "byte-identity", which is false against §22.10's unconditional emission and is the v1.5.0 round-1 B1 defect (§22.9(f) states the precise form). Input-gate REJECTIONS (§22.3): `sweet_equity` ∧ `mip` both non-null (the DR-2 double-count rule made STRUCTURAL); `sweet_equity` non-null ∧ `rollover_equity > 0` (a v1 SCOPE gate, stated as one); `hurdle_moic` not strictly ascending, or a first tier not strictly above the base threshold it sits on (`mip.hurdle_moic` for §22.4); `share_pct` DECREASING across tiers or below the base share (a ratchet only ratchets up); any `share_pct = 1` (the bracket walk's `(1 − s)` denominator is zero and the tier can never be exited — §22.5); `sweet_equity` non-null ∧ a `management_subscription` that would leave the §2 residual plug ≤ 0 (deterministic at Build from the S&U identity — a non-positive plug makes the ordinary/loan-note split incoherent — see §22.3(vi), where the older `LN[0]`-NEGATIVE gloss is RETRACTED as false at `sponsor_ordinary_pct = 1` [round-10: this line WAS edited in the round-9 commit and the refuted half was left standing, so the document asserted a proposition and its refutation in two homes], so it is a REJECTION and not the post-run `negative_sponsor_equity` flag); `management_ordinary_pct = 0` with a POSITIVE subscription (paying real money for a zero share is a typo, not a structure — a zero subscription with a zero share stays legal, being the all-institutional strip); every domain violation above. The suggestion layer proposes NO strip, NO ratchet and NO warrant (a cap-table structure is a negotiated term with no history/convention basis — the distributions/refi/fund/elections precedent); fields start empty/off, badge TEMPLATE via template paths, YOU when set. **ModelOutput additions [v1.7.0 — §22.10]:** `SourcesUses` gains `management_subscription` (Class C, unconditional `0.0`) and it enters `total_sources`, so `sources ≡ uses` (§14.1, "always") is preserved BY CONSTRUCTION; `openingBalance`'s §8 equity line becomes `sponsor_equity + rollover_equity + management_subscription`, which is what keeps the goodwill plug genuinely unaffected. `ExitBlock` gains `management_ordinary_share` and `warrant_payout_net` (§22.6's ONE-NAME-per-number rule, extended in round 3 to the management share — the `equity_strip` fields of the same names are its strip-block echoes, and every invariant is asserted on these UNCONDITIONAL carriers), emitted UNCONDITIONALLY (`0.0` when off, so the pre-v1.7.0 goldens carry committed zero columns exactly like the G-1/G-5 additions — the fixture-shape change is DECIDED in §22.12); `ModelOutput.equity_strip: EquityStripBlock | null` (null ⇔ `sweet_equity` null ∧ `warrant` null; OMITTED from a fixture when null — the `ModelOutput.fund` precedent verbatim, where only `G7FUND/expected.json` carries the key) = `{loan_notes_subscribed, loan_notes_accrued_balance, loan_notes_redeemed, ordinary_pot_pre_warrant, warrant_exercised: boolean, warrant_strike_paid, warrant_payout_gross, warrant_payout_net, ordinary_pot, management_ordinary_share, institution_ordinary_share, ratchet_tiers_reached, management_effective_ordinary_pct: number | null, institution_moic_at_ratchet: number | null}` — named fields the display surface READS, never recomputes; the two `| null`s are N/A semantics for a ZERO OR NEGATIVE ordinary pot / a zero invested equity, never sentinels — **corrected [round-9 M7]: that second cause is UNREACHABLE (§22.3(vi) makes a non-positive plug a Build rejection wherever a strip exists, and §22.10 pins the field null on the only other arm). The reachable pins are §22.10's: on the WARRANT-ONLY shape BOTH are null (there is no strip to measure); under a strip `management_effective_ordinary_pct` is null at a non-positive ordinary pot and `institution_moic_at_ratchet` is never null** (§11/§15) [round-3 arith-M5: the signed pipeline makes a negative pot reachable; the r3 minor was applied in §22.10 but not here]. `ValueBridge.walkdown` gains `sweet_equity_delta` and `warrant_payout_net`, and §14.9(b)'s identity is AMENDED to carry both (un-amended it reports a ≈$28.73m residual on the G9-SWEET shape), and `ValueBridge.entry_equity_pre_promote_total` now INCLUDES `management_subscription` — which is what keeps §14.9(a)'s frictionless identity exact (it holds only if EVERY equity source is counted) and is byte-identical when the strip is null. `CoherenceFlag.code` gains `loan_notes_unredeemed` (§22.9(g), WARN). All Class C, all REQUIRED-with-null.
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

## §20 PIK toggle — per-year cash/PIK election on the PIK note [v1.5.0 — Phase 3 / backlog #6; Tier A, engine arithmetic] [DECIDED — round 1 REFUSED (3 blocking: the byte-identity/ahydo_shape contradiction with G3 as the committed counterexample; the false blanket §14.21 domain; the dangling pool-mirror cite), all applied; round 2 GRANTED 2026-08-08, fingerprint-anchored @ ebfae5c, zero blocking conditions]

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
`elections: null` ≡ the v1 FIXED note — every pre-v1.5.0 model numerically identical, with
the one spec-side-decided coherence carve-out (§20.6(c)/§20.9).
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
outputs only). §10 MIP: unchanged (reads exit equity). §9 RETURN-STREAM MEMBERSHIP:
UNCHANGED — a toggle 'cash' coupon is ordinary §3-step-1 cash interest, which the fixed
note's cash leg already produces today; nothing new enters or leaves any stream, so no
membership addendum exists (unlike §19, which added a stream) [round-1 dimension-8
adjudication, recorded].

**§20.6 Invariants (→ §14.21, domains stated).**
(a) Toggle balance closed form — DOMAIN: elections non-null ∧ amort = 0 ∧ sweep off:
`B_t = face × Π_{s ≤ t, e_s='pik'} (1 + pik_coupon)`; with amort or sweep configured the
closed form yields to the §3 walk, and only `pik_accrual_t = 0 in cash years` stays pinned.
(b) Cash-interest identity: `cash_interest_t = B_{t−1} × cash_coupon × [e_t = 'cash']`
(toggle mode); fixed mode: unconditional.
(c) `elections: null` ⇒ every NUMERIC output and every SERIALIZED FIXTURE byte identical to
the v1.4.0 engine (the C5-class gate; every existing golden regenerates byte-identically —
no golden sets elections, and fixtures serialize neither assumptions nor coherence). The
ONE deliberate carve-out [round-1 B1]: `ModelOutput.coherence` gains `ahydo_shape` on
qualifying FIXED notes — G3 and G3-DIST emit it from v1.5.0 on (maturity 8, accreting);
the exception is DECIDED here, spec-side (§20.9), never discovered as a red test.
(d) Capped-pool membership per §20.4 — the §6 capped-pool DEFINITION extended per election
[round-1 B3: the anchor is §6.1's pool line, not §14.13]: the pool's PIK term is the year's
accrual (zero in cash years); its cash term includes the note's cash interest (zero in pik
years).
(e) `ahydo_shape` (WARN, per qualifying tranche — elections null or not — deterministic on
terms alone): fires exactly on `maturity_years > 5` ∧ (an accruing year exists — elections
null ∧ pik_coupon > 0, OR any `e_t = 'pik'`). TWO of the three §163(i) legs are handled
without external data: the YIELD leg (YTM ≥ AFR + 5pts) requires the monthly AFR and is
STATED in the flag text, never tested; the SIGNIFICANT-OID leg is PROXIED by "an accruing
year" — over-firing conservatively on small coupons (a WARN, the safe direction) and
under-firing only on issue-OID-only cash tranches (immaterial at v1's ≤2.5% OID scale)
[round-1 M3]. The text also names the assumed contractual catch-up cure. Boundary: `> 5`,
not `≥ 5` (§163(i)(1)).
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
as untested (needs the monthly AFR), the significant-OID leg stated as PROXIED
(conservatively over-firing — a WARN, the safe direction [round-1 M3]), and the
contractual catch-up cure named as assumed; PIK notes remain non-refinanceable (§18.2) and
sweep-exempt by default (§3).

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
**COHERENCE EXCEPTION — decided HERE, spec-side, never discovered as a red test (the
v1.1.1 round-2(b) convention; round-1 B1):** from v1.5.0 the fixed accreting notes in
**G3 and G3-DIST** (maturity 8, pik 12%, elections null) EMIT `ahydo_shape`, and so does
**G8-PIKT**; from v1.7.0 **G9-SWEET** and **G10-RATCHET** join them (§22.12 — both inherit
G3's note); no other golden emits `ahydo_shape` (the DIST goldens' `distribution_blocked`
under the v1.1.1 amendment is untouched by this exception). The committed coherence-clean
asserts (the facade-scenarios G-loop and the G3-DIST check) are AMENDED in step 3 to
expect EXACTLY this flag on EXACTLY these goldens — any other coherence delta on any
golden remains a red test.

**§20.10 Golden-uncovered by design** (directed fixtures, mutation-tested):
(i) all-'cash' elections — the note behaves as a bullet cash tranche (accrual identically
zero; payoff = par); (ii) all-'pik' at rate r vs the FIXED cash-0 note at the SAME r —
EQUAL on every COMPUTED output (the assumption echoes riding ModelOutput differ by
construction [round-1 M6]; the two shapes coincide exactly when the fixed note's cash leg
is 0 — verified numerically in the round-1 sign-off); then cash_coupon > 0 breaks the
equality via the fixed note's second leg (the both-legs discriminator — kills a
sugar-for-all-pik mutant); (iii) the FOUR §16 rejections (length ≠ hold; out-of-union
entry; cash_coupon ≤ 0 with elections; pik < cash);
(iv) elections on a note WITH mandatory amort — a 'cash' year pays coupon + amort and the
balance DECREASES; a 'pik' year accrues AND amortizes (the §20.6(a) domain edge);
(v) `ahydo_shape`: fires on maturity 8 ∧ any 'pik' year; fires on the FIXED accreting note
(G3's shape — null elections, pik_coupon > 0, maturity 8); does NOT fire on maturity 5
(boundary: > 5 — NOTE the negative fixture needs hold ≤ 4, since §16's maturity > hold
gate makes a maturity-5 note unbuildable on a 5-year hold [round-1 M5]) nor on an
all-'cash' toggle; (vi) §163(j) pool composition flips between
legs — a directed fixture where the cap BINDS in a 'pik' year and RELEASES in a 'cash'
year (the pool-membership mutant discriminator: a mutant deducting the wrong leg moves
cash tax); (vii) elections ∧ sweep participation — the balance DECREASES through accrual
years via the sweep (the closed form correctly yields to the walk).

## §21 Sector comps band — a cited, reproducible reality check [v1.6.0 — Phase 4 / backlog #4; **Tier B, DATA-SIDE**] [DECIDED — round 1 REFUSED (8 blocking: the join-key premise false vs committed code; the financials disclosure false; an adjudication sample blind to its own mutant; a false biconditional and a false "never a point"; the weight basis mislabelled; a duplicate aggregate label; the map absent; a dead region arm), round 2 REFUSED (4: the B1 fix RELOCATED the defect — the promoted ladder could not return null and misrouted REITs — plus §16 and the changelog stale against the refuted draft), round 3 REFUSED (3: the SIC premise held for only one SEC branch; the replacement range table was never MEASURED; "§21.11 pins it" was a dangling cite), ALL applied; **round 4 GRANTED 2026-08-09, fingerprint-anchored @ fc26e79, zero conditions** — the reviewer independently reproduced the table (zero uncovered blocks and zero most-specific-wins ambiguities across 0100–9999), confirmed the §21.11(x) reordering mutant genuinely reds, and re-verified all 8 worked bands]

**§21.1 The frame and the hole it closes [DECIDED].** The engine carries ONE reality check: the
D5 trading anchor (`facts.implied_trading_ev_ebitda`, a quote-derived EV/EBITDA for the SAME
company). It has no SECTOR context — and the only sector data in the repo is a hardcoded blob
WITHHELD from every surface (`conventions.json sectorMedians_CAVEAT.verifyBeforeDisplay = true`:
"NA+Europe combined, PE+corporate blended, NOT strictly buyout-entry multiples"). §21 replaces
it with a CITED, REPRODUCIBLE, REGIONAL band showing where listed companies in the deal's
sector trade, with source, vintage, region and constituent count on the face of the display.
It computes a FACT the model DISPLAYS; it changes NO engine number (§21.7).

**§21.2 Source [DECIDED].** Aswath Damodaran's industry averages
(`pages.stern.nyu.edu/~adamodar/pc/datasets/vebitda*.xls`) — free, no key, no account, no rate
limit, published annually each January; current vintage **5 Jan 2026**, read from each file's
own `Date updated` cell. Every regional file carries the SAME 94-industry taxonomy plus **two
or three AGGREGATE rows** — US/Europe/Japan carry `Total Market` and
`Total Market (without financials)`; **China and India carry a THIRD row whose label duplicates
`Total Market (without financials)` verbatim** (observed in the source's China file — n=6129 @14.54 and n=7161 @10.80 — and, in the VENDORED
set, in India: n=4523 @17.56 and n=3850 @16.35; not nested, and the duplication is in the
source's own string table, not the conversion. China is NOT vendored (§21.6), so only the India
case is repo-verifiable) [round-1 B6, round-2 M3]. §21.5 pins which row wins.
**Construction of the published figure [round-1 M5]:** each cell is an INDUSTRY AGGREGATE —
aggregate enterprise value ÷ aggregate EBITDA across the group, i.e. implicitly EBITDA-weighted
within the industry — NOT a median firm and not a typical firm. Trailing data runs through the
prior year's Q3. Both facts are disclosed (§21.9).
REJECTED sources: (a) **Financial Modeling Prep** — free tier 250 req/day, 500MB/30d,
**US-ONLY**, and the `stock peers` endpoint that would produce comps is PAID ($15/mo+). US-only
alone disqualifies it for an app that imports ESEF and models GBP/EUR/INR/JPY; a keyed live feed
also adds a secret, a rate limit, an SSRF allowlist entry and a RUNTIME dependency — and a
daily-moving number cannot be adjudicated against a byte-reproducible fixture. (b) the existing
PitchBook/GF-Data sector medians — self-disclosed as unverified and methodologically blended.

**§21.3 Vendoring — the dataset is COMMITTED, never fetched at runtime [DECIDED].** The `.xls`
are legacy BIFF8, which `exceljs` (this repo's only spreadsheet library) cannot read — it
returns zero worksheets. Conversion is therefore an OFFLINE, MANUAL, ANNUAL step:
`scripts/comps/refresh.md` records the source URLs, the conversion command, and each file's
**SHA-256 and stated vintage**; the converted CSVs are committed under `data/comps/raw/` and the
derived table as `data/comps/bands.json`. No new network dependency, no `api/edgar.ts` allowlist
entry, no secret. **PHASE_G AMENDMENT REQUIRED [round-1 M3]:** the Tier-B allowlist enumerates
`lib/edgar/**`, `factsAdapter.ts`, the suggestion path, additive Class-A/C `types.ts` fields, the
display set, `tests/**` and docs — and it FAILS CLOSED, so `data/comps/**` and `scripts/comps/**`
must be ADDED to it explicitly (the amendment ships in this PR's step 1). REJECTED: runtime or
build-time fetching (a third-party static host becomes a hard dependency and the number changes
silently under the user).

**§21.4 The derived band (THE new computation — this is what gets adjudicated).**
Per (region, bucket): for each Damodaran industry mapped to that bucket by §21.5, read its
**EV/EBITDA from the ONLY-POSITIVE-EBITDA block** (the file's FIRST ratio group) and the row's
`Number of firms`.
- **Column choice [DECIDED]:** the positive-EBITDA block — a multiple whose denominator is a
  negative or ~zero EBITDA is not a price, and an LBO target with `EBITDA_adj ≤ 0` is outside
  the engine's domain (§7). REJECTED: the "all firms" block; EV/EBIT and EV/EBITDAR&D (the
  engine's entry multiple is EV/**EBITDA** — mixing bases is the §11 basis-mismatch defect).
- **THE WEIGHT IS AN INDUSTRY POPULATION, NOT THE RATIO'S SAMPLE [round-1 B5 — corrected].**
  The file has exactly ONE `Number of firms` column serving BOTH ratio groups; the source
  defines it as the count in the industry grouping. It therefore includes firms EXCLUDED from
  the positive-EBITDA aggregate — proven in the 2026 US file by
  `Electronics (Consumer & Office)`: n=8 with a positive-block EV/EBITDA of 30.70 and an
  all-firms value of `NA`. The size of the positive-EBITDA subset is NEVER published. So `n_i`
  weights by INDUSTRY POPULATION, which is what the band claims and all §21 surfaces say;
  any label implying "positive-EBITDA firms" on the count is FALSE and is not used.
  REJECTED: unweighted percentiles (a 3-firm industry would count as much as a 568-firm one);
  reconstructing the positive-EBITDA subset size (unpublished — it would be invention).
- **EXCLUSIONS [DECIDED]:** an industry is excluded, from BOTH the value set and the weight
  total, when its value is `NA` **or is ≤ 0** [round-1 M2 — a live case: Japan
  `Insurance (Life)` = **−9.78x** inside the positive-EBITDA block, since positive EBITDA does
  not imply positive enterprise value]. Rows with `n_i = 0` are excluded (they carry no weight
  and live in the vendored set: FIVE rows — Japan `Oil/Gas (Integrated)`, `Reinsurance`, `Utility (General)`, `Utility (Water)` and India `Utility (General)` — every one of which is also NA, so the n=0 rule is belt-and-braces here rather than load-bearing) [round-1 M1].
  **`NA` carries at least TWO distinct meanings** and the surface says which: the ratio is
  meaningless for the industry (US banks/brokers), or the industry is EMPTY in that region
  (several Japan/India rows) [round-1 M6]. The aggregate rows are NEVER industry constituents.
- **The band** = the population-weighted **25th / 50th / 75th** percentiles of the included
  constituents' EV/EBITDA. **The convention is PINNED as LOWER / NEAREST-RANK, no
  interpolation:** sort ascending; `W = Σ n_i` over INCLUDED constituents; the p-th percentile
  is the value of the FIRST constituent whose cumulative weight `c_k ≥ p·W`. REJECTED: linear
  interpolation (at least four mutually-inconsistent weighted-interpolation conventions are in
  common use — an unreproducible number fails the Tier-B bar; §21.10 pins the live case that
  DISCRIMINATES them); a simple min/max range (one 3-firm industry would set the band).
- **The band MAY COLLAPSE to a point, and that is correct, not a defect [round-1 B4 —
  the v1 draft's "never a point" was FALSE].** Any constituent holding >50% of `W` and
  straddling `[0.25W, 0.75W]` sets all three percentiles. Live: **US Real Estate =
  19.87 / 19.87 / 19.87**, where `R.E.I.T.` alone is 190 of W=296 (64%); India Real Estate
  likewise (26.65 ×3, 71%). A single-constituent bucket collapses trivially. The surface shows
  `industries_used` and `firms` so a collapsed band is legible as concentration, not precision.
- **The honest-null rule:** zero included constituents ⇒ the band is **null** — the surface
  shows the unavailable state with its reason, NEVER a fabricated number, never a silent
  fallback to another bucket or region.

**§21.5 The join key and the map [DECIDED — round 2 re-keyed onto the NUMERIC SIC code].**
**Neither `facts.sector` nor `inferSector` is the key.** `factsAdapter` sets `facts.sector` to
the raw EDGAR SIC *description* (live values: `Industrial machinery & equipment`,
`National commercial banks`), and the ESEF route supplies none, so it is `'Other'` for every
ESEF deal [round-1 B1]. **`inferSector`'s keyword ladder is REJECTED as the bucket function
[round-2 B2] — measured, not asserted:** run over 12 real EDGAR `sicDescription` strings it
misroutes 3 and drops 7 to `'Other'`. The decisive case: SIC **6798 "Real Estate Investment
Trusts"** matches `/invest/` in the financial rule, which is tested BEFORE `/real estate|reit/`,
so **every EDGAR REIT buckets to Financial Services and would display 38.03/38.03/57.52 instead
of Real Estate's 19.87/19.87/19.87** — a 2× wrong band on the canonical real-estate issuer code,
against a bucket §21.10 pins as an adjudication item. `Electric Services` → Business Services
(not Energy); `Motor Vehicles`, `Steel Works`, `Air Transportation`, `Hotels & Motels`,
`Telephone Communications` and `Biological Products` all fall through to `'Other'`, silently
nullifying the very §21.5 judgment calls this sign-off exists to settle. It also returns
`'Other'` for absent input, so a null bucket is UNREACHABLE through it [round-2 B1].

**The key is the NUMERIC SIC CODE** — a finite, official, stable taxonomy, already fetched
(`store/dealEngine.ts` reads `submissions.sic` and passes it as `opts.sicCode`) and already
used range-wise in this codebase (`mapXbrl.ts` classifies financials as 6000–6999). §21 threads
it onto `RawHistoricals` → `DealFacts.sic_code: string | null` (additive Class-A, inside the
Tier-B allowlist) and buckets it through a COMMITTED range table `data/comps/sector-map.json`.
**`compsBucket` is a NEW function returning `bucket | 'Other' | null`** — three outcomes that
are deliberately distinct, which is what round 2 found the promoted ladder could not express:
- **null** — NO sector information exists (ESEF/upload deals: no SIC, no dropdown) ⇒ the band
  is **null** and the surface shows the unavailable state with that reason. Never a fallback.
- **`'Other'`** — a SIC code (or manual dropdown) EXISTS but lands in no mapped range ⇒ the
  whole-market fallback (§21.4), labelled as such. "We looked and it isn't one of the eight" is
  a different statement from "we know nothing", and the surface makes it.
- **a bucket** — EDGAR deals from the SIC range table; MANUAL deals take the entry screen's
  nine-value dropdown DIRECTLY (it already carries the bucket names — no inference needed).
**The SIC → bucket ranges (committed as `data/comps/sector-map.json`; MOST-SPECIFIC RANGE WINS —
that is the SOLE tie-break, no "(rest)" qualifiers [round-3 M2]).** Parse: `sic_code` is the
EDGAR string; an EMPTY or absent string is **null** ("we know nothing" — not `'Other'`), and a
present string parses as a base-10 integer so leading zeros are preserved (`"0100"` → 100)
[round-3 M1; the in-repo precedent is `mapXbrl.ts:376`].
`6798 → Real Estate` · `1531 → Consumer` · 0100–0999 → Industrials · 1000–1099 → Industrials ·
1100–1399 → Energy · 1400–1499 → Industrials · 1500–1999 → Industrials · 2000–2399 → Consumer ·
2400–2499 → Industrials · 2500–2599 → Consumer · 2600–2699 → Industrials · 2700–2799 → Consumer ·
2800–2829 → Industrials · **2830–2836 → Healthcare** · 2837–2899 → Industrials ·
**2900–2999 → Energy** · 3000–3099 → Industrials · 3100–3199 → Consumer · 3200–3399 → Industrials ·
3400–3569 → Industrials · **3570–3579 → Technology** · 3580–3659 → Industrials ·
**3660–3699 → Technology** · 3700–3799 → Industrials · 3800–3840 → Technology ·
**3841–3851 → Healthcare** · 3852–3899 → Technology · **3900–3999 → Consumer** ·
4000–4799 → Industrials · 4800–4829 → Business Services · **4830–4849 → Consumer** ·
4850–4899 → Business Services · **4900–4999 → Energy** · 5000–5199 → Industrials ·
5200–5999 → Consumer · 6000–6499 → Financial Services · **6500–6599 → Real Estate** ·
6600–6999 → Financial Services · **7000–7019 → Consumer** · 7020–7369 → Business Services ·
**7370–7379 → Technology** · 7380–7799 → Business Services · **7800–7999 → Consumer** ·
**8000–8099 → Healthcare** · 8100–8999 → Business Services · 9000–9999 → `'Other'`.
`6798` and `6500–6599` win over the 6000–6999 financial default by most-specific-wins — **that
ordering IS the round-2 B2 fix and §21.11(x) pins it by value with a reordering mutant.**

**THE TABLE IS MEASURED, to the same standard §21.5 applies to the ladder it rejects
[round-3 B2 — the r3 draft asserted a table it never tested]:** over a 33-case set of real
EDGAR codes spanning every division plus the three outcome classes, the committed table scores
**33/33**, and an exhaustive 0100–9999 scan leaves ZERO uncovered codes and zero most-specific-wins
ambiguities — **9000–9999 (Public Administration / Nonclassifiable) is an EXPLICIT row mapping
to `'Other'`**, not a gap: those
filers genuinely are not one of the eight, and the whole-market fallback is the honest answer.
The r3 draft's table is superseded: it left 2900–2999 (**Petroleum Refining** — every US
refiner to `'Other'` 16.95x against Energy's 5.15/8.63/11.56), 1100–1199, 1532–1599, 1800–1999,
3680–3699, 3900–3999 and 6800–6999 uncovered, and it CONTRADICTED §21.5's own forced-assignment
sentence on five codes (3661/3663 telecom equipment → Industrials not Technology; 4841/7812/7993
media → Business Services not Consumer) while REGRESSING SIC 7011 Hotels from a self-labelling
`'Other'` to a wrongly-asserted Business Services. All are closed above.
Residual, stated rather than hidden: SIC is a 1987-vintage taxonomy and a four-digit code
describes a filer's PRIMARY activity only, so a conglomerate or a recently-pivoted issuer can
still land in a bucket its business has outgrown. That is a limitation of the KEY, not a defect in the table; §21.9 discloses it [round-4 M2].

**§21.5b Route obligations [round-3 B1 — the r3 premise held for only one SEC branch].**
`store/dealEngine.ts` fetches `submissions.sic` ONCE and then forks: the us-gaap branch passes
`{sicDescription, sicCode}` to `mapCompanyFacts`, but the **IFRS-in-SEC branch (PHASE_D §D6's
20-F filers) calls `mapCompanyFactsIfrs(facts, { sicDescription })` — which has no `sicCode`
parameter at all**, so the code EDGAR supplied one line earlier is dropped. Step 3 ADDED `sicCode?: string` to that opts type and passes it. `lib/edgar/**` is allowlisted;
`store/dealEngine.ts` was NOT, so PHASE_G's Tier-B allowlist is amended with the same narrow,
explicit wording the `data/**` admission used — a fail-closed fence cannot admit a path
implicitly [audit B6; the earlier claim that both files were already inside was FALSE]. §16's null-cause list names this route explicitly, and §21.11(xi) pins it end-to-end — both a
behavioural fixture through `mapCompanyFactsIfrs` and a SOURCE-SCAN guard on the store's call
site, because the store is network-driven and the T5 mutant (the branch silently dropping the
argument) survives any purely behavioural test.

**The map (94 industries → 8 buckets; verified 94 mapped / 0 unmapped / 0 phantom against the
5 Jan 2026 taxonomy).** `Other` maps to NO industries and instead resolves to the file's
`Total Market (without financials)` aggregate — **taking the FIRST row with that label in file
order**, which pins China/India's duplicate (§21.2) [round-1 B6] — labelled on the surface as a
whole-market fallback, never as a sector.
- **Technology** — Computer Services; Computers/Peripherals; Electronics (Consumer & Office);
  Electronics (General); Information Services; Semiconductor; Semiconductor Equip; Software
  (Entertainment); Software (Internet); Software (System & Application); Telecom. Equipment.
- **Healthcare** — Drugs (Biotechnology); Drugs (Pharmaceutical); Healthcare Products;
  Healthcare Support Services; `Heathcare Information and Technology` **(sic — source typo,
  part of the join key)**; Hospitals/Healthcare Facilities.
- **Industrials** — Aerospace/Defense; Air Transport; Auto & Truck; Auto Parts; Building
  Materials; Chemical (Basic/Diversified/Specialty); Construction Supplies; Electrical
  Equipment; Engineering/Construction; Environmental & Waste Services; Farming/Agriculture;
  Machinery; Metals & Mining; Packaging & Container; Paper/Forest Products; Precious Metals;
  `Rubber& Tires` **(sic — missing space, part of the join key)**; Shipbuilding & Marine;
  Steel; Transportation; Transportation (Railroads); Trucking.
- **Consumer** — Apparel; Beverage (Alcoholic/Soft); Broadcasting; Cable TV; Entertainment;
  Food Processing; Food Wholesalers; Furn/Home Furnishings; Homebuilding; Hotel/Gaming;
  Household Products; Publishing & Newspapers; Recreation; Restaurant/Dining; Retail
  (Automotive/Building Supply/Distributors/General/Grocery and Food/Special Lines); Shoe;
  Tobacco.
- **Financial Services** — Bank (Money Center); Banks (Regional); Brokerage & Investment
  Banking; Financial Svcs. (Non-bank & Insurance); Insurance (General/Life/Prop/Cas.);
  Investments & Asset Management; Reinsurance.
- **Real Estate** — R.E.I.T.; Real Estate (Development); Real Estate (General/Diversified);
  Real Estate (Operations & Services); Retail (REITs).
- **Energy** — Coal & Related Energy; Green & Renewable Energy; Oil/Gas (Integrated); Oil/Gas
  (Production and Exploration); Oil/Gas Distribution; Oilfield Svcs/Equip.; Power; Utility
  (General); Utility (Water).
- **Business Services** — Advertising; Business & Consumer Services; Education; Telecom
  (Wireless); Telecom. Services; Diversified; Office Equipment & Services.
**FORCED ASSIGNMENTS, named because they are judgment and they move numbers [round-1 B7]:** the
nine-bucket taxonomy has NO bucket for utilities, telecom, materials or media, so Power/Utility
(→ Energy), Telecom Wireless/Services (→ Business Services), Telecom. Equipment (→ Technology),
Broadcasting/Cable TV/Entertainment/Publishing (→ Consumer) and the materials industries
(→ Industrials) are placed by judgment; `Diversified` (n=20, 11.42x) has no principled home and
sits in Business Services; `Homebuilding` is defensible in Consumer, Real Estate OR Industrials
and is placed in Consumer; and **SIC 5000–5199 (Wholesale Trade) → Industrials even though the map places `Food Wholesalers` and `Retail (Distributors)` in Consumer** — GICS puts "Trading Companies & Distributors" in Industrials and the code describes the distributor, not the goods [round-4 M1]. A reviewer who would place any of these differently is disagreeing
with a CONVENTION, which is what this sign-off exists to settle — not with a computation.

**WORKED BANDS (5 Jan 2026, US, this map, §21.4's convention) — pinned so every claim above is
checkable, per the §19.9/§20.9 precedent:**

| bucket | low | median | high | k | W |
|---|---|---|---|---|---|
| Technology | 22.01 | 24.48 | 24.48 | 11 | 806 |
| Healthcare | 15.25 | 15.78 | 19.78 | 6 | 1178 |
| Industrials | 11.39 | 15.61 | 17.18 | 24 | 929 |
| Consumer | 10.39 | 13.17 | 14.93 | 23 | 917 |
| Financial Services | 38.03 | 38.03 | 57.52 | 6 | 558 |
| Real Estate | 19.87 | 19.87 | 19.87 | 5 | 296 |
| Energy | 5.15 | 8.63 | 11.56 | 9 | 371 |
| Business Services | 9.26 | 12.00 | 14.26 | 7 | 324 |

US Financial Services in full (the constituent table, because §21.9's disclosure turns on it):
Insurance (Prop/Cas.) 8.44 n=57 → Reinsurance 8.67 n=1 → Insurance (Life) 12.52 n=20 →
Insurance (General) 15.76 n=21 → Investments & Asset Management 38.03 n=283 → Financial Svcs.
(Non-bank & Insurance) 57.52 n=176. W=558; p·W = 139.5 / 279 / 418.5 ⇒ **38.03 / 38.03 / 57.52**.
The three NA bank/broker rows are excluded and 558 counts only the six included.

**§21.6 Region selection [DECIDED — four regions, no dead arm].** By the deal's reporting
CURRENCY: **USD→US, EUR→Europe, GBP→Europe, JPY→Japan, INR→India.** `DealFacts.currency` is
typed to exactly those five and `factsAdapter` hard-coerces anything else to `'USD'` while
Build-blocking on `currency_unsupported`, so **the five arms EXHAUST the domain and there is no
`else` branch** [round-1 B8 — the v1 draft's `else → Global` was dead by type, the §19-r1
dead-tier defect repeated]. Accordingly **only four datasets are committed — US, Europe, Japan,
India**; Global, Emerging and China are NOT vendored, because no deal can select them.
Rationale for the key: currency is a first-class, already-gated fact of the deal's own unit of
account, whereas `facts.source` names only the filing ROUTE (an ESEF filer can report in USD; a
manual deal has no route). The chosen region is DISPLAYED, so a GBP deal is never silently told
it is being compared against continental Europe. Disclosed limitation: currency is a proxy for
listing market, not for where the business operates.

**§21.7 Composition — the Tier-B admission ticket [DECIDED].** `sector_comps` is a Class-A FACT
computed in the EXTRACTION layer (`lib/edgar/comps.ts`) and threaded through `factsAdapter`.
**The git diff over the ENGINE ARITHMETIC PATH is EMPTY** — no `kernel/**`, no
`operating/tax/debt/sequence/exit/returns/credit/bridge/sourcesUses/openingBalance/scenarios/
facade/check/fund`. It feeds NO engine number, NO suggestion value and NO coherence flag; the
committed goldens do not serialize `facts`, so every fixture regenerates byte-identically.
**The comparison flag is DEFERRED by rule:** an `entry_multiple_vs_sector` coherence flag would
live in `check.ts`, which IS on the engine arithmetic path, so it is a SEPARATELY-GATED Tier-A
PR — the per-changed-number decomposition PHASE_G mandates for backlog #10. This PR displays
the band beside the entry multiple and lets the reader draw the conclusion.

**§21.8 Invariants (→ §14.22, domains PER CLAUSE).**
(a) [band non-null, basis `'sector'`] `low ≤ median ≤ high`, and each is a value that OCCURS
among the included constituents. (Ordering holds universally: `k(p) = min{k : c_k ≥ p·W}` is
non-decreasing in p over an ascending value list.)
(b) [basis `'sector'`] `industries_used ≥ 1 ⇔ band non-null`, and `firms` = Σ `n_i` over
INCLUDED constituents only. **[basis `'total_market_ex_financials'`]** `industries_used = 0`
with a NON-null band, and `firms` = the aggregate row's own count — the biconditional does NOT
apply [round-1 B4: `Other` was a live counterexample to the v1 draft's unscoped clause].
(c) [all] `bands.json` is a pure function of the committed CSVs + the committed map + the
§21.5 first-row rule, reproduced BYTE-IDENTICALLY by the §21.10 gate.
(d) [all] the feature adds NO engine output: every existing golden regenerates byte-identically
and the only `ModelOutput` change is one additive `facts` field.
(e) NON-CLAIM: the band is a PUBLIC-MARKET trading range, NOT a buyout-entry range — control
premia, synergies, leverage and illiquidity all sit between them — and no ordering between a
deal's entry multiple and the band is asserted to be right or wrong.

**§21.9 Disclosure (§15 row) — every clause factual [round-1 B2/B5/M5/M6 corrected].**
Annual vintage, stated per band from the file's own cell; **public-market trading multiples,
NOT buyout-entry multiples**; each figure is an INDUSTRY AGGREGATE (aggregate EV ÷ aggregate
EBITDA, implicitly EBITDA-weighted within the industry), not a median firm, on data trailing
through the prior year's Q3; positive-EBITDA block only, with non-positive and `NA` values
excluded; **`firms` is the industry POPULATION count, which includes firms outside the ratio's
own aggregate — the positive-EBITDA subset size is not published**; the 94→8 map is a stated
convention whose forced assignments are listed in §21.5 and whose constituent count is shown;
**financials are NOT uniformly unavailable — in the US file the three bank/broker industries
are `NA` and drop out, leaving a band set by asset managers and non-bank financials
(38.03 / 38.03 / 57.52), while Europe/Japan/India DO publish bank or broker multiples that
enter the band**; a band may collapse to a point under a dominant constituent; region is
inferred from reporting currency (a proxy for listing market) and displayed; ESEF/upload deals
carry no sector source and show the unavailable state; no live feed — the dataset is committed
and refreshed manually.

**§21.10 Adjudication plan — the Tier-B mechanism, bound to the DERIVATION.md method.**
(1) A reference in a DIFFERENT LANGUAGE with ZERO imports of the code under test —
`scripts/comps/derive_bands.py` reads the committed CSVs + map and emits `bands.json`.
(2) **TWO independent blind hand-derivation passes** over a sample chosen to DISCRIMINATE, not
to agree [round-1 B3 — the v1 sample was provably blind to the very mutant §21.4 exists to
exclude: nearest-rank and interpolation agree on 54 of 56 region×bucket bands, and 3 of the 4
v1 sample items had zero discriminating power]. The sample is NAMED, with both conventions'
numbers pinned so a passing adjudicator cannot have interpolated:
  - **Japan Real Estate — THE discriminator, and simultaneously the exact-boundary case.**
    W=168 and p·W = 0.25 × 168 = **42.00**, exactly `c₁` (Real Estate (Operations & Services),
    n=42). Under §21.4's `≥`: low = **8.91**. Under interpolation: **10.71**. Under a `>`
    variant: 11.31. One live bucket pins the convention AND the boundary rule [round-1 M1 —
    preferred over a constructed vector, which would drift from the regenerating gate].
  - **US Financial Services** = 38.03 / 38.03 / 57.52 — the NA-exclusion path and the
    §21.9 disclosure that round 1 falsified.
  - **US Real Estate** = 19.87 ×3 — the dominant-constituent collapse (§21.4).
  - **US Consumer** = 10.39 / 13.17 / 14.93 — a 23-constituent bucket with lopsided weights.
  - **`Other` (US)** = the `Total Market (without financials)` scalar 16.95, basis
    `'total_market_ex_financials'` — the §21.8(b) carve-out.
  Adjudication compares at FULL precision, never at §15's 1-decimal display precision.
  **Under the committed map exactly ONE of 96 (bucket, percentile) points discriminates** —
  Japan Real Estate p=0.25, nearest-rank 8.91 vs interpolated 10.71, |Δ| = 1.80 — and the
  interpolation meant is **expand-by-weight LINEAR (type-7, `h = (W−1)p`)**, named because it
  is the only convention that yields 10.71 [round-2 adjudication pass 2]. The scoping matters:
  under block-midpoint (type-5) or cumulative-CDF-edge weighting the same bucket returns 10.03
  or 8.91 and **all 32 sector bands discriminate**, so "only one discriminates" is a statement
  about type-7, not about interpolation in general — which is itself the live vindication of
  §21.4's rejection rationale (four mutually-inconsistent conventions, four different answers
  on one bucket) [round-2 M2 — the r2 draft's "US Consumer differs by 0.02x" was measured on the
  r1-era bucket and is FALSE under the map committed beside it]. Because the sample therefore
  has ONE discriminator, the §21.10(3) gate must ASSERT that the pinned interpolation value
  still differs from the pinned nearest-rank value, so an annual refresh cannot silently
  remove the only mutant-catching case.
(3) The **CI REGENERATION GATE**: `tests/comps-regeneration.test.ts` re-runs `derive_bands.py`
into a temp dir and byte-compares `bands.json`, exactly as `goldens.test.ts` does for the
engine. **The byte contract is pinned** [round-1 M7, corrected by the step-2 adjudication]: `python3` ≥3.11,
`json.dumps(..., sort_keys=True, indent=1, ensure_ascii=False)` + a trailing newline, and every emitted
value ROUNDED through `f"{v:.2f}"` before serialization — the rounding is what kills binary float
noise, and it is the load-bearing half. Serialization is then CPython's float `repr`, whose
shortest-round-trip form is DETERMINISTIC and stable across versions ≥3.1, so **trailing zeros do
NOT survive** (8 of the 108 emitted band values render as `9.5`, `12.0`, `18.5` … where the source
cell reads `9.50`). That is EXPECTED, not a defect: the gate compares one run of the emitter against
another run of the SAME emitter, never against a hand-authored file, so determinism — not decimal
cosmetics — is what "byte-identical" needs. [The earlier draft demanded a fixed 2-decimal
SERIALIZER and was contradicted by the artifact it governs; both adjudication passes flagged it
independently, and the clause is corrected here rather than the emitter, because forcing `9.50`
into JSON requires bypassing `json.dumps` for a raw literal — strictly more fragile for zero
numeric gain.]
(4) A **CSV integrity + freshness gate**: each committed CSV's SHA-256 and stated vintage are
pinned, AND the test REDDENS once the vintage is more than 15 months old — the manual annual
refresh is the one step this design rests on, so it gets a forcing function rather than a
hope [round-1 M4]. The repo's existing `stalenessTier` is deliberately NOT reused: its
fresh/aging/stale thresholds are built on filing cadence and are wrong for an annual January
publication (a 5 Jan file would only read 'stale' from ~20 Mar of the following year, months
after the next edition was due).

**§21.11 Golden-uncovered by design** (directed fixtures): (i) NA exclusion — excluded firms
must leave the weight total (US Financial Services: W=558, not 1173 — the three NA rows are 15+568+32=615); (ii) the ≤ 0 exclusion
(Japan `Insurance (Life)` −9.78x); (iii) the exact-boundary rule on the live Japan Real Estate
case (`≥` ⇒ 8.91, not 11.31); (iv) an all-NA/empty bucket ⇒ null band + the surface's
unavailable state with its reason; (v) the `Other` whole-market fallback INCLUDING the
duplicate-label first-row rule, exercised on INDIA (the vendored instance); (vi) region selection for each of the four
reachable regions across the five currencies (GBP and EUR both ⇒ Europe); (vii) the two typo
join keys (`Rubber& Tires`, `Heathcare Information and Technology`) — a "corrected" string must
fail the join LOUDLY, never silently drop the industry; (viii) the join-key routes, ONE CASE PER OUTCOME: EDGAR numeric SIC ⇒ a bucket; a code in no
range (9000–9999) ⇒ `'Other'` ⇒ the whole-market fallback; NO code at all (empty string or
absent) ⇒ **null** ⇒ the unavailable state — the three outcomes must be distinguishable, not
merely non-crashing; manual dropdown ⇒ its bucket directly; (ix) a single-constituent bucket
(low ≡ median ≡ high) and a dominant-constituent collapse (US Real Estate); **(x) THE ORDERING
PIN [round-3 B3 — the r3 draft cited §21.11 for this and §21.11 contained no such item, the §20
dangling-cite class repeating]: `compsBucket('6798') === 'Real Estate'` and
`compsBucket('6512') === 'Real Estate'` against `compsBucket('6022') === 'Financial Services'`,
MUTATION-TESTED by reordering the table to plain ascending scan — which reproduces the exact
round-2 defect (every REIT displayed at 38.03/38.03/57.52 instead of 19.87×3) and must RED;
(xi) the D6 route (§21.5b): an IFRS-in-SEC 20-F filer with a published SIC must reach a bucket,
NOT the null band — the fixture fails until `mapCompanyFactsIfrs` threads `sicCode`.

## §22 Sweet equity, ratchets & warrants — the management strip as a REAL instrument [v1.7.0 — Phase 5 / backlog #8; Tier A, engine arithmetic] [DRAFT — round 1 REFUSED by two independent reviewers (11 blocking in union: G9-SWEET's false zero-flag claim with G3's `ahydo_shape` as the committed counterexample; the missing §2 source field breaking §14.1; the §8 goodwill plug moving under a "plug is unaffected" sentence; "§19 composes unchanged" false against three committed `sponsorShareOfDistributions` call sites; the `max(0, E)` clamp breaking the v1 path at E < 0; a dangling "§16 single-path rule" cite; three over-broad §14.23 domains; §22.4 with zero golden coverage and no invariant; §14.9(b) un-amended and off by $28.73m on the golden; §16's false "byte-identity" shorthand; the §9 membership table un-amended), ALL applied; round 2 REFUSED by both (7 blocking in union — the `pot ≤ 0` arm was UNQUALIFIED so it overrode §9's pari-passu split of a negative residual on the v1 path and byte-identity was still false, just differently; §14.23(d) FAILED on the very negative-E fixture §22.13(v) newly prescribed, because `returns.ts` sums positive flows only and the r1 clamp had been hiding it; §22.5's `STOP` left three REQUIRED outputs undefined on a reachable path; the §15 disclosure row was BYTE-IDENTICAL to the refuted draft — still "the conservative direction" — while the changelog claimed it amended; §14.23(b) named a nullable `equity_strip` field across its own `[ALL]` domain; plus the §9 warrant row double-counting and the §22.9(h) payout/uncapped conflation), ALL applied; round 3 REFUSED by both (5 blocking in union — `V_final ← V₀` on the zero/negative-pot arm reported TIERS REACHED on value subsequently LOST (V₀ = 99, P = −25: 0.99 vs the realized 0.74, crossing 0.8 and 0.9 hurdles), the THIRD relocation of one defect family; the stage-4 split made §22.5's own `P ≤ 0` opener UNREACHABLE so three REQUIRED outputs went undefined again and §22.13(v)(α) contradicted §22.7; §22.9(d)/(h) were byte-identical to the REFUSED text while §14.23 carried the corrections and the changelog claimed both applied; §22.5's MIRROR block was byte-identical to r2 and its normative sentence to the r1 REFUTED draft, still naming `returns.sponsor_net.moic` with no domain and no tolerance floor; and §22.11 had LOST the headline-vs-realized disclosure that §15 carried, so regenerating §15 from it — exactly what its heading commissions — would have deleted a refused finding's disposition), ALL applied — round 4 pending. **STRUCTURAL FIX in r4: §14.23 is now the SINGLE normative home for every §22 invariant and §22.11 the single home for the §15 row; §22.5/§22.9 carry domains, rationale and worked examples and CITE §14.23, and any divergence is itself a defect with §14.23 governing. Three consecutive rounds shipped a "stale against the refuted draft" defect (§16 inherited from v1.6.0, then §15, then §22.9) because the same rule lived in three places and was re-synced by hand — the same failure PHASE_G names for hand-kept lists.** Round 4 REFUSED by both (5 blocking in union — the §22.5 annotation still DEFINED the count as `#{ j : V₀ > T_j }`, the refused rule, four lines below its own correction and giving 2 tiers where the normative line gives 0 on the block's OWN counterexample; the r3 monotonicity correction had been filed in §22.9(h) while §14.23(h) kept the FALSE claim, so the new precedence rule PROMOTED the error it was written to prevent; the deleted COMPARISON RULE paragraph left `institution_moic_at_ratchet` with NO normative definition anywhere and §14.23(d) carrying this project's FOURTH dangling cite; and the single-home conversion had reached 2 of §22.9's 9 clauses while the header and changelog claimed the section), ALL applied — round 5 pending. **The single-home rule is now MECHANICALLY ENFORCED rather than promised: `tests/governance-spec-single-home.test.ts` fails if §22.9 states any formula, if a §14.23(23) clause letter lacks a §22.9 citation, or if §15 drifts from the marker-delimited sentences §22.11 governs. Three mutants run RED and reverted — one reproducing the exact r3 defect (§15 back to "the conservative direction").** Round 5 REFUSED by both (3 blocking in union, ALL in that guard: it keyed on ONE character, `≡`, which only 3 of 9 clauses use, so mutants restating (a), (e), (g) and (h) passed GREEN — including one asserting the §22.4 envelope on the WRONG quantity, i.e. the exact round-4 defect the guard existed to prevent; the clause-letter check was a hand-kept `[a-i]` literal, so a new §14.23 clause needed no companion, and its substring match let §22.9 clause (f) be DELETED silently; and the §15 check pinned 18% of the clause in ONE direction, so §15 could gain a CONTRADICTING sentence or gain §22 content absent from its source — round-4's own defect inverted — and stay green. The v1 mutants had all landed inside the covered subset, the §21-round-1 "sample blind to its own mutant" failure). ALL applied — **guard v2** bans EVERY mathematical token in §22.9's code spans with domains rewritten as PROSE, derives clause letters from §14.23 with an OPEN class, binds each citation to its OWN clause body, and compares §15 against the §22.11 block in BOTH directions over the WHOLE clause. **14 mutants derived FROM the property — one per clause plus every structural hole the reviewers proved — all RED, all reverted, baseline green.** Round 6 REFUSED by both (5 blocking in union, ALL in guard v2, 12 of 20 reviewer mutants passing it: the token ban was an ENUMERATED DENYLIST and so failed OPEN — missing `+`, ASCII `-`, `*`, `**`, `÷` and unicode lookalikes, with its slash rule INVERTED so it fired on paths and missed division; it scanned only BACKTICKED spans, so the FALSE §22.4 envelope passed simply by dropping its backticks; its clause scan anchored on a hand-kept punctuation set, so a clause added after a PERIOD was invisible; its §15 slice covered 39%, so §22 disclosure placed elsewhere in §15 was ungoverned — round-4's defect surviving by relocation; and §22.9(h)'s prose domain was NARROWER than §14.23(h)'s, excluding the empty ratchet list the clause's own sub-claim requires). ALL applied — **guard v3 inverts the polarity where it matters**: the span check is a fail-closed ALLOWLIST (a §22.9 code span must be an identifier or a filename, admitting no expression at all), with a token BACKSTOP over the PROSE so an unbackticked formula is caught too; clause sets are derived from BOTH homes and compared for EQUALITY with no punctuation anchor; §15 is delimited on BOTH sides with §22 terms banned outside the markers. **19 mutants — every operator family and every hole either reviewer proved — ALL RED, and the SPEC verified BYTE-IDENTICAL to pre-mutation.** Round 7 REFUSED by both (union: 2 real SPEC defects + the guard's own escalation). The SPEC defects: §14.23(d)'s round-6 ordinal "fix" called the domain's CORE condition redundant when the redundant one is the plug condition — a fix landing in the governing home and making it WORSE than its companion, for the FOURTH time; and round 7's null-vs-empty disambiguation NARROWED §14.23(f) to exclude `mip.ratchet: []`, which also produces v1 numbers, so a compatibility regression on that representation could have shipped green. **Both fixed.** On the guard, the governance reviewer's proportionality judgement was requested and delivered: **across rounds 5–7 it caught ZERO §22 defects and OCCASIONED THREE**, while the same false §22.4 envelope survived all three generations by changing notation (`≤` → unbackticked `≤` → the words "is at most"), which no lexical rule can reach. **ROUND 8 CUT IT BACK** to the three checks that enforce IDENTITY RELATIONS across widely-separated text — the allowlist, the clause-set equality, the §15↔§22.11 equality — and DELETED the prose backstop and its CHARTER pin, which had pinned a stale self-description into §22.9. 15 mutants across every notation family still RED with the smaller guard, so the cut lost nothing measurable. Round 8 closed — **Round 8 REFUSED** by a 5-lens workflow (5/5 lenses REFUSED; 12 spec-blocking findings over 14 distinct subjects; ZERO guard-locus findings, once the guard's residuals were documented and findings were labelled by locus). **Round 9 adversarially VERIFIED all 14** with two independent skeptics each (29 agents): **10 confirmed blocking, 4 minor, ZERO not-a-defect** — and TWO that round 8 had REFUTED (§22.3(vi)'s scope, §14.23(f)'s dotted-null domain) were CONFIRMED on re-verification, so the round-8 refutations were themselves wrong. ALL applied. The six blocking: §22.3(vi)'s Build rejection was UNQUALIFIED and would have made `runModel` THROW on a run v1 merely FLAGS, killing a committed insolvency test inside the domain §14.23(f) declares v1-identical; §22.7 claimed `equity_strip` is null on the whole `sweet_equity`-null arm, FALSE on the warrant-only arm §22.13(vi) commissions a fixture for; §22.5 stated the tier count a SECOND time on a money path, which §14.23(d)'s COMPARISON RULE forbids — the two agree in exact arithmetic but disagreed on **4.1% of 300,000 float draws**, at exactly the tie §22.13(iii) makes normative; §22.13(v)(α), the ONLY coverage of §22.5's `P ≤ 0` opener, was BLIND to the mutant it names (its configuration was fine — its ASSERT SET was not); §14.23(f)'s domain did not reach `mip: null`, closed by ONE convention sentence in §14's preamble which closes item 21(c) simultaneously rather than re-editing a clause a prior attempt had already relocated once; and the cliff 'NO fixed point' UNIVERSAL, false because no-solution holds only over a BOUNDED INTERVAL. 11 minors applied. **The adjudicator also caught that the round-9-PARTIAL fix to §14.16 had traded a contradiction for a DUPLICATE** — the same identity in two hand-synced homes, the generator rather than the instance — so §14.16 now OWNS it and §14.23(b) POINTS at it. Round 10 pending.]

**§22.1 The frame [DECIDED].** §10 models ONE instrument: a US-style promote pool struck on
total equity proceeds. DR-2 Item 4 is explicit that layering that promote on a **sweet-equity
cap table double-counts management upside**, and §10 has carried the consequence as a
forward reference since v1.0: *"sweet-equity strips (institutional strip + ordinaries, the
UK/European structure) are a separate Phase G module, modeled through the actual instrument,
never blended."* §22 is that module, and it keeps the rule STRUCTURAL rather than advisory:
`sweet_equity` non-null ∧ `mip` non-null is an **input-gate REJECTION** (§22.3), so the two
instruments cannot be blended even by accident.

§22 adds THREE claims on the equity pot, all resolved at exit, all closed-form (§5's
no-solver rule survives — see §22.5, where preserving it is the whole reason the ratchet is
MARGINAL rather than a cliff):

1. **The institutional strip (§22.2)** — the sponsor's check is subscribed partly as
   deeply-subordinated **institutional loan notes** (a fixed compounding yield, redeemed at
   exit at par + accrued, ranking AHEAD of ordinary shares) and partly as **institutional
   ordinaries**. Management subscribes cash for **sweet ordinaries** — a share of the ordinary
   class disproportionate to what they paid. That asymmetry IS the incentive; it replaces the
   promote, it does not sit beside it.
2. **Ratchets (§22.4/§22.5)** — a step function that raises an incentive share as a MOIC
   threshold is crossed. Two applications, because two instruments: the §10 promote's
   `pool_pct` gains tiers (§22.4), and the sweet-equity ordinary split gains tiers (§22.5).
   They share the MARGINAL convention but are struck on DIFFERENT, explicitly stated bases —
   §22.5 says why the divergence is deliberate rather than an inconsistency.
3. **Warrants / equity kickers (§22.6)** — DR-4's mezzanine warrant (2–8% of equity): a claim
   on the ordinary CLASS, rationally exercised at exit, diluting every ordinary holder
   pro-rata.

All three are OFF by default (`sweet_equity: null`, `mip.ratchet: null`, `warrant: null`), and
with all three off every computed number is identical to v1.6.0 (§22.9(f)); the ONE deliberate
fixture-SHAPE change is decided spec-side in §22.12, never discovered as a red test.

**CODE HOME [round-1 gov-M1 — stated so the containment fence demonstrably covers it].** All
§22 arithmetic lands in modules ALREADY on the ENGINE ARITHMETIC PATH: the exit waterfall in
`lib/engine2/exit.ts`, the interim split in `sequence.ts` with its three consumers
(`returns.ts`, `fund.ts`, `facade.ts` — §22.7), the §2 source line in `sourcesUses.ts`, the
§8 equity line in `openingBalance.ts`, the walk-down in `bridge.ts`, the flag in `check.ts`.
**§22 introduces NO new engine module**, so neither PHASE_G's ENGINE-ARITHMETIC-PATH
enumeration nor `tests/governance-display-surface.test.ts`'s `ENGINE_ARITHMETIC_MODULES`
regex needs amending — the §19 precedent (which DID add `fund.ts` and amended both) is
deliberately not repeated. PRECISION [round-2 gov-M8]: PHASE_G's enumeration covers all nine
modules including `facade.ts`; the governance REGEX deliberately omits `facade` (display
surfaces read ModelOutput via `facade` types), which is a pre-existing and intended asymmetry
§22 neither creates nor relies on. PHASE_G names hand-kept lists as the recurring enforcement hole;
the cheapest way not to fall in it is not to extend the list.

**§22.2 The institutional strip — loan notes are EQUITY, not debt [DECIDED].** Institutional
loan notes (equivalently redeemable preference shares) are shareholder instruments
subordinated to every external lender. v1 models them **entirely inside the equity box**:

- They are NOT tranches. They do not enter §11 leverage, ICR, FCCR or DSCR; they take no
  part in the §3 waterfall (no cash interest, no amort, no sweep); they are NOT in §9's
  `debt_payoff_at_par_plus_pik`; they are not refinanceable (§18).
- They generate **NO §6 deduction**. Their yield rolls up and is settled out of equity
  proceeds.
- Their balance accretes annually at `loan_note_rate` and is reduced by any interim
  redemption (§22.7): `LN[t] = LN[t−1] × (1 + rate) − redeemed[t]`, `LN[0] = the subscribed
  amount` (NO year-0 accretion — the first accretion lands in year 1). With no interim
  distributions this is the closed form `LN[N] = LN[0] × (1 + rate)^N`.
- **MEASUREMENT POINT, pinned [round-1 gov-M3].** `loan_notes_accrued_balance` is `LN[N]`
  **grown to exit and BEFORE the exit redemption** (i.e. net of any INTERIM redemptions but
  gross of the exit one); `loan_notes_redeemed` is the **EXIT** redemption alone, not a
  cumulative figure. §22.9(g)'s flag condition only reads correctly under exactly this pair,
  so it is stated rather than left to the implementer.

REJECTED alternatives, each with its reason:
(a) **Modeling loan notes as a `structure.tranches` entry.** They would land in entry
leverage, the credit dashboard, the ECF sweep and the §9 payoff — every one of which would
be wrong, because no external lender's covenant package counts shareholder notes as debt.
This is not a shortcut that loses precision; it computes different, false numbers.
(b) **Claiming an interest deduction on the loan-note yield.** Whether a real strip's yield
is deductible is a jurisdiction-specific question (UK CTA 2009 Part 5 unallowable-purpose,
the hybrid-mismatch rules, US §385 / earnings-stripping) that the engine carries no facts to
answer. v1 claims NO deduction, which is **never anti-conservative** [round-1 gov-M6 — the
first draft said "conservative", which over-claims: on a deal where §163(j) BINDS every year
(G3 is exactly that) admitting the deduction would change nothing, so the effect is NEUTRAL
there and lower-returns elsewhere; "never anti-conservative" is the claim that is true in
both regimes]. The jurisdictional module is a v2 re-entry.
(c) **A cash-pay loan note.** Real strips roll up; a cash-pay shareholder note would compete
with debt service inside §3 and is a different instrument. v1 accrues only.

**§22.3 Inputs (§16 schema).** Three additive Class-B blocks, each null ≡ OFF.

```
sweet_equity: {                                  // null ≡ no strip
  sponsor_ordinary_pct: number       // (0, 1]  — fraction of the SPONSOR's §2 plug taken as
                                     //           institutional ORDINARIES; (1 − this) is
                                     //           subscribed as institutional LOAN NOTES
  loan_note_rate: number             // ≥ 0     — annual compounding yield (§22.2)
  management_subscription: number    // ≥ 0 $m  — management's CASH for sweet ordinaries; a §2
                                     //           SOURCE (its own line — §22.10), which reduces
                                     //           the sponsor plug exactly as rollover does
  management_ordinary_pct: number    // [0, 1)  — management's BASE share of the ordinary class
  ratchet: RatchetTier[] | null      // §22.5; null ≡ [] ≡ a FLAT sweet-equity split
} | null

warrant: {                                       // null ≡ none; AT MOST ONE by construction
  holder_label: string               // display only — see the REJECTED tranche link below
  pct_of_ordinary: number            // (0, 1)
  strike_total: number               // ≥ 0 $m — the WHOLE exercise cost, not per share
} | null

mip: { pool_pct, hurdle_moic, ratchet: RatchetTier[] | null }   // ratchet null ≡ [] ≡ v1

RatchetTier: { hurdle_moic: number;   // > 0  [round-1 arith-M1: the first draft gave a domain
                                      //      for every other field and none for this one, so a
                                      //      zero/negative hurdle would make T_j ≤ 0 ≤ V₀ and
                                      //      report a tier "reached" at a nonsense threshold]
               share_pct: number }   // [0, 1) — see (iv); stated inline in round 3 so the
                                     //          block matches §16 [round-2 arith-M6]
```

**Input-gate REJECTIONS (validated at Build — rejections, never computed defaults, §16).**
There are **SEVEN** [round-1 gov-M10: the first draft's §22.13 said "the four §22.3
REJECTIONS" while §22.3 enumerated five; the list and its fixture obligation are now counted
together and §22.13(viii) covers each]:
(i) `sweet_equity` non-null ∧ `mip` non-null — the DR-2 double-count rule made structural
(§22.1);
(ii) `sweet_equity` non-null ∧ `rollover_equity > 0` — **a v1 SCOPE gate, stated as one**:
a rollover inside a strip must itself be allocated between the institutional strip and the
sweet ords, and that allocation is negotiated with no defensible default; applying today's
pari-passu-ordinary rule (§9) would silently contradict the strip it is sitting inside.
Deferred to v2 and DISCLOSED (§22.11) rather than guessed;
(iii) any domain violation in the table above (including `hurdle_moic ≤ 0`);
(iv) **ratchet tier gates**: `hurdle_moic` STRICTLY ascending across tiers; the first tier's
`hurdle_moic` strictly greater than the base threshold it sits above (`mip.hurdle_moic` for
§22.4; §22.5 has no base threshold, its base share applying from zero); `share_pct`
NON-DECREASING across tiers and ≥ the base share (a *ratchet* only ever ratchets up — a
decreasing tier is a different instrument and is rejected loudly); and **every `share_pct` <
1**. The `< 1` gate has TWO DIFFERENT reasons, one per ratchet [round-1 arith-M10 — the first
draft gave one reason and it was false for §22.4]: for **§22.5** it is arithmetic (the bracket
walk's `(1 − s)` denominator is zero, the institution's value stops rising, and the tier can
never be exited); for **§22.4** there is no such denominator and the gate is economic (a pool
taking 100% of a marginal slice hands the entire top bracket to management, which no promote
document grants);
(v) `warrant` non-null ∧ `pct_of_ordinary` ∉ (0, 1) or `strike_total < 0`;
(vi) **`sweet_equity` non-null ∧ a `management_subscription` that leaves a non-positive §2
residual plug** — the qualifier is LOAD-BEARING [round-8/9 F06, confirmed by both skeptics].
With `sweet_equity` NULL there is no subscription, so the stated residual IS the v1 §2 plug and
`≤ 0` is byte-identical to the committed coherence condition `check.ts` uses for
`negative_sponsor_equity`; unqualified, this gate would make `runModel` THROW on a run v1
computes and merely flags — killing the committed insolvency case in
`tests/engine2-facade-scenarios.test.ts` (plug −78.76), inside the very domain §14.23(f)
declares numerically identical to v1.6.0. With `sweet_equity` NULL this gate does not apply and
the pre-existing post-run `negative_sponsor_equity` BLOCK flag continues to govern unchanged.
**Enforcement point:** inside `runModel`, like every other §16 structural gate. **§13's
SENSITIVITY grid must test this gate's condition BEFORE calling `runModel` for a cell**, because
`buildSensitivityGrid` calls `runModel` per cell with NO try/catch, so an entry-side axis that
re-derives a non-positive plug would otherwise fail the WHOLE grid [round-10: the round-9 text
cited `validateFund` as the precedent for per-cell reporting, but `validateFund` THROWS — the
precedent says the opposite of what the sentence claimed] [round-1 gov-M4/arith-M7; heading de-circularised in round 3 — arith-M4 noted the r2 wording compared the subscription to a quantity defined by subtracting it]
— i.e. Build REJECTS when the §2 residual `total_uses − debt_at_par − rollover_equity −
management_subscription` is ≤ 0. Unlike the pre-existing `negative_sponsor_equity` COHERENCE
flag (`check.ts`, post-run), this is deterministic at Build from the S&U identity, and it must
be a rejection because a non-positive plug makes the ordinary/loan-note split incoherent — the older gloss `LN[0] = (1 − sponsor_ordinary_pct) × plug`
NEGATIVE is itself FALSE at `sponsor_ordinary_pct = 1`, which §16 admits as legal (domain
(0, 1]) and where LN[0] = 0 for ANY plug; and the gate is `≤ 0` rather than `< 0` because a ZERO
plug leaves the institution with no subscription at all [round-9 M10];
(vii) `sweet_equity` non-null ∧ `management_ordinary_pct = 0` ∧ `management_subscription > 0`
[round-1 gov-M5] — management paying real money for a zero share is not a sweet-equity
structure, it is a typo that silently shrinks the sponsor's own check. `management_ordinary_pct
= 0` with a ZERO subscription stays legal (it is the "strip with no sweet layer" configuration
— an all-institutional strip, which is a real structure).

REJECTED input designs: (a) **a `warrant.tranche_name` link** to the mezzanine tranche it
was issued with — no arithmetic depends on it, so it would be a join key that exists only to
be displayed, and this project has already paid for one of those (§21 round 1: a join-key
premise false against committed code). The economic link is DISCLOSED in the label, and
§22.11 states plainly that the tranche association is not modeled. (b) **An ARRAY of
warrants.** Two warrants' exercise decisions are mutually dependent (each dilutes the other),
which admits multiple rational-exercise equilibria and has no closed form; v1 carries a
SINGULAR field so "at most one" is structural rather than a gate someone must remember to
write. (c) **A `sweetness_ratio` input** deriving `management_ordinary_pct` from the
subscription — the price paid and the share received are INDEPENDENTLY negotiated, and
deriving one from the other would erase exactly the asymmetry that makes sweet equity sweet.

**§22.4 The MIP ratchet — §10 generalized, not replaced [DECIDED].** §10's promote is
ALREADY a one-tier marginal ratchet: `pool_pct × max(0, X − T)` is "`pool_pct` of the slice of
X above T", with X = pre-MIP TOTAL equity proceeds (exit equity + cumulative interim
distributions, §10 [v1.1.0]) and T = `hurdle_moic × invested_equity_total`. §22.4 adds tiers
2..n by the same rule, applied MARGINALLY:

```
tiers (T_j ASCENDING only while `invested_equity_total > 0` — at a negative base ascending
                   hurdles produce DESCENDING thresholds, which is why §14.23(h) carries that
                   domain [round-9 M5]): T_0 = hurdle_moic × invested_equity_total, s_0 = pool_pct
                   T_j = ratchet[j].hurdle_moic × invested_equity_total, s_j = ratchet[j].share_pct
uncapped promote  = Σ_j  s_j × ( min(X, T_{j+1}) − T_j )⁺        (T_{n+1} = +∞)
mip_payout        = min( uncapped promote, max(0, exit_equity_pre_mip_total) )   ← §10's cap, unchanged
```

With `ratchet` null the sum has ONE term and this is `pool_pct × max(0, X − T_0)` — **§10
verbatim**, which is why every existing golden's `mip_payout` is unchanged (§22.9(f)). This
was verified symbolically AND over 18 numeric cases including `X < T_0` and a binding cap
(round-1 arithmetic sign-off: zero mismatches).

X does not depend on the promote (it is the PRE-promote total), so there is no circularity
here and no walk is needed — the tiers are a plain sum of bracket terms. §10's exit-equity
`min()` cap and its disclosed truncation-without-accrual consequence carry over unchanged.

REJECTED: (a) **cliff tiers on the promote** (`pool_pct` jumps wholesale at each hurdle) —
X is pre-promote so a cliff here IS well-defined, unlike §22.5's; it is rejected for the
different reason that it makes the promote discontinuous in exit value, so a $1 move in EV
transfers millions between sponsor and management. A marginal ratchet is the drafting the
tiering language ("*of the amount by which… exceeds*") almost always carries; (b)
**re-basing §10's hurdle onto the sponsor's own realized MOIC** to match §22.5 — that would
silently rewrite a committed v1.1.0 convention (the hurdle tests TOTAL value returned against
TOTAL invested equity) under cover of an unrelated feature. The divergence is deliberate and
is stated in §22.5.

**§22.5 The sweet-equity ratchet — MARGINAL, and why the cliff is REJECTED [DECIDED].**
The market ratchet is contractual on the **institutional investor's own realized return**
("*if the Investor achieves 2.0x, management's ordinary holding increases to X%*"). That
phrasing is what creates the modeling problem, because the institution's realized return
depends on what the ratchet awards management.

Let `I` = the institution's invested equity (the §2 sponsor plug = loan notes + institutional
ordinaries), `V₀` = institutional value already banked before the ordinary split (interim
distributions received, §22.7, plus the loan-note redemption, §22.2), `P` = the ordinary pot
available to the class (post-loan-note, post-promote, post-warrant — §22.7), `s₀` =
`management_ordinary_pct`, and tier j = `{T_j = hurdle_moic_j × I, s_j}`.

**NORMATIVE — the marginal bracket walk.** A tier's share applies to the portion of the pot
allocated while institutional value is STRICTLY ABOVE that tier's threshold:

```
if P ≤ 0:  M ← 0 ; institution_ordinary_share ← P ; V_final ← V₀ + P ; RETURN HERE
           (RETURN, not "skip the loop" [round-8, 3 lenses]: the lines BELOW the loop assign
            `management_ordinary_share` and `institution_ordinary_share` from `M`, `s` and `rem`,
            none of which this branch initialises, and would OVERWRITE the two values just set)
           ↑ §22.7's zero/negative-pot rule. `V_final ← V₀ + P` is NORMATIVE, not a detail
             [round-2 arith-B3: the r2 draft said "STOP", which skipped the two lines below and
             left `ratchet_tiers_reached`, `institution_moic_at_ratchet` and
             `management_effective_ordinary_pct` with NO stated value on a REACHABLE path —
             while §22.10 declares every field REQUIRED and §14.23(d) READS two of them]. The
             REPORTING lines below the loop still run for this branch — the two ASSIGNMENT
             lines do not, which is what `RETURN HERE` means — so the reading is VALUE-REALIZED
             on `V₀ + P` rather than `V₀` [round-10: this gloss previously restated the count in
             MONEY form, which §14.23(d)'s COMPARISON RULE forbids and which the round-9 fix
             removed 24 lines below while leaving it standing here — the SAME defect, one gloss
             over; the count itself is taken per §14.23(d) on `institution_moic_at_ratchet`, and
             the point HERE is only WHICH VALUE feeds it],
             NOT "nothing allocated ⇒ 0": with interim distributions
             banked, V₀ can sit far above a tier while the pot is zero, and the
             nothing-allocated reading would RED §14.23(d) on a coherent deal. **`V₀ + P`,
             NOT `V₀` [round-3 arith-B1 — the r3 draft wrote `V₀`, the THIRD relocation of this
             defect family]: with a year-N distribution outweighing a negative exit residual the
             period-N sponsor flow stays ≥ 0, so the case sits INSIDE §14.23(d)'s new domain, and
             `V₀` overstates the realized position by exactly `|P|` — worked: V₀ = 99, P = −25,
             realized MOIC 0.74 vs `V₀`'s 0.99, which REPORTS TIERS REACHED at hurdles 0.8 and
             0.9 on value that was LOST. The two readings are IDENTICAL at `P = 0`, so round 2's
             motivating case (value banked, pot zero, tier still counted) is untouched.**
V ← V₀ ;  rem ← P ;  M ← 0 ;  s ← s₀
for j = 1..n while rem > 0:
    if V < T_j:
        need ← (T_j − V) / (1 − s)          ← linear: each $1 of pot adds (1 − s) to V
        take ← min(need, rem)
        M ← M + s × take ;  V ← V + (1 − s) × take ;  rem ← rem − take
    s ← s_j
M ← M + s × rem ;  V ← V + (1 − s) × rem            ← the top tier takes the remainder
V_final ← V                                         ← assign EXPLICITLY on the P > 0 path
                                                       [round-8: the count line below READS
                                                        `V_final`, which the walk never set —
                                                        only the P ≤ 0 opener assigned it]
management_ordinary_share = M ;  institution_ordinary_share = P − M
ratchet_tiers_reached      = per §14.23(d), on `institution_moic_at_ratchet` (STRICT)
                             ← NOT a second money-form statement [round-9 F13(3)]: §14.23(d) is
                               the single normative home and its COMPARISON RULE forbids exactly
                               this — a count taken on two float paths. The two agree in exact
                               arithmetic for I > 0 but NOT in float64: a 300,000-draw sweep
                               disagreed on 4.1% of cases, at precisely the tie §22.13(iii)
                               makes normative with a `>` → `≥` mutation test on the count
```

Every step is linear and each `need` is closed-form, so §5's **no-solver rule holds** and the
result is exact — this is the same closed-form-over-a-solver move §3.7 made for the RP trap.
The walk was independently exercised over nine adversarial configurations in the round-1
sign-off (P = 0; V₀ above the top tier; P too small to reach tier 1; s₀ = 0; a tier below V₀
followed by one above; n = 0; V₀ = 0; all tiers cleared; s = 0.99) with `M + institution ≡ P`,
`M/P ∈ [s₀, s_n]` and the tier count agreeing in every one.

**Worked example (normative — reproduce this exactly).** `I = 50`, `V₀ = 100`, `P = 25`,
`s₀ = 0.10`, one tier `{hurdle 2.4 ⇒ T₁ = 120, s₁ = 0.20}`:
`need = (120 − 100)/(1 − 0.10) = 200/9 = 22.2̄`; `take = 22.2̄`;
`M = 0.10 × 200/9 = 20/9`; `V = 120`; `rem = 25 − 200/9 = 25/9`;
then `M += 0.20 × 25/9 = 5/9` ⇒ **`M = 25/9 = 2.7̄`**, `V_final = 100 + 25 − 25/9 = 1100/9 =
122.2̄`, institutional ordinary share `= 25 − 25/9 = 200/9 = 22.2̄`, institutional MOIC
`= 1100/450 = 2.4̄`, `ratchet_tiers_reached = 1`.

**THE EXACT BOUNDARY, pinned with BOTH answers [the §21 lesson: an exact-boundary case is
where conventions diverge].** Take `I = 50`, `V₀ = 100`, `T₁ = 120` (hurdle 2.4), `s₀ = 0.20`,
`s₁ = 0.36`, `P = 25`. Then `need = (120 − 100)/0.8 = 25 = P` exactly: the pot is exhausted at
the instant `V = T₁`.
- **STRICT `>` (NORMATIVE, the §3 sweep-step-down convention verbatim — "a value exactly on a
  threshold takes the LOWER tier"):** `ratchet_tiers_reached = 0`; `M = 0.20 × 25 = 5.0`.
- **Non-strict `≥` (REJECTED):** `ratchet_tiers_reached = 1`; `M = 5.0` — **the same money**,
  because tier 1's share applies only ABOVE T₁ and nothing lies above it.

That the two conventions are **money-inert and differ only in the REPORTED tier count** is
not an accident — it is a property of the marginal rule, and it is the reason the count needs
its own pinned fixture (§22.13(iii)): a mutation from `>` to `≥` moves a DISPLAYED number and
no cash, so no golden can catch it. Under a cliff the same mutation moves millions.

**REJECTED — the cliff on realized institutional MOIC, with a worked counterexample.** Under
a cliff, management's whole share jumps at the threshold. Take `V₀ = 100`, `T = 120`,
`P = 25`, share 20% below the hurdle and 36% at-or-above:
- Suppose the hurdle is NOT met, so `s = 0.20`: the institution takes `0.80 × 25 = 20`, so
  `V = 120 ≥ 120` — the hurdle IS met. Contradiction.
- Suppose the hurdle IS met, so `s = 0.36`: the institution takes `0.64 × 25 = 16`, so
  `V = 116 < 120` — the hurdle is NOT met. Contradiction.

**No fixed point exists.** This is not an edge case to handle: over a whole interval of exit
values the cliff-on-realized-return has no solution at all, and any engine that appeared to
compute one would be reporting an artifact of its iteration order. Rejected on those grounds.
Two repairs were considered and also rejected: **(a) striking the cliff on a PRE-ratchet
institutional MOIC** (well-defined, but then the tested return is a number nobody receives,
and it reintroduces the discontinuity §22.4(a) rejects); **(b) resolving the cliff by
picking the sponsor-favourable branch** — a modeling decision presented as a fact, which is
the class of error §19's own preamble warns against when it refuses to let the engine choose
an economic outcome the user should state [round-1 gov-M9: the first draft cited this as "the
§19-preamble/B7 failure"; §19 round-1 B7 was actually the unwritten §14/§15/§16 integration,
so the specific cite is withdrawn and only the general principle is claimed]. The marginal
rule is adopted because it is simultaneously the closed-form one, the continuous one, and the
one that tests the return actually realized.

**Why §22.4 and §22.5 are struck on DIFFERENT bases — deliberate, not an inconsistency.**
§22.4 tests **pre-promote TOTAL proceeds against TOTAL invested equity**, because that is
§10's committed v1.1.0 convention and this feature does not get to rewrite it in passing.
§22.5 tests the **institution's own realized value against the institution's own investment**,
because that is what a strip's ratchet clause says. The two are the same number only when
management and rollover hold nothing — which is exactly the regime in which §10 was written.
Stating the divergence here is the point; the alternative was one basis silently applied to
both instruments.

**MIRROR (single-source) — the NORMATIVE statement is §14.23(d); this paragraph is RATIONALE
ONLY [round-3 arith-B2 restructured it].** `V_final / I` is, by construction, the institution's
own realized multiple: `I` is the §2 sponsor plug (`returns.sponsor_net`'s outflow) and
`V_final` is the sum of what the sponsor's instruments actually return (interim institutional
shares + the loan-note redemption + the institutional ordinary share, the last of which may be
NEGATIVE — §22.7). So the ratchet's own test and the MOIC the UI headlines must agree, or one
of them is lying. §14.23(d) states that as an invariant WITH its two load-bearing domain
qualifiers and its absolute tolerance floor; neither is repeated here, on purpose.

**WHY THIS PARAGRAPH NO LONGER RESTATES THE RULE — the structural fix for a defect this feature
shipped THREE TIMES [round-3, BOTH reviewers].** §22 stated the same mirror in THREE places
(this paragraph, §22.9(d), §14.23(d)); rounds 2 and 3 corrected one or two and left the others
byte-identical to text that had already been REFUSED — so an implementer reading the normative
section would have built the rejected form (a count-vs-count race on `returns.sponsor_net.moic`,
with no domain and no tolerance floor). Prose kept in step by remembering to update it is the
same failure PHASE_G names for hand-kept lists. **§14.23 is now the SINGLE normative home for
every §22 invariant; §22.5 and §22.9 carry domains, rationale and worked examples and CITE it.
Any divergence is itself a defect, and §14.23 governs.**

**IRR-based ratchets: DEFERRED, with the re-entry path stated.** v1 is MOIC-only, matching
§10's existing basis and DR-2/DR-4's sizing note (~2/3 of plans MOIC-only, Goodwin 2024). The
deferral is not "IRR is impossible": an IRR hurdle `h` is expressible as a MONEY threshold —
the terminal value that produces `h` given the known earlier flows,
`T = I(1+h)^N − Σ_t f_t (1+h)^{N−t}` — so the same bracket walk would apply. It is deferred
because those earlier institutional flows are themselves ratchet-dependent once interim
distributions exist (§22.7), which reopens the fixed point the marginal rule just closed.
v2, DISCLOSED (§22.11).

**§22.6 Warrants / equity kickers [DECIDED].** A warrant is a claim on the ordinary CLASS,
settled at exit under **full dilution with the strike paid in** — the standard treatment, and
the only one that conserves value. With `P₀` = the ordinary pot before exercise, `w` =
`pct_of_ordinary`, `K` = `strike_total`:

```
exercise  ⇔  w × (P₀ + K) > K                       ← STRICT: at-the-money does NOT exercise
if exercised:  warrant_payout_gross = w × (P₀ + K) ;  warrant_payout_net = gross − K
               ordinary pot P = (1 − w) × (P₀ + K)
else:          gross = net = 0 ;  warrant_strike_paid = 0 ;  P = P₀
               (`warrant_strike_paid` stated EXPLICITLY here [round-8, 2 lenses]: §22.10
                declares it REQUIRED and §22.13(vi) mandates two NON-exercise fixtures, so
                leaving it unstated left a required output undefined on a pinned path)
```

**ONE NAME per number [round-1 arith-M12; EXTENDED in round 3 to the management share, which
r2 left with two names — gov-R2-B3/arith-M3].** The warrant net is `warrant_payout_net`
**everywhere**: on `ExitBlock`, on `equity_strip`, and on `ValueBridge.walkdown`.
`warrant_payout_gross` exists only on `equity_strip`. Management's exit share is
`management_ordinary_share` **everywhere** — the `ExitBlock` field carries that name (not
`sweet_equity_management`), and `equity_strip`'s field of the same name is its strip-block
echo. Invariants are asserted on the UNCONDITIONAL `ExitBlock` carriers.

Conservation: `P + warrant_payout_gross = P₀ + K` when exercised, and the class gives up
exactly `P₀ − P = warrant_payout_net` — the warrant's dilution of the existing holders equals
its own value, never more (→ §14.23(c)).

**Worked example (normative).** `P₀ = 100`, `w = 0.05`, `K = 2`: `0.05 × 102 = 5.1 > 2`, so it
exercises; `gross = 5.1`, `net = 3.1`, `P = 0.95 × 102 = 96.9`; the class gave up
`100 − 96.9 = 3.1` ✓.
**Exact boundary, pinned with both answers.** `w = 0.05`, `K = 2` ⇒ at-the-money at
`P₀ = K(1 − w)/w = 38`: `0.05 × 40 = 2 = K`, `net = 0`. **NORMATIVE (strict `>`): does NOT
exercise**, `warrant_exercised = false`, `P = 38`. Under `≥` it exercises and
`P = 0.95 × 40 = 38` — **identical money and THREE differing displayed fields** [round-9 M4, a residual CREATED by the round-9 fix pinning `warrant_strike_paid = 0` on the else branch]: at ATM (P₀ = 38, w = 0.05, K = 2) the `≥` reading gives `warrant_exercised` true, `warrant_strike_paid` 2 and `warrant_payout_gross` 2, against false/0/0 under the normative `>` — two of the three are MONEY. All three are pinned in §22.13(vi) — the §22.5 boundary
pattern again [round-10: the duplicated trailing cite left by the round-9 edit is removed].

**Seniority — the warrant sits BELOW the promote and the loan notes, ABOVE the ordinary
split.** Loan notes are a contractual redemption ahead of all share capital (§22.2); the §10
promote already comes off the top of the equity pot in v1 and stays there, so that byte-
identity is preserved when `warrant` is null. REJECTED: placing the warrant AHEAD of the
promote — it would change the promote's own `min()` cap base and reopen a signed §10
convention for a feature that has no need of it.
**The warrant does NOT dilute interim distributions [round-1 arith-M6 — a convention, so it is
stated].** §22.7's interim block splits institution/management only; the warrant settles once,
at exit. A warrant is an option over share capital, not a distribution right, and an unexercised
option has no claim on a dividend. DISCLOSED in §22.11.

**§22.7 The exit waterfall, assembled — ONE pipeline with null stages.** §9 computes
`exit_equity_pre_mip_total = E` exactly as today; §22 only re-cuts it. The stages are
skipped (identity) when their instrument is null, which is what makes the v1.6.0 path a
special case of this one rather than a branch beside it.

**`E` IS SIGNED AND IS CARRIED SIGNED [round-1 arith-B1 / gov-B4 — the first draft clamped
`pot ← max(0, E) − redeemed`, which made `sponsor_share = 0` where v1 gives `E`, falsifying
§14.23(f)'s byte-identity gate, §14.23(b)'s `[ALL]` mirror and §22.13(v) all at once].**
`exit.ts` computes `E` with no clamp and §10's own `max(0, ·)` cap exists precisely because
`E` can be negative. The clamp appears in exactly ONE place — the redemption amount, which
cannot be negative — and the residual is carried signed:

```
E = exit_equity_pre_mip_total                                             (§9 — UNCHANGED, SIGNED)
1. LOAN NOTES   redeemed = min( LN[N] , max(0, E) )        ; pot ← E − redeemed      ← SIGNED
                (sweet_equity null ⇒ LN[N] = 0, redeemed = 0, pot = E)
2. PROMOTE      mip_payout per §22.4                        ; pot ← pot − mip_payout
                (mip null ⇒ 0; and mip non-null ⇒ sweet_equity null, §22.3(i))
3. WARRANT      per §22.6 on P₀ = pot                       ; pot ← P (the class residual)
                (a negative pot is never in the money: w(P₀+K) > K fails ⇒ no exercise)
4. ORDINARY     sweet_equity NULL (ANY sign of pot) ⇒ today's pari-passu pro-rata
   SPLIT                          sponsor/rollover split on `pot`, verbatim (§9) — which is
                                  ALREADY signed and already splits a negative residual
                                  pro-rata (`exit.ts` multiplies, it does not clamp)
                sweet_equity non-null (ANY sign of pot) ⇒ the §22.5 bracket walk, WHOSE OWN
                                  OPENER handles `P ≤ 0` (management_ordinary_share = 0,
                                  institution_ordinary_share = pot, V_final = V₀ + P, and the
                                  count/MOIC lines still run). The walk is the SINGLE authority
                                  for the strip arm at every sign [round-3 gov-B1: the r3 draft
                                  split this into a `pot ≤ 0` arm here and a `pot > 0` arm that
                                  invoked the walk, which made the walk's own opener UNREACHABLE
                                  and left three REQUIRED outputs undefined — the same defect
                                  relocated for the third time, and §22.13(v)(α) already cited
                                  the opener, so two sections of §22 disagreed]
sponsor_share = institution_ordinary_share + loan_notes_redeemed   ← ON THE STRIP ARM ONLY
                [round-3 arith-M1, CORRECTED round-9 F08: on the `sweet_equity` null ∧ `warrant` null
                 arm there is no `equity_strip` AT ALL and §9 produces `sponsor_share` directly,
                 exactly as it does today. On the WARRANT-ONLY arm (§22.10) `equity_strip` is
                 NON-null — §22.10 and §16 both pin the biconditional `null ⇔ sweet_equity null
                 ∧ warrant null` — and there `institution_ordinary_share` EQUALS `sponsor_share`
                 with `loan_notes_redeemed = 0`, so the identity holds on that arm too; it is
                 scoped to the strip arm because that is where it DISCRIMINATES, not because the
                 block is absent. The earlier flat existence claim would have had an implementer
                 emit `equity_strip: null` on the shape §22.13(vi) commissions a fixture for,
                 dropping the whole REQUIRED warrant disclosure block]
```

**Verified over the signed range, WITH the rollover domain stated** [round-2 blocking, BOTH
reviewers — the r2 draft's `pot ≤ 0` arm was UNQUALIFIED, so it governed the v1 path too and
handed a negative residual entirely to `sponsor_share` where `exit.ts` splits it pari-passu
(at `E = −25`, `f = 0.25`: v1 gives −18.75/−6.25, the r2 rule gave −25.00/0.00). The r2
verification sentence was BLIND to it because every case listed ran `rollover_equity = 0`,
which is also why `sponsor_share ≡ E` was mistaken for the general answer — §17(viii) records
that NO golden runs rollover > 0, so nothing would have caught it]: with all three instruments
null the pipeline reproduces `exit.ts` EXACTLY at `E = 703.83, 0, −0.01, −25` **at both
`rollover_fraction = 0` (`sponsor_share ≡ E`) and `rollover_fraction = 0.25`
(703.83 → 527.8725/175.9575; −25 → −18.75/−6.25)**, and the §14.23(b) five-term mirror closes
in every one. Under an underwater strip (`LN[N] = 500`, rollover 0 by §22.3(ii)) it returns
`sponsor_share ≡ E` at both `E = 200` and `E = −25`, which is what §22.13(v) asserts —
and §22.13(v) now states that rollover-0 domain rather than implying generality.

`sponsor_share` keeps its v1 meaning — *what the sponsor's t=0 check gets back* — which is why
§12 (bridge) and `returns.ts` compose over it structurally unchanged.

**Interim distributions under a strip (§3 step 7 [v1.1.0]).** A §3-step-7 payment is made out
of the SAME priority: it redeems accrued loan-note yield and then principal, and only the
remainder reaches the ordinary class, split at the **BASE** share `s₀`:

```
grown      = LN[t−1] × (1 + loan_note_rate)
redeemed[t]= min( grown, paid[t] )                    ;  LN[t] = grown − redeemed[t]
ords[t]    = paid[t] − redeemed[t]
institution's share of paid[t] = redeemed[t] + (1 − s₀) × ords[t]
management's  share of paid[t] =                 s₀   × ords[t]
```

**THIS REPLACES `sponsorShareOfDistributions` AT ALL THREE COMMITTED CALL SITES — stated
normatively [round-1 arith-B4 / gov-B3; the first draft said §19 "composes unchanged", which
is FALSE].** The pari-passu fraction `sponsor/(sponsor + rollover)` is consumed in three
places: `returns.ts` (the sponsor stream, DPI and payback), `fund.ts` (the §19 LP interim
leg), and `facade.ts` (the §12 `interim_distributions_sponsor` walk-down term). Under
`sweet_equity` non-null, §22.3(ii) forces `rollover_equity = 0`, so that fraction is exactly
**1.0** — every one of the three would credit the sponsor (and hence the LP fund) with
management's `s₀ × ords[t]` slice. That is textually §19.1's own rejected alternative (c)
— crediting the fund with money that is not the sponsor's — so **all three sites must read
the §22.7 institutional share whenever `sweet_equity` is non-null**, and §19.6(a)'s
sponsor-side conservation is re-asserted under a strip by a directed fixture (§22.13(xi)).
**BOTH share rules stay live, and which governs is stated so the engine PR does not ship two
competing definitions of one number [round-2 gov-M6]:** `sponsorShareOfDistributions` (§9
pari-passu) remains THE definition whenever `sweet_equity` is NULL — it is still needed for
`rollover > 0` deals — and the §22.7 institutional split is THE definition whenever
`sweet_equity` is non-null. They are selected by a single predicate at one place
(`sweet_equity == null`), which partitions the space by construction — that tautological
partition, not §22.3(i)/(ii), is what makes them disjoint [round-3 arith-M3: the r3 draft
cited (i) and (ii), which govern promote∧strip and strip∧rollover and are not what separates
the two share rules].

The ratchet is **NOT applied to interim distributions** — it is struck ONCE, at exit, on the
whole realized position. This is §10's committed rule ("*the promote is computed and paid AT
EXIT ONLY… no interim carry, no clawback machinery*") applied to the second instrument, and
it is what keeps §22.5's walk a single closed-form pass instead of a per-period accrual with
a clawback ledger. REJECTED: ratcheting each distribution as it is paid (fund-accounting
machinery §10 already rejected for the promote, with a true-up problem on top). Interim
amounts DO count toward the ratchet's threshold at exit, through `V₀` — the §10 v1.1.0
principle that *the hurdle tests total value RETURNED* — so deferring the strike does not
forgive the value already taken out.

**§22.8 Composition.** **§2:** `management_subscription` is its OWN SOURCE LINE
(`SourcesUses.management_subscription`, §22.10) and enters `total_sources`; the sponsor plug is
the residual after it, so `sources ≡ uses` (§14.1, "always") is preserved BY CONSTRUCTION
[round-1 arith-B2 / gov-B2 — the first draft declared it "a SOURCE that reduces the plug" but
added no field, which would have left `total_sources` short by exactly the subscription and
reddened the committed `toBeCloseTo` assert]. The strip then splits the plug, so there is no
cycle (plug → loan notes / institutional ords is one-directional).
**§3:** unchanged — the strip is invisible to the waterfall except at step 7's split above,
which allocates an already-computed `distribution_paid` and changes no cash.
**§6:** unchanged (§22.2(b) — no deduction).
**§7:** unchanged.
**§8: the equity line becomes `sponsor_equity + rollover_equity + management_subscription`**
[round-1 arith-B3 / gov-B2 — the first draft said "the §8 plug is unaffected" while
`openingBalance.ts` computes `equity = sponsor + rollover`; with the plug falling by the
subscription and no offsetting term, the GOODWILL plug would silently fall by the same amount
and carry forward into every year's balance sheet, with `check` still reading 0 because
goodwill IS the plug — a silent error §14.2 cannot catch]. With the third term added, the §8
plug genuinely is unaffected, which is what the sentence was always meant to claim.
**§11:** unchanged, and this is load-bearing — a strip must NOT move leverage, ICR, FCCR or
DSCR (§22.13(x) proves it by a directed with/without pair).
**§12:** the walk-down gains two leakage terms symmetric with `rollover_delta` —
`sweet_equity_delta` (management's exit share − their subscription) and `warrant_payout_net` —
and `entry_equity_pre_promote_total` now INCLUDES `management_subscription`, which is what
keeps §14.9(a)'s frictionless identity exact (`entry equity total − entry costs ≡ EV₀ − ND₀`
holds only if every equity source is counted; re-derived from §2 in the round-1 sign-off).
**§20.9's coherence roster, §14.16 AND §14.9(b) ARE ALL AMENDED** — §14.16's exit-mirror clause gains the two new claimants and is their single home (§14.23(b) points at it); the engine PR must widen the committed three-term asserts in `tests/engine2-exit-returns.test.ts`, `tests/engine2-facade-scenarios.test.ts`, `lib/engine2/types.ts` and `lib/engine2/exit.ts` alongside it [round-9 M6a]. **§14.9(b) IS AMENDED** to carry the two new terms [round-1 arith-B5 — the first draft leaned
on §14.9(b) in §22.13(ix) without amending it, and the un-amended identity reports a
reconciliation residual of **$28.73m** on the very golden §22.12 pins].
**§13 scenarios:** the strip, the ratchet and the warrant are STRUCTURE/POLICY — FROZEN across
scenarios, and the freezing is AUTOMATIC rather than a new gate: `ScenarioDeltas` admits only
`operations` fields and `exit_multiple`, so no structure field is reachable. What varies by
scenario is whether the tiers are REACHED.
**§18:** loan notes are not refinanceable (not tranches).
**§19:** composes over `sponsor_share` unchanged, but its INTERIM leg does NOT — see §22.7's
three-call-site rule. §19.6(a)'s conservation and §19.6(c)'s byte-identity both survive once
`fund.ts` reads the §22.7 share.
**§9 RETURN-STREAM MEMBERSHIP: the fee/flow table IS AMENDED** (three rows — management
subscription, management's sweet-equity exit share, the warrant net) [round-1 gov-B3 /
arith-M3; PHASE_G Tier A step 1 requires "fee/flow-membership table updates if returns are
touched", and the first draft touched §9 not at all]. The sponsor and unlevered streams are
UNCHANGED in membership. `pre_promote` — the TOTAL pre-incentive equity stream — takes
`management_subscription` into its t=0 outflow, the same generalization §12 makes, and is
byte-identical when the strip is null. **§9's naming paragraph is amended to say so**
[round-1 gov-M8]: on a promote deal the incentive is EXCLUDED from the stream, while on a
strip deal management's sweet share settles INSIDE `exit_equity_pre_mip_total` — the same
label over two bases is exactly the v1.1.2/v1.1.3 mislabel class, so the basis is stated on
the label rather than left to the reader.

**§22.9 Invariants — §14.23 IS THE SINGLE NORMATIVE HOME; this section carries DOMAINS and
RATIONALE ONLY and states no rule of its own.** §22 kept its invariants in two homes; rounds 2
and 3 corrected §14.23 and left §22.9 byte-identical to REFUSED text, and round 4's partial
conversion then filed a correction in the SUBORDINATE copy while the normative one kept a false
claim. **On ANY divergence, §14.23 governs and the divergence is itself a defect.**

**What enforces this, stated accurately [round-7 gov-B1 — the previous wording described a guard
that no longer exists, claimed "no whitelist to maintain", and asserted that was "the only kind
PHASE_G's standing lesson permits", which is the OPPOSITE of PHASE_G: it requires a POSITIVE
ALLOWLIST so the fence fails CLOSED. That stale sentence was the SIXTH instance of the staleness
class, sitting in the section written to end it, and the guard PINNED it in place by asserting
it verbatim].** `tests/governance-spec-single-home.test.ts` enforces three IDENTITY RELATIONS —
the kind a machine holds better than a reader, because the texts sit hundreds of lines apart:
every code span here is an identifier or a filename (a fail-closed ALLOWLIST, so a span may NAME
a thing and never RELATE two); the lettered-clause sets of §14.23 and §22.9 are EQUAL, with each
citation bound to its own clause body; and §15's §22 clause EQUALS the §22.11 block that governs
it, in both directions.

**What it does NOT enforce, said plainly so nobody relies on it:** a rule restated HERE in PROSE
— in words rather than symbols — is not detected, and cannot be, because no text scanner
separates a domain written in prose from a rule written in prose, and this section's domains ARE
prose. Three guard generations each closed one NOTATION and the next round found the complement.
That chase was ended in round 8 on the reviewers' proportionality call: across rounds 5–7 the
guard caught ZERO §22 defects and OCCASIONED THREE. **The conformance review reads §22.9 against
§14.23 clause by clause; that is where meaning is checked, and this section does not pretend
otherwise.**

(a) → **§14.23(a)** — the loan-note accretion walk. Domain: a strip is configured. Rationale:
    the non-negative-balance clause is guaranteed by §22.3(vi)'s BUILD REJECTION rather than by
    hope, and the closed form holds only on the no-distribution path, because §22.7's interim
    redemptions are what make the walk path-dependent. There is no year-0 accretion: the first
    accretion lands in year 1, so a five-year hold compounds five times.
(b) → **§14.23(b)** — the EXTENDED §14.16 mirror. Domain: every run. Rationale: this is
    §14.16's own clause widened from three claimants to five, not a parallel invariant, and it
    holds at every SIGN of exit equity because §22.7 carries the residual signed. §14.23 states
    it on the UNCONDITIONAL `ExitBlock` carriers rather than the nullable `equity_strip` echoes
    [round-2 gov-B3].
(c) → **§14.23(c)** — warrant conservation. Domain: a warrant is configured and exercises.
    Rationale: the warrant's dilution of the existing class equals its own value and never
    exceeds it, which is what makes full-dilution-with-strike-paid-in value-conserving.
(d) → **§14.23(d)** — the §22.5 single-source mirror, together with the definitions of
    `institution_moic_at_ratchet` and `management_effective_ordinary_pct` and the comparison
    rule. Domain: a strip is configured, the sponsor's equity check is strictly positive, and
    the period-N sponsor flow is non-negative. Rationale: the ratchet's own test must agree
    with the MOIC the UI headlines, or one of them is lying. The third condition is
    load-bearing — `returns` sums STRICTLY POSITIVE cashflows, a v1.1.0 convention, so a
    negative period-N flow is silently dropped from the reported multiple; the round-1 clamp
    had been hiding that, and fixing the clamp exposed it. The divergence is DISCLOSED (§9 owns
    the convention; §22.11 and §15 disclose it), never repaired: repairing it would move the
    reported multiple on the v1 path and break §14.23(f).
(e) → **§14.23(e)** — continuity and the share envelope. Domain: a strip is configured and the
    ordinary pot is strictly positive. Rationale: these are the marginal rule's defining
    properties and exactly what the REJECTED cliff violates. The strictly-positive condition
    exists because the effective-share ratio is zero-over-zero at an empty pot, which §22.10's
    own nullable field concedes is reachable.
(f) → **§14.23(f)** — the compatibility gate. Domain: no strip, no warrant, and the promote
    ratchet field either NULL or EMPTY — §22.3 pins the two as distinct values with identical
    semantics, and BOTH produce v1 numbers, so both belong in the domain of the clause that
    asserts v1 numeric identity [round-7 gov-B3]. Rationale: nothing about this is trivial — it is the clause that makes §22 safe to
    land, and its ONE carve-out, the fixture SHAPE of §22.12, is decided spec-side rather than
    discovered as a red test.
(g) → **§14.23(g)** — the loan-notes-unredeemed WARN. Domain: the equity-strip block is
    NON-NULL [round-6, BOTH reviewers: "emitted" reads as "the field exists", which is ALWAYS
    true on `ModelOutput` and would widen a deliberately narrow domain back to every run — the
    exact failure the domain was added to prevent]. Rationale: the flag is named for its CONDITION rather than its consequence so it
    cannot mislabel what it detects, and it reads §22.2's pinned measurement pair — the balance
    grown to exit and BEFORE the exit redemption, against the exit redemption alone.
(h) → **§14.23(h)** — the §22.4 ratchet bounds. Domain: the promote ratchet field is SET,
    INCLUDING when it carries no tiers, AND the total invested equity is strictly positive
    [round-8: at a negative invested equity the tier thresholds invert and the envelope is
    false; clause (d) already carried the equivalent condition] [round-6 gov-B2 — "configured" excluded the empty list,
    but §22.3 makes the empty list a legal non-null value and this clause's own sub-claim (the
    sum equals the §10 single-tier value when the ratchet is empty) is only reachable when it
    is in domain, so the prose was NARROWER than the rule it companions].
    Rationale: every statement is about the UNCAPPED bracket sum, never the paid promote,
    because §10's cap can truncate the payout. §14.23 also carries the CORRECTION to WHY that
    scoping is needed: at a fixed exit equity the cap is a constant, so it does not break
    monotonicity [round-3 arith-M2 / round-4 arith-B2].
(i) → **§14.23(i)** — the explicit NON-CLAIM. Domain: every run. Rationale: §22 asserts no
    ordering between a strip deal's sponsor IRR and the same deal run with a §10 promote; they
    are different instruments, and which is dearer depends on the exit level (§19.6(e) and
    §20.6(f) are the precedents).

**§22.10 Outputs.** `SourcesUses` gains `management_subscription` (Class C, unconditional
`0.0`), entering `total_sources` — §22.8's §2 fix. `ExitBlock` gains `management_ordinary_share`
and `warrant_payout_net`, emitted UNCONDITIONALLY (`0.0` when off) — the G-1/G-5 committed-zero-
column precedent, which `tests/goldens.test.ts` already asserts for the refi fields on all nine
pre-v1.3.0 goldens. **`SourcesUses.management_subscription` is emitted the same way, and that IS
a new emitter behaviour, decided here rather than discovered** [round-2 gov-M1]: `spec_calc.py`
currently OMITS `rollover_equity` from `sources_uses`, so the reference's existing habit for a
zero-valued S&U scalar is to drop it. §22 follows the ExitBlock/G-1/G-5 precedent (emit the zero
column). **The reason is the PRECEDENT, not a discriminator** [round-3 arith-M6: the r3 draft
justified it as "read by an invariant (§14.1's `total_sources` identity)", but `rollover_equity`
is read by that SAME identity and IS omitted — the stated discriminator does not discriminate];
the decision stands on the G-1/G-5 committed-zero-column convention alone. The
pre-existing `rollover_equity` omission is a reference-emitter gap, NOT a convention to copy,
and is left alone rather than fixed under cover of this feature. `ModelOutput` gains
`equity_strip: EquityStripBlock | null` (null ⇔ `sweet_equity` null ∧ `warrant` null),
**emitted in fixtures only when non-null — the `ModelOutput.fund` precedent verbatim**
[round-1 gov-M2: only `G7FUND/expected.json` carries a `fund` key; the first draft instead
required all twelve goldens to gain `equity_strip: null`, a NEW convention presented as a
continuation]: `{ loan_notes_subscribed, loan_notes_accrued_balance, loan_notes_redeemed,
ordinary_pot_pre_warrant, warrant_exercised: boolean, warrant_strike_paid,
warrant_payout_gross, warrant_payout_net, ordinary_pot, management_ordinary_share,
institution_ordinary_share, ratchet_tiers_reached, management_effective_ordinary_pct:
number | null, institution_moic_at_ratchet: number | null }` — named fields the display
surface READS, never recomputes (**§14.16's single-source rule** and PHASE_G's standing
"no second calculation path" rule [round-1 gov-B5: the first draft cited "§16's single-path
rule", and §16 contains no such rule — only the unrelated single-DRIVER entry gate]).
**The WARRANT-ONLY shape is pinned** [round-1 arith-M4]: with `warrant` non-null ∧
`sweet_equity` null, `loan_notes_*` are `0`, `management_ordinary_share` is `0`,
`institution_ordinary_share` is the post-warrant pot LESS the rollover share — the §9
pari-passu split governs at EVERY sign of the pot, per §22.7 stage 4's first arm, with which
this is now consistent [round-2 arith-B1 noted the r2 draft contradicted itself here] —
`ratchet_tiers_reached` is `0`, and both `| null` fields are `null`: there is no strip to
measure. `management_effective_ordinary_pct` is likewise `null` for a ZERO **or NEGATIVE**
ordinary pot [round-2 arith-M5 — the r2 draft named only the zero case, and the signed
pipeline makes a negative pot reachable].
**The MIRROR-IMAGE shape is pinned too [round-4 arith-M4 — the r4 draft wrote out the harder
direction and left the obvious one unstated, which is how "obvious" defaults become divergent
implementations]:** with `sweet_equity` non-null ∧ `warrant` NULL, `ordinary_pot_pre_warrant`
equals `ordinary_pot`, `warrant_exercised = false`, and
`warrant_strike_paid = warrant_payout_gross = warrant_payout_net = 0`.
`ValueBridge.walkdown` gains `sweet_equity_delta` and `warrant_payout_net`.
`CoherenceFlag.code` gains `loan_notes_unredeemed`. All Class C. Every field is
REQUIRED-with-null, never optional — a dropped field must be a compile error, not a silent
`undefined`.

**§22.11 Disclosure — THE SOURCE OF THE §15 ROW.** The block below is §15's §22 clause,
verbatim and in full. **§15 is GENERATED from it; on any divergence THIS paragraph governs, and
`tests/governance-spec-single-home.test.ts` fails in BOTH directions** — §15 missing governed
text, or §15 carrying §22 disclosure this block does not [round-5, BOTH reviewers: the r5 guard
marked THREE sentences (18% of §15's clause) and checked one direction only, so §15 could gain a
contradicting sentence, or gain §22 content absent here — which is round-4's own defect
inverted — and stay green. The whole clause is now governed, both ways].

<!--§15-BOUND-->sweet equity, ratchets and warrants [v1.7.0 — §22] model the institutional loan notes as EQUITY — outside §11 leverage/ICR/FCCR/DSCR, outside the §3 waterfall and the §9 debt payoff, and with NO interest deduction (jurisdiction-specific — UK CTA 2009 Part 5, hybrid-mismatch, US §385 — so v1 claims none, which is NEVER ANTI-CONSERVATIVE: neutral only where §163(j) binds in EVERY year so the disallowance is never released (G3's shape), lower-return elsewhere), accruing only, never cash-pay, with NO year-0 accretion; ratchets are MARGINAL top-slice step functions on MOIC struck at EXIT ONLY, never cliffs (a cliff on a REALIZED-return hurdle has NO SOLUTION OVER AN INTERVAL OF EXIT VALUES — §22.5 carries the worked counterexample), with a value exactly ON a tier threshold taking the LOWER tier (strict >, the §3 sweep-grid convention) and IRR-based ratchets deferred to v2; the §10 promote ratchet and the sweet-equity ratchet are struck on DELIBERATELY DIFFERENT bases (total pre-promote proceeds vs the institution's own realized value — §22.5); the strip, the ratchet and the warrant are FROZEN across scenarios; MANAGEMENT'S SUBSCRIPTION REDUCES THE SPONSOR'S OWN CHEQUE (a §2 source line — material to every sponsor return number on the page); a promote and a strip may NOT coexist (DR-2's double-count, an input-gate rejection) and a strip may not coexist with a rollover in v1 (the strip/sweet allocation of a rollover is negotiated, with no defensible default — §22.3(ii)); when exit equity does not cover the accreted loan notes the ordinary pot is zero, management's sweet equity is worthless and the `loan_notes_unredeemed` WARN fires, and when exit equity is NEGATIVE the ordinary pot is likewise NEGATIVE (not zero) and the whole shortfall stays with the pre-existing §9 claimants (management's ords cannot go negative) — and whenever the FINAL SPONSOR FLOW is negative — which is the true trigger, NOT a negative exit equity, since a year-N distribution can outweigh a negative exit residual and leave the flow positive — the HEADLINE sponsor MOIC exceeds the realized one, because `returns` has summed POSITIVE inflows only since v1.1.0 and a negative final flow does not reduce it (a pre-existing convention §22 surfaces rather than introduces; the §22.5 ratchet is struck on the REALIZED figure, never the headline — §14.23(d)); AT MOST ONE warrant, rationally exercised on full dilution with the strike paid in, NOT exercised exactly at-the-money, diluting a ROLLOVER holder pro-rata exactly as it dilutes the sponsor, NOT participating in interim distributions (an option is not a distribution right), and its association with a mezzanine TRANCHE is a LABEL ONLY — no arithmetic depends on it; management's subscription price and their ordinary % are INDEPENDENT inputs, so the model never checks that the terms are actually sweet)<!--/§15-BOUND-->

RATIONALE AND ROUND HISTORY (not part of the §15 row, and deliberately outside the markers so
the generated text stays clean): the loan-note EQUITY treatment and its rejected alternatives
are §22.2; the marginal-vs-cliff argument and its no-fixed-point counterexample are §22.5; the
warrant's seniority and at-the-money convention are §22.6; the negative-exit-equity rule is
§22.7 stage 4; the headline-vs-realized MOIC divergence is a property of `returns` whose
NORMATIVE OWNER is §9's naming paragraph — this block and §15 disclose it, §9 owns it [round-4
gov-M5]. The three statutory anchors inside the block were added in round 4 [gov-M2] precisely
because §15 carried them and this source did not, so generating §15 from here would have
DELETED them; they are now inside the governed text and cannot be lost.

**§22.12 Golden plan — TWO goldens, because §22 changes THREE numbers on TWO mutually
exclusive instruments** [round-1 gov-B7: the first draft's single golden set `mip: null`,
leaving §22.4 — the half of backlog #8 literally named "MIP ratchets" — with no workbook
adjudication at all].

**G9-SWEET** = **G3's facts and structure with `mip: null`** and the strip added, so G3's
mezzanine-shaped `pik_note` is the warrant's narrative home (demonstrating §22.11's "label
only" claim rather than asserting it in the abstract):
`sweet_equity = { sponsor_ordinary_pct: 0.10, loan_note_rate: 0.08, management_subscription:
2.0, management_ordinary_pct: 0.10, ratchet: [{hurdle_moic: 1.5, share_pct: 0.15},
{hurdle_moic: 2.0, share_pct: 0.20}] }`, `warrant = { holder_label: 'Mezzanine warrant',
pct_of_ordinary: 0.05, strike_total: 2.0 }`, `mip: null`; everything else IDENTICAL to G3.
**TWO deltas from G3, not one** [round-1 gov-M11]: the strip, and `mip` dropped to null —
the latter FORCED by §22.3(i), so it is named rather than glossed as "§22 alone".

Closed-form check values pinned here (exact from the inputs; the rest of the chain is
ADJUDICATED during workbook construction, never assumed — the §20.9 rule):
- G3's §2 uses = 765 + 15.3 + 6.075 + 2.70 + 8.0 = **797.075**; debt at par 405; rollover 0.
  G9-SWEET's sponsor plug = 797.075 − 405 − **2.0** = **390.075**, and `total_sources`
  = 405 + 0 + 2.0 + 390.075 = **797.075 ≡ total_uses** (§14.1 by construction — §22.10's
  source line is what makes this true).
- Loan notes subscribed = 0.90 × 390.075 = **351.0675**; institutional ordinaries = 0.10 ×
  390.075 = **39.0075**.
- No interim distributions ⇒ `LN[5] = 351.0675 × 1.08⁵ = 351.0675 × 1.4693280768 =
  **515.833334601984**` (§22.9(a) closed form).
- Ratchet thresholds, exact from the inputs: `T₁ = 1.50 × 390.075 = **585.1125**`,
  `T₂ = 2.00 × 390.075 = **780.15**`.
- **`exit_equity_pre_mip_total` is IDENTICAL to G3's committed value** (2dp fixture: 703.83;
  the workbook carries full precision). The plug is a §2 residual and the strip re-cuts the
  equity pot without changing its SIZE — traced in the round-1 sign-off and re-stated
  precisely in round 3 [round-2 gov-M5 — `facade.ts:44` DOES pass the plug into the exit block
  as `invested_equity_total`, so "exitFromCore reads operating/debt/cash only" over-claimed].
  The plug reaches exit ONLY through the §10 hurdle base, and G9-SWEET runs `mip: null`, so no
  path from the plug to `E` is live. That is the reason to state, and it is also why
  G10-RATCHET — which keeps `mip` non-null and does NOT change the plug — is the golden that
  exercises the hurdle base. This is the assert that discriminates §22 from any
  implementation leaking the strip into the operating, debt or §9 path.
- Management's sweetness: they pay 2.0 for a base 10% of a class whose institutional half cost
  39.0075 — a pro-rata share of 2.0/41.0075 = 4.8772%, so the base share is ~2.0504× their
  money.
- Asserts: the warrant is IN THE MONEY and exercises; the loan notes redeem IN FULL (no
  `loan_notes_unredeemed`); **`ratchet_tiers_reached = 1`** — tier 1 crossed, tier 2 NOT
  (reaching T₂ needs ~306 of ordinary pot against ~180 available); §14.23(b)'s five-term mirror
  closes; §14.23(d)'s mirror to `returns.sponsor_net.moic` agrees.
  **G9-SWEET does NOT exercise the walk's trailing `M ← M + s_n × rem` line** [round-1 gov-B7 /
  arith-M2 — the first draft claimed a "top-tier remainder", which is FALSE: the pot is
  exhausted INSIDE tier 2's `if` branch, so `rem = 0` when the trailing line runs and a mutant
  DELETING that line passes this golden]. G10-RATCHET below exercises the equivalent top-bracket
  branch on the §22.4 side, and §22.13(xii) pins the §22.5 side directly.

**G10-RATCHET** = **every field of G3 unchanged**, with `mip` gaining tiers:
`mip = { pool_pct: 0.15, hurdle_moic: 1.5, ratchet: [{hurdle_moic: 1.75, share_pct: 0.25}] }`;
`sweet_equity: null`, `warrant: null`. Holding G3 otherwise constant is the point — every
difference is attributable to §22.4 alone, and the entry S&U is byte-identical to G3's
(a promote is post-close and cannot re-price entry — the §13 entry-frozen discipline; the
identity holds AFTER G3's own fixture gains the `sources_uses.management_subscription: 0.0`
column — an unqualified byte-identity claim across a shape change is exactly what §16's
round-2 blocker was about [round-2 arith-M8]).
Closed-form check values, exact from the inputs: `T₀ = 1.50 × 392.075 = **588.1125**`,
`T₁ = 1.75 × 392.075 = **686.13125**`. Against G3's committed pre-MIP total X (DERIVATION
records the single-tier promote as **17.358111**, which the bracket form reproduces EXACTLY at
one tier — the §22.4 ≡ §10 identity, verified numerically in the round-1 sign-off), the
two-tier promote is **≈19.128310**, a discriminating delta of **≈1.770199** on a top-bracket
slice of **≈17.701988** that is genuinely CONSUMED. **The seed is named** [round-2 arith-M7]:
these follow from `X ≈ 703.833238`, the pre-MIP total DERIVATION.md records at full precision
(not the 2dp fixture); `dPromote/dX = 0.25`, so the 6-dp seed is safe to ~1e-7. Asserts: the
promote is strictly greater than G3's; the top bracket is non-empty, so the `min(X, T_{j+1})`
term is exercised and TWO distinct mutants are discriminated — dropping the ratchet reads
**17.358111**, and applying `s_n` to the WHOLE excess reads **28.9301845**
exactly — pinned UNROUNDED [round-3 arith-M4: the 6-dp form is an exact decimal tie, half-up
28.930185 vs half-even 28.930184, and §21 round 4 requires a stated mutant value to be
reproducible under the reader's own rounding] [round-2, BOTH
reviewers: the r2 draft named the second mutant and priced the first, and §21 round 4
established that a stated mutant value must be reproducible]; `ratchet` tiers are
frozen across scenarios; entry S&U byte-identical to G3.

**FIXTURE-SHAPE CHANGE — decided HERE, spec-side, never discovered as a red test (the
§20.9 / v1.1.1-round-2 convention).** Two `ExitBlock` fields and one `SourcesUses` field are
emitted unconditionally, so **each of the 12 committed §17 golden `expected.json` files**
(G1, G2, G2D, G2DIST, G2DISTD, G3, G3DIST, G4, G5, G6REFI, G7FUND, G8PIKT) gains exactly
THREE keys — `exit.management_ordinary_share: 0.0`, `exit.warrant_payout_net: 0.0`,
`sources_uses.management_subscription: 0.0` — with **zero VALUE movement**. `equity_strip` is
OMITTED when null (the `fund` precedent), so no golden gains it. Every `schedule.csv` is
byte-UNCHANGED (per-year rows only, no exit block), and `tests/goldens/g2ltm/**` are §1.1
stitch DATA fixtures with no engine output and are untouched. The regeneration must be
MEASURED leaf-by-leaf (added keys only; no pre-existing leaf moves) and that measurement
recorded in `DERIVATION.md`, exactly as the v1.0.3 correction's bounds were.

**COHERENCE — the enumeration, corrected** [round-1 gov-B1: the first draft claimed
"G9-SWEET emits ZERO flags", which is FALSE on its own inputs]. G9-SWEET and G10-RATCHET both
inherit G3's fixed accreting `pik_note` (maturity 8 > 5, `pik_coupon` 0.12, `elections: null`),
which is the §20.6(e) AHYDO shape, so **each emits EXACTLY ONE `ahydo_shape` WARN and nothing
else** — joining G3, G3-DIST and G8-PIKT in the §20.9 roster rather than contradicting it.
**No golden emits `loan_notes_unredeemed`** (only G9-SWEET configures a strip, and its notes
redeem in full). Any other coherence delta on any golden stays a red test.
Reference: `scripts/goldens/spec_calc.py` gains the §2 source line, the strip/ratchet/warrant
walk and the §22.4 bracket sum in ITS OWN §2/§9/§10 blocks — no engine reuse (the independence
rule). Adjudication: the standard two independent blind passes.

**§22.13 Golden-uncovered by design** (directed fixtures, each mutation-tested):
(i) **`mip.ratchet: []` ≡ `mip.ratchet: null` ≡ v1 §10** [round-9 M3 — "with ONE tier" was AMBIGUOUS and false under one reading: an array of LENGTH 1 does NOT reproduce §10 (19.1283095 vs 17.3581107 on G10-RATCHET's own inputs), while "one BRACKET" made the named mutant vacuous since s_n ≡ s₀. A length-1 ratchet whose tier is UNREACHED (X ≤ T₁) is a third admissible construction and is KEPT] on an otherwise-identical deal (the identity
G10-RATCHET's base leg relies on). **The whole-excess mutant is VACUOUS on an EMPTY ratchet** — with no tiers
`s_n` IS `s₀`, so normative and mutant BOTH read 17.3581107 — so it is pinned on
**G10-RATCHET at 28.9301845** (§22.12) instead [round-10: the round-9 M3 fix NAMED this hazard
and then adopted the reading that triggers it, leaving the mutant clause attached to a
configuration on which it cannot RED];
(ii) the **§22.4 exit-equity CAP** binding on a ratcheted promote — §17(iv) already records
that dropping §10's `min()` leaves G3-DIST byte-identical, and the multi-tier form does not
change that, so the cap needs its own fixture or it is untested;
(iii) **the §22.5 EXACT TIER BOUNDARY** — the `I = 50, V₀ = 100, T₁ = 120, s₀ = 0.20,
s₁ = 0.36, P = 25` case: `ratchet_tiers_reached = 0` and `M = 5.0`. The `>` → `≥` mutant must
RED on the COUNT while the money is unchanged (no golden can catch it — §22.5);
(iv) **the cliff counterexample as a NEGATIVE test** — the §22.5 no-fixed-point inputs asserted
to produce the marginal answer, pinning that no cliff branch was smuggled in;
(v) **`loan_notes_unredeemed`**: fires when `E < LN[N]`; does NOT fire when the shortfall is
within `$0.005m` (the §22.9(g) tolerance band — §22.13(v) and §22.9(g) now agree, where the
first draft's looser "`E < LN[N]`" did not [round-1 arith-M11]); and the **NEGATIVE-E** cases, BOTH
arms of §22.7 stage 4 [round-2, BOTH reviewers]: (α) `sweet_equity` non-null, rollover 0 by
§22.3(ii), **and NO interim distributions so that V₀ = 0** [round-10: the round-9 assert below is
FALSE without this premise — at V₀ = 99, E = −25, I = 100 the normative value is 0.74, not −0.25
— and the premise sat only inside a rationale bracket, which this document's own convention
treats as non-normative] ⇒ `sponsor_share ≡ E`, `management_ordinary_share = 0`, `ratchet_tiers_reached` per
§14.23(d), **and — the assert that actually discriminates — `institution_moic_at_ratchet = E / I`,
which is strictly NEGATIVE here (−0.25 at §14.23(d)'s own I = 100, E = −25); the `V_final ← V₀`
mutant reads 0.00 and MUST RED** [round-9 F05: the prescribed configuration was never blind, the
ASSERT SET was — with E < 0 and no interim distributions, V₀ = 0 and every `T_j > 0`, so the
normative count and the mutant's count are BOTH 0 and the other three asserts are structurally
independent of `V_final`; this fixture was the ONLY coverage of §22.5's `P ≤ 0` opener and could
not see the round-3 correction it exists to pin], mirror closes; and (β) **`sweet_equity` NULL
with `rollover_equity > 0`** ⇒ the §9 pari-passu split of the NEGATIVE residual, byte-identical
to v1.6.0 (at `E = −25`, `f = 0.25`: −18.75 / −6.25). Arm (β) is the configuration no golden
runs (§17(viii)) and the one both the r1 clamp and the r2 unqualified arm got wrong — the
mirror closes under the **r2** form and FAILS under the r1 clamp (with `sweet_equity` NULL the
clamp gives pot 0 ⇒ 0/0 ⇒ the five-term sum reads 0 ≠ E; §22.7 says so itself) [round-9 M8], so only a direct assert on `rollover_share` catches it;
(vi) **the warrant AT-THE-MONEY boundary** — `P₀ = K(1 − w)/w` ⇒ `warrant_exercised = false`,
`warrant_strike_paid = 0` AND `warrant_payout_gross = 0`; the `≥` mutant reads true / 2 / 2 and
must RED on ALL THREE [round-10: the round-9 M4 fix restated §22.6 but never touched THIS
clause, so the corrected phrase "identical money" simply RELOCATED here — the ALLOCATIONS
(`ordinary_pot` 38, `warrant_payout_net` 0) are indeed identical either way, but two MONEY
fields are not]; plus an OUT-of-the-money warrant, a
zero-strike (penny) warrant, and the **WARRANT-ONLY shape** of §22.10 (warrant non-null,
sweet_equity null, with a ROLLOVER present so the pari-passu dilution is exercised);
(vii) **the strip WITH interim distributions** — §22.7's per-year loan-note redemption and
base-share ordinary split, including a year where a distribution EXCEEDS the grown loan-note
balance (the split actually splits) and a year where it does not (all of it redeems notes);
this is also the only path on which `returns.dpi` and `payback_year` read a NON-constant
sponsor fraction, so the §9 [v1.1.0] DPI basis is exercised under a strip. **The reference
derivation's FIXTURE-ONLY `distributions.sponsor_share_paid` block (§16) must emit the §22.7
institutional share here, not the pari-passu one** [round-3 arith-M7] — not a fourth engine call
site (§16 pins it as adjudication convenience, never a ModelOutput surface), but an unstated
emitter would adjudicate the wrong number; moot for both goldens, which run no distributions;
(viii) **the SEVEN §22.3 REJECTIONS**, one case each — promote ∧ strip; strip ∧ rollover > 0;
a domain violation (incl. `hurdle_moic ≤ 0`); a non-ascending / decreasing-share /
`share_pct = 1` tier; an out-of-domain warrant; a subscription that would drive the plug ≤ 0;
and a paid-for zero ordinary share;
(ix) **§12's extended walk-down** — `sweet_equity_delta` and `warrant_payout_net`, and the
AMENDED §14.9(b) reconciling to the sponsor-net TOTAL delta under a strip. No golden carries a
`bridge` block (the reference derivation emits none — §17(x)), so this identity is
fixture-only by construction; the fixture must FAIL against the un-amended identity (which
reads a ≈$28.73m residual on G9-SWEET's shape);
(x) **§11 NON-contamination** — a directed pair proving a strip moves NO credit metric: the
same deal with and without `sweet_equity` has byte-identical `credit`, `tranches`, `waterfall`
and `tax` blocks, and an identical §8 `goodwill` (the §22.8 fix's own regression test — a
mutant omitting `management_subscription` from `openingBalance`'s equity line must RED);
(xi) **§19.6(a) UNDER A STRIP** — the fund overlay's LP interim leg reads the §22.7
institutional share, not the pari-passu 1.0; a mutant reverting `fund.ts` to
`sponsorShareOfDistributions` must RED. Same for `facade.ts`'s `interim_distributions_sponsor`,
whose error is INVISIBLE in `reconciliation_residual` (it cancels) and therefore needs a
direct assert on the walk-down term itself;
(xii) **the §22.5 walk's TOP-TIER REMAINDER branch** — a case where the pot survives every
tier so the trailing `M ← M + s_n × rem` line runs with `rem > 0`; the delete-the-line mutant
passes G9-SWEET and must RED here.

---

## Changelog

| Ver | Date | Change | Basis |
|---|---|---|---|
| v1.7.0 | 2026-08-09 | **PHASE-5 FEATURE AMENDMENT (spec-first; NO engine/UI code in this version) — sweet equity + MIP ratchets + mezzanine warrants (backlog #8, with the DR-4 equity-kicker item pulled in at owner scope decision 2026-08-09). TIER A.** §22 added: the UK/European management STRIP as a real instrument (institutional loan notes + ordinaries, loan notes modeled as EQUITY — no leverage, no waterfall, no §9 payoff, NO interest deduction), MARGINAL (top-slice) MOIC ratchets on BOTH the §10 promote (§22.4 — a strict generalization: one tier ≡ §10 verbatim) and the sweet-equity ordinary split (§22.5, a closed-form bracket walk that preserves §5's no-solver rule), and a SINGULAR warrant / equity kicker settled on full dilution with the strike paid in (§22.6). The CLIFF ratchet on a realized-return hurdle is REJECTED with a worked no-fixed-point counterexample; the promote/strip blend DR-2 flagged as a double-count is now an INPUT-GATE REJECTION rather than a forward reference. Both exact-boundary conventions (tier threshold; at-the-money warrant) are pinned WITH BOTH ANSWERS and are money-inert — they move only a DISPLAYED value, so §22.13(iii)/(vi) fixtures carry them because no golden can. §14.23 invariants (incl. the EXTENDED §14.16 five-term mirror and the ratchet↔`sponsor_net.moic` single-source mirror), §15 disclosure row, §16 schema (3 additive Class-B blocks, 2 required `ExitBlock` fields, `ModelOutput.equity_strip`, 2 walkdown terms, 1 coherence code, plus `SourcesUses.management_subscription` and the §8 equity line), the §9 fee/flow membership table (3 rows) and §14.9(b) both AMENDED, and the §22.12 golden plan — **TWO** goldens, **G9-SWEET** (G3 with `mip: null` + the strip) and **G10-RATCHET** (G3 + `mip.ratchet`), because the strip and the promote are mutually exclusive by §22.3(i) so one golden cannot adjudicate both; the FIXTURE-SHAPE change to all 12 committed goldens (exactly 3 added zero keys each; `equity_strip` OMITTED when null per the `fund` precedent) decided HERE, spec-side, with zero value movement to be MEASURED leaf-by-leaf. **Round 1 REFUSED by TWO independent reviewers (arithmetic lens + governance lens), 11 blocking in union, ALL applied in r2:** (1) "G9-SWEET emits ZERO flags" FALSE — it inherits G3's maturity-8 accreting `pik_note`, i.e. §20.6(e)'s AHYDO shape, with `check.ts` and the committed enumeration as counterexamples (the v1.5.0 round-1 B1 defect repeating); (2) `management_subscription` declared a §2 SOURCE with NO `SourcesUses` field ⇒ `total_sources` short by exactly the subscription ⇒ §14.1 "always" breaks; (3) "the §8 plug is unaffected" FALSE against `openingBalance.ts` (`equity = sponsor + rollover`) ⇒ goodwill silently falls by the subscription and carries into every year, invisible to §14.2 because goodwill IS the plug; (4) "§19 composes unchanged" FALSE — `sponsorShareOfDistributions` has THREE committed call sites (`returns.ts`, `fund.ts`, `facade.ts`) and under a strip §22.3(ii) forces rollover 0 ⇒ fraction 1.0 ⇒ the LP fund credited with management's slice, textually §19.1's own rejected alternative (c); (5) §22.7's `max(0, E)` clamp made `sponsor_share = 0` where v1 gives `E`, falsifying §14.23(f)'s byte-identity gate, §14.23(b)'s `[ALL]` domain and §22.13(v) simultaneously — the residual is now carried SIGNED and the v1 identity verified at E = 703.83/0/−0.01/−25; (6) "§16's single-path rule" DANGLING (§16 has only a single-DRIVER entry rule) — the third consecutive amendment to ship a dangling cite; (7) three over-broad §14.23 domains ((d) at a non-positive plug where `moic` is null, (e) at `P = 0` where `M/P` is 0/0, (g) with no domain at all) — the §20 round-1 B2 defect repeating; (8) §22.4 — the half of #8 literally named "MIP ratchets" — had ZERO golden coverage and NO §14 invariant, and §22.12's "top-tier remainder" assert was FALSE (the pot is exhausted inside the tier's `if` branch, so a mutant deleting the trailing line passes); (9) §14.9(b) NOT amended though §22.13(ix) leaned on it — un-amended it reports a ≈$28.73m residual on G9-SWEET; (10) §16's "null ≡ OFF ≡ byte-identity" shorthand FALSE against §22.10's unconditional emission; (11) the §9 fee/flow membership table un-amended though PHASE_G Tier A step 1 requires it when returns are touched. 23 minors also applied (incl. the code home pinned to EXISTING fenced modules so neither containment list needs extending — PHASE_G's named recurring failure avoided rather than repeated; `hurdle_moic > 0`; two Build rejections added; "conservative" softened to "never anti-conservative" because the effect is NEUTRAL where §163(j) binds; one name for the warrant net; the header left at v1.6.0 until GRANT per the 01f0ec8 convention). Both reviewers independently REPRODUCED every §22 worked example and every §22.12 pinned value in exact rationals (incl. `LN[5] = 515.833334601984` and the §22.4 ≡ §10 identity over 18 numeric cases), and confirmed no number was seeded from a rounded display — the v1.0.3 defect is NOT repeated. **ROUND 3 REFUSED by both, 5 blocking in union, ALL applied in r4:** (1) the r3 `V_final ← V₀` rule on the zero/negative-pot arm reported TIERS REACHED on value subsequently LOST — worked counterexample V₀ = 99, P = −25, period-N sponsor flow 74 ≥ 0 so squarely INSIDE §14.23(d)'s own new domain, realized MOIC 0.74 against `V₀`'s 0.99, crossing legal hurdles of 0.8 and 0.9; corrected to `V₀ + P`, which is IDENTICAL at P = 0 so round 2's motivating case is untouched; (2) the r3 stage-4 split invoked the §22.5 walk only at `pot > 0`, making the walk's own `P ≤ 0` opener UNREACHABLE — three REQUIRED outputs undefined again, and §22.13(v)(α) already cited that opener, so two sections of §22 disagreed; the walk is now the SINGLE authority for the strip arm at every sign; (3) §22.9(d)/(h) were byte-identical to the text both reviewers REFUSED while §14.23 carried the corrections and this column claimed them applied; (4) §22.5's MIRROR block was byte-identical to r2 and its normative sentence to the r1 REFUTED draft — an implementer reading the normative section would have built the rejected count-vs-count form; (5) §22.11 had LOST the headline-vs-realized disclosure §15 carried, inverting round 2's staleness, so regenerating §15 from §22.11 would have silently DELETED a refused finding's disposition. **The structural cause was named and fixed rather than re-synced a fourth time:** §14.23 is the SINGLE normative home for §22's invariants and §22.11 the single home for its §15 row; §22.5/§22.9 cite rather than restate; divergence is a defect with the normative home governing. 12 further minors applied (the MIP-promote membership row corrected to "excluded as a LINE" for the same double-count reason as the warrant; the G10 mutant pinned UNROUNDED at 28.9301845 because the 6-dp form is an exact half-even/half-up tie; §22.9(h)'s monotonicity JUSTIFICATION corrected — at fixed E the cap does not break monotonicity, measured over 3,000 X values, and the scoping to `promote_uncapped` is right for a different reason; the §22.10 emission "discriminator" withdrawn since `rollover_equity` is read by the same identity and IS omitted; the MOIC-divergence disclosure moved to §9 where it belongs, since it applies to every negative-exit deal, strip or not). **ROUND 4 REFUSED by both, 5 blocking in union, ALL applied in r5:** (1) the §22.5 annotation still DEFINED the value-realized count as `#{ j : V₀ > T_j }` — the rule round 3 refused — four lines below the corrected `V_final ← V₀ + P`, giving 2 tiers where the normative line gives 0 on the block's OWN counterexample; (2) round 3's monotonicity correction sat in §22.9(h) while §14.23(h) kept "the cap breaks monotonicity in X", which is FALSE (at fixed `E` the cap is a constant and `min` of two non-decreasing functions is non-decreasing — measured twice independently, 0 non-monotone steps over 3,000 X values), so round 4's own precedence rule promoted the false claim over its correction; (3) deleting the COMPARISON RULE paragraph removed the ONLY text binding `institution_moic_at_ratchet` to the walk's `V_final`, leaving a REQUIRED output with no normative definition and §14.23(d) citing a rule that no longer existed — the FOURTH dangling cite in this project (§14.13, §16's single-path and §21.11 precede it); (4)+(5) the single-home conversion had covered 2 of §22.9's 9 clauses — the two that had already failed — while the header and changelog described the section as converted: the instance fixed, the generator left. **THE STRUCTURAL RESPONSE, and why this round differs from r2/r3/r4:** all nine clauses now cite, the deleted definitions are restored INTO the normative home, and the rule is no longer a promise — `tests/governance-spec-single-home.test.ts` (committed; +3 tests, suite 686→689) fails if §22.9 states any formula, if a §14.23(23) clause letter lacks a §22.9 citation, or if §15 drifts from the marker-delimited sentences §22.11 governs. Three mutants were run RED and reverted by string-replace with count==1 asserted; the third reproduces the EXACT round-3 defect (§15 reverting to "the conservative direction") and the guard catches it — PHASE_G's standing lesson, that a gate maintained by remembering already has a hole, applied to the spec's own prose. 4 minors also applied (§14.23(d)'s first-qualifier reason WITHDRAWN as false against the §22.3(vi) Build rejection added in r2; the strip-only warrant shape pinned as the mirror image of the warrant-only shape; the MOIC-divergence convention given §9 as its single OWNER with §22.11/§15 disclosing; the three statutory anchors added to §22.11 so generating §15 cannot delete them). **ROUND 5 REFUSED by both, 3 blocking in union, EVERY ONE IN THE GUARD — the artifact the r5 changelog sold as "the rule is no longer a promise":** (1) it keyed on the single character `≡`, which only 3 of §14.23's 9 clauses use, so mutants restating (a), (e), (g) and (h) verbatim from the normative home all passed GREEN — one of them asserting the §22.4 envelope on `mip_payout` instead of `promote_uncapped`, which is FALSE and is precisely the round-4 defect the guard was written to catch; by its own header's charter it caught 1 of the 5 historical defects it cited; (2) the clause-letter check used a hardcoded `[a-i]` class and the literal `'abcdefghi'` — a HAND-KEPT LIST, the exact construct its own header invokes PHASE_G against — so a clause (j) added to §14.23 needed no companion, and because the citation was a substring match over the whole section (and §22.9(d)'s prose happens to contain the token `§14.23(f)`), §22.9 clause (f) — the compatibility gate — could be DELETED entirely and stay green; (3) the §15 check pinned 476 of 2,653 chars (18%) in ONE direction, so §15 could carry a sentence CONTRADICTING the governed text, or carry §22 disclosure absent from its source (round-4's own defect, inverted), and stay green. **Root cause of all three: the r5 mutants were chosen for convenience and all landed inside the covered subset, so red-then-revert passed on every one while the boundary went untested — the §21-round-1 failure ("the adjudication sample was provably blind to the mutant it exists to exclude") reproduced exactly.** GUARD v2 (r6): every mathematical token banned inside §22.9's code spans with all domains rewritten as PROSE (no grammar, no whitelist — `LN[t] ≥ 0` proved a grammar-based rule still admits normative assertions wearing a domain's clothes); clause letters DERIVED from §14.23 with an OPEN character class so a new clause is required automatically; each citation bound to its OWN clause body; §15 and the §22.11 block compared over the WHOLE clause in BOTH directions. **The mutant sample is now derived FROM the property: one per clause (9) plus every structural hole the reviewers proved (4) plus the preamble hole (1) = 14, ALL RED, all reverted by string-replace with count==1 asserted, baseline green and the SPEC swept for residue.** The guard's scope is now stated honestly in its own header — §16, §22.5's annotations, and the DOMAINS duplicated between §22.9 and §14.23 are NOT enforced, the last being the largest known residual since domains went stale twice (r1 gov-B6, r2 gov-B2). 3 minors also applied (the `§14.23(23)(x)` notation normalised to the file's own `§14.23(x)` form, which the r5 guard had cemented; the grammar seam left where r4 deleted a parenthetical; §22.11 restructured so ONE marked block IS §15's clause rather than three sentences inside it). **ROUND 6 REFUSED by both, 5 blocking in union, 12 of 20 reviewer mutants passing guard v2 — and the root cause was not the token set but its POLARITY.** PHASE_G's standing lesson is that a DENYLIST fails open and the fix is a positive allowlist; guard v2's header cited PHASE_G against whitelists while implementing an enumerated character ban, the same construct one level down. It missed `+`, ASCII `-`, `*`, `**`, `÷` and unicode lookalikes (`＝` U+FF1D, `⩽` U+2A7D); its slash rule was INVERTED, firing on spaced slashes and paths while missing division itself; it read only BACKTICKED spans, so the FALSE §22.4 envelope on `mip_payout` — the very round-4 defect the guard existed to catch — passed simply by dropping its backticks; its clause scan anchored on a hand-kept punctuation set, so a clause introduced after a PERIOD needed no companion; and its §15 comparison covered 2,653 of 6,855 chars, so a §22 sentence placed elsewhere in §15 was ungoverned — round-4's defect surviving by RELOCATION, the fourth time in this feature a fix moved a defect rather than closing it. Separately §22.9(h)'s prose domain was NARROWER than §14.23(h)'s formal one, excluding the empty list §22.3 pins as a legal non-null value and that the clause's own sub-claim requires — the one place a domain's MEANING moved in the round-5 prose rewrite. **GUARD v3 (r7):** the span check is a FAIL-CLOSED ALLOWLIST — a §22.9 code span must be an identifier or a filename, so it may NAME a thing and never RELATE two, and no expression in any notation can satisfy it; a token BACKSTOP scans the PROSE, where an allowlist is impossible, closing the unbackticked-formula hole (tuned for two real forms: division is a slash BETWEEN alphanumerics, which v2 had inverted, and subtraction is a SPACED hyphen, since an unspaced one is a compound word); clause-letter sets are derived from BOTH homes with an open class and compared for EQUALITY, with no punctuation dependence; and §15 is delimited on BOTH sides, compared whole in both directions, with §22-specific terms BANNED outside the markers. **The mutant sample was rebuilt and enumerated BY OPERATOR FAMILY rather than by example — ASCII-only, `+`-only, division, fullwidth, `÷`, U+2A7D, power, bare token, unbackticked prose, operator-between-spans, clause-after-period, §15-outside-the-region — 19 mutants, ALL RED, with the SPEC verified BYTE-IDENTICAL to pre-mutation rather than merely reverted.** My own audit confirmed the reviewers' charge that all 14 round-6 mutants carried a covered token, so none tested the boundary: the third consecutive round my sample was drawn from inside the covered set, and the reason v3's is enumerated by family. 4 minors also applied (the null-vs-empty-list boundary restated in §22.9(f) and (h); §22.9(g)'s "emitted" replaced by "NON-NULL", since `ModelOutput` always carries the key and "emitted" would have widened a deliberately narrow domain to every run; §14.23(d)'s ordinals corrected — it said "the SECOND"/"the FIRST" against a THREE-condition domain while the prose companion counted correctly, i.e. the NORMATIVE home was the less precise one; the dead `≡` excision removed). **ROUND 7 REFUSED by both — and it produced the first SPEC defects since round 4, both created by the guard's own remedy cycle.** (1) §14.23(d)'s round-6 ordinal correction said "the FIRST is now REDUNDANT", naming `sweet_equity non-null` — the domain's CORE, without which there is no strip and nothing to assert — while the clause's own justification two sentences later describes the PLUG condition, i.e. the second; the NORMATIVE home was left internally contradictory while §22.9(d)'s companion stayed right, the fourth time a fix landed in the governing home and made it worse. (2) Round 7's null-vs-empty disambiguation widened §14.23(h) to admit `mip.ratchet: []` and, applying the mirror image, NARROWED §14.23(f) to exclude it — but §22.3 pins `null ≡ [] ≡ v1` and §22.4's one-term sum IS §10 verbatim, so `[]` produces v1 numbers, and (f) is the clause asserting v1 NUMERIC IDENTITY; a compatibility regression on that representation would have shipped green. Both fixed. **THE GUARD WAS CUT BACK, on the governance reviewer's requested proportionality judgement.** Its ledger across rounds 5–7: **ZERO §22 defects caught, THREE occasioned** (a domain narrowed by the prose rewrite it mandated, a domain narrowed by the disambiguation that followed, and a stale self-description it PINNED into §22.9 by asserting the sentence verbatim — a sentence which also claimed "no whitelist to maintain … the only kind PHASE_G's standing lesson permits", the exact OPPOSITE of PHASE_G, which requires a positive allowlist so the fence fails CLOSED). Meanwhile the same FALSE §22.4 envelope survived all three guard generations by changing notation — `≤`, then unbackticked `≤`, then the words "is at most" — which no lexical rule can reach, because no text scanner separates a domain written in prose from a rule written in prose, and round 6 MANDATED prose for the domains. **Retained: the three checks that enforce IDENTITY RELATIONS across widely-separated text** — a fail-closed identifier/filename ALLOWLIST on §22.9's code spans (a span may NAME a thing, never RELATE two); clause-set EQUALITY between both homes with each citation bound to its own clause body; and §15's §22 clause EQUAL to the §22.11 block governing it, in BOTH directions (this defect occurred TWICE IN OPPOSITE DIRECTIONS, r3 and r4, and both times only a reviewer holding two passages ~1,900 lines apart caught it). **Deleted: the prose token backstop and its CHARTER pin.** 15 mutants across every notation family — ASCII, `+`, division, fullwidth, `÷`, U+2A7D, power, bare token — plus all three clause-structure and all three §15 shapes remain RED under the smaller guard, and the SPEC was verified byte-identical to pre-mutation, so the cut lost nothing measurable. The residuals are now WRITTEN DOWN in both the guard header and §22.9 rather than implied: prose restatement is undetectable and belongs to the conformance review, which reads §22.9 against §14.23 clause by clause; the DOMAINS are compared by no test and are the largest known residual; §16, §22.5's annotations, and a §14.23 clause introduced without the `(x) [domain]` convention are unenforced. PHASE_G's Tier-A template asks for a spec amendment and a hostile sign-off, not a prose linter — the escalation is ended here rather than at a fourth guard generation. **Round 2 REFUSED by both, 7 blocking in union, ALL applied in r3; TWO were RELOCATIONS of round-1 findings (the §21-round-2 pattern):** (1) the `pot ≤ 0` arm was UNQUALIFIED, so on the v1 path with `rollover > 0` a negative residual went entirely to `sponsor_share` where `exit.ts` splits it pari-passu (E = −25, f = 0.25: v1 −18.75/−6.25 vs −25.00/0.00) — §14.23(f) still false, and the r2 verification was BLIND to it because every case tested ran rollover 0, which §17(viii) records no golden exercises; the arm is now gated on `sweet_equity non-null` with §9 fall-through, verified reproducing `exit.ts` at both f = 0 and f = 0.25 across the signed range; (2) §14.23(d) FAILED on the negative-E fixture §22.13(v) itself mandates — `returns.ts` sums strictly positive flows (a v1.1.0 convention), so a negative period-N flow is dropped and the realized MOIC (−0.25) diverges from the headline (0.00), with the COUNTS disagreeing too once an interim distribution is banked; the r1 clamp had been accidentally protecting this, and fixing the clamp exposed it — (d) gains the flow domain and an ABSOLUTE tolerance floor (a relative bound anchored on `moic` is an exact-equality demand at `moic = 0`), and the divergence is DISCLOSED in §15 rather than repaired, since repairing it would move `moic` on the v1 path; (3) §22.5's `STOP` skipped the count/MOIC lines, leaving three REQUIRED outputs undefined on a reachable path that §14.23(d) reads — now `V_final ← V₀` with the VALUE-REALIZED reading pinned; (4) **the §15 disclosure row was BYTE-IDENTICAL to the refuted draft** — still carrying "the conservative direction" that round 1 corrected to "never anti-conservative", and none of the r2 disclosures — while this changelog column claimed §15 amended: the v1.6.0-round-2 defect and the project's named "changelog records a correction that was not applied" failure, repeating; §15 is now REGENERATED from §22.11 and the fix VERIFIED by diff against the refuted revision; (5) §14.23(b) named `management_ordinary_share`, an `equity_strip`-only field, across its own `[ALL]` domain — §22.6's ONE-NAME rule is extended and `ExitBlock.sweet_equity_management` renamed, with every invariant asserted on the unconditional carriers; (6) the new §9 warrant row said `in (−)` on the sponsor stream although the warrant is already netted inside `sponsor_share` — a double-count, now "excluded as a LINE" with a legend addendum distinguishing the two senses of `excluded`; (7) §22.9(h) opened on the promote and closed on the uncapped sum — two different numbers once §10's cap binds. 13 further minors applied (incl. the G10 mutant priced at 28.930185 rather than the other mutant's 17.358111; the `X ≈ 703.833238` seed named; the `sources_uses` zero-column emission decided out loud against `spec_calc.py`'s existing omit-`rollover_equity` habit; the de-circularised §22.3(vi) heading; both share rules' domains stated disjoint so the engine PR cannot ship two live definitions). | DR-2 Item 4 (the promote/sweet-equity double-count, verbatim), DR-4 Cat.7 + the mezzanine warrant/equity-kicker item (2–8% of equity), Goodwin 2024 (MOIC-only plans ~2/3), §3 sweep-grid strict-`>` precedent, §10 [v1.1.0] exit-only settlement, §5 no-solver rule |
| v1.6.0 | 2026-08-09 | **PHASE-4 FEATURE AMENDMENT (spec-first; NO extraction/UI code in this version) — sector comps band (backlog #4). TIER B, DATA-SIDE.** §21 added: a CITED, REPRODUCIBLE sector EV/EBITDA band replacing the repo's unusable hardcoded blob (`conventions.json sectorMedians_CAVEAT.verifyBeforeDisplay = true` — "NA+Europe combined, PE+corporate blended, NOT strictly buyout-entry"). Source: Damodaran industry averages (`vebitda*.xls`), free, no key, no account, FOUR VENDORED regional files (US/Europe/Japan/India — the only regions a deal can select) over an identical 94-industry taxonomy, vintage 5 Jan 2026 verified from the files' own cells. **The dataset is COMMITTED, never fetched at runtime** (§21.3 — the `.xls` are legacy BIFF8 that `exceljs` cannot read, so conversion is an offline annual step with SHA-256 + vintage pinned; no new network dependency, no allowlist entry, no secret). The NEW computation (§21.4): per (region, sector), the firm-count-weighted 25/50/75th percentiles of the constituent industries' EV/EBITDA on the POSITIVE-EBITDA firm block, with the weighted-percentile convention PINNED as LOWER/NEAREST-RANK (`first constituent with cumulative weight ≥ p·W`) because at least four inconsistent interpolated conventions are in common use and an unreproducible number fails the Tier-B bar. Industries are EXCLUDED from both the value set and the weight total when the value is NA, **≤ 0** (live: Japan `Insurance (Life)` −9.78x) or the row is empty (n=0); the 2026 US file has exactly three NA — Bank (Money Center), Banks (Regional), Brokerage & Investment Banking — but NA carries at least two distinct meanings (meaningless ratio vs empty industry) and other regions DO publish bank/broker multiples that enter the band, and a bucket with zero included constituents emits **null**, never a fabricated number. Region from reporting CURRENCY (USD→US, EUR/GBP→Europe, JPY→Japan, INR→India — the five modelled currencies EXHAUST the domain, so there is NO else arm and Global/Emerging/China are not vendored) and DISPLAYED. The 94→8 sector map is committed DATA, pinned INLINE in §21.5 with its forced assignments named, and the join key is the NUMERIC SIC code through a committed range table — NOT `facts.sector` (raw SIC text) and NOT `inferSector`'s keyword ladder, which misroutes SIC 6798 REITs to Financial Services and drops 7 of 12 real strings to 'Other'; two source typos (`Rubber& Tires`, `Heathcare Information and Technology`) are part of the join key and preserved verbatim; `Other` resolves to the file's own `Total Market (without financials)` aggregate, labelled as a whole-market fallback. **Tier-B admission ticket: the git diff over the ENGINE ARITHMETIC PATH is EMPTY** — `sector_comps` is a Class-A FACT computed in `lib/edgar/comps.ts`, feeding no engine number, no suggestion value and no coherence flag; the `entry_multiple_vs_sector` comparison flag is DEFERRED to a separately-gated Tier-A PR because it would live in `check.ts` (the per-changed-number decomposition PHASE_G mandates for backlog #10). Invariants §14.22 (a)–(e) incl. the occurs-among-constituents consequence of nearest-rank, the NA weight-exclusion identity, byte-identical regeneration, engine-output invariance, and the explicit NON-CLAIM that a public-market trading range is not a buyout-entry range. Adjudication (§21.10): a DIFFERENT-LANGUAGE reference (`derive_bands.py`, zero imports of the code under test), TWO independent blind passes over a sample chosen to DISCRIMINATE, with both conventions' numbers pinned — **Japan Real Estate is simultaneously the sole discriminator and the exact-boundary case** (W=168, p·W = 42.00 = c₁ exactly ⇒ `≥` 8.91 vs interp 10.71 vs `>` 11.31), plus US Financial Services (38.03/38.03/57.52), US Real Estate (the 19.87×3 collapse), US Consumer and the `Other` scalar; compared at FULL precision, and the gate ASSERTS the discriminator still differs, a **CI REGENERATION GATE** byte-comparing `bands.json`, and a CSV SHA-256 + vintage gate so a silent upstream re-publish cannot slip in. REJECTED: **Financial Modeling Prep** (free tier is 250 req/day, US-ONLY, and the `stock peers` endpoint is PAID — US-only alone disqualifies it for an app that imports ESEF and models GBP/EUR/INR/JPY; a keyed live feed also adds a secret, a rate limit and a runtime dependency, and a daily-moving number cannot be adjudicated against a byte-reproducible fixture); runtime/build-time fetching; the existing unverified PitchBook sector medians; interpolated or unweighted percentiles; a min/max range (one 3-firm industry would set the band — `Rubber& Tires` n=3 and `Auto & Truck` 47.76x are both live). | Phase-4 step 1 (Tier B template, rebuild/PHASE_G_EXTENSIONS.md); backlog #4; hostile sign-off round 1 REFUSED — **8 blocking**, ALL applied in r2: (B1) §21.5's join-key premise was FALSE against committed code — `facts.sector` carries raw EDGAR SIC TEXT (ESEF: always `Other`) and `inferSector` is DEAD CODE with zero call sites, so the 94→9 map would never have joined; re-keyed onto a derived `compsBucket` with `facts.sector` left untouched and the ESEF null-band stated; (B2) §21.9/§15's "financials surface as unavailable" was FALSE — US Financial Services computes to **38.03/38.03/57.52** off asset managers and non-bank financials, and 5 of 7 regions publish bank or broker multiples; restated factually and region-conditionally, and the null sample replaced; (B3) the adjudication sample was provably blind to the interpolation mutant §21.4 exists to exclude (the two conventions agree on 54 of 56 bands; 3 of 4 sample items had ZERO discriminating power) — the sample is now NAMED with both conventions' numbers pinned and compared at full precision; (B4) §14.22(b)'s biconditional was FALSE (`Other` has 0 constituents and a non-null band) and "never a point" was FALSE (US Real Estate 19.87×3, R.E.I.T. 64% of W) — scoped per basis and the collapse stated as correct; (B5) the weight `n_i` is the ALL-FIRMS population, not the ratio's sample (one firms column serves both blocks; `Electronics (Consumer & Office)` n=8 with a positive-block value and an all-firms NA proves it) — relabelled honestly; (B6) China and India carry a THIRD aggregate row DUPLICATING the `Total Market (without financials)` label (17.56 vs 16.35 on India, which is reachable) — the first-row-in-file-order rule pinned; (B7) the map was absent though the map IS the convention — the full 94→8 map, its forced assignments and two worked bands are now pinned inline per the §19.9/§20.9 precedent; (B8) `else → Global` was DEAD by type (currency is coerced to the five modelled values) leaving Global/Emerging/China as unreachable committed datasets — dropped to FOUR regions with no else arm. Minors applied: the ≤0 exclusion (Japan `Insurance (Life)` −9.78x live), n=0 rows, the live Japan Real Estate boundary preferred over a constructed vector, the PHASE_G Tier-B allowlist AMENDED to admit `data/**`+`scripts/**` (it fails closed), the aggregate-of-industry construction disclosed, NA's two meanings distinguished, the python/JSON byte contract pinned, and a 15-month vintage forcing gate added. Round 2 REFUSED — 4 blocking (the §21.5 fix RELOCATED round-1 B1 rather than removing it: the promoted `inferSector` returns "Other" for absent input so the ESEF null-band was unreachable, and its rule order sends SIC 6798 REITs to Financial Services via /invest/ before /reit/ — a 2x wrong band — while dropping 7 of 12 real EDGAR strings to "Other"; plus the §16 schema paragraph and the changelog Change column were both byte-identical to the refuted draft, the v1.4.0 round-2 defect repeating) — ALL applied in r3 by RE-KEYING onto the numeric SIC code. Round 3 REFUSED — 3 blocking ((R3-B1) the SIC premise held for only ONE SEC branch: the §D6 IFRS-in-SEC route calls mapCompanyFactsIfrs, which has no sicCode parameter, so a 20-F filer with a published SIC would show "no sector information"; named as a third null cause with a step-3 threading obligation. (R3-B2) the replacement range table was never MEASURED the way §21.5 measures the ladder it rejects — it left 2900-2999 Petroleum Refining and six other blocks uncovered, contradicted its own forced-assignment sentence on five codes, and REGRESSED SIC 7011 Hotels to a wrongly-asserted bucket; the table is now closed, measured 33/33 over a real-code set with the sole deliberate gap 9000-9999, and its residual stated. (R3-B3) "§21.11 pins it" was a DANGLING citation — the round headline fix had no fixture, so an ascending-scan mutant would ship green; §21.11(x) now pins the ordering by value with a reordering mutant) — ALL applied in r4. **Round 4 GRANTED** (fingerprint-anchored @ fc26e79, zero conditions; the reviewer independently reproduced the corrected SIC table — zero uncovered blocks and zero most-specific-wins ambiguities across all 9,900 codes, 19 of 21 fresh probes agreeing and the two disagreements being the named wholesale convention — built the §21.11(x) reordering mutant and confirmed it returns Financial Services 38.03/38.03/57.52, i.e. the fixture genuinely reds, and re-verified all 8 worked bands, the Japan Real Estate discriminator and the India duplicate-label case; 4 text-only minors folded into the grant-recording commit). TIER B and the deferred entry_multiple_vs_sector flag both SIGNED OFF by the same reviewer, per the standing Tier-B/C rule. **Post-grant dispositions applied IN-VERSION, recorded for traceability (2026-08-09; the v1.4.0 precedent):** (step 2, authority = BOTH signed blind adjudication passes) §21.10(3)'s byte contract was CORRECTED — the granted text demanded a fixed 2-decimal SERIALIZER "never repr", which the artifact it governs contradicts; the load-bearing half is the 2dp ROUNDING before serialization, and CPython's deterministic float repr then drops trailing zeros on 8 of 108 values, which is expected because the gate compares emitter-vs-emitter; §21.10(2) now NAMES the type-7 interpolation and scopes the one-discriminator claim to it (under midpoint/CDF-edge weighting all 32 bands discriminate); §21.4's n=0 example corrected from one row to the five that exist. (step 3, authority = the scoped accuracy audit) §21.5b rewritten — the D6 threading LANDED, and `store/dealEngine.ts` was NOT inside the Tier-B allowlist though §21.5b claimed it was, so the fence is amended explicitly. (step 5, this gate) the file header bumped to v1.6.0; §21.9/§15's bank clause corrected to "Europe and India enter through BROKER multiples only — only Japan publishes an actual bank multiple" (the round-1 B2 false-financials defect had reappeared on the shipped surface); the `sic-map.json` cite corrected to the committed `sector-map.json`; §16's null-cause (2) restated as CLOSED with its duplicated sentence removed. The AMENDED Tier-B allowlist reads `data/comps/**` + `scripts/comps/**` + the one `store/dealEngine.ts` call site. NO band value, gate or invariant moved in any of these — must sign off the TIER CHOICE and the diff proof as well as the convention (the standing Tier-B/C rule) |
| v1.5.0 | 2026-08-08 | **PHASE-3 FEATURE AMENDMENT (spec-first; NO engine/UI code in this version) — PIK toggle (backlog #6). TIER A.** §20 added: a per-year WHOLE-coupon cash/PIK ELECTION on the `pik_note` — 'cash' pays `beginning × cash_coupon` with NO accrual, 'pik' accrues `beginning × pik_coupon` with NO cash, `elections: null` ≡ the v1 FIXED both-legs note ⇒ every NUMERIC output and serialized fixture byte identical, with the ONE spec-side-decided coherence carve-out: G3/G3-DIST (fixed accreting, maturity 8) EMIT the new `ahydo_shape` WARN from v1.5.0 on (§20.6(c)/§20.9 — decided here, never a discovered red test). §16 gates: non-null length ≡ hold_years; entries in the union; `cash_coupon > 0` ∧ `pik_coupon ≥ cash_coupon` when non-null (a 0%-cash toggle is a free coupon holiday; the PIK premium is non-negative — DR-3.4 market shape). Tax: the §6 machine unchanged, the capped pool's per-year composition follows the elected leg (§20.4); **AHYDO stays a DISCLOSED omission** plus the new STRUCTURAL `ahydo_shape` WARN — fires on maturity > 5y ∧ an accruing year, yield leg (AFR + 5pts) stated-not-tested, the assumed contractual catch-up cure named (§20.6(e)/§20.8). Composition unchanged by construction: §5 order (elections are data), §3/§4 sweep-exemption + amort, §18.2 non-refinanceability (gate reads TYPE, not election), §9 par+accrued payoff, §13 elections FROZEN across scenarios, §19 unaffected. NO new ModelOutput fields (`TrancheYear` already splits cash/PIK). Invariants §14.21 (a)–(f) incl. the closed-form balance (domain-scoped), the null-elections byte-identity gate, the per-election pool mirror, and the all-cash-vs-all-PIK IRR NON-claim. Golden plan: **G8-PIKT** (= G3 + `{cash 9%, pik 12%, elections [pik,pik,cash,cash,pik]}`; payoff closed form 135 × 1.12³ = 189.665280; cash years pay 15.240960; the §6 binding pattern ADJUDICATED, not ported from G3) + SEVEN directed uncovered fixtures (§20.10 (i)–(vii), incl. the both-legs discriminator, the pool-membership flip, and the ahydo_shape boundary set). REJECTED: partial/50-50 elections (v2, disclosed), a `pik_premium` field, election optimizers, fixed-note-as-all-pik sugar — each recorded with its reason (§20.1). | Phase-3 step 1 (Tier A template, rebuild/PHASE_G_EXTENSIONS.md); backlog #6; hostile sign-off round 1 REFUSED — 3 blocking ((B1) the §20.6(c) "byte-identity on every output" claim was CONTRADICTED by §20.6(e) with the counterexample already committed as G3/G3-DIST — coherence gains `ahydo_shape` on null-elections deals and two committed coherence-clean tests would red undecided; rescoped to numeric/fixture identity + the spec-side-decided exception per the v1.1.1 convention; (B2) §14.21's blanket non-null domain preamble was FALSE on clauses (b)/(c)/(e) — replaced with per-clause domains; (B3) the "§14.13 pool mirror" citation was DANGLING — re-anchored to §6.1's capped-pool definition) — ALL applied in r2 with minors (header un-bumped to v1.4.0 until grant per the 01f0ec8 precedent; the suggestion-layer premise rescoped to the conventions.json mezz template; the significant-OID proxy leg named as proxied; the §3 sweep cite; the maturity-5 negative fixture's hold ≤ 4 note; "every COMPUTED output" on §20.10(ii); the §9 membership-unchanged adjudication recorded); **round 2 GRANTED** (fingerprint-anchored @ ebfae5c, zero blocking conditions; the reviewer independently reproduced the ENTIRE committed G3 fixture, pre-verified G8-PIKT's feasibility — minimum cash-floor headroom 16.68, MIP in the money, closed forms to 6dp, the §163(j) carryforward path non-monotone so "adjudicated-not-ported" is NECESSARY — and constructed both §20.6(f) IRR directions numerically; 4 text-only residuals folded into the grant-recording commit). **Post-grant step-5 conformance edits, recorded for traceability (2026-08-09, commits 203da16/7a5ad62; the v1.4.0 precedent):** the FILE header bumped v1.4.0 → v1.5.0 (the precedented step-5 item — it was deliberately held at v1.4.0 while §20 was DRAFT), and §20.9's coherence-exception sentence rescoped from "every other golden stays coherence-clean" to "no other golden emits `ahydo_shape`" (the DIST goldens' v1.1.1 `distribution_blocked` was never in scope). NO normative rule, number, gate or assert moved — the operative §20 text remains byte-identical to the granted text @ ebfae5c |
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
