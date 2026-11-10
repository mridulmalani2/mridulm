"""v5 challenger = v4 + the tax CHARACTER of retired debt (SPEC §7.1 [v2.4.0], from the standard,
not from engine code): unamortized OID written off on a retirement or at exit is repurchase
premium (Treas. Reg. §1.163-7(c)) — §163(j) interest, so it joins the CAPPED pool; unamortized
debt-issuance costs are not interest and stay a full (uncapped) deduction. Timing unchanged: a
sweep retirement deducts the next year, the exit in the exit year. Every edit asserted to apply
exactly once."""
import sys

src, dst = sys.argv[1], sys.argv[2]
s = open(src).read()


def rep(old, new):
    global s
    assert s.count(old) == 1, (old[:80], s.count(old))
    s = s.replace(old, new)


rep("""              (book that year, tax deduction NEXT year); everything left is written off at exit
              (deductible in the exit year).""",
    """              (book that year, tax deduction NEXT year); everything left is written off at exit
              (deductible in the exit year). The OID part of either is repurchase premium —
              interest, inside the §163(j) cap; the fee part is deducted in full.""")
rep("""    put_row('deferred_wo', 'write-off deductible this year (prior-year retirements)', {t: ('=0' if t == 1 else f"={C('wo_book',t-1)}") for t in yrs})""",
    """    put_row('deferred_oid', 'OID written off by prior-year retirements (interest, capped)', {t: ('=0' if t == 1 else f"={C('wo_book_oid',t-1)}") for t in yrs})
    put_row('deferred_wo', 'fees written off by prior-year retirements (deducted in full)', {t: ('=0' if t == 1 else f"={C('wo_book',t-1)}-{C('wo_book_oid',t-1)}") for t in yrs})""")
rep("""    put_row('exit_wo', 'exit-year write-off (deductible now)', {t: ('=0' if t < N else '=' + '+'.join(C(f'{i}_{k}_after', t) for i, k in [('a','fee'),('a','oid'),('b','fee'),('b','oid'),('p','fee'),('r','fee')])) for t in yrs})""",
    """    put_row('exit_oid', 'exit-year OID write-off (interest, capped)', {t: ('=0' if t < N else '=' + '+'.join(C(f'{i}_oid_after', t) for i in ['a', 'b'])) for t in yrs})
    put_row('exit_wo', 'exit-year fee write-off (deducted in full)', {t: ('=0' if t < N else '=' + '+'.join(C(f'{i}_fee_after', t) for i in ['a', 'b', 'p', 'r'])) for t in yrs})""")
rep("""+{C('a_oid_am',t)}+{C('b_oid_am',t)}") for t in yrs})""",
    """+{C('a_oid_am',t)}+{C('b_oid_am',t)}+{C('deferred_oid',t)}+{C('exit_oid',t)}") for t in yrs})""")
rep("""        f"=IF({C('a_retired',t)},{C('a_fee_after',t)}+{C('a_oid_after',t)},0)+IF({C('b_retired',t)},{C('b_fee_after',t)}+{C('b_oid_after',t)},0)") for t in yrs})""",
    """        f"=IF({C('a_retired',t)},{C('a_fee_after',t)}+{C('a_oid_after',t)},0)+IF({C('b_retired',t)},{C('b_fee_after',t)}+{C('b_oid_after',t)},0)") for t in yrs})
    put_row('wo_book_oid', '   of which OID', {t: ('=0' if t == N else
        f"=IF({C('a_retired',t)},{C('a_oid_after',t)},0)+IF({C('b_retired',t)},{C('b_oid_after',t)},0)") for t in yrs})""")
open(dst, 'w').write(s)
print('v5 generator written')
