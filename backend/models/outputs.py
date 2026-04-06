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
    total_distributions: float = Field(default=0.0, description="Sum of interim distributions")
    dpi_by_year: list[float] = Field(default_factory=list, description="Cumulative DPI per year")
    rvpi_by_year: list[float] = Field(default_factory=list, description="Residual value to paid-in per year")
    convergence_iterations: int = Field(default=1, description="Debt/interest convergence iterations used")
    convergence_delta: float = Field(default=0.0, description="Final interest delta (£m) at convergence")


# ── Value Driver Decomposition ────────────────────────────────────────────

class DriverRank(BaseModel):
    """Single ranked value-creation driver."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str = ""                  # e.g. "Revenue Growth"
    abs_contribution: float = 0.0  # £m equity gain from this driver
    pct_of_gain: float = 0.0       # % of total equity gain (signed)
    rank: int = 0                   # 1 = largest positive contributor


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

    # ── IC-grade additions ──────────────────────────────────────────────
    ranked_drivers: list[DriverRank] = Field(default_factory=list)
    primary_driver: str = ""           # name of top positive contributor
    operational_value_pct: float = 0.0  # revenue + margin % of gain
    financial_engineering_pct: float = 0.0  # multiple + deleveraging % of gain

    # Structured insight text (data-derived, not generic AI text)
    insight_primary_driver: str = ""     # "Returns are primarily driven by X (Y%)"
    insight_weak_thesis: str = ""        # set if operational < 20% of gain
    insight_overreliance_multiple: str = ""  # set if multiple > 40% of gain


# ── Fragility Engine ──────────────────────────────────────────────────────

class FragilityStressResult(BaseModel):
    """IRR/MOIC outcome for a single stress scenario."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str = ""           # "growth_shock" | "margin_shock" | "multiple_shock" | "combined"
    description: str = ""   # human-readable parameter change
    irr: Optional[float] = None
    moic: float = 0.0
    delta_irr: Optional[float] = None   # stressed IRR − base IRR (negative = worse)
    delta_moic: float = 0.0             # stressed MOIC − base MOIC


class FragilityAnalysis(BaseModel):
    """Fragility engine output: stress tests + score + classification."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    base_irr: Optional[float] = None
    base_moic: float = 0.0
    stress_scenarios: list[FragilityStressResult] = Field(default_factory=list)

    # Fragility score = combined IRR drop / base IRR
    fragility_score: float = 0.0
    classification: str = ""    # "Robust" | "Moderate Risk" | "Fragile"
    dominant_stress_driver: str = ""   # which individual shock hurts most

    # Structured insight strings (derived strictly from model data)
    insight_irr_drop: str = ""         # "IRR drops from X% → Y% under mild stress"
    insight_dominant_driver: str = ""  # "X% of combined downside from [driver]"
    insight_classification: str = ""   # classification with numeric backing


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
        "post_recap_leverage_excessive",
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


# ── Sources & Uses ────────────────────────────────────────────────────────

class DebtSource(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    name: str = ""
    amount: float = 0.0


class SourcesAndUses(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    enterprise_value: float = 0.0
    transaction_fees: float = 0.0
    financing_fees: float = 0.0
    cash_to_balance_sheet: float = 0.0
    total_uses: float = 0.0
    debt_sources: list[DebtSource] = Field(default_factory=list)
    total_debt: float = 0.0
    rollover_equity: float = 0.0
    sponsor_equity: float = 0.0
    total_sources: float = 0.0
    equity_pct_of_total: float = 0.0
    debt_pct_of_total: float = 0.0
    implied_leverage: float = 0.0


# ── Credit Analysis ──────────────────────────────────────────────────────

class CreditMetricsYear(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    year: int = 0
    fccr: float = 0.0
    interest_coverage: float = 0.0
    dscr: float = 0.0
    leverage: float = 0.0
    senior_leverage: float = 0.0
    total_debt: float = 0.0
    cumulative_debt_paydown: float = 0.0
    debt_paydown_pct: float = 0.0


class RecoveryTranche(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    tranche: str = ""
    recovery_pct: float = 0.0


class CreditAnalysis(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    metrics_by_year: list[CreditMetricsYear] = Field(default_factory=list)
    max_debt_capacity_at_4x: float = 0.0
    max_debt_capacity_at_5x: float = 0.0
    max_debt_capacity_at_6x: float = 0.0
    covenant_headroom_by_year: list[float] = Field(default_factory=list)
    refinancing_risk: bool = False
    refinancing_risk_detail: str = ""
    recovery_waterfall: list[RecoveryTranche] = Field(default_factory=list)
    credit_rating_estimate: str = ""


# ── EBITDA Bridge ────────────────────────────────────────────────────────

class EBITDABridge(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    entry_ebitda: float = 0.0
    organic_revenue_contribution: float = 0.0
    margin_expansion_contribution: float = 0.0
    cost_synergies: float = 0.0
    add_on_ebitda: float = 0.0
    integration_costs: float = 0.0
    monitoring_fees: float = 0.0
    exit_ebitda: float = 0.0


# ── Revenue Segments ─────────────────────────────────────────────────────

class RevenueSegment(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str = ""
    base_revenue: float = 0.0
    growth_rates: list[float] = Field(default_factory=list)
    margin_override: Optional[float] = None


# ── Add-On Acquisitions ──────────────────────────────────────────────────

class AddOnAcquisition(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str = ""
    year: int = 1
    revenue: float = 0.0
    ebitda_margin: float = 0.2
    purchase_multiple: float = 8.0
    funding: Literal["debt", "equity", "mixed"] = "equity"
    debt_pct: float = 0.0
    synergy_revenue: float = 0.0
    synergy_cost: float = 0.0
    integration_cost: float = 0.0


# ── Chat ──────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    role: Literal["user", "assistant"] = "user"
    content: str = ""
    timestamp: Optional[str] = None
    assumption_updates: Optional[dict] = None
    analysis: Optional[dict] = None
