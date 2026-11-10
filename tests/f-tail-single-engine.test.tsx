/**
 * F TAIL (owner-accelerated 2026-07-24) — the single-engine world. The old engine is
 * DELETED (tag `pre-deletion-lib-engine` holds the last pre-deletion tree): /deal-engine
 * runs the Source → Clean → Assumptions → Results flow on the one engine; previous-engine
 * saves surface the retirement notice; the ONE feeder wires every import route to engine2.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { existsSync } from 'fs';
import { join } from 'path';
import DealEngine, { resolveStep, stepFromPath } from '../pages/DealEngine';
import { useCleaning } from '../store/cleaning';
import { SHOW_DEAL_ENGINE_NAV } from '../config/features';
import { useEngine2Model } from '../store/engine2Model';
import { useDealEngineStore } from '../store/dealEngine';
import { manualHistoricals } from '../lib/edgar/buildModel';

const page = (path = '/deal-engine') => renderToStaticMarkup(
  <MemoryRouter initialEntries={[path]}><DealEngine /></MemoryRouter>,
);

const MANUAL = {
  dealName: 'Single Engine Co', sector: 'Industrials', currency: 'USD' as const,
  basis: 'FY' as const, ltm: null,
  years: [{ end: '2025-12-31', revenue: 400, ebitda: 100, da: 12, capex: 12 }],
  nwc: 40, grossDebt: null, cash: null, netDebt: 50, netPpe: null, taxRate: 0.25, nol: null,
};

beforeEach(() => {
  useEngine2Model.getState().reset();
  useCleaning.getState().reset();
  useDealEngineStore.setState({ legacySaveNotice: false, error: null, isCalculating: false });
});

describe('F tail — the old engine is gone from the tree', () => {
  it('lib/engine and the old types no longer exist on disk', () => {
    const root = join(__dirname, '..');
    expect(existsSync(join(root, 'lib', 'engine'))).toBe(false);
    expect(existsSync(join(root, 'lib', 'dealEngineTypes.ts'))).toBe(false);
    expect(existsSync(join(root, 'lib', 'engine2', 'facade.ts'))).toBe(true); // THE engine
  });

  it('the navbar entry stays on', () => {
    expect(SHOW_DEAL_ENGINE_NAV).toBe(true);
  });
});

describe('/deal-engine routing — Source → Clean → Assumptions → Results', () => {
  it('the URL names the step; anything else names none', () => {
    expect(stepFromPath('/deal-engine/lbo/clean')).toBe('clean');
    expect(stepFromPath('/deal-engine/lbo/results/')).toBe('results');
    expect(stepFromPath('/deal-engine')).toBeNull();
    expect(stepFromPath('/deal-engine/lbo/hub')).toBeNull();
  });

  it('a later step never opens before the one in front of it is complete; going back always works', () => {
    const none = { hasFacts: false, cleanDone: false, hasOutput: false };
    const sourced = { hasFacts: true, cleanDone: false, hasOutput: false };
    const cleaned = { hasFacts: true, cleanDone: true, hasOutput: false };
    const built = { hasFacts: true, cleanDone: true, hasOutput: true };
    for (const s of ['source', 'clean', 'assumptions', 'results'] as const) expect(resolveStep(s, none)).toBe('source');
    expect(resolveStep('results', sourced)).toBe('clean'); // a deep link past the Clean step lands on it
    expect(resolveStep('assumptions', sourced)).toBe('clean');
    expect(resolveStep('results', cleaned)).toBe('assumptions'); // no output ⇒ nothing stale to show
    expect(resolveStep('results', built)).toBe('results');
    expect(resolveStep('clean', built)).toBe('clean');
    expect(resolveStep('source', built)).toBe('source');
    // no step in the URL ⇒ resume where the deal stands
    expect([none, sourced, cleaned, built].map((st) => resolveStep(null, st))).toEqual(['source', 'clean', 'assumptions', 'results']);
  });

  it('empty state ⇒ the import screen with the saved-model load path', () => {
    const html = page();
    expect(html).toContain('Source the target');
    expect(html).toContain('open a saved model');
    expect(html).not.toContain('Suggest everything');
  });

  it('manual entry feeds engine2 and the page lands on the CLEAN step, with the sourced figures', () => {
    useDealEngineStore.getState().loadFromHistoricals(manualHistoricals(MANUAL));
    expect(useEngine2Model.getState().facts?.entity_name).toBe('Single Engine Co');
    const html = page();
    expect(html).toContain('Single Engine Co');
    expect(html).toContain('Clean the numbers');
    expect(html).toContain('Statements as sourced');
    expect(html).toContain('Use the figures as reported');
    expect(html).not.toContain('The holding period sizes every per-year input'); // Assumptions is the NEXT step
    // a deep link to a later step is turned back to Clean, never rendered half-ready
    expect(page('/deal-engine/lbo/results')).toContain('Clean the numbers');
  });

  it('leaving Clean opens the Assumptions step: the blank draft starts with the hold', () => {
    useDealEngineStore.getState().loadFromHistoricals(manualHistoricals(MANUAL));
    useCleaning.getState().useAsReported();
    const html = page();
    expect(html).toContain('The holding period sizes every per-year input');
    expect(html).not.toContain('Clean the numbers');
    expect(html).toContain('New deal');
    expect(page('/deal-engine/lbo/clean')).toContain('Clean the numbers'); // going back is always allowed
  });

  it('"New deal" (both stores reset) returns to Source', () => {
    useDealEngineStore.getState().loadFromHistoricals(manualHistoricals(MANUAL));
    useEngine2Model.getState().reset();
    useCleaning.getState().reset();
    expect(page()).toContain('Source the target');
  });

  it('a previous-engine save shows the RETIREMENT notice on the import screen (it cannot open)', async () => {
    await useDealEngineStore.getState().loadModel({ text: async () => '{}' } as unknown as File);
    const html = page();
    expect(html).toContain('previous engine, which has been retired');
    expect(html).toContain('Source the target'); // still the import surface — no old flow exists
    expect(html).not.toContain('Suggest everything');
  });
});
