# LBO Deal Engine — Institutional Architecture Audit & Complete Refactor Plan

**Classification:** Pre-Deployment Institutional Review  
**Date:** 2026-05-24  
**Scope:** Full engine audit — TypeScript client engine, Python backend engine, scenario/fragility sub-engines, Excel export, UI/UX  
**Perspective:** PE Associate · Credit Underwriter · Restructuring Advisor · IC Reviewer  
**Status of Prior Fixes:** 18 verified bugs remediated across PRs #43 / #44. Three build errors fixed (PR #46 / this branch).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Core Architectural Failure Patterns](#2-core-architectural-failure-patterns)
3. [Hidden Assumptions Audit](#3-hidden-assumptions-audit) — *every module*
4. [Institutional Credibility Assessment](#4-institutional-credibility-assessment)
5. [Silent Failure & Dangerous UX Review](#5-silent-failure--dangerous-ux-review)
6. [Pattern Recognition — Likely Undiscovered Bugs](#6-pattern-recognition--likely-undiscovered-bugs)
7. [Product / UX Credibility Risks](#7-product--ux-credibility-risks)
8. [Complete Refactor Plan](#8-complete-refactor-plan) — *all priorities, all items*
9. [Institutionalization Roadmap](#9-institutionalization-roadmap)
10. [What Would Break Under Real Institutional Usage](#10-what-would-break-under-real-institutional-usage)
11. [Final Severity Matrix](#11-final-severity-matrix)

---

## 1. Executive Summary

The engine is a technically ambitious client-side LBO calculator with genuine financial modeling effort. After the 18-bug remediation cycle it is meaningfully closer to institutional quality, but it contains a cluster of **architectural decisions, hidden assumptions, and financial convention deviations** that would make it immediately non-credible in front of a sophisticated audience — not because of individual bugs, but because of structural choices that produce outputs with false precision in areas where the underlying methodology is fundamentally inadequate for the implied use case.

### The Three Root Failures

**1. Dual-engine architecture with no enforced parity.**  
The 18-bug report is the first confirmed iteration of a recurring structural failure. The TypeScript engine and Python engine will diverge again the next time either is changed without mirroring the change in the other. There is no test preventing this.

**2. Hidden assumptions masquerading as configurable parameters.**  
Multiple critical modeling choices are silently hardcoded — static interest rates, annual-only periods, single flat covenant thresholds, trivial recovery waterfall logic, simplified MIP — in ways that produce systematically biased results for identifiable deal types without disclosing the limitation.

**3. The balance sheet does not close.**  
The engine has a debt schedule roll-forward and a cash balance roll-forward, but no year-by-year balance sheet. There is no mechanism to verify that the P&L, cash flow statement, and balance sheet are jointly consistent. Silent errors in tax, NWC, or PIK compounding are invisible.

### Verdict

Suitable as a rapid deal-screening tool for directional analysis by users who understand its limitations.  
**Not suitable** for IC presentation, lender due diligence, or co-investor sharing without Phase 1 and Phase 2 remediation below.

---

## 2. Core Architectural Failure Patterns

### 2.1 Dual-Engine Divergence Is Structural, Not Incidental

**Category: A — Verified**

Seven of the 18 verified bugs arose because fixes applied to the Python engine were not back-ported to TypeScript. This is not a maintenance failure — it is a governance failure. The architecture permits divergence because:

- No shared calculation kernel. Both engines reimplement the same financial logic independently.
- No test suite running both engines on identical inputs and comparing outputs.
- No formal "source of truth" designation. The Python backend is described as "audited" but the live UI runs TypeScript.
- The build pipeline has no cross-engine parity validation step.

**Financial impact:** Users who interact with the UI (TypeScript engine) may receive outputs that differ from any backend analysis. The divergence is not disclosed, not quantified, and not detectable by the user.

**Institutional requirement:** Either deprecate one engine entirely, or maintain a formal parametric parity test that runs on every commit and blocks merge on failure. Parity test must cover at minimum: IRR, MOIC, exit equity, leverage by year, DSCR by year, ECF by year, and net debt at exit.

---

### 2.2 Convergence Loop Is Unsound for PIK-Heavy Structures

**Category: A — Verified (architecture) / B — Probable hidden failure**

The iterative solver converges on `total_cash_interest` as the convergence signal. This is insufficient. In PIK structures, the full feedback chain is:

```
PIK accrual → principal balance → interest_tax_shield → taxable income → FCF → sweep → principal
```

The cash interest delta only captures the direct interest feedback loop. The secondary tax shield feedback loop is missed. For structures with large PIK tranches alongside cash-pay debt, the tax shield feedback can cause the solver to stabilise around a value that passes `delta < 0.01` while the tax-adjusted FCF remains unconverged.

Additional flaws:
- `if (convergenceDelta < TOLERANCE && iter > 0)` — iteration 0 cannot trigger early exit even if the initial guess is already converged. Every deal runs at minimum two iterations unnecessarily.
- `CONVERGENCE_TOLERANCE = 0.01` (£/€/$m) is hardcoded. For a £1B+ deal, 0.01 is 1 basis point of convergence — functionally useless as a guard against divergence. For a £10m deal, it may be too strict. Tolerance should scale with deal size.
- `debt_convergence_failed = true` is set but outputs are still consumed and displayed. A user sees IRR = 22.7% next to a buried flag they may not notice.

---

### 2.3 Balance Sheet Does Not Close

**Category: C — Architectural Risk**

The engine has:
- ✓ Debt schedule roll-forward
- ✓ Cash balance roll-forward (added in BUG-01 fix)
- ✓ Sources & uses at entry

The engine does not have:
- ✗ Year-by-year balance sheet (assets = liabilities + equity)
- ✗ Retained earnings reconciliation (cumulative net income + entry equity = equity at any year)
- ✗ Any check that the debt schedule, P&L, and equity evolution are jointly consistent

Silent errors in tax, NWC, PIK, or depreciation produce invisible inconsistencies. In a properly constructed model, a P&L error shows up in the balance sheet. Here it does not.

**Institutional standard:** Three-statement model (P&L, balance sheet, cash flow statement that closes) is the minimum for institutional LBO analysis.

---

### 2.4 Sensitivity Table Leverage Case Retains BUG-08 Pattern

**Category: A — Verified**

BUG-08 (pro-rata scaling of all tranches in bear scenario) was fixed in `generateScenarios()`. It was **not fixed** in `generateSensitivityTable()` case 4 (leverage sensitivity):

```typescript
// lib/engine/scenarios.ts — generateSensitivityTable, case 4
const scale = newDebt / total;
for (const tr of s.debt_tranches) {
  tr.principal *= scale;           // ALL tranches scaled — identical to BUG-08
  tr.amortization_schedule = [];
}
```

Every cell in the leverage/exit-multiple sensitivity table is computed on a capital structure where senior, mezzanine, and junior debt are all scaled proportionally. No lender would agree to reduce senior debt when a deal is stressed. The sensitivity table is the most-used IC output, and every row is computed on unrealistic capital structures.

**Fix:** Replace with junior-only resize logic (same pattern as the BUG-08 fix in `generateScenarios`).

---

### 2.5 Add-On Debt Does Not Enter the Debt Schedule

**Category: A — Verified**

After the BUG-15 fix, `computeAddOnImpact()` is called in `fullRecalc()` and:
- ✓ `revenue_by_year` is injected into `state.revenue.acquisition_revenue`
- ✓ `ebitda_by_year` is passed to `computeEBITDABridge()`
- ✗ `debt_added_by_year` is computed and discarded

Add-on acquisition debt never modifies `state.debt_tranches`, never enters `buildDebtSchedule()`, and never affects debt service, leverage ratios, coverage metrics, ECF, or sweep capacity.

**Financial impact:** For a buy-and-build strategy with three bolt-ons funded 60% debt, the model:
- Credits the revenue and EBITDA uplift from the acquisitions
- Credits the exit EV uplift from higher EBITDA
- Ignores the debt service cost of the acquisition financing
- Ignores the leverage increase
- Ignores the reduction in sweep capacity

Returns are systematically overstated on any debt-funded add-on strategy. This is the single most consequential active modeling error in the engine.

---

### 2.6 Fragility and Scenario Sub-Engines Do Not Call `computeAddOnImpact()`

**Category: A — Verified**

`fullRecalc()` correctly injects add-on revenue into `state.revenue.acquisition_revenue` before calling `buildProjections()`. Neither `quickCalc()` in `fragility.ts` nor `runFullModel()` in `scenarios.ts` do this:

```typescript
// fragility.ts — quickCalc()
ensureListLengths(state);          // pads acquisition_revenue with zeros
let proj = buildProjections(state); // builds projections WITHOUT add-on revenue
```

```typescript
// scenarios.ts — runFullModel()
ensureListLengths(state);          // pads acquisition_revenue with zeros
let proj = buildProjections(state); // builds projections WITHOUT add-on revenue
```

`ensureListLengths()` pads `acquisition_revenue` to length `hp` with zeros, wiping the add-on injection. The base case (fullRecalc) and the fragility/scenario analyses are computed on materially different revenue bases with no financial justification.

**Impact:** Bear scenario IRR and all fragility stress results understate the deal's actual revenue base. Base case MOIC and scenario MOICs are not comparable.

---

### 2.7 Senior Leverage Uses Array Position, Not Tranche Type

**Category: A — Verified**

```typescript
// lib/engine/creditAnalysis.ts
const seniorDebt = debtSchedule.tranche_schedules.length > 0
  ? debtSchedule.tranche_schedules[0][i]?.ending_balance || 0
  : 0;
const seniorLeverage = yr.ebitda_adj > 0 ? seniorDebt / yr.ebitda_adj : 9999;
```

"Senior debt" = first tranche in array. If the user has added a revolver as the first tranche (common — it is drawn first at closing), senior leverage reports revolver balance / EBITDA. An undrawn revolver at entry shows zero senior leverage, which is not only wrong but actively misleading to a credit underwriter.

**Fix:** Filter by `tranche_type === 'senior'` or by explicit seniority rank. Sum all qualifying tranches.

---

## 3. Hidden Assumptions Audit

### 3.1 Debt Schedule

#### 3.1.1 Interest Rate: Static Across All Hold Years

**Category: E — Modeling Philosophy Weakness**

`effRate = Math.max(tranche.base_rate + tranche.spread, tranche.floor)` uses an identical rate in every year. There is no forward rate curve. For floating-rate debt (the majority of LBO term loans) this means:

- All interest rate sensitivity is zero unless the user manually changes the rate and recalculates
- A deal modeled at peak rates shows static high interest forever — no benefit from rate normalization
- A deal modeled at trough rates shows static low interest forever — no stress from rate hikes
- There is no mechanism to sensitize the deal to a rate cycle (even a simple +200bps / -100bps toggle)

**Institutional convention:** At minimum, a `base_rate_by_year: number[]` field on floating-rate tranches that allows the user to specify a forward SOFR/EURIBOR path. The current single `base_rate` scalar is not configurable per period.

**Incorrect conclusion a user could draw:** That interest costs are locked in at current rates for the entire hold period, creating false certainty in both the upside (if rates are high) and the downside (if rates are low).

#### 3.1.2 Revolver Has No Draw or Repay Mechanics

**Category: C — Architectural Risk**

The revolver tranche has:
- `principal` = commitment size (never changes)
- `commitment_fee` = fee on undrawn balance
- No draw trigger mechanism
- No automatic repayment from excess cash
- No maximum drawing constraint linked to a borrowing base

In practice, an LBO revolver:
- Starts undrawn at closing
- Is drawn when operating cash is insufficient (after debt service, before min_cash floor)
- Is repaid when cash accumulates above the min_cash floor
- Has a springing financial covenant that activates only when drawn >25-35% of commitment

The current model represents the revolver as a static term loan. A revolver always shown as undrawn is decorative. A revolver that should be drawn in a stress scenario to fund shortfalls cannot be modeled.

**Should be user-configurable:** Draw trigger threshold (% of commitment), repayment priority (before or after term loan sweep), springing covenant level.

#### 3.1.3 Scheduled Amortization: Silent Cap Without Warning

**Category: B — Highly Probable Hidden Issue**

```typescript
const scheduledRepayment = yrIdx < sched.length
  ? Math.min(sched[yrIdx], begBal + pikAccrual)
  : 0;
```

If a user enters an amortization schedule that totals more than the original principal (data entry error, or deliberate over-amortization), the engine silently caps repayment at the outstanding balance. The reported total repayments will be less than the user-entered schedule, with no error or warning. A user who believes they have modeled full debt repayment by Year 3 may have residual debt they are unaware of.

#### 3.1.4 PIK Toggle Not Modeled

**Category: D — Product Flaw**

`amortization_type === 'PIK'` is a hard setting — either always PIK or never PIK for the full hold period. Institutional PIK notes are typically PIK-toggle: the issuer elects cash pay or PIK each period based on covenant basket availability. No election mechanism exists.

#### 3.1.5 OID Amortization Is Modeled Incorrectly

**Category: E — Modeling Philosophy Weakness**

The code comments describe `commitment_fee` as representing "an OID / upfront fee amortised as a running cost on the outstanding balance" for term tranches. This is incorrect modeling. Original Issue Discount should be:
- Recognized as interest expense using the effective interest method over the life of the debt
- The yield-to-maturity is the cash coupon rate adjusted for OID amortization
- Prepayment of debt with unamortized OID creates an immediate P&L charge

The current "fee on balance" approach approximates OID as a flat percentage of outstanding balance each year, which is different from effective-interest-method amortization and produces different numbers for any structure with meaningful OID.

#### 3.1.6 Annual Periods Only — No Day Count Convention

**Category: E — Modeling Philosophy Weakness**

All calculations assume annual periods. Institutional debt is typically:
- Term loans: Actual/360 interest on quarterly payment schedule
- HY bonds: 30/360 semi-annual coupon
- PIK notes: Actual/365 annual compounding

The implicit day count (effectively 365/365 annual) understates cash interest costs vs. bank debt on Actual/360 basis by approximately 1-2% annually. For a 5x leveraged deal at 7% interest, this is 35-70bps of annual return impact — material at scale.

#### 3.1.7 No Refinancing Mechanics

**Category: D — Product Flaw**

There is no mechanism to model debt refinancing at Year N (new pricing, new terms, one-time prepayment premium). For any 5+ year hold — the majority of PE hold periods — at least one refinancing scenario should be available. This omission means the model cannot capture:

- The uplift from opportunistic repricing in a tightening spread environment
- The cost of a distressed refinancing in a widening spread environment
- One-time prepayment premiums (common in HY bonds: 102% of par)
- The term-out of a near-maturity revolver

---

### 3.2 Cash Sweep Mechanics

#### 3.2.1 Sweep Pct Applies Regardless of Covenant Compliance

**Category: D — Product Flaw**

`entry.sweep_repayment = share * tierAlloc` allocates sweep cash without checking whether the company is in covenant compliance. In practice, many credit agreements:
- Block the sweep entirely if leverage exceeds a threshold
- Reduce the sweep percentage if DSCR falls below a threshold
- Require a cash trap that retains all excess cash if ICR falls below 1.5x

The engine never cross-references the sweep waterfall with the current-year credit metrics. A deal that breaches covenants in Year 3 (visible in the credit analysis output) would still show full sweep in Year 3.

#### 3.2.2 No Revolver-First Priority in Sweep

**Category: E — Modeling Philosophy Weakness**

Standard credit agreement sweep waterfalls repay the revolver before any term loan. The revolver has the highest priority because it is the most expensive (commitment fee on undrawn) and most flexible. The current sweep waterfall uses explicit `sweep_priority` fields — but if the user doesn't configure a revolver with priority = 0 and term loans with priority = 1, the revolver is swept at the same tier as term loans.

**Should be automatic:** Revolvers should always be prioritized above term loans in the sweep waterfall, enforced by the engine rather than relying on user configuration.

#### 3.2.3 Cash Trap and Dividend Restriction Mechanics Not Modeled

**Category: D — Product Flaw**

Credit agreements commonly include:
- A cash trap covenant that retains all FCF at the borrower level when leverage exceeds a trigger
- Restricted payment basket limiting dividends/distributions when leverage is above a threshold
- Blocker provisions preventing upstream distribution during covenant breach

`interim_distributions` is a user-entered array. There is no check that distributions are permissible under the credit agreement at any point. A model showing large interim distributions in Year 2 despite a leverage breach in Year 2 is misleading.

---

### 3.3 Interest Calculation

#### 3.3.1 PIK Tax Shield Timing May Be Wrong

**Category: B — Highly Probable Hidden Issue**

```typescript
entry.interest_tax_shield = shield ? (entry.cash_interest + entry.pik_accrual) * taxRate : 0;
```

PIK interest tax shield is credited in the year the PIK accrues. In many jurisdictions:
- UK: PIK interest is only deductible when paid (not accrued) under the loan relationship rules
- US: PIK deductibility depends on whether the instrument is a "high-yield discount obligation"
- Germany: Interest barrier rules limit deductible interest to 30% of EBITDA

The engine may be over-crediting tax shields in PIK-heavy structures, understating taxes, and overstating FCF — precisely for the deal types where the convergence loop is also least reliable. The net effect is a double favorable bias in PIK structures.

#### 3.3.2 Financing Fee Amortization Period Mismatch

**Category: E — Modeling Philosophy Weakness**

```typescript
const finFeeAmort = financingFees / hp;
```

Financing fees are amortized over the holding period (`hp`). In practice, financing fees are amortized over the contractual life of the debt facility, which differs from the holding period. If a 7-year term loan is held for 5 years:
- Correct: amortize over 7 years, write off remaining 2 years of unamortized OID at exit
- Current: amortize over 5 years (front-loads the expense, understates residual at exit)

If a 5-year term loan is held for 3 years:
- Correct: amortize over 5 years, then write off remaining 2 years at refinancing/exit
- Current: amortize over 3 years (spreads over shorter period, overstates annual amortization)

---

### 3.4 Returns Module

#### 3.4.1 MOIC Denominator Includes Fees That May Not Belong

**Category: E — Modeling Philosophy Weakness**

```typescript
const entryEquity = enterprise_value + entryFee + transaction_costs + financingFees - total_debt_raised;
```

Entry equity (the denominator for MOIC and IRR) includes: EV + entry advisory fee + transaction costs + financing fees - debt. This is the total cash outflow from the sponsor. Whether this is the correct MOIC denominator depends on the LP agreement:

- Some funds compute MOIC on "invested capital" = equity check only (excluding fees borne by the fund vehicle)
- Some compute on "total cost" including deal fees charged to the portfolio company

The engine hardcodes one definition. Both definitions are institutionally used. Neither is disclosed. Users comparing the engine's MOIC to a benchmark LP report may be comparing incompatible definitions.

#### 3.4.2 DPI = MOIC at Exit Is a Simplification

**Category: D — Product Flaw**

```typescript
dpi: moic,  // At full exit all proceeds are realised, so DPI = MOIC.
```

This is logically correct at the moment of full exit but wrong for any partial-exit scenario and wrong for fund-level reporting where DPI and MOIC diverge once management fees and carry are applied. The comment accurately describes the simplification, but the metric should either show fund-level DPI (post-carry, post-management-fee) or be explicitly labeled as "deal-level MOIC at full exit" to avoid confusion with LP-facing DPI.

#### 3.4.3 Mid-Year Convention Applied Inconsistently

**Category: B — Highly Probable Hidden Issue**

```typescript
function buildTimeVector(hp: number, midYear: boolean): number[] | null {
  if (!midYear) return null;
  return [0, ...Array.from({ length: hp - 1 }, (_, t) => t + 0.5), hp];
}
```

This vector places:
- Initial investment at t=0 ✓
- Year 1 distribution at t=0.5 ✓
- Year 2 distribution at t=1.5 ✓
- Exit at t=hp (year-end) ✓

The issue: the underlying projection engine (debt schedule, FCF) computes all cash flows at year-end. The mid-year convention applied only to the IRR cash flow vector without also shifting the FCF generation model creates a timing inconsistency. The same annual FCF that was generated by an annual-period model is assigned to mid-year timing in the IRR — effectively saying "this cash was available 6 months earlier than modeled." This systematically overstates IRR under mid-year convention by approximately half the annual discount rate on each interim distribution.

#### 3.4.4 Cash Yield Is Not a Standard Institutional Metric

**Category: D — Product Flaw**

```typescript
const cashYieldAvg = entryEquity > 0 && hp > 0 ? (totalFcfEq / hp) / entryEquity : 0;
```

`totalFcfEq / hp` is average annual FCF to equity. `/ entryEquity` gives average cash-on-cash yield. This metric is not standard in PE reporting. It confuses with:

- Current yield (interest/coupon as % of price) — credit metric
- Cash yield on equity (dividends / equity value) — public equity metric
- DPI by year (LP reporting metric)

It should be removed or replaced with the standard LP metric: DPI progression by year, which `dpi_by_year` already computes.

#### 3.4.5 Payback Period Uses Integer Years Only

**Category: E — Modeling Philosophy Weakness**

```typescript
if (cumulative >= 0 && t > 0) { payback = t; break; }
```

Payback is reported in whole years (the year in which cumulative cash turns positive). Interpolated payback (linear interpolation within the turning year) is more accurate and is standard in most DCF models. The difference can be up to 12 months — material for a 4-5 year hold.

#### 3.4.6 No Fund-Level Return Metrics

**Category: D — Product Flaw**

The engine computes deal-level returns. LP-facing returns require:
- Management fees on committed/invested capital deducted from fund cash flows
- Carried interest (typically 20% above an 8% preferred return)
- Clawback provisions
- Return-of-capital-first waterfall

A GP presenting this model to an LP without fund-level adjustments would be misrepresenting returns. Net IRR (post-carry, post-management-fee) is typically 300-600bps below gross IRR on a well-performing fund.

---

### 3.5 Value Driver Decomposition

#### 3.5.1 Bridge Cannot Distinguish PIK Capitalization from Cash Debt Paydown

**Category: E — Modeling Philosophy Weakness**

`deltaDebt = entryNetDebt - exitNetDebt`. This captures total deleveraging regardless of source. A deal that repays debt through operational cash sweep has a different value creation story than a deal where PIK is capitalising (increasing debt) but cash debt is swept aggressively. The bridge merges these into a single "deleveraging" bar. IC reviewers expect to understand how much of the debt paydown came from operations vs. financial engineering.

#### 3.5.2 Fees Drag Lumps Structurally Different Fee Categories

**Category: E — Modeling Philosophy Weakness**

`feesDrag = entryFee + transactionCosts + financingFees + exitFee + mipPayout`

This aggregates:
- Entry advisory fee (PE firm revenue — controversial inclusion)
- Transaction costs (legal, accounting — unavoidable deal friction)
- Financing fees (bank fee — cost of debt)
- Exit fee (PE firm revenue)
- MIP payout (management compensation — value-sharing, not fee drag)

Institutional bridge presentations separate these categories because they have different policy implications. Bundling MIP with fees implies management is a cost rather than an aligned value creator.

---

### 3.6 Credit Analysis

#### 3.6.1 FCCR Uses Total Capex, Not Maintenance Capex

**Category: A — Verified (unresolved after BUG-12 fix)**

```typescript
// creditAnalysis.ts
const numeratorFCCR = yr.ebitda_adj - yr.total_capex - yr.tax;
```

Most credit agreements define FCCR with maintenance capex only, excluding growth capex as discretionary. Using total capex overstates conservatism for growth-investing companies and misaligns with the credit agreement definition. A company spending £20m growth capex against a DSCR covenant defined on maintenance capex only would show FCCR covenant compliance in the agreement but a breach in this model.

**The same error was re-introduced in Python (BUG-12 fix) because the Python used `total_capex` too.**

**Fix:** Add `maintenance_capex_pct_revenue` to `MarginAssumptions`. Use it in FCCR numerator. `total_capex` remains in FCF calculations (cash is cash).

#### 3.6.2 Covenant Levels Are Static — No Step-Down Schedule

**Category: D — Product Flaw**

```typescript
// dealEngineTypes.ts
interface CreditCovenants {
  leverage_covenant: number;   // single number
  dscr_covenant: number;       // single number
  fccr_covenant: number;       // single number
}
```

Real credit agreements have stepping covenants:
- Leverage: 6.5x → 6.0x → 5.5x → 5.0x over the hold period
- DSCR: 1.15x → 1.20x → 1.25x (tightening as business matures)
- Springing covenants that only activate when revolver utilization exceeds 35%

Single static thresholds mean: a deal passing 5.0x leverage in Year 1 against a 6.5x covenant (5 turns of headroom) looks identically compliant as in Year 5 against a 5.0x covenant (zero headroom). The model cannot show the increasing covenant tightness that is the primary credit risk in a standard LBO financing.

**Fix:** Replace single scalars with `leverage_covenant_by_year: number[]` etc. Default: flat at entry value, same as today.

#### 3.6.3 Recovery Waterfall Uses Entry EV × 50%, Static

**Category: E — Modeling Philosophy Weakness**

```typescript
const stressEV = state.entry.enterprise_value * 0.5;
```

Recovery should reflect:
- EV at the point of default (based on EBITDA at that year × distressed multiple)
- Distressed transaction costs (10-15% additional haircut on top of EV haircut)
- Priority waterfall by security type (first lien, second lien, mezzanine, equity)
- Jurisdiction-specific insolvency rules

Using entry EV × 0.5 as the recovery basis means:
- The same recovery appears regardless of when in the hold period default occurs
- A company that has grown significantly would show identical recovery as at entry
- The 50% haircut is not disclosed as an assumption and is not configurable

#### 3.6.4 Credit Rating Is a Static Heuristic Shown as Hard Output

**Category: D — Product Flaw, F — UX Risk**

```typescript
if (entryLeverage <= 3) rating = 'BBB';
else if (entryLeverage <= 4) rating = 'BB+';
else if (entryLeverage <= 5) rating = 'BB';
```

This is solely a function of entry leverage with no consideration for:
- Industry (cyclicality, asset intensity)
- Coverage ratios (DSCR, FCCR)
- Business quality (recurring revenue, margin stability)
- Amortization profile (bullet vs. amortizing)
- Jurisdiction
- Management quality

Showing "BB+" as a credit rating estimate in a deal model is dangerous. Users or recipients may take it as a proxy for actual credit quality. No real rating agency produces an opinion based solely on entry leverage multiple.

**Recommendation:** Remove the credit rating estimate entirely, or replace with "Indicative: BB–BB+ range based on leverage. Does not account for coverage, industry, or qualitative factors."

---

### 3.7 Scenario Generation

#### 3.7.1 Bear Scenario Has No Credit Analysis Output

**Category: D — Product Flaw**

The bear scenario computes IRR and MOIC but does not run a credit analysis. IC reviewers routinely ask: "Does the company survive the bear case? Does it breach covenants? When?" The engine cannot answer this because there is no debt schedule or credit analysis output for scenarios — only a scalar IRR/MOIC pair.

#### 3.7.2 Scenario MOIC/IRR Has No Explanation Bridge

**Category: D — Product Flaw**

Bear IRR = 14.2%, Base IRR = 22.7%, Bull IRR = 31.1%. These numbers appear with no explanation of what drove the differences. An IC presentation requires a delta bridge: "Bear case is 8.5pp lower than base because: growth impact = -4.2pp, margin impact = -2.1pp, multiple impact = -2.2pp." The value driver decomposition exists for the base case but is not computed for scenarios.

#### 3.7.3 Growth Rate in Sensitivity Tables Is Flat Across All Years

**Category: E — Modeling Philosophy Weakness**

```typescript
// generateSensitivityTable
s.revenue.growth_rates = Array(s.exit.holding_period).fill(growth);
```

Every sensitivity table uses a flat growth rate applied uniformly to all hold years. Real growth trajectories ramp (high organic growth early, maturing to normalized by Year 4-5). A sensitivity using 5% flat vs. a base case with [7%, 6%, 5%, 4%, 4%] produces a fundamentally different revenue path despite having similar averages. The sensitivity table shows a table of scenarios that don't correspond to any realistic operating trajectory.

#### 3.7.4 Bear Leverage Not Updated in Year-by-Year Credit Metrics

**Category: B — Highly Probable Hidden Issue**

The BUG-09 fix computes bear forward EBITDA for debt sizing at entry. But the bear scenario's credit metrics (leverage by year, DSCR by year) are computed using the bear EBITDA trajectory against the bear opening debt stack. If the bear opening debt is lower (correct), but the bear EBITDA trajectory is also lower (bear assumptions), leverage in Years 2-5 may actually be higher in the bear than the base — covenant breach risk. This can only be assessed if the scenario has a per-year credit analysis, which it does not.

---

### 3.8 Working Capital

#### 3.8.1 Single NWC % Cannot Model Operational Improvement

**Category: E — Modeling Philosophy Weakness**

NWC is modeled as `delta_nwc = (revenue - prevRevenue) * nwcPct` using a single constant. Real NWC modeling involves:
- DSO (days sales outstanding): A/R = revenue × DSO / 365
- DIO (days inventory outstanding): Inventory = COGS × DIO / 365
- DPO (days payable outstanding): A/P = COGS × DPO / 365

A key value creation lever in PE (especially supply-chain-intensive businesses) is DPO extension (improving supplier payment terms), DSO reduction (collecting receivables faster), and DIO reduction (lean inventory). None of this can be modeled. The single NWC% implicitly says "NWC efficiency never changes."

#### 3.8.2 NWC Balance Is Never Reconciled to a Balance Sheet Position

**Category: C — Architectural Risk**

`delta_nwc` is modeled but the absolute NWC balance is never computed. Cumulative NWC movements should result in a verifiable NWC balance (A/R + Inventory - A/P). Without the balance, there is no check that:
- Cumulative NWC movements don't produce a negative NWC balance (which would mean accounts payable > all current assets — unusual)
- The working capital peg at exit (standard in M&A) is consistent with the model

#### 3.8.3 No Seasonality

**Category: E — Modeling Philosophy Weakness**

Annual NWC movements smooth peak working capital requirements. For retail (inventory build before Christmas), hospitality, or manufacturing businesses with seasonal demand, peak WC requirements may be 2-4x the annual average. No seasonal WC facility or RCF draw is modeled. A business that would draw its revolver for 3 months per year for seasonal WC shows no revolver usage in this model.

---

### 3.9 Management Incentive Plans

#### 3.9.1 Single Hurdle, No Ratchet

**Category: D — Product Flaw**

The MIP is modeled as: if MOIC ≥ hurdle_moic, pay mip_pool_pct × exit_equity. Institutional MIP structures typically include:
- Dual hurdles (both MOIC and IRR must be met)
- Ratchet (equity %, not just payout, increases with MOIC above hurdle — e.g., 10% pool at 2.0x, 15% pool at 2.5x, 20% pool at 3.0x)
- Good leaver / bad leaver provisions (partial vesting on early departure)
- Anti-dilution provisions protecting management against new equity issuances

#### 3.9.2 MIP Cost Basis Not Modeled

**Category: E — Modeling Philosophy Weakness**

Management sweet equity is typically purchased at nominal value (e.g., £0.01 per share). The engine models MIP as a share of exit equity but does not model the management equity as a separate cost basis, tax treatment, or P&L dilution. This means:
- The management equity investment at entry is not reflected in entry sources & uses
- The tax treatment (income tax on exercise vs. capital gains on sweet equity) is ignored
- There is no modeling of management's own IRR vs. the sponsor's IRR

---

### 3.10 Exit Assumptions

#### 3.10.1 Exit Multiple Applied to Year-End EBITDA, Not LTM at Exit

**Category: E — Modeling Philosophy Weakness**

`exitEv = exitEbitda * exit_ebitda_multiple` where `exitEbitda = projections[projections.length - 1].ebitda_adj`.

In practice, an exit process commences 12-18 months before signing. The EBITDA used for exit valuation is typically LTM EBITDA at signing, which is approximately midyear of the final hold year. For a company growing at 10% per annum, LTM EBITDA at signing (6 months into Year 5) is approximately Year 4.5 EBITDA — about 5% below the full Year 5 EBITDA used in the model.

This overstatement of exit EV is correlated with growth rate: faster growing companies are more overvalued at exit by this simplification.

#### 3.10.2 No Exit Transaction Costs Beyond Advisory Fee

**Category: E — Modeling Philosophy Weakness**

Exit costs in the model = `exit_fee_pct × exitEV`. Real exit costs include:
- Exit advisory fee (the model has this)
- Sell-side legal costs (typically £0.5-2m depending on deal size)
- Management retention bonuses (often 1-2% of equity at exit)
- Director & officer insurance "tail" policy
- Working capital adjustment true-up (often $2-10m in M&A)
- Regulatory filing fees
- Any reps & warranties insurance premium

#### 3.10.3 No Partial Exit or IPO Mechanics

**Category: D — Product Flaw**

Exit is always full and instantaneous. This precludes modeling:
- IPO with 20-30% initial float + lockup + subsequent selldown over 18-24 months
- Secondary buyout with partial rollover equity
- Dividend recap as a de facto partial exit
- Strategic sale with earnout provisions (deferred consideration)

The `exit_ev_override` field allows a fixed EV, but it still models a clean full exit.

---

### 3.11 Add-On Acquisitions (After BUG-15 Fix)

#### 3.11.1 Add-On Debt Not in Debt Schedule

*(See Section 2.5 — highest priority active defect)*

#### 3.11.2 Add-On Revenue Grows at Base Business Rate

**Category: E — Modeling Philosophy Weakness**

```typescript
const addOnGrowth = yearsOwned > 0 && i < state.revenue.growth_rates.length
  ? state.revenue.growth_rates.slice(yrIdx, i).reduce((acc, g) => acc * (1 + g), 1)
  : 1;
```

Acquired businesses have their own growth profile, typically different from the platform. A high-growth bolt-on might grow faster; a defensive bolt-on might grow slower. Applying the platform growth rate to all add-ons forces a false uniformity.

#### 3.11.3 Revenue Synergies Recognized Immediately from Year 2

**Category: E — Modeling Philosophy Weakness**

```typescript
revenueByYear[i] += ... + (yearsOwned > 0 ? addon.synergy_revenue : 0);
```

Revenue synergies appear fully in Year 2 (year after acquisition). Institutional models typically ramp synergies over 2-4 years (50% Year 1, 75% Year 2, 100% Year 3+) to reflect integration timelines. Full Day 1 synergy recognition (even if deferred one year) is aggressive.

#### 3.11.4 No Multiple Arbitrage in Add-On Return Attribution

**Category: E — Modeling Philosophy Weakness**

A core buy-and-build thesis is "acquire at 6x, platform exits at 10x → multiple arbitrage contributes return." The engine models add-on EBITDA as contributing to exit EV at the exit multiple, which implicitly captures the multiple arbitrage. But this is not explicitly attributed in the value bridge. The bridge shows "revenue growth" and "multiple expansion" but cannot isolate "add-on multiple arbitrage" as a distinct driver.

---

### 3.12 Fees

#### 3.12.1 Monitoring Fee Termination Not Modeled

**Category: E — Modeling Philosophy Weakness**

Monitoring fees are deducted every year including the exit year. In practice:
- Monitoring fee agreements terminate on exit (no fee in exit year)
- The NPV of remaining monitoring fees is often accelerated into a "termination fee" at exit, which is an additional exit cost

The model double-deducts: annual monitoring fee drag persists AND exit fee is charged on full EV.

#### 3.12.2 Default DSCR Covenant of 1.15x Is Too Aggressive

**Category: F — UX Risk for Financial Users**

`DEFAULT_DSCR_COV = 1.15` in `creditAnalysis.ts`. Most institutional LBO credit agreements set DSCR covenants at 1.25x or higher. A user who does not modify the covenant defaults gets credit headroom calculated against a covenant level that would not be accepted by most lenders. This understates covenant tightness across the entire model output.

---

## 4. Institutional Credibility Assessment

### What Breaks Immediately with Sophisticated Users

| Dimension | Current State | Institutional Standard | Verdict |
|---|---|---|---|
| Period granularity | Annual only | Quarterly minimum | ❌ |
| Revolver mechanics | Static — no draw/repay | Dynamic draw/repay from cash | ❌ |
| Interest rates | Static scalar | Forward curve or rate steps | ❌ |
| Covenant structure | Single flat level | Stepping, springing, trailing 12M | ❌ |
| Exit mechanics | Single full exit | Partial, IPO lockup, earnout | ❌ |
| Refinancing | Not modeled | Required for 5Y+ models | ❌ |
| Balance sheet | Absent | Three-statement minimum | ❌ |
| MIP | Single hurdle | Ratchet, dual hurdle, vesting | ❌ |
| Tax | Flat rate + NOL | DTL, BEAT, interest limitation | ❌ |
| Add-on debt | Revenue modeled, leverage not | Both required | ❌ |
| Sensitivity table leverage | Pro-rata all tranches | Junior-only resize | ❌ |
| Senior leverage metric | First tranche only | Filter by tranche_type | ❌ |
| Average balance interest | ✓ Fixed | Required | ✓ |
| Net debt at exit | ✓ Fixed | Required | ✓ |
| Sweep priority waterfall | ✓ Fixed | Required | ✓ |
| Cross-engine parity | None | Test suite required | ❌ |
| Credit rating display | Leverage-only heuristic | Remove or heavily caveat | ❌ |

---

## 5. Silent Failure & Dangerous UX Review

### 5.1 Convergence Failure Displays Numbers Without Blocking Trust

When `debt_convergence_failed = true`, `fullRecalc()` returns a fully-populated `ModelState` including IRR, MOIC, and all credit metrics — computed on an unconverged debt schedule. If the UI renders these numbers identically to converged results (perhaps with only a small badge or warning), users will trust them. For the deal types most likely to fail convergence (large PIK with complex waterfall), the numbers are systematically wrong in a favorable direction.

**Required fix:** When convergence fails, all return metrics and credit metrics must be visually degraded (greyed out, marked "⚠ Unconverged"), not just flagged with a boolean.

### 5.2 Add-On Revenue Without Leverage Creates Impossible Economics

A user modeling a buy-and-build strategy sees IRR improved by add-ons (correct, revenue is captured) without any increase in leverage (incorrect, acquisition debt is ignored). This creates the appearance of a free lunch: add more bolt-ons → higher returns with no financing cost. Any experienced reviewer would immediately identify this as a defect, but an inexperienced user would take the output at face value.

### 5.3 Sensitivity Table Is the Most-Trusted Output and Is Wrong

The leverage/exit-multiple sensitivity table is the most commonly shown output in IC presentations. Every leverage cell uses an unrealistic capital structure (all tranches scaled pro-rata). The table looks correct — it has numbers, labels, and a coherent range — but every value is computed on a capital structure no lender would approve. This is the highest-credibility-risk active defect.

### 5.4 Fragility Analysis Uses a Different Revenue Base Than Base Case

The fragility "how fragile is this deal?" analysis runs on base state without add-on revenue. The base case display includes add-on revenue. For a deal with meaningful add-on activity:
- Base case: IRR = 24.1% (with add-ons)
- Fragility analysis: "minimum growth rate for 2.0x MOIC" = X% (computed without add-ons)

The fragility result is not a sensitivity on the base case — it's a sensitivity on a different, lower-revenue model. The apparent robustness of the deal is overstated.

### 5.5 Currency Symbol Hardcoded as £ in All Engine String Output

```typescript
// realityCheck.ts, multiple locations
description: `NWC grows from £${entryNwc.toFixed(1)}m...`
```

Every warning message, reality check flag, and description string uses `£` regardless of `state.currency`. A USD-denominated deal shows pound signs in all analytical outputs. This is visible to any user not running a GBP deal and immediately undermines credibility.

### 5.6 Reality Check Thresholds Are All Hardcoded

Every rule threshold in `realityCheck.ts` is embedded in source code:
- Rule 3: leverage > some threshold (hardcoded)
- Rule 7: NWC drag > 15% of FCF (hardcoded)
- Rule 8: D&A/capex ratio threshold (hardcoded)
- Sector median multiples (hardcoded by sector)

These thresholds are not disclosed in the UI, not configurable by the user, and not appropriate for all sectors. A technology deal at 12x entry multiple triggers the overvaluation warning even though 12x is standard for SaaS. Users cannot distinguish between a rule that flags a genuine risk and one that is firing because the threshold doesn't match their sector.

### 5.7 Bear/Bull/Stress Labels Imply Rigorous Stress Testing

The scenario names ("Bear," "Stress") and their hardcoded shock magnitudes (-200bps growth, -1.5x exit multiple) imply a disciplined stress testing framework. They are actually three arithmetic perturbations of the base case with no correlation modeling, no credit analysis, no covenant check, and no explanation of the return delta. An IC reviewer expecting "stress test" to mean "we have verified the company does not breach covenants and can service debt in the bear case" will not find that here.

### 5.8 NWC Explicit Method Migration Risk

After the BUG-14 fix, `nwc_movement_method === 'explicit'` silently falls back to `'pct_change'`. Any saved model with `explicit` set expected zero NWC movements. After loading, NWC movements are reintroduced without warning. Returns will change. Users who notice will not understand why; users who do not notice will trust incorrect numbers.

---

## 6. Pattern Recognition — Likely Undiscovered Bugs

Based on the observed pattern of bugs, ranked by probability:

### 6.1 Excel Export Has Diverged From Engine

**Probability: Very High**

`lib/engine/excelExport.ts` is a large file with formula-level hardcodings of financial calculations. Historical patterns show the TS engine diverged from Python; the Excel export is likely diverging from both. Specific formulas at risk of staleness:

- Net debt = gross debt - min_cash (BUG-02 pattern — export likely still does this)
- Interest on beginning balance (BUG-03 pattern)
- Value bridge including distributions (BUG-05 pattern)
- RVPI using gross debt (BUG-06 pattern)
- Gross IRR using inconsistent fee treatment (BUG-07 pattern)

Every bug that was fixed in the engine is a candidate for a stale formula in the Excel export. The export must be audited against the current engine for every fixed bug.

### 6.2 `updateProjectionsWithDebt` Contains Stale Calculation Logic

**Probability: High**

`updateProjectionsWithDebt()` patches projection year objects with debt-dependent values (interest expense, FCF to equity). If this function contains any independent interest calculation (rather than purely consuming from the debt schedule output), it could contain pre-fix calculation logic that diverges from the corrected `buildDebtSchedule()`. The convergence loop calls this function on every iteration — any stale logic here would compound across iterations.

### 6.3 Scenario EBITDA Bridge Uses Static LTM Instead of Module Output

**Probability: High**

`computeEBITDABridge()` was updated to accept an optional `AddOnImpact`. `fullRecalc()` passes it correctly. If any scenario comparison view, sensitivity table detail, or secondary output calls `computeEBITDABridge(state, proj)` without the third argument, it silently falls back to static LTM EBITDA for add-on attribution — producing a different bridge than the base case display.

### 6.4 PIK Tax Shield Is Deductible When Paid in Several Jurisdictions

**Probability: High**

As documented in Section 3.3.1. The tax shield is credited on accrual for all PIK structures, regardless of jurisdiction. In the UK (the default currency is GBP, implying UK deals), PIK interest is typically deductible only on payment. This creates a systematic overstatement of FCF for UK PIK structures.

### 6.5 Bear Case Equity Check Is Not Consistent After Debt Resize

**Probability: Medium**

After the BUG-08/09 fix, the bear scenario:
1. Reduces junior tranche principal
2. Calls `deriveEntryFields(bear)` which recomputes `equity_check = EV + fees - new_total_debt`
3. The bear equity check is now higher (less debt = more equity)

But the bear EV is not recalculated. The bear case uses the same EV as base despite lower leverage. An analyst would expect: if bear leverage is 0.5x lower, bear equity contribution is higher by the same amount. The scenario correctly reduces debt but doesn't adjust EV, creating an inconsistent capital structure where debt + equity ≠ EV + fees.

### 6.6 Sweep ECF and Reported ECF Use Different Floor Shortfall Bases

**Probability: Medium**

In the per-year loop: `floorShortfall = Math.max(0, minCash - cashBalance)` — uses current-period cashBalance (before updating for this period's repayments).

In the aggregate metrics loop: `aggFloorShortfall = Math.max(0, minCash - cashBalanceByYear[yrIdx - 1])` — uses prior-year cashBalance.

These two calculations are supposed to represent the same thing (floor shortfall). They use different bases. In years where the floor is being funded from zero, both are zero (identical). In years where the floor is partially funded, they may differ — the reported ECF and the ECF used for sweep can diverge.

---

## 7. Product / UX Credibility Risks

### 7.1 Credit Rating Must Be Removed or Heavily Caveated

Showing a credit rating estimate (BB, BB+) as a hard output is the highest credibility risk in the UI. No institutional user — PE, credit fund, bank, or restructuring advisor — would accept a model-generated rating. Options:
1. Remove entirely
2. Replace with indicative leveraged loan / HY bond characterization (e.g., "Broadly Syndicated Loan territory" vs. "Club/HY territory") without a rating label
3. Show a range with a prominent disclaimer and no implied precision

### 7.2 Scenario Labels Create False Confidence

"Bear" and "Stress" are terms of art in institutional finance. They imply rigorous scenario construction with correlated inputs, credit analysis, liquidity analysis, and covenant testing. The current scenarios are arithmetic perturbations. At minimum:
- Rename to "Downside" and "Severe Downside" to avoid implying institutional methodology
- Add a tooltip/disclosure stating the scenario construction methodology
- Add per-scenario credit metrics (or a disclaimer that they are not available)

### 7.3 Reality Check Rules Without Sector Context

All rules fire based on universal thresholds. The UI should:
- Show the threshold being applied alongside the warning (e.g., "Entry multiple 11.2x > 10.0x threshold")
- Allow the user to see which rule triggered and why
- Either make thresholds configurable (advanced) or display sector-adjusted defaults

### 7.4 IRR Displayed to Basis Point Precision

IRR = 22.7% implies a level of precision that the annual-period, static-rate, simplified-MIP model cannot support. The methodology has modeling uncertainty of ±200-400bps from period granularity, rate assumptions, and convention differences alone. Display IRR to the nearest 0.5% or 1% (e.g., "~23%") and state the key modeling conventions in a footer.

### 7.5 Default Values Should Be Defensibly Conservative

| Default | Current | Recommended |
|---|---|---|
| DSCR covenant | 1.15x | 1.25x |
| FCCR covenant | 1.10x | 1.15x |
| Leverage covenant | 6.0x | Depends on leverage_ratio |
| Monitoring fee | 0 | Not critical |
| Entry fee | 2% | Not critical |

A DSCR covenant of 1.15x is aggressive (most bank-arranged LBO financings require 1.25x). The default creates the illusion of covenant compliance where tighter but more realistic covenants would show a breach.

---

## 8. Complete Refactor Plan

*This section covers every identified issue. Items are labeled by phase and priority.*

---

### PHASE 0: Build Integrity (Complete Now)

These are blocking the production build. Address before anything else.

| ID | Issue | File | Fix |
|---|---|---|---|
| P0-1 | ✅ Unused `t` in sweepIndices map | `debtSchedule.ts:125` | Rename to `_t` |
| P0-2 | ✅ Stale `currency` in EntryAssumptions default | `modelState.ts:155` | Remove field |
| P0-3 | ✅ Missing `total_commitment_fees_by_year` in debt_schedule default | `modelState.ts:198` | Add empty array |

*P0-1, P0-2, P0-3 resolved in this branch.*

---

### PHASE 1: Critical Active Defects (Block Institutional Use)

These produce materially wrong outputs for identifiable deal types. Fix before any user-facing deployment.

#### P1-1: Fix Sensitivity Table Pro-Rata Scaling (BUG-08 Unresolved)

**File:** `lib/engine/scenarios.ts` — `generateSensitivityTable()`, case 4  
**Severity:** Critical  
**Fix:**
```typescript
// Replace pro-rata scaling:
const scale = newDebt / total;
for (const tr of s.debt_tranches) { tr.principal *= scale; }

// With junior-only resize (same as generateScenarios bear fix):
const delta = newDebt - total;
if (s.debt_tranches.length > 0) {
  const juniorIdx = s.debt_tranches.length - 1;
  s.debt_tranches[juniorIdx].principal = Math.max(0, s.debt_tranches[juniorIdx].principal + delta);
  s.debt_tranches[juniorIdx].amortization_schedule = [];
}
```
**Test:** Run sensitivity table case 4 on a two-tranche (senior + junior) structure. Verify senior principal is unchanged across all leverage cells.

---

#### P1-2: Inject Add-On Debt into Debt Schedule

**Files:** `lib/engine/addOns.ts`, `lib/engine/index.ts`, `lib/engine/debtSchedule.ts`, `lib/dealEngineTypes.ts`  
**Severity:** Critical  
**Fix:** `computeAddOnImpact()` returns `debt_added_by_year: number[]`. In `fullRecalc()`, after computing `addOnImpact`, create synthetic debt schedule entries representing the incremental acquisition debt. Options:
1. **Simplest:** Increase the most junior tranche's principal by the cumulative add-on debt. Clear the amortization schedule and let the bullet/sweep mechanics handle it.
2. **Correct:** Create one new debt tranche per add-on acquisition (appears in Year N as a bullet maturing at exit) and add it to `state.debt_tranches` before running the debt schedule loop.

Option 2 is correct. The new tranches need the following fields at minimum: `name`, `tranche_type: 'senior'` (or configurable), `principal = debt_added_by_year[yrIdx]`, `interest_rate` (copy from a reference tranche or user-configurable), `amortization_type: 'bullet'`, `amortization_schedule: [0, ..., 0, principal]` (matures at exit).

**Test:** Model a £100m bolt-on acquisition in Year 2 funded 60% debt (£60m). Verify that from Year 2 onwards, total debt increases by £60m, interest expense increases by £60m × rate, and DSCR decreases accordingly.

---

#### P1-3: Inject Add-On Revenue into Fragility and Scenario Engines

**Files:** `lib/engine/fragility.ts`, `lib/engine/scenarios.ts`  
**Severity:** Critical  
**Fix:** Both `quickCalc()` and `runFullModel()` must call `computeAddOnImpact(state)` and inject the result before `buildProjections()`:

```typescript
// At the top of quickCalc() and runFullModel(), after ensureListLengths():
import { computeAddOnImpact } from './addOns';

const addOnImpact = computeAddOnImpact(state);
state.revenue.acquisition_revenue = addOnImpact.revenue_by_year;
```

**Test:** Model a deal with one bolt-on. Verify that base case IRR (fullRecalc) and bear case IRR (generateScenarios) use the same add-on-adjusted revenue base. Verify that fragility analysis IRR at base-case inputs matches fullRecalc IRR.

---

#### P1-4: Fix Senior Leverage Metric in Credit Analysis

**File:** `lib/engine/creditAnalysis.ts`  
**Severity:** High  
**Fix:**
```typescript
// Replace array-position lookup:
const seniorDebt = debtSchedule.tranche_schedules[0][i]?.ending_balance || 0;

// With type-filtered sum:
const seniorDebt = state.debt_tranches.reduce((sum, tranche, tIdx) => {
  const isSenior = tranche.tranche_type === 'senior' || tranche.tranche_type === 'unitranche';
  return isSenior
    ? sum + (debtSchedule.tranche_schedules[tIdx]?.[i]?.ending_balance ?? 0)
    : sum;
}, 0);
```
**Test:** Create a deal with revolver (type = 'revolver') in position 0 and term loan (type = 'senior') in position 1. Verify senior leverage uses term loan balance only.

---

#### P1-5: Convergence Failure Must Degrade Output Display

**Files:** `lib/engine/index.ts` (flag exists), UI components consuming `returns.debt_convergence_failed`  
**Severity:** High  
**Fix:** When `debt_convergence_failed = true`, the returns object should include a `convergence_warning` string and all IRR/MOIC/RVPI values should be accompanied by an unreliable flag. The UI must render convergence-failed returns in a visually distinct state (greyed, strikethrough, warning banner above output panels) that cannot be dismissed without acknowledgment.

---

#### P1-6: Cross-Engine Parity Test Suite

**Files:** New: `tests/engine-parity.test.ts`  
**Severity:** Critical (architectural)  
**Fix:** Create a parametric test suite that runs a set of canonical deal configurations (simple deal, PIK deal, sweep deal, add-on deal) through both the TypeScript engine (`fullRecalc`) and the Python backend API, then asserts that key outputs match within tolerance:

```typescript
// Parity assertions required for each test case:
expect(tsResult.returns.irr).toBeCloseTo(pyResult.irr, 1);          // ±0.1%
expect(tsResult.returns.moic).toBeCloseTo(pyResult.moic, 2);
expect(tsResult.debt_schedule.net_debt_by_year).toMatchCloseTo(pyResult.net_debt_by_year, 0.1);
expect(tsResult.debt_schedule.dscr_by_year).toMatchCloseTo(pyResult.dscr_by_year, 0.02);
```

Run in CI on every commit. Block merge on failure.

---

### PHASE 2: Institutional Credibility Floor (Pre-Deployment to Sophisticated Users)

Fix these before presenting to PE firms, credit funds, or banks.

#### P2-1: Fix Currency Symbols in All String Literals

**Files:** `lib/engine/realityCheck.ts`, `lib/engine/scenarios.ts`, any other file with `£${` literals  
**Severity:** Medium  
**Fix:** Create a currency symbol helper and use it throughout:

```typescript
// lib/engine/utils.ts
const CSYM: Record<string, string> = { GBP: '£', EUR: '€', USD: '$', INR: '₹', JPY: '¥' };
export function csym(currency: string): string { return CSYM[currency] ?? '£'; }

// Usage in realityCheck.ts:
description: `NWC build of ${csym(state.currency)}${nwcBuild.toFixed(1)}m...`
```

**Scope:** Grep codebase for `£${` and `£` followed by template literals. Fix all instances.

---

#### P2-2: Fix FCCR to Use Maintenance Capex

**Files:** `lib/dealEngineTypes.ts`, `lib/engine/creditAnalysis.ts`, `backend/engine/debt_schedule.py`  
**Severity:** Medium  
**Fix:**
1. Add `maintenance_capex_pct_revenue: number` to `MarginAssumptions` (default = `capex_pct_revenue` for backwards compatibility — assumes all capex is maintenance if not specified)
2. Compute `maintenance_capex = revenue * maintenance_capex_pct_revenue` in projections
3. Use `maintenance_capex` in FCCR numerator: `ebitda_adj - maintenance_capex - tax`
4. Apply the same fix in `backend/engine/debt_schedule.py`
5. Update `MarginAssumptions` default state in `modelState.ts`

**Test:** Model a deal where growth capex = 2% of revenue (on top of 3% maintenance capex). Verify FCCR uses 3% maintenance capex denominator, while DSCR and FCF calculations use 5% total capex.

---

#### P2-3: Remove or Replace Credit Rating Estimate

**Files:** `lib/engine/creditAnalysis.ts`, UI components displaying rating  
**Severity:** Medium  
**Fix:** Replace the rating heuristic with a factual summary of credit position:

```typescript
// Instead of a rating label, output a structured assessment:
interface CreditPosition {
  leverage_tier: 'investment_grade' | 'leveraged' | 'highly_leveraged' | 'distressed';
  leverage_at_entry: number;
  coverage_tier: 'strong' | 'adequate' | 'thin' | 'stressed';
  min_dscr: number;
  disclaimer: string;
}
```

Or simply remove the `credit_rating_estimate` field from `CreditAnalysis` entirely and remove it from the UI.

---

#### P2-4: Add Stepping Covenant Levels

**Files:** `lib/dealEngineTypes.ts`, `lib/engine/creditAnalysis.ts`, `lib/engine/modelState.ts`  
**Severity:** Medium  
**Fix:**
```typescript
// dealEngineTypes.ts — replace CreditCovenants
interface CreditCovenants {
  leverage_covenant: number;           // still the fallback scalar
  leverage_covenant_by_year?: number[];  // optional step schedule
  dscr_covenant: number;
  dscr_covenant_by_year?: number[];
  fccr_covenant: number;
  fccr_covenant_by_year?: number[];
}
```

In `creditAnalysis.ts`, resolve the effective covenant for year `i`:
```typescript
const effLevCov = cov.leverage_covenant_by_year?.[i] ?? cov.leverage_covenant;
```

Default: no `_by_year` arrays → flat (identical to current behavior). UI: allow user to enter a step schedule or keep flat.

---

#### P2-5: Fix Default Covenant Levels

**File:** `lib/engine/creditAnalysis.ts`  
**Severity:** Low (quick win)  
**Fix:**
```typescript
const DEFAULT_DSCR_COV = 1.25;   // was 1.15 — too aggressive
const DEFAULT_FCCR_COV = 1.15;   // was 1.10 — slightly aggressive
```

**Test:** Verify that the change in defaults produces more frequent covenant breach warnings on the same inputs.

---

#### P2-6: Excel Export Audit

**File:** `lib/engine/excelExport.ts`  
**Severity:** High  
**Fix:** Audit every formula-level calculation in `excelExport.ts` against the current engine. Specific items to check:
1. Net debt = gross debt - cash (not gross debt - min_cash — BUG-02 pattern)
2. Interest on average balance (not beginning balance — BUG-03 pattern)
3. Exit equity uses net_debt_by_year (not total_debt_by_year — BUG-02 pattern)
4. Value bridge: no distributions in totalGain/computedGain (BUG-05 pattern)
5. RVPI uses net_debt_by_year (BUG-06 pattern)
6. Gross IRR: entry excludes entry advisory fee, exit excludes exit fee (BUG-07 pattern)
7. Bear scenario in any export: junior-only resize, forward EBITDA (BUG-08/09 pattern)
8. Commitment fees in ECF and debt service (BUG-13 pattern)
9. Add-on EBITDA: exit-year (not static LTM at acquisition — BUG-15 pattern)

Create a `tests/excel-export-parity.test.ts` that runs a known deal through `fullRecalc()` and through the Excel export, then extracts and compares key cell values.

---

#### P2-7: Audit `updateProjectionsWithDebt` for Stale Logic

**File:** `lib/engine/projections.ts`  
**Severity:** Medium  
**Fix:** Read the full implementation of `updateProjectionsWithDebt()`. Verify:
- It does not independently compute interest expense (should consume from `total_cash_interest_by_year`)
- It does not independently compute net debt (should consume from debt schedule output)
- It correctly updates `fcf_to_equity` as `fcf_pre_debt - total_interest - total_repayment`
- It does not contain any pre-fix formula patterns from the 18-bug set

If it does contain independent calculation logic, refactor to be a pure consumer of debt schedule outputs.

---

#### P2-8: NWC Explicit Method — Migration Warning and Proper Implementation

**Files:** `lib/engine/projections.ts`, `lib/dealEngineTypes.ts`, UI  
**Severity:** Low  
**Fix:**
1. Add a `nwc_explicit_by_year?: number[]` field to `MarginAssumptions`
2. In `buildProjections()`, when `nwc_movement_method === 'explicit'`:
   - If `nwc_explicit_by_year` is populated: use it
   - If not: warn the user (via a flag in the output) that explicit mode has no data and will fall back to pct_change
3. In the UI: when user switches to `'explicit'` mode, prompt them to enter per-year NWC movements

---

### PHASE 3: Three-Statement Model Architecture (Institutional-Grade)

Adds the balance sheet required for institutional credibility. This is the most transformative change.

#### P3-1: Add Year-by-Year Balance Sheet

**Files:** New: `lib/engine/balanceSheet.ts`, `lib/dealEngineTypes.ts`, `lib/engine/index.ts`  
**Severity:** High (architectural)  

**Required balance sheet items:**
```typescript
interface BalanceSheetYear {
  year: number;
  // Assets
  cash: number;                      // = cash_balance_by_year[yrIdx]
  accounts_receivable: number;       // = revenue × dso / 365 (if DSO modeling)
  inventory: number;                 // = COGS × dio / 365 (if DIO modeling)
  fixed_assets_gross: number;        // cumulative capex
  accumulated_depreciation: number;  // cumulative D&A
  fixed_assets_net: number;
  goodwill: number;                  // acquisition premium over book value
  total_assets: number;
  // Liabilities
  accounts_payable: number;          // = COGS × dpo / 365
  current_debt: number;              // debt due within 12 months
  long_term_debt: number;            // remaining debt
  deferred_tax_liability: number;    // DTL from accelerated depreciation
  total_liabilities: number;
  // Equity
  entry_equity: number;              // initial equity contribution
  retained_earnings: number;        // cumulative net income
  total_equity: number;
  // Integrity check
  balance_check: number;            // assets - liabilities - equity (should = 0)
  is_balanced: boolean;
}
```

**Validation:** `computeBalanceSheet()` must assert `Math.abs(balance_check) < 0.001`. If it fails, set `is_balanced = false` and surface a model error — this indicates a calculation inconsistency in the engine.

---

#### P3-2: Add Convergence Tolerance Scaling by Deal Size

**File:** `lib/engine/index.ts`, `lib/engine/scenarios.ts`, `lib/engine/fragility.ts`  
**Severity:** Medium  
**Fix:**
```typescript
const CONVERGENCE_TOLERANCE = Math.max(0.01, state.revenue.base_revenue * 0.0001);
// Scales: £100m revenue → 0.01 tolerance (unchanged)
//         £1B revenue  → 0.1 tolerance (appropriate for deal size)
//         £10m revenue → 0.01 tolerance (minimum enforced)
```

Also: allow iteration 0 to trigger early exit:
```typescript
if (convergenceDelta < CONVERGENCE_TOLERANCE) break;  // remove `&& iter > 0`
prevTotalInterest = currentTotalInterest;
proj = updatedProj;
```

---

#### P3-3: Add Rate Steps to Floating Rate Tranches

**Files:** `lib/dealEngineTypes.ts`, `lib/engine/debtSchedule.ts`, `lib/engine/modelState.ts`  
**Severity:** High  
**Fix:**
```typescript
// dealEngineTypes.ts — DebtTranche
base_rate_by_year?: number[];  // optional forward curve; falls back to base_rate if absent
```

In `debtSchedule.ts`:
```typescript
const baseRateThisYear = tranche.base_rate_by_year?.[yrIdx] ?? tranche.base_rate;
effRate = Math.max(baseRateThisYear + tranche.spread, tranche.floor);
```

Default: no `base_rate_by_year` → flat rate (identical to current). UI: allow user to enter a rate path or a simple step (+/- bps in Year N).

---

#### P3-4: Revolver Dynamic Draw/Repay Logic

**Files:** `lib/engine/debtSchedule.ts`, `lib/dealEngineTypes.ts`  
**Severity:** High  
**Fix:** Add a `revolver_draw_balance` that updates each year:
1. After computing ECF (pre-sweep), if `cashBalance < min_cash_balance`:
   - Draw on the revolver: `draw = min(min_cash_balance - cashBalance, revolver_commitment - revolver_drawn)`
   - Add draw to `begBal` for revolver tranche, add draw × rate to interest
2. If `cashBalance > min_cash_balance` and revolver is drawn:
   - Repay revolver from excess cash before any term loan sweep

This requires a two-stage computation: first resolve the revolver draw, then compute sweep on the residual. The revolver balance becomes dynamic (changes each year) rather than static.

---

#### P3-5: Add Scenario Credit Analysis Output

**Files:** `lib/engine/scenarios.ts`, `lib/dealEngineTypes.ts`  
**Severity:** High  
**Fix:** `ScenarioSet` should include credit metrics:
```typescript
interface ScenarioSet {
  // existing fields...
  dscr_by_year?: number[];
  leverage_by_year?: number[];
  covenant_breach_year?: number | null;  // first year of breach, null if no breach
  survives_hold?: boolean;               // ECF > 0 in every year
}
```

`runFullModel()` in `scenarios.ts` already returns `debtSchedule` — extract DSCR and leverage arrays and include in the scenario output. Add `covenant_breach_year` logic: check each year if leverage > leverage_covenant and find the first breach year.

---

#### P3-6: Scenario Value Driver Bridge

**Files:** `lib/engine/scenarios.ts`, `lib/engine/returns.ts`  
**Severity:** Medium  
**Fix:** For each scenario, call `decomposeValueDrivers()` on the scenario's state/projections/debtSchedule/returns. Add `value_drivers` to `ScenarioSet`. This allows UI to show per-scenario bridges explaining the IRR delta vs. base.

---

#### P3-7: Fix Mid-Year Convention Internal Consistency

**Files:** `lib/engine/returns.ts`  
**Severity:** Medium  
**Issue:** The mid-year time vector is applied to the IRR cash flows without adjusting the underlying FCF generation model. The correct fix is either:
1. Apply mid-year discounting only at the IRR/MOIC reporting layer while acknowledging the model uses year-end cash generation (add a disclosure)
2. Use the mid-year convention consistently: FCF in each year is treated as generated at mid-year, requiring the debt service to also be discounted at mid-year

Option 1 is pragmatic and should be accompanied by a tooltip: "Mid-year convention applies a timing adjustment to the IRR cash flow vector. FCF is generated on an annual (year-end) basis."

---

### PHASE 4: IC-Grade Features (Full Institutional Deployment)

#### P4-1: MIP Ratchet Structure

**Files:** `lib/dealEngineTypes.ts`, `lib/engine/returns.ts`  
**Severity:** Medium  
**Fix:**
```typescript
// dealEngineTypes.ts
interface MIPRatchetTier {
  moic_threshold: number;
  irr_threshold?: number;     // optional dual-hurdle
  pool_pct: number;           // management pool % at this tier
}

interface ManagementIncentive {
  hurdle_moic: number;          // kept for backwards compat
  mip_pool_pct: number;         // kept for backwards compat (single-tier)
  ratchet_tiers?: MIPRatchetTier[];  // optional: if present, overrides single-tier
  vesting_years: number;
  sweet_equity_pct: number;
}
```

In `calculateReturns()`, if `ratchet_tiers` is present, find the applicable tier based on total return MOIC and apply that pool percentage.

---

#### P4-2: Fund-Level Return Metrics

**Files:** New: `lib/engine/fundReturns.ts`, `lib/dealEngineTypes.ts`  
**Severity:** Medium  
**Implementation:**
```typescript
interface FundAssumptions {
  management_fee_pct: number;          // % of committed capital per annum
  management_fee_basis: 'committed' | 'invested';
  carry_rate: number;                  // typically 0.20
  preferred_return: number;            // typically 0.08 (8% hurdle)
  carry_waterfall: 'american' | 'european';
  fund_size: number;
  deal_allocation_pct: number;         // this deal's share of fund
}

interface FundReturns {
  net_irr: number | null;
  net_moic: number;
  gross_to_net_spread: number;         // gross IRR - net IRR
}
```

This is a clean module that can be added without touching the core engine.

---

#### P4-3: Refinancing Scenario Module

**Files:** New: `lib/engine/refinancing.ts`, `lib/dealEngineTypes.ts`  
**Severity:** High  
**Implementation:** Allow the user to specify a refinancing event at Year N:
```typescript
interface RefinancingEvent {
  year: number;
  new_spread: number;           // updated spread vs. base rate
  new_floor: number;
  prepayment_premium: number;   // % of outstanding principal (e.g., 0.02 for 102%)
  extend_maturity_by: number;   // years added to bullet schedule
}
```

`buildDebtSchedule()` checks each year if a `RefinancingEvent` applies to a tranche. If so: deduct prepayment premium from cash, update `effRate` for subsequent periods, extend the bullet schedule.

---

#### P4-4: PIK Toggle Election Mechanism

**Files:** `lib/dealEngineTypes.ts`, `lib/engine/debtSchedule.ts`  
**Severity:** Low  
**Fix:**
```typescript
// DebtTranche
pik_toggle: boolean;           // if true, issuer can elect PIK or cash each period
pik_election_by_year?: boolean[];  // true = elect PIK in that year, false = cash pay
```

If `pik_toggle = true` and `pik_election_by_year[yrIdx] = true`, apply PIK mechanics. Otherwise treat as cash pay. Default: always PIK (existing behavior).

---

#### P4-5: Partial Exit and IPO Mechanics

**Files:** `lib/dealEngineTypes.ts`, `lib/engine/returns.ts`  
**Severity:** Low  
**Fix:**
```typescript
interface PartialExitEvent {
  year: number;
  pct_sold: number;           // % of equity sold
  exit_multiple: number;      // EV multiple at this exit
  exit_fee_pct: number;       // advisory fee on this tranche
}
```

Each partial exit generates an IRR cash inflow equal to `pct_sold × (exit_multiple × ebitda - net_debt) - exit_fee`. The remaining equity is valued at a subsequent exit.

---

#### P4-6: Maintenance vs. Growth Capex Split

*(Also listed as P2-2 for FCCR — extends to FCF presentation)*

**Additional scope:** Separate the FCF waterfall display to show:
- EBITDA
- less: Maintenance capex
- = Operating FCF (before growth investment)
- less: Growth capex
- = Total FCF pre-debt

This is the standard PE FCF bridge and much more useful for understanding the business's organic cash generation vs. reinvestment.

---

#### P4-7: Three-Statement Close Validation in CI

**Files:** `tests/three-statement.test.ts`  
**Severity:** High (once P3-1 is implemented)  
**Fix:** After implementing the balance sheet, add a test that runs a set of canonical deals and asserts `balance_check < 0.001` for every year. Any future engine change that breaks the balance sheet will fail this test.

---

#### P4-8: Revolver Springing Covenant Logic

**Files:** `lib/engine/creditAnalysis.ts`, `lib/dealEngineTypes.ts`  
**Severity:** Low  
**Fix:**
```typescript
interface CreditCovenants {
  // existing...
  springing_dscr_covenant?: number;         // only applies when revolver drawn > threshold
  springing_utilization_threshold?: number; // e.g., 0.35 = 35% drawn
}
```

In `creditAnalysis.ts`, only apply `springing_dscr_covenant` in years where revolver drawn balance / commitment > `springing_utilization_threshold`.

---

#### P4-9: NWC DSO/DIO/DPO Modeling

**Files:** `lib/dealEngineTypes.ts`, `lib/engine/projections.ts`  
**Severity:** Low  
**Fix:**
```typescript
interface MarginAssumptions {
  // Keep existing nwc_pct_revenue as fallback
  nwc_dso?: number;           // days sales outstanding
  nwc_dio?: number;           // days inventory outstanding
  nwc_dpo?: number;           // days payable outstanding
}
```

If DSO/DIO/DPO are provided, compute NWC from first principles. Otherwise fall back to `nwc_pct_revenue`. This enables modeling of specific operational levers (payment term extension, DSO improvement) as value creation drivers.

---

#### P4-10: Recovery Waterfall Using Year-of-Default EV

**File:** `lib/engine/creditAnalysis.ts`  
**Severity:** Low  
**Fix:** Remove the static `entry_enterprise_value × 0.5` stress EV. Instead, compute a distressed EV for each year using:
```typescript
const distressedEbitda = projYr.ebitda_adj * 0.6;  // 40% EBITDA haircut (configurable)
const distressedMultiple = state.entry.entry_ebitda_multiple * 0.5;  // 50% multiple haircut
const distressedEv = distressedEbitda * distressedMultiple;
const transactionCosts = 0.10 * distressedEv;  // 10% distressed sale costs
const stressEV = Math.max(0, distressedEv - transactionCosts);
```

Make the EBITDA haircut and multiple haircut configurable in `CreditCovenants`.

---

#### P4-11: Monitoring Fee Termination at Exit

**Files:** `lib/engine/projections.ts`, `lib/engine/returns.ts`  
**Severity:** Low  
**Fix:** In the final hold year (year == hp), set monitoring fee to zero in projections. Add a `monitoring_fee_termination_payment` to the exit fee calculation equal to the NPV of the remaining contractual monitoring fees (user-configurable: number of years remaining on contract × annual fee, discounted at the discount rate).

---

#### P4-12: Add-On Synergy Ramp

**File:** `lib/engine/addOns.ts`  
**Severity:** Low  
**Fix:**
```typescript
// AddOnAcquisition
synergy_ramp_years?: number;  // default 1 (current behavior = full synergy from Year 2)

// In computeAddOnImpact:
const synergyFraction = synergy_ramp_years
  ? Math.min(1, yearsOwned / synergy_ramp_years)
  : (yearsOwned > 0 ? 1 : 0);
revenueByYear[i] += addon.synergy_revenue * synergyFraction;
ebitdaByYear[i] += addon.synergy_cost * synergyFraction;
```

---

#### P4-13: Cash Trap / Dividend Restriction Mechanics

**Files:** `lib/engine/debtSchedule.ts`  
**Severity:** Medium  
**Fix:**
```typescript
// CreditCovenants
distribution_block_leverage?: number;  // block distributions if leverage > this
distribution_block_dscr?: number;      // block distributions if DSCR < this
```

In the sweep/distribution calculation, check current-year metrics. If leverage exceeds `distribution_block_leverage` or DSCR is below `distribution_block_dscr`, zero out `interim_distributions[yrIdx]` and add a flag to the output explaining the restriction.

---

#### P4-14: OID Amortization via Effective Interest Method

**Files:** `lib/engine/debtSchedule.ts`, `lib/dealEngineTypes.ts`  
**Severity:** Low  
**Fix:**
```typescript
// DebtTranche
oid_pct?: number;           // original issue discount as % of par
debt_maturity_years?: number;  // for OID amortization (may differ from hp)
```

In `debtSchedule.ts`, compute effective yield = coupon + (OID / maturity × outstanding / par) using the effective interest method. Use this in the interest expense calculation and P&L.

---

### PHASE 5: Engineering Governance (Prevent Future Divergence)

#### P5-1: Formal Source-of-Truth Declaration

**Document:** `ENGINE_ARCHITECTURE.md`  
Declare: TypeScript engine is the source of truth for all financial calculations. The Python backend is a secondary analytical tool. Any change to a calculation in TS must be mirrored in Python within the same PR. PRs touching either engine must include a parity test run.

#### P5-2: Financial Definition Registry

**Document:** `FINANCIAL_DEFINITIONS.md`  
For every financial metric computed by the engine, define:
- The formula used
- The institutional convention it follows (or deviates from, and why)
- The source (AIFMD, ILPA, credit agreement definition, etc.)
- Which module implements it
- Which test verifies it

Prevents "BUG-03 was fixed in Python because Python uses average balance, but TypeScript used beginning balance" type divergence. The definition is written down; the test verifies both engines conform.

#### P5-3: Single Shared Calculation Kernel (Long-Term)

**Architecture:** Extract all financial formulas into a pure calculation library (`lib/finance/`) with no framework dependencies:
- `lib/finance/interest.ts` — effective rate, average balance, PIK compounding
- `lib/finance/irr.ts` — solveIrr, solveIrrTimed, mid-year convention
- `lib/finance/sweep.ts` — sweep waterfall, priority tiers
- `lib/finance/returns.ts` — MOIC, DPI, RVPI, bridge attribution

Both the TS engine and a Python wrapper calling the TS kernel via WASM or a shared test harness ensure identical arithmetic. This is the only durable solution to dual-engine divergence.

#### P5-4: Regression Test Baseline

**Files:** `tests/regression/` directory  
Before any refactor, snapshot the output of 5-10 canonical deals across the complexity spectrum (simple TLA, PIK-heavy, add-on, revolver, distressed). After any change, run the regression suite. Any change to outputs must be explicitly acknowledged and the snapshot updated.

---

## 9. Institutionalization Roadmap

### Timeline Summary

| Phase | Duration | Gate |
|---|---|---|
| Phase 0 — Build integrity | Complete | Build passes, no TS errors |
| Phase 1 — Critical defects | 1-2 weeks | No materially wrong outputs for identifiable deal types |
| Phase 2 — Credibility floor | 2-4 weeks | Passes review by a credit analyst or junior PE associate |
| Phase 3 — Three-statement | 4-8 weeks | Balance sheet closes; passes IC model review |
| Phase 4 — IC-grade features | 8-16 weeks | Passes review by MD-level institutional practitioner |
| Phase 5 — Governance | Ongoing | Every future PR includes parity test |

### Minimum Viable Institutional Product

A model can be presented to institutional users when Phase 1 and Phase 2 are complete, with the following disclosed limitations:
- Annual period granularity (not quarterly)
- Static interest rates (no forward curve)
- Simplified MIP (single hurdle)
- No refinancing scenario
- No partial exit

These are acceptable limitations for a screening-level tool. They become unacceptable for final IC investment papers.

---

## 10. What Would Break Under Real Institutional Usage

### Scenario A: Sponsor Presents to Credit Committee

| Question Asked | Engine Response | Reality |
|---|---|---|
| "Show me senior leverage by tranche" | First tranche / EBITDA | Wrong if revolver is first |
| "DSCR under the bear case?" | Not available (scenario has no credit output) | Blocker |
| "Interest rate sensitivity at +200bps?" | Cannot model rate steps | Blocker |
| "Does the company breach covenants in the bear case?" | Unknown — no bear case credit analysis | Blocker |
| "Your credit rating estimate says BB+" | Based solely on entry leverage | Credibility-destroying |
| "Walk me through your FCCR definition" | Uses total capex (differs from credit agreement) | May not match credit agreement |

**Verdict:** Credit committee would not accept the model as primary analytical tool.

---

### Scenario B: Co-Investor Runs Independent Check

| Action Taken | What They Find |
|---|---|
| Sensitize on leverage | All capital structure scenarios use pro-rata scaling — impossible structures |
| Check add-on return contribution | Revenue credit, zero leverage debit — free lunch economics |
| Run fragility on bolt-on deal | Fragility uses different revenue base than base case |
| Compare Excel export to UI | Formulas may diverge from engine (uninvestigated) |
| Check RVPI methodology | May find gross vs. net inconsistency in older export version |

**Verdict:** Co-investor would find material discrepancies and flag the model as unaudited.

---

### Scenario C: Restructuring Advisor Stress Tests

| Action Taken | Engine Limitation |
|---|---|
| Models deep revenue contraction | No covenant breach analysis in bear/stress |
| Models a revolver draw under stress | Revolver balance is static — cannot model draw |
| Checks PIK compounding in distress | Convergence may fail; model shows possibly wrong numbers |
| Tests covenants against credit agreement | Credit agreement has stepping covenants; model has flat ones |
| Models a refinancing | Not possible |
| Verifies balance sheet integrity | No balance sheet to verify |

**Verdict:** Restructuring advisor rebuilds the debt model from scratch.

---

### Scenario D: PE Associate Presents at MD-Level IC

| Question | Engine Status |
|---|---|
| "Walk me through add-on deal IRR" | Revenue uplift captured, leverage cost missing → IRR overstated |
| "Why does the bear case show 14% vs base 23%?" | No scenario bridge — no explanation |
| "Does the model close?" | No balance sheet |
| "Show me DSCR in the bear case" | Not available |
| "What's the net IRR to LPs?" | Not computed |
| "What's the currency sensitivity?" | Not modeled (rates static) |

**Verdict:** Model is sent back before IC. At minimum, add-on leverage and scenario credit metrics are required.

---

## 11. Final Severity Matrix

| ID | Finding | Category | Severity | Affects Outputs | Active Now |
|---|---|---|---|---|---|
| P1-1 | Sensitivity table pro-rata scaling (BUG-08 unresolved) | A — Verified | 🔴 Critical | Every leverage sensitivity cell | Yes |
| P1-2 | Add-on debt not entering debt schedule | A — Verified | 🔴 Critical | All buy-and-build deals | Yes |
| P1-3 | Fragility/scenarios miss add-on injection | A — Verified | 🔴 Critical | All deals with add-ons | Yes |
| P1-4 | Senior leverage uses array position, not type | A — Verified | 🟠 High | Credit analysis | Yes |
| P1-5 | Convergence failure displays results | A — Verified | 🟠 High | PIK-heavy deals | Yes |
| P1-6 | No cross-engine parity test | C — Architectural | 🔴 Critical | All future changes | Structural |
| P2-1 | Currency symbol hardcoded as £ | A — Verified | 🟡 Medium | Non-GBP deals | Yes |
| P2-2 | FCCR uses total capex not maintenance | A — Verified | 🟡 Medium | Credit analysis | Yes |
| P2-3 | Credit rating estimate is dangerous | D — Product | 🟠 High | All deals | Yes |
| P2-4 | Covenant levels are static, no step-down | D — Product | 🟠 High | Credit analysis | Yes |
| P2-5 | Default DSCR covenant 1.15x too aggressive | F — UX Risk | 🟡 Medium | Default deal | Yes |
| P2-6 | Excel export likely diverged from engine | B — Probable | 🟠 High | All exported models | Probable |
| P2-7 | `updateProjectionsWithDebt` may contain stale logic | B — Probable | 🟡 Medium | Convergence loop | Probable |
| P2-8 | NWC explicit fallback is silent | A — Verified | 🟡 Medium | Saved models | Yes |
| P3-1 | Balance sheet absent | C — Architectural | 🟠 High | All institutional use | Structural |
| P3-2 | Convergence tolerance not scaled to deal size | B — Probable | 🟡 Medium | Large deals | Probable |
| P3-3 | Static interest rates — no forward curve | E — Philosophy | 🟠 High | All floating rate deals | Yes |
| P3-4 | Revolver has no draw/repay mechanics | C — Architectural | 🟠 High | Liquidity analysis | Yes |
| P3-5 | No scenario credit analysis output | D — Product | 🟠 High | IC presentations | Yes |
| P3-6 | No scenario value driver bridge | D — Product | 🟡 Medium | IC presentations | Yes |
| P3-7 | Mid-year convention inconsistent | B — Probable | 🟡 Medium | Mid-year deals | Probable |
| P4-1 | MIP single hurdle only | D — Product | 🟡 Medium | Complex incentive structures | Yes |
| P4-2 | No fund-level return metrics | D — Product | 🟡 Medium | LP reporting | Yes |
| P4-3 | No refinancing mechanics | D — Product | 🟠 High | 5Y+ holds | Yes |
| P4-4 | PIK toggle not modeled | D — Product | 🟡 Medium | PIK toggle instruments | Yes |
| P4-5 | No partial exit/IPO mechanics | D — Product | 🟡 Medium | IPO/partial exit | Yes |
| P4-6 | Maintenance vs. growth capex not split | E — Philosophy | 🟡 Medium | FCCR, FCF presentation | Yes |
| P4-7 | No three-statement close test | C — Architectural | 🟠 High | All future engine changes | Structural |
| P4-8 | No springing covenant mechanics | D — Product | 🟡 Low | Revolver-linked covenants | Yes |
| P4-9 | NWC uses single % not DSO/DIO/DPO | E — Philosophy | 🟡 Low | Operational improvement modeling | Yes |
| P4-10 | Recovery waterfall uses static 50% EV | E — Philosophy | 🟡 Low | Recovery analysis | Yes |
| P4-11 | Monitoring fee not terminated at exit | E — Philosophy | 🟡 Low | Exit economics | Yes |
| P4-12 | Add-on synergy recognized immediately | E — Philosophy | 🟡 Low | Buy-and-build deals | Yes |
| P4-13 | No cash trap / dividend restriction | D — Product | 🟡 Medium | Covenant-constrained deals | Yes |
| P4-14 | OID modeled as flat fee not effective yield | E — Philosophy | 🟡 Low | OID instruments | Yes |
| P5-1 | No formal source-of-truth declaration | C — Governance | 🟠 High | All future development | Structural |
| P5-2 | No financial definition registry | C — Governance | 🟠 High | All future development | Structural |
| P5-3 | Dual engine, no shared kernel | C — Architectural | 🔴 Critical | All future development | Structural |
| P5-4 | No regression test baseline | C — Governance | 🟠 High | All future development | Structural |
| P5-X | PIK tax shield timing wrong for UK/EU | B — Probable | 🟡 Medium | UK/EU PIK structures | Probable |
| P5-X | Bear case equity check inconsistency | B — Probable | 🟡 Medium | Bear scenario | Probable |
| P5-X | ECF vs. reported ECF floor shortfall base | B — Probable | 🟡 Low | Min-cash deals | Probable |
| P5-X | Exit EBITDA is year-end not LTM at signing | E — Philosophy | 🟡 Medium | Growth companies | Yes |
| P5-X | Payback in integer years | E — Philosophy | 🟡 Low | All deals | Yes |
| P5-X | Cash yield not a standard PE metric | D — Product | 🟡 Low | All deals | Yes |
| P5-X | Scenario IRR delta unexplained | D — Product | 🟠 High | IC presentations | Yes |
| P5-X | Default values imply institutional standards | F — UX Risk | 🟡 Medium | New users | Yes |
| P5-X | False precision in IRR display | F — UX Risk | 🟡 Medium | All users | Yes |
| P5-X | Bear/stress labels imply rigorous methodology | F — UX Risk | 🟠 High | All users | Yes |

---

*End of Institutional Architecture Audit & Refactor Plan.*  
*This document supersedes the original `LBO_Deal_Engine_Bug_Report.md` as the primary engineering reference.*  
*Last updated: 2026-05-24*
