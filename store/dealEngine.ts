/**
 * store/dealEngine.ts — the IMPORT store (post-cutover, F-tail 2026-07-24).
 *
 * The old engine is deleted (tag `pre-deletion-lib-engine` holds the last pre-deletion
 * tree). What remains here is exactly the surface the v2 flow needs from Screen 1:
 * EDGAR / ESEF / manual extraction feeding the engine2 store, the shared AI key slice,
 * and the previous-engine-save notice. All modeling state lives in store/engine2Model.
 */

import { useSyncExternalStore } from 'react';
import { createStore } from 'zustand/vanilla';
import { getCompanyFacts, getSubmissions, extractRecentFilings } from '../lib/edgar/client';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import { isIfrsCompanyFacts, mapCompanyFactsIfrs } from '../lib/edgar/mapCompanyFactsIfrs';
import { getEsefFilings, getEsefReport } from '../lib/edgar/esef';
import { mapIfrsReport } from '../lib/edgar/mapIfrs';
import type { RawHistoricals } from '../lib/edgar/types';
import type { CompanyFacts } from '../lib/edgar/client';
import { detectProvider, type AIProvider } from '../lib/ai2/gateway/providers';
import { fetchTradingAnchor } from '../lib/edgar/quote';
import { useEngine2Model } from './engine2Model';

export interface DealEngineStore {
  isCalculating: boolean;
  error: string | null;
  /** Shared AI key slice (localStorage-backed; lib/ai2 reads the same keys). */
  apiKey: string | null;
  aiProvider: AIProvider;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  /** A previous-engine .json was opened — the old engine is retired; prompt re-import. */
  legacySaveNotice: boolean;
  dismissLegacySaveNotice: () => void;

  importFromEdgar: (cik10: string) => Promise<void>;
  importFromEsef: (lei: string, opts?: { dealName?: string; sector?: string }) => Promise<void>;
  /** Manual entry (private targets): RawHistoricals → engine2, same as every other route. */
  loadFromHistoricals: (raw: RawHistoricals) => void;
  /** Previous-engine saves can no longer open (the engine they ran on is deleted). */
  loadModel: (file: File) => Promise<void>;
}

/**
 * ONE feeder from every import route (EDGAR / ESEF / manual) into the engine2 store.
 * The D5 trading anchor resolves best-effort in the background: the honest-anchor gate
 * (domestic 10-K + USD — lib/edgar/quote.ts) nulls it for anyone whose quote/share-count
 * pairing can't be verified, and the untouched-guard never clobbers user or AI work.
 */
function feedEngine2FromImport(
  raw: RawHistoricals,
  quote?: { ticker?: string; factsPayload: CompanyFacts; latestAnnualForm?: string },
): void {
  useEngine2Model.getState().importFromRaw(raw, { trading_anchor: null });
  if (!quote?.ticker) return;
  void fetchTradingAnchor(quote.ticker, quote.factsPayload, raw.net_debt?.value ?? null, raw.fy_ebitda?.value ?? null, {
    reportingCurrency: raw.currency_unsupported ?? raw.currency,
    latestAnnualForm: quote.latestAnnualForm,
  })
    .then((a) => {
      if (!a) return;
      if (useEngine2Model.getState().importUntouched(raw.entityName)) {
        useEngine2Model.getState().importFromRaw(raw, { trading_anchor: a.ev_ebitda });
      }
    })
    .catch(() => undefined);
}

export const dealEngineStore = createStore<DealEngineStore>()((set) => ({
  isCalculating: false,
  error: null,
  apiKey: typeof window !== 'undefined' ? localStorage.getItem('deal-engine-api-key') : null,
  aiProvider: ((typeof window !== 'undefined' ? localStorage.getItem('deal-engine-ai-provider') : null) as AIProvider | null) || 'anthropic',
  legacySaveNotice: false,
  dismissLegacySaveNotice: () => set({ legacySaveNotice: false }),

  setApiKey: (key) => {
    const detected = detectProvider(key);
    localStorage.setItem('deal-engine-api-key', key);
    localStorage.setItem('deal-engine-ai-provider', detected);
    set({ apiKey: key, aiProvider: detected });
  },

  clearApiKey: () => {
    localStorage.removeItem('deal-engine-api-key');
    localStorage.removeItem('deal-engine-ai-provider');
    set({ apiKey: null, aiProvider: 'anthropic' });
  },

  importFromEdgar: async (cik10) => {
    set({ isCalculating: true, error: null });
    try {
      const facts = await getCompanyFacts(cik10);

      // Submissions are best-effort: they enrich sector + the anchor context, never required.
      let sicDescription: string | undefined;
      let sicCode: string | undefined;
      let ticker: string | undefined;
      let latestAnnualForm: string | undefined;
      try {
        const subs = await getSubmissions(cik10);
        sicDescription = subs.sicDescription;
        sicCode = (subs as { sic?: string }).sic;
        ticker = subs.tickers?.[0];
        latestAnnualForm = extractRecentFilings(subs, ['10-K', '20-F', '40-F'])[0]?.form;
      } catch { /* companyfacts alone is enough */ }

      // D6: IFRS-reporting 20-F filers carry facts['ifrs-full'] — route to the IFRS mapper.
      const raw = isIfrsCompanyFacts(facts)
        ? mapCompanyFactsIfrs(facts, { sicDescription, sicCode })
        : mapCompanyFacts(facts, { sicDescription, sicCode });
      feedEngine2FromImport(raw, { ticker, factsPayload: facts, latestAnnualForm });
      set({ isCalculating: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
      set({
        error: /not found/i.test(msg)
          ? 'Not found on EDGAR — this looks like a private target or an unknown CIK. Try the company autocomplete, or Manual entry.'
          : `EDGAR import failed: ${msg || 'unknown error'}`,
        isCalculating: false,
      });
    }
  },

  importFromEsef: async (lei, opts) => {
    set({ isCalculating: true, error: null });
    try {
      const filings = await getEsefFilings(lei);
      if (!filings.length) {
        set({ error: 'No ESEF filing found for this entity — pick the listed parent (not a subsidiary), or use Manual entry.', isCalculating: false });
        return;
      }
      const base = 'https://filings.xbrl.org';
      const docUrl = (f: typeof filings[number]) => `${base}${f.reportUrl ?? f.viewerUrl ?? f.jsonUrl}`;
      const filing = filings[0];
      const report = await getEsefReport(filing.jsonUrl);
      const raw = mapIfrsReport(report, { entityName: opts?.dealName ?? filing.entityName, reportUrl: docUrl(filing) });
      // No quote context: no US listing pairing to verify ⇒ the honest-anchor gate stays closed.
      feedEngine2FromImport(raw);
      set({ isCalculating: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
      set({ error: `ESEF import failed: ${msg || 'unknown error'}`, isCalculating: false });
    }
  },

  loadFromHistoricals: (raw) => {
    // facts.sector rides raw.sector provenance (manual: the user's pick; EDGAR: the SIC text)
    feedEngine2FromImport(raw);
    set({ error: null });
  },

  loadModel: async (file) => {
    // Previous-engine saves ran on the deleted engine. Honest refusal + the re-import path
    // (OWNER #2's "still opens here" promise sunset with the F-tail deletion, 2026-07-24;
    // tag `pre-deletion-lib-engine` preserves the last tree that could open them).
    void file;
    set({ legacySaveNotice: true });
  },
}));

/**
 * Selector hook over the vanilla store. Same pattern (and justification) as
 * store/engine2Model: the SERVER snapshot reads CURRENT state — this app is a pure SPA;
 * renderToStaticMarkup appears only in the SSR smoke tests, where state is set before
 * render and hydration mismatches cannot exist.
 */
export function useDealEngineStore<T>(selector: (s: DealEngineStore) => T): T {
  return useSyncExternalStore(
    dealEngineStore.subscribe,
    () => selector(dealEngineStore.getState()),
    () => selector(dealEngineStore.getState()),
  );
}
useDealEngineStore.getState = dealEngineStore.getState;
useDealEngineStore.setState = dealEngineStore.setState;
useDealEngineStore.subscribe = dealEngineStore.subscribe;
