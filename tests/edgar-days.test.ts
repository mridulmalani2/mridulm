/**
 * D2 working-capital days (mapXbrl) vs the PHASE_D gating rules: 365 basis, one operating
 * NWC definition, purchases-preferred DPO, bundled-AP gap, services-SIC DIO note,
 * financial-SIC suppression, implausibility flags.
 */
import { describe, it, expect } from 'vitest';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import type { CompanyFacts } from '../lib/edgar/client';

const M = 1e6;
const fy = (start: string, end: string, val: number, filed = '2024-02-15') => ({
  start, end, val: val * M, fy: 2023, fp: 'FY', form: '10-K', filed, accn: `a-${filed}` ,
});
const inst = (end: string, val: number, filed = '2024-02-15') => ({
  end, val: val * M, fy: 2023, fp: 'FY', form: '10-K', filed, accn: `a-${filed}`,
});

const usd = (facts: object) => ({ units: { USD: Object.values(facts) } });

/** Manufacturer: full component set + consecutive prior-year inventory. */
const MAKER: CompanyFacts = {
  cik: 10, entityName: 'Maker Co',
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [fy('2023-01-01', '2023-12-31', 1460)] } },
      OperatingIncomeLoss: { units: { USD: [fy('2023-01-01', '2023-12-31', 292)] } },
      DepreciationDepletionAndAmortization: { units: { USD: [fy('2023-01-01', '2023-12-31', 73)] } },
      AssetsCurrent: { units: { USD: [inst('2023-12-31', 500)] } },
      LiabilitiesCurrent: { units: { USD: [inst('2023-12-31', 300)] } },
      CashAndCashEquivalentsAtCarryingValue: { units: { USD: [inst('2023-12-31', 100)] } },
      ShortTermBorrowings: { units: { USD: [inst('2023-12-31', 20)] } },
      AccountsReceivableNetCurrent: { units: { USD: [inst('2023-12-31', 160)] } },
      InventoryNet: { units: { USD: [inst('2023-12-31', 120), inst('2022-12-31', 100, '2023-02-15')] } },
      AccountsPayableCurrent: { units: { USD: [inst('2023-12-31', 90)] } },
      CostOfRevenue: { units: { USD: [fy('2023-01-01', '2023-12-31', 1095)] } },
    },
  },
} as unknown as CompanyFacts;

/** Bundled AP only — DPO must be a GAP with the note, never computed off the bundle. */
const BUNDLER: CompanyFacts = {
  cik: 11, entityName: 'Bundle Inc',
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [fy('2023-01-01', '2023-12-31', 730)] } },
      AssetsCurrent: { units: { USD: [inst('2023-12-31', 200)] } },
      LiabilitiesCurrent: { units: { USD: [inst('2023-12-31', 120)] } },
      CashAndCashEquivalentsAtCarryingValue: { units: { USD: [inst('2023-12-31', 40)] } },
      AccountsReceivableNetCurrent: { units: { USD: [inst('2023-12-31', 80)] } },
      InventoryNet: { units: { USD: [inst('2023-12-31', 60)] } },
      AccountsPayableAndAccruedLiabilitiesCurrent: { units: { USD: [inst('2023-12-31', 70)] } },
      CostOfRevenue: { units: { USD: [fy('2023-01-01', '2023-12-31', 365)] } },
    },
  },
} as unknown as CompanyFacts;

/** Services filer (SIC 7372): no inventory anywhere — DIO omitted with a note, not a gap. */
const SAAS: CompanyFacts = {
  cik: 12, entityName: 'Cloudy Ltd',
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [fy('2023-01-01', '2023-12-31', 365)] } },
      AssetsCurrent: { units: { USD: [inst('2023-12-31', 150)] } },
      LiabilitiesCurrent: { units: { USD: [inst('2023-12-31', 90)] } },
      CashAndCashEquivalentsAtCarryingValue: { units: { USD: [inst('2023-12-31', 50)] } },
      AccountsReceivableNetCurrent: { units: { USD: [inst('2023-12-31', 73)] } },
      AccountsPayableCurrent: { units: { USD: [inst('2023-12-31', 15)] } },
      CostOfRevenue: { units: { USD: [fy('2023-01-01', '2023-12-31', 91.25)] } },
    },
  },
} as unknown as CompanyFacts;

describe('D2 — operating NWC + days on a manufacturer (all components resolve)', () => {
  const r = mapCompanyFacts(MAKER, { sicCode: '3711' });

  it('operating NWC subtracts cash from CA and current debt from CL — one definition', () => {
    // (500 − 100) − (300 − 20) = 120
    expect(r.nwc?.value).toBeCloseTo(120, 9);
    expect(r.nwc?.provenance.detail).toContain('OPERATING NWC');
  });

  it('DSO = AR/rev × 365 = 40; DIO = inv/COGS × 365 = 40', () => {
    expect(r.dso?.value).toBeCloseTo((160 / 1460) * 365, 9);
    expect(r.dio?.value).toBeCloseTo((120 / 1095) * 365, 9);
  });

  it('DPO prefers purchases = COGS + ΔInventory when the consecutive prior year exists', () => {
    // purchases = 1095 + (120 − 100) = 1115; DPO = 90/1115 × 365
    expect(r.dpo?.value).toBeCloseTo((90 / 1115) * 365, 9);
    expect(r.dpo?.provenance.detail).toContain('purchases = COGS + ΔInventory');
    expect(r.days_notes.some((n) => n.includes('implausible'))).toBe(false);
  });
});

describe('D2 — gates', () => {
  it('bundled payables+accrued ⇒ DPO null with the %-fallback note; DSO/DIO still computed', () => {
    const r = mapCompanyFacts(BUNDLER, { sicCode: '2834' });
    expect(r.dpo).toBeNull();
    expect(r.days_notes.some((n) => n.includes('bundled payables'))).toBe(true);
    expect(r.dso?.value).toBeCloseTo((80 / 730) * 365, 9);
    expect(r.dio?.value).toBeCloseTo((60 / 365) * 365, 9);
  });

  it('services SIC with no inventory ⇒ DIO omitted WITH a note (not a blocking gap); DSO/DPO fine', () => {
    const r = mapCompanyFacts(SAAS, { sicCode: '7372' });
    expect(r.dio).toBeNull();
    expect(r.days_notes.some((n) => n.includes('services filer'))).toBe(true);
    expect(r.gaps.some((g) => /DIO/i.test(g))).toBe(false); // never blocks Build
    expect(r.dso?.value).toBeCloseTo((73 / 365) * 365, 9);
    expect(r.dpo?.value).toBeCloseTo((15 / 91.25) * 365, 9);
  });

  it('financial SIC ⇒ no days at all, with the sector note', () => {
    const r = mapCompanyFacts(MAKER, { sicCode: '6022' });
    expect(r.dso).toBeNull();
    expect(r.dio).toBeNull();
    expect(r.dpo).toBeNull();
    expect(r.days_notes.some((n) => n.includes('financial-sector'))).toBe(true);
  });

  it('implausible DSO (> 180) is FLAGGED, never silently suggested', () => {
    const slow: CompanyFacts = JSON.parse(JSON.stringify(MAKER));
    (slow as any).facts['us-gaap'].AccountsReceivableNetCurrent.units.USD[0].val = 800 * M;
    const r = mapCompanyFacts(slow, { sicCode: '3711' });
    expect(r.dso?.value).toBeGreaterThan(180);
    expect(r.days_notes.some((n) => n.includes('DSO') && n.includes('implausible'))).toBe(true);
  });
});
