"""Year-by-year balance sheet (refactor plan P3-1) — Python mirror.

The statement closes BY CONSTRUCTION when the engine's flows are mutually
consistent: every flow that moves cash also moves an offsetting balance-sheet
account. `balance_check` is therefore a genuine integrity test. The opening
balance sheet is anchored with goodwill as the purchase-accounting residual,
exactly as a real LBO opening balance sheet is built.

This mirrors lib/engine/balanceSheet.ts. It relies on the cash roll-forward
being a levered cash flow (NI-based, capturing the interest tax shield) — see
debt_schedule.py — without which a balance sheet cannot close.
"""

from __future__ import annotations

from backend.models.debt import DebtSchedule
from backend.models.outputs import (
    AnnualProjection,
    BalanceSheet,
    BalanceSheetYear,
    Returns,
)
from backend.models.state import ModelState

_CLOSE_TOLERANCE = 0.01  # £m


def compute_balance_sheet(
    state: ModelState,
    projections: AnnualProjection,
    debt_schedule: DebtSchedule,
    returns: Returns,
) -> BalanceSheet:
    hp = state.exit.holding_period
    financing_fees = state.fees.financing_fee_pct * state.entry.total_debt_raised
    monitoring = state.fees.monitoring_fee_annual

    # ── Opening balances (t = 0) ──
    from backend.engine.projections import _nwc_balance

    entry_equity = returns.entry_equity
    opening_debt = state.entry.total_debt_raised
    opening_cash = 0.0
    # Entry NWC under the active method (days-based or revenue peg); cumulative ΔNWC
    # telescopes onto this opening level (P4-9).
    opening_nwc = _nwc_balance(state.revenue.base_revenue, state.margins.base_ebitda_margin, state.margins)
    opening_ppe = 0.0
    opening_def_fin = financing_fees
    # Goodwill closes the opening balance sheet (purchase-accounting residual).
    opening_goodwill = (
        (opening_debt + entry_equity)
        - opening_cash
        - opening_nwc
        - opening_ppe
        - opening_def_fin
    )

    years: list[BalanceSheetYear] = []
    cum_ni = 0.0
    cum_dist = 0.0
    cum_monitoring = 0.0
    cum_dnwc = 0.0
    cum_capex_less_da = 0.0
    cum_fin_amort = 0.0
    cum_refi_premium = 0.0
    max_abs = 0.0

    dist_paid = debt_schedule.distributions_paid_by_year or []
    refi_premium = debt_schedule.refinancing_premium_by_year or []
    cash_by_year = debt_schedule.cash_balance_by_year or []
    debt_by_year = debt_schedule.total_debt_by_year or []

    for i in range(hp):
        if i >= len(projections.years):
            break
        yr = projections.years[i]

        cum_ni += yr.net_income
        cum_dnwc += yr.delta_nwc
        cum_capex_less_da += yr.total_capex - yr.da
        cum_fin_amort += yr.financing_fee_amort
        cum_dist += dist_paid[i] if i < len(dist_paid) else 0.0
        cum_monitoring += monitoring
        cum_refi_premium += refi_premium[i] if i < len(refi_premium) else 0.0

        cash = cash_by_year[i] if i < len(cash_by_year) else 0.0
        net_working_capital = opening_nwc + cum_dnwc
        net_ppe = opening_ppe + cum_capex_less_da
        deferred_financing_costs = max(0.0, opening_def_fin - cum_fin_amort)
        goodwill = opening_goodwill
        total_assets = cash + net_working_capital + net_ppe + deferred_financing_costs + goodwill

        total_debt = debt_by_year[i] if i < len(debt_by_year) else 0.0
        deferred_tax_liability = 0.0  # not modelled (no book/tax depreciation timing)
        total_liabilities = total_debt + deferred_tax_liability

        # Equity = contributed + retained earnings − distributions − monitoring fees.
        # Monitoring is a sponsor-level cash cost not routed through the P&L, so it is
        # charged to equity to keep the statements consistent.
        shareholders_equity = entry_equity + cum_ni - cum_dist - cum_monitoring - cum_refi_premium
        total_liabilities_and_equity = total_liabilities + shareholders_equity

        check = total_assets - total_liabilities_and_equity
        max_abs = max(max_abs, abs(check))

        years.append(BalanceSheetYear(
            year=i + 1,
            cash=cash,
            net_working_capital=net_working_capital,
            net_ppe=net_ppe,
            deferred_financing_costs=deferred_financing_costs,
            goodwill=goodwill,
            total_assets=total_assets,
            total_debt=total_debt,
            deferred_tax_liability=deferred_tax_liability,
            total_liabilities=total_liabilities,
            shareholders_equity=shareholders_equity,
            total_liabilities_and_equity=total_liabilities_and_equity,
            balance_check=check,
            is_balanced=abs(check) < _CLOSE_TOLERANCE,
        ))

    return BalanceSheet(
        years=years,
        closes=all(y.is_balanced for y in years),
        max_abs_check=max_abs,
    )
