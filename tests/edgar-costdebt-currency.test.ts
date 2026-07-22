/**
 * D4 implied cost of debt (banded sanity anchor) + D6 currency honesty + NOL floor.
 */
import { describe, it, expect } from 'vitest';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import { draftModelFromHistoricals } from '../lib/edgar/buildModel';
import type { CompanyFacts } from '../lib/edgar/client';

const M = 1e6;
const fy = (start: string, end: string, val: number, filed = '2024-02-15') => ({
  start, end, val: val * M, fy: 2023, fp: 'FY', form: '10-K', filed, accn: `a-${filed}`,
});
const inst = (end: string, val: number, filed = '2024-02-15') => ({
  end, val: val * M, fy: 2023, fp: 'FY', form: '10-K', filed, accn: `a-${filed}`,
});

const base = (over: Record<string, object> = {}, unit = 'USD'): CompanyFacts => ({
  cik: 20, entityName: 'Debtful Co',
  facts: {
    'us-gaap': {
      Revenues: { units: { [unit]: [
        fy('2022-01-01', '2022-12-31', 950, '2023-02-15'),
        fy('2023-01-01', '2023-12-31', 1000),
      ] } },
      OperatingIncomeLoss: { units: { [unit]: [fy('2023-01-01', '2023-12-31', 180)] } },
      DepreciationDepletionAndAmortization: { units: { [unit]: [fy('2023-01-01', '2023-12-31', 40)] } },
      LongTermDebtNoncurrent: { units: { [unit]: [inst('2023-12-31', 380), inst('2022-12-31', 420, '2023-02-15')] } },
      LongTermDebtCurrent: { units: { [unit]: [inst('2023-12-31', 20), inst('2022-12-31', 20, '2023-02-15')] } },
      CashAndCashEquivalentsAtCarryingValue: { units: { [unit]: [inst('2023-12-31', 50)] } },
      InterestExpenseDebt: { units: { [unit]: [fy('2023-01-01', '2023-12-31', 25.2)] } },
      ...over,
    },
  },
}) as unknown as CompanyFacts;

describe('D4 — implied cost of existing debt', () => {
  it('rate = gross interest ÷ AVERAGE(beginning, ending) gross debt — same assembly both ends', () => {
    const r = mapCompanyFacts(base(), { sicCode: '3711' });
    // avg((380+20), (420+20)) = 420; 25.2/420 = 6.0%
    expect(r.implied_cost_of_debt?.value).toBeCloseTo(0.06, 10);
    expect(r.implied_cost_of_debt?.provenance.detail).toContain('avg(gross debt');
    expect(r.implied_cost_of_debt?.provenance.detail).toContain('approximate');
  });

  it('never computed from a NET interest line — absence of a gross concept ⇒ null', () => {
    const noGross = base();
    delete (noGross as any).facts['us-gaap'].InterestExpenseDebt;
    (noGross as any).facts['us-gaap'].InterestIncomeExpenseNet = { units: { USD: [fy('2023-01-01', '2023-12-31', -12)] } };
    const r = mapCompanyFacts(noGross, { sicCode: '3711' });
    expect(r.implied_cost_of_debt).toBeNull();
  });

  it('banded: a rate outside [1%, 15%] is suppressed', () => {
    const silly = base({ InterestExpenseDebt: { units: { USD: [fy('2023-01-01', '2023-12-31', 90)] } } });
    const r = mapCompanyFacts(silly, { sicCode: '3711' }); // 90/420 ≈ 21% > 15%
    expect(r.implied_cost_of_debt).toBeNull();
  });

  it('gated on materiality (gross debt > 0.5× EBITDA) and suppressed for financial SICs', () => {
    const tiny = base({
      LongTermDebtNoncurrent: { units: { USD: [inst('2023-12-31', 30)] } },
      LongTermDebtCurrent: { units: { USD: [] } },
      InterestExpenseDebt: { units: { USD: [fy('2023-01-01', '2023-12-31', 2)] } },
    });
    expect(mapCompanyFacts(tiny, { sicCode: '3711' }).implied_cost_of_debt).toBeNull(); // 30 < 110
    expect(mapCompanyFacts(base(), { sicCode: '6022' }).implied_cost_of_debt).toBeNull(); // bank
  });
});

describe('D6 — currency honesty + NOL floor', () => {
  it('a SEK filer surfaces currency_unsupported — never a silent USD fallback', () => {
    const r = mapCompanyFacts(base({}, 'SEK'), {});
    expect(r.currency_unsupported).toBe('SEK');
  });

  it('the unsupported currency BLOCKS Build via a meta missing entry with the reason', () => {
    const r = mapCompanyFacts(base({}, 'SEK'), {});
    const draft = draftModelFromHistoricals(r, {});
    expect(draft.provenance['meta.currency_unsupported']?.source).toBe('missing');
    expect(draft.provenance['meta.currency_unsupported']?.detail).toContain('SEK');
  });

  it('a modelled currency (EUR) sets no unsupported flag', () => {
    const r = mapCompanyFacts(base({}, 'EUR'), {});
    expect(r.currency_unsupported).toBeUndefined();
    expect(r.currency).toBe('EUR');
  });

  it('NOL is presented as a FLOOR (member-level detail invisible in companyfacts)', () => {
    const withNol = base({ OperatingLossCarryforwards: { units: { USD: [inst('2023-12-31', 75)] } } });
    const r = mapCompanyFacts(withNol, {});
    expect(r.nol_carryforward?.value).toBe(75);
    expect(r.nol_carryforward?.provenance.detail).toContain('≥ floor');
  });
});
