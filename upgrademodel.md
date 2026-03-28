# D-Engine — IC Upgrade Execution Blueprint + Claude Prompt
Generated: 2026-03-28

---

## 1. Objective

Upgrade the D-Engine from a **functional LBO model** to an **IC-grade, audit-safe, decision system**.

---

## 2. Priority Fix Stack (Execution Order)

### Step 1 — Accounting Integrity (NON-NEGOTIABLE)
- Add transaction fees (% EV)
- Add financing fees (% Debt)
- Ensure:
  Sources = Uses (hard check)

---

### Step 2 — Cash Flow Engine Correction
Rebuild FCF:

EBITDA  
– Cash Taxes  
– Capex  
– ΔNWC (must be based on ΔRevenue)  
= Pre-debt FCF  

– Interest  
= Post-interest FCF  

→ Apply configurable cash sweep

---

### Step 3 — Debt Engine Controls
Add inputs:
- Cash Sweep % (default 60%)
- Minimum Cash Balance
- Optional: Reinvestment % (growth vs deleveraging)

Ensure:
- TLA amortization linked to schedule
- TLB only repaid at exit unless sweep applied

---

### Step 4 — Credit Model Fix
Correct DSCR:

DSCR = (EBITDA – Capex – ΔNWC – Taxes) / Interest

Add:
- Stress EBITDA (-20% / -30%)
- Stress exit multiple (e.g. 6x)
- Recovery waterfall:
  Senior A → Senior B → Equity

---

### Step 5 — AI Layer Redesign
Replace:
❌ Absolute statements

With:
✔ Conditional, quantified insights

AI must output:
- IRR drivers (ranked)
- Key sensitivities
- Structural risks

---

### Step 6 — Excel Upgrade
Ensure:
- No hardcoded outputs
- All sheets linked
- Add audit checks:
  - Sources = Uses
  - Cash flow reconciliation
  - IRR cross-check

Formatting:
- Inputs = Blue
- Formulas = Black

---

## 3. Enhancements (Differentiation Layer)

Add:
- Revenue drivers (price × volume)
- Margin decomposition
- Exit scenarios (compression / expansion)
- IRR driver decomposition module

---

## 4. Definition of Done (IC-Ready)

Model is IC-ready if:
- All outputs trace to inputs via formulas
- Credit metrics internally consistent
- No hidden assumptions
- AI outputs are defensible in IC discussion

---
