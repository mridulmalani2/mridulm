/**
 * Conformance: the TS stitch (lib/edgar/ltmStitch.ts) MUST equal the GOSPEL g2ltm fixtures
 * (tests/goldens/g2ltm/(i)-(ix), adjudicated by two independent passes — DERIVATION.md Phase G-2).
 * Goldens are gospel; ltmStitch.ts is wrong wherever it disagrees. Reads the committed input.json
 * (the CompanyFacts) per case and asserts stitchLtm(input) deep-equals expected.json (sans `case`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { stitchLtm } from '../lib/edgar/ltmStitch';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import { stalenessTier } from '../lib/format';
import type { CompanyFacts } from '../lib/edgar/client';

const ROOT = join(__dirname, '..');
const CASES = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix'];
const load = (c: string, f: string) => JSON.parse(readFileSync(join(ROOT, 'tests/goldens/g2ltm', c, f), 'utf8'));

describe('LTM stitch conformance — TS === gospel g2ltm goldens', () => {
  for (const c of CASES) {
    it(`(${c}) matches the adjudicated expected.json`, () => {
      const input = load(c, 'input.json');
      const expected = load(c, 'expected.json');
      const { case: _drop, ...want } = expected; // expected.json carries a `case` label the fn doesn't
      const got = stitchLtm(input.companyfacts, input.import_date);
      expect(got).toEqual(want);
    });
  }
});

// End-to-end production path (the goldens call stitchLtm directly and skip this): a REAL revenue tag
// (RevenueFromContractWithCustomer…, not Revenues), raw-dollar XBRL vals (×1e6), through
// mapCompanyFacts — proving tag-priority resolution + M() scaling + the LTM override + staleness.
describe('mapCompanyFacts integration — the stitch activates end-to-end', () => {
  const M = 1e6;
  const f = (start: string, end: string, val: number, filed: string, form = '10-Q', fy?: number, fp?: string) =>
    ({ start, end, val, accn: `a-${filed}`, filed, form, fy, fp });
  const concept = (pts: object[]) => ({ units: { USD: pts } });
  const FY = ['2024-01-01', '2024-12-31'] as const, C = ['2025-01-01', '2025-09-30'] as const, P = ['2024-01-01', '2024-09-30'] as const;
  const facts = { cik: 320193, entityName: 'SYNTH INC', facts: { 'us-gaap': {
    RevenueFromContractWithCustomerExcludingAssessedTax: concept([
      f(...FY, 1000 * M, '2025-02-15', '10-K', 2024, 'FY'), f(...C, 800 * M, '2025-11-01', '10-Q', 2025, 'Q3'),
      f(...P, 720 * M, '2024-11-01', '10-Q', 2024, 'Q3'), f(...P, 720 * M, '2025-11-01', '10-Q', 2025, 'Q3')]),
    OperatingIncomeLoss: concept([
      f(...FY, 200 * M, '2025-02-15', '10-K', 2024, 'FY'), f(...C, 165 * M, '2025-11-01', '10-Q', 2025, 'Q3'),
      f(...P, 150 * M, '2024-11-01', '10-Q', 2024, 'Q3'), f(...P, 150 * M, '2025-11-01', '10-Q', 2025, 'Q3')]),
    DepreciationDepletionAndAmortization: concept([
      f(...FY, 50 * M, '2025-02-15', '10-K', 2024, 'FY'), f(...C, 40 * M, '2025-11-01', '10-Q', 2025, 'Q3'),
      f(...P, 38 * M, '2024-11-01', '10-Q', 2024, 'Q3'), f(...P, 38 * M, '2025-11-01', '10-Q', 2025, 'Q3')]),
  } } } as unknown as CompanyFacts;

  it('LTM basis, fy_revenue 1080 / fy_ebitda 267 (millions), margin recomputed same-basis, as-of = anchor', () => {
    const raw = mapCompanyFacts(facts, { asOfDate: '2025-11-15' });
    expect(raw.basis).toBe('LTM');
    expect(raw.fy_revenue?.value).toBeCloseTo(1080, 6);   // 1000 + 800 − 720, M-scaled
    expect(raw.fy_ebitda?.value).toBeCloseTo(267, 6);     // (200+165−150) + (50+40−38)
    expect(raw.ebitda_margin?.value).toBeCloseTo(267 / 1080, 9); // LTM ÷ LTM, not FY
    expect(raw.as_of).toBe('2025-09-30');
    expect(stalenessTier(raw.as_of, new Date('2025-11-15'))).toBe('fresh'); // ~1.5m
  });

  it('the display tier ages from the as-of date, the figures do not move', () => {
    const raw = mapCompanyFacts(facts, { asOfDate: '2025-11-15' });
    expect(raw.fy_ebitda?.value).toBeCloseTo(267, 6);
    expect(raw.as_of).toBe('2025-09-30');
    expect(stalenessTier(raw.as_of, new Date('2027-06-01'))).toBe('stale'); // as_of vs a much later view
  });

  it('cross-span revenue TAG mismatch (FY Revenues vs interim RevenueFromContract) refuses → FY [audit minor 2]', () => {
    // FY resolves to `Revenues`; the interims resolve to the higher-priority
    // `RevenueFromContractWithCustomer…` — the winning tag differs across the stitch spans, mixing
    // two revenue DEFINITIONS. The stitch fails CLOSED. (Tested on stitchLtm directly — the unit
    // under test — since mapXbrl's own anchor resolution has separate tag-priority quirks.)
    const mixed = { cik: 1, entityName: 'MIX', facts: { 'us-gaap': {
      Revenues: concept([f(...FY, 1000 * M, '2025-02-15', '10-K', 2024, 'FY')]),
      RevenueFromContractWithCustomerExcludingAssessedTax: concept([
        f(...C, 800 * M, '2025-11-01', '10-Q', 2025, 'Q3'),
        f(...P, 720 * M, '2024-11-01', '10-Q', 2024, 'Q3'), f(...P, 720 * M, '2025-11-01', '10-Q', 2025, 'Q3')]),
      OperatingIncomeLoss: concept([
        f(...FY, 200 * M, '2025-02-15', '10-K', 2024, 'FY'), f(...C, 165 * M, '2025-11-01', '10-Q', 2025, 'Q3'),
        f(...P, 150 * M, '2024-11-01', '10-Q', 2024, 'Q3'), f(...P, 150 * M, '2025-11-01', '10-Q', 2025, 'Q3')]),
      DepreciationDepletionAndAmortization: concept([
        f(...FY, 50 * M, '2025-02-15', '10-K', 2024, 'FY'), f(...C, 40 * M, '2025-11-01', '10-Q', 2025, 'Q3'),
        f(...P, 38 * M, '2024-11-01', '10-Q', 2024, 'Q3'), f(...P, 38 * M, '2025-11-01', '10-Q', 2025, 'Q3')]),
    } } } as unknown as CompanyFacts;
    const r = stitchLtm(mixed, '2025-11-15', { taxonomy: 'us-gaap',
      revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues'],
      operatingIncome: ['OperatingIncomeLoss'], da: ['DepreciationDepletionAndAmortization'] });
    expect(r.stitched).toBe(false); // fail-closed, NOT a silently mixed LTM
    expect(r.revenue.basis).toBe('fy');
    expect(r.refusal_reason).toMatch(/tag differs across stitch spans/);
    // control: same tag on all spans DOES stitch (the mismatch, not the tags, is what refuses)
    const same = stitchLtm(mixed, '2025-11-15', { taxonomy: 'us-gaap',
      revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax'], // FY absent on this tag ⇒ no full year
      operatingIncome: ['OperatingIncomeLoss'], da: ['DepreciationDepletionAndAmortization'] });
    expect(same.refusal_reason).not.toMatch(/tag differs/); // refuses for no-FY, not tag-mix
  });
});
