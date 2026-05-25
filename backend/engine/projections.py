"""Annual projection engine — P&L, capex, NWC, FCF build per Section 3.1.

Audit-driven changes (audit_report_part2.md, projections.py findings):
  * NOL applied to taxable income (EBT), not tax liability (FINDING 2).
  * NOL state is single-pass — no double consumption across initial and updated
    passes (FINDING 3). The initial projection uses an estimated tax that is
    overwritten in `update_projections_with_debt`, where the canonical tax
    waterfall is run once with the correct interest expense.
  * NOPAT derived from actual tax (`EBIT − tax`), not statutory rate (FINDING 1).
  * FCF (unlevered) computed as NOPAT + D&A − Capex − ΔNWC − monitoring fee
    (FINDINGS 4, 6, 10).
  * Monitoring fee is a sponsor-level outflow, removed from EBITDA (FINDING 6).
    `ebitda_adj` retained for backwards compatibility but kept equal to clean
    EBITDA — monitoring fee is deducted post-EBITDA in the cash flow.
  * FCF to equity uses the proper levered FCF formula
    `NI + D&A − Capex − ΔNWC + Net Borrowing` (FINDING 5).
  * Financing fees amortized over a configurable tax-life (debt term or user-
    specified period), not the holding period (FINDING 7).
  * Interest dynamics: per-year interest is computed on the per-tranche
    beginning balance from the iterated debt schedule (FINDING 8). The first
    pass uses opening principal as a seed; convergence is driven from the
    `_run_full_model` loop in scenarios.py.
"""

from __future__ import annotations

from backend.models.outputs import AnnualProjection, AnnualProjectionYear
from backend.models.state import ModelState


def _financing_fee_amort_per_year(state: ModelState) -> float:
    """Compute straight-line annual financing fee amortization.

    Per audit FINDING [7]: amortize over loan term (or user-specified period),
    not over holding period. We take the principal-weighted average of tranche
    terms, falling back to the holding period if no term is specified.
    """
    hp = state.exit.holding_period
    total_debt = state.entry.total_debt_raised
    if total_debt <= 0 or hp <= 0:
        return 0.0
    financing_fees = state.fees.financing_fee_pct * total_debt
    explicit_years = state.tax.financing_fee_amort_years
    if explicit_years > 0:
        return financing_fees / explicit_years
    # Principal-weighted average of tranche terms (zero terms fall back to hp)
    weighted_term = 0.0
    weight = 0.0
    for tranche in state.debt_tranches:
        if tranche.principal <= 0:
            continue
        term = tranche.financing_fee_amort_years or tranche.term_years or hp
        weighted_term += term * tranche.principal
        weight += tranche.principal
    avg_term = weighted_term / weight if weight > 0 else hp
    return financing_fees / avg_term if avg_term > 0 else 0.0


def build_projections(state: ModelState) -> AnnualProjection:
    """Build full annual projections from model state.

    Returns one AnnualProjectionYear per year [1 .. holding_period]. This is
    the FIRST pass — interest, tax, and FCF will be re-derived in
    `update_projections_with_debt` once the debt schedule is built.
    """
    hp = state.exit.holding_period
    state.ensure_list_lengths()

    base_revenue = state.revenue.base_revenue
    monitoring_fee = state.fees.monitoring_fee_annual
    da_pct = state.margins.da_pct_revenue
    capex_pct = state.margins.capex_pct_revenue
    nwc_pct = state.margins.nwc_pct_revenue
    tax_rate = state.tax.tax_rate
    min_tax_rate = state.tax.minimum_tax_rate

    fin_fee_amort = _financing_fee_amort_per_year(state)

    # Seed per-tranche balance approximation for the first pass — straight-line
    # decay over their amortization schedule when given, else opening principal
    # held flat. The second pass replaces this with the true debt schedule.
    tranche_balance_seeds: list[list[float]] = []
    for tranche in state.debt_tranches:
        balances = [tranche.principal]
        running = tranche.principal
        for t in range(hp):
            if t < len(tranche.amortization_schedule):
                running = max(0.0, running - tranche.amortization_schedule[t])
            balances.append(running)
        tranche_balance_seeds.append(balances)

    prev_revenue = base_revenue
    prev_cash_balance = 0.0
    nol_remaining = state.tax.nol_carryforward
    years: list[AnnualProjectionYear] = []

    for t in range(hp):
        yr = t + 1
        growth = state.revenue.growth_rates[t]
        acq_rev = state.revenue.acquisition_revenue[t] if state.revenue.acquisition_revenue else 0.0

        revenue = prev_revenue * (1.0 + growth) + acq_rev
        margin = state.margins.margin_by_year[t]

        ebitda = revenue * margin
        # Audit FINDING [6]: monitoring fee is a sponsor-level cash outflow,
        # not an operating expense. Keep ebitda_adj == clean EBITDA so that
        # leverage / valuation multiples reflect operating performance, then
        # deduct monitoring fee below in the FCF build.
        ebitda_adj = ebitda
        da = revenue * da_pct
        ebit = ebitda_adj - da

        # Per-tranche dynamic interest on beginning balance (FINDING 8)
        cash_interest_estimate = 0.0
        pik_estimate = 0.0
        for tranche, balances in zip(state.debt_tranches, tranche_balance_seeds):
            beg_bal = balances[t]
            if tranche.amortization_type == "PIK":
                pik_estimate += beg_bal * tranche.pik_rate
            elif tranche.cash_interest:
                if tranche.rate_type == "fixed":
                    cash_interest_estimate += beg_bal * tranche.interest_rate
                else:
                    eff_rate = max(tranche.base_rate + tranche.spread, tranche.floor)
                    cash_interest_estimate += beg_bal * eff_rate

        total_interest_expense = cash_interest_estimate + pik_estimate
        ebt = ebit - total_interest_expense - fin_fee_amort

        # ── Tax with NOL applied to TAXABLE INCOME (FINDING 2) ──
        if ebt > 0:
            nol_usage = min(nol_remaining, ebt) if nol_remaining > 0 else 0.0
            taxable_income = ebt - nol_usage
            raw_tax = taxable_income * tax_rate
            min_tax = taxable_income * min_tax_rate if taxable_income > 0 else 0.0
            tax = max(raw_tax, min_tax)
            nol_remaining -= nol_usage
        else:
            tax = 0.0
            nol_usage = 0.0
            # NOLs accumulate on losses
            nol_remaining += -ebt

        net_income = ebt - tax
        # Audit FINDING [1]: NOPAT from actual effective tax rate, not statutory.
        # Effective rate is observed tax/EBT; applied to EBIT to get NOPAT.
        if ebt > 0:
            effective_tax_rate = tax / ebt
            nopat = ebit * (1.0 - effective_tax_rate)
        else:
            nopat = ebit  # losses fully shield EBIT — no current tax

        # Capex
        m_capex = revenue * capex_pct
        g_capex = state.margins.growth_capex[t] if state.margins.growth_capex else 0.0
        total_capex = m_capex + g_capex

        # NWC
        if state.margins.nwc_movement_method == "explicit":
            explicit = state.margins.nwc_explicit_by_year
            # Use supplied per-year movements; fall back to pct_change when absent so
            # an explicit method without data doesn't silently zero out NWC.
            if explicit:
                delta_nwc = explicit[t] if t < len(explicit) else 0.0
            else:
                delta_nwc = (revenue - prev_revenue) * nwc_pct
        else:
            delta_nwc = (revenue - prev_revenue) * nwc_pct

        # FCF (unlevered, FINDINGS 4 & 6) — base on NOPAT, deduct monitoring fee
        fcf_pre_debt = nopat + da - total_capex - delta_nwc - monitoring_fee
        # Operating FCF before growth investment (P4-6) = total FCF pre-debt + growth capex.
        operating_fcf_pre_growth = fcf_pre_debt + g_capex

        cash_balance = prev_cash_balance  # placeholder — second pass writes the true balance
        prev_cash_balance = cash_balance

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
            interest_expense=total_interest_expense,
            financing_fee_amort=fin_fee_amort,
            ebt=ebt,
            tax=tax,
            nol_used=nol_usage,
            net_income=net_income,
            nopat=nopat,
            maintenance_capex=m_capex,
            growth_capex=g_capex,
            total_capex=total_capex,
            delta_nwc=delta_nwc,
            operating_fcf_pre_growth_capex=operating_fcf_pre_growth,
            fcf_pre_debt=fcf_pre_debt,
            fcf_to_equity=0.0,  # filled after debt schedule
            cash_balance=cash_balance,
            new_borrowings=0.0,
            debt_repayment=0.0,
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
    new_borrowings_by_year: list[float] | None = None,
) -> AnnualProjection:
    """Second pass: re-derive interest, tax, FCF and FCFE with actual debt data.

    This is the canonical tax / FCF computation. The first pass values are
    overwritten so NOLs are consumed exactly once (audit FINDING [3]).
    """
    hp = state.exit.holding_period
    tax_rate = state.tax.tax_rate
    min_tax_rate = state.tax.minimum_tax_rate
    monitoring_fee = state.fees.monitoring_fee_annual
    fin_fee_amort = _financing_fee_amort_per_year(state)

    nol_remaining = state.tax.nol_carryforward

    if new_borrowings_by_year is None:
        new_borrowings_by_year = [0.0] * len(projections.years)

    prev_cash_balance = 0.0

    for i, yr in enumerate(projections.years):
        actual_cash_interest = cash_interest_by_year[i] if i < len(cash_interest_by_year) else 0.0
        actual_pik = pik_accrual_by_year[i] if i < len(pik_accrual_by_year) else 0.0
        total_interest_expense = actual_cash_interest + actual_pik

        yr.interest_expense = total_interest_expense
        yr.financing_fee_amort = fin_fee_amort
        yr.ebt = yr.ebit - total_interest_expense - fin_fee_amort

        # ── Tax: NOL reduces taxable income, then apply rate (FINDING 2) ──
        if yr.ebt > 0:
            nol_usage = min(nol_remaining, yr.ebt) if nol_remaining > 0 else 0.0
            taxable_income = yr.ebt - nol_usage
            raw_tax = taxable_income * tax_rate
            min_tax = taxable_income * min_tax_rate if taxable_income > 0 else 0.0
            yr.tax = max(raw_tax, min_tax)
            yr.nol_used = nol_usage
            nol_remaining -= nol_usage
        else:
            yr.tax = 0.0
            yr.nol_used = 0.0
            nol_remaining += -yr.ebt  # accrue NOL on operating loss

        yr.net_income = yr.ebt - yr.tax

        # NOPAT from actual tax on EBIT (FINDING 1).
        # Effective tax rate from observed tax/EBT, applied to EBIT.
        if yr.ebt > 0 and yr.ebit != 0:
            effective_tax_rate = yr.tax / yr.ebt
            yr.nopat = yr.ebit * (1.0 - effective_tax_rate)
        else:
            yr.nopat = yr.ebit  # no current tax — losses fully shield EBIT

        # ── Unlevered FCF (FCFF) — NOPAT + D&A − Capex − ΔNWC − monitoring (FINDINGS 4 & 6) ──
        yr.fcf_pre_debt = yr.nopat + yr.da - yr.total_capex - yr.delta_nwc - monitoring_fee
        yr.operating_fcf_pre_growth_capex = yr.fcf_pre_debt + yr.growth_capex  # P4-6

        # ── FCFE proper formulation (FINDING 5) ──
        # FCFE = NI + D&A − Capex − ΔNWC + Net Borrowing − monitoring fee
        actual_repayment = total_repayment_by_year[i] if i < len(total_repayment_by_year) else 0.0
        new_borrowing = new_borrowings_by_year[i] if i < len(new_borrowings_by_year) else 0.0
        net_borrowing = new_borrowing - actual_repayment
        yr.new_borrowings = new_borrowing
        yr.debt_repayment = actual_repayment
        yr.fcf_to_equity = (
            yr.net_income + yr.da - yr.total_capex - yr.delta_nwc + net_borrowing - monitoring_fee
        )

        # Cash balance roll-forward (post-debt-service residual; pre-distribution)
        cash_change = (
            yr.fcf_pre_debt
            - actual_cash_interest
            - actual_repayment
            + new_borrowing
        )
        cash_balance = prev_cash_balance + cash_change
        yr.cash_balance = cash_balance
        prev_cash_balance = cash_balance

    return projections
