"""Read the recalculated challenger workbooks: every compared row, years 1..5 (scalars from col D)."""
import json
import sys

import openpyxl

RECALC, META, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
meta = json.load(open(META))
rows = meta['rows']
YC = ['D', 'E', 'F', 'G', 'H', 'I']
per_year = ['rev', 'ebitda', 'da', 'capex', 'dnwc', 'a_int', 'b_int', 'r_int', 'r_cfee', 'a_mand', 'b_mand', 'r_repay',
            'a_sweep', 'b_sweep', 'r_draw', 'cash_close', 'a_close', 'b_close', 'r_close', 'taxable', 'nol_used', 'tax_paid',
            'p_cint', 'p_pikacc', 'p_close', 'ded', 'cf_close', 'acq_used', 'reg_tax', 'min_tax_amt', 'dist_paid', 'rp_cap', 'ebitda_adj']
scalars = ['ev', 'txn', 'finfee', 'oid', 'sponsor', 'irr', 'moic', 'inv']
res = {}
for v in meta['variants']:
    ws = openpyxl.load_workbook(f"{RECALC}/{v['id']}.xlsx", data_only=True)['LBO']
    d = {k: [ws[f'{YC[t]}{rows[k]}'].value for t in range(1, 6)] for k in per_year}
    d.update({k: ws[f'D{rows[k]}'].value for k in scalars})
    d['oid_am'] = [ws[f'{YC[t]}{rows["a_oid_am"]}'].value + ws[f'{YC[t]}{rows["b_oid_am"]}'].value for t in range(1, 6)]
    d['fee_am'] = [sum(ws[f'{YC[t]}{rows[k]}'].value for k in ['a_fee_am', 'b_fee_am', 'p_fee_am', 'r_fee_am']) for t in range(1, 6)]
    d['exit_ev'] = ws[f'I{rows["exit_ev"]}'].value
    for k in ['exit_eq', 'term', 'mip', 'sp_exit']:
        d[k] = ws[f'I{rows[k]}'].value
    res[v['id']] = d
json.dump(res, open(OUT, 'w'), indent=1)
print('extracted', len(res))
