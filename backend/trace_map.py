"""Static dependency map for the Trace Graph feature.

MAINTENANCE NOTE: when the financial model engine is updated (returns.py,
projections.py, debt_schedule.py), update TRACE_MAP and ITERATIVE_FIELDS to
stay in sync. Failing to do so makes trace cards show stale formulas.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict

from backend.models.state import ModelState


# ── Iterative / circular fields ───────────────────────────────────────────────
# These are resolved via the 2-pass convergence loop in _full_recalc. TraceCards
# for these fields show a "converged via iteration" badge to warn users that the
# dependency is circular (interest → tax → cash → repayment → interest).
ITERATIVE_FIELDS: frozenset[str] = frozenset({
    "projections.interest",
    "projections.tax",
    "projections.nopat",
    "projections.fcf_pre_debt",
    "projections.fcf_to_equity",
    "projections.cash_balance",
    "debt_schedule.total_debt_at_exit",
})


# ── Pydantic models ───────────────────────────────────────────────────────────

class TraceEdge(BaseModel):
    """One side of a dependency edge — the connected field and its current value."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    field_path: str
    label: str
    value: Optional[float] = None
    linking_label: str = ""   # formatted display string: "£105.4m", "8.5x", "23.4%"


class TraceNode(BaseModel):
    """Full trace data for one model field."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    field_path: str
    label: str
    value: Optional[float] = None
    formula_symbolic: str
    is_user_input: bool
    converged_via_iteration: bool = False
    inputs: list[TraceEdge] = []
    outputs: list[TraceEdge] = []


# ── Static dependency map ─────────────────────────────────────────────────────
# Each entry: formula_symbolic, inputs (upstream), outputs (downstream), is_user_input

TRACE_MAP: dict[str, dict] = {
    # ── Returns ──────────────────────────────────────────────────────────────
    "returns.irr": {
        "label": "Equity IRR",
        "formula_symbolic": "solve r: Σ CF[tᵢ]/(1+r)^tᵢ = 0\n(t₀=0; tₙ=HP at year-end; interim at tₙ−0.5 when mid-year convention active)",
        "inputs": ["entry.equity_check", "exit.exit_equity", "exit.interim_distributions"],
        "outputs": [],
        "is_user_input": False,
    },
    "returns.moic": {
        "label": "Equity MOIC",
        "formula_symbolic": "(Exit Equity + Σ Distributions) / Entry Equity",
        "inputs": ["returns.entry_equity", "returns.exit_equity", "returns.total_distributions"],
        "outputs": [],
        "is_user_input": False,
    },
    "returns.entry_equity": {
        "label": "Entry Equity (Sponsor)",
        "formula_symbolic": "EV + Transaction Costs + Financing Fees − Total Debt\n(entry advisory fee is target-borne, excluded)",
        "inputs": ["entry.enterprise_value", "fees.transaction_costs", "fees.financing_fee_pct", "entry.total_debt_raised"],
        "outputs": ["returns.irr", "returns.moic"],
        "is_user_input": False,
    },
    "returns.exit_equity": {
        "label": "Exit Equity",
        "formula_symbolic": "Exit EV − Exit Net Debt − Exit Fee − MIP Payout",
        "inputs": ["returns.exit_ev", "returns.exit_net_debt", "fees.exit_fee_pct", "returns.mip_payout"],
        "outputs": ["returns.irr", "returns.moic"],
        "is_user_input": False,
    },
    "returns.exit_ev": {
        "label": "Exit EV",
        "formula_symbolic": "Exit EBITDA × Exit Multiple  [or exit_ev_override if set]",
        "inputs": ["exit.exit_ebitda", "exit.exit_ebitda_multiple"],
        "outputs": ["returns.exit_equity", "returns.mip_payout"],
        "is_user_input": False,
    },
    "returns.exit_net_debt": {
        "label": "Exit Net Debt",
        "formula_symbolic": "max(0, Gross Debt[HP] − max(Min Cash, Cash[HP]))",
        "inputs": ["debt_schedule.total_debt_at_exit", "debt_schedule.cash_balance_at_exit", "entry.min_cash_balance"],
        "outputs": ["returns.exit_equity"],
        "is_user_input": False,
    },
    "returns.mip_payout": {
        "label": "MIP Payout",
        "formula_symbolic": "MIP Pool % × (Exit EV − Exit Net Debt − Exit Fee)  [if gross MOIC ≥ hurdle, else 0]",
        "inputs": ["mip.mip_pool_pct", "mip.hurdle_moic", "returns.exit_ev", "returns.exit_net_debt", "fees.exit_fee_pct"],
        "outputs": ["returns.exit_equity"],
        "is_user_input": False,
    },
    "returns.total_distributions": {
        "label": "Total Interim Distributions",
        "formula_symbolic": "Σ Distributions[t=1..HP]",
        "inputs": ["exit.interim_distributions"],
        "outputs": ["returns.moic"],
        "is_user_input": False,
    },

    # ── Exit assumptions ──────────────────────────────────────────────────────
    "exit.exit_ebitda": {
        "label": "Exit EBITDA",
        "formula_symbolic": "Revenue[HP] × Margin[HP]",
        "inputs": ["projections.revenue", "projections.ebitda_margin"],
        "outputs": ["returns.exit_ev"],
        "is_user_input": False,
    },
    "exit.exit_ebitda_multiple": {
        "label": "Exit EV/EBITDA Multiple",
        "formula_symbolic": "user input",
        "inputs": [],
        "outputs": ["returns.exit_ev"],
        "is_user_input": True,
    },
    "exit.holding_period": {
        "label": "Holding Period (Years)",
        "formula_symbolic": "user input",
        "inputs": [],
        "outputs": ["returns.irr"],
        "is_user_input": True,
    },
    "exit.interim_distributions": {
        "label": "Interim Distributions (per year)",
        "formula_symbolic": "user input  (list, one per holding-period year)",
        "inputs": [],
        "outputs": ["returns.total_distributions"],
        "is_user_input": True,
    },
    "exit.mid_year_convention": {
        "label": "Mid-Year Convention",
        "formula_symbolic": "user input  (boolean: if true, interim CFs discounted at t−0.5; exit at t=HP)",
        "inputs": [],
        "outputs": ["returns.irr"],
        "is_user_input": True,
    },

    # ── Entry assumptions ─────────────────────────────────────────────────────
    "entry.enterprise_value": {
        "label": "Entry EV",
        "formula_symbolic": "Base EBITDA × Entry Multiple  [or direct EV input]",
        "inputs": ["revenue.base_revenue", "margins.base_ebitda_margin", "entry.entry_ebitda_multiple"],
        "outputs": ["returns.entry_equity"],
        "is_user_input": False,
    },
    "entry.equity_check": {
        "label": "Equity Check (Sponsor Equity)",
        "formula_symbolic": "EV + Transaction Costs + Financing Fees − Total Debt",
        "inputs": ["entry.enterprise_value", "fees.transaction_costs", "fees.financing_fee_pct", "entry.total_debt_raised"],
        "outputs": ["returns.irr", "returns.moic"],
        "is_user_input": False,
    },
    "entry.entry_ebitda_multiple": {
        "label": "Entry EV/EBITDA Multiple",
        "formula_symbolic": "user input",
        "inputs": [],
        "outputs": ["entry.enterprise_value"],
        "is_user_input": True,
    },
    "entry.total_debt_raised": {
        "label": "Total Debt Raised",
        "formula_symbolic": "Σ Tranche Principal[i]",
        "inputs": [],
        "outputs": ["entry.equity_check"],
        "is_user_input": False,
    },
    "entry.min_cash_balance": {
        "label": "Minimum Cash Balance",
        "formula_symbolic": "user input",
        "inputs": [],
        "outputs": ["returns.exit_net_debt"],
        "is_user_input": True,
    },

    # ── Revenue ───────────────────────────────────────────────────────────────
    "revenue.base_revenue": {
        "label": "LTM Revenue",
        "formula_symbolic": "user input",
        "inputs": [],
        "outputs": ["projections.revenue", "entry.enterprise_value"],
        "is_user_input": True,
    },
    "revenue.growth_rates": {
        "label": "Revenue Growth Rates (per year)",
        "formula_symbolic": "user input  (list of annual growth rates as decimals)",
        "inputs": [],
        "outputs": ["projections.revenue"],
        "is_user_input": True,
    },
    "projections.revenue": {
        "label": "Revenue[t]",
        "formula_symbolic": "Revenue[t−1] × (1 + Growth[t]) + Acquisition Revenue[t]",
        "inputs": ["revenue.base_revenue", "revenue.growth_rates", "revenue.acquisition_revenue"],
        "outputs": ["projections.ebitda", "exit.exit_ebitda"],
        "is_user_input": False,
    },

    # ── Margins ───────────────────────────────────────────────────────────────
    "margins.base_ebitda_margin": {
        "label": "Base EBITDA Margin",
        "formula_symbolic": "user input",
        "inputs": [],
        "outputs": ["projections.ebitda", "entry.enterprise_value"],
        "is_user_input": True,
    },
    "margins.target_ebitda_margin": {
        "label": "Target EBITDA Margin",
        "formula_symbolic": "user input",
        "inputs": [],
        "outputs": ["projections.ebitda"],
        "is_user_input": True,
    },

    # ── Projections ───────────────────────────────────────────────────────────
    "projections.ebitda": {
        "label": "EBITDA[t]",
        "formula_symbolic": "Revenue[t] × Margin[t]",
        "inputs": ["projections.revenue", "margins.base_ebitda_margin"],
        "outputs": ["projections.fcf_pre_debt", "exit.exit_ebitda"],
        "is_user_input": False,
    },
    "projections.ebitda_margin": {
        "label": "EBITDA Margin[t]",
        "formula_symbolic": "EBITDA[t] / Revenue[t]  (interpolated from base → target via trajectory)",
        "inputs": ["margins.base_ebitda_margin", "margins.target_ebitda_margin"],
        "outputs": ["projections.ebitda"],
        "is_user_input": False,
    },
    "projections.interest": {
        "label": "Interest Expense[t]",
        "formula_symbolic": "Σ Beginning Balance[tranche][t] × Rate[tranche]  [resolved via convergence loop]",
        "inputs": ["debt_schedule.total_debt_at_exit"],
        "outputs": ["projections.fcf_to_equity", "projections.tax"],
        "is_user_input": False,
    },
    "projections.fcf_pre_debt": {
        "label": "Unlevered FCF[t] (FCFF)",
        "formula_symbolic": "NOPAT[t] + D&A[t] − Capex[t] − ΔNWC[t] − Monitoring Fee\n(NOPAT = EBIT × (1 − effective tax rate))",
        "inputs": ["projections.ebitda", "projections.tax", "margins.da_pct_revenue", "margins.capex_pct_revenue", "margins.nwc_pct_revenue"],
        "outputs": ["returns.irr"],
        "is_user_input": False,
    },
    "projections.fcf_to_equity": {
        "label": "Levered FCF[t] (FCFE)",
        "formula_symbolic": "Net Income[t] + D&A[t] − Capex[t] − ΔNWC[t] + Net Borrowing[t] − Monitoring Fee",
        "inputs": ["projections.ebitda", "projections.interest", "projections.tax"],
        "outputs": ["returns.irr"],
        "is_user_input": False,
    },
    "projections.cash_balance": {
        "label": "Cash Balance[t]",
        "formula_symbolic": "Cash[t−1] + FCFF[t] − Cash Interest[t] − Repayment[t] + New Borrowing[t]",
        "inputs": ["projections.fcf_pre_debt", "projections.interest"],
        "outputs": ["returns.exit_net_debt"],
        "is_user_input": False,
    },

    # ── Debt schedule ─────────────────────────────────────────────────────────
    "debt_schedule.total_debt_at_exit": {
        "label": "Total Debt at Exit",
        "formula_symbolic": "Σ Ending Balance[tranche][HP]",
        "inputs": ["entry.total_debt_raised"],
        "outputs": ["returns.exit_net_debt"],
        "is_user_input": False,
    },
    "debt_schedule.interest_coverage_at_exit": {
        "label": "Interest Coverage at Exit",
        "formula_symbolic": "EBITDA[HP] / Total Cash Interest[HP]",
        "inputs": ["projections.ebitda", "projections.interest"],
        "outputs": [],
        "is_user_input": False,
    },

    # ── Fees ──────────────────────────────────────────────────────────────────
    "fees.exit_fee_pct": {
        "label": "Exit Fee %",
        "formula_symbolic": "user input  (% of exit EV)",
        "inputs": [],
        "outputs": ["returns.exit_equity", "returns.mip_payout"],
        "is_user_input": True,
    },
    "fees.financing_fee_pct": {
        "label": "Financing Fee %",
        "formula_symbolic": "user input  (% of total debt)",
        "inputs": [],
        "outputs": ["returns.entry_equity"],
        "is_user_input": True,
    },
    "fees.transaction_costs": {
        "label": "Transaction Costs",
        "formula_symbolic": "user input  (absolute £m)",
        "inputs": [],
        "outputs": ["returns.entry_equity"],
        "is_user_input": True,
    },

    # ── MIP ───────────────────────────────────────────────────────────────────
    "mip.mip_pool_pct": {
        "label": "MIP Pool %",
        "formula_symbolic": "user input  (% of exit equity)",
        "inputs": [],
        "outputs": ["returns.mip_payout"],
        "is_user_input": True,
    },
    "mip.hurdle_moic": {
        "label": "MIP Hurdle MOIC",
        "formula_symbolic": "user input  (gross MOIC threshold for MIP to vest)",
        "inputs": [],
        "outputs": ["returns.mip_payout"],
        "is_user_input": True,
    },

    # ── Value bridge (all formulas fully specified per Section 3.5) ───────────
    "value_drivers.revenue_growth_contribution_abs": {
        "label": "Revenue Growth Contribution",
        "formula_symbolic": "(Exit Revenue × Entry Margin × Entry Multiple) − Entry EV",
        "inputs": ["revenue.base_revenue", "exit.exit_ebitda", "margins.base_ebitda_margin", "entry.entry_ebitda_multiple", "entry.enterprise_value"],
        "outputs": [],
        "is_user_input": False,
    },
    "value_drivers.margin_expansion_contribution_abs": {
        "label": "Margin Expansion Contribution",
        "formula_symbolic": "Exit Revenue × (Exit Margin − Entry Margin) × Entry Multiple",
        "inputs": ["projections.ebitda", "projections.revenue", "margins.base_ebitda_margin", "entry.entry_ebitda_multiple"],
        "outputs": [],
        "is_user_input": False,
    },
    "value_drivers.multiple_expansion_contribution_abs": {
        "label": "Multiple Expansion Contribution",
        "formula_symbolic": "Exit Revenue × Exit Margin × (Exit Multiple − Entry Multiple)",
        "inputs": ["projections.ebitda", "exit.exit_ebitda_multiple", "entry.entry_ebitda_multiple"],
        "outputs": [],
        "is_user_input": False,
    },
    "value_drivers.debt_paydown_contribution_abs": {
        "label": "Debt Paydown Contribution",
        "formula_symbolic": "Entry Total Debt − Exit Net Debt",
        "inputs": ["entry.total_debt_raised", "returns.exit_net_debt"],
        "outputs": [],
        "is_user_input": False,
    },
    "value_drivers.fees_drag_contribution_abs": {
        "label": "Fees & Leakage Drag",
        "formula_symbolic": "−(Transaction Costs + Financing Fees + Exit Fee + MIP Payout)\n(entry advisory fee excluded — target-borne)",
        "inputs": ["fees.transaction_costs", "fees.financing_fee_pct", "fees.exit_fee_pct", "returns.mip_payout"],
        "outputs": [],
        "is_user_input": False,
    },
}


# ── Value resolver ─────────────────────────────────────────────────────────────

def _resolve_value(state: ModelState, field_path: str) -> Optional[float]:
    """Read the current numeric value for a trace field path from ModelState.

    Handles year-indexed notation: projections.revenue.3 → year 3 (1-indexed).
    Returns None for list-valued fields (e.g. exit.interim_distributions).
    """
    parts = field_path.split(".")

    # Year-indexed projection fields: projections.<metric>.<year>
    yr_override = None
    resolved_path = field_path
    if len(parts) == 3 and parts[0] == "projections" and parts[2].isdigit():
        yr_override = int(parts[2]) - 1  # convert 1-indexed to 0-indexed
        resolved_path = ".".join(parts[:2])

    years = state.projections.years
    if yr_override is not None:
        yr = years[yr_override] if 0 <= yr_override < len(years) else None
    else:
        yr = years[-1] if years else None

    ds = state.debt_schedule

    VALUE_MAP: dict[str, Optional[float]] = {
        # Returns
        "returns.irr": state.returns.irr,
        "returns.moic": state.returns.moic,
        "returns.entry_equity": state.returns.entry_equity,
        "returns.exit_equity": state.returns.exit_equity,
        "returns.exit_ev": state.returns.exit_ev,
        "returns.exit_net_debt": state.returns.exit_net_debt,
        "returns.mip_payout": state.returns.mip_payout,
        "returns.total_distributions": state.returns.total_distributions,
        # Exit
        "exit.exit_ebitda": state.exit.exit_ebitda,
        "exit.exit_ebitda_multiple": state.exit.exit_ebitda_multiple,
        "exit.holding_period": float(state.exit.holding_period),
        "exit.mid_year_convention": float(state.exit.mid_year_convention),
        "exit.interim_distributions": None,  # list — not a single float
        # Entry
        "entry.enterprise_value": state.entry.enterprise_value,
        "entry.equity_check": state.entry.equity_check,
        "entry.entry_ebitda_multiple": state.entry.entry_ebitda_multiple,
        "entry.total_debt_raised": state.entry.total_debt_raised,
        "entry.min_cash_balance": state.entry.min_cash_balance,
        # Revenue
        "revenue.base_revenue": state.revenue.base_revenue,
        "revenue.growth_rates": None,  # list
        "revenue.acquisition_revenue": None,  # list
        # Margins
        "margins.base_ebitda_margin": state.margins.base_ebitda_margin,
        "margins.target_ebitda_margin": state.margins.target_ebitda_margin,
        "margins.da_pct_revenue": state.margins.da_pct_revenue,
        "margins.capex_pct_revenue": state.margins.capex_pct_revenue,
        "margins.nwc_pct_revenue": state.margins.nwc_pct_revenue,
        # Projections (last year unless year-indexed)
        "projections.revenue": yr.revenue if yr else None,
        "projections.ebitda": yr.ebitda_adj if yr else None,
        "projections.ebitda_margin": yr.ebitda_margin if yr else None,
        "projections.interest": yr.interest_expense if yr else None,
        "projections.fcf_pre_debt": yr.fcf_pre_debt if yr else None,
        "projections.fcf_to_equity": yr.fcf_to_equity if yr else None,
        "projections.cash_balance": yr.cash_balance if yr else None,
        "projections.tax": yr.tax if yr else None,
        "projections.nopat": yr.nopat if yr else None,
        # Debt schedule
        "debt_schedule.total_debt_at_exit": ds.total_debt_by_year[-1] if ds.total_debt_by_year else None,
        "debt_schedule.cash_balance_at_exit": ds.cash_balance_by_year[-1] if ds.cash_balance_by_year else None,
        "debt_schedule.interest_coverage_at_exit": ds.interest_coverage_by_year[-1] if ds.interest_coverage_by_year else None,
        "debt_schedule.repayments": sum(ds.total_repayment_by_year) if ds.total_repayment_by_year else None,
        # Fees
        "fees.exit_fee_pct": state.fees.exit_fee_pct,
        "fees.financing_fee_pct": state.fees.financing_fee_pct,
        "fees.transaction_costs": state.fees.transaction_costs,
        # MIP
        "mip.mip_pool_pct": state.mip.mip_pool_pct,
        "mip.hurdle_moic": state.mip.hurdle_moic,
        # Value drivers
        "value_drivers.revenue_growth_contribution_abs": state.value_drivers.revenue_growth_contribution_abs,
        "value_drivers.margin_expansion_contribution_abs": state.value_drivers.margin_expansion_contribution_abs,
        "value_drivers.multiple_expansion_contribution_abs": state.value_drivers.multiple_expansion_contribution_abs,
        "value_drivers.debt_paydown_contribution_abs": state.value_drivers.debt_paydown_contribution_abs,
        "value_drivers.fees_drag_contribution_abs": state.value_drivers.fees_drag_contribution_abs,
    }
    return VALUE_MAP.get(resolved_path)


def _format_linking_label(value: Optional[float], field_path: str, currency: str = "GBP") -> str:
    """Format a field value for display on edge/chip labels."""
    if value is None:
        return "—"
    CURRENCY_SYMBOLS = {"GBP": "£", "EUR": "€", "USD": "$", "CHF": "CHF "}
    sym = CURRENCY_SYMBOLS.get(currency, "£")

    # Rate/percentage fields
    rate_fields = {
        "returns.irr", "margins.base_ebitda_margin", "margins.target_ebitda_margin",
        "projections.ebitda_margin", "fees.exit_fee_pct", "fees.financing_fee_pct",
        "mip.mip_pool_pct", "exit.mid_year_convention",
    }
    if any(f in field_path for f in ("margin", "rate", "pct", "irr", "yield", "growth")):
        return f"{value * 100:.1f}%"

    # Multiple fields
    if any(f in field_path for f in ("multiple", "moic", "hurdle", "coverage", "leverage", "dscr")):
        return f"{value:.1f}x"

    # Integer fields
    if "holding_period" in field_path:
        return f"{int(value)}yr"

    # Currency / monetary fields (default)
    return f"{sym}{abs(value):.1f}m"


def build_trace_node(state: ModelState, field_path: str) -> Optional[TraceNode]:
    """Build a TraceNode for a field path from the current ModelState.

    Handles year-indexed projection paths (e.g. projections.revenue.3).
    Returns None if the field_path is not in TRACE_MAP.
    """
    # Normalise year-indexed paths to base path for map lookup
    parts = field_path.split(".")
    map_key = field_path
    if len(parts) == 3 and parts[0] == "projections" and parts[2].isdigit():
        map_key = ".".join(parts[:2])

    entry = TRACE_MAP.get(map_key)
    if not entry:
        return None

    value = _resolve_value(state, field_path)
    currency = state.currency

    def _make_edge(fp: str) -> TraceEdge:
        v = _resolve_value(state, fp)
        edge_entry = TRACE_MAP.get(fp)
        lbl = edge_entry["label"] if edge_entry else fp
        return TraceEdge(
            field_path=fp,
            label=lbl,
            value=v,
            linking_label=_format_linking_label(v, fp, currency),
        )

    return TraceNode(
        field_path=field_path,
        label=entry["label"],
        value=value,
        formula_symbolic=entry["formula_symbolic"],
        is_user_input=entry["is_user_input"],
        converged_via_iteration=map_key in ITERATIVE_FIELDS,
        inputs=[_make_edge(fp) for fp in entry["inputs"]],
        outputs=[_make_edge(fp) for fp in entry["outputs"]],
    )


def changed_trace_fields(old: ModelState, new: ModelState) -> list[str]:
    """Return the TRACE_MAP field paths whose value changed between two states."""
    changed: list[str] = []
    for fp in TRACE_MAP:
        old_v = _resolve_value(old, fp)
        new_v = _resolve_value(new, fp)
        if old_v != new_v:
            changed.append(fp)
    return changed
