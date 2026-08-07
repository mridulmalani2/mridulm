/**
 * F TAIL (owner-accelerated 2026-07-24) — the single-engine world. The old engine is
 * DELETED (tag `pre-deletion-lib-engine` holds the last pre-deletion tree): /deal-engine
 * routes between the import screens and the v2 workbench and nothing else; previous-engine
 * saves surface the retirement notice; the ONE feeder wires every import route to engine2.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { existsSync } from 'fs';
import { join } from 'path';
import DealEngine, { resolveDealEngineSurface } from '../pages/DealEngine';
import { SHOW_DEAL_ENGINE_NAV } from '../config/features';
import { useEngine2Model } from '../store/engine2Model';
import { useDealEngineStore } from '../store/dealEngine';
import { manualHistoricals } from '../lib/edgar/buildModel';

const page = () => renderToStaticMarkup(
  <MemoryRouter initialEntries={['/deal-engine']}><DealEngine /></MemoryRouter>,
);

const MANUAL = {
  dealName: 'Single Engine Co', sector: 'Industrials', currency: 'USD' as const,
  basis: 'FY' as const, ltm: null,
  years: [{ end: '2025-12-31', revenue: 400, ebitda: 100, da: 12, capex: 12 }],
  nwc: 40, grossDebt: null, cash: null, netDebt: 50, netPpe: null, taxRate: 0.25, nol: null,
};

beforeEach(() => {
  useEngine2Model.getState().reset();
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

describe('F tail — /deal-engine routing (two surfaces only)', () => {
  it('routing is a pure two-way switch on engine2 facts', () => {
    expect(resolveDealEngineSurface({ hasEngine2Facts: false })).toBe('import-screens');
    expect(resolveDealEngineSurface({ hasEngine2Facts: true })).toBe('workbench');
  });

  it('empty state ⇒ the import screen with the saved-model load path', () => {
    const html = page();
    expect(html).toContain('Source the target');
    expect(html).toContain('open a saved model');
    expect(html).not.toContain('Suggest everything');
  });

  it('manual entry feeds engine2 and the page renders the WORKBENCH', () => {
    useDealEngineStore.getState().loadFromHistoricals(manualHistoricals(MANUAL));
    expect(useEngine2Model.getState().facts?.entity_name).toBe('Single Engine Co');
    const html = page();
    expect(html).toContain('Single Engine Co');
    expect(html).toContain('Suggest everything');
    expect(html).toContain('← New import');
  });

  it('the workbench "New import" escape returns to Screen 1', () => {
    useDealEngineStore.getState().loadFromHistoricals(manualHistoricals(MANUAL));
    useEngine2Model.getState().reset();
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
