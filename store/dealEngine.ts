/** Zustand store for Deal Engine state management — fully client-side. */

import { create } from 'zustand';
import type {
  ModelState,
  ChatMessage,
  ScenarioSet,
  SensitivityTable,
  AppliedDiff,
  AIAnalysis,
} from '../lib/dealEngineTypes';
import { fullRecalc, createDefaultModelState } from '../lib/engine/index';
import { generateScenarios, generateSensitivityTable } from '../lib/engine/scenarios';
import { callAI } from '../lib/engine/ai/gateway';
import { buildProviderConfig, detectProvider } from '../lib/engine/ai/providers';
import type { AIProvider } from '../lib/engine/ai/providers';
import { buildExcel } from '../lib/engine/excelExport';

/** Apply a dot-notation update to a nested object. */
function applyUpdate(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (/^\d+$/.test(key)) {
      current = (current as unknown as unknown[])[parseInt(key)] as Record<string, unknown>;
    } else {
      if (!(key in current)) current[key] = {};
      current = current[key] as Record<string, unknown>;
    }
  }
  const finalKey = keys[keys.length - 1];
  if (/^\d+$/.test(finalKey)) {
    (current as unknown as unknown[])[parseInt(finalKey)] = value;
  } else {
    current[finalKey] = value;
  }
}

interface DealEngineStore {
  modelState: ModelState | null;
  isCalculating: boolean;
  chatHistory: ChatMessage[];
  apiKey: string | null;
  aiProvider: AIProvider;
  activeScenario: string;
  activeSensitivityTable: number;
  scenarios: ScenarioSet[];
  sensitivityTables: SensitivityTable[];
  lastDiffs: AppliedDiff[];
  lastAnalysis: AIAnalysis | null;
  error: string | null;

  setApiKey: (key: string) => void;
  setAiProvider: (provider: AIProvider) => void;
  setProviderAndKey: (provider: AIProvider, key: string) => void;
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
  aiProvider: (typeof window !== 'undefined' ? sessionStorage.getItem('deal-engine-ai-provider') as AIProvider : null) || 'anthropic',
  activeScenario: 'base',
  activeSensitivityTable: 1,
  scenarios: [],
  sensitivityTables: [],
  lastDiffs: [],
  lastAnalysis: null,
  error: null,

  setApiKey: (key) => {
    sessionStorage.setItem('deal-engine-api-key', key);
    const detected = detectProvider(key);
    sessionStorage.setItem('deal-engine-ai-provider', detected);
    set({ apiKey: key, aiProvider: detected });
  },

  setAiProvider: (provider) => {
    sessionStorage.setItem('deal-engine-ai-provider', provider);
    set({ aiProvider: provider });
  },

  setProviderAndKey: (provider, key) => {
    sessionStorage.setItem('deal-engine-api-key', key);
    sessionStorage.setItem('deal-engine-ai-provider', provider);
    set({ apiKey: key, aiProvider: provider });
  },

  initializeModel: async (inputs) => {
    set({ isCalculating: true, error: null });
    try {
      const state = createDefaultModelState();
      state.deal_name = inputs.deal_name;
      state.currency = inputs.currency as ModelState['currency'];
      state.sector = inputs.sector;
      state.revenue.base_revenue = inputs.revenue;

      if (inputs.ebitda_or_margin < 1) {
        state.margins.base_ebitda_margin = inputs.ebitda_or_margin;
      } else {
        state.margins.base_ebitda_margin = inputs.revenue > 0 ? inputs.ebitda_or_margin / inputs.revenue : 0.2;
      }

      state.entry.entry_ebitda_multiple = inputs.entry_multiple;
      state.exit.exit_ebitda_multiple = inputs.entry_multiple;

      const ebitda = inputs.revenue * state.margins.base_ebitda_margin;
      const defaultDebt = ebitda * 4.0;
      state.debt_tranches = [
        {
          name: 'Senior Term Loan A',
          principal: defaultDebt,
          interest_rate: 0.05,
          rate_type: 'fixed',
          base_rate: 0,
          spread: 0,
          amortization_type: 'bullet',
          amortization_schedule: [],
          pik_rate: 0,
          cash_interest: true,
          commitment_fee: 0,
          floor: 0,
          cash_sweep_pct: 0.5,
        },
      ];

      const result = fullRecalc(state);
      set({ modelState: result, isCalculating: false });
    } catch (e: unknown) {
      set({ error: (e as Error).message, isCalculating: false });
    }
  },

  updateField: async (path, value) => {
    set({ isCalculating: true, error: null });
    try {
      const { modelState } = get();
      if (!modelState) throw new Error('No model initialized');

      const stateDict = JSON.parse(JSON.stringify(modelState)) as Record<string, unknown>;
      applyUpdate(stateDict, path, value);
      const state = stateDict as unknown as ModelState;

      // Reset EV if entry multiple changed to allow re-derivation
      if (path === 'entry.entry_ebitda_multiple') {
        state.entry.enterprise_value = 0;
      }

      const result = fullRecalc(state);
      set({ modelState: result, isCalculating: false });
    } catch (e: unknown) {
      set({ error: (e as Error).message, isCalculating: false });
    }
  },

  sendChatMessage: async (message) => {
    const { modelState, apiKey, aiProvider, chatHistory } = get();
    if (!modelState || !apiKey) return;

    const userMsg: ChatMessage = { role: 'user', content: message, timestamp: new Date().toISOString() };
    set({ chatHistory: [...chatHistory, userMsg], isCalculating: true, error: null });

    try {
      const config = buildProviderConfig(aiProvider, apiKey);
      const result = await callAI(
        message,
        modelState,
        chatHistory.map((m) => ({ role: m.role, content: m.content })),
        config,
      );

      if (result.error) {
        set({ error: result.error, isCalculating: false });
        return;
      }

      // Apply AI updates to state
      let updatedState = modelState;
      if (result.updatedStateDict) {
        updatedState = result.updatedStateDict as unknown as ModelState;
      }
      if (result.triggerRecalculation) {
        updatedState = fullRecalc(updatedState);
      }

      const aiMsg: ChatMessage = {
        role: 'assistant',
        content: result.analysis?.return_decomposition || '',
        timestamp: new Date().toISOString(),
        assumption_updates: result.appliedDiffs.length
          ? Object.fromEntries(result.appliedDiffs.map((d) => [d.field, d.new]))
          : undefined,
        analysis: result.analysis || undefined,
      };

      set({
        modelState: updatedState,
        chatHistory: [...get().chatHistory, aiMsg],
        lastDiffs: result.appliedDiffs,
        lastAnalysis: result.analysis,
        isCalculating: false,
      });
    } catch (e: unknown) {
      set({ error: (e as Error).message, isCalculating: false });
    }
  },

  generateAssumptions: async () => {
    const { modelState, apiKey, aiProvider } = get();
    if (!modelState || !apiKey) return;
    set({ isCalculating: true, error: null });
    try {
      const message = `Generate realistic assumptions for the following AI-toggled fields: ${modelState.ai_toggle_fields.join(', ')}. Use sector-appropriate values for ${modelState.sector}.`;
      const config = buildProviderConfig(aiProvider, apiKey);
      const result = await callAI(message, modelState, [], config);

      if (result.error) {
        set({ error: result.error, isCalculating: false });
        return;
      }

      let updatedState = modelState;
      if (result.updatedStateDict) {
        updatedState = result.updatedStateDict as unknown as ModelState;
      }
      updatedState = fullRecalc(updatedState);
      set({ modelState: updatedState, isCalculating: false });
    } catch (e: unknown) {
      set({ error: (e as Error).message, isCalculating: false });
    }
  },

  loadScenarios: async () => {
    set({ isCalculating: true });
    try {
      const { modelState } = get();
      if (!modelState) throw new Error('No model initialized');
      // Use setTimeout to avoid blocking UI on heavy computation
      const scenarios = await new Promise<ScenarioSet[]>((resolve) => {
        setTimeout(() => resolve(generateScenarios(modelState)), 0);
      });
      set({ scenarios, isCalculating: false });
    } catch (e: unknown) {
      set({ error: (e as Error).message, isCalculating: false });
    }
  },

  loadSensitivity: async (tableId) => {
    set({ isCalculating: true });
    try {
      const { modelState } = get();
      if (!modelState) throw new Error('No model initialized');
      // Use setTimeout to avoid blocking UI on heavy computation
      const table = await new Promise<SensitivityTable>((resolve) => {
        setTimeout(() => resolve(generateSensitivityTable(modelState, tableId)), 0);
      });
      set((s) => {
        const existing = s.sensitivityTables.filter((t) => t.table_id !== tableId);
        return { sensitivityTables: [...existing, table], isCalculating: false, activeSensitivityTable: tableId };
      });
    } catch (e: unknown) {
      set({ error: (e as Error).message, isCalculating: false });
    }
  },

  exportExcel: async () => {
    try {
      const { modelState } = get();
      if (!modelState) return;
      const blob = await buildExcel(modelState);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${modelState.deal_name || 'model'}_export.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      set({ error: (e as Error).message });
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
    const data = JSON.parse(text) as ModelState;
    set({ isCalculating: true });
    try {
      const result = fullRecalc(data);
      set({ modelState: result, isCalculating: false });
    } catch (e: unknown) {
      set({ error: (e as Error).message, isCalculating: false });
    }
  },

  setActiveScenario: (s) => set({ activeScenario: s }),
  setActiveSensitivityTable: (t) => set({ activeSensitivityTable: t }),
}));
