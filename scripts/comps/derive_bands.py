#!/usr/bin/env python3
"""
SPEC §21.10(1) — the INDEPENDENT reference derivation for the sector comps band.

Tier B redirects the DERIVATION.md mechanism at the new computation: this is a reference in a
DIFFERENT LANGUAGE with **zero imports of the code under test** (lib/edgar/comps.ts), exactly as
scripts/goldens/spec_calc.py is for the engine. It reads the COMMITTED CSVs and the COMMITTED
sector map and emits data/comps/bands.json; tests/comps-regeneration.test.ts re-runs it into a
temp dir and BYTE-compares, so drift on either side is a red test.

§21.4 in one place — the whole computation:
  value  = EV/EBITDA from the ONLY-POSITIVE-EBITDA block (the file's FIRST ratio group)
  weight = the row's `Number of firms` — the INDUSTRY POPULATION, not the ratio's sample
           (one firms column serves both blocks; the positive-EBITDA subset size is unpublished)
  exclude an industry when the value is NA, <= 0, or the row is empty (n = 0)
  band   = the population-weighted 25/50/75th percentiles, LOWER / NEAREST-RANK, no
           interpolation: sort ascending, W = sum of included n_i, the p-th percentile is the
           value of the FIRST constituent whose cumulative weight c_k >= p*W
  'Other' = the file's own `Total Market (without financials)` aggregate, FIRST row with that
           label in file order (China/India publish a duplicate — §21.2)
  zero included constituents => null (the honest-null rule; never a fabricated number)

Byte contract (§21.10(3)): python3 >= 3.11, json.dumps(sort_keys=True, indent=1,
ensure_ascii=False) + a trailing newline, floats via a FIXED 2-decimal formatter (never repr —
repr drops trailing zeros and 29 values across the vendored CSVs carry them).

Usage: python3 scripts/comps/derive_bands.py [outdir]   (default: data/comps)
"""
import csv
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, 'data', 'comps', 'raw')
MAP = os.path.join(ROOT, 'data', 'comps', 'sector-map.json')
REGIONS = ['US', 'Europe', 'Japan', 'India']  # §21.6 — the only regions a deal can select
AGG_LABEL = 'Total Market (without financials)'
PCTLS = (0.25, 0.50, 0.75)


def f2(v):
    """§21.10(3): a FIXED 2-decimal formatter. Never repr()."""
    return float(f'{v:.2f}')


def read_region(region):
    """Rows of (industry, n_firms, value_or_None) + the vintage + the FIRST aggregate row."""
    path = os.path.join(RAW, f'{region}.csv')
    industries, vintage, aggregate = [], None, None
    with open(path, newline='', encoding='utf-8', errors='replace') as fh:
        for r in csv.reader(fh):
            if not r:
                continue
            if vintage is None and r[0].startswith('Date updated'):
                vintage = r[1].strip()
            if len(r) < 6 or not r[0] or not re.match(r'^[A-Za-z]', r[0]) or not r[1].isdigit():
                continue
            name, n, raw = r[0], int(r[1]), r[3].strip()
            try:
                val = float(raw)
            except ValueError:
                val = None                       # 'NA' / '' / '#DIV/0!'
            if name == AGG_LABEL:
                if aggregate is None:            # §21.5: FIRST row with the label wins
                    aggregate = (n, val)
                continue
            if name.startswith('Total Market'):
                continue                          # aggregates are never constituents
            industries.append((name, n, val))
    if vintage is None:
        raise SystemExit(f'{region}: no "Date updated" cell — refuse to emit an unstamped band')
    return industries, vintage, aggregate


def band(constituents):
    """§21.4. `constituents` = [(name, n, value)]. Returns None when nothing is included."""
    inc = [(v, n) for (_nm, n, v) in constituents if v is not None and v > 0 and n > 0]
    if not inc:
        return None
    inc.sort(key=lambda t: t[0])
    W = sum(n for _v, n in inc)
    if W == 0:
        return None
    out = []
    for p in PCTLS:
        target = p * W
        cum = 0
        for v, n in inc:
            cum += n
            if cum >= target:                     # >= : the boundary rule (§21.11(iii))
                out.append(v)
                break
    return {'low': f2(out[0]), 'median': f2(out[1]), 'high': f2(out[2]),
            'industries_used': len(inc), 'firms': W}


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'data', 'comps')
    smap = json.load(open(MAP, encoding='utf-8'))
    buckets = smap['buckets']
    result = {}
    for region in REGIONS:
        industries, vintage, aggregate = read_region(region)
        by_name = {nm: (nm, n, v) for (nm, n, v) in industries}
        mapped = {i for lst in buckets.values() for i in lst}
        present = set(by_name)
        assert not (mapped - present), f'{region}: phantom industries {sorted(mapped - present)}'
        assert not (present - mapped), f'{region}: unmapped industries {sorted(present - mapped)}'
        cite = (f'Damodaran, EV/EBITDA by industry ({region}), vintage {vintage} — '
                'pages.stern.nyu.edu/~adamodar')
        region_out = {}
        for bucket, names in buckets.items():
            b = band([by_name[n] for n in names])
            region_out[bucket] = None if b is None else {
                **b, 'basis': 'sector', 'region': region, 'vintage': vintage,
                'bucket': bucket, 'citation': cite}
        # §21.5: 'Other' is the whole-market aggregate, not a sector
        if aggregate is not None and aggregate[1] is not None:
            n, v = aggregate
            region_out['Other'] = {
                'low': f2(v), 'median': f2(v), 'high': f2(v),
                'industries_used': 0, 'firms': n,
                'basis': 'total_market_ex_financials', 'region': region, 'vintage': vintage,
                'bucket': 'Other', 'citation': cite}
        else:
            region_out['Other'] = None
        result[region] = region_out
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, 'bands.json'), 'w', encoding='utf-8') as fh:
        fh.write(json.dumps(result, sort_keys=True, indent=1, ensure_ascii=False) + '\n')
    print(f'bands.json written for {", ".join(REGIONS)}')


if __name__ == '__main__':
    main()
