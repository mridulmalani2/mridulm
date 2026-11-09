/**
 * SPEC §3.8 [v2.1.0] — the surplus-cash distribution policy against an EXTERNAL reference:
 * section 9 of the Corporate Finance 2 "LBO and FTE" worked example ("Leverage buys IRR — the
 * same deal at five debt levels"; interest held at 7%; once the debt is repaid, surplus cash
 * is paid to equity). Expected values are the reference workbook's own cells as recalculated
 * by LibreOffice (tests/goldens/G12PROF/expected.json → leverage_table; provenance in
 * scripts/goldens/extract_g12prof.py) — never produced by this codebase. The non-live rows are
 * typed in the reference to 3–6 decimals, so each is held to half a unit of its last digit.
 */
import { describe, expect, it } from 'vitest';
import { runModel } from '../lib/engine2/facade';
import type { DealAssumptions } from '../lib/engine2/types';
import expected from './goldens/G12PROF/expected.json';
import { G12_ASSUMPTIONS, G12_FACTS } from './fixtures/g12-prof';

type Start = 'immediately' | 'after_debt_repaid';

function atDebt(debt: number, surplus: { payout_pct: number; start: Start } | null): DealAssumptions {
  const tranche = G12_ASSUMPTIONS.structure.tranches[0];
  return {
    ...G12_ASSUMPTIONS,
    structure: {
      ...G12_ASSUMPTIONS.structure,
      tranches: debt > 0 ? [{ ...tranche, size: { amount: debt } } as typeof tranche] : [],
      surplus_distribution: surplus,
    },
  };
}

/** Half a unit in the last typed decimal place (the live $900m row is full precision). */
function tolOf(x: number): number {
  const s = String(x);
  const d = s.includes('.') ? s.split('.')[1].length : 0;
  return d >= 12 ? 1e-9 : 0.5 * 10 ** -d + 1e-12;
}

const rows = expected.leverage_table;

describe('G12 leverage table — the surplus-cash policy reproduces the reference at every debt level', () => {
  for (const start of ['immediately', 'after_debt_repaid'] as const) {
    for (const r of rows) {
      it(`$${r.debt}m of debt (surplus paid out ${start === 'immediately' ? 'every year' : 'once the debt is repaid'})`, () => {
        const o = runModel(G12_FACTS, atDebt(r.debt, { payout_pct: 1, start }));
        const v = o.valuation!;
        const check = (got: number | null | undefined, want: number, what: string) => {
          expect(got, what).not.toBeNull();
          expect(Math.abs((got as number) - want), `${what}: ${got} vs ${want}`).toBeLessThanOrEqual(tolOf(want));
        };
        check(o.sources_uses.sponsor_equity, r.sponsor_equity, 'sponsor equity');
        check(v.assumed.equity_irr, r.irr_a, 'IRR, exit (a)');
        check(v.fundamentals!.equity_irr, r.irr_b, 'IRR, exit (b)');
        check(v.fundamentals!.required_return, r.required_b, 'required return, exit (b)');
        check(v.fundamentals!.npv, r.npv_b, 'NPV, exit (b)');
      });
    }
  }

  it('the policy is what moves the all-equity row: with cash retained instead, IRR (a) does NOT match', () => {
    const o = runModel(G12_FACTS, atDebt(0, null));
    const r = rows.find((x) => x.debt === 0)!;
    expect(Math.abs(o.valuation!.assumed.equity_irr! - r.irr_a)).toBeGreaterThan(5e-3); // 7.91% vs 8.83%
  });

  it('the paths are the ones the reference describes: all-equity pays out every year, $300m repays in year 5 and pays the rest, $600m+ never repays', () => {
    const paid = (d: number) => runModel(G12_FACTS, atDebt(d, { payout_pct: 1, start: 'immediately' })).waterfall.map((w) => w.distribution_paid);
    expect(paid(0).every((p) => p > 0)).toBe(true);
    const p300 = paid(300);
    expect(p300.slice(0, 4).every((p) => p === 0)).toBe(true);
    expect(p300[4]).toBeGreaterThan(0);
    expect(paid(600).every((p) => p === 0)).toBe(true);
    expect(paid(900).every((p) => p === 0)).toBe(true);
  });
});
