/**
 * PHASE F §F2 — the cutover: engine2 is the DEFAULT engine at /deal-engine.
 * Real stores, no mocks: the page must render the source screen on empty state, feed the
 * engine2 store from EVERY import route, render the v2 workbench the moment facts exist,
 * and keep the ONE old-flow exception (previous-engine saves, OWNER #2) working.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import DealEngine, { resolveDealEngineSurface } from '../pages/DealEngine';
import { ENGINE, SHOW_DEAL_ENGINE_NAV, SHOW_ENGINE2_WORKBENCH } from '../config/features';
import { useEngine2Model } from '../store/engine2Model';
import { useDealEngineStore } from '../store/dealEngine';
import { manualHistoricals } from '../lib/edgar/buildModel';

const page = () => renderToStaticMarkup(
  <MemoryRouter initialEntries={['/deal-engine']}><DealEngine /></MemoryRouter>,
);

const MANUAL = {
  dealName: 'Cutover Test Co', sector: 'Industrials', currency: 'USD' as const,
  ltmRevenue: 400, ebitdaMargin: 0.25, daPctRevenue: 0.03, capexPctRevenue: 0.03,
  nwcPctRevenue: 0.1, netDebt: 50, taxRate: 0.25, nol: 0,
};

beforeEach(() => {
  useEngine2Model.getState().reset();
  useDealEngineStore.setState({ modelState: null, startScreen: 'source', legacySaveNotice: false, error: null });
});

describe('F2 — flag state (the shipped configuration)', () => {
  it('ENGINE=2 (engine2 default), navbar entry ON, dual-window flag retained for rollback', () => {
    expect(ENGINE).toBe(2);
    expect(SHOW_DEAL_ENGINE_NAV).toBe(true);
    expect(SHOW_ENGINE2_WORKBENCH).toBe(true);
  });
});

describe('F2 — /deal-engine default routing (ENGINE=2)', () => {
  it('empty state ⇒ the import screen (Screen 1), with the legacy-save load path visible', () => {
    const html = page();
    expect(html).toContain('Source the target');
    expect(html).toContain('open a saved model');
    expect(html).not.toContain('Suggest everything'); // no workbench without facts
  });

  it('manual entry feeds engine2 and the page renders the v2 WORKBENCH (not the old review)', () => {
    useDealEngineStore.getState().loadFromHistoricals(manualHistoricals(MANUAL), { dealName: MANUAL.dealName });
    // the feeder is synchronous — facts exist the moment the import lands
    expect(useEngine2Model.getState().facts?.entity_name).toBe('Cutover Test Co');
    const html = page();
    expect(html).toContain('Cutover Test Co');
    expect(html).toContain('Suggest everything');
    expect(html).toContain('← New import');
    expect(html).not.toContain('Assumptions you set'); // the old review screen must NOT render
  });

  it('the workbench "New import" escape resets engine2 ⇒ the page returns to Screen 1', () => {
    useDealEngineStore.getState().loadFromHistoricals(manualHistoricals(MANUAL), {});
    expect(useEngine2Model.getState().facts).not.toBeNull();
    useEngine2Model.getState().reset();
    expect(page()).toContain('Source the target');
  });

  it('OWNER #2: a previous-engine save routes to the OLD flow (the one ENGINE=2 exception)', () => {
    // Page-level SSR can't observe injected old-store state (vanilla zustand v5 server
    // snapshot reads initial state — the engine2 store fixed this with its custom hook;
    // the old store dies at deletion). The shipped routing IS this pure function.
    expect(resolveDealEngineSurface({
      engine: 2, hasEngine2Facts: false, legacySaveNotice: true, hasModelState: true,
      v2Param: false, showV2Window: true,
    })).toBe('old-flow');
    // …but a legacy save NEVER shadows live v2 work:
    expect(resolveDealEngineSurface({
      engine: 2, hasEngine2Facts: true, legacySaveNotice: true, hasModelState: true,
      v2Param: false, showV2Window: true,
    })).toBe('workbench');
  });
});

describe('F2 — rollback semantics (ENGINE=1) stay intact', () => {
  it('old flow is the default again; ?v2=1 still forces the workbench during the window', () => {
    const base = { hasEngine2Facts: false, legacySaveNotice: false, hasModelState: false, showV2Window: true };
    expect(resolveDealEngineSurface({ engine: 1, ...base, v2Param: false })).toBe('old-flow');
    expect(resolveDealEngineSurface({ engine: 1, ...base, v2Param: true })).toBe('workbench');
    expect(resolveDealEngineSurface({ engine: 1, ...base, v2Param: true, showV2Window: false })).toBe('old-flow');
    // facts in the engine2 store don't hijack the old default under rollback
    expect(resolveDealEngineSurface({ engine: 1, ...base, hasEngine2Facts: true, v2Param: false })).toBe('old-flow');
  });
});
