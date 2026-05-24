# LBO Deal Engine — Verified Bug Report

**Repository:** `mridulmalani2/mridulm`  
**Commit:** `23ae124d0d8f26ab930aa8f9b63eb4c273d94388` (latest, PR #41 merged)  
**Date:** 2026-05-24  
**Methodology:** Every item below was re-checked by reading the full source of the relevant file at the commit above. Items that did not survive verification were removed.

---

## Critical Bugs

### BUG-01: TypeScript — No cash balance roll-forward

**Files:** `lib/engine/debtSchedule.ts`, `lib/engine/creditAnalysis.ts`  
**Verified:** Yes — confirmed against source.

The TypeScript debt schedule deducts `min_cash_balance` from excess cash flow **every year** as if the entire reserve must be rebuilt annually:

```typescript
// debtSchedule.ts, line ~87
const minCash = state.entry.min_cash_balance || 0;
const ecf = fcfPreDebt - totalMandatoryAmort - totalCashInterest - minCash;
let availableForSweep = Math.max(0, ecf);
```

And net debt is computed as a fixed subtraction, not actual cash on hand:

```typescript
// debtSchedule.ts, aggregate metrics
netDebtByYear.push(Math.max(0, totDebt - minCash));
```

There is **no `cash_balance` variable** anywhere in the TypeScript engine. The same `minCash` is deducted from sweep capacity each year regardless of whether cash was retained in prior years.

The Python backend (`backend/engine/debt_schedule.py`) has a proper roll-forward:

```python
cash_balance = max(0.0, cash_balance + fcf_pre_debt - total_cash_interest - period_total_repayment)
cash_balance_by_year.append(cash_balance)
# ... net_debt = max(0.0, tot_debt - max(min_cash, cash_held))
```

**Impact:** Sweep capacity is understated every year after year 1. Net debt is `total_debt − min_cash` (a conceptual reserve), not `total_debt − actual_cash_on_hand`. Returns that depend on exit net debt are also affected (see BUG-02).

---

### BUG-02: TypeScript — Returns use gross debt instead of net debt for exit

**File:** `lib/engine/returns.ts`  
**Verified:** Yes — confirmed against source.

```typescript
// returns.ts, line ~80
const exitNetDebt = debtSchedule.total_debt_by_year.length
  ? debtSchedule.total_debt_by_year[debtSchedule.total_debt_by_year.length - 1]
  : 0;
```

Despite the debt schedule producing both `total_debt_by_year` (gross) and `net_debt_by_year` (net), the returns module reads from the **gross** series and calls the variable `exitNetDebt`. Exit equity, MOIC, and all IRR variants are computed from this overstated net debt, reducing reported returns.

The Python backend correctly uses `net_debt_by_year[-1]` (adjusted for actual cash on hand per audit FINDING 9).

**Impact:** Exit equity is understated; IRR, MOIC, and all return metrics are lower than they should be.

---

### BUG-03: TypeScript — Interest computed on beginning balance, not average balance

**File:** `lib/engine/debtSchedule.ts`  
**Verified:** Yes — confirmed against source.

```typescript
// debtSchedule.ts, first pass
cashInterest = tranche.cash_interest ? begBal * effRate : 0;
```

The Python backend computes interest on the **average balance** (beginning + post-mandatory-amortization) / 2:

```python
avg_bal = (beg_bal + max(0.0, beg_bal - entry.scheduled_repayment)) / 2.0
entry.cash_interest = avg_bal * eff_rate if tranche.cash_interest else 0.0
```

Average balance is the standard LBO convention for term debt — it reflects that principal is repaid throughout the year rather than in a lump sum at year-end.

**Impact:** Cash interest is overstated (especially for tranches with large scheduled amortization), which overstates debt service, understates sweep capacity, and depresses returns.

---

### BUG-04: TypeScript — Sweep allocated by array order, not explicit priority

**Files:** `lib/engine/debtSchedule.ts`, `lib/dealEngineTypes.ts`  
**Verified:** Yes — confirmed against source.

The TypeScript sweep loop iterates tranches in array order:

```typescript
// debtSchedule.ts, second pass
for (let tIdx = 0; tIdx < tranches.length; tIdx++) {
  if (tranche.amortization_type === 'cash_sweep' && availableForSweep > 0) {
    const maxSweep = Math.max(0, availableForSweep * tranche.cash_sweep_pct);
    // ...
  }
}
```

The `DebtTranche` type has no `sweep_priority` field. Sweep goes to whichever tranche appears first in the array — mezzanine can be swept before senior if the UI doesn't enforce ordering.

The Python backend has explicit `sweep_priority` with tiered allocation and pro-rata within tiers:

```python
priority_tiers: dict[int, list[int]] = {}
for i in sweep_indices:
    priority_tiers.setdefault(tranches[i].sweep_priority, []).append(i)
for priority in sorted(priority_tiers.keys()):
    # ... pro-rata within tier, residual reallocation
```

**Impact:** Incorrect sweep waterfall if tranches aren't ordered by seniority. No runtime error — just wrong numbers silently.

---

### BUG-05: TypeScript — Value bridge includes distributions in total gain

**File:** `lib/engine/returns.ts`, `decomposeValueDrivers()`  
**Verified:** Yes — confirmed against source.

```typescript
const totalDistributions = returns.total_distributions ?? 0;
const totalGain = exitEquity + totalDistributions - entryEquity;
const computedGain = deltaRev + deltaMargin + deltaMultiple + deltaDebt - feesDrag + totalDistributions;
```

Interim distributions are LP cash flows, not value creation. Including them in the bridge breaks the reconciliation — the bridge should decompose `exit_equity − entry_equity` only. Distributions reduce exit equity (by increasing net debt vs. the no-distribution counterfactual), so they are implicitly captured via `delta_debt`.

The Python audit (FINDING 7) corrected this:

```python
total_gain = exit_equity - entry_equity  # no distributions
computed_gain = delta_rev + delta_margin + delta_multiple + delta_debt - fees_drag  # no distributions
```

**Impact:** Bridge percentages are wrong; operational vs. financial engineering split is distorted. Overstates total gain and misattributes it.

---

## High Bugs

### BUG-06: TypeScript — RVPI uses gross debt instead of net debt

**File:** `lib/engine/returns.ts`, `calculateReturns()`  
**Verified:** Yes — confirmed against source.

```typescript
const estDebt = yrIdx < debtSchedule.total_debt_by_year.length
  ? debtSchedule.total_debt_by_year[yrIdx] : 0;
rvpiByYear.push(entryEquity > 0 ? Math.max(0, estEv - estDebt) / entryEquity : 0);
```

Uses `total_debt_by_year` (gross debt). The Python audit (FINDING 3) corrected this to use net debt:

```python
est_net_debt = max(0.0, est_debt - max(min_cash, est_cash))
rvpi_by_year.append(est_equity / entry_equity)
```

**Impact:** RVPI is understated in all years before exit.

---

### BUG-07: TypeScript — Gross IRR definition is internally inconsistent

**File:** `lib/engine/returns.ts`  
**Verified:** Yes — confirmed against source.

```typescript
// Entry includes all fees
const entryEquity = EV + entryFee + transactionCosts + financingFees - totalDebtRaised;
// Exit excludes exit fee
const exitEquityGross = exitEv - exitNetDebt - exitFee;
// Gross IRR cash flows
const grossCfs = [-entryEquity, ..., exitEquityGross + distributions[i]];
```

Entry cost includes entry advisory fee, transaction costs, and financing fees. Exit value excludes the exit fee. This is neither "gross of all fees" nor "net of all fees" — it's an inconsistent hybrid.

The Python audit (FINDING 2) specified that gross IRR should exclude ALL sponsor-level fees from both entry and exit. The Python uses `sponsor_entry_equity_for()` which treats the entry advisory fee as target-borne (not in sponsor equity), and the exit uses `exit_equity_pre_fees` (no exit fee deduction).

**Impact:** Gross IRR is not comparable to standard PE gross return benchmarks. It will understate the true gross return.

---

### BUG-08: TypeScript — Bear scenario scales all tranches pro-rata instead of adjusting junior only

**File:** `lib/engine/scenarios.ts`  
**Verified:** Yes — confirmed against source.

```typescript
const scale = bearDebt / oldTotal;
for (const t of bear.debt_tranches) {
  t.principal *= scale;
  t.amortization_schedule = [];
}
```

All tranches (including senior) are scaled by the same ratio. The Python backend preserves senior tranche structure and only adjusts the most junior tranche:

```python
_resize_debt_to_target(bear, bear_debt)  # junior absorbs delta, senior preserved
```

**Impact:** Bear scenario shows an unrealistic capital structure where senior debt is reduced proportionally, which wouldn't happen in practice (senior tranches are typically fixed at close).

---

### BUG-09: TypeScript — Bear scenario uses base EBITDA for debt sizing instead of forward EBITDA

**File:** `lib/engine/scenarios.ts`  
**Verified:** Yes — confirmed against source.

```typescript
const ebitda = state.revenue.base_revenue * state.margins.base_ebitda_margin;
const bearDebt = bearLeverage * ebitda;
```

Uses entry/base EBITDA. The Python uses forward Year-1 EBITDA consistent with the bear scenario's own growth and margin assumptions:

```python
fwd_ebitda_bear = _forward_ebitda(bear)  # Y1 revenue * Y1 margin
bear_debt = bear_leverage * fwd_ebitda_bear
```

**Impact:** Bear scenario debt is sized against the wrong EBITDA. With negative growth adjustments, base EBITDA overstates capacity → bear case is less stressed than intended.

---

### BUG-10: TypeScript — MIP hurdle check differs from Python

**File:** `lib/engine/returns.ts`  
**Verified:** Yes — confirmed against source.

TypeScript:
```typescript
const totalReturnMoic = entryEquity > 0
  ? (exitEquityPreMip + totalDistributions) / entryEquity : 0;
const mipPayout = totalReturnMoic >= state.mip.hurdle_moic
  ? state.mip.mip_pool_pct * exitEquityPreMip : 0;
```

Python:
```python
gross_moic_pre_fees = exit_equity_pre_fees / entry_equity
if gross_moic_pre_fees >= state.mip.hurdle_moic:
    mip_payout = state.mip.mip_pool_pct * exit_equity_after_fees
```

The TS includes interim distributions in the MOIC hurdle check; the Python does not. They also differ on whether MIP is calculated on pre-fee or post-fee equity.

**Impact:** With dividend recaps, TS triggers MIP earlier/more often. The MIP payout base also differs (pre-fee vs post-fee equity). Both affect net returns.

---

### BUG-11: Duplicated solver with inconsistent convergence caps

**Files:** `lib/engine/index.ts`, `lib/engine/scenarios.ts`, `lib/engine/fragility.ts`  
**Verified:** Yes — confirmed against source.

| Module | Iteration cap |
|---|---|
| `fullRecalc` (index.ts) | 10 |
| `runFullModel` (scenarios.ts) | 5 |
| `quickCalc` (fragility.ts) | 5 |

PIK-heavy or slow-converging deals may converge in the main engine (10 iterations) but fail to converge in scenarios/fragility (5 iterations). The convergence delta threshold is the same (0.01), but with fewer iterations the sub-models may exit with `debt_convergence_failed = true` more frequently, or produce different numbers.

**Impact:** Scenario and fragility outputs can diverge from main-engine results for PIK-heavy deals. No warning is surfaced to the user.

---

## Moderate Bugs

### BUG-12: Python — FCCR duplicates DSCR definition

**File:** `backend/engine/debt_schedule.py`  
**Verified:** Yes — confirmed against source.

```python
# DSCR
dscr_by_year.append(float("inf") if debt_service <= 0 else fcf_pre / debt_service)
# FCCR — "matches DSCR convention"
fccr_by_year.append(float("inf") if debt_service <= 0 else fcf_pre / debt_service)
```

Both use the same formula. The TypeScript `creditAnalysis.ts` correctly distinguishes them:

```typescript
const fccr = mandatoryDebtService > 0 ? numeratorFCCR / mandatoryDebtService : 9999;
// where numeratorFCCR = ebitda_adj - total_capex - tax
const dscr = mandatoryDebtService > 0 ? fcfPreDebt / mandatoryDebtService : 9999;
```

**Impact:** Python FCCR is meaningless — it's just a copy of DSCR. Lenders and credit analysts expect a distinct FCCR that accounts for fixed charges (capex, taxes) below EBITDA.

---

### BUG-13: TypeScript — Commitment fees excluded from debt service ratios

**Files:** `lib/engine/debtSchedule.ts`, `lib/engine/creditAnalysis.ts`  
**Verified:** Yes — confirmed against source.

Commitment fees are computed per tranche:

```typescript
const commitmentFeePaid = undrawnBal * tranche.commitment_fee;
```

But they are not added to `totalCashInterest` or `debtService`:

```typescript
const debtService = totCashInt + totMandatoryAmort;  // no commitment fees
```

DSCR and FCCR in both `debtSchedule.ts` and `creditAnalysis.ts` use `debtService` that excludes commitment fees.

**Impact:** DSCR and FCCR are slightly overstated when commitment fees are non-zero. FCF to equity also ignores this real cash cost.

---

### BUG-14: TypeScript — NWC 'explicit' method produces zero, silently

**File:** `lib/engine/projections.ts`  
**Verified:** Yes — confirmed against source.

```typescript
let deltaNwc: number;
if (state.margins.nwc_movement_method === 'pct_change') {
  deltaNwc = (revenue - prevRevenue) * nwcPct;
} else {
  deltaNwc = 0;
}
```

The type definition includes `'explicit'` as an option, but selecting it yields zero NWC movement with no warning. Users who switch from pct_change to explicit expecting to enter custom NWC per year will get a model with no working capital changes at all.

**Impact:** Silent incorrect output — no NWC drag in the model.

---

### BUG-15: TypeScript — addOns.ts is dead code

**Files:** `lib/engine/addOns.ts`, `lib/engine/index.ts`  
**Verified:** Yes — confirmed against source.

`computeAddOnImpact()` is defined in `addOns.ts` but is **never imported or called** from `fullRecalc` or any other engine module. Add-on revenue is only injected through `state.revenue.acquisition_revenue` in `projections.ts`, bypassing the dedicated module entirely.

Meanwhile, `ebitdaBridge.ts` references `state.add_on_acquisitions` directly:

```typescript
for (const addon of (state.add_on_acquisitions || [])) {
  addOnEbitda += addon.revenue * addon.ebitda_margin;
}
```

But this uses simple LTM EBITDA (static), not the add-on module's computed contribution (which would include growth and synergies over the hold period). The bridge and projections can diverge.

**Impact:** The add-on modeling module exists but is not integrated. EBITDA bridge add-on contribution may not match what's actually projected.

---

### BUG-16: TypeScript — CreditMetricsYear.leverage comment says "Net Debt" but code uses gross debt

**Files:** `lib/dealEngineTypes.ts`, `lib/engine/creditAnalysis.ts`  
**Verified:** Yes — confirmed against source.

Type definition:
```typescript
leverage: number; // Net Debt / EBITDA
```

Implementation:
```typescript
const leverage = yr.ebitda_adj > 0 ? totalDebt / yr.ebitda_adj : 9999;
```

`totalDebt` comes from `debtSchedule.total_debt_by_year[i]` which is gross debt. The comment and implementation disagree.

**Impact:** Misleading for anyone reading the type definition. If the field were consumed by external tooling that trusts the comment, it would produce incorrect leverage analysis.

---

### BUG-17: TypeScript — Currency duplicated at ModelState and EntryAssumptions

**Files:** `lib/dealEngineTypes.ts`, `lib/engine/modelState.ts`  
**Verified:** Yes — confirmed against source.

```typescript
export interface ModelState {
  currency: 'INR' | 'EUR' | 'USD' | 'GBP' | 'JPY';
  entry: EntryAssumptions;  // which also has: currency: 'INR' | 'EUR' | ...
}
```

Both `state.currency` and `state.entry.currency` exist and can drift apart. The default model state initializes both to `'GBP'`, but there's no synchronization logic.

**Impact:** If a user changes one but not the other, display logic that reads from the wrong field shows the wrong currency symbol.

---

### BUG-18: TypeScript — Reality check Rule 7 over-flags on growth deals

**File:** `lib/engine/realityCheck.ts`  
**Verified:** Yes — confirmed against source.

```typescript
const entryNwc = state.revenue.base_revenue * entryNwcPct;
const exitNwc = exitRevenue * entryNwcPct;
if (exitNwc > entryNwc * 1.2 && entryNwc > 0) {
  flags.push({ flag_type: 'nwc_deterioration', ... });
}
```

Since NWC is modeled as a constant % of revenue, absolute NWC grows proportionally with revenue. Any deal with >~10% cumulative revenue growth will trigger this rule. It flags revenue growth as "NWC deterioration" rather than detecting genuine working-capital efficiency degradation.

**Impact:** Nearly every growth deal gets an NWC warning, reducing the signal value of the reality check.

---

## Summary Table

| ID | Severity | Module | Description |
|---|---|---|---|
| BUG-01 | Critical | debtSchedule.ts | No cash balance roll-forward |
| BUG-02 | Critical | returns.ts | Exit uses gross debt, not net debt series |
| BUG-03 | Critical | debtSchedule.ts | Interest on beginning balance, not average |
| BUG-04 | Critical | debtSchedule.ts | Sweep by array order, not explicit priority |
| BUG-05 | Critical | returns.ts | Value bridge includes distributions in total gain |
| BUG-06 | High | returns.ts | RVPI uses gross debt, not net debt |
| BUG-07 | High | returns.ts | Gross IRR definition inconsistent |
| BUG-08 | High | scenarios.ts | Bear scenario scales all tranches pro-rata |
| BUG-09 | High | scenarios.ts | Bear scenario uses base EBITDA for debt sizing |
| BUG-10 | High | returns.ts | MIP hurdle check differs from Python |
| BUG-11 | High | index/scenarios/fragility | Duplicated solver, inconsistent convergence caps |
| BUG-12 | Moderate | debt_schedule.py | FCCR duplicates DSCR |
| BUG-13 | Moderate | debtSchedule.ts, creditAnalysis.ts | Commitment fees excluded from debt service |
| BUG-14 | Moderate | projections.ts | NWC 'explicit' method silently returns zero |
| BUG-15 | Moderate | addOns.ts | Module is dead code — never called |
| BUG-16 | Moderate | dealEngineTypes.ts, creditAnalysis.ts | Leverage comment says "Net Debt" but code uses gross |
| BUG-17 | Moderate | dealEngineTypes.ts | Currency duplicated at ModelState + Entry |
| BUG-18 | Moderate | realityCheck.ts | Rule 7 over-flags on growth deals |

---

## Key Pattern: TypeScript ↔ Python Divergence

The most striking pattern is that the **Python backend has been audited and fixed** (audit_report.md / audit_report_part2.md) but the **TypeScript engine has not been updated** to match. At least 6 of the critical/high bugs (BUG-01, BUG-03, BUG-04, BUG-05, BUG-06, BUG-08, BUG-09) exist because fixes applied to the Python codebase were never back-ported to TypeScript. Since the TypeScript engine is the canonical client-side computation layer, this divergence means the live app produces different results than the backend for the same inputs.

---

## Recommended Fix Priority

1. **BUG-01 + BUG-02** — Cash roll-forward and exit net debt. These are the highest-impact because they affect every return metric on every deal.
2. **BUG-03** — Average balance interest. Standard LBO convention; affects debt service, sweep, and convergence.
3. **BUG-04** — Sweep priority. Add `sweep_priority` field to `DebtTranche` and implement tiered allocation matching Python.
4. **BUG-05** — Value bridge distributions. Quick fix; remove `totalDistributions` from both `totalGain` and `computedGain`.
5. **BUG-11** — Extract shared solver from `fullRecalc` and call it from scenarios/fragility with the same iteration cap.
6. **BUG-06 + BUG-07 + BUG-10** — Returns module cleanup: RVPI net debt, gross IRR definition, MIP hurdle alignment.
7. **BUG-08 + BUG-09** — Scenario engine: junior-only debt sizing and forward EBITDA.
8. Everything else in Moderate tier.
