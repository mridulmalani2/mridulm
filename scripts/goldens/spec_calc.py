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
    # §18 refinancing events (list; null/[] ≡ feature OFF). Keyed by tranche_name; applied at
    # the START of year R as a RETIREMENT of the old tranche + ORIGINATION of a new one at the
    # SAME par (§18.2 par-for-par), plus a call premium. This is a FULL independent refi path
    # (rate switch, OID/fee schedule swap on base B, deferred write-off, step-2R cash cost) — it
    # reuses NONE of the engine's swap logic (sign-off round-2 residual 2).
    refis = a.get("refinancing") or []
    refi_by_year = {}
    for ev in refis:
        refi_by_year.setdefault(ev["year"], []).append(ev)
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
    pending_ret_ded = 0.0      # §18.5/§7: deferred refi write-off+premium deduction (into current year)
    paid_by_year = []         # §3 step 7: distributions actually paid (total equity)
    ufcf_stream = []          # unlevered (§9): interim UFCF inflows
    u_acq, u_post = (a["tax"]["nol"]["acquired_opening"] if acq_usable else 0.0), 0.0  # unlevered NOL state
    ebitda_adj_full = None    # full-precision exit-year EBITDA_adj (§15: no intermediate rounding)

    for t in range(N):
        exit_year = (t == N - 1)
        R = t + 1
        # ── §18 refinancing — applied at the START of year R, before interest accrues ──
        # Par-for-par retirement + origination: new face = old beginning balance B (§18.2).
        # The rate switch takes effect for the whole of year R (§18.3); the old unamortized
        # OID/DFC write off (book, year R) + the call premium defer their TAX deduction to
        # year R+1's uncapped pool (§18.5, EXPLICIT handling — the tranche does NOT retire, so
        # this never routes through the early-retirement balance-crossing detection).
        refi_cost_by_tr = {}      # per-tranche §18.4 cash cost (premium + new OID + new fees)
        refi_wo_by_tr = {}        # per-tranche old unamortized OID+DFC written off at the refi
        refi_book_charge = 0.0    # Σ (WO + call premium) — book loss on extinguishment (year R)
        refi_dfc_delta = 0.0      # Σ (new OID + new fees) − WO (BS deferred-cost adjustment)
        new_pending = 0.0         # this year's WO + premium — deducted NEXT year (§18.5)
        for refi in refi_by_year.get(R, []):
            name = refi["tranche_name"]
            tr = next(tt for tt in terms if tt["name"] == name)
            assert tr["type"] not in ("revolver", "pik_note"), "§18.2: cash-pay term tranches only"
            B = bal[name]                          # par-for-par: new face = old beginning balance
            WO = oid_rem[name] + fee_rem[name]     # §18.5 old unamortized OID + DFC
            premium = refi["call_premium_pct"] * B
            new_oid = refi["new_oid_pct"] * B
            new_fees = refi["new_financing_fee_pct"] * B      # §18.4 basis = new_fee_pct × B (NOT re-allocated)
            # reset the tranche to its new incarnation (pricing/maturity/amort/OID/fee schedules)
            tr["pricing"] = refi["new_pricing"]
            tr["maturity_years"] = refi["new_maturity_years"]
            tr["amort_pct_of_face"] = refi["new_amort_pct_of_face"]
            par[name] = B
            oid_by_t[name] = new_oid; oid_rem[name] = new_oid   # stop OLD OID schedule, start NEW
            fee_alloc[name] = new_fees; fee_rem[name] = new_fees
            refi_cost_by_tr[name] = premium + new_oid + new_fees
            refi_wo_by_tr[name] = WO
            refi_book_charge += WO + premium
            refi_dfc_delta += (new_oid + new_fees) - WO
            new_pending += WO + premium
        refi_cash_cost = sum(refi_cost_by_tr.values())
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
        uncapped = sum(fee_amort.values()) + commit_fee + exit_writeoff + pending_ret_ded
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
        c -= refi_cash_cost          # §18.4 step 2R — mandatory financing use, before amort/sweep
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
        # §18.6: capitalize new OID/fees and write off the old (refi_dfc_delta), then the normal roll
        dfc = dfc - sum(oid_amort.values()) - sum(fee_amort.values()) - exit_writeoff + refi_dfc_delta
        # §18.6: the refi book charge (old write-off + call premium) is a loss on extinguishment
        # in year R — expensed via NI so the equity leg = −(WO + premium); the new OID/fees are
        # capitalized (in DFC), NOT expensed.
        ni = ebit - (sum(cash_int.values()) + rev_int + sum(pik_acc.values()) + sum(oid_amort.values())
                     + sum(fee_amort.values()) + commit_fee + exit_writeoff + refi_book_charge) - tax
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
            nm = tr["name"]
            out["tranches"][nm].append({"beginning_balance": r2(bal[nm] - pik_acc[nm] + mand[nm] + sweep[nm]),
                                                "cash_interest": r2(cash_int[nm]),
                                                "pik_accrual": r2(pik_acc[nm]),
                                                "mandatory_amort": r2(mand[nm]),
                                                "sweep_repayment": r2(sweep[nm]),
                                                "ending_balance": r2(bal[nm]),
                                                # §16/§18 [v1.3.0] — emitted UNCONDITIONALLY (0/false when no refi)
                                                "refinanced": bool(nm in refi_cost_by_tr),
                                                "refinancing_cash_cost": r2(refi_cost_by_tr.get(nm, 0.0)),
                                                "unamortized_writeoff": r2(refi_wo_by_tr.get(nm, 0.0))})
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
        pending_ret_ded = new_pending   # §18.5: this year's refi write-off+premium deducts NEXT year

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
    # §19 [v1.4.0]: the overlay runs INSIDE run() on full-precision locals (v1.0.3 lesson)
    if golden.get("fund") is not None:
        out["fund"] = fund_overlay(golden["fund"], sponsor_equity, sponsor_paid, sponsor_share, None)

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

# G6-REFI — the Phase G-5 refinancing golden (§17/§18 [v1.3.0]). EVERY field IDENTICAL to G2
# plus a single §18 refinancing event on the TLB at year R = 3: −100bp reprice (spread 375→275),
# a 101 call premium (1.0%), a 6-year new maturity (absolute year 8 > hold 5), 0.5% new OID,
# 1.0% new financing fee, 1.0% new amort on the new face. Every difference from G2 is
# attributable to §18 alone (entry-frozen + unlevered-byte-identical asserts below), the same
# variant discipline the DIST goldens use. Years 1–2 are byte-identical to G2 (the refi is a
# year-3 event). The TLB carries OID = 0 at close, so the OLD-OID write-off/stop transition is
# golden-uncovered here — §18.11(vi) requires a directed engine fixture with old_OID > 0.
def g6_refi():
    import copy
    g = copy.deepcopy(GOLDENS["G2"])
    g["assumptions"]["refinancing"] = [{
        "tranche_name": "TLB", "year": 3,
        "new_pricing": {"kind": "floating", "base_rate": 0.036, "spread": 0.0275, "floor": 0.0},
        "call_premium_pct": 0.01, "new_maturity_years": 6,
        "new_oid_pct": 0.005, "new_financing_fee_pct": 0.01, "new_amort_pct_of_face": 0.01,
    }]
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
        for k in ["beginning_balance", "cash_interest", "pik_accrual", "mandatory_amort", "sweep_repayment", "ending_balance",
                  # §18 [v1.3.0] — appended at the tail of each tranche block so the pre-existing rows are untouched
                  "refinanced", "refinancing_cash_cost", "unamortized_writeoff"]:
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



# ── §19 fund/LP overlay (v1.4.0) — INDEPENDENT reference path ────────────────
def fund_overlay(fund, sponsor_equity, sponsor_paid, exit_sponsor_share, gp_income):
    """§19.3-19.5 on the run's FULL-PRECISION sponsor-side internals [v1.0.3 lesson:
    never seed from rounded display values]. Year-end order [r3/B8]: (1) ACCRUE pref on
    the pre-draw state; (2) DRAW fee_t; (3) APPLY the distribution. 'european': fee draws
    enter unreturned + the pref base; 'american': never (§19.4)."""
    N = len(sponsor_paid)
    se = sponsor_equity
    inflow = list(sponsor_paid)
    inflow[N - 1] += exit_sponsor_share
    basis = se if fund["fee_basis"] == "invested" else fund["committed_capital"]
    c, q = fund["carry_pct"], fund["catchup_pct"]
    contributions = [se] + [0.0] * N
    lp_dist, gp_carry, fees, dpi = [0.0] * N, [0.0] * N, [0.0] * N, [0.0] * N
    unreturned, pref = se, 0.0
    pref_paid = step3_paid = step4_lp = gp_cum = 0.0
    payback = None
    for t in range(1, N + 1):
        pref += fund["pref_rate"] * (unreturned + pref)              # (1) accrue, pre-draw
        offset = 0.0
        if gp_income is not None:
            offset = fund["fee_offset_pct"] * (gp_income["annual"][t - 1] + (gp_income["termination"] if t == N else 0.0))
        fee = max(0.0, fund["mgmt_fee_pct"] * basis - offset)        # (2) draw (floored)
        fees[t - 1] = fee
        contributions[t] = fee
        if fund["waterfall"] == "european":
            unreturned += fee                                        # fees in the base (european only)
        D = inflow[t - 1]                                            # (3) distribute
        pay = min(D, unreturned); unreturned -= pay; D -= pay; lp_dist[t - 1] += pay
        pay = min(D, pref); pref -= pay; D -= pay; lp_dist[t - 1] += pay; pref_paid += pay
        if D > 0 and q > 0:
            rhs = pref_paid + step3_paid + step4_lp
            x_needed = float("inf") if q - c <= 0 else max(0.0, (c * rhs - gp_cum) / (q - c))
            x = min(D, x_needed)
            gp_carry[t - 1] += q * x; gp_cum += q * x
            lp_dist[t - 1] += (1.0 - q) * x
            step3_paid += x; D -= x
        if D > 0:
            gp_carry[t - 1] += c * D; gp_cum += c * D
            lp_dist[t - 1] += (1.0 - c) * D; step4_lp += (1.0 - c) * D
            D = 0.0
        cum_d = sum(lp_dist[:t]); cum_c = sum(contributions[:t + 1])
        dpi[t - 1] = cum_d / cum_c if cum_c > 0 else 0.0
        if payback is None and t < N and cum_d >= cum_c - 1e-12:     # interim-only (L-10)
            payback = t
    paid_in = sum(contributions)
    # §19.6(a) conservation — EXACT on the full-precision internals
    assert abs(sum(lp_dist) + sum(gp_carry) - (sum(sponsor_paid) + exit_sponsor_share)) < 1e-9, "§19.6(a) violated in the reference!"
    flows = [-contributions[0]] + [lp_dist[t] - contributions[t + 1] for t in range(N)]
    return {
        "lp_contributions": [r6(x) for x in contributions],
        "lp_distributions": [r6(x) for x in lp_dist],
        "gp_carry": [r6(x) for x in gp_carry],
        "mgmt_fees_net": [r6(x) for x in fees],
        "paid_in_total": r6(paid_in),
        "committed_capital": r6(fund["committed_capital"] if fund["committed_capital"] is not None else paid_in),
        "fund_lp_net": {
            "irr": r6(irr(flows)) if irr(flows) is not None else None,
            "moic": r6(sum(lp_dist) / paid_in),
            "dpi": [r6(x) for x in dpi],
            "payback_year": payback,
        },
    }

G7_FUND = {"committed_capital": None, "mgmt_fee_pct": 0.02, "fee_basis": "invested",
           "carry_pct": 0.20, "pref_rate": 0.08, "catchup_pct": 1.0,
           "waterfall": "european", "fee_offset_pct": 1.0}

if __name__ == "__main__":
    outdir = sys.argv[1] if len(sys.argv) > 1 else "tests/goldens"
    results = {}
    for name, g in GOLDENS.items():
        results[name] = run(g)
    results["G2-D"] = run(g2_downside())
    results["G2-DIST"] = run(dist_variant("G2", G2_DIST_REQUESTS, G2_DIST_TRAP))
    results["G3-DIST"] = run(dist_variant("G3", [20.0, 15.0, 25.0, 22.0, 20.0], None))
    results["G2-DIST-D"] = run(g2_dist_downside())
    results["G6-REFI"] = run(g6_refi())
    # §19 [v1.4.0]: G7-FUND = G2-DIST + the fund-of-one overlay, computed INSIDE run() on
    # full-precision internals; every non-fund block is byte-identical to G2-DIST (asserted).
    g7g = dist_variant("G2", G2_DIST_REQUESTS, G2_DIST_TRAP)
    g7g["fund"] = G7_FUND
    results["G7-FUND"] = run(g7g)
    # §18 [v1.3.0]: the refi is post-close, so it cannot move entry (S&U byte-identical to G2);
    # §9 is capital-structure-blind, so the unlevered stream is byte-identical to G2 as well.
    assert results["G6-REFI"]["sources_uses"] == results["G2"]["sources_uses"], "G6-REFI entry not frozen!"
    assert results["G6-REFI"]["returns"]["unlevered"] == results["G2"]["returns"]["unlevered"], "G6-REFI unlevered not byte-identical to G2!"
    # §18.10: the refi is a year-3 event, so years 1–2 of every per-year block match G2 exactly.
    for blk in ("operating", "tax", "waterfall"):
        assert results["G6-REFI"][blk][:2] == results["G2"][blk][:2], f"G6-REFI {blk} Y1–2 not identical to G2!"
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
    # §19.6(c)/§19.7: the overlay is post-engine — every non-fund block byte-identical to G2-DIST.
    for k in results["G2-DIST"]:
        assert results["G7-FUND"][k] == results["G2-DIST"][k], f"G7-FUND {k} diverged from G2-DIST!"
    # (§19.6(a) conservation is asserted EXACTLY inside fund_overlay on full-precision
    # internals; comparing against the r2-rounded waterfall rows here would re-introduce
    # the v1.0.3 display-precision artifact.)
    for name, res in results.items():
        d = os.path.join(outdir, name.replace("-", ""))
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "expected.json"), "w") as fh:
            json.dump(res, fh, indent=1, sort_keys=True)
            fh.write("\n")
        write_csv(os.path.join(d, "schedule.csv"), res)
    print("goldens written:", ", ".join(results.keys()))

