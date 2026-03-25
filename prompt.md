# CLAUDE.md — Deal Intelligence Engine

> **This file is the authoritative build prompt for Claude Code.**
> Read `deal_engine.md` in full before writing any code. Every architectural decision in this prompt is derived from that spec. Do not deviate.

---

## WHAT YOU ARE BUILDING

A full-stack professional investment decision system called the **Deal Intelligence Engine**.

This is a single-company LBO/deal analysis environment used by PE analysts and associates. It is not a calculator, not a learning tool, not a fintech demo. The target user has a CIM open, knows what IRR means, and needs to stress-test a deal fast.

The system has four capabilities: Deal Construction, Scenario & Sensitivity, Value Driver Decomposition, Exit Reality Check. These are not separate tools. They are one engine.

---

## READ FIRST

Before writing a single line of code:

1. Read `deal_engine.md` completely
2. Understand the full `ModelState` schema (Section 2.1) — this is the single source of truth
3. Understand the financial model logic (Section 3) — the debt schedule is not simplified
4. Understand the AI JSON contract (Section 4.2) — tool use is mandatory, not optional
5. Understand the exit reality check rules (Section 3.8) — all 8 rules must be implemented

---

## STACK

**Backend:**
- Python 3.11+
- FastAPI with async endpoints
- Pydantic v2 for all data models
- `numpy-financial` for IRR (with scipy fallback — newton method, then brentq)
- `openpyxl` for Excel export
- `httpx` for proxying Anthropic API calls
- No database. In-memory state per session. UUID session tokens.

**Frontend:**
- React 18 + TypeScript (strict mode)
- Vite
- Zustand for state management
- Recharts for all charts (waterfall, heatmaps, scenario comparison)
- Tailwind CSS — no component libraries (no shadcn, no MUI, no Radix)
- Custom CSS variables for theming

**Infrastructure:**
- docker-compose (frontend :3000, backend :8000)
- `.env.example` provided, no secrets in repo

---

## BUILD ORDER

Build in this exact sequence. Do not skip ahead. Each phase must be complete and tested before the next begins.

### Phase 1 — Backend Data Models
File: `backend/models/state.py`, `backend/models/debt.py`, `backend/models/outputs.py`

Implement every Pydantic model from `deal_engine.md` Section 2.1 exactly.

- `DebtTranche` — all fields including PIK rate, cash_sweep, floor, commitment_fee
- `FeeStructure` — entry, exit, monitoring, financing, transaction costs
- `ManagementIncentive` — MIP pool, hurdle, vesting, sweet equity
- `RevenueAssumptions` — per-year growth rates, organic/acquisition split, churn
- `MarginAssumptions` — trajectory enum, per-year overrides, D&A, capex, NWC
- `TaxAssumptions` — rate, shield, DTL, NOL, minimum rate
- `EntryAssumptions`, `ExitAssumptions`, `Returns`, `ValueDriverDecomposition`
- `ScenarioSet`, `SensitivityTable`
- `ExitFlag`, `ExitRealityCheck`
- `ModelState` — the root model, contains all above

Every model must have:
- Validators for sensible ranges (see Section 9 of spec)
- Default values where appropriate so minimal-input initialization works
- `model_config = ConfigDict(arbitrary_types_allowed=True)`

### Phase 2 — Financial Engine (backend/engine/)

**2a. Projections (`projections.py`)**

Implement `build_projections(state: ModelState) -> AnnualProjection` exactly per Section 3.1:
- Revenue build (organic + acquisition)
- Margin trajectory (linear / front_loaded / back_loaded / step / explicit)
- EBITDA, monitoring fee adjustment
- D&A, EBIT
- NWC movement (pct_change and explicit methods)
- Capex (maintenance + growth)
- FCF pre-debt
- Tax with NOL usage, minimum rate floor

**2b. Debt Schedule (`debt_schedule.py`)**

Implement `build_debt_schedule(state: ModelState, projections: AnnualProjection) -> DebtSchedule` per Section 3.2:
- Per-tranche, per-year waterfall
- PIK accrual (separate from cash interest)
- Cash sweep logic (available_for_sweep × sweep_pct applied to cash-pay tranches)
- Floating rate: effective_rate = max(base_rate + spread, floor)
- Interest tax shield
- Aggregate outputs: total debt, net debt, leverage ratio, interest coverage, DSCR

**2c. Returns (`returns.py`)**

Implement `calculate_returns(state: ModelState, projections, debt_schedule) -> Returns` per Section 3.4:
- Entry equity = EV + transaction_costs + financing_fees − total_debt_raised
- MIP payout: if gross MOIC ≥ hurdle → mip_pool_pct × exit_equity_pre_mip
- IRR: scipy.optimize.newton first; if non-convergent, brentq on [-0.999, 100.0]; if both fail, return None with flag
- MOIC, DPI, RVPI, payback_years, cash_yield_avg
- Gross IRR (before fees), levered IRR (with debt, before fees), unlevered IRR (no debt in CFs)

**2d. Value Driver Bridge (`returns.py` or separate)**

Implement `decompose_value_drivers(state, projections, debt_schedule) -> ValueDriverDecomposition` per Section 3.5:
- Four-step isolation methodology: revenue growth → margin → multiple → debt paydown
- Fees drag as fifth component
- Reconciliation check: sum of components must equal exit_equity − entry_equity within £0.01m tolerance
- Raise a warning (not an error) if reconciliation fails

**2e. Scenarios (`scenarios.py`)**

Implement `generate_scenarios(state: ModelState) -> list[ScenarioSet]` per Section 3.6:
- Bear, Base, Bull, Stress — exact parameter deltas as specified
- Each scenario runs full model independently (projections → debt schedule → returns)
- Scenario runs must not mutate the base ModelState; deep copy before modifying

**2f. Sensitivity Engine (`scenarios.py`)**

Implement `generate_sensitivity_tables(state: ModelState) -> list[SensitivityTable]` per Section 3.7:
- All four tables as specified
- Each cell runs full model
- For Table 4 (leverage sensitivity): rebuild debt tranches at new leverage ratio (scale Senior TLA principal proportionally)
- Tables run async; backend streams results as they complete
- Total runs: 9×9 × 4 tables = 324 full model runs. Must complete in < 2s.

**2g. Exit Reality Check (`reality_check.py`)**

Implement all 8 rules from Section 3.8:
- Each rule: check condition, compute quantified impact, return ExitFlag
- Implied buyer IRR (Rule 3): solve IRR for a hypothetical buyer at exit_ev, same growth/margins for 5yr hold, exit at entry_multiple
- Verdict: if 0 critical flags → "realistic"; if 1+ critical flags → "aggressive"; if all warnings and exit multiple < entry multiple → "conservative"

### Phase 3 — API Layer (`backend/main.py`)

Implement all endpoints from Section 5:
- `POST /api/model/initialize` — minimal inputs in, full ModelState out
- `POST /api/model/update` — dot-notation field path, triggers full recalc
- `POST /api/model/recalculate` — full state in, full state out
- `POST /api/ai/chat` — proxies to Anthropic, applies updates, recalculates
- `POST /api/ai/generate-assumptions` — AI fills toggled fields
- `GET /api/model/scenarios` — returns scenario set
- `GET /api/model/sensitivity/{table_id}` — returns one sensitivity table
- `POST /api/export/excel` — streams .xlsx
- `GET /api/model/export/json` — full state download
- `POST /api/model/import/json` — load saved state

Session handling:
- UUID session token in header (`X-Session-ID`)
- In-memory dict: `sessions: dict[str, ModelState]`
- If no session token: create new session

CORS: allow all origins in development (`*`)

### Phase 4 — AI Layer (`backend/ai/`)

**4a. Tool Definition (`tool_definitions.py`)**

Implement `DEAL_ENGINE_TOOL` exactly as specified in Section 4.2. Do not simplify the schema. Every field in `analysis` is required.

**4b. Intent Classification (`intent.py`)**

Implement `classify_intent(message: str) -> Intent` — simple keyword/pattern matching first pass. Pass result to AI as context in the system prompt prefix.

**4c. AI Gateway (`gateway.py`)**

Implement `call_ai(message, model_state, chat_history, api_key) -> AIResponse`:
- System prompt from Section 4.3 (verbatim)
- Tool use enforced: `tool_choice={"type": "tool", "name": "update_deal_model"}`
- Model: `claude-opus-4-5` (user's key — do not hardcode)
- Extract `tool_use` block from response content
- Parse `assumption_updates` from tool result
- Apply updates to model state via dot-notation path resolution
- If `trigger_recalculation` is True: run full recalc, return updated state
- Return: updated state + structured analysis + applied diffs

**Dot-notation path resolver:**
```python
def apply_update(state_dict: dict, path: str, value: any) -> dict:
    # e.g. "revenue.growth_rates" → state_dict["revenue"]["growth_rates"] = value
    # e.g. "debt_tranches.0.interest_rate" → state_dict["debt_tranches"][0]["interest_rate"] = value
```

### Phase 5 — Excel Export (`backend/export/excel.py`)

Implement `build_excel(state: ModelState) -> bytes` per Section 7:

**Sheet 1: Assumptions**
- Grouped by section
- Named ranges for key cells
- AI-generated fields prefixed [AI]
- Header: dark navy (#1a2744), white text
- No merged cells except section headers

**Sheet 2: Calculations**
- Full P&L (Revenue → EBITDA → EBIT → EBT → Net Income), annual columns
- Full debt schedule (per tranche, per year)
- FCF build
- All cells are formulas referencing Sheet 1 named ranges where possible

**Sheet 3: Outputs**
- Returns summary with IRR color conditional formatting (red <15%, amber 15–25%, green >25%)
- Value driver bridge table
- All four sensitivity tables
- Scenario comparison
- Exit reality check flags table

### Phase 6 — Frontend

Build in this component order:

**6a. Zustand Store (`src/store/dealEngine.ts`)**
Implement full store from Section 8. Typed. Every action async.

**6b. API Client (`src/lib/api.ts`)**
Typed fetch wrapper for all endpoints. Handle 422 validation errors by surfacing to user.

**6c. Layout Shell**
Three-column layout. Fixed widths. Dark theme. No component library.

Design direction: **terminal-grade professional dark UI**
- Background: #0a0d13 (near-black with blue cast)
- Surface: #0f1420
- Border: #1e2a3a
- Accent: #00d4ff (electric cyan) for primary metrics and active states
- Positive: #00c896 (teal-green)
- Negative: #ff4757 (sharp red)
- Warning: #ffaa00
- Text primary: #e8edf5
- Text secondary: #6b7a96
- Font: `'IBM Plex Mono'` for numbers and code; `'Inter'` for labels (load from Google Fonts)
- No gradients. No blur effects. No rounded corners > 4px.
- This is a Bloomberg terminal, not a consumer app.

**6d. Input Panel Components** (Section 6.2)
Build each section as a collapsible accordion. All fields per spec. AI badge toggles where specified. Inline validation.

`DebtStructure.tsx`: dynamic add/remove tranche rows. Per-tranche: name, principal, rate type, rate/spread, amortization type, schedule input (comma-separated or per-year inputs).

**6e. Dashboard Components** (Section 6.3)

`ReturnsSummary.tsx`:
- IRR as the hero metric (large, color-coded)
- MOIC, payback, cash yield secondary
- Toggle: gross/net IRR, levered/unlevered

`ValueBridge.tsx`:
- Recharts ComposedChart waterfall
- Bars: Entry Equity, Revenue Growth (positive), Margin Expansion (positive), Multiple Expansion (positive/negative), Debt Paydown (positive), Fees Drag (negative), Exit Equity
- Each bar labeled with £m and % contribution
- Color: cyan for positive, red for negative, white for entry/exit

`DebtScheduleTable.tsx`:
- Scrollable table, per-tranche rows, per-year columns
- Rows: beginning balance, interest, PIK accrual, repayment, ending balance
- Footer: leverage, coverage, DSCR
- Tranche rows collapsible to aggregate view

`SensitivityHeatmap.tsx`:
- Tab selector (4 tables)
- Color scale: red (#ff4757) at IRR <15% → white (#e8edf5) at 20% → green (#00c896) at IRR >30%
- Current assumption highlighted with cyan border
- Hover tooltip: IRR + MOIC
- Stream in as computed (show skeleton cells loading)

`ScenarioPanel.tsx`:
- Four columns: Bear / Base / Bull / Stress
- IRR, MOIC, Exit Equity per column
- Delta vs base in smaller muted text
- AI narrative collapsible per scenario

`ExitRealityCheck.tsx`:
- Per flag: severity icon, rule name, description, quantified impact
- Critical flags: red left border
- Warning flags: amber left border
- Verdict banner at top: AGGRESSIVE (red) / REALISTIC (green) / CONSERVATIVE (amber)
- Implied buyer IRR displayed

**6f. Chatboard** (Section 6.4)

`Chatboard.tsx`:
- Always visible, right column
- Input: multiline, expand on focus, Cmd+Enter to send
- AI response rendered as structured sections — not a prose paragraph
- Assumption diff table when state changes (old value | new value | field)
- Suggested prompts on first load: "Critique this deal" | "What breaks this?" | "Make this conservative" | "Fill missing assumptions"
- Loading state: show "Analysing..." with elapsed seconds counter

**6g. API Key Modal**
- First load, non-dismissable until key entered
- Key stored in sessionStorage
- Passed as custom header to backend on every AI call
- Brief one-line explanation: "Your key is used directly and never stored server-side."

---

## CRITICAL IMPLEMENTATION RULES

**Financial Model:**
1. The IRR solver must handle non-convergence gracefully. Never crash. Return `null` IRR with an error flag.
2. The debt schedule must run the full waterfall per tranche. No aggregate shortcut.
3. PIK tranches must accrue to principal. Cash interest = 0 for PIK.
4. Cash sweep must be applied after mandatory amortization. Sweep only to cash-pay tranches.
5. Floating rate must apply the floor: `effective_rate = max(base_rate + spread, floor)`.
6. Value driver bridge must reconcile. Log a warning if it doesn't (do not silently swallow).
7. Sensitivity tables must run the full model per cell. No interpolation.
8. All 8 exit reality check rules must be implemented. No stubs.

**AI Layer:**
1. Tool use is mandatory. `tool_choice={"type": "tool", "name": "update_deal_model"}` on every call.
2. Never parse AI freeform text to extract assumption updates. Only use the `tool_use` block.
3. The API key is never logged, never persisted, never stored anywhere except the session header.
4. If the AI returns an invalid tool result (missing required fields), surface the raw error to the user in the chatboard. Do not silently fail.

**Frontend:**
1. Model state lives on the backend. Frontend is a view layer. Do not duplicate model logic in the frontend.
2. Every field update goes through `POST /api/model/update`. Frontend never computes financial outputs.
3. Debounce field updates at 400ms. Do not fire on every keystroke.
4. Sensitivity tables stream in. Show skeleton cells loading. Do not block the UI.

**Testing:**
1. Implement unit tests for all financial engine functions before building the API layer.
2. IRR test cases from Section 12 of spec must pass.
3. Debt schedule test cases (bullet, straight-line, PIK, cash sweep) must pass.
4. Value bridge reconciliation test must pass.
5. Run `pytest tests/` before any frontend work.

---

## WHAT NOT TO BUILD

- No DCF engine (no WACC, no terminal value via Gordon Growth)
- No multi-company logic
- No merger model
- No public comps table (AI references sector multiples verbally; no scraped data)
- No user authentication (session token only)
- No database
- No deployment config beyond docker-compose
- No tutorial or onboarding flow
- No tooltips that explain what IRR means

---

## DEFINITION OF DONE

The system is complete when:

1. A user can input revenue, EBITDA, and entry multiple and get a full deal model in < 3 seconds
2. The debt schedule correctly handles all amortization types including PIK
3. IRR is correct to within 0.01% of Excel's XIRR for all test cases
4. All four sensitivity tables generate without error
5. All 8 exit reality check rules trigger correctly on crafted test inputs
6. The AI chatboard modifies assumptions and triggers recalculation via tool use
7. The Excel export opens in Excel without errors and all formulas resolve
8. `pytest tests/` passes 100%
9. The UI runs without console errors on Chrome and Firefox
10. The entire stack runs with `docker-compose up`
