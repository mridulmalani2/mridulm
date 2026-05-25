# Financial Definitions Registry

**Status:** Governance reference (refactor plan P5-2). The single written record of
every metric the engine computes — its formula, the institutional convention it
follows (or deviates from, and why), which module implements it, and which test
verifies it. When a definition changes, update this file in the same PR.

Currency symbols use `csym(state.currency)`; `£` here is illustrative. Modules are
TypeScript (source of truth) with the Python mirror in parentheses.

---

## Entry

| Metric | Formula | Convention / notes | Module | Test |
|---|---|---|---|---|
| Sponsor entry equity | `EV + entry_fee + transaction_costs + financing_fees + OID − total_debt_raised` | Entry advisory fee is target-borne in S&U but **included** in the MOIC/IRR denominator (sponsor cash out). OID (P4-14) is funded by equity at close. | `returns.ts` `calculateReturns` (`state.py sponsor_entry_equity_for`) | `engine-parity`, `phase4h` |
| Total debt raised | `Σ tranche.principal` (par) | Par, not net of OID. | `modelState.ts deriveEntryFields` | `engine-parity` |
| Entry leverage | `total_debt_raised / entry EBITDA` | Gross leverage at entry. | `creditAnalysis.ts` | — |
| Sources = Uses | sponsor equity is the plug | Balances by construction. OID added to uses (P4-14). | `sourcesUses.ts` (`state.py compute_sources_and_uses`) | — |

## Debt schedule

| Metric | Formula | Convention / notes | Module | Test |
|---|---|---|---|---|
| Cash interest | `avg_balance × eff_rate` | Average of beginning and post-mandatory-amort balance. PIK tranches pay 0 (accrue instead). | `debtSchedule.ts` | `test_debt_schedule` |
| Effective rate | floating: `max(base_rate_by_year[t] ?? base_rate + spread, floor)`; fixed: `interest_rate` | Forward base-rate path supported (P3-3). Refinancing reprices from its year (P4-3). | `debtSchedule.ts` | `phase3`, `phase4c` |
| PIK accrual | `beg_bal × pik_rate` | PIK toggle (P4-4) elects PIK or cash per year; cash election pays the note coupon. | `debtSchedule.ts` | `phase4b` |
| Net debt | `max(0, gross_debt − cash_on_hand)` | Cash on hand, not min-cash reserve. | `debtSchedule.ts` | `engine-parity`, `test_engine_parity` |
| Cash sweep | tiered by `sweep_priority`, pro-rata within tier, capped at `cash_sweep_pct × outstanding` | Available = post-service FCF − incremental floor shortfall. | `debtSchedule.ts` | `test_debt_schedule` |
| Revolver draw/repay | draw to the min-cash floor; repay from post-service excess | Interest on opening drawn balance (P3-4). | `debtSchedule.ts` | `phase3`, `test_engine_parity` |
| Bullet at exit | schedule all-zeros; principal nets against sale proceeds | Not amortised from operating cash. | `modelState.ts` | `phase3` |
| Refinancing premium | `prepayment_premium × outstanding` in the refi year | One-time cash cost; charged to equity on the BS (P4-3). | `debtSchedule.ts` | `phase4c` |
| OID amortisation | `(oid_pct × par) / maturity` per year | Non-cash, tax-deductible; capitalised as deferred financing cost (P4-14). | `oid.ts`, `projections.ts` | `phase4h` |

## Coverage & covenants

| Metric | Formula | Convention / notes | Module | Test |
|---|---|---|---|---|
| DSCR | `FCF_pre_debt / (cash_interest + commitment_fees + mandatory_amort)` | Mandatory amort only (excludes discretionary sweep). | `creditAnalysis.ts` | — |
| FCCR | `(EBITDA − maintenance_capex − tax) / (cash_interest + mandatory_amort)` | **Maintenance** capex only — growth capex is discretionary (P2-2). | `creditAnalysis.ts` (`debt_schedule.py`) | `test_engine_parity` |
| Interest coverage | `EBITDA / cash_interest` | 9999 sentinel when interest = 0. | `creditAnalysis.ts` | — |
| Senior leverage | `Σ senior-type tranche balances / EBITDA` | Filter by `tranche_type` (senior/unitranche/revolver), **not** array position (P1-4). | `creditAnalysis.ts` (`debt_schedule.py _is_senior_tranche`) | `engine-parity`, `test_engine_parity` |
| Effective covenant | `*_covenant_by_year[t] ?? *_covenant` | Step-down schedules override the scalar (P2-4). | `creditAnalysis.ts` | — |
| Springing DSCR | applies only when `revolver_drawn / commitment > threshold` | Tighter test in drawn years (P4-8). TS-only. | `creditAnalysis.ts` | `phase4d` |
| Cash trap | block distributions when `leverage > block_leverage` or `DSCR < block_dscr` | Same metric definitions as the credit metrics (P4-13). | `debtSchedule.ts` (`debt_schedule.py`) | `phase4b` |
| Recovery waterfall | distressed EV at peak-leverage year, senior→junior | EV = `EBITDA×(1−haircut) × entry_mult×(1−haircut) × (1−distressed_cost)`, year-of-default basis (P4-10). | `creditAnalysis.ts` (`reality_check.py`) | `phase4d`, `test_phase4` |

## Returns

| Metric | Formula | Convention / notes | Module | Test |
|---|---|---|---|---|
| Equity IRR | IRR of `[−entry_equity, … distributions + partial proceeds …, residual_post_MIP]` | Mid-year convention shifts interim CFs to t+0.5 (P3-7 disclosure). Partial exits (P4-5) book proceeds at their year. | `returns.ts` | `phase3`, `phase4` |
| MOIC | `(exit_equity + total_distributions) / invested` | `invested` = entry_equity + follow-on add-on equity (D); `exit_equity` = residual-post-MIP + interim partial proceeds. | `returns.ts` (`returns.py`) | `engine-parity`, `addon-equity` |
| Add-on equity | equity/mixed bolt-on `purchase_price × (1 − debt_pct)`, booked at the acquisition year | Outflow in the equity/levered/gross IRR streams + invested base for MOIC; unlevered subtracts the full purchase. Debt-funded bolt-ons = 0 (cost flows via synthetic debt). BS: acquired goodwill + fresh equity (D). | `addOns.ts`, `returns.ts` (`add_ons.py`, `returns.py`) | `addon-equity`, `test_addon_equity` |
| Gross / levered IRR | pre-fee variants | Exclude exit fee, MIP, OID and monitoring termination (sponsor-level). | `returns.ts` | — |
| MIP payout | single hurdle, or highest cleared **ratchet** tier (optional IRR dual hurdle) | Tested on pre-MIP MOIC; promote crystallises on the residual stake at exit (P4-1, P4-5). | `returns.ts` `resolveMipPool` | `phase4` |
| Monitoring termination | `annual_fee × annuity_PV(years, rate)` | Exit year fee dropped; NPV of remaining years accelerated as an exit cost (P4-11). | `returns.ts` `monitoringTerminationPayment` | `phase4g` |
| Fund net IRR / MOIC | LP cashflows after management fee + carry over preferred return | European (whole-fund) or American (deal-by-deal); fees a drag, net MOIC on invested (P4-2). | `fundReturns.ts` (`fund_returns.py`) | `phase4`, `test_phase4` |
| Value bridge | `Δrev + Δmargin + Δmultiple + Δdebt − fees_drag = exit_equity − entry_equity` | Distributions are LP cashflows, not value creation. `fees_drag` includes OID + monitoring termination. | `returns.ts decomposeValueDrivers` | — |

## Three-statement model

| Metric | Formula | Convention / notes | Module | Test |
|---|---|---|---|---|
| NWC balance | days-based `A/R + Inventory − A/P` if DSO/DIO/DPO set, else `revenue × nwc_pct` | Inventory/A-P use cost base `revenue × (1 − EBITDA margin)` as a COGS proxy (P4-9). | `projections.ts nwcBalance` | `phase4f`, `test_phase4` |
| Operating FCF (pre-growth) | `fcf_pre_debt + growth_capex` | PE FCF bridge presentation (P4-6). | `projections.ts` | `phase4e` |
| Goodwill (opening) | purchase-accounting residual that closes the t=0 BS | `(debt + equity) − cash − NWC − PP&E − deferred fin costs`. | `balanceSheet.ts` | `phase3` |
| Balance check | `total_assets − total_liabilities_and_equity` | Closes by construction within the convergence tolerance; a non-zero value is a real integrity flag. | `balanceSheet.ts` (`balance_sheet.py`) | `three-statement`, `test_engine_parity` |
