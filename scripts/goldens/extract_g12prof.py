"""
Extract golden G12-PROF (SPEC §25.9) from the reference workbook AFTER an independent
spreadsheet engine has recalculated it. Provenance discipline: the expected values are the
REFERENCE MODEL'S OWN cells, computed by LibreOffice — never by this codebase.

The reference workbook ("LBO and FTE - worked example.xlsx", Corporate Finance 2) is course
material and is NOT committed; only the extracted numbers are. To regenerate:

    soffice --headless --convert-to xlsx --outdir /tmp/recalc "LBO and FTE - worked example.xlsx"
    python3 -I scripts/goldens/extract_g12prof.py /tmp/recalc/<file>.xlsx > tests/goldens/G12PROF/expected.json

Requires openpyxl.
"""
import json
import sys

import openpyxl

wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
ws = wb["LBO and FTE"]
cols = "EFGHI"  # years 1..5
row = lambda r: [ws[f"{c}{r}"].value for c in cols]
rowD = lambda r: [ws[f"{c}{r}"].value for c in "DEFGHI"]  # years 0..5

out = {
    "_provenance": "Reference workbook cells, recalculated by LibreOffice (independent of this codebase). SPEC §25.9.",
    "operating": {"ebit": row(25), "da": row(26), "ebitda": row(27), "capex": row(28), "delta_nwc": row(29)},
    "debt": {"opening": row(31), "interest": row(32), "pbt": row(33), "tax": row(34), "net_income": row(35),
             "cash_available": row(36), "repaid": row(37), "closing": row(38)},
    "entry_multiple": ws["D42"].value,
    "opening_leverage_ntm": ws["D43"].value,
    "debt_at_exit": ws["D44"].value,
    "exit_ev_a": ws["D47"].value,
    "ufcf_n_plus_1": ws["D48"].value,
    "exit_ev_b": ws["D49"].value,
    "exit_multiple_b": ws["D50"].value,
    "exit_equity": {"a": ws["D56"].value, "b": ws["E56"].value},
    "moic": {"a": ws["D57"].value, "b": ws["E57"].value},
    "irr": {"a": ws["D61"].value, "b": ws["E61"].value},
    "bridge": {
        "a": {"growth": ws["D63"].value, "multiple": ws["D64"].value, "paydown": ws["D65"].value, "total": ws["D66"].value},
        "b": {"growth": ws["E63"].value, "multiple": ws["E64"].value, "paydown": ws["E65"].value, "total": ws["E66"].value},
    },
    "fte_b": {"equity_value": rowD(69), "equity_weight": rowD(72), "beta_equity": rowD(73), "cost_of_equity": rowD(74),
              "npv": ws["D78"].value, "value_per_dollar": ws["D79"].value, "required_return": ws["D80"].value},
    "fte_a": {"equity_value": rowD(84), "equity_weight": rowD(87), "beta_equity": rowD(88), "cost_of_equity": rowD(89),
              "npv": ws["D93"].value, "value_per_dollar": ws["D94"].value, "required_return": ws["D95"].value},
    "breakeven_reference_typed": {"exit_multiple": ws["D126"].value, "asset_beta": ws["D127"].value, "long_run_growth": ws["D128"].value},
    "checks_total": wb["Checks"]["C13"].value,
    # §3.8 [v2.1.0]: section 9, "the same deal at five debt levels" — interest held at 7%,
    # and once the debt is repaid surplus cash is paid to equity. The $900m row is the live
    # model; the other rows are the reference's own typed values (rounded as typed).
    "leverage_table": [
        {"debt": ws[f"B{r}"].value, "sponsor_equity": ws[f"D{r}"].value, "irr_a": ws[f"E{r}"].value,
         "irr_b": ws[f"F{r}"].value, "required_b": ws[f"G{r}"].value, "npv_b": ws[f"H{r}"].value}
        for r in range(119, 124)
    ],
}
json.dump(out, sys.stdout, indent=2)
