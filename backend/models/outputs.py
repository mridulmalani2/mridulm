"""Output / computed Pydantic models: projections, returns, scenarios, flags."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ── Annual Projections ────────────────────────────────────────────────────

class AnnualProjectionYear(BaseModel):
    """Single-year P&L and cash-flow row."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    year: int
    revenue: float = 0.0
    revenue_growth: float = 0.0
    organic_revenue: float = 0.0
    acquisition_revenue: float = 0.0
    ebitda: float = 0.0
    ebitda_margin: float = 0.0
    ebitda_adj: float = 0.0  # post monitoring-fee
    da: float = 0.0
    ebit: float = 0.0
    interest_expense: float = 0.0
    financing_fee_amort: float = 0.0
    ebt: float = 0.0
    tax: float = 0.0
    nol_used: float = 0.0
    net_income: float = 0.0
    nopat: float = 0.0
    maintenance_capex: float = 0.0
    growth_capex: float = 0.0
    total_capex: float = 0.0
    delta_nwc: float = 0.0
    fcf_pre_debt: float = 0.0
    fcf_to_equity: float = 0.0


class AnnualProjection(BaseModel):
    """Full projection table: one row per year."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    years: list[AnnualProjectionYear] = Field(default_factory=list)


# ── Returns ───────────────────────────────────────────────────────────────

class Returns(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    irr: Optional[float] = Field(default=None, description="Equity IRR (post-fees, post-MIP)")
    moic: float = Field(default=0.0, description="Equity MOIC")
    dpi: float = Field(default=0.0, description="Distributions to paid-in")
    rvpi: float = Field(default=0.0, description="Residual value to paid-in (0 at exit)")
    cash_yield_avg: float = Field(default=0.0, description="Average annual cash yield")
    payback_years: float = Field(default=0.0, description="Years to return invested capital")
    irr_gross: Optional[float] = Field(default=None, description="Before fees and carry")
    irr_levered: Optional[float] = Field(default=None, description="With debt, before fees")
    irr_unlevered: Optional[float] = Field(default=None, description="Unlevered (no debt in CFs)")
    irr_convergence_failed: bool = Field(default=False)
    entry_equity: float = Field(default=0.0)
    exit_equity: float = Field(default=0.0)
    exit_ev: float = Field(default=0.0)
    exit_net_debt: float = Field(default=0.0)
    mip_payout: float = Field(default=0.0)


# ── Value Driver Decomposition ────────────────────────────────────────────

class ValueDriverDecomposition(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    revenue_growth_contribution_pct: float = 0.0
    margin_expansion_contribution_pct: float = 0.0
    multiple_expansion_contribution_pct: float = 0.0
    debt_paydown_contribution_pct: float = 0.0
    fees_drag_contribution_pct: float = 0.0

    revenue_growth_contribution_abs: float = 0.0
    margin_expansion_contribution_abs: float = 0.0
    multiple_expansion_contribution_abs: float = 0.0
    debt_paydown_contribution_abs: float = 0.0
    fees_drag_contribution_abs: float = 0.0

    entry_equity: float = 0.0
    exit_equity: float = 0.0
    total_equity_gain: float = 0.0
    reconciliation_delta: float = 0.0  # should be ~0


# ── Scenarios ─────────────────────────────────────────────────────────────

class ScenarioSet(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: Literal["base", "bull", "bear", "stress"] = "base"
    growth_rates: list[float] = Field(default_factory=list)
    margin_by_year: list[float] = Field(default_factory=list)
    exit_multiple: float = 0.0
    leverage_ratio: float = 0.0
    irr: Optional[float] = None
    moic: float = 0.0
    exit_equity: float = 0.0
    description: str = ""


# ── Sensitivity ───────────────────────────────────────────────────────────

class SensitivityTable(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    table_id: int = 1
    row_variable: str = ""
    col_variable: str = ""
    row_values: list[float] = Field(default_factory=list)
    col_values: list[float] = Field(default_factory=list)
    irr_matrix: list[list[Optional[float]]] = Field(default_factory=list)
    moic_matrix: list[list[float]] = Field(default_factory=list)


# ── Exit Reality Check ────────────────────────────────────────────────────

class ExitFlag(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    flag_type: Literal[
        "multiple_expansion_with_margin_expansion",
        "multiple_expansion_with_leverage_increase",
        "growth_deceleration_inconsistency",
        "exit_premium_vs_entry",
        "implied_buyer_return_too_low",
        "leverage_at_exit_above_threshold",
        "nwc_deterioration",
        "capex_intensity_change",
    ]
    severity: Literal["warning", "critical"]
    description: str = ""
    quantified_impact: str = ""


class ExitRealityCheck(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    flags: list[ExitFlag] = Field(default_factory=list)
    implied_buyer_irr: Optional[float] = None
    ev_revenue_at_exit: float = 0.0
    ev_ebitda_at_exit: float = 0.0
    public_comps_multiple_range: tuple[float, float] = (0.0, 0.0)
    multiple_delta: float = 0.0
    verdict: Literal["aggressive", "realistic", "conservative"] = "realistic"
    narrative: str = ""


# ── Chat ──────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    role: Literal["user", "assistant"] = "user"
    content: str = ""
    timestamp: Optional[str] = None
    assumption_updates: Optional[dict] = None
    analysis: Optional[dict] = None
