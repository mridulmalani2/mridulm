"""Scenario engine and sensitivity table generator — Sections 3.6 & 3.7.

Audit-driven changes (audit_report_part2.md, scenarios.py findings):
  * Stress exit multiple uses base EXIT multiple (not entry) (FINDING 3).
  * Debt sizing in Bear / leverage sensitivities uses forward (Year 1) EBITDA
    consistent with the scenario's growth and margin assumptions (FINDINGS 1 & 8).
  * Leverage adjustments scale only the most junior tranche by default,
    preserving senior tranche structure (FINDINGS 2 & 9).
  * Sensitivity centering uses CAGR (geometric mean) of growth rates (FINDING 4).
  * Margins are clamped at assignment in Bull and Bear (FINDINGS 10, 11).
"""

from __future__ import annotations

import copy
from typing import Optional

from backend.models.outputs import ScenarioSet, SensitivityTable
from backend.models.state import ModelState
from backend.engine.projections import build_projections, update_projections_with_debt
from backend.engine.debt_schedule import build_debt_schedule
from backend.engine.returns import calculate_returns, decompose_value_drivers
from backend.engine.add_ons import inject_add_ons, strip_synthetic_add_on_tranches


_MARGIN_FLOOR = 0.01
_MARGIN_CEIL = 0.95
# Default covenant thresholds for scenario breach detection (Python has no
# covenant config on ModelState; mirrors the TypeScript defaults).
_DEFAULT_LEVERAGE_COV = 6.0
_DEFAULT_DSCR_COV = 1.25


def _clamp_margin(value: float) -> float:
    return max(min(value, _MARGIN_CEIL), _MARGIN_FLOOR)


def _forward_ebitda(state: ModelState) -> float:
    """Return Year 1 forward EBITDA consistent with current scenario assumptions.

    Uses the first growth rate and either the first margin in margin_by_year (if
    populated) or the base EBITDA margin. This is the canonical lender-style
    EBITDA basis for leverage capacity (audit FINDINGS 1 & 8).
    """
    growth = state.revenue.growth_rates[0] if state.revenue.growth_rates else 0.0
    fwd_revenue = state.revenue.base_revenue * (1.0 + growth)
    if state.margins.margin_by_year:
        margin = state.margins.margin_by_year[0]
    else:
        margin = state.margins.base_ebitda_margin
    return fwd_revenue * margin


def _resize_debt_to_target(state: ModelState, target_total_debt: float) -> None:
    """Resize the capital structure to hit `target_total_debt`.

    Per audit FINDINGS 2 & 9: senior tranches are preserved; the most-junior
    tranche absorbs the leverage delta. If the change is negative and exceeds
    the junior tranche, fall back to pro-rata scaling across remaining tranches.
    """
    if not state.debt_tranches:
        return
    tranches = state.debt_tranches
    target_total_debt = max(0.0, target_total_debt)

    # Identify junior tranche: last tranche, or pik / mezzanine if present.
    junior_idx = len(tranches) - 1
    for i, t in enumerate(tranches):
        ttype = (t.tranche_type or "").lower()
        if any(k in ttype for k in ("pik", "mezz", "subordinate", "second_lien", "junior")):
            junior_idx = i

    senior_total = sum(
        t.principal for i, t in enumerate(tranches) if i != junior_idx
    )
    delta = target_total_debt - senior_total
    if delta >= 0:
        tranches[junior_idx].principal = delta
        tranches[junior_idx].amortization_schedule = []
    else:
        # Cannot fit the target with junior alone — pro-rata scale the seniors
        tranches[junior_idx].principal = 0.0
        tranches[junior_idx].amortization_schedule = []
        if senior_total > 0:
            scale = target_total_debt / senior_total
            for i, t in enumerate(tranches):
                if i != junior_idx:
                    t.principal = t.principal * scale
                    t.amortization_schedule = []


def _run_full_model(state: ModelState) -> tuple:
    """Run full model pipeline with iterative convergence and return (returns, projections, debt_schedule)."""
    # Add-on acquisitions (D): strip stale synthetic tranches so entry fields are
    # derived on real entry debt, then inject bolt-on revenue + synthetic acquisition
    # debt so projections, the debt schedule and returns all reflect them. The original
    # (non-synthetic) tranche list is restored before returning.
    strip_synthetic_add_on_tranches(state)
    state.derive_entry_fields()
    state.ensure_list_lengths()
    _, _original_tranches = inject_add_ons(state)

    MAX_ITER = 5
    # Tolerance scales with deal size (flat £0.01m is ~1bp on a £1bn deal).
    TOLERANCE = max(0.01, state.revenue.base_revenue * 0.0001)

    proj = build_projections(state)
    prev_total_interest = 0.0
    iterations = 0
    convergence_delta = 0.0
    ds = None

    for iteration in range(MAX_ITER):
        iterations = iteration + 1
        ds = build_debt_schedule(state, proj)

        # Build PIK / new-borrowing arrays
        pik_by_year = []
        for yr_idx in range(state.exit.holding_period):
            pik = sum(
                ds.tranche_schedules[t][yr_idx].pik_accrual
                for t in range(len(ds.tranche_schedules))
            ) if ds.tranche_schedules else 0.0
            pik_by_year.append(pik)
        new_borrowings_by_year = [0.0] * state.exit.holding_period

        proj = update_projections_with_debt(
            proj, state,
            ds.total_cash_interest_by_year,
            pik_by_year,
            ds.total_repayment_by_year,
            new_borrowings_by_year,
        )

        # Check convergence
        current_total_interest = sum(ds.total_cash_interest_by_year) if ds.total_cash_interest_by_year else 0.0
        convergence_delta = abs(current_total_interest - prev_total_interest)
        # Allow iteration 0 to exit early (e.g. an all-equity / already-converged deal).
        if convergence_delta < TOLERANCE:
            break
        prev_total_interest = current_total_interest

    ret = calculate_returns(state, proj, ds)
    ret.convergence_iterations = iterations
    ret.convergence_delta = convergence_delta
    # Restore the real entry tranche list — synthetic add-on debt lives only in `ds`.
    state.debt_tranches = _original_tranches
    return ret, proj, ds


def _quick_irr_moic(state: ModelState) -> tuple[Optional[float], float, float]:
    """Run full model and return (irr, moic, exit_equity)."""
    ret, _, _ = _run_full_model(state)
    return ret.irr, ret.moic, ret.exit_equity


def _scenario_metrics(state: ModelState) -> dict:
    """Run the full model and extract returns, per-year credit metrics,
    covenant-breach timing, survival, and the value-driver bridge (P3-5 / P3-6)."""
    ret, proj, ds = _run_full_model(state)
    dscr = ds.dscr_by_year
    lev = ds.leverage_ratio_by_year
    breach = None
    for i in range(len(lev)):
        d = dscr[i] if i < len(dscr) else float("inf")
        if lev[i] > _DEFAULT_LEVERAGE_COV or d < _DEFAULT_DSCR_COV:
            breach = i + 1
            break
    # Python tracks an interest shortfall rather than ECF: no shortfall ⇒ survives.
    survives = all(s <= 0 for s in (ds.interest_shortfall_by_year or []))
    return {
        "irr": ret.irr,
        "moic": ret.moic,
        "exit_equity": ret.exit_equity,
        "dscr_by_year": dscr,
        "leverage_by_year": lev,
        "covenant_breach_year": breach,
        "survives_hold": survives,
        "value_drivers": decompose_value_drivers(state, proj, ds, ret),
    }


# ── Scenario Generation ──────────────────────────────────────────────────

def generate_scenarios(state: ModelState) -> list[ScenarioSet]:
    """Generate Bear, Base, Bull, Stress scenarios per Section 3.6."""
    hp = state.exit.holding_period
    base_growth = list(state.revenue.growth_rates)
    base_margins = list(state.margins.margin_by_year)
    base_exit_mult = state.exit.exit_ebitda_multiple
    base_margin_expansion = state.margins.target_ebitda_margin - state.margins.base_ebitda_margin

    scenarios: list[ScenarioSet] = []

    # Base
    base_m = _scenario_metrics(state)
    scenarios.append(ScenarioSet(
        name="base",
        growth_rates=base_growth,
        margin_by_year=base_margins,
        exit_multiple=base_exit_mult,
        leverage_ratio=state.entry.leverage_ratio,
        irr=base_m["irr"],
        moic=base_m["moic"],
        exit_equity=base_m["exit_equity"],
        description="Base case using current assumptions.",
        dscr_by_year=base_m["dscr_by_year"],
        leverage_by_year=base_m["leverage_by_year"],
        covenant_breach_year=base_m["covenant_breach_year"],
        survives_hold=base_m["survives_hold"],
        value_drivers=base_m["value_drivers"],
    ))

    # Bear: growth -200bps, exit multiple -1.5x, margin at 50% expansion, leverage -0.5x
    bear = copy.deepcopy(state)
    bear.revenue.growth_rates = [max(g - 0.02, -0.10) for g in base_growth]
    bear.exit.exit_ebitda_multiple = max(base_exit_mult - 1.5, 1.0)
    half_expansion = base_margin_expansion * 0.5
    # FINDING 11: clamp at assignment
    bear.margins.target_ebitda_margin = _clamp_margin(
        state.margins.base_ebitda_margin + half_expansion
    )
    bear.margins.margin_by_year = []  # force rebuild
    # Rebuild margins/lengths BEFORE sizing debt so forward EBITDA reflects
    # the new growth and margin assumptions (FINDING 1 — no circular dep).
    bear.ensure_list_lengths()
    bear_leverage = max(state.entry.leverage_ratio - 0.5, 0.0)
    fwd_ebitda_bear = _forward_ebitda(bear)
    bear_debt = bear_leverage * fwd_ebitda_bear
    _resize_debt_to_target(bear, bear_debt)
    bear.derive_entry_fields()
    bear.ensure_list_lengths()
    bear_m = _scenario_metrics(bear)
    scenarios.append(ScenarioSet(
        name="bear",
        growth_rates=bear.revenue.growth_rates,
        margin_by_year=bear.margins.margin_by_year,
        exit_multiple=bear.exit.exit_ebitda_multiple,
        leverage_ratio=bear.entry.leverage_ratio,
        irr=bear_m["irr"],
        moic=bear_m["moic"],
        exit_equity=bear_m["exit_equity"],
        description="Bear: -200bps growth, -1.5x exit multiple, 50% margin expansion.",
        dscr_by_year=bear_m["dscr_by_year"],
        leverage_by_year=bear_m["leverage_by_year"],
        covenant_breach_year=bear_m["covenant_breach_year"],
        survives_hold=bear_m["survives_hold"],
        value_drivers=bear_m["value_drivers"],
    ))

    # Bull: growth +200bps, exit multiple +1.0x, margin ×1.3
    bull = copy.deepcopy(state)
    bull.revenue.growth_rates = [g + 0.02 for g in base_growth]
    bull.exit.exit_ebitda_multiple = base_exit_mult + 1.0
    # FINDING 10: clamp at assignment
    bull.margins.target_ebitda_margin = _clamp_margin(
        state.margins.base_ebitda_margin + base_margin_expansion * 1.3
    )
    bull.margins.margin_by_year = []
    bull.ensure_list_lengths()
    bull.derive_entry_fields()
    bull_m = _scenario_metrics(bull)
    scenarios.append(ScenarioSet(
        name="bull",
        growth_rates=bull.revenue.growth_rates,
        margin_by_year=bull.margins.margin_by_year,
        exit_multiple=bull.exit.exit_ebitda_multiple,
        leverage_ratio=bull.entry.leverage_ratio,
        irr=bull_m["irr"],
        moic=bull_m["moic"],
        exit_equity=bull_m["exit_equity"],
        description="Bull: +200bps growth, +1.0x exit multiple, 130% margin expansion.",
        dscr_by_year=bull_m["dscr_by_year"],
        leverage_by_year=bull_m["leverage_by_year"],
        covenant_breach_year=bull_m["covenant_breach_year"],
        survives_hold=bull_m["survives_hold"],
        value_drivers=bull_m["value_drivers"],
    ))

    # Stress: 0% growth yr1-2, then base×0.5; exit multiple -1.0x; flat margin
    stress = copy.deepcopy(state)
    stress_growth = []
    for t in range(hp):
        if t < 2:
            stress_growth.append(0.0)
        else:
            stress_growth.append(base_growth[t] * 0.5 if t < len(base_growth) else 0.0)
    stress.revenue.growth_rates = stress_growth
    # FINDING 3: must use base EXIT multiple, not entry multiple
    stress.exit.exit_ebitda_multiple = max(base_exit_mult - 1.0, 1.0)
    stress.margins.target_ebitda_margin = state.margins.base_ebitda_margin  # flat
    stress.margins.margin_by_year = []
    stress.ensure_list_lengths()
    stress.derive_entry_fields()
    stress_m = _scenario_metrics(stress)
    scenarios.append(ScenarioSet(
        name="stress",
        growth_rates=stress.revenue.growth_rates,
        margin_by_year=stress.margins.margin_by_year,
        exit_multiple=stress.exit.exit_ebitda_multiple,
        leverage_ratio=stress.entry.leverage_ratio,
        irr=stress_m["irr"],
        moic=stress_m["moic"],
        exit_equity=stress_m["exit_equity"],
        description="Stress: 0% growth yr1-2, halved thereafter, -1.0x exit multiple, flat margin.",
        dscr_by_year=stress_m["dscr_by_year"],
        leverage_by_year=stress_m["leverage_by_year"],
        covenant_breach_year=stress_m["covenant_breach_year"],
        survives_hold=stress_m["survives_hold"],
        value_drivers=stress_m["value_drivers"],
    ))

    return scenarios


# ── Sensitivity Tables ───────────────────────────────────────────────────

def _growth_cagr(state: ModelState) -> float:
    """CAGR of revenue across the projected growth rates (FINDING 4)."""
    rates = state.revenue.growth_rates
    if not rates:
        return 0.05
    base_rev = state.revenue.base_revenue
    if base_rev <= 0:
        return 0.05
    final_rev = base_rev
    for g in rates:
        final_rev *= (1.0 + g)
    n = len(rates)
    if n == 0 or final_rev <= 0:
        return 0.05
    return (final_rev / base_rev) ** (1.0 / n) - 1.0


def generate_sensitivity_tables(state: ModelState) -> list[SensitivityTable]:
    """Generate all 4 sensitivity tables per Section 3.7."""
    tables: list[SensitivityTable] = []

    base_growth_avg = _growth_cagr(state)
    base_exit_mult = state.exit.exit_ebitda_multiple
    base_entry_mult = state.entry.entry_ebitda_multiple
    base_exit_margin = state.margins.target_ebitda_margin

    # Table 1: Revenue Growth × Exit Multiple
    growth_range = [base_growth_avg + (i - 4) * 0.01 for i in range(9)]
    exit_mult_range = [base_exit_mult + (i - 4) * 0.5 for i in range(9)]
    tables.append(_build_table(
        state, 1, "revenue_growth", "exit_multiple",
        growth_range, exit_mult_range,
        _apply_growth_exit_mult,
    ))

    # Table 2: Revenue Growth × EBITDA Margin
    margin_range = [base_exit_margin + (i - 4) * 0.015 for i in range(9)]
    tables.append(_build_table(
        state, 2, "revenue_growth", "ebitda_margin",
        growth_range, margin_range,
        _apply_growth_margin,
    ))

    # Table 3: Entry Multiple × Exit Multiple
    entry_mult_range = [base_entry_mult + (i - 4) * 0.5 for i in range(9)]
    tables.append(_build_table(
        state, 3, "entry_multiple", "exit_multiple",
        entry_mult_range, exit_mult_range,
        _apply_entry_exit_mult,
    ))

    # Table 4: Leverage × Exit Multiple (9 rows centered on base leverage, 0.5x steps)
    base_lev = state.entry.leverage_ratio
    leverage_range_9 = [base_lev + (i - 4) * 0.5 for i in range(9)]
    leverage_range_9 = [max(0.0, lv) for lv in leverage_range_9]
    tables.append(_build_table(
        state, 4, "leverage", "exit_multiple",
        leverage_range_9, exit_mult_range,
        _apply_leverage_exit_mult,
    ))

    return tables


def _build_table(
    state: ModelState,
    table_id: int,
    row_var: str,
    col_var: str,
    row_values: list[float],
    col_values: list[float],
    apply_fn,
) -> SensitivityTable:
    irr_matrix: list[list[Optional[float]]] = []
    moic_matrix: list[list[float]] = []

    for rv in row_values:
        irr_row: list[Optional[float]] = []
        moic_row: list[float] = []
        for cv in col_values:
            s = copy.deepcopy(state)
            apply_fn(s, rv, cv)
            s.margins.margin_by_year = []
            s.ensure_list_lengths()
            s.derive_entry_fields()
            irr, moic, _ = _quick_irr_moic(s)
            irr_row.append(irr)
            moic_row.append(moic)
        irr_matrix.append(irr_row)
        moic_matrix.append(moic_row)

    return SensitivityTable(
        table_id=table_id,
        row_variable=row_var,
        col_variable=col_var,
        row_values=row_values,
        col_values=col_values,
        irr_matrix=irr_matrix,
        moic_matrix=moic_matrix,
    )


def _apply_growth_exit_mult(s: ModelState, growth: float, exit_mult: float) -> None:
    s.revenue.growth_rates = [growth] * s.exit.holding_period
    s.exit.exit_ebitda_multiple = max(exit_mult, 1.0)


def _apply_growth_margin(s: ModelState, growth: float, margin: float) -> None:
    s.revenue.growth_rates = [growth] * s.exit.holding_period
    s.margins.target_ebitda_margin = _clamp_margin(margin)


def _apply_entry_exit_mult(s: ModelState, entry_mult: float, exit_mult: float) -> None:
    s.entry.entry_ebitda_multiple = max(entry_mult, 1.0)
    # Force EV recalc from multiple — derive_entry_fields back-solves when EV=0
    s.entry.enterprise_value = 0
    s.exit.exit_ebitda_multiple = max(exit_mult, 1.0)


def _apply_leverage_exit_mult(s: ModelState, leverage: float, exit_mult: float) -> None:
    # Forward EBITDA basis (FINDING 8) — must rebuild margin/length lists first
    s.margins.margin_by_year = []
    s.ensure_list_lengths()
    fwd_ebitda = _forward_ebitda(s)
    new_debt = leverage * fwd_ebitda
    # FINDING 9: junior-tranche-only adjustment preserves senior structure
    _resize_debt_to_target(s, new_debt)
    s.exit.exit_ebitda_multiple = max(exit_mult, 1.0)
