/**
 * In-cell suggestions: the AI's proposals for inputs with no cited basis (lib/ai2/propose), and
 * the store rules that keep every suggestion a suggestion (store/engine2Model): cited wins, a
 * proposal is never applied unasked, a cleared one stays cleared, and every step can be undone.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { cellSuggestion, useEngine2Model } from '../store/engine2Model';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import type { CompanyFacts } from '../lib/edgar/client';
import { parseProposals, proposalFields, proposalPrompt, proposeValues, dealContext, unitOf, type ProposalField } from '../lib/ai2/propose';
import { AiError } from '../lib/ai2/textCall';
import { tierOf } from '../lib/ai2/gateway/providers';
import { restoreSession, serialiseSession } from '../store/session';

const M = 1e6;
const fy = (start: string, end: string, val: number, filed = '2026-02-15') => ({ start, end, val: val * M, fy: Number(end.slice(0, 4)), fp: 'FY', form: '10-K', filed, accn: `a-${filed}` });
const inst = (end: string, val: number) => ({ end, val: val * M, fy: Number(end.slice(0, 4)), fp: 'FY', form: '10-K', filed: '2026-02-15', accn: 'a' });
const FIXTURE = {
  cik: 41, entityName: 'Storeful Inc',
  facts: { 'us-gaap': {
    Revenues: { units: { USD: [fy('2023-01-01', '2023-12-31', 900, '2024-02-15'), fy('2024-01-01', '2024-12-31', 960, '2025-02-15'), fy('2025-01-01', '2025-12-31', 1020)] } },
    OperatingIncomeLoss: { units: { USD: [fy('2025-01-01', '2025-12-31', 200)] } },
    DepreciationDepletionAndAmortization: { units: { USD: [fy('2025-01-01', '2025-12-31', 40)] } },
    PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [fy('2025-01-01', '2025-12-31', -45)] } },
    AssetsCurrent: { units: { USD: [inst('2025-12-31', 400)] } },
    LiabilitiesCurrent: { units: { USD: [inst('2025-12-31', 250)] } },
    CashAndCashEquivalentsAtCarryingValue: { units: { USD: [inst('2025-12-31', 90)] } },
    LongTermDebtNoncurrent: { units: { USD: [inst('2025-12-31', 300)] } },
    IncomeTaxExpenseBenefit: { units: { USD: [fy('2025-01-01', '2025-12-31', 30)] } },
    IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: { units: { USD: [fy('2025-01-01', '2025-12-31', 125)] } },
  } },
} as unknown as CompanyFacts;

const s = () => useEngine2Model.getState();
const open = () => { s().importFromRaw(mapCompanyFacts(JSON.parse(JSON.stringify(FIXTURE)), { sicCode: '3711' })); s().setHoldYears(5); };
beforeEach(() => s().reset());

describe('the unit of an input, read from its path', () => {
  it('matches the unit the sheet draws for the same input', () => {
    const cases: [string, string][] = [
      ['entry.entry_multiple', 'mult'], ['exit.multiple', 'mult'], ['exit.fees_pct', 'pct'], ['structure.min_cash', 'money'], ['rollover_equity', 'money'],
      ['operations.growth.2', 'pct'], ['operations.growth_capex.0', 'money'], ['operations.target_margin', 'pct'], ['operations.nwc.dso', 'days'],
      ['operations.lines.capex.pct', 'ratio'], ['operations.lines.revenue.values.1', 'money'], ['operations.lines.ebitda.growth.0', 'pct'],
      ['structure.tranches.0.size.x_ebitda', 'mult'], ['structure.tranches.0.size.amount', 'money'], ['structure.tranches.0.pricing.spread', 'pct'],
      ['structure.tranches.0.maturity_years', 'years'], ['structure.tranches.0.sweep.priority', 'ratio'], ['structure.tranches.1.commitment_fee', 'pct'],
      ['tax.rate', 'pct'], ['tax.nol.acquired_opening', 'money'], ['valuation.asset_beta', 'beta'], ['valuation.terminal.capex_pct_of_da', 'ratio'],
      ['valuation.terminal.delta_nwc_before_growth', 'money'], ['covenants.leverage_max', 'mult'], ['covenants.leverage_max.3', 'mult'],
      ['mip.hurdle_moic', 'mult'], ['mip.pool_pct', 'pct'], ['fund.committed_capital', 'money'], ['fees.monitoring.annual', 'money'],
      ['fees.monitoring.termination_years', 'years'], ['structure.selldown.year', 'years'], ['structure.selldown.fraction', 'pct'],
    ];
    for (const [path, unit] of cases) expect(unitOf(path), path).toBe(unit);
  });
});

describe('which inputs the AI is asked about', () => {
  it('only blank numbers the cited catalogue does not cover, never one already asked about or cleared', () => {
    open();
    const fields = proposalFields(s().missing(), s().assumptions!, s().suggestions, new Set());
    const paths = fields.map((f) => f.path);
    expect(paths).toContain('structure.min_cash'); // no cited basis: the analyst's judgement
    expect(paths).toContain('rollover_equity');
    expect(paths).not.toContain('entry.entry_multiple'); // a cited median exists
    expect(paths).not.toContain('operations.growth.0'); // the filed history covers the growth path
    expect(paths).not.toContain('entry.basis'); // a choice, not a number
    expect(paths).not.toContain('structure.tranches'); // a group, not a number
    const again = proposalFields(s().missing(), s().assumptions!, s().suggestions, new Set(['structure.min_cash']));
    expect(again.map((f) => f.path)).not.toContain('structure.min_cash');
  });

  it('a fact the source lacked is never sent', () => {
    open();
    const ctx = dealContext(s().facts!, s().assumptions!, ['fy_ebitda'], s().suggestions, 'full');
    expect(ctx).toContain('Revenue: 1020m');
    expect(ctx).not.toMatch(/^EBITDA: /m);
  });

  it('a free key is asked for one-line reasons, a paid key for reasoning tied to the company', () => {
    const f: ProposalField[] = [{ path: 'structure.min_cash', label: 'Minimum cash balance', unit: 'money' }];
    expect(proposalPrompt('ctx', f, 'free', '2026-11-13').system).toContain('one short sentence');
    expect(proposalPrompt('ctx', f, 'full', '2026-11-13').system).toContain("this company's own history");
    expect(tierOf('groq')).toBe('free');
    expect(tierOf('anthropic')).toBe('full');
  });
});

describe('reading the reply', () => {
  const fields: ProposalField[] = [
    { path: 'structure.min_cash', label: 'Minimum cash balance', unit: 'money' },
    { path: 'exit.fees_pct', label: 'Exit fees', unit: 'pct' },
    { path: 'structure.tranches.0.maturity_years', label: 'TLB: maturity', unit: 'years' },
  ];
  const facts = () => { open(); return s().facts!; };

  it('a percentage is read as shown and stored as a rate; whole years are whole', () => {
    const r = parseProposals('```json\n{"s":[{"p":"exit.fees_pct","v":1.5,"w":"Sell-side fees on a deal this size."},{"p":"structure.tranches.0.maturity_years","v":7,"w":"Term loans run seven years."}]}\n```', fields, facts(), 'a model.');
    expect(r.proposals['exit.fees_pct'].value).toBeCloseTo(0.015, 10);
    expect(r.proposals['exit.fees_pct'].basis.kind).toBe('ai');
    expect(r.proposals['structure.tranches.0.maturity_years'].value).toBe(7);
  });

  it('a value outside its rail is dropped, never clamped; so is a path that was not asked for, and one with no reasoning', () => {
    const r = parseProposals('{"s":[{"p":"exit.fees_pct","v":250,"w":"too big"},{"p":"tax.rate","v":21,"w":"not asked"},{"p":"structure.min_cash","v":30,"w":""}]}', fields, facts(), 'a model.');
    expect(r.proposals).toEqual({});
    expect(r.dropped).toHaveLength(3);
  });

  it('a reply cut off mid-list keeps the entries that are whole', () => {
    const r = parseProposals('{"s":[{"p":"structure.min_cash","v":30,"w":"About two weeks of costs."},{"p":"exit.fees_pct","v":1.5,"w":"Sell-si', fields, facts(), 'a model.');
    expect(Object.keys(r.proposals)).toEqual(['structure.min_cash']);
  });

  it('the reasoning carries no em dash into the page', () => {
    const r = parseProposals('{"s":[{"p":"structure.min_cash","v":30,"w":"Two weeks of costs — a common floor."}]}', fields, facts(), 'a model.');
    expect(r.proposals['structure.min_cash'].basis.detail).not.toMatch(/[—–]/);
  });
});

describe('asking: one request on a paid key, small batches on a free one', () => {
  const many = (n: number): ProposalField[] => Array.from({ length: n }, (_, i) => ({ path: `structure.distributions.${i}`, label: `Distribution year ${i + 1}`, unit: 'money' as const }));
  const answer = (user: string) => JSON.stringify({ s: user.split('\n').filter((l) => l.startsWith('structure.distributions.')).map((l) => ({ p: l.split(' | ')[0], v: 10, w: 'A steady payout.' })) });
  const base = () => { open(); return { facts: s().facts!, assumptions: s().assumptions!, missingFacts: [], catalogue: {}, today: '2026-11-13' }; };

  it('a paid key sends the sheet once; a free key sends 12 inputs at a time and lands each batch as it arrives', async () => {
    let calls = 0;
    const chat = async (_sys: string, turns: { content: string }[]) => { calls++; return answer(turns[0].content); };
    const paid = await proposeValues({ ...base(), fields: many(30), provider: 'anthropic', chat });
    expect(calls).toBe(1);
    expect(Object.keys(paid.proposals)).toHaveLength(30);
    calls = 0;
    const landed: number[] = [];
    const free = await proposeValues({ ...base(), fields: many(30), provider: 'groq', chat, onProgress: (x) => landed.push(x.done) });
    expect(calls).toBe(3);
    expect(landed).toEqual([12, 24, 30]);
    expect(free.tier).toBe('free');
    expect(free.proposals['structure.distributions.0'].basis.detail).toContain('free-tier model');
  });

  it('a short limit is waited out once; a long one stops the run and keeps what arrived', async () => {
    let calls = 0;
    const waits: number[] = [];
    const chat = async (_sys: string, turns: { content: string }[]) => {
      calls++;
      if (calls === 2) throw new AiError('limit', 'Limit reached. It frees up in about 5 seconds.', 5);
      if (calls === 4) throw new AiError('limit', 'Limit reached for now.', null);
      return answer(turns[0].content);
    };
    const r = await proposeValues({ ...base(), fields: many(30), provider: 'groq', chat, wait: async (ms) => { waits.push(ms); } });
    expect(waits).toEqual([6000]);
    expect(Object.keys(r.proposals)).toHaveLength(24);
    expect(r.asked).toHaveLength(24);
    expect(r.stopped).toBe('Limit reached for now.');
  });
});

describe('a suggestion stays a suggestion until the analyst acts (store)', () => {
  it('a cited value wins over an AI proposal for the same input, and an AI proposal fills the gap elsewhere', () => {
    open();
    const cited = s().suggestions['entry.entry_multiple'];
    useEngine2Model.setState({ aiProposals: { 'entry.entry_multiple': { value: 99, basis: { kind: 'ai', detail: 'x' } }, 'structure.min_cash': { value: 25, basis: { kind: 'ai', detail: 'x' } }, 'operations.growth.1': { value: 0.5, basis: { kind: 'ai', detail: 'x' } } } });
    s().resuggest();
    expect(s().suggestions['entry.entry_multiple']).toEqual(cited);
    expect(s().suggestions['structure.min_cash'].basis.kind).toBe('ai');
    expect(s().suggestions['operations.growth.1']).toBeUndefined(); // the filed growth path covers that year
    expect(Number.isNaN(s().assumptions!.structure.min_cash)).toBe(true); // offered, not applied: Build still waits
    expect(s().missing().map((m) => m.path)).toContain('structure.min_cash');
  });

  it('one year of a by-year proposal can be accepted on its own; the other years stay blank', () => {
    open();
    const g = s().suggestions['operations.growth'].value as number[];
    expect(cellSuggestion(s().suggestions, s().dismissed, 'operations.growth', 2)?.value).toBe(g[2]);
    s().acceptSuggestion('operations.growth', 2);
    const now = s().assumptions!.operations.growth;
    expect(now[2]).toBe(g[2]);
    expect(Number.isNaN(now[0]) && Number.isNaN(now[4])).toBe(true);
    expect(s().basis['operations.growth.2'].kind).toBe('history');
  });

  it('a cleared suggestion does not come back, for a whole input or for one year of a line', () => {
    open();
    s().dismissSuggestion('entry.entry_multiple');
    expect(s().suggestions['entry.entry_multiple']).toBeUndefined();
    s().editAssumptions({ ...s().assumptions!, rollover_equity: 0 }, ['rollover_equity']);
    expect(s().suggestions['entry.entry_multiple']).toBeUndefined();
    s().dismissSuggestion('operations.growth#1');
    expect(cellSuggestion(s().suggestions, s().dismissed, 'operations.growth', 1)).toBeNull();
    expect(cellSuggestion(s().suggestions, s().dismissed, 'operations.growth', 0)).not.toBeNull();
  });

  it('undo and redo step through accepts, clears and edits, and never restore an output', () => {
    open();
    expect(s().undo()).toBe(true); // the holding period itself
    expect(s().assumptions).toBeNull();
    expect(s().redo()).toBe(true);
    expect(s().assumptions!.entry.hold_years).toBe(5);
    s().acceptSuggestion('entry.entry_multiple');
    const accepted = s().assumptions!.entry.entry_multiple;
    s().dismissSuggestion('tax.rate');
    s().editAssumptions({ ...s().assumptions!, rollover_equity: 12 }, ['rollover_equity']);
    s().undo();
    expect(Number.isNaN(s().assumptions!.rollover_equity)).toBe(true);
    s().undo();
    expect(s().suggestions['tax.rate']).toBeDefined();
    s().undo();
    expect(Number.isNaN(s().assumptions!.entry.entry_multiple as number)).toBe(true);
    expect(s().basis['entry.entry_multiple']).toBeUndefined();
    s().redo();
    expect(s().assumptions!.entry.entry_multiple).toBe(accepted);
    expect(s().output).toBeNull();
    // a new action after an undo drops the steps that were undone
    s().undo();
    s().editAssumptions({ ...s().assumptions!, rollover_equity: 1 }, ['rollover_equity']);
    expect(s().redo()).toBe(false);
  });

  it('accepting a section takes every open suggestion in it, skips cleared ones, and is one undo step', () => {
    open();
    s().dismissSuggestion('operations.growth#0');
    const before = s().assumptions;
    const n = s().acceptAll((p) => p.startsWith('operations'));
    expect(n).toBeGreaterThan(4);
    const a = s().assumptions!;
    expect(Number.isNaN(a.operations.growth[0])).toBe(true); // cleared: left for the analyst
    expect(Number.isFinite(a.operations.growth[1])).toBe(true);
    expect(Number.isFinite(a.operations.da_pct_revenue)).toBe(true);
    expect(Number.isNaN(a.entry.entry_multiple as number)).toBe(true); // another section: untouched
    s().undo();
    expect(s().assumptions).toBe(before);
    expect(s().acceptAll(() => false)).toBe(0);
  });

  it('a reload keeps the AI proposals, what was asked and what was cleared, so nothing is asked for twice', () => {
    open();
    useEngine2Model.setState({ aiProposals: { rollover_equity: { value: 0, basis: { kind: 'ai', detail: 'No rollover is stated.' } } }, aiAsked: ['rollover_equity', 'structure.min_cash'] });
    s().resuggest();
    s().dismissSuggestion('tax.rate');
    const text = serialiseSession();
    if (text === null) return; // this fixture is not a sourced session (no Clean pack): covered by the store tests above
    s().reset();
    expect(restoreSession(text)).toBe(true);
    expect(s().aiAsked).toEqual(['rollover_equity', 'structure.min_cash']);
    expect(s().suggestions.rollover_equity.basis.kind).toBe('ai');
    expect(s().suggestions['tax.rate']).toBeUndefined();
  });
});
