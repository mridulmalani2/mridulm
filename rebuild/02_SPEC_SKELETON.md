# SPEC Skeleton — engine2 Financial Specification (v0.9 → v1.0 in Phase A)

This becomes `engine2/SPEC.md`. Every section states the convention, the formula, and the
**rejected alternative** (so reviews stop re-litigating). Markers:
- **[DECIDED]** — locked now; a review challenges it only with a citation.
- **[RESEARCH-CONFIRM DR-x.y]** — decided provisionally; the Phase A research pass must
  confirm/adjust, with the citation recorded here.
- **[OWNER]** — needs the owner's call in Phase A.

The spec is **versioned**: v1.0 at Phase A sign-off; amendments during B–E via changelog entry
+ golden-workbook update, re-reviewing only the touched section. Code may never deviate from
the current spec version.

---

## §1 Periodicity & timing [DECIDED]

Annual periods, flows at period end. Year 0 = close. Hold = N years; exit flows at t = N.
Mid-year convention (display option on IRR only): interim flows shift to t−0.5; **the exit
flow never shifts** (shifting exit while the schedule accrues full-year exit-year interest
contradicts quantum with timing — rejected). In v1 there are no interim sponsor flows, so the
option is inert and the UI says so. [RESEARCH-CONFIRM DR-2.3]

Deferred: quarterly periods, day-count conventions (documented bias note in §4 instead).

## §2 Sources & Uses at close [DECIDED]

Convention: **cash-free / debt-free acquisition**; target's existing net debt is settled via
EV (equity purchase price = EV − net debt at close, informational; the model transacts on EV).

```
USES:    Enterprise value
       + Transaction & advisory costs (buy-side)
       + Financing fees (capitalized, §7)
       + OID (= Σ tranche par × oid_pct; funded at close, capitalized)
       + Cash to balance sheet  (= min_cash floor — funds opening cash so §3 is coherent from Y1)
SOURCES: Debt at par (Σ tranche principal)
       + Management rollover equity
       + Sponsor equity (plug)
```
Solvency check: sponsor equity > 0. Sources ≡ uses by construction.
Rejected: opening cash = 0 with silent Y1 revolver draw (hidden financing); target cash as a
source (double-counts against EV).

## §3 Annual cash waterfall [DECIDED — the corrected sweep mechanic]

One **running cash variable** `cash` per year; every step depletes or feeds it exactly once
(double-counting between revolver repay and sweep is structurally impossible; invariant §14.3).

```
cash = opening_cash + FCF_pre_debt                    (FCF_pre_debt from §7 — after cash taxes)
1. − cash interest (all tranches, §4)
2. − commitment fees (undrawn revolver × fee)
3. − mandatory amortization (per schedule, capped at outstanding)
4. − voluntary revolver repayment: repay drawn revolver down to 0 from cash above min_cash
5. ECF sweep:
     pool         = max(0, cash − min_cash)
     sweepable    = sweep_pct × pool                   ← sweep % applies to the POOL
     step-downs   : sweep_pct may step down on net leverage grid [RESEARCH-CONFIRM DR-1.2]
     application  : by tranche sweep_priority (asc), pro-rata within a tier,
                    each application capped at that tranche's outstanding balance;
                    unapplied sweepable (all sweepable debt retired) stays in cash
6. + revolver draw: if cash < min_cash, draw min(shortfall, undrawn commitment);
     if still short → cash floor breach flag (§14.6), never negative cash
7. (v2: distributions, subject to trap)
closing_cash = cash
```
Rejected (the old engine's mechanic, and the draft plan's): "sweep % × outstanding" as a
per-tranche cap with no % applied to the pool — conflates the ECF percentage with a tranche
cap; no credit agreement works that way.
PIK notes never participate in the sweep unless `sweep_priority` explicitly set [DECIDED].
Soft-call premium on swept TLB during call protection: ignored in v1, disclosed [RESEARCH-CONFIRM DR-1.6].

## §4 Interest & rates [DECIDED — beginning-balance convention]

- **Cash interest = beginning-of-year balance × all-in rate.** This makes the year strictly
  sequential (§5) and hand-auditable. Bias vs quarterly Actual/360 with intra-year paydown:
  slightly overstates interest on amortizing/swept tranches (conservative for returns);
  stated in the methodology footnote. [RESEARCH-CONFIRM DR-1.1]
  Rejected: average-of-beginning-and-ending (creates circularity, needs a solver, blocks
  exact goldens); the old engine's beginning/post-mandatory-amort hybrid (nonstandard, and
  incoherent — it removes the circularity its own solver existed to resolve).
- **Floating: all-in = max(base, floor) + spread.** Rejected: max(base + spread, floor)
  (makes real floors inert). Static base rate in v1; forward curve v2.
- **PIK: accrual = beginning balance × pik_rate**, compounds into balance at year end; no cash.
  Fixed-rate `pik_note` tranche type is in v1; per-year cash/PIK election is v2.
- **Commitment fee** on undrawn revolver commitment only. In DSCR debt service; not interest
  for ICR. [RESEARCH-CONFIRM DR-1.8]
- Revolver interest on **beginning drawn balance** (draw/repay happen at year-end in §3;
  year-1 interest on a close-date draw is therefore zero unless drawn at close via §2).

## §5 Evaluation order — no solver [DECIDED]

For each year t: rates → interest & fees (from opening balances) → tax (§6, interest now
known) → FCF pre-debt (§7) → waterfall (§3) → closing balances/cash → next year. There is no
intra-year circular dependency under §4's convention; engine2 v1 contains **no fixed-point
iteration**. Consequences: goldens reproduce exactly; convergence flags/tolerances don't
exist. If a v2 feature introduces a true cycle (same-year covenant-triggered distribution
trap), the solver enters as its own spec'd module with its own goldens.
Rejected: carrying the old `converge.ts` machinery into a model whose conventions make it a
no-op (the old engine iterated because of its all-years-at-once structure, not because the
math required it).

## §6 Tax [DECIDED ordering; parameters research-confirmed]

Per year, on the running tax state {NOL balance, §163(j) disallowed-interest carryforward}:

```
EBIT              = EBITDA_adj − D&A
gross interest    = cash interest + PIK accrual + OID/financing-fee amortization (§7)
1. §163(j):  deductible = tax_shield_on ? min(gross interest + 163j_carryforward,
                                              ati_pct × ATI) : 0
             ATI basis = EBIT (post-2022 law) | EBITDA (toggle)   [RESEARCH-CONFIRM DR-3.1]
             new 163j_carryforward += disallowed − released
2. taxable_before_NOL = EBIT − deductible interest        (loss → banks NOL, tax = 0)
3. NOL usage = min(NOL balance, §382 annual limit, 80% × taxable_before_NOL)
             §382 limit input, suggested = sponsor equity × published LT tax-exempt rate
             [RESEARCH-CONFIRM DR-3.2]; 80% → 100% if nol_is_pre_2017
4. cash tax  = max(rate × (taxable_before_NOL − NOL usage),
                   min_rate × taxable_before_NOL)          ← minimum on PRE-NOL base [DECIDED]
```
Minimum-tax base pre-NOL (a floor that doesn't silently claw back NOL value; CAMT caveat in a
footnote — binds only >$1B AFSI). PIK interest deductible when accrued in v1; AHYDO deferral
disclosed as a limitation [RESEARCH-CONFIRM DR-3.4]. Transaction costs: not deductible
(capitalized) in v1 [RESEARCH-CONFIRM DR-3.5]. Unlevered stream (§9): same engine with
interest = 0 (no §163(j)), NOL/§382 still apply.

## §7 Operating build & FCF [DECIDED]

Revenue: `rev[t] = rev[t−1] × (1 + g[t])` (churn folded into g — one number per year).
Margin: base → target on trajectory (linear/front/back); `EBITDA = rev × margin`;
`EBITDA_adj = EBITDA − monitoring fee (if ON, §9)`. D&A = da_pct × rev (no PP&E roll v1 —
disclosed). Capex = maint_pct × rev + growth_capex[t]. NWC: **operating NWC** (per
PHASE_D definition — excludes cash/debt) via days (from filing DSO/DIO/DPO) or % of revenue;
`ΔNWC[t] = NWC[t] − NWC[t−1]`; NWC[0] from facts.
Amortization of capitalized financing fees & OID: **straight-line over each tranche's stated
maturity** (facility life, not hold), remaining balance written off (non-cash) on full early
retirement — tax-deductible per §6, added back in FCF.
`FCF_pre_debt = EBITDA_adj − cash tax − capex − ΔNWC` (D&A and fee amortization non-cash).

## §8 Opening balance sheet & purchase accounting [DECIDED — was missing entirely]

Stock deal, **no tax step-up**, v1. At t=0: assets = min-cash + opening NWC + PP&E (seed =
facts net PP&E, else 0 with note) + capitalized financing fees + OID + **goodwill (plug)**;
liabilities = debt at **par**; equity = sponsor + rollover. Goodwill = plug that closes the
BS; not amortized; no impairment testing. Debt carried at par with OID as a separate
contra-style deferred cost (avoids the book-vs-payoff trap at exit, §9). No book/tax D&A
divergence in v1. [RESEARCH-CONFIRM DR-3.7]

## §9 Exit & the three return streams [DECIDED]

Exit EV = exit multiple × exit-year EBITDA_adj (basis FY, or NTM = ×(1+g[N+1] proxy)).
**Debt payoff = par + accrued PIK.** Unamortized OID/financing fees: written off (non-cash);
affect exit only via the exit-year tax deduction — **never reduce cash proceeds**. No call
premia v1. Net debt at exit uses closing cash (same cash definition as credit metrics).
Exit equity (pre-MIP, total) = exit EV − payoff − exit fees − monitoring termination (if ON).

**Fee/flow membership table (the table every past review fought about):**

| Item | (1) Sponsor net | (2) Unlevered | (3) Pre-promote |
|---|---|---|---|
| EV at entry | out | out | out |
| Transaction/advisory costs | out | out | out |
| Financing fees + OID | out | **excluded** (leverage artifacts) | out |
| Debt proceeds | netted (−) | n/a | netted (−) |
| Management rollover | netted (−) | n/a | netted (−) |
| Monitoring fee (if ON) | reduces FCF & exit; memo line "GP fee income" shown separately | **excluded** | reduces FCF & exit |
| Exit advisory fees | in (−) | in (−) | in (−) |
| MIP promote | in (−) | n/a | **excluded** |
| Rollover share of exit | excluded (sponsor stream is sponsor-only; rollover pari-passu pro-rata) | n/a | excluded |

Sponsor MOIC = sponsor inflows / sponsor outflow. DPI/RVPI/TVPI and payback enter with
distributions (v2) — not headlined in v1 (degenerate). [RESEARCH-CONFIRM DR-2.1, DR-2.2]

## §10 MIP [DECIDED — one instrument]

v1 models the **promote pool only**: `MIP = min(pool_pct × max(0, pre-MIP total equity
proceeds − hurdle_moic × total invested equity incl. fees), exit equity available)`.
Carry-above-hurdle (not a cliff), capped at available exit equity (forward-compatible with v2
distributions). Sweet-equity strips (European structure) are **removed from the v1 schema** —
a different instrument, spec'd separately in Phase G. [RESEARCH-CONFIRM DR-2.4]

## §11 Credit metrics [DECIDED — carry over FINANCIAL_DEFINITIONS.md, with fixes]

Net leverage = (gross − cash)/EBITDA_adj; senior leverage by tranche **type**, net, ≤ total;
ICR = EBITDA_adj / cash interest; FCCR = (EBITDA_adj − maint capex − cash tax) / (cash
interest + commitment fees + mandatory amort); DSCR = FCF_pre_debt / (same denominator).
**Leverage sizing and every covenant test use FY(LTM) EBITDA even when the valuation basis is
NTM** — lender convention; if entry is NTM-based the UI shows both, LTM canonical.
Undefined ratios (zero denominator, EBITDA ≤ 0) render **N/A with reason** — the 9999/99
sentinels are banned. Covenant headroom signed (breach = negative). Step-down schedules
optional per covenant.

## §12 Value bridge [DECIDED — reconciliation target named]

Bridge reconciles to **pre-MIP total equity Δ** (exit pre-MIP equity − entry total equity):
ΔEBITDA at entry multiple + Δmultiple on exit EBITDA + net-debt paydown + **interaction
(explicit bar)**. Then a walk-down: − entry costs − monitoring leakage − MIP = sponsor net Δ.
Identity is exact by construction and tested (§14.9). EBITDA bridge: entry → organic growth →
margin → exit (add-on bars return in Phase G).

## §13 Scenario semantics [DECIDED — closes the live fragility bug]

A scenario = named delta-set over **post-close operating assumptions and exit multiple only**.
**Entry EV, debt quantum, tranche sizes, and sponsor equity are frozen at base-case close.**
(Re-pricing the entry under an operating shock is what makes today's downside IRR *improve* —
the live −100bps-margin/+37bps-IRR bug.) An "entry repricing" scenario type may exist later,
explicitly labelled. Every scenario runs the full engine and reports the same credit metrics
as base. Single-factor stress rows (ex-fragility) are scenarios under the same rule.
Sensitivity tables: full re-runs; the axis variable is applied the same way (entry-side axes
like entry multiple/leverage DO re-price entry — they are entry variables; operating axes do
not). Center cell ≡ base, tested.

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
9. Bridge: Σ bars + interaction ≡ pre-MIP equity Δ, exact; walk-down ≡ sponsor net Δ (always).
10. Sponsor MOIC ≡ sponsor inflows / outflow (always).
11. IRR↑ in exit multiple (domain: exit equity > 0 across tested range).
12. Leverage↑ ⇒ IRR↑ (domain: frictionless config only — zero fees/OID, bullet cash-pay debt,
    no revolver, no min-cash bind, unlevered return > cost of debt).
13. All-suggested model ⇒ zero coherence warnings (always).
14. Zero-debt, zero-growth, flat-margin deal ⇒ IRR matches closed form (always).

## §15 Units, precision, display [DECIDED]

Engine: float64 end-to-end, unit = millions of deal currency, **no intermediate rounding**.
Golden tolerances: flows ±$0.005m; IRR ±0.1bp. Display (UI boundary module, never engine):
thousands separators; money 1 decimal of millions; IRR/percentages 1 decimal; multiples 1
decimal + "x"; percent-vs-decimal conversion happens exactly once at the input boundary.
Methodology footnote (standing): "Annual periods, beginning-balance interest, static rates —
IRR indicative ±1–2pp vs a quarterly model." [RESEARCH-CONFIRM DR-5.6]

## Appendix (Phase A): Convention citations from DR-1…DR-5, and the spec changelog.
