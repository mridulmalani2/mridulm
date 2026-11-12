/**
 * store/dealUi.ts — interface state shared across the deal-engine screens: which input section
 * is open, which field to jump to, what is being traced, and which overlay is showing. No deal
 * data lives here and nothing is persisted.
 */
import { useSyncExternalStore } from 'react';
import { createStore } from 'zustand/vanilla';

export type Overlay = null | 'palette' | 'info' | 'tools' | 'cases' | 'history' | 'library' | 'assistant';
/** A figure to trace: the label of its row in the Excel model and, for a yearly row, the year. */
export interface TraceTarget { label: string; year?: number; sheet?: string }

export interface DealUiStore {
  overlay: Overlay;
  setOverlay: (o: Overlay) => void;
  trace: TraceTarget | null;
  setTrace: (t: TraceTarget | null) => void;
  /** Input sections the analyst has collapsed. */
  collapsed: Record<string, boolean>;
  toggleSection: (id: string, open?: boolean) => void;
  /** The input path to scroll to and focus; cleared once the field has taken focus. */
  jump: string | null;
  jumpTo: (path: string | null) => void;
  /** The results section in view (the rail and the command palette both set it). */
  resultsView: string;
  setResultsView: (v: string) => void;
  /** The analyst's hurdle IRR as typed (a percentage; blank until entered). One value for every
   *  analysis view that reads it, so the grid and the break-evens can never disagree. */
  hurdle: string;
  setHurdle: (v: string) => void;
}

export const dealUiStore = createStore<DealUiStore>()((set, get) => ({
  overlay: null,
  setOverlay: (overlay) => set({ overlay }),
  trace: null,
  setTrace: (trace) => set({ trace }),
  collapsed: {},
  toggleSection: (id, open) => set({ collapsed: { ...get().collapsed, [id]: open === undefined ? !get().collapsed[id] : !open } }),
  jump: null,
  jumpTo: (jump) => set({ jump }),
  resultsView: 'overview',
  setResultsView: (resultsView) => set({ resultsView }),
  hurdle: '',
  setHurdle: (hurdle) => set({ hurdle }),
}));

export function useDealUi<T>(selector: (s: DealUiStore) => T): T {
  return useSyncExternalStore(dealUiStore.subscribe, () => selector(dealUiStore.getState()), () => selector(dealUiStore.getState()));
}
