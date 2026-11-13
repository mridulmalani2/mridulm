/**
 * store/dealUi.ts — interface state shared across the deal-engine screens: which input section
 * is open, which field to jump to, what is being traced, and which overlay is showing. No deal
 * data lives here and nothing is persisted.
 */
import { useSyncExternalStore } from 'react';
import { createStore } from 'zustand/vanilla';

export type Overlay = null | 'palette' | 'info' | 'tools' | 'cases' | 'history' | 'library';
/** The assistant panel: docked beside the page, never over it. 'guide' = what to do next and the
 *  sourced values on offer; 'ask' = questions in the analyst's own words. */
export interface AssistantUi { open: boolean; tab: 'guide' | 'ask' }
const ASSISTANT_KEY = 'deal-engine-assistant-open';
/** Open by default where there is room beside the page; the analyst's own choice is remembered. */
function assistantOpenAtStart(): boolean {
  if (typeof window === 'undefined') return false;
  // on a phone the panel covers the page, so it opens only when asked for
  if (window.innerWidth < 640) return false;
  try {
    const saved = window.localStorage.getItem(ASSISTANT_KEY);
    if (saved !== null) return saved === '1';
  } catch { /* storage is unavailable: fall through to the width rule */ }
  return window.innerWidth >= 1536;
}
/** A figure to trace: the label of its row in the Excel model and, for a yearly row, the year. */
export interface TraceTarget { label: string; year?: number; sheet?: string }

export interface DealUiStore {
  overlay: Overlay;
  setOverlay: (o: Overlay) => void;
  assistant: AssistantUi;
  setAssistant: (patch: Partial<AssistantUi>) => void;
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
  /** A short confirmation of something the analyst just did (copied, saved). One at a time. */
  toast: { id: number; text: string } | null;
  notify: (text: string) => void;
  dismissToast: () => void;
}

export const dealUiStore = createStore<DealUiStore>()((set, get) => ({
  overlay: null,
  setOverlay: (overlay) => set({ overlay }),
  assistant: { open: assistantOpenAtStart(), tab: 'guide' },
  setAssistant: (patch) => {
    const assistant = { ...get().assistant, ...patch };
    if (patch.open !== undefined && typeof window !== 'undefined') { try { window.localStorage.setItem(ASSISTANT_KEY, patch.open ? '1' : '0'); } catch { /* not remembered */ } }
    set({ assistant });
  },
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
  toast: null,
  notify: (text) => set({ toast: { id: (get().toast?.id ?? 0) + 1, text } }),
  dismissToast: () => set({ toast: null }),
}));

export function useDealUi<T>(selector: (s: DealUiStore) => T): T {
  return useSyncExternalStore(dealUiStore.subscribe, () => selector(dealUiStore.getState()), () => selector(dealUiStore.getState()));
}
