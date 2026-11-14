#!/usr/bin/env python3
"""
merger_calc.py: the merger goldens GM2 and GM3 (SPEC §29.10 to §29.21), derived SPEC-literally.

Written in Python from the SPEC text, importing nothing from the repo, so the committed
expected.json files are independent of the TypeScript engine. It reads the deal from
tests/goldens/<GM>/inputs.json (the same file the test feeds the engine) and writes
tests/goldens/<GM>/expected.json. Regenerating a golden is a reviewed change.

Usage: python3 -I scripts/goldens/merger_calc.py tests/goldens/GM2 tests/goldens/GM3
"""

import json, os, sys

LINES = ["revenue", "ebitda", "one_offs", "da", "ebit", "net_interest", "non_cash_interest", "pbt", "tax",
         "net_income", "nci", "net_income_group", "shares", "other_cash_items", "deferred_tax",
         "net_cash_before_wc", "delta_nwc", "acquisition", "capex", "fcf", "other_items", "dividends",
         "nci_dividends", "debt_flow", "equity_issuance", "cash_begin", "cash_change", "cash_end",
         "acquisition_debt", "bank_debt", "total_debt", "cash_in_net_debt", "net_debt"]


def row(revenue, ebitda, one_offs, da, net_interest, non_cash_interest, tax_rate, nci, shares, other_cash_items,
        deferred_tax, delta_nwc, acquisition, capex, other_items, dividends_of_nig, nci_dividends, debt_flow,
        equity_issuance, cash_begin, acquisition_debt, bank_debt, cash_counted=None):
    """§29.2 as amended by §29.10, line by line."""
    r = {}
    r["revenue"] = revenue
    r["ebitda"] = ebitda
    r["one_offs"] = one_offs
    r["da"] = da
    r["ebit"] = ebitda + one_offs + da
    r["net_interest"] = net_interest
    r["non_cash_interest"] = non_cash_interest
    r["pbt"] = r["ebit"] + net_interest
    r["tax"] = -r["pbt"] * tax_rate
    r["net_income"] = r["pbt"] + r["tax"]
    r["nci"] = nci
    r["net_income_group"] = r["net_income"] + nci
    r["shares"] = shares
    r["other_cash_items"] = other_cash_items
    r["deferred_tax"] = deferred_tax
    r["net_cash_before_wc"] = ebitda + one_offs + net_interest + non_cash_interest + other_cash_items + r["tax"] + deferred_tax
    r["delta_nwc"] = delta_nwc
    r["acquisition"] = acquisition
    r["capex"] = capex
    r["fcf"] = r["net_cash_before_wc"] + delta_nwc + acquisition + capex
    r["other_items"] = other_items
    r["dividends"] = dividends_of_nig(r["net_income_group"])
    r["nci_dividends"] = nci_dividends
    r["debt_flow"] = debt_flow
    r["equity_issuance"] = equity_issuance
    r["cash_begin"] = cash_begin
    r["cash_change"] = r["fcf"] + other_items + r["dividends"] + nci_dividends + debt_flow + equity_issuance
    r["cash_end"] = cash_begin + r["cash_change"]
    r["acquisition_debt"] = acquisition_debt
    r["bank_debt"] = bank_debt
    r["total_debt"] = acquisition_debt + bank_debt
    r["cash_in_net_debt"] = r["cash_end"] if cash_counted is None else cash_counted
    r["net_debt"] = r["total_debt"] - r["cash_in_net_debt"]
    return r


# ── §29.11 price and diluted shares ─────────────────────────────────────────
def diluted(t, P):
    if not t["securities"]:
        return t["shares"] + (t["reported_dilutive_increment"] or 0)
    d = t["shares"]
    for s in t["securities"]:
        if s["kind"] == "option":
            d += max(0.0, s["count"] * (1 - s["strike"] / P))
        elif s["kind"] == "rsu":
            d += s["count"]
        elif P > s["conversion_price"]:
            d += s["principal"] / s["conversion_price"]
    return d


def converted(t, P):
    return sum(s["principal"] for s in t["securities"] if s["kind"] == "convertible" and P > s["conversion_price"])


def price(F, A):
    t = F["target"]
    p = A["price"]
    if p["driver"] == "offer_per_share":
        P = p["offer_per_share"]
    elif p["driver"] == "premium":
        ref = t["share_price"] if p["premium_to"] == "current" else A["unaffected_price"]
        P = ref * (1 + p["premium"])
    else:
        raise SystemExit("goldens use the per-share drivers")
    dil = diluted(t, P)
    conv = converted(t, P)
    eqv = P * dil
    nd_used = t["net_debt"] - conv
    return P, dil, eqv, eqv + nd_used, nd_used, conv


# ── §29.12 sources and uses ─────────────────────────────────────────────────
def sources_uses(F, A):
    P, dil, eqv, ev, nd_used, conv = price(F, A)
    fees = A["fees"]
    adv = fees["advisory"]
    adv_fee = {"pct_equity_value": adv["value"] * eqv, "pct_enterprise_value": adv["value"] * ev, "amount": adv["value"]}[adv["basis"]]
    refin = nd_used if A["target_debt"] == "refinance_all" else 0.0
    S = A["consideration"]["pct_stock"] * eqv
    fu = A["funding"]
    tr = fu["tranches"]
    cash_used = fu["acquirer_cash_used"]
    if fu["plug"] == "equity":
        amounts = [x["amount"] for x in tr]
        ff = sum(x["fee_pct"] * a for x, a in zip(tr, amounts))
        # uses = eqv + refin + adv + ff + other + eq_pct·E ; sources = S + ΣD + E + cash
        E = (eqv + refin + adv_fee + ff + fees["other_one_off"] - S - sum(amounts) - cash_used) / (1 - fees["equity_issuance_pct"])
    else:
        E = fu["equity_raise"]
        k = [i for i, x in enumerate(tr) if x["amount"] is None][0]
        others = [x["amount"] if i != k else 0.0 for i, x in enumerate(tr)]
        ff_o = sum(x["fee_pct"] * a for x, a in zip(tr, others))
        Dk = (eqv + refin + adv_fee + ff_o + fees["other_one_off"] + fees["equity_issuance_pct"] * E - S - sum(others) - E - cash_used) / (1 - tr[k]["fee_pct"])
        amounts = others[:]
        amounts[k] = Dk
    ff = sum(x["fee_pct"] * a for x, a in zip(tr, amounts))
    ef = fees["equity_issuance_pct"] * E
    uses = eqv + refin + adv_fee + ff + ef + fees["other_one_off"]
    sources = S + sum(amounts) + E + cash_used
    new_sh = (S + E) / fu["issue_price"]
    acq_sh = F["acquirer"]["shares"]
    allsh = acq_sh + new_sh
    return dict(offer_per_share=P, diluted_target_shares=dil, equity_value=eqv, enterprise_value=ev, net_debt_used=nd_used,
                converted_principal=conv, refinanced_net_debt=refin, fees=adv_fee, financing_fees=ff, equity_issuance_fees=ef,
                other_one_off=fees["other_one_off"], total_uses=uses, stock_to_target=S, tranche_amounts=amounts,
                debt_issued=sum(amounts), equity_issued=S + E, equity_raised_for_cash=E, acquirer_cash_used=cash_used,
                total_sources=sources, new_shares=new_sh,
                exchange_ratio=A["consideration"]["pct_stock"] * P / fu["issue_price"],
                ownership=dict(acquirer=acq_sh / allsh, target_holders=S / fu["issue_price"] / allsh, placing=E / fu["issue_price"] / allsh),
                pct_stock=(S + E) / eqv, dilution=new_sh / acq_sh)


# ── §29.3 / §29.17 standalone ──────────────────────────────────────────────
def standalone(side, f, N, debt_free, count_shares, frac1, open1):
    y0 = side["year0"]
    out = []
    full_rev = y0["revenue"]
    for t in range(N + 1):
        s = frac1 if t == 1 else 1.0
        if t == 0:
            rev, ebitda, da, ni, nci = y0["revenue"], y0["ebitda"], y0["da"], y0["net_interest"], y0["nci"]
            oc, dnwc, capex, oi = y0["other_cash_items"], y0["delta_nwc"], y0["capex"], y0["other_items"]
            nci_div = y0["nci_dividends"]
            debt, prev_debt = y0["debt"], y0["debt"]
            divf = (lambda nig, d=y0["dividends"]: d)
            begin = 0.0 if debt_free else y0["opening_cash"]
        else:
            i = t - 1
            full_rev = full_rev * (1 + f["revenue_growth"][i])
            rev = s * full_rev
            ebitda = s * full_rev * f["ebitda_margin"][i]
            da = s * f["da"][i]
            ni = s * f["net_interest"][i]
            nci = s * f["nci"][i]
            oc = s * f["other_cash_items"][i]
            dnwc = s * f["delta_nwc"][i]
            capex = -s * f["capex_pct_revenue"][i] * full_rev
            oi = s * f["other_items"][i]
            nci_div = f["nci_payout"][i] * nci
            debt = f["debt"][i]
            prev_debt = y0["debt"] if t == 1 else f["debt"][i - 1]
            divf = (lambda nig, p=f["payout"][i]: -p * nig)
            begin = open1 if (t == 1 and open1 is not None) else out[-1]["cash_end"]
        if debt_free:
            ni, debt, prev_debt = 0.0, 0.0, 0.0
        out.append(row(rev, ebitda, 0.0, da, ni, 0.0, f["tax_rate"], nci, side["shares"] if count_shares else 0.0, oc, 0.0,
                       dnwc, 0.0, capex, oi, divf, nci_div, 0.0 if t == 0 else debt - prev_debt, 0.0, begin, 0.0, debt))
    return out


# ── §29.14 purchase accounting ─────────────────────────────────────────────
def ppa_calc(F, A, D):
    p = A["ppa"]
    N = A["horizon_years"]
    f = A["timing"]["fraction_of_year_1"]
    rate = A["adjustments_tax_rate"]
    tb = F["target"]["balance"]
    stock = p["structure"] == "stock_purchase"
    W = p["ppe_writeup"]
    I = sum(x["amount"] for x in p["intangibles"])
    V = p["debt_fair_value_adjustment"]
    gw_off = tb["goodwill"] if p["writeoff_existing_goodwill"] else 0.0
    new_dtl = rate * (W + I - V) if stock else 0.0
    removed = 0.0 if stock else tb["deferred_tax_liability"]
    ania = tb["equity_parent"] - gw_off + W + I - V - new_dtl + removed
    gw = D["equity_value"] - ania
    indef = sum(x["amount"] for x in p["intangibles"] if x["life_years"] is None)
    tax_base = 0.0 if stock else max(0.0, gw) + indef

    def sl(amount, life, s, done):
        return max(0.0, min(amount / life * s, amount - done))

    cum = dict(w=0.0, v=0.0, tax=0.0, i=[0.0] * len(p["intangibles"]))
    sched = []
    for t in range(N + 1):
        s = f if t == 1 else 1.0
        view = t == 0
        dep = sl(W, p["ppe_life_years"], s, 0.0 if view else cum["w"])
        ams = [0.0 if x["life_years"] is None else sl(x["amount"], x["life_years"], s, 0.0 if view else cum["i"][k]) for k, x in enumerate(p["intangibles"])]
        am = sum(ams)
        fv = sl(V, p["debt_fv_years"], s, 0.0 if view else cum["v"]) if V > 0 else 0.0
        tx = sl(tax_base, p["tax_goodwill_life_years"], s, 0.0 if view else cum["tax"]) if tax_base > 0 else 0.0
        if not view:
            cum["w"] += dep; cum["v"] += fv; cum["tax"] += tx
            for k in range(len(ams)):
                cum["i"][k] += ams[k]
        sched.append(dict(writeup_depreciation=dep, intangible_amortisation=am, fv_amortisation=fv, tax_amortisation=tx,
                          deferred_tax=(-rate * (dep + am - fv)) if stock else rate * tx))

    def side_bs(side):
        b = side["balance"]
        return dict(cash=b["cash"], nwc=b["nwc"], fixed_assets=b["fixed_assets"], acquired_intangibles=0.0, goodwill=b["goodwill"],
                    deferred_financing_fees=0.0, other_net_assets=b["other_net_assets"], debt=side["year0"]["debt"], debt_fair_value=0.0,
                    deferred_tax_liability=b["deferred_tax_liability"], equity_parent=b["equity_parent"], nci_equity=b["nci_equity"])

    refi = A["target_debt"] == "refinance_all"
    adv = A["fees"]["advisory"]
    recv = D["fees"] * rate if (adv["treatment"] == "expensed" and adv["tax_deductible"]) else 0.0
    tdebt = F["target"]["year0"]["debt"]
    adj = dict(
        cash=-D["acquirer_cash_used"] - (tb["cash"] if refi else 0.0),
        nwc=0.0, fixed_assets=W, acquired_intangibles=I, goodwill=gw - gw_off,
        deferred_financing_fees=D["financing_fees"],
        other_net_assets=(D["net_debt_used"] - tdebt + tb["cash"] if refi else 0.0) + recv,
        debt=D["debt_issued"] - (tdebt if refi else 0.0), debt_fair_value=V,
        deferred_tax_liability=new_dtl - removed,
        equity_parent=-tb["equity_parent"] + D["stock_to_target"] + D["equity_raised_for_cash"] - D["equity_issuance_fees"] - D["fees"] + recv - D["other_one_off"],
        nci_equity=0.0)
    a, b = side_bs(F["acquirer"]), side_bs(F["target"])
    opening = {k: a[k] + b[k] + adj[k] for k in a}
    return dict(goodwill=gw, adjusted_net_assets=ania, new_dtl=new_dtl, schedule=sched, opening=opening, adjustments=adj, receivable=recv)


ASSETS = ["cash", "nwc", "fixed_assets", "acquired_intangibles", "goodwill", "deferred_financing_fees", "other_net_assets"]
CLAIMS = ["debt", "debt_fair_value", "deferred_tax_liability", "equity_parent", "nci_equity"]


# ── §29.13 / §29.15 the impact block, year by year, with the sweep ─────────
def impact(F, A, D, acq, tgt, ppa):
    N = A["horizon_years"]
    f = A["timing"]["fraction_of_year_1"]
    syn = A["synergies"]
    tr = A["funding"]["tranches"]
    amts = D["tranche_amounts"]
    recv = ppa["receivable"] if ppa else 0.0
    fee_tot = [x["fee_pct"] * a for x, a in zip(tr, amts)]
    fee_left = fee_tot[:]
    out, debt_hist, fee_am_hist = [], [], []
    ends = amts[:]
    for t in range(N + 1):
        s = f if t == 1 else 1.0
        begin_cash = 0.0 if t == 0 else (-D["acquirer_cash_used"] if (t == 1 and not A["year0_cash_carried"]) else out[-1]["cash_end"])
        if t == 0:
            begins = amts[:]
            sched = [0.0] * len(tr)
            interest = [x["rate"] * a for x, a in zip(tr, amts)]
            fam = [min(fee_tot[i], fee_tot[i] / tr[i]["fee_years"]) for i in range(len(tr))]
        else:
            begins = amts[:] if t == 1 else ends[:]
            sched = [min(tr[i]["repayment"][t - 1], begins[i]) for i in range(len(tr))]
            interest = [tr[i]["rate"] * begins[i] * s for i in range(len(tr))]
            fam = [fee_left[i] if begins[i] <= 1e-9 else min(fee_left[i], fee_tot[i] / tr[i]["fee_years"] * s) for i in range(len(tr))]
        sc = ppa["schedule"][t] if ppa else None
        fv = sc["fv_amortisation"] if sc else 0.0
        rev = syn["revenue"]["run_rate"] * syn["revenue"]["phasing"][t] * s if syn["revenue"] else 0.0
        ebitda = syn["run_rate"] * syn["phasing"][t] * s + (rev * syn["revenue"]["flow_through_margin"] if syn["revenue"] else 0.0) \
            + (syn["dis_synergies"][t] * s if syn["dis_synergies"] else 0.0)
        one = syn["cost_to_achieve"][t - 1] if (t >= 1 and syn["cost_to_achieve"]) else 0.0
        new_sh = D["new_shares"] * (f if t == 1 else 1.0)

        def build(sweeps):
            ends_ = [begins[i] - sched[i] - sweeps[i] for i in range(len(tr))]
            divf = (lambda nig: 0.0) if t == 0 else (lambda nig: -A["combined_dividends"]["ratio"][t - 1] * (tgt[t]["net_income_group"] + nig) - tgt[t]["dividends"])
            r = row(rev, ebitda, one,
                    -(sc["writeup_depreciation"] + sc["intangible_amortisation"]) if sc else 0.0,
                    -sum(interest) - sum(fam) + fv + (A["interest_on_impact_cash"] or 0.0) * begin_cash,
                    sum(fam) - fv, A["adjustments_tax_rate"], 0.0, new_sh, 0.0,
                    sc["deferred_tax"] if sc else 0.0, 0.0, -D["total_uses"] if t == 0 else 0.0, 0.0,
                    recv if t == 1 else 0.0, divf, 0.0,
                    D["debt_issued"] if t == 0 else -(sum(sched) + sum(sweeps)),
                    D["equity_issued"] if t == 0 else 0.0, begin_cash, sum(ends_), 0.0,
                    cash_counted=None)
            if t == 0 and not A["year0_cash_carried"]:
                r["cash_in_net_debt"] = 0.0
                r["net_debt"] = r["total_debt"]
            return r, ends_

        sweeps = [0.0] * len(tr)
        r, e = build(sweeps)
        if t >= 1 and A["sweep"]:
            X = acq[t]["cash_change"] + tgt[t]["cash_change"] + r["cash_change"]
            cb = acq[t]["cash_begin"] + tgt[t]["cash_begin"] + begin_cash
            amount = min(A["sweep"]["pct"] * max(0.0, X), max(0.0, cb + X - A["sweep"]["min_cash"]))
            left = amount
            for i in range(len(tr)):
                if tr[i]["sweep"] and left > 0:
                    take = min(left, begins[i] - sched[i])
                    sweeps[i] = take
                    left -= take
            if amount > 0:
                r, e = build(sweeps)
        out.append(r)
        debt_hist.append([dict(begin=begins[i], scheduled=sched[i], sweep=sweeps[i], end=e[i], interest=interest[i], fee_amortisation=fam[i]) for i in range(len(tr))])
        fee_am_hist.append(sum(fam))
        if t >= 1:
            for i in range(len(tr)):
                fee_left[i] -= fam[i]
            ends = e
    return out, debt_hist, fee_am_hist


def ratios(rows, per_share):
    def q(a, b):
        return None if abs(b) < 1e-12 else a / b
    res = []
    for t, r in enumerate(rows):
        res.append(dict(growth=None if t == 0 or abs(rows[t - 1]["revenue"]) < 1e-12 else r["revenue"] / rows[t - 1]["revenue"] - 1,
                        margin=q(r["ebitda"], r["revenue"]), nd_ebitda=q(r["net_debt"], r["ebitda"]),
                        eps=q(r["net_income_group"], r["shares"]) if per_share else None,
                        dps=q(-r["dividends"], r["shares"]) if per_share else None))
    return res


def run(F, A, frac_override=None):
    if frac_override is not None:
        A = json.loads(json.dumps(A))
        A["timing"]["fraction_of_year_1"] = frac_override
    N = A["horizon_years"]
    D = sources_uses(F, A)
    ppa = ppa_calc(F, A, D) if A["ppa"] else None
    refi = A["target_debt"] == "refinance_all"
    acq = standalone(F["acquirer"], A["standalone"]["acquirer"], N, False, True, 1.0, F["acquirer"]["balance"]["cash"] if ppa else None)
    tgt = standalone(F["target"], A["standalone"]["target"], N, refi, False, A["timing"]["fraction_of_year_1"],
                     (0.0 if refi else F["target"]["balance"]["cash"]) if ppa else None)
    imp, debt_hist, fee_am = impact(F, A, D, acq, tgt, ppa)
    sm = [{k: a[k] + b[k] for k in LINES} for a, b in zip(acq, tgt)]
    comb = [{k: a[k] + b[k] for k in LINES} for a, b in zip(sm, imp)]
    return D, ppa, acq, tgt, sm, imp, comb, debt_hist, fee_am


def golden(folder):
    inp = json.load(open(os.path.join(folder, "inputs.json")))
    F, A = inp["facts"], inp["assumptions"]
    N = A["horizon_years"]
    rate = A["adjustments_tax_rate"]
    D, ppa, acq, tgt, sm, imp, comb, debt_hist, fee_am = run(F, A)
    blocks = dict(acquirer=acq, target=tgt, sum=sm, impact=imp, combined=comb)
    rq = {b: ratios(rows, b in ("acquirer", "combined")) for b, rows in blocks.items()}

    # §29.14 forecast balance sheet
    bs = [ppa["opening"]] if ppa else None
    if ppa:
        for t in range(1, N + 1):
            p, c, sc = bs[-1], comb[t], ppa["schedule"][t]
            bs.append(dict(cash=p["cash"] + c["cash_change"], nwc=p["nwc"] - c["delta_nwc"],
                           fixed_assets=p["fixed_assets"] - c["capex"] + c["da"] + sc["intangible_amortisation"],
                           acquired_intangibles=p["acquired_intangibles"] - sc["intangible_amortisation"], goodwill=p["goodwill"],
                           deferred_financing_fees=p["deferred_financing_fees"] - fee_am[t],
                           other_net_assets=p["other_net_assets"] - c["other_cash_items"] - c["other_items"],
                           debt=p["debt"] + c["debt_flow"], debt_fair_value=p["debt_fair_value"] - sc["fv_amortisation"],
                           deferred_tax_liability=p["deferred_tax_liability"] + c["deferred_tax"],
                           equity_parent=p["equity_parent"] + c["net_income_group"] + c["dividends"] + c["equity_issuance"],
                           nci_equity=p["nci_equity"] - c["nci"] + c["nci_dividends"]))
        for b in bs:
            b["total_assets"] = sum(b[k] for k in ASSETS)
            b["total_liabilities_and_equity"] = sum(b[k] for k in CLAIMS)
            assert abs(b["total_assets"] - b["total_liabilities_and_equity"]) < 0.005, "balance sheet does not balance"

    # §29.18 EPS
    acq_eps = [x["eps"] for x in rq["acquirer"]]
    comb_eps = [x["eps"] for x in rq["combined"]]
    accr = lambda e, t: None if (e is None or acq_eps[t] is None or acq_eps[t] <= 0) else e / acq_eps[t] - 1
    f = A["timing"]["fraction_of_year_1"]
    adj_eps, be, extra, be_pct = [], [], [], []
    for t in range(N + 1):
        c = comb[t]
        am = ppa["schedule"][t]["intangible_amortisation"] if ppa else 0.0
        adj_eps.append((c["net_income_group"] + (1 - rate) * (am - c["one_offs"])) / c["shares"])
        if acq_eps[t] is None or acq_eps[t] <= 0:
            be.append(None); extra.append(None); be_pct.append(None)
            continue
        gap = (acq_eps[t] * c["shares"] - c["net_income_group"]) / (1 - rate)
        cost_syn = A["synergies"]["run_rate"] * A["synergies"]["phasing"][t] * (f if t == 1 else 1.0)
        be.append(cost_syn + gap)
        extra.append(max(0.0, gap))
        costs = tgt[t]["revenue"] - tgt[t]["ebitda"]
        be_pct.append((cost_syn + gap) / costs)
    y1 = None
    if f < 1:
        _, _, _, _, _, _, comb_full, _, _ = run(F, A, 1.0)
        e = comb_full[1]["net_income_group"] / comb_full[1]["shares"]
        y1 = dict(combined=e, accretion=accr(e, 1))

    deal = {k: v for k, v in D.items() if k not in ("tranche_amounts", "ownership")}
    for k, v in D["ownership"].items():
        deal["ownership_" + k] = v
    for i, v in enumerate(D["tranche_amounts"]):
        deal["tranche_%d" % i] = v
    if ppa:
        deal["goodwill"] = ppa["goodwill"]
        deal["adjusted_net_assets"] = ppa["adjusted_net_assets"]
        deal["new_dtl"] = ppa["new_dtl"]

    out = dict(
        _provenance="Derived by scripts/goldens/merger_calc.py from the SPEC text (independent Python). SPEC §29.10 to §29.21. Signs as in a statement.",
        deal=deal,
        rows={k: {b: [r[k] for r in rows] for b, rows in blocks.items()} for k in LINES},
        ratios={k: {b: [x[k] for x in rq[b]] for b in blocks} for k in ["growth", "margin", "nd_ebitda", "eps", "dps"]},
        eps=dict(accretion=[accr(e, t) for t, e in enumerate(comb_eps)], combined_adjusted=adj_eps,
                 accretion_adjusted=[accr(e, t) for t, e in enumerate(adj_eps)], breakeven_synergies=be,
                 extra_synergies_needed=extra, breakeven_pct_target_costs=be_pct, year1_full_year=y1),
        ppa_schedule=ppa["schedule"] if ppa else None,
        balance_sheet=bs,
        tranches=[[debt_hist[t][i] for t in range(N + 1)] for i in range(len(A["funding"]["tranches"]))],
    )
    json.dump(out, open(os.path.join(folder, "expected.json"), "w"), indent=1)
    print(folder, "written; goodwill", round(ppa["goodwill"], 4) if ppa else None, "accretion", [None if x is None else round(x, 5) for x in out["eps"]["accretion"]])


if __name__ == "__main__":
    for folder in sys.argv[1:]:
        golden(folder)
