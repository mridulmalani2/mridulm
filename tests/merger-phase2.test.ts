/**
 * Merger model Phase 2 (SPEC §29.10 to §29.21): invariants 8 to 14 over GM2, GM3 and variants that
 * stress them, the treasury stock method and price solves, and the new Build rejections.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runMerger } from '../lib/engine2/merger/facade';
import { dilutedShares, priceTarget } from '../lib/engine2/merger/consideration';
import { ADDITIVE_LINES, type MergerAssumptions, type MergerFacts, type MergerOutput, type StandaloneForecast } from '../lib/engine2/merger/types';
import { GM1_ASSUMPTIONS, GM1_FACTS } from './fixtures/merger-gm1';

const load = (gm: string) => JSON.parse(readFileSync(join(__dirname, 'goldens', gm, 'inputs.json'), 'utf8')) as { facts: MergerFacts; assumptions: MergerAssumptions };
const GM2 = load('GM2');
const GM3 = load('GM3');
const vary = (base: { facts: MergerFacts; assumptions: MergerAssumptions }, patch: (f: MergerFacts, a: MergerAssumptions) => void) => {
  const f = structuredClone(base.facts);
  const a = structuredClone(base.assumptions);
  patch(f, a);
  return { facts: f, assumptions: a };
};

/** Stretch a deal to a 10-year horizon by holding each forecast's last year. */
function tenYears(base: { facts: MergerFacts; assumptions: MergerAssumptions }) {
  return vary(base, (_f, a) => {
    const hold = (x: number[], len: number) => [...x, ...Array(len - x.length).fill(x[x.length - 1])];
    const n = a.horizon_years;
    for (const s of [a.standalone.acquirer, a.standalone.target]) {
      for (const k of Object.keys(s) as (keyof StandaloneForecast)[]) if (k !== 'tax_rate') (s[k] as number[]) = hold(s[k] as number[], 10);
    }
    a.horizon_years = 10;
    for (const t of a.funding.tranches) t.repayment = hold(t.repayment, 10);
    a.synergies.phasing = hold(a.synergies.phasing, 11);
    if (a.synergies.revenue) a.synergies.revenue.phasing = hold(a.synergies.revenue.phasing, 11);
    if (a.synergies.cost_to_achieve) a.synergies.cost_to_achieve = hold(a.synergies.cost_to_achieve, 10).map((x, i) => (i < n ? x : 0));
    if (a.synergies.dis_synergies) a.synergies.dis_synergies = hold(a.synergies.dis_synergies, 11);
    a.combined_dividends.ratio = hold(a.combined_dividends.ratio, 10);
  });
}

const variants: [string, MergerFacts, MergerAssumptions][] = [
  ['GM2', GM2.facts, GM2.assumptions],
  ['GM3', GM3.facts, GM3.assumptions],
  ['GM2 at a full first year', ...Object.values(vary(GM2, (_f, a) => { a.timing.fraction_of_year_1 = 1; }))] as [string, MergerFacts, MergerAssumptions],
  ['GM2 with target debt assumed and a fair value uplift', ...Object.values(vary(GM2, (_f, a) => {
    a.target_debt = 'assume_all'; a.ppa!.debt_fair_value_adjustment = 60; a.ppa!.debt_fv_years = 3;
    a.funding.acquirer_cash_used = 0; a.funding.tranches[1].amount = 400;
  }))] as [string, MergerFacts, MergerAssumptions],
  ['GM3 as a stock purchase, goodwill kept, fee deductible', ...Object.values(vary(GM3, (_f, a) => {
    a.ppa!.structure = 'stock_purchase'; a.ppa!.writeoff_existing_goodwill = false; a.fees.advisory.tax_deductible = true;
  }))] as [string, MergerFacts, MergerAssumptions],
  ['GM2 with other debt-like items in net debt', ...Object.values(vary(GM2, (f) => { f.target.net_debt = 1350; }))] as [string, MergerFacts, MergerAssumptions],
  ['GM3 with a binding cash floor on the sweep', ...Object.values(vary(GM3, (_f, a) => { a.sweep = { pct: 1, min_cash: 1500 }; }))] as [string, MergerFacts, MergerAssumptions],
  ['GM2 over ten years', ...Object.values(tenYears(GM2))] as [string, MergerFacts, MergerAssumptions],
  ['GM3 over ten years', ...Object.values(tenYears(GM3))] as [string, MergerFacts, MergerAssumptions],
];

describe.each(variants)('%s', (_name, facts, a) => {
  const o: MergerOutput = runMerger(facts, a);
  const n = a.horizon_years;

  it('sources equal uses; the five-block law holds on every additive line', () => {
    expect(Math.abs(o.checks.sources_minus_uses)).toBeLessThan(0.005);
    for (const k of ADDITIVE_LINES) o.blocks.combined.forEach((r, t) => {
      expect(Math.abs(o.blocks.sum[t][k] - o.blocks.acquirer[t][k] - o.blocks.target[t][k]), `sum ${k} ${t}`).toBeLessThan(1e-9);
      expect(Math.abs(r[k] - o.blocks.sum[t][k] - o.blocks.impact[t][k]), `combined ${k} ${t}`).toBeLessThan(1e-9);
    });
  });

  it('8. the opening and every forecast balance sheet balance; cash and debt agree with the combined block', () => {
    const bs = o.balance_sheet!;
    const open = o.ppa!.opening;
    expect(Math.abs(open.adjustments.total_assets - open.adjustments.total_liabilities_and_equity)).toBeLessThan(0.005);
    bs.forEach((b, t) => expect(Math.abs(b.total_assets - b.total_liabilities_and_equity), `year ${t}`).toBeLessThan(0.005));
    for (let t = 1; t <= n; t++) {
      expect(Math.abs(bs[t].cash - o.blocks.combined[t].cash_end), `cash ${t}`).toBeLessThan(1e-6);
      expect(Math.abs(bs[t].debt - o.blocks.combined[t].total_debt), `debt ${t}`).toBeLessThan(1e-6);
    }
    // every block's year 1 opens from the closing balance sheet
    expect(Math.abs(o.blocks.combined[1].cash_begin - bs[0].cash)).toBeLessThan(1e-9);
  });

  it('9. goodwill = equity value less the adjusted net identifiable assets, recomputed here', () => {
    const p = a.ppa!;
    const tb = facts.target.balance!;
    const stock = p.structure === 'stock_purchase';
    const I = p.intangibles.reduce((s, x) => s + x.amount, 0);
    const dtl = stock ? a.adjustments_tax_rate * (p.ppe_writeup + I - p.debt_fair_value_adjustment) : 0;
    const ania = tb.equity_parent - (p.writeoff_existing_goodwill ? tb.goodwill : 0) + p.ppe_writeup + I - p.debt_fair_value_adjustment - dtl + (stock ? 0 : tb.deferred_tax_liability);
    expect(Math.abs(o.ppa!.goodwill - (o.deal.equity_value - ania))).toBeLessThan(1e-9);
  });

  it('10. step-ups never amortise past their amount; inside the horizon they amortise exactly', () => {
    const p = a.ppa!;
    const s = o.ppa!.schedule.slice(1);
    const dep = s.reduce((x, y) => x + y.writeup_depreciation, 0);
    expect(dep).toBeLessThanOrEqual(p.ppe_writeup + 1e-9);
    const span = n - 1 + a.timing.fraction_of_year_1; // years of time after the close
    if (p.ppe_life_years <= span) expect(Math.abs(dep - p.ppe_writeup)).toBeLessThan(1e-9);
    const finite = p.intangibles.filter((x) => x.life_years !== null);
    const am = s.reduce((x, y) => x + y.intangible_amortisation, 0);
    if (finite.every((x) => x.life_years! <= span)) expect(Math.abs(am - finite.reduce((x, y) => x + y.amount, 0))).toBeLessThan(1e-9);
    const fv = s.reduce((x, y) => x + y.fv_amortisation, 0);
    if (p.debt_fv_years <= span) expect(Math.abs(fv - p.debt_fair_value_adjustment)).toBeLessThan(1e-9);
    if (p.structure === 'stock_purchase' && p.ppe_life_years <= span && finite.every((x) => x.life_years! <= span) && p.debt_fv_years <= span) {
      // the DTL created on finite step-ups has fully unwound: what is left is the one on indefinite items
      const indefinite = p.intangibles.filter((x) => x.life_years === null).reduce((x, y) => x + y.amount, 0);
      const created = o.ppa!.new_dtl;
      const unwound = s.reduce((x, y) => x - y.deferred_tax, 0);
      expect(Math.abs(created - unwound - a.adjustments_tax_rate * indefinite)).toBeLessThan(1e-9);
    }
  });

  it('11. every tranche rolls: end = begin − scheduled − sweep, never negative, next begin = this end', () => {
    o.debt.tranches.forEach((ys, i) => ys.forEach((y, t) => {
      expect(Math.abs(y.end - (y.begin - y.scheduled - y.sweep))).toBeLessThan(1e-12);
      expect(y.end).toBeGreaterThanOrEqual(-1e-12);
      if (t >= 2) expect(y.begin).toBe(ys[t - 1].end);
      if (t === 1) expect(y.begin).toBe(o.deal.tranche_amounts[i]);
    }));
  });

  it('12. ownership sums to 1; combined shares = acquirer + new, weighted in a part-year 1', () => {
    const w = o.deal.ownership;
    expect(Math.abs(w.acquirer + w.target_holders + w.placing - 1)).toBeLessThan(1e-12);
    o.blocks.combined.forEach((r, t) => {
      const weight = t === 1 ? a.timing.fraction_of_year_1 : 1;
      expect(Math.abs(r.shares - facts.acquirer.shares! - weight * o.deal.new_shares)).toBeLessThan(1e-9);
    });
  });

  it('the sweep never takes combined cash below its floor', () => {
    if (!a.sweep) return;
    for (let t = 1; t <= n; t++) {
      if (o.debt.tranches.some((ys) => ys[t].sweep > 0)) expect(o.blocks.combined[t].cash_end).toBeGreaterThanOrEqual(a.sweep.min_cash - 1e-9);
    }
  });
});

describe('13 and 14: cash deals and the part-year close', () => {
  it('13. all cash, no placing: no new shares', () => {
    const o = runMerger(GM3.facts, GM3.assumptions);
    expect(o.deal.new_shares).toBe(0);
    expect(o.blocks.impact.every((r) => r.shares === 0)).toBe(true);
  });
  it('14. the full-year view of a part-year close equals the start-of-year run', () => {
    const part = runMerger(GM2.facts, GM2.assumptions);
    const full = runMerger(GM2.facts, { ...GM2.assumptions, timing: { fraction_of_year_1: 1 } });
    expect(part.eps.year1_full_year!.combined).toBe(full.eps.combined[1]);
    expect(part.eps.year1_full_year!.accretion).toBe(full.eps.accretion[1]);
    expect(full.eps.year1_full_year).toBeNull();
    // year 2 is a full year either way, and grows from the FULL year-1 revenue
    expect(Math.abs(part.blocks.target[2].revenue - full.blocks.target[2].revenue)).toBeLessThan(1e-9);
    expect(Math.abs(part.blocks.target[1].revenue - 0.75 * full.blocks.target[1].revenue)).toBeLessThan(1e-9);
  });
  it('a tranche repaid in full writes off the rest of its fee the next year', () => {
    const o = runMerger(GM3.facts, vary(GM3, (_f, a) => { a.funding.tranches[0].repayment = [10000, 0, 0]; a.sweep = null; }).assumptions);
    const ys = o.debt.tranches[0];
    expect(ys[1].end).toBe(0);
    const fee = GM3.assumptions.funding.tranches[0].fee_pct * o.deal.tranche_amounts[0];
    expect(Math.abs(ys[1].fee_amortisation + ys[2].fee_amortisation - fee)).toBeLessThan(1e-9);
    expect(ys[3].fee_amortisation).toBe(0);
  });
});

describe('adjusted EPS and break-even synergies (§29.18)', () => {
  const o = runMerger(GM2.facts, GM2.assumptions);
  it('booking exactly the break-even synergies makes accretion zero', () => {
    const a = GM2.assumptions;
    for (const t of [0, 2, 3]) {
      const extra = o.eps.breakeven_synergies[t]! - a.synergies.run_rate * a.synergies.phasing[t];
      const nig = o.blocks.combined[t].net_income_group + extra * (1 - a.adjustments_tax_rate);
      expect(Math.abs(nig / o.blocks.combined[t].shares - o.eps.acquirer[t]!)).toBeLessThan(1e-9);
      expect(o.eps.extra_synergies_needed[t]!).toBeCloseTo(Math.max(0, extra), 9);
    }
  });
  it('adjusted EPS is above reported when there is amortisation or a one-off', () => {
    for (let t = 1; t <= 3; t++) expect(o.eps.combined_adjusted[t]!).toBeGreaterThan(o.eps.combined[t]!);
  });
});

describe('price per share (§29.11)', () => {
  const t = structuredClone(GM2.facts.target);
  it('the treasury stock method counts only in-the-money options, at the offer price', () => {
    expect(dilutedShares(t, 24.3)).toBeCloseTo(200 + 10 * (1 - 12 / 24.3) + 2, 12);
    expect(dilutedShares(t, 30)).toBeCloseTo(200 + 10 * (1 - 12 / 30) + 6 * (1 - 25 / 30) + 2, 12);
    expect(dilutedShares(t, 10)).toBe(202);
  });
  it('the reported increment stands in when no option table is entered', () => {
    expect(dilutedShares({ ...t, securities: [] }, 24.3)).toBe(205);
  });
  it('an equity value or EV driver solves back to the per-share price', () => {
    for (const P of [11, 15, 26, 40]) {
      const eqv = P * dilutedShares(t, P);
      const a = { ...GM2.assumptions, price: { driver: 'equity_value' as const, equity_value: eqv } };
      expect(priceTarget(t, a).offer_per_share!).toBeCloseTo(P, 9);
      const ev = eqv + t.net_debt!;
      const b = { ...GM2.assumptions, price: { driver: 'enterprise_value' as const, enterprise_value: ev } };
      expect(priceTarget(t, b).offer_per_share!).toBeCloseTo(P, 9);
    }
  });
  it('a convertible that converts leaves net debt, and EV stays continuous through its conversion price', () => {
    const c = { ...t, securities: [...t.securities, { kind: 'convertible' as const, principal: 90, conversion_price: 30 }] };
    const at = (P: number) => priceTarget(c, { ...GM2.assumptions, price: { driver: 'offer_per_share', offer_per_share: P } });
    expect(at(30).converted_principal).toBe(0);
    expect(at(30 + 1e-7).converted_principal).toBe(90);
    expect(at(30 + 1e-7).net_debt_used).toBe(c.net_debt! - 90);
    // no jump: the shares the holders get are worth the principal that leaves net debt
    expect(Math.abs(at(30 + 1e-7).enterprise_value - at(30).enterprise_value)).toBeLessThan(1e-4);
    const ev = at(35).enterprise_value;
    expect(priceTarget(c, { ...GM2.assumptions, price: { driver: 'enterprise_value', enterprise_value: ev } }).offer_per_share!).toBeCloseTo(35, 9);
  });
  it('an equity value that falls inside a conversion jump is refused, not rounded', () => {
    const c = { ...t, securities: [{ kind: 'convertible' as const, principal: 90, conversion_price: 30 }] };
    const eqv = 30 * 200 + 45; // between 30 × 200 and 30 × 203
    expect(() => priceTarget(c, { ...GM2.assumptions, price: { driver: 'equity_value', equity_value: eqv } })).toThrow(/switches to shares/);
  });
  it('premiums are reported against both reference prices', () => {
    const o = runMerger(GM2.facts, GM2.assumptions);
    expect(o.deal.offer_per_share).toBeCloseTo(24.3, 12);
    expect(o.deal.premium_current).toBeCloseTo(0.35, 12);
    expect(o.deal.premium_unaffected).toBeCloseTo(24.3 / 17 - 1, 12);
    expect(o.deal.exchange_ratio).toBeCloseTo((0.6 * 24.3) / 40, 12);
  });
});

describe('GM1 is untouched by the Phase 2 settings at their neutral values', () => {
  it('no balance sheet, no full-year view, Phase 1 shapes', () => {
    const o = runMerger(GM1_FACTS, GM1_ASSUMPTIONS);
    expect(o.balance_sheet).toBeNull();
    expect(o.ppa).toBeNull();
    expect(o.eps.year1_full_year).toBeNull();
    expect(o.blocks.combined.every((r) => r.one_offs === 0 && r.deferred_tax === 0 && r.non_cash_interest === 0)).toBe(true);
  });
});

describe('review fixes', () => {
  it('debt sized to the cap with no room for debt is zero, not a rejection', () => {
    const a = structuredClone(GM1_ASSUMPTIONS);
    a.target_debt = 'assume_all';
    a.fees.advisory.value = 0;
    a.consideration.pct_stock = 1;
    a.funding.tranches[0].amount = null;
    a.funding.solve = 'max_debt_at_cap';
    const o = runMerger(GM1_FACTS, a);
    expect(o.deal.debt_issued).toBe(0);
    expect(o.leverage.solve!.binding).toBe(false);
  });
  it('growth after a part-year close compares full years', () => {
    const part = runMerger(GM2.facts, GM2.assumptions);
    const full = runMerger(GM2.facts, { ...GM2.assumptions, timing: { fraction_of_year_1: 1 } });
    for (const b of ['target', 'sum', 'combined'] as const) for (const t of [1, 2]) {
      expect(Math.abs(part.blocks[b][t].growth! - full.blocks[b][t].growth!), `${b} ${t}`).toBeLessThan(1e-12);
    }
    expect(part.blocks.target[1].growth!).toBeCloseTo(0.05, 12);
  });
  it('without a balance sheet, the acquirer cannot spend more cash than its year-0 roll leaves', () => {
    const a = structuredClone(GM1_ASSUMPTIONS);
    a.funding.acquirer_cash_used = 50000;
    expect(() => runMerger(GM1_FACTS, a)).toThrow(/more cash than it has at the close/);
    a.funding.acquirer_cash_used = 100;
    expect(() => runMerger(GM1_FACTS, a)).not.toThrow();
  });
});

describe('Build rejections added in Phase 2', () => {
  const rejects = (x: { facts: MergerFacts; assumptions: MergerAssumptions }, re: RegExp) => expect(() => runMerger(x.facts, x.assumptions)).toThrow(re);
  it('refuses, never defaults', () => {
    rejects(vary(GM2, (_f, a) => { a.consideration.pct_stock = 1.2; }), /between 0% and 100%/);
    rejects(vary(GM2, (f) => { f.target.balance!.cash += 5; }), /does not balance/);
    rejects(vary(GM2, (f) => { f.target.balance = null; }), /needs the balance sheet/);
    rejects(vary(GM2, (_f, a) => { a.fees.advisory.treatment = 'not_recognised'; }), /expensed at the close/);
    rejects(vary(GM2, (_f, a) => { a.year0_cash_carried = true; a.timing.fraction_of_year_1 = 1; }), /not carried/);
    rejects(vary(GM2, (_f, a) => { a.price = { driver: 'premium', premium: 0.3, premium_to: 'unaffected' }; a.unaffected_price = null; }), /unaffected share price/);
    rejects(vary(GM2, (f) => { f.target.shares = null; }), /needs the share count|need the basic share count/);
    rejects(vary(GM2, (_f, a) => { a.funding.acquirer_cash_used = 5000; }), /more cash than it has at the close/);
    rejects(vary(GM2, (_f, a) => { a.synergies.cost_to_achieve = [80, 40, 10]; }), /negative amounts/);
    rejects(vary(GM2, (_f, a) => { a.funding.tranches[0].amount = null; }), /Enter every tranche amount/);
    rejects(vary(GM2, (_f, a) => { a.ppa!.debt_fair_value_adjustment = 10; }), /assumed/);
    rejects(vary(GM3, (_f, a) => { a.ppa!.tax_goodwill_life_years = null; }), /deducted for tax/);
    rejects(vary(GM3, (_f, a) => { a.funding.equity_raise = 5000; }), /would be negative/);
    rejects(vary(GM3, (_f, a) => { a.funding.tranches.push({ ...a.funding.tranches[0], name: 'Second' }); }), /exactly one tranche/);
    rejects(vary(GM2, (_f, a) => { a.timing.fraction_of_year_1 = 0; }), /first year after the close/);
  });
});
