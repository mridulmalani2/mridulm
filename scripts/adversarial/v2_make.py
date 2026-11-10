"""Phase 2 — an INDEPENDENT challenger LBO workbook, written from standard LBO mechanics as plain
Excel formulas (no reference to the engine's code or its exporter). Randomized inputs.

Mechanics (all annual, flows at year end, interest on OPENING balances — no circularity):
  Operating   revenue_t = revenue_{t-1}(1+g_t); margin moves linearly from the LTM margin to the
              target by year N; EBITDA = revenue × margin; D&A, maintenance capex, NWC = % revenue;
              ΔNWC = NWC_t − NWC_{t-1} with NWC_0 = % × LTM revenue.
  Entry       EV = multiple × LTM EBITDA. Uses = EV + transaction fees (% EV) + financing fees
              (% of ALL commitments incl. the undrawn revolver) + OID (% of each term tranche's
              par) + minimum cash. Sponsor equity = uses − term debt.
  Fees/OID    financing fees allocated to each instrument pro rata to its commitment; fees and
              OID amortized straight-line over each instrument's maturity (never beyond what is
              left); a term tranche fully repaid before the exit year writes off what is left
              (book that year, tax deduction NEXT year); everything left is written off at exit
              (deductible in the exit year).
  Tax         taxable = EBITDA − D&A − cash interest − OID amortization − fee amortization
              − commitment fee − deferred write-off deductions. Losses bank into an NOL pool;
              usage = MIN(pool, 80% × taxable); tax = rate × (taxable − usage) when taxable > 0.
  Cash        cash before debt = opening cash + EBITDA − tax − capex − ΔNWC;
              order: interest (term + revolver) → commitment fee → mandatory amortization
              (% of ORIGINAL par, capped at what is outstanding) → revolver repayment from cash
              above the minimum → sweep: pct × cash above the minimum, priority 1 then 2,
              capped at each tranche's balance after amortization → revolver draw to restore
              the minimum (capped at the undrawn commitment).
  Rates       floating = MAX(base, floor) + spread; revolver the same; fee on OPENING undrawn.
  Exit        EV = exit multiple × year-N EBITDA; exit equity = MAX(0, EV − term debt − drawn
              revolver + cash − exit fees (% EV)). Sponsor flows: −equity at 0, exit equity at N.
"""
import json
import random
import sys

import openpyxl

OUT = sys.argv[1]
NVAR = int(sys.argv[2]) if len(sys.argv) > 2 else 30
N = 5
YC = ['D', 'E', 'F', 'G', 'H', 'I']  # year 0..5 columns
PROFILE = sys.argv[3] if len(sys.argv) > 3 else 'mixed'
rng = random.Random({'mixed': 77, 'stress': 4242}[PROFILE])


def build(v, known=None):
    # two passes: row numbers are assigned in write order, so a first pass learns them and the
    # second writes formulas that reference rows defined further down (next year's opening ←
    # this year's closing), exactly as a hand-built LBO sheet does
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'LBO'
    r = [1]
    rows = {}
    known = known or {}

    def put_input(key, label, val):
        ws[f'B{r[0]}'] = label
        ws[f'D{r[0]}'] = val
        rows[key] = r[0]
        r[0] += 1

    def put_row(key, label, formulas):  # formulas: dict col_index -> formula string (with {k} refs)
        ws[f'B{r[0]}'] = label
        rows[key] = r[0]
        for t, f in formulas.items():
            ws[f'{YC[t]}{r[0]}'] = f
        r[0] += 1

    I = lambda k: f'$D${rows.get(k, known.get(k, 0))}'           # an input / scalar
    C = lambda k, t: f'{YC[t]}{rows.get(k, known.get(k, 0))}'    # a cell in row k, year t

    for k in ['ltm_rev', 'ltm_ebitda', 'entry_mult', 'exit_mult', 'txn_pct', 'fin_pct', 'exit_fee_pct', 'min_cash',
              'da_pct', 'capex_pct', 'nwc_pct', 'target_margin', 'tax', 'sweep',
              'a_par', 'a_base', 'a_floor', 'a_spread', 'a_amort', 'a_oid', 'a_mat',
              'b_par', 'b_rate', 'b_amort', 'b_oid', 'b_mat',
              'r_commit', 'r_base', 'r_floor', 'r_spread', 'r_fee', 'r_mat']:
        put_input(k, k, v[k])
    for t in range(1, N + 1):
        put_input(f'g{t}', f'growth y{t}', v['growth'][t - 1])
    r[0] += 1
    yrs = range(1, N + 1)
    put_row('t', 'year', {t: t for t in range(0, N + 1)})
    # ── operating ──
    put_row('rev', 'revenue', {0: f"={I('ltm_rev')}", **{t: f"={C('rev', t-1)}*(1+{I(f'g{t}')})" for t in yrs}})
    put_row('margin', 'margin', {0: f"={I('ltm_ebitda')}/{I('ltm_rev')}",
                                 **{t: f"={C('margin', 0)}+({I('target_margin')}-{C('margin', 0)})*{t}/{N}" for t in yrs}})
    put_row('ebitda', 'EBITDA', {t: f"={C('rev', t)}*{C('margin', t)}" for t in yrs})
    put_row('da', 'D&A', {t: f"={I('da_pct')}*{C('rev', t)}" for t in yrs})
    put_row('capex', 'capex', {t: f"={I('capex_pct')}*{C('rev', t)}" for t in yrs})
    put_row('nwc', 'NWC', {t: f"={I('nwc_pct')}*{C('rev', t)}" for t in range(0, N + 1)})
    put_row('dnwc', 'ΔNWC', {t: f"={C('nwc', t)}-{C('nwc', t-1)}" for t in yrs})
    # ── entry ──
    put_row('ev', 'EV', {0: f"={I('entry_mult')}*{I('ltm_ebitda')}"})
    put_row('commit', 'total commitments', {0: f"={I('a_par')}+{I('b_par')}+{I('r_commit')}"})
    put_row('finfee', 'financing fees', {0: f"={I('fin_pct')}*{C('commit', 0)}"})
    put_row('oid', 'OID', {0: f"={I('a_par')}*{I('a_oid')}+{I('b_par')}*{I('b_oid')}"})
    put_row('txn', 'transaction fees', {0: f"={I('txn_pct')}*{C('ev', 0)}"})
    put_row('sponsor', 'sponsor equity', {0: f"={C('ev',0)}+{C('txn',0)}+{C('finfee',0)}+{C('oid',0)}+{I('min_cash')}-{I('a_par')}-{I('b_par')}"})
    # fee / OID pools per instrument
    for inst, par, mat in [('a', 'a_par', 'a_mat'), ('b', 'b_par', 'b_mat'), ('r', 'r_commit', 'r_mat')]:
        put_row(f'{inst}_feepool', f'{inst} fee pool', {0: f"=IF({C('commit',0)}>0,{C('finfee',0)}*{I(par)}/{C('commit',0)},0)"})
    put_row('a_oidpool', 'a OID pool', {0: f"={I('a_par')}*{I('a_oid')}"})
    put_row('b_oidpool', 'b OID pool', {0: f"={I('b_par')}*{I('b_oid')}"})
    # ── rates ──
    put_row('a_rate', 'a rate', {0: f"=MAX({I('a_base')},{I('a_floor')})+{I('a_spread')}"})
    put_row('r_rate', 'rcf rate', {0: f"=MAX({I('r_base')},{I('r_floor')})+{I('r_spread')}"})
    # ── debt & cash, year by year (rows written in the order the cash moves) ──
    put_row('cash_open', 'opening cash', {t: (f"={I('min_cash')}" if t == 1 else f"={C('cash_close', t-1)}") for t in yrs})
    for inst in ['a', 'b']:
        put_row(f'{inst}_open', f'{inst} opening', {t: (f"={I(inst + '_par')}" if t == 1 else f"={C(inst + '_close', t-1)}") for t in yrs})
    put_row('r_open', 'rcf opening drawn', {t: ('=0' if t == 1 else f"={C('r_close', t-1)}") for t in yrs})
    put_row('a_int', 'a interest', {t: f"={C('a_open',t)}*$D${rows.get('a_rate', known.get('a_rate', 0))}" for t in yrs})
    put_row('b_int', 'b interest', {t: f"={C('b_open',t)}*{I('b_rate')}" for t in yrs})
    put_row('r_int', 'rcf interest', {t: f"={C('r_open',t)}*$D${rows['r_rate']}" for t in yrs})
    put_row('r_cfee', 'commitment fee', {t: f"=({I('r_commit')}-{C('r_open',t)})*{I('r_fee')}" for t in yrs})
    # amortization of fees and OID: straight line, never beyond what remains; retirement write-off
    for inst in ['a', 'b', 'r']:
        for kind in (['fee', 'oid'] if inst != 'r' else ['fee']):
            pool = f'{inst}_{kind}pool' if kind == 'oid' else f'{inst}_feepool'
            put_row(f'{inst}_{kind}_am', f'{inst} {kind} amortization', {t: (
                f"=MIN({('$D$' + str(rows.get(pool, known.get(pool, 0)))) if t == 1 else C(f'{inst}_{kind}_left', t-1)},$D${rows.get(pool, known.get(pool, 0))}/{I(inst + '_mat')})")
                for t in yrs})
            put_row(f'{inst}_{kind}_after', f'{inst} {kind} after amortization', {t: (
                f"={('$D$' + str(rows.get(pool, known.get(pool, 0)))) if t == 1 else C(f'{inst}_{kind}_left', t-1)}-{C(f'{inst}_{kind}_am', t)}") for t in yrs})
    # tax needs the deferred write-off from the PRIOR year's retirement → defined below via left/retired rows
    put_row('ebit', 'EBIT', {t: f"={C('ebitda',t)}-{C('da',t)}" for t in yrs})
    put_row('deferred_wo', 'write-off deductible this year (prior-year retirements)', {t: ('=0' if t == 1 else f"={C('wo_book',t-1)}") for t in yrs})
    put_row('exit_wo', 'exit-year write-off (deductible now)', {t: ('=0' if t < N else '=' + '+'.join(C(f'{i}_{k}_after', t) for i, k in [('a','fee'),('a','oid'),('b','fee'),('b','oid'),('r','fee')])) for t in yrs})
    put_row('taxable', 'taxable before NOL', {t: (
        f"={C('ebit',t)}-{C('a_int',t)}-{C('b_int',t)}-{C('r_int',t)}-{C('r_cfee',t)}"
        f"-{C('a_fee_am',t)}-{C('a_oid_am',t)}-{C('b_fee_am',t)}-{C('b_oid_am',t)}-{C('r_fee_am',t)}"
        f"-{C('deferred_wo',t)}-{C('exit_wo',t)}") for t in yrs})
    put_row('nol_open', 'NOL pool opening', {t: ('=0' if t == 1 else f"={C('nol_close',t-1)}") for t in yrs})
    put_row('nol_used', 'NOL used', {t: f"=IF({C('taxable',t)}>0,MIN({C('nol_open',t)},0.8*{C('taxable',t)}),0)" for t in yrs})
    put_row('nol_close', 'NOL pool closing', {t: f"={C('nol_open',t)}-{C('nol_used',t)}+IF({C('taxable',t)}<0,-{C('taxable',t)},0)" for t in yrs})
    put_row('tax_paid', 'cash tax', {t: f"=IF({C('taxable',t)}>0,{I('tax')}*({C('taxable',t)}-{C('nol_used',t)}),0)" for t in yrs})
    put_row('cash1', 'cash after operations, interest and fees', {t: (
        f"={C('cash_open',t)}+{C('ebitda',t)}-{C('tax_paid',t)}-{C('capex',t)}-{C('dnwc',t)}"
        f"-{C('a_int',t)}-{C('b_int',t)}-{C('r_int',t)}-{C('r_cfee',t)}") for t in yrs})
    put_row('a_mand', 'a mandatory', {t: f"=MIN({I('a_amort')}*{I('a_par')},{C('a_open',t)})" for t in yrs})
    put_row('b_mand', 'b mandatory', {t: f"=MIN({I('b_amort')}*{I('b_par')},{C('b_open',t)})" for t in yrs})
    put_row('cash2', 'cash after mandatory', {t: f"={C('cash1',t)}-{C('a_mand',t)}-{C('b_mand',t)}" for t in yrs})
    put_row('r_repay', 'rcf repaid', {t: f"=MIN({C('r_open',t)},MAX(0,{C('cash2',t)}-{I('min_cash')}))" for t in yrs})
    put_row('sweepable', 'available to sweep', {t: f"={I('sweep')}*MAX(0,{C('cash2',t)}-{C('r_repay',t)}-{I('min_cash')})" for t in yrs})
    put_row('a_sweep', 'a sweep (priority 1)', {t: f"=MIN({C('sweepable',t)},{C('a_open',t)}-{C('a_mand',t)})" for t in yrs})
    put_row('b_sweep', 'b sweep (priority 2)', {t: f"=MIN({C('sweepable',t)}-{C('a_sweep',t)},{C('b_open',t)}-{C('b_mand',t)})" for t in yrs})
    put_row('cash3', 'cash after sweep', {t: f"={C('cash2',t)}-{C('r_repay',t)}-{C('a_sweep',t)}-{C('b_sweep',t)}" for t in yrs})
    put_row('r_draw', 'rcf drawn', {t: f"=IF({C('cash3',t)}<{I('min_cash')},MIN({I('min_cash')}-{C('cash3',t)},{I('r_commit')}-{C('r_open',t)}+{C('r_repay',t)}),0)" for t in yrs})
    put_row('cash_close', 'closing cash', {t: f"={C('cash3',t)}+{C('r_draw',t)}" for t in yrs})
    put_row('a_close', 'a closing', {t: f"={C('a_open',t)}-{C('a_mand',t)}-{C('a_sweep',t)}" for t in yrs})
    put_row('b_close', 'b closing', {t: f"={C('b_open',t)}-{C('b_mand',t)}-{C('b_sweep',t)}" for t in yrs})
    put_row('r_close', 'rcf closing', {t: f"={C('r_open',t)}-{C('r_repay',t)}+{C('r_draw',t)}" for t in yrs})
    # retirement: a term tranche repaid in full before the exit year writes off its remaining pools
    for inst in ['a', 'b']:
        put_row(f'{inst}_retired', f'{inst} retired this year', {t: f"=AND({C(inst + '_open',t)}>0.005,{C(inst + '_close',t)}<=0.005)" for t in yrs})
    put_row('wo_book', 'retirement write-off (book; deductible next year)', {t: ('=0' if t == N else
        f"=IF({C('a_retired',t)},{C('a_fee_after',t)}+{C('a_oid_after',t)},0)+IF({C('b_retired',t)},{C('b_fee_after',t)}+{C('b_oid_after',t)},0)") for t in yrs})
    for inst in ['a', 'b', 'r']:
        for kind in (['fee', 'oid'] if inst != 'r' else ['fee']):
            put_row(f'{inst}_{kind}_left', f'{inst} {kind} left at year end', {t: (
                '=0' if t == N else (f"={C(f'{inst}_{kind}_after', t)}" if inst == 'r' else f"=IF({C(inst + '_retired', t)},0,{C(f'{inst}_{kind}_after', t)})")) for t in yrs})
    # ── exit ──
    put_row('exit_ev', 'exit EV', {N: f"={I('exit_mult')}*{C('ebitda',N)}"})
    put_row('exit_eq', 'exit equity', {N: f"=MAX(0,{C('exit_ev',N)}-{C('a_close',N)}-{C('b_close',N)}-{C('r_close',N)}+{C('cash_close',N)}-{I('exit_fee_pct')}*{C('exit_ev',N)})"})
    put_row('cf', 'sponsor cash flows', {0: f"=-{C('sponsor',0)}", **{t: ('=0' if t < N else f"={C('exit_eq',N)}") for t in yrs}})
    put_row('irr', 'IRR', {0: f"=IFERROR(IRR(D{rows['cf']}:I{rows['cf']},0.1),\"N/A\")"})
    put_row('moic', 'MOIC', {0: f"={C('exit_eq',N)}/{C('sponsor',0)}"})
    return wb, rows


variants = []
for i in range(NVAR):
    ltm_rev = rng.uniform(200, 1500)
    m0 = rng.uniform(0.10, 0.30)
    ltm_ebitda = ltm_rev * m0
    a_par = round(ltm_ebitda * rng.uniform(1.5, 4.0), 3)
    b_par = round(ltm_ebitda * rng.choice([0, rng.uniform(0.3, 1.5)]), 3)
    stress = rng.random() < 0.3  # a downturn year early forces revolver draws / losses
    growth = [round(rng.uniform(-0.25, -0.08) if (stress and t == 1) else rng.uniform(-0.03, 0.12), 4) for t in range(1, 6)]
    kind = None
    if PROFILE == 'stress':
        kind = ['crash_recover', 'deleverage', 'tight_cash'][i % 3]
        if kind == 'crash_recover':   # losses banked in the crash, used in the recovery
            growth = [round(rng.uniform(-0.45, -0.30), 4), round(rng.uniform(0.25, 0.45), 4)] + [round(rng.uniform(0.10, 0.20), 4) for _ in range(3)]
        elif kind == 'deleverage':    # low debt + 100% sweep ⇒ tranches retire mid-hold
            growth = [round(rng.uniform(0.05, 0.15), 4) for _ in range(5)]
        else:                         # thin cash cover ⇒ the revolver draws, then repays
            growth = [round(rng.uniform(-0.30, -0.15), 4)] + [round(rng.uniform(0.08, 0.2), 4) for _ in range(4)]
    v = {
        'id': f'w{i:02d}', 'ltm_rev': round(ltm_rev, 3), 'ltm_ebitda': round(ltm_ebitda, 3),
        'entry_mult': round(rng.uniform(6, 12), 3), 'exit_mult': round(rng.uniform(5, 12), 3),
        'txn_pct': round(rng.uniform(0, 0.03), 4), 'fin_pct': round(rng.uniform(0, 0.03), 4), 'exit_fee_pct': round(rng.uniform(0, 0.02), 4),
        'min_cash': round(rng.uniform(0, 30), 3),
        'da_pct': round(rng.uniform(0.02, 0.06), 4), 'capex_pct': round(rng.uniform(0.02, 0.06), 4), 'nwc_pct': round(rng.uniform(0.0, 0.15), 4),
        'target_margin': round(rng.uniform(0.08, 0.32), 4), 'tax': round(rng.uniform(0.15, 0.35), 4), 'sweep': round(rng.choice([0, 0.5, 0.75, 1.0, rng.uniform(0, 1)]), 4),
        'a_par': a_par, 'a_base': round(rng.uniform(0.02, 0.05), 4), 'a_floor': round(rng.uniform(0, 0.05), 4), 'a_spread': round(rng.uniform(0.025, 0.06), 4),
        'a_amort': round(rng.choice([0, 0.01, 0.05, 0.1]), 4), 'a_oid': round(rng.uniform(0, 0.03), 4), 'a_mat': rng.choice([6, 7, 8]),
        'b_par': b_par, 'b_rate': round(rng.uniform(0.08, 0.14), 4), 'b_amort': round(rng.choice([0, 0.0, 0.02]), 4), 'b_oid': round(rng.uniform(0, 0.02), 4), 'b_mat': rng.choice([7, 8]),
        'r_commit': round(ltm_ebitda * rng.uniform(0, 0.6), 3), 'r_base': round(rng.uniform(0.02, 0.05), 4), 'r_floor': round(rng.uniform(0, 0.03), 4),
        'r_spread': round(rng.uniform(0.02, 0.04), 4), 'r_fee': round(rng.uniform(0.0025, 0.005), 4), 'r_mat': rng.choice([6, 7]),
        'growth': growth,
    }
    if kind == 'crash_recover':
        v.update(target_margin=round(rng.uniform(0.25, 0.35), 4), a_par=round(ltm_ebitda * rng.uniform(4.5, 6.0), 3), sweep=1.0)
    elif kind == 'deleverage':
        v.update(a_par=round(ltm_ebitda * rng.uniform(0.5, 1.2), 3), b_par=round(ltm_ebitda * rng.uniform(0.2, 0.6), 3), sweep=1.0, a_oid=0.02, b_oid=0.015, fin_pct=0.02)
    elif kind == 'tight_cash':
        v.update(r_commit=round(ltm_ebitda * rng.uniform(0.5, 1.0), 3), min_cash=round(rng.uniform(10, 30), 3), a_par=round(ltm_ebitda * rng.uniform(4.0, 5.0), 3), nwc_pct=round(rng.uniform(0.1, 0.2), 4))
    v['kind'] = kind
    variants.append(v)
    _, first = build(v)
    wb, rows = build(v, first)
    assert rows == first
    wb.save(f"{OUT}/{v['id']}.xlsx")
json.dump({'variants': variants, 'rows': rows}, open(f'{OUT}/variants.json', 'w'), indent=1)
print(len(variants), 'challenger workbooks written')
