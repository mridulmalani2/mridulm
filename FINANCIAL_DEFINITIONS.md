# Financial Definitions Registry

**Status:** Governance reference (refactor plan P5-2). The single written record of
every metric the engine computes — its formula, the institutional convention it
follows (or deviates from, and why), which module implements it, and which test
verifies it. When a definition changes, update this file in the same PR.

Currency symbols use `csym(state.currency)`; `£` here is illustrative. Modules are
TypeScript, implemented in `lib/engine/`.

---

## Entry

| Metric | Formula | Convention / notes | Module | Test |
|---|---|---|---|---|
| Sponsor entry equity | `EV + entry_fee + transaction_costs + financing_fees + OID − total_debt_raised` | Entry advisory fee is target-borne in S&U but **included** in the MOIC/IRR denominator (sponsor cash out). OID (P4-14) is funded by equity at close. | `returns.ts` `calculateReturns` | `engine-parity`, `phase4h` |
| Total debt raised | `Σ tranche.principal` (par) | Par, not net of OID. | `modelState.ts deriveEntryFields` | `engine-parity` |
| Entry leverage | `total_debt_raised / entry EBITDA` | Gross leverage at entry. | `creditAnalysis.ts` | — |
| Sources = Uses | sponsor equity is the plug | Balances by construction. OID added to uses (P4-14). | `sourcesUses.ts` | — |

## Debt schedule

| Metric | Formula | Convention / notes | Module | Test |
|---|---|---|---|---|
| Cash interest | `avg_balance × eff_rate` | Average of beginning and post-mandatory-amort balance. PIK tranches pay 0 (accrue instead). | `debtSchedule.ts` | `phase3` |
| Effective rate | floating: `max(base_rate_by_year[t] ?? base_rate + spread, floor)`; fixed: `interest_rate` | Forward base-rate path supported (P3-3). Refinancing reprices from its year (P4-3). | `debtSchedule.ts` | `phase3`, `phase4c` |
| PIK accrual | `beg_bal × pik_rate` | PIK toggle (P4-4) elects PIK or cash per year; cash election pays the note coupon. | `debtSchedule.ts` | `phase4b` |
| Net debt | `max(0, gross_debt − cash_on_hand)` | Cash on hand, not min-cash reserve. | `debtSchedule.ts` | `engine-parity` |
| Cash sweep | tiered by `sweep_priority`, pro-rata within tier, capped at `cash_sweep_pct × outstanding` | Available = **beginning cash + post-service FCF − refi premium − min cash** — sweeps **accumulated** balance-sheet cash above the floor, not just the current year's FCF, and never sweeps below min cash (Phase 0B). | `debtSchedule.ts` | `phase4b`, `debt-mechanics` |
| Revolver draw/repay | draw to the min-cash floor; repay from post-service excess | Interest on opening drawn balance (P3-4). | `debtSchedule.ts` | `phase3` |
| Bullet at exit | schedule all-zeros; principal nets against sale proceeds | Not amortised from operating cash. | `modelState.ts` | `phase3` |
| Refinancing premium | `prepayment_premium × outstanding` in the refi year | One-time cash cost; charged to equity on the BS (P4-3). | `debtSchedule.ts` | `phase4c` |
| OID amortisation | schedule-aware: `max(remaining/years_left, remaining × principal_retired/beg_bal)`, written off in full on sweep-to-zero or refi | Non-cash, tax-deductible; capitalised as deferred financing cost (P4-14). Telescopes to the prior `(oid_pct × par)/maturity` for a held bullet, so unchanged unless a tranche prepays or refinances early (Phase 0B). Same series feeds the tax deduction and the BS deferred-cost write-down, so the close holds. | `oid.ts` `oidAmortFromSchedule`, `projections.ts`, `balanceSheet.ts` | `phase4h`, `debt-mechanics` |

## Tax (one shared line for both projection passes — `tax.ts` `computeAnnualTax`)

Sequencing when pretax income is positive: **§163(j) interest limit → taxable income → NOL
offset → minimum tax**. Defaults (`tax_shield_on_interest = true`, `section_163j_enabled`
off, `nol_carryforward = 0`, `minimum_tax_rate = 0`) reproduce the legacy inline tax exactly.

| Metric | Formula | Convention / notes | Module | Test |
|---|---|---|---|---|
| Book EBT | `EBIT − interest − financing-fee/OID amort` | Drives net income; unchanged. The tax *base* may differ when interest is limited. | `tax.ts` | `tax` |
| Interest tax shield | deductible interest = `0` if `tax_shield_on_interest=false`, else §163(j)-limited (below) | Shield-off makes interest **permanently** non-deductible (BEAT-style) — nothing carries forward. | `tax.ts` | `tax` |
| §163(j) interest cap | deductible interest = `min(interest + carryforward, ati_pct × ATI)`; excess carries forward | `ati_pct` default 30%; ATI = EBIT (post-2022) or EBITDA (`section_163j_ati_basis='ebitda'`, pre-2022). Disabled by default. The disallowed amount is surfaced per year on `AnnualProjectionYear.disallowed_interest`. | `tax.ts` | `tax` |
| NOL offset | `nolUsed = min(nolRemaining, limit_pct × taxableBeforeNol, §382 limit)` | `limit_pct` = 80% post-2017 (TCJA), 100% if `nol_is_pre_2017`; optional `section_382_annual_limit`. | `tax.ts` | `tax` |
| Cash tax | `max(taxableIncome × tax_rate, taxableIncome × minimum_tax_rate)` | Minimum tax applies last on the post-NOL base (Pillar Two / CAMT proxy). | `tax.ts` | `tax` |

## Coverage & covenants

| Metric | Formula | Convention / notes | Module | Test |
|---|---|---|---|---|
| DSCR | `FCF_pre_debt / (cash_interest + commitment_fees + mandatory_amort)` | Mandatory amort only (excludes discretionary sweep). | `creditAnalysis.ts` | — |
| FCCR | `(EBITDA − maintenance_capex − tax) / (cash_interest + mandatory_amort)` | **Maintenance** capex only — growth capex is discretionary (P2-2). | `creditAnalysis.ts` | — |
| Interest coverage | `EBITDA / cash_interest` | 9999 sentinel when interest = 0. | `creditAnalysis.ts` | — |
| Leverage (per year) | `net_debt / EBITDA` | **Net** leverage — cash on hand nets against gross debt (standard total-net-leverage covenant basis). Drives covenant headroom, the peak-leverage recovery year, and the cash-trap block. *Entry leverage* (above) is the distinct gross entry metric. | `creditAnalysis.ts`, `debtSchedule.ts` | `regression`, `phase4b` |
| Senior leverage | `max(0, Σ senior-type balances − cash) / EBITDA` | Filter by `tranche_type` (senior/unitranche/revolver), **not** array position (P1-4). **Net** of cash (cash flows to the most-senior creditors first), so senior ≤ total net leverage always (Bug 7). | `creditAnalysis.ts` | `engine-parity` |
| Leverage headroom | `covenant − net leverage` (signed) | NOT floored at 0 — a breach surfaces as negative headroom (its magnitude), consistent with DSCR/FCCR (Bug 7). | `creditAnalysis.ts` | — |
| Recovery default year | peak **net** leverage among years with **EBITDA > 0** | Skips the EBITDA≤0 (9999) sentinel so distress is analysed on a solvent year, not collapsed to 0% recovery (Bug 3). | `creditAnalysis.ts` | `phase4d` |
| Effective covenant | `*_covenant_by_year[t] ?? *_covenant` | Step-down schedules override the scalar (P2-4). | `creditAnalysis.ts` | — |
| Springing DSCR | applies only when `revolver_drawn / commitment > threshold` | Tighter test in drawn years (P4-8). | `creditAnalysis.ts` | `phase4d` |
| Cash trap | block distributions when `leverage > block_leverage` or `DSCR < block_dscr` | Net leverage (cash available *before* the distribution nets against debt) and DSCR — same definitions as the credit metrics, so a block aligns with the displayed covenant breach (P4-13). | `debtSchedule.ts` | `phase4b` |
| Recovery waterfall | distressed EV at peak-leverage year, senior→junior | EV = `EBITDA×(1−haircut) × entry_mult×(1−haircut) × (1−distressed_cost)`, year-of-default basis (P4-10). | `creditAnalysis.ts` | `phase4d` |

## Returns

| Metric | Formula | Convention / notes | Module | Test |
|---|---|---|---|---|
| Equity IRR | IRR of `[−entry_equity, … distributions + partial proceeds …, residual_post_MIP]` | Mid-year convention shifts interim CFs to t+0.5 (P3-7 disclosure). Partial exits (P4-5) book proceeds at their year. | `returns.ts` | `phase3`, `phase4` |
| MOIC | `(exit_equity + total_distributions) / invested` | `invested` = entry_equity + follow-on add-on equity (D); `exit_equity` = residual-post-MIP + interim partial proceeds. | `returns.ts` | `engine-parity`, `addon-equity` |
| Payback (years) | first period the cumulative equity cash flow turns ≥ 0, **linearly interpolated** within that year | Fractional, not whole-year — whole-year reporting overstates payback by up to a year. | `returns.ts` | — |
| Add-on equity | equity/mixed bolt-on `purchase_price × (1 − debt_pct)`, booked at the acquisition year | Outflow in the equity/levered/gross IRR streams + invested base for MOIC; unlevered subtracts the full purchase. Debt-funded bolt-ons = 0 (cost flows via synthetic debt). BS: acquired goodwill + fresh equity (D). | `addOns.ts`, `returns.ts` | `addon-equity` |
| Gross / levered IRR | pre-fee variants | Exclude exit fee, MIP, OID and monitoring termination (sponsor-level). | `returns.ts` | — |
| MIP payout | single hurdle, or highest cleared **ratchet** tier (optional IRR dual hurdle) | Tested on pre-MIP MOIC; promote crystallises on the residual stake at exit (P4-1, P4-5). | `returns.ts` `resolveMipPool` | `phase4` |
| Monitoring termination | `annual_fee × annuity_PV(years, rate)` | Exit year fee dropped; NPV of remaining years accelerated as an exit cost (P4-11). | `returns.ts` `monitoringTerminationPayment` | `phase4g` |
| Fund net IRR / MOIC | LP cashflows after management fee + carry over preferred return | European (whole-fund) or American (deal-by-deal); fees a drag, net MOIC on invested (P4-2). | `fundReturns.ts` | `phase4` |
| Value bridge | `Δrev + Δmargin + Δmultiple + Δdebt − fees_drag = exit_equity − entry_equity` | Distributions are LP cashflows, not value creation. `fees_drag` includes OID + monitoring termination. | `returns.ts decomposeValueDrivers` | — |

## Add-on (bolt-on) economics (Phase 0C)

| Metric | Formula | Convention / notes | Module | Test |
|---|---|---|---|---|
| Consolidated revenue | `organic + acquisition_revenue` | Organic (parent) revenue compounds at the growth rate; the add-on path is grown **once** by the add-on module and added on top — it is NOT re-compounded into the organic base (that double-counted it pre-0C). | `projections.ts`, `addOns.ts` | `addon-economics` |
| Consolidated EBITDA | `organic_revenue × parent_margin + Σ add-on EBITDA + cost synergies` | Each add-on contributes EBITDA at **its own** margin (not the parent margin applied to acquired revenue); reported `ebitda_margin` is the blend `EBITDA / revenue`. | `projections.ts`, `addOns.ts` | `addon-economics` |
| Integration cost | one-time, acquisition year: cash outflow in FCF and a deductible expense (reduces the tax base, **not** interest) | Kept out of adjusted EBITDA (exceptional); flows to both net income and cash so the BS still closes. Surfaced on `AnnualProjectionYear.integration_cost`. | `projections.ts`, `tax.ts` (`otherDeductions`) | `addon-economics` |
| EBITDA bridge | `entry + organic_growth + margin_expansion + add_on_ebitda + cost_synergies = exit EBITDA` | Organic growth/margin walk the **parent** revenue and margin; add-on EBITDA (ex-synergies) and cost synergies are separate bars, so the walk reconciles exactly (it double-counted acquired revenue pre-0C). | `ebitdaBridge.ts` | `addon-economics` |

## Three-statement model

| Metric | Formula | Convention / notes | Module | Test |
|---|---|---|---|---|
| NWC balance | days-based `A/R + Inventory − A/P` if DSO/DIO/DPO set, else `revenue × nwc_pct` | Inventory/A-P use cost base `revenue × (1 − EBITDA margin)` as a COGS proxy (P4-9). | `projections.ts nwcBalance` | `phase4f` |
| Operating FCF (pre-growth) | `fcf_pre_debt + growth_capex` | PE FCF bridge presentation (P4-6). | `projections.ts` | `phase4e` |
| Goodwill (opening) | purchase-accounting residual that closes the t=0 BS | `(debt + equity) − cash − NWC − PP&E − deferred fin costs`. | `balanceSheet.ts` | `phase3` |
| Balance check | `total_assets − total_liabilities_and_equity` | Closes by construction within the convergence tolerance; a non-zero value is a real integrity flag. | `balanceSheet.ts` | `three-statement` |
