# Deep-Research Prompts (run in Claude chat, Phase A)

Five focused prompts. Run each as its own deep-research session; paste the whole block.
Results land in `engine2/SPEC.md` as the **Convention Citations appendix**, and DR-4
additionally feeds the SUGGESTED (convention) values and the capital-structure TEMPLATES.
Where a result contradicts a [DECIDED] entry in 02_SPEC_SKELETON.md, the conflict is resolved
explicitly in the spec changelog — never silently.

For every question, ask for: (a) the dominant market convention, (b) alternatives actually in
use and when, (c) named practitioner sources (Rosenbaum & Pearl, Macabacus, Wall Street
Prep/BIWS, Multiple Expansion, ILPA, LSTA docs, law-firm leveraged-finance primers), and
(d) a one-line "what a reviewer would flag if you did it differently".

---

## DR-1 — Debt mechanics in annual-period LBO models

> I am writing the debt-schedule specification for an institutional-grade annual-period LBO
> model. For each item, give me the dominant convention in US/European sponsor and lender
> models, the alternatives in use, citations to practitioner sources (Rosenbaum & Pearl,
> Macabacus, Wall Street Prep, Multiple Expansion, LSTA), and what a reviewer flags if done
> differently:
> 1. Interest in an annual model: beginning-of-period balance vs average balance — which do
>    banks and sponsors actually use, and how is the bias vs quarterly Actual/360 reality
>    typically disclosed or corrected?
> 2. Excess-cash-flow (ECF) sweep: the precise definition of the ECF pool in credit
>    agreements, standard sweep percentages and leverage-based step-downs (e.g. 75/50/25/0),
>    whether accumulated balance-sheet cash above a floor enters the pool, and the order
>    between voluntary revolver repayment and the term-loan sweep.
> 3. Revolver mechanics in an annual model: draw-to-floor / repay-from-excess conventions,
>    interest on drawn balance (opening vs average), commitment fee on undrawn, and how
>    intra-year seasonality is conventionally ignored or approximated.
> 4. Benchmark floors: confirm the market formula is max(base, floor) + spread, prevalence of
>    floors 2024–2026, and typical floor levels.
> 5. OID: amortization for model purposes (straight-line vs effective interest), write-off on
>    prepayment/refi, and the standard treatment in sources & uses (who funds it).
> 6. Call protection: typical soft-call (101) periods on TLBs, when models bother with
>    prepayment premia, and the convention for sweep prepayments during soft-call.
> 7. Mandatory amortization standards by instrument (TLA vs TLB 1%/yr vs bullet notes).
> 8. Commitment/undrawn fees and agency fees: which belong in a model and where they hit
>    (interest line vs fees line vs debt service for DSCR).
> Deliver as a table per item: convention | alternatives | citation | reviewer-flag.

**Feeds:** SPEC §3 (waterfall), §4 (rates), §5 (sequencing), tranche TEMPLATES.

---

## DR-2 — Sponsor return definitions and fund metrics

> I am specifying the return calculations for a deal-level LBO model (fund-level overlay comes
> later). Same format — convention, alternatives, citations (ILPA, Rosenbaum & Pearl,
> Macabacus, GIPS where relevant), reviewer-flag:
> 1. Which costs belong in the sponsor's t=0 equity outflow: buy-side advisory/transaction
>    fees, financing fees, OID — and which are treated as target-borne? Is management rollover
>    netted from the sponsor check?
> 2. The exact ILPA definitions of DPI, RVPI, TVPI, and gross vs net IRR — at deal level vs
>    fund level — and what "gross IRR" may legitimately mean in a deal model (I intend to
>    label the pre-promote series "pre-promote IRR" and avoid "gross" entirely: is that
>    defensible?).
> 3. Mid-year convention in LBO IRRs: exactly which cash flows shift to t−0.5 (interim only,
>    or exit too), and whether shifting the exit while the debt schedule accrues full-year
>    exit-year interest is recognized as an inconsistency.
> 4. Management incentive structures: the US-style promote pool above a MOIC/IRR hurdle vs
>    UK/European sweet equity (institutional strip + management ordinaries) — the standard
>    formulas of each, and why mixing the two produces wrong numbers. Typical pool sizes and
>    hurdle levels 2024–2026.
> 5. Monitoring/management fees paid by the portfolio company to the sponsor: standard
>    treatment in the deal-level equity IRR (deducted from company FCF; does the fee income
>    ever appear back in sponsor economics?), and termination-fee NPV practice at exit.
> 6. Unlevered (asset) IRR: standard construction — which fees are excluded because they
>    exist only due to leverage, and how taxes are computed without interest.
> 7. Value-creation bridges: standard decomposition (EBITDA growth × multiple, multiple
>    change, deleveraging, fees), which equity the bridge reconciles to (pre- or post-promote),
>    and how interaction/cross terms are conventionally presented.
> Deliver as a table per item.

**Feeds:** SPEC §9 (return streams and the fee-membership table), §10 (MIP), §12 (bridge).

---

## DR-3 — Tax mechanics that bind in a US LBO

> I am specifying the tax module of a US-focused LBO model. Same format — convention,
> alternatives, citations (IRS code sections, law-firm M&A tax primers, WSP/Macabacus):
> 1. §163(j): current ATI basis (EBITDA vs EBIT history and as of 2025–2026), the 30% cap,
>    and the indefinite carryforward of disallowed interest — how models implement the
>    carryforward account and its release as the deal delevers.
> 2. §382 after an LBO ownership change: the annual limitation formula (equity value ×
>    long-term tax-exempt rate), where to find the published rate, interaction with the
>    TCJA 80% NOL limitation, and the standard modeling order (§163(j) → §382-limited NOL →
>    80% cap → cash tax).
> 3. NOLs: post-2017 80%-of-taxable-income limitation, pre-2017 grandfathering, and whether
>    acquired NOLs typically survive in the structures sponsors actually use (stock vs asset
>    deals, 338(h)(10)).
> 4. OID and financing fees: deductibility and amortization period for tax (facility life),
>    AHYDO rules for high-yield PIK instruments (when PIK interest deductions are deferred or
>    disallowed) — is ignoring AHYDO defensible in a v1 model if disclosed?
> 5. Transaction costs: which are deductible vs capitalized into basis (INDOPCO regs) — and
>    what simplification do standard models make?
> 6. Corporate AMT / CAMT (15% on AFSI > $1B): who it actually binds, and the standard way a
>    generic model exposes a "minimum tax rate" input without full CAMT mechanics — applied
>    to which base (pre- or post-NOL)?
> 7. Purchase accounting in a stock deal without step-up: confirm no incremental tax D&A, and
>    the book/tax difference a model can legitimately ignore in v1.
> Deliver as a table per item.

**Feeds:** SPEC §6 (tax), §7 (opening balance sheet), golden deal G4.

---

## DR-4 — Market state 2024–2026 (feeds every SUGGESTED (convention) value and the templates)

> I need current, citable market data points to use as *suggested defaults* (each shown to
> users with its citation) in an LBO tool. For each, give the current typical range/midpoint,
> the trend, and a citable source (LCD/Pitchbook LBO stats, LSTA, Covenant Review, law-firm
> leveraged-lending reviews, public league-table commentary):
> 1. Total and senior leverage multiples for new-issue sponsor LBOs (large-cap vs middle
>    market).
> 2. TLB pricing: SOFR spreads, floors, OID at issue; typical unitranche pricing in the
>    middle market; mezzanine/PIK pricing.
> 3. Equity contribution percentages in new LBOs.
> 4. Covenant packages: cov-lite prevalence in broadly syndicated TLBs, springing revolver
>    covenant norms, typical leverage-covenant cushions in middle-market deals.
> 5. ECF sweep terms: standard percentage and step-down grid.
> 6. Typical financing-fee percentages, advisory/transaction-fee levels on the buy side, and
>    monitoring-fee practice (and its decline).
> 7. Median hold periods, and the discipline convention for exit-multiple assumptions
>    (exit = entry, or a haircut) in IC models.
> 8. Purchase-price EV/EBITDA multiples by sector bucket (tech, healthcare, industrials,
>    consumer, services), US and Europe.
> Deliver as a table: item | current range | midpoint suggestion | citation | as-of date.

**Feeds:** SUGGESTED (convention) badges, the 2–3 capital-structure TEMPLATES, coherence-gate
plausibility bands. Every number arriving from this research carries its citation into the UI.

---

## DR-5 — IC presentation conventions

> I am designing the output exhibits of an LBO tool to match what PE investment committees
> actually see. For each, describe the standard exhibit, its conventions, and cite examples
> (fund IC memo templates, Rosenbaum & Pearl exhibits, banker CIM/LBO one-pagers):
> 1. The LBO one-pager/summary: which numbers appear (returns, leverage, sources & uses,
>    credit stats) and in what hierarchy.
> 2. Sensitivity tables: which axes are standard, grid sizes, base-case highlighting, and
>    whether IRR and MOIC are shown together.
> 3. Downside/base/upside case construction: how operating cases are defined (what is shocked,
>    what is held constant — especially whether entry price/structure is EVER re-priced in an
>    operating case), and how credit outcomes are presented alongside returns.
> 4. Value-creation bridge presentation: bar order, handling of the interaction term, gross vs
>    net of fees.
> 5. FCF/deleveraging exhibit: the standard "cash generation" table and which subtotals matter
>    (FCF conversion %, cumulative debt paydown as % of entry debt).
> 6. How models disclose methodology limits (annual periods, static rates) without undermining
>    credibility.
> Deliver as a table per item.

**Feeds:** Summary tab design (Phase E2), Scenarios semantics presentation, methodology
footnotes.

---

## Handling results

1. Save each session's output to `rebuild/research/DR-<n>-results.md` (create the directory).
2. In SPEC.md, fill every `[RESEARCH-CONFIRM]` marker with the finding + citation; where a
   finding contradicts a [DECIDED] convention, record the resolution in the spec changelog.
3. Extract DR-4's table into `engine2/suggestions/conventions.json` (value + citation + as-of
   date) — the file the SUGGESTED (convention) badges read from. Stale-date it: suggestions
   older than 12 months render with a "as of <date>" warning.
