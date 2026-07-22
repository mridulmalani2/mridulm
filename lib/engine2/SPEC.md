# engine2 Financial Specification — v1.0.4 (SIGNED lineage; Phase A gate passed 2026-07-05)

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
     if still short → cash floor breach flag (§14.6). Post-breach semantics [v1.0.3]:
     the year closes below the floor with the flag set; closing cash MAY be negative;
     conservation (§14.3) is never clamped. Every subsequent year runs with the
     inherited (possibly negative) opening cash and carries a block-severity
     `cash_floor_breach` coherence flag; the run's outputs render with the insolvency
     warning. ("Never negative cash" described the draw-to-floor design goal, not a
     clamp — a deep enough hole is reported, not hidden.)
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
**v1 structural constraint [v1.0.3]:** every term-tranche maturity must exceed
`hold_years` (no balloon repayment or refinancing inside the hold until the Phase G
refinancing module). Violation is an input-gate rejection, not a computed default.

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
circularity — we escape it by convention instead. If a v2 feature introduces a true cycle
(same-year covenant-triggered distribution trap), the solver enters as its own spec'd module.

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
exit-year deduction (§9).
`FCF_pre_debt = EBITDA_adj − cash tax − capex − ΔNWC` (D&A and fee amortization non-cash;
cash tax single-sourced from the §6 computation — mirror invariant §14.16).

## §8 Opening balance sheet & purchase accounting [CONFIRMED DR-3 Item 7]

Stock deal, **no §338(h)(10)/§336(e) election, no tax step-up**, v1. At t=0: assets =
min-cash + opening NWC + PP&E (seed = facts net PP&E, else 0 with note) + capitalized
financing fees + OID + **goodwill (plug)**; liabilities = debt at **par**; equity = sponsor +
rollover. Goodwill = plug that closes the BS at t=0; not amortized thereafter. **PP&E roll
(explicit)**: ppe[t] = ppe[t−1] + capex[t] − D&A[t] — purely mechanical; may go negative
(coherence WARN `negative_ppe`); D&A stays %-of-revenue-driven (the §7 disclosure refers to
depreciation detail, not the BS roll). Carryover tax basis → **no
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
mirror of the exit-side proxy (symmetry; golden-uncovered, disclosed). The year-N §6 run
includes the retirement-triggered unamortized-fee write-off as an UNCAPPED deduction.

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

Net leverage = (gross − cash)/EBITDA_adj (SIGNED — net cash renders negative, never
clamped); senior leverage by tranche **type**, net, floored at 0 (a senior stack cannot
be "net short"), ≤ total **whenever total ≥ 0** [WORDING v1.0.4 — in the net-cash regime
total goes negative while senior floors at 0; the unqualified inequality was inherited
from the old engine's definitions and is arithmetically unreachable there];
ICR = EBITDA_adj / cash interest; FCCR = (EBITDA_adj − maint capex − cash tax) / (cash
interest + commitment fees + mandatory amort); DSCR = FCF_pre_debt / (same denominator).
**Only scheduled service in the DSCR denominator — never discretionary sweeps** [CONFIRMED
DR-1 Item 8]. **Leverage sizing and every covenant test use FY(LTM) EBITDA even when the
valuation basis is NTM** — lender convention; if entry is NTM-based the UI shows both, LTM
canonical. Undefined ratios render **N/A with reason** — 9999/99 sentinels banned. Covenant
headroom signed (breach = negative). Step-downs optional per covenant. Springing leverage
test: applies only in years where revolver drawn/commitment exceeds the trigger
(`springing_test_active` per year). Deleveraging
subtotals [CONFIRMED DR-5 Item 5 — "make deleveraging first-class"]: **FCF conversion %
(FCF/EBITDA)** and **cumulative debt paydown as % of entry debt** are first-class ModelOutput
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
shown as a memo from `gp_fee_income`. Both identities exact by construction and tested
(§14.9). Also rendered on a MOIC basis: each bar ÷
**entry (pre-promote total) equity** [CONFIRMED DR-5 Item 4, Mosaic MOIC Decomp — corrected
v0.96 from ÷ sponsor equity, which is inconsistent whenever rollover exists; the sponsor-net
walk-down may separately be shown ÷ sponsor equity, labelled as such]. EBITDA bridge: entry →
organic growth → margin → exit (add-on bars return in Phase G).

## §13 Scenario semantics [CONFIRMED DR-5 Item 3 — the entry-fixed rule is named best practice]

A scenario = a **field-level typed delta-set** (`ScenarioDeltas`: operating fields + exit
MULTIPLE only — exit basis/fees are NOT flexible) merged onto base assumptions (arrays
replace whole). `irr_delta_vs_base` = sponsor-net stream. Each scenario carries the slim
waterfall block (revolver draw/repay, sweep, closing cash, floor breach) for the DR-5
credit dashboard. A scenario changes **post-close operating assumptions and the exit
multiple only**.
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
   − MIP − rollover Δ ≡ sponsor net Δ (always).
10. Sponsor MOIC ≡ sponsor inflows / outflow (always).
11. IRR↑ in exit multiple (domain: exit equity > 0 across tested range).
12. Leverage↑ ⇒ IRR↑ (domain: frictionless config only — zero fees/OID, bullet cash-pay debt,
    no revolver, no min-cash bind, unlevered return > cost of debt).
13. All-suggested model ⇒ zero coherence warnings (always).
14. Zero-debt, zero-growth, flat-margin deal ⇒ IRR matches closed form (always).
15. Mandatory amortization per year ≡ schedule % × original face, capped at outstanding
    (always — DR-1 Item 7 flag).
16. Mirror identities (single-source rule): waterfall totals ≡ Σ tranche + revolver rows;
    FCF's tax term ≡ tax[i].cash_tax; sources_uses.enterprise_value ≡
    derived.enterprise_value; sponsor_share + rollover_share + mip_payout ≡
    exit_equity_pre_mip_total; sponsor_share ≡ final sponsor_net cashflow (always).
17. Committed downside scenario (G2): sponsor IRR ≤ base AND entry S&U identical to base
    (entry-frozen rule §13) (always).

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
scope. Framing:
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
The coherence gate (`check.ts`) is a post-run check over ModelOutput from the SAME `runModel`
call — never a second calculation path (architecture-review finding, 2026-07-04).

## §17 Golden deal definitions (Phase B builds the workbooks from EXACTLY these inputs)

Facts per §16 units ($m, decimal fractions). All goldens: ati_pct = 30% and minimum_rate = 0
unless stated (G4 overrides minimum_rate = 15%); rollover = 0; growth_capex = 0 every year
(stated capex is MAINT capex); financing-fee base = total commitments incl. revolver,
allocated pro-rata by commitment over each tranche's maturity (§7); exit fees = fees_pct ×
exit EV (§9); mid-year off. Workbook construction may surface infeasibilities — those flow
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

---

## Changelog

| Ver | Date | Change | Basis |
|---|---|---|---|
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
