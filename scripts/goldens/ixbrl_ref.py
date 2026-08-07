#!/usr/bin/env python3
"""
ixbrl_ref.py — INDEPENDENT reference derivation for the uploaded-filing iXBRL parser
(lib/edgar/IXBRL_SPEC.md v1 r6; r4 sign-off GRANTED @ fb8021e). Python stdlib ONLY; imports
NOTHING from the TypeScript tree. Reads a fixture (.xhtml/.htm or .zip), applies the SPEC's
§1 parse pipeline + §2 routing/identity/modal-currency, and emits canonical JSON. The
committed outputs under tests/fixtures/ixbrl/expected/ are GOSPEL once the two adjudication
passes sign them (DERIVATION.md method); tests/ixbrl-goldens.test.ts re-runs this script in
CI and fails on drift.

Usage: python3 scripts/goldens/ixbrl_ref.py <fixture-path> [<out-json>]
"""
import io, json, math, re, sys, zipfile
import xml.etree.ElementTree as ET

IX_URIS = {"http://www.xbrl.org/2008/inlineXBRL", "http://www.xbrl.org/2013/inlineXBRL"}
XBRLI = "http://www.xbrl.org/2003/instance"
XBRLDI = "http://xbrl.org/2006/xbrldi"

# §1c — transform registry keyed by (registry namespace, exact local name)
TR1 = "http://www.xbrl.org/2008/inlineXBRL/transformation"
TR2 = "http://www.xbrl.org/inlineXBRL/transformation/2011-07-31"
TR3 = "http://www.xbrl.org/inlineXBRL/transformation/2015-02-26"
TR4 = "http://www.xbrl.org/inlineXBRL/transformation/2020-02-12"
TR5 = "http://www.xbrl.org/inlineXBRL/transformation/2022-02-16"
DOT, COMMA, ZERO = "dot", "comma", "zero"
NUMERIC_TRANSFORMS = {
    (TR1, "numcommadot"): DOT, (TR1, "numdotcomma"): COMMA, (TR1, "numdash"): ZERO,
    (TR2, "numdotdecimal"): DOT, (TR2, "numcommadecimal"): COMMA, (TR2, "zerodash"): ZERO,
    (TR3, "numdotdecimal"): DOT, (TR3, "numcommadecimal"): COMMA, (TR3, "zerodash"): ZERO,
    (TR4, "num-dot-decimal"): DOT, (TR4, "num-comma-decimal"): COMMA, (TR4, "fixed-zero"): ZERO,
    (TR5, "num-dot-decimal"): DOT, (TR5, "num-comma-decimal"): COMMA, (TR5, "fixed-zero"): ZERO,
}
# §1d — identity date transforms (nonNumeric reads only)
DATE_TRANSFORMS = {
    (TR2, "datedaymonthyearen"), (TR2, "datedaymonthyear"),
    (TR3, "datedaymonthyearen"), (TR3, "datedaymonthyear"),
    (TR4, "date-day-month-year"), (TR5, "date-day-month-year"),
}
# canonical prefixes for known namespaces (§1c)
CANONICAL = {
    "http://fasb.org/us-gaap": "us-gaap", "http://xbrl.ifrs.org/taxonomy": "ifrs-full",
    "http://xbrl.sec.gov/dei": "dei", "http://fasb.org/srt": "srt",
    "http://xbrl.sec.gov/country": "country",
}
MONTHS = {m.lower(): i + 1 for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July", "August",
     "September", "October", "November", "December"])}
MONTHS.update({m[:3].lower(): i for m, i in list(MONTHS.items())})

IDENTITY_NAME = {"dei:EntityRegistrantName", "uk-bus:EntityCurrentLegalOrRegisteredName",
                 "ifrs-full:NameOfReportingEntityOrOtherMeansOfIdentification"}
IDENTITY_META = {"dei:DocumentType": "docType", "dei:DocumentFiscalYearFocus": "fy",
                 "dei:DocumentFiscalPeriodFocus": "fp", "dei:DocumentPeriodEndDate": "periodEnd"}
IDENTITY_DATES = {"uk-bus:BalanceSheetDate": "balanceSheetDate",
                  "uk-bus:EndDateForPeriodCoveredByReport": "endDateForPeriod"}

SPACES = " \u00a0\u2009\u202f\t"  # space, NBSP, thin, narrow-NBSP, tab (spec 1c)


def canonical_prefix(uri, doc_prefix):
    for base, pfx in CANONICAL.items():
        if uri.startswith(base):
            return pfx
    return doc_prefix


def parse_number(kind, text):
    t = text.strip()
    if kind == ZERO:
        return 0.0
    if kind == DOT:
        t = re.sub(f"[{SPACES},]", "", t)
    elif kind == COMMA:
        t = re.sub(f"[{SPACES}.]", "", t).replace(",", ".")
    else:  # plain (absent format): sign + decimal only
        t = t.strip()
    sign_re = r"[-−]?" if kind is None else ""  # M5: registry grammars admit no sign character
    if not re.fullmatch(sign_re + r"\d+(\.\d+)?", t):
        return None
    return float(t.replace("−", "-"))


def parse_date(qname_kind, text):
    t = text.strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", t):
        return t
    m = re.fullmatch(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", t)  # "31 December 2023"
    if m and m.group(2).lower() in MONTHS:
        return f"{int(m.group(3)):04d}-{MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
    m = re.fullmatch(r"(\d{1,2})[./-](\d{1,2})[./-](\d{4})", t)  # numeric d-m-y
    if m:
        return f"{int(m.group(3)):04d}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return None


def round_half_away(x, decimals):
    s = 10.0 ** decimals
    return math.copysign(math.floor(abs(x) * s + 0.5), x) / s


def local(tag):
    return tag.rsplit("}", 1)[-1]


def uri_of(tag):
    return tag[1:].rsplit("}", 1)[0] if tag.startswith("{") else ""


def text_minus_exclude(el):
    parts = [el.text or ""]
    for child in el:
        if uri_of(child.tag) in IX_URIS and local(child.tag) == "exclude":
            parts.append(child.tail or "")
            continue
        parts.append(text_minus_exclude(child))
        parts.append(child.tail or "")
    return "".join(parts)


def parse_file(data, filename, out):
    """Parse one xhtml document per IXBRL_SPEC §1 into out (shared across package files)."""
    nsmap = {}
    root = None
    for event, obj in ET.iterparse(io.BytesIO(data), events=("start-ns", "start")):
        if event == "start-ns":
            nsmap[obj[0]] = obj[1]
        elif root is None:
            root = obj
    tree_root = root
    # resolve a prefixed QName via the document nsmap → (canonical_prefixed, uri)
    def qname(pfxname):
        if ":" not in pfxname:
            return pfxname, ""
        pfx, loc = pfxname.split(":", 1)
        uri = nsmap.get(pfx, "")
        return f"{canonical_prefix(uri, pfx)}:{loc}", uri

    contexts, units = {}, {}
    for el in tree_root.iter():
        u, l = uri_of(el.tag), local(el.tag)
        if u == XBRLI and l == "context":
            cid = el.attrib.get("id")
            period, dims = None, {}
            for sub in el.iter():
                su, sl = uri_of(sub.tag), local(sub.tag)
                if su == XBRLI and sl == "startDate":
                    period = [sub.text.strip(), None]
                elif su == XBRLI and sl == "endDate":
                    period[1] = sub.text.strip()
                elif su == XBRLI and sl == "instant":
                    period = sub.text.strip()
                elif su == XBRLDI and sl == "explicitMember":
                    dims[qname(sub.attrib.get("dimension", ""))[0]] = qname((sub.text or "").strip())[0]
                elif su == XBRLDI and sl == "typedMember":
                    # §1a: typed members recorded VERBATIM (inner element text), never interpreted
                    dims[qname(sub.attrib.get("dimension", ""))[0]] = "".join(sub.itertext()).strip()
            for sub in el.iter():
                if uri_of(sub.tag) == XBRLI and local(sub.tag) == "identifier":
                    out.setdefault("entities", set()).add((sub.text or "").strip())
            contexts[cid] = {
                "period": period if isinstance(period, str) else f"{period[0]}/{period[1]}",
                "dims": dims,
            }
        elif u == XBRLI and l == "unit":
            measures = [m.text.strip() for m in el.iter() if uri_of(m.tag) == XBRLI and local(m.tag) == "measure"]
            if len(measures) == 1:
                m = measures[0]
                loc = m.split(":", 1)[1] if ":" in m else m
                units[el.attrib.get("id")] = loc if not m.lower().startswith("iso4217") else loc.upper()
            else:
                units[el.attrib.get("id")] = "/".join(
                    (m.split(":", 1)[1].upper() if m.lower().startswith("iso4217") else m.split(":", 1)[-1])
                    for m in measures)

    for el in tree_root.iter():
        if uri_of(el.tag) not in IX_URIS:
            continue
        kind = local(el.tag)
        name = el.attrib.get("name", "")
        cname, _curi = qname(name)
        if kind == "nonNumeric":
            fmt = el.attrib.get("format")
            raw = text_minus_exclude(el)
            if cname in IDENTITY_NAME:
                out["identity"].setdefault("name", raw.strip())
            elif cname in IDENTITY_META:
                out["identity"][IDENTITY_META[cname]] = raw.strip()
            elif cname in IDENTITY_DATES:
                if fmt is not None:
                    fpfx, floc = fmt.split(":", 1)
                    if (nsmap.get(fpfx, ""), floc) not in DATE_TRANSFORMS:
                        out["notes"].append(f"unsupported date transform {fmt} on {cname} — identity read skipped")
                        continue
                d = parse_date(None, raw)
                if d is None:
                    out["notes"].append(f"unreadable date on {cname} — identity read skipped")
                else:
                    out["identity"][IDENTITY_DATES[cname]] = d
            continue
        if kind != "nonFraction":
            continue
        ctx = contexts.get(el.attrib.get("contextRef"))
        unit = units.get(el.attrib.get("unitRef"))
        if ctx is None or unit is None:
            out["notes"].append(f"unresolved contextRef/unitRef on {cname} — fact dropped")
            continue
        fmt = el.attrib.get("format")
        if fmt is None:
            tkind = None
        else:
            fpfx, floc = fmt.split(":", 1)
            key = (nsmap.get(fpfx, ""), floc)
            if key not in NUMERIC_TRANSFORMS:
                out["notes"].append(f"unsupported transform {fmt} on {cname} — fact dropped")
                continue
            tkind = NUMERIC_TRANSFORMS[key]
        raw = text_minus_exclude(el)
        n = parse_number(tkind, raw)
        if n is None:
            out["notes"].append(f"untransformable text on {cname} — fact dropped")
            continue
        if el.attrib.get("sign") == "-":
            n = -n
        n = n * (10.0 ** int(el.attrib.get("scale", "0")))
        dec = el.attrib.get("decimals")
        out["raw_facts"].append({
            "concept": cname, "period": ctx["period"], "unit": unit,
            "dims": ctx["dims"], "value": n,
            "decimals": None if dec in (None, "INF") else int(dec),
            "file": filename,
        })


def dedupe(out):
    groups = {}
    for f in out["raw_facts"]:
        key = (f["concept"], f["period"], f["unit"], json.dumps(f["dims"], sort_keys=True))
        groups.setdefault(key, []).append(f)
    facts = []
    for key, g in sorted(groups.items()):
        if len(g) == 1:
            facts.append(g[0])
            continue
        coarsest = min((x["decimals"] if x["decimals"] is not None else 10 ** 9) for x in g)
        coarsest = min(coarsest, 10 ** 9)
        rounded = {round_half_away(x["value"], coarsest if coarsest < 10 ** 9 else 12) for x in g}
        concept, period = key[0], key[1]
        if len(rounded) > 1:
            vals = sorted({x["value"] for x in g})
            out["notes"].append(
                f"inconsistent duplicate {concept} @ {period}: {vals[0]} vs {vals[-1]} — dropped to gap")
            continue
        best = sorted(g, key=lambda x: (-(x["decimals"] if x["decimals"] is not None else 10 ** 9), x["file"]))[0]
        if len({x["value"] for x in g}) > 1:
            out["notes"].append(f"duplicate {concept} @ {period}: kept most precise")
        facts.append(best)
    out["facts"] = [
        {k: f[k] for k in ("concept", "period", "unit", "dims", "value", "decimals")}
        for f in sorted(facts, key=lambda f: (f["concept"], f["period"], f["unit"],
                                              json.dumps(f["dims"], sort_keys=True)))
    ]
    del out["raw_facts"]


def finish(out):
    dedupe(out)
    if len(out.get("entities", set())) > 1:
        out["notes"].append("multiple entity identifiers in one upload — out of scope; facts merged per §1a note")
    out.pop("entities", None)
    free = [f for f in out["facts"] if not f["dims"]]
    ug = {f["concept"] for f in free if f["concept"].startswith("us-gaap:")}
    ifrs = {f["concept"] for f in free if f["concept"].startswith("ifrs-full:")}
    out["routing"] = "us-gaap" if ((len(ifrs) == 0 and len(ug) >= 1)
                                   or (len(ug) >= 5 and len(ug) >= len(ifrs))) else "oim"
    cur = {}
    for f in out["facts"]:
        if re.fullmatch(r"[A-Z]{3}", f["unit"]):
            cur[f["unit"]] = cur.get(f["unit"], 0) + 1
    out["modal_currency"] = (sorted(cur.items(), key=lambda kv: (-kv[1], kv[0]))[0][0] if cur else None)
    out["notes"] = sorted(out["notes"])


def main():
    path, out_path = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else None)
    out = {"raw_facts": [], "notes": [], "identity": {}}
    if path.endswith(".zip"):
        z = zipfile.ZipFile(path)
        reports = [n for n in z.namelist() if re.search(r"(^|/)reports/[^/]+\.xhtml$", n)]
        if not reports:
            reports = [n for n in z.namelist()
                       if n.endswith(".xhtml") and b":nonFraction" in z.read(n)]  # M6: facts-bearing only
        for n in sorted(reports):
            parse_file(z.read(n), n.rsplit("/", 1)[-1], out)
    else:
        parse_file(io.open(path, "rb").read(), path.rsplit("/", 1)[-1], out)
    finish(out)
    js = json.dumps(out, indent=1, sort_keys=True, ensure_ascii=False)
    if out_path:
        io.open(out_path, "w", encoding="utf-8").write(js + "\n")
    else:
        print(js)


if __name__ == "__main__":
    main()
