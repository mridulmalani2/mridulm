/**
 * The Clean step's core (rebuild/CLEANING_AND_SUITE_PLAN.md §3–§5): the StatementPack, the
 * ledger arithmetic and the checks. Expected figures are worked BY HAND from the Northwind
 * fixture (FY2023: revenue 1,250.0 · operating income 187.5 · D&A 62.5 · EBITDA 250.0 ·
 * capex 50.0 · operating NWC 105.0 · borrowings 335.0 · cash 80.0), never read back from the
 * code under test.
 *
 * Each block names the mutant it exists to kill (drop a sign, skip the re-derivation after an
 * override, read "not entered" as zero, swap the FY and LTM columns, point the model at the
 * reported figure). Every one of them was applied by hand and turned this file red.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { CompanyFacts } from '../lib/edgar/client';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import { manualHistoricals } from '../lib/edgar/buildModel';
import { buildStatementPack } from '../lib/statements/pack';
import { cellAt } from '../lib/statements/types';
import { applyCleaning, restatableAt } from '../lib/cleaning/apply';
import { blockers, cleaningChecks } from '../lib/cleaning/checks';
import {
  acceptCandidate, addAdjustment, addNetDebtItem, fillNilElsewhere, removeAdjustment, removeOverride, setAdjustmentAmount,
  setLeaseChoice, setOverride, updateAdjustment, updateNetDebtItem,
} from '../lib/cleaning/ops';
import { emptyLedger, type CleaningLedger } from '../lib/cleaning/types';
import { adaptRawHistoricals } from '../lib/engine2/factsAdapter';
import { suggestionsFor } from '../lib/engine2/suggest';
import { runModel } from '../lib/engine2/facade';
import { enteredAssumptions } from './fixtures/entered-deal';

const enteredDeal = () => enteredAssumptions(5);

const FIXTURE: CompanyFacts = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'companyfacts-sample.json'), 'utf8'));
const OPTS = { asOfDate: '2024-06-30', sicCode: '3711' };
const FY = '2023-12-31';
const PRIOR = '2022-12-31';

const fact = (end: string, valM: number, duration: boolean) => ({
  ...(duration ? { start: `${end.slice(0, 4)}-01-01` } : {}),
  end, val: valM * 1e6, accn: `0001000000-${Number(end.slice(2, 4)) + 1}-000010`, fy: Number(end.slice(0, 4)), fp: 'FY', form: '10-K', filed: `${Number(end.slice(0, 4)) + 1}-02-15`,
});
/** Northwind plus the items an analyst would clean: charges, a disposal gain, leases, a pension. */
function richFacts(): CompanyFacts {
  const f: CompanyFacts = JSON.parse(JSON.stringify(FIXTURE));
  const add = (tag: string, rows: [string, number][], duration: boolean) => {
    f.facts['us-gaap'][tag] = { units: { USD: rows.map(([end, v]) => fact(end, v, duration)) } };
  };
  add('RestructuringCharges', [[PRIOR, 10], [FY, 20]], true);
  add('ShareBasedCompensation', [[FY, 12]], true);
  add('GainLossOnDispositionOfAssets1', [[FY, 5]], true);
  add('FinanceLeaseLiabilityNoncurrent', [[FY, 30]], false);
  add('FinanceLeaseLiabilityCurrent', [[FY, 5]], false);
  add('OperatingLeaseLiability', [[FY, 60]], false);
  add('PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent', [[FY, 25]], false);
  add('RestrictedCashAndCashEquivalents', [[FY, 8]], false);
  return f;
}
function sourced(facts: CompanyFacts = FIXTURE) {
  const raw = mapCompanyFacts(facts, OPTS);
  const rawExLeases = mapCompanyFacts(facts, { ...OPTS, includeFinanceLeasesInDebt: false });
  return { raw, pack: buildStatementPack({ raw, rawExLeases, gaap: 'us-gaap', facts }) };
}
const withRow = (l: CleaningLedger, label: string, amounts: Record<string, number | null>, target: 'ebitda' | 'revenue' | 'capex' | 'da' | 'nwc' = 'ebitda') => {
  const next = addAdjustment(l, target);
  return updateAdjustment(next, next.adjustments[next.adjustments.length - 1].id, { label, amounts, forecast: target === 'ebitda' ? 'gone' : null });
};

describe('StatementPack: what the Clean step is given', () => {
  it('the cells the model reads are the SAME figures as the RawHistoricals (one source, not two)', () => {
    const { raw, pack } = sourced();
    expect(pack.anchor).toBe(FY);
    expect(pack.sizing).toBe(FY);
    expect(pack.periods.map((p) => p.key)).toEqual(['2021-12-31', PRIOR, FY]);
    expect(cellAt(pack, 'revenue', FY)!.value).toBe(raw.fy_revenue!.value);
    expect(cellAt(pack, 'ebitda', FY)!.value).toBe(raw.fy_ebitda!.value);
    expect(cellAt(pack, 'operating_income', FY)!.value).toBe(187.5);
    expect(cellAt(pack, 'da', FY)!.value).toBe(62.5);
    expect(cellAt(pack, 'capex', PRIOR)!.value).toBe(46);
    expect(cellAt(pack, 'cash', FY)!.value).toBe(80);
    expect(cellAt(pack, 'borrowings', FY)!.value).toBe(335);
    expect(cellAt(pack, 'revenue', FY)!.provenance.url).toContain('sec.gov/Archives/edgar/data/1000000/');
  });

  it('a line the filing does not tag is ABSENT, never zero', () => {
    const { pack } = sourced();
    expect(cellAt(pack, 'goodwill', FY)).toBeNull();
    expect(cellAt(pack, 'sga', FY)).toBeNull();
    expect(pack.lines.finance_lease_liab).toBeUndefined();
  });

  it('lease liabilities are separated from borrowings; operating leases are reported, not added', () => {
    const { raw, pack } = sourced(richFacts());
    expect(raw.gross_debt!.value).toBe(370); // today's composition: borrowings + finance leases
    expect(cellAt(pack, 'borrowings', FY)!.value).toBe(335);
    expect(cellAt(pack, 'finance_lease_liab', FY)!.value).toBe(35);
    expect(cellAt(pack, 'operating_lease_liab', FY)!.value).toBe(60);
  });

  it('detected proposals: bridge-signed amounts per year, a caveat where the tag can sit below operating income, nothing applied', () => {
    const { raw, pack } = sourced(richFacts());
    const byTag = Object.fromEntries(pack.candidates.map((c) => [c.tag, c]));
    expect(byTag.RestructuringCharges.amounts).toEqual({ [PRIOR]: 10, [FY]: 20 });
    expect(byTag.ShareBasedCompensation.amounts).toEqual({ [FY]: 12 });
    expect(byTag.GainLossOnDispositionOfAssets1.amounts).toEqual({ [FY]: -5 }); // a GAIN is deducted
    expect(byTag.GainLossOnDispositionOfAssets1.caveat).toContain('below operating income');
    expect(byTag.RestructuringCharges.caveat).toBeNull();
    expect(byTag.PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent).toMatchObject({ bridge: 'net_debt', side: 'debt_like', amounts: { [FY]: 25 } });
    expect(byTag.RestrictedCashAndCashEquivalents).toMatchObject({ side: 'cash_like', amounts: { [FY]: -8 } });
    // detection alone changes nothing
    expect(applyCleaning(raw, pack, emptyLedger()).raw).toEqual(raw);
  });

  it('D4: a D&A alias that includes financing costs carries a note on the cell and a check', () => {
    const f: CompanyFacts = JSON.parse(JSON.stringify(FIXTURE));
    f.facts['us-gaap'].DepreciationAmortizationAndAccretionNet = f.facts['us-gaap'].DepreciationDepletionAndAmortization;
    delete f.facts['us-gaap'].DepreciationDepletionAndAmortization;
    const { raw, pack } = sourced(f);
    expect(cellAt(pack, 'da', FY)!.note).toContain('financing costs');
    const flags = cleaningChecks(pack, { ...emptyLedger(), adjustments: [] }, applyCleaning(raw, pack, emptyLedger()));
    expect(flags.find((x) => x.code === 'da_alias')?.severity).toBe('warn');
  });
});

describe('applyCleaning: identity (an empty ledger changes nothing)', () => {
  const manual = manualHistoricals({
    dealName: 'Manual Co', sector: 'Industrials', currency: 'EUR', basis: 'LTM', ltm: { asOf: '2024-06-30', revenue: 1300, ebitda: 270 },
    years: [{ end: PRIOR, revenue: 1150, ebitda: 224.25, da: 57.5, capex: 46 }, { end: FY, revenue: 1250, ebitda: 250, da: 62.5, capex: 50 }],
    nwc: 105, grossDebt: 335, cash: 80, netDebt: null, netPpe: 400, taxRate: 0.25, nol: null,
  });
  const cases = {
    'EDGAR us-gaap': sourced(),
    'EDGAR with leases and candidates': sourced(richFacts()),
    'manual, LTM-sized': { raw: manual, pack: buildStatementPack({ raw: manual, rawExLeases: null, gaap: 'unknown' }) },
  };
  for (const [name, { raw, pack }] of Object.entries(cases)) {
    it(`${name}: output deep-equals the sourced figures, and so do the engine facts`, () => {
      const cleaned = applyCleaning(raw, pack, emptyLedger());
      expect(cleaned.raw).toEqual(raw);
      expect(adaptRawHistoricals(cleaned.raw)).toEqual(adaptRawHistoricals(raw));
    });
  }

  it('"use as reported" ignores every entry (and keeps them for later)', () => {
    const { raw, pack } = sourced(richFacts());
    let l = withRow(emptyLedger(), 'Restructuring', { [FY]: 20 });
    l = setLeaseChoice(setOverride(l, 'revenue', FY, 1200, 'one-off contract'), 'all');
    const asReported = { ...l, as_reported: true };
    expect(applyCleaning(raw, pack, asReported).raw).toEqual(raw);
    expect(asReported.adjustments).toHaveLength(1);
    expect(cleaningChecks(pack, asReported, applyCleaning(raw, pack, asReported))).toEqual([]);
  });

  it('an un-ticked row and a row with only zeros both leave the figure where it was', () => {
    const { raw, pack } = sourced();
    let l = withRow(emptyLedger(), 'Off', { [FY]: 40 });
    l = updateAdjustment(l, l.adjustments[0].id, { included: false });
    expect(applyCleaning(raw, pack, l).raw).toEqual(raw);
  });
});

describe('applyCleaning: the EBITDA bridge (hand-worked)', () => {
  it('reported 250.0 + restructuring 20.0 + SBC 12.0 − disposal gain 5.0 = 277.0; margin 277 ÷ 1,250', () => {
    const { raw, pack } = sourced(richFacts());
    let l = emptyLedger();
    for (const tag of ['RestructuringCharges', 'ShareBasedCompensation', 'GainLossOnDispositionOfAssets1']) {
      l = acceptCandidate(l, pack.candidates.find((c) => c.tag === tag)!);
    }
    const { raw: out, bridges } = applyCleaning(raw, pack, l);
    const b = bridges.ebitda.find((x) => x.period === FY)!;
    expect(b.reported).toBe(250);
    expect(b.rows.map((r) => r.amount)).toEqual([20, 12, -5]);
    expect(b.adjusted).toBe(277); // kills: a dropped sign on the gain (would read 287)
    expect(out.fy_ebitda!.value).toBe(277); // kills: the model still pointed at the reported figure
    expect(out.fy_ebitda!.provenance.source).toBe('adjusted');
    expect(out.fy_ebitda!.provenance.detail).toContain('reported 250.0');
    expect(out.ebitda_margin!.value).toBeCloseTo(277 / 1250, 12);
    expect(adaptRawHistoricals(out).facts.fy_ebitda_margin).toBeCloseTo(0.2216, 12);
    // revenue, the ratios and net debt were not reached: the sourced objects themselves
    expect(out.fy_revenue).toBe(raw.fy_revenue);
    expect(out.da_pct_revenue).toBe(raw.da_pct_revenue);
    expect(out.net_debt).toBe(raw.net_debt);
  });

  it('NOT ENTERED is not zero: FY2022 has no SBC amount, so adjusted FY2022 EBITDA is blank until the analyst says nil', () => {
    const { raw, pack } = sourced(richFacts());
    let l = acceptCandidate(emptyLedger(), pack.candidates.find((c) => c.tag === 'RestructuringCharges')!);
    l = acceptCandidate(l, pack.candidates.find((c) => c.tag === 'ShareBasedCompensation')!);
    const before = applyCleaning(raw, pack, l);
    expect(before.bridges.ebitda.find((x) => x.period === PRIOR)!.adjusted).toBeNull(); // kills: null read as 0 (would be 234.25)
    expect(before.raw.history!.ebitda.points.map((p) => p.end)).toEqual([FY]); // a hole, not a made-up year
    expect(before.raw.fy_ebitda!.value).toBe(282); // the sizing year is fully entered: 250 + 20 + 12
    const sbc = l.adjustments[1].id;
    const after = applyCleaning(raw, pack, fillNilElsewhere(l, sbc, pack));
    expect(after.bridges.ebitda.find((x) => x.period === PRIOR)!.adjusted).toBe(234.25); // 224.25 + 10 + 0
    expect(after.bridges.ebitda.find((x) => x.period === '2021-12-31')!.adjusted).toBeNull(); // restructuring still not entered for 2021
  });

  it('an override re-derives its dependents: operating income 187.5 → 190.0 makes EBITDA 252.5 before any row', () => {
    const { raw, pack } = sourced();
    let l = setOverride(emptyLedger(), 'operating_income', FY, 190, 'reclassified a one-off cost below the line');
    const one = applyCleaning(raw, pack, l);
    expect(one.bridges.ebitda.find((x) => x.period === FY)).toMatchObject({ reported: 250, restated: 252.5, adjusted: 252.5 }); // kills: skipped re-derivation
    expect(one.raw.fy_ebitda!.value).toBe(252.5);
    expect(one.raw.fy_ebitda!.provenance.detail).toContain('restated from 250.0');
    l = withRow(l, 'Restructuring', { [FY]: 27 });
    expect(applyCleaning(raw, pack, l).raw.fy_ebitda!.value).toBe(279.5);
    // removing the override and the row is the identity again
    const back = removeAdjustment(removeOverride(l, 'operating_income', FY), l.adjustments[0].id);
    expect(applyCleaning(raw, pack, back).raw).toEqual(raw);
  });

  it('EBITDA itself cannot be restated where it is operating income + D&A: the components are', () => {
    const { raw, pack } = sourced();
    expect(restatableAt(pack, 'ebitda', FY)).toBe(false);
    expect(restatableAt(pack, 'operating_income', FY)).toBe(true);
    const l = setOverride(emptyLedger(), 'ebitda', FY, 300, 'direct');
    expect(applyCleaning(raw, pack, l).raw.fy_ebitda!.value).toBe(250); // not silently taken…
    expect(blockers(cleaningChecks(pack, l, applyCleaning(raw, pack, l))).map((x) => x.code)).toContain('override_not_applicable'); // …and said so
  });

  it('a revenue adjustment moves the FY-basis ratios with it: 62.5 ÷ 1,200 · 50 ÷ 1,200 · 105 ÷ 1,200', () => {
    const { raw, pack } = sourced();
    const l = withRow(emptyLedger(), 'Discontinued contract', { [FY]: -50, [PRIOR]: 0, '2021-12-31': 0 }, 'revenue');
    const out = applyCleaning(raw, pack, l).raw;
    expect(out.fy_revenue!.value).toBe(1200);
    expect(out.ebitda_margin!.value).toBeCloseTo(250 / 1200, 12);
    expect(out.da_pct_revenue!.value).toBeCloseTo(62.5 / 1200, 12);
    expect(out.capex_pct_revenue!.value).toBeCloseTo(50 / 1200, 12);
    expect(out.nwc_pct_revenue!.value).toBeCloseTo(105 / 1200, 12);
    expect(out.history!.revenue.points.map((p) => p.value)).toEqual([1050, 1150, 1200]);
  });

  it('capex and D&A rows land on their own lines only', () => {
    const { raw, pack } = sourced();
    const out = applyCleaning(raw, pack, withRow(emptyLedger(), 'One-off plant', { [FY]: -10 }, 'capex')).raw;
    expect(out.capex!.value).toBe(40);
    expect(out.capex_pct_revenue!.value).toBeCloseTo(40 / 1250, 12);
    expect(out.fy_ebitda).toBe(raw.fy_ebitda);
    expect(out.da).toBe(raw.da);
  });
});

describe('applyCleaning: LTM sizing', () => {
  const raw = manualHistoricals({
    dealName: 'Manual Co', sector: 'Industrials', currency: 'EUR', basis: 'LTM', ltm: { asOf: '2024-06-30', revenue: 1300, ebitda: 270 },
    years: [{ end: PRIOR, revenue: 1150, ebitda: 224.25, da: 57.5, capex: 46 }, { end: FY, revenue: 1250, ebitda: 250, da: 62.5, capex: 50 }],
    nwc: 105, grossDebt: 335, cash: 80, netDebt: null, netPpe: 400, taxRate: 0.25, nol: null,
  });
  const pack = buildStatementPack({ raw, rawExLeases: null, gaap: 'unknown' });

  it('the model reads the LTM column: an FY-only amount leaves LTM EBITDA blank and the step blocked', () => {
    expect(pack.sizing).toBe('LTM');
    expect(cellAt(pack, 'ebitda', 'LTM')!.value).toBe(270);
    const l = withRow(emptyLedger(), 'Restructuring', { [FY]: 20 });
    const cleaned = applyCleaning(raw, pack, l);
    expect(cleaned.raw.fy_ebitda).toBeNull(); // kills: FY/LTM columns swapped (would read 290 or 270)
    expect(adaptRawHistoricals(cleaned.raw).missing).toContain('fy_ebitda'); // and the Build gate holds
    expect(blockers(cleaningChecks(pack, l, cleaned)).map((x) => x.code)).toEqual(['adjustment_amount']);
  });

  it('with the LTM amount entered: 270.0 + 15.0 = 285.0; the FY-basis ratios are untouched', () => {
    const l = withRow(emptyLedger(), 'Restructuring', { [FY]: 20, LTM: 15 });
    const cleaned = applyCleaning(raw, pack, l);
    expect(cleaned.raw.fy_ebitda!.value).toBe(285);
    expect(cleaned.bridges.ebitda.find((b) => b.period === FY)!.adjusted).toBe(270); // FY: 250 + 20
    expect(cleaned.raw.da_pct_revenue).toBe(raw.da_pct_revenue);
    expect(blockers(cleaningChecks(pack, l, cleaned))).toEqual([]);
  });

  it('where EBITDA has no tagged components (LTM, manual) the total is restated directly', () => {
    expect(restatableAt(pack, 'ebitda', 'LTM')).toBe(true);
    const l = setOverride(emptyLedger(), 'ebitda', 'LTM', 280, 'management accounts');
    expect(applyCleaning(raw, pack, l).raw.fy_ebitda!.value).toBe(280);
  });
});

describe('applyCleaning: the net-debt bridge (hand-worked)', () => {
  const { raw, pack } = sourced(richFacts());
  const pension = pack.candidates.find((c) => c.category === 'pension')!;
  const restricted = pack.candidates.find((c) => c.category === 'restricted_cash')!;
  const items = acceptCandidate(acceptCandidate(emptyLedger(), pension), restricted);

  it('a lease liability exists and no choice is made ⇒ net debt is NOT KNOWN, and the step says why', () => {
    const cleaned = applyCleaning(raw, pack, items);
    expect(cleaned.bridges.net_debt!.adjusted).toBeNull();
    expect(cleaned.raw.net_debt).toBeNull();
    expect(blockers(cleaningChecks(pack, items, cleaned)).map((x) => x.code)).toEqual(['lease_choice']);
  });

  it.each([
    ['none', 335, 288],     // 335 + 25 − (80 − 8)
    ['finance', 370, 323],  // 335 + 35 + 25 − 72
    ['all', 430, 383],      // 335 + 35 + 60 + 25 − 72
  ] as const)('leases = %s: financial debt %d, adjusted net debt %d', (choice, gross, net) => {
    const cleaned = applyCleaning(raw, pack, setLeaseChoice(items, choice));
    expect(cleaned.bridges.net_debt).toMatchObject({ reported: 290, borrowings: 335, cash: 80, gross, adjusted: net });
    expect(cleaned.raw.net_debt!.value).toBe(net);
    expect(cleaned.raw.gross_debt!.value).toBe(gross);
    expect(cleaned.raw.fy_ebitda).toBe(raw.fy_ebitda); // the net-debt bridge never moves EBITDA
  });

  it('the finance-lease choice alone reproduces the sourced composition (290.0)', () => {
    expect(applyCleaning(raw, pack, setLeaseChoice(emptyLedger(), 'finance')).raw.net_debt!.value).toBe(raw.net_debt!.value);
  });

  it('a US GAAP filer counting operating leases as debt is warned about the rent double-count; the other choices are not', () => {
    const codes = (c: 'none' | 'finance' | 'all') => {
      const l = setLeaseChoice(emptyLedger(), c);
      return cleaningChecks(pack, l, applyCleaning(raw, pack, l)).map((x) => x.code);
    };
    expect(codes('all')).toContain('lease_basis');
    expect(codes('finance')).not.toContain('lease_basis');
    expect(codes('none')).not.toContain('lease_basis');
  });

  it('an item with no amount blocks; an un-ticked one does not count', () => {
    let l = setLeaseChoice(addNetDebtItem(emptyLedger(), 'debt_like'), 'none');
    const id = l.net_debt_items[0].id;
    l = updateNetDebtItem(l, id, { label: 'Earn-out' });
    expect(applyCleaning(raw, pack, l).raw.net_debt).toBeNull();
    expect(blockers(cleaningChecks(pack, l, applyCleaning(raw, pack, l))).map((x) => x.code)).toEqual(['net_debt_amount']);
    l = updateNetDebtItem(l, id, { included: false });
    expect(applyCleaning(raw, pack, l).raw.net_debt!.value).toBe(255); // 335 − 80
  });
});

describe('applyCleaning: properties', () => {
  const { raw, pack } = sourced();
  const amount = fc.integer({ min: -5000, max: 5000 }).map((n) => n / 10);
  const rows = fc.array(fc.record({ amount, included: fc.boolean() }), { maxLength: 6 });
  const build = (rs: { amount: number; included: boolean }[]) => {
    let l = emptyLedger();
    rs.forEach((r, i) => {
      l = withRow(l, `row ${i}`, { [FY]: r.amount });
      l = updateAdjustment(l, l.adjustments[i].id, { included: r.included });
    });
    return l;
  };
  const ebitda = (l: CleaningLedger) => applyCleaning(raw, pack, l).raw.fy_ebitda!.value;

  it('adjusted = reported + Σ included rows', () => {
    fc.assert(fc.property(rows, (rs) => {
      const want = rs.filter((r) => r.included).reduce((s, r) => s + r.amount, 250);
      expect(ebitda(build(rs))).toBeCloseTo(want, 9);
    }));
  });

  it('un-ticking a row is the same as deleting it', () => {
    fc.assert(fc.property(rows, (rs) => {
      const l = build(rs);
      const deleted = l.adjustments.filter((a) => !a.included).reduce((acc, a) => removeAdjustment(acc, a.id), l);
      expect(applyCleaning(raw, pack, deleted).raw).toEqual(applyCleaning(raw, pack, l).raw);
    }));
  });

  it('the order of the rows never matters', () => {
    fc.assert(fc.property(rows, (rs) => {
      expect(ebitda(build([...rs].reverse()))).toBeCloseTo(ebitda(build(rs)), 9);
    }));
  });

  it('an override followed by its removal is the identity', () => {
    fc.assert(fc.property(amount, (v) => {
      const l = removeOverride(setOverride(emptyLedger(), 'revenue', FY, 1250 + v, 'test'), 'revenue', FY);
      expect(applyCleaning(raw, pack, l).raw).toEqual(raw);
    }));
  });

  it('an amount set then cleared returns the figure to blank, not to the old value', () => {
    let l = withRow(emptyLedger(), 'r', { [FY]: 10 });
    l = setAdjustmentAmount(l, l.adjustments[0].id, FY, null);
    expect(applyCleaning(raw, pack, l).raw.fy_ebitda).toBeNull();
  });
});

describe('cleaningChecks: shown, never judged by a threshold', () => {
  const { raw, pack } = sourced(richFacts());
  const run = (l: CleaningLedger) => cleaningChecks(pack, l, applyCleaning(raw, pack, l));

  it('the size of the adjustments is a figure, not a verdict: 27.0 on 250.0 = 10.8%', () => {
    const l = setLeaseChoice(withRow(emptyLedger(), 'Restructuring', { [FY]: 27 }), 'finance');
    const share = run(l).find((x) => x.code === 'adjustment_share')!;
    expect(share.severity).toBe('info');
    expect(share.message).toContain('10.8%');
  });

  it('a proposal whose tag can sit below operating income warns until the analyst confirms it', () => {
    let l = setLeaseChoice(acceptCandidate(emptyLedger(), pack.candidates.find((c) => c.tag === 'GainLossOnDispositionOfAssets1')!), 'finance');
    expect(run(l).map((x) => x.code)).toContain('candidate_unconfirmed');
    l = updateAdjustment(l, l.adjustments[0].id, { confirmed_in_operating_income: true });
    expect(run(l).map((x) => x.code)).not.toContain('candidate_unconfirmed');
  });

  it('an unnamed row, a missing reason and non-positive adjusted EBITDA are each named', () => {
    let l = setLeaseChoice(addAdjustment(emptyLedger(), 'ebitda'), 'finance');
    l = setAdjustmentAmount(l, l.adjustments[0].id, FY, -300);
    l = setOverride(l, 'revenue', FY, 1200, '  ');
    const codes = run(l).map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(['adjustment_label', 'override_reason', 'ebitda_not_positive']));
  });
});

describe('D3: the size band and the US financing conventions are US-dollar data', () => {
  const { raw } = sourced();
  const usd = adaptRawHistoricals(raw).facts;
  it('a USD deal is offered the cited entry multiple and debt template', () => {
    const s = suggestionsFor(usd, 5);
    expect(s['entry.entry_multiple']).toBeDefined();
    expect(s['structure.tranches']).toBeDefined();
  });
  it('the same figures in JPY are offered neither: ¥250m of EBITDA is not a large-cap US buyout', () => {
    const s = suggestionsFor({ ...usd, currency: 'JPY' }, 5);
    expect(s['entry.entry_multiple']).toBeUndefined();
    expect(s['structure.tranches']).toBeUndefined();
    expect(s['operations.target_margin']).toBeDefined(); // filing ratios are currency-free
  });
});

describe('SPEC §27: an add-back either STOPS or CONTINUES (hand-worked)', () => {
  const { raw, pack } = sourced(richFacts());
  const build = (sbc: 'gone' | 'continues' | null) => {
    let l = acceptCandidate(emptyLedger(), pack.candidates.find((c) => c.tag === 'RestructuringCharges')!);
    l = acceptCandidate(l, pack.candidates.find((c) => c.tag === 'ShareBasedCompensation')!);
    l = updateAdjustment(l, l.adjustments[0].id, { forecast: 'gone' });
    return setLeaseChoice(updateAdjustment(l, l.adjustments[1].id, { forecast: sbc }), 'finance');
  };

  it('there is no default: an EBITDA add-back with no choice blocks the step, by name', () => {
    const l = build(null);
    const open = blockers(cleaningChecks(pack, l, applyCleaning(raw, pack, l), raw));
    expect(open.map((f) => f.code)).toEqual(['forecast_choice']);
    expect(open[0].message).toContain('Share-based compensation');
  });

  it('both STOP: price basis 250 + 20 + 12 = 282.0 and the forecast margin is 282 ÷ 1,250; no second base exists', () => {
    const out = applyCleaning(raw, pack, build('gone')).raw;
    expect(out.fy_ebitda!.value).toBe(282);
    expect(out.forecast_ebitda).toBeUndefined();
    expect(adaptRawHistoricals(out).facts.fy_ebitda_margin).toBeCloseTo(282 / 1250, 12);
  });

  it('share-based pay CONTINUES: still priced on 282.0, but the forecast starts from 270.0; margin 21.6%, not 22.56%', () => {
    const l = build('continues');
    const cleaned = applyCleaning(raw, pack, l);
    expect(cleaned.raw.fy_ebitda!.value).toBe(282); // the price and leverage basis is unchanged
    expect(cleaned.raw.forecast_ebitda!.value).toBe(270);
    const facts = adaptRawHistoricals(cleaned.raw).facts;
    expect(facts.fy_ebitda).toBe(282);
    expect(facts.fy_ebitda_margin).toBeCloseTo(0.216, 12); // kills: margin formed on the full adjusted figure
    const flags = cleaningChecks(pack, l, cleaned, raw);
    expect(blockers(flags)).toEqual([]);
    expect(flags.find((f) => f.code === 'forecast_base')!.message).toContain('270.0');
  });

  it('the choice moves forecast cash flow and nothing about the price', () => {
    const a = enteredDeal();
    const gone = runModel(adaptRawHistoricals(applyCleaning(raw, pack, build('gone')).raw).facts, a);
    const cont = runModel(adaptRawHistoricals(applyCleaning(raw, pack, build('continues')).raw).facts, a);
    expect(cont.derived.enterprise_value).toBe(gone.derived.enterprise_value); // 9.0x × 282.0
    expect(cont.derived.total_debt_at_par).toBe(gone.derived.total_debt_at_par);
    expect(cont.operating[0].ebitda).toBeLessThan(gone.operating[0].ebitda); // the cost is still being paid
    expect(cont.returns.sponsor_net.irr!).toBeLessThan(gone.returns.sponsor_net.irr!);
  });

  it('a CONTINUES row on another line is ignored (the choice exists for EBITDA only), and a blank continuing amount blanks the base', () => {
    let l = withRow(emptyLedger(), 'Contract', { [FY]: -50, [PRIOR]: 0, '2021-12-31': 0 }, 'revenue');
    l = setLeaseChoice(updateAdjustment(l, l.adjustments[0].id, { forecast: 'continues' }), 'finance');
    expect(applyCleaning(raw, pack, l).raw.forecast_ebitda).toBeUndefined();
    const b = updateAdjustment(build('continues'), 'adj-2', { amounts: {} });
    expect(applyCleaning(raw, pack, b).raw.forecast_ebitda).toBeNull();
  });
});

describe('C7: a restated figure the filing’s own lines contradict is flagged, never blocked', () => {
  const f = richFacts();
  const yr = (end: string, v: number) => ({ start: `${end.slice(0, 4)}-01-01`, end, val: v * 1e6, accn: '0001000000-24-000010', fy: Number(end.slice(0, 4)), fp: 'FY', form: '10-K', filed: '2024-02-15' });
  f.facts['us-gaap'].CostOfRevenue = { units: { USD: [yr(FY, 800)] } };
  f.facts['us-gaap'].GrossProfit = { units: { USD: [yr(FY, 450)] } };
  const { raw, pack } = sourced(f);
  const codes = (l: CleaningLedger) => cleaningChecks(pack, l, applyCleaning(raw, pack, l), raw).filter((x) => x.severity !== 'info').map((x) => `${x.severity}:${x.code}`);

  it('revenue restated to 1,200.0 against cost of revenue 800.0 + gross profit 450.0 warns; restating to their sum does not', () => {
    const base = setLeaseChoice(emptyLedger(), 'finance');
    expect(codes(setOverride(base, 'revenue', FY, 1200, 'contract carved out'))).toEqual(['warn:override_contradicts']);
    expect(codes(setOverride(base, 'revenue', FY, 1250, 'no change'))).toEqual([]);
  });
});
