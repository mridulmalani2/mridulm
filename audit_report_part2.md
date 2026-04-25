# Audit Part 2 — scenarios.py / projections.py / debt_schedule.py

Model: qwen-3-235b-a22b-instruct-2507  |  2026-04-25 16:32 UTC

---

## scenarios.py

FINDING [1]:  
  File: scenarios.py  
  Line(s): 103–104  
  Code:  
```python
ebitda = state.revenue.base_revenue * state.margins.base_ebitda_margin
bear_debt = bear_leverage * ebitda
```  
  Issue: Uses **entry EBITDA** (base_revenue × base_ebitda_margin) to calculate debt capacity for the Bear scenario, but in an LBO, leverage ratios are typically applied to **forward or average EBITDA**, not necessarily the base (Year 0) EBITDA. More critically, this EBITDA is static and does not reflect the **downside growth and margin assumptions** already being applied in the Bear case. This creates an inconsistency: the debt is sized on optimistic base EBITDA while the P&L suffers reduced growth and margin expansion. This overstates debt capacity in a stress scenario.  
  Fix: Recalculate EBITDA based on **Year 1 or average projected EBITDA under Bear assumptions** after updating growth and margins. At minimum, use the same EBITDA base that will be used in the model post-scenario adjustment. Since margins and growth are updated, recompute a representative entry EBITDA consistent with the scenario.

  Corrected logic:
```python
# After updating growth and margins in `bear`, project Year 1 revenue and EBITDA
year1_revenue = state.revenue.base_revenue * (1 + bear.revenue.growth_rates[0])
year1_ebitda = year1_revenue * bear.margins.margin_by_year[0]  # or base margin if not yet built
bear_debt = bear_leverage * year1_ebitda
```

  However, since `margin_by_year` is cleared at line 100 and rebuilt later, this EBITDA is not yet available. Therefore, the debt sizing occurs **before** margins are properly rebuilt — a circular dependency.

  Better fix: Move debt resizing **after** `bear.derive_entry_fields()` and `ensure_list_lengths()`, which should rebuild margins. Or, explicitly compute a proxy entry EBITDA consistent with the scenario.

FINDING [2]:  
  File: scenarios.py  
  Line(s): 105–110  
  Code:  
```python
old_total = sum(t.principal for t in bear.debt_tranches)
if old_total > 0:
    scale = bear_debt / old_total
    for t in bear.debt_tranches:
        t.principal = t.principal * scale
        t.amortization_schedule = []  # force rebuild
```  
  Issue: Proportionally scales **all debt tranches**, including potentially **fixed instruments like term loans with mandatory amortization**. In reality, leverage adjustments in scenario analysis often only affect the **most junior tranche (e.g., subordinated debt or toggle notes)**, not senior debt which may have fixed structure. Scaling all tranches equally distorts capital structure and may violate debt covenants or market realism. Also, if there are multiple tranches with different seniority, this approach ignores waterfall priorities.  
  Fix: Adjust only the most flexible (typically junior) tranche to hit target leverage. For example, keep senior debt constant and adjust subordinated or mezzanine debt. Alternatively, allow configuration of which tranche absorbs leverage changes.

  Example fix:
```python
# Adjust only the last (most junior) tranche
if bear.debt_tranches:
    junior_tranche = bear.debt_tranches[-1]
    old_total = sum(t.principal for t in bear.debt_tranches)
    new_total_debt = bear_debt
    delta = new_total_debt - (old_total - junior_tranche.principal)
    junior_tranche.principal = max(delta, 0)
    junior_tranche.amortization_schedule = []
```

FINDING [3]:  
  File: scenarios.py  
  Line(s): 156  
  Code:  
```python
stress.exit.exit_ebitda_multiple = max(base_entry_mult - 1.0, 1.0)
```  
  Issue: Uses **entry multiple** (`base_entry_mult`) to set **exit multiple**, which is financially illogical. The Stress scenario description says “-1.0x exit multiple”, but this code applies `-1.0x` to the **entry** multiple, not the **exit**. This is a clear labeling and logic error. It should be based on the **base exit multiple**, not entry.  
  Fix: Change to use `base_exit_mult` instead of `base_entry_mult`.

  Corrected code:
```python
stress.exit.exit_ebitda_multiple = max(base_exit_mult - 1.0, 1.0)
```

FINDING [4]:  
  File: scenarios.py  
  Line(s): 183  
  Code:  
```python
base_growth_avg = sum(state.revenue.growth_rates) / len(state.revenue.growth_rates) if state.revenue.growth_rates else 0.05
```  
  Issue: Uses **arithmetic average** of growth rates for sensitivity table centering. However, in multi-year projections, **CAGR** (geometric mean) is more appropriate for representing effective growth. Using arithmetic average can overstate true growth, especially with volatile rates. While not catastrophic, it introduces a small bias in the sensitivity table’s center point.  
  Fix: Compute CAGR from base revenue to final projected revenue over holding period.

  Example:
```python
if state.revenue.growth_rates:
    base_rev = state.revenue.base_revenue
    final_rev = base_rev
    for g in state.revenue.growth_rates:
        final_rev *= (1 + g)
    n = len(state.revenue.growth_rates)
    base_growth_avg = (final_rev / base_rev) ** (1/n) - 1
else:
    base_growth_avg = 0.05
```

FINDING [5]:  
  File: scenarios.py  
  Line(s): 266  
  Code:  
```python
s.revenue.growth_rates = [growth] * s.exit.holding_period
```  
  Issue: Overwrites **all years** with a **single growth rate**, discarding any existing multi-year growth profile. While intended for sensitivity, this assumes **constant growth** across all years, which may not reflect real-world scenarios where early vs. late growth matters (e.g., ramp-up periods). However, this is likely by design for simplicity. **Not a critical error**, but a modeling limitation worth noting.

  Verdict: Acceptable for sensitivity tables if documented, but not a flaw per se.

FINDING [6]:  
  File: scenarios.py  
  Line(s): 272  
  Code:  
```python
s.margins.target_ebitda_margin = max(min(margin, 0.95), 0.01)
```  
  Issue: Clamps margin between 1% and 95%, which is reasonable, but **does not trigger rebuild of `margin_by_year`**. The `margin_by_year` array is later cleared in `_build_table` at line 245, so this is mitigated. However, if margin evolution depends on ramp-up logic (e.g., linear to target), setting `target_ebitda_margin` without forcing rebuild of the path could lead to stale values — but line 245 does clear it.  
  Verdict: **No error** due to line 245 (`s.margins.margin_by_year = []`).

FINDING [7]:  
  File: scenarios.py  
  Line(s): 277  
  Code:  
```python
s.entry.enterprise_value = 0  # force recalc from multiple
```  
  Issue: Setting `enterprise_value = 0` to force recalculation is a **code smell**. It relies on `derive_entry_fields()` to detect this and recompute EV from EBITDA × multiple. But this is fragile — if the logic in `derive_entry_fields()` does not explicitly check for zero or invalid EV, it may not trigger recalculation. Better to set it to `None` or have an explicit flag.  
  Fix: Use a dedicated method like `s.derive_entry_ev_from_multiple()` or ensure `derive_entry_fields()` properly handles EV recalc when multiple is set.

  However, if `derive_entry_fields()` is designed to always compute EV from multiple when both are present, this may be acceptable. **Potential fragility, not outright error.**

FINDING [8]:  
  File: scenarios.py  
  Line(s): 282–283  
  Code:  
```python
ebitda = s.revenue.base_revenue * s.margins.base_ebitda_margin
new_debt = leverage * ebitda
```  
  Issue: Same as **Finding [1]** — uses **base (Year 0) EBITDA** to size debt in leverage sensitivity, but leverage in LBOs is typically based on **forward EBITDA (Year 1 or average)**. This introduces inconsistency: higher leverage cases may be based on an understated EBITDA if margins grow, overstating leverage.  
  Fix: Use **Year 1 EBITDA** or **average projected EBITDA** consistent with the scenario’s growth and margin assumptions.

  Since `_apply_leverage_exit_mult` is called before `derive_entry_fields()` and `ensure_list_lengths()`, the `margin_by_year` array may not yet reflect updated margins. However, in this function, margins are not being changed — only leverage and exit multiple. So base EBITDA may be the only available proxy.

  Still, for consistency, consider computing a representative EBITDA (e.g., Year 1) using base margin and first-year growth.

  Example:
```python
year1_revenue = s.revenue.base_revenue * (1 + s.revenue.growth_rates[0])
ebitda = year1_revenue * s.margins.base_ebitda_margin
```

FINDING [9]:  
  File: scenarios.py  
  Line(s): 285–292  
  Code:  
```python
old_total = sum(t.principal for t in s.debt_tranches)
if old_total > 0 and s.debt_tranches:
    scale = new_debt / old_total
    for t in s.debt_tranches:
        t.principal = t.principal * scale
        t.amortization_schedule = []  # force rebuild
elif s.debt_tranches:
    s.debt_tranches[0].principal = new_debt
```  
  Issue: Same as **Finding [2]** — **proportionally scales all tranches**, which is financially unrealistic. In a sensitivity on leverage, only the **junior-most tranche** should typically be adjusted to avoid distorting senior debt terms. Scaling all tranches equally can create artificial capital structures (e.g., reducing Term Loan A when market terms are fixed).  
  Fix: Adjust only the last tranche (mezzanine or sub debt) to absorb the leverage change.

  Corrected logic:
```python
if s.debt_tranches:
    total_other = sum(t.principal for t in s.debt_tranches[:-1])
    junior = s.debt_tranches[-1]
    junior.principal = max(new_debt - total_other, 0)
    junior.amortization_schedule = []
else:
    # handle no tranches
    pass
```

FINDING [10]:  
  File: scenarios.py  
  Line(s): 130  
  Code:  
```python
bull.margins.target_ebitda_margin = state.margins.base_ebitda_margin + base_margin_expansion * 1.3
```  
  Issue: Applies **130% of the base margin expansion**, but margin expansion is already a delta. Multiplying it by 1.3 could push margins beyond economic realism, especially if combined with high base margins. While clamped later in `_apply_growth_margin`, this line does **not** clamp, so `target_ebitda_margin` could exceed 100% or violate industry norms.  
  Fix: Clamp the final margin value here or ensure downstream logic handles it. Since `_apply_growth_margin` clamps, and `bull` goes through `ensure_list_lengths()` and `derive_entry_fields()`, this is **mitigated**. Still, better to clamp at assignment.

  Recommended:
```python
target = state.margins.base_ebitda_margin + base_margin_expansion * 1.3
bull.margins.target_ebitda_margin = max(min(target, 0.95), 0.01)
```

FINDING [11]:  
  File: scenarios.py  
  Line(s): 98–99  
  Code:  
```python
half_expansion = base_margin_expansion * 0.5
bear.margins.target_ebitda_margin = state.margins.base_ebitda_margin + half_expansion
```  
  Issue: Similar to above — no clamping of the resulting margin. Could exceed 100% in extreme cases. While unlikely, it’s a defensive programming issue.  
  Fix: Clamp the final margin value.

  Corrected:
```python
target = state.margins.base_ebitda_margin + base_margin_expansion * 0.5
bear.margins.target_ebitda_margin = max(min(target, 0.95), 0.01)
```

FINDING [12]:  
  File: scenarios.py  
  Line(s): 154  
  Code:  
```python
stress_growth.append(base_growth[t] * 0.5 if t < len(base_growth) else 0.0)
```  
  Issue: Uses `base_growth[t]` for `t >= len(base_growth)` not possible due to loop bound `range(hp)`, but if `hp > len(base_growth)`, this could cause index error. The condition `t < len(base_growth)` is correct, but the fallback `0.0` assumes no growth beyond original forecast — reasonable.  
  Verdict: **No error** — logic is safe.

---

### SUMMARY of Critical Issues (Highest to Lowest Severity)

1. **[Critical]** **Finding [3]**: Stress scenario uses **entry multiple** instead of **exit multiple** to set exit valuation — this is a **material logic error** that invalidates the Stress case. Must be fixed immediately.

2. **[High]** **Finding [1] & [8]**: Debt sizing in Bear and Leverage scenarios uses **base (Year 0) EBITDA** instead of **forward EBITDA**, leading to **inconsistent leverage application**. This biases results and misstates debt capacity in downside cases.

3. **[High]** **Finding [2] & [9]**: **Proportional scaling of all debt tranches** distorts capital structure and ignores real-world debt seniority. Should only adjust junior tranches for leverage changes.

4. **[Medium]** **Finding [10] & [11]**: Lack of **margin clamping** in Bull and Bear scenarios — while mitigated downstream, it’s poor defensive coding and risks invalid assumptions.

5. **[Low]** **Finding [4]**: Use of arithmetic mean instead of CAGR for growth centering — minor bias, but best practice is geometric mean.

6. **[Low]** **Finding [7]**: Fragile EV recalculation via setting to 0 — better to use explicit recalc flag or method.

---

**Recommendation**: Fix **Finding [3]** immediately. Address **Findings [1], [2], [8], [9]** for financial realism. Apply clamping in **Findings [10], [11]** for robustness.

---

## projections.py

FINDING [1]:  
File: projections.py  
Line(s): 77  
Code: `nopat = ebit * (1.0 - tax_rate)`  
Issue: NOPAT (Net Operating Profit After Tax) is incorrectly calculated using the **statutory tax rate** instead of the **effective tax rate**. This line assumes taxes are always paid at the statutory rate, ignoring NOLs, minimum tax rules, and actual tax paid. In reality, NOPAT should reflect the true after-tax operating earnings, which depends on the actual tax expense, not a mechanical application of the statutory rate. Using `tax_rate` here creates an internal inconsistency because elsewhere (e.g., line 70), the model applies a more nuanced tax calculation involving NOLs and minimum tax.  
Fix:  
```python
nopat = ebit - yr.tax  # Use actual tax from P&L, not statutory rate
```
Or, if NOPAT must be computed before tax is finalized, it should use the effective tax rate implied by the tax calculation:
```python
effective_tax_rate = yr.tax / yr.ebt if yr.ebt != 0 else 0.0
nopat = ebit * (1.0 - effective_tax_rate)
```
But best practice is to derive NOPAT as `EBIT - tax`, where tax includes all adjustments (NOLs, minimum tax, etc.).

---

FINDING [2]:  
File: projections.py  
Line(s): 67–68  
Code:  
```python
nol_usage = min(nol_remaining, raw_tax) if nol_remaining > 0 else 0.0
tax_after_nol = raw_tax - nol_usage
```
Issue: **NOLs reduce taxable income, not tax liability directly.** The model incorrectly treats NOLs as a dollar-for-dollar reduction in tax (like a tax credit), when in reality NOLs reduce **pre-tax income (EBT)**. This leads to a material overstatement of tax savings, especially when the NOL balance exceeds taxable income. The correct logic is:  
- First apply NOLs to reduce EBT: `taxable_income = max(0, ebt - nol_usage)`  
- Then compute tax on the resulting taxable income.  
Currently, the model allows NOLs to offset tax liability even if EBT is less than the NOL amount, which is incorrect.  
Fix:  
```python
if ebt > 0:
    nol_usage = min(nol_remaining, ebt)  # NOLs reduce income, not tax
    taxable_income = ebt - nol_usage
    raw_tax = taxable_income * tax_rate
    min_tax = taxable_income * min_tax_rate if taxable_income > 0 else 0.0
    tax = max(raw_tax, min_tax)
    nol_remaining -= nol_usage
else:
    tax = 0.0
    nol_usage = 0.0
```

---

FINDING [3]:  
File: projections.py  
Line(s): 71  
Code: `nol_remaining -= nol_usage`  
Issue: **NOL usage is decremented in both passes (initial and updated), leading to double consumption.** The variable `nol_remaining` is initialized once at the top of each function (`build_projections` and `update_projections_with_debt`) from `state.tax.nol_carryforward`, but it is modified in both passes without being reset or passed between them. This means NOLs are consumed twice — once during the initial projection and again during the debt update — violating conservation of NOL balance.  
Fix: NOL tracking should be stateful and carried forward across functions. Either:  
- Return the final `nol_remaining` from `build_projections` and pass it into `update_projections_with_debt`, or  
- Move NOL tracking into `ModelState` and update it during projection.  
Additionally, the second pass should **not re-consume NOLs** unless the first pass did not use them. Best to perform tax/NOL logic **only once**, after final interest is known.

---

FINDING [4]:  
File: projections.py  
Line(s): 91  
Code: `fcf_pre_debt = ebitda_adj - tax - total_capex - delta_nwc`  
Issue: **Incorrect Free Cash Flow formula.** FCF should be derived from **NOPAT**, not EBITDA minus tax. The correct formula is:  
`FCF = NOPAT + D&A - Capex - ΔNWC`  
Here, `ebitda_adj` is EBITDA less monitoring fees (a cash cost), but subtracting tax directly from EBITDA bypasses the proper bridge from operating income to after-tax cash flow. This formula may coincidentally work if D&A = 0, but generally it’s flawed.  
Moreover, `ebitda_adj` includes monitoring fees, which are already cash expenses, so they should not be double-counted.  
Fix:  
```python
fcf_pre_debt = nopat + da - total_capex - delta_nwc
```
This ensures FCF reflects true operating cash generation.

---

FINDING [5]:  
File: projections.py  
Line(s): 162  
Code: `yr.fcf_to_equity = yr.fcf_pre_debt - actual_cash_interest - actual_repayment`  
Issue: **Incorrect FCF to Equity calculation.** FCFE is not `FCF - cash interest - repayment`. The correct formula is:  
`FCFE = Net Income + D&A - Capex - ΔNWC + Net Borrowing`  
Alternatively:  
`FCFE = FCF - Interest * (1 - tax) + Net Debt Proceeds`  
But here, the model subtracts **gross** cash interest and repayment from pre-debt FCF, which double-counts interest. Since `fcf_pre_debt` already subtracts **total tax** (which includes the tax shield from interest), subtracting **gross interest** again removes the full interest expense, not the after-tax cost.  
Additionally, repayment is correctly subtracted, but **new borrowings** are not added — netting is required.  
Fix:  
```python
net_debt_issuance = actual_repayment  # if actual_repayment is negative for new debt
yr.fcf_to_equity = yr.net_income + yr.da - yr.total_capex - yr.delta_nwc + net_debt_issuance
```
Or, if `actual_repayment` is positive for repayments (as likely), then:
```python
net_debt_issuance = -actual_repayment  # negative if repayment
yr.fcf_to_equity = yr.net_income + yr.da - yr.total_capex - yr.delta_nwc + net_debt_issuance
```
Alternatively, if `fcf_pre_debt` is truly unlevered FCF (UFCF), then:
```python
yr.fcf_to_equity = yr.fcf_pre_debt - actual_cash_interest * (1 - tax_rate) + net_debt_issuance
```
But the current form is fundamentally wrong.

---

FINDING [6]:  
File: projections.py  
Line(s): 44  
Code: `ebitda_adj = ebitda - monitoring_fee`  
Issue: **Monitoring fee is subtracted from EBITDA, but may not be an add-back.** If the monitoring fee is a **cash fee paid to the sponsor**, it should be treated as a **distribution**, not an operating expense. Deducting it from EBITDA reduces operating profitability, which is misleading. In LBO models, sponsor monitoring fees are often considered **non-operating** and are funded from cash flow after operations.  
However, if the fee is a real operating cost (e.g., for services rendered), it may belong in EBITDA. But typically, such fees are **not** part of core operations and should be excluded from EBITDA but shown as a cash outflow below.  
This line reduces EBITDA, which affects valuation multiples and debt capacity analysis — potentially understating enterprise value.  
Fix: Keep EBITDA clean. Move monitoring fee to post-EBITDA cash flow section:
```python
# Remove line 44
# Instead, deduct monitoring_fee from FCF or treat as distribution
```
And adjust FCF accordingly:
```python
fcf_pre_debt = nopat + da - total_capex - delta_nwc - monitoring_fee
```

---

FINDING [7]:  
File: projections.py  
Line(s): 30  
Code: `fin_fee_amort = financing_fees / hp if hp > 0 else 0.0`  
Issue: **Financing fee amortization is spread over holding period, but should be over loan life or IRS rules (e.g., 5–7 years).** The model amortizes financing fees over the **holding period**, which is arbitrary. In reality, debt issuance costs are amortized over the **term of the debt** (e.g., 7 years for term loans), not the investor’s hold period. This can distort interest expense and tax shields if the holding period is shorter or longer than the debt term.  
Fix: Use `debt_term = min(hp, tranche.term_years)` or pull amortization period from tranche terms. Alternatively, allow user-defined amortization period:
```python
amort_period = state.debt.financing_fee_amort_years
fin_fee_amort = financing_fees / amort_period if amort_period > 0 else 0.0
```

---

FINDING [8]:  
File: projections.py  
Line(s): 54, 57, 60  
Code:  
```python
interest_estimate += tranche.principal * tranche.interest_rate
...
interest_estimate += tranche.principal * eff_rate
...
interest_estimate += tranche.principal * tranche.pik_rate
```  
Issue: **Interest is calculated on beginning principal, but no amortization is considered.** The model uses static `tranche.principal`, which appears to be **initial principal**, not updated for repayments. This overstates interest expense in later years. In a proper LBO model, debt amortizes, so interest must be calculated on **outstanding balance**, not initial principal.  
This is a critical flaw: using constant principal ignores the entire debt paydown dynamic.  
Fix: Interest must be computed based on **beginning-of-year debt balance**, which requires integrating with the debt schedule. The current `estimate` approach is insufficient unless it uses dynamic balances.

---

FINDING [9]:  
File: projections.py  
Line(s): 86  
Code: `delta_nwc = (revenue - prev_revenue) * nwc_pct`  
Issue: **ΔNWC should be based on change in NWC, not revenue change × NWC %.** The formula assumes NWC is a constant % of revenue, so ΔNWC = ΔRevenue × NWC%. This is only correct if NWC is defined as a % of revenue. However, if NWC is already a level (e.g., days sales outstanding), this formula is invalid.  
More importantly, the correct formula is:  
`ΔNWC = NWC_t - NWC_{t-1}`  
Where `NWC_t = revenue_t * nwc_pct`. So:  
`ΔNWC = (revenue_t * nwc_pct) - (revenue_{t-1} * nwc_pct)`  
= `nwc_pct * (revenue_t - revenue_{t-1})`  
So this line is **mathematically correct** under the assumption that NWC is a % of revenue.  
However, **only if `nwc_pct` is constant**. If `nwc_pct` changes over time, this formula fails.  
Given the context, this line is **conditionally correct**, but brittle. No change needed if % is constant.

---

FINDING [10]:  
File: projections.py  
Line(s): 159  
Code: `yr.fcf_pre_debt = yr.ebitda_adj - yr.tax - yr.total_capex - yr.delta_nwc`  
Issue: **Recomputing FCF_pre_debt in second pass using same flawed formula.** This repeats the error from line 91. Since `tax` has been updated, FCF must be recomputed — but using the same incorrect formula. The fix must be applied here as well.  
Fix: As in Finding [4], replace with:
```python
yr.fcf_pre_debt = yr.nopat + yr.da - yr.total_capex - yr.delta_nwc
```

---

### SUMMARY: Critical Issues

1. **[Critical]** **NOLs are applied to tax liability, not taxable income** (Line 67–68) → Overstates tax savings.  
2. **[Critical]** **NOPAT is miscalculated using statutory tax rate** (Line 77) → Misstates core operating cash flow.  
3. **[Critical]** **FCF_pre_debt uses incorrect formula** (Lines 91, 159) → Invalidates all FCF and valuation outputs.  
4. **[High]** **FCF to Equity subtracts gross interest, not after-tax** (Line 162) → Double-counts interest cost.  
5. **[High]** **NOLs are consumed twice across two passes** (Lines 71, 153) → Artificially depletes NOLs.  
6. **[High]** **Interest estimated on static principal** (Lines 54, 57, 60) → Overstates interest in later years.  
7. **[Medium]** **Monitoring fee reduces EBITDA** (Line 44) → Distorts operating performance.  
8. **[Medium]** **Financing fee amortized over hold period, not debt term** (Line 30) → Incorrect tax timing.

---

**Recommendation**: Refactor tax and FCF logic into a single pass **after** debt schedule is built. Eliminate duplicate NOL consumption. Use proper FCF and NOPAT definitions. Integrate dynamic debt balances for interest calculation.

---

## debt_schedule.py

FINDING [1]:  
  File: debt_schedule.py  
  Line(s): 36–37  
  Code:  
```python
proj_yr = projections.years[yr_idx] if yr_idx < len(projections.years) else None
fcf_pre_debt = proj_yr.fcf_pre_debt if proj_yr else 0.0
```  
  Issue:  
The variable `fcf_pre_debt` is used later (e.g., line 84) to calculate available cash for sweep and DSCR. However, **"FCF pre-debt" is not a standard financial term** and appears to be misapplied here. Based on line 142’s comment:  
> *DSCR: (EBITDA – Capex – ΔNWC – Taxes) / Interest only — principal excluded per IC convention*  

This implies that `fcf_pre_debt` should represent **Free Cash Flow to Firm (FCFF)**, i.e., cash available before debt service but after operating expenses, taxes, capex, and working capital changes.  

However, if `projections.years` does not contain FCFF and instead contains levered free cash flow (FCFE), this would be a **critical error**, as using FCFE (post-interest) in DSCR and cash sweep calculations would understate available cash and distort debt repayment capacity.  

Additionally, falling back to `0.0` when no projection exists silently ignores potential model errors or misalignment between holding period and projection length.  

  Fix:  
Explicitly validate that `projections.years` covers the full holding period and clarify that `fcf_pre_debt` is **FCFF** (unlevered free cash flow). Add validation:  
```python
if yr_idx >= len(projections.years):
    raise ValueError(f"Projection data missing for year {yr}")
fcf_pre_debt = projections.years[yr_idx].fcf_pre_debt  # Must be FCFF
```

---

FINDING [2]:  
  File: debt_schedule.py  
  Line(s): 64  
  Code:  
```python
entry.cash_interest = beg_bal * eff_rate if tranche.cash_interest else 0.0
```  
  Issue:  
This line assumes interest is calculated on beginning balance only — **correct for simple cases**, but **fails to account for intra-year repayments** (e.g., amortizing debt). While common to approximate interest on beginning balance, in a precise LBO model with significant amortization or mid-year repayments, this introduces **a small upward bias in interest expense**.  

More critically, **no compounding logic is applied for PIK tranches** — but that is handled separately via `pik_accrual`. The bigger issue is consistency: if PIK accrues on balance, so should cash interest unless explicitly modeled as paid-in-arrears with no compounding.  

  Fix:  
For accuracy, consider average balance for interest calculation:  
```python
avg_bal = (beg_bal + max(0, beg_bal - entry.scheduled_repayment)) / 2
entry.cash_interest = avg_bal * eff_rate if tranche.cash_interest else 0.0
```  
Alternatively, document assumption clearly.

---

FINDING [3]:  
  File: debt_schedule.py  
  Line(s): 70  
  Code:  
```python
entry.scheduled_repayment = min(sched[yr_idx], beg_bal + entry.pik_accrual)
```  
  Issue:  
This allows scheduled repayment to exceed the current balance **only if PIK has accrued**, which is correct in principle. However, **PIK accrual increases the debt balance**, so repayment cannot exceed the updated balance. The logic is sound here — `beg_bal + pik_accrual` is the correct pre-repayment balance.  

But: **no handling of over-amortization schedules**. If `sched[yr_idx]` is defined as a percentage or fixed amount without regard to remaining balance, this `min()` prevents negative balances — good. However, **future scheduled repayments may still reference original schedule**, leading to double-counting or missed adjustments.  

  Fix:  
Ensure `amortization_schedule` in `tranche` is either:  
- Expressed in absolute dollars amortizing to zero, or  
- Recalculated dynamically (e.g., straight-line over life).  
Add assertion:  
```python
assert sum(sched) <= tranche.principal * 1.1, "Amortization schedule exceeds initial principal significantly"
```

---

FINDING [4]:  
  File: debt_schedule.py  
  Line(s): 84  
  Code:  
```python
available_for_sweep = fcf_pre_debt - total_mandatory_amort - total_cash_interest - min_cash
```  
  Issue:  
**This is a fundamental error in cash sweep logic.**  

In an LBO, **cash sweep is applied to excess cash *after* all operating needs and mandatory debt service**, but **interest is *not* subtracted from FCF to determine sweepable cash**, because:  
- **Interest is a use of cash already**, and  
- **FCF_pre_debt is assumed to be after interest** (as per line 142: DSCR = FCF / Interest).  

Wait — contradiction:  
- If `fcf_pre_debt` is **after interest**, then subtracting interest again here **double-counts interest**.  
- If `fcf_pre_debt` is **before interest**, then DSCR on line 143 is wrong (should be EBITDA - CapEx - ΔNWC - Taxes, not FCF).  

So we have **a critical inconsistency**:  

> Line 143: `dscr_by_year.append(fcf_pre / tot_cash_int ...)`  
> Line 84: `available_for_sweep = fcf_pre_debt - total_mandatory_amort - total_cash_interest - min_cash`

These two lines **cannot both be correct** unless `fcf_pre_debt` is **before interest and principal**.

But standard definition:  
**DSCR = (EBITDA – CapEx – ΔNWC – Taxes) / (Cash Interest)**  
= **Unlevered Free Cash Flow (FCFF)** / Cash Interest  

And **cash sweep capacity = FCFF – mandatory amort – minimum cash**  
→ **Interest is *not* subtracted again**, because it's already embedded in FCFF (which is after interest expense for tax purposes, but FCFF is *before* interest).  

Wait — **FCFF is defined as**:  
= EBIT(1–T) + D&A – CapEx – ΔNWC  
= **Unlevered**, so **does not deduct interest**  

Therefore:  
- `fcf_pre_debt` **must be FCFF (unlevered)** → **does NOT include interest deduction**  
- Then line 84 **must NOT subtract interest again**, because interest is *paid from* this cash flow, not deducted *to compute* it  
- But line 84 **does subtract interest**, which is wrong  

**Conclusion: `total_cash_interest` should NOT be subtracted in available_for_sweep**  

  Fix:  
```python
available_for_sweep = fcf_pre_debt - total_mandatory_amort - min_cash
```  
Interest is a cash outflow but is **not subtracted when computing excess cash for sweep** — because the FCF already represents cash available *before* interest and principal. The interest is simply another use of cash, but **sweep is subordinate to *all* debt service (interest + mandatory principal)**.  

But wait — **interest must be paid before sweep**, so it **must be subtracted** from available cash.  

Clarify timing:  
In a debt waterfall:  
1. Operating cash flow (FCFF)  
2. Pay cash interest  
3. Pay mandatory amortization  
4. Maintain minimum cash  
5. Remaining → available for optional repayments (sweep)  

So:  
**available_for_sweep = FCFF – cash_interest – mandatory_amort – min_cash**  

→ So line 84 is **correct in structure**  

But then DSCR on line 143 is **also** `fcf_pre_debt / tot_cash_int` → which is **FCFF / interest**, which is **correct**  

So both can be correct **only if `fcf_pre_debt` is FCFF (unlevered, before interest)**  

But then **how is interest paid**? It must come from FCFF → so yes, it must be subtracted  

So line 84 is **correct** only if `fcf_pre_debt` is **FCFF (before interest)**  

But then **why is it called `fcf_pre_debt`**? That suggests before *any* debt service — which would include interest. So naming is confusing but logic may be okay.  

However, **the real issue is circularity**:  
- Interest depends on debt balance  
- Debt balance depends on sweep  
- Sweep depends on FCF after interest  
→ This creates a **circular reference**  

But the model computes interest **before** knowing if there's enough FCF to pay it — and assumes it's always paid.  

There is **no default or shortfall handling**.  

  Issue:  
**No check whether cash interest can actually be paid**. The model assumes all interest is paid in cash, even if FCF is insufficient. This violates basic debt waterfall priority.  

  Fix:  
Introduce **interest shortfalls** or **default logic**. At minimum, cap cash interest by available cash after operating needs. But this requires restructuring the waterfall.  

For now, flag:  
**Model assumes all cash interest is paid regardless of FCF availability — dangerous in stressed cases.**

---

FINDING [5]:  
  File: debt_schedule.py  
  Line(s): 88  
  Code:  
```python
max_sweep = max(0.0, available_for_sweep * tranche.cash_sweep_pct)
```  
  Issue:  
**Cash sweep percentage should apply to total excess cash, not per tranche independently.**  

Standard cash sweep mechanics:  
- Excess cash is swept **pro rata or in priority order** across tranches based on **sweep percentages or seniority**  
- But **the total sweep cannot exceed available_for_sweep**  
- Here, each tranche gets `available_for_sweep * tranche.cash_sweep_pct`, which could result in **total sweep > available_for_sweep** if multiple tranches have high sweep percentages (e.g., 100% each)  

Example: two tranches, both `cash_sweep_pct=1.0` → each gets full `available_for_sweep` → total sweep = 2× available → **over-repayment**  

  Fix:  
Implement **priority stack** or **pro-rata allocation**. One fix:  
```python
total_sweep_pcts = sum(
    t.cash_sweep_pct for t in tranches if t.amortization_type == "cash_sweep"
)
sweep_pool = available_for_sweep
for t_idx, tranche in enumerate(tranches):
    entry = year_entries[t_idx]
    if tranche.amortization_type == "cash_sweep" and total_sweep_pcts > 0:
        share = tranche.cash_sweep_pct / total_sweep_pcts
        max_sweep = sweep_pool * share
        remaining = entry.beginning_balance + entry.pik_accrual - entry.scheduled_repayment
        entry.sweep_repayment = min(max_sweep, max(0.0, remaining))
        sweep_pool -= entry.sweep_repayment
    else:
        entry.sweep_repayment = 0.0
```

---

FINDING [6]:  
  File: debt_schedule.py  
  Line(s): 140  
  Code:  
```python
leverage_by_year.append(tot_debt / ebitda_adj if ebitda_adj > 0 else 0.0)
```  
  Issue:  
Using `ebitda_adj` for leverage ratio is acceptable if it represents **forward or LTM EBITDA**. However, **leverage ratio in LBO models should typically use *entry* EBITDA for Year 0, then *actual* for subsequent years**.  

More importantly: **no handling of zero or negative EBITDA** — returns `0.0` leverage if EBITDA ≤ 0, which is misleading. Should return `inf` or `None` or raise warning.  

  Fix:  
```python
leverage_by_year.append(float('inf') if ebitda_adj <= 0 else tot_debt / ebitda_adj)
```

---

FINDING [7]:  
  File: debt_schedule.py  
  Line(s): 141  
  Code:  
```python
coverage_by_year.append(ebitda_adj / tot_cash_int if tot_cash_int > 0 else 99.0)
```  
  Issue:  
Interest coverage ratio should be **EBIT / interest**, not **EBITDA / interest**.  
- **EBITDA coverage** is sometimes used, but **true interest coverage is EBIT / interest** because D&A is non-cash and cannot service interest.  
- Using EBITDA inflates coverage and is **aggressive**.  

Also, returning `99.0` when interest is zero is arbitrary and masks model risk.  

  Fix:  
Use EBIT if available. If not, document assumption. At minimum:  
```python
coverage_by_year.append(
    ebitda_adj / tot_cash_int if tot_cash_int > 0 else float('inf')
)
```

---

FINDING [8]:  
  File: debt_schedule.py  
  Line(s): 142–143  
  Code:  
```python
# DSCR: (EBITDA – Capex – ΔNWC – Taxes) / Interest only — principal excluded per IC convention
dscr_by_year.append(fcf_pre / tot_cash_int if tot_cash_int > 0 else 99.0)
```  
  Issue:  
Comment correctly defines DSCR as **(EBITDA – CapEx – ΔNWC – Taxes) / Interest** = **FCFF / Interest**  
But `fcf_pre` is assumed to be this value — so if `fcf_pre_debt` is indeed FCFF, this is correct.  

However, **DSCR should include mandatory amortization in denominator** in many lender definitions.  

Wait — comment says: “principal excluded per IC convention” — this is **incorrect**.  

**Standard DSCR (Debt Service Coverage Ratio)** includes **both interest and mandatory principal** in denominator:  
> DSCR = Net Operating Income / Total Debt Service (Interest + Principal)  

But **Interest Coverage Ratio** = EBIT / Interest  

Here, the ratio is called `dscr_by_year`, but denominator is only interest → **misnamed**.  

  Fix:  
Rename to `interest_coverage_dscr` or better:  
```python
# Rename variable
interest_coverage = fcf_pre / tot_cash_int if tot_cash_int > 0 else float('inf')
dscr = fcf_pre / (tot_cash_int + mandatory_amort) if (tot_cash_int + mandatory_amort) > 0 else float('inf')
```  
And return both.

---

FINDING [9]:  
  File: debt_schedule.py  
  Line(s): 139  
  Code:  
```python
net_debt_by_year.append(tot_debt)  # no cash on BS modelled
```  
  Issue:  
Net debt = gross debt – cash. By setting `net_debt = gross_debt`, the model assumes **zero cash**, which may be intentional, but **minimum cash balance is used in sweep logic (line 83)**.  

If `min_cash` is required on balance sheet, then **net debt should be `tot_debt - min_cash`**, because that cash is trapped and unavailable to repay debt.  

  Fix:  
```python
net_debt_by_year.append(max(0.0, tot_debt - min_cash))
```

---

FINDING [10]:  
  File: debt_schedule.py  
  Line(s): 108–111  
  Code:  
```python
if shield:
    entry.interest_tax_shield = entry.cash_interest * tax_rate
else:
    entry.interest_tax_shield = 0.0
```  
  Issue:  
**Tax shield should apply to *all* interest, including PIK**, if PIK is tax-deductible (which it usually is in jurisdictions like the US).  

Currently, only `cash_interest` is used — **PIK interest is not included in tax shield**, which understates tax savings.  

  Fix:  
```python
total_interest_expense = entry.cash_interest + entry.pik_accrual
entry.interest_tax_shield = total_interest_expense * tax_rate if shield else 0.0
```

---

### SUMMARY: Critical Issues Ranked

1. **[FINDING 5]** **Cash sweep logic allows over-sweeping** due to per-tranche percentage application without pooling — **breaks debt waterfall priority**, can over-repay debt.  
2. **[FINDING 8]** **DSCR is misdefined** — excludes mandatory amortization, despite standard covenant definitions requiring it. **Misleads on covenant compliance risk**.  
3. **[FINDING 10]** **Tax shield excludes PIK interest** — understates tax savings, distorts FCFF and valuation.  
4. **[FINDING 4]** **Assumes interest always paid** — no shortfall or default modeling in cash-constrained scenarios.  
5. **[FINDING 9]** **Net debt ignores minimum cash** — inconsistent with sweep logic that reserves cash.  
6. **[FINDING 7]** **Interest coverage uses EBITDA instead of EBIT** — inflates ratio, less conservative.  
7. **[FINDING 6]** **Leverage ratio returns 0.0 on negative EBITDA** — should be infinity or undefined.  
8. **[FINDING 1]** **Unclear definition of `fcf_pre_debt`** — must be confirmed as FCFF (unlevered).  
9. **[FINDING 3]** **Amortization schedule not validated** — risk of over-amortization.  
10. **[FINDING 2]** **Interest on beginning balance only** — minor bias, but acceptable with documentation.

---

**Recommendation**:  
Refactor the debt waterfall to:  
- Define a strict **cash flow waterfall order** (taxes, interest, mandatory amort, sweep)  
- Pool sweep capacity and allocate by tranche priority  
- Use **FCFF = EBIT(1–T) + D&A – CapEx – ΔNWC** as base  
- Include **PIK in tax shield**  
- Distinguish between **interest coverage** and **DSCR**  
- Model **default or shortfall** if cash insufficient  

This model is **usable for base-case** but **unsafe for covenant testing or stressed scenarios**.

---

