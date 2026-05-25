"""Fund-level (LP-facing) return overlay — refactor plan P4-2 (Python mirror).

Mirrors lib/engine/fundReturns.ts. Translates the deal's gross equity cashflow
stream (returns.equity_cashflows) into NET LP returns after management fees and
GP carried interest over a preferred return. Pure overlay — never touches the
core deal engine, so deal-level IRR/MOIC are unchanged.

Documented simplifications (kept deliberately simple and defensible, single-deal
scope): management fees are a per-year drag (years 1..hp); net MOIC = net value /
invested capital; preferred return compounds annually; European = carry at exit
on total profit above return-of-capital + pref; American = carry as distributions
clear the running capital + accrued-pref high-water; no GP catch-up, no clawback.
"""

from __future__ import annotations

from typing import Optional

from backend.models.outputs import FundReturns, Returns
from backend.models.state import ModelState
from backend.engine.returns import _build_time_vector, _solve_irr_auto


def compute_fund_returns(state: ModelState, returns: Returns) -> Optional[FundReturns]:
    fa = state.fund_assumptions
    if fa is None:
        return None

    hp = state.exit.holding_period
    cfs = returns.equity_cashflows or []
    invested = returns.entry_equity
    gross_irr = returns.irr
    gross_moic = returns.moic

    if invested <= 0 or len(cfs) < 2:
        return FundReturns(
            net_irr=None, net_moic=0.0, gross_irr=gross_irr, gross_moic=gross_moic,
            gross_to_net_spread=None, management_fees_total=0.0, carried_interest=0.0,
            preferred_return_shortfall=0.0, lp_paid_in=max(0.0, invested), lp_distributions=0.0,
        )

    gross_inflows = [cfs[i] if i < len(cfs) else 0.0 for i in range(1, hp + 1)]
    total_receipts = sum(gross_inflows)

    # ── Management fee (annual drag, years 1..hp) ──
    if fa.management_fee_basis == "committed":
        fee_basis = fa.fund_size * min(1.0, max(0.0, fa.deal_allocation_pct))
    else:
        fee_basis = invested
    fee_per_year = max(0.0, fa.management_fee_pct) * max(0.0, fee_basis)
    fee_by_year = [fee_per_year] * hp
    management_fees_total = sum(fee_by_year)

    # ── Carried interest ──
    pref = max(0.0, fa.preferred_return)
    carry_rate = max(0.0, fa.carry_rate)
    carry_by_year = [0.0] * hp
    carried_interest = 0.0
    preferred_shortfall = 0.0

    if fa.carry_waterfall == "american":
        remaining_capital = invested
        accrued_pref = 0.0
        for i in range(hp):
            accrued_pref += remaining_capital * pref
            receipt = gross_inflows[i]
            cap_return = min(receipt, remaining_capital)
            remaining_capital -= cap_return
            receipt -= cap_return
            pref_paid = min(receipt, accrued_pref)
            accrued_pref -= pref_paid
            receipt -= pref_paid
            if receipt > 0:
                carry_by_year[i] = carry_rate * receipt
                carried_interest += carry_by_year[i]
        preferred_shortfall = accrued_pref if remaining_capital > 1e-9 else 0.0
    else:
        pref_amt = invested * ((1.0 + pref) ** hp - 1.0)
        profit_above_pref = max(0.0, total_receipts - invested - pref_amt)
        carried_interest = carry_rate * profit_above_pref
        carry_by_year[hp - 1] = carried_interest
        capital_returned = min(total_receipts, invested)
        pref_met = max(0.0, total_receipts - capital_returned)
        preferred_shortfall = max(0.0, pref_amt - pref_met)

    # ── Net LP cashflows ──
    times = _build_time_vector(hp, state.exit.mid_year_convention) if state.exit.mid_year_convention else None
    lp_cfs = [-invested]
    for i in range(hp):
        lp_cfs.append(gross_inflows[i] - fee_by_year[i] - carry_by_year[i])
    net_irr = _solve_irr_auto(lp_cfs, times)

    lp_distributions = total_receipts - management_fees_total - carried_interest
    net_moic = lp_distributions / invested if invested > 0 else 0.0
    gross_to_net_spread = (gross_irr - net_irr) if (gross_irr is not None and net_irr is not None) else None

    return FundReturns(
        net_irr=net_irr,
        net_moic=net_moic,
        gross_irr=gross_irr,
        gross_moic=gross_moic,
        gross_to_net_spread=gross_to_net_spread,
        management_fees_total=management_fees_total,
        carried_interest=carried_interest,
        preferred_return_shortfall=preferred_shortfall,
        lp_paid_in=invested,
        lp_distributions=lp_distributions,
    )
