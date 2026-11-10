"""Read the LibreOffice-recalculated reference variants into one JSON (reference values only)."""
import json
import sys

import openpyxl

RECALC, VARS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
variants = json.load(open(VARS))
res = {}
yrs = 'EFGHI'
for v in variants:
    wb = openpyxl.load_workbook(f"{RECALC}/{v['id']}.xlsx", data_only=True)
    ws = wb['LBO and FTE']
    row = lambda r, cols=yrs: [ws[f'{c}{r}'].value for c in cols]
    res[v['id']] = {
        'ebit': row(25), 'da': row(26), 'ebitda': row(27), 'capex': row(28), 'dnwc': row(29),
        'debt_open': row(31), 'interest': row(32), 'pbt': row(33), 'tax': row(34), 'ni': row(35),
        'cash_avail': row(36), 'repaid': row(37), 'debt_close': row(38), 'cfe': row(39),
        'sponsor_equity': ws['D20'].value, 'ru': ws['D21'].value,
        'entry_mult': ws['D42'].value, 'debt_exit': ws['D44'].value,
        'exit_ev_a': ws['D47'].value, 'ufcf6': ws['D48'].value, 'exit_ev_b': ws['D49'].value, 'exit_mult_b': ws['D50'].value,
        'exit_eq_a': ws['D56'].value, 'exit_eq_b': ws['E56'].value,
        'moic_a': ws['D57'].value, 'moic_b': ws['E57'].value,
        'cf_a': row(59, 'DEFGHI'), 'cf_b': row(60, 'DEFGHI'),
        'irr_a': ws['D61'].value, 'irr_b': ws['E61'].value,
        'bridge_growth': ws['D63'].value, 'bridge_mult_b': ws['E64'].value, 'bridge_paydown': ws['D65'].value,
        'fte_b': {'E': row(69, 'DEFGHI'), 'w': row(72, 'DEFGHI'), 'beta': row(73, 'DEFGHI'), 're': row(74, 'DEFGHI'),
                  'npv': ws['D78'].value, 'vpd': ws['D79'].value, 'req': ws['D80'].value},
        'fte_a': {'E': row(84, 'DEFGHI'), 'w': row(87, 'DEFGHI'), 'beta': row(88, 'DEFGHI'), 're': row(89, 'DEFGHI'),
                  'npv': ws['D93'].value, 'vpd': ws['D94'].value, 'req': ws['D95'].value},
    }
json.dump(res, open(OUT, 'w'), indent=1)
print('extracted', len(res))
