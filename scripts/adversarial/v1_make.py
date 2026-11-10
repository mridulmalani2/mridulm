"""Phase 1 — input-only variants of the professor's reference workbook.

Copies the ORIGINAL workbook, changes only the blue input cells (D7..D18), never a formula,
and writes one .xlsx per variant plus a JSON of the inputs. LibreOffice recalculates them
afterwards; v1_extract.py reads the recalculated values.
"""
import json
import random
import shutil
import sys

import openpyxl

SRC, OUT = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 40
rng = random.Random(20261110)
variants = []
for i in range(N):
    ev = rng.uniform(600, 2200)
    lev = rng.choice([0.0, rng.uniform(0.1, 0.5), rng.uniform(0.5, 0.92)])
    v = {
        'id': f'v{i:02d}',
        'ev': round(ev, 3),
        'debt': round(ev * lev, 3),
        'ebit1': round(rng.uniform(70, 220), 3),
        'g': round(rng.uniform(-0.02, 0.08), 4),
        'da1': round(rng.uniform(5, 45), 3),
        'dnwc1': round(rng.uniform(0, 20), 3),
        'tax': round(rng.uniform(0.15, 0.40), 4),
        'rate': round(rng.uniform(0.03, 0.12), 4),
        'rf': round(rng.uniform(0.02, 0.05), 4),
        'mrp': round(rng.uniform(0.04, 0.08), 4),
        'beta_a': round(rng.uniform(0.6, 1.4), 4),
    }
    ru = v['rf'] + v['beta_a'] * v['mrp']
    v['g_lr'] = round(rng.uniform(0.0, min(0.04, ru - 0.015)), 4)
    variants.append(v)

cells = {'ev': 'D7', 'debt': 'D8', 'ebit1': 'D9', 'g': 'D10', 'da1': 'D11', 'dnwc1': 'D12', 'tax': 'D13',
         'rate': 'D14', 'rf': 'D15', 'mrp': 'D16', 'beta_a': 'D17', 'g_lr': 'D18'}
for v in variants:
    dst = f"{OUT}/{v['id']}.xlsx"
    shutil.copyfile(SRC, dst)
    wb = openpyxl.load_workbook(dst)
    ws = wb['LBO and FTE']
    for k, addr in cells.items():
        assert not (isinstance(ws[addr].value, str) and ws[addr].value.startswith('=')), f'{addr} is a formula, not an input'
        ws[addr].value = v[k]
    wb.save(dst)
json.dump(variants, open(f'{OUT}/variants.json', 'w'), indent=1)
print(len(variants), 'variants written')
