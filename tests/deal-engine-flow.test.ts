/**
 * The Clean step wired into the model lifecycle (rebuild/CLEANING_AND_SUITE_PLAN.md §6.1, §4.2):
 * the ledger feeds the facts, an edit keeps everything the analyst entered, the trading anchor
 * follows the adjusted basis, and the engine never reads the display-only record.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import { manualHistoricals } from '../lib/edgar/buildModel';
import { buildStatementPack } from '../lib/statements/pack';
import { adaptRawHistoricals } from '../lib/engine2/factsAdapter';
import { acceptCandidate, addAdjustment, setAdjustmentAmount, setLeaseChoice, updateAdjustment } from '../lib/cleaning/ops';
import { impliedEquityDisplay } from '../lib/engine2/display';
import { runModel } from '../lib/engine2/facade';
import { useCleaning } from '../store/cleaning';
import { useEngine2Model } from '../store/engine2Model';
import { FACT_LABELS, factLabel } from '../components/deal-engine/ui/labels';
import { richCompanyFacts, stops } from './fixtures/cleaning-deals';
import { enterDeal, enteredAssumptions } from './fixtures/entered-deal';

const FY = '2023-12-31';
const OPTS = { asOfDate: '2024-06-30', sicCode: '3711' };
function load() {
  const facts = richCompanyFacts();
  const raw = mapCompanyFacts(facts, OPTS);
  const pack = buildStatementPack({ raw, rawExLeases: mapCompanyFacts(facts, { ...OPTS, includeFinanceLeasesInDebt: false }), gaap: 'us-gaap', facts });
  useCleaning.getState().load(raw, pack);
  return { raw, pack };
}
const model = () => useEngine2Model.getState();
const clean = () => useCleaning.getState();

beforeEach(() => { useEngine2Model.getState().reset(); useCleaning.getState().reset(); });

describe('the Clean step feeds the model', () => {
  it('a fresh import: the model reads the sourced figures and the step is not done', () => {
    const { raw } = load();
    expect(model().facts!.fy_ebitda).toBe(250);
    expect({ ...model().facts!, normalisation: undefined }).toEqual({ ...adaptRawHistoricals(raw).facts, normalisation: undefined });
    expect(clean().done).toBe(false);
    expect(model().facts!.normalisation!.ebitda.find((b) => b.period === FY)).toMatchObject({ reported: 250, adjusted: 250, rows: [] });
  });

  it('a ledger edit reaches the facts at once: 250.0 + 20.0 = 270.0, margin 270 ÷ 1,250', () => {
    const { pack } = load();
    clean().edit((l) => acceptCandidate(l, pack.candidates.find((c) => c.tag === 'RestructuringCharges')!));
    expect(model().facts!.fy_ebitda).toBe(270);
    expect(model().facts!.fy_ebitda_margin).toBeCloseTo(0.216, 12);
    expect(model().facts!.normalisation!.ebitda.find((b) => b.period === FY)!.rows).toHaveLength(1);
  });

  it('editing the ledger AFTER entering a deal keeps every assumption, badge and choice — only the output is cleared', () => {
    const { pack } = load();
    clean().useAsReported();
    enterDeal(enteredAssumptions(5));
    model().build();
    expect(model().output).not.toBeNull();
    const before = { assumptions: model().assumptions, basis: model().basis, pending: model().pending };
    clean().edit((l) => acceptCandidate(l, pack.candidates.find((c) => c.tag === 'RestructuringCharges')!));
    expect(model().output).toBeNull(); // outputs never render stale
    expect(model().assumptions).toBe(before.assumptions);
    expect(model().basis).toBe(before.basis);
    expect(model().pending).toBe(before.pending);
    // and the rebuilt deal is priced on the adjusted figure: 9.0x × 270.0
    model().build();
    expect(model().output!.derived.enterprise_value).toBe(2430);
  });

  it('a row with no sizing amount blocks "continue with adjusted", gates Build, and re-opens a finished step', () => {
    load();
    clean().edit((l) => setLeaseChoice(l, 'finance'));
    expect(clean().confirmAdjusted()).toBe(true);
    expect(clean().done).toBe(true);
    clean().edit((l) => updateAdjustment(addAdjustment(l, 'ebitda'), 'adj-1', { label: 'Synergies', forecast: 'gone' }));
    expect(clean().done).toBe(false);
    expect(clean().confirmAdjusted()).toBe(false);
    expect(model().missingFacts).toContain('fy_ebitda'); // blank, never zero
    clean().edit((l) => setAdjustmentAmount(l, 'adj-1', FY, 30));
    expect(clean().confirmAdjusted()).toBe(true);
    expect(model().facts!.fy_ebitda).toBe(280);
    expect(model().missingFacts).not.toContain('fy_ebitda');
  });

  it('"use as reported" applies nothing, records the choice, and can be reversed', () => {
    const { pack } = load();
    clean().edit((l) => stops(setLeaseChoice(acceptCandidate(l, pack.candidates.find((c) => c.tag === 'RestructuringCharges')!), 'finance')));
    clean().useAsReported();
    expect(model().facts!.fy_ebitda).toBe(250);
    expect(model().facts!.normalisation!.as_reported).toBe(true);
    expect(clean().ledger.adjustments).toHaveLength(1); // kept
    expect(clean().confirmAdjusted()).toBe(true); // back to the adjusted figures
    expect(model().facts!.fy_ebitda).toBe(270);
    expect(model().facts!.normalisation!.as_reported).toBe(false);
  });

  it('a fact the analyst confirmed by hand survives a ledger edit', () => {
    const raw = manualHistoricals({
      dealName: 'Gap Co', sector: 'Industrials', currency: 'USD', basis: 'FY', ltm: null,
      years: [{ end: FY, revenue: 400, ebitda: 100, da: 12, capex: 12 }],
      nwc: 40, grossDebt: null, cash: null, netDebt: null, netPpe: null, taxRate: 0.25, nol: null,
    });
    useCleaning.getState().load(raw, buildStatementPack({ raw, rawExLeases: null, gaap: 'unknown' }));
    expect(model().missingFacts).toContain('net_debt');
    model().confirmFact('net_debt', 55);
    clean().edit((l) => setAdjustmentAmount(updateAdjustment(addAdjustment(l, 'ebitda'), 'adj-1', { label: 'One-off' }), 'adj-1', FY, 5));
    expect(model().facts!.net_debt).toBe(55);
    expect(model().missingFacts).not.toContain('net_debt');
    expect(model().facts!.fy_ebitda).toBe(105);
  });
});

describe('the trading anchor follows the adjusted basis (plan §11)', () => {
  const quote = { ev_ebitda: 0, price: 20, shares_millions: 100, multi_class: false, detail: '' }; // market cap 2,000

  it('(2,000 + 290) ÷ 250 = 9.16x as reported; (2,000 + 323 + … ) restated when the ledger changes', () => {
    const { raw, pack } = load();
    clean().setMarket(raw.entityName, quote);
    expect(model().facts!.implied_trading_ev_ebitda).toBeCloseTo(2290 / 250, 12);
    clean().edit((l) => setLeaseChoice(acceptCandidate(l, pack.candidates.find((c) => c.tag === 'RestructuringCharges')!), 'all'));
    // adjusted: net debt 335 + 35 + 60 − 80 = 350; EBITDA 270
    expect(model().facts!.implied_trading_ev_ebitda).toBeCloseTo(2350 / 270, 12);
    expect(model().facts!.normalisation!.trading_ev_ebitda_reported).toBeCloseTo(2290 / 250, 12); // shown beside it
    expect(model().facts!.normalisation!.market_cap).toBe(2000);
  });

  it('with no verified quote an anchor set elsewhere is kept only while the figures are the sourced ones', () => {
    const { raw, pack } = load();
    model().setTradingAnchor(raw.entityName, 8.2);
    clean().edit((l) => l); // no change
    expect(model().facts!.implied_trading_ev_ebitda).toBe(8.2);
    clean().edit((l) => acceptCandidate(l, pack.candidates.find((c) => c.tag === 'RestructuringCharges')!));
    expect(model().facts!.implied_trading_ev_ebitda).toBeNull(); // a reported-basis anchor beside adjusted EBITDA would mislead
  });
});

describe('what the sellers receive (display only)', () => {
  it('EV − adjusted net debt, per share and premium off the quote: 2,430 − 315 = 2,115 → 21.15 a share, +5.75%', () => {
    const { raw, pack } = load();
    clean().setMarket(raw.entityName, { ev_ebitda: 0, price: 20, shares_millions: 100, multi_class: false, detail: '' });
    clean().edit((l) => {
      let n = acceptCandidate(l, pack.candidates.find((c) => c.tag === 'RestructuringCharges')!);
      n = acceptCandidate(n, pack.candidates.find((c) => c.category === 'pension')!);
      return stops(setLeaseChoice(n, 'finance'));
    });
    expect(clean().confirmAdjusted()).toBe(true);
    enterDeal(enteredAssumptions(5));
    model().build();
    const eq = impliedEquityDisplay(model().output!);
    expect(eq.enterprise_value).toBe(2430);
    expect(eq.net_debt).toBe(315); // 335 + 35 + 25 − 80
    expect(eq.equity_value).toBe(2115);
    expect(eq.per_share).toBeCloseTo(21.15, 12);
    expect(eq.premium_to_market).toBeCloseTo(0.0575, 12);
  });

  it('net debt never moves the sponsor’s returns — only what the sellers receive', () => {
    const { pack } = load();
    clean().edit((l) => setLeaseChoice(l, 'none'));
    const a = enteredAssumptions(5);
    const low = runModel(model().facts!, a);
    clean().edit((l) => setLeaseChoice(acceptCandidate(l, pack.candidates.find((c) => c.category === 'pension')!), 'all'));
    const high = runModel(model().facts!, a);
    expect(high.facts.net_debt! - low.facts.net_debt!).toBe(120); // 35 + 60 + 25
    expect(high.returns.sponsor_net.irr).toBe(low.returns.sponsor_net.irr);
    expect(impliedEquityDisplay(low).equity_value! - impliedEquityDisplay(high).equity_value!).toBe(120);
  });
});

describe('boundaries', () => {
  const ROOT = join(__dirname, '..');
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(n)) out.push(p);
    }
    return out;
  };

  it('NO engine arithmetic reads the normalisation record — only the type, the workbook and the display helpers name it', () => {
    const allowed = new Set(['types.ts', 'workbook.ts', 'display.ts']);
    const offenders = walk(join(ROOT, 'lib', 'engine2'))
      .filter((f) => !allowed.has(f.slice(f.lastIndexOf('/') + 1)))
      .filter((f) => /normali[sz]ation/i.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('lib/cleaning and lib/statements import nothing from lib/engine2, and lib/engine2 imports neither', () => {
    const imports = (f: string) => [...readFileSync(f, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const dir of ['cleaning', 'statements']) {
      for (const f of walk(join(ROOT, 'lib', dir))) expect(imports(f).filter((s) => /engine2/.test(s)), f).toEqual([]);
    }
    for (const f of walk(join(ROOT, 'lib', 'engine2'))) expect(imports(f).filter((s) => /\/(cleaning|statements)\//.test(s)), f).toEqual([]);
  });

  it('every fact path the Build gate can report has a plain-language name', () => {
    const raw = manualHistoricals({
      dealName: 'Empty', sector: 'Industrials', currency: 'USD', basis: 'FY', ltm: null, years: [],
      nwc: null, grossDebt: null, cash: null, netDebt: null, netPpe: null, taxRate: null, nol: null,
    });
    const missing = [...adaptRawHistoricals({ ...raw, currency_unsupported: 'SEK' }).missing];
    expect(missing.length).toBeGreaterThanOrEqual(8);
    for (const path of missing) {
      expect(FACT_LABELS[path], path).toBeDefined();
      expect(factLabel(path)).not.toContain('_');
    }
  });

  it('new deal-engine screens carry no literal colour — every colour is a design token', () => {
    const dirs = ['ui', 'shell', 'clean', 'results'].map((d) => join(ROOT, 'components', 'deal-engine', d));
    const offenders = dirs.flatMap((d) => walk(d)).filter((f) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('a deal survives a reload (store/session) — inputs are saved, everything derived is rebuilt', () => {
  it('round trip: ledger, assumptions (blanks stay blank), badges, a confirmed fact, and the step state', async () => {
    const { restoreSession, serialiseSession } = await import('../store/session');
    const { pack } = load();
    clean().edit((l) => stops(setLeaseChoice(acceptCandidate(l, pack.candidates.find((c) => c.tag === 'RestructuringCharges')!), 'all')));
    expect(clean().confirmAdjusted()).toBe(true);
    enterDeal(enteredAssumptions(5));
    // blank one input again: NaN must not come back as null or 0
    const a = model().assumptions!;
    model().editAssumptions({ ...a, exit: { ...a.exit, multiple: Number.NaN } }, []);
    const before = { facts: model().facts, assumptions: model().assumptions, basis: model().basis, pending: model().pending, ledger: clean().ledger };
    const text = serialiseSession()!;
    expect(text).not.toContain('"output"');

    useEngine2Model.getState().reset();
    useCleaning.getState().reset();
    expect(restoreSession(text)).toBe(true);
    expect(clean().ledger).toEqual(before.ledger);
    expect(clean().done).toBe(true);
    expect(model().facts).toEqual(before.facts);
    expect(model().facts!.fy_ebitda).toBe(270);
    expect(Number.isNaN(model().assumptions!.exit.multiple)).toBe(true);
    expect(model().assumptions).toEqual(before.assumptions);
    expect(model().basis).toEqual(before.basis);
    expect(model().pending).toEqual(before.pending);
    expect(model().output).toBeNull();
    expect(model().missing().map((m) => m.path)).toContain('exit.multiple');
  });

  it('garbage, an old version or nothing at all restores nothing', async () => {
    const { restoreSession, serialiseSession } = await import('../store/session');
    expect(serialiseSession()).toBeNull();
    for (const bad of [null, '', '{', '{"v":0}', '{"v":1,"cleaning":{}}']) expect(restoreSession(bad)).toBe(false);
    expect(model().facts).toBeNull();
  });
});

describe('a case entered directly (forecast-only, SPEC §24.2) survives a reload too', () => {
  it('round trip: name, currency, every entered input and open choice come back; the output does not', async () => {
    const { restoreSession, serialiseSession } = await import('../store/session');
    const { G12_ASSUMPTIONS } = await import('./fixtures/g12-prof');
    useEngine2Model.getState().reset();
    useCleaning.getState().reset();
    useEngine2Model.getState().startForecastOnly({ entity_name: 'Worked example', currency: 'USD', hold_years: 5 });
    const blankExit = { ...G12_ASSUMPTIONS, exit: { ...G12_ASSUMPTIONS.exit, multiple: Number.NaN } };
    useEngine2Model.getState().editAssumptions(blankExit, ['entry.driver', 'entry.basis']);
    const before = useEngine2Model.getState();
    const text = serialiseSession();
    expect(text).not.toBeNull();
    expect(text!).not.toContain('"output"');

    useEngine2Model.getState().reset();
    expect(restoreSession(text)).toBe(true);
    const after = useEngine2Model.getState();
    expect(after.facts).toEqual(before.facts);
    expect(after.assumptions).toEqual(before.assumptions);
    expect(Number.isNaN(after.assumptions!.exit.multiple)).toBe(true);
    expect(after.pending).toEqual(before.pending);
    expect(after.basis).toEqual(before.basis);
    expect(after.output).toBeNull();
    // the proposals are rebuilt, including exit = the multiple the purchase price implies
    expect(after.suggestions['exit.multiple'].value).toBe(1100 / 145);
    useEngine2Model.getState().reset();
  });

  it('a forecast-only save with sourced-looking facts is refused (facts are never trusted from storage)', async () => {
    const { restoreSession } = await import('../store/session');
    const bad = JSON.stringify({ v: 1, cleaning: null, forecastFacts: { source: 'edgar', history: [] }, assumptions: {}, pending: [], basis: {} });
    expect(restoreSession(bad)).toBe(false);
    expect(useEngine2Model.getState().facts).toBeNull();
  });
});

describe('the terminal year is the analyst\'s choice (SPEC §28) — an open choice, then blank inputs, never assumed', () => {
  it('switching the valuation on leaves the terminal year open; "stated" brings two blank inputs that gate Build', async () => {
    const { EA_ASSUMPTIONS } = await import('./fixtures/ea-oos');
    const { suggestionsFor } = await import('../lib/engine2/suggest');
    useEngine2Model.getState().reset();
    useCleaning.getState().reset();
    const st = useEngine2Model.getState();
    st.startForecastOnly({ entity_name: 'Electronic Arts', currency: 'USD', hold_years: 5 });
    // everything entered except the terminal-year choice
    useEngine2Model.getState().editWithChoices({ ...EA_ASSUMPTIONS, valuation: { ...EA_ASSUMPTIONS.valuation!, terminal: null } },
      ['entry.basis', 'exit.basis', 'structure.tranches', 'tax.interest_deductible', 'tax.s163j.applies', 'valuation'], ['valuation.terminal']);
    const paths = () => useEngine2Model.getState().missing().map((m) => m.path);
    expect(paths()).toEqual(['valuation.terminal']);
    useEngine2Model.getState().build();
    expect(useEngine2Model.getState().output).toBeNull();

    // "stated for a steady state": both inputs arrive blank
    const a = useEngine2Model.getState().assumptions!;
    useEngine2Model.getState().editAssumptions({ ...a, valuation: { ...a.valuation!, terminal: { capex_pct_of_da: Number.NaN, delta_nwc_before_growth: Number.NaN } } }, ['valuation.terminal']);
    expect(paths().sort()).toEqual(['valuation.terminal.capex_pct_of_da', 'valuation.terminal.delta_nwc_before_growth']);
    // the capex convention is PROPOSED with its reasoning, not applied
    const sug = suggestionsFor(useEngine2Model.getState().facts!, 5, useEngine2Model.getState().assumptions!);
    expect(sug['valuation.terminal.capex_pct_of_da'].value).toBe(1);
    expect(Number.isNaN(useEngine2Model.getState().assumptions!.valuation!.terminal!.capex_pct_of_da)).toBe(true);

    // entered as the workbook states it → builds, and reproduces the workbook's NPV
    const b = useEngine2Model.getState().assumptions!;
    useEngine2Model.getState().editAssumptions({ ...b, valuation: { ...b.valuation!, terminal: { capex_pct_of_da: 1, delta_nwc_before_growth: -60 } } },
      ['valuation.terminal.capex_pct_of_da', 'valuation.terminal.delta_nwc_before_growth']);
    expect(paths()).toEqual([]);
    useEngine2Model.getState().build();
    const npv = useEngine2Model.getState().output!.valuation!.fundamentals!.npv!;
    expect(Math.abs(npv - -2322.54539530639)).toBeLessThan(1e-6);
    useEngine2Model.getState().reset();
  });
});
