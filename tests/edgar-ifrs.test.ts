/**
 * Phase 1+ — IFRS (ESEF) xBRL-JSON → RawHistoricals mapping. Verifies headline figures from a
 * committed ESEF fixture, that dimensional (segment) facts are excluded in favour of totals,
 * 'esef' provenance, and the realistic-sparsity gap path (D&A / debt / NWC often untagged).
 */

import { describe, it, expect } from 'vitest';
import { mapIfrsReport } from '../lib/edgar/mapIfrs';
import { rankEsefMatches, type EsefTickerEntry, type XbrlJsonReport } from '../lib/edgar/esef';
import sample from './fixtures/esef-report-sample.json';
import extensionSample from './fixtures/esef-report-extension-sample.json';
import rollupSample from './fixtures/esef-report-rollup-sample.json';

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

describe('mapIfrsReport — deep extraction (notes / extension / dimensional)', () => {
  // Fixture: D&A only via the cash-flow adjustment tag (layer b); net debt only via an issuer
  // extension with a trap ratio sibling (layer c); current assets only via component
  // reconstruction (layer d); capex genuinely absent (→ gap).
  const ext = mapIfrsReport(extensionSample as unknown as XbrlJsonReport, { entityName: 'ExtCo', reportUrl: 'https://filings.xbrl.org/x/view' });

  it('recovers D&A from the cash-flow-statement adjustment line (expanded ifrs-full chain)', () => {
    expect(ext.da?.value).toBeCloseTo(50, 6);
    expect(ext.da?.provenance.tag).toBe('ifrs-full:AdjustmentsForDepreciationAndAmortisationExpense');
    expect(ext.ltm_ebitda?.value).toBeCloseTo(200, 6);     // 150 operating profit + 50 D&A
  });

  it('recovers net debt from an issuer extension tag, rejecting the trap ratio sibling', () => {
    expect(ext.net_debt?.value).toBeCloseTo(200, 6);        // company:NetDebt, NOT the 3.5 ratio
    expect(ext.net_debt?.provenance.tag).toBe('company:NetDebt');
    expect(ext.net_debt?.provenance.taxonomy).toBe('company');
    expect(ext.net_debt?.provenance.detail).toMatch(/extension company:NetDebt matched/);
  });

  it('reconstructs current assets from components when the total is untagged (NWC derived)', () => {
    expect(ext.nwc?.value).toBeCloseTo(100, 6);             // CA 280 (80+120+30+50 cash) − CL 180
    expect(ext.nwc?.provenance.detail).toMatch(/reconstructed/);
  });

  it('leaves a genuinely-absent field (capex) as a gap — never a guess', () => {
    expect(ext.capex).toBeNull();
    expect(ext.capex_pct_revenue).toBeNull();
    expect(ext.gaps).toContain('Capex %');
  });

  // Fixture: borrowings only as dimensional members by instrument (layer e) + a separate lease
  // liability folded into net debt (IFRS 16). No company:NetDebt, so the derivation path runs.
  const roll = mapIfrsReport(rollupSample as unknown as XbrlJsonReport, { entityName: 'RollCo' });

  it('rolls up borrowings across one axis, excluding the OIM default/domain member', () => {
    // 100 bank + 80 bonds = 180 (NOT 360 — the 180 domain member is excluded), + 20 lease = 200.
    expect(roll.gross_debt?.value).toBeCloseTo(200, 6);
    expect(roll.gross_debt?.provenance.detail).toMatch(/lease liabilities/);
    expect(roll.gross_debt?.provenance.detail).toMatch(/IFRS 16/);
    expect(roll.net_debt?.value).toBeCloseTo(150, 6);       // 200 − 50 cash
  });

  it('honours includeLeasesInDebt: false (borrowings only)', () => {
    const noLease = mapIfrsReport(rollupSample as unknown as XbrlJsonReport, { includeLeasesInDebt: false });
    expect(noLease.gross_debt?.value).toBeCloseTo(180, 6);  // 100 + 80, no lease
    expect(noLease.net_debt?.value).toBeCloseTo(130, 6);    // 180 − 50
  });
});

describe('mapIfrsReport — adversarial-review regressions', () => {
  const DUR = '2024-01-01T00:00:00/2025-01-01T00:00:00';   // FY2024 full year
  const INST = '2025-01-01T00:00:00';                       // FY2024 closing instant
  type F = { value: string; dimensions: Record<string, string> };
  const f = (concept: string, value: number, period: string, extra: Record<string, string> = {}): F =>
    ({ value: String(value), dimensions: { concept, entity: 'lei:X', period, unit: 'iso4217:EUR', ...extra } });
  const report = (facts: Record<string, F>): XbrlJsonReport => ({ facts } as unknown as XbrlJsonReport);
  const anchor = { rev: f('ifrs-full:Revenue', 1_000_000_000, DUR), op: f('ifrs-full:ProfitLossFromOperatingActivities', 150_000_000, DUR) };

  it("does not sign-flip a net-CASH issuer: 'NetFinancialPosition' is not treated as net debt", () => {
    const r = mapIfrsReport(report({ ...anchor,
      borrow: f('ifrs-full:NoncurrentBorrowings', 20_000_000, INST),
      cash: f('ifrs-full:CashAndCashEquivalents', 200_000_000, INST),
      nfp: f('company:NetFinancialPosition', 180_000_000, INST) }));
    expect(r.net_debt?.value).toBeCloseTo(-180, 6);          // derived 20 − 200 (net cash), NOT +180
  });

  it('extension tie-break prefers the largest (the total), not the shortest-named sub-line', () => {
    const r = mapIfrsReport(report({ ...anchor,
      sub: f('company:Debt', 40_000_000, INST),
      total: f('company:TotalBorrowings', 520_000_000, INST),
      cash: f('ifrs-full:CashAndCashEquivalents', 100_000_000, INST) }));
    expect(r.gross_debt?.value).toBeCloseTo(520, 6);         // TotalBorrowings, not the 40 sub-line
    expect(r.net_debt?.value).toBeCloseTo(420, 6);
  });

  it('does NOT add ifrs-full leases on top of an issuer-extension total (ambiguous lease treatment)', () => {
    const r = mapIfrsReport(report({ ...anchor,
      total: f('company:TotalFinancialDebt', 500_000_000, INST),
      leaseNc: f('ifrs-full:NoncurrentLeaseLiabilities', 100_000_000, INST),
      leaseC: f('ifrs-full:CurrentLeaseLiabilities', 20_000_000, INST),
      cash: f('ifrs-full:CashAndCashEquivalents', 100_000_000, INST) }));
    expect(r.gross_debt?.value).toBeCloseTo(500, 6);         // NOT 620
    expect(r.net_debt?.value).toBeCloseTo(400, 6);           // 500 − 100, NOT 520
    expect(r.gross_debt?.provenance.detail).toMatch(/NOT added|verify/i);
  });

  it('does not map a standard/national-taxonomy concept (frc:) as the entity figure → gap', () => {
    const r = mapIfrsReport(report({ ...anchor,
      frc: f('frc:Debt', 9_000_000, INST),
      cash: f('ifrs-full:CashAndCashEquivalents', 10_000_000, INST) }));
    expect(r.net_debt).toBeNull();                            // frc:Debt excluded, not 9 or −1
    expect(r.gaps).toContain('Net debt at entry');
  });

  it('roll-up requires reconciliation to a reported total member — a partial set stays a gap', () => {
    // Only one leaf member, no domain/total member → cannot validate completeness → gap.
    const r = mapIfrsReport(report({ ...anchor,
      m1: f('ifrs-full:Borrowings', 100_000_000, INST, { 'ifrs-full:ClassesOfBorrowingsAxis': 'company:BankLoansMember' }),
      cash: f('ifrs-full:CashAndCashEquivalents', 50_000_000, INST) }));
    expect(r.net_debt).toBeNull();
    expect(r.gaps).toContain('Net debt at entry');
  });

  it('roll-up keeps legitimate leaf members whose name contains "total" (anchored default-member regex)', () => {
    const r = mapIfrsReport(report({ ...anchor,
      trs: f('ifrs-full:Borrowings', 120_000_000, INST, { 'ifrs-full:ClassesOfBorrowingsAxis': 'company:TotalReturnSwapFinancingMember' }),
      rcf: f('ifrs-full:Borrowings', 60_000_000, INST, { 'ifrs-full:ClassesOfBorrowingsAxis': 'company:RevolvingFacilityMember' }),
      dom: f('ifrs-full:Borrowings', 180_000_000, INST, { 'ifrs-full:ClassesOfBorrowingsAxis': 'company:BorrowingsDomainMember' }),
      cash: f('ifrs-full:CashAndCashEquivalents', 50_000_000, INST) }));
    expect(r.gross_debt?.value).toBeCloseTo(180, 6);         // 120 TRS + 60 RCF reconcile to the 180 domain
    expect(r.net_debt?.value).toBeCloseTo(130, 6);
  });

  it('a partial-period (ROU-only) extension D&A subtotal is rejected → D&A gap, never a guess', () => {
    const r = mapIfrsReport(report({ ...anchor,
      rou: f('company:DepreciationAndAmortisationOfRightOfUseAssets', 30_000_000, DUR) }));
    expect(r.da).toBeNull();
    expect(r.gaps).toEqual(expect.arrayContaining(['D&A %', 'LTM EBITDA']));
  });

  it('roll-up with TWO total-like members (subtotal + group total) is ambiguous → gap, not a wrong total', () => {
    const r = mapIfrsReport(report({ ...anchor,
      agg: f('ifrs-full:Borrowings', 120_000_000, INST, { 'ifrs-full:ClassesOfBorrowingsAxis': 'company:AggregatedMember' }),
      bank: f('ifrs-full:Borrowings', 70_000_000, INST, { 'ifrs-full:ClassesOfBorrowingsAxis': 'company:BankMember' }),
      bond: f('ifrs-full:Borrowings', 50_000_000, INST, { 'ifrs-full:ClassesOfBorrowingsAxis': 'company:BondMember' }),
      grp: f('ifrs-full:Borrowings', 200_000_000, INST, { 'ifrs-full:ClassesOfBorrowingsAxis': 'company:ConsolidatedMember' }),
      cash: f('ifrs-full:CashAndCashEquivalents', 50_000_000, INST) }));
    expect(r.net_debt).toBeNull();                         // two total members → cannot pick → gap (not 70)
    expect(r.gaps).toContain('Net debt at entry');
  });

  it('excludes a national-taxonomy concept bound to a GENERIC prefix via its namespace URI', () => {
    const rep = { documentInfo: { namespaces: { 'uk-core': 'http://xbrl.frc.org.uk/fr/2023-01-01/core' } },
      facts: { ...anchor,
        nat: f('uk-core:NetDebt', 9_000_000, INST),         // FRC taxonomy under a generic 'uk-core' prefix
        cash: f('ifrs-full:CashAndCashEquivalents', 10_000_000, INST),
        borrow: f('ifrs-full:NoncurrentBorrowings', 40_000_000, INST) } } as unknown as XbrlJsonReport;
    const r = mapIfrsReport(rep);
    expect(r.net_debt?.value).toBeCloseTo(30, 6);           // derived 40 − 10, NOT the 9 from uk-core:NetDebt
  });

  it('non-December fiscal year: balance sheet comes from the current year-end, not the prior', () => {
    const junDur = '2023-07-01T00:00:00/2024-07-01T00:00:00';  // FY ending 30-Jun-2024
    const closeInst = '2024-07-01T00:00:00';                    // 30-Jun-2024 (next-day midnight)
    const openInst = '2023-07-01T00:00:00';                     // 30-Jun-2023 (comparative)
    const r = mapIfrsReport(report({
      rev: f('ifrs-full:Revenue', 1_000_000_000, junDur),
      op: f('ifrs-full:ProfitLossFromOperatingActivities', 150_000_000, junDur),
      borrowClose: f('ifrs-full:NoncurrentBorrowings', 300_000_000, closeInst),
      cashClose: f('ifrs-full:CashAndCashEquivalents', 90_000_000, closeInst),
      borrowOpen: f('ifrs-full:NoncurrentBorrowings', 500_000_000, openInst),
      cashOpen: f('ifrs-full:CashAndCashEquivalents', 20_000_000, openInst) }));
    expect(r.fiscalYear).toBe(2024);
    expect(r.cash?.value).toBeCloseTo(90, 6);                  // current year-end, not the 20 prior
    expect(r.net_debt?.value).toBeCloseTo(210, 6);            // 300 − 90, not 480
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
