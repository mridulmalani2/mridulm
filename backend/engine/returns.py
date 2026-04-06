"""Returns calculator (IRR, MOIC, bridge) and value driver decomposition — Sections 3.4 & 3.5."""

from __future__ import annotations

import logging
import warnings
from typing import Optional

from backend.models.debt import DebtSchedule
from backend.models.outputs import (
    AnnualProjection,
    DriverRank,
    Returns,
    ValueDriverDecomposition,
)
from backend.models.state import ModelState

logger = logging.getLogger(__name__)


# ── IRR Solver ────────────────────────────────────────────────────────────

def _solve_irr(cashflows: list[float]) -> Optional[float]:
    """Solve IRR using numpy-financial, falling back to scipy newton then brentq."""
    if not cashflows or all(cf >= 0 for cf in cashflows) or all(cf <= 0 for cf in cashflows):
        return None

    # Try numpy-financial first
    try:
        import numpy_financial as npf
        result = npf.irr(cashflows)
        if result is not None and not (result != result):  # NaN check
            return float(result)
    except Exception:
        pass

    # Fallback: scipy newton
    try:
        from scipy.optimize import newton

        def npv_func(r):
            return sum(cf / (1 + r) ** t for t, cf in enumerate(cashflows))

        def npv_deriv(r):
            return sum(-t * cf / (1 + r) ** (t + 1) for t, cf in enumerate(cashflows))

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            result = newton(npv_func, x0=0.1, fprime=npv_deriv, maxiter=200, tol=1e-10)
            if result is not None and -0.999 <= result <= 100.0:
                return float(result)
    except Exception:
        pass

    # Fallback: scipy brentq
    try:
        from scipy.optimize import brentq

        def npv_func(r):
            return sum(cf / (1 + r) ** t for t, cf in enumerate(cashflows))

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            result = brentq(npv_func, -0.999, 100.0, maxiter=500)
            return float(result)
    except Exception:
        pass

    return None


def _solve_irr_timed(cashflows: list[float], times: list[float]) -> Optional[float]:
    """Solve IRR with arbitrary time vectors: sum(cf_i / (1+r)^t_i) = 0.

    Supports mid-year convention where cash flows occur at fractional periods.
    Falls back from Newton-Raphson to brentq.
    """
    if not cashflows or all(cf >= 0 for cf in cashflows) or all(cf <= 0 for cf in cashflows):
        return None
    if len(cashflows) != len(times):
        return None

    # Newton-Raphson with analytical derivative
    try:
        r = 0.1
        for _ in range(200):
            npv = sum(cf / (1 + r) ** t for cf, t in zip(cashflows, times))
            dnpv = sum(-t * cf / (1 + r) ** (t + 1) for cf, t in zip(cashflows, times))
            if abs(dnpv) < 1e-15:
                break
            step = npv / dnpv
            r -= step
            if abs(step) < 1e-10 and -0.999 <= r <= 100.0:
                return float(r)
        if -0.999 <= r <= 100.0:
            npv = sum(cf / (1 + r) ** t for cf, t in zip(cashflows, times))
            if abs(npv) < 0.01:
                return float(r)
    except Exception:
        pass

    # Fallback: brentq
    try:
        from scipy.optimize import brentq

        def npv_func(r):
            return sum(cf / (1 + r) ** t for cf, t in zip(cashflows, times))

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            result = brentq(npv_func, -0.999, 100.0, maxiter=500)
            return float(result)
    except Exception:
        pass

    return None


def _build_time_vector(hp: int, mid_year: bool) -> list[float]:
    """Build time vector for IRR cash flows.

    Standard:  [0, 1, 2, ..., hp]
    Mid-year:  [0, 0.5, 1.5, ..., hp-0.5]  (entry at t=0, annual CFs at mid-year)
    """
    if mid_year:
        return [0.0] + [t + 0.5 for t in range(hp)]
    return [float(t) for t in range(hp + 1)]


def _solve_irr_auto(cashflows: list[float], times: list[float] | None) -> Optional[float]:
    """Use timed solver if times provided, else standard solver."""
    if times is not None:
        return _solve_irr_timed(cashflows, times)
    return _solve_irr(cashflows)


# ── Returns Calculation ───────────────────────────────────────────────────

def calculate_returns(
    state: ModelState,
    projections: AnnualProjection,
    debt_schedule: DebtSchedule,
) -> Returns:
    """Calculate equity IRR, MOIC, gross/levered/unlevered IRR per Section 3.4."""
    hp = state.exit.holding_period
    mid_year = state.exit.mid_year_convention
    times = _build_time_vector(hp, mid_year) if mid_year else None

    # Entry equity = EV + all upfront fees (advisory % EV, txn costs, financing fees) - debt
    entry_fee = state.fees.entry_fee_pct * state.entry.enterprise_value
    financing_fees = state.fees.financing_fee_pct * state.entry.total_debt_raised
    entry_equity = (
        state.entry.enterprise_value
        + entry_fee
        + state.fees.transaction_costs
        + financing_fees
        - state.entry.total_debt_raised
    )

    if entry_equity <= 0:
        return Returns(
            entry_equity=entry_equity,
            irr_convergence_failed=True,
        )

    # Exit calculations
    exit_yr = projections.years[-1] if projections.years else None
    exit_ebitda = exit_yr.ebitda_adj if exit_yr else 0.0
    exit_ev = exit_ebitda * state.exit.exit_ebitda_multiple
    exit_net_debt = debt_schedule.total_debt_by_year[-1] if debt_schedule.total_debt_by_year else 0.0
    exit_fee = state.fees.exit_fee_pct * exit_ev

    # MIP payout
    exit_equity_pre_mip = exit_ev - exit_net_debt - exit_fee
    gross_moic = exit_equity_pre_mip / entry_equity if entry_equity > 0 else 0.0

    if gross_moic >= state.mip.hurdle_moic:
        mip_payout = state.mip.mip_pool_pct * exit_equity_pre_mip
    else:
        mip_payout = 0.0

    exit_equity = exit_equity_pre_mip - mip_payout

    # ── Interim distributions (dividend recaps) ──
    distributions = state.exit.interim_distributions[:hp] if state.exit.interim_distributions else [0.0] * hp
    while len(distributions) < hp:
        distributions.append(0.0)
    total_distributions = sum(distributions)

    # MOIC includes all distributions
    moic = (exit_equity + total_distributions) / entry_equity if entry_equity > 0 else 0.0

    # DPI by year (cumulative distributions / entry equity)
    dpi_by_year: list[float] = []
    cumul_dist = 0.0
    for d in distributions:
        cumul_dist += d
        dpi_by_year.append(cumul_dist / entry_equity if entry_equity > 0 else 0.0)

    # RVPI by year (residual value / entry equity — estimated from projected exit)
    rvpi_by_year: list[float] = []
    for yr_idx in range(hp):
        if yr_idx == hp - 1:
            rvpi_by_year.append(0.0)  # at exit, RVPI = 0
        else:
            # Estimate residual from projected EBITDA at that year
            proj_yr = projections.years[yr_idx] if yr_idx < len(projections.years) else None
            if proj_yr:
                est_ev = proj_yr.ebitda_adj * state.exit.exit_ebitda_multiple
                est_debt = debt_schedule.total_debt_by_year[yr_idx] if yr_idx < len(debt_schedule.total_debt_by_year) else 0.0
                est_equity = max(0.0, est_ev - est_debt)
                rvpi_by_year.append(est_equity / entry_equity if entry_equity > 0 else 0.0)
            else:
                rvpi_by_year.append(0.0)

    # ── Equity IRR (post-fees, post-MIP, with distributions) ──
    equity_cfs: list[float] = [-entry_equity]
    for yr_idx in range(hp):
        dist = distributions[yr_idx]
        if yr_idx == hp - 1:
            equity_cfs.append(exit_equity + dist)
        else:
            equity_cfs.append(dist)
    irr = _solve_irr_auto(equity_cfs, times)

    # ── Levered pre-fee IRR (equity IRR before entry/exit fees and MIP) ──
    entry_equity_levered = state.entry.enterprise_value - state.entry.total_debt_raised

    exit_equity_levered = exit_ev - exit_net_debt  # no exit fee, no MIP
    levered_cfs = [-entry_equity_levered]
    for yr_idx in range(hp):
        dist = distributions[yr_idx]
        if yr_idx == hp - 1:
            levered_cfs.append(exit_equity_levered + dist)
        else:
            levered_cfs.append(dist)
    irr_levered = _solve_irr_auto(levered_cfs, times) if entry_equity_levered > 0 else None

    # ── Gross IRR (before carry/MIP but after deal-level fees) ──
    exit_equity_gross = exit_ev - exit_net_debt - exit_fee  # after exit fee, before MIP
    gross_cfs = [-entry_equity]
    for yr_idx in range(hp):
        dist = distributions[yr_idx]
        if yr_idx == hp - 1:
            gross_cfs.append(exit_equity_gross + dist)
        else:
            gross_cfs.append(dist)
    irr_gross = _solve_irr_auto(gross_cfs, times) if entry_equity > 0 else None

    # ── Unlevered IRR ──
    entry_cost_unlev = state.entry.enterprise_value + state.fees.transaction_costs
    unlev_cfs: list[float] = [-entry_cost_unlev]
    for yr in projections.years[:-1]:
        unlev_cfs.append(yr.fcf_pre_debt)
    # Final year includes exit
    if projections.years:
        last_yr = projections.years[-1]
        unlev_cfs.append(last_yr.fcf_pre_debt + exit_ev - exit_fee)
    irr_unlevered = _solve_irr_auto(unlev_cfs, times)

    # Payback years
    cumulative = 0.0
    payback = float(hp)
    for t, cf in enumerate(equity_cfs):
        cumulative += cf
        if cumulative >= 0 and t > 0:
            payback = float(t)
            break

    # Cash yield (average annual FCF to equity / entry equity)
    total_fcf_eq = sum(yr.fcf_to_equity for yr in projections.years)
    cash_yield_avg = (total_fcf_eq / hp) / entry_equity if entry_equity > 0 and hp > 0 else 0.0

    return Returns(
        irr=irr,
        moic=moic,
        dpi=dpi_by_year[-1] if dpi_by_year else moic,
        rvpi=0.0,
        cash_yield_avg=cash_yield_avg,
        payback_years=payback,
        irr_gross=irr_gross,
        irr_levered=irr_levered,
        irr_unlevered=irr_unlevered,
        irr_convergence_failed=irr is None,
        entry_equity=entry_equity,
        exit_equity=exit_equity,
        exit_ev=exit_ev,
        exit_net_debt=exit_net_debt,
        mip_payout=mip_payout,
        total_distributions=total_distributions,
        dpi_by_year=dpi_by_year,
        rvpi_by_year=rvpi_by_year,
    )


# ── Value Driver Decomposition ────────────────────────────────────────────

def decompose_value_drivers(
    state: ModelState,
    projections: AnnualProjection,
    debt_schedule: DebtSchedule,
    returns: Returns,
) -> ValueDriverDecomposition:
    """Isolate contribution of each value creation lever per Section 3.5."""
    entry_ev = state.entry.enterprise_value
    entry_margin = state.margins.base_ebitda_margin
    entry_multiple = state.entry.entry_ebitda_multiple
    exit_multiple = state.exit.exit_ebitda_multiple

    exit_yr = projections.years[-1] if projections.years else None
    exit_revenue = exit_yr.revenue if exit_yr else 0.0
    # Use adjusted margin (ebitda_adj/revenue) so bridge is consistent with actual exit_ev
    exit_ebitda_adj = exit_yr.ebitda_adj if exit_yr else 0.0
    exit_margin_adj = exit_ebitda_adj / exit_revenue if exit_revenue > 0 else entry_margin

    entry_equity = returns.entry_equity
    exit_equity = returns.exit_equity
    exit_ev = returns.exit_ev  # = exit_ebitda_adj × exit_multiple

    # Step 1 — Revenue growth contribution
    hypo_ev_rev_growth = exit_revenue * entry_margin * entry_multiple
    delta_rev = hypo_ev_rev_growth - entry_ev

    # Step 2 — Margin expansion (includes monitoring fee effect)
    hypo_ev_margin = exit_revenue * exit_margin_adj * entry_multiple
    delta_margin = hypo_ev_margin - hypo_ev_rev_growth

    # Step 3 — Multiple expansion
    delta_multiple = exit_ev - hypo_ev_margin

    # Step 4 — Debt paydown
    entry_net_debt = state.entry.total_debt_raised
    exit_net_debt = returns.exit_net_debt
    delta_debt = entry_net_debt - exit_net_debt

    # Step 5 — Fees drag
    entry_fee_abs = state.fees.entry_fee_pct * state.entry.enterprise_value
    financing_fees = state.fees.financing_fee_pct * state.entry.total_debt_raised
    exit_fee = state.fees.exit_fee_pct * exit_ev
    fees_drag = entry_fee_abs + state.fees.transaction_costs + financing_fees + exit_fee + returns.mip_payout

    total_gain = exit_equity + returns.total_distributions - entry_equity

    # Reconciliation
    computed_gain = delta_rev + delta_margin + delta_multiple + delta_debt - fees_drag + returns.total_distributions
    recon_delta = abs(computed_gain - total_gain)
    if recon_delta > 0.01:
        logger.warning(
            "Value bridge reconciliation gap: £%.2fm (computed=%.2f, actual=%.2f)",
            recon_delta,
            computed_gain,
            total_gain,
        )

    def pct(x: float) -> float:
        return (x / total_gain * 100.0) if total_gain != 0 else 0.0

    # ── Ranked driver bridge ──────────────────────────────────────────────
    raw_drivers = [
        ("Revenue Growth",      delta_rev),
        ("Margin Expansion",    delta_margin),
        ("Multiple Expansion",  delta_multiple),
        ("Deleveraging",        delta_debt),
        ("Fees & Leakage",      -fees_drag),
    ]
    # Sort positives descending, negatives last
    positive = sorted(
        [(n, v) for n, v in raw_drivers if v > 0], key=lambda x: -x[1]
    )
    negatives = [(n, v) for n, v in raw_drivers if v <= 0]
    ordered = positive + negatives

    ranked_drivers = [
        DriverRank(
            name=name,
            abs_contribution=value,
            pct_of_gain=pct(value),
            rank=i + 1,
        )
        for i, (name, value) in enumerate(ordered)
    ]

    primary_driver = ordered[0][0] if ordered else ""

    # Operational value = revenue + margin; financial engineering = multiple + debt
    operational_pct = pct(delta_rev) + pct(delta_margin)
    financial_pct = pct(delta_multiple) + pct(delta_debt)

    # ── IC-level insight text (data-derived, no generic statements) ──────
    top_pct = pct(ordered[0][1]) if ordered else 0.0
    insight_primary = (
        f"Returns are primarily driven by {primary_driver} ({top_pct:.0f}% of equity gain). "
        f"Revenue growth: {pct(delta_rev):.0f}%, margin expansion: {pct(delta_margin):.0f}%, "
        f"multiple expansion: {pct(delta_multiple):.0f}%, deleveraging: {pct(delta_debt):.0f}%."
    ) if total_gain != 0 else ""

    insight_weak_thesis = ""
    if total_gain > 0 and operational_pct < 20.0:
        insight_weak_thesis = (
            f"Only {operational_pct:.0f}% of value creation is operational (revenue + margin). "
            f"This deal is financial-engineering heavy — {financial_pct:.0f}% from multiple expansion "
            f"and deleveraging. Returns are highly sensitive to exit conditions."
        )

    insight_overreliance_multiple = ""
    mult_pct = pct(delta_multiple)
    if mult_pct > 40.0:
        insight_overreliance_multiple = (
            f"Multiple expansion contributes {mult_pct:.0f}% of equity gain. "
            f"A 1x compression in exit multiple from {exit_multiple:.1f}x would materially reduce returns. "
            f"Exit risk is elevated — validate buyer universe at this multiple."
        )

    return ValueDriverDecomposition(
        revenue_growth_contribution_pct=pct(delta_rev),
        margin_expansion_contribution_pct=pct(delta_margin),
        multiple_expansion_contribution_pct=pct(delta_multiple),
        debt_paydown_contribution_pct=pct(delta_debt),
        fees_drag_contribution_pct=pct(-fees_drag),
        revenue_growth_contribution_abs=delta_rev,
        margin_expansion_contribution_abs=delta_margin,
        multiple_expansion_contribution_abs=delta_multiple,
        debt_paydown_contribution_abs=delta_debt,
        fees_drag_contribution_abs=-fees_drag,
        entry_equity=entry_equity,
        exit_equity=exit_equity,
        total_equity_gain=total_gain,
        reconciliation_delta=recon_delta,
        ranked_drivers=ranked_drivers,
        primary_driver=primary_driver,
        operational_value_pct=operational_pct,
        financial_engineering_pct=financial_pct,
        insight_primary_driver=insight_primary,
        insight_weak_thesis=insight_weak_thesis,
        insight_overreliance_multiple=insight_overreliance_multiple,
    )
