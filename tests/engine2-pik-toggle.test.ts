/**
 * §20 PIK toggle [v1.5.0] — the C-gate (engine ≡ the adjudicated G8-PIKT gospel) plus the
 * §20.10 golden-uncovered branches as DIRECTED fixtures and the §14.21 invariants.
 *
 * MUTANTS (each run RED via string-replace, then reverted — named in comments):
 * (M-a) 'cash' years ALSO accruing (the both-legs mutant — collapses the toggle back to the
 *   fixed note) reds the C-gate + fixture (i);
 * (M-b) elections read at the WRONG year offset (`el[yearIndex + 1]`/`el[0]`) reds the C-gate
 *   (the schedule [pik,pik,cash,cash,pik] is asymmetric, so any shift moves the balance path);
 * (M-c) 'pik' years paying cash_coupon as well reds the C-gate + fixture (i);
 * (M-d) the ahydo_shape maturity boundary `> 5` → `>= 5` reds fixture (v)'s negative leg;
 * (M-e) the §20.2 pik_coupon ≥ cash_coupon gate dropped reds fixture (iii).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runModel } from '../lib/engine2/facade';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';
import type { DealAssumptions, PikNoteAssumption } from '../lib/engine2/types';

const ROOT = join(__dirname, '..');
const g8fix = JSON.parse(readFileSync(join(ROOT, 'tests/goldens/G8PIKT/expected.json'), 'utf8'));

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const sum = (a: number[]) => { let s = 0; for (const x of a) s += x; return s; };

/** G8-PIKT with the note's §20 fields overridden (and optional assumption-level mutation). */
function withNote(over: Partial<PikNoteAssumption>, mutate?: (a: DealAssumptions) => void) {
  const d = clone(GOLDEN_DEALS.G8PIKT);
  d.assumptions.structure.tranches = d.assumptions.structure.tranches.map((t) =>
    t.type === 'pik_note' ? { ...t, ...over } : t,
  );
  mutate?.(d.assumptions);
  return d;
}
const noteRows = (o: ReturnType<typeof runModel>) => {
  const i = o.assumptions.structure.tranches.filter((t) => t.type !== 'revolver').findIndex((t) => t.type === 'pik_note');
  return o.tranches[i];
};

describe('C-gate: the engine reproduces the adjudicated G8-PIKT gospel', () => {
  const { facts, assumptions } = GOLDEN_DEALS.G8PIKT;
  const o = runModel(facts, assumptions);

  it('the note schedule matches the fixture row for row (§20.3 semantics, r2 display bar)', () => {
    const rows = noteRows(o);
    const fx = g8fix.tranches['PIK Note'];
    expect(rows.length).toBe(fx.length);
    rows.forEach((r, i) => {
      expect(r.beginning_balance, `beg[${i}]`).toBeCloseTo(fx[i].beginning_balance, 2);
      expect(r.cash_interest, `cash[${i}]`).toBeCloseTo(fx[i].cash_interest, 2);
      expect(r.pik_accrual, `pik[${i}]`).toBeCloseTo(fx[i].pik_accrual, 2);
      expect(r.ending_balance, `end[${i}]`).toBeCloseTo(fx[i].ending_balance, 2);
    });
  });

  it('the whole deal matches: exit payoff, MIP, and all three return streams', () => {
    expect(o.exit.debt_payoff_at_par_plus_pik).toBeCloseTo(g8fix.exit.debt_payoff_at_par_plus_pik, 2);
    expect(o.exit.mip_payout).toBeCloseTo(g8fix.exit.mip_payout, 2);
    expect(o.exit.sponsor_share).toBeCloseTo(g8fix.exit.sponsor_share, 2);
    expect(o.returns.sponsor_net.irr!).toBeCloseTo(g8fix.returns.sponsor_net.irr, 6);
    expect(o.returns.sponsor_net.moic).toBeCloseTo(g8fix.returns.sponsor_net.moic, 4);
    expect(o.returns.pre_promote.irr!).toBeCloseTo(g8fix.returns.pre_promote.irr, 6);
    expect(o.returns.unlevered.irr!).toBeCloseTo(g8fix.returns.unlevered.irr, 6);
  });

  it('§20.6(d): the capped pool flips legs by election — accrual in pik years, note cash in cash years', () => {
    o.tax.forEach((y, i) => expect(y.capped_interest_pool, `pool[${i}]`).toBeCloseTo(g8fix.tax[i].capped_interest_pool, 2));
    // and the §163(j) carryforward path is the adjudicated NON-monotone one (peaks Y3)
    const cf = o.tax.map((y) => y.s163j_carryforward_end);
    cf.forEach((v, i) => expect(v, `cf[${i}]`).toBeCloseTo(g8fix.tax[i].s163j_carryforward_end, 2));
    expect(cf[2]).toBeGreaterThan(cf[1]); // builds through the accrual years + Y3
    expect(cf[3]).toBeLessThan(cf[2]);    // RELEASES in the cash-election years
    expect(cf[4]).toBeLessThan(cf[3]);
    expect(cf[4]).toBeGreaterThan(0);     // never fully releases
  });
});

describe('§20.10 directed fixtures — the golden-uncovered branches', () => {
  it('(i) all-cash elections: the note behaves as a bullet cash tranche (accrual identically 0, payoff = par)', () => {
    const d = withNote({ elections: ['cash', 'cash', 'cash', 'cash', 'cash'] });
    const o = runModel(d.facts, d.assumptions);
    const rows = noteRows(o);
    expect(sum(rows.map((r) => r.pik_accrual))).toBe(0);
    rows.forEach((r) => {
      expect(r.beginning_balance).toBeCloseTo(135, 9); // balance never moves (no amort, no sweep)
      expect(r.cash_interest).toBeCloseTo(135 * 0.09, 9);
    });
    expect(rows[rows.length - 1].ending_balance).toBeCloseTo(135, 9); // payoff at PAR
  });

  it('(ii) all-pik at rate r ≡ the FIXED cash-0 note at the SAME r; a cash leg > 0 BREAKS it (the both-legs discriminator)', () => {
    const toggled = withNote({ elections: ['pik', 'pik', 'pik', 'pik', 'pik'] });
    const fixedCash0 = withNote({ elections: null, cash_coupon: 0 });
    const a = runModel(toggled.facts, toggled.assumptions);
    const b = runModel(fixedCash0.facts, fixedCash0.assumptions);
    // every COMPUTED output coincides (the assumption echoes differ by construction — §20.10(ii))
    for (const k of Object.keys(a) as (keyof typeof a)[]) {
      if (k === 'assumptions' || k === 'coherence') continue;
      expect(a[k], `output.${String(k)}`).toEqual(b[k]);
    }
    // G3's shape: 135 × 1.12^5 = 237.9161 (the §17 check value), reached by BOTH routes
    expect(noteRows(a)[4].ending_balance).toBeCloseTo(237.9161, 3);
    // ...and the FIXED note with a live cash leg is a DIFFERENT instrument (both legs run)
    const fixedBoth = withNote({ elections: null, cash_coupon: 0.09 });
    const c = runModel(fixedBoth.facts, fixedBoth.assumptions);
    const cr = noteRows(c);
    expect(cr[0].cash_interest).toBeCloseTo(135 * 0.09, 9); // pays AND accrues in the same year
    expect(cr[0].pik_accrual).toBeCloseTo(135 * 0.12, 9);
    expect(c.returns.sponsor_net.irr).not.toBeCloseTo(a.returns.sponsor_net.irr!, 6);
  });

  it('(iii) the FOUR §16/§20.2 rejections throw (length, union, cash_coupon ≤ 0, pik < cash)', () => {
    const bad = (over: Partial<PikNoteAssumption>) => {
      const d = withNote(over);
      return () => runModel(d.facts, d.assumptions);
    };
    expect(bad({ elections: ['pik', 'pik', 'cash'] })).toThrow(/length 3 ≠ hold_years 5/);
    expect(bad({ elections: ['pik', 'pik', 'cash', 'cash', 'BOTH' as unknown as 'pik'] })).toThrow(/must be 'cash' or 'pik'/);
    expect(bad({ cash_coupon: 0 })).toThrow(/cash_coupon must be > 0/);
    expect(bad({ cash_coupon: 0.15 })).toThrow(/pik_coupon 0.12 < cash_coupon 0.15/);
    // and the FIXED note is unaffected by all four (elections null ⇒ gates inert)
    const ok = withNote({ elections: null, cash_coupon: 0 });
    expect(() => runModel(ok.facts, ok.assumptions)).not.toThrow();
  });

  it('(iv) elections WITH mandatory amort: a cash year pays coupon + amort (balance DECREASES); a pik year accrues AND amortizes', () => {
    const d = withNote({ elections: ['pik', 'cash', 'pik', 'cash', 'pik'], amort_pct_of_face: 0.10 });
    const o = runModel(d.facts, d.assumptions);
    const rows = noteRows(o);
    const face = 135;
    const amort = 0.1 * face; // 13.5 of ORIGINAL face per year (§3.3), capped at outstanding
    // year 2 is a CASH year: coupon paid, no accrual, balance falls by the amort
    expect(rows[1].pik_accrual).toBe(0);
    expect(rows[1].cash_interest).toBeCloseTo(rows[1].beginning_balance * 0.09, 9);
    expect(rows[1].mandatory_amort).toBeCloseTo(amort, 9);
    expect(rows[1].ending_balance).toBeCloseTo(rows[1].beginning_balance - amort, 9);
    // year 3 is a PIK year: accrues AND amortizes in the same year (the §20.6(a) domain edge)
    expect(rows[2].cash_interest).toBe(0);
    expect(rows[2].pik_accrual).toBeCloseTo(rows[2].beginning_balance * 0.12, 9);
    expect(rows[2].mandatory_amort).toBeCloseTo(amort, 9);
    expect(rows[2].ending_balance).toBeCloseTo(rows[2].beginning_balance * 1.12 - amort, 9);
    // the §20.6(a) closed form NO LONGER holds with amort configured — it yields to the walk
    expect(rows[4].ending_balance).not.toBeCloseTo(135 * 1.12 ** 3, 2);
  });

  it('(v) ahydo_shape: fires on the toggle with any pik year AND on the FIXED accreting note; NOT on maturity 5 nor on an all-cash toggle', () => {
    const codes = (d: { facts: Parameters<typeof runModel>[0]; assumptions: DealAssumptions }) =>
      runModel(d.facts, d.assumptions).coherence.map((f) => f.code);
    // toggle with pik years, maturity 8 ⇒ fires
    expect(codes(GOLDEN_DEALS.G8PIKT)).toContain('ahydo_shape');
    // the FIXED accreting note (G3's own shape — elections null, pik 12%, maturity 8) ⇒ fires
    expect(codes(GOLDEN_DEALS.G3)).toContain('ahydo_shape');
    // all-cash toggle ⇒ NO accruing year ⇒ does NOT fire (even at maturity 8)
    expect(codes(withNote({ elections: ['cash', 'cash', 'cash', 'cash', 'cash'] }))).not.toContain('ahydo_shape');
    // maturity 5 ⇒ boundary is `> 5`, not `≥ 5` (§163(i)(1)). §16 forces maturity > hold, so
    // the negative leg needs hold ≤ 4 [round-1 M5] — shorten the hold with the schedule.
    const short = withNote({ maturity_years: 5, elections: ['pik', 'pik', 'cash', 'cash'] }, (a) => {
      a.entry = { ...a.entry, hold_years: 4 };
      a.operations = { ...a.operations, growth: a.operations.growth.slice(0, 4), growth_capex: a.operations.growth_capex.slice(0, 4) };
    });
    expect(codes(short)).not.toContain('ahydo_shape');
    // ...and one year longer DOES fire, pinning the boundary from both sides
    const long = withNote({ maturity_years: 6, elections: ['pik', 'pik', 'cash', 'cash'] }, (a) => {
      a.entry = { ...a.entry, hold_years: 4 };
      a.operations = { ...a.operations, growth: a.operations.growth.slice(0, 4), growth_capex: a.operations.growth_capex.slice(0, 4) };
    });
    expect(codes(long)).toContain('ahydo_shape');
  });

  it('(vi) §163(j) pool composition flips with the legs — the wrong-leg mutant moves cash tax', () => {
    // Same deal, two election patterns that differ ONLY in year 3 (pik vs cash). The pool
    // composition changes, and because the cap BINDS the deductible is the same — so the
    // discriminator is the POOL and the carryforward, exactly what §20.6(d) pins.
    const asPik = withNote({ elections: ['pik', 'pik', 'pik', 'cash', 'pik'] });
    const asCash = withNote({ elections: ['pik', 'pik', 'cash', 'cash', 'pik'] });
    const a = runModel(asPik.facts, asPik.assumptions);
    const b = runModel(asCash.facts, asCash.assumptions);
    expect(a.tax[2].capped_interest_pool).toBeGreaterThan(b.tax[2].capped_interest_pool);
    expect(a.tax[2].s163j_carryforward_end).toBeGreaterThan(b.tax[2].s163j_carryforward_end);
    // the note's own contribution swaps legs entirely
    expect(noteRows(a)[2].pik_accrual).toBeGreaterThan(0);
    expect(noteRows(a)[2].cash_interest).toBe(0);
    expect(noteRows(b)[2].cash_interest).toBeGreaterThan(0);
    expect(noteRows(b)[2].pik_accrual).toBe(0);
    // and the cash leg really is cash: the year-3 waterfall interest differs
    expect(b.waterfall[2].cash_interest_total).toBeGreaterThan(a.waterfall[2].cash_interest_total);
  });

  it('(vii) elections ∧ sweep participation: the balance DECREASES through accrual years (the closed form yields to the walk)', () => {
    // The note must be the sweep TARGET to exercise this: G3's senior (priority 1) absorbs the
    // whole pool every year, so a priority-2 note would never see a dollar. Turn the senior's
    // participation off and give the note priority 1.
    const d = withNote({ elections: ['pik', 'pik', 'pik', 'pik', 'pik'], sweep: { participates: true, priority: 1 } }, (a) => {
      a.structure = {
        ...a.structure,
        tranches: a.structure.tranches.map((t) =>
          t.type === 'pik_note' ? t : { ...t, sweep: { participates: false, priority: 1 } },
        ),
      };
    });
    const o = runModel(d.facts, d.assumptions);
    const rows = noteRows(o);
    const swept = sum(rows.map((r) => r.sweep_repayment));
    expect(swept).toBeGreaterThan(0); // the note now takes sweep cash
    // all-pik with sweep ends BELOW the no-sweep closed form 135 × 1.12^5
    expect(rows[4].ending_balance).toBeLessThan(135 * 1.12 ** 5);
    // §20.6(a)'s domain excludes this configuration — the walk governs, and the accrual
    // itself still follows §20.3 exactly (12% of each year's BEGINNING balance).
    rows.forEach((r) => expect(r.pik_accrual).toBeCloseTo(r.beginning_balance * 0.12, 9));
  });
});

describe('§14.21 invariants on live toggles', () => {
  const cases: [string, DealAssumptions][] = [
    ['G8-PIKT (mixed)', GOLDEN_DEALS.G8PIKT.assumptions],
    ['all-cash', withNote({ elections: ['cash', 'cash', 'cash', 'cash', 'cash'] }).assumptions],
    ['all-pik', withNote({ elections: ['pik', 'pik', 'pik', 'pik', 'pik'] }).assumptions],
  ];
  for (const [name, assumptions] of cases) {
    it(`${name}: the closed form, the cash-interest identity, and the pool composition all hold`, () => {
      const o = runModel(GOLDEN_DEALS.G8PIKT.facts, assumptions);
      const note = assumptions.structure.tranches.find((t): t is PikNoteAssumption => t.type === 'pik_note')!;
      const el = note.elections!;
      const rows = noteRows(o);
      // (a) closed form — domain: amort 0 ∧ sweep off, both true on these cases
      let b = 135;
      el.forEach((e, i) => {
        expect(rows[i].beginning_balance, `beg[${i}]`).toBeCloseTo(b, 9);
        if (e === 'pik') b *= 1 + note.pik_coupon;
      });
      expect(rows[4].ending_balance).toBeCloseTo(b, 9);
      // (b) cash-interest identity
      rows.forEach((r, i) => {
        expect(r.cash_interest, `cash[${i}]`).toBeCloseTo(el[i] === 'cash' ? r.beginning_balance * note.cash_coupon : 0, 9);
        expect(r.pik_accrual, `pik[${i}]`).toBeCloseTo(el[i] === 'pik' ? r.beginning_balance * note.pik_coupon : 0, 9);
      });
      // (d) pool composition: the note contributes exactly ONE leg per year
      o.tax.forEach((y, i) => {
        const contribution = rows[i].cash_interest + rows[i].pik_accrual;
        expect(y.capped_interest_pool).toBeGreaterThanOrEqual(contribution);
        expect(rows[i].cash_interest === 0 || rows[i].pik_accrual === 0).toBe(true); // never both
      });
      // (e) the flag is structural: maturity 8 ∧ any accruing year
      const fires = o.coherence.some((f) => f.code === 'ahydo_shape');
      expect(fires).toBe(el.some((e) => e === 'pik'));
    });
  }
});
