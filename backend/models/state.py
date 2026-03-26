"""Root ModelState and input-assumption Pydantic models."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .debt import DebtSchedule, DebtTranche
from .outputs import (
    AddOnAcquisition,
    AnnualProjection,
    ChatMessage,
    CreditAnalysis,
    EBITDABridge,
    ExitRealityCheck,
    Returns,
    RevenueSegment,
    ScenarioSet,
    SensitivityTable,
    SourcesAndUses,
    ValueDriverDecomposition,
)


class FeeStructure(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    entry_fee_pct: float = Field(default=0.02, ge=0, le=0.10, description="% of EV")
    exit_fee_pct: float = Field(default=0.015, ge=0, le=0.10, description="% of exit EV")
    monitoring_fee_annual: float = Field(default=0.0, ge=0, description="£m per year")
    financing_fee_pct: float = Field(default=0.02, ge=0, le=0.10, description="% of total debt")
    transaction_costs: float = Field(default=0.0, ge=0, description="Absolute £m")


class ManagementIncentive(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    mip_pool_pct: float = Field(default=0.15, ge=0, le=0.50, description="% of exit equity")
    hurdle_moic: float = Field(default=2.0, ge=1.0, le=10.0, description="MOIC threshold")
    vesting_years: int = Field(default=4, ge=0, le=10)
    sweet_equity_pct: float = Field(default=0.0, ge=0, le=0.20, description="% co-invest")


class RevenueAssumptions(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    base_revenue: float = Field(default=100.0, gt=0, description="LTM revenue £m")
    growth_rates: list[float] = Field(
        default_factory=lambda: [0.05] * 5,
        description="Per-year growth rates",
    )
    organic_growth: list[float] = Field(default_factory=list)
    acquisition_revenue: list[float] = Field(default_factory=list)
    churn_rate: float = Field(default=0.0, ge=0, le=1.0)

    @field_validator("base_revenue")
    @classmethod
    def revenue_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Revenue must be positive")
        return v


class MarginAssumptions(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    base_ebitda_margin: float = Field(default=0.20, ge=0, le=1.0)
    target_ebitda_margin: float = Field(default=0.25, ge=0, le=1.0)
    margin_trajectory: Literal[
        "linear", "front_loaded", "back_loaded", "step"
    ] = "linear"
    margin_by_year: list[float] = Field(default_factory=list)
    da_pct_revenue: float = Field(default=0.03, ge=0, le=0.50)
    capex_pct_revenue: float = Field(default=0.03, ge=0, le=0.50)
    growth_capex: list[float] = Field(default_factory=list)
    nwc_pct_revenue: float = Field(default=0.10, ge=0, le=0.50)
    nwc_movement_method: Literal["pct_change", "explicit"] = "pct_change"


class TaxAssumptions(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    tax_rate: float = Field(default=0.25, ge=0, le=0.60)
    tax_shield_on_interest: bool = True
    dtl_unwind_years: int = Field(default=0, ge=0, le=30)
    nol_carryforward: float = Field(default=0.0, ge=0)
    minimum_tax_rate: float = Field(default=0.0, ge=0, le=0.60)


class EntryAssumptions(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    enterprise_value: float = Field(default=0.0, ge=0, description="Entry EV £m")
    entry_ebitda_multiple: float = Field(default=10.0, ge=1.0, le=30.0)
    entry_revenue_multiple: float = Field(default=0.0, ge=0)
    net_debt_at_entry: float = Field(default=0.0, ge=0)
    equity_check: float = Field(default=0.0, description="Derived: EV - debt + fees")
    total_debt_raised: float = Field(default=0.0, ge=0)
    leverage_ratio: float = Field(default=4.0, ge=0, le=10.0)
    currency: Literal["GBP", "EUR", "USD", "CHF"] = "GBP"

    @field_validator("entry_ebitda_multiple")
    @classmethod
    def multiple_sensible(cls, v: float) -> float:
        if v > 30.0:
            raise ValueError("Entry multiple above 30x is unrealistic")
        return v


class ExitAssumptions(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    holding_period: int = Field(default=5, ge=1, le=10, description="Years")
    exit_ebitda_multiple: float = Field(default=10.0, ge=1.0, le=30.0)
    exit_revenue_multiple: float = Field(default=0.0, ge=0)
    exit_method: Literal[
        "strategic", "secondary_buyout", "ipo", "recapitalization"
    ] = "secondary_buyout"
    exit_ebitda: float = Field(default=0.0, description="Derived from projection")
    exit_ev: float = Field(default=0.0, description="exit_ebitda x exit_multiple")
    exit_net_debt: float = Field(default=0.0)
    exit_equity: float = Field(default=0.0)
    mip_payout: float = Field(default=0.0)


# ── Root ModelState ───────────────────────────────────────────────────────

class ModelState(BaseModel):
    """Single source of truth — the entire deal model lives here."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    # Metadata
    deal_name: str = "Untitled Deal"
    company_description: str = ""
    sector: str = "Industrials"
    currency: Literal["GBP", "EUR", "USD", "CHF"] = "GBP"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_modified: datetime = Field(default_factory=datetime.utcnow)
    version: int = 1

    # Core components
    revenue: RevenueAssumptions = Field(default_factory=RevenueAssumptions)
    margins: MarginAssumptions = Field(default_factory=MarginAssumptions)
    tax: TaxAssumptions = Field(default_factory=TaxAssumptions)
    entry: EntryAssumptions = Field(default_factory=EntryAssumptions)
    debt_tranches: list[DebtTranche] = Field(default_factory=list)
    fees: FeeStructure = Field(default_factory=FeeStructure)
    mip: ManagementIncentive = Field(default_factory=ManagementIncentive)
    exit: ExitAssumptions = Field(default_factory=ExitAssumptions)

    # Revenue segments and add-on acquisitions
    revenue_segments: list[RevenueSegment] = Field(default_factory=list)
    add_on_acquisitions: list[AddOnAcquisition] = Field(default_factory=list)

    # Computed outputs
    projections: AnnualProjection = Field(default_factory=AnnualProjection)
    debt_schedule: DebtSchedule = Field(default_factory=DebtSchedule)
    returns: Returns = Field(default_factory=Returns)
    value_drivers: ValueDriverDecomposition = Field(
        default_factory=ValueDriverDecomposition
    )
    sources_and_uses: SourcesAndUses = Field(default_factory=SourcesAndUses)
    credit_analysis: CreditAnalysis = Field(default_factory=CreditAnalysis)
    ebitda_bridge: EBITDABridge = Field(default_factory=EBITDABridge)
    scenarios: list[ScenarioSet] = Field(default_factory=list)
    sensitivity_tables: list[SensitivityTable] = Field(default_factory=list)
    exit_reality_check: ExitRealityCheck = Field(default_factory=ExitRealityCheck)

    # AI state
    ai_overrides: dict[str, Any] = Field(default_factory=dict)
    ai_toggle_fields: list[str] = Field(default_factory=list)
    chat_history: list[ChatMessage] = Field(default_factory=list)

    # ── Derived-field computation ─────────────────────────────────

    def derive_entry_fields(self) -> None:
        """Compute derived entry fields from inputs."""
        ebitda = self.revenue.base_revenue * self.margins.base_ebitda_margin
        if self.entry.enterprise_value == 0 and ebitda > 0:
            self.entry.enterprise_value = ebitda * self.entry.entry_ebitda_multiple
        if self.entry.enterprise_value > 0 and self.revenue.base_revenue > 0:
            self.entry.entry_revenue_multiple = (
                self.entry.enterprise_value / self.revenue.base_revenue
            )
        # Total debt raised from tranches
        self.entry.total_debt_raised = sum(t.principal for t in self.debt_tranches)
        if ebitda > 0 and self.entry.total_debt_raised > 0:
            self.entry.leverage_ratio = self.entry.total_debt_raised / ebitda
        # Equity check
        financing_fees = self.fees.financing_fee_pct * self.entry.total_debt_raised
        self.entry.equity_check = (
            self.entry.enterprise_value
            + self.fees.transaction_costs
            + financing_fees
            - self.entry.total_debt_raised
        )

    def ensure_list_lengths(self) -> None:
        """Pad per-year lists to match holding_period."""
        hp = self.exit.holding_period

        def _pad(lst: list[float], default: float, length: int) -> list[float]:
            if len(lst) < length:
                return lst + [default] * (length - len(lst))
            return lst[:length]

        self.revenue.growth_rates = _pad(self.revenue.growth_rates, 0.05, hp)
        self.revenue.organic_growth = _pad(self.revenue.organic_growth, 0.0, hp)
        self.revenue.acquisition_revenue = _pad(
            self.revenue.acquisition_revenue, 0.0, hp
        )
        self.margins.growth_capex = _pad(self.margins.growth_capex, 0.0, hp)

        # margin_by_year overrides trajectory if already populated with correct length
        if self.margins.margin_by_year and len(self.margins.margin_by_year) == hp:
            pass  # explicit override — use as-is
        else:
            self.margins.margin_by_year = self._build_margin_trajectory(hp)

        # Pad amortization schedules per tranche
        for tranche in self.debt_tranches:
            tranche.amortization_schedule = _pad(
                tranche.amortization_schedule, 0.0, hp
            )
            # Auto-build straight-line schedule if empty
            if (
                tranche.amortization_type == "straight_line"
                and sum(tranche.amortization_schedule) == 0
                and tranche.principal > 0
            ):
                annual = tranche.principal / hp
                tranche.amortization_schedule = [annual] * hp
            # Bullet: all principal in final year
            if (
                tranche.amortization_type == "bullet"
                and sum(tranche.amortization_schedule) == 0
                and tranche.principal > 0
            ):
                tranche.amortization_schedule = [0.0] * (hp - 1) + [tranche.principal]

    def _build_margin_trajectory(self, hp: int) -> list[float]:
        base = self.margins.base_ebitda_margin
        target = self.margins.target_ebitda_margin
        expansion = target - base
        traj = self.margins.margin_trajectory

        if traj == "linear":
            return [base + expansion * (t / hp) for t in range(1, hp + 1)]
        elif traj == "front_loaded":
            # 60% of expansion in first half
            mid = hp // 2 or 1
            front_share = 0.6
            margins = []
            for t in range(1, hp + 1):
                if t <= mid:
                    frac = front_share * (t / mid)
                else:
                    frac = front_share + (1 - front_share) * ((t - mid) / (hp - mid))
                margins.append(base + expansion * frac)
            return margins
        elif traj == "back_loaded":
            mid = hp // 2 or 1
            front_share = 0.4
            margins = []
            for t in range(1, hp + 1):
                if t <= mid:
                    frac = front_share * (t / mid)
                else:
                    frac = front_share + (1 - front_share) * ((t - mid) / (hp - mid))
                margins.append(base + expansion * frac)
            return margins
        elif traj == "step":
            # flat then jump halfway
            mid = hp // 2 or 1
            return [base if t <= mid else target for t in range(1, hp + 1)]
        return [base + expansion * (t / hp) for t in range(1, hp + 1)]
