"""FastAPI application — all API endpoints per Section 5."""

from __future__ import annotations

import io
import json
import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ValidationError

from backend.ai.gateway import call_ai, detect_provider
from backend.ai.intent import classify_intent
from backend.engine.debt_schedule import build_debt_schedule
from backend.engine.projections import build_projections, update_projections_with_debt
from backend.engine.reality_check import compute_credit_analysis, compute_fragility, run_reality_check
from backend.engine.returns import calculate_returns, decompose_value_drivers
from backend.engine.scenarios import generate_scenarios, generate_sensitivity_tables
from backend.export.excel import build_excel
from backend.models.debt import DebtTranche
from backend.models.state import ModelState

app = FastAPI(title="Deal Intelligence Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session store
sessions: dict[str, ModelState] = {}


def _get_or_create_session(session_id: Optional[str]) -> tuple[str, ModelState]:
    if session_id and session_id in sessions:
        return session_id, sessions[session_id]
    new_id = session_id or str(uuid.uuid4())
    state = ModelState()
    sessions[new_id] = state
    return new_id, state


def _full_recalc(state: ModelState) -> ModelState:
    """Run the full model pipeline: projections → debt → returns → bridge → reality check."""
    state.derive_entry_fields()
    state.ensure_list_lengths()

    proj = build_projections(state)
    ds = build_debt_schedule(state, proj)

    # Second pass with actual debt data
    hp = state.exit.holding_period
    pik_by_year = []
    for yr_idx in range(hp):
        pik = sum(
            ds.tranche_schedules[t][yr_idx].pik_accrual
            for t in range(len(ds.tranche_schedules))
        ) if ds.tranche_schedules else 0.0
        pik_by_year.append(pik)

    proj = update_projections_with_debt(
        proj, state,
        ds.total_cash_interest_by_year,
        pik_by_year,
        ds.total_repayment_by_year,
    )

    ret = calculate_returns(state, proj, ds)
    vd = decompose_value_drivers(state, proj, ds, ret)
    rc = run_reality_check(state, proj, ds, ret)
    ca = compute_credit_analysis(state, proj, ds)
    fa = compute_fragility(state, ret.irr, ret.moic)

    # Populate Sources & Uses (hard reconciliation)
    state.compute_sources_and_uses()

    state.projections = proj
    state.debt_schedule = ds
    state.returns = ret
    state.value_drivers = vd
    state.exit_reality_check = rc
    state.credit_analysis = ca
    state.fragility_analysis = fa
    state.last_modified = datetime.utcnow()

    # Update exit derived fields
    if proj.years:
        state.exit.exit_ebitda = proj.years[-1].ebitda_adj
        state.exit.exit_ev = ret.exit_ev
        state.exit.exit_net_debt = ret.exit_net_debt
        state.exit.exit_equity = ret.exit_equity
        state.exit.mip_payout = ret.mip_payout

    return state


# ── Request/Response Models ───────────────────────────────────────────────

class InitializeRequest(BaseModel):
    deal_name: str = "Untitled Deal"
    revenue: float = 100.0
    ebitda_or_margin: float = 0.20
    entry_multiple: float = 10.0
    currency: str = "GBP"
    sector: str = "Industrials"


class UpdateRequest(BaseModel):
    field_path: str
    value: Any


class ChatRequest(BaseModel):
    message: str
    model_state: Optional[dict] = None
    chat_history: list[dict] = []


class GenerateAssumptionsRequest(BaseModel):
    toggled_fields: list[str]
    model_state: Optional[dict] = None


# ── Endpoints ─────────────────────────────────────────────────────────────

@app.post("/api/model/initialize")
async def initialize_model(
    req: InitializeRequest,
    x_session_id: Optional[str] = Header(None),
):
    session_id, state = _get_or_create_session(x_session_id)

    state.deal_name = req.deal_name
    state.currency = req.currency
    state.sector = req.sector
    state.revenue.base_revenue = req.revenue

    # Handle ebitda_or_margin: if < 1, treat as margin; otherwise as absolute EBITDA
    if req.ebitda_or_margin < 1.0:
        state.margins.base_ebitda_margin = req.ebitda_or_margin
    else:
        state.margins.base_ebitda_margin = req.ebitda_or_margin / req.revenue if req.revenue > 0 else 0.20

    state.entry.entry_ebitda_multiple = req.entry_multiple
    state.exit.exit_ebitda_multiple = req.entry_multiple  # default: exit = entry

    # Default debt: single senior term loan at 4x leverage
    ebitda = req.revenue * state.margins.base_ebitda_margin
    default_debt = ebitda * 4.0
    state.debt_tranches = [
        DebtTranche(
            name="Senior Term Loan A",
            principal=default_debt,
            interest_rate=0.05,
            rate_type="fixed",
            amortization_type="bullet",
        )
    ]

    state = _full_recalc(state)
    sessions[session_id] = state

    return {"session_id": session_id, "model_state": state.model_dump()}


@app.post("/api/model/update")
async def update_field(
    req: UpdateRequest,
    x_session_id: Optional[str] = Header(None),
):
    session_id, state = _get_or_create_session(x_session_id)

    # Apply dot-notation update
    state_dict = state.model_dump()
    from backend.ai.gateway import apply_update
    try:
        apply_update(state_dict, req.field_path, req.value)
    except (KeyError, IndexError, TypeError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid field path: {req.field_path}: {e}")

    try:
        state = ModelState(**state_dict)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))

    state = _full_recalc(state)
    sessions[session_id] = state

    return {"session_id": session_id, "model_state": state.model_dump()}


@app.post("/api/model/recalculate")
async def recalculate(
    request: Request,
    x_session_id: Optional[str] = Header(None),
):
    body = await request.json()
    try:
        state = ModelState(**body)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))

    session_id = x_session_id or str(uuid.uuid4())
    state = _full_recalc(state)
    sessions[session_id] = state

    return {"session_id": session_id, "model_state": state.model_dump()}


@app.post("/api/ai/chat")
async def ai_chat(
    req: ChatRequest,
    x_session_id: Optional[str] = Header(None),
    x_anthropic_key: Optional[str] = Header(None),
    x_ai_key: Optional[str] = Header(None),
    x_ai_provider: Optional[str] = Header(None),
):
    api_key = x_ai_key or x_anthropic_key
    if not api_key:
        raise HTTPException(status_code=401, detail="X-AI-Key or X-Anthropic-Key header required")

    provider = x_ai_provider or detect_provider(api_key)

    session_id, state = _get_or_create_session(x_session_id)

    # Use provided model_state if given, otherwise use session state
    if req.model_state:
        try:
            state = ModelState(**req.model_state)
        except ValidationError:
            pass  # fall back to session state

    result = await call_ai(req.message, state, req.chat_history, api_key, provider)

    if "error" in result:
        return {"session_id": session_id, "error": result["error"], "intent": result.get("intent")}

    # Rebuild state from updated dict
    if result.get("updated_state_dict"):
        try:
            state = ModelState(**result["updated_state_dict"])
        except ValidationError as e:
            return {"session_id": session_id, "error": f"Invalid state after AI update: {e}"}

    # Recalculate if requested
    if result.get("trigger_recalculation"):
        state = _full_recalc(state)

    sessions[session_id] = state

    return {
        "session_id": session_id,
        "model_state": state.model_dump(),
        "ai_response": result.get("analysis", {}),
        "applied_diffs": result.get("applied_diffs", []),
        "intent": result.get("intent"),
    }


@app.post("/api/ai/generate-assumptions")
async def generate_assumptions(
    req: GenerateAssumptionsRequest,
    x_session_id: Optional[str] = Header(None),
    x_anthropic_key: Optional[str] = Header(None),
    x_ai_key: Optional[str] = Header(None),
    x_ai_provider: Optional[str] = Header(None),
):
    api_key = x_ai_key or x_anthropic_key
    if not api_key:
        raise HTTPException(status_code=401, detail="X-AI-Key or X-Anthropic-Key header required")

    provider = x_ai_provider or detect_provider(api_key)

    session_id, state = _get_or_create_session(x_session_id)
    if req.model_state:
        try:
            state = ModelState(**req.model_state)
        except ValidationError:
            pass

    message = f"Generate realistic assumptions for the following AI-toggled fields: {', '.join(req.toggled_fields)}. Use sector-appropriate values for {state.sector}."
    result = await call_ai(message, state, [], api_key, provider)

    if "error" in result:
        return {"session_id": session_id, "error": result["error"]}

    if result.get("updated_state_dict"):
        try:
            state = ModelState(**result["updated_state_dict"])
            state = _full_recalc(state)
            sessions[session_id] = state
        except ValidationError as e:
            return {"session_id": session_id, "error": str(e)}

    return {
        "session_id": session_id,
        "model_state": state.model_dump(),
        "rationale": result.get("analysis", {}).get("assumption_rationale", ""),
    }


@app.get("/api/model/scenarios")
async def get_scenarios(x_session_id: Optional[str] = Header(None)):
    session_id, state = _get_or_create_session(x_session_id)
    if not state.projections.years:
        state = _full_recalc(state)
    scenarios = generate_scenarios(state)
    state.scenarios = scenarios
    sessions[session_id] = state
    return {"session_id": session_id, "scenarios": [s.model_dump() for s in scenarios]}


@app.get("/api/model/sensitivity/{table_id}")
async def get_sensitivity(table_id: int, x_session_id: Optional[str] = Header(None)):
    session_id, state = _get_or_create_session(x_session_id)
    if not state.projections.years:
        state = _full_recalc(state)
    tables = generate_sensitivity_tables(state)
    state.sensitivity_tables = tables
    sessions[session_id] = state

    for t in tables:
        if t.table_id == table_id:
            return {"session_id": session_id, "table": t.model_dump()}
    raise HTTPException(status_code=404, detail=f"Table {table_id} not found")


@app.post("/api/export/excel")
async def export_excel(
    request: Request,
    x_session_id: Optional[str] = Header(None),
):
    session_id, state = _get_or_create_session(x_session_id)
    if not state.projections.years:
        state = _full_recalc(state)

    xlsx_bytes = build_excel(state)
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={state.deal_name.replace(' ', '_')}_model.xlsx"},
    )


@app.get("/api/model/export/json")
async def export_json(x_session_id: Optional[str] = Header(None)):
    session_id, state = _get_or_create_session(x_session_id)
    return state.model_dump()


@app.post("/api/model/import/json")
async def import_json(
    request: Request,
    x_session_id: Optional[str] = Header(None),
):
    body = await request.json()
    try:
        state = ModelState(**body)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))

    session_id = x_session_id or str(uuid.uuid4())
    state = _full_recalc(state)
    sessions[session_id] = state

    return {"session_id": session_id, "model_state": state.model_dump()}
