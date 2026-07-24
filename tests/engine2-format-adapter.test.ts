/**
 * E1 — the formatting boundary (SPEC §15 display rules; null ⇒ N/A, never sentinels)
 * and the RawHistoricals → DealFacts adapter (gaps stay gaps; suggest+runModel e2e).
 */
import { describe, it, expect } from 'vitest';
import { bps, fromPctInput, headroom, money, moneyIso, multiple, num, pct, staleness, toPctInput } from '../lib/format';
import { adaptRawHistoricals } from '../lib/engine2/factsAdapter';
import { suggestAssumptions } from '../lib/engine2/suggest';
import { runModel } from '../lib/engine2/facade';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import type { CompanyFacts } from '../lib/edgar/client';

describe('lib/format — §15 display boundary (snapshot rules)', () => {
  it('money: 1dp of millions, thousands separators, sign outside the symbol', () => {
    expect(money(1234.567, 'USD')).toBe('$1,234.6m');
    expect(money(-42.04, 'EUR')).toBe('−€42.0m');
    expect(money(0, 'GBP')).toBe('£0.0m');
    expect(money(null, 'USD')).toBe('N/A');
  });

  it('moneyIso: an UNSUPPORTED filing currency wears its ISO code, never a borrowed symbol', () => {
    expect(moneyIso(210838, 'SEK', 0)).toBe('SEK 210,838m');
    expect(moneyIso(-9169, 'SEK', 0)).toBe('−SEK 9,169m');
    expect(moneyIso(null, 'SEK')).toBe('N/A');
    expect(moneyIso(210838, 'SEK', 0)).not.toContain('$');
  });

  it('pct/multiple/bps/headroom: 1dp conventions; null ⇒ N/A — 9999/99 can never render', () => {
    expect(pct(0.159649)).toBe('16.0%');
    expect(pct(null)).toBe('N/A');
    expect(multiple(2.104)).toBe('2.1x');
    expect(multiple(null)).toBe('N/A');
    expect(bps(0.0375)).toBe('375bps');
    expect(headroom(-0.264)).toBe('−0.26x');
    expect(headroom(null)).toBe('N/A');
    expect(num(2026472.04)).toBe('2,026,472.0');
  });

  it('the raw-float bug class: toPctInput never emits 0.3478173110887373-style strings', () => {
    expect(toPctInput(0.3478173110887373)).toBe('34.78');
    expect(toPctInput(0.05)).toBe('5');
    expect(toPctInput(0.1)).toBe('10');
    expect(fromPctInput('34.78')).toBeCloseTo(0.3478, 12);
    expect(fromPctInput('5%')).toBeCloseTo(0.05, 12);
    expect(fromPctInput('garbage')).toBeNull();
  });

  it('negative zero never renders as −0.0', () => {
    expect(num(-0)).toBe('0.0');
    expect(pct(-0)).toBe('0.0%');
  });

  it('staleness label (D3): FY · ended · age', () => {
    expect(staleness(2025, '2025-09-27', new Date('2026-07-22'))).toBe('FY2025 · ended 2025-09-27 · 9 months ago');
    expect(staleness(undefined, undefined, new Date())).toBeNull();
  });
});

describe('E1 adapter — RawHistoricals → DealFacts (gaps stay gaps) → suggest → runModel', () => {
  const M = 1e6;
  const fy = (start: string, end: string, val: number, filed = '2026-02-15') => ({
    start, end, val: val * M, fy: Number(end.slice(0, 4)), fp: 'FY', form: '10-K', filed, accn: `a-${filed}`,
  });
  const inst = (end: string, val: number, filed = '2026-02-15') => ({
    end, val: val * M, fy: Number(end.slice(0, 4)), fp: 'FY', form: '10-K', filed, accn: `a-${filed}`,
  });
  const FIXTURE: CompanyFacts = {
    cik: 40, entityName: 'Adapterful Inc',
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: [
          fy('2023-01-01', '2023-12-31', 900, '2024-02-15'),
          fy('2024-01-01', '2024-12-31', 960, '2025-02-15'),
          fy('2025-01-01', '2025-12-31', 1020),
        ] } },
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

  it('adapts a real extraction: facts land, history maps by END date, no missing REQUIRED fields', () => {
    const raw = mapCompanyFacts(FIXTURE, { sicCode: '3711' });
    const { facts, missing } = adaptRawHistoricals(raw);
    expect(missing).toEqual([]);
    expect(facts.fy_revenue).toBe(1020);
    expect(facts.fy_ebitda).toBeCloseTo(240, 9);
    // net PP&E passes through when extracted; absent in this fixture ⇒ null (§8 fallback)
    expect(facts.net_ppe).toBeNull();
    expect(facts.history.map((h) => h.period_end)).toEqual(['2023-12-31', '2024-12-31', '2025-12-31']);
    expect(facts.history[0].ebitda).toBeNull(); // no 2023 OpInc — the cell stays a gap
    expect(facts.effective_tax_rate).toBeCloseTo(0.24, 9);
  });

  it('END-TO-END: extraction → adapter → suggest → runModel produces a coherent-ish model (no blocks, BS closes)', () => {
    const raw = mapCompanyFacts(FIXTURE, { sicCode: '3711' });
    const { facts } = adaptRawHistoricals(raw);
    const { assumptions } = suggestAssumptions(facts);
    const out = runModel(facts, assumptions);
    expect(out.coherence.filter((f) => f.severity === 'block')).toEqual([]);
    for (const bs of out.balance_sheet) expect(Math.abs(bs.check)).toBeLessThan(0.005);
    expect(out.returns.sponsor_net.irr).not.toBeNull();
  });

  it('a gap stays a gap: no net debt ⇒ net_debt in missing (Build-gating), placeholder never surfaces as fact', () => {
    const sparse: CompanyFacts = JSON.parse(JSON.stringify(FIXTURE));
    delete (sparse as any).facts['us-gaap'].LongTermDebtNoncurrent;
    const raw = mapCompanyFacts(sparse, { sicCode: '3711' });
    const { missing } = adaptRawHistoricals(raw);
    expect(missing).toContain('net_debt');
  });

  it('unsupported currency propagates as a missing/blocking entry', () => {
    const raw = mapCompanyFacts(FIXTURE, {});
    const { missing } = adaptRawHistoricals({ ...raw, currency_unsupported: 'SEK' });
    expect(missing).toContain('currency_unsupported');
  });

  it('extracted net PP&E reaches DealFacts (kills the §8 self-inflicted warn on real filers)', () => {
    const raw = mapCompanyFacts(FIXTURE, { sicCode: '3711' });
    const { facts } = adaptRawHistoricals({
      ...raw,
      net_ppe: { value: 480, provenance: { source: 'edgar', detail: 'PropertyPlantAndEquipmentNet' } },
    });
    expect(facts.net_ppe).toBe(480);
    const { assumptions } = suggestAssumptions(facts);
    const out = runModel(facts, assumptions);
    expect(out.coherence.some((f) => f.message.includes('PP&E seeded at 0'))).toBe(false);
  });
});
