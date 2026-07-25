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

  it('LTM basis, fy_revenue 1080 / fy_ebitda 267 (millions), margin recomputed same-basis, fresh badge', () => {
    const raw = mapCompanyFacts(facts, { asOfDate: '2025-11-15' });
    expect(raw.basis).toBe('LTM');
    expect(raw.fy_revenue?.value).toBeCloseTo(1080, 6);   // 1000 + 800 − 720, M-scaled
    expect(raw.fy_ebitda?.value).toBeCloseTo(267, 6);     // (200+165−150) + (50+40−38)
    expect(raw.ebitda_margin?.value).toBeCloseTo(267 / 1080, 9); // LTM ÷ LTM, not FY
    expect(raw.as_of).toBe('2025-09-30');
    expect(raw.staleness).toBe('fresh');
  });

  it('a stale import date ages the badge without moving the figures', () => {
    const raw = mapCompanyFacts(facts, { asOfDate: '2027-06-01' });
    expect(raw.basis).toBe('LTM');
    expect(raw.fy_ebitda?.value).toBeCloseTo(267, 6);
    expect(raw.staleness).toBe('stale'); // as_of 2025-09-30 vs 2027-06 ≈ 20m
  });
});
