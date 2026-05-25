"""Phase 4 — PR A (Python mirror): MIP ratchet (P4-1), fund-level returns (P4-2),
partial exits (P4-5), and the three-statement close gate (P4-7) for the new paths.

Mirrors tests/phase4.test.ts. Every feature is opt-in — with the new fields absent
the engine is unchanged (held by tests/test_engine_parity.py)."""

import pytest

from backend.models.state import ModelState, MIPRatchetTier, PartialExitEvent, FundAssumptions
from backend.models.debt import DebtTranche
from backend.engine.scenarios import _run_full_model
from backend.engine.debt_schedule import build_debt_schedule
from backend.engine.balance_sheet import compute_balance_sheet
from backend.engine.fund_returns import compute_fund_returns


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
