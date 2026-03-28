"""Exit reality check (8 rules) and IC-grade credit analysis with stress tests."""

from __future__ import annotations

from typing import Optional

from backend.models.debt import DebtSchedule
from backend.models.outputs import (
    AnnualProjection,
    CreditAnalysis,
    CreditMetricsYear,
    ExitFlag,
    ExitRealityCheck,
    RecoveryTranche,
    Returns,
)
from backend.models.state import ModelState
from backend.engine.returns import _solve_irr


def run_reality_check(
    state: ModelState,
    projections: AnnualProjection,
    debt_schedule: DebtSchedule,
    returns: Returns,
) -> ExitRealityCheck:
    """Execute all 8 exit reality check rules."""
    flags: list[ExitFlag] = []
    hp = state.exit.holding_period

    entry_multiple = state.entry.entry_ebitda_multiple
    exit_multiple = state.exit.exit_ebitda_multiple
    entry_margin = state.margins.base_ebitda_margin
    exit_yr = projections.years[-1] if projections.years else None
    exit_margin = exit_yr.ebitda_margin if exit_yr else entry_margin
    exit_ebitda = exit_yr.ebitda_adj if exit_yr else 0.0
    exit_revenue = exit_yr.revenue if exit_yr else 0.0
    exit_ev = returns.exit_ev
    exit_net_debt = returns.exit_net_debt
    entry_leverage = state.entry.leverage_ratio
    exit_leverage = (
        exit_net_debt / exit_ebitda if exit_ebitda > 0 else 0.0
    )

    # Revenue growth rates
    entry_growth = state.revenue.growth_rates[0] if state.revenue.growth_rates else 0.0
    exit_growth = state.revenue.growth_rates[-1] if state.revenue.growth_rates else 0.0

    # RULE 1 — Multiple Expansion + Margin Expansion (simultaneous)
    if exit_multiple > entry_multiple and exit_margin > entry_margin + 0.03:
        # Impact: compute IRR at exit_multiple = entry_multiple
        impact_ev = exit_ebitda * entry_multiple
        impact_eq = impact_ev - exit_net_debt - state.fees.exit_fee_pct * impact_ev - returns.mip_payout
        impact_cfs = [-returns.entry_equity] + [0.0] * (hp - 1) + [impact_eq]
        impact_irr = _solve_irr(impact_cfs)
        delta_bps = int(((returns.irr or 0) - (impact_irr or 0)) * 10000) if returns.irr and impact_irr else 0
        flags.append(ExitFlag(
            flag_type="multiple_expansion_with_margin_expansion",
            severity="warning",
            description="Exit assumes both multiple expansion and margin improvement — buyers typically pay less as margin improves.",
            quantified_impact=f"{delta_bps}bps IRR compression if multiple reverts to entry ({entry_multiple:.1f}x)",
        ))

    # RULE 2 — Multiple Expansion + Leverage Increase
    if exit_multiple > entry_multiple and exit_leverage > entry_leverage:
        # Impact: compute IRR at exit_leverage = entry_leverage
        # If exit leverage matched entry, exit net debt would be entry_leverage * exit_ebitda
        impact_net_debt = entry_leverage * exit_ebitda
        impact_eq = exit_ev - impact_net_debt - state.fees.exit_fee_pct * exit_ev - returns.mip_payout
        impact_cfs = [-returns.entry_equity] + [0.0] * (hp - 1) + [impact_eq]
        impact_irr = _solve_irr(impact_cfs)
        delta_bps = int(((returns.irr or 0) - (impact_irr or 0)) * 10000) if returns.irr and impact_irr else 0
        flags.append(ExitFlag(
            flag_type="multiple_expansion_with_leverage_increase",
            severity="critical",
            description="Exit leverage exceeds entry leverage with simultaneous multiple expansion — rarely seen in practice.",
            quantified_impact=f"{delta_bps}bps IRR impact at entry leverage ({entry_leverage:.1f}x)",
        ))

    # RULE 3 — Implied Buyer Return Too Low
    implied_buyer_irr = _compute_implied_buyer_irr(
        state, exit_ev, exit_ebitda, exit_margin, exit_growth, entry_multiple
    )
    if implied_buyer_irr is not None and implied_buyer_irr < 0.15:
        flags.append(ExitFlag(
            flag_type="implied_buyer_return_too_low",
            severity="critical",
            description=f"Implied buyer IRR of {implied_buyer_irr:.1%} is below 15% — no rational financial buyer pays this price.",
            quantified_impact=f"Buyer IRR: {implied_buyer_irr:.1%}",
        ))

    # RULE 4 — Growth Deceleration Inconsistency
    if exit_growth < 0.5 * entry_growth and exit_multiple >= entry_multiple:
        flags.append(ExitFlag(
            flag_type="growth_deceleration_inconsistency",
            severity="warning",
            description="Growth decelerates significantly but exit multiple doesn't compress — multiples typically follow growth.",
            quantified_impact=f"Growth: {entry_growth:.1%} → {exit_growth:.1%}, multiple unchanged at {exit_multiple:.1f}x",
        ))

    # RULE 5 — Exit Leverage Above Threshold
    threshold = 3.5 if state.sector in ("Industrials", "Energy", "Consumer Discretionary") else 4.0
    if exit_leverage > threshold:
        flags.append(ExitFlag(
            flag_type="leverage_at_exit_above_threshold",
            severity="warning",
            description=f"Exit leverage of {exit_leverage:.1f}x exceeds {threshold:.1f}x threshold — reduces buyer universe.",
            quantified_impact=f"Exit net debt/EBITDA: {exit_leverage:.1f}x",
        ))

    # RULE 6 — Entry Premium vs Comparable Deals
    # Use sector median from appendix as proxy (AI would provide this in practice)
    sector_medians = {
        "Technology": 16.0, "Healthcare": 12.0, "Industrials": 8.5,
        "Consumer": 9.0, "Financial Services": 10.5, "Real Estate": 12.0,
        "Energy": 7.5, "Business Services": 11.0, "Other": 10.0,
    }
    sector_median = sector_medians.get(state.sector, 10.0)
    if entry_multiple > sector_median * 1.25:
        # Impact at sector median
        ebitda_entry = state.revenue.base_revenue * state.margins.base_ebitda_margin
        alt_ev = ebitda_entry * sector_median
        alt_equity = alt_ev + state.fees.transaction_costs + state.fees.financing_fee_pct * state.entry.total_debt_raised - state.entry.total_debt_raised
        if alt_equity > 0:
            alt_exit_eq = returns.exit_ev - returns.exit_net_debt - state.fees.exit_fee_pct * returns.exit_ev - returns.mip_payout
            alt_cfs = [-alt_equity] + [0.0] * (hp - 1) + [alt_exit_eq]
            alt_irr = _solve_irr(alt_cfs)
            delta = int(((alt_irr or 0) - (returns.irr or 0)) * 10000) if alt_irr and returns.irr else 0
            flags.append(ExitFlag(
                flag_type="exit_premium_vs_entry",
                severity="warning",
                description=f"Entry multiple of {entry_multiple:.1f}x is >25% above sector median ({sector_median:.1f}x).",
                quantified_impact=f"+{delta}bps IRR at sector median entry",
            ))

    # RULE 7 — NWC Deterioration
    entry_nwc_pct = state.margins.nwc_pct_revenue
    # Exit NWC pct is same assumption (model uses constant pct)
    # Check if NWC builds beyond 120% of entry
    if exit_yr and state.revenue.base_revenue > 0:
        entry_nwc = state.revenue.base_revenue * entry_nwc_pct
        exit_nwc = exit_revenue * entry_nwc_pct
        if exit_nwc > entry_nwc * 1.2 and entry_nwc > 0:
            nwc_build = exit_nwc - entry_nwc
            flags.append(ExitFlag(
                flag_type="nwc_deterioration",
                severity="warning",
                description=f"NWC grows from £{entry_nwc:.1f}m to £{exit_nwc:.1f}m — cash tied up in working capital.",
                quantified_impact=f"£{nwc_build:.1f}m cumulative NWC build",
            ))

    # RULE 8 — D&A vs Capex Divergence
    da_pct = state.margins.da_pct_revenue
    capex_pct = state.margins.capex_pct_revenue
    if da_pct > capex_pct * 1.5 and capex_pct > 0:
        flags.append(ExitFlag(
            flag_type="capex_intensity_change",
            severity="warning",
            description=f"D&A ({da_pct:.1%} of rev) exceeds capex ({capex_pct:.1%}) by >50% — unsustainable for asset-heavy businesses.",
            quantified_impact=f"D&A/Capex ratio: {da_pct/capex_pct:.1f}x",
        ))

    # Verdict
    critical_count = sum(1 for f in flags if f.severity == "critical")
    if critical_count > 0:
        verdict = "aggressive"
    elif len(flags) == 0 or (len(flags) > 0 and exit_multiple < entry_multiple):
        verdict = "conservative" if exit_multiple < entry_multiple else "realistic"
    else:
        verdict = "realistic"

    # EV/Revenue and EV/EBITDA at exit
    ev_revenue_exit = exit_ev / exit_revenue if exit_revenue > 0 else 0.0
    ev_ebitda_exit = exit_ev / exit_ebitda if exit_ebitda > 0 else 0.0

    return ExitRealityCheck(
        flags=flags,
        implied_buyer_irr=implied_buyer_irr,
        ev_revenue_at_exit=ev_revenue_exit,
        ev_ebitda_at_exit=ev_ebitda_exit,
        public_comps_multiple_range=(sector_median * 0.8, sector_median * 1.2),
        multiple_delta=exit_multiple - entry_multiple,
        verdict=verdict,
        narrative="",
    )


def _compute_implied_buyer_irr(
    state: ModelState,
    exit_ev: float,
    exit_ebitda: float,
    exit_margin: float,
    exit_growth: float,
    entry_multiple: float,
) -> Optional[float]:
    """Solve IRR for hypothetical buyer at exit_ev, same growth/margins, 5yr hold, exit at entry_multiple."""
    buyer_hold = 5
    buyer_leverage = state.entry.leverage_ratio
    buyer_debt = exit_ebitda * buyer_leverage
    buyer_equity = exit_ev - buyer_debt

    if buyer_equity <= 0:
        return None

    # Project forward 5 years with same growth/margin
    rev = exit_ebitda / exit_margin if exit_margin > 0 else 0.0
    future_ebitda = exit_ebitda
    for _ in range(buyer_hold):
        rev *= (1.0 + exit_growth)
        future_ebitda = rev * exit_margin

    buyer_exit_ev = future_ebitda * entry_multiple
    buyer_exit_equity = buyer_exit_ev - buyer_debt * 0.7  # assume ~30% debt paydown

    buyer_cfs = [-buyer_equity] + [0.0] * (buyer_hold - 1) + [buyer_exit_equity]
    return _solve_irr(buyer_cfs)


# ── Credit Analysis with Stress Tests & Recovery Waterfall ───────────────

def compute_credit_analysis(
    state: ModelState,
    projections: AnnualProjection,
    debt_schedule: DebtSchedule,
) -> CreditAnalysis:
    """IC-grade credit analysis: per-year metrics, stress EBITDA, and recovery waterfall.

    Stress cases:
      - Mild stress: EBITDA -20%, exit multiple 6x
      - Severe stress: EBITDA -30%, exit multiple 6x

    Recovery waterfall allocates stressed EV sequentially: Senior A → Senior B → Equity.
    FCCR denominator includes principal (full debt service); DSCR denominator = interest only.
    """
    hp = state.exit.holding_period
    initial_debt = state.entry.total_debt_raised

    # ── Per-year credit metrics ──
    metrics: list[CreditMetricsYear] = []
    for yr_idx in range(hp):
        yr = projections.years[yr_idx] if yr_idx < len(projections.years) else None
        if yr is None:
            break

        ebitda_adj = yr.ebitda_adj
        fcf_pre = yr.fcf_pre_debt
        tot_cash_int = (
            debt_schedule.total_cash_interest_by_year[yr_idx]
            if yr_idx < len(debt_schedule.total_cash_interest_by_year)
            else 0.0
        )
        tot_debt = (
            debt_schedule.total_debt_by_year[yr_idx]
            if yr_idx < len(debt_schedule.total_debt_by_year)
            else 0.0
        )

        # Mandatory amortisation (scheduled repayments only, no sweep)
        mandatory_amort = sum(
            debt_schedule.tranche_schedules[t][yr_idx].scheduled_repayment
            for t in range(len(debt_schedule.tranche_schedules))
        ) if debt_schedule.tranche_schedules else 0.0

        # FCCR = FCF pre-debt / full debt service (interest + scheduled principal)
        full_debt_service = tot_cash_int + mandatory_amort
        fccr = fcf_pre / full_debt_service if full_debt_service > 0 else 99.0

        # Interest coverage = EBITDA / Interest
        interest_coverage = ebitda_adj / tot_cash_int if tot_cash_int > 0 else 99.0

        # DSCR = FCF / Interest only (principal excluded per IC standard)
        dscr = fcf_pre / tot_cash_int if tot_cash_int > 0 else 99.0

        leverage = tot_debt / ebitda_adj if ebitda_adj > 0 else 0.0

        # Cumulative debt paydown since entry
        cumulative_paydown = initial_debt - tot_debt
        paydown_pct = cumulative_paydown / initial_debt if initial_debt > 0 else 0.0

        metrics.append(CreditMetricsYear(
            year=yr_idx + 1,
            fccr=fccr,
            interest_coverage=interest_coverage,
            dscr=dscr,
            leverage=leverage,
            senior_leverage=leverage,
            total_debt=tot_debt,
            cumulative_debt_paydown=cumulative_paydown,
            debt_paydown_pct=paydown_pct,
        ))

    # ── Stress tests ──
    exit_yr = projections.years[-1] if projections.years else None
    exit_ebitda = exit_yr.ebitda_adj if exit_yr else 0.0
    exit_debt = (
        debt_schedule.total_debt_by_year[-1]
        if debt_schedule.total_debt_by_year
        else 0.0
    )

    # Stress exit multiples per upgrademodel.md
    stress_exit_multiple = 6.0
    stress_cases = [
        ("20% EBITDA Stress", exit_ebitda * 0.80),
        ("30% EBITDA Stress", exit_ebitda * 0.70),
    ]

    # ── Recovery waterfall: tranche-by-tranche (senior → junior → equity) ──
    recovery_waterfall: list[RecoveryTranche] = []

    for stress_label, stress_ebitda in stress_cases:
        stress_ev = stress_ebitda * stress_exit_multiple
        remaining_ev = stress_ev

        for t_idx, tranche in enumerate(state.debt_tranches):
            # Exit balance for this tranche
            tranche_balance = 0.0
            if (
                debt_schedule.tranche_schedules
                and t_idx < len(debt_schedule.tranche_schedules)
            ):
                t_sched = debt_schedule.tranche_schedules[t_idx]
                if t_sched:
                    tranche_balance = t_sched[-1].ending_balance

            if tranche_balance > 0:
                recovery_abs = min(remaining_ev, tranche_balance)
                recovery_pct = recovery_abs / tranche_balance if tranche_balance > 0 else 0.0
                recovery_waterfall.append(RecoveryTranche(
                    tranche=f"{tranche.name} ({stress_label})",
                    recovery_pct=recovery_pct,
                ))
                remaining_ev = max(0.0, remaining_ev - recovery_abs)

        # Equity residual
        equity_check = state.entry.equity_check
        equity_recovery_pct = min(1.0, remaining_ev / equity_check) if equity_check > 0 else 0.0
        recovery_waterfall.append(RecoveryTranche(
            tranche=f"Equity ({stress_label})",
            recovery_pct=equity_recovery_pct,
        ))

    # ── Covenant headroom (3.5x leverage covenant as standard proxy) ──
    covenant_leverage = 3.5
    covenant_headroom: list[float] = []
    for yr_idx in range(hp):
        yr = projections.years[yr_idx] if yr_idx < len(projections.years) else None
        if yr and yr_idx < len(debt_schedule.total_debt_by_year):
            ebitda_required = debt_schedule.total_debt_by_year[yr_idx] / covenant_leverage
            covenant_headroom.append(yr.ebitda_adj - ebitda_required)

    ebitda_at_entry = state.revenue.base_revenue * state.margins.base_ebitda_margin
    refinancing_risk = exit_debt > exit_ebitda * 4.5 if exit_ebitda > 0 else False
    refinancing_detail = (
        f"Exit leverage {exit_debt / exit_ebitda:.1f}x exceeds 4.5x refinancing threshold"
        if refinancing_risk and exit_ebitda > 0
        else ""
    )

    return CreditAnalysis(
        metrics_by_year=metrics,
        max_debt_capacity_at_4x=ebitda_at_entry * 4.0,
        max_debt_capacity_at_5x=ebitda_at_entry * 5.0,
        max_debt_capacity_at_6x=ebitda_at_entry * 6.0,
        covenant_headroom_by_year=covenant_headroom,
        refinancing_risk=refinancing_risk,
        refinancing_risk_detail=refinancing_detail,
        recovery_waterfall=recovery_waterfall,
        credit_rating_estimate="",
    )
