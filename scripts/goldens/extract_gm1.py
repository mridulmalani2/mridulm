"""
Extract golden GM1 (SPEC §29) from the reference M&A workbook ("MA_simple_model_student_built.xlsx",
sheet "M&A model (student)", Prof. F. Petra). Provenance discipline: the expected values are the
REFERENCE MODEL'S OWN cached cells, as last calculated by the spreadsheet application that saved
it. Nothing here is computed by this codebase.

The workbook is course material and is NOT committed; only the extracted numbers are. To regenerate:

    python3 -I scripts/goldens/extract_gm1.py "<path>/MA_simple_model_student_built.xlsx" > tests/goldens/GM1/expected.json

Standard library only (the xlsx is read as the zip of XML it is).
"""
import json
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
SHEET = "M&A model (student)"


def cells(path):
    z = zipfile.ZipFile(path)
    ss = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            ss.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    for sh in wb.find("m:sheets", NS):
        if sh.get("name") != SHEET:
            continue
        target = rels[sh.get("{%s}id" % NS["r"])]
        target = "xl/" + target if not target.startswith("/") else target[1:]
        out = {}
        for c in ET.fromstring(z.read(target)).iter("{%s}c" % NS["m"]):
            v = c.find("m:v", NS)
            if v is None or c.get("t") in ("s", "str", "inlineStr", "e"):
                continue
            out[c.get("r")] = float(v.text)
        return out
    raise SystemExit(f"sheet {SHEET!r} not found")


BLOCKS = {"acquirer": "CDEF", "target": "HIJK", "sum": "MNOP", "impact": "RSTU", "combined": "WXYZ"}
ROWS = {
    "revenue": 19, "growth": 20, "ebitda": 22, "margin": 23, "da": 25, "ebit": 27, "net_interest": 29,
    "pbt": 31, "tax": 33, "tax_rate": 34, "net_income": 36, "nci": 38, "net_income_group": 40,
    "eps": 43, "accretion": 44, "shares": 46,
    "cf_ebitda": 53, "cf_net_interest": 54, "other_cash_items": 55, "tax_paid": 56,
    "net_cash_before_wc": 57, "delta_nwc": 59, "acquisition": 61, "capex": 63, "capex_pct": 64,
    "fcf": 66, "other_items": 68, "dividends": 70, "payout": 71, "dps": 72, "nci_dividends": 74,
    "nci_payout": 75, "debt_flow": 77, "equity_issuance": 79, "cash_begin": 81, "cash_change": 82,
    "cash_end": 83, "cash_check": 85, "acquisition_debt": 91, "bank_debt": 92, "total_debt": 93,
    "minus_cash": 95, "net_debt": 97, "nd_ebitda": 99,
}
DEAL = {"equity_value": "K7", "refinanced_net_debt": "K8", "fees": "K9", "total_uses": "K10",
        "debt_issued": "I7", "equity_issued": "I9", "total_sources": "I10", "pct_cash": "O7",
        "pct_stock": "O8", "dilution": "O11", "leverage_test": "O13"}

c = cells(sys.argv[1])
out = {
    "_provenance": "Reference workbook cached cells (independent of this codebase). SPEC §29.9. "
                   "Years: 2023A pro forma, 2024E, 2025E, 2026E. Signs as in the workbook (costs and cash out negative).",
    "deal": {k: c.get(ref) for k, ref in DEAL.items()},
    "rows": {line: {b: [c.get(f"{col}{r}") for col in cols] for b, cols in BLOCKS.items()} for line, r in ROWS.items()},
}
json.dump(out, sys.stdout, indent=1)
print()
