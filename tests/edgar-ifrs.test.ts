/**
 * Phase 1+ — IFRS (ESEF) xBRL-JSON → RawHistoricals mapping. Verifies headline figures from a
 * committed ESEF fixture, that dimensional (segment) facts are excluded in favour of totals,
 * 'esef' provenance, and the realistic-sparsity gap path (D&A / debt / NWC often untagged).
 */

import { describe, it, expect } from 'vitest';
import { mapIfrsReport } from '../lib/edgar/mapIfrs';
import { rankEsefMatches, type EsefTickerEntry, type XbrlJsonReport } from '../lib/edgar/esef';
import sample from './fixtures/esef-report-sample.json';

const report = sample as unknown as XbrlJsonReport;

describe('mapIfrsReport — headline figures (Europa SA, FY2023, €m)', () => {
  const r = mapIfrsReport(report, { entityName: 'Europa Manufacturing SA', reportUrl: 'https://filings.xbrl.org/x/view' });

  it('maps the face-statement IFRS concepts, scaled to millions', () => {
    expect(r.ltm_revenue?.value).toBeCloseTo(1200, 6);      // 1.2bn → 1200m (NOT the 500 segment)
    expect(r.ltm_ebitda?.value).toBeCloseTo(240, 6);        // 180 operating profit + 60 D&A
    expect(r.ebitda_margin?.value).toBeCloseTo(0.20, 6);
    expect(r.da?.value).toBeCloseTo(60, 6);
    expect(r.da_pct_revenue?.value).toBeCloseTo(0.05, 6);
    expect(r.capex?.value).toBeCloseTo(48, 6);
    expect(r.capex_pct_revenue?.value).toBeCloseTo(0.04, 6);
    expect(r.nwc?.value).toBeCloseTo(150, 6);               // 400 − 250
    expect(r.nwc_pct_revenue?.value).toBeCloseTo(0.125, 6);
    expect(r.gross_debt?.value).toBeCloseTo(335, 6);        // 300 noncurrent + 35 current
    expect(r.cash?.value).toBeCloseTo(80, 6);
    expect(r.net_debt?.value).toBeCloseTo(255, 6);
    expect(r.effective_tax_rate?.value).toBeCloseTo(0.21, 6); // 31.5 / 150
  });

  it('anchors on the latest fiscal year and detects the reporting currency', () => {
    expect(r.fiscalYear).toBe(2023);                        // FY2023, not the FY2022 facts present
    expect(r.currency).toBe('EUR');
  });

  it('excludes dimensional (segment) facts — uses the consolidated total', () => {
    expect(r.ltm_revenue?.value).not.toBeCloseTo(500, 3);   // the segment member fact is ignored
    expect(r.ltm_revenue?.value).not.toBeCloseTo(1700, 3);  // and not double-counted
  });

  it("tags provenance 'esef' with the IFRS concept + a filing link", () => {
    expect(r.ltm_revenue?.provenance.source).toBe('esef');
    expect(r.ltm_revenue?.provenance.tag).toBe('ifrs-full:Revenue');
    expect(r.ltm_revenue?.provenance.url).toContain('filings.xbrl.org');
    expect(r.gaps).toEqual([]);
  });
});

describe('rankEsefMatches — searches the ESEF-filer universe (surfaces the listed parent)', () => {
  const ENTITIES: EsefTickerEntry[] = [
    { lei: '549300MKFYEKVRWML317', name: 'UNILEVER PLC' },
    { lei: 'AAAA0000000000000001', name: 'UNILEVER FRANCE SAS' },
    { lei: '213800WFQ334R8UXUG83', name: 'VINCI' },
    { lei: '529900D6BF99LW9R2E68', name: 'SAP SE' },
  ];
  it('ranks the shorter/cleaner listed name first (the GLEIF-subsidiary bug)', () => {
    const m = rankEsefMatches(ENTITIES, 'unilever');
    expect(m[0].name).toBe('UNILEVER PLC');                 // the listed filer, not the subsidiary
    expect(m.map((x) => x.lei)).toContain('AAAA0000000000000001'); // both still offered
  });
  it('ranks an exact name first and honours an empty query', () => {
    expect(rankEsefMatches(ENTITIES, 'vinci')[0].name).toBe('VINCI');
    expect(rankEsefMatches(ENTITIES, '  ')).toEqual([]);
  });
});

describe('mapIfrsReport — realistic ESEF sparsity (notes often untagged)', () => {
  it('surfaces gaps for D&A / EBITDA / net debt / NWC and falls back on statutory tax', () => {
    const sparse: XbrlJsonReport = {
      facts: {
        rev: { value: '900000000', dimensions: { concept: 'ifrs-full:Revenue', period: '2023-01-01T00:00:00/2024-01-01T00:00:00', unit: 'iso4217:EUR' } },
        op: { value: '120000000', dimensions: { concept: 'ifrs-full:ProfitLossFromOperatingActivities', period: '2023-01-01T00:00:00/2024-01-01T00:00:00', unit: 'iso4217:EUR' } },
      },
    };
    const r = mapIfrsReport(sparse, { statutoryTaxRate: 0.25 });
    expect(r.ltm_revenue?.value).toBeCloseTo(900, 6);
    expect(r.ltm_ebitda).toBeNull();                        // no D&A → EBITDA is a gap, not a guess
    expect(r.net_debt).toBeNull();
    expect(r.gaps).toEqual(expect.arrayContaining(['LTM EBITDA', 'D&A %', 'Net debt at entry', 'NWC %']));
    expect(r.effective_tax_rate?.value).toBeCloseTo(0.25, 9);
    expect(r.effective_tax_rate?.provenance.source).toBe('default');
  });
});
