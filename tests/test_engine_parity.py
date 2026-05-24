"""Cross-engine parity contract (refactor plan P1-6) — Python side.

Asserts the same structural invariants the TypeScript suite asserts
(tests/engine-parity.test.ts), so both engines are held to one contract in CI,
and validates the Python mirrors of the FCCR-maintenance-capex (P2-2) and
explicit-NWC (P2-8) fixes.

Scope note: these invariants are computed on the debt schedule and projections,
which do not depend on the IRR solver — so this suite is unaffected by the
pre-existing Python IRR-solver gaps exercised in test_irr.py / test_engine.py.
"""

import pytest

from backend.models.state import ModelState
from backend.models.debt import DebtTranche
from backend.engine.projections import build_projections
from backend.engine.debt_schedule import build_debt_schedule


def _base_state() -> ModelState:
    state = ModelState(deal_name="Parity Base", sector="Industrials", currency="GBP")
    state.revenue.base_revenue = 100.0
    state.revenue.growth_rates = [0.06, 0.05, 0.05, 0.04, 0.04]
    state.margins.base_ebitda_margin = 0.20
    state.margins.target_ebitda_margin = 0.25
    state.margins.da_pct_revenue = 0.03
    state.margins.capex_pct_revenue = 0.03  # maintenance capex
    state.margins.nwc_pct_revenue = 0.10
    state.exit.holding_period = 5
    state.exit.exit_ebitda_multiple = 10.0
    state.entry.entry_ebitda_multiple = 10.0
    state.debt_tranches = [
        DebtTranche(
            name="Senior TLB", tranche_type="senior", principal=80.0,
            interest_rate=0.07, rate_type="fixed", amortization_type="bullet",
        )
    ]
    state.derive_entry_fields()
    state.ensure_list_lengths()
    return state


class TestStructuralInvariants:
    def test_net_debt_equals_gross_minus_cash(self):
        state = _base_state()
        proj = build_projections(state)
        ds = build_debt_schedule(state, proj)
        for i in range(state.exit.holding_period):
            cash = ds.cash_balance_by_year[i] if i < len(ds.cash_balance_by_year) else 0.0
            expected = max(0.0, ds.total_debt_by_year[i] - cash)
            assert abs(ds.net_debt_by_year[i] - expected) < 1e-6


class TestSeniorLeverage:
    """P1-4 analogue — senior leverage sums senior tranches, not array slot 0."""

    def test_revolver_first_uses_term_loan(self):
        state = _base_state()
        state.debt_tranches = [
            DebtTranche(name="RCF", tranche_type="revolver", principal=0.0,
                        interest_rate=0.07, rate_type="fixed", amortization_type="bullet"),
            DebtTranche(name="Senior TLB", tranche_type="senior", principal=80.0,
                        interest_rate=0.07, rate_type="fixed", amortization_type="bullet"),
        ]
        state.derive_entry_fields()
        state.ensure_list_lengths()
        proj = build_projections(state)
        ds = build_debt_schedule(state, proj)
        ebitda_y1 = proj.years[0].ebitda_adj  # metric uses each year's EBITDA
        tlb_y1 = ds.tranche_schedules[1][0].ending_balance
        assert ds.senior_leverage_by_year[0] > 0  # not ~0 from an undrawn slot-0 revolver
        assert abs(ds.senior_leverage_by_year[0] - tlb_y1 / ebitda_y1) < 1e-6


class TestFCCRMaintenanceCapex:
    """P2-2 — FCCR numerator uses maintenance capex, excluding growth capex."""

    def test_fccr_excludes_growth_capex(self):
        state = _base_state()
        state.margins.growth_capex = [5.0] * state.exit.holding_period  # discretionary
        state.ensure_list_lengths()
        proj = build_projections(state)
        ds = build_debt_schedule(state, proj)
        for i, yr in enumerate(proj.years):
            debt_service = ds.total_cash_interest_by_year[i] + ds.total_mandatory_amort_by_year[i]
            if debt_service <= 0:
                continue
            maint = (yr.ebitda_adj - yr.maintenance_capex - yr.tax) / debt_service
            total = (yr.ebitda_adj - yr.total_capex - yr.tax) / debt_service
            assert abs(ds.fccr_by_year[i] - maint) < 1e-6  # uses maintenance capex
            assert abs(ds.fccr_by_year[i] - total) > 1e-6   # NOT total capex (growth excluded)


class TestExplicitNWC:
    """P2-8 — explicit NWC uses supplied per-year movements; falls back when absent."""

    def test_uses_explicit_movements(self):
        state = _base_state()
        state.margins.nwc_movement_method = "explicit"
        state.margins.nwc_explicit_by_year = [1.0, 2.0, 3.0, 4.0, 5.0]
        state.ensure_list_lengths()
        proj = build_projections(state)
        for i, yr in enumerate(proj.years):
            assert abs(yr.delta_nwc - [1.0, 2.0, 3.0, 4.0, 5.0][i]) < 1e-9

    def test_falls_back_when_no_data(self):
        state = _base_state()
        state.margins.nwc_movement_method = "explicit"
        state.margins.nwc_explicit_by_year = []
        state.ensure_list_lengths()
        proj = build_projections(state)
        prev = state.revenue.base_revenue
        for yr in proj.years:
            expected = (yr.revenue - prev) * state.margins.nwc_pct_revenue
            assert abs(yr.delta_nwc - expected) < 1e-6
            prev = yr.revenue


class TestDistributionsFromCash:
    """Distributions are paid from cash (capped) and reduce the cash balance."""

    def test_distribution_paid_and_reduces_cash(self):
        base = _base_state()
        proj_b = build_projections(base)
        ds_b = build_debt_schedule(base, proj_b)

        state = _base_state()
        state.exit.interim_distributions = [0.0, 5.0, 0.0, 0.0, 0.0]
        state.ensure_list_lengths()
        proj = build_projections(state)
        ds = build_debt_schedule(state, proj)

        assert abs(ds.distributions_paid_by_year[1] - 5.0) < 1e-6  # cash was available
        # Year-2 cash is lower than the no-distribution case by the distribution.
        assert ds.cash_balance_by_year[1] < ds_b.cash_balance_by_year[1] - 4.0

    def test_distribution_capped_at_available_cash(self):
        state = _base_state()
        # Year-1 cash cannot support a 1000 distribution — it must be capped.
        state.exit.interim_distributions = [1000.0, 0.0, 0.0, 0.0, 0.0]
        state.ensure_list_lengths()
        proj = build_projections(state)
        ds = build_debt_schedule(state, proj)
        assert ds.distributions_paid_by_year[0] < 1000.0
        assert ds.cash_balance_by_year[0] >= 0.0


class TestFloatingRateSteps:
    """P3-3 — floating tranches honour a forward base-rate path."""

    def test_effective_rate_tracks_path(self):
        state = _base_state()
        state.debt_tranches = [
            DebtTranche(
                name="Floating TLB", tranche_type="senior", principal=80.0,
                rate_type="floating", base_rate=0.03, spread=0.04, floor=0.0,
                amortization_type="bullet",
                base_rate_by_year=[0.03, 0.03, 0.06, 0.06, 0.06],
            )
        ]
        state.derive_entry_fields()
        state.ensure_list_lengths()
        proj = build_projections(state)
        ds = build_debt_schedule(state, proj)
        sched = ds.tranche_schedules[0]
        assert abs(sched[0].effective_rate - 0.07) < 1e-9   # 0.03 + 0.04
        assert abs(sched[2].effective_rate - 0.10) < 1e-9   # 0.06 + 0.04 (year-3 step)


class TestDynamicRevolver:
    """P3-4 — revolver draws to fund a cash shortfall and repays from excess."""

    def test_draws_under_shortfall_and_repays(self):
        state = _base_state()
        state.entry.min_cash_balance = 30.0
        state.debt_tranches = [
            DebtTranche(name="Senior TLB", tranche_type="senior", principal=80.0,
                        interest_rate=0.07, rate_type="fixed", amortization_type="bullet"),
            DebtTranche(name="RCF", tranche_type="revolver", principal=0.0, commitment=50.0,
                        interest_rate=0.07, rate_type="fixed", amortization_type="bullet",
                        commitment_fee=0.005),
        ]
        state.derive_entry_fields()
        state.ensure_list_lengths()
        proj = build_projections(state)
        ds = build_debt_schedule(state, proj)
        rcf = ds.tranche_schedules[1]
        # Year-1 operating cash is below the £30m floor → revolver is drawn to cover it.
        assert rcf[0].ending_balance > 10.0
        assert ds.cash_balance_by_year[0] == pytest.approx(30.0, abs=0.5)
        # Repaid from excess cash by the end of the hold.
        assert rcf[-1].ending_balance < rcf[0].ending_balance
