"""Annual projection engine — P&L, capex, NWC, FCF build per Section 3.1."""

from __future__ import annotations

from backend.models.outputs import AnnualProjection, AnnualProjectionYear
from backend.models.state import ModelState


def build_projections(state: ModelState) -> AnnualProjection:
    """Build full annual projections from model state.

    Returns one AnnualProjectionYear per year [1 .. holding_period].
    """
    hp = state.exit.holding_period
    state.ensure_list_lengths()

    base_revenue = state.revenue.base_revenue
    base_margin = state.margins.base_ebitda_margin
    monitoring_fee = state.fees.monitoring_fee_annual
    da_pct = state.margins.da_pct_revenue
    capex_pct = state.margins.capex_pct_revenue
    nwc_pct = state.margins.nwc_pct_revenue
    tax_rate = state.tax.tax_rate
    min_tax_rate = state.tax.minimum_tax_rate
    nol_remaining = state.tax.nol_carryforward

    # Financing fee amortization (straight-line over holding period)
    total_debt = state.entry.total_debt_raised
    financing_fees = state.fees.financing_fee_pct * total_debt
    fin_fee_amort = financing_fees / hp if hp > 0 else 0.0

    prev_revenue = base_revenue
    years: list[AnnualProjectionYear] = []

    for t in range(hp):
        yr = t + 1
        growth = state.revenue.growth_rates[t]
        acq_rev = state.revenue.acquisition_revenue[t] if state.revenue.acquisition_revenue else 0.0

        revenue = prev_revenue * (1.0 + growth) + acq_rev
        margin = state.margins.margin_by_year[t]

        ebitda = revenue * margin
        ebitda_adj = ebitda - monitoring_fee
        da = revenue * da_pct
        ebit = ebitda_adj - da

        # Interest expense will be filled in after debt schedule is built;
        # for initial projection pass, estimate from tranche rates × principals.
        interest_estimate = 0.0
        for tranche in state.debt_tranches:
            if tranche.cash_interest:
                if tranche.rate_type == "fixed":
                    interest_estimate += tranche.principal * tranche.interest_rate
                else:
                    eff_rate = max(tranche.base_rate + tranche.spread, tranche.floor)
                    interest_estimate += tranche.principal * eff_rate
            elif tranche.amortization_type == "PIK":
                # PIK accrual is non-cash but hits EBT
                interest_estimate += tranche.principal * tranche.pik_rate

        ebt = ebit - interest_estimate - fin_fee_amort

        # Tax with NOL usage and minimum rate
        if ebt > 0:
            raw_tax = ebt * tax_rate
            nol_usage = min(nol_remaining, raw_tax) if nol_remaining > 0 else 0.0
            tax_after_nol = raw_tax - nol_usage
            min_tax = ebt * min_tax_rate
            tax = max(tax_after_nol, min_tax)
            nol_remaining -= nol_usage
        else:
            tax = 0.0
            nol_usage = 0.0

        net_income = ebt - tax
        nopat = ebit * (1.0 - tax_rate)

        # Capex
        m_capex = revenue * capex_pct
        g_capex = state.margins.growth_capex[t] if state.margins.growth_capex else 0.0
        total_capex = m_capex + g_capex

        # NWC
        if state.margins.nwc_movement_method == "pct_change":
            delta_nwc = (revenue - prev_revenue) * nwc_pct
        else:
            delta_nwc = 0.0  # explicit method — populated externally

        # FCF
        fcf_pre_debt = ebitda_adj - tax - total_capex - delta_nwc

        row = AnnualProjectionYear(
            year=yr,
            revenue=revenue,
            revenue_growth=growth,
            organic_revenue=prev_revenue * (1.0 + growth),
            acquisition_revenue=acq_rev,
            ebitda=ebitda,
            ebitda_margin=margin,
            ebitda_adj=ebitda_adj,
            da=da,
            ebit=ebit,
            interest_expense=interest_estimate,
            financing_fee_amort=fin_fee_amort,
            ebt=ebt,
            tax=tax,
            nol_used=nol_usage if ebt > 0 else 0.0,
            net_income=net_income,
            nopat=nopat,
            maintenance_capex=m_capex,
            growth_capex=g_capex,
            total_capex=total_capex,
            delta_nwc=delta_nwc,
            fcf_pre_debt=fcf_pre_debt,
            fcf_to_equity=0.0,  # filled after debt schedule
        )
        years.append(row)
        prev_revenue = revenue

    return AnnualProjection(years=years)


def update_projections_with_debt(
    projections: AnnualProjection,
    state: ModelState,
    cash_interest_by_year: list[float],
    pik_accrual_by_year: list[float],
    total_repayment_by_year: list[float],
) -> AnnualProjection:
    """Second pass: update interest expense and FCF to equity with actual debt schedule data."""
    hp = state.exit.holding_period
    nol_remaining = state.tax.nol_carryforward
    financing_fees = state.fees.financing_fee_pct * state.entry.total_debt_raised
    fin_fee_amort = financing_fees / hp if hp > 0 else 0.0

    for i, yr in enumerate(projections.years):
        actual_cash_interest = cash_interest_by_year[i] if i < len(cash_interest_by_year) else 0.0
        actual_pik = pik_accrual_by_year[i] if i < len(pik_accrual_by_year) else 0.0
        total_interest_expense = actual_cash_interest + actual_pik

        yr.interest_expense = total_interest_expense
        yr.ebt = yr.ebit - total_interest_expense - fin_fee_amort

        # Recalculate tax
        if yr.ebt > 0:
            raw_tax = yr.ebt * state.tax.tax_rate
            nol_usage = min(nol_remaining, raw_tax) if nol_remaining > 0 else 0.0
            tax_after_nol = raw_tax - nol_usage
            min_tax = yr.ebt * state.tax.minimum_tax_rate
            yr.tax = max(tax_after_nol, min_tax)
            yr.nol_used = nol_usage
            nol_remaining -= nol_usage
        else:
            yr.tax = 0.0
            yr.nol_used = 0.0

        yr.net_income = yr.ebt - yr.tax
        yr.fcf_pre_debt = yr.ebitda_adj - yr.tax - yr.total_capex - yr.delta_nwc

        actual_repayment = total_repayment_by_year[i] if i < len(total_repayment_by_year) else 0.0
        yr.fcf_to_equity = yr.fcf_pre_debt - actual_cash_interest - actual_repayment

    return projections
