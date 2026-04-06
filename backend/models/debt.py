"""Debt-related Pydantic models: tranches, schedule years, aggregate schedule."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class DebtTranche(BaseModel):
    """A single debt tranche in the capital structure."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str = Field(default="Senior Term Loan A", description="Tranche identifier")
    tranche_type: str = Field(
        default="senior",
        description="Classification: senior|mezzanine|unitranche|revolver|pik_note",
    )
    principal: float = Field(default=0.0, ge=0, description="£m at entry")
    interest_rate: float = Field(
        default=0.05, ge=0, le=1.0, description="Annual rate (e.g. 0.07)"
    )
    rate_type: Literal["fixed", "floating"] = Field(default="fixed")
    base_rate: float = Field(
        default=0.0, ge=0, le=1.0, description="SOFR/EURIBOR if floating; 0 if fixed"
    )
    spread: float = Field(
        default=0.0, ge=0, le=1.0, description="Spread if floating; full rate if fixed"
    )
    amortization_type: Literal["bullet", "straight_line", "cash_sweep", "PIK"] = Field(
        default="bullet"
    )
    amortization_schedule: list[float] = Field(
        default_factory=list,
        description="Principal repayment per year (len = holding_period)",
    )
    pik_rate: float = Field(
        default=0.0, ge=0, le=1.0, description="PIK accrual rate; 0 unless PIK tranche"
    )
    cash_interest: bool = Field(
        default=True, description="False for PIK tranches"
    )
    commitment_fee: float = Field(
        default=0.0, ge=0, le=0.1, description="% of undrawn (0 for term loans)"
    )
    floor: float = Field(
        default=0.0, ge=0, le=1.0, description="Rate floor if floating"
    )
    cash_sweep_pct: float = Field(
        default=0.5, ge=0, le=1.0, description="% of excess CF swept to repay debt"
    )

    @field_validator("interest_rate")
    @classmethod
    def rate_sensible(cls, v: float) -> float:
        if v > 0.30:
            raise ValueError("Interest rate above 30% is unrealistic")
        return v

    @model_validator(mode="after")
    def pik_consistency(self) -> "DebtTranche":
        if self.amortization_type == "PIK":
            # PIK tranches must not pay cash interest
            self.cash_interest = False
            if self.pik_rate == 0.0:
                self.pik_rate = self.interest_rate
        return self


class DebtScheduleYear(BaseModel):
    """Single year output for a single tranche in the debt waterfall."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    year: int
    tranche_name: str
    beginning_balance: float = 0.0
    cash_interest: float = 0.0
    pik_accrual: float = 0.0
    scheduled_repayment: float = 0.0
    sweep_repayment: float = 0.0
    total_repayment: float = 0.0
    ending_balance: float = 0.0
    effective_rate: float = 0.0
    interest_tax_shield: float = 0.0
    commitment_fee_paid: float = 0.0


class DebtSchedule(BaseModel):
    """Aggregate debt schedule across all tranches and years."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    tranche_schedules: list[list[DebtScheduleYear]] = Field(
        default_factory=list,
        description="Outer list = tranches, inner list = years",
    )
    # Aggregate per-year metrics
    total_debt_by_year: list[float] = Field(default_factory=list)
    net_debt_by_year: list[float] = Field(default_factory=list)
    leverage_ratio_by_year: list[float] = Field(default_factory=list)
    interest_coverage_by_year: list[float] = Field(default_factory=list)
    dscr_by_year: list[float] = Field(default_factory=list)
    total_cash_interest_by_year: list[float] = Field(default_factory=list)
    total_repayment_by_year: list[float] = Field(default_factory=list)
    total_interest_tax_shield_by_year: list[float] = Field(default_factory=list)
