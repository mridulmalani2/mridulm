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

# D-Engine — Driver Decomposition + Fragility Engine (IC-Grade Build)
Generated: 2026-03-28

---

## 1. Objective

Build a **non-academic, decision-grade system** that answers:

1. What actually drives IRR?
2. How fragile is the deal?

This must be:
- Fully tied to model outputs
- Deterministic (not AI guesswork)
- IC-discussion ready

---

## 2. DRIVER DECOMPOSITION ENGINE

### 2.1 Core Principle

Decompose total value creation into **5 components**:

1. Revenue Growth
2. Margin Expansion
3. Multiple Expansion
4. Deleveraging (Debt Paydown)
5. Fees / Leakage

---

### 2.2 Method (NON-NEGOTIABLE)

Use **bridge-based attribution**, not heuristics.

#### Step 1 — Base Case
Compute:
- Entry EV
- Exit EV
- Entry Equity
- Exit Equity

---

#### Step 2 — Sequential Attribution

Recompute exit equity while changing ONE driver at a time:

1. Revenue Only (growth applied, margins/multiple fixed)
2. Margin Only (on top of revenue)
3. Multiple Only
4. Debt Paydown Only
5. Fees impact

---

### 2.3 Output Format

Example:

- Revenue Growth: +43%
- Margin Expansion: +27%
- Multiple Expansion: +28%
- Deleveraging: +31%
- Fees: -27%

---

### 2.4 Required Additions

Add new computed outputs:

- IRR contribution per driver
- % of total value creation
- Ranking (descending impact)

---

### 2.5 IC-Level Insight Layer

Generate:

- Primary driver:
  "Returns are primarily driven by X"

- Weak thesis flag:
  "Less than 20% of value from operations → financial engineering heavy"

- Over-reliance flag:
  "More than 40% from multiple expansion → exit risk elevated"

---

## 3. FRAGILITY ENGINE

### 3.1 Core Principle

Measure **how easily the deal breaks under realistic stress**.

---

### 3.2 Stress Framework (MANDATORY)

Apply 3 independent shocks:

1. Growth Shock:
   - Reduce all growth rates by 2%

2. Margin Shock:
   - Reduce EBITDA margin by 100bps

3. Multiple Shock:
   - Reduce exit multiple by 1.0x

---

### 3.3 Combined Stress

Run:
- Each shock individually
- All shocks combined

---

### 3.4 Output Metrics

For each scenario:

- IRR
- MOIC
- ΔIRR (vs base)
- ΔMOIC

---

### 3.5 Fragility Score (Required)

Define:

Fragility Score = IRR_drop_combined / Base_IRR

---

### 3.6 Classification

- <20% drop → Robust
- 20–40% → Moderate Risk
- >40% → Fragile

---

### 3.7 IC Output Examples

- "IRR drops from 29% → 17% under mild stress"
- "60% of downside driven by exit multiple compression"
- "Deal is highly sensitive to valuation assumptions"

---

## 4. DATA STRUCTURE (IMPLEMENTATION)

Add to model state:

driver_breakdown: {
  revenue: float,
  margin: float,
  multiple: float,
  deleveraging: float,
  fees: float
}

fragility: {
  base_irr: float,
  stressed_irr: float,
  irr_drop: float,
  score: float,
  classification: string
}

---

## 5. UI OUTPUT (IMPORTANT)

Add two panels:

### Panel 1 — Value Creation Bridge
- Bar chart or table
- Ranked drivers

### Panel 2 — Fragility Dashboard
- Base vs stressed IRR
- Fragility score
- Key sensitivity callouts

---

## 6. WHAT THIS ENABLES

After implementation, user can answer:

- "Is this a real operational play or multiple arbitrage?"
- "How risky is this deal structurally?"
- "What assumption matters most?"

---

