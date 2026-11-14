/**
 * Merger Phase 0 groundwork (rebuild/MA_MODEL_PLAN.md §3.3): the Clean step runs against any
 * cleaning store, and every save says which kind of deal it holds. The Buyout flow is unchanged.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import { buildStatementPack } from '../lib/statements/pack';
import { addAdjustment } from '../lib/cleaning/ops';
import type { RawHistoricals } from '../lib/edgar/types';
import { CleaningStoreContext, cleaningStore, createCleaningStore, useCleaning, type CleanedSink } from '../store/cleaning';
import { engine2Store } from '../store/engine2Model';
import { restoreSession, serialiseSession, sessionDealType } from '../store/session';
import { richCompanyFacts } from './fixtures/cleaning-deals';

const OPTS = { asOfDate: '2024-06-30', sicCode: '3711' };
function sourced() {
  const facts = richCompanyFacts();
  const raw = mapCompanyFacts(facts, OPTS);
  const pack = buildStatementPack({ raw, rawExLeases: mapCompanyFacts(facts, { ...OPTS, includeFinanceLeasesInDebt: false }), gaap: 'us-gaap', facts });
  return { raw, pack };
}
function recordingSink() {
  const log: { imported: RawHistoricals[]; cleaned: RawHistoricals[] } = { imported: [], cleaned: [] };
  const sink: CleanedSink = { imported: (r) => { log.imported.push(r); }, cleaned: (r) => { log.cleaned.push(r); } };
  return { sink, log };
}

beforeEach(() => { engine2Store.getState().reset(); cleaningStore.getState().reset(); });

describe('a cleaning store per company', () => {
  it('an injected store sends its figures to its own destination, never to the Buyout model', () => {
    const { sink, log } = recordingSink();
    const side = createCleaningStore(sink);
    const { raw, pack } = sourced();
    side.getState().load(raw, pack);
    expect(log.imported).toHaveLength(1);
    expect(log.cleaned.length).toBeGreaterThan(0);
    expect(engine2Store.getState().facts).toBeNull();
    expect(cleaningStore.getState().raw).toBeNull();
  });

  it('two companies are cleaned independently', () => {
    const a = createCleaningStore(recordingSink().sink);
    const b = createCleaningStore(recordingSink().sink);
    const { raw, pack } = sourced();
    a.getState().load(raw, pack);
    b.getState().load(raw, pack);
    a.getState().edit((l) => addAdjustment(l, 'ebitda'));
    expect(a.getState().ledger.adjustments).toHaveLength(1);
    expect(b.getState().ledger.adjustments).toHaveLength(0);
  });

  it('the Clean screen reads whichever store its provider names, and the Buyout store by default', () => {
    const side = createCleaningStore(recordingSink().sink);
    const { raw, pack } = sourced();
    side.getState().load({ ...raw, entityName: 'Target Co' }, pack);
    const Name = () => <span>{useCleaning((s) => s.raw?.entityName ?? 'none')}</span>;
    expect(renderToString(<Name />)).toContain('none');
    expect(renderToString(<CleaningStoreContext.Provider value={side}><Name /></CleaningStoreContext.Provider>)).toContain('Target Co');
  });

  it('the Buyout store still feeds the engine2 model', () => {
    const { raw, pack } = sourced();
    cleaningStore.getState().load(raw, pack);
    expect(engine2Store.getState().facts?.entity_name).toBe(raw.entityName);
  });
});

describe('every save names its deal type', () => {
  it('a Buyout save is marked lbo and restores', () => {
    const { raw, pack } = sourced();
    cleaningStore.getState().load(raw, pack);
    const text = serialiseSession()!;
    expect(JSON.parse(text).dealType).toBe('lbo');
    expect(sessionDealType(text)).toBe('lbo');
    engine2Store.getState().reset(); cleaningStore.getState().reset();
    expect(restoreSession(text)).toBe(true);
    expect(engine2Store.getState().facts?.entity_name).toBe(raw.entityName);
  });

  it('a save from before deal types existed is read as a Buyout', () => {
    const { raw, pack } = sourced();
    cleaningStore.getState().load(raw, pack);
    const old = JSON.parse(serialiseSession()!);
    delete old.dealType;
    const text = JSON.stringify(old);
    expect(sessionDealType(text)).toBe('lbo');
    engine2Store.getState().reset(); cleaningStore.getState().reset();
    expect(restoreSession(text)).toBe(true);
  });

  it('a merger save never restores into the Buyout flow', () => {
    const { raw, pack } = sourced();
    cleaningStore.getState().load(raw, pack);
    const text = JSON.stringify({ ...JSON.parse(serialiseSession()!), dealType: 'merger' });
    engine2Store.getState().reset(); cleaningStore.getState().reset();
    expect(sessionDealType(text)).toBe('merger');
    expect(restoreSession(text)).toBe(false);
    expect(engine2Store.getState().facts).toBeNull();
  });
});
