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
    expect(r.ltm_revenue?.value).toBeCloseTo(1250, 6);              // 1.25bn → 1250m
    expect(r.ltm_ebitda?.value).toBeCloseTo(250, 6);                // 187.5 opinc + 62.5 D&A
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
    expect(r.ltm_revenue?.provenance.period).toBe('2023-12-31');
    expect(r.net_debt?.provenance.period).toBe('2023-12-31');
    expect(r.nwc?.provenance.period).toBe('2023-12-31');
  });

  it('records EDGAR provenance with tag, form, accession and a filing link', () => {
    const p = r.ltm_revenue!.provenance;
    expect(p.source).toBe('edgar');
    expect(p.tag).toBe('RevenueFromContractWithCustomerExcludingAssessedTax');
    expect(p.form).toBe('10-K');
    expect(p.accession).toBe('0001000000-24-000010');
    expect(p.url).toContain('/Archives/edgar/data/1000000/000100000024000010/');
    // Derived figures cite their source tags.
    expect(r.ltm_ebitda?.provenance.detail).toContain('OperatingIncomeLoss');
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
    expect(r.ltm_revenue?.value).toBeCloseTo(1250, 6);
    expect(r.ltm_revenue?.provenance.tag).toBe('Revenues');
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
