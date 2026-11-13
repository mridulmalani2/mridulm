/**
 * The engine2 store lifecycle (v2.0.0): import facts → choose the hold → a BLANK draft →
 * enter or explicitly accept each input → build (one runModel; atomic output), with the
 * missing-fact gate and the blank-input gate both blocking Build.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useEngine2Model } from '../store/engine2Model';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import type { CompanyFacts } from '../lib/edgar/client';
import { enterDeal, enteredAssumptions } from './fixtures/entered-deal';
import { G12_ASSUMPTIONS } from './fixtures/g12-prof';

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

describe('engine2 store: the v2.0.0 lifecycle: blank until entered', () => {
  it('import lands FACTS only: no draft until the holding period is chosen, then every assumption is blank and Build is gated', () => {
    importFixture();
    const s = () => useEngine2Model.getState();
    expect(s().facts?.fy_revenue).toBe(1020);
    expect(s().assumptions).toBeNull(); // the holding period sizes every per-year input — it comes first
    s().setHoldYears(5);
    const a = s().assumptions!;
    expect(Number.isNaN(a.entry.entry_multiple!)).toBe(true);
    expect(a.operations.growth.every(Number.isNaN)).toBe(true);
    expect(Number.isNaN(a.tax.rate)).toBe(true);
    expect(a.structure.tranches).toEqual([]);
    expect(a.mip).toBeNull(); // optional features start ABSENT — never a default-on promote
    const blank = s().missing().map((m) => m.path);
    expect(blank).toEqual(expect.arrayContaining(['entry.entry_multiple', 'tax.rate', 'structure.tranches', 'entry.basis', 'structure.min_cash']));
    s().build();
    expect(s().output).toBeNull();
    expect(s().error).toMatch(/still blank/);
  });

  it('a suggestion is applied ONLY when accepted, and lands with its basis', () => {
    importFixture();
    const s = () => useEngine2Model.getState();
    s().setHoldYears(5);
    expect(s().suggestions['operations.growth']?.basis.kind).toBe('history'); // 3 filed years ⇒ the D1 gate passes
    expect(s().assumptions!.operations.growth.every(Number.isNaN)).toBe(true); // proposed, not applied
    s().acceptSuggestion('operations.growth');
    expect(s().assumptions!.operations.growth.every(Number.isFinite)).toBe(true);
    expect(s().basis['operations.growth'].kind).toBe('history');
    expect(s().missing().map((m) => m.path)).not.toContain('operations.growth');
  });

  it('accepting a proposal refreshes the proposals that follow it, and keeps AI proposals on screen', () => {
    importFixture();
    const s = () => useEngine2Model.getState();
    s().setHoldYears(5);
    // nothing follows the entry multiple until one is entered or accepted
    expect(s().suggestions['exit.multiple']).toBeUndefined();
    expect(s().suggestions['structure.tranches.0.pricing.base_rate']).toBeUndefined();
    // an AI proposal already on screen, for an input the cited catalogue does not cover
    useEngine2Model.setState({ aiProposals: { 'structure.min_cash': { value: 25, basis: { kind: 'ai', detail: 'test' } } } });
    s().resuggest();
    expect(s().suggestions['structure.min_cash']?.value).toBe(25);
    s().acceptSuggestion('entry.entry_multiple');
    expect(s().suggestions['exit.multiple']?.value).toBe(s().assumptions!.entry.entry_multiple);
    s().acceptSuggestion('structure.tranches');
    // each facility of the accepted template now has its own cited proposals
    expect(s().suggestions['structure.tranches.0.pricing.base_rate']?.basis.kind).toBe('convention');
    expect(s().suggestions['structure.min_cash']?.value).toBe(25);
    // and an edit elsewhere does not drop the AI proposal either
    const a = s().assumptions!;
    s().editAssumptions({ ...a, rollover_equity: 0 }, ['rollover_equity']);
    expect(s().suggestions['structure.min_cash']?.basis.kind).toBe('ai');
  });

  it('build = ONE runModel call once every input is entered; a later edit clears the output (no stale outputs)', () => {
    importFixture();
    enterDeal(enteredAssumptions());
    const s = () => useEngine2Model.getState();
    expect(s().missing()).toEqual([]);
    s().build();
    const out = s().output;
    expect(out).not.toBeNull();
    expect(out!.returns.sponsor_net.irr).not.toBeNull();
    const a = s().assumptions!;
    s().editAssumptions({ ...a, exit: { ...a.exit, multiple: a.exit.multiple - 1 } }, ['exit.multiple']);
    expect(s().output).toBeNull();
    expect(s().basis['exit.multiple'].kind).toBe('user');
  });

  it('the missing-fact gate: no net debt ⇒ build blocks with the MISSING message; confirmFact unblocks', () => {
    importFixture((f) => { delete (f as any).facts['us-gaap'].LongTermDebtNoncurrent; });
    const s = () => useEngine2Model.getState();
    enterDeal(enteredAssumptions());
    expect(s().missingFacts).toContain('net_debt');
    expect(s().facts!.net_debt).toBeNull(); // the gap is NULL in the object — no stand-in number
    s().build();
    expect(s().output).toBeNull();
    expect(s().error).toContain('MISSING');
    s().confirmFact('net_debt', 210);
    expect(s().missingFacts).not.toContain('net_debt');
    expect(s().basis['facts.net_debt'].kind).toBe('user');
    s().build();
    expect(s().output).not.toBeNull();
  });

  it('re-suggest refreshes the catalogue and NEVER touches an assumption', () => {
    importFixture();
    enterDeal(enteredAssumptions());
    const s = () => useEngine2Model.getState();
    const before = JSON.stringify(s().assumptions);
    s().resuggest();
    expect(JSON.stringify(s().assumptions)).toBe(before);
    // exit = entry follows what was ENTERED (9.0x), not a convention constant
    expect(s().suggestions['exit.multiple']?.value).toBe(9);
  });

  it('changing the hold keeps entered years and leaves NEW years blank (never copied forward: no invented ramp)', () => {
    importFixture();
    enterDeal(enteredAssumptions(5));
    const s = () => useEngine2Model.getState();
    s().setHoldYears(7);
    const g = s().assumptions!.operations.growth;
    expect(g.slice(0, 5)).toEqual([0.05, 0.05, 0.05, 0.05, 0.05]);
    expect(Number.isNaN(g[5]) && Number.isNaN(g[6])).toBe(true);
    expect(s().missing().map((m) => m.path)).toEqual(expect.arrayContaining(['operations.growth.5', 'operations.growth.6']));
  });

  it('confirmFact keeps the derived margin consistent when revenue/EBITDA are confirmed', () => {
    importFixture((f) => { delete (f as any).facts['us-gaap'].Revenues; delete (f as any).facts['us-gaap'].OperatingIncomeLoss; });
    const s = () => useEngine2Model.getState();
    expect(s().missingFacts).toEqual(expect.arrayContaining(['fy_revenue', 'fy_ebitda']));
    expect(s().facts!.fy_ebitda_margin).toBeNull(); // never a 0 sentinel
    s().confirmFact('fy_revenue', 1000);
    s().confirmFact('fy_ebitda', 250);
    expect(s().facts!.fy_ebitda_margin).toBeCloseTo(0.25, 12);
  });

  it('a forecast-only case starts with NO historical facts and builds once its lines are entered (G12-PROF through the store)', () => {
    const s = () => useEngine2Model.getState();
    s().startForecastOnly({ entity_name: 'Worked example', currency: 'USD', hold_years: 5 });
    expect(s().facts!.fy_ebitda).toBeNull();
    // with no history, the §7 drivers cannot run — the gate asks for each line's INPUT MODE,
    // never for a growth rate / margin / % that has nothing to apply to (§24.3 R1–R3)
    const blank = s().missing().map((m) => m.path);
    expect(blank).toEqual(expect.arrayContaining(['operations.lines.revenue', 'operations.lines.ebitda', 'operations.lines.da', 'operations.lines.capex', 'operations.lines.delta_nwc']));
    for (const p of ['operations.growth', 'operations.target_margin', 'operations.da_pct_revenue', 'operations.nwc.method', 'operations.margin_path']) expect(blank).not.toContain(p);
    enterDeal(G12_ASSUMPTIONS);
    expect(s().missing()).toEqual([]);
    s().build();
    expect(s().output!.valuation!.fundamentals!.npv).toBeCloseTo(64.3502211, 6);
  });
});
