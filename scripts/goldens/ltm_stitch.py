#!/usr/bin/env python3
"""
ltm_stitch.py — the G-2 quarter-stitched-LTM reference derivation (Phase G-2, Tier B).

A SPEC §1.1-literal implementation of the LTM sizing-basis stitch, in a DIFFERENT LANGUAGE from
the engine and with ZERO repo imports — the independent oracle the DERIVATION.md method requires.
Input: synthetic companyfacts-shaped fixtures (below), the exact shape lib/edgar/history.ts consumes
(CompanyFacts → concept → unit → [{start,end,val,filed,form}]). Output: tests/goldens/g2ltm/<case>/
expected.json, one per fixture; tests re-run this and fail on any drift (the goldens.test.ts gate).

The engine is NOT exercised here — G-2 is DATA-SIDE. This adjudicates the STITCH arithmetic and the
refusal decisions (F1 abutment, F3/M1 vintage, F4 single-basis pair, F5 component completeness,
F7 52/53-week, staleness badge), which is where the sign-off found every silent-wrong-number bug.

Values are in $m (the stitch is unit-agnostic; history.ts's ÷1e6 unit handling is tested separately).

  LTM(M) = FY(M) + YTD_current(M) − YTD_prior(M)          [§1.1 normative]
  EBITDA stitches PER COMPONENT: LTM EBITDA = LTM(OperInc) + LTM(D&A)   [§1.1]
"""
import json, os, sys
from datetime import date

# ── date helpers ──────────────────────────────────────────────────────────────
def d(s): y, m, dd = map(int, s.split("-")); return date(y, m, dd)
def span_days(a, b): return (d(b) - d(a)).days
def plus_1d(s): return (d(s) + (date(1, 1, 2) - date(1, 1, 1))).isoformat()
def age_months(as_of, import_date): return span_days(as_of, import_date) / 30.44

# ── §1.1 day-count windows (widened for 52/53-week + FYE changes) ─────────────
WINDOWS = [("full_year", 350, 380), ("9m", 250, 285), ("6m", 165, 200), ("quarter", 80, 100)]
def classify(start, end):
    if start is None: return None
    n = span_days(start, end)
    for role, lo, hi in WINDOWS:
        if lo <= n <= hi: return role
    return None  # a span in no window is a HOLE (honestly unused)

# ── §1.1 staleness badge (filing-overdue cadence) ─────────────────────────────
def badge(as_of, import_date):
    a = age_months(as_of, import_date)
    if a <= 4.5:  return "fresh"
    if a <= 14.5: return "aging"
    return "stale"

# ── history.ts rule 2 (restatement dedupe) — reproduced independently ──────────
def dedupe(facts):
    """Group a tag's facts by exact (start,end): latest `filed` wins; >1% note vs EARLIEST filed;
    vintage_count = how many filings reported this exact period (M1 vintage-PRESENCE input)."""
    groups = {}
    for f in facts:
        groups.setdefault((f.get("start"), f["end"]), []).append(f)
    out = {}
    for key, g in groups.items():
        g_sorted = sorted(g, key=lambda x: x.get("filed") or "")
        original, winner = g_sorted[0], g_sorted[-1]
        note = None
        if original["val"] != 0 and abs((winner["val"] - original["val"]) / original["val"]) > 0.01:
            note = f'restated: {original["val"]} (filed {original.get("filed")}) -> {winner["val"]} (filed {winner.get("filed")})'
        out[key] = {"start": key[0], "end": key[1], "val": winner["val"],
                    "filed": winner.get("filed"), "note": note, "vintage_count": len(g)}
    return out

def tag_points(facts, taxonomy, concept, unit="USD"):
    c = facts.get("facts", {}).get(taxonomy, {}).get(concept)
    if not c: return {}
    return dedupe(c.get("units", {}).get(unit, []))

# ── CANONICAL span selection (SHARED by revenue AND every EBITDA component) ────
# §1.1: the stitch anchors at ONE most-recent interim end `e`; revenue and EBITDA use the SAME
# three (start,end) KEYS, and EVERY component must resolve at all three — never per-metric spans
# (that would mix a Sep-2025 OI with a Sep-2024 D&A). Keys are metric-agnostic; each metric looks
# up its own value at the key.
def union(*maps):
    out = []
    for m in maps: out.extend(m.values())
    return out

def canonical_spans(rev_pts, oi_pts, da_pts):
    allp = union(rev_pts, oi_pts, da_pts)
    interims = [p for p in allp if classify(p["start"], p["end"]) in ("9m", "6m", "quarter")]
    fulls = [p for p in allp if classify(p["start"], p["end"]) == "full_year"]
    if not fulls: return ("no_fy", None)
    fy_p = max(fulls, key=lambda p: p["end"])
    if not interims: return ("fpi", {"fy": (fy_p["start"], fy_p["end"])})
    e = max(p["end"] for p in interims)
    cur_p = next(p for p in interims if p["end"] == e)
    role = classify(cur_p["start"], cur_p["end"])
    target = d(e).replace(year=d(e).year - 1)
    priors = [p for p in interims if classify(p["start"], p["end"]) == role and p["end"] != e]
    if not priors: return ("no_prior", {"fy": (fy_p["start"], fy_p["end"])})
    prior_p = min(priors, key=lambda p: abs((d(p["end"]) - target).days))
    return ("ok", {"fy": (fy_p["start"], fy_p["end"]), "cur": (cur_p["start"], cur_p["end"]),
                   "prior": (prior_p["start"], prior_p["end"]), "e": e, "role": role})

def at(pts, key): return pts.get(key)  # value/note/vintage_count at an exact (start,end), or None

def ltm_at(pts, k):
    fy, cur, pr = at(pts, k["fy"]), at(pts, k["cur"]), at(pts, k["prior"])
    if None in (fy, cur, pr): return None
    return fy["val"] + cur["val"] - pr["val"]

def fy_val(pts, k): p = at(pts, k["fy"]); return p["val"] if p else None

# ── §1.1 stitch — canonical spans, whole-stitch gates, F4 single-basis pair ────
def stitch(fixture):
    facts = fixture["companyfacts"]; imp = fixture["import_date"]
    rev = tag_points(facts, "us-gaap", "Revenues")
    oi  = tag_points(facts, "us-gaap", "OperatingIncomeLoss")
    da  = tag_points(facts, "us-gaap", "DepreciationDepletionAndAmortization")

    def fy_fallback(reason, k):
        fyk = {"fy": k["fy"]}
        rv = fy_val(rev, fyk)
        oiv, dav = fy_val(oi, fyk), fy_val(da, fyk)
        eb = r2(oiv + dav) if (oiv is not None and dav is not None) else None
        as_of = k["fy"][1]
        return result(fixture, False, ("fy", r2(rv), as_of), ("fy", eb, as_of), reason, badge(as_of, imp), [])

    status, k = canonical_spans(rev, oi, da)
    if status == "no_fy":
        return result(fixture, False, ("missing", None, None), ("missing", None, None), "no full year present", None, [])
    if status == "fpi":
        return fy_fallback("no interim filings (annual-only)", k)
    if status == "no_prior":
        return fy_fallback("no prior-year comparative of the same role", k)

    # ── whole-stitch gates: any failure ⇒ BOTH revenue & EBITDA fall to FY ──
    # F1 abutment
    if plus_1d(k["fy"][1]) != k["cur"][0]:
        return fy_fallback("FY not adjacent to current partial (fiscal-year-end change)", k)
    # F7 52/53-week Δspan (exactly one extra week accepted; >7d refuses)
    dspan = abs(span_days(*k["cur"]) - span_days(*k["prior"]))
    if dspan > 7:
        return fy_fallback(f"YTD span mismatch {dspan}d > 7d (not a 53rd-week case)", k)
    # F3 / M1 vintage on the restatement-risk prior-YTD span, across every stitching metric
    for pts, nm in ((rev, "Revenue"), (oi, "OperInc"), (da, "D&A")):
        pr = at(pts, k["prior"])
        if pr is None: continue  # component absence handled by completeness below
        if pr["vintage_count"] < 2:
            return fy_fallback("prior-YTD single vintage — restatement check un-evaluable (fail-closed)", k)
    for pts, nm in ((rev, "Revenue"), (oi, "OperInc"), (da, "D&A")):
        for span_name, key in (("FY", k["fy"]), ("YTD_current", k["cur"]), ("YTD_prior", k["prior"])):
            p = at(pts, key)
            if p and p["note"]:
                return fy_fallback(f"{nm} {span_name} restated >1% vs original — cross-vintage basis mix ({p['note']})", k)

    # ── availability on the canonical spans ──
    rev_ltm = ltm_at(rev, k)                         # revenue: single tag
    oi_ltm, da_ltm = ltm_at(oi, k), ltm_at(da, k)    # EBITDA: BOTH components at all 3 spans [F5]
    rev_ok = rev_ltm is not None
    ebd_ok = oi_ltm is not None and da_ltm is not None

    # F4 single-basis PAIR: stitch iff BOTH; else BOTH → FY
    if not (rev_ok and ebd_ok):
        if not ebd_ok:
            miss = "D&A" if da_ltm is None else "OperInc"
            return fy_fallback(f"EBITDA component {miss} absent on a canonical span ⇒ single-basis pair fallback", k)
        return fy_fallback("revenue not resolvable on the canonical spans ⇒ single-basis pair fallback", k)

    note = ["<=1-week 52/53 approximation disclosed"] if dspan == 7 else []
    as_of = k["cur"][1]
    return result(fixture, True, ("ltm_stitched", r2(rev_ltm), as_of),
                  ("ltm_stitched", r2(oi_ltm + da_ltm), as_of), None, badge(as_of, imp), note)

def result(fixture, stitched, rev, ebd, reason, bdg, notes):
    return {
        "case": fixture["case"], "stitched": stitched,
        "revenue": {"basis": rev[0], "value": rev[1], "as_of": rev[2]},
        "ebitda":  {"basis": ebd[0], "value": ebd[1], "as_of": ebd[2]},
        "refusal_reason": None if stitched else reason,
        "badge": bdg, "notes": sorted(set(notes)),
    }

def r2(x): return None if x is None else round(x + 0.0, 2)

# ── fixture builders ──────────────────────────────────────────────────────────
def F(start, end, val, filed, form="10-Q"):
    return {"start": start, "end": end, "val": val, "accn": f"acc-{filed}", "filed": filed, "form": form}

def cf(revs, ois, das):
    def concept(pts): return {"units": {"USD": pts}}
    facts = {"us-gaap": {}}
    if revs is not None: facts["us-gaap"]["Revenues"] = concept(revs)
    if ois  is not None: facts["us-gaap"]["OperatingIncomeLoss"] = concept(ois)
    if das  is not None: facts["us-gaap"]["DepreciationDepletionAndAmortization"] = concept(das)
    return {"cik": 1, "entityName": "SYNTH", "facts": facts}

# Reused span endpoints (Dec-31 FYE)
FY24 = ("2024-01-01", "2024-12-31"); NINE_M25 = ("2025-01-01", "2025-09-30"); NINE_M24 = ("2024-01-01", "2024-09-30")

FIXTURES = []

# (i) clean mid-year — PROCEEDS; prior-YTD carries 2 vintages, unchanged (evaluable, no note)
FIXTURES.append({"case": "i", "import_date": "2025-11-15", "companyfacts": cf(
    [F(*FY24, 1000, "2025-02-15", "10-K"), F(*NINE_M25, 800, "2025-11-01"),
     F(*NINE_M24, 720, "2024-11-01"), F(*NINE_M24, 720, "2025-11-01")],
    [F(*FY24, 200, "2025-02-15", "10-K"), F(*NINE_M25, 165, "2025-11-01"),
     F(*NINE_M24, 150, "2024-11-01"), F(*NINE_M24, 150, "2025-11-01")],
    [F(*FY24, 50, "2025-02-15", "10-K"), F(*NINE_M25, 40, "2025-11-01"),
     F(*NINE_M24, 38, "2024-11-01"), F(*NINE_M24, 38, "2025-11-01")])})

# (ii) 52/53-week — PROCEEDS, Δspan = 7d disclosed. FY 2023-12-31→2024-12-28 (364d);
#      current 9M 2024-12-29→2025-09-27 (273d); prior 9M 2023-12-31→2024-10-05 (280d), 2 vintages.
FY53 = ("2023-12-31", "2024-12-28"); C9 = ("2024-12-29", "2025-09-27"); P9 = ("2023-12-31", "2024-10-05")
FIXTURES.append({"case": "ii", "import_date": "2025-11-15", "companyfacts": cf(
    [F(*FY53, 1000, "2025-02-15", "10-K"), F(*C9, 800, "2025-11-01"),
     F(*P9, 720, "2024-11-01"), F(*P9, 720, "2025-11-01")],
    [F(*FY53, 200, "2025-02-15", "10-K"), F(*C9, 165, "2025-11-01"),
     F(*P9, 150, "2024-11-01"), F(*P9, 150, "2025-11-01")],
    [F(*FY53, 50, "2025-02-15", "10-K"), F(*C9, 40, "2025-11-01"),
     F(*P9, 38, "2024-11-01"), F(*P9, 38, "2025-11-01")])})

# (iii) FPI / annual-only (20-F) — FY fallback + badge, no interim
FIXTURES.append({"case": "iii", "import_date": "2025-12-01", "companyfacts": cf(
    [F(*FY24, 1000, "2025-04-15", "20-F")],
    [F(*FY24, 200, "2025-04-15", "20-F")],
    [F(*FY24, 50, "2025-04-15", "20-F")])})

# (iv) missing EBITDA COMPONENT (D&A absent at YTD_current) — both → FY
FIXTURES.append({"case": "iv", "import_date": "2025-11-15", "companyfacts": cf(
    [F(*FY24, 1000, "2025-02-15", "10-K"), F(*NINE_M25, 800, "2025-11-01"),
     F(*NINE_M24, 720, "2024-11-01"), F(*NINE_M24, 720, "2025-11-01")],
    [F(*FY24, 200, "2025-02-15", "10-K"), F(*NINE_M25, 165, "2025-11-01"),
     F(*NINE_M24, 150, "2024-11-01"), F(*NINE_M24, 150, "2025-11-01")],
    [F(*FY24, 50, "2025-02-15", "10-K"),  # D&A: NO 9M-2025 point
     F(*NINE_M24, 38, "2024-11-01"), F(*NINE_M24, 38, "2025-11-01")])})

# (v) abutment failure (Dec→Jun FYE change) — refuse → FY [F1]. All three spans present and pass
#     their windows, but the only full year (old Dec-basis FY2023) is NON-adjacent to the current
#     6M (new Jun basis): 2023-12-31 + 1d = 2024-01-01 ≠ 2025-07-01. Prior 6M carries 2 vintages so
#     the refusal is specifically abutment, not vintage.
FY23 = ("2023-01-01", "2023-12-31"); C6 = ("2025-07-01", "2025-12-31"); P6 = ("2024-07-01", "2024-12-31")
FIXTURES.append({"case": "v", "import_date": "2026-02-15", "companyfacts": cf(
    [F(*FY23, 950, "2024-02-15", "10-K"), F(*C6, 520, "2026-02-01"),
     F(*P6, 480, "2025-02-01"), F(*P6, 480, "2026-02-01")],
    [F(*FY23, 190, "2024-02-15", "10-K"), F(*C6, 105, "2026-02-01"),
     F(*P6, 96, "2025-02-01"), F(*P6, 96, "2026-02-01")],
    [F(*FY23, 48, "2024-02-15", "10-K"), F(*C6, 26, "2026-02-01"),
     F(*P6, 24, "2025-02-01"), F(*P6, 24, "2026-02-01")])})

# (vi) restated prior-YTD (discontinued-ops) — refuse via >1% note (760 → 700)
FIXTURES.append({"case": "vi", "import_date": "2025-11-15", "companyfacts": cf(
    [F(*FY24, 1000, "2025-02-15", "10-K"), F(*NINE_M25, 800, "2025-11-01"),
     F(*NINE_M24, 760, "2024-11-01"), F(*NINE_M24, 700, "2025-11-01")],
    [F(*FY24, 200, "2025-02-15", "10-K"), F(*NINE_M25, 165, "2025-11-01"),
     F(*NINE_M24, 150, "2024-11-01"), F(*NINE_M24, 150, "2025-11-01")],
    [F(*FY24, 50, "2025-02-15", "10-K"), F(*NINE_M25, 40, "2025-11-01"),
     F(*NINE_M24, 38, "2024-11-01"), F(*NINE_M24, 38, "2025-11-01")])})

# (vii) revenue stitchable, EBITDA refuses (OperInc absent at YTD_prior) — both → FY
FIXTURES.append({"case": "vii", "import_date": "2025-11-15", "companyfacts": cf(
    [F(*FY24, 1000, "2025-02-15", "10-K"), F(*NINE_M25, 800, "2025-11-01"),
     F(*NINE_M24, 720, "2024-11-01"), F(*NINE_M24, 720, "2025-11-01")],
    [F(*FY24, 200, "2025-02-15", "10-K"), F(*NINE_M25, 165, "2025-11-01")],  # OperInc: NO 9M-2024
    [F(*FY24, 50, "2025-02-15", "10-K"), F(*NINE_M25, 40, "2025-11-01"),
     F(*NINE_M24, 38, "2024-11-01"), F(*NINE_M24, 38, "2025-11-01")])})

# (viii) NTM base — a distinct PROCEEDS case (LTM feeds the engine NTM base, asserted separately)
FIXTURES.append({"case": "viii", "import_date": "2025-11-15", "companyfacts": cf(
    [F(*FY24, 1200, "2025-02-15", "10-K"), F(*NINE_M25, 960, "2025-11-01"),
     F(*NINE_M24, 840, "2024-11-01"), F(*NINE_M24, 840, "2025-11-01")],
    [F(*FY24, 240, "2025-02-15", "10-K"), F(*NINE_M25, 198, "2025-11-01"),
     F(*NINE_M24, 174, "2024-11-01"), F(*NINE_M24, 174, "2025-11-01")],
    [F(*FY24, 60, "2025-02-15", "10-K"), F(*NINE_M25, 48, "2025-11-01"),
     F(*NINE_M24, 44, "2024-11-01"), F(*NINE_M24, 44, "2025-11-01")])})

# (ix) ESEF single-vintage on the prior-YTD — refuse (un-evaluable, fail-closed)
FIXTURES.append({"case": "ix", "import_date": "2025-11-15", "companyfacts": cf(
    [F(*FY24, 1000, "2025-02-15", "10-K"), F(*NINE_M25, 800, "2025-11-01"),
     F(*NINE_M24, 700, "2025-11-01")],  # prior-YTD: ONE vintage only
    [F(*FY24, 200, "2025-02-15", "10-K"), F(*NINE_M25, 165, "2025-11-01"),
     F(*NINE_M24, 150, "2025-11-01")],
    [F(*FY24, 50, "2025-02-15", "10-K"), F(*NINE_M25, 40, "2025-11-01"),
     F(*NINE_M24, 38, "2025-11-01")])})

def main():
    out_root = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "..", "tests", "goldens", "g2ltm")
    for fx in FIXTURES:
        res = stitch(fx)
        dpath = os.path.join(out_root, fx["case"])
        os.makedirs(dpath, exist_ok=True)
        with open(os.path.join(dpath, "expected.json"), "w") as fh:
            json.dump(res, fh, indent=1, sort_keys=True)
            fh.write("\n")
        print(f'{fx["case"]:>4}: stitched={res["stitched"]!s:5} rev={res["revenue"]["basis"]}:{res["revenue"]["value"]} '
              f'ebitda={res["ebitda"]["basis"]}:{res["ebitda"]["value"]} badge={res["badge"]} '
              f'{"| " + res["refusal_reason"] if res["refusal_reason"] else ""}')

if __name__ == "__main__":
    main()
