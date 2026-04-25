# LBO Deal Engine — Cerebras Financial Logic Audit Report

Model: qwen-3-235b-a22b-instruct-2507  |  Date: 2026-04-25 16:27 UTC

---

## reality_check.py

FINDING [1]:  
File: reality_check.py  
Line(s): 57  
Code: `impact_eq = impact_ev - exit_net_debt - state.fees.exit_fee_pct * impact_ev - returns.mip_payout`  
Issue: The exit fee is incorrectly applied to the *impact EV* (which assumes entry multiple), but in reality, advisory and financing fees are typically contractual and based on the **actual transaction value**, not a hypothetical one. Applying the exit fee to a lower (impact) EV understates the fee drag and overstates the equity proceeds in the sensitivity test. This biases the IRR impact upward (less negative), making the multiple expansion appear less risky than it is.  
Fix: Use the actual exit EV for fee calculation:  
```python
impact_eq = impact_ev - exit_net_debt - state.fees.exit_fee_pct * returns.exit_ev - returns.mip_payout
```

---

FINDING [2]:  
File: reality_check.py  
Line(s): 73  
Code: `impact_eq = exit_ev - impact_net_debt - state.fees.exit_fee_pct * exit_ev - returns.mip_payout`  
Issue: In Rule 2, the logic tests leverage reversion to entry level but keeps the **higher exit EV** (implying multiple expansion). However, if leverage is reduced to entry levels, the capital structure is less aggressive, which would likely coincide with a **lower exit multiple**, not the same high one. The IRR recalibration should assume both entry leverage *and* entry multiple to be consistent. Otherwise, it creates an inconsistent hybrid scenario (high multiple, low leverage) that doesn't reflect real buyer behavior.  
Fix: Recalculate EV at entry multiple:  
```python
impact_ev = exit_ebitda * entry_multiple
impact_eq = impact_ev - impact_net_debt - state.fees.exit_fee_pct * impact_ev - returns.mip_payout
```

---

FINDING [3]:  
File: reality_check.py  
Line(s): 97–98  
Code:  
```python
ev_pct_discount_for_hurdle = gap_bps / 10000 * 5  # rough linear approx over 5yr hold
implied_discount_ev = exit_ev * ev_pct_discount_for_hurdle
```  
Issue: The approximation `gap_bps / 10000 * 5` assumes a linear relationship between IRR shortfall and EV reduction, but IRR is **nonlinear** in exit value. A 15% IRR target implies a future value of `equity_entry * (1.15)^n`, so the required EV reduction should be derived from solving for the exit equity that achieves this, not a heuristic multiplier. This approximation is directionally correct but quantitatively unreliable—especially for large gaps or long holds.  
Fix: Compute required buyer equity and back out required EV:  
```python
required_buyer_equity = buyer_equity_current / ((1 + 0.15) ** 5) * (1 + implied_buyer_irr) ** 5  # Not trivial
# Better: numerically solve for EV that gives 15% IRR
```
Alternatively, remove the approximation and state: "A full re-underwriting is required to determine precise EV adjustment."

---

FINDING [4]:  
File: reality_check.py  
Line(s): 147  
Code: `alt_equity = alt_ev + state.fees.transaction_costs + state.fees.financing_fee_pct * state.entry.total_debt_raised - state.entry.total_debt_raised`  
Issue: This formula misstates the entry equity. In an LBO, **equity = enterprise value – debt + transaction fees funded by equity**. The correct formula is:  
`equity = (EV + fees) – debt`, where fees include advisory, financing, and other equity-funded costs.  
Here, `alt_ev` is the new entry EV (at sector median), but the formula adds transaction costs and financing fees on top, then subtracts total debt. However, `state.fees.financing_fee_pct * total_debt_raised` is already included in `total_debt_raised` as PIK or upfront deduction. Double-counting financing fees inflates required equity.  
Fix:  
```python
total_equity_fees = state.fees.transaction_costs  # Assume financing fee is embedded in debt or already netted
alt_equity = alt_ev + total_equity_fees - state.entry.total_debt_raised
```
Or better, use the model’s standard entry equity logic.

---

FINDING [5]:  
File: reality_check.py  
Line(s): 255  
Code: `buyer_exit_equity = buyer_exit_ev - buyer_debt * 0.7  # assume ~30% debt paydown`  
Issue: The assumption of 30% debt paydown via `buyer_debt * 0.7` implies the buyer carries forward only 70% of the initial debt. However, in a standard LBO hold period, **debt paydown comes from FCF**, not an arbitrary percentage. Assuming 30% paydown without modeling FCF or amortization is arbitrary and likely optimistic. If EBITDA grows, paydown could be higher; if not, it could be minimal. This introduces significant model risk.  
Fix: Project debt schedule over 5 years using assumed FCF and mandatory amortization:  
```python
# Simplified: assume constant FCF = exit_ebitda * (1 - tax) - capex - int exp, etc.
# Or: use a fixed paydown % based on FCCR, but document assumption.
```
Alternatively, clarify this is a placeholder and should be replaced with dynamic projection.

---

FINDING [6]:  
File: reality_check.py  
Line(s): 307–308  
Code:  
```python
full_debt_service = tot_cash_int + mandatory_amort
fccr = fcf_pre / full_debt_service if full_debt_service > 0 else 99.0
```  
Issue: **Correct in concept** (FCCR = FCF / total debt service), but the `fccr` is labeled as such and used later, yet in line 328 it is assigned to `senior_leverage`, which is a **naming error**.  
Wait — no, line 328 says:  
```python
senior_leverage=leverage,
```  
This is **not an error** — it's assigning the total leverage to senior_leverage, which may be acceptable if only one senior tranche exists. But if there are multiple tranches (e.g., Senior A/B), this conflates total leverage with senior leverage.  
Issue: `senior_leverage` should reflect only senior debt (e.g., first-lien), not total debt. Using total leverage misrepresents credit quality.  
Fix: Compute senior leverage separately:  
```python
senior_debt = sum(tranche_balance for t_idx, tranche in enumerate(state.debt_tranches) if tranche.type == "Senior")
senior_leverage = senior_debt / ebitda_adj if ebitda_adj > 0 else 0.0
```

---

FINDING [7]:  
File: reality_check.py  
Line(s): 378–383  
Code:  
```python
equity_check = state.entry.equity_check
equity_recovery_pct = min(1.0, remaining_ev / equity_check) if equity_check > 0 else 0.0
```  
Issue: In a recovery waterfall, **equity is residual and receives nothing until all debt is paid**. The code correctly appends equity at the end, but the recovery is capped at 100%, which is fine. However, `equity_check` is unclear — if it represents initial equity invested, then `remaining_ev / equity_check` is the **recovery on invested equity**, which is correct. But if `equity_check` includes reinvested returns or is misdefined, this breaks.  
No error if `equity_check` = initial equity. But the name suggests a validation flag, not a dollar amount.  
Issue: **Misleading variable name** — `equity_check` implies a boolean or validation, not a monetary value. This risks confusion and bugs.  
Fix: Rename to `initial_equity` or `entry_equity` in state model.

---

FINDING [8]:  
File: reality_check.py  
Line(s): 395–397  
Code:  
```python
refinancing_risk = exit_debt > exit_ebitda * 4.5 if exit_ebitda > 0 else False
refinancing_detail = (
    f"Exit leverage {exit_debt / exit_ebitda:.1f}x exceeds 4.5x refinancing threshold"
    if refinancing_risk and exit_ebitda > 0
    else ""
)
```  
Issue: The refinancing risk threshold of **4.5x** is reasonable, but the logic uses `exit_debt` and `exit_ebitda` from the model, which may assume **optimistic EBITDA growth**. In a refinancing scenario, lenders will underwrite conservatively — likely using **stressed or normalized EBITDA**, not peak exit EBITDA. Relying on exit EBITDA overstates capacity.  
Issue: No stress applied to EBITDA in refinancing risk check — should use a normalized or downside case.  
Fix: Use a conservative EBITDA (e.g., 3-year average or stress case):  
```python
conservative_ebitda = min(exit_ebitda * 0.8, projections.years[-2].ebitda_adj) if len(projections.years) > 1 else exit_ebitda * 0.8
refinancing_risk = exit_debt > conservative_ebitda * 4.5
```

---

FINDING [9]:  
File: reality_check.py  
Line(s): 490–522  
Code: Multiple `FragilityStressResult` entries  
Issue: In the fragility engine, the **delta IRR** is computed as `stressed_irr - base_irr`, but IRRs can be negative or near zero. The `_delta_irr` function returns `stressed - base`, which could be negative (correct), but in line 525:  
```python
combined_drop = abs(_delta_irr(c_irr) or 0.0)
```  
Using `abs()` assumes the IRR always drops, but in rare cases (e.g., multiple contraction benefits a dividend-heavy strategy), it could rise. More critically, **fragility score = drop / base IRR** fails when base IRR is low or negative.  
Issue: Division by small or zero base IRR causes infinite or undefined fragility score. Also, using absolute drop over base IRR is not standard — typically, fragility is measured in **bps drop or MOIC resilience**.  
Fix: Use **bps drop** as primary metric, and only compute fragility score if base IRR > 10%:  
```python
if base_irr and base_irr > 0.10:
    fragility_score = combined_drop / base_irr
else:
    fragility_score = float('inf') if combined_drop > 0 else 0.0
```

---

FINDING [10]:  
File: reality_check.py  
Line(s): 554–555  
Code:  
```python
combined_drop_val = abs(_delta_irr(c_irr) or 0.0)
dominant_share = dominant_drop / combined_drop_val if combined_drop_val > 0 else 0.0
```  
Issue: The **dominant shock share** is computed as isolated shock drop divided by combined drop. But due to **nonlinear interactions**, the sum of individual drops exceeds the combined drop (diversification of shocks). Therefore, `dominant_drop / combined_drop_val` can be **greater than 100%**, which is illogical.  
Example: Growth drop = 500 bps, Margin = 400, Multiple = 300, Combined = 900 → Growth share = 500/900 ≈ 56%, but if Combined = 800, share = 62.5%. But if shocks interact negatively, Combined could be 1100 → 500/1100 ≈ 45%.  
Issue: The metric assumes additivity, which doesn't hold.  
Fix: Clarify in narrative that this is an approximation, or use **Shapley value** or **attribution via sequential shock application** for accuracy.

---

FINDING [11]:  
File: reality_check.py  
Line(s): 189  
Code: `if distributions and any(d > 0 for d in distributions):`  
Issue: The logic checks for interim distributions (dividend recap), but the **leverage check** in line 194 uses `debt_schedule.leverage_ratio_by_year[t_idx]`, which may reflect **pre-distribution debt**. In a dividend recap, the distribution is funded by **new debt**, so leverage **spikes after** the distribution. The model must ensure that the leverage ratio used is **post-recap**, not pre-recap.  
Issue: If `leverage_ratio_by_year` is computed before the distribution, it understates the true leverage impact.  
Fix: Ensure debt schedule includes the recapitalization event and that leverage ratios reflect post-distribution balances.

---

FINDING [12]:  
File: reality_check.py  
Line(s): 210  
Code: `verdict = "conservative" if exit_multiple < entry_multiple else "realistic"`  
Issue: The verdict logic is simplistic. A deal can be **aggressive** even if exit multiple < entry multiple — e.g., if EBITDA growth is unrealistic, leverage is excessive, or margins expand unsustainably. Conversely, a multiple contraction doesn't automatically make a deal conservative if entry was at a bubble multiple.  
Issue: Over-reliance on multiple delta ignores other risks.  
Fix: Incorporate leverage, growth, and margin changes into verdict logic. Example:  
```python
if critical_count > 0:
    verdict = "aggressive"
elif exit_multiple < entry_multiple and exit_leverage <= entry_leverage and exit_margin <= entry_margin + 0.01:
    verdict = "conservative"
else:
    verdict = "realistic"
```

---

### SUMMARY: Critical Issues Ranked

1. **[FINDING 4]** – **Entry equity miscomputed in Rule 6** due to double-counting financing fees. This invalidates the IRR sensitivity and could mislead on entry valuation risk. **Critical**.
2. **[FINDING 5]** – **Arbitrary 30% debt paydown assumption** in buyer IRR calculation. This distorts implied returns and undermines credit analysis. **Critical**.
3. **[FINDING 2]** – **Inconsistent scenario in Rule 2**: high multiple with low leverage. Must revert both to entry levels for valid sensitivity. **High**.
4. **[FINDING 1]** – **Exit fee applied to hypothetical EV**, understating fee drag. Biases IRR impact. **High**.
5. **[FINDING 8]** – **Refinancing risk uses peak EBITDA**, not conservative/stressed. Overstates refinancing capacity. **High**.
6. **[FINDING 9]** – **Fragility score divides by base IRR**, unstable for low-IRR deals. **Medium**.
7. **[FINDING 10]** – **Dominant shock share can exceed 100%** due to non-additivity. Misleading attribution. **Medium**.
8. **[FINDING 6]** – **Senior leverage = total leverage**, misrepresents credit structure. **Medium**.
9. **[FINDING 11]** – **Leverage may not reflect post-recap levels**, understating risk. **Medium**.
10. **[FINDING 12]** – **Verdict logic too simplistic**, ignores margin, growth, leverage. **Low**.
11. **[FINDING 3]** – **Linear EV discount approximation** for buyer IRR. Heuristic, not rigorous. **Low**.
12. **[FINDING 7]** – **Misleading variable name `equity_check`**. Risk of confusion. **Low**.

**Recommendation**: Fix all **Critical** and **High** issues before relying on this module for investment decisions.

---

## returns.py

FINDING [1]:  
File: returns.py  
Line(s): 150–158  
Code:  
```python
entry_fee = state.fees.entry_fee_pct * state.entry.enterprise_value
financing_fees = state.fees.financing_fee_pct * state.entry.total_debt_raised
entry_equity = (
    state.entry.enterprise_value
    + entry_fee
    + state.fees.transaction_costs
    + financing_fees
    - state.entry.total_debt_raised
)
```  
Issue: **Incorrect treatment of financing fees in equity contribution.**  
From a financial modeling and private equity accounting perspective, **financing fees are typically paid upfront and funded from equity**, so including them in the equity check is correct. However, the **entry fee (advisory fee)** is often **a cost borne by the target company**, not the sponsor, and thus should **not be funded from equity** unless explicitly modeled as such. More critically, **enterprise value already includes the target’s debt and equity** — adding fees and costs to EV and then subtracting debt **double-counts** the capital structure.

The correct logic is:  
> **Entry Equity = (Equity Purchase Price) + (Transaction & Financing Fees Funded by Equity)**

But **enterprise value (EV)** = Equity Purchase Price + Net Debt.  
So:  
> **Equity Purchase Price = EV – Entry Net Debt**

Then:  
> **Entry Equity = (EV – Entry Net Debt) + Fees Funded by Equity**

However, in this code:
- `state.entry.enterprise_value` is used directly as if it were the equity price.
- Then **all fees are added on top**, and **total debt raised is subtracted**.

This implies that **the entire EV is being funded by debt and equity**, which is **only correct if the acquisition is of the entire EV (i.e., a whole-company buyout)** — which it is — but the **fees should not be added to EV**.

**Correct treatment**:  
Fees (transaction, financing, entry advisory) are **add-ons to the funding requirement**, but **not part of EV**. So:

> **Entry Equity = (EV – Debt Raised) + (All Fees Funded by Equity)**

✅ That part is *almost* correct — **but only if** the `enterprise_value` does **not** already include the target’s debt.

However, the **critical flaw** is that **financing fees are often deducted from the debt proceeds**, not added to equity funding. If the sponsor raises £100m in debt and pays 2% financing fee, they receive only £98m. So the **equity must cover the shortfall**.

But in this model:
- `state.entry.total_debt_raised` is assumed to be **gross proceeds**.
- `financing_fees = 0.02 * total_debt_raised` → £2m
- Then equity = EV + fees – total_debt_raised → implies equity covers the £2m fee.

This is **correct only if** the debt proceeds are **gross**, and the fee is **paid by sponsor equity**.

However, **standard LBO modeling practice** is:
- Debt raised = **net proceeds to company**
- Financing fees are **upfront cash outflows from equity**
- So: **Equity = (EV – Debt Proceeds) + All Fees**

So if the code treats `total_debt_raised` as **gross debt**, then the **net debt available to pay down target debt or fund operations is reduced by fees** — but that’s not modeled.

**Better approach**:  
Either:
1. Model `total_debt_raised` as **net proceeds**, and fees are **already deducted** → then do **not** add financing fees to equity.
2. Or, model `total_debt_raised` as **gross**, and **financing fees are a separate equity-funded cost** → then adding them to equity is correct.

But the **code does not clarify** which convention is used.

**Risk**: If `total_debt_raised` is **net**, then adding `financing_fees` **overstates equity contribution**.

**Fix**:  
Clarify and document the convention. Assuming `total_debt_raised` is **gross**, then the current logic is acceptable **only if** the debt schedule uses **net proceeds**. But since the debt schedule is external, this creates a **hidden circular dependency**.

Better fix:  
```python
# Assume total_debt_raised is gross; net proceeds = gross - financing fees
financing_fees = state.fees.financing_fee_pct * state.entry.total_debt_raised
net_debt_proceeds = state.entry.total_debt_raised - financing_fees

entry_equity = (
    state.entry.enterprise_value
    - net_debt_proceeds
    + state.fees.entry_fee_pct * state.entry.enterprise_value
    + state.fees.transaction_costs
)
```

This makes it explicit that **financing fees reduce usable debt**, increasing equity need.

Alternatively, if `total_debt_raised` is **net**, then **remove financing fees from equity add-ons**.

**Bottom line**: The current code **assumes all fees are equity-funded**, which may be correct, but **lacks transparency** and risks **double-counting or misalignment with debt schedule**.

---

FINDING [2]:  
File: returns.py  
Line(s): 178–180  
Code:  
```python
exit_equity_pre_mip = exit_ev - exit_net_debt - exit_fee
gross_moic = exit_equity_pre_mip / entry_equity if entry_equity > 0 else 0.0
```  
Issue: **Incorrect MOIC numerator — includes exit fee in equity value reduction before MOIC.**  
`gross_moic` is defined as **MOIC before MIP but after exit fee** — which is correct per comment. However, **MOIC (Multiple on Invested Capital)** is typically defined as:

> **Gross MOIC = (Total Distributions + Exit Equity Value) / Entry Equity**

Where:
- **Exit Equity Value** = Exit Enterprise Value – Exit Net Debt

But **exit fee** is a **cost to the sponsor**, not a claim on the company. So:
- **Gross MOIC** should **exclude all sponsor-level fees and carry**.
- **Exit fee** (e.g., advisory fee on exit) is a **sponsor cost**, so it should **not reduce the gross equity proceeds**.

Yet here:
```python
exit_equity_pre_mip = exit_ev - exit_net_debt - exit_fee
```
→ **exit_fee is subtracted before gross MOIC**, which **understates gross MOIC**.

**Correct logic**:
- **Gross MOIC**: after operating performance, before **any** sponsor fees (entry, exit, MIP, carry).
- So:  
  `exit_equity_gross = exit_ev - exit_net_debt`  
  `gross_moic = (exit_equity_gross + total_distributions) / entry_equity`

But in the code:
- `gross_moic` is computed **before MIP but after exit fee** → this is **not standard**.

**Fix**:  
Rename `gross_moic` to `moic_after_exit_fee` or similar, or **redefine gross MOIC** to exclude **all fees**.

Better:  
```python
# True gross equity value
exit_equity_gross = exit_ev - exit_net_debt
gross_moic = (exit_equity_gross + total_distributions) / entry_equity if entry_equity > 0 else 0.0
```

And move exit fee into **net MOIC** calculation.

---

FINDING [3]:  
File: returns.py  
Line(s): 214  
Code:  
```python
est_debt = debt_schedule.total_debt_by_year[yr_idx] if yr_idx < len(debt_schedule.total_debt_by_year) else 0.0
```  
Issue: **Incorrect use of total_debt_by_year for RVPI estimation.**  
`total_debt_by_year` likely includes **all debt tranches**, but **net debt** for equity valuation should be **total debt minus cash**.

The code uses `total_debt_by_year`, but **does not subtract cash** to get **net debt**.

In LBO models, **exit equity value = EV – Net Debt**, where **Net Debt = Total Debt – Cash**.

But here, **cash balance is ignored**, so **RVPI is overstated** if the company has cash.

**Fix**:  
```python
est_cash = projections.years[yr_idx].cash_balance if yr_idx < len(projections.years) else 0.0
est_net_debt = est_debt - est_cash
est_equity = max(0.0, est_ev - est_net_debt)
```

Or ensure `debt_schedule.total_debt_by_year` is actually **net debt**, but that’s unlikely.

---

FINDING [4]:  
File: returns.py  
Line(s): 221–227  
Code:  
```python
equity_cfs: list[float] = [-entry_equity]
for yr_idx in range(hp):
    dist = distributions[yr_idx]
    if yr_idx == hp - 1:
        equity_cfs.append(exit_equity + dist)
    else:
        equity_cfs.append(dist)
```  
Issue: **Incorrect timing of distributions — double-counts final year distribution.**  
The `distributions` list is for **interim distributions**, i.e., **non-exit dividends** (e.g., dividend recap).

But in the loop:
- For `yr_idx == hp - 1` (final year), it adds `exit_equity + dist`
- But `dist` is already the **interim distribution in the exit year**

This is **correct only if** the interim distribution is **separate from exit proceeds**.

However, **in practice**, a dividend recap in the exit year is **possible**, so adding both is fine.

But **bigger issue**: the **cash flows are annual**, but the **timing vector** may be mid-year.

Yet the **exit proceeds** are at `t = hp` (end of final year), while **interim distributions** are at **end of each year**.

But in **mid-year convention**, **operating cash flows** are at **mid-year**, but **exit** is still at **end of year**.

The `_build_time_vector` function returns:
- Standard: `[0, 1, 2, ..., hp]`
- Mid-year: `[0, 0.5, 1.5, ..., hp-0.5]`

But **exit is at t = hp**, not `hp - 0.5`.

So the **time vector is wrong for mid-year convention**.

**Issue**: Line 126:  
```python
return [0.0] + [t + 0.5 for t in range(hp)]
```  
This gives: `[0.0, 0.5, 1.5, ..., hp-0.5]` — length `hp + 1`, but **last cash flow at `hp - 0.5`**, not `hp`.

But **exit happens at end of year `hp`**, so **should be at `t = hp`**.

**Correct mid-year vector**:  
- Entry: t = 0  
- Operating CFs: t = 0.5, 1.5, ..., (hp-1)+0.5 = hp - 0.5  
- Exit: t = hp

So vector should be: `[0.0] + [t + 0.5 for t in range(hp)]` → but that’s what it is.

Wait — `range(hp)` gives `0` to `hp-1`, so `t + 0.5` → `0.5` to `hp - 0.5` — **missing t = hp**.

But the **equity cash flows** are:
- t=0: -entry
- t=1: dist[0]
- ...
- t=hp: exit + dist[hp-1]

So **time indices should be 0, 1, 2, ..., hp**

But mid-year convention **only applies to operating cash flows**, not exit.

So the **time vector should be**:
- t=0: entry
- t=0.5, 1.5, ..., (hp-1)+0.5: interim distributions (if they occur mid-year)
- t=hp: exit

But the code assumes **all interim distributions occur at same time as operating CFs**, and **exit at end**.

But the `times` vector is applied to **all cash flows**, including exit.

So if `times = [0, 0.5, 1.5, ..., hp-0.5]`, then **exit CF is at `hp - 0.5`**, not `hp`.

**This is wrong.**

**Fix**:  
The time vector should be:
```python
if mid_year:
    return [0.0] + [t + 0.5 for t in range(hp)]  # [0, 0.5, 1.5, ..., hp-0.5]
else:
    return [float(t) for t in range(hp + 1)]  # [0, 1, 2, ..., hp]
```
But this assigns:
- CF[0] → t=0
- CF[1] → t=0.5
- ...
- CF[hp] → t=hp-0.5

But **exit is CF[hp]**, so it’s at `hp - 0.5`, not `hp`.

**Correct fix**:  
The **exit should be at `t = hp`**, so the time vector must be:
```python
if mid_year:
    # Interim CFs at mid-year, exit at end
    return [0.0] + [t + 0.5 for t in range(hp)]  # interim at 0.5, 1.5, ..., hp-0.5
    # But exit is at hp, so caller must handle separately?
```
But the `_solve_irr_timed` expects one vector.

**Better**: The **mid-year convention should only apply to operating cash flows**, not exit. So the **time vector should be**:
```python
if mid_year:
    times = [0.0]  # entry
    times += [t + 0.5 for t in range(hp - 1)]  # interim dist (if any)
    times.append(float(hp))  # exit at end
else:
    times = [float(t) for t in range(hp + 1)]
```
But the code doesn’t know which CF is exit.

**Conclusion**: The current `_build_time_vector` is **incorrect for mid-year convention** when exit is at end of final year.

**Fix**:  
```python
def _build_time_vector(hp: int, mid_year: bool) -> list[float]:
    if mid_year:
        # Entry at t=0, interim CFs at mid-year (0.5, 1.5, ..., hp-1.5), exit at t=hp
        times = [0.0]
        times += [t + 0.5 for t in range(hp - 1)]  # hp-1 interim periods
        times.append(float(hp))
        return times
    return [float(t) for t in range(hp + 1)]
```

And adjust `distributions` to have `hp - 1` values, not `hp`.

But the current code assumes `hp` distributions.

This is a **deep structural issue**.

---

FINDING [5]:  
File: returns.py  
Line(s): 257–262  
Code:  
```python
unlev_cfs: list[float] = [-entry_cost_unlev]
for yr in projections.years[:-1]:
    unlev_cfs.append(yr.fcf_pre_debt)
if projections.years:
    last_yr = projections.years[-1]
    unlev_cfs.append(last_yr.fcf_pre_debt + exit_ev - exit_fee)
```  
Issue: **Incorrect unlevered cash flow timing and composition.**  
- `fcf_pre_debt` is likely **free cash flow to firm (FCFF)**, which is correct for unlevered IRR.
- But the **exit proceeds** are `exit_ev - exit_fee`, which is **not unlevered** — it deducts **exit fee**, a **sponsor cost**.

**Unlevered IRR** should reflect **enterprise-level performance**, **before any sponsor fees or capital structure**.

So:
- Entry: `enterprise_value + transaction_costs` (correct)
- Annual CFs: FCFF (correct)
- Exit: `exit_ev` (not minus exit fee)

**Exit fee should not be deducted** in unlevered case.

**Fix**:  
```python
unlev_cfs.append(last_yr.fcf_pre_debt + exit_ev)
```

Also, **transaction costs** are included in entry, which is correct — they are part of acquisition cost.

---

FINDING [6]:  
File: returns.py  
Line(s): 325–326  
Code:  
```python
hypo_ev_rev_growth = exit_revenue * entry_margin * entry_multiple
delta_rev = hypo_ev_rev_growth - entry_ev
```  
Issue: **Incorrect base for revenue growth contribution.**  
The value driver bridge assumes:
1. Start from entry EV
2. Grow revenue to exit level, keep margin and multiple constant → new EV
3. Then expand margin, then multiple

But `entry_margin` is the **base EBITDA margin**, and `entry_ev = entry_ebitda / entry_multiple`, where `entry_ebitda = entry_revenue * entry_margin`.

But the code uses `exit_revenue * entry_margin * entry_multiple` → this is **correct** for holding margin and multiple constant.

But **only if** `entry_ev = entry_revenue * entry_margin * entry_multiple`.

This assumes **no other adjustments** (e.g., LTM vs FY1, add-backs).

But the bigger issue: **what is entry_revenue?** Not defined.

The bridge is **incomplete** without defining the **entry revenue**.

**Fix**:  
Add:
```python
entry_yr = projections.years[0] if projections.years else None
entry_revenue = entry_yr.revenue if entry_yr else 0.0
```
Then:
```python
hypo_ev_rev_growth = exit_revenue * entry_margin * entry_multiple
# But only if entry_margin is applied to entry_revenue to get entry_ebitda
# So entry_ev should equal entry_revenue * entry_margin * entry_multiple
```

If not, the bridge **won’t reconcile**.

---

FINDING [7]:  
File: returns.py  
Line(s): 349  
Code:  
```python
computed_gain = delta_rev + delta_margin + delta_multiple + delta_debt - fees_drag + returns.total_distributions
```  
Issue: **Double-counting of distributions.**  
`total_gain = exit_equity + total_distributions - entry_equity`

But in the bridge:
- `delta_rev`, `delta_margin`, etc., are **enterprise value changes**
- `delta_debt` is **debt paydown**, which increases equity
- But `total_distributions` are **already included in exit_equity or as interim cash flows**

Wait: `exit_equity` is **final equity value**, and `total_distributions` are **interim**.

So `total_gain` is **correct**.

But in the bridge:
- The `delta_*` terms represent **value creation at enterprise level**, then **debt paydown** increases equity.
- But **interim distributions** are **not part of value creation** — they are **returns of capital**.

Yet they are **added back** in `computed_gain`.

But `total_gain` includes them.

So it’s **not double-counting** — it’s **correct**.

But **fees_drag** includes `returns.total_distributions`? No.

`fees_drag` includes entry/exit fees, financing fees, MIP.

`total_distributions` is **separate**.

So the formula is:
> computed_gain = (EV change) + (debt paydown) - (fees) + (distributions)

But **distributions are not value creation** — they are **funded by FCF**.

The **value creation** is in `delta_rev`, etc.

The **equity gain** is:
- Value creation → higher EV
- Less exit debt
- Less fees
- Plus interim distributions

But **interim distributions** come from **operating cash flow**, which is already reflected in **debt paydown or retained earnings**.

In an LBO, **distributions** reduce **cash**, which reduces **net debt**, so **equity stays the same**.

So **distributions do not increase equity value** — they are **return of capital**.

But in `total_gain = exit_equity + total_distributions - entry_equity`, this is **correct** — it’s the **total cash returned**.

But in the **bridge**, adding `total_distributions` to `computed_gain` is **correct only if** the `delta_*` terms do **not** include the cash used for distributions.

But they do — because FCF is used to pay debt or distribute.

So if FCF is distributed, it doesn’t pay down debt, so `delta_debt` is smaller.

So the bridge **should not add distributions separately**.

**Correct reconciliation**:  
The `delta_rev`, `delta_margin`, etc., explain the **change in enterprise value**.

Then:
- Equity gain = (ΔEV) + (ΔNet Debt) - (Fees) 
- But ΔNet Debt = entry_net_debt - exit_net_debt = delta_debt
- Fees = fees_drag
- And distributions are **part of how FCF is used**, already reflected in debt and cash.

So `computed_gain = delta_rev + delta_margin + delta_multiple + delta_debt - fees_drag`

Then `total_gain = exit_equity + total_distributions - entry_equity`

But `exit_equity = exit_ev - exit_net_debt - all_fees`

So the bridge should **not include `total_distributions` in `computed_gain`**.

**Fix**: Remove `+ returns.total_distributions` from line 349.

---

### SUMMARY of Critical Issues:

1. **[FINDING 7]**: **Severe** — Double-counting of distributions in value bridge reconciliation → will cause **persistent reconciliation gaps**.
2. **[FINDING 4]**: **Critical** — Mid-year time vector places exit at `hp - 0.5` instead of `hp` → **biases IRR upward**.
3. **[FINDING 5]**: **High** — Exit fee incorrectly deducted in unlevered IRR → understates unlevered returns.
4. **[FINDING 3]**: **High** — RVPI ignores cash balance → overstates residual equity value.
5. **[FINDING 2]**: **Medium** — Gross MOIC incorrectly reduced by exit fee → misrepresents pre-fee returns.
6. **[FINDING 1]**: **Medium** — Ambiguous treatment of financing fees; risk of double-counting depending on debt schedule convention.
7. **[FINDING 6]**: **Low** — Missing entry revenue definition; bridge may not reconcile if margins are not applied consistently.

**Recommendation**: Fix FINDINGS 7, 4, and 5 immediately — they materially distort returns and value attribution.

---

## scenarios.py

ERROR 429: {"message":"Tokens per minute limit exceeded - too many tokens processed.","type":"too_many_tokens_error","param":"quota","code":"token_quota_exceeded"}

---

## projections.py

ERROR 429: {"message":"Tokens per minute limit exceeded - too many tokens processed.","type":"too_many_tokens_error","param":"quota","code":"token_quota_exceeded"}

---

## debt_schedule.py

ERROR 429: {"message":"Tokens per minute limit exceeded - too many tokens processed.","type":"too_many_tokens_error","param":"quota","code":"token_quota_exceeded"}

---

