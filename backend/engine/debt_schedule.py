"""Full debt waterfall engine per Section 3.2.

Audit-driven changes (audit_report_part2.md, debt_schedule.py findings):
  * `fcf_pre_debt` is documented and validated as FCFF (FINDING 1).
  * Cash interest computed on average balance (beginning + post-mandatory)
    with explicit documentation of the convention (FINDING 2).
  * Amortization schedule validated (FINDING 3).
  * Cash sweep allocation pools the available pot and distributes by sweep
    priority + cash_sweep_pct, capped at remaining tranche balance — no more
    over-sweeping (FINDING 5).
  * Interest shortfall tracked when FCFF + cash on hand cannot service cash
    interest (FINDING 4); shortfall reported in `interest_shortfall_by_year`.
  * Leverage ratio returns `inf` when EBITDA ≤ 0 (FINDING 6).
  * Interest coverage uses both EBITDA and EBIT denominators; returns `inf`
    when interest is zero (FINDING 7).
  * DSCR uses `(interest + mandatory amortisation)` denominator per standard
    lender definition; FCCR also reported. Interest coverage exposed
    separately (FINDING 8).
  * Net debt subtracts modelled cash balance / minimum cash floor (FINDING 9).
  * Tax shield includes both cash interest and PIK interest, gated on the
    jurisdiction-specific deductibility flag (FINDING 10).
  * Senior leverage tracks senior tranches only (audit FINDING 6 of
    reality_check.py).
"""

from __future__ import annotations

import logging

from backend.models.debt import DebtSchedule, DebtScheduleYear, DebtTranche
from backend.models.outputs import AnnualProjection
from backend.models.state import ModelState
from backend.engine.projections import _monitoring_fee_for_year, _oid_amort_by_year

logger = logging.getLogger(__name__)


def _is_senior_tranche(tranche: DebtTranche) -> bool:
    """Classify a tranche as senior (first-lien) for credit metrics."""
    t = (tranche.tranche_type or "").lower()
    return any(key in t for key in ("senior", "tla", "tlb", "term", "revolver", "first_lien", "unitranche"))


def _validate_amort_schedule(tranche: DebtTranche) -> None:
    sched = tranche.amortization_schedule
    if not sched:
        return
    total = sum(sched)
    # Schedule may exceed nominal principal slightly (e.g., for PIK that capitalises).
    if total > tranche.principal * 1.5 + 0.5 and tranche.amortization_type != "PIK":
        logger.warning(
            "Amortization schedule for tranche '%s' (%.2f) exceeds 150%% of principal (%.2f).",
            tranche.name, total, tranche.principal,
        )


def build_debt_schedule(
    state: ModelState, projections: AnnualProjection
) -> DebtSchedule:
    """Build per-tranche, per-year debt waterfall.

    Handles bullet, straight-line, PIK, cash_sweep, and floating rates with
    a properly pooled sweep allocation and full credit metric suite.
    """
    hp = state.exit.holding_period
    tranches = state.debt_tranches
    tax_rate = state.tax.tax_rate
    shield = state.tax.tax_shield_on_interest
    pik_deductible = state.tax.pik_interest_tax_deductible

    if not tranches:
        return DebtSchedule()

    for tranche in tranches:
        _validate_amort_schedule(tranche)

    # Validate projection coverage (FINDING 1)
    if len(projections.years) < hp:
        logger.warning(
            "Projections cover %d years but holding period is %d — extending with zeros.",
            len(projections.years), hp,
        )

    # Per-tranche schedule storage
    tranche_years: list[list[DebtScheduleYear]] = [[] for _ in tranches]
    balances: list[float] = [t.principal for t in tranches]

    # Roll-forward cash balance for shortfall and net-debt tracking
    cash_balance = 0.0
    min_cash = max(0.0, getattr(state.entry, "min_cash_balance", 0.0))

    cash_balance_by_year: list[float] = []
    interest_shortfall_by_year: list[float] = []
    distributions_paid_by_year: list[float] = []
    distribution_blocked_by_year: list[bool] = []
    refinancing_premium_by_year: list[float] = []
    oid_amort_by_year = _oid_amort_by_year(state)  # non-cash; added back in the levered cash flow (P4-14)
    distributions = state.exit.interim_distributions or []
    cov = getattr(state, "credit_covenants", None)
    has_dist_block = cov is not None and (
        cov.distribution_block_leverage is not None or cov.distribution_block_dscr is not None
    )

    for yr_idx in range(hp):
        yr = yr_idx + 1
        proj_yr = projections.years[yr_idx] if yr_idx < len(projections.years) else None
        # Convention (FINDING 1): fcf_pre_debt is FCFF (unlevered, before any
        # debt service). Interest and mandatory amortisation are paid out of
        # this pool; sweep and minimum cash use the residue.
        fcf_pre_debt = proj_yr.fcf_pre_debt if proj_yr else 0.0

        # First pass: compute interest and mandatory amortization
        total_mandatory_amort = 0.0
        total_cash_interest = 0.0
        refi_premium_this_year = 0.0
        year_entries: list[DebtScheduleYear] = []

        for t_idx, tranche in enumerate(tranches):
            beg_bal = balances[t_idx]
            entry = DebtScheduleYear(
                year=yr,
                tranche_name=tranche.name,
                beginning_balance=beg_bal,
            )

            # Refinancing (P4-3): once the refi year is reached the tranche reprices and
            # a one-time prepayment/call premium is charged on the outstanding balance.
            refi = tranche.refinancing
            refi_active = refi is not None and yr_idx >= refi.year - 1
            if refi is not None and yr_idx == refi.year - 1:
                refi_premium_this_year += max(0.0, refi.prepayment_premium) * beg_bal

            # Effective rate — honour an optional forward base-rate path (rate cycle).
            if tranche.rate_type == "floating":
                if tranche.base_rate_by_year and yr_idx < len(tranche.base_rate_by_year):
                    base_rate_this_year = tranche.base_rate_by_year[yr_idx]
                else:
                    base_rate_this_year = tranche.base_rate
                spread = refi.new_spread if refi_active else tranche.spread
                floor = refi.new_floor if refi_active else tranche.floor
                eff_rate = max(base_rate_this_year + spread, floor)
            else:
                # Fixed: a refinancing resets the all-in rate to new_spread.
                eff_rate = refi.new_spread if refi_active else tranche.interest_rate
            entry.effective_rate = eff_rate

            # Mandatory scheduled repayment first (so we can compute average bal)
            sched = tranche.amortization_schedule
            scheduled_repayment_request = sched[yr_idx] if yr_idx < len(sched) else 0.0
            entry.scheduled_repayment = max(0.0, min(scheduled_repayment_request, beg_bal))

            # PIK-toggle (P4-4): a PIK tranche elects PIK or cash each year. Default
            # (no toggle / missing election) = always-PIK, unchanged. When cash is
            # elected the note pays cash at its coupon (pik_rate, falling back to
            # eff_rate) and does not accrete that year.
            pik_instrument = tranche.amortization_type == "PIK"
            if pik_instrument and tranche.pik_toggle and yr_idx < len(tranche.pik_election_by_year):
                elect_pik = tranche.pik_election_by_year[yr_idx]
            else:
                elect_pik = pik_instrument

            # Interest / PIK on average balance — beginning vs post-mandatory
            # (FINDING 2). PIK accrues on beginning balance per standard
            # convention (compounds full year).
            if pik_instrument and elect_pik:
                entry.cash_interest = 0.0
                entry.pik_accrual = beg_bal * tranche.pik_rate
            else:
                avg_bal = (beg_bal + max(0.0, beg_bal - entry.scheduled_repayment)) / 2.0
                # A PIK tranche electing cash pays at its note coupon (pik_rate); else eff_rate.
                cash_rate = (tranche.pik_rate or eff_rate) if pik_instrument else eff_rate
                pays_cash = pik_instrument or tranche.cash_interest
                entry.cash_interest = avg_bal * cash_rate if pays_cash else 0.0
                entry.pik_accrual = 0.0

            # Commitment fee — revolvers charge on undrawn capacity; other tranches
            # keep the legacy running fee on the drawn balance.
            if tranche.tranche_type == "revolver":
                commitment = tranche.commitment if tranche.commitment else tranche.principal
                entry.commitment_fee_paid = max(0.0, commitment - beg_bal) * tranche.commitment_fee
            else:
                entry.commitment_fee_paid = beg_bal * tranche.commitment_fee

            total_mandatory_amort += entry.scheduled_repayment
            total_cash_interest += entry.cash_interest
            year_entries.append(entry)

        # ── Cash interest shortfall handling (FINDING 4) ──
        # Cash available to service interest = FCFF + full beginning cash balance.
        # The min_cash floor constrains sweep, not interest payment — interest
        # sits senior in the waterfall and can draw on all available cash.
        # Shortfall is logged but cash_interest is still booked as accrued; in
        # practice the model assumes lenders absorb timing differences.
        cash_available_for_interest = fcf_pre_debt + cash_balance
        if total_cash_interest > 0 and cash_available_for_interest < total_cash_interest:
            shortfall = total_cash_interest - cash_available_for_interest
            interest_shortfall_by_year.append(shortfall)
            logger.warning(
                "Year %d cash interest of %.2f exceeds available cash of %.2f — shortfall %.2f.",
                yr, total_cash_interest, cash_available_for_interest, shortfall,
            )
        else:
            interest_shortfall_by_year.append(0.0)

        # ── Pooled cash sweep allocation (FINDING 5) ──
        # Available for sweep = FCFF − mandatory amort − cash interest − incremental
        # floor shortfall.  min_cash is a balance-sheet floor, not an annual rebuild
        # cost: only the gap between the floor and the current balance constrains sweep.
        # Excess beginning cash (cash_balance > min_cash) stays on the balance sheet
        # and is NOT auto-swept; it reduces net debt at exit.
        floor_shortfall = max(0.0, min_cash - cash_balance)
        available_for_sweep = (
            fcf_pre_debt
            - total_mandatory_amort
            - total_cash_interest
            - floor_shortfall
        )
        # Order tranches by sweep priority (lower = swept first), pro-rata within tier
        sweep_indices = [
            i for i, t in enumerate(tranches) if t.amortization_type == "cash_sweep"
        ]
        if sweep_indices and available_for_sweep > 0:
            # Group by priority
            priority_tiers: dict[int, list[int]] = {}
            for i in sweep_indices:
                priority_tiers.setdefault(tranches[i].sweep_priority, []).append(i)

            remaining_pool = available_for_sweep
            for priority in sorted(priority_tiers.keys()):
                if remaining_pool <= 0:
                    break
                tier = priority_tiers[priority]
                tier_pcts = sum(tranches[i].cash_sweep_pct for i in tier)
                if tier_pcts <= 0:
                    continue
                # Effective sweep capacity for this tier
                tier_capacity = remaining_pool * min(1.0, tier_pcts)
                # Pro-rata within tier by cash_sweep_pct
                allocations: dict[int, float] = {}
                allocated = 0.0
                for i in tier:
                    share = tranches[i].cash_sweep_pct / tier_pcts
                    entry = year_entries[i]
                    cap = max(
                        0.0,
                        entry.beginning_balance + entry.pik_accrual - entry.scheduled_repayment,
                    )
                    request = tier_capacity * share
                    take = min(request, cap)
                    allocations[i] = take
                    allocated += take
                # If some tranches are at cap, reallocate the residual within the tier
                residual = tier_capacity - allocated
                while residual > 1e-9:
                    eligible = [
                        i for i in tier
                        if (
                            year_entries[i].beginning_balance
                            + year_entries[i].pik_accrual
                            - year_entries[i].scheduled_repayment
                            - allocations[i]
                        ) > 1e-9
                    ]
                    if not eligible:
                        break
                    pct_sum = sum(tranches[i].cash_sweep_pct for i in eligible) or 1.0
                    progress = 0.0
                    for i in eligible:
                        share = tranches[i].cash_sweep_pct / pct_sum
                        cap = max(
                            0.0,
                            year_entries[i].beginning_balance
                            + year_entries[i].pik_accrual
                            - year_entries[i].scheduled_repayment
                            - allocations[i],
                        )
                        take = min(residual * share, cap)
                        allocations[i] += take
                        progress += take
                    if progress < 1e-9:
                        break
                    residual -= progress
                for i in tier:
                    year_entries[i].sweep_repayment = allocations.get(i, 0.0)
                remaining_pool -= sum(allocations.values())
            for i in sweep_indices:
                # Make sure non-allocated remain 0
                year_entries[i].sweep_repayment = max(0.0, year_entries[i].sweep_repayment)
            available_for_sweep = max(0.0, remaining_pool)
        # Other tranches — explicitly zero sweep
        for t_idx, tranche in enumerate(tranches):
            if tranche.amortization_type != "cash_sweep":
                year_entries[t_idx].sweep_repayment = 0.0

        # Third pass: finalize and update tax shield (FINDING 10)
        for t_idx, tranche in enumerate(tranches):
            entry = year_entries[t_idx]
            entry.total_repayment = entry.scheduled_repayment + entry.sweep_repayment
            entry.ending_balance = (
                entry.beginning_balance
                + entry.pik_accrual
                - entry.total_repayment
            )
            entry.ending_balance = max(0.0, entry.ending_balance)

            # Tax shield includes PIK if jurisdiction allows (FINDING 10)
            if shield:
                deductible_interest = entry.cash_interest + (
                    entry.pik_accrual if pik_deductible else 0.0
                )
                entry.interest_tax_shield = deductible_interest * tax_rate
            else:
                entry.interest_tax_shield = 0.0

            balances[t_idx] = entry.ending_balance
            tranche_years[t_idx].append(entry)

        # Cash balance roll-forward, net of interim distributions (special dividends).
        # Distributions are paid from available cash and cannot exceed it; reducing
        # cash here raises net debt so the return no longer double-counts them.
        period_total_repayment = sum(e.total_repayment for e in year_entries)

        # Levered operating cash flow: NI + D&A + non-cash addbacks (financing-fee
        # amortisation, PIK) − capex − ΔNWC − monitoring fee. Using NI (not unlevered
        # FCFF) captures the interest tax shield, so cash / net debt are correct and
        # the three-statement balance sheet closes.
        total_pik_year = sum(e.pik_accrual for e in year_entries)
        if proj_yr is not None:
            # Monitoring fee zero in the exit year (P4-11) — must match projections /
            # balance sheet so the cash roll-forward and close stay consistent.
            mon_fee = _monitoring_fee_for_year(state, yr_idx)
            levered_op_cash = (
                proj_yr.net_income
                + proj_yr.da
                + proj_yr.financing_fee_amort
                + oid_amort_by_year[yr_idx]  # non-cash OID amort added back (P4-14)
                + total_pik_year
                - proj_yr.total_capex
                - proj_yr.delta_nwc
                - mon_fee
            )
        else:
            levered_op_cash = 0.0

        # Revolver dynamic draw/repay (P3-4): draw to cover a cash shortfall below the
        # min-cash floor, or repay from excess cash. Interest is charged on the opening
        # drawn balance; the net principal change flows through total_repayment so the
        # cash roll-forward below picks it up. No-op without a revolver tranche.
        cash_after_service = cash_balance + levered_op_cash - period_total_repayment - refi_premium_this_year
        for t_idx, tranche in enumerate(tranches):
            if tranche.tranche_type != "revolver":
                continue
            r_entry = year_entries[t_idx]
            drawn = r_entry.ending_balance
            commitment = tranche.commitment if tranche.commitment else tranche.principal
            if cash_after_service < min_cash:
                draw = min(min_cash - cash_after_service, max(0.0, commitment - drawn))
                r_entry.ending_balance = drawn + draw
                cash_after_service += draw
            elif drawn > 0:
                repay = min(cash_after_service - min_cash, drawn)
                r_entry.ending_balance = drawn - repay
                cash_after_service -= repay
            new_repayment = r_entry.beginning_balance + r_entry.pik_accrual - r_entry.ending_balance
            period_total_repayment += new_repayment - r_entry.total_repayment
            r_entry.total_repayment = new_repayment
            balances[t_idx] = r_entry.ending_balance

        cash_post_service = cash_balance + levered_op_cash - period_total_repayment - refi_premium_this_year
        refinancing_premium_by_year.append(refi_premium_this_year)
        requested_dist = distributions[yr_idx] if yr_idx < len(distributions) else 0.0
        # Cash trap / restricted-payment block (P4-13): block the distribution when this
        # year's leverage or DSCR breaches the trigger (same metric definitions as the
        # aggregate credit metrics below, so the block aligns with the covenant breach).
        dist_blocked = False
        if has_dist_block and requested_dist > 0:
            ending_debt = sum(balances)
            ebitda_adj_yr = proj_yr.ebitda_adj if proj_yr is not None else 0.0
            debt_service_yr = total_cash_interest + total_mandatory_amort
            levr = ending_debt / ebitda_adj_yr if ebitda_adj_yr > 0 else float("inf")
            dscr_yr = fcf_pre_debt / debt_service_yr if debt_service_yr > 0 else float("inf")
            if cov.distribution_block_leverage is not None and levr > cov.distribution_block_leverage:
                dist_blocked = True
            if cov.distribution_block_dscr is not None and dscr_yr < cov.distribution_block_dscr:
                dist_blocked = True
        raw_dist = 0.0 if dist_blocked else requested_dist
        dist_paid = max(0.0, min(raw_dist, max(0.0, cash_post_service)))
        cash_balance = max(0.0, cash_post_service - dist_paid)
        distributions_paid_by_year.append(dist_paid)
        distribution_blocked_by_year.append(dist_blocked)
        cash_balance_by_year.append(cash_balance)

    # Build aggregate metrics
    total_debt_by_year: list[float] = []
    net_debt_by_year: list[float] = []
    leverage_by_year: list[float] = []
    senior_leverage_by_year: list[float] = []
    coverage_by_year: list[float] = []
    coverage_ebit_by_year: list[float] = []
    dscr_by_year: list[float] = []
    fccr_by_year: list[float] = []
    cash_interest_by_year: list[float] = []
    pik_by_year: list[float] = []
    mandatory_by_year: list[float] = []
    repayment_by_year: list[float] = []
    shield_by_year: list[float] = []

    senior_idx = [i for i, t in enumerate(tranches) if _is_senior_tranche(t)]

    for yr_idx in range(hp):
        tot_debt = sum(tranche_years[t][yr_idx].ending_balance for t in range(len(tranches)))
        senior_debt = sum(
            tranche_years[i][yr_idx].ending_balance for i in senior_idx
        )
        tot_cash_int = sum(tranche_years[t][yr_idx].cash_interest for t in range(len(tranches)))
        tot_pik = sum(tranche_years[t][yr_idx].pik_accrual for t in range(len(tranches)))
        tot_repay = sum(tranche_years[t][yr_idx].total_repayment for t in range(len(tranches)))
        tot_shield = sum(tranche_years[t][yr_idx].interest_tax_shield for t in range(len(tranches)))
        mandatory_amort = sum(
            tranche_years[t][yr_idx].scheduled_repayment for t in range(len(tranches))
        )

        proj_yr = projections.years[yr_idx] if yr_idx < len(projections.years) else None
        ebitda_adj = proj_yr.ebitda_adj if proj_yr else 0.0
        ebit = proj_yr.ebit if proj_yr else 0.0
        fcf_pre = proj_yr.fcf_pre_debt if proj_yr else 0.0

        # Net debt subtracts actual cash on hand (FINDING 9).
        # cash_held is the real balance-sheet cash; min_cash is an operational
        # floor already enforced by the sweep waterfall, not an additional deduction.
        cash_held = cash_balance_by_year[yr_idx] if yr_idx < len(cash_balance_by_year) else 0.0
        net_debt = max(0.0, tot_debt - cash_held)

        total_debt_by_year.append(tot_debt)
        net_debt_by_year.append(net_debt)
        # Leverage: inf when EBITDA ≤ 0 (FINDING 6)
        leverage_by_year.append(float("inf") if ebitda_adj <= 0 else tot_debt / ebitda_adj)
        senior_leverage_by_year.append(
            float("inf") if ebitda_adj <= 0 else senior_debt / ebitda_adj
        )
        # Interest coverage: separate EBITDA-based and EBIT-based (FINDING 7)
        coverage_by_year.append(
            float("inf") if tot_cash_int <= 0 else ebitda_adj / tot_cash_int
        )
        coverage_ebit_by_year.append(
            float("inf") if tot_cash_int <= 0 else ebit / tot_cash_int
        )
        # DSCR per lender convention: FCFF / (interest + mandatory amort) (FINDING 8)
        debt_service = tot_cash_int + mandatory_amort
        dscr_by_year.append(
            float("inf") if debt_service <= 0 else fcf_pre / debt_service
        )
        # FCCR: (EBITDA - Maintenance Capex - Tax) / (Cash Interest + Mandatory Amort).
        # Credit agreements define FCCR on maintenance capex only — growth capex is
        # discretionary and excluded. Distinct from DSCR; measures ability to cover
        # fixed charges from cash earnings before interest and debt service.
        maintenance_capex = proj_yr.maintenance_capex if proj_yr else 0.0
        tax = proj_yr.tax if proj_yr else 0.0
        fccr_numerator = ebitda_adj - maintenance_capex - tax
        fccr_by_year.append(
            float("inf") if debt_service <= 0 else fccr_numerator / debt_service
        )

        cash_interest_by_year.append(tot_cash_int)
        pik_by_year.append(tot_pik)
        mandatory_by_year.append(mandatory_amort)
        repayment_by_year.append(tot_repay)
        shield_by_year.append(tot_shield)

    return DebtSchedule(
        tranche_schedules=tranche_years,
        total_debt_by_year=total_debt_by_year,
        net_debt_by_year=net_debt_by_year,
        leverage_ratio_by_year=leverage_by_year,
        senior_leverage_by_year=senior_leverage_by_year,
        interest_coverage_by_year=coverage_by_year,
        interest_coverage_ebit_by_year=coverage_ebit_by_year,
        dscr_by_year=dscr_by_year,
        fccr_by_year=fccr_by_year,
        total_cash_interest_by_year=cash_interest_by_year,
        total_pik_interest_by_year=pik_by_year,
        total_mandatory_amort_by_year=mandatory_by_year,
        total_repayment_by_year=repayment_by_year,
        total_interest_tax_shield_by_year=shield_by_year,
        interest_shortfall_by_year=interest_shortfall_by_year,
        cash_balance_by_year=cash_balance_by_year,
        distributions_paid_by_year=distributions_paid_by_year,
        distribution_blocked_by_year=distribution_blocked_by_year,
        refinancing_premium_by_year=refinancing_premium_by_year,
    )
