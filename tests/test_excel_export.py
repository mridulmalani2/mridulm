"""Excel export parity (Python mirror of tests/excel-export-parity.test.ts).

The backend workbook is a CONSUMER of engine outputs. This test assembles a
Phase-4-rich state, builds the workbook, reads it back, and asserts the new
Phase-4 outputs surface (fund returns, partial-exit equity cashflows, refinancing
premium, distribution-blocked flags, OID, recovery year-of-default). Requires
openpyxl (installed in CI for this gate)."""

import io

import pytest

openpyxl = pytest.importorskip("openpyxl")

from backend.models.state import ModelState, PartialExitEvent, FundAssumptions
from backend.models.debt import DebtTranche, RefinancingEvent
from backend.engine.scenarios import _run_full_model
from backend.engine.returns import decompose_value_drivers
from backend.engine.reality_check import compute_credit_analysis
from backend.engine.fund_returns import compute_fund_returns
from backend.export.excel import build_excel


def _populate(s: ModelState) -> ModelState:
    """Assemble the pipeline outputs onto the state (Python has no full_recalc)."""
    ret, proj, ds = _run_full_model(s)
    s.returns = ret
    s.projections = proj
    s.debt_schedule = ds
    s.value_drivers = decompose_value_drivers(s, proj, ds, ret)
    s.credit_analysis = compute_credit_analysis(s, proj, ds)
    s.fund_returns = compute_fund_returns(s, ret)
    return s


def _all_text(blob: bytes) -> str:
    wb = openpyxl.load_workbook(io.BytesIO(blob))
    parts = []
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                if isinstance(cell.value, str):
                    parts.append(cell.value)
    return "\n".join(parts)


def _rich_state() -> ModelState:
    s = ModelState(deal_name="Phase4 Export", sector="Industrials", currency="GBP")
    s.revenue.base_revenue = 100.0
    s.revenue.growth_rates = [0.06, 0.05, 0.05, 0.04, 0.04]
    s.margins.base_ebitda_margin = 0.20
    s.margins.target_ebitda_margin = 0.25
    s.exit.holding_period = 5
    s.exit.exit_ebitda_multiple = 10.0
    s.entry.entry_ebitda_multiple = 10.0
    s.exit.interim_distributions = [10.0, 0.0, 0.0, 0.0, 0.0]
    s.exit.partial_exits = [PartialExitEvent(year=2, pct_sold=0.3, exit_multiple=10.0, exit_fee_pct=0.01)]
    s.fund_assumptions = FundAssumptions(
        management_fee_pct=0.02, management_fee_basis="invested", carry_rate=0.20,
        preferred_return=0.08, carry_waterfall="european", fund_size=1000.0, deal_allocation_pct=0.1,
    )
    s.credit_covenants.distribution_block_leverage = 0.1  # always blocks ⇒ flag set
    s.debt_tranches = [
        DebtTranche(
            name="Senior TLB", tranche_type="senior", principal=70.0, interest_rate=0.07,
            rate_type="fixed", amortization_type="bullet", oid_pct=0.02, debt_maturity_years=5,
            refinancing=RefinancingEvent(year=3, new_spread=0.08, new_floor=0.0, prepayment_premium=0.02, extend_maturity_by=0),
        ),
    ]
    s.derive_entry_fields()
    s.ensure_list_lengths()
    return s


def _plain_state() -> ModelState:
    s = ModelState(deal_name="Plain", sector="Industrials", currency="GBP")
    s.revenue.base_revenue = 100.0
    s.margins.base_ebitda_margin = 0.20
    s.exit.holding_period = 5
    s.entry.entry_ebitda_multiple = 10.0
    s.debt_tranches = [
        DebtTranche(name="Senior TLB", tranche_type="senior", principal=80.0, interest_rate=0.07,
                    rate_type="fixed", amortization_type="bullet"),
    ]
    s.derive_entry_fields()
    s.ensure_list_lengths()
    return s


def test_phase4_outputs_surface_in_workbook():
    text = _all_text(build_excel(_populate(_rich_state())))
    for needle in [
        "FUND-LEVEL RETURNS",
        "Net IRR (LP",
        "REALISED EQUITY CASHFLOWS",
        "PARTIAL EXITS",
        "Refinancing Premium",
        "OID Amortisation",
        "OID (funded by equity",
        "Distribution Blocked",
        "Year of default",
    ]:
        assert needle in text, f"missing from workbook: {needle}"


def test_plain_deal_omits_optional_rows():
    text = _all_text(build_excel(_populate(_plain_state())))
    assert "FUND-LEVEL RETURNS" not in text
    assert "Refinancing Premium" not in text
    assert "OID Amortisation" not in text
    assert "PARTIAL EXITS" not in text
