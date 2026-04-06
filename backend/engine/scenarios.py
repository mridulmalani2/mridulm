"""Scenario engine and sensitivity table generator — Sections 3.6 & 3.7."""

from __future__ import annotations

import copy
from typing import Optional

from backend.models.outputs import ScenarioSet, SensitivityTable
from backend.models.state import ModelState
from backend.engine.projections import build_projections, update_projections_with_debt
from backend.engine.debt_schedule import build_debt_schedule
from backend.engine.returns import calculate_returns


def _run_full_model(state: ModelState) -> tuple:
    """Run full model pipeline with iterative convergence and return (returns, projections, debt_schedule)."""
    state.derive_entry_fields()
    state.ensure_list_lengths()

    MAX_ITER = 5
    TOLERANCE = 0.01  # £m

    proj = build_projections(state)
    prev_total_interest = 0.0
    iterations = 0
    convergence_delta = 0.0

    for iteration in range(MAX_ITER):
        iterations = iteration + 1
        ds = build_debt_schedule(state, proj)

        # Build PIK array
        pik_by_year = []
        for yr_idx in range(state.exit.holding_period):
            pik = sum(
                ds.tranche_schedules[t][yr_idx].pik_accrual
                for t in range(len(ds.tranche_schedules))
            ) if ds.tranche_schedules else 0.0
            pik_by_year.append(pik)

        proj = update_projections_with_debt(
            proj, state,
            ds.total_cash_interest_by_year,
            pik_by_year,
            ds.total_repayment_by_year,
        )

        # Check convergence
        current_total_interest = sum(ds.total_cash_interest_by_year) if ds.total_cash_interest_by_year else 0.0
        convergence_delta = abs(current_total_interest - prev_total_interest)
        if convergence_delta < TOLERANCE and iteration > 0:
            break
        prev_total_interest = current_total_interest

    ret = calculate_returns(state, proj, ds)
    ret.convergence_iterations = iterations
    ret.convergence_delta = convergence_delta
    return ret, proj, ds


def _quick_irr_moic(state: ModelState) -> tuple[Optional[float], float, float]:
    """Run full model and return (irr, moic, exit_equity)."""
    ret, _, _ = _run_full_model(state)
    return ret.irr, ret.moic, ret.exit_equity


# ── Scenario Generation ──────────────────────────────────────────────────

def generate_scenarios(state: ModelState) -> list[ScenarioSet]:
    """Generate Bear, Base, Bull, Stress scenarios per Section 3.6."""
    hp = state.exit.holding_period
    base_growth = list(state.revenue.growth_rates)
    base_margins = list(state.margins.margin_by_year)
    base_exit_mult = state.exit.exit_ebitda_multiple
    base_entry_mult = state.entry.entry_ebitda_multiple
    base_margin_expansion = state.margins.target_ebitda_margin - state.margins.base_ebitda_margin

    scenarios: list[ScenarioSet] = []

    # Base
    irr_base, moic_base, eq_base = _quick_irr_moic(state)
    scenarios.append(ScenarioSet(
        name="base",
        growth_rates=base_growth,
        margin_by_year=base_margins,
        exit_multiple=base_exit_mult,
        leverage_ratio=state.entry.leverage_ratio,
        irr=irr_base,
        moic=moic_base,
        exit_equity=eq_base,
        description="Base case using current assumptions.",
    ))

    # Bear: growth -200bps, exit multiple -1.5x, margin at 50% expansion, leverage -0.5x
    bear = copy.deepcopy(state)
    bear.revenue.growth_rates = [max(g - 0.02, -0.10) for g in base_growth]
    bear.exit.exit_ebitda_multiple = max(base_exit_mult - 1.5, 1.0)
    half_expansion = base_margin_expansion * 0.5
    bear.margins.target_ebitda_margin = state.margins.base_ebitda_margin + half_expansion
    bear.margins.margin_by_year = []  # force rebuild
    # Leverage: Base - 0.5x (reduce debt proportionally)
    bear_leverage = max(state.entry.leverage_ratio - 0.5, 0.0)
    ebitda = state.revenue.base_revenue * state.margins.base_ebitda_margin
    bear_debt = bear_leverage * ebitda
    old_total = sum(t.principal for t in bear.debt_tranches)
    if old_total > 0:
        scale = bear_debt / old_total
        for t in bear.debt_tranches:
            t.principal = t.principal * scale
            t.amortization_schedule = []  # force rebuild
    bear.ensure_list_lengths()
    bear.derive_entry_fields()
    irr_bear, moic_bear, eq_bear = _quick_irr_moic(bear)
    scenarios.append(ScenarioSet(
        name="bear",
        growth_rates=bear.revenue.growth_rates,
        margin_by_year=bear.margins.margin_by_year,
        exit_multiple=bear.exit.exit_ebitda_multiple,
        leverage_ratio=bear.entry.leverage_ratio,
        irr=irr_bear,
        moic=moic_bear,
        exit_equity=eq_bear,
        description="Bear: -200bps growth, -1.5x exit multiple, 50% margin expansion.",
    ))

    # Bull: growth +200bps, exit multiple +1.0x, margin ×1.3
    bull = copy.deepcopy(state)
    bull.revenue.growth_rates = [g + 0.02 for g in base_growth]
    bull.exit.exit_ebitda_multiple = base_exit_mult + 1.0
    bull.margins.target_ebitda_margin = state.margins.base_ebitda_margin + base_margin_expansion * 1.3
    bull.margins.margin_by_year = []
    bull.ensure_list_lengths()
    bull.derive_entry_fields()
    irr_bull, moic_bull, eq_bull = _quick_irr_moic(bull)
    scenarios.append(ScenarioSet(
        name="bull",
        growth_rates=bull.revenue.growth_rates,
        margin_by_year=bull.margins.margin_by_year,
        exit_multiple=bull.exit.exit_ebitda_multiple,
        leverage_ratio=bull.entry.leverage_ratio,
        irr=irr_bull,
        moic=moic_bull,
        exit_equity=eq_bull,
        description="Bull: +200bps growth, +1.0x exit multiple, 130% margin expansion.",
    ))

    # Stress: 0% growth yr1-2, then base×0.5; entry multiple -1.0x; flat margin
    stress = copy.deepcopy(state)
    stress_growth = []
    for t in range(hp):
        if t < 2:
            stress_growth.append(0.0)
        else:
            stress_growth.append(base_growth[t] * 0.5 if t < len(base_growth) else 0.0)
    stress.revenue.growth_rates = stress_growth
    stress.exit.exit_ebitda_multiple = max(base_entry_mult - 1.0, 1.0)
    stress.margins.target_ebitda_margin = state.margins.base_ebitda_margin  # flat
    stress.margins.margin_by_year = []
    stress.ensure_list_lengths()
    stress.derive_entry_fields()
    irr_stress, moic_stress, eq_stress = _quick_irr_moic(stress)
    scenarios.append(ScenarioSet(
        name="stress",
        growth_rates=stress.revenue.growth_rates,
        margin_by_year=stress.margins.margin_by_year,
        exit_multiple=stress.exit.exit_ebitda_multiple,
        leverage_ratio=stress.entry.leverage_ratio,
        irr=irr_stress,
        moic=moic_stress,
        exit_equity=eq_stress,
        description="Stress: 0% growth yr1-2, halved thereafter, -1.0x exit multiple, flat margin.",
    ))

    return scenarios


# ── Sensitivity Tables ───────────────────────────────────────────────────

def generate_sensitivity_tables(state: ModelState) -> list[SensitivityTable]:
    """Generate all 4 sensitivity tables per Section 3.7."""
    tables: list[SensitivityTable] = []

    base_growth_avg = sum(state.revenue.growth_rates) / len(state.revenue.growth_rates) if state.revenue.growth_rates else 0.05
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
    # Clamp to non-negative
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
    s.margins.target_ebitda_margin = max(min(margin, 0.95), 0.01)


def _apply_entry_exit_mult(s: ModelState, entry_mult: float, exit_mult: float) -> None:
    s.entry.entry_ebitda_multiple = max(entry_mult, 1.0)
    s.entry.enterprise_value = 0  # force recalc from multiple
    s.exit.exit_ebitda_multiple = max(exit_mult, 1.0)


def _apply_leverage_exit_mult(s: ModelState, leverage: float, exit_mult: float) -> None:
    ebitda = s.revenue.base_revenue * s.margins.base_ebitda_margin
    new_debt = leverage * ebitda
    # Scale debt tranches proportionally
    old_total = sum(t.principal for t in s.debt_tranches)
    if old_total > 0 and s.debt_tranches:
        scale = new_debt / old_total
        for t in s.debt_tranches:
            t.principal = t.principal * scale
            t.amortization_schedule = []  # force rebuild
    elif s.debt_tranches:
        s.debt_tranches[0].principal = new_debt
    s.exit.exit_ebitda_multiple = max(exit_mult, 1.0)
