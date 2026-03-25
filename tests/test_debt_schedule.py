"""Debt schedule test cases from Section 12."""

import pytest
from backend.models.state import ModelState
from backend.models.debt import DebtTranche
from backend.engine.projections import build_projections
from backend.engine.debt_schedule import build_debt_schedule


def _make_state_with_tranche(tranche: DebtTranche, hp: int = 5) -> ModelState:
    state = ModelState()
    state.revenue.base_revenue = 100.0
    state.margins.base_ebitda_margin = 0.20
    state.margins.target_ebitda_margin = 0.25
    state.exit.holding_period = hp
    state.entry.entry_ebitda_multiple = 10.0
    state.debt_tranches = [tranche]
    state.derive_entry_fields()
    state.ensure_list_lengths()
    return state


class TestBulletRepayment:
    def test_balance_flat_then_repaid(self):
        """Bullet: balance flat years 1-4, fully repaid year 5."""
        tranche = DebtTranche(
            name="Bullet",
            principal=80.0,
            interest_rate=0.05,
            rate_type="fixed",
            amortization_type="bullet",
        )
        state = _make_state_with_tranche(tranche)
        proj = build_projections(state)
        ds = build_debt_schedule(state, proj)

        sched = ds.tranche_schedules[0]
        # Years 1-4: ending balance = 80
        for yr in sched[:4]:
            assert yr.ending_balance == pytest.approx(80.0, abs=0.01)
        # Year 5: fully repaid
        assert sched[4].ending_balance == pytest.approx(0.0, abs=0.01)
        assert sched[4].total_repayment == pytest.approx(80.0, abs=0.01)


class TestStraightLine:
    def test_balance_decreases_linearly(self):
        """Straight-line: balance decreases by equal amounts each year."""
        tranche = DebtTranche(
            name="Straight Line",
            principal=100.0,
            interest_rate=0.05,
            rate_type="fixed",
            amortization_type="straight_line",
        )
        state = _make_state_with_tranche(tranche)
        proj = build_projections(state)
        ds = build_debt_schedule(state, proj)

        sched = ds.tranche_schedules[0]
        # Each year repays 20 (100/5)
        for yr in sched:
            assert yr.scheduled_repayment == pytest.approx(20.0, abs=0.01)
        # Ending balance decreases: 80, 60, 40, 20, 0
        expected = [80.0, 60.0, 40.0, 20.0, 0.0]
        for i, yr in enumerate(sched):
            assert yr.ending_balance == pytest.approx(expected[i], abs=0.01)


class TestPIK:
    def test_balance_grows_no_cash_interest(self):
        """PIK: balance grows each year, no cash interest."""
        tranche = DebtTranche(
            name="PIK Note",
            principal=50.0,
            interest_rate=0.10,
            rate_type="fixed",
            amortization_type="PIK",
            pik_rate=0.10,
            cash_interest=False,
        )
        state = _make_state_with_tranche(tranche)
        proj = build_projections(state)
        ds = build_debt_schedule(state, proj)

        sched = ds.tranche_schedules[0]
        prev_bal = 50.0
        for yr in sched:
            # No cash interest
            assert yr.cash_interest == pytest.approx(0.0, abs=0.01)
            # PIK accrues
            assert yr.pik_accrual > 0
            # Balance grows
            assert yr.ending_balance > prev_bal or yr.ending_balance == pytest.approx(prev_bal * 1.1, abs=0.1)
            prev_bal = yr.ending_balance


class TestCashSweep:
    def test_excess_fcf_applied(self):
        """Cash sweep: excess FCF reduces debt."""
        tranche = DebtTranche(
            name="Sweep Loan",
            principal=80.0,
            interest_rate=0.05,
            rate_type="fixed",
            amortization_type="cash_sweep",
            cash_sweep_pct=0.50,
        )
        state = _make_state_with_tranche(tranche)
        proj = build_projections(state)
        ds = build_debt_schedule(state, proj)

        sched = ds.tranche_schedules[0]
        # Should have some sweep repayment
        total_sweep = sum(yr.sweep_repayment for yr in sched)
        assert total_sweep > 0
        # Ending balance should decrease over time
        assert sched[-1].ending_balance < sched[0].beginning_balance


class TestFloatingRate:
    def test_floor_applied(self):
        """Floating rate: effective = max(base + spread, floor)."""
        tranche = DebtTranche(
            name="Floating",
            principal=80.0,
            interest_rate=0.06,
            rate_type="floating",
            base_rate=0.02,
            spread=0.03,
            floor=0.06,
            amortization_type="bullet",
        )
        state = _make_state_with_tranche(tranche)
        proj = build_projections(state)
        ds = build_debt_schedule(state, proj)

        sched = ds.tranche_schedules[0]
        # base_rate(0.02) + spread(0.03) = 0.05 < floor(0.06)
        # So effective rate should be 0.06
        assert sched[0].effective_rate == pytest.approx(0.06, abs=0.001)
        assert sched[0].cash_interest == pytest.approx(80.0 * 0.06, abs=0.1)


class TestAggregateMetrics:
    def test_leverage_ratio_decreases(self):
        """With amortizing debt, leverage should decrease over time."""
        tranche = DebtTranche(
            name="Amortizing",
            principal=80.0,
            interest_rate=0.05,
            rate_type="fixed",
            amortization_type="straight_line",
        )
        state = _make_state_with_tranche(tranche)
        proj = build_projections(state)
        ds = build_debt_schedule(state, proj)

        # Leverage should decrease as debt is paid down and EBITDA grows
        assert ds.leverage_ratio_by_year[-1] < ds.leverage_ratio_by_year[0]

    def test_interest_coverage_positive(self):
        tranche = DebtTranche(
            name="Senior",
            principal=80.0,
            interest_rate=0.05,
            rate_type="fixed",
            amortization_type="bullet",
        )
        state = _make_state_with_tranche(tranche)
        proj = build_projections(state)
        ds = build_debt_schedule(state, proj)

        for cov in ds.interest_coverage_by_year:
            assert cov > 0
