"""Unit tests for projections, returns, and value bridge."""

import pytest
import copy

from backend.models.state import ModelState
from backend.models.debt import DebtTranche
from backend.engine.projections import build_projections, update_projections_with_debt
from backend.engine.debt_schedule import build_debt_schedule
from backend.engine.returns import calculate_returns, decompose_value_drivers


def _make_base_state() -> ModelState:
    """Create a realistic base-case ModelState for testing."""
    state = ModelState(
        deal_name="Test Deal",
        sector="Industrials",
        currency="GBP",
    )
    state.revenue.base_revenue = 100.0
    state.revenue.growth_rates = [0.05] * 5
    state.margins.base_ebitda_margin = 0.20
    state.margins.target_ebitda_margin = 0.25
    state.margins.da_pct_revenue = 0.03
    state.margins.capex_pct_revenue = 0.03
    state.margins.nwc_pct_revenue = 0.10
    state.exit.holding_period = 5
    state.exit.exit_ebitda_multiple = 10.0
    state.entry.entry_ebitda_multiple = 10.0

    # Add a senior term loan
    state.debt_tranches = [
        DebtTranche(
            name="Senior Term Loan A",
            principal=80.0,
            interest_rate=0.05,
            rate_type="fixed",
            amortization_type="bullet",
        )
    ]

    state.fees.entry_fee_pct = 0.02
    state.fees.exit_fee_pct = 0.015
    state.fees.financing_fee_pct = 0.02
    state.fees.transaction_costs = 5.0
    state.fees.monitoring_fee_annual = 1.0
    state.mip.mip_pool_pct = 0.15
    state.mip.hurdle_moic = 2.0

    state.derive_entry_fields()
    state.ensure_list_lengths()
    return state


class TestProjections:
    def test_revenue_grows(self):
        state = _make_base_state()
        proj = build_projections(state)
        assert len(proj.years) == 5
        # Revenue should grow 5% per year
        assert proj.years[0].revenue == pytest.approx(105.0, rel=0.01)
        assert proj.years[4].revenue > proj.years[0].revenue

    def test_ebitda_margin_improves(self):
        state = _make_base_state()
        proj = build_projections(state)
        # Margin should be between base and target
        assert proj.years[0].ebitda_margin > state.margins.base_ebitda_margin
        assert proj.years[4].ebitda_margin == pytest.approx(
            state.margins.target_ebitda_margin, abs=0.01
        )

    def test_monitoring_fee_reduces_ebitda(self):
        state = _make_base_state()
        proj = build_projections(state)
        for yr in proj.years:
            assert yr.ebitda_adj == pytest.approx(yr.ebitda - 1.0, rel=0.01)

    def test_fcf_positive(self):
        state = _make_base_state()
        proj = build_projections(state)
        for yr in proj.years:
            assert yr.fcf_pre_debt > 0


class TestFullModel:
    def _run_full(self, state: ModelState):
        proj = build_projections(state)
        ds = build_debt_schedule(state, proj)
        # Second pass
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
        ret = calculate_returns(state, proj, ds)
        return proj, ds, ret

    def test_irr_positive_for_base_case(self):
        state = _make_base_state()
        _, _, ret = self._run_full(state)
        assert ret.irr is not None
        assert ret.irr > 0

    def test_moic_above_1(self):
        state = _make_base_state()
        _, _, ret = self._run_full(state)
        assert ret.moic > 1.0

    def test_entry_equity_calculation(self):
        state = _make_base_state()
        _, _, ret = self._run_full(state)
        # EV = 100 * 0.20 * 10 = 200
        # Financing fees = 0.02 * 80 = 1.6
        # Equity = 200 + 5.0 + 1.6 - 80 = 126.6
        assert ret.entry_equity == pytest.approx(126.6, abs=0.1)

    def test_value_bridge_reconciles(self):
        state = _make_base_state()
        proj, ds, ret = self._run_full(state)
        vd = decompose_value_drivers(state, proj, ds, ret)
        total = (
            vd.revenue_growth_contribution_abs
            + vd.margin_expansion_contribution_abs
            + vd.multiple_expansion_contribution_abs
            + vd.debt_paydown_contribution_abs
            + vd.fees_drag_contribution_abs
        )
        assert abs(total - vd.total_equity_gain) < 1.0  # within £1m tolerance

    def test_negative_equity_handled(self):
        state = _make_base_state()
        state.debt_tranches[0].principal = 500.0  # way more debt than EV
        state.derive_entry_fields()
        state.ensure_list_lengths()
        _, _, ret = self._run_full(state)
        assert ret.irr_convergence_failed or ret.entry_equity < 0

    def test_zero_growth(self):
        state = _make_base_state()
        state.revenue.growth_rates = [0.0] * 5
        state.ensure_list_lengths()
        _, _, ret = self._run_full(state)
        assert ret.irr is not None  # should still compute

    def test_unlevered_irr_lower_than_levered(self):
        state = _make_base_state()
        _, _, ret = self._run_full(state)
        if ret.irr_unlevered is not None and ret.irr is not None:
            # Leverage amplifies returns, so levered > unlevered when deal works
            assert ret.irr >= ret.irr_unlevered or abs(ret.irr - ret.irr_unlevered) < 0.05
