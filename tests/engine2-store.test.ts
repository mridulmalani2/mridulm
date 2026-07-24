/**
 * E1 — the engine2 store lifecycle: import → auto-suggest → edit (YOU badges) → build
 * (one runModel; atomic output), with the missing-fact Build gate and re-suggest
 * never clobbering user decisions.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useEngine2Model } from '../store/engine2Model';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import type { CompanyFacts } from '../lib/edgar/client';

const M = 1e6;
const fy = (start: string, end: string, val: number, filed = '2026-02-15') => ({
  start, end, val: val * M, fy: Number(end.slice(0, 4)), fp: 'FY', form: '10-K', filed, accn: `a-${filed}`,
});
const inst = (end: string, val: number, filed = '2026-02-15') => ({
  end, val: val * M, fy: Number(end.slice(0, 4)), fp: 'FY', form: '10-K', filed, accn: `a-${filed}`,
});
const FIXTURE: CompanyFacts = {
  cik: 41, entityName: 'Storeful Inc',
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

const importFixture = (mutate?: (f: CompanyFacts) => void) => {
  const f: CompanyFacts = JSON.parse(JSON.stringify(FIXTURE));
  mutate?.(f);
  useEngine2Model.getState().importFromRaw(mapCompanyFacts(f, { sicCode: '3711' }));
};

beforeEach(() => useEngine2Model.getState().reset());

describe('engine2 store — the E1 lifecycle', () => {
  it('import auto-suggests: facts + badged assumptions land, output stays null until build', () => {
    importFixture();
    const s = useEngine2Model.getState();
    expect(s.facts?.fy_revenue).toBe(1020);
    expect(s.assumptions?.entry.entry_multiple).not.toBeNull();
    expect(s.basis['operations.growth']?.kind).toBe('history'); // 3 points ⇒ D1 gate passes
    expect(s.output).toBeNull();
  });

  it('build = ONE runModel call, atomic output; a later edit clears it (no stale outputs)', () => {
    importFixture();
    useEngine2Model.getState().build();
    const out = useEngine2Model.getState().output;
    expect(out).not.toBeNull();
    expect(out!.returns.sponsor_net.irr).not.toBeNull();
    const a = useEngine2Model.getState().assumptions!;
    useEngine2Model.getState().editAssumptions({ ...a, exit: { ...a.exit, multiple: a.exit.multiple - 1 } }, ['exit.multiple']);
    expect(useEngine2Model.getState().output).toBeNull(); // outputs never survive an edit
    expect(useEngine2Model.getState().basis['exit.multiple'].kind).toBe('user');
  });

  it('the missing-fact gate: no net debt ⇒ build blocks with the MISSING message; confirmFact unblocks', () => {
    importFixture((f) => { delete (f as any).facts['us-gaap'].LongTermDebtNoncurrent; });
    const s = () => useEngine2Model.getState();
    expect(s().missingFacts).toContain('net_debt');
    s().build();
    expect(s().output).toBeNull();
    expect(s().error).toContain('MISSING');
    s().confirmFact('net_debt', 210);
    expect(s().missingFacts).not.toContain('net_debt');
    expect(s().basis['facts.net_debt'].kind).toBe('user');
    s().build();
    expect(s().output).not.toBeNull();
  });

  it('re-suggest never clobbers a YOU-owned group; non-owned groups refresh', () => {
    importFixture();
    const s = () => useEngine2Model.getState();
    const a = s().assumptions!;
    useEngine2Model.getState().editAssumptions({ ...a, exit: { ...a.exit, multiple: 7.25 } }, ['exit.multiple']);
    s().resuggest();
    expect(s().assumptions!.exit.multiple).toBe(7.25); // user decision preserved
    expect(s().basis['exit.multiple'].kind).toBe('user');
    expect(s().basis['operations.growth'].kind).toBe('history'); // refreshed suggestion basis
  });

  it('confirmFact keeps the derived margin consistent when revenue/EBITDA are confirmed', () => {
    importFixture((f) => { delete (f as any).facts['us-gaap'].Revenues; delete (f as any).facts['us-gaap'].OperatingIncomeLoss; });
    const s = () => useEngine2Model.getState();
    expect(s().missingFacts).toEqual(expect.arrayContaining(['fy_revenue', 'fy_ebitda']));
    s().confirmFact('fy_revenue', 1000);
    s().confirmFact('fy_ebitda', 250);
    expect(s().facts!.fy_ebitda_margin).toBeCloseTo(0.25, 12);
  });
});
