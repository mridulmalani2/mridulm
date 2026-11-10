"""Compare reference (Excel, LibreOffice-recalculated) vs engine, leaf by leaf.

Tolerance: 1e-9 relative (1e-9 absolute near zero) — both sides are full-precision
double arithmetic, so anything above float noise is a real difference.
Prints every mismatch; exits non-zero if any. Keys present on only one side are reported.
"""
import json
import math
import sys

ref = json.load(open(sys.argv[1]))
eng = json.load(open(sys.argv[2]))
skip_keys = set(sys.argv[3].split(',')) if len(sys.argv) > 3 and sys.argv[3] else set()
TOL = 1e-9
bad = []
checked = 0


def walk(path, r, e):
    global checked
    if isinstance(r, dict):
        for k in r:
            if k in skip_keys:
                continue
            if k not in e:
                bad.append(f'{path}.{k}: missing on engine side')
                continue
            walk(f'{path}.{k}', r[k], e[k])
        return
    if isinstance(r, list):
        if e is None or len(r) != len(e):
            bad.append(f'{path}: length {len(r)} vs {None if e is None else len(e)}')
            return
        for i, (a, b) in enumerate(zip(r, e)):
            walk(f'{path}[{i}]', a, b)
        return
    if r is None:
        return  # an empty reference cell (e.g. no year-0 value) — nothing to compare
    checked += 1
    if isinstance(r, str):  # a spreadsheet error cell (#NUM!, #DIV/0!) — the engine must say N/A too
        if e is not None:
            bad.append(f'{path}: ref error {r} vs engine {e!r}')
        return
    if e is None or (isinstance(e, float) and math.isnan(e)):
        bad.append(f'{path}: ref {r} vs engine {e}')
        return
    if abs(r - e) > TOL * max(1.0, abs(r)):
        bad.append(f'{path}: ref {r!r} vs engine {e!r} (Δ {e - r:.3e})')


for vid in ref:
    if 'error' in eng.get(vid, {}):
        bad.append(f'{vid}: ENGINE ERROR {eng[vid]["error"]}')
        continue
    walk(vid, ref[vid], eng[vid])
print(f'checked {checked} values across {len(ref)} variants; {len(bad)} mismatches')
for b in bad:
    print('  ', b)
sys.exit(1 if bad else 0)
