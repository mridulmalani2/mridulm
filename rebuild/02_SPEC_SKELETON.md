# SPEC Skeleton — engine2 Financial Specification (v0.96 — research ingested + verification pass applied; → v1.0 at Phase A sign-off)

This becomes `engine2/SPEC.md`. Every section states the convention, the formula, and the
**rejected alternative** (so reviews stop re-litigating). Markers:
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
flow never shifts.** DR-2 Item 3 confirms this is "School B" — the internally consistent
convention, because an exit-multiple sale is a point-in-time year-end event; pulling exit to
t−0.5 while the debt schedule accrues full-year exit-year interest contradicts quantum with
timing (Macabacus end-period default; *Sunbelt Beverage* Delaware appraisal caution against
mixed conventions). In v1 there are no interim sponsor flows, so the option is inert and the
UI says so. Mid-year adds ~0.5–1.0pp to IRR when active — disclosed as timing, never as alpha.
v2 upgrade path: XIRR on actual close/exit dates with a first-year stub (DR-2's preferred
practice), which retires the convention toggle entirely.

Deferred: quarterly periods, day-count computation (disclosed-bias note in §4 instead).

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
     step-downs   : sweep_pct steps down on a net-leverage grid. The 50% base LEVEL and the
                    lender-friendly grid 75% (>4.5x) → 50% (3.5–4.5x) → 0% (<3.5x) are
                    [CONFIRMED DR-4 Cat.5, LSTA via CT Acquisitions]; running the base preset
                    FLAT (no step-downs) is a [DECIDED] v1 simplification — DR-4's own
                    recommended base is 50% with step-downs, available via the grid preset
     application  : by tranche sweep_priority (asc), pro-rata within a tier,
                    each application capped at that tranche's outstanding balance;
                    unapplied sweepable (all sweepable debt retired) stays in cash
6. + revolver draw: if cash < min_cash, draw min(shortfall, undrawn commitment);
     if still short → cash floor breach flag (§14.6), never negative cash
7. (v2: distributions, subject to trap; voluntary prepayments credited against the ECF
    requirement — a real-agreement nuance deferred with the distributions feature, DR-1 Item 2)
closing_cash = cash
```
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
  cash. Fixed-rate `pik_note` tranche type is in v1; per-year cash/PIK election is v2.
  AHYDO note in §6.
- **Commitment fee** on undrawn revolver commitment only [CONFIRMED DR-1 Item 8]: sits in
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
circularity — we escape it by convention instead. If a v2 feature introduces a true cycle
(same-year covenant-triggered distribution trap), the solver enters as its own spec'd module.

## §6 Tax [AMENDED DR-3 — ATI basis flipped; NOL survival default added]

Per year, on the running tax state {usable NOL balance, §163(j) disallowed-interest
carryforward}:

```
EBIT              = EBITDA_adj − D&A
gross interest    = cash interest + PIK accrual + OID/financing-fee amortization (§7)
1. §163(j):  deductible = !tax_shield_on ? 0
             : !section_163j_applies ? gross interest
             : min(gross interest + 163j_carryforward, ati_pct × ATI)
             `section_163j_applies` default ON; OFF covers the small-business exception
             (avg gross receipts < $31M for TY2025, IRS FS-2025-09 — rare for EDGAR-sourced
             targets but expressible) [CONFIRMED DR-3 Item 1 alt (a)].
             ATI basis **default = EBITDA** [AMENDED DR-3 Item 1: OBBBA, P.L. 119-21, signed
             July 4 2025, permanently restored EBITDA-based ATI for tax years beginning after
             Dec 31 2024 — the draft's EBIT default described superseded law; EBIT remains a
             toggle for modeling pre-2025 fiscal years]. ati_pct = 30%.
             new 163j_carryforward += disallowed − released (indefinite carryforward,
             [CONFIRMED DR-3]; note: the carryforward is itself a §382-limited attribute).
             OBBBA's post-12/31/2025 sub-changes (electively capitalized interest into
             §163(j); CFC inclusions out of ATI) are out of scope: the model contains
             neither mechanism (disclosed per §15).
2. taxable_before_NOL = EBIT − deductible interest        (loss → banks NOL, tax = 0)
3. NOL usage = min(usable NOL, §382 annual limit, 80% × taxable_before_NOL)
             **Acquired-NOL survival default = OFF** [AMENDED DR-3 Item 3: in the structures
             sponsors actually use (asset deals, §338(h)(10)/§336(e) elections) target NOLs
             generally do NOT carry over; the extracted NOL fact is displayed, but the
             assumption "acquired NOLs usable" defaults to off with a cited basis — enabling
             it turns on the §382 limit]. §382 limit suggestion = **target (loss
             corporation) equity value immediately before the ownership change** × long-term
             tax-exempt rate (~3.58%, Rev. Rul. 2025-24) — in model terms the purchase
             equity value (EV − net debt at close, i.e. sponsor + rollover), NOT the
             sponsor-only check [CONFIRMED DR-3 Item 2; basis corrected v0.96]. Static
             per-year limit is a disclosed conservative simplification — real §382 unused
             limitation carries forward and increases later years' limits (DR-3).
             Post-close NOLs generated inside the model are unrestricted by §382.
             80% cap → 100% if nol_arose_pre_2018 (pre-2018 layer applies first, no cap)
             [CONFIRMED DR-3 — identifier renamed from the old engine's off-by-one
             `nol_is_pre_2017`].
4. cash tax  = max(rate × (taxable_before_NOL − NOL usage),
                   min_rate × taxable_before_NOL)          ← minimum on PRE-NOL base [DECIDED]
```
Ordering §163(j) → §382-limited NOL → 80% cap → cash tax [CONFIRMED DR-3 — "the backbone of
the tax module," Treas. Reg. §1.383-1(d)]. Minimum-tax floor: optional input, CAMT caveat
(binds only >$1B AFSI — omit for mid-market) [CONFIRMED DR-3 Item 6]. PIK interest deductible
when accrued in v1; **AHYDO ignored with disclosure** [CONFIRMED DR-3 Item 4: bites only
>5-yr, YTM ≥ AFR+5, significant-OID instruments, and standard AHYDO catch-up clauses cure it
— modeled only in Phase G alongside HY structures]. Transaction costs: capitalized, no
deduction in v1 (conservative; the 70/30 success-fee safe harbor of Rev. Proc. 2011-29 is a
disclosed v2 refinement) [CONFIRMED DR-3 Item 5]. Unlevered stream (§9): same engine with
interest = 0 (no §163(j)), NOL/§382 still apply.

## §7 Operating build & FCF [DECIDED]

Revenue: `rev[t] = rev[t−1] × (1 + g[t])` (churn folded into g — one number per year).
Margin: base → target on trajectory (linear/front/back); `EBITDA = rev × margin`;
`EBITDA_adj = EBITDA − monitoring fee (if ON, §9)`. D&A = da_pct × rev (no PP&E roll v1 —
disclosed). Capex = maint_pct × rev + growth_capex[t]. NWC: **operating NWC** (per
PHASE_D definition — excludes cash/debt) via days (from filing DSO/DIO/DPO) or % of revenue;
`ΔNWC[t] = NWC[t] − NWC[t−1]`; NWC[0] from facts.
Amortization of capitalized financing fees & OID: **straight-line over each tranche's stated
maturity** (facility life; straight-line is the accepted shortcut vs effective-interest when
immaterial — DR-1 Item 5), remaining balance **written off on full early retirement**
[CONFIRMED DR-1 Item 5], flowing to the interest line (never D&A — misplacing it distorts
EBITDA and coverage, DR-2 Item 1 flag); tax-deductible per §6, added back in FCF.
`FCF_pre_debt = EBITDA_adj − cash tax − capex − ΔNWC` (D&A and fee amortization non-cash).

## §8 Opening balance sheet & purchase accounting [CONFIRMED DR-3 Item 7]

Stock deal, **no §338(h)(10)/§336(e) election, no tax step-up**, v1. At t=0: assets =
min-cash + opening NWC + PP&E (seed = facts net PP&E, else 0 with note) + capitalized
financing fees + OID + **goodwill (plug)**; liabilities = debt at **par**; equity = sponsor +
rollover. Goodwill = plug that closes the BS; not amortized. Carryover tax basis → **no
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
Exit equity (pre-MIP, total) = exit EV − payoff − exit fees − monitoring termination (if ON;
the accelerated-NPV-of-remaining-fees mechanic is a real exit Use — DR-2 Item 5).

**Naming [CONFIRMED DR-2 Item 2]:** the pre-carry series is labelled **"pre-promote IRR"**
— never "gross" (ILPA/GIPS reserve "gross" for the before-fund-fees-and-carry concept). It is
defined once: net of transaction costs and portfolio-company fees, before management
incentive, not an LP return.

**Fee/flow membership table (the table every past review fought about):**

| Item | (1) Sponsor net | (2) Unlevered | (3) Pre-promote |
|---|---|---|---|
| EV at entry | out | out | out |
| Transaction/advisory costs | out | out (exist regardless of leverage — DR-2 Item 6) | out |
| Financing fees + OID | out | **excluded** (leverage artifacts — DR-2 Item 6) | out |
| Debt proceeds | netted (−) | n/a | netted (−) |
| Management rollover | netted (−) | n/a | netted (−) |
| Monitoring fee (if ON) | reduces FCF & exit; memo line "GP fee income" shown separately (the consolidated-sponsor-economics view, DR-2 Item 5 — never silently dropped, never double-counted) | **excluded** | reduces FCF & exit |
| Exit advisory fees | in (−) | in (−) | in (−) |
| MIP promote | in (−) | n/a | **excluded** |
| Rollover share of exit | excluded (sponsor stream is sponsor-only; rollover pari-passu pro-rata) | n/a | excluded |

Unlevered taxes on **EBIT** — letting the interest tax shield leak into the unlevered stream
is DR-2 Item 6's #1 flagged error. Sponsor MOIC = sponsor inflows / sponsor outflow.
DPI/RVPI/TVPI (ILPA: on paid-in capital) and payback enter with distributions (v2) — not
headlined in v1 (degenerate).

## §10 MIP [CONFIRMED DR-2 Item 4 — one instrument]

v1 models the **US-style promote pool only**: `MIP = min(pool_pct × max(0, pre-MIP total
equity proceeds − hurdle_moic × total invested equity incl. fees), exit equity available)`.
Carry-above-hurdle (not a cliff), capped at available exit equity. DR-2 confirms the
draft's core rule verbatim: layering a promote on a sweet-equity cap table **double-counts**
management upside — sweet-equity strips (institutional strip + ordinaries, the UK/European
structure) are a separate Phase G module, modeled through the actual instrument, never
blended. Sizing suggestions [DR-2/DR-4]: pool 10–20% of FD equity; hurdles most commonly
MOIC-based (~2/3 of plans MOIC-only, Goodwin 2024), typically 2.0–3.0x.

## §11 Credit metrics [DECIDED — carry over FINANCIAL_DEFINITIONS.md, with fixes]

Net leverage = (gross − cash)/EBITDA_adj; senior leverage by tranche **type**, net, ≤ total;
ICR = EBITDA_adj / cash interest; FCCR = (EBITDA_adj − maint capex − cash tax) / (cash
interest + commitment fees + mandatory amort); DSCR = FCF_pre_debt / (same denominator).
**Only scheduled service in the DSCR denominator — never discretionary sweeps** [CONFIRMED
DR-1 Item 8]. **Leverage sizing and every covenant test use FY(LTM) EBITDA even when the
valuation basis is NTM** — lender convention; if entry is NTM-based the UI shows both, LTM
canonical. Undefined ratios render **N/A with reason** — 9999/99 sentinels banned. Covenant
headroom signed (breach = negative). Step-downs optional per covenant. Deleveraging
subtotals [CONFIRMED DR-5 Item 5 — "make deleveraging first-class"]: **FCF conversion %
(FCF/EBITDA)** and **cumulative debt paydown as % of entry debt** are first-class ModelOutput
fields rendered on the debt-schedule footer. Covenant suggestions
[DR-4 Cat.4]: BSL preset = cov-lite (>90% of new issue) with a springing revolver test at
35–40% draw; MM preset = maintenance covenants at 30–35% EBITDA headroom to base case.

## §12 Value bridge [CONFIRMED DR-2 Item 7 / DR-5 Item 4]

Bridge reconciles to **pre-promote total equity Δ** — DR-2 verbatim: "reconcile to
pre-promote equity first (management incentive is a distribution of value, not a source of
it)." Bars: ΔEBITDA at entry multiple + Δmultiple on exit EBITDA + net-debt paydown +
**interaction (explicit bar)** [CONFIRMED — DR-2/DR-5 name the explicit cross-term bar the
rigorous school; the common alternative silently folds it into the multiple bar via formula
choice]. Then a walk-down: − entry costs − monitoring leakage − MIP = sponsor net Δ.
Identity exact by construction and tested (§14.9). Also rendered on a MOIC basis: each bar ÷
**entry (pre-promote total) equity** [CONFIRMED DR-5 Item 4, Mosaic MOIC Decomp — corrected
v0.96 from ÷ sponsor equity, which is inconsistent whenever rollover exists; the sponsor-net
walk-down may separately be shown ÷ sponsor equity, labelled as such]. EBITDA bridge: entry →
organic growth → margin → exit (add-on bars return in Phase G).

## §13 Scenario semantics [CONFIRMED DR-5 Item 3 — the entry-fixed rule is named best practice]

A scenario = named delta-set over **post-close operating assumptions and exit multiple only**.
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
9. Bridge: Σ bars + interaction ≡ pre-promote equity Δ, exact; walk-down ≡ sponsor net Δ (always).
10. Sponsor MOIC ≡ sponsor inflows / outflow (always).
11. IRR↑ in exit multiple (domain: exit equity > 0 across tested range).
12. Leverage↑ ⇒ IRR↑ (domain: frictionless config only — zero fees/OID, bullet cash-pay debt,
    no revolver, no min-cash bind, unlevered return > cost of debt).
13. All-suggested model ⇒ zero coherence warnings (always).
14. Zero-debt, zero-growth, flat-margin deal ⇒ IRR matches closed form (always).
15. Mandatory amortization per year ≡ schedule % × original face, capped at outstanding
    (always — DR-1 Item 7 flag).

## §15 Units, precision, display [CONFIRMED DR-5 Item 6]

Engine: float64 end-to-end, unit = millions of deal currency, **no intermediate rounding**.
Golden tolerances: flows ±$0.005m; IRR ±0.1bp. Display (UI boundary module, never engine):
thousands separators; money 1 decimal of millions; IRR/percentages 1 decimal; multiples 1
decimal + "x"; percent-vs-decimal conversion happens exactly once at the input boundary.
**Assumptions & methodology page** [CONFIRMED DR-5]: a dedicated page (not buried footnotes)
listing every material simplification matter-of-factly as a scope choice, each paired with
why it is immaterial or conservative: annual periods; beginning-balance interest
(conservative); day-count basis per tranche (Actual/360 understatement ~1.0–1.4% of
interest); static rates; constant tax rate; period-end flows; exit = entry multiple. Framing:
"a model is a range, not a point" — the sensitivity/scenario exhibits are themselves the
primary caveat mechanism.

---

## Changelog

| Ver | Date | Change | Basis |
|---|---|---|---|
| v0.9 | 2026-07-04 | Initial skeleton; all conventions drafted, 12 [RESEARCH-CONFIRM] markers open | 4-lens adversarial review of the overhaul plan |
| v0.96 | 2026-07-05 | Post-ingestion verification pass (2 adversarial verifiers, 20 findings) applied. **Corrections:** §382 basis fixed to target pre-change equity value (was wrongly "sponsor equity"); §12 MOIC-basis denominator fixed to entry total equity; `nol_is_pre_2017` renamed `nol_arose_pre_2018` (off-by-one vs IRC §172); "50% flat" base sweep re-tagged [DECIDED] simplification (research confirms the level + the grid, not flatness); §2 financing-fee base explicitly includes undrawn revolver commitments; §6 gains `section_163j_applies` toggle (small-business exception), the §382 static-limit disclosed simplification, and the OBBBA post-2025 out-of-scope note; §3/§9 disclose the private-credit 102/101 hard-call + CoC-put omission (the soft-call exemption is BSL-only); §11 gains FCF-conversion % and cumulative-paydown-% subtotals (DR-5). conventions.json: citation-honesty fixes (hold=5 marked OWNER-pending vs DR-4's 7-yr recommendation; commitment-fee level marked not-research-covered; mezz template resized to 4.0x GF-supported total; per-category staleness cadence + DR-4 threshold triggers added; TLB-spread internal-conflict note) | Verifier findings, `wf_9d35de81` |
| v0.95 | 2026-07-05 | Research pass ingested (DR-1…DR-5 in `rebuild/research/`). **Amendments:** (1) §6 §163(j) ATI basis default EBIT → **EBITDA** — OBBBA (P.L. 119-21, Jul 2025) permanently restored EBITDA-based ATI for TY beginning after 12/31/2024; the draft described superseded law. Ledger row C-17. (2) §6 **acquired-NOL survival default = OFF** — DR-3: target NOLs generally do not survive the structures sponsors actually use; extracted NOL fact displayed, usability is an explicit cited assumption. Ledger row C-18. **Confirmations (kept as drafted, now cited):** beginning-balance interest as a disclosed minority convention (DR-1 — "what a reviewer will not accept is an undisclosed choice"); max(base,floor)+spread (DR-1); ECF-pool sweep with 50% base / 75-50-0 lender-friendly grid (DR-1/DR-4, LSTA); revolver-repay-before-sweep (DR-1); mandatory amort on original face — new invariant §14.15 (DR-1); soft-call ignorable in v1 since sweeps/mandatory are exempt (DR-1); commitment fee in DSCR, sweeps never in DSCR (DR-1); School-B mid-year (DR-2); "pre-promote" naming (DR-2); unlevered stream excludes financing fees/OID, taxes on EBIT (DR-2); promote-only MIP, sweet equity = separate instrument (DR-2); monitoring-fee no-double-count + GP-income memo (DR-2); tax ordering incl. §382 before 80% cap (DR-3); AHYDO/transaction-cost/CAMT v1 simplifications defensible-if-disclosed (DR-3); no-step-up purchase accounting (DR-3); entry-fixed scenarios (DR-5); pre-promote bridge with explicit cross-term + MOIC basis (DR-2/DR-5); exit = entry multiple suggestion (DR-4); assumptions-page disclosure style (DR-5) | `rebuild/research/DR-1…5-results.md` |

## Appendix — Convention citations
Full citation detail lives in the research files (`rebuild/research/DR-<n>-results.md`), each
finding with practitioner/primary sources (Rosenbaum & Pearl, Macabacus, Wall Street Prep,
LSTA, ILPA, GIPS, IRC/Treas. Reg. sections, OBBBA P.L. 119-21, PitchBook LCD, GF Data, Bain
GPE Report 2026, Travers Smith, Goodwin, law-firm primers). Suggested market values extracted
to `lib/engine2/suggestions/conventions.json` with per-value citation + as-of date; values
older than 12 months render with an "as of <date>" staleness warning.
