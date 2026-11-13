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
/** Closed until the analyst opens it; their own choice is remembered. */
function assistantOpenAtStart(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(ASSISTANT_KEY) === '1'; } catch { return false; }
}

/**
 * What the analyst asked the page to do for them, chosen on the first screen and remembered.
 *   suggestClean       : show the adjustments found in the filing on the Clean step
 *   suggestAssumptions : show a suggested value, in grey, inside each blank input
 *   flow               : keyboard flow on Assumptions (start in the first open input and keep
 *                        each next input in view, so the sheet is worked without the mouse)
 */
export interface AiFeatures { suggestClean: boolean; suggestAssumptions: boolean; flow: boolean }
const FEATURES_KEY = 'deal-engine-ai-features';
const FEATURE_DEFAULTS: AiFeatures = { suggestClean: true, suggestAssumptions: true, flow: true };
function featuresAtStart(): AiFeatures {
  if (typeof window === 'undefined') return FEATURE_DEFAULTS;
  try {
    const saved = JSON.parse(window.localStorage.getItem(FEATURES_KEY) ?? '{}') as Partial<AiFeatures>;
    return { ...FEATURE_DEFAULTS, ...Object.fromEntries(Object.entries(saved).filter(([k, v]) => k in FEATURE_DEFAULTS && typeof v === 'boolean')) };
  } catch { return FEATURE_DEFAULTS; }
}
/** A figure to trace: the label of its row in the Excel model and, for a yearly row, the year. */
export interface TraceTarget { label: string; year?: number; sheet?: string }

export interface DealUiStore {
  overlay: Overlay;
  setOverlay: (o: Overlay) => void;
  assistant: AssistantUi;
  setAssistant: (patch: Partial<AssistantUi>) => void;
  features: AiFeatures;
  setFeature: (name: keyof AiFeatures, on: boolean) => void;
  /** The input whose suggestion is being explained (its pop-up is open); one at a time. */
  why: string | null;
  setWhy: (id: string | null) => void;
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
  features: featuresAtStart(),
  setFeature: (name, on) => {
    const features = { ...get().features, [name]: on };
    if (typeof window !== 'undefined') { try { window.localStorage.setItem(FEATURES_KEY, JSON.stringify(features)); } catch { /* not remembered */ } }
    set({ features });
  },
  why: null,
  setWhy: (why) => { if (get().why !== why) set({ why }); },
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
