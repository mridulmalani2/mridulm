"""v4 challenger = v3 + a leverage-based sweep grid, per-year PIK cash/PIK elections, days-based
NWC, front/back-loaded margin paths, a warrant. Every edit asserted to apply exactly once."""
import sys

src, dst = sys.argv[1], sys.argv[2]
s = open(src).read()


def rep(old, new):
    global s
    assert s.count(old) == 1, (old[:80], s.count(old))
    s = s.replace(old, new)


rep("""'mip_s1', 'mip_h1', 'mip_h2', 'mip_s2', 'rollover', 's163j', 'ati_pct', 'nol_acq', 's382', 'min_tax']:""",
    """'mip_s1', 'mip_h1', 'mip_h2', 'mip_s2', 'rollover', 's163j', 'ati_pct', 'nol_acq', 's382', 'min_tax',
              'grid_on', 'g_hi_lev', 'g_hi_pct', 'g_lo_lev', 'g_lo_pct', 'g_else', 'nwc_days', 'dso', 'dio', 'dpo', 'path', 'w_pct', 'w_strike']:""")
rep("""        put_input(f'd{t}', f'requested distribution y{t}', v['dist'][t - 1])""",
    """        put_input(f'd{t}', f'requested distribution y{t}', v['dist'][t - 1])
    for t in range(1, N + 1):
        put_input(f'el{t}', f'PIK election y{t} (1 = pik, 0 = cash)', v['el'][t - 1])""")
# margin path: linear t/N, front sqrt(t)/sqrt(N), back (t/N)^2   (path input: 0 linear, 1 front, 2 back)
rep("""**{t: f"={C('margin', 0)}+({I('target_margin')}-{C('margin', 0)})*{t}/{N}" for t in yrs}})""",
    """**{t: f"={C('margin', 0)}+({I('target_margin')}-{C('margin', 0)})*CHOOSE({I('path')}+1,{t}/{N},SQRT({t})/SQRT({N}),({t}/{N})^2)" for t in yrs}})""")
# NWC: % of revenue, or receivables + inventory − payables on days (COGS proxy = revenue × (1 − margin))
rep("""    put_row('nwc', 'NWC', {t: f"={I('nwc_pct')}*{C('rev', t)}" for t in range(0, N + 1)})""",
    """    put_row('nwc', 'NWC', {t: f"=IF({I('nwc_days')}=1,{I('dso')}/365*{C('rev', t)}+({I('dio')}-{I('dpo')})/365*{C('rev', t)}*(1-{C('margin', t)}),{I('nwc_pct')}*{C('rev', t)})" for t in range(0, N + 1)})""")
# PIK elections: a 'cash' year pays the CASH coupon and accrues nothing; a 'pik' year accrues the PIK coupon, pays nothing
rep("""    put_row('p_cint', 'PIK cash coupon', {t: f"={C('p_open',t)}*{I('p_cash')}" for t in yrs})
    put_row('p_pikacc', 'PIK accrual', {t: f"={C('p_open',t)}*{I('p_pik')}" for t in yrs})""",
    """    put_row('p_cint', 'PIK cash coupon', {t: f"=IF({I(f'el{t}')}=0,{C('p_open',t)}*{I('p_cash')},0)" for t in yrs})
    put_row('p_pikacc', 'PIK accrual', {t: f"=IF({I(f'el{t}')}=1,{C('p_open',t)}*{I('p_pik')},0)" for t in yrs})""")
# sweep grid on OPENING net leverage = (opening debt incl. PIK and drawn revolver − opening cash) ÷ EBITDA after the fee
rep("""    put_row('sweepable', 'available to sweep', {t: f"={I('sweep')}*MAX(0,{C('cash2',t)}-{C('r_repay',t)}-{I('min_cash')})" for t in yrs})""",
    """    put_row('open_lev', 'opening net leverage', {t: f"=IF({C('ebitda_adj',t)}>0,({C('a_open',t)}+{C('b_open',t)}+{C('p_open',t)}+{C('r_open',t)}-{C('cash_open',t)})/{C('ebitda_adj',t)},1E+300)" for t in yrs})
    put_row('sweep_pct', 'sweep % applied', {t: f"=IF({I('grid_on')}=1,IF({C('open_lev',t)}>{I('g_hi_lev')},{I('g_hi_pct')},IF({C('open_lev',t)}>{I('g_lo_lev')},{I('g_lo_pct')},{I('g_else')})),{I('sweep')})" for t in yrs})
    put_row('sweepable', 'available to sweep', {t: f"={C('sweep_pct',t)}*MAX(0,{C('cash2',t)}-{C('r_repay',t)}-{I('min_cash')})" for t in yrs})""")
# warrant: settles on the post-promote pot on full dilution with the strike paid in, only if in the money
rep("""    put_row('sp_exit', 'sponsor exit proceeds', {N: f"=({C('exit_eq',N)}-{C('mip',N)})*{C('sp_frac',0)}"})""",
    """    put_row('w_pot', 'pot before the warrant', {N: f"={C('exit_eq',N)}-{C('mip',N)}"})
    put_row('w_net', 'warrant payout net of strike', {N: f"=IF({I('w_pct')}*({C('w_pot',N)}+{I('w_strike')})>{I('w_strike')},{I('w_pct')}*({C('w_pot',N)}+{I('w_strike')})-{I('w_strike')},0)"})
    put_row('sp_exit', 'sponsor exit proceeds', {N: f"=({C('w_pot',N)}-{C('w_net',N)})*{C('sp_frac',0)}"})""")
rep("""    v['mip_h2'] = round(v['mip_h1'] + rng.uniform(0.3, 1.0), 3)""",
    """    v.update(grid_on=rng.choice([0, 1, 1]), g_hi_lev=round(rng.uniform(3.5, 5.0), 3), g_hi_pct=round(rng.uniform(0.6, 1.0), 4),
             g_lo_lev=round(rng.uniform(1.5, 3.4), 3), g_lo_pct=round(rng.uniform(0.3, 0.6), 4), g_else=round(rng.uniform(0, 0.3), 4),
             nwc_days=rng.choice([0, 1]), dso=round(rng.uniform(20, 70), 2), dio=round(rng.uniform(10, 60), 2), dpo=round(rng.uniform(15, 60), 2),
             path=rng.choice([0, 1, 2]), w_pct=round(rng.choice([0.0, rng.uniform(0.02, 0.08)]), 4), w_strike=round(rng.uniform(0, 30), 3),
             el=[rng.choice([0, 1]) for _ in range(5)])
    v['mip_h2'] = round(v['mip_h1'] + rng.uniform(0.3, 1.0), 3)""")
open(dst, 'w').write(s)
print('v4 generator written')
