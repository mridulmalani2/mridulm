/**
 * D1 history builder (lib/edgar/history.ts) vs the PHASE_D reliability rules, on the four
 * mandated fixture shapes: an ASC-606 tag switcher, a discontinued-ops restater, a
 * fiscal-year changer, and a financial-sector filer (no fake EBITDA).
 */
import { describe, it, expect } from 'vitest';
import {
  buildAnnualSeries,
  cagrOverTrueSpan,
  deriveSeries,
  MIN_HISTORY_POINTS,
  usablePoints,
  yoyGrowths,
} from '../lib/edgar/history';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import type { CompanyFacts } from '../lib/edgar/client';

const M = 1e6;
const fy = (start: string, end: string, val: number, filed: string, extra: object = {}) => ({
  start, end, val: val * M, fy: Number(end.slice(0, 4)), fp: 'FY', form: '10-K', filed, accn: `acc-${filed}`, ...extra,
});

/** Fixture 1 — ASC-606 switcher: `Revenues` through FY2020, RFCWC from FY2021. */
const TAG_SWITCHER: CompanyFacts = {
  cik: 1, entityName: 'Switcher Corp',
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [
        fy('2019-01-01', '2019-12-31', 800, '2020-02-15'),
        fy('2020-01-01', '2020-12-31', 900, '2021-02-15'),
      ] } },
      RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
        fy('2021-01-01', '2021-12-31', 1000, '2022-02-15'),
        fy('2022-01-01', '2022-12-31', 1100, '2023-02-15'),
        fy('2023-01-01', '2023-12-31', 1210, '2024-02-15'),
      ] } },
      OperatingIncomeLoss: { units: { USD: [
        fy('2022-01-01', '2022-12-31', 220, '2023-02-15'),
        fy('2023-01-01', '2023-12-31', 242, '2024-02-15'),
      ] } },
      DepreciationDepletionAndAmortization: { units: { USD: [
        fy('2022-01-01', '2022-12-31', 55, '2023-02-15'),
        fy('2023-01-01', '2023-12-31', 60, '2024-02-15'),
      ] } },
      PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [
        fy('2023-01-01', '2023-12-31', 66, '2024-02-15'),
      ] } },
    },
  },
} as unknown as CompanyFacts;

/** Fixture 2 — restater: FY2022 revenue restated −8% in the FY2023 filing (same start/end). */
const RESTATER: CompanyFacts = {
  cik: 2, entityName: 'Restate Inc',
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [
        fy('2021-01-01', '2021-12-31', 500, '2022-02-15'),
        fy('2022-01-01', '2022-12-31', 600, '2023-02-15'),               // original
        fy('2022-01-01', '2022-12-31', 552, '2024-02-15'),               // restated (−8%)
        fy('2023-01-01', '2023-12-31', 640, '2024-02-15'),
      ] } },
    },
  },
} as unknown as CompanyFacts;

/** Fixture 3 — fiscal-year changer: June FYs, a 6-month transition stub, then December FYs. */
const FY_CHANGER: CompanyFacts = {
  cik: 3, entityName: 'Shifty plc',
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [
        fy('2018-07-01', '2019-06-30', 400, '2019-08-15'),
        fy('2019-07-01', '2020-06-30', 440, '2020-08-15'),
        fy('2020-07-01', '2021-06-30', 484, '2021-08-15'),
        // 6-month transition stub — must be EXCLUDED (351-day rule), leaving a hole
        { start: '2021-07-01', end: '2021-12-31', val: 260 * M, fy: 2021, fp: 'FY', form: '10-KT', filed: '2022-02-15', accn: 'acc-t' },
        fy('2022-01-01', '2022-12-31', 560, '2023-02-15'),
        fy('2023-01-01', '2023-12-31', 616, '2024-02-15'),
      ] } },
    },
  },
} as unknown as CompanyFacts;

/** Fixture 4 — financial-sector filer: revenue only, no operating income / D&A at all. */
const BANK: CompanyFacts = {
  cik: 4, entityName: 'Big Bank',
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [
        fy('2021-01-01', '2021-12-31', 9000, '2022-02-15'),
        fy('2022-01-01', '2022-12-31', 9500, '2023-02-15'),
        fy('2023-01-01', '2023-12-31', 9900, '2024-02-15'),
      ] } },
    },
  },
} as unknown as CompanyFacts;

const REV_CHAIN = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues'];

describe('D1 §1 — per-period alias resolution (tag switcher)', () => {
  const s = buildAnnualSeries(TAG_SWITCHER, 'revenue', REV_CHAIN, { kind: 'duration' });

  it('resolves EVERY period across the switch — five points, END-date keyed, ascending', () => {
    expect(s.points.map((p) => p.end)).toEqual([
      '2019-12-31', '2020-12-31', '2021-12-31', '2022-12-31', '2023-12-31',
    ]);
    expect(s.points.map((p) => p.value)).toEqual([800, 900, 1000, 1100, 1210]);
  });

  it('records the tag PER point and flags pre-switch years as differing from the anchor tag', () => {
    expect(s.anchor_tag).toBe('RevenueFromContractWithCustomerExcludingAssessedTax');
    expect(s.points[0].tag).toBe('Revenues');
    expect(s.points[0].tag_differs_from_anchor).toBe(true);
    expect(s.points[4].tag).toBe('RevenueFromContractWithCustomerExcludingAssessedTax');
    expect(s.points[4].tag_differs_from_anchor).toBeUndefined();
    expect(s.notes.some((n) => n.includes('differs from anchor'))).toBe(true);
  });

  it('growth pairs span the tag switch (consecutive year ends) — 4 pairs, ~12.5%/11%/10%/10%', () => {
    const g = yoyGrowths(s);
    expect(g).toHaveLength(4);
    expect(g[1].growth).toBeCloseTo(1000 / 900 - 1, 10);
  });
});

describe('D1 §2 — restatement dedup (latest filed wins; >1% noted)', () => {
  const s = buildAnnualSeries(RESTATER, 'revenue', REV_CHAIN, { kind: 'duration' });

  it('FY2022 carries the RESTATED value (552, filed 2024) with a restatement note', () => {
    const p22 = s.points.find((p) => p.end === '2022-12-31')!;
    expect(p22.value).toBe(552);
    expect(p22.filed).toBe('2024-02-15');
    expect(p22.restated_note).toContain('restated');
    expect(s.notes.some((n) => n.includes('restated'))).toBe(true);
  });

  it('non-restated periods carry no note', () => {
    expect(s.points.find((p) => p.end === '2021-12-31')!.restated_note).toBeUndefined();
  });
});

describe('D1 §3/§4 — fiscal-year change: stub excluded, spans are TRUE dates', () => {
  const s = buildAnnualSeries(FY_CHANGER, 'revenue', REV_CHAIN, { kind: 'duration' });

  it('the 6-month transition stub is NOT a point (hole between 2021-06-30 and 2022-12-31)', () => {
    expect(s.points.map((p) => p.end)).toEqual([
      '2019-06-30', '2020-06-30', '2021-06-30', '2022-12-31', '2023-12-31',
    ]);
  });

  it('yoy pairs skip the 18-month hole — no fabricated growth across the change', () => {
    const g = yoyGrowths(s);
    expect(g.map((x) => `${x.from}→${x.to}`)).toEqual([
      '2019-06-30→2020-06-30', '2020-06-30→2021-06-30', '2022-12-31→2023-12-31',
    ]);
  });

  it('CAGR runs over the true 4.5-year span, not the row count', () => {
    const spanYears = (Date.parse('2023-12-31') - Date.parse('2019-06-30')) / 86_400_000 / 365.25;
    const expected = Math.pow(616 / 400, 1 / spanYears) - 1;
    expect(cagrOverTrueSpan(s)).toBeCloseTo(expected, 12);
    // row-count CAGR would be (616/400)^(1/4)−1 ≈ 11.4% — the true-span rate is lower
    expect(cagrOverTrueSpan(s)!).toBeLessThan(Math.pow(616 / 400, 1 / 4) - 1);
  });
});

describe('D1 §5 — degradation: no fake totals, the ≥3-point gate', () => {
  it('financial-sector filer: revenue series clean; derived EBITDA series EMPTY (no fake total from missing components)', () => {
    const raw = mapCompanyFacts(BANK, { sicDescription: 'National commercial banks' });
    expect(raw.history!.revenue.points).toHaveLength(3);
    expect(raw.history!.operating_income.points).toHaveLength(0);
    expect(raw.history!.ebitda.points).toHaveLength(0); // never OpInc-less EBITDA
  });

  it('tag switcher end-to-end through mapCompanyFacts: EBITDA derived ONLY at the two ends where BOTH components exist', () => {
    const raw = mapCompanyFacts(TAG_SWITCHER, {});
    expect(raw.history!.revenue.points).toHaveLength(5);
    expect(raw.history!.ebitda.points.map((p) => p.end)).toEqual(['2022-12-31', '2023-12-31']);
    expect(raw.history!.ebitda.points.map((p) => p.value)).toEqual([275, 302]);
    expect(raw.history!.capex.points).toHaveLength(1);
  });

  it('the MIN_HISTORY_POINTS gate: 2 points ⇒ CAGR null (a history basis is not allowed)', () => {
    const two = buildAnnualSeries(
      { cik: 9, entityName: 'x', facts: { 'us-gaap': { Revenues: { units: { USD: [
        fy('2022-01-01', '2022-12-31', 100, '2023-02-15'),
        fy('2023-01-01', '2023-12-31', 110, '2024-02-15'),
      ] } } } } } as unknown as CompanyFacts,
      'revenue', REV_CHAIN, { kind: 'duration' },
    );
    expect(usablePoints(two)).toBe(2);
    expect(MIN_HISTORY_POINTS).toBe(3);
    expect(cagrOverTrueSpan(two)).toBeNull();
  });

  it('sign-flip endpoints ⇒ CAGR null (no geometric rate through zero)', () => {
    const flip = buildAnnualSeries(
      { cik: 9, entityName: 'x', facts: { 'us-gaap': { OperatingIncomeLoss: { units: { USD: [
        fy('2021-01-01', '2021-12-31', -50, '2022-02-15'),
        fy('2022-01-01', '2022-12-31', 10, '2023-02-15'),
        fy('2023-01-01', '2023-12-31', 60, '2024-02-15'),
      ] } } } } } as unknown as CompanyFacts,
      'operating_income', ['OperatingIncomeLoss'], { kind: 'duration' },
    );
    expect(usablePoints(flip)).toBe(3);
    expect(cagrOverTrueSpan(flip)).toBeNull();
  });

  it('deriveSeries drops mixed-unit components instead of combining currencies', () => {
    const usd = buildAnnualSeries(TAG_SWITCHER, 'revenue', REV_CHAIN, { kind: 'duration' });
    const eur = { ...usd, unit: 'EUR' };
    const d = deriveSeries('bogus', [usd, eur], ([a, b]) => a + b);
    expect(d.points).toHaveLength(0);
    expect(d.notes.some((n) => n.includes('mixed component units'))).toBe(true);
  });
});
