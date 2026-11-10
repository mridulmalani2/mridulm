"""Derive the FULL challenger generator (v3_make.py) from the validated v2 generator by adding
blocks: a PIK note, §163(j), acquired NOLs + §382, minimum tax, a monitoring fee + termination,
distributions under a restricted-payment trap, a two-tier marginal promote, rollover equity.
Every replacement is asserted to hit exactly once, so a silent no-op edit is impossible."""
import sys

src, dst = sys.argv[1], sys.argv[2]
s = open(src).read()


def rep(old, new):
    global s
    assert s.count(old) == 1, (old[:80], s.count(old))
    s = s.replace(old, new)


rep("""              'r_commit', 'r_base', 'r_floor', 'r_spread', 'r_fee', 'r_mat']:
        put_input(k, k, v[k])""", """              'r_commit', 'r_base', 'r_floor', 'r_spread', 'r_fee', 'r_mat',
              'p_par', 'p_cash', 'p_pik', 'p_mat', 'mon_annual', 'mon_T', 'mon_r', 'rp_level',
              'mip_s1', 'mip_h1', 'mip_h2', 'mip_s2', 'rollover', 's163j', 'ati_pct', 'nol_acq', 's382', 'min_tax']:
        put_input(k, k, v[k])
    for t in range(1, N + 1):
        put_input(f'd{t}', f'requested distribution y{t}', v['dist'][t - 1])""")
rep("""    put_row('ebitda', 'EBITDA', {t: f"={C('rev', t)}*{C('margin', t)}" for t in yrs})""",
    """    put_row('ebitda', 'EBITDA', {t: f"={C('rev', t)}*{C('margin', t)}" for t in yrs})
    # monitoring fee: charged in years 1..N-1 only (the exit-year fee is replaced by the termination)
    put_row('mon_fee', 'monitoring fee', {t: (f"={I('mon_annual')}" if t < N else '=0') for t in yrs})
    put_row('ebitda_adj', 'EBITDA after the monitoring fee', {t: f"={C('ebitda', t)}-{C('mon_fee', t)}" for t in yrs})""")
rep("""{0: f"={I('a_par')}+{I('b_par')}+{I('r_commit')}"})""", """{0: f"={I('a_par')}+{I('b_par')}+{I('p_par')}+{I('r_commit')}"})""")
rep("""-{I('a_par')}-{I('b_par')}"})""", """-{I('a_par')}-{I('b_par')}-{I('p_par')}-{I('rollover')}"})
    put_row('inv', 'total equity invested', {0: f"={C('sponsor',0)}+{I('rollover')}"})""")
rep("""for inst, par, mat in [('a', 'a_par', 'a_mat'), ('b', 'b_par', 'b_mat'), ('r', 'r_commit', 'r_mat')]:""",
    """for inst, par, mat in [('a', 'a_par', 'a_mat'), ('b', 'b_par', 'b_mat'), ('p', 'p_par', 'p_mat'), ('r', 'r_commit', 'r_mat')]:""")
rep("""    put_row('r_open', 'rcf opening drawn',""", """    put_row('p_open', 'PIK opening (incl. accrued PIK)', {t: (f"={I('p_par')}" if t == 1 else f"={C('p_close', t-1)}") for t in yrs})
    put_row('r_open', 'rcf opening drawn',""")
rep("""    put_row('r_cfee', 'commitment fee',""", """    put_row('p_cint', 'PIK cash coupon', {t: f"={C('p_open',t)}*{I('p_cash')}" for t in yrs})
    put_row('p_pikacc', 'PIK accrual', {t: f"={C('p_open',t)}*{I('p_pik')}" for t in yrs})
    put_row('r_cfee', 'commitment fee',""")
# the PIK note carries a fee pool (no OID, never retired before exit) — treated like the revolver in the loops
rep("""    for inst in ['a', 'b', 'r']:
        for kind in (['fee', 'oid'] if inst != 'r' else ['fee']):
            pool""", """    for inst in ['a', 'b', 'p', 'r']:
        for kind in (['fee', 'oid'] if inst in ('a', 'b') else ['fee']):
            pool""")
rep("""    put_row('ebit', 'EBIT', {t: f"={C('ebitda',t)}-{C('da',t)}" for t in yrs})""",
    """    put_row('ebit', 'EBIT', {t: f"={C('ebitda_adj',t)}-{C('da',t)}" for t in yrs})""")
rep("""[('a','fee'),('a','oid'),('b','fee'),('b','oid'),('r','fee')]""", """[('a','fee'),('a','oid'),('b','fee'),('b','oid'),('p','fee'),('r','fee')]""")
rep("""    put_row('taxable', 'taxable before NOL', {t: (
        f"={C('ebit',t)}-{C('a_int',t)}-{C('b_int',t)}-{C('r_int',t)}-{C('r_cfee',t)}"
        f"-{C('a_fee_am',t)}-{C('a_oid_am',t)}-{C('b_fee_am',t)}-{C('b_oid_am',t)}-{C('r_fee_am',t)}"
        f"-{C('deferred_wo',t)}-{C('exit_wo',t)}") for t in yrs})
    put_row('nol_open', 'NOL pool opening', {t: ('=0' if t == 1 else f"={C('nol_close',t-1)}") for t in yrs})
    put_row('nol_used', 'NOL used', {t: f"=IF({C('taxable',t)}>0,MIN({C('nol_open',t)},0.8*{C('taxable',t)}),0)" for t in yrs})
    put_row('nol_close', 'NOL pool closing', {t: f"={C('nol_open',t)}-{C('nol_used',t)}+IF({C('taxable',t)}<0,-{C('taxable',t)},0)" for t in yrs})
    put_row('tax_paid', 'cash tax', {t: f"=IF({C('taxable',t)}>0,{I('tax')}*({C('taxable',t)}-{C('nol_used',t)}),0)" for t in yrs})""",
    """    # §163(j): interest-like items (cash interest, PIK, OID amortization) are capped at a % of
    # ATI (= EBITDA after the monitoring fee); the excess carries forward indefinitely
    put_row('capped', 'interest subject to the cap', {t: (
        f"={C('a_int',t)}+{C('b_int',t)}+{C('r_int',t)}+{C('p_cint',t)}+{C('p_pikacc',t)}+{C('a_oid_am',t)}+{C('b_oid_am',t)}") for t in yrs})
    put_row('cf_open', 'disallowed interest brought forward', {t: ('=0' if t == 1 else f"={C('cf_close',t-1)}") for t in yrs})
    put_row('ded', 'deductible interest', {t: f"=IF({I('s163j')}=1,MIN({C('capped',t)}+{C('cf_open',t)},MAX(0,{I('ati_pct')}*{C('ebitda_adj',t)})),{C('capped',t)})" for t in yrs})
    put_row('cf_close', 'disallowed interest carried forward', {t: f"=IF({I('s163j')}=1,{C('capped',t)}+{C('cf_open',t)}-{C('ded',t)},0)" for t in yrs})
    put_row('taxable', 'taxable before NOL', {t: (
        f"={C('ebit',t)}-{C('ded',t)}-{C('r_cfee',t)}"
        f"-{C('a_fee_am',t)}-{C('b_fee_am',t)}-{C('p_fee_am',t)}-{C('r_fee_am',t)}"
        f"-{C('deferred_wo',t)}-{C('exit_wo',t)}") for t in yrs})
    # NOLs: acquired (post-2017 losses: 80% limit; §382 annual cap) used first, then post-close,
    # the two together never above 80% of taxable income
    put_row('acq_open', 'acquired NOL opening', {t: (f"={I('nol_acq')}" if t == 1 else f"={C('acq_close',t-1)}") for t in yrs})
    put_row('acq_used', 'acquired NOL used', {t: f"=IF({C('taxable',t)}>0,MIN({C('acq_open',t)},{I('s382')},0.8*{C('taxable',t)}),0)" for t in yrs})
    put_row('acq_close', 'acquired NOL closing', {t: f"={C('acq_open',t)}-{C('acq_used',t)}" for t in yrs})
    put_row('nol_open', 'post-close NOL opening', {t: ('=0' if t == 1 else f"={C('nol_close',t-1)}") for t in yrs})
    put_row('nol_used', 'post-close NOL used', {t: f"=IF({C('taxable',t)}>0,MIN({C('nol_open',t)},MAX(0,0.8*{C('taxable',t)}-{C('acq_used',t)})),0)" for t in yrs})
    put_row('nol_close', 'post-close NOL closing', {t: f"={C('nol_open',t)}-{C('nol_used',t)}+IF({C('taxable',t)}<0,-{C('taxable',t)},0)" for t in yrs})
    put_row('reg_tax', 'regular tax', {t: f"=IF({C('taxable',t)}>0,{I('tax')}*({C('taxable',t)}-{C('acq_used',t)}-{C('nol_used',t)}),0)" for t in yrs})
    put_row('min_tax_amt', 'minimum tax', {t: f"=IF({C('taxable',t)}>0,{I('min_tax')}*{C('taxable',t)},0)" for t in yrs})
    put_row('tax_paid', 'cash tax', {t: f"=MAX({C('reg_tax',t)},{C('min_tax_amt',t)})" for t in yrs})""")
rep("""        f"={C('cash_open',t)}+{C('ebitda',t)}-{C('tax_paid',t)}-{C('capex',t)}-{C('dnwc',t)}"
        f"-{C('a_int',t)}-{C('b_int',t)}-{C('r_int',t)}-{C('r_cfee',t)}") for t in yrs})""",
    """        f"={C('cash_open',t)}+{C('ebitda_adj',t)}-{C('tax_paid',t)}-{C('capex',t)}-{C('dnwc',t)}"
        f"-{C('a_int',t)}-{C('b_int',t)}-{C('r_int',t)}-{C('p_cint',t)}-{C('r_cfee',t)}") for t in yrs})""")
rep("""    put_row('cash_close', 'closing cash', {t: f"={C('cash3',t)}+{C('r_draw',t)}" for t in yrs})""",
    """    put_row('cash_c', 'cash after the revolver draw', {t: f"={C('cash3',t)}+{C('r_draw',t)}" for t in yrs})
    # distribution: never below the minimum, and only while PRO FORMA net debt ≤ L × EBITDA
    put_row('debt_end', 'debt at year end (all, incl. PIK and drawn revolver)', {t: f"={C('a_close',t)}+{C('b_close',t)}+{C('p_close',t)}+{C('r_close',t)}" for t in yrs})
    put_row('rp_cap', 'restricted-payment capacity', {t: f"=MAX(0,{C('cash_c',t)}-({C('debt_end',t)}-{I('rp_level')}*{C('ebitda_adj',t)}))" for t in yrs})
    put_row('dist_paid', 'distribution paid', {t: f"=MAX(0,MIN({I(f'd{t}')},{C('cash_c',t)}-{I('min_cash')},{C('rp_cap',t)}))" for t in yrs})
    put_row('cash_close', 'closing cash', {t: f"={C('cash_c',t)}-{C('dist_paid',t)}" for t in yrs})""")
rep("""    put_row('r_close', 'rcf closing',""", """    put_row('p_close', 'PIK closing', {t: f"={C('p_open',t)}+{C('p_pikacc',t)}" for t in yrs})
    put_row('r_close', 'rcf closing',""")
rep("""    for inst in ['a', 'b', 'r']:
        for kind in (['fee', 'oid'] if inst != 'r' else ['fee']):
            put_row(f'{inst}_{kind}_left'""", """    for inst in ['a', 'b', 'p', 'r']:
        for kind in (['fee', 'oid'] if inst in ('a', 'b') else ['fee']):
            put_row(f'{inst}_{kind}_left'""")
rep("""(f"={C(f'{inst}_{kind}_after', t)}" if inst == 'r' else""", """(f"={C(f'{inst}_{kind}_after', t)}" if inst in ('p', 'r') else""")
rep("""    put_row('exit_ev', 'exit EV', {N: f"={I('exit_mult')}*{C('ebitda',N)}"})
    put_row('exit_eq', 'exit equity', {N: f"=MAX(0,{C('exit_ev',N)}-{C('a_close',N)}-{C('b_close',N)}-{C('r_close',N)}+{C('cash_close',N)}-{I('exit_fee_pct')}*{C('exit_ev',N)})"})
    put_row('cf', 'sponsor cash flows', {0: f"=-{C('sponsor',0)}", **{t: ('=0' if t < N else f"={C('exit_eq',N)}") for t in yrs}})
    put_row('irr', 'IRR', {0: f"=IFERROR(IRR(D{rows['cf']}:I{rows['cf']},0.1),\\"N/A\\")"})
    put_row('moic', 'MOIC', {0: f"={C('exit_eq',N)}/{C('sponsor',0)}"})""",
    """    put_row('exit_ev', 'exit EV', {N: f"={I('exit_mult')}*{C('ebitda_adj',N)}"})
    put_row('term', 'monitoring-fee termination  =  annual × annuity', {N: f"=IF({I('mon_T')}<=0,0,IF({I('mon_r')}=0,{I('mon_annual')}*{I('mon_T')},{I('mon_annual')}*(1-(1+{I('mon_r')})^(-{I('mon_T')}))/{I('mon_r')}))"})
    put_row('exit_eq', 'exit equity', {N: f"=MAX(0,{C('exit_ev',N)}-{C('a_close',N)}-{C('b_close',N)}-{C('p_close',N)}-{C('r_close',N)}+{C('cash_close',N)}-{I('exit_fee_pct')}*{C('exit_ev',N)}-{C('term',N)})"})
    # promote: two MARGINAL tiers on total value returned (exit equity + distributions paid), capped at exit equity
    put_row('X', 'value returned for the promote', {N: f"={C('exit_eq',N)}+SUM({C('dist_paid',1)}:{C('dist_paid',N)})"})
    put_row('mip', 'promote', {N: f"=MIN({I('mip_s1')}*MAX(0,MIN({C('X',N)},{I('mip_h2')}*{C('inv',0)})-{I('mip_h1')}*{C('inv',0)})+{I('mip_s2')}*MAX(0,{C('X',N)}-{I('mip_h2')}*{C('inv',0)}),{C('exit_eq',N)})"})
    put_row('sp_frac', 'sponsor share of the equity', {0: f"={C('sponsor',0)}/{C('inv',0)}"})
    put_row('sp_exit', 'sponsor exit proceeds', {N: f"=({C('exit_eq',N)}-{C('mip',N)})*{C('sp_frac',0)}"})
    put_row('cf', 'sponsor cash flows', {0: f"=-{C('sponsor',0)}", **{t: (f"={C('dist_paid',t)}*$D${rows.get('sp_frac', known.get('sp_frac', 0))}" + (f"+{C('sp_exit',N)}" if t == N else '')) for t in yrs}})
    put_row('irr', 'IRR', {0: f"=IFERROR(IRR(D{rows['cf']}:I{rows['cf']},MAX(-0.9,(SUMIF(E{rows['cf']}:I{rows['cf']},\\">0\\")/{C('sponsor',0)})^(1/{N})-1)),\\"N/A\\")"})
    put_row('moic', 'MOIC', {0: f"=SUMIF(E{rows['cf']}:I{rows['cf']},\\">0\\")/{C('sponsor',0)}"})""")
# randomization of the new inputs (appended to each variant before it is built)
rep("""    v['kind'] = kind
    variants.append(v)""", """    v['kind'] = kind
    v.update(
        p_par=round(ltm_ebitda * rng.choice([0, rng.uniform(0.3, 1.0)]), 3), p_cash=round(rng.uniform(0, 0.04), 4),
        p_pik=round(rng.uniform(0.06, 0.12), 4), p_mat=8,
        mon_annual=round(rng.choice([0, rng.uniform(0.5, 4)]), 3), mon_T=rng.choice([0, 3, 5]), mon_r=round(rng.choice([0, rng.uniform(0.05, 0.10)]), 4),
        rp_level=round(rng.uniform(2.0, 5.0), 3),
        mip_s1=round(rng.uniform(0.05, 0.15), 4), mip_h1=round(rng.uniform(1.0, 1.8), 3), mip_s2=0, mip_h2=0,
        rollover=round(rng.choice([0, rng.uniform(5, 60)]), 3),
        s163j=rng.choice([0, 1]), ati_pct=0.3, nol_acq=round(rng.choice([0, rng.uniform(5, 80)]), 3), s382=round(rng.uniform(1, 15), 3),
        min_tax=round(rng.choice([0, 0.15]), 4),
        dist=[round(rng.choice([0, rng.uniform(0, 25)]), 3) for _ in range(5)],
    )
    v['mip_h2'] = round(v['mip_h1'] + rng.uniform(0.3, 1.0), 3)
    v['mip_s2'] = round(v['mip_s1'] + rng.uniform(0.0, 0.15), 4)
    variants.append(v)""")
# variants are built from the dict AFTER the update: move the build below
rep("""    variants.append(v)
    _, first = build(v)""", """    variants.append(v)
    _, first = build(v)""")
open(dst, 'w').write(s)
print('v3 generator written')
