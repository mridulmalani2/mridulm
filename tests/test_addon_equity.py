"""Workstream D (Python mirror of tests/addon-equity.test.ts).

The Python add-on engine (backend/engine/add_ons.py) now injects bolt-on revenue
and synthetic acquisition debt (parity with the TS source of truth), and the
sponsor-equity portion of equity/mixed-funded bolt-ons is charged in returns.
Debt-funded bolt-ons and non-add-on deals are unchanged."""

from backend.models.state import ModelState
from backend.models.debt import DebtTranche
from backend.models.outputs import AddOnAcquisition
from backend.engine.scenarios import _run_full_model
from backend.engine.balance_sheet import compute_balance_sheet


def _base_state() -> ModelState:
    s = ModelState(deal_name="D Base", sector="Industrials", currency="GBP")
    s.revenue.base_revenue = 100.0
    s.revenue.growth_rates = [0.06, 0.05, 0.05, 0.04, 0.04]
    s.margins.base_ebitda_margin = 0.20
    s.margins.target_ebitda_margin = 0.25
    s.exit.holding_period = 5
    s.exit.exit_ebitda_multiple = 10.0
    s.entry.entry_ebitda_multiple = 10.0
    s.debt_tranches = [
        DebtTranche(name="Senior TLB", tranche_type="senior", principal=80.0,
                    interest_rate=0.07, rate_type="fixed", amortization_type="bullet"),
    ]
    s.derive_entry_fields()
    s.ensure_list_lengths()
    return s


# purchase price = 50 × 0.2 × 8 = 80
def _addon(funding: str, debt_pct: float = 0.0) -> AddOnAcquisition:
    return AddOnAcquisition(name="Bolt-on", year=2, revenue=50.0, ebitda_margin=0.2,
                            purchase_multiple=8.0, funding=funding, debt_pct=debt_pct)


def test_debt_funded_no_equity_outflow():
    s = _base_state()
    s.add_on_acquisitions = [_addon("debt", 1.0)]
    ret, _, _ = _run_full_model(s)
    assert abs(ret.add_on_equity_invested) < 1e-6
    assert abs(ret.moic - (ret.exit_equity + ret.total_distributions) / ret.entry_equity) < 1e-6


def test_equity_funded_books_full_purchase_price():
    s = _base_state()
    s.add_on_acquisitions = [_addon("equity")]
    ret, _, _ = _run_full_model(s)
    assert abs(ret.add_on_equity_invested - 80.0) < 1e-6
    # MOIC denominator = entry equity + add-on equity (multi-round invested base).
    expected = (ret.exit_equity + ret.total_distributions) / (ret.entry_equity + 80.0)
    assert abs(ret.moic - expected) < 1e-6
    # Outflow lands at the acquisition year (year 2 ⇒ index 2 of [t0..hp]).
    assert abs(ret.equity_cashflows[2] - (-80.0)) < 1e-6


def test_mixed_funded_books_equity_portion():
    s = _base_state()
    s.add_on_acquisitions = [_addon("mixed", 0.5)]
    ret, _, _ = _run_full_model(s)
    assert abs(ret.add_on_equity_invested - 40.0) < 1e-6
    assert abs(ret.equity_cashflows[2] - (-40.0)) < 1e-6


def test_equity_moic_below_debt_moic():
    eq = _base_state(); eq.add_on_acquisitions = [_addon("equity")]
    debt = _base_state(); debt.add_on_acquisitions = [_addon("debt", 1.0)]
    eq_ret, _, _ = _run_full_model(eq)
    debt_ret, _, _ = _run_full_model(debt)
    assert eq_ret.moic < debt_ret.moic


def test_no_add_ons_unchanged():
    ret, _, _ = _run_full_model(_base_state())
    assert ret.add_on_equity_invested == 0.0


def test_add_on_engine_injects_revenue_and_debt():
    """Parity: the new Python add-on engine actually injects bolt-on revenue and
    (for debt funding) synthetic acquisition debt that carries to exit."""
    base = _base_state()
    base_ret, base_proj, _ = _run_full_model(base)

    s = _base_state()
    s.add_on_acquisitions = [_addon("debt", 1.0)]
    ret, proj, ds = _run_full_model(s)

    # Revenue is injected from the acquisition year onward.
    assert proj.years[2].revenue > base_proj.years[2].revenue
    # Debt-funded bolt-on adds synthetic debt carried to exit ⇒ higher exit net debt.
    assert ret.exit_net_debt > base_ret.exit_net_debt
    # The synthetic tranche is stripped from the state after the run (not persisted).
    assert all(not getattr(t, "synthetic_addon", False) for t in s.debt_tranches)


def test_balance_sheet_closes_for_add_on_deals():
    """Bolt-on consideration is booked as acquired goodwill + fresh equity, so the
    three-statement model keeps closing across all funding types (D)."""
    for funding, dp in [("debt", 1.0), ("equity", 0.0), ("mixed", 0.5)]:
        s = _base_state()
        s.add_on_acquisitions = [_addon(funding, dp)]
        ret, proj, ds = _run_full_model(s)
        bs = compute_balance_sheet(s, proj, ds, ret)
        assert bs.closes, f"{funding}-funded add-on BS did not close (max {bs.max_abs_check})"
