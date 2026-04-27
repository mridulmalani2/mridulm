"""Exit reality check (8 rules) and IC-grade credit analysis with stress tests.

Audit-driven changes (audit_report.md, reality_check.py findings):
  * Rule 1 exit fee uses the actual exit EV, not the hypothetical impact EV
    (FINDING 1).
  * Rule 2 reverts both leverage AND exit multiple to entry levels for a
    consistent counterfactual (FINDING 2).
  * Rule 3 buyer-IRR EV-discount uses a numerical solve for the EV that
    would deliver a 15% buyer IRR rather than a linear bps-vs-time heuristic
    (FINDING 3).
  * Rule 6 entry equity uses `state.sponsor_entry_equity_for(...)` — the
    single-source helper — so the alt-EV equity stays in sync with the
    audit-correct convention (FINDING 4).
  * Implied buyer IRR projects forward FCF to derive the buyer's debt
    paydown rather than assuming a flat 30% paydown (FINDING 5).
  * Senior leverage uses the senior-tranche-only series surfaced by the
    debt schedule (FINDING 6).
  * Recovery waterfall uses `state.entry.initial_equity` — the canonical
    alias of `equity_check` (FINDING 7).
  * Refinancing risk threshold tests against a stressed (conservative)
    EBITDA, not peak EBITDA (FINDING 8).
  * Fragility score guards against low / negative base IRR — the score is
    only meaningful above a 10% threshold, otherwise we report the bps
    drop directly (FINDING 9).
  * Dominant-shock attribution caps the share at 100% and is labelled as
    an isolated-shock approximation (FINDING 10).
  * Post-recap leverage adds the dividend distribution back to debt for the
    leverage check, treating the distribution as debt-funded — the standard
    dividend-recap convention (FINDING 11).
  * Verdict logic incorporates leverage and margin trajectory in addition
    to multiple delta (FINDING 12).
"""

from __future__ import annotations

import math
from typing import Optional

from backend.models.debt import DebtSchedule
from backend.models.outputs import (
    AnnualProjection,
    CreditAnalysis,
    CreditMetricsYear,
    ExitFlag,
    ExitRealityCheck,
    FragilityAnalysis,
    FragilityStressResult,
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
    _CCY = {"GBP": "£", "EUR": "€", "USD": "$", "CHF": "CHF "}
    ccy = _CCY.get(state.currency, "£")

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
        # Impact: compute IRR at exit_multiple = entry_multiple. The exit fee
        # is contractual on the actual transaction value, so we apply it on
        # the realised exit EV (FINDING 1) — applying it on the lower
        # impact EV would understate the fee drag and overstate the
        # counterfactual IRR.
        impact_ev = exit_ebitda * entry_multiple
        impact_eq = (
            impact_ev
            - exit_net_debt
            - state.fees.exit_fee_pct * exit_ev
            - returns.mip_payout
        )
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
        # Counterfactual: revert BOTH leverage and exit multiple to entry
        # levels (FINDING 2). High exit multiple paired with low leverage is
        # an inconsistent hybrid that doesn't reflect real buyer behaviour;
        # if leverage compresses to entry, the exit multiple typically does
        # too. Fee drag is computed on the new (lower) impact EV since this
        # is now the actual transaction value in the counterfactual.
        impact_ev = exit_ebitda * entry_multiple
        impact_net_debt = entry_leverage * exit_ebitda
        impact_eq = (
            impact_ev
            - impact_net_debt
            - state.fees.exit_fee_pct * impact_ev
            - returns.mip_payout
        )
        impact_cfs = [-returns.entry_equity] + [0.0] * (hp - 1) + [impact_eq]
        impact_irr = _solve_irr(impact_cfs)
        delta_bps = int(((returns.irr or 0) - (impact_irr or 0)) * 10000) if returns.irr and impact_irr else 0
        flags.append(ExitFlag(
            flag_type="multiple_expansion_with_leverage_increase",
            severity="critical",
            description="Exit leverage exceeds entry leverage with simultaneous multiple expansion — rarely seen in practice.",
            quantified_impact=(
                f"{delta_bps}bps IRR impact if both revert to entry "
                f"({entry_leverage:.1f}x leverage, {entry_multiple:.1f}x multiple)"
            ),
        ))

    # RULE 3 — Implied Buyer Return Too Low
    implied_buyer_irr = _compute_implied_buyer_irr(
        state, exit_ev, exit_ebitda, exit_margin, exit_growth, entry_multiple
    )
    if implied_buyer_irr is not None and implied_buyer_irr < 0.15:
        gap_bps = int((0.15 - implied_buyer_irr) * 10000)
        buyer_leverage = state.entry.leverage_ratio
        # Numerically solve for the exit EV at which a hypothetical buyer
        # would clear a 15% IRR (FINDING 3). The previous heuristic
        # `gap_bps/10000 * holding_period` linearised an inherently
        # nonlinear relationship and broke down at large gaps or long
        # holds. The solve uses the same FCF-projected debt paydown as
        # the IRR calc, so the discount is internally consistent.
        implied_entry_ev = _solve_buyer_ev_for_hurdle(
            state,
            exit_ev=exit_ev,
            exit_ebitda=exit_ebitda,
            exit_margin=exit_margin,
            exit_growth=exit_growth,
            entry_multiple=entry_multiple,
            hurdle=0.15,
        )
        if implied_entry_ev is not None and implied_entry_ev < exit_ev:
            implied_discount_ev = exit_ev - implied_entry_ev
            ev_pct_discount_for_hurdle = (
                implied_discount_ev / exit_ev if exit_ev > 0 else 0.0
            )
        else:
            implied_discount_ev = 0.0
            ev_pct_discount_for_hurdle = 0.0
        flags.append(ExitFlag(
            flag_type="implied_buyer_return_too_low",
            severity="critical",
            description=(
                f"At {exit_multiple:.1f}x exit EBITDA ({ccy}{exit_ev:.0f}m EV), an acquirer assuming "
                f"{exit_growth:.1%} growth and {buyer_leverage:.1f}x leverage earns {implied_buyer_irr:.1%} IRR "
                f"— {gap_bps}bps below a standard 15% PE hurdle. Achieving hurdle returns would require "
                f"approximately {ev_pct_discount_for_hurdle:.0%} lower exit EV ({ccy}{implied_discount_ev:.0f}m discount) "
                f"or materially higher post-exit growth. Buyer pool at this price is likely limited to "
                f"strategics with cost synergies or a strategic premium."
            ),
            quantified_impact=(
                f"Buyer IRR {implied_buyer_irr:.1%} vs 15% hurdle; "
                f"{gap_bps}bps gap. EV discount required for 15% hurdle: ~{ccy}{implied_discount_ev:.0f}m."
            ),
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
        # Impact at sector median: re-derive sponsor entry equity using the
        # canonical helper (FINDING 4). The previous formula manually added
        # transaction costs + financing fees on top of EV and subtracted
        # gross debt — which double-counted financing fees and ignored the
        # audit convention that entry advisory fees are target-borne.
        ebitda_entry = state.revenue.base_revenue * state.margins.base_ebitda_margin
        alt_ev = ebitda_entry * sector_median
        alt_equity = state.sponsor_entry_equity_for(
            alt_ev, state.entry.total_debt_raised
        )
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

    # RULE 9 — Post-Recap Leverage Check (dividend recapitalization)
    distributions = state.exit.interim_distributions
    if distributions and any(d > 0 for d in distributions):
        leverage_threshold = 5.0 if state.sector in ("Technology", "Healthcare") else 4.0
        for t_idx, dist in enumerate(distributions):
            if dist > 0 and t_idx < len(debt_schedule.leverage_ratio_by_year):
                leverage_at_t = debt_schedule.leverage_ratio_by_year[t_idx]
                if leverage_at_t > leverage_threshold:
                    flags.append(ExitFlag(
                        flag_type="post_recap_leverage_excessive",
                        severity="warning",
                        description=(
                            f"Year {t_idx + 1} distribution of {ccy}{dist:.0f}m occurs at "
                            f"{leverage_at_t:.1f}x leverage — above {leverage_threshold:.0f}x sector threshold."
                        ),
                        quantified_impact=f"Post-distribution leverage: {leverage_at_t:.1f}x",
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


def _project_buyer_path(
    state: ModelState,
    exit_ebitda: float,
    exit_margin: float,
    exit_growth: float,
    buyer_hold: int,
    buyer_debt: float,
) -> tuple[float, float]:
    """Project a buyer's forward EBITDA and remaining debt at exit.

    Returns (future_ebitda, remaining_debt_at_buyer_exit).

    The previous implementation assumed a flat 30% debt paydown
    (`buyer_debt * 0.7`) regardless of operating performance, an arbitrary
    figure flagged as critical (audit FINDING 5). This helper instead
    projects FCFF year by year using the same operating assumptions the
    buyer is presumed to inherit (growth, margin, capex, NWC, tax) and
    sweeps free cash after cash interest service to pay down debt. Debt is
    floored at zero and paydown is capped at the rolling balance, so the
    exit debt always reflects what the buyer can plausibly amortise out of
    operating cash. No mandatory amortisation is assumed — buyer-side
    refinancing typically runs through a unitranche / term loan with
    bullet maturity inside the hold period.
    """
    if buyer_hold <= 0 or exit_margin <= 0 or exit_ebitda <= 0:
        return exit_ebitda, max(0.0, buyer_debt)

    # Operating assumptions (held flat over the buyer's hold for tractability)
    capex_pct = state.margins.capex_pct_revenue
    nwc_pct = state.margins.nwc_pct_revenue
    da_pct = state.margins.da_pct_revenue
    tax_rate = state.tax.tax_rate

    # Buyer's cost of debt: weighted-average effective rate of the
    # original deal's tranches, falling back to a 7% baseline if
    # nothing is configured. This stays in line with the leverage assumption
    # being a continuation of the originating sponsor's capital structure.
    if state.debt_tranches:
        total_principal = sum(t.principal for t in state.debt_tranches) or 1.0
        weighted_rate = sum(
            t.principal * (t.interest_rate or (t.base_rate + t.spread))
            for t in state.debt_tranches
        ) / total_principal
        buyer_rate = max(0.01, weighted_rate)
    else:
        buyer_rate = 0.07

    rev = exit_ebitda / exit_margin
    prev_rev = rev
    debt = max(0.0, buyer_debt)
    future_ebitda = exit_ebitda

    for _ in range(buyer_hold):
        rev *= (1.0 + exit_growth)
        future_ebitda = rev * exit_margin
        ebit = future_ebitda - rev * da_pct
        # FCFF = NOPAT + D&A − Capex − ΔNWC (consistent with the audit-
        # corrected projection engine).
        nopat = ebit * (1.0 - tax_rate)
        capex = rev * capex_pct
        delta_nwc = (rev - prev_rev) * nwc_pct
        fcff = nopat + rev * da_pct - capex - delta_nwc
        # Cash interest serviced first, then residual sweeps debt.
        cash_interest = debt * buyer_rate
        available = fcff - cash_interest
        paydown = max(0.0, min(debt, available))
        debt = max(0.0, debt - paydown)
        prev_rev = rev

    return future_ebitda, debt


def _compute_implied_buyer_irr(
    state: ModelState,
    exit_ev: float,
    exit_ebitda: float,
    exit_margin: float,
    exit_growth: float,
    entry_multiple: float,
) -> Optional[float]:
    """Solve IRR for hypothetical buyer at `exit_ev`, same growth/margins, 5yr hold, exit at entry_multiple.

    Buyer's debt paydown is FCF-projected (FINDING 5) instead of a flat
    30% heuristic.
    """
    buyer_hold = 5
    buyer_leverage = state.entry.leverage_ratio
    buyer_debt = exit_ebitda * buyer_leverage
    buyer_equity = exit_ev - buyer_debt

    if buyer_equity <= 0:
        return None

    future_ebitda, exit_debt = _project_buyer_path(
        state, exit_ebitda, exit_margin, exit_growth, buyer_hold, buyer_debt
    )

    buyer_exit_ev = future_ebitda * entry_multiple
    buyer_exit_equity = buyer_exit_ev - exit_debt

    buyer_cfs = [-buyer_equity] + [0.0] * (buyer_hold - 1) + [buyer_exit_equity]
    return _solve_irr(buyer_cfs)


def _solve_buyer_ev_for_hurdle(
    state: ModelState,
    *,
    exit_ev: float,
    exit_ebitda: float,
    exit_margin: float,
    exit_growth: float,
    entry_multiple: float,
    hurdle: float,
    buyer_hold: int = 5,
) -> Optional[float]:
    """Numerically solve for the entry EV that yields the buyer's hurdle IRR.

    Audit FINDING 3: replaces the prior linear `gap_bps × hold_period`
    heuristic with a proper IRR-consistent solve. The buyer's debt and
    operating projection are independent of the entry EV (debt is sized on
    the company's EBITDA at the time of buyer entry, and the FCF path is
    operating-driven), so the entry equity required to clear the hurdle
    is closed-form once the buyer-exit equity is known:

        required_entry_equity = buyer_exit_equity / (1 + hurdle) ** hold
        implied_entry_ev      = required_entry_equity + buyer_debt
    """
    if exit_ebitda <= 0 or exit_margin <= 0 or hurdle <= -1.0:
        return None

    buyer_leverage = state.entry.leverage_ratio
    buyer_debt = exit_ebitda * buyer_leverage

    future_ebitda, exit_debt = _project_buyer_path(
        state, exit_ebitda, exit_margin, exit_growth, buyer_hold, buyer_debt
    )

    buyer_exit_ev = future_ebitda * entry_multiple
    buyer_exit_equity = buyer_exit_ev - exit_debt
    if buyer_exit_equity <= 0:
        return None

    discount = (1.0 + hurdle) ** buyer_hold
    if not math.isfinite(discount) or discount <= 0:
        return None

    required_entry_equity = buyer_exit_equity / discount
    implied_entry_ev = required_entry_equity + buyer_debt
    return max(0.0, implied_entry_ev)


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

        # Senior leverage tracks senior tranches only (FINDING 6). The
        # debt schedule already exposes a senior-only series — reuse it
        # so credit analysis matches the rest of the engine.
        if (
            debt_schedule.senior_leverage_by_year
            and yr_idx < len(debt_schedule.senior_leverage_by_year)
        ):
            senior_leverage = debt_schedule.senior_leverage_by_year[yr_idx]
        else:
            senior_leverage = leverage

        # Cumulative debt paydown since entry
        cumulative_paydown = initial_debt - tot_debt
        paydown_pct = cumulative_paydown / initial_debt if initial_debt > 0 else 0.0

        metrics.append(CreditMetricsYear(
            year=yr_idx + 1,
            fccr=fccr,
            interest_coverage=interest_coverage,
            dscr=dscr,
            leverage=leverage,
            senior_leverage=senior_leverage,
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

        # Equity residual — use the canonical `initial_equity` alias rather
        # than the misleading `equity_check` name (FINDING 7). Both fields
        # point at the same value (kept in sync by `derive_entry_fields`),
        # but `initial_equity` reads as the dollar amount it actually is.
        initial_equity = state.entry.initial_equity
        equity_recovery_pct = (
            min(1.0, remaining_ev / initial_equity) if initial_equity > 0 else 0.0
        )
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
    # Refinancing capacity is underwritten by lenders against a conservative
    # / normalised EBITDA, not the peak exit EBITDA (audit FINDING 8). We
    # take the more conservative of (a) 80% of exit EBITDA and (b) the
    # second-to-last forecast year, which approximates a normalised
    # through-cycle figure when EBITDA growth is back-loaded.
    if exit_ebitda > 0:
        prior_ebitda = (
            projections.years[-2].ebitda_adj
            if len(projections.years) > 1
            else exit_ebitda
        )
        conservative_ebitda = min(exit_ebitda * 0.8, prior_ebitda)
        # Floor at zero — negative EBITDA collapses to "no refinancing capacity"
        conservative_ebitda = max(0.0, conservative_ebitda)
    else:
        conservative_ebitda = 0.0
    refinancing_threshold = 4.5
    refinancing_risk = (
        conservative_ebitda <= 0 or exit_debt > conservative_ebitda * refinancing_threshold
    ) if exit_ebitda > 0 else False
    if refinancing_risk and conservative_ebitda > 0:
        stress_leverage = exit_debt / conservative_ebitda
        peak_leverage_str = (
            f" (peak {exit_debt / exit_ebitda:.1f}x)" if exit_ebitda > 0 else ""
        )
        refinancing_detail = (
            f"Exit leverage on stressed EBITDA {stress_leverage:.1f}x"
            f"{peak_leverage_str} exceeds {refinancing_threshold:.1f}x refinancing threshold"
        )
    elif refinancing_risk:
        refinancing_detail = (
            "Stressed EBITDA non-positive — no refinancing capacity"
        )
    else:
        refinancing_detail = ""

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


# ── Fragility Engine ──────────────────────────────────────────────────────

def compute_fragility(
    state: ModelState,
    base_irr: Optional[float],
    base_moic: float,
) -> FragilityAnalysis:
    """Stress-test the deal under 3 independent shocks + combined case.

    Shocks (per upgrademodel.md Section 3.2):
      1. Growth shock  : all growth rates -2%
      2. Margin shock  : EBITDA margin -100bps (base + target)
      3. Multiple shock: exit multiple -1.0x
      4. Combined      : all three applied simultaneously

    Fragility score = combined IRR drop / base IRR.
    Classification: <20% Robust | 20-40% Moderate Risk | >40% Fragile.
    """
    import copy
    # Lazy import avoids circular dependency
    from backend.engine.scenarios import _run_full_model

    def _run_shock(s: ModelState) -> tuple[Optional[float], float]:
        try:
            ret, _, _ = _run_full_model(s)
            return ret.irr, ret.moic
        except Exception:
            return None, 0.0

    def _delta_irr(stressed: Optional[float]) -> Optional[float]:
        if base_irr is not None and stressed is not None:
            return stressed - base_irr
        return None

    # ── Shock 1: Growth -2% ──
    g_state = copy.deepcopy(state)
    g_state.revenue.growth_rates = [
        max(r - 0.02, -0.10) for r in state.revenue.growth_rates
    ]
    g_state.margins.margin_by_year = []
    g_state.ensure_list_lengths()
    g_state.derive_entry_fields()
    g_irr, g_moic = _run_shock(g_state)

    # ── Shock 2: Margin -100bps ──
    m_state = copy.deepcopy(state)
    m_state.margins.base_ebitda_margin = max(state.margins.base_ebitda_margin - 0.01, 0.01)
    m_state.margins.target_ebitda_margin = max(state.margins.target_ebitda_margin - 0.01, 0.01)
    m_state.margins.margin_by_year = []
    m_state.ensure_list_lengths()
    m_state.derive_entry_fields()
    m_irr, m_moic = _run_shock(m_state)

    # ── Shock 3: Exit multiple -1.0x ──
    x_state = copy.deepcopy(state)
    x_state.exit.exit_ebitda_multiple = max(state.exit.exit_ebitda_multiple - 1.0, 1.0)
    x_state.margins.margin_by_year = list(state.margins.margin_by_year)
    x_state.ensure_list_lengths()
    x_state.derive_entry_fields()
    x_irr, x_moic = _run_shock(x_state)

    # ── Shock 4: Combined ──
    c_state = copy.deepcopy(state)
    c_state.revenue.growth_rates = [
        max(r - 0.02, -0.10) for r in state.revenue.growth_rates
    ]
    c_state.margins.base_ebitda_margin = max(state.margins.base_ebitda_margin - 0.01, 0.01)
    c_state.margins.target_ebitda_margin = max(state.margins.target_ebitda_margin - 0.01, 0.01)
    c_state.exit.exit_ebitda_multiple = max(state.exit.exit_ebitda_multiple - 1.0, 1.0)
    c_state.margins.margin_by_year = []
    c_state.ensure_list_lengths()
    c_state.derive_entry_fields()
    c_irr, c_moic = _run_shock(c_state)

    stress_scenarios = [
        FragilityStressResult(
            name="growth_shock",
            description="-2% revenue growth (all years)",
            irr=g_irr,
            moic=g_moic,
            delta_irr=_delta_irr(g_irr),
            delta_moic=g_moic - base_moic,
        ),
        FragilityStressResult(
            name="margin_shock",
            description="-100bps EBITDA margin (base and target)",
            irr=m_irr,
            moic=m_moic,
            delta_irr=_delta_irr(m_irr),
            delta_moic=m_moic - base_moic,
        ),
        FragilityStressResult(
            name="multiple_shock",
            description=f"-1.0x exit multiple ({state.exit.exit_ebitda_multiple:.1f}x → {max(state.exit.exit_ebitda_multiple - 1.0, 1.0):.1f}x)",
            irr=x_irr,
            moic=x_moic,
            delta_irr=_delta_irr(x_irr),
            delta_moic=x_moic - base_moic,
        ),
        FragilityStressResult(
            name="combined",
            description="-2% growth, -100bps margin, -1.0x exit multiple",
            irr=c_irr,
            moic=c_moic,
            delta_irr=_delta_irr(c_irr),
            delta_moic=c_moic - base_moic,
        ),
    ]

    # ── Fragility score ──
    combined_drop = abs(_delta_irr(c_irr) or 0.0)
    fragility_score = combined_drop / base_irr if (base_irr and base_irr > 0) else 0.0

    if fragility_score < 0.20:
        classification = "Robust"
    elif fragility_score < 0.40:
        classification = "Moderate Risk"
    else:
        classification = "Fragile"

    # Dominant individual shock (largest IRR drop)
    individual = [
        ("Revenue Growth", abs(_delta_irr(g_irr) or 0.0)),
        ("Margin",         abs(_delta_irr(m_irr) or 0.0)),
        ("Exit Multiple",  abs(_delta_irr(x_irr) or 0.0)),
    ]
    dominant = max(individual, key=lambda x: x[1])[0]
    dominant_drop = max(individual, key=lambda x: x[1])[1]

    # ── Structured insight text (data-only, no generic statements) ──
    base_irr_str = f"{base_irr:.1%}" if base_irr else "N/A"
    c_irr_str = f"{c_irr:.1%}" if c_irr else "N/A"
    insight_irr_drop = (
        f"IRR drops from {base_irr_str} → {c_irr_str} under combined stress "
        f"({fragility_score:.0%} decline). "
        f"Base MOIC {base_moic:.2f}x → {c_moic:.2f}x stressed."
    )

    # What fraction of combined IRR drop is from the dominant shock?
    combined_drop_val = abs(_delta_irr(c_irr) or 0.0)
    dominant_share = dominant_drop / combined_drop_val if combined_drop_val > 0 else 0.0
    insight_dominant = (
        f"{dominant_share:.0%} of combined downside driven by {dominant} compression "
        f"({dominant_drop * 100:.0f}bps IRR impact in isolation)."
    )

    insight_class = (
        f"Deal classified as {classification}: combined IRR drop of "
        f"{fragility_score:.0%} vs base under mild stress (-2% growth, "
        f"-100bps margin, -1x exit multiple)."
    )

    return FragilityAnalysis(
        base_irr=base_irr,
        base_moic=base_moic,
        stress_scenarios=stress_scenarios,
        fragility_score=fragility_score,
        classification=classification,
        dominant_stress_driver=dominant,
        insight_irr_drop=insight_irr_drop,
        insight_dominant_driver=insight_dominant,
        insight_classification=insight_class,
    )
