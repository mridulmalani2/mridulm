/**
 * D6 — IFRS-in-companyfacts (20-F filers): the two PHASE_D-mandated fixture shapes —
 * a EUR filer (happy path) and a non-modelled-currency filer (blocking badge).
 */
import { describe, it, expect } from 'vitest';
import { isIfrsCompanyFacts, mapCompanyFactsIfrs } from '../lib/edgar/mapCompanyFactsIfrs';
import type { CompanyFacts } from '../lib/edgar/client';

const M = 1e6;
const fy = (start: string, end: string, val: number, filed = '2024-03-15') => ({
  start, end, val: val * M, fy: Number(end.slice(0, 4)), fp: 'FY', form: '20-F', filed, accn: `a-${filed}`,
});
const inst = (end: string, val: number, filed = '2024-03-15') => ({
  end, val: val * M, fy: Number(end.slice(0, 4)), fp: 'FY', form: '20-F', filed, accn: `a-${filed}`,
});

const eurFiler = (unit = 'EUR'): CompanyFacts => ({
  cik: 30, entityName: 'Rheinwerk SE',
  facts: {
    'ifrs-full': {
      Revenue: { units: { [unit]: [
        fy('2021-01-01', '2021-12-31', 2000, '2022-03-15'),
        fy('2022-01-01', '2022-12-31', 2140, '2023-03-15'),
        fy('2023-01-01', '2023-12-31', 2290),
      ] } },
      ProfitLossFromOperatingActivities: { units: { [unit]: [fy('2023-01-01', '2023-12-31', 366)] } },
      DepreciationAndAmortisationExpense: { units: { [unit]: [fy('2023-01-01', '2023-12-31', 92)] } },
      PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities: { units: { [unit]: [fy('2023-01-01', '2023-12-31', -103)] } },
      CurrentAssets: { units: { [unit]: [inst('2023-12-31', 900)] } },
      CurrentLiabilities: { units: { [unit]: [inst('2023-12-31', 600)] } },
      CashAndCashEquivalents: { units: { [unit]: [inst('2023-12-31', 250)] } },
      CurrentBorrowings: { units: { [unit]: [inst('2023-12-31', 80)] } },
      NoncurrentBorrowings: { units: { [unit]: [inst('2023-12-31', 520)] } },
      LeaseLiabilities: { units: { [unit]: [inst('2023-12-31', 110)] } },
      IncomeTaxExpenseContinuingOperations: { units: { [unit]: [fy('2023-01-01', '2023-12-31', 78)] } },
      ProfitLossBeforeTax: { units: { [unit]: [fy('2023-01-01', '2023-12-31', 300)] } },
    },
  },
}) as unknown as CompanyFacts;

describe('D6 — IFRS 20-F filer in companyfacts (EUR happy path)', () => {
  const r = mapCompanyFactsIfrs(eurFiler(), { sicDescription: 'Industrial machinery' });

  it('routes: ifrs-full present + no us-gaap ⇒ IFRS mapper', () => {
    expect(isIfrsCompanyFacts(eurFiler())).toBe(true);
  });

  it('headline figures extract (previously NOTHING): revenue, EBITDA = OpProfit + D&A, capex magnitude', () => {
    expect(r.fy_revenue?.value).toBe(2290);
    expect(r.fy_ebitda?.value).toBeCloseTo(366 + 92, 9);
    expect(r.capex?.value).toBe(103); // cash-flow sign → magnitude
    expect(r.currency).toBe('EUR');
    expect(r.currency_unsupported).toBeUndefined();
  });

  it('gross debt = borrowings + IFRS-16 leases on a CLEAN base; net debt subtracts cash', () => {
    expect(r.gross_debt?.value).toBeCloseTo(520 + 80 + 110, 9);
    expect(r.gross_debt?.provenance.detail).toContain('incl. IFRS-16 leases');
    expect(r.net_debt?.value).toBeCloseTo(710 - 250, 9);
  });

  it('operating NWC per the D2 definition; effective tax from the filing; FY-only history note', () => {
    expect(r.nwc?.value).toBeCloseTo((900 - 250) - (600 - 80), 9); // 650 − 520 = 130
    expect(r.effective_tax_rate?.value).toBeCloseTo(78 / 300, 9);
    expect(r.history!.revenue.points).toHaveLength(3);
    expect(r.days_notes.some((n) => n.includes('FY-only'))).toBe(true);
  });

  it('a bundled BorrowingsAndLeaseLiabilities base never gets leases added on top', () => {
    const f = eurFiler();
    delete (f as any).facts['ifrs-full'].NoncurrentBorrowings;
    delete (f as any).facts['ifrs-full'].CurrentBorrowings;
    (f as any).facts['ifrs-full'].BorrowingsAndLeaseLiabilities = { units: { EUR: [inst('2023-12-31', 700)] } };
    const rb = mapCompanyFactsIfrs(f, {});
    expect(rb.gross_debt?.value).toBe(700); // NOT 700 + 110
    expect(rb.gross_debt?.provenance.detail).toContain('lease-inclusive');
  });
});

describe('D6 — non-modelled currency (SEK 20-F filer)', () => {
  it('extracts honestly but sets the BLOCKING currency_unsupported badge — no silent USD', () => {
    const r = mapCompanyFactsIfrs(eurFiler('SEK'), {});
    expect(r.currency_unsupported).toBe('SEK');
    expect(r.fy_revenue?.value).toBe(2290); // facts still shown — Build is what's blocked
  });
});
