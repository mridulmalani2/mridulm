/**
 * The import flow, post-cutover (F tail): EVERY route — EDGAR-shaped extraction and
 * manual entry — lands in the engine2 store via the ONE feeder; previous-engine saves
 * surface the retirement notice instead of opening (the old engine is deleted).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import { manualHistoricals } from '../lib/edgar/buildModel';
import { useDealEngineStore } from '../store/dealEngine';
import { useEngine2Model } from '../store/engine2Model';
import type { CompanyFacts } from '../lib/edgar/client';
import sample from './fixtures/companyfacts-sample.json';

const raw = () => mapCompanyFacts(sample as unknown as CompanyFacts, { sicDescription: 'Industrial machinery & equipment' });

beforeEach(() => useEngine2Model.getState().reset());

describe('import routes feed the engine2 store (the single modeling path)', () => {
  it('an EDGAR-shaped extraction lands as engine2 facts with suggestions ready', () => {
    useDealEngineStore.getState().loadFromHistoricals(raw());
    const s = useEngine2Model.getState();
    expect(s.facts?.entity_name).toBe('Northwind Industries Inc.');
    expect(s.facts?.fy_revenue).toBeCloseTo(1250, 6);
    expect(s.facts?.net_ppe).toBeCloseTo(480, 6);
    expect(s.missingFacts).toEqual([]);
    expect(s.assumptions).not.toBeNull(); // auto-suggested on import
    expect(s.output).toBeNull();          // never builds uninvited
  });

  it('manual entry (private target) flows through the SAME feeder', () => {
    useDealEngineStore.getState().loadFromHistoricals(manualHistoricals({
      dealName: 'Handmade Co', sector: 'Industrials', currency: 'EUR',
      ltmRevenue: 300, ebitdaMargin: 0.22, daPctRevenue: 0.03, capexPctRevenue: 0.03,
      nwcPctRevenue: 0.1, netDebt: 40, taxRate: 0.25, nol: 0,
    }));
    const s = useEngine2Model.getState();
    expect(s.facts?.entity_name).toBe('Handmade Co');
    expect(s.facts?.currency).toBe('EUR');
    expect(s.missingFacts).toEqual([]);
  });

  it('a previous-engine .json raises the retirement notice and loads NOTHING', async () => {
    const file = { text: async () => JSON.stringify({ deal_name: 'Old Save' }) } as unknown as File;
    await useDealEngineStore.getState().loadModel(file);
    expect(useDealEngineStore.getState().legacySaveNotice).toBe(true);
    expect(useEngine2Model.getState().facts).toBeNull(); // nothing hydrates from old saves
    useDealEngineStore.getState().dismissLegacySaveNotice();
    expect(useDealEngineStore.getState().legacySaveNotice).toBe(false);
  });
});
