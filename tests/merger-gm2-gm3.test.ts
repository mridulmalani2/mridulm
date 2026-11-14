/**
 * Goldens GM2 and GM3 (SPEC §29.20): the engine against an independent, SPEC-literal Python
 * derivation (`scripts/goldens/merger_calc.py`) of the same inputs, line by line.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runMerger } from '../lib/engine2/merger/facade';
import { ADDITIVE_LINES, MERGER_BLOCKS, type MergerAssumptions, type MergerFacts } from '../lib/engine2/merger/types';

type Num = number | null;
interface Expected {
  deal: Record<string, number>;
  rows: Record<string, Record<string, number[]>>;
  ratios: Record<string, Record<string, Num[]>>;
  eps: Record<string, Num[]> & { year1_full_year: { combined: number; accretion: Num } | null };
  ppa_schedule: Record<string, number>[] | null;
  balance_sheet: Record<string, number>[] | null;
  tranches: Record<string, number>[][];
}

const load = (gm: string) => {
  const dir = join(__dirname, 'goldens', gm);
  const inputs = JSON.parse(readFileSync(join(dir, 'inputs.json'), 'utf8')) as { facts: MergerFacts; assumptions: MergerAssumptions };
  const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')) as Expected;
  return { ...inputs, expected };
};

const close = (got: Num | undefined, want: Num, where: string) => {
  if (want === null) {
    expect(got ?? null, where).toBeNull();
    return;
  }
  expect(got, where).not.toBeNull();
  expect(Math.abs((got as number) - want), `${where}: engine ${got}, golden ${want}`).toBeLessThan(1e-6 * Math.max(1, Math.abs(want)));
};

describe.each(['GM2', 'GM3'])('%s against the independent derivation', (gm) => {
  const { facts, assumptions, expected } = load(gm);
  const o = runMerger(facts, assumptions);

  it('price, sources and uses, ownership and purchase accounting', () => {
    const d = o.deal as unknown as Record<string, number>;
    for (const [k, want] of Object.entries(expected.deal)) {
      let got: number | null | undefined;
      if (k.startsWith('ownership_')) got = o.deal.ownership[k.slice(10) as keyof typeof o.deal.ownership];
      else if (k.startsWith('tranche_')) got = o.deal.tranche_amounts[Number(k.slice(8))];
      else if (k === 'goodwill' || k === 'adjusted_net_assets' || k === 'new_dtl') got = o.ppa?.[k];
      else got = d[k];
      close(got, want, `deal.${k}`);
    }
  });

  it('every additive line of every block, every year', () => {
    let n = 0;
    for (const k of ADDITIVE_LINES) for (const b of MERGER_BLOCKS) expected.rows[k][b].forEach((want, t) => { close(o.blocks[b][t][k], want, `${k}/${b}/${t}`); n++; });
    expect(n).toBe(ADDITIVE_LINES.length * 5 * (assumptions.horizon_years + 1));
  });

  it('in-block ratios', () => {
    for (const [k, byBlock] of Object.entries(expected.ratios)) for (const b of MERGER_BLOCKS) byBlock[b].forEach((want, t) => close(o.blocks[b][t][k as 'eps'], want, `${k}/${b}/${t}`));
  });

  it('EPS, adjusted EPS, break-even synergies and the full-year view', () => {
    for (const k of ['accretion', 'combined_adjusted', 'accretion_adjusted', 'breakeven_synergies', 'extra_synergies_needed', 'breakeven_pct_target_costs'] as const) {
      expected.eps[k].forEach((want, t) => close(o.eps[k][t], want, `eps.${k}/${t}`));
    }
    const y1 = expected.eps.year1_full_year;
    if (y1 === null) expect(o.eps.year1_full_year).toBeNull();
    else {
      close(o.eps.year1_full_year!.combined, y1.combined, 'year1 full combined');
      close(o.eps.year1_full_year!.accretion, y1.accretion, 'year1 full accretion');
    }
  });

  it('purchase accounting schedule, debt schedule and the balance sheet', () => {
    expected.ppa_schedule!.forEach((y, t) => { for (const [k, want] of Object.entries(y)) close(o.ppa!.schedule[t][k as 'deferred_tax'], want, `ppa.${k}/${t}`); });
    expected.tranches.forEach((ys, i) => ys.forEach((y, t) => { for (const [k, want] of Object.entries(y)) close(o.debt.tranches[i][t][k as 'end'], want, `tranche ${i}.${k}/${t}`); }));
    expected.balance_sheet!.forEach((y, t) => { for (const [k, want] of Object.entries(y)) close(o.balance_sheet![t][k as 'cash'], want, `bs.${k}/${t}`); });
  });
});

describe('the goldens exercise what they are for', () => {
  it('GM2: the sweep runs, the close is part-way, options are in and out of the money', () => {
    const { facts, assumptions } = load('GM2');
    const o = runMerger(facts, assumptions);
    expect(o.debt.tranches[1].slice(1).some((y) => y.sweep > 0)).toBe(true);
    expect(o.eps.year1_full_year).not.toBeNull();
    expect(o.deal.diluted_target_shares! - facts.target.shares!).toBeGreaterThan(2); // RSUs plus the in-the-money options only
    expect(o.ppa!.goodwill).toBeGreaterThan(0);
  });
  it('GM3: asset purchase builds a deferred tax liability; a bargain is not hidden; reported dilution noted', () => {
    const { facts, assumptions } = load('GM3');
    const o = runMerger(facts, assumptions);
    expect(o.ppa!.schedule.slice(1).every((s) => s.deferred_tax > 0)).toBe(true);
    expect(o.blocks.target.slice(1).every((r) => r.pbt < 0)).toBe(true);
    expect(o.flags.map((f) => f.code)).toContain('dilution_from_reported_increment');
    expect(o.debt.tranches[0].slice(1).some((y) => y.sweep > 0)).toBe(true);
  });
});
