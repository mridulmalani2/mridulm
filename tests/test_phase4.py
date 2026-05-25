"""Phase 4 — PR A (Python mirror): MIP ratchet (P4-1), fund-level returns (P4-2),
partial exits (P4-5), and the three-statement close gate (P4-7) for the new paths.

Mirrors tests/phase4.test.ts. Every feature is opt-in — with the new fields absent
the engine is unchanged (held by tests/test_engine_parity.py)."""

import pytest

from backend.models.state import ModelState, MIPRatchetTier, PartialExitEvent, FundAssumptions
from backend.models.debt import DebtTranche, RefinancingEvent
from backend.engine.scenarios import _run_full_model
from backend.engine.projections import build_projections
from backend.engine.debt_schedule import build_debt_schedule
from backend.engine.balance_sheet import compute_balance_sheet
from backend.engine.fund_returns import compute_fund_returns
from backend.engine.reality_check import compute_credit_analysis


def _base_state() -> ModelState:
    state = ModelState(deal_name="Phase4 Base", sector="Industrials", currency="GBP")
    state.revenue.base_revenue = 100.0
    state.revenue.growth_rates = [0.06, 0.05, 0.05, 0.04, 0.04]
    state.margins.base_ebitda_margin = 0.20
    state.margins.target_ebitda_margin = 0.25
    state.exit.holding_period = 5
    state.exit.exit_ebitda_multiple = 10.0
    state.entry.entry_ebitda_multiple = 10.0
    state.debt_tranches = [
        DebtTranche(name="Senior TLB", tranche_type="senior", principal=80.0,
                    interest_rate=0.07, rate_type="fixed", amortization_type="bullet")
    ]
    state.derive_entry_fields()
    state.ensure_list_lengths()
    return state


def _implied_pool(ret) -> float:
    pre_mip = ret.exit_equity + ret.mip_payout
    return ret.mip_payout / pre_mip if pre_mip > 0 else 0.0


class TestMIPRatchet:
    """P4-1 — ratchet selects the highest cleared tier; dual hurdle gates on IRR."""

    def _pre_mip_moic(self) -> float:
        s = _base_state()
        s.mip.hurdle_moic = 99.0  # never clears ⇒ exit_equity == full pre-MIP
        ret, _, _ = _run_full_model(s)
        return ret.exit_equity / ret.entry_equity

    def test_single_tier_matches_legacy(self):
        legacy_ret, _, _ = _run_full_model(_base_state())
        s = _base_state()
        s.mip.ratchet_tiers = [MIPRatchetTier(moic_threshold=s.mip.hurdle_moic, pool_pct=s.mip.mip_pool_pct)]
        ret, _, _ = _run_full_model(s)
        assert abs(ret.mip_payout - legacy_ret.mip_payout) < 1e-6

    def test_selects_highest_cleared_tier(self):
        m = self._pre_mip_moic()
        s = _base_state()
        s.mip.ratchet_tiers = [
            MIPRatchetTier(moic_threshold=m - 1.0, pool_pct=0.10),
            MIPRatchetTier(moic_threshold=m - 0.2, pool_pct=0.18),
            MIPRatchetTier(moic_threshold=m + 1.0, pool_pct=0.25),
        ]
        ret, _, _ = _run_full_model(s)
        assert _implied_pool(ret) == pytest.approx(0.18, abs=1e-4)

    def test_dual_hurdle_blocks_tier(self):
        m = self._pre_mip_moic()
        s = _base_state()
        s.mip.ratchet_tiers = [
            MIPRatchetTier(moic_threshold=m - 1.0, pool_pct=0.10),
            MIPRatchetTier(moic_threshold=m - 0.2, pool_pct=0.18, irr_threshold=5.0),
        ]
        ret, _, _ = _run_full_model(s)
        assert _implied_pool(ret) == pytest.approx(0.10, abs=1e-4)

    def test_no_tier_clears_pays_nothing(self):
        m = self._pre_mip_moic()
        s = _base_state()
        s.mip.ratchet_tiers = [MIPRatchetTier(moic_threshold=m + 5.0, pool_pct=0.20)]
        ret, _, _ = _run_full_model(s)
        assert ret.mip_payout == 0.0


class TestFundReturns:
    """P4-2 — LP-facing net returns after management fee + carry over a preferred return."""

    def _fund(self, **overrides) -> FundAssumptions:
        base = dict(management_fee_pct=0.02, management_fee_basis="invested", carry_rate=0.20,
                    preferred_return=0.08, carry_waterfall="european", fund_size=1000.0,
                    deal_allocation_pct=0.1)
        base.update(overrides)
        return FundAssumptions(**base)

    def test_none_when_unset(self):
        s = _base_state()
        ret, _, _ = _run_full_model(s)
        assert compute_fund_returns(s, ret) is None

    def test_net_below_gross_with_positive_spread(self):
        s = _base_state()
        s.fund_assumptions = self._fund()
        ret, _, _ = _run_full_model(s)
        fr = compute_fund_returns(s, ret)
        assert fr is not None
        assert fr.management_fees_total > 0
        assert fr.carried_interest > 0
        assert fr.net_moic < fr.gross_moic
        assert fr.net_irr < fr.gross_irr
        assert fr.gross_to_net_spread > 0

    def test_zero_fees_and_carry_net_equals_gross(self):
        s = _base_state()
        s.fund_assumptions = self._fund(management_fee_pct=0.0, carry_rate=0.0)
        ret, _, _ = _run_full_model(s)
        fr = compute_fund_returns(s, ret)
        assert fr.carried_interest == 0.0
        assert fr.management_fees_total == 0.0
        assert abs(fr.net_moic - fr.gross_moic) < 1e-6
        assert abs((fr.net_irr or 0) - (fr.gross_irr or 0)) < 1e-9

    def test_high_pref_leaves_no_carry(self):
        s = _base_state()
        s.fund_assumptions = self._fund(preferred_return=0.5)  # ~659% over 5y — unbeatable
        ret, _, _ = _run_full_model(s)
        fr = compute_fund_returns(s, ret)
        assert fr.carried_interest == 0.0
        assert fr.preferred_return_shortfall > 0


class TestPartialExits:
    """P4-5 — interim realisations book proceeds at their year and shrink the residual."""

    def test_proceeds_booked_and_residual_reduced(self):
        base_ret, _, _ = _run_full_model(_base_state())
        s = _base_state()
        s.exit.partial_exits = [PartialExitEvent(year=3, pct_sold=0.3, exit_multiple=10.0, exit_fee_pct=0.0)]
        ret, _, _ = _run_full_model(s)
        cf = ret.equity_cashflows
        hp = s.exit.holding_period
        assert cf[3] > 0
        assert cf[3] > base_ret.equity_cashflows[3]
        assert cf[hp] < base_ret.equity_cashflows[hp]
        recon = (ret.exit_equity + ret.total_distributions) / ret.entry_equity
        assert abs(ret.moic - recon) < 1e-6

    def test_full_sale_leaves_no_residual(self):
        s = _base_state()
        s.exit.partial_exits = [PartialExitEvent(year=2, pct_sold=1.0, exit_multiple=10.0, exit_fee_pct=0.0)]
        ret, _, _ = _run_full_model(s)
        hp = s.exit.holding_period
        assert ret.equity_cashflows[2] > 0
        assert abs(ret.equity_cashflows[hp]) < 1e-6


class TestPhase4BalanceSheetCloses:
    """P4-7 — partial exits / fund overlay are sponsor-level and must not disturb close."""

    @staticmethod
    def _converged(state: ModelState):
        ret, proj, _ = _run_full_model(state)
        ds = build_debt_schedule(state, proj)
        return ret, proj, ds

    def test_partial_exit_deal_closes(self):
        s = _base_state()
        s.exit.partial_exits = [PartialExitEvent(year=3, pct_sold=0.3, exit_multiple=10.0, exit_fee_pct=0.0)]
        ret, proj, ds = self._converged(s)
        bs = compute_balance_sheet(s, proj, ds, ret)
        assert bs.closes
        assert bs.max_abs_check < 0.01


def _pik_state() -> ModelState:
    s = _base_state()
    s.debt_tranches = [
        DebtTranche(name="Senior TLB", tranche_type="senior", principal=70.0,
                    interest_rate=0.07, rate_type="fixed", amortization_type="bullet"),
        DebtTranche(name="PIK", tranche_type="pik_note", principal=30.0,
                    interest_rate=0.12, pik_rate=0.12, rate_type="fixed",
                    amortization_type="PIK", cash_interest=False),
    ]
    s.derive_entry_fields()
    s.ensure_list_lengths()
    return s


class TestPikToggle:
    """P4-4 — per-year PIK vs cash election on a PIK tranche."""

    def test_always_pik_accretes(self):
        s = _pik_state()
        proj = build_projections(s)
        ds = build_debt_schedule(s, proj)
        pik = ds.tranche_schedules[1]
        assert pik[0].pik_accrual > 0
        assert pik[0].cash_interest == 0.0
        assert pik[-1].ending_balance > 30.0

    def test_cash_election_pays_cash_no_accretion(self):
        s = _pik_state()
        s.debt_tranches[1].pik_toggle = True
        s.debt_tranches[1].pik_election_by_year = [False] * 5
        proj = build_projections(s)
        ds = build_debt_schedule(s, proj)
        pik = ds.tranche_schedules[1]
        for y in pik:
            assert y.pik_accrual == 0.0
            assert y.cash_interest > 0
        assert pik[-1].ending_balance == pytest.approx(30.0, abs=1e-6)

    def test_mixed_election(self):
        s = _pik_state()
        s.debt_tranches[1].pik_toggle = True
        s.debt_tranches[1].pik_election_by_year = [True, True, False, False, False]
        proj = build_projections(s)
        ds = build_debt_schedule(s, proj)
        pik = ds.tranche_schedules[1]
        assert pik[0].pik_accrual > 0 and pik[0].cash_interest == 0.0
        assert pik[2].pik_accrual == 0.0 and pik[2].cash_interest > 0


class TestCashTrap:
    """P4-13 — cash-trap / restricted-payment block on interim distributions."""

    def _dist_state(self, block_leverage: float) -> ModelState:
        s = _base_state()
        s.exit.interim_distributions = [0.0, 3.0, 0.0, 0.0, 0.0]
        s.credit_covenants.distribution_block_leverage = block_leverage
        s.ensure_list_lengths()
        return s

    def test_blocks_when_leverage_breaches(self):
        s = self._dist_state(3.0)
        proj = build_projections(s)
        ds = build_debt_schedule(s, proj)
        assert ds.distributions_paid_by_year[1] == 0.0
        assert ds.distribution_blocked_by_year[1] is True

    def test_pays_when_not_breached(self):
        s = self._dist_state(10.0)
        proj = build_projections(s)
        ds = build_debt_schedule(s, proj)
        assert ds.distributions_paid_by_year[1] > 0
        assert ds.distribution_blocked_by_year[1] is False

    def test_block_retains_cash(self):
        blocked = build_debt_schedule(self._dist_state(3.0), build_projections(self._dist_state(3.0)))
        paid = build_debt_schedule(self._dist_state(10.0), build_projections(self._dist_state(10.0)))
        assert blocked.cash_balance_by_year[1] > paid.cash_balance_by_year[1]


class TestRefinancing:
    """P4-3 — repricing + prepayment premium + maturity extension."""

    def _fixed_bullet(self) -> ModelState:
        s = _base_state()
        s.debt_tranches = [
            DebtTranche(name="Senior TLB", tranche_type="senior", principal=80.0,
                        interest_rate=0.07, rate_type="fixed", amortization_type="bullet")
        ]
        s.derive_entry_fields()
        s.ensure_list_lengths()
        return s

    def test_repricing_resets_fixed_rate(self):
        s = self._fixed_bullet()
        s.debt_tranches[0].refinancing = RefinancingEvent(year=3, new_spread=0.05, new_floor=0.0,
                                                          prepayment_premium=0.0, extend_maturity_by=0)
        proj = build_projections(s)
        ds = build_debt_schedule(s, proj)
        sched = ds.tranche_schedules[0]
        assert sched[0].effective_rate == pytest.approx(0.07, abs=1e-6)
        assert sched[2].effective_rate == pytest.approx(0.05, abs=1e-6)
        assert sched[2].cash_interest < sched[0].cash_interest

    def test_prepayment_premium_drains_cash_and_closes(self):
        no_prem = self._fixed_bullet()
        no_prem.debt_tranches[0].refinancing = RefinancingEvent(year=3, new_spread=0.07, new_floor=0.0,
                                                               prepayment_premium=0.0, extend_maturity_by=0)
        with_prem = self._fixed_bullet()
        with_prem.debt_tranches[0].refinancing = RefinancingEvent(year=3, new_spread=0.07, new_floor=0.0,
                                                                 prepayment_premium=0.02, extend_maturity_by=0)
        ret_a, proj_a, _ = _run_full_model(no_prem)
        ds_a = build_debt_schedule(no_prem, proj_a)
        ret_b, proj_b, _ = _run_full_model(with_prem)
        ds_b = build_debt_schedule(with_prem, proj_b)
        assert 1.4 < ds_b.refinancing_premium_by_year[2] < 1.8  # ~2% of ~£80m
        assert ds_b.cash_balance_by_year[2] < ds_a.cash_balance_by_year[2]
        bs = compute_balance_sheet(with_prem, proj_b, ds_b, ret_b)
        assert bs.closes
        assert bs.max_abs_check < 0.01


class TestRecoveryYearOfDefault:
    """P4-10 — recovery on the peak-leverage (year-of-default) distressed EV (Python mirror)."""

    def test_reports_basis_and_recovers(self):
        s = _base_state()
        ret, proj, ds = _run_full_model(s)
        ca = compute_credit_analysis(s, proj, ds)
        assert ca.recovery_default_year is not None
        assert 1 <= ca.recovery_default_year <= s.exit.holding_period
        assert ca.recovery_stress_ev > 0
        senior = next(r for r in ca.recovery_waterfall if r.tranche == "Senior TLB")
        assert 0 < senior.recovery_pct <= 1

    def test_deeper_haircut_lowers_recovery(self):
        mild = _base_state()
        mild.credit_covenants.recovery_ebitda_haircut = 0.2
        mild.credit_covenants.recovery_multiple_haircut = 0.3
        mild.credit_covenants.recovery_distressed_cost_pct = 0.05
        severe = _base_state()
        severe.credit_covenants.recovery_ebitda_haircut = 0.6
        severe.credit_covenants.recovery_multiple_haircut = 0.6
        severe.credit_covenants.recovery_distressed_cost_pct = 0.15
        ret_a, proj_a, ds_a = _run_full_model(mild)
        ret_b, proj_b, ds_b = _run_full_model(severe)
        ca_a = compute_credit_analysis(mild, proj_a, ds_a)
        ca_b = compute_credit_analysis(severe, proj_b, ds_b)
        assert ca_b.recovery_stress_ev < ca_a.recovery_stress_ev

    def test_senior_paid_before_junior(self):
        from backend.models.debt import DebtTranche
        s = _base_state()
        s.debt_tranches = [
            DebtTranche(name="Mezz", tranche_type="mezzanine", principal=40.0,
                        interest_rate=0.10, rate_type="fixed", amortization_type="bullet"),
            DebtTranche(name="Senior", tranche_type="senior", principal=60.0,
                        interest_rate=0.07, rate_type="fixed", amortization_type="bullet"),
        ]
        s.derive_entry_fields()
        s.ensure_list_lengths()
        ret, proj, ds = _run_full_model(s)
        ca = compute_credit_analysis(s, proj, ds)
        names = [r.tranche for r in ca.recovery_waterfall]
        assert names.index("Senior") < names.index("Mezz")


class TestCapexPresentation:
    """P4-6 — operating FCF (pre-growth) = total FCF pre-debt + growth capex."""

    def test_operating_fcf_identity(self):
        s = _base_state()
        s.margins.growth_capex = [2.0, 2.0, 3.0, 3.0, 4.0]
        s.ensure_list_lengths()
        proj = build_projections(s)
        for yr in proj.years:
            assert yr.operating_fcf_pre_growth_capex == pytest.approx(yr.fcf_pre_debt + yr.growth_capex, abs=1e-6)


class TestDsoDioDpo:
    """P4-9 — days-based working capital."""

    def test_nwc_balance_days_vs_peg(self):
        from backend.engine.projections import _nwc_balance
        peg = _base_state().margins
        peg.nwc_pct_revenue = 0.1
        assert _nwc_balance(100.0, 0.2, peg) == pytest.approx(10.0, abs=1e-6)
        days = _base_state().margins
        days.nwc_dso, days.nwc_dio, days.nwc_dpo = 73.0, 73.0, 36.5
        # rev=100, cogs=80: 20 + 16 − 8 = 28
        assert _nwc_balance(100.0, 0.2, days) == pytest.approx(28.0, abs=1e-6)

    def test_extending_dpo_lowers_nwc(self):
        from backend.engine.projections import _nwc_balance
        tight = _base_state().margins
        tight.nwc_dso, tight.nwc_dio, tight.nwc_dpo = 60.0, 60.0, 30.0
        extended = _base_state().margins
        extended.nwc_dso, extended.nwc_dio, extended.nwc_dpo = 60.0, 60.0, 90.0
        assert _nwc_balance(100.0, 0.2, extended) < _nwc_balance(100.0, 0.2, tight)

    def test_days_based_closes(self):
        s = _base_state()
        s.margins.nwc_dso, s.margins.nwc_dio, s.margins.nwc_dpo = 90.0, 75.0, 45.0
        ret, proj, _ = _run_full_model(s)
        ds = build_debt_schedule(s, proj)
        bs = compute_balance_sheet(s, proj, ds, ret)
        assert bs.closes
        assert bs.max_abs_check < 0.01
