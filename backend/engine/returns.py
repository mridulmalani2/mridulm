"""Returns calculator (IRR, MOIC, bridge) and value driver decomposition — Sections 3.4 & 3.5.

Audit-driven changes (audit_report.md, returns.py findings):
  * Entry equity convention: sponsor equity = EV + transaction costs +
    financing fees − debt raised. Entry advisory fee is treated as a target-
    company-borne cost (FINDING 1).
  * Gross MOIC excludes ALL sponsor-level fees (entry, exit, MIP), per the
    standard PE definition (FINDING 2).
  * RVPI subtracts modelled cash from estimated debt to use net debt
    (FINDING 3).
  * Mid-year time vector keeps interim cash flows at mid-year while exit
    happens at end-of-year `hp` (FINDING 4).
  * Unlevered IRR exit value = exit_ev (no exit fee subtraction) since the
    fee is sponsor-level (FINDING 5).
  * Value bridge total_gain definition aligned to bridge sum: total_gain =
    exit_equity − entry_equity. Distributions are tracked as a separate
    LP-cash component (FINDING 7) — they don't represent value creation.
  * Value bridge uses entry revenue from prior-year base for consistency
    (FINDING 6).
"""

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
from backend.engine.add_ons import compute_add_on_impact

logger = logging.getLogger(__name__)


# ── IRR Solver ────────────────────────────────────────────────────────────

def _solve_irr_pure(cashflows: list[float], times: list[float]) -> Optional[float]:
    """Pure-Python IRR (Newton-Raphson with bisection fallback) — no external deps.

    Guarantees the engine can solve IRR even when numpy-financial / scipy are not
    installed, so a missing optional dependency never silently yields a null IRR.
    """
    def npv(r: float) -> float:
        return sum(cf / (1.0 + r) ** t for cf, t in zip(cashflows, times))

    def dnpv(r: float) -> float:
        return sum(-t * cf / (1.0 + r) ** (t + 1) for cf, t in zip(cashflows, times))

    # Newton-Raphson
    r = 0.1
    for _ in range(200):
        d = dnpv(r)
        if abs(d) < 1e-15:
            break
        step = npv(r) / d
        r -= step
        if abs(step) < 1e-10 and -0.999 <= r <= 100.0:
            return float(r)
    if -0.999 <= r <= 100.0 and abs(npv(r)) < 0.01:
        return float(r)

    # Bisection
    lo, hi = -0.999, 100.0
    f_lo, f_hi = npv(lo), npv(hi)
    if f_lo * f_hi > 0:
        return None
    for _ in range(500):
        mid = (lo + hi) / 2.0
        f_mid = npv(mid)
        if abs(f_mid) < 1e-10 or (hi - lo) < 1e-12:
            return float(mid)
        if f_lo * f_mid < 0:
            hi = mid
        else:
            lo, f_lo = mid, f_mid
    return None


def _solve_irr(cashflows: list[float]) -> Optional[float]:
    """Solve IRR using numpy-financial, falling back to scipy, then pure Python."""
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

    # Final fallback: pure-Python solver (always available)
    return _solve_irr_pure(cashflows, list(range(len(cashflows))))


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

    # Final fallback: pure-Python solver (always available)
    return _solve_irr_pure(cashflows, times)


def _build_time_vector(hp: int, mid_year: bool) -> list[float]:
    """Build time vector for IRR cash flows.

    Standard:  [0, 1, 2, ..., hp]
    Mid-year:  [0, 0.5, 1.5, ..., hp-1.5, hp]
        — entry at t=0, interim CFs at mid-year, exit at end of final year.

    Per audit FINDING [4] returns.py: exit must occur at t=hp, NOT at hp-0.5.
    """
    if mid_year:
        if hp <= 0:
            return [0.0]
        # Entry at 0, interim periods 1..hp-1 at mid-year (0.5, 1.5, ..., hp-1.5),
        # exit at end of final year t=hp.
        times: list[float] = [0.0]
        for t in range(hp - 1):
            times.append(t + 0.5)
        times.append(float(hp))
        return times
    return [float(t) for t in range(hp + 1)]


def _solve_irr_auto(cashflows: list[float], times: list[float] | None) -> Optional[float]:
    """Use timed solver if times provided, else standard solver."""
    if times is not None:
        return _solve_irr_timed(cashflows, times)
    return _solve_irr(cashflows)


# ── MIP ratchet resolution (P4-1) ──────────────────────────────────────────

def _resolve_mip_pool(mip, pre_mip_moic: float, pre_mip_irr: Optional[float]) -> tuple[float, bool]:
    """Resolve (pool_pct, cleared). A non-empty ratchet schedule selects the highest
    tier whose MOIC (and optional IRR dual-hurdle) is cleared; else single-hurdle."""
    tiers = getattr(mip, "ratchet_tiers", None) or []
    if tiers:
        best = None
        for t in tiers:
            moic_ok = pre_mip_moic >= t.moic_threshold
            irr_ok = t.irr_threshold is None or (pre_mip_irr is not None and pre_mip_irr >= t.irr_threshold)
            if moic_ok and irr_ok and (best is None or t.moic_threshold > best.moic_threshold):
                best = t
        return (best.pool_pct, True) if best is not None else (0.0, False)
    cleared = pre_mip_moic >= mip.hurdle_moic
    return (mip.mip_pool_pct if cleared else 0.0, cleared)


def _monitoring_termination_payment(state: ModelState) -> float:
    """NPV of remaining contractual monitoring fees accelerated at exit (P4-11).
    0 unless both a monitoring fee and a termination horizon are set."""
    fee = state.fees.monitoring_fee_annual
    n = state.fees.monitoring_fee_termination_years
    if fee <= 0 or n <= 0:
        return 0.0
    r = state.fees.monitoring_fee_discount_rate
    annuity_pv = (1 - (1 + r) ** (-n)) / r if r > 0 else float(n)
    return fee * annuity_pv


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

    # Add-on acquisition funding (D): the sponsor-equity portion of an equity/mixed
    # bolt-on is a follow-on outflow at the acquisition year. Debt-funded bolt-ons
    # contribute 0 equity (their cost flows through the synthetic debt tranche).
    _add_on = compute_add_on_impact(state)
    add_on_equity = _add_on.equity_deployed_by_year
    add_on_purchase = [add_on_equity[i] + _add_on.debt_added_by_year[i] for i in range(hp)]
    total_add_on_equity = sum(add_on_equity)

    # Sponsor entry equity (FINDING 1) — uses the single-source helper to
    # ensure every caller (this module, scenarios, reality_check) agrees.
    entry_equity = state.sponsor_entry_equity_for(
        state.entry.enterprise_value, state.entry.total_debt_raised
    )

    if entry_equity <= 0:
        return Returns(
            entry_equity=entry_equity,
            irr_convergence_failed=True,
        )

    # Exit calculations
    exit_yr = projections.years[-1] if projections.years else None
    exit_ebitda = exit_yr.ebitda_adj if exit_yr else 0.0
    exit_ev = (
        state.exit.exit_ev_override
        if state.exit.exit_ev_override is not None and state.exit.exit_ev_override > 0
        else exit_ebitda * state.exit.exit_ebitda_multiple
    )
    # Net debt at exit subtracts retained cash
    exit_gross_debt = (
        debt_schedule.total_debt_by_year[-1] if debt_schedule.total_debt_by_year else 0.0
    )
    exit_cash = (
        debt_schedule.cash_balance_by_year[-1]
        if debt_schedule.cash_balance_by_year
        else (exit_yr.cash_balance if exit_yr else 0.0)
    )
    min_cash = max(0.0, getattr(state.entry, "min_cash_balance", 0.0))
    retained_cash = max(min_cash, exit_cash)
    exit_net_debt = max(0.0, exit_gross_debt - retained_cash)
    exit_fee = state.fees.exit_fee_pct * exit_ev

    # Monitoring-fee termination payment (P4-11) — a sponsor-level exit cost, netted from
    # the equity (net) path only (like the exit fee); excluded from levered/gross IRR.
    monitoring_termination = _monitoring_termination_payment(state)

    # Full-stake (100%) equity values. Hurdle tested on the pre-fee MOIC per the
    # audit convention (FINDING 2).
    exit_equity_pre_fees = exit_ev - exit_net_debt
    exit_equity_after_fees = exit_equity_pre_fees - exit_fee - monitoring_termination  # 100% stake, pre-MIP

    # ── Interim distributions (dividend recaps), paid & capped at available cash ──
    paid = debt_schedule.distributions_paid_by_year or []
    distributions = (list(paid[:hp]) if paid else [0.0] * hp)
    while len(distributions) < hp:
        distributions.append(0.0)
    total_distributions = sum(distributions)

    # ── Partial exits / IPO selldown (P4-5) ──
    # Mirrors lib/engine/returns.ts: each event realises pct_sold of the current
    # remaining stake at that year's implied equity value, booked at the event year;
    # the residual carried to final exit shrinks. Interim partials are pre-promote.
    partial_proceeds = [0.0] * hp         # net of event fee (equity IRR)
    partial_proceeds_gross = [0.0] * hp   # pre fee (levered/gross IRR)
    remaining_stake = 1.0
    events = sorted(
        [e for e in (state.exit.partial_exits or []) if 1 <= e.year < hp and e.pct_sold > 0],
        key=lambda e: e.year,
    )
    for ev in events:
        yi = ev.year - 1
        proj_yr = projections.years[yi] if yi < len(projections.years) else None
        if proj_yr is None:
            continue
        ev_net_debt = debt_schedule.net_debt_by_year[yi] if yi < len(debt_schedule.net_debt_by_year) else 0.0
        ev_equity_value = max(0.0, ev.exit_multiple * proj_yr.ebitda_adj - ev_net_debt)
        sold = min(1.0, max(0.0, ev.pct_sold))
        gross = sold * remaining_stake * ev_equity_value
        partial_proceeds_gross[yi] += gross
        partial_proceeds[yi] += gross * (1.0 - max(0.0, ev.exit_fee_pct))
        remaining_stake *= (1.0 - sold)
    total_partial_proceeds = sum(partial_proceeds)

    # ── MIP (ratchet + optional dual hurdle, P4-1) ──
    pre_mip_moic = exit_equity_pre_fees / entry_equity if entry_equity > 0 else 0.0
    needs_pre_mip_irr = any(
        getattr(t, "irr_threshold", None) is not None
        for t in (getattr(state.mip, "ratchet_tiers", None) or [])
    )
    pre_mip_irr: Optional[float] = None
    if needs_pre_mip_irr:
        pre_mip_residual = remaining_stake * exit_equity_after_fees
        pre_mip_cfs = [-entry_equity]
        for i in range(hp):
            cf = distributions[i] + partial_proceeds[i]
            if i == hp - 1:
                cf += pre_mip_residual
            pre_mip_cfs.append(cf)
        pre_mip_irr = _solve_irr_auto(pre_mip_cfs, times)

    pool_pct, _cleared = _resolve_mip_pool(state.mip, pre_mip_moic, pre_mip_irr)
    mip_payout_full = pool_pct * exit_equity_after_fees
    # Promote crystallises on the residual stake held to final exit.
    mip_payout = remaining_stake * mip_payout_full
    residual_post_mip = remaining_stake * (exit_equity_after_fees - mip_payout_full)

    # exit_equity = total realised sponsor equity (residual at exit + interim partials)
    exit_equity = residual_post_mip + total_partial_proceeds

    # MOIC (net) includes all distributions, over total invested capital
    # (entry equity + follow-on add-on equity).
    invested_base = entry_equity + total_add_on_equity
    moic = (exit_equity + total_distributions) / invested_base if invested_base > 0 else 0.0

    # DPI by year (cumulative distributions / entry equity)
    dpi_by_year: list[float] = []
    cumul_dist = 0.0
    for d in distributions:
        cumul_dist += d
        dpi_by_year.append(cumul_dist / entry_equity if entry_equity > 0 else 0.0)

    # RVPI by year — uses NET debt (gross debt − retained cash) per FINDING 3
    rvpi_by_year: list[float] = []
    cash_by_year = debt_schedule.cash_balance_by_year if debt_schedule.cash_balance_by_year else []
    for yr_idx in range(hp):
        if yr_idx == hp - 1:
            rvpi_by_year.append(0.0)  # at exit, RVPI = 0
        else:
            proj_yr = projections.years[yr_idx] if yr_idx < len(projections.years) else None
            if proj_yr:
                est_ev = proj_yr.ebitda_adj * state.exit.exit_ebitda_multiple
                est_debt = (
                    debt_schedule.total_debt_by_year[yr_idx]
                    if yr_idx < len(debt_schedule.total_debt_by_year)
                    else 0.0
                )
                est_cash = cash_by_year[yr_idx] if yr_idx < len(cash_by_year) else proj_yr.cash_balance
                est_net_debt = max(0.0, est_debt - max(min_cash, est_cash))
                est_equity = max(0.0, est_ev - est_net_debt)
                rvpi_by_year.append(est_equity / entry_equity if entry_equity > 0 else 0.0)
            else:
                rvpi_by_year.append(0.0)

    # ── Equity IRR (post-fees, post-MIP; distributions + partial proceeds at their years) ──
    equity_cfs: list[float] = [-entry_equity]
    for yr_idx in range(hp):
        cf = distributions[yr_idx] + partial_proceeds[yr_idx] - add_on_equity[yr_idx]
        if yr_idx == hp - 1:
            cf += residual_post_mip
        equity_cfs.append(cf)
    irr = _solve_irr_auto(equity_cfs, times)

    # ── Levered pre-fee IRR (residual stake at exit + pre-fee partial proceeds) ──
    entry_equity_levered = state.entry.enterprise_value - state.entry.total_debt_raised
    exit_equity_levered = exit_ev - exit_net_debt  # no exit fee, no MIP
    levered_cfs = [-entry_equity_levered]
    for yr_idx in range(hp):
        cf = distributions[yr_idx] + partial_proceeds_gross[yr_idx] - add_on_equity[yr_idx]
        if yr_idx == hp - 1:
            cf += remaining_stake * exit_equity_levered
        levered_cfs.append(cf)
    irr_levered = _solve_irr_auto(levered_cfs, times) if entry_equity_levered > 0 else None

    # ── Gross IRR (pre-fee, pre-carry — the canonical "gross" return) ──
    # FINDING 2: gross excludes ALL sponsor-level fees (entry advisory not in
    # entry_equity, exit fee not in exit value, MIP not netted).
    gross_cfs = [-entry_equity]
    for yr_idx in range(hp):
        cf = distributions[yr_idx] + partial_proceeds_gross[yr_idx] - add_on_equity[yr_idx]
        if yr_idx == hp - 1:
            cf += remaining_stake * exit_equity_pre_fees
        gross_cfs.append(cf)
    irr_gross = _solve_irr_auto(gross_cfs, times) if entry_equity > 0 else None

    # ── Unlevered IRR (FINDING 5: no exit fee subtraction) ──
    entry_cost_unlev = state.entry.enterprise_value + state.fees.transaction_costs
    unlev_cfs: list[float] = [-entry_cost_unlev]
    # Add-on bolt-ons are an enterprise-level acquisition cost (full purchase price) in
    # their acquisition year — subtract so the unlevered return isn't a free asset (D).
    for i, yr in enumerate(projections.years[:-1]):
        unlev_cfs.append(yr.fcf_pre_debt - (add_on_purchase[i] if i < len(add_on_purchase) else 0.0))
    if projections.years:
        last_idx = len(projections.years) - 1
        last_yr = projections.years[-1]
        last_purchase = add_on_purchase[last_idx] if last_idx < len(add_on_purchase) else 0.0
        unlev_cfs.append(last_yr.fcf_pre_debt + exit_ev - last_purchase)  # no exit fee
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
        dpi=dpi_by_year[-1] if dpi_by_year else 0.0,
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
        equity_cashflows=equity_cfs,
        add_on_equity_invested=total_add_on_equity,
    )


# ── Value Driver Decomposition ────────────────────────────────────────────

def decompose_value_drivers(
    state: ModelState,
    projections: AnnualProjection,
    debt_schedule: DebtSchedule,
    returns: Returns,
) -> ValueDriverDecomposition:
    """Isolate contribution of each value creation lever per Section 3.5.

    Per audit FINDING [7] returns.py: the bridge represents EQUITY VALUE
    CREATION from entry to exit (exit_equity − entry_equity). Interim
    distributions are LP cash flows, not value creation, so they are tracked
    separately via `returns.total_distributions` rather than added to the
    bridge sum.

    Note that withdrawing cash via dividends would otherwise have paid down
    debt; this is captured naturally because `exit_net_debt` (and hence
    `delta_debt`) reflects the actual cash-light, distribution-funded path.
    """
    entry_ev = state.entry.enterprise_value
    entry_margin = state.margins.base_ebitda_margin
    entry_multiple = state.entry.entry_ebitda_multiple
    exit_multiple = state.exit.exit_ebitda_multiple

    # FINDING 6: explicit base-period revenue used for bridge consistency
    entry_revenue = state.revenue.base_revenue

    exit_yr = projections.years[-1] if projections.years else None
    exit_revenue = exit_yr.revenue if exit_yr else entry_revenue
    exit_ebitda_adj = exit_yr.ebitda_adj if exit_yr else 0.0
    exit_margin_adj = exit_ebitda_adj / exit_revenue if exit_revenue > 0 else entry_margin

    entry_equity = returns.entry_equity
    exit_equity = returns.exit_equity
    exit_ev = returns.exit_ev

    # Step 0 — implied entry EV at constant margin/multiple. The bridge
    # baseline (pre-growth) anchors at the current entry EV so the chain
    # reconciles cleanly back to delta_total = exit_ev − entry_ev.

    # Step 1 — Revenue growth contribution (margin & multiple held at entry)
    hypo_ev_rev_growth = exit_revenue * entry_margin * entry_multiple
    delta_rev = hypo_ev_rev_growth - entry_ev

    # Step 2 — Margin expansion (multiple held at entry)
    hypo_ev_margin = exit_revenue * exit_margin_adj * entry_multiple
    delta_margin = hypo_ev_margin - hypo_ev_rev_growth

    # Step 3 — Multiple expansion
    delta_multiple = exit_ev - hypo_ev_margin

    # Step 4 — Debt paydown (entry gross debt − exit net debt)
    entry_net_debt = state.entry.total_debt_raised
    exit_net_debt = returns.exit_net_debt
    delta_debt = entry_net_debt - exit_net_debt

    # Step 5 — Fees & leakage drag (sponsor-borne fees + MIP).
    # Entry advisory fee is excluded — it is target-borne (FINDING 1).
    financing_fees = state.fees.financing_fee_pct * state.entry.total_debt_raised
    exit_fee = state.fees.exit_fee_pct * exit_ev
    fees_drag = (
        state.fees.transaction_costs
        + financing_fees
        + exit_fee
        + returns.mip_payout
        + _monitoring_termination_payment(state)  # P4-11 exit cost
    )

    # Total equity value gain (value creation only, excludes interim distributions)
    total_gain = exit_equity - entry_equity

    # Bridge reconciliation — should equal total_gain by construction
    computed_gain = delta_rev + delta_margin + delta_multiple + delta_debt - fees_drag
    recon_delta = abs(computed_gain - total_gain)
    if recon_delta > 0.5:  # £0.5m tolerance for floating-point and rounding
        logger.warning(
            "Value bridge reconciliation gap: £%.2fm (computed=%.2f, actual=%.2f). "
            "Distributions tracked separately: £%.2fm.",
            recon_delta,
            computed_gain,
            total_gain,
            returns.total_distributions,
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

    operational_pct = pct(delta_rev) + pct(delta_margin)
    financial_pct = pct(delta_multiple) + pct(delta_debt)

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
