/** Zustand store for Deal Engine state management — Section 8. */

import { create } from 'zustand';
import type { ModelState, ChatMessage, ScenarioSet, SensitivityTable, AppliedDiff, AIAnalysis } from '../lib/dealEngineTypes';
import * as api from '../lib/api';

interface DealEngineStore {
  modelState: ModelState | null;
  isCalculating: boolean;
  chatHistory: ChatMessage[];
  apiKey: string | null;
  activeScenario: string;
  activeSensitivityTable: number;
  scenarios: ScenarioSet[];
  sensitivityTables: SensitivityTable[];
  lastDiffs: AppliedDiff[];
  lastAnalysis: AIAnalysis | null;
  error: string | null;

  setApiKey: (key: string) => void;
  initializeModel: (inputs: {
    deal_name: string;
    revenue: number;
    ebitda_or_margin: number;
    entry_multiple: number;
    currency: string;
    sector: string;
  }) => Promise<void>;
  updateField: (path: string, value: unknown) => Promise<void>;
  sendChatMessage: (message: string) => Promise<void>;
  generateAssumptions: () => Promise<void>;
  loadScenarios: () => Promise<void>;
  loadSensitivity: (tableId: number) => Promise<void>;
  exportExcel: () => Promise<void>;
  saveModel: () => void;
  loadModel: (file: File) => Promise<void>;
  setActiveScenario: (s: string) => void;
  setActiveSensitivityTable: (t: number) => void;
}

export const useDealEngineStore = create<DealEngineStore>((set, get) => ({
  modelState: null,
  isCalculating: false,
  chatHistory: [],
  apiKey: typeof window !== 'undefined' ? sessionStorage.getItem('deal-engine-api-key') : null,
  activeScenario: 'base',
  activeSensitivityTable: 1,
  scenarios: [],
  sensitivityTables: [],
  lastDiffs: [],
  lastAnalysis: null,
  error: null,

  setApiKey: (key) => {
    sessionStorage.setItem('deal-engine-api-key', key);
    set({ apiKey: key });
  },

  initializeModel: async (inputs) => {
    set({ isCalculating: true, error: null });
    try {
      const { model_state } = await api.initializeModel(inputs);
      set({ modelState: model_state, isCalculating: false });
    } catch (e: any) {
      set({ error: e.message, isCalculating: false });
    }
  },

  updateField: async (path, value) => {
    set({ isCalculating: true, error: null });
    try {
      const { model_state } = await api.updateField(path, value);
      set({ modelState: model_state, isCalculating: false });
    } catch (e: any) {
      set({ error: e.message, isCalculating: false });
    }
  },

  sendChatMessage: async (message) => {
    const { modelState, apiKey, chatHistory } = get();
    if (!modelState || !apiKey) return;

    const userMsg: ChatMessage = { role: 'user', content: message, timestamp: new Date().toISOString() };
    set({ chatHistory: [...chatHistory, userMsg], isCalculating: true, error: null });

    try {
      const result = await api.sendChat(
        message,
        modelState,
        chatHistory.map((m) => ({ role: m.role, content: m.content })),
        apiKey,
      );
      if (result.error) {
        set({ error: result.error, isCalculating: false });
        return;
      }
      const aiMsg: ChatMessage = {
        role: 'assistant',
        content: result.ai_response?.return_decomposition || '',
        timestamp: new Date().toISOString(),
        assumption_updates: result.applied_diffs?.length ? Object.fromEntries(result.applied_diffs.map(d => [d.field, d.new])) : undefined,
        analysis: result.ai_response,
      };
      set({
        modelState: result.model_state,
        chatHistory: [...get().chatHistory, aiMsg],
        lastDiffs: result.applied_diffs || [],
        lastAnalysis: result.ai_response,
        isCalculating: false,
      });
    } catch (e: any) {
      set({ error: e.message, isCalculating: false });
    }
  },

  generateAssumptions: async () => {
    const { modelState, apiKey } = get();
    if (!modelState || !apiKey) return;
    set({ isCalculating: true, error: null });
    try {
      const { model_state } = await api.generateAssumptions(
        modelState.ai_toggle_fields,
        modelState,
        apiKey,
      );
      set({ modelState: model_state, isCalculating: false });
    } catch (e: any) {
      set({ error: e.message, isCalculating: false });
    }
  },

  loadScenarios: async () => {
    set({ isCalculating: true });
    try {
      const { scenarios } = await api.getScenarios();
      set({ scenarios, isCalculating: false });
    } catch (e: any) {
      set({ error: e.message, isCalculating: false });
    }
  },

  loadSensitivity: async (tableId) => {
    set({ isCalculating: true });
    try {
      const { table } = await api.getSensitivity(tableId);
      set((s) => {
        const existing = s.sensitivityTables.filter((t) => t.table_id !== tableId);
        return { sensitivityTables: [...existing, table], isCalculating: false, activeSensitivityTable: tableId };
      });
    } catch (e: any) {
      set({ error: e.message, isCalculating: false });
    }
  },

  exportExcel: async () => {
    try {
      const blob = await api.exportExcel();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${get().modelState?.deal_name || 'model'}_export.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  saveModel: () => {
    const { modelState } = get();
    if (!modelState) return;
    const blob = new Blob([JSON.stringify(modelState, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${modelState.deal_name || 'model'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  loadModel: async (file) => {
    const text = await file.text();
    const data = JSON.parse(text);
    set({ isCalculating: true });
    try {
      const { model_state } = await api.importJson(data);
      set({ modelState: model_state, isCalculating: false });
    } catch (e: any) {
      set({ error: e.message, isCalculating: false });
    }
  },

  setActiveScenario: (s) => set({ activeScenario: s }),
  setActiveSensitivityTable: (t) => set({ activeSensitivityTable: t }),
}));
