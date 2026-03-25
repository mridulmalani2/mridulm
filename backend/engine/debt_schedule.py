"""Full debt waterfall engine per Section 3.2."""

from __future__ import annotations

from backend.models.debt import DebtSchedule, DebtScheduleYear, DebtTranche
from backend.models.outputs import AnnualProjection
from backend.models.state import ModelState


def build_debt_schedule(
    state: ModelState, projections: AnnualProjection
) -> DebtSchedule:
    """Build per-tranche, per-year debt waterfall.

    Handles bullet, straight-line, PIK, cash_sweep, and floating rates.
    """
    hp = state.exit.holding_period
    tranches = state.debt_tranches
    tax_rate = state.tax.tax_rate
    shield = state.tax.tax_shield_on_interest

    if not tranches:
        return DebtSchedule()

    # Per-tranche schedule storage
    all_tranche_schedules: list[list[DebtScheduleYear]] = []
    # Track beginning balances for each tranche across years
    balances: list[float] = [t.principal for t in tranches]

    # We need to build year-by-year across all tranches simultaneously
    # because cash sweep depends on aggregate FCF
    tranche_years: list[list[DebtScheduleYear]] = [[] for _ in tranches]

    for yr_idx in range(hp):
        yr = yr_idx + 1
        proj_yr = projections.years[yr_idx] if yr_idx < len(projections.years) else None
        fcf_pre_debt = proj_yr.fcf_pre_debt if proj_yr else 0.0

        # First pass: compute interest and mandatory amortization
        total_mandatory_amort = 0.0
        total_cash_interest = 0.0
        year_entries: list[DebtScheduleYear] = []

        for t_idx, tranche in enumerate(tranches):
            beg_bal = balances[t_idx]
            entry = DebtScheduleYear(
                year=yr,
                tranche_name=tranche.name,
                beginning_balance=beg_bal,
            )

            # Effective rate
            if tranche.rate_type == "floating":
                eff_rate = max(tranche.base_rate + tranche.spread, tranche.floor)
            else:
                eff_rate = tranche.interest_rate
            entry.effective_rate = eff_rate

            # Interest / PIK
            if tranche.amortization_type == "PIK":
                entry.cash_interest = 0.0
                entry.pik_accrual = beg_bal * tranche.pik_rate
            else:
                entry.cash_interest = beg_bal * eff_rate if tranche.cash_interest else 0.0
                entry.pik_accrual = 0.0

            # Mandatory scheduled repayment
            sched = tranche.amortization_schedule
            if yr_idx < len(sched):
                entry.scheduled_repayment = min(sched[yr_idx], beg_bal + entry.pik_accrual)
            else:
                entry.scheduled_repayment = 0.0

            # Commitment fee
            entry.commitment_fee_paid = beg_bal * tranche.commitment_fee

            total_mandatory_amort += entry.scheduled_repayment
            total_cash_interest += entry.cash_interest
            year_entries.append(entry)

        # Second pass: cash sweep (applied only to cash-pay, cash_sweep-type tranches)
        available_for_sweep = fcf_pre_debt - total_mandatory_amort - total_cash_interest
        for t_idx, tranche in enumerate(tranches):
            entry = year_entries[t_idx]
            if tranche.amortization_type == "cash_sweep" and available_for_sweep > 0:
                max_sweep = max(0.0, available_for_sweep * tranche.cash_sweep_pct)
                # Cannot repay more than remaining balance after scheduled
                remaining = entry.beginning_balance + entry.pik_accrual - entry.scheduled_repayment
                entry.sweep_repayment = min(max_sweep, max(0.0, remaining))
                available_for_sweep -= entry.sweep_repayment
            else:
                entry.sweep_repayment = 0.0

        # Third pass: finalize
        for t_idx, tranche in enumerate(tranches):
            entry = year_entries[t_idx]
            entry.total_repayment = entry.scheduled_repayment + entry.sweep_repayment
            entry.ending_balance = (
                entry.beginning_balance
                + entry.pik_accrual
                - entry.total_repayment
            )
            entry.ending_balance = max(0.0, entry.ending_balance)

            # Interest tax shield
            if shield:
                entry.interest_tax_shield = entry.cash_interest * tax_rate
            else:
                entry.interest_tax_shield = 0.0

            # Update running balance for next year
            balances[t_idx] = entry.ending_balance
            tranche_years[t_idx].append(entry)

    # Build aggregate metrics
    total_debt_by_year: list[float] = []
    net_debt_by_year: list[float] = []
    leverage_by_year: list[float] = []
    coverage_by_year: list[float] = []
    dscr_by_year: list[float] = []
    cash_interest_by_year: list[float] = []
    repayment_by_year: list[float] = []
    shield_by_year: list[float] = []

    for yr_idx in range(hp):
        tot_debt = sum(tranche_years[t][yr_idx].ending_balance for t in range(len(tranches)))
        tot_cash_int = sum(tranche_years[t][yr_idx].cash_interest for t in range(len(tranches)))
        tot_repay = sum(tranche_years[t][yr_idx].total_repayment for t in range(len(tranches)))
        tot_shield = sum(tranche_years[t][yr_idx].interest_tax_shield for t in range(len(tranches)))
        mandatory_amort = sum(tranche_years[t][yr_idx].scheduled_repayment for t in range(len(tranches)))

        proj_yr = projections.years[yr_idx] if yr_idx < len(projections.years) else None
        ebitda_adj = proj_yr.ebitda_adj if proj_yr else 1.0
        fcf_pre = proj_yr.fcf_pre_debt if proj_yr else 0.0

        total_debt_by_year.append(tot_debt)
        net_debt_by_year.append(tot_debt)  # no cash on BS modelled
        leverage_by_year.append(tot_debt / ebitda_adj if ebitda_adj > 0 else 0.0)
        coverage_by_year.append(ebitda_adj / tot_cash_int if tot_cash_int > 0 else 99.0)
        debt_service = tot_cash_int + mandatory_amort
        dscr_by_year.append(fcf_pre / debt_service if debt_service > 0 else 99.0)
        cash_interest_by_year.append(tot_cash_int)
        repayment_by_year.append(tot_repay)
        shield_by_year.append(tot_shield)

    return DebtSchedule(
        tranche_schedules=tranche_years,
        total_debt_by_year=total_debt_by_year,
        net_debt_by_year=net_debt_by_year,
        leverage_ratio_by_year=leverage_by_year,
        interest_coverage_by_year=coverage_by_year,
        dscr_by_year=dscr_by_year,
        total_cash_interest_by_year=cash_interest_by_year,
        total_repayment_by_year=repayment_by_year,
        total_interest_tax_shield_by_year=shield_by_year,
    )
