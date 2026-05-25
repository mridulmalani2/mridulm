"""Root ModelState and input-assumption Pydantic models."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .debt import DebtSchedule, DebtTranche
from .outputs import (
    AddOnAcquisition,
    AnnualProjection,
    BalanceSheet,
    ChatMessage,
    CreditAnalysis,
    EBITDABridge,
    ExitRealityCheck,
    FragilityAnalysis,
    FundReturns,
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


class MIPRatchetTier(BaseModel):
    """A single ratchet tier (P4-1)."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    moic_threshold: float = Field(default=2.0, ge=0, description="Pre-MIP MOIC at/above which this tier applies")
    irr_threshold: Optional[float] = Field(default=None, description="Optional dual hurdle on pre-MIP equity IRR")
    pool_pct: float = Field(default=0.15, ge=0, le=0.50, description="Pool % of pre-MIP exit equity at this tier")


class ManagementIncentive(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    mip_pool_pct: float = Field(default=0.15, ge=0, le=0.50, description="% of exit equity")
    hurdle_moic: float = Field(default=2.0, ge=1.0, le=10.0, description="MOIC threshold")
    vesting_years: int = Field(default=4, ge=0, le=10)
    sweet_equity_pct: float = Field(default=0.0, ge=0, le=0.20, description="% co-invest")
    ratchet_tiers: list[MIPRatchetTier] = Field(
        default_factory=list,
        description="Optional ratchet. When non-empty, the highest cleared tier's pool_pct "
                    "overrides the single-hurdle behaviour; absent ⇒ unchanged.",
    )


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
    nwc_explicit_by_year: list[float] = Field(
        default_factory=list,
        description="Per-year NWC movements (£m) used when nwc_movement_method == 'explicit'. Falls back to pct_change when empty.",
    )
    # Days-based NWC (P4-9). When any is set, NWC = A/R + Inventory − A/P from first
    # principles (A/R on revenue; Inventory/A/P on the cost base). None ⇒ nwc_pct_revenue.
    nwc_dso: Optional[float] = Field(default=None, description="Days sales outstanding")
    nwc_dio: Optional[float] = Field(default=None, description="Days inventory outstanding")
    nwc_dpo: Optional[float] = Field(default=None, description="Days payable outstanding")


class TaxAssumptions(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    tax_rate: float = Field(default=0.25, ge=0, le=0.60)
    tax_shield_on_interest: bool = True
    pik_interest_tax_deductible: bool = Field(
        default=True,
        description="Whether PIK interest is tax-deductible in the relevant jurisdiction.",
    )
    dtl_unwind_years: int = Field(default=0, ge=0, le=30)
    nol_carryforward: float = Field(default=0.0, ge=0)
    minimum_tax_rate: float = Field(default=0.0, ge=0, le=0.60)
    financing_fee_amort_years: int = Field(
        default=0,
        ge=0,
        le=30,
        description="Default tax amortization period for financing fees (years). 0 = use loan term/holding period.",
    )


class EntryAssumptions(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    enterprise_value: float = Field(default=0.0, ge=0, description="Entry EV £m")
    entry_ebitda_multiple: float = Field(default=10.0, ge=1.0, le=30.0)
    entry_revenue_multiple: float = Field(default=0.0, ge=0)
    net_debt_at_entry: float = Field(default=0.0, ge=0)
    equity_check: float = Field(
        default=0.0,
        description="Sponsor equity contribution (£m). = EV + sponsor-funded fees − debt raised. Renamed from prior misleading boolean-sounding name.",
    )
    initial_equity: float = Field(
        default=0.0,
        description="Alias of equity_check exposed under a clearer name; kept in sync.",
    )
    total_debt_raised: float = Field(default=0.0, ge=0)
    leverage_ratio: float = Field(default=4.0, ge=0, le=10.0)
    min_cash_balance: float = Field(default=0.0, ge=0, description="Minimum cash retained on BS (£m) — limits cash sweep")
    currency: Literal["GBP", "EUR", "USD", "CHF"] = "GBP"

    @field_validator("entry_ebitda_multiple")
    @classmethod
    def multiple_sensible(cls, v: float) -> float:
        if v > 30.0:
            raise ValueError("Entry multiple above 30x is unrealistic")
        return v


class PartialExitEvent(BaseModel):
    """Interim partial realisation / IPO selldown (P4-5)."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    year: int = Field(default=1, ge=1, description="1-indexed hold year (< holding_period)")
    pct_sold: float = Field(default=0.0, ge=0, le=1.0, description="Fraction of the CURRENT remaining stake sold")
    exit_multiple: float = Field(default=10.0, ge=0, description="EV/EBITDA applied at this event")
    exit_fee_pct: float = Field(default=0.0, ge=0, le=0.10, description="Advisory fee on this tranche's gross proceeds")


class ExitAssumptions(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    holding_period: int = Field(default=5, ge=1, le=10, description="Years")
    exit_ebitda_multiple: float = Field(default=10.0, ge=1.0, le=30.0)
    exit_revenue_multiple: float = Field(default=0.0, ge=0)
    exit_method: Literal[
        "strategic", "secondary_buyout", "ipo", "recapitalization"
    ] = "secondary_buyout"
    mid_year_convention: bool = Field(default=False, description="Discount CFs at t+0.5 (PE standard)")
    interim_distributions: list[float] = Field(
        default_factory=list,
        description="Per-year cash distributions to equity (£m). Dividend recaps, special dividends.",
    )
    exit_ev_override: Optional[float] = Field(
        default=None,
        description="Direct exit EV input (£m). If set, overrides exit_ebitda × exit_multiple.",
    )
    partial_exits: list[PartialExitEvent] = Field(
        default_factory=list,
        description="Optional interim partial realisations (IPO float / secondary selldown). "
                    "Empty ⇒ a single full exit (unchanged).",
    )
    exit_ebitda: float = Field(default=0.0, description="Derived from projection")
    exit_ev: float = Field(default=0.0, description="exit_ebitda x exit_multiple")
    exit_net_debt: float = Field(default=0.0)
    exit_equity: float = Field(default=0.0)
    mip_payout: float = Field(default=0.0)


class FundAssumptions(BaseModel):
    """Fund-level (LP-facing) economics overlay (P4-2)."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    management_fee_pct: float = Field(default=0.0, ge=0, le=0.05, description="% of basis per annum")
    management_fee_basis: Literal["committed", "invested"] = "invested"
    carry_rate: float = Field(default=0.20, ge=0, le=0.50)
    preferred_return: float = Field(default=0.08, ge=0, le=0.50)
    carry_waterfall: Literal["american", "european"] = "european"
    fund_size: float = Field(default=0.0, ge=0, description="Total LP commitments (£m)")
    deal_allocation_pct: float = Field(default=1.0, ge=0, le=1.0, description="This deal's share of the fund")


class CreditCovenants(BaseModel):
    """Covenant configuration (mirrors lib/dealEngineTypes.ts CreditCovenants)."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    leverage_covenant: float = Field(default=6.0, ge=0, description="Max net leverage (fallback scalar)")
    dscr_covenant: float = Field(default=1.25, ge=0, description="Min DSCR (fallback scalar)")
    fccr_covenant: float = Field(default=1.15, ge=0, description="Min FCCR (fallback scalar)")
    leverage_covenant_by_year: list[float] = Field(default_factory=list)
    dscr_covenant_by_year: list[float] = Field(default_factory=list)
    fccr_covenant_by_year: list[float] = Field(default_factory=list)
    # Cash trap / restricted-payment block (P4-13). None ⇒ distributions never blocked.
    distribution_block_leverage: Optional[float] = Field(default=None, description="Block distributions when leverage > this")
    distribution_block_dscr: Optional[float] = Field(default=None, description="Block distributions when DSCR < this")
    # Springing covenant (P4-8) — TS engine only; kept here for model parity.
    springing_dscr_covenant: Optional[float] = Field(default=None)
    springing_utilization_threshold: Optional[float] = Field(default=None)
    # Recovery haircuts (P4-10). None ⇒ defaults (40% EBITDA, 50% multiple, 10% costs).
    recovery_ebitda_haircut: Optional[float] = Field(default=None)
    recovery_multiple_haircut: Optional[float] = Field(default=None)
    recovery_distressed_cost_pct: Optional[float] = Field(default=None)


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
    fund_assumptions: Optional[FundAssumptions] = Field(
        default=None, description="Optional fund-level economics; when set, fund_returns is computed (P4-2)."
    )
    credit_covenants: CreditCovenants = Field(default_factory=CreditCovenants)

    # Revenue segments and add-on acquisitions
    revenue_segments: list[RevenueSegment] = Field(default_factory=list)
    add_on_acquisitions: list[AddOnAcquisition] = Field(default_factory=list)

    # Computed outputs
    projections: AnnualProjection = Field(default_factory=AnnualProjection)
    debt_schedule: DebtSchedule = Field(default_factory=DebtSchedule)
    returns: Returns = Field(default_factory=Returns)
    fund_returns: Optional[FundReturns] = Field(default=None, description="LP-facing overlay (P4-2)")
    value_drivers: ValueDriverDecomposition = Field(
        default_factory=ValueDriverDecomposition
    )
    sources_and_uses: SourcesAndUses = Field(default_factory=SourcesAndUses)
    credit_analysis: CreditAnalysis = Field(default_factory=CreditAnalysis)
    fragility_analysis: FragilityAnalysis = Field(default_factory=FragilityAnalysis)
    ebitda_bridge: EBITDABridge = Field(default_factory=EBITDABridge)
    balance_sheet: BalanceSheet = Field(default_factory=BalanceSheet)
    scenarios: list[ScenarioSet] = Field(default_factory=list)
    sensitivity_tables: list[SensitivityTable] = Field(default_factory=list)
    exit_reality_check: ExitRealityCheck = Field(default_factory=ExitRealityCheck)

    # AI state
    ai_overrides: dict[str, Any] = Field(default_factory=dict)
    ai_toggle_fields: list[str] = Field(default_factory=list)
    chat_history: list[ChatMessage] = Field(default_factory=list)

    # ── Derived-field computation ─────────────────────────────────

    def derive_entry_fields(self) -> None:
        """Compute derived entry fields from inputs (bidirectional EV ↔ multiple)."""
        ebitda = self.revenue.base_revenue * self.margins.base_ebitda_margin
        if ebitda > 0:
            implied_ev = ebitda * self.entry.entry_ebitda_multiple
            if self.entry.enterprise_value > 0 and abs(self.entry.enterprise_value - implied_ev) > 0.1:
                # EV was edited directly — back-solve multiple
                self.entry.entry_ebitda_multiple = self.entry.enterprise_value / ebitda
            else:
                # Multiple was edited (or first derivation) — forward-solve EV
                self.entry.enterprise_value = ebitda * self.entry.entry_ebitda_multiple
        elif self.entry.enterprise_value == 0 and ebitda > 0:
            self.entry.enterprise_value = ebitda * self.entry.entry_ebitda_multiple
        if self.entry.enterprise_value > 0 and self.revenue.base_revenue > 0:
            self.entry.entry_revenue_multiple = (
                self.entry.enterprise_value / self.revenue.base_revenue
            )
        # Total debt raised from tranches
        self.entry.total_debt_raised = sum(t.principal for t in self.debt_tranches)
        if ebitda > 0 and self.entry.total_debt_raised > 0:
            self.entry.leverage_ratio = self.entry.total_debt_raised / ebitda
        # Sponsor equity contribution — single source of truth lives in
        # sponsor_entry_equity_for(). Entry advisory fee is target-borne.
        self.entry.equity_check = self.sponsor_entry_equity_for(
            self.entry.enterprise_value, self.entry.total_debt_raised
        )
        self.entry.initial_equity = self.entry.equity_check

    def sponsor_entry_equity_for(self, enterprise_value: float, total_debt_raised: float) -> float:
        """Return the sponsor entry equity at a hypothetical EV / debt level.

        Single source of truth for the entry-equity formula — all callers
        (returns, scenarios, reality check, value bridge) should use this so
        they stay aligned with each other and with the audit-driven
        convention (entry advisory fee is target-borne, not sponsor-borne).
        """
        financing_fees = self.fees.financing_fee_pct * total_debt_raised
        return (
            enterprise_value
            + self.fees.transaction_costs
            + financing_fees
            - total_debt_raised
        )

    def compute_sources_and_uses(self) -> None:
        """Compute and populate SourcesAndUses — hard-checks Sources = Uses.

        Convention: entry advisory fee (entry_fee_pct × EV) is treated as a target-
        company-borne cost (sourced from existing company cash), not a sponsor
        equity outflow. Sponsor equity funds EV + transaction costs + financing
        fees less debt raised.
        """
        from .outputs import DebtSource, SourcesAndUses

        entry_advisory_fee = self.fees.entry_fee_pct * self.entry.enterprise_value
        financing_fees = self.fees.financing_fee_pct * self.entry.total_debt_raised
        total_transaction_fees = entry_advisory_fee + self.fees.transaction_costs

        total_uses = (
            self.entry.enterprise_value + total_transaction_fees + financing_fees
        )
        total_debt = self.entry.total_debt_raised
        # Sponsor equity excludes entry advisory fee (target-borne)
        sponsor_equity = max(
            0.0,
            self.entry.enterprise_value
            + self.fees.transaction_costs
            + financing_fees
            - total_debt,
        )
        # Cash from target balance sheet covers any residual gap (entry advisory fee)
        cash_from_company = max(0.0, total_uses - total_debt - sponsor_equity)
        total_sources = total_debt + sponsor_equity + cash_from_company

        ebitda = self.revenue.base_revenue * self.margins.base_ebitda_margin
        implied_leverage = total_debt / ebitda if ebitda > 0 else 0.0

        debt_sources = [
            DebtSource(name=t.name, amount=t.principal) for t in self.debt_tranches
        ]

        # Sources = Uses hard-check (log warning on gap > £0.01m)
        import logging
        recon = abs(total_sources - total_uses)
        if recon > 0.01:
            logging.getLogger(__name__).warning(
                "Sources & Uses imbalance: £%.2fm (sources=%.2f, uses=%.2f)",
                recon, total_sources, total_uses,
            )

        self.sources_and_uses = SourcesAndUses(
            enterprise_value=self.entry.enterprise_value,
            transaction_fees=total_transaction_fees,
            financing_fees=financing_fees,
            cash_to_balance_sheet=cash_from_company,
            total_uses=total_uses,
            debt_sources=debt_sources,
            total_debt=total_debt,
            rollover_equity=0.0,
            sponsor_equity=sponsor_equity,
            total_sources=total_sources,
            equity_pct_of_total=sponsor_equity / total_uses if total_uses > 0 else 0.0,
            debt_pct_of_total=total_debt / total_uses if total_uses > 0 else 0.0,
            implied_leverage=implied_leverage,
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
        self.exit.interim_distributions = _pad(
            self.exit.interim_distributions, 0.0, hp
        )

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
            # Bullets carry their balance to exit (repaid from sale proceeds): the
            # schedule stays all-zeros so the principal is captured in exit net debt,
            # not amortised from operating cash in the final modelled year.

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
