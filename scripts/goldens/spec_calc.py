#!/usr/bin/env python3
"""
spec_calc.py — the golden-deal reference derivation (Phase B, rebuild/PHASE_B_GOLDENS_KERNEL.md).

A SPEC-LITERAL implementation of lib/engine2/SPEC.md v1.0, deliberately written in Python
(a different language from the engine; imports nothing from the repo) so the committed
fixtures in tests/goldens/ are independent ground truth. Every block cites its SPEC section.
This script is a TEST ARTIFACT: it generates committed fixtures only, and regenerating them
is a reviewed change (agreement check pins the output).

Scope = exactly what the goldens need (SPEC §17): FY basis, no rollover, no monitoring,
single flat sweep pct, at most one revolver. Anything outside that scope raises.
[v1.1.1] Scope extended for Phase G-1: §3 step 7 interim distributions + §3.7 the
restricted-payment cash trap, §9 DPI/payback, §10's distribution-inclusive promote hurdle,
and the §1 mid-year IRR of the sponsor-side streams (recorded alongside the period-end IRR;
the goldens' DISPLAYED convention stays period-end — §17 "mid-year off").
"""

import json, csv, math, os, sys

TOL = 5e-3  # §15: flows ±$0.005m

# ── §4 rates ──────────────────────────────────────────────────────────────────
def all_in(pricing):
    if pricing["kind"] == "fixed":
        return pricing["rate"]
    # all-in = max(base, floor) + spread — floor applies to the BASE (§4)
    return max(pricing["base_rate"], pricing["floor"]) + pricing["spread"]

# ── §7 margin trajectory ─────────────────────────────────────────────────────
def margin_path(base, target, path, N):
    def w(t):
        return t if path == "linear" else math.sqrt(t) if path == "front_loaded" else t * t
    return [base + (target - base) * w(t) / w(N) for t in range(1, N + 1)]

# ── §7 NWC ───────────────────────────────────────────────────────────────────
def nwc_balance(nwc, revenue, margin):
    if nwc["method"] == "pct":
        return nwc["pct_revenue"] * revenue
    cogs = revenue * (1.0 - margin)  # disclosed COGS proxy (§7)
    return nwc["dso"] / 365.0 * revenue + nwc["dio"] / 365.0 * cogs - nwc["dpo"] / 365.0 * cogs

# ── §1 timing ────────────────────────────────────────────────────────────────
def mid_year_times(n):
    """§1 mid-year convention: interim flows shift to t − 0.5; the flow at t = 0 (close)
    and the EXIT flow (t = N) never shift. `n` = N + 1 (t0-anchored series)."""
    return [float(i) if i == 0 or i == n - 1 else i - 0.5 for i in range(n)]

# ── IRR (bisection) ──────────────────────────────────────────────────────────
def irr(cfs, times=None):
    ts = list(range(len(cfs))) if times is None else times
    def npv(r):
        return sum(cf / (1 + r) ** t for t, cf in zip(ts, cfs))
    lo, hi = -0.9999, 10.0
    if npv(lo) * npv(hi) > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2
        v = npv(mid)
        if abs(v) < 1e-12:
            break
        if npv(lo) * v <= 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2

# ── the model ────────────────────────────────────────────────────────────────
def run(golden):
    f, a = golden["facts"], golden["assumptions"]
    N = a["hold_years"]
    assert a["entry"]["basis"] == "fy" and a["exit"]["basis"] == "fy"
    assert a.get("rollover_equity", 0) == 0 and a["fees"].get("monitoring") is None

    # §16 [v1.1.0] schema additions (flattened here as the script flattens structure.*):
    # `structure.distributions` (null ≡ all-zero ≡ feature off) and `covenants.rp_trap`.
    # Structural gate: entries ≥ 0, length == hold_years.
    dist_request = a.get("distributions")
    if dist_request is None:
        dist_request = [0.0] * N
    assert len(dist_request) == N, "§16 gate: distributions length must equal hold_years"
    assert all(d >= 0 for d in dist_request), "§16 gate: distribution requests must be ≥ 0"
    rp_trap = a.get("rp_trap")
    assert rp_trap is None or rp_trap["metric"] == "net_leverage", "§3.7: v1 metric is net_leverage"
    # Rollover is 0 across every golden (asserted above) ⇒ the sponsor's pari-passu share of
    # each paid distribution is 100% (§9 membership row).
    sponsor_dist_share = 1.0

    # §2/§16 derived
    ebitda0 = f["fy_ebitda"]
    ev = a["entry"]["entry_multiple"] * ebitda0
    terms = [t for t in a["tranches"] if t["type"] != "revolver"]
    revs = [t for t in a["tranches"] if t["type"] == "revolver"]
    assert len(revs) <= 1
    rev_t = revs[0] if revs else None
    par = {t["name"]: t["size_x_ebitda"] * ebitda0 for t in terms}
    rev_commit = rev_t["size_x_ebitda"] * ebitda0 if rev_t and "size_x_ebitda" in rev_t else (rev_t["commitment_amount"] if rev_t else 0.0)
    total_par = sum(par.values())
    commitments = total_par + rev_commit
    txn = a["fees"]["transaction_pct_of_ev"] * ev
    finfees = a["fees"]["financing_pct_of_commitments"] * commitments
    oid_by_t = {t["name"]: par[t["name"]] * t.get("oid_pct", 0.0) for t in terms}
    oid_total = sum(oid_by_t.values())
    min_cash = a["min_cash"]
    uses = ev + txn + finfees + oid_total + min_cash
    sponsor_equity = uses - total_par  # §2 plug (rollover 0)

    # §7 fee allocation: pro-rata by commitment over each tranche's maturity
    fee_alloc = {t["name"]: finfees * par[t["name"]] / commitments for t in terms}
    if rev_t:
        fee_alloc[rev_t["name"]] = finfees * rev_commit / commitments

    # operating pre-compute (§7)
    margins = ([a["operations"]["target_margin"]] * N
               if a["operations"]["target_margin"] == f["fy_ebitda_margin"]
               else margin_path(f["fy_ebitda_margin"], a["operations"]["target_margin"],
                                a["operations"]["margin_path"], N))
    revenue, prev_rev = [], f["fy_revenue"]
    for t in range(N):
        prev_rev *= (1 + a["operations"]["growth"][t])
        revenue.append(prev_rev)
    nwc0 = nwc_balance(a["operations"]["nwc"], f["fy_revenue"], f["fy_ebitda_margin"])

    # state
    bal = dict(par)                       # term balances (PIK accrues in)
    drawn = rev_t["drawn_at_close"] if rev_t else 0.0
    cash = min_cash
    oid_rem = dict(oid_by_t)
    fee_rem = dict(fee_alloc)
    cf163 = 0.0
    acq_nol = a["tax"]["nol"]["acquired_opening"] if a["tax"]["nol"]["acquired_usable"] else 0.0
    acq_usable = a["tax"]["nol"]["acquired_usable"]
    post_nol = 0.0
    ppe = f["net_ppe"]
    equity_bs = sponsor_equity
    dfc = finfees + oid_total
    goodwill = (total_par + drawn + equity_bs) - (cash + nwc0 + ppe + dfc)  # §8 plug

    out = {"derived": {"enterprise_value": r2(ev), "sponsor_equity": r2(sponsor_equity),
                       "total_debt_at_par": r2(total_par),
                       # §11 [v1.1.2]: entry leverage is GROSS — par ÷ FY EBITDA, the quoted
                       # term-sheet number §17 sizes tranches on. Deliberately NOT netted
                       # against the funded min-cash (that would be (par − min_cash)/EBITDA).
                       "entry_gross_leverage_fy": r4(total_par / ebitda0) if ebitda0 else None},
           "sources_uses": {"enterprise_value": r2(ev), "transaction_costs": r2(txn),
                            "financing_fees": r2(finfees), "oid_funded": r2(oid_total),
                            "cash_to_balance_sheet": r2(min_cash), "total_uses": r2(uses),
                            "debt_at_par": [{"name": k, "amount": r2(v)} for k, v in par.items()],
                            "sponsor_equity": r2(sponsor_equity), "total_sources": r2(total_par + sponsor_equity)},
           "operating": [], "tax": [], "tranches": {t["name"]: [] for t in terms},
           "revolver": [] if rev_t else None, "waterfall": [], "balance_sheet": [], "credit": []}
    out["balance_sheet"].append(bs_row(cash, nwc0, ppe, dfc, goodwill, total_par + drawn, equity_bs))

    prev_nwc = nwc0
    paid_by_year = []         # §3 step 7: distributions actually paid (total equity)
    ufcf_stream = []          # unlevered (§9): interim UFCF inflows
    u_acq, u_post = (a["tax"]["nol"]["acquired_opening"] if acq_usable else 0.0), 0.0  # unlevered NOL state
    ebitda_adj_full = None    # full-precision exit-year EBITDA_adj (§15: no intermediate rounding)

    for t in range(N):
        exit_year = (t == N - 1)
        rev_ = revenue[t]; m = margins[t]
        ebitda = rev_ * m; ebitda_adj = ebitda  # monitoring null (§7)
        if t == N - 1:
            ebitda_adj_full = ebitda_adj
        da = a["operations"]["da_pct_revenue"] * rev_
        ebit = ebitda_adj - da
        mcap = a["operations"]["maint_capex_pct_revenue"] * rev_
        gcap = a["operations"]["growth_capex"][t]
        nwc = nwc_balance(a["operations"]["nwc"], rev_, m)
        dnwc = nwc - prev_nwc

        # §4 interest on beginning balances
        cash_int, pik_acc, oid_amort = {}, {}, {}
        for tr in terms:
            b = bal[tr["name"]]
            if tr["type"] == "pik_note":
                cash_int[tr["name"]] = b * tr["cash_coupon"]
                pik_acc[tr["name"]] = b * tr["pik_coupon"]
            else:
                cash_int[tr["name"]] = b * all_in(tr["pricing"])
                pik_acc[tr["name"]] = 0.0
            oid_amort[tr["name"]] = min(oid_rem[tr["name"]], oid_by_t[tr["name"]] / tr["maturity_years"]) if oid_by_t[tr["name"]] else 0.0
        rev_int = drawn * all_in(rev_t["pricing"]) if rev_t else 0.0
        commit_fee = (rev_commit - drawn) * rev_t["commitment_fee"] if rev_t else 0.0
        fee_amort = {}
        for name, total_fee in fee_alloc.items():
            mat = next((tr["maturity_years"] for tr in terms if tr["name"] == name), rev_t["maturity_years"] if rev_t else None)
            fee_amort[name] = min(fee_rem[name], total_fee / mat) if total_fee else 0.0
        for name in oid_amort: oid_rem[name] -= oid_amort[name]
        for name in fee_amort: fee_rem[name] -= fee_amort[name]

        # early-retirement / exit write-off pool (computed after waterfall; tax needs it → two-pass within year:
        # §5 order is tax BEFORE waterfall; write-off is known only for the EXIT year (retirement at exit).
        exit_writeoff = (sum(oid_rem.values()) + sum(fee_rem.values())) if exit_year else 0.0

        # §6 tax
        ati = ebitda_adj if a["tax"]["s163j"]["ati_basis"] == "ebitda" else ebitda_adj - da
        capped_pool = sum(cash_int.values()) + rev_int + sum(pik_acc.values()) + sum(oid_amort.values())
        uncapped = sum(fee_amort.values()) + commit_fee + exit_writeoff
        if not a["tax"]["interest_deductible"]:
            deductible, cf_new = 0.0, 0.0
        elif not a["tax"]["s163j"]["applies"]:
            deductible, cf_new = capped_pool + cf163, 0.0
        else:
            available = capped_pool + cf163
            cap = max(0.0, a["tax"]["s163j"]["ati_pct"] * ati)
            deductible = min(available, cap)
            cf_new = available - deductible
        taxable = ebit - deductible - uncapped
        acq_used = post_used = banked = 0.0
        if taxable <= 0:
            post_nol += -taxable
            banked = -taxable
            tax = 0.0
        else:
            cap_pct = 1.0 if a["tax"]["nol"]["arose_pre_2018"] else 0.8
            lim382 = a["tax"]["nol"]["s382_annual_limit"]
            acq_used = min(acq_nol, lim382 if lim382 is not None else 1e18, cap_pct * taxable) if acq_usable else 0.0
            # §6.3 [v1.0.3]: after a pre-2018 acquired layer the 80% cap applies to the
            # RESIDUAL income (IRC §172(a)(2)(B)(ii)); post-2017 layers share 80% of the
            # full base. Aggregate usage ≤ taxable in both branches. Golden-inert (all
            # goldens run arose_pre_2018 = False).
            pre18 = a["tax"]["nol"]["arose_pre_2018"]
            post_used = min(post_nol, max(0.0, 0.8 * (taxable - (acq_used if pre18 else 0.0)) - (0.0 if pre18 else acq_used)))
            acq_nol -= acq_used; post_nol -= post_used
            tax = max(a["tax"]["rate"] * (taxable - acq_used - post_used), a["tax"]["minimum_rate"] * taxable)
        cf163_open = cf163; cf163 = cf_new

        fcf = ebitda_adj - tax - (mcap + gcap) - dnwc

        # §3 waterfall — one running cash variable
        c = cash + fcf
        c -= sum(cash_int.values()) + rev_int
        c -= commit_fee
        mand = {}
        for tr in terms:
            outstanding = bal[tr["name"]] + pik_acc[tr["name"]]
            mand[tr["name"]] = min(tr["amort_pct_of_face"] * par[tr["name"]], outstanding)
        c -= sum(mand.values())
        rev_repay = min(drawn, max(0.0, c - min_cash)) if rev_t else 0.0
        c -= rev_repay; drawn -= rev_repay
        pool = max(0.0, c - min_cash)
        pct = a["sweep"]["base_pct"]
        sweepable = pct * pool
        # priority tiers, pro-rata within tier, capped at outstanding (§3.5)
        sweep = {tr["name"]: 0.0 for tr in terms}
        remaining = sweepable
        for prio in sorted({tr["sweep_priority"] for tr in terms if tr["sweep_participates"]}):
            tier = [tr for tr in terms if tr["sweep_participates"] and tr["sweep_priority"] == prio]
            cap_tier = {tr["name"]: max(0.0, bal[tr["name"]] + pik_acc[tr["name"]] - mand[tr["name"]]) for tr in tier}
            tot = sum(cap_tier.values())
            if tot <= 0 or remaining <= 0: continue
            alloc = min(remaining, tot)
            for tr in tier:
                sweep[tr["name"]] = alloc * cap_tier[tr["name"]] / tot if tot else 0.0
            remaining -= alloc
        c -= sum(sweep.values())
        draw = 0.0
        if rev_t and c < min_cash - 1e-12:
            draw = min(min_cash - c, rev_commit - drawn)
            c += draw; drawn += draw
        breach = c < min_cash - 1e-9

        # §3 step 7 [v1.1.0] — interim distribution. Runs AFTER the draw (step 6), so a
        # distribution can never be revolver-funded, and the `c − min_cash` cap can only
        # spend what sits ABOVE the floor. In a breach year c < min_cash ⇒ paid = 0 by
        # arithmetic. Blocked/clipped capacity is NOT accrued (no catch-up ledger).
        request = dist_request[t]
        # §3.7 gross_debt_end = post-step-1..6 par outstanding incl. accrued PIK to date,
        # plus the drawn revolver — the same debt definition §11 net leverage uses.
        gross_debt_end = sum(bal[tr["name"]] + pik_acc[tr["name"]] - mand[tr["name"]] - sweep[tr["name"]]
                             for tr in terms) + drawn
        if rp_trap is None:
            rp_max = None                                    # trap OFF ⇒ +∞ (cash caps still bind)
            rp_cap = float("inf")
        else:
            # NORMATIVE for ALL EBITDA_adj incl. ≤ 0 (§3.7): the money form of the pro-forma
            # test, post-payment net debt ≤ L × EBITDA_adj. The ratio form inverts at E ≤ 0.
            rp_max = max(0.0, c - (gross_debt_end - rp_trap["level"] * ebitda_adj))
            rp_cap = rp_max
        paid = max(0.0, min(request, c - min_cash, rp_cap))
        # §3.7 blocked ⇔ the trap clipped what cash alone would have allowed; ties ⇒ false.
        blocked = rp_cap < min(request, max(0.0, c - min_cash))
        c -= paid
        paid_by_year.append(paid)
        closing_cash = c

        # balances forward
        for tr in terms:
            bal[tr["name"]] = bal[tr["name"]] + pik_acc[tr["name"]] - mand[tr["name"]] - sweep[tr["name"]]
        # early full retirement → write off remaining OID/fees NOW (§7) — only if pre-exit year
        early_wo = 0.0
        if not exit_year:
            for tr in terms:
                if bal[tr["name"]] <= TOL and (oid_rem[tr["name"]] > 0 or fee_rem[tr["name"]] > 0):
                    early_wo += oid_rem[tr["name"]] + fee_rem[tr["name"]]
                    oid_rem[tr["name"]] = fee_rem[tr["name"]] = 0.0
            if early_wo > 0:
                raise RuntimeError("early retirement write-off occurred pre-exit; golden must model it in tax — extend scope")

        # §8 BS roll
        ppe = ppe + (mcap + gcap) - da
        dfc = dfc - sum(oid_amort.values()) - sum(fee_amort.values()) - exit_writeoff
        ni = ebit - (sum(cash_int.values()) + rev_int + sum(pik_acc.values()) + sum(oid_amort.values())
                     + sum(fee_amort.values()) + commit_fee + exit_writeoff) - tax
        # A distribution leaves as cash and as book equity in the year paid — §14.2 (the BS
        # closes every year) forces it; §8 [v1.1.1] states it.
        equity_bs += ni - paid
        debt_bs = sum(bal.values()) + drawn
        row = bs_row(closing_cash, nwc, ppe, dfc, goodwill, debt_bs, equity_bs)
        assert abs(row["check"]) < TOL, f"BS does not close in year {t+1}: {row['check']}"

        # record
        out["operating"].append({"revenue": r2(rev_), "ebitda": r2(ebitda), "ebitda_adj": r2(ebitda_adj),
                                 "margin": r4(m), "da": r2(da), "ebit": r2(ebit), "maint_capex": r2(mcap),
                                 "growth_capex": r2(gcap), "nwc_balance": r2(nwc), "delta_nwc": r2(dnwc),
                                 "oid_amortization": r2(sum(oid_amort.values())),
                                 "financing_fee_amortization": r2(sum(fee_amort.values())),
                                 "fcf_pre_debt": r2(fcf)})
        out["tax"].append({"ati": r2(ati), "capped_interest_pool": r2(capped_pool),
                           "uncapped_deductions": r2(uncapped), "deductible_capped_interest": r2(deductible),
                           "s163j_carryforward_open": r2(cf163_open), "s163j_carryforward_end": r2(cf163),
                           "taxable_before_nol": r2(taxable), "acquired_nol_used": r2(acq_used),
                           "postclose_nol_used": r2(post_used), "nol_banked": r2(banked),
                           "acquired_nol_end": r2(acq_nol), "postclose_nol_end": r2(post_nol),
                           "cash_tax": r2(tax)})
        for tr in terms:
            out["tranches"][tr["name"]].append({"beginning_balance": r2(bal[tr["name"]] - pik_acc[tr["name"]] + mand[tr["name"]] + sweep[tr["name"]]),
                                                "cash_interest": r2(cash_int[tr["name"]]),
                                                "pik_accrual": r2(pik_acc[tr["name"]]),
                                                "mandatory_amort": r2(mand[tr["name"]]),
                                                "sweep_repayment": r2(sweep[tr["name"]]),
                                                "ending_balance": r2(bal[tr["name"]])})
        if rev_t is not None:
            out["revolver"].append({"beginning_drawn": r2(drawn + rev_repay - draw), "cash_interest": r2(rev_int),
                                    "commitment_fee": r2(commit_fee), "repayment": r2(rev_repay),
                                    "draw": r2(draw), "ending_drawn": r2(drawn),
                                    "undrawn_commitment": r2(rev_commit - drawn)})
        out["waterfall"].append({"opening_cash": r2(cash), "fcf_pre_debt": r2(fcf),
                                 "cash_interest_total": r2(sum(cash_int.values()) + rev_int),
                                 "commitment_fees": r2(commit_fee), "mandatory_amort_total": r2(sum(mand.values())),
                                 "revolver_repayment": r2(rev_repay), "sweep_pool": r2(pool),
                                 "sweep_pct_applied": r4(pct), "sweep_applied_total": r2(sum(sweep.values())),
                                 "revolver_draw": r2(draw), "closing_cash": r2(closing_cash),
                                 "cash_floor_breach": bool(breach),
                                 # §3 step 7 / §3.7 [v1.1.0]
                                 "distribution_requested": r2(request),
                                 "rp_max": (r2(rp_max) if rp_max is not None else None),
                                 "distribution_paid": r2(paid),
                                 "distribution_blocked": bool(blocked)})
        out["balance_sheet"].append(row)
        cash = closing_cash; prev_nwc = nwc

        # unlevered stream (§9/§6): interest & monitoring = 0; tax base EBITDA; NOL/§382 apply
        u_taxable = ebitda - da
        if u_taxable <= 0:
            u_post += -u_taxable; u_tax = 0.0
        else:
            cap_pct = 1.0 if a["tax"]["nol"]["arose_pre_2018"] else 0.8
            lim382 = a["tax"]["nol"]["s382_annual_limit"]
            ua = min(u_acq, lim382 if lim382 is not None else 1e18, cap_pct * u_taxable) if acq_usable else 0.0
            # §6.3 [v1.0.3] residual base after a pre-2018 layer (mirrors the levered path)
            pre18_u = a["tax"]["nol"]["arose_pre_2018"]
            up = min(u_post, max(0.0, 0.8 * (u_taxable - (ua if pre18_u else 0.0)) - (0.0 if pre18_u else ua)))
            u_acq -= ua; u_post -= up
            u_tax = max(a["tax"]["rate"] * (u_taxable - ua - up), a["tax"]["minimum_rate"] * u_taxable)
        ufcf_stream.append(ebitda - u_tax - (mcap + gcap) - dnwc)

    # §9 exit — FULL-precision basis (v1.0.3 correction: reading the r2-recorded
    # display value was an intermediate rounding, violating §15)
    exit_ebitda = ebitda_adj_full
    exit_ev = a["exit"]["multiple"] * exit_ebitda
    payoff = sum(bal.values()) + drawn
    exit_fees = a["exit"]["fees_pct"] * exit_ev
    exit_eq = exit_ev - payoff + cash - exit_fees
    cum_dist = sum(paid_by_year)                       # total equity distributions over the hold
    sponsor_paid = [p * sponsor_dist_share for p in paid_by_year]
    mip_payout = 0.0
    if a.get("mip"):
        hurdle_val = a["mip"]["hurdle_moic"] * sponsor_equity
        # §10 [v1.1.0]: "pre-MIP total equity proceeds" INCLUDES cumulative interim
        # distributions (the hurdle tests total value returned); the promote is still
        # computed and paid AT EXIT ONLY, capped at the exit equity available — a cap that
        # can now genuinely bind (large cumulative distributions, small exit residual).
        mip_payout = min(a["mip"]["pool_pct"] * max(0.0, exit_eq + cum_dist - hurdle_val),
                         max(0.0, exit_eq))
    sponsor_share = exit_eq - mip_payout

    # §9 [v1.1.0] membership: interim distributions are IN the sponsor stream (sponsor share)
    # and IN the pre-promote stream (total), EXCLUDED from the unlevered stream (an
    # equity/financing flow — the unlevered stream is capital-structure-blind). §14.16: the
    # year-N distribution and the exit settle in the SAME period-N flow.
    sponsor_cfs = [-sponsor_equity] + sponsor_paid[:-1] + [sponsor_share + sponsor_paid[-1]]
    prepromote_cfs = [-sponsor_equity] + paid_by_year[:-1] + [exit_eq + paid_by_year[-1]]
    unlev_cfs = [-(ev + txn)] + ufcf_stream[:-1] + [ufcf_stream[-1] + exit_ev - exit_fees]

    # §9 [v1.1.0] DPI & payback — on DISTRIBUTIONS ALONE; exit proceeds never count toward
    # payback (the de-degeneration, ledger L-10). Payback is N/A when never reached in-hold.
    cum, dpi, payback = 0.0, [], None
    for t in range(N):
        cum += sponsor_paid[t]
        dpi.append(r4(cum / sponsor_equity) if sponsor_equity > 0 else None)
        if payback is None and sponsor_equity > 0 and cum >= sponsor_equity:
            payback = t + 1
    out["exit"] = {"exit_ebitda_basis_value": r2(exit_ebitda), "exit_ev": r2(exit_ev),
                   "debt_payoff_at_par_plus_pik": r2(payoff), "cash_at_exit": r2(cash),
                   "exit_fees": r2(exit_fees), "monitoring_termination": 0.0,
                   "unamortized_fees_written_off": r2(sum(oid_rem.values()) + sum(fee_rem.values())),
                   "exit_equity_pre_mip_total": r2(exit_eq), "mip_payout": r2(mip_payout),
                   "sponsor_share": r2(sponsor_share), "rollover_share": 0.0}
    out["returns"] = {
        # §1: the mid-year option is a display alternative on the SPONSOR-SIDE streams only;
        # the unlevered stream always uses period-end times.
        "sponsor_net": stream(sponsor_cfs, sponsor_equity, mid_year=True),
        "pre_promote": stream(prepromote_cfs, sponsor_equity, mid_year=True),
        "unlevered": stream(unlev_cfs, ev + txn),
        "dpi": dpi,
        "payback_year": payback,
    }
    out["distributions"] = {
        "requested": [r2(d) for d in dist_request],
        "paid": [r2(p) for p in paid_by_year],
        "sponsor_share_paid": [r2(p) for p in sponsor_paid],
        "cumulative_paid": r2(cum_dist),
        "trap_level": (rp_trap["level"] if rp_trap else None),
        "blocked_years": [i + 1 for i in range(N) if out["waterfall"][i]["distribution_blocked"]],
    }
    return out

def stream(cfs, invested, mid_year=False):
    inflows = sum(c for c in cfs if c > 0)
    r = irr(cfs)
    d = {"cashflows": [r2(c) for c in cfs], "irr": (r6(r) if r is not None else None),
         "moic": r4(inflows / invested) if invested > 0 else None}
    if mid_year:
        # §1 display option, recorded alongside (never instead of) the period-end IRR.
        m = irr(cfs, mid_year_times(len(cfs)))
        d["irr_mid_year"] = r6(m) if m is not None else None
    return d

def bs_row(cash, nwc, ppe, dfc, gw, debt, eq):
    assets = cash + nwc + ppe + dfc + gw
    return {"cash": r2(cash), "operating_nwc": r2(nwc), "ppe": r2(ppe),
            "deferred_financing_costs": r2(dfc), "goodwill": r2(gw), "total_assets": r2(assets),
            "debt_at_par": r2(debt), "equity": r2(eq), "check": r2(assets - debt - eq)}

def r2(x): return round(x + 0.0, 2)
def r4(x): return round(x + 0.0, 4)
def r6(x): return round(x + 0.0, 6)

# ── golden inputs — EXACTLY SPEC §17 ─────────────────────────────────────────
def T(name, typ, x, pricing, amort, mat, prio=1, oid=0.0, participates=True, cash_coupon=None, pik=None):
    d = {"name": name, "type": typ, "size_x_ebitda": x, "amort_pct_of_face": amort,
         "maturity_years": mat, "sweep_priority": prio, "sweep_participates": participates, "oid_pct": oid}
    if typ == "pik_note":
        d["cash_coupon"], d["pik_coupon"] = cash_coupon, pik
    else:
        d["pricing"] = pricing
    return d

def REV(name, x, spread, fee, mat):
    return {"name": name, "type": "revolver", "size_x_ebitda": x,
            "pricing": {"kind": "floating", "base_rate": 0.036, "spread": spread, "floor": 0.0},
            "commitment_fee": fee, "maturity_years": mat, "drawn_at_close": 0.0}

def flo(spread, floor=0.0): return {"kind": "floating", "base_rate": 0.036, "spread": spread, "floor": floor}

BASE_TAX = lambda **kw: {"rate": 0.25, "interest_deductible": True,
                         "s163j": {"applies": True, "ati_basis": "ebitda", "ati_pct": 0.30},
                         "nol": {"acquired_opening": 0.0, "acquired_usable": False,
                                 "arose_pre_2018": False, "s382_annual_limit": None},
                         "minimum_rate": 0.0, **kw}

GOLDENS = {
 "G1": {"facts": {"fy_revenue": 100.0, "fy_ebitda": 25.0, "fy_ebitda_margin": 0.25, "net_ppe": 20.0},
        "assumptions": {"hold_years": 5, "entry": {"entry_multiple": 8.0, "basis": "fy"},
          "exit": {"multiple": 8.0, "basis": "fy", "fees_pct": 0.015},
          "tranches": [], "min_cash": 5.0, "sweep": {"base_pct": 0.0},
          "operations": {"growth": [0.0]*5, "target_margin": 0.25, "margin_path": "linear",
                         "da_pct_revenue": 0.03, "maint_capex_pct_revenue": 0.03,
                         "growth_capex": [0.0]*5, "nwc": {"method": "pct", "pct_revenue": 0.10}},
          "tax": BASE_TAX(), "fees": {"transaction_pct_of_ev": 0.02, "financing_pct_of_commitments": 0.015, "monitoring": None},
          "rollover_equity": 0.0, "mip": None}},
 "G2": {"facts": {"fy_revenue": 500.0, "fy_ebitda": 110.0, "fy_ebitda_margin": 0.22, "net_ppe": 100.0},
        "assumptions": {"hold_years": 5, "entry": {"entry_multiple": 9.0, "basis": "fy"},
          "exit": {"multiple": 9.0, "basis": "fy", "fees_pct": 0.015},
          "tranches": [T("TLB", "senior", 4.0, flo(0.0375), 0.01, 7), REV("Revolver", 0.5, 0.035, 0.005, 5)],
          "min_cash": 10.0, "sweep": {"base_pct": 0.75},
          "operations": {"growth": [0.06, 0.05, 0.04, 0.04, 0.03], "target_margin": 0.22, "margin_path": "linear",
                         "da_pct_revenue": 0.035, "maint_capex_pct_revenue": 0.03,
                         "growth_capex": [0.0]*5, "nwc": {"method": "pct", "pct_revenue": 0.08}},
          "tax": BASE_TAX(), "fees": {"transaction_pct_of_ev": 0.02, "financing_pct_of_commitments": 0.015, "monitoring": None},
          "rollover_equity": 0.0, "mip": None}},
 "G3": {"facts": {"fy_revenue": 300.0, "fy_ebitda": 90.0, "fy_ebitda_margin": 0.30, "net_ppe": 70.0},
        "assumptions": {"hold_years": 5, "entry": {"entry_multiple": 8.5, "basis": "fy"},
          "exit": {"multiple": 8.5, "basis": "fy", "fees_pct": 0.015},
          "tranches": [T("Senior", "senior", 3.0, flo(0.045, 0.0075), 0.05, 7),
                       T("PIK Note", "pik_note", 1.5, None, 0.0, 8, prio=2, oid=0.02,
                         participates=False, cash_coupon=0.0, pik=0.12)],
          "min_cash": 8.0, "sweep": {"base_pct": 0.50},
          "operations": {"growth": [0.05, 0.04, 0.04, 0.03, 0.03], "target_margin": 0.30, "margin_path": "linear",
                         "da_pct_revenue": 0.04, "maint_capex_pct_revenue": 0.035,
                         "growth_capex": [0.0]*5, "nwc": {"method": "days", "dso": 45, "dio": 30, "dpo": 40}},
          "tax": BASE_TAX(), "fees": {"transaction_pct_of_ev": 0.02, "financing_pct_of_commitments": 0.015, "monitoring": None},
          "rollover_equity": 0.0, "mip": {"pool_pct": 0.15, "hurdle_moic": 1.5}}},
 "G4": {"facts": {"fy_revenue": 200.0, "fy_ebitda": 12.0, "fy_ebitda_margin": 0.06, "net_ppe": 60.0},
        "assumptions": {"hold_years": 5, "entry": {"entry_multiple": 7.0, "basis": "fy"},
          "exit": {"multiple": 7.0, "basis": "fy", "fees_pct": 0.015},
          "tranches": [T("Unitranche", "unitranche", 3.5, flo(0.05, 0.0075), 0.01, 7, oid=0.025)],
          "min_cash": 3.0, "sweep": {"base_pct": 0.50},
          "operations": {"growth": [0.02, 0.03, 0.04, 0.05, 0.05], "target_margin": 0.16, "margin_path": "linear",
                         "da_pct_revenue": 0.07, "maint_capex_pct_revenue": 0.04,
                         "growth_capex": [0.0]*5, "nwc": {"method": "pct", "pct_revenue": 0.09}},
          "tax": {"rate": 0.25, "interest_deductible": True,
                  "s163j": {"applies": True, "ati_basis": "ebitda", "ati_pct": 0.30},
                  "nol": {"acquired_opening": 40.0, "acquired_usable": True,
                          "arose_pre_2018": False, "s382_annual_limit": 3.0},
                  "minimum_rate": 0.15},
          "fees": {"transaction_pct_of_ev": 0.02, "financing_pct_of_commitments": 0.015, "monitoring": None},
          "rollover_equity": 0.0, "mip": None}},
 "G5": {"facts": {"fy_revenue": 80.0, "fy_ebitda": 16.0, "fy_ebitda_margin": 0.20, "net_ppe": 15.0},
        "assumptions": {"hold_years": 5, "entry": {"entry_multiple": 7.0, "basis": "fy"},
          "exit": {"multiple": 7.0, "basis": "fy", "fees_pct": 0.015},
          "tranches": [T("Senior", "senior", 3.0, flo(0.0425), 0.10, 6), REV("Revolver", None, 0.04, 0.005, 5)],
          "min_cash": 4.0, "sweep": {"base_pct": 0.50},
          "operations": {"growth": [0.10, 0.08, 0.06, 0.05, 0.04], "target_margin": 0.20, "margin_path": "linear",
                         "da_pct_revenue": 0.04, "maint_capex_pct_revenue": 0.035,
                         "growth_capex": [6.0, 0.0, 0.0, 0.0, 0.0], "nwc": {"method": "pct", "pct_revenue": 0.12}},
          "tax": BASE_TAX(), "fees": {"transaction_pct_of_ev": 0.02, "financing_pct_of_commitments": 0.015, "monitoring": None},
          "rollover_equity": 0.0, "mip": None}},
}
# G5 revolver: commitment is an absolute 20.0 (§17), not x-EBITDA
GOLDENS["G5"]["assumptions"]["tranches"][1].pop("size_x_ebitda")
GOLDENS["G5"]["assumptions"]["tranches"][1]["commitment_amount"] = 20.0

# G2-D committed scenario (§13/§17): field-level deltas; ENTRY FROZEN (same S&U/debt).
def g2_downside():
    import copy
    g = copy.deepcopy(GOLDENS["G2"])
    g["assumptions"]["operations"]["growth"] = [x - 0.02 for x in GOLDENS["G2"]["assumptions"]["operations"]["growth"]]
    g["assumptions"]["exit"]["multiple"] = 8.5
    return g

# G2-DIST / G3-DIST — the Phase G-1 distribution variants (§17 [v1.1.1]). Facts, entry
# structure, financing and operating case are IDENTICAL to the base golden; the ONLY added
# fields are `structure.distributions` and `covenants.rp_trap`, so every difference from the
# base is attributable to §3 step 7 / §3.7 alone (entry-frozen assert below, same discipline
# as G2-D). Distributions are post-close, so entry cannot move.
def dist_variant(base, requests, trap):
    import copy
    g = copy.deepcopy(GOLDENS[base])
    g["assumptions"]["distributions"] = requests
    g["assumptions"]["rp_trap"] = trap
    return g

# G2-DIST-D — the §13 scenario × distributions golden [v1.1.1]. The SAME request schedule
# and the SAME trap level as G2-DIST (structure/policy fields are FROZEN across scenarios —
# a scenario may not re-write a distribution policy), with G2-D's operating deltas laid over
# the top. What varies is only whether the trap BINDS under the downside path — which is
# precisely what §13 says the credit dashboard exists to show.
G2_DIST_REQUESTS = [25.0, 25.0, 25.0, 10.0, 8.0]
G2_DIST_TRAP = {"metric": "net_leverage", "level": 2.75}

def g2_dist_downside():
    g = dist_variant("G2", G2_DIST_REQUESTS, G2_DIST_TRAP)
    g["assumptions"]["operations"]["growth"] = [x - 0.02 for x in GOLDENS["G2"]["assumptions"]["operations"]["growth"]]
    g["assumptions"]["exit"]["multiple"] = 8.5
    return g

def write_csv(path, res):
    rows = []
    N = len(res["operating"])
    def series(label, arr, key):
        rows.append([label] + [arr[i][key] for i in range(len(arr))])
    rows.append(["line"] + [f"Y{i+1}" for i in range(N)])
    for k in ["revenue", "ebitda_adj", "da", "ebit", "maint_capex", "growth_capex", "delta_nwc", "fcf_pre_debt"]:
        series(k, res["operating"], k)
    for k in ["ati", "capped_interest_pool", "uncapped_deductions", "deductible_capped_interest",
              "s163j_carryforward_end", "taxable_before_nol", "acquired_nol_used", "postclose_nol_used",
              "nol_banked", "cash_tax"]:
        series("tax." + k, res["tax"], k)
    for tname, sched in res["tranches"].items():
        for k in ["beginning_balance", "cash_interest", "pik_accrual", "mandatory_amort", "sweep_repayment", "ending_balance"]:
            series(f"{tname}.{k}", sched, k)
    if res["revolver"] is not None:
        for k in ["beginning_drawn", "cash_interest", "commitment_fee", "repayment", "draw", "ending_drawn"]:
            series("revolver." + k, res["revolver"], k)
    for k in ["opening_cash", "sweep_pool", "sweep_applied_total", "closing_cash"]:
        series("wf." + k, res["waterfall"], k)
    # §3 step 7 / §3.7 [v1.1.1] — appended at the tail so the pre-existing rows are untouched
    for k in ["distribution_requested", "rp_max", "distribution_paid", "distribution_blocked"]:
        series("wf." + k, res["waterfall"], k)
    rows.append(["returns.dpi"] + res["returns"]["dpi"])
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        for r in rows: w.writerow(r)


if __name__ == "__main__":
    outdir = sys.argv[1] if len(sys.argv) > 1 else "tests/goldens"
    results = {}
    for name, g in GOLDENS.items():
        results[name] = run(g)
    results["G2-D"] = run(g2_downside())
    results["G2-DIST"] = run(dist_variant("G2", G2_DIST_REQUESTS, G2_DIST_TRAP))
    results["G3-DIST"] = run(dist_variant("G3", [20.0, 15.0, 25.0, 22.0, 20.0], None))
    results["G2-DIST-D"] = run(g2_dist_downside())
    # §13 [v1.1.1]: the request schedule and the trap are structure/policy — FROZEN across
    # scenarios. Only whether the trap BINDS may differ.
    assert (results["G2-DIST-D"]["distributions"]["requested"]
            == results["G2-DIST"]["distributions"]["requested"]), "G2-DIST-D request schedule not frozen!"
    assert (results["G2-DIST-D"]["distributions"]["trap_level"]
            == results["G2-DIST"]["distributions"]["trap_level"]), "G2-DIST-D trap level not frozen!"
    # entry-frozen checks (§13 for the scenario; §3 step 7 is post-close so the DIST variants
    # cannot move entry either): S&U identical to the base golden.
    assert results["G2-D"]["sources_uses"] == results["G2"]["sources_uses"], "G2-D entry not frozen!"
    assert results["G2-DIST"]["sources_uses"] == results["G2"]["sources_uses"], "G2-DIST entry not frozen!"
    assert results["G3-DIST"]["sources_uses"] == results["G3"]["sources_uses"], "G3-DIST entry not frozen!"
    assert results["G2-DIST-D"]["sources_uses"] == results["G2"]["sources_uses"], "G2-DIST-D entry not frozen!"
    for name, res in results.items():
        d = os.path.join(outdir, name.replace("-", ""))
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "expected.json"), "w") as fh:
            json.dump(res, fh, indent=1, sort_keys=True)
            fh.write("\n")
        write_csv(os.path.join(d, "schedule.csv"), res)
    print("goldens written:", ", ".join(results.keys()))

