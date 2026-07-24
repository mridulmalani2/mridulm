/**
 * D5 — trading-anchor math + shares extraction + store wiring. The network leg is the
 * proxy's (Finnhub key server-side; 501 when unconfigured) — here the PURE parts are
 * pinned, plus the null-suppression honesty rules.
 */
import { describe, it, expect } from 'vitest';
import { computeTradingAnchor, sharesOutstanding } from '../lib/edgar/quote';
import { useEngine2Model } from '../store/engine2Model';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import type { CompanyFacts } from '../lib/edgar/client';

describe('D5 — computeTradingAnchor (pure)', () => {
  it('EV/EBITDA = (price × shares + net debt) ÷ FY EBITDA', () => {
    // 150 × 500m shares = 75,000m mcap + 5,000m net debt = 80,000m ÷ 8,000m = 10.0x
    const a = computeTradingAnchor(150, 500e6, 5000, 8000, false)!;
    expect(a.ev_ebitda).toBeCloseTo(10.0, 9);
    expect(a.shares_millions).toBe(500);
    expect(a.multi_class).toBe(false);
    expect(a.detail).toContain('Finnhub');
  });

  it('multi-class carries the caveat in the detail', () => {
    const a = computeTradingAnchor(100, 100e6, 0, 1000, true)!;
    expect(a.multi_class).toBe(true);
    expect(a.detail).toContain('MULTI-CLASS');
  });

  it('nulls on nonsense — zero/negative price, shares, EBITDA, or an implausible multiple', () => {
    expect(computeTradingAnchor(0, 100e6, 0, 1000, false)).toBeNull();
    expect(computeTradingAnchor(100, 0, 0, 1000, false)).toBeNull();
    expect(computeTradingAnchor(100, 100e6, 0, 0, false)).toBeNull();
    expect(computeTradingAnchor(100, 100e6, 0, 10, false)).toBeNull(); // 1000x > 60x band
    expect(computeTradingAnchor(0.01, 100e6, -900, 1000, false)).toBeNull(); // < 1x band
  });
});

describe('D5 — sharesOutstanding (dei)', () => {
  const facts = (sharesFacts: object[]): CompanyFacts => ({
    cik: 50, entityName: 'Sharey', facts: { dei: { EntityCommonStockSharesOutstanding: { units: { shares: sharesFacts } } }, 'us-gaap': {} },
  }) as unknown as CompanyFacts;

  it('single class: latest end wins', () => {
    const s = sharesOutstanding(facts([
      { end: '2025-06-30', val: 490e6 },
      { end: '2025-12-31', val: 500e6 },
    ]))!;
    expect(s.shares).toBe(500e6);
    expect(s.multiClass).toBe(false);
  });

  it('multi-class at the same date: SUM with the caveat; identical re-filed values deduped', () => {
    const s = sharesOutstanding(facts([
      { end: '2025-12-31', val: 400e6 },
      { end: '2025-12-31', val: 100e6 },
      { end: '2025-12-31', val: 400e6 }, // re-filed duplicate — not double-counted
    ]))!;
    expect(s.shares).toBe(500e6);
    expect(s.multiClass).toBe(true);
  });

  it('null when dei shares are absent', () => {
    expect(sharesOutstanding({ cik: 1, entityName: 'x', facts: {} } as unknown as CompanyFacts)).toBeNull();
  });
});

describe('D5 — store wiring: the anchor reaches DealFacts and the coherence gate', () => {
  const M = 1e6;
  const fy = (start: string, end: string, val: number) => ({ start, end, val: val * M, fy: 2025, fp: 'FY', form: '10-K', filed: '2026-02-15', accn: 'a' });
  const inst = (end: string, val: number) => ({ end, val: val * M, fy: 2025, fp: 'FY', form: '10-K', filed: '2026-02-15', accn: 'a' });
  const FIXTURE: CompanyFacts = {
    cik: 51, entityName: 'Anchored Inc',
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: [fy('2025-01-01', '2025-12-31', 1000)] } },
        OperatingIncomeLoss: { units: { USD: [fy('2025-01-01', '2025-12-31', 200)] } },
        DepreciationDepletionAndAmortization: { units: { USD: [fy('2025-01-01', '2025-12-31', 40)] } },
        PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [fy('2025-01-01', '2025-12-31', -45)] } },
        AssetsCurrent: { units: { USD: [inst('2025-12-31', 400)] } },
        LiabilitiesCurrent: { units: { USD: [inst('2025-12-31', 250)] } },
        CashAndCashEquivalentsAtCarryingValue: { units: { USD: [inst('2025-12-31', 90)] } },
        LongTermDebtNoncurrent: { units: { USD: [inst('2025-12-31', 300)] } },
        IncomeTaxExpenseBenefit: { units: { USD: [fy('2025-01-01', '2025-12-31', 30)] } },
        IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: { units: { USD: [fy('2025-01-01', '2025-12-31', 125)] } },
      },
    },
  } as unknown as CompanyFacts;

  it('anchor lands on facts; a rich suggestion (>15% above it) trips the warn end-to-end', () => {
    useEngine2Model.getState().reset();
    const raw = mapCompanyFacts(FIXTURE, { sicCode: '3711' });
    useEngine2Model.getState().importFromRaw(raw, { trading_anchor: 6.0 });
    const s = useEngine2Model.getState();
    expect(s.facts!.implied_trading_ev_ebitda).toBe(6.0);
    s.build();
    // large-cap suggestion is 12.0x vs a 6.0x anchor ⇒ entry_multiple_vs_trading warn
    expect(useEngine2Model.getState().output!.coherence.some((f) => f.code === 'entry_multiple_vs_trading')).toBe(true);
  });

  it('null anchor (unconfigured key) suppresses the gate — nothing renders, nothing warns', () => {
    useEngine2Model.getState().reset();
    const raw = mapCompanyFacts(FIXTURE, { sicCode: '3711' });
    useEngine2Model.getState().importFromRaw(raw, { trading_anchor: null });
    useEngine2Model.getState().build();
    expect(useEngine2Model.getState().output!.coherence.some((f) => f.code === 'entry_multiple_vs_trading')).toBe(false);
  });
});
