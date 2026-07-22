/**
 * Phase 1 — XBRL → RawHistoricals mapping on a committed companyfacts fixture (the highest-risk
 * correctness surface: a wrong tag → a wrong headline number). Verifies the headline figures,
 * single-fiscal-year alignment, per-field provenance, alias fallback, gap tracking (no silent
 * defaults), and the statutory tax fallback.
 */

import { describe, it, expect } from 'vitest';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import type { CompanyFacts } from '../lib/edgar/client';
import sample from './fixtures/companyfacts-sample.json';

const facts = sample as unknown as CompanyFacts;
const clone = (): CompanyFacts => JSON.parse(JSON.stringify(facts));

describe('mapCompanyFacts — headline figures (Northwind FY2023, $m)', () => {
  const r = mapCompanyFacts(facts);

  it('scales raw absolute USD to the engine millions unit', () => {
    expect(r.fy_revenue?.value).toBeCloseTo(1250, 6);              // 1.25bn → 1250m
    expect(r.fy_ebitda?.value).toBeCloseTo(250, 6);                // 187.5 opinc + 62.5 D&A
    expect(r.ebitda_margin?.value).toBeCloseTo(0.20, 6);            // 250 / 1250
    expect(r.da?.value).toBeCloseTo(62.5, 6);
    expect(r.da_pct_revenue?.value).toBeCloseTo(0.05, 6);
    expect(r.capex?.value).toBeCloseTo(50, 6);
    expect(r.capex_pct_revenue?.value).toBeCloseTo(0.04, 6);
    expect(r.nwc?.value).toBeCloseTo(150, 6);                       // 400 − 250
    expect(r.nwc_pct_revenue?.value).toBeCloseTo(0.12, 6);
    expect(r.gross_debt?.value).toBeCloseTo(335, 6);               // 300 + 25 + 10
    expect(r.cash?.value).toBeCloseTo(80, 6);
    expect(r.net_debt?.value).toBeCloseTo(255, 6);                 // 335 − 80
    expect(r.effective_tax_rate?.value).toBeCloseTo(0.21, 6);      // 31.5 / 150
    expect(r.nol_carryforward?.value).toBeCloseTo(40, 6);
  });

  it('anchors every figure to the same fiscal year (FY2023, period end 2023-12-31)', () => {
    expect(r.fiscalYear).toBe(2023);
    expect(r.periodEnd).toBe('2023-12-31');
    // All instant + flow figures carry the FY2023 period, not a mix of years.
    expect(r.fy_revenue?.provenance.period).toBe('2023-12-31');
    expect(r.net_debt?.provenance.period).toBe('2023-12-31');
    expect(r.nwc?.provenance.period).toBe('2023-12-31');
  });

  it('records EDGAR provenance with tag, form, accession and a filing link', () => {
    const p = r.fy_revenue!.provenance;
    expect(p.source).toBe('edgar');
    expect(p.tag).toBe('RevenueFromContractWithCustomerExcludingAssessedTax');
    expect(p.form).toBe('10-K');
    expect(p.accession).toBe('0001000000-24-000010');
    expect(p.url).toContain('/Archives/edgar/data/1000000/000100000024000010/');
    // Derived figures cite their source tags.
    expect(r.fy_ebitda?.provenance.detail).toContain('OperatingIncomeLoss');
    expect(r.net_debt?.provenance.detail).toContain('Gross debt − cash');
  });

  it('reports no gaps when everything is derivable', () => {
    expect(r.gaps).toEqual([]);
    expect(r.entityName).toBe('Northwind Industries Inc.');
    expect(r.currency).toBe('USD');
  });
});

describe('mapCompanyFacts — alias fallback', () => {
  it('falls back to Revenues when the primary revenue tag is absent', () => {
    const c = clone();
    const rev = c.facts['us-gaap']['RevenueFromContractWithCustomerExcludingAssessedTax'];
    delete c.facts['us-gaap']['RevenueFromContractWithCustomerExcludingAssessedTax'];
    c.facts['us-gaap']['Revenues'] = rev; // same data under the fallback tag
    const r = mapCompanyFacts(c);
    expect(r.fy_revenue?.value).toBeCloseTo(1250, 6);
    expect(r.fy_revenue?.provenance.tag).toBe('Revenues');
  });
});

describe('mapCompanyFacts — gaps are surfaced, never silently defaulted', () => {
  it('a missing capex concept becomes a Capex % gap (value null)', () => {
    const c = clone();
    delete c.facts['us-gaap']['PaymentsToAcquirePropertyPlantAndEquipment'];
    const r = mapCompanyFacts(c);
    expect(r.capex).toBeNull();
    expect(r.capex_pct_revenue).toBeNull();
    expect(r.gaps).toContain('Capex %');
  });

  it('a missing debt + cash set becomes a Net debt gap', () => {
    const c = clone();
    for (const t of ['LongTermDebtNoncurrent', 'LongTermDebtCurrent', 'ShortTermBorrowings']) delete c.facts['us-gaap'][t];
    const r = mapCompanyFacts(c);
    expect(r.net_debt).toBeNull();
    expect(r.gaps).toContain('Net debt at entry');
  });
});

describe('mapCompanyFacts — strict fiscal-year alignment (no cross-year drift)', () => {
  it('a concept missing at the revenue anchor becomes a gap, not a different-year substitution', () => {
    const c = clone();
    // Drop the FY2023 operating-income fact (keep FY2021/FY2022). Revenue still anchors FY2023.
    const oi = c.facts['us-gaap']['OperatingIncomeLoss'].units.USD;
    c.facts['us-gaap']['OperatingIncomeLoss'].units.USD = oi.filter((f) => f.end !== '2023-12-31');
    const r = mapCompanyFacts(c);
    expect(r.fiscalYear).toBe(2023);                 // revenue still anchors FY2023
    expect(r.fy_ebitda).toBeNull();                 // NOT a FY2022-opinc + FY2023-D&A blend
    expect(r.gaps).toContain('FY EBITDA');
  });

  it('a partial reporting period is never imported as a full year', () => {
    const facts = {
      cik: 1, entityName: 'StubCo', facts: {
        'us-gaap': {
          RevenueFromContractWithCustomerExcludingAssessedTax: {
            units: { USD: [{ start: '2023-07-01', end: '2023-12-31', val: 600000000, accn: 'x', fy: 2023, fp: 'FY', form: '10-K', filed: '2024-02-01' }] },
          },
        },
      },
    } as unknown as CompanyFacts;
    const r = mapCompanyFacts(facts);
    expect(r.fy_revenue).toBeNull();                // 184-day period rejected as a full year
    expect(r.gaps).toContain('FY revenue');
  });
});

describe('mapCompanyFacts — debt aliases do not double-count (Finding 4)', () => {
  it('ignores DebtCurrent when the disjoint specifics are present', () => {
    const c = clone();
    // Add DebtCurrent (total current debt — already includes the 25 of current LT maturities).
    c.facts['us-gaap']['DebtCurrent'] = { units: { USD: [{ end: '2023-12-31', val: 35000000, accn: 'x', fy: 2023, fp: 'FY', form: '10-K', filed: '2024-02-15' }] } };
    const r = mapCompanyFacts(c);
    expect(r.gross_debt?.value).toBeCloseTo(335, 6); // 300 + 25 + 10, NOT + 35 again (= 370)
    expect(r.net_debt?.value).toBeCloseTo(255, 6);
  });

  it('falls back to DebtCurrent only when the specifics are absent', () => {
    const c = clone();
    delete c.facts['us-gaap']['LongTermDebtCurrent'];
    delete c.facts['us-gaap']['ShortTermBorrowings'];
    c.facts['us-gaap']['DebtCurrent'] = { units: { USD: [{ end: '2023-12-31', val: 30000000, accn: 'x', fy: 2023, fp: 'FY', form: '10-K', filed: '2024-02-15' }] } };
    const r = mapCompanyFacts(c);
    expect(r.gross_debt?.value).toBeCloseTo(330, 6); // 300 noncurrent + 30 DebtCurrent fallback
  });
});

describe('mapCompanyFacts — foreign reporting currency (Finding 5)', () => {
  it('detects the filing unit as the reporting currency', () => {
    const c = clone();
    const rev = c.facts['us-gaap']['RevenueFromContractWithCustomerExcludingAssessedTax'].units.USD;
    delete (c.facts['us-gaap']['RevenueFromContractWithCustomerExcludingAssessedTax'].units as Record<string, unknown>).USD;
    c.facts['us-gaap']['RevenueFromContractWithCustomerExcludingAssessedTax'].units.EUR = rev;
    const r = mapCompanyFacts(c);
    expect(r.currency).toBe('EUR');
    expect(r.fy_revenue?.provenance.unit).toBe('EUR');
  });
});

describe('mapCompanyFacts — D&A reconstruction from components', () => {
  const instant = (val: number) => ({ units: { USD: [{ start: '2023-01-01', end: '2023-12-31', val, accn: 'x', fy: 2023, fp: 'FY', form: '10-K', filed: '2024-02-15' }] } });
  it('reconstructs D&A from depreciation + amortization when no combined concept is tagged', () => {
    const c = clone();
    delete c.facts['us-gaap']['DepreciationDepletionAndAmortization'];
    c.facts['us-gaap']['Depreciation'] = instant(50000000);
    c.facts['us-gaap']['AmortizationOfIntangibleAssets'] = instant(12500000);
    const r = mapCompanyFacts(c);
    expect(r.da?.value).toBeCloseTo(62.5, 6);                 // 50 + 12.5
    expect(r.da?.provenance.tag).toBe('derived:DA');
    expect(r.da?.provenance.detail).toMatch(/Depreciation \+ AmortizationOfIntangibleAssets/);
    expect(r.fy_ebitda?.value).toBeCloseTo(250, 6);         // 187.5 opinc + 62.5
    expect(r.gaps).not.toContain('D&A %');
  });
  it('does NOT reconstruct from depreciation alone (would understate D&A)', () => {
    const c = clone();
    delete c.facts['us-gaap']['DepreciationDepletionAndAmortization'];
    c.facts['us-gaap']['Depreciation'] = instant(50000000);  // no amortization component
    const r = mapCompanyFacts(c);
    expect(r.da).toBeNull();
    expect(r.gaps).toContain('D&A %');
  });
  it('rejects a sub-year (Q4 stub) component at the anchor end — never sums a 3-month with a 12-month figure', () => {
    const c = clone();
    delete c.facts['us-gaap']['DepreciationDepletionAndAmortization'];
    c.facts['us-gaap']['Depreciation'] = instant(50000000);  // full-year
    // Amortization tagged only as a 92-day stub ending on the anchor date (fp:'FY' but partial).
    c.facts['us-gaap']['AmortizationOfIntangibleAssets'] = { units: { USD: [{ start: '2023-10-01', end: '2023-12-31', val: 3125000, accn: 'x', fy: 2023, fp: 'FY', form: '10-K', filed: '2024-02-15' }] } };
    const r = mapCompanyFacts(c);
    expect(r.da).toBeNull();                                  // partial amort stub rejected → no blended D&A
    expect(r.gaps).toContain('D&A %');
  });
});

describe('mapCompanyFacts — finance leases in gross debt (US analogue of IFRS-16)', () => {
  const lease = (val: number) => ({ units: { USD: [{ end: '2023-12-31', val, accn: 'x', fy: 2023, fp: 'FY', form: '10-K', filed: '2024-02-15' }] } });
  it('adds finance (capital) lease liabilities to gross debt by default', () => {
    const c = clone();
    c.facts['us-gaap']['FinanceLeaseLiabilityNoncurrent'] = lease(20000000);
    c.facts['us-gaap']['FinanceLeaseLiabilityCurrent'] = lease(5000000);
    const r = mapCompanyFacts(c);
    expect(r.gross_debt?.value).toBeCloseTo(360, 6);          // 335 + 20 + 5
    expect(r.gross_debt?.provenance.detail).toMatch(/incl\. finance leases/);
    expect(r.net_debt?.value).toBeCloseTo(280, 6);            // 360 − 80
  });
  it('does NOT double-count when the debt concept already bundles capital leases', () => {
    const c = clone();
    const ltNon = c.facts['us-gaap']['LongTermDebtNoncurrent'];
    delete c.facts['us-gaap']['LongTermDebtNoncurrent'];
    c.facts['us-gaap']['LongTermDebtAndCapitalLeaseObligations'] = ltNon;  // lease-inclusive tag
    c.facts['us-gaap']['FinanceLeaseLiabilityNoncurrent'] = lease(20000000);
    const r = mapCompanyFacts(c);
    expect(r.gross_debt?.value).toBeCloseTo(335, 6);          // leases already inside → NOT + 20
  });
  it('honours includeFinanceLeasesInDebt: false', () => {
    const c = clone();
    c.facts['us-gaap']['FinanceLeaseLiabilityNoncurrent'] = lease(20000000);
    const r = mapCompanyFacts(c, { includeFinanceLeasesInDebt: false });
    expect(r.gross_debt?.value).toBeCloseTo(335, 6);          // unchanged
  });
});

describe('mapCompanyFacts — debt/lease edge cases (adversarial-review regressions)', () => {
  const instant = (val: number) => ({ units: { USD: [{ end: '2023-12-31', val, accn: 'x', fy: 2023, fp: 'FY', form: '10-K', filed: '2024-02-15' }] } });
  const onlyTotalDebt = (): CompanyFacts => {
    const c = clone();
    for (const t of ['LongTermDebtNoncurrent', 'LongTermDebtCurrent', 'ShortTermBorrowings']) delete c.facts['us-gaap'][t];
    return c;
  };

  it('keeps the aggregate LongTermDebt total (never collapses to the lease) and adds finance leases (lease-excluding)', () => {
    const c = onlyTotalDebt();
    c.facts['us-gaap']['LongTermDebt'] = instant(335000000);          // aggregate total only (excludes leases)
    c.facts['us-gaap']['FinanceLeaseLiabilityNoncurrent'] = instant(20000000);
    const r = mapCompanyFacts(c);
    expect(r.gross_debt?.value).toBeCloseTo(355, 6);                  // 335 total + 20 lease, NOT collapsed to 20
    expect(r.net_debt?.value).toBeCloseTo(275, 6);                    // 355 − 80, never net-cash
  });

  it('does NOT add finance leases to the ambiguous combined total (may already include them)', () => {
    const c = onlyTotalDebt();
    c.facts['us-gaap']['DebtLongtermAndShorttermCombinedAmount'] = instant(340000000);
    c.facts['us-gaap']['FinanceLeaseLiabilityNoncurrent'] = instant(20000000);
    const r = mapCompanyFacts(c);
    expect(r.gross_debt?.value).toBeCloseTo(340, 6);                  // leases NOT added on top of the ambiguous total
  });

  it('suppresses the CURRENT finance lease when current debt came from the DebtCurrent total', () => {
    const c = clone();
    delete c.facts['us-gaap']['LongTermDebtCurrent'];
    delete c.facts['us-gaap']['ShortTermBorrowings'];
    c.facts['us-gaap']['DebtCurrent'] = instant(33000000);            // total current debt (incl. current lease)
    c.facts['us-gaap']['FinanceLeaseLiabilityCurrent'] = instant(8000000);
    const r = mapCompanyFacts(c);
    expect(r.gross_debt?.value).toBeCloseTo(333, 6);                  // 300 ltNon + 33 DebtCurrent, NOT + 8 again
  });

  it('adds the NONCURRENT finance lease but suppresses only the bundled CURRENT slot (per-slot guard)', () => {
    const c = clone();
    const ltCur = c.facts['us-gaap']['LongTermDebtCurrent'];
    delete c.facts['us-gaap']['LongTermDebtCurrent'];
    delete c.facts['us-gaap']['ShortTermBorrowings'];
    c.facts['us-gaap']['LongTermDebtAndCapitalLeaseObligationsCurrent'] = ltCur;  // lease-inclusive CURRENT (=25)
    c.facts['us-gaap']['FinanceLeaseLiabilityNoncurrent'] = instant(20000000);
    const r = mapCompanyFacts(c);
    expect(r.gross_debt?.value).toBeCloseTo(345, 6);                  // 300 ltNon + 25 (incl cur lease) + 20 nc lease
  });
});

describe('mapCompanyFacts — statutory tax fallback (not a hard gap)', () => {
  it("uses the statutory default and flags provenance 'default' when no effective rate is derivable", () => {
    const c = clone();
    delete c.facts['us-gaap']['IncomeTaxExpenseBenefit'];
    const r = mapCompanyFacts(c, { statutoryTaxRate: 0.25 });
    expect(r.effective_tax_rate?.value).toBeCloseTo(0.25, 9);
    expect(r.effective_tax_rate?.provenance.source).toBe('default');
    expect(r.gaps).not.toContain('Effective tax rate'); // always have a defensible default
  });
});
