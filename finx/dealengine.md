Build a full-stack application called "Deal Intelligence Engine".

This is NOT a calculator or template tool. It is an interactive financial decision system for advanced users (IB/PE-level).

The system models a SINGLE COMPANY investment (one deal) and allows the user to construct, interrogate, and iterate on the deal using both structured inputs and an AI-driven chat interface.

--------------------------------
CORE PRINCIPLES
--------------------------------

1. The system models ONE company only (no mergers, no multi-company logic)
2. The system constructs a deal (entry → operations → exit)
3. The system must work with PARTIAL inputs (not full assumptions)
4. AI is REQUIRED to use the system (user provides API key)
5. AI NEVER performs calculations — only interpretation + assumption support
6. The system must feel like a professional decision environment, not a learning tool

--------------------------------
ARCHITECTURE
--------------------------------

Frontend:
- Advanced, structured UI (not minimal sliders)
- Editable fields at every stage
- Real-time updates
- Persistent state (model updates dynamically)

Backend:
- Python (FastAPI preferred) or Node.js
- Handles all financial calculations
- Handles AI API calls (user-provided key)
- Maintains model state

AI Layer:
- User must input their own API key before using the tool
- AI is integrated via a CHATBOARD (central feature)
- AI interacts with structured model state

--------------------------------
CORE SYSTEM (NOT MULTIPLE TOOLS)

The system is ONE engine with FOUR capabilities:

1. Deal Construction
2. Scenario & Sensitivity
3. Value Driver Decomposition
4. Exit Reality Check

--------------------------------
MODEL LOGIC

The system must accept MINIMAL REAL INPUTS:

REQUIRED INPUTS:
- Latest revenue
- Latest EBITDA (or margin)
- Entry multiple (or EV)

OPTIONAL INPUTS (each with toggle: "Let AI decide"):
- Revenue growth
- Margin expansion
- Exit multiple
- Leverage
- Holding period

--------------------------------
DEAL CONSTRUCTION ENGINE

The system must:

1. Build forward revenue:
   - Based on growth assumptions (user or AI)

2. Build margin trajectory:
   - Current → target margin

3. Compute EBITDA over time

4. Compute exit:
   - Exit EBITDA × exit multiple

5. Compute returns:
   - IRR
   - MOIC
   - Equity value

--------------------------------
VALUE DRIVER DECOMPOSITION

The system must break returns into:

- Revenue growth contribution
- Margin expansion contribution
- Multiple expansion contribution

Output:
- % contribution of each driver
- Visual bridge chart

--------------------------------
SCENARIO & SENSITIVITY ENGINE

- Base / Bull / Bear scenarios auto-generated
- Sensitivity tables:
  - IRR vs growth
  - IRR vs margin
  - IRR vs exit multiple

--------------------------------
EXIT REALITY CHECK

- Compare entry vs exit multiple
- Flag inconsistencies:
  - e.g. margin expansion + no multiple compression
- Show implied valuation logic

--------------------------------
CHATBOARD (CRITICAL FEATURE)

The chatboard is ALWAYS visible below the model.

The chatboard interacts with the model state.

User can:
- Question assumptions
- Ask for changes
- Request more conservative/aggressive cases

Examples:
- "Reduce margin expansion to something realistic"
- "Make this more conservative"
- "What happens if growth drops to 5%?"

--------------------------------
CHATBOARD BEHAVIOR

AI must:

1. Read current model state (JSON)
2. Modify assumptions if requested
3. Re-run model (backend handles recalculation)
4. Respond with structured output

--------------------------------
AI OUTPUT FORMAT (STRICT)

Every response must include:

1. RETURN DECOMPOSITION
- What is driving returns

2. PRIMARY DRIVER
- Clear, decisive identification

3. RISK CONCENTRATION
- Where model is fragile

4. FRAGILITY TEST
- What breaks the deal

5. IMPROVEMENT LEVERS
- How to increase IRR

Tone:
- Direct
- Critical
- No fluff
- No teaching language

--------------------------------
AI ASSUMPTION SUPPORT

If user selects "Let AI decide":

AI must generate:
- Realistic ranges (not single values)
- Context-aware assumptions

Example:
"Based on current margins and growth, a reasonable base case is 6–8% growth and 200–300bps margin expansion."

--------------------------------
UI FLOW

1. User inputs API key (mandatory)
2. User inputs minimal financials
3. System builds model automatically
4. User edits assumptions OR uses AI toggles
5. Outputs update in real time
6. User interacts with chatboard
7. Model updates dynamically
8. User can download Excel

--------------------------------
EXCEL OUTPUT

- Mirrors model exactly
- Sheets:
  - Assumptions
  - Calculations
  - Outputs
- Fully auditable
- Professional formatting

--------------------------------
CONSTRAINTS

- No generic DCF tool
- No LBO label (this is implicit)
- No multi-company logic
- No educational UI
- No unnecessary features

--------------------------------
DELIVERABLE

- Fully functional full-stack system
- Clean modular code
- Clear separation:
  - model logic
  - UI
  - AI layer
  - state management

CHATBOARD SYSTEM LOGIC

Input:
- User message
- Current model state (JSON)

Process:

1. Classify intent:
   - Modify assumption
   - Ask explanation
   - Run scenario
   - General critique

2. If modification:
   - Update relevant variables
   - Trigger recalculation

3. If unclear:
   - Infer reasonable adjustment

4. Always respond with structured output

--------------------------------

MODEL STATE STRUCTURE (example)

{
  revenue: 100,
  growth: 0.08,
  margin: 0.25,
  margin_target: 0.30,
  entry_multiple: 10,
  exit_multiple: 12,
  leverage: 0.5,
  holding_period: 5
}

--------------------------------

OUTPUT RULES

- Never say "I cannot"
- Never ask basic clarifications
- Make reasonable assumptions if needed
- Be decisive

--------------------------------

EXAMPLE RESPONSE

"Reducing margin expansion from 500bps to 200bps lowers IRR from 28% to 17%.

Returns are now primarily driven by multiple expansion, which increases fragility.

If exit multiple compresses by 1x, IRR drops below 12%.

To improve returns:
- Increase revenue growth assumptions modestly
- Introduce moderate leverage
- Maintain at least 300bps margin expansion"

System: Deal Intelligence Engine

Purpose:
Interactive financial decision system for single-company investment analysis.

Core Rules:
- One company only
- AI required (user API key)
- AI = interpretation only
- Deterministic model logic

Capabilities:
1. Deal Construction
2. Scenario & Sensitivity
3. Value Driver Decomposition
4. Exit Reality Check

Inputs:

Required:
- Revenue
- EBITDA or margin
- Entry multiple

Optional (AI toggle):
- Growth
- Margin expansion
- Exit multiple
- Leverage
- Holding period

Process:

1. Project revenue
2. Project margins
3. Compute EBITDA
4. Compute exit value
5. Calculate IRR and MOIC

Outputs:
- IRR
- MOIC
- Equity value
- Value driver %

Chatboard:

- Always active
- Receives model state
- Modifies assumptions
- Triggers recalculation

User actions:
- Adjust assumptions
- Run scenarios
- Ask for critique

AI must:
- Update model
- Respond in structured format
- Be decisive and critical

AI Rules:

- No calculations
- Only interpretation and assumption support

Output structure:

1. Return decomposition
2. Primary driver
3. Risk concentration
4. Fragility test
5. Improvement levers

Tone:
- Direct
- Critical
- No fluff

UI:

- Advanced structured inputs
- Editable at all levels
- Real-time updates
- Charts:
  - Value bridge
  - Sensitivity heatmap

Flow:
API key → Input → Model → Chat → Update → Export

Excel:

- Mirrors model exactly
- Sheets:
  - Assumptions
  - Calculations
  - Outputs
- Fully auditable
- Professional format

  
