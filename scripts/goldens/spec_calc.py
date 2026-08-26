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
[v1.7.0] Scope extended for Phase 5 / backlog #8 (§22): the sweet-equity strip (§22.2 loan
notes as EQUITY + the §22.5 marginal ordinary ratchet), the §22.4 marginal promote ratchet
(one tier ≡ §10 verbatim), the SINGULAR §22.6 warrant, and the §22.7 exit pipeline. Golden
scope only: no interim distributions under a strip or warrant (§22.13(vii) is a directed
engine fixture, not a golden).
[v1.8.0] Scope extended for Phase 6 / backlog #7 (§23): the SECONDARY selldown — one event at
the end of year t < N, valued at `event_multiple × EBITDA_adj[t]` less §11 net debt at t, with
the seller/buyer partition applied to every later sponsor-side flow (§23.5) and the §9 DPI /
payback headline on the REALIZED-PROCEEDS basis (owner question Q-A, resolved 2026-08-27 —
distributions AND selldown proceeds; the final exit is still excluded). Golden scope: no
rollover, no strip and no MIP under a selldown (§23.3 gates; §23.13 (iii)/(x) are directed
engine fixtures, not goldens).
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
    # §22 [v1.7.0] instruments (all null ≡ OFF ≡ v1 numbers — §14.23(f))
    sweet = a.get("sweet_equity")
    warr = a.get("warrant")
    if sweet:
        assert a.get("mip") is None, "§22.3(i): promote ∧ strip is rejected"
        assert a.get("rollover_equity", 0) == 0, "§22.3(ii): strip ∧ rollover is rejected"
        assert 0 < sweet["sponsor_ordinary_pct"] <= 1 and 0 <= sweet["management_ordinary_pct"] < 1
        assert sweet["loan_note_rate"] >= 0 and sweet["management_subscription"] >= 0
    if sweet or warr:
        assert not any(dist_request), "golden scope: no interim distributions under §22 (§22.13(vii) is engine-side)"
    mgmt_sub = sweet["management_subscription"] if sweet else 0.0
    sponsor_equity = uses - total_par - mgmt_sub  # §2 plug (rollover 0; §22.8: the management subscription is its OWN source line and the plug is the residual AFTER it)
    if sweet:
        assert sponsor_equity > 0, "§22.3(vi): a subscription leaving a non-positive plug is a Build rejection"

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
    equity_bs = sponsor_equity + mgmt_sub  # §22.8/§8: equity = sponsor + rollover(0) + subscription — the goodwill plug is genuinely unaffected
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
                            "sponsor_equity": r2(sponsor_equity),
                            "management_subscription": r2(mgmt_sub),  # §22.10: Class C, unconditional 0.0
                            "total_sources": r2(total_par + sponsor_equity + mgmt_sub)},
           "operating": [], "tax": [], "tranches": {t["name"]: [] for t in terms},
           "revolver": [] if rev_t else None, "waterfall": [], "balance_sheet": [], "credit": []}
    out["balance_sheet"].append(bs_row(cash, nwc0, ppe, dfc, goodwill, total_par + drawn, equity_bs))

    prev_nwc = nwc0
    pending_ret_ded = 0.0      # §18.5/§7: deferred refi write-off+premium deduction (into current year)
    paid_by_year = []         # §3 step 7: distributions actually paid (total equity)
    ufcf_stream = []          # unlevered (§9): interim UFCF inflows
    u_acq, u_post = (a["tax"]["nol"]["acquired_opening"] if acq_usable else 0.0), 0.0  # unlevered NOL state
    ebitda_adj_full = None    # full-precision exit-year EBITDA_adj (§15: no intermediate rounding)
    event_state = []          # §23.2 [v1.8.0]: per-year (EBITDA_adj[t], §11 net debt END of t)

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
                # §20 [v1.5.0]: the per-year WHOLE-coupon election — 'cash' pays
                # cash_coupon with NO accrual; 'pik' accrues pik_coupon with NO cash;
                # elections None ≡ the v1 FIXED both-legs note (§20.3). The loop is
                # 0-indexed, so elections[t] is year t+1's election.
                el = tr.get("elections")
                if el is not None:
                    if el[t] == "cash":
                        cash_int[tr["name"]] = b * tr["cash_coupon"]
                        pik_acc[tr["name"]] = 0.0
                    else:
                        cash_int[tr["name"]] = 0.0
                        pik_acc[tr["name"]] = b * tr["pik_coupon"]
                else:
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
        # §23.2 [v1.8.0]: the selldown's year-t measurement pair, taken at the END of t —
        # AFTER the year's step-7 distribution, because the sale settles after the year's
        # flows (§23.2's boundary, which is also what makes the year-t distribution the
        # SELLER's). `gross_debt_end` is already par+PIK outstanding PLUS the drawn
        # revolver — verbatim the debt definition §11 net leverage uses, which is what
        # §23.2 names. Full precision: no r2 anywhere on this pair (§15).
        event_state.append((ebitda_adj, gross_debt_end - closing_cash))

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

    # ── §23 [v1.8.0] the SECONDARY selldown — the event, then the partition ─────
    sd = golden.get("selldown")
    sell_year, sell_f, sell_proceeds = None, 0.0, 0.0
    implied_ev = implied_eq = None
    if sd is not None:
        # §23.3 input gates. In the reference these are ASSERTIONS: the golden may not
        # carry a rejected shape, and a silently-accepted one would make the fixture lie.
        assert a.get("rollover_equity", 0.0) == 0.0, "§23.3(i): selldown ∧ rollover REJECTED"
        assert sweet is None, "§23.3: selldown ∧ sweet_equity REJECTED"
        assert 0.0 < sd["fraction"] < 1.0, "§23.3: fraction ∈ (0,1), OPEN"
        assert 1 <= sd["year"] <= N - 1, "§23.3: year ∈ {1..N−1} (t = N collides with the §9 exit)"
        assert sd["event_multiple"] > 0.0, "§23.3: event_multiple > 0"
        sell_year, sell_f = sd["year"], sd["fraction"]
        ev_ebitda, ev_net_debt = event_state[sell_year - 1]
        # §23.2: the §9 valuation FORM evaluated at t — never an engine-invented mark.
        implied_ev = sd["event_multiple"] * ev_ebitda
        implied_eq = implied_ev - ev_net_debt          # SIGNED; may be ≤ 0 (§23.2)
        sell_proceeds = sell_f * implied_eq            # the sponsor's year-t inflow, SIGNED
    # §23.5 the seller/buyer partition, interim leg: flows STRICTLY AFTER the event year
    # scale by (1 − f). The year-t distribution is the SELLER's WHOLE share (§23.2's
    # boundary), so the comparison is `>`, not `>=` — the off-by-one that would move
    # `f × share` of period-t money is §23.13(iv)'s mutant.
    sponsor_paid = [p * sponsor_dist_share * ((1.0 - sell_f) if (t + 1) > (sell_year or N + 1) else 1.0)
                    for t, p in enumerate(paid_by_year)]
    # ── §22.2 loan notes (EQUITY) — the accretion walk; no year-0 accretion ──────
    # Golden scope runs no interim distributions under a strip, so redeemed[t] = 0 for
    # t < N and the walk lands on the §14.23(a) closed form LN[N] = LN[0] × (1+rate)^N.
    ln0 = (1.0 - sweet["sponsor_ordinary_pct"]) * sponsor_equity if sweet else 0.0
    ln_bal = ln0
    if sweet:
        for _t in range(N):
            ln_bal = ln_bal * (1.0 + sweet["loan_note_rate"]) - 0.0
    ln_n = ln_bal  # §22.2 measurement point: grown to exit, BEFORE the exit redemption

    # ── §22.7 the exit waterfall, ONE pipeline with null stages (E stays SIGNED) ─
    E = exit_eq
    ln_redeemed = min(ln_n, max(0.0, E))               # stage 1 (strip null ⇒ 0)
    pot = E - ln_redeemed                              # SIGNED residual
    mip_payout = 0.0
    if a.get("mip"):
        # §22.4 [v1.7.0]: the MARGINAL bracket walk on §10's base X = exit_eq + cum_dist
        # (the hurdle tests total value returned); ONE tier reproduces §10 verbatim
        # (s₀ × max(0, X − T₀) ≡ pool_pct × max(0, X − hurdle_val)). The promote is still
        # computed and paid AT EXIT ONLY, capped at the exit equity available.
        tiers22 = [(a["mip"]["hurdle_moic"], a["mip"]["pool_pct"])] + \
                  [(r["hurdle_moic"], r["share_pct"]) for r in (a["mip"].get("ratchet") or [])]
        _hs = [h for h, _ in tiers22]; _ss = [sp for _, sp in tiers22]
        assert _hs == sorted(_hs) and len(set(_hs)) == len(_hs), "§22.3(iii): hurdles strictly ascending"
        assert _ss == sorted(_ss) and all(sp < 1 for sp in _ss), "§22.3(iv): shares non-decreasing, every share < 1"
        assert all(h > 0 for h in _hs), "§22.3: hurdle_moic > 0"
        X = exit_eq + cum_dist
        thresholds = [h * sponsor_equity for h, _ in tiers22]
        promote_uncapped = 0.0
        for _j, (_h, _sp) in enumerate(tiers22):
            hi = thresholds[_j + 1] if _j + 1 < len(tiers22) else float("inf")
            promote_uncapped += _sp * max(0.0, min(X, hi) - thresholds[_j])
        mip_payout = min(promote_uncapped, max(0.0, exit_eq))
        pot -= mip_payout
    # stage 3 — §22.6 warrant: full dilution with the strike paid in; STRICT > at ATM;
    # a negative pot is never in the money (w(P₀+K) > K fails ⇒ no exercise).
    p0 = pot
    warrant_exercised, w_gross, w_net, w_strike = False, 0.0, 0.0, 0.0
    if warr:
        w, K = warr["pct_of_ordinary"], warr["strike_total"]
        assert 0 < w < 1 and K >= 0, "§22.3(v)"
        if w * (p0 + K) > K:
            warrant_exercised = True
            w_gross = w * (p0 + K)
            w_net = w_gross - K
            w_strike = K
            pot = (1.0 - w) * (p0 + K)
    # stage 4 — the ordinary split
    if sweet:
        # §22.5 bracket walk — the SINGLE authority for the strip arm at every sign of P
        s0 = sweet["management_ordinary_pct"]
        rat = sweet.get("ratchet") or []
        _hs = [r["hurdle_moic"] for r in rat]; _ss = [r["share_pct"] for r in rat]
        assert _hs == sorted(_hs) and len(set(_hs)) == len(_hs), "§22.3(iii)"
        assert _ss == sorted(_ss) and all(s0 <= sp < 1 for sp in _ss) and s0 < 1, "§22.3(iv)"
        assert all(h > 0 for h in _hs), "§22.3: hurdle_moic > 0"
        I = sponsor_equity
        V0 = ln_redeemed  # institutional value banked: interim shares (0 in golden scope) + the loan-note redemption
        P = pot
        if P <= 0:
            mgmt_share = 0.0
            inst_ord = P
            V_final = V0 + P
        else:
            V = V0; rem = P; M = 0.0; sshare = s0
            for r in rat:
                if not rem > 0:
                    break
                T = r["hurdle_moic"] * I
                if V < T:
                    need = (T - V) / (1.0 - sshare)
                    take = min(need, rem)
                    M += sshare * take; V += (1.0 - sshare) * take; rem -= take
                sshare = r["share_pct"]
            M += sshare * rem; V += (1.0 - sshare) * rem   # the top tier takes the remainder
            V_final = V
            mgmt_share = M
            inst_ord = P - M
        inst_moic = V_final / I                            # §14.23(d) definition
        tiers_reached = sum(1 for r in rat if inst_moic > r["hurdle_moic"])  # STRICT, on the ratio
        mgmt_eff_pct = (mgmt_share / P) if P > 0 else None # §14.23(e): NULL at P ≤ 0
        sponsor_share = inst_ord + ln_redeemed
    else:
        sponsor_share = pot   # §9 pari-passu on rollover 0: the sponsor takes the (signed) pot
        mgmt_share = 0.0
        inst_ord = pot        # warrant-only arm: institution_ordinary_share ≡ sponsor_share (§22.7)
        V_final = None; inst_moic = None; tiers_reached = 0; mgmt_eff_pct = None
    # §23.5 the partition's EXIT leg: the buyer takes f of the POST-§10 / POST-§22.6
    # sponsor split — i.e. of exactly the number the sponsor would otherwise have kept.
    # Taking it before the promote would hand the buyer a share of the MIP (§23.4).
    sell_buyer_share = sell_f * sponsor_share
    sponsor_share = sponsor_share - sell_buyer_share
    # §14.16 SIX-term mirror [v1.8.0 — §23.5], asserted on full-precision internals
    # (rollover 0 in scope; the sixth term is 0 whenever no selldown is configured, so
    # the five-term form is the degenerate case and every pre-v1.8.0 golden still closes).
    assert abs(sponsor_share + 0.0 + mip_payout + mgmt_share + w_net + sell_buyer_share - exit_eq) < 1e-9, \
        "§14.16 six-term mirror violated in the reference!"
    if sweet and (sponsor_share + sponsor_paid[-1] if sponsor_paid else sponsor_share) >= 0:
        # §14.23(d) mirror on its own domain (configured strip, positive plug, period-N flow ≥ 0)
        assert abs((ln_redeemed + inst_ord) - V_final) < 1e-9, "§14.23(d): V_final must equal the sponsor's realized value!"

    # §9 [v1.1.0] membership: interim distributions are IN the sponsor stream (sponsor share)
    # and IN the pre-promote stream (total), EXCLUDED from the unlevered stream (an
    # equity/financing flow — the unlevered stream is capital-structure-blind). §14.16: the
    # year-N distribution and the exit settle in the SAME period-N flow.
    sponsor_cfs = [-sponsor_equity] + sponsor_paid[:-1] + [sponsor_share + sponsor_paid[-1]]
    if sd is not None:
        # §9 membership [v1.8.0]: the proceeds are IN sponsor_net at year t and MERGE with
        # the seller's year-t distribution share into ONE period-t flow (one flow per
        # period — the §14.16 year-N precedent applied at an interim year). Index `sell_year`
        # is the year-t slot because cfs[0] is t=0 (§23.3 pins year ≤ N−1, so this never
        # lands on the exit slot).
        sponsor_cfs[sell_year] += sell_proceeds
        # NOT added to pre_promote: the buyer's exit share already settles INSIDE
        # exit_equity_pre_mip_total, which is that stream's exit inflow, so adding the
        # proceeds at t would count the sold slice twice (§9's netted-inside sense).
        # NOT added to unlevered: an equity/financing flow — capital-structure-blind.
    # §9 [v1.7.0]: pre_promote — the TOTAL pre-incentive equity stream — takes the
    # management subscription into its t=0 outflow (byte-identical when the strip is null).
    prepromote_cfs = [-(sponsor_equity + mgmt_sub)] + paid_by_year[:-1] + [exit_eq + paid_by_year[-1]]
    unlev_cfs = [-(ev + txn)] + ufcf_stream[:-1] + [ufcf_stream[-1] + exit_ev - exit_fees]

    # §9 DPI & payback — the REALIZED-PROCEEDS basis [v1.1.0 de-degenerated; v1.8.0 §23.6,
    # owner question Q-A resolved 2026-08-27]. The numerator is cash the sponsor has actually
    # received BEFORE the exit: §3-step-7 distributions PLUS §23 selldown proceeds. The FINAL
    # EXIT still never counts in either — that, and only that, is what L-10 de-degenerated
    # (a ratio that counts its own exit reports DPI ≡ MOIC and payback ≡ N for every deal).
    # An interim realization causes no such collapse, so it counts. Payback is N/A when the
    # check is never repaid inside the hold.
    cum, dpi, payback = 0.0, [], None
    for t in range(N):
        cum += sponsor_paid[t]
        if sd is not None and (t + 1) == sell_year:
            cum += sell_proceeds                       # SIGNED — see the monotonicity note
        dpi.append(r4(cum / sponsor_equity) if sponsor_equity > 0 else None)
        if payback is None and sponsor_equity > 0 and cum >= sponsor_equity:
            payback = t + 1
    # §14.18 [v1.8.0] monotonicity with its ONE bounded carve-out: `implied_event_equity` may
    # be ≤ 0 (§23.2), and a negative-proceeds sale genuinely LOWERS realized cash — so dpi[]
    # may fall at exactly `sell_year` and at NO other year. Asserted, not assumed: a floor on
    # the numerator would fabricate cash, and an unbounded carve-out would hide a real defect.
    for t in range(1, N):
        if dpi[t] is None or dpi[t - 1] is None:
            continue
        if dpi[t] < dpi[t - 1] - 1e-12:
            assert sd is not None and (t + 1) == sell_year and sell_proceeds < 0.0, \
                "§14.18/§14.24(h): dpi fell at year %d outside the selldown carve-out!" % (t + 1)
    out["exit"] = {"exit_ebitda_basis_value": r2(exit_ebitda), "exit_ev": r2(exit_ev),
                   "debt_payoff_at_par_plus_pik": r2(payoff), "cash_at_exit": r2(cash),
                   "exit_fees": r2(exit_fees), "monitoring_termination": 0.0,
                   "unamortized_fees_written_off": r2(sum(oid_rem.values()) + sum(fee_rem.values())),
                   "exit_equity_pre_mip_total": r2(exit_eq), "mip_payout": r2(mip_payout),
                   "sponsor_share": r2(sponsor_share), "rollover_share": 0.0,
                   # §22.10 [v1.7.0]: unconditional carriers, 0.0 when the instruments are off
                   "management_ordinary_share": r2(mgmt_share),
                   "warrant_payout_net": r2(w_net),
                   # §23.10 [v1.8.0]: the §14.16 mirror's SIXTH term, likewise unconditional
                   # (0.0 when no selldown is configured — the committed-zero-column precedent)
                   "selldown_buyer_share": r2(sell_buyer_share)}
    # §22.10 [v1.7.0]: equity_strip is emitted iff sweet_equity or warrant is configured
    # (null ⇔ both null — omitted from the fixture per the ModelOutput.fund precedent).
    if sweet or warr:
        out["equity_strip"] = {
            "loan_notes_subscribed": r2(ln0),
            "loan_notes_accrued_balance": r2(ln_n),   # grown to exit, BEFORE the exit redemption (§22.2)
            "loan_notes_redeemed": r2(ln_redeemed),   # the EXIT redemption alone (§22.2)
            "ordinary_pot_pre_warrant": r2(p0),
            "warrant_exercised": warrant_exercised,
            "warrant_strike_paid": r2(w_strike),
            "warrant_payout_gross": r2(w_gross),
            "warrant_payout_net": r2(w_net),
            "ordinary_pot": r2(pot),
            "management_ordinary_share": r2(mgmt_share),
            "institution_ordinary_share": r2(inst_ord),
            "ratchet_tiers_reached": tiers_reached,
            "management_effective_ordinary_pct": (r4(mgmt_eff_pct) if mgmt_eff_pct is not None else None),
            "institution_moic_at_ratchet": (r4(inst_moic) if inst_moic is not None else None),
        }
    # §23.10 [v1.8.0]: `selldown` is emitted iff the event is configured (null ⇔ input null —
    # OMITTED from the fixture, the ModelOutput.fund / equity_strip precedent verbatim).
    # NO cumulative-realized memo array: under §23.6's realized basis that series IS
    # dpi[] × sponsor_equity, and a derivable number may not become a second surface.
    if sd is not None:
        out["selldown"] = {"year": sell_year, "fraction": sell_f,
                           "implied_event_ev": r2(implied_ev),
                           "implied_event_equity": r2(implied_eq),
                           "selldown_proceeds": r2(sell_proceeds)}
        # §23.9(f)/§14.24(f): the reference emits no `coherence` block (§17 item (xi)), and
        # the WARN's condition is fully derivable from committed leaves — `selldown_proceeds`
        # vs `fraction × sources_uses.sponsor_equity` — so it is pinned in __main__ from the
        # fixture rather than added as a leaf ModelOutput does not have.
        # ── §14.9(b) [v1.8.0] the walk-down identity, INDEPENDENTLY re-derived here ──
        # The reference emits no `bridge` block (§17 item (x)), so this is an ASSERT rather
        # than a fixture leaf — and it is worth asserting precisely because residual (b)
        # cannot catch an error in this term (v1.1.2: residual (b) re-verifies only (a)).
        # With the company path byte-identical (§14.24(g)) the ENTIRE correction to the
        # sponsor's delta is `proceeds − buyer_share`, i.e. MINUS the buyer Δ and nothing
        # else. A second `+ proceeds` line would double-count by exactly the proceeds.
        sell_buyer_delta = sell_buyer_share - sell_proceeds
        # the no-event counterfactual delta, reconstructed from the partition itself:
        base_sponsor_share = sponsor_share + sell_buyer_share
        base_sponsor_dist = sum(p * sponsor_dist_share for p in paid_by_year)
        base_delta = base_sponsor_share + base_sponsor_dist - sponsor_equity
        this_delta = sponsor_share + sum(sponsor_paid) + sell_proceeds - sponsor_equity
        buyer_interim = base_sponsor_dist - sum(sponsor_paid)   # leaves via the paydown bar
        assert abs((base_delta - buyer_interim - sell_buyer_delta) - this_delta) < 1e-9, \
            "§14.9(b): the ONE-term selldown walk-down does not land on the sponsor delta!"
        assert abs((base_delta - buyer_interim + sell_proceeds - sell_buyer_delta) - this_delta) > 1e-9 \
               or abs(sell_proceeds) < 1e-9, \
            "§14.9(b): the TWO-TERM form must NOT also close — the mutant would be vacuous!"

    # §19 [v1.4.0]: the overlay runs INSIDE run() on full-precision locals (v1.0.3 lesson)
    if golden.get("fund") is not None:
        out["fund"] = fund_overlay(golden["fund"], sponsor_equity, sponsor_paid, sponsor_share, None)

    out["returns"] = {
        # §1: the mid-year option is a display alternative on the SPONSOR-SIDE streams only;
        # the unlevered stream always uses period-end times.
        "sponsor_net": stream(sponsor_cfs, sponsor_equity, mid_year=True),
        "pre_promote": stream(prepromote_cfs, sponsor_equity + mgmt_sub, mid_year=True),
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
def T(name, typ, x, pricing, amort, mat, prio=1, oid=0.0, participates=True, cash_coupon=None, pik=None, elections=None):
    d = {"name": name, "type": typ, "size_x_ebitda": x, "amort_pct_of_face": amort,
         "maturity_years": mat, "sweep_priority": prio, "sweep_participates": participates, "oid_pct": oid}
    if typ == "pik_note":
        d["cash_coupon"], d["pik_coupon"] = cash_coupon, pik
        d["elections"] = elections  # §20 [v1.5.0]; None ≡ the fixed both-legs note
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

# G8-PIKT — the §20 [v1.5.0] PIK-toggle golden (§20.9). Facts, entry structure, financing
# and operating case are IDENTICAL to G3; the ONLY changed fields are the note's two
# election rates (cash 9%, pik 12%) and the per-year elections [pik,pik,cash,cash,pik] —
# so every difference from G3 is attributable to §20 alone (entry-frozen + operating-frozen
# asserts below, the dist_variant discipline). Closed forms (§20.9): payoff 135 × 1.12³ =
# 189.665280; each 'cash' year pays 0.09 × 169.3440 = 15.240960.
def g8_pikt():
    import copy
    g = copy.deepcopy(GOLDENS["G3"])
    note = next(tr for tr in g["assumptions"]["tranches"] if tr["type"] == "pik_note")
    note["cash_coupon"], note["pik_coupon"] = 0.09, 0.12
    note["elections"] = ["pik", "pik", "cash", "cash", "pik"]
    return g

# §22.12 [v1.7.0]: G9-SWEET = G3's facts and structure with mip → null (FORCED by
# §22.3(i) — TWO deltas, named) and the strip + warrant added; G10-RATCHET = every field
# of G3 unchanged with mip gaining one ratchet tier. Entry S&U: G10 byte-identical to G3;
# G9 differs ONLY by the management_subscription source line and the plug it re-cuts.
def g9_sweet():
    import copy
    g = copy.deepcopy(GOLDENS["G3"])
    a = g["assumptions"]
    a["mip"] = None
    a["sweet_equity"] = {"sponsor_ordinary_pct": 0.10, "loan_note_rate": 0.08,
                         "management_subscription": 2.0, "management_ordinary_pct": 0.10,
                         "ratchet": [{"hurdle_moic": 1.5, "share_pct": 0.15},
                                     {"hurdle_moic": 2.0, "share_pct": 0.20}]}
    a["warrant"] = {"holder_label": "Mezzanine warrant", "pct_of_ordinary": 0.05,
                    "strike_total": 2.0}
    return g

# G11-SELL — the §23 [v1.8.0] partial-exit golden (§23.12). Host = G2-DIST, because it
# already carries the live distribution schedule, the RP trap and the v1.1.0 DPI machinery
# the selldown has to interact with. EXACTLY ONE field differs from G2-DIST — the event —
# so every difference is attributable to §23 alone (the dist_variant discipline).
def g11_sell():
    g = dist_variant("G2", G2_DIST_REQUESTS, G2_DIST_TRAP)
    g["selldown"] = {"year": 3, "fraction": 0.25, "event_multiple": 8.5}
    return g

def g10_ratchet():
    import copy
    g = copy.deepcopy(GOLDENS["G3"])
    g["assumptions"]["mip"] = {"pool_pct": 0.15, "hurdle_moic": 1.5,
                               "ratchet": [{"hurdle_moic": 1.75, "share_pct": 0.25}]}
    return g

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
    # §20 [v1.5.0]: G8-PIKT = G3 + the per-year election. Coupon mechanics are post-close,
    # so entry CANNOT move (S&U byte-identical to G3), and the operating build is
    # capital-structure-blind (byte-identical too) — every other difference is §20's alone.
    results["G8-PIKT"] = run(g8_pikt())
    # §22 [v1.7.0]: the two Phase-5 goldens (§22.12)
    # §23 [v1.8.0]: G11-SELL = G2-DIST + exactly one event (§23.12)
    results["G11-SELL"] = run(g11_sell())
    results["G9-SWEET"] = run(g9_sweet())
    results["G10-RATCHET"] = run(g10_ratchet())
    _g3, _g9, _g10 = results["G3"], results["G9-SWEET"], results["G10-RATCHET"]
    # a promote is post-close and cannot re-price entry (§13); the strip IS entry-side but
    # re-cuts the pot without changing its size, so E is byte-identical for both (§22.12)
    assert _g10["sources_uses"] == _g3["sources_uses"], "G10-RATCHET entry not frozen!"
    assert _g10["operating"] == _g3["operating"], "G10-RATCHET operating diverged from G3!"
    assert _g9["operating"] == _g3["operating"], "G9-SWEET operating diverged from G3!"
    assert _g9["exit"]["exit_equity_pre_mip_total"] == _g3["exit"]["exit_equity_pre_mip_total"], \
        "G9-SWEET exit_equity_pre_mip_total moved — the strip leaked into the operating/debt/§9 path!"
    assert _g10["exit"]["exit_equity_pre_mip_total"] == _g3["exit"]["exit_equity_pre_mip_total"], \
        "G10-RATCHET E moved!"
    assert _g9["equity_strip"]["ratchet_tiers_reached"] == 1, "§22.12: tier 1 crossed, tier 2 not"
    assert _g9["equity_strip"]["warrant_exercised"] is True, "§22.12: the warrant is in the money"
    assert abs(_g9["equity_strip"]["loan_notes_redeemed"] - _g9["equity_strip"]["loan_notes_accrued_balance"]) <= 0.005, \
        "§22.12: the loan notes redeem in full"
    assert _g10["exit"]["mip_payout"] > _g3["exit"]["mip_payout"], "§22.12: the two-tier promote must exceed G3's"
    assert "equity_strip" not in _g10, "§22.10: equity_strip omitted when both instruments are null"
    assert _g9["returns"]["sponsor_net"]["moic"] == _g9["equity_strip"]["institution_moic_at_ratchet"], \
        "§14.23(d): the ratchet's own test must agree with the headline MOIC (4dp fixture)!"
    # ── §23.12 [v1.8.0] G11-SELL's committed claims, checked at generation time ─────────
    _g11, _g2d = results["G11-SELL"], results["G2-DIST"]
    # §14.24(g) COMPANY INVARIANCE — the sale never transits the company, so every
    # company-side block is byte-identical to the host. This is the feature's structural
    # claim; if it fails, "secondary-only" is not true of the reference either.
    # NOTE `distributions` is deliberately NOT in this list: its `sponsor_share_paid` leaf is
    # a SPONSOR-side quantity and genuinely partitions (§23.5), which is asserted separately
    # below. Its company leaves — what was requested, what the company paid, the trap — must
    # not move, and that is the real content of the invariance claim for this block.
    for blk in ("sources_uses", "operating", "tax", "waterfall", "tranches",
                "balance_sheet", "credit", "revolver"):
        assert _g11.get(blk) == _g2d.get(blk), f"§14.24(g): G11-SELL {blk} diverged from G2-DIST!"
    # §9: the unlevered stream is capital-structure-blind and the event is an equity flow.
    assert _g11["returns"]["unlevered"] == _g2d["returns"]["unlevered"], \
        "§9: G11-SELL unlevered stream moved — the selldown leaked into the unlevered path!"
    # §23.2's event chain, re-derived from the HOST's own committed year-3 leaves rather
    # than from a copied digit. NOTE the fixture carries the FULL-PRECISION chain and the
    # §23.12 display seeds are 2dp-derived, so they differ in the cents (the v1.0.3 rule:
    # never re-read a display value as an input). These bounds are the 2dp reconstruction
    # error, and the exact digits are what the two blind adjudication passes sign.
    _sd = _g11["selldown"]
    _y3 = 2                                  # year 3 → 0-indexed
    _ev_seed = 8.5 * _g2d["operating"][_y3]["ebitda_adj"]
    _nd_seed = (_g2d["tranches"]["TLB"][_y3]["ending_balance"]
                - _g2d["waterfall"][_y3]["closing_cash"])          # no revolver drawn in y3
    assert abs(_sd["implied_event_ev"] - _ev_seed) < 0.05, \
        f"§23.2: implied_event_ev {_sd['implied_event_ev']} ≠ 8.5 × EBITDA_adj[3] ({_ev_seed})"
    assert abs(_sd["implied_event_equity"] - (_ev_seed - _nd_seed)) < 0.05, \
        f"§23.2: implied_event_equity {_sd['implied_event_equity']} ≠ EV − net debt ({_ev_seed - _nd_seed})"
    assert abs(_sd["selldown_proceeds"] - 0.25 * _sd["implied_event_equity"]) < 5e-3, \
        "§23.2: selldown_proceeds ≠ fraction × implied_event_equity"
    # §23.5 the partition: the buyer takes f of the post-promote sponsor split, the seller 1−f
    _E = _g2d["exit"]["sponsor_share"]
    assert abs(_g11["exit"]["sponsor_share"] - 0.75 * _E) < 5e-3, "§23.5: sponsor exit share ≠ (1−f) × the host's"
    assert abs(_g11["exit"]["selldown_buyer_share"] - 0.25 * _E) < 5e-3, "§23.5: buyer share ≠ f × the host's"
    # §14.16 six-term mirror on the COMMITTED (r2) leaves, not just the internals
    # (the identity is EXACT on the full-precision internals — asserted at 1e-9 inside run().
    #  Here the six claimant leaves and the total are each r2-rounded independently, so the
    #  admissible residual is 7 × half-a-cent = 0.035, NOT §15's single-flow ±$0.005m. Using
    #  the flow tolerance here would be a display-precision artifact, the v1.0.3 mistake.)
    _x = _g11["exit"]
    _mirror = (_x["sponsor_share"] + _x["rollover_share"] + _x["mip_payout"]
               + _x["management_ordinary_share"] + _x["warrant_payout_net"]
               + _x["selldown_buyer_share"] - _x["exit_equity_pre_mip_total"])
    assert abs(_mirror) <= 0.035, \
        f"§14.16: the six-term mirror does not close on G11-SELL's committed leaves (residual {_mirror})!"
    # The COMPANY leaves of `distributions` must not move — the company pays what it always
    # paid, and the trap binds where it always bound (§14.24(g) for this block).
    for _k in ("requested", "paid", "cumulative_paid", "trap_level", "blocked_years"):
        assert _g11["distributions"][_k] == _g2d["distributions"][_k], \
            f"§14.24(g): G11-SELL distributions.{_k} moved — the event touched the company!"
    # §23.2/§23.5 the boundary, on the SPONSOR-side leaf: years 1..t match the host EXACTLY
    # (the year-t distribution is the SELLER'S WHOLE share) and only years t+1.. scale by
    # (1−f). The `>=` off-by-one that would hand the buyer year 3 is §23.13(iv)'s mutant.
    _sp11, _sp2d = _g11["distributions"]["sponsor_share_paid"], _g2d["distributions"]["sponsor_share_paid"]
    assert _sp11[:3] == _sp2d[:3], "§23.2: the seller keeps the WHOLE year-t distribution"
    for _t in (3, 4):
        assert abs(_sp11[_t] - 0.75 * _sp2d[_t]) < 5e-3, f"§23.5: year {_t+1} sponsor share ≠ (1−f) × the host's"
    _c11, _c2d = _g11["returns"]["sponsor_net"]["cashflows"], _g2d["returns"]["sponsor_net"]["cashflows"]
    assert _c11[:3] == _c2d[:3], "§23.2: the pre-event sponsor flows (t=0..2) must be untouched"
    assert abs(_c11[3] - (_c2d[3] + _sd["selldown_proceeds"])) < 5e-3, \
        "§23.2/§9: year 3 must carry the SELLER's whole distribution PLUS the proceeds, in ONE flow"
    assert abs(_c11[4] - 0.75 * _c2d[4]) < 5e-3, "§23.5: year 4 must scale by (1−f)"
    # §23.6 the REALIZED basis (owner question Q-A) — the year-3 leaf is the discriminator a
    # distributions-only engine cannot pass. Asserted as a RATIO, never against a copied digit.
    # Rebuilt from G11-SELL's OWN committed sponsor-share leaves plus the proceeds — never
    # from a copied digit, so the assert re-derives the basis rather than restating it.
    _E0 = _g2d["sources_uses"]["sponsor_equity"]
    _cum = 0.0
    for _t in range(5):
        _cum += _sp11[_t] + (_sd["selldown_proceeds"] if _t + 1 == 3 else 0.0)
        assert abs(_g11["returns"]["dpi"][_t] - round(_cum / _E0, 4)) < 1e-4, \
            f"§23.6: dpi[{_t+1}] is not on the realized-proceeds basis!"
    # and the EXIT is still excluded from the numerator — the L-10 half that survives Q-A
    assert _cum < _g11["returns"]["sponsor_net"]["moic"] * _E0 - 5e-3, \
        "§9/§23.6: the final-exit flow leaked into the DPI numerator!"
    assert _g11["returns"]["dpi"][2] > 8 * _g2d["returns"]["dpi"][2], \
        "§23.12: the year-3 DPI leaf must be an ~8x discriminator of the Q-A basis"
    # §23.13(v)'s pin is a DIRECTED fixture, not this golden: 239.04 never reaches the 587.22
    # check, so payback stays null on BOTH bases here and the golden cannot discriminate it.
    assert _g11["returns"]["payback_year"] is None and _g2d["returns"]["payback_year"] is None, \
        "§23.12: payback must stay null on both — the reachability pin belongs to §23.13(v)"
    # §23.12's direction claims. IRR FALLS and MOIC falls: the sold slice's own implied return
    # is ABOVE the deal's, so releasing it two years early gives up return. "Earlier money
    # lifts IRR" holds only at or below the deal's own rate — this is the assert that says so.
    assert _g11["returns"]["sponsor_net"]["irr"] < _g2d["returns"]["sponsor_net"]["irr"], \
        "§23.12: sponsor IRR must FALL — an 8.5x event under a 9x exit is value-dilutive"
    assert _g11["returns"]["sponsor_net"]["moic"] < _g2d["returns"]["sponsor_net"]["moic"], \
        "§23.12: sponsor MOIC must FALL"
    # §23.12: NO below-cost WARN on this golden (the firing arm is §23.13(ix)'s directed pair).
    assert _sd["selldown_proceeds"] >= 0.25 * _E0 - 5e-3, \
        "§23.12: the golden must NOT trip selldown_below_cost"
    # §23.10: `selldown` is OMITTED wherever the event is null (the ModelOutput.fund precedent)
    assert "selldown" not in _g2d, "§23.10: selldown must be omitted when the event is null"

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
    assert results["G8-PIKT"]["sources_uses"] == results["G3"]["sources_uses"], "G8-PIKT entry not frozen!"
    assert results["G8-PIKT"]["operating"] == results["G3"]["operating"], "G8-PIKT operating diverged from G3!"
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

