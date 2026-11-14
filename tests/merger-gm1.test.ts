/**
 * Golden GM1 (SPEC §29.9): the merger model reproduces the reference M&A workbook cell by cell,
 * through ordinary assumption settings, and sizes the debt to the leverage cap exactly.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runMerger, sizeDebtToCap } from '../lib/engine2/merger/facade';
import { MERGER_BLOCKS, type MergerBlock, type MergerOutput, type MergerYear } from '../lib/engine2/merger/types';
import { GM1_ASSUMPTIONS, GM1_FACTS } from './fixtures/merger-gm1';

type Expected = { deal: Record<string, number>; rows: Record<string, Record<MergerBlock, (number | null)[]>> };
const expected = JSON.parse(readFileSync(join(__dirname, 'goldens/GM1/expected.json'), 'utf8')) as Expected;

/** Workbook row → engine value. Signs as in the workbook. */
function engineValue(o: MergerOutput, line: string, b: MergerBlock, t: number): number | null {
  const r = o.blocks[b][t];
  switch (line) {
    case 'cf_ebitda': return r.ebitda;
    case 'cf_net_interest': return r.net_interest;
    case 'tax_paid': return r.tax;
    case 'minus_cash': return -r.cash_in_net_debt;
    case 'cash_check': return b === 'combined' ? o.checks.combined_cash[t] : b === 'sum' ? r.cash_end - o.blocks.acquirer[t].cash_end - o.blocks.target[t].cash_end : null;
    case 'accretion': return b === 'combined' ? o.eps.accretion[t] : null;
    case 'payout': return b === 'impact' ? (t === 0 ? null : o.assumptions.combined_dividends.ratio[t - 1]) : r.payout;
    case 'dps': return b === 'impact' ? o.dps.uplift[t] : r.dps;
    default: return r[line as keyof MergerYear] as number | null;
  }
}

const close = (got: number | null, want: number, where: string) => {
  expect(got, where).not.toBeNull();
  expect(Math.abs((got as number) - want), `${where}: engine ${got}, workbook ${want}`).toBeLessThan(1e-6 * Math.max(1, Math.abs(want)));
};

describe('GM1: the reference workbook, with the debt fixed at its 7,759', () => {
  const o = runMerger(GM1_FACTS, GM1_ASSUMPTIONS);

  it('sources and uses, mix and dilution', () => {
    for (const [k, want] of Object.entries(expected.deal)) {
      const got = k === 'leverage_test' ? o.leverage.cap!.actual : (o.deal as unknown as Record<string, number>)[k];
      close(got, want, `deal.${k}`);
    }
  });

  it('every populated cell of the P&L, cash flow and debt blocks', () => {
    let compared = 0;
    for (const [line, blocks] of Object.entries(expected.rows)) {
      for (const b of MERGER_BLOCKS) {
        blocks[b].forEach((want, t) => {
          if (want === null) return;
          close(engineValue(o, line, b, t), want, `${line} / ${b} / year ${t}`);
          compared++;
        });
      }
    }
    expect(compared).toBeGreaterThan(700);
  });
});

describe('GM1: the leverage cap sizes the debt', () => {
  const solved = runMerger(GM1_FACTS, { ...GM1_ASSUMPTIONS, funding: { ...GM1_ASSUMPTIONS.funding, acquisition_debt: { amount: null, rate: 0.04 }, solve: 'max_debt_at_cap' } });

  it('lands exactly on 3.0x in 2025E; the workbook\'s 7,759 is this root rounded', () => {
    expect(solved.leverage.solve!.binding).toBe(true);
    expect(Math.abs(solved.leverage.cap!.actual! - 3)).toBeLessThan(1e-9);
    expect(Math.abs(solved.deal.debt_issued - 7759.0648)).toBeLessThan(1e-4);
    expect(Math.round(solved.deal.debt_issued)).toBe(expected.deal.debt_issued);
  });

  it('leverage is linear in the debt for GM1, so the bisection root equals the closed form', () => {
    const lev = (d: number) => runMerger(GM1_FACTS, { ...GM1_ASSUMPTIONS, funding: { ...GM1_ASSUMPTIONS.funding, acquisition_debt: { amount: d, rate: 0.04 } } }).leverage.cap!.actual!;
    const l0 = lev(0);
    const l1 = lev(8000);
    const closedForm = (3 - l0) / ((l1 - l0) / 8000);
    expect(Math.abs(closedForm - solved.deal.debt_issued)).toBeLessThan(1e-6);
    expect(Math.abs(lev(4000) - (l0 + (l1 - l0) / 2))).toBeLessThan(1e-9);
  });

  it('the solve is a pure function of its inputs', () => {
    expect(sizeDebtToCap(GM1_FACTS, solved.assumptions)).toEqual(solved.leverage.solve);
  });
});
