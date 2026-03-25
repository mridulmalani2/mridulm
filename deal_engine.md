# Deal Intelligence Engine — System Specification v2.0

> **Internal build reference. This document governs all implementation decisions.**
> Single-company investment intelligence system. LBO-grade model. AI-augmented decision layer.

---

## 0. PHILOSOPHY

This is not a calculator. It is not a teaching tool. It is not a template.

It is a professional investment decision environment used by people who already know what IRR means, who already have a CIM in front of them, and who need a fast, opinionated, structured way to stress-test a deal before walking into an IC meeting.

Every design decision — model logic, UI, AI behavior, output format — must serve that user.

If a feature would fit in a fintech consumer app, it does not belong here.

---

## 1. SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + TypeScript)             │
│                                                                   │
│   ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│   │  Input Panel    │  │  Model Dashboard  │  │  Chatboard    │  │
│   │  (left column)  │  │  (center/main)    │  │  (right/below)│  │
│   └────────┬────────┘  └────────┬─────────┘  └──────┬────────┘  │
│            │                    │                    │            │
└────────────┼────────────────────┼────────────────────┼───────────┘
             │                    │                    │
             ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (FastAPI / Python)                  │
│                                                                   │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│   │ Model Engine │  │  AI Gateway  │  │  Excel Export Engine  │  │
│   │  (core calc) │  │  (Anthropic) │  │  (openpyxl)           │  │
│   └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                   │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │                     State Manager                         │   │
│   │              (single ModelState object)                   │   │
│   └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.1 Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 18 + TypeScript | Strict mode |
| Styling | Tailwind CSS + custom CSS variables | No component libraries |
| Charts | Recharts | Waterfall, sensitivity heatmaps |
| Backend | FastAPI (Python 3.11+) | Async endpoints |
| Financial math | numpy-financial, scipy | IRR via newton/secant method |
| AI | Anthropic Claude API (user-supplied key) | Tool use / function calling enforced |
| Excel export | openpyxl | Three-sheet auditable workbook |
| State | Pydantic models (backend) + Zustand (frontend) | Single source of truth on backend |
| Deployment | Single repo, docker-compose | Frontend on :3000, backend on :8000 |

---

## 2. DATA MODEL

### 2.1 Full ModelState Schema

```python
class DebtTranche(BaseModel):
    name: str                          # "Senior Term Loan A", "Senior Term Loan B", "Mezzanine", "PIK"
    principal: float                   # £/€/$ million at entry
    interest_rate: float               # annual, e.g. 0.07
    rate_type: Literal["fixed", "floating"]  # floating = SOFR/EURIBOR + spread
    base_rate: float                   # e.g. 0.045 (SOFR) if floating; 0 if fixed
    spread: float                      # e.g. 0.025 if floating; full rate if fixed
    amortization_type: Literal["bullet", "straight_line", "cash_sweep", "PIK"]
    amortization_schedule: list[float] # principal repayment per year (len = holding_period)
    pik_rate: float                    # 0 unless PIK; accrues to principal
    cash_interest: bool                # False for PIK
    commitment_fee: float              # % of undrawn (0 for term loans)
    floor: float                       # rate floor if floating (e.g. 0.0)

class FeeStructure(BaseModel):
    entry_fee_pct: float               # % of EV (typically 0.015–0.025)
    exit_fee_pct: float                # % of exit EV (typically 0.01–0.02)
    monitoring_fee_annual: float       # £m per year (charged to EBITDA)
    financing_fee_pct: float           # % of total debt (OID + arrangement)
    transaction_costs: float           # absolute £m (legal, DD, other)

class ManagementIncentive(BaseModel):
    mip_pool_pct: float                # % of exit equity (typically 0.10–0.20)
    hurdle_moic: float                 # MOIC threshold before MIP kicks in (e.g. 2.0x)
    vesting_years: int                 # straight-line vesting
    sweet_equity_pct: float            # % of equity management co-invests

class RevenueAssumptions(BaseModel):
    base_revenue: float                # LTM revenue £m
    growth_rates: list[float]          # per-year growth rates (len = holding_period)
    organic_growth: list[float]        # subset — organic only
    acquisition_revenue: list[float]   # bolt-on revenue added per year
    churn_rate: float                  # for SaaS/subscription; 0 for industrial

class MarginAssumptions(BaseModel):
    base_ebitda_margin: float          # LTM EBITDA margin
    target_ebitda_margin: float        # exit year margin
    margin_trajectory: Literal["linear", "front_loaded", "back_loaded", "step"]
    margin_by_year: list[float]        # explicit per-year (overrides trajectory if set)
    da_pct_revenue: float              # D&A as % of revenue (for EBIT)
    capex_pct_revenue: float           # maintenance capex % revenue
    growth_capex: list[float]          # incremental capex by year £m
    nwc_pct_revenue: float             # net working capital % revenue
    nwc_movement_method: Literal["pct_change", "explicit"]

class TaxAssumptions(BaseModel):
    tax_rate: float                    # effective rate e.g. 0.25
    tax_shield_on_interest: bool       # True (standard)
    dtl_unwind_years: int              # deferred tax liability unwind period
    nol_carryforward: float            # existing NOLs £m
    minimum_tax_rate: float            # effective floor post-shields

class EntryAssumptions(BaseModel):
    enterprise_value: float            # entry EV £m (or derived from multiple)
    entry_ebitda_multiple: float       # EV / LTM EBITDA
    entry_revenue_multiple: float      # derived: EV / LTM revenue
    net_debt_at_entry: float           # existing net debt being acquired
    equity_check: float                # derived: EV - total_debt_raised + fees
    total_debt_raised: float           # sum of all tranche principals
    leverage_ratio: float              # total debt / entry EBITDA
    currency: Literal["GBP", "EUR", "USD", "CHF"]

class ExitAssumptions(BaseModel):
    holding_period: int                # years (1–10)
    exit_ebitda_multiple: float        # exit EV / exit EBITDA
    exit_revenue_multiple: float       # cross-check
    exit_method: Literal["strategic", "secondary_buyout", "ipo", "recapitalization"]
    exit_ebitda: float                 # derived from projection
    exit_ev: float                     # exit_ebitda × exit_multiple
    exit_net_debt: float               # derived from debt schedule
    exit_equity: float                 # exit_ev - exit_net_debt - mip_payout
    mip_payout: float                  # derived from MIP model

class Returns(BaseModel):
    irr: float                         # equity IRR (post-fees, post-tax, post-MIP)
    moic: float                        # equity MOIC
    dpi: float                         # distributions to paid-in
    rvpi: float                        # residual value to paid-in (0 at exit)
    cash_yield_avg: float              # average annual cash yield
    payback_years: float               # years to return invested capital
    irr_gross: float                   # before fees and carry
    irr_levered: float                 # with debt, before fees
    irr_unlevered: float               # unlevered (EBITDA-based)

class ValueDriverDecomposition(BaseModel):
    revenue_growth_contribution_pct: float     # % of total equity gain
    margin_expansion_contribution_pct: float
    multiple_expansion_contribution_pct: float
    debt_paydown_contribution_pct: float
    revenue_growth_contribution_abs: float     # £m equity gain
    margin_expansion_contribution_abs: float
    multiple_expansion_contribution_abs: float
    debt_paydown_contribution_abs: float
    entry_equity: float
    exit_equity: float
    total_equity_gain: float

class ScenarioSet(BaseModel):
    name: Literal["base", "bull", "bear", "stress"]
    growth_rates: list[float]
    margin_by_year: list[float]
    exit_multiple: float
    leverage_ratio: float
    irr: float
    moic: float
    description: str                   # AI-generated narrative

class SensitivityTable(BaseModel):
    row_variable: str                  # e.g. "revenue_growth"
    col_variable: str                  # e.g. "exit_multiple"
    row_values: list[float]
    col_values: list[float]
    irr_matrix: list[list[float]]      # [row][col]
    moic_matrix: list[list[float]]

class ExitRealityCheck(BaseModel):
    flags: list[ExitFlag]
    implied_buyer_irr: float           # what the next buyer would earn at exit price
    ev_revenue_at_exit: float
    ev_ebitda_at_exit: float
    public_comps_multiple_range: tuple[float, float]   # from AI context
    multiple_delta: float              # exit vs entry multiple
    verdict: Literal["aggressive", "realistic", "conservative"]
    narrative: str                     # AI-generated

class ExitFlag(BaseModel):
    flag_type: Literal["multiple_expansion_with_margin_expansion",
                        "multiple_expansion_with_leverage_increase",
                        "growth_deceleration_inconsistency",
                        "exit_premium_vs_entry",
                        "implied_buyer_return_too_low",
                        "leverage_at_exit_above_threshold",
                        "nwc_deterioration",
                        "capex_intensity_change"]
    severity: Literal["warning", "critical"]
    description: str
    quantified_impact: str             # e.g. "50bps IRR compression if multiple reverts to entry"

class ModelState(BaseModel):
    # Metadata
    deal_name: str
    company_description: str
    sector: str
    currency: Literal["GBP", "EUR", "USD", "CHF"]
    created_at: datetime
    last_modified: datetime
    version: int

    # Core components
    revenue: RevenueAssumptions
    margins: MarginAssumptions
    tax: TaxAssumptions
    entry: EntryAssumptions
    debt_tranches: list[DebtTranche]
    fees: FeeStructure
    mip: ManagementIncentive
    exit: ExitAssumptions

    # Computed outputs
    projections: AnnualProjection        # per-year P&L and cash flow
    debt_schedule: DebtSchedule          # per-year debt waterfall
    returns: Returns
    value_drivers: ValueDriverDecomposition
    scenarios: list[ScenarioSet]
    sensitivity_tables: list[SensitivityTable]
    exit_reality_check: ExitRealityCheck

    # AI state
    ai_overrides: dict[str, any]         # which fields AI has touched
    ai_toggle_fields: list[str]          # fields set to "Let AI decide"
    chat_history: list[ChatMessage]
```

---

## 3. FINANCIAL MODEL ENGINE

### 3.1 Annual Projection Engine

For each year `t` in `[1 ... holding_period]`:

```
Revenue[t]       = Revenue[t-1] × (1 + growth_rate[t]) + acquisition_revenue[t]
EBITDA[t]        = Revenue[t] × margin[t]
EBITDA_adj[t]    = EBITDA[t] − monitoring_fee_annual
D&A[t]           = Revenue[t] × da_pct_revenue
EBIT[t]          = EBITDA_adj[t] − D&A[t]
Interest[t]      = Σ(cash_interest on each tranche, using beginning-of-year balance)
EBT[t]           = EBIT[t] − Interest[t] − financing_fee_amortization[t]
Tax[t]           = max(EBT[t] × tax_rate − nol_usage[t], EBT[t] × minimum_tax_rate)
NOPAT[t]         = EBIT[t] × (1 − tax_rate)
Net Income[t]    = EBT[t] − Tax[t]

Maintenance Capex[t]  = Revenue[t] × capex_pct_revenue
Growth Capex[t]       = growth_capex[t]
Total Capex[t]        = Maintenance Capex[t] + Growth Capex[t]

ΔNWC[t]          = (Revenue[t] − Revenue[t-1]) × nwc_pct_revenue   [if pct_change method]

FCF_pre_debt[t]  = EBITDA_adj[t] − Tax[t] − Total Capex[t] − ΔNWC[t]
FCF_to_equity[t] = FCF_pre_debt[t] − Interest[t] − scheduled_amortization[t]
```

**PIK treatment:**
```
For PIK tranches:
  pik_accrual[t]        = beginning_balance[t] × pik_rate
  ending_balance[t]     = beginning_balance[t] + pik_accrual[t]
  cash_interest_paid[t] = 0
  interest_expense[t]   = pik_accrual[t]   [non-cash, reduces EBT]
```

**Cash sweep (if applicable):**
```
available_for_sweep[t]  = FCF_pre_debt[t] − mandatory_amortization[t] − cash_interest_paid[t]
sweep_payment[t]        = max(0, available_for_sweep[t] × sweep_pct)
actual_repayment[t]     = mandatory_amortization[t] + sweep_payment[t]
```

### 3.2 Debt Schedule (Full Waterfall)

Per tranche, per year:

```
beginning_balance[t]    = ending_balance[t-1]
cash_interest[t]        = beginning_balance[t] × effective_rate[t]  (0 for PIK)
pik_accrual[t]          = beginning_balance[t] × pik_rate           (0 for non-PIK)
scheduled_repayment[t]  = amortization_schedule[t]
sweep_repayment[t]      = computed per cash sweep logic above
total_repayment[t]      = scheduled_repayment[t] + sweep_repayment[t]
ending_balance[t]       = beginning_balance[t] + pik_accrual[t] − total_repayment[t]

interest_tax_shield[t]  = cash_interest[t] × tax_rate  (if tax_shield_on_interest)
```

Aggregate across tranches:
```
total_debt[t]           = Σ ending_balance[t] across all tranches
net_debt[t]             = total_debt[t] − cash_on_balance_sheet[t]
leverage_ratio[t]       = net_debt[t] / EBITDA_adj[t]
interest_coverage[t]    = EBITDA_adj[t] / total_cash_interest[t]
dscr[t]                 = FCF_pre_debt[t] / (total_cash_interest[t] + mandatory_amortization[t])
```

### 3.3 Floating Rate Handling

```
effective_rate[t]  = max(base_rate[t] + spread, floor)

base_rate[t] is user-inputtable per year (forward curve) OR flat assumption
Default: flat at entry base_rate
```

### 3.4 Returns Calculation

```
entry_equity_check = EV + transaction_costs + financing_fees − total_debt_raised

MIP_payout:
  if exit_moic_gross >= hurdle_moic:
    mip_equity = mip_pool_pct × exit_equity_pre_mip
  else:
    mip_equity = 0

exit_equity        = exit_ev − exit_net_debt − exit_fee − mip_payout

Cash flows to equity:
  CF[0]  = −entry_equity_check
  CF[t]  = dividend_recaps[t]  (0 if none)   [t = 1...(holding_period-1)]
  CF[HP] = exit_equity

IRR: solve for r in: Σ CF[t] / (1+r)^t = 0
     Method: scipy.optimize.newton on NPV function
     Fallback: scipy.optimize.brentq on [-0.999, 100.0]

MOIC = exit_equity / entry_equity_check

Unlevered IRR:
  CF[0]  = −EV − transaction_costs
  CF[t]  = FCF_pre_debt[t] − Tax_unlevered[t]
  CF[HP] = exit_ev − exit_fee
  (no debt in cash flows)

Levered pre-fee IRR:
  same as equity IRR but before entry/exit fees
```

### 3.5 Value Driver Decomposition (Bridge)

Isolates contribution of each value creation lever by holding other factors constant:

```
Step 1 — Revenue growth contribution:
  hypothetical_ev_rev_only = entry_ebitda × entry_multiple  [no growth, no margin, no multiple change]
  vs.
  hypothetical_ev_rev_growth = exit_revenue × entry_ebitda_margin × entry_multiple
  delta_rev = hypothetical_ev_rev_growth − entry_ev

Step 2 — Margin expansion contribution:
  hypothetical_ev_margin = exit_revenue × exit_ebitda_margin × entry_multiple
  delta_margin = hypothetical_ev_margin − hypothetical_ev_rev_growth

Step 3 — Multiple expansion contribution:
  hypothetical_ev_multiple = exit_revenue × exit_ebitda_margin × exit_multiple
  delta_multiple = exit_ev − hypothetical_ev_margin

Step 4 — Debt paydown contribution:
  delta_debt = (entry_net_debt − exit_net_debt)

Step 5 — Fees drag:
  fees_drag = entry_fee + exit_fee + monitoring_fees_pv + financing_fees

Total equity gain = delta_rev + delta_margin + delta_multiple + delta_debt − fees_drag
                  = exit_equity − entry_equity_check  [reconciliation check, must balance]

% contribution[i] = delta[i] / total_equity_gain × 100
```

### 3.6 Scenario Engine

Auto-generate three scenarios from base assumptions:

| Parameter | Bear | Base | Bull |
|-----------|------|------|------|
| Revenue growth | Base − 200bps per year | User/AI input | Base + 200bps per year |
| Exit multiple | Base − 1.5x | User/AI input | Base + 1.0x |
| Margin trajectory | 50% of base expansion | Base | Base × 1.3 |
| Leverage | Base − 0.5x | Base | Base |

Additionally: **Stress** scenario:
- Growth: 0% for years 1–2, then base × 0.5
- Exit multiple: entry multiple − 1.0x (multiple compression)
- Margin: no expansion (flat at entry)

Each scenario runs the full model (debt schedule, IRR, bridge) independently.

### 3.7 Sensitivity Tables

Generate the following 2D sensitivity matrices. Each cell = IRR at that parameter combination. Also generate MOIC equivalents.

**Table 1:** IRR vs. Revenue Growth (rows) × Exit Multiple (cols)
- Rows: base growth ± 400bps in 100bps steps (9 rows)
- Cols: base exit multiple ± 2.0x in 0.5x steps (9 cols)

**Table 2:** IRR vs. Revenue Growth (rows) × EBITDA Margin at Exit (cols)
- Rows: same as above
- Cols: base margin ± 600bps in 150bps steps

**Table 3:** IRR vs. Entry Multiple (rows) × Exit Multiple (cols)
- Rows: base entry multiple ± 2.0x in 0.5x steps
- Cols: same as Table 1

**Table 4:** IRR vs. Leverage (rows) × Exit Multiple (cols)
- Rows: 0x to 8x in 0.5x steps

Each sensitivity cell must run the full model including debt schedule recalculation where leverage changes.

### 3.8 Exit Reality Check — Codified Rules

Execute all rules. Return severity and quantified impact for each triggered flag.

```
RULE 1 — Multiple Expansion + Margin Expansion (simultaneous)
  Condition: exit_multiple > entry_multiple AND exit_margin > entry_margin + 0.03
  Severity: WARNING
  Logic: buyers typically pay less as margin improves (it's already priced in)
  Impact: compute IRR at exit_multiple = entry_multiple (no expansion case)

RULE 2 — Multiple Expansion + Leverage Increase
  Condition: exit_multiple > entry_multiple AND exit_leverage > entry_leverage
  Severity: CRITICAL
  Logic: exit leverage rarely exceeds entry in a benign scenario
  Impact: compute IRR at exit_leverage = entry_leverage

RULE 3 — Implied Buyer Return Too Low
  Condition: implied_buyer_irr < 0.15
  implied_buyer_irr: solve IRR for buyer paying exit_ev, same growth/margin for 5yr hold, exit at entry_multiple
  Severity: CRITICAL
  Logic: no rational financial buyer pays a price that implies <15% IRR

RULE 4 — Growth Deceleration Inconsistency
  Condition: exit_revenue_growth < 0.5 × entry_revenue_growth AND exit_multiple >= entry_multiple
  Severity: WARNING
  Logic: multiples compress with growth deceleration

RULE 5 — Exit Leverage Above Threshold
  Condition: exit_leverage > 4.0x (or 3.5x for cyclicals)
  Severity: WARNING
  Logic: highly levered exits reduce buyer universe

RULE 6 — Entry Premium vs. Comparable Deals
  Condition: entry_multiple > sector_median_multiple × 1.25  (AI provides sector median)
  Severity: WARNING
  Impact: compute IRR at sector_median entry multiple

RULE 7 — NWC Deterioration
  Condition: nwc_pct_revenue[exit_year] > nwc_pct_revenue[entry] × 1.2
  Severity: WARNING
  Logic: NWC build destroys cash, often overlooked in quick models

RULE 8 — D&A vs. Capex Divergence
  Condition: da_pct_revenue > capex_pct_revenue × 1.5  (for asset-heavy businesses)
  Severity: WARNING
  Logic: capex below D&A is unsustainable in asset-intensive sectors
```

---

## 4. AI LAYER

### 4.1 API Key Handling

- User must input key on first load (modal, not dismissable)
- Key stored in browser sessionStorage only (never sent to backend logs, never persisted)
- Passed as Authorization header on every AI request
- Backend proxies to Anthropic: never expose key in frontend network tab beyond the header
- If key is invalid: surface error immediately in chatboard, do not crash the model

### 4.2 AI JSON Contract (Strict — Function Calling)

Every AI call uses Anthropic tool use. The backend defines one tool:

```python
DEAL_ENGINE_TOOL = {
    "name": "update_deal_model",
    "description": "Update deal model assumptions and/or provide structured investment analysis. Always call this tool. Never respond with plain text only.",
    "input_schema": {
        "type": "object",
        "properties": {
            "assumption_updates": {
                "type": "object",
                "description": "Dictionary of model fields to update. Use dot notation for nested fields. Empty dict if no updates.",
                "additionalProperties": True
            },
            "trigger_recalculation": {
                "type": "boolean",
                "description": "Whether backend should rerun full model after applying updates"
            },
            "analysis": {
                "type": "object",
                "properties": {
                    "return_decomposition": {
                        "type": "string",
                        "description": "What is currently driving returns. Be specific. Reference numbers."
                    },
                    "primary_driver": {
                        "type": "string",
                        "description": "Single clearest driver of returns. One sentence."
                    },
                    "risk_concentration": {
                        "type": "string",
                        "description": "Where the model is most fragile. Name the variable and the threshold."
                    },
                    "fragility_test": {
                        "type": "string",
                        "description": "What specific change breaks the deal. Quantify the break point."
                    },
                    "improvement_levers": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Ranked list of levers to improve IRR. Actionable. Specific."
                    },
                    "assumption_rationale": {
                        "type": "string",
                        "description": "If assumptions were updated: explain why these values and not others. Reference sector context."
                    }
                },
                "required": ["return_decomposition", "primary_driver", "risk_concentration", "fragility_test", "improvement_levers"]
            },
            "scenario_request": {
                "type": "object",
                "nullable": True,
                "description": "If user requested a named scenario, specify it here",
                "properties": {
                    "scenario_name": {"type": "string"},
                    "overrides": {"type": "object"}
                }
            }
        },
        "required": ["assumption_updates", "trigger_recalculation", "analysis"]
    }
}
```

### 4.3 AI System Prompt

```
You are the analytical engine of a professional private equity deal intelligence system.

You are talking to investment professionals: analysts, associates, and VPs at PE funds and investment banks.

CONTEXT YOU RECEIVE:
- Full model state as JSON (all assumptions, all outputs, debt structure, returns)
- User message
- Chat history

YOUR ROLE:
1. Interpret model state — what the numbers mean, not how to calculate them
2. Modify assumptions when requested — provide specific values, not ranges unless explicitly asked
3. Generate sector-aware context when fields are AI-toggled
4. Identify fragility, concentration risk, and return attribution

RULES:
- You never perform calculations. The backend handles all math.
- You always call update_deal_model. You never respond with plain text only.
- You never ask clarifying questions. Infer reasonable intent and act.
- You never say "I cannot" or "I don't have enough information."
- You never use teaching language ("this means...", "in private equity...").
- You never hedge. You assert. You are decisive.
- When modifying assumptions: use the exact dot-notation path from ModelState.
- When generating AI assumptions (toggled fields): generate realistic values based on sector, size, and current model context. State why.
- Reference current IRR, MOIC, and key ratios in your analysis. Use the numbers.

OUTPUT TONE:
- Direct, critical, professional
- No preamble. No filler. No pleasantries.
- Every sentence must contain information.
- Write like a senior VP giving a 60-second verbal IC verdict.

EXAMPLE RESPONSE STYLE:
"Reducing margin expansion from 500bps to 200bps lowers IRR from 28% to 17%. Returns shift from margin-driven to multiple-driven, which increases fragility — exit multiple compression of 1x drops IRR below 12%. Primary lever to recover: introduce 1.0x additional leverage at entry (adds ~300bps IRR). Secondary: maintain at least 300bps margin expansion as a hard floor."
```

### 4.4 AI Toggle — "Let AI Decide" Fields

When a field is AI-toggled, the AI must:
1. Generate a **point estimate** (not a range) for the base case
2. Generate high/low for bull/bear scenarios
3. Provide a one-sentence sector rationale

Fields eligible for AI toggle:
- `revenue.growth_rates` (per year)
- `margins.target_ebitda_margin`
- `margins.margin_trajectory`
- `exit.exit_ebitda_multiple`
- `debt_tranches[*].interest_rate` (if floating, suggest spread)
- `entry.leverage_ratio`
- `exit.holding_period`
- `fees.monitoring_fee_annual`

### 4.5 Intent Classification

Before constructing the AI prompt, backend classifies user message into one of:

```python
class Intent(Enum):
    MODIFY_ASSUMPTION    = "modify_assumption"       # "reduce growth to 5%"
    RUN_SCENARIO         = "run_scenario"            # "show me a bear case"
    REQUEST_CRITIQUE     = "request_critique"        # "what are the risks here?"
    EXPLAIN_OUTPUT       = "explain_output"          # "why is IRR so sensitive to exit multiple?"
    STRESS_TEST          = "stress_test"             # "what breaks this deal?"
    GENERATE_ASSUMPTIONS = "generate_assumptions"    # "fill in what I'm missing"
    COMPARE_SCENARIOS    = "compare_scenarios"       # "base vs bear"
```

Intent is passed to the AI as context. It shapes how the AI weights its response (e.g. STRESS_TEST → prioritize fragility_test and fragility_test fields).

---

## 5. API ENDPOINTS

```
POST /api/model/initialize
  Body: { deal_name, revenue, ebitda_or_margin, entry_multiple, currency }
  Returns: full ModelState with defaults populated
  Notes: runs initial calculation pass; AI-toggled fields use sector defaults

POST /api/model/update
  Body: { field_path: string, value: any }
  Returns: full ModelState after recalculation
  Notes: single field update; triggers full recalc cascade

POST /api/model/recalculate
  Body: full ModelState
  Returns: full ModelState with all computed fields updated
  Notes: used after bulk updates

POST /api/ai/chat
  Headers: { X-Anthropic-Key: user_key }
  Body: { message: string, model_state: ModelState, chat_history: list[ChatMessage] }
  Returns: { updated_state: ModelState, ai_response: AIAnalysis, intent: Intent }
  Notes: applies assumption_updates, triggers recalculation, returns both

POST /api/ai/generate-assumptions
  Headers: { X-Anthropic-Key: user_key }
  Body: { toggled_fields: list[str], model_state: ModelState }
  Returns: { updated_state: ModelState, rationale: dict[str, str] }

GET /api/model/scenarios
  Returns: list[ScenarioSet] with full IRR/MOIC per scenario

GET /api/model/sensitivity/{table_id}
  Returns: SensitivityTable

POST /api/export/excel
  Body: full ModelState
  Returns: .xlsx file stream
  Notes: three-sheet workbook (Assumptions, Calculations, Outputs)

GET /api/model/export/json
  Returns: full ModelState as JSON (for save/load)

POST /api/model/import/json
  Body: ModelState JSON
  Returns: validated and recalculated ModelState
```

---

## 6. FRONTEND — PANEL LAYOUT

### 6.1 Layout Structure

```
┌────────────────────────────────────────────────────────────────────────┐
│  HEADER: Deal name | Currency | Last modified | Export ↓ | Save | Load │
├───────────────────┬────────────────────────────┬───────────────────────┤
│                   │                            │                       │
│  INPUT PANEL      │   MODEL DASHBOARD          │   CHATBOARD           │
│  (320px fixed)    │   (flex-grow)              │   (380px fixed)       │
│                   │                            │                       │
│  § Entry          │   § Returns Summary        │   [Chat history]      │
│  § Debt Structure │   § Value Bridge           │                       │
│  § Revenue        │   § Debt Schedule Table    │   [Input + Send]      │
│  § Margins        │   § Sensitivity Heatmaps   │                       │
│  § Costs & Fees   │   § Scenario Comparison    │                       │
│  § Exit           │   § Exit Reality Check     │                       │
│  § MIP            │                            │                       │
│                   │                            │                       │
└───────────────────┴────────────────────────────┴───────────────────────┘
```

### 6.2 Input Panel — Field Specification

Each input field must have:
- Label + tooltip (hover) explaining assumption context
- Input (number/select/toggle)
- "AI" badge toggle where applicable
- Inline validation (red border + message if out of typical range)
- Real-time update on blur (not on every keystroke — debounce 400ms)

**§ Entry**
- Deal name (text)
- Sector (select: Technology, Healthcare, Industrials, Consumer, Financial Services, Real Estate, Energy, Other)
- Currency (select)
- LTM Revenue (number, £m)
- LTM EBITDA (number, £m) OR EBITDA Margin % (toggle between modes)
- Entry EV (number, £m) OR Entry EBITDA Multiple (toggle)
- Derived fields (read-only, auto-computed): Entry Revenue Multiple, Equity Check

**§ Debt Structure**
- Add/remove tranche buttons
- Per tranche: Name, Principal, Rate Type, Rate (or Spread + Base), Amortization Type, Schedule
- Aggregate display: Total Debt, Leverage Ratio, Interest Coverage (auto-computed)
- Tranche validation: warn if total debt > EV × 0.85

**§ Revenue**
- Per-year growth rates (holding period drives number of fields)
- Organic growth / acquisition growth split (optional)
- Churn rate (for SaaS)
- AI toggle on growth rates

**§ Margins**
- Entry EBITDA margin (auto-populated from Entry)
- Target exit EBITDA margin
- Trajectory type (select: linear / front-loaded / back-loaded / step / explicit)
- D&A % revenue
- Maintenance capex % revenue
- Growth capex per year
- NWC % revenue
- AI toggle on margin target

**§ Costs & Fees**
- Entry fee %
- Exit fee %
- Monitoring fee £m/year
- Financing fee %
- Transaction costs £m
- Tax rate %
- NOL carryforward £m

**§ Exit**
- Holding period (slider: 1–10 years)
- Exit EBITDA multiple (AI toggle)
- Exit method (select)
- Derived: Exit EV, Exit Net Debt, Exit Equity (read-only)

**§ MIP**
- MIP pool %
- Hurdle MOIC
- Vesting years
- Sweet equity %

### 6.3 Model Dashboard — Component Specification

**Returns Summary Card**
- IRR (large, primary metric) — color coded: green >25%, amber 15–25%, red <15%
- MOIC, Payback years, Cash yield
- Gross vs net IRR toggle
- Unlevered vs levered IRR toggle

**Value Bridge Chart (Waterfall)**
- Bars: Entry Equity | Revenue Growth | Margin Expansion | Multiple Expansion | Debt Paydown | Fees Drag | Exit Equity
- Each bar labeled with £m contribution and % of total gain
- Built with Recharts ComposedChart

**Debt Schedule Table**
- Per year: Beginning Balance (per tranche), Interest, PIK Accrual, Repayment, Ending Balance
- Footer: Leverage Ratio, Interest Coverage, DSCR
- Scrollable horizontally for long holding periods

**Sensitivity Heatmaps**
- Tab selector: Table 1 / 2 / 3 / 4
- Cell color: red (IRR <15%) → amber (15–25%) → green (>25%)
- Current base case cell highlighted with border
- Hover: show MOIC alongside IRR

**Scenario Comparison Panel**
- Side-by-side: Bear | Base | Bull | Stress
- Metrics: IRR, MOIC, Exit Equity, Leverage at exit
- Assumption delta vs base shown in smaller text below each value
- AI-generated narrative per scenario (collapsible)

**Exit Reality Check Panel**
- Per flag: icon (warning/critical), rule name, description, quantified impact
- Verdict badge: AGGRESSIVE / REALISTIC / CONSERVATIVE
- Implied buyer IRR displayed prominently

### 6.4 Chatboard

- Always visible, not collapsible
- Chat history: timestamp, message, AI response (structured sections)
- AI response rendered as structured sections (not prose blob):
  - **Return Decomposition**
  - **Primary Driver**
  - **Risk Concentration**
  - **Fragility Test**
  - **Improvement Levers** (bulleted)
  - **Assumption Rationale** (if assumptions were changed)
- If assumptions were updated: show diff (field | old value | new value) above AI narrative
- Input: multiline textarea + Send button + "Generate Assumptions" shortcut button
- Suggested prompts (first load only): "Critique this deal", "Make this conservative", "What breaks this?"

---

## 7. EXCEL EXPORT

### Sheet 1: Assumptions
- All inputs grouped by section (Entry, Debt, Revenue, Margins, Fees, MIP, Exit)
- AI-generated fields flagged with [AI] prefix
- Named ranges for all key assumptions

### Sheet 2: Calculations
- Full annual P&L (Revenue → EBITDA → EBIT → EBT → Net Income)
- Full debt schedule (per tranche, per year)
- FCF build (EBITDA → Capex → NWC → Tax → FCF)
- Cash flow to equity (entry CF, annual dividends if any, exit CF)
- All formulas live (not hardcoded values)

### Sheet 3: Outputs
- Returns summary (IRR, MOIC, DPI, payback)
- Value driver bridge (table + chart)
- Sensitivity tables (all four)
- Scenario comparison
- Exit reality check flags

### Formatting Standards
- Font: Calibri 10pt body, 11pt headers
- Color scheme: dark navy headers (#1a2744), white text, light grey alternating rows (#f5f7fa)
- Currency format: £0.0m (or €/$ as selected)
- Percentage format: 0.0%
- IRR color conditional formatting: red/amber/green thresholds as above
- No merged cells (except headers)
- Fully auditable: every output cell traces back to an assumption cell

---

## 8. STATE MANAGEMENT

### Frontend (Zustand)
```typescript
interface DealEngineStore {
  modelState: ModelState | null
  isCalculating: boolean
  chatHistory: ChatMessage[]
  apiKey: string | null
  activeScenario: string        // "base" | "bull" | "bear" | "stress"
  activeSensitivityTable: number
  
  // Actions
  initializeModel: (inputs: MinimalInputs) => Promise<void>
  updateField: (path: string, value: any) => Promise<void>
  sendChatMessage: (message: string) => Promise<void>
  generateAssumptions: () => Promise<void>
  exportExcel: () => Promise<void>
  saveModel: () => void          // downloads JSON
  loadModel: (file: File) => Promise<void>
}
```

### Backend (FastAPI lifespan)
- Single `model_state` instance per session (in-memory)
- No database required for MVP
- State passed in full on every AI call (stateless AI layer)
- UUID session token for multi-tab safety

---

## 9. VALIDATION & ERROR HANDLING

### Input Validation (backend, Pydantic)
- Revenue > 0
- EBITDA margin: 0–100%
- Entry multiple: 1x–30x
- Exit multiple: 1x–30x
- Leverage ratio: 0x–10x
- Holding period: 1–10 years
- Amortization schedule: sum must ≤ principal
- Debt total: < EV (cannot lever more than 100% of EV)

### Soft Warnings (frontend, non-blocking)
- Entry multiple > 15x: "High entry — flag for IC"
- Margin expansion > 1000bps: "Verify — exceptional case"
- IRR < 15%: "Below typical PE hurdle (15–20%)"
- Leverage > 7x: "Covenant breach risk at this leverage"
- Exit multiple > entry multiple + 3x: "Significant multiple expansion assumed"

### Model Edge Cases
- IRR solver non-convergence: return null with error flag; display "IRR non-convergent — check CF signs"
- Negative equity check: flag immediately — "Entry equity is negative; check debt quantum vs EV"
- Zero revenue in any year: warn — "Zero revenue in year [t] — check growth assumptions"

---

## 10. PERFORMANCE REQUIREMENTS

- Full model recalculation: < 200ms (Python, single session)
- Sensitivity table generation: < 2s (81 model runs × 4 tables = 324 runs)
- Sensitivity tables: run async, stream results to frontend as computed
- AI response: no frontend timeout under 30s; show "Analysing..." with elapsed timer
- Frontend re-render on state update: < 50ms (memoize chart data)

---

## 11. REPOSITORY STRUCTURE

```
deal-intelligence-engine/
├── README.md
├── deal_engine.md               ← this file
├── CLAUDE.md                    ← Claude Code prompt
├── docker-compose.yml
├── .env.example
│
├── backend/
│   ├── main.py                  ← FastAPI app, routes
│   ├── models/
│   │   ├── state.py             ← all Pydantic models
│   │   ├── debt.py              ← DebtTranche, DebtSchedule
│   │   └── outputs.py           ← Returns, ValueDriverDecomposition, etc.
│   ├── engine/
│   │   ├── projections.py       ← annual P&L engine
│   │   ├── debt_schedule.py     ← debt waterfall
│   │   ├── returns.py           ← IRR, MOIC, bridge
│   │   ├── scenarios.py         ← scenario + sensitivity engine
│   │   └── reality_check.py    ← exit reality check rules
│   ├── ai/
│   │   ├── gateway.py           ← Anthropic API proxy
│   │   ├── tool_definitions.py  ← update_deal_model tool schema
│   │   ├── intent.py            ← intent classification
│   │   └── system_prompt.py     ← AI system prompt
│   └── export/
│       └── excel.py             ← openpyxl workbook builder
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── store/
│   │   │   └── dealEngine.ts    ← Zustand store
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── InputPanel.tsx
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   └── Chatboard.tsx
│   │   │   ├── inputs/
│   │   │   │   ├── EntryInputs.tsx
│   │   │   │   ├── DebtStructure.tsx
│   │   │   │   ├── RevenueInputs.tsx
│   │   │   │   ├── MarginInputs.tsx
│   │   │   │   ├── FeesInputs.tsx
│   │   │   │   ├── ExitInputs.tsx
│   │   │   │   └── MIPInputs.tsx
│   │   │   ├── outputs/
│   │   │   │   ├── ReturnsSummary.tsx
│   │   │   │   ├── ValueBridge.tsx
│   │   │   │   ├── DebtScheduleTable.tsx
│   │   │   │   ├── SensitivityHeatmap.tsx
│   │   │   │   ├── ScenarioPanel.tsx
│   │   │   │   └── ExitRealityCheck.tsx
│   │   │   └── chat/
│   │   │       ├── Chatboard.tsx
│   │   │       ├── ChatMessage.tsx
│   │   │       └── AssumptionDiff.tsx
│   │   ├── hooks/
│   │   │   ├── useModelUpdate.ts
│   │   │   └── useDebounce.ts
│   │   └── lib/
│   │       ├── api.ts           ← typed API client
│   │       └── formatters.ts    ← number, currency, % formatters
│   └── package.json
│
└── tests/
    ├── test_engine.py           ← unit tests for all financial calculations
    ├── test_debt_schedule.py
    ├── test_irr.py              ← IRR solver edge cases
    └── test_reality_check.py
```

---

## 12. TESTING REQUIREMENTS

All financial engine functions must have unit tests. Reference cases:

**IRR Test Cases:**
- CF: [-100, 0, 0, 0, 0, 200] → IRR ≈ 14.87% (2.0x MOIC, 5yr)
- CF: [-100, 0, 0, 0, 0, 300] → IRR ≈ 24.57% (3.0x MOIC, 5yr)
- CF: [-100, 0, 0, 0, 0, 100] → IRR = 0% (1.0x MOIC, 5yr)
- CF: [-100, 0, 0, 150] → IRR ≈ 14.47% (1.5x MOIC, 3yr)
- Non-convergent case: all negative CFs → must return null gracefully

**Debt Schedule Test Cases:**
- Bullet repayment: balance flat years 1–4, fully repaid year 5
- Straight-line: balance decreases linearly
- PIK: balance grows each year at PIK rate; no cash interest
- Cash sweep: excess FCF applied to debt; verify ending balance

**Value Bridge Reconciliation:**
- sum(delta_rev + delta_margin + delta_multiple + delta_debt − fees) must equal (exit_equity − entry_equity) within £0.01m tolerance

**Exit Reality Check:**
- Each rule: test one case that triggers, one that does not

---

## APPENDIX A — DEFAULT ASSUMPTIONS BY SECTOR

When AI generates assumptions without sector context, use these as priors:

| Sector | Rev Growth | Margin Expansion | Entry Multiple | Leverage |
|--------|-----------|-----------------|----------------|---------|
| Technology (SaaS) | 15–25% | 200–400bps | 14–20x | 3–4x |
| Technology (Legacy) | 5–10% | 100–200bps | 8–12x | 4–5x |
| Healthcare Services | 8–12% | 200–300bps | 10–14x | 4–5x |
| Industrials | 4–7% | 150–300bps | 7–10x | 4–5.5x |
| Consumer Staples | 3–6% | 100–200bps | 8–11x | 3.5–4.5x |
| Consumer Discretionary | 5–9% | 100–250bps | 7–10x | 3–4x |
| Business Services | 7–12% | 200–350bps | 9–13x | 4–5x |
| Financial Services | 6–10% | 150–250bps | 9–12x | 2–3x |

---

## APPENDIX B — KNOWN EDGE CASES & HANDLING

| Scenario | Handling |
|----------|---------|
| IRR solver fails to converge | Return null; surface "IRR non-convergent" flag; show MOIC only |
| Negative equity check | Block model run; surface critical error |
| PIK + cash sweep simultaneously | PIK accrues first; sweep applied to cash-pay tranches only |
| Holding period = 1 year | Suppress per-year charts; show entry/exit comparison only |
| Exit multiple < 1x | Warn "distressed exit implied"; run model but flag |
| Growth rate = -100% | Revenue = 0; cascade warning through all margin and return outputs |
| All fields AI-toggled | AI must generate a coherent, internally consistent assumption set before running model |
| Leverage ratio > entry EV | Block; error: "Debt exceeds enterprise value" |
