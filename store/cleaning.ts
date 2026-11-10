/**
 * store/cleaning.ts — the Clean step's state (rebuild/CLEANING_AND_SUITE_PLAN.md §6.1).
 *
 * Holds the figures AS SOURCED (`raw`, `pack` — never mutated), the analyst's `ledger`, and what
 * `applyCleaning` makes of them. Every ledger edit recomputes the cleaned figures and hands them
 * to the engine2 store through `applyCleaned`, so the model's facts always match the ledger and
 * nothing the analyst entered on the Assumptions step is lost.
 *
 * Nothing leaves the browser.
 */
import { useSyncExternalStore } from 'react';
import { createStore } from 'zustand/vanilla';
import type { RawHistoricals } from '../lib/edgar/types';
import { computeTradingAnchor, type TradingAnchor } from '../lib/edgar/quote';
import type { StatementPack } from '../lib/statements/types';
import { applyCleaning, type CleanedHistoricals } from '../lib/cleaning/apply';
import { blockers, cleaningChecks } from '../lib/cleaning/checks';
import { ledgerIsEmpty } from '../lib/cleaning/ops';
import { emptyLedger, type CleaningFlag, type CleaningLedger } from '../lib/cleaning/types';
import type { NormalisationFacts } from '../lib/engine2/types';
import { engine2Store } from './engine2Model';

export interface CleaningStore {
  raw: RawHistoricals | null;
  pack: StatementPack | null;
  ledger: CleaningLedger;
  cleaned: CleanedHistoricals | null;
  flags: CleaningFlag[];
  /** The verified quote behind the trading anchor (domestic USD 10-K filers only), else null. */
  market: TradingAnchor | null;
  /** The analyst left the step: with adjusted figures, or explicitly as reported. */
  done: boolean;
  /** Detected proposals the analyst dismissed (ids). */
  dismissed: string[];

  /** A new import: the sourced figures and an empty ledger. Feeds the engine2 store. */
  load: (raw: RawHistoricals, pack: StatementPack) => void;
  setMarket: (entityName: string, anchor: TradingAnchor | null) => void;
  /** Apply a pure ledger edit (lib/cleaning/ops). Re-opens the step if it now has a blocker. */
  edit: (fn: (ledger: CleaningLedger) => CleaningLedger) => void;
  dismiss: (candidateId: string) => void;
  /** Leave with the adjusted figures. Returns false (and stays) while a blocker is open. */
  confirmAdjusted: () => boolean;
  /** Leave with the figures exactly as sourced; the ledger is kept but not applied. */
  useAsReported: () => void;
  /** Put back a deal saved in this browser (store/session): the sourced figures, the ledger and
   *  where the step stood. Rebuilds the cleaned figures from them — nothing derived is trusted. */
  hydrate: (snap: Pick<CleaningStore, 'raw' | 'pack' | 'ledger' | 'market' | 'done' | 'dismissed'>) => void;
  reset: () => void;
}

function anchorOn(market: TradingAnchor | null, netDebt: number | null | undefined, ebitda: number | null | undefined): number | null {
  if (!market || netDebt == null || ebitda == null) return null;
  return computeTradingAnchor(market.price, market.shares_millions * 1e6, netDebt, ebitda, market.multi_class)?.ev_ebitda ?? null;
}

export const cleaningStore = createStore<CleaningStore>()((set, get) => {
  /** Recompute from (raw, pack, ledger) and push the cleaned facts to the model store. */
  const sync = (ledger: CleaningLedger, extra: Partial<CleaningStore> = {}) => {
    const { raw, pack, market } = { ...get(), ...extra };
    if (!raw || !pack) return;
    const cleaned = applyCleaning(raw, pack, ledger);
    const flags = cleaningChecks(pack, ledger, cleaned, raw);
    const b = cleaned.bridges;
    const normalisation: NormalisationFacts = {
      as_reported: b.as_reported, sizing: b.sizing, anchor: b.anchor, periods: b.periods,
      revenue: b.revenue, ebitda: b.ebitda, net_debt: b.net_debt,
      forecast_ebitda: cleaned.raw.forecast_ebitda?.value ?? null,
      trading_ev_ebitda_reported: anchorOn(market, raw.net_debt?.value, raw.fy_ebitda?.value),
      market_cap: market ? market.price * market.shares_millions : null,
      shares_millions: market?.shares_millions ?? null,
    };
    const untouched = ledger.as_reported || ledgerIsEmpty(ledger);
    engine2Store.getState().applyCleaned(cleaned.raw, {
      normalisation,
      // the anchor is restated on the adjusted basis (plan §11); without a quote it can only be
      // kept while the figures are the sourced ones
      trading_anchor: market ? anchorOn(market, cleaned.raw.net_debt?.value, cleaned.raw.fy_ebitda?.value) : untouched ? undefined : null,
    });
    set({ ...extra, ledger, cleaned, flags });
  };

  return {
    raw: null, pack: null, ledger: emptyLedger(), cleaned: null, flags: [], market: null, done: false, dismissed: [],

    load: (raw, pack) => {
      engine2Store.getState().importFromRaw(raw);
      set({ raw, pack, market: null, done: false, dismissed: [] });
      sync(emptyLedger());
    },

    setMarket: (entityName, anchor) => {
      if (get().raw?.entityName !== entityName) return;
      sync(get().ledger, { market: anchor });
    },

    edit: (fn) => {
      sync(fn(get().ledger));
      if (get().done && blockers(get().flags).length) set({ done: false });
    },

    dismiss: (candidateId) => set({ dismissed: [...new Set([...get().dismissed, candidateId])] }),

    confirmAdjusted: () => {
      if (blockers(get().flags).length) return false;
      if (get().ledger.as_reported) sync({ ...get().ledger, as_reported: false });
      if (blockers(get().flags).length) return false;
      set({ done: true });
      return true;
    },

    useAsReported: () => {
      sync({ ...get().ledger, as_reported: true });
      set({ done: true });
    },

    hydrate: (snap) => {
      if (!snap.raw || !snap.pack) return;
      engine2Store.getState().importFromRaw(snap.raw);
      set({ raw: snap.raw, pack: snap.pack, market: snap.market, dismissed: snap.dismissed, done: false });
      sync(snap.ledger);
      set({ done: snap.done && blockers(get().flags).length === 0 });
    },

    reset: () => set({ raw: null, pack: null, ledger: emptyLedger(), cleaned: null, flags: [], market: null, done: false, dismissed: [] }),
  };
});

export function useCleaning<T>(selector: (s: CleaningStore) => T): T {
  return useSyncExternalStore(
    cleaningStore.subscribe,
    () => selector(cleaningStore.getState()),
    () => selector(cleaningStore.getState()),
  );
}
useCleaning.getState = cleaningStore.getState;
useCleaning.setState = cleaningStore.setState;
useCleaning.subscribe = cleaningStore.subscribe;
