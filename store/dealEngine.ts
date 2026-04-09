/** Zustand store for Deal Engine state management — fully client-side. */

import { create } from 'zustand';
import type {
  ModelState,
  ChatMessage,
  ScenarioSet,
  SensitivityTable,
  AppliedDiff,
  AIAnalysis,
  PendingEdit,
} from '../lib/dealEngineTypes';
import { fullRecalc, createDefaultModelState } from '../lib/engine/index';
import { generateScenarios, generateSensitivityTable } from '../lib/engine/scenarios';
import { callAI, generatePanelInsights } from '../lib/engine/ai/gateway';
import type { PanelInsights } from '../lib/engine/ai/gateway';
import { generateInvestmentMemo } from '../lib/engine/ai/memoGenerator';
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

// ── Sector-specific starting assumptions ────────────────────────────────

const SECTOR_DEFAULTS: Record<string, {
  growthRates: number[];
  marginExpansion: number;
  leverage: number;
  seniorRate: number;
  exitMultipleAdj: number;
}> = {
  Technology:          { growthRates: [0.12, 0.10, 0.08, 0.07, 0.06], marginExpansion: 0.06, leverage: 4.5, seniorRate: 0.060, exitMultipleAdj:  0.0 },
  Healthcare:          { growthRates: [0.08, 0.07, 0.07, 0.06, 0.06], marginExpansion: 0.04, leverage: 4.0, seniorRate: 0.055, exitMultipleAdj: -0.5 },
  Industrials:         { growthRates: [0.05, 0.05, 0.04, 0.04, 0.04], marginExpansion: 0.03, leverage: 3.5, seniorRate: 0.055, exitMultipleAdj: -1.0 },
  Consumer:            { growthRates: [0.06, 0.05, 0.05, 0.04, 0.04], marginExpansion: 0.03, leverage: 3.5, seniorRate: 0.055, exitMultipleAdj: -0.5 },
  'Financial Services':{ growthRates: [0.07, 0.06, 0.06, 0.05, 0.05], marginExpansion: 0.03, leverage: 3.0, seniorRate: 0.065, exitMultipleAdj:  0.0 },
  'Real Estate':       { growthRates: [0.04, 0.04, 0.04, 0.03, 0.03], marginExpansion: 0.03, leverage: 5.0, seniorRate: 0.050, exitMultipleAdj:  0.0 },
  Energy:              { growthRates: [0.04, 0.04, 0.03, 0.03, 0.03], marginExpansion: 0.02, leverage: 3.5, seniorRate: 0.065, exitMultipleAdj: -1.0 },
  'Business Services': { growthRates: [0.08, 0.07, 0.07, 0.06, 0.05], marginExpansion: 0.04, leverage: 4.0, seniorRate: 0.055, exitMultipleAdj: -0.5 },
  Other:               { growthRates: [0.06, 0.06, 0.05, 0.05, 0.04], marginExpansion: 0.03, leverage: 4.0, seniorRate: 0.060, exitMultipleAdj: -0.5 },
};

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
  aiPanelInsights: PanelInsights | null;
  aiPanelInsightsLoading: boolean;
  memoContent: string | null;
  isMemoGenerating: boolean;
  error: string | null;
  pendingEdits: PendingEdit[];

  setApiKey: (key: string) => void;
  setAiProvider: (provider: AIProvider) => void;
  setProviderAndKey: (provider: AIProvider, key: string) => void;
  clearApiKey: () => void;
  initializeModel: (inputs: {
    deal_name: string;
    revenue: number;
    ebitda_or_margin: number;
    entry_multiple: number;
    currency: string;
    sector: string;
    apiKey?: string;
  }) => Promise<void>;
  resetModel: () => void;
  updateField: (path: string, value: unknown) => Promise<void>;
  sendChatMessage: (message: string) => Promise<void>;
  acceptEdits: () => Promise<void>;
  rejectEdits: () => void;
  generateAssumptions: () => Promise<void>;
  loadScenarios: () => Promise<void>;
  loadSensitivity: (tableId: number) => Promise<void>;
  exportExcel: () => Promise<void>;
  saveModel: () => void;
  loadModel: (file: File) => Promise<void>;
  refreshPanelInsights: () => Promise<void>;
  addTranche: () => void;
  removeTranche: (index: number) => void;
  generateMemo: () => Promise<void>;
  setActiveScenario: (s: string) => void;
  setActiveSensitivityTable: (t: number) => void;
}

export const useDealEngineStore = create<DealEngineStore>((set, get) => ({
  modelState: null,
  isCalculating: false,
  chatHistory: [],
  apiKey: typeof window !== 'undefined' ? localStorage.getItem('deal-engine-api-key') : null,
  aiProvider: (typeof window !== 'undefined' ? localStorage.getItem('deal-engine-ai-provider') as AIProvider : null) || 'anthropic',
  activeScenario: 'base',
  activeSensitivityTable: 1,
  scenarios: [],
  sensitivityTables: [],
  lastDiffs: [],
  lastAnalysis: null,
  aiPanelInsights: null,
  aiPanelInsightsLoading: false,
  memoContent: null,
  isMemoGenerating: false,
  error: null,
  pendingEdits: [],

  setApiKey: (key) => {
    localStorage.setItem('deal-engine-api-key', key);
    const detected = detectProvider(key);
    localStorage.setItem('deal-engine-ai-provider', detected);
    set({ apiKey: key, aiProvider: detected });
  },

  setAiProvider: (provider) => {
    localStorage.setItem('deal-engine-ai-provider', provider);
    set({ aiProvider: provider });
  },

  setProviderAndKey: (provider, key) => {
    localStorage.setItem('deal-engine-api-key', key);
    localStorage.setItem('deal-engine-ai-provider', provider);
    set({ apiKey: key, aiProvider: provider });
  },

  clearApiKey: () => {
    localStorage.removeItem('deal-engine-api-key');
    localStorage.removeItem('deal-engine-ai-provider');
    set({ apiKey: null, aiProvider: 'anthropic' });
  },

  resetModel: () => set({ modelState: null, chatHistory: [], lastDiffs: [], lastAnalysis: null, aiPanelInsights: null, aiPanelInsightsLoading: false, memoContent: null, isMemoGenerating: false, error: null, pendingEdits: [] }),

  initializeModel: async (inputs) => {
    set({ isCalculating: true, error: null });
    try {
      // Store API key immediately if provided
      const rawKey = inputs.apiKey?.trim();
      if (rawKey) {
        const detected = detectProvider(rawKey);
        localStorage.setItem('deal-engine-api-key', rawKey);
        localStorage.setItem('deal-engine-ai-provider', detected);
        set({ apiKey: rawKey, aiProvider: detected });
      }

      const state = createDefaultModelState();
      state.deal_name = inputs.deal_name;
      state.currency = inputs.currency as ModelState['currency'];
      state.sector = inputs.sector;
      state.revenue.base_revenue = inputs.revenue;

      const baseMarg = inputs.ebitda_or_margin < 1
        ? inputs.ebitda_or_margin
        : (inputs.revenue > 0 ? inputs.ebitda_or_margin / inputs.revenue : 0.2);
      state.margins.base_ebitda_margin = baseMarg;

      // Apply sector defaults
      const sd = SECTOR_DEFAULTS[inputs.sector] || SECTOR_DEFAULTS['Other'];
      state.revenue.growth_rates = [...sd.growthRates];
      state.margins.target_ebitda_margin = Math.min(baseMarg + sd.marginExpansion, 0.55);
      state.exit.exit_ebitda_multiple = Math.max(1, inputs.entry_multiple + sd.exitMultipleAdj);

      // 2-tranche debt structure based on sector leverage
      const ebitda = inputs.revenue * baseMarg;
      const totalDebt = ebitda * sd.leverage;
      state.debt_tranches = [
        {
          name: 'Senior Term Loan A',
          tranche_type: 'senior',
          principal: Math.round(totalDebt * 0.65 * 10) / 10,
          interest_rate: sd.seniorRate,
          rate_type: 'fixed',
          base_rate: 0,
          spread: 0,
          amortization_type: 'straight_line',
          amortization_schedule: [],
          pik_rate: 0,
          cash_interest: true,
          commitment_fee: 0,
          floor: 0,
          cash_sweep_pct: 0,
        },
        {
          name: 'Senior Term Loan B',
          tranche_type: 'senior',
          principal: Math.round(totalDebt * 0.35 * 10) / 10,
          interest_rate: sd.seniorRate + 0.02,
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

      state.entry.entry_ebitda_multiple = inputs.entry_multiple;
      state.entry.enterprise_value = 0;

      const initialResult = fullRecalc(state);

      // If API key available, use AI to enhance assumptions based on company name + sector
      const { apiKey: storedKey, aiProvider } = get();
      const effectiveKey = rawKey || storedKey;

      if (effectiveKey) {
        set({ modelState: initialResult });
        try {
          const provider = rawKey ? detectProvider(rawKey) : aiProvider;
          const config = buildProviderConfig(provider, effectiveKey);
          const ebitdaM = (inputs.revenue * baseMarg).toFixed(1);
          const evM = (inputs.revenue * baseMarg * inputs.entry_multiple).toFixed(0);

          const aiMessage = `Initialize comprehensive LBO assumptions for ${inputs.deal_name} (${inputs.sector} sector).

Entry snapshot:
- LTM Revenue: ${inputs.revenue}M ${inputs.currency}
- EBITDA: ${ebitdaM}M (${(baseMarg * 100).toFixed(1)}% margin)
- Entry Multiple: ${inputs.entry_multiple}x — Implied EV: ${evM}M ${inputs.currency}

Using the company name and sector context, set realistic LBO assumptions. Update these paths:
- revenue.growth_rates: 5-year array as DECIMALS (e.g. 0.08 = 8%, 0.12 = 12%). Typical PE range: 0.03–0.20. NEVER set values above 0.50.
- margins.target_ebitda_margin: realistic target after 5-year hold, as DECIMAL (e.g. 0.30 = 30%)
- margins.margin_trajectory: linear/front_loaded/back_loaded
- margins.da_pct_revenue: as DECIMAL (e.g. 0.05 = 5%)
- margins.capex_pct_revenue: as DECIMAL (e.g. 0.04 = 4%)
- margins.nwc_pct_revenue: as DECIMAL (e.g. 0.08 = 8%)
- exit.exit_ebitda_multiple: realistic exit multiple given entry, sector comps, 5-year hold

Be specific. Use the company name to infer business type and calibrate accordingly. Set trigger_recalculation to true.`;

          const result = await callAI(aiMessage, initialResult, [], config);
          if (!result.error && result.updatedStateDict && result.appliedDiffs.length > 0) {
            // Clamp AI-set assumptions to sane PE bounds
            const aiMs = result.updatedStateDict as unknown as ModelState;
            aiMs.revenue.growth_rates = aiMs.revenue.growth_rates.map((g) =>
              Math.max(-0.30, Math.min(0.50, g))
            );
            aiMs.margins.target_ebitda_margin = Math.max(0.05, Math.min(0.60, aiMs.margins.target_ebitda_margin));
            aiMs.margins.da_pct_revenue = Math.max(0.005, Math.min(0.20, aiMs.margins.da_pct_revenue));
            aiMs.margins.capex_pct_revenue = Math.max(0.005, Math.min(0.25, aiMs.margins.capex_pct_revenue));
            aiMs.margins.nwc_pct_revenue = Math.max(-0.10, Math.min(0.30, aiMs.margins.nwc_pct_revenue));
            aiMs.exit.exit_ebitda_multiple = Math.max(3, Math.min(30, aiMs.exit.exit_ebitda_multiple));

            const aiState = fullRecalc(aiMs);
            set({ modelState: aiState, isCalculating: false });
            // Fire panel insights in background (non-blocking)
            get().refreshPanelInsights();
            return;
          }
        } catch {
          // AI init failed — fall through to sector-default result
        }
      }

      set({ modelState: initialResult, isCalculating: false });
      // Fire panel insights if API key available (non-blocking)
      if (get().apiKey) get().refreshPanelInsights();
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

      // Track which entry field was edited for clean bidirectional sync in deriveEntryFields
      if (path === 'entry.entry_ebitda_multiple') {
        state._lastEditedEntryField = 'multiple';
        const ebitda = state.revenue.base_revenue * state.margins.base_ebitda_margin;
        if (ebitda > 0) {
          state.entry.enterprise_value = ebitda * (value as number);
        }
      } else if (path === 'entry.enterprise_value') {
        state._lastEditedEntryField = 'ev';
        const ebitda = state.revenue.base_revenue * state.margins.base_ebitda_margin;
        if (ebitda > 0) {
          state.entry.entry_ebitda_multiple = (value as number) / ebitda;
        }
      } else if (path === 'entry.leverage_ratio') {
        // Leverage drives tranche sizing: scale all tranche principals proportionally
        const ebitda = state.revenue.base_revenue * state.margins.base_ebitda_margin;
        const targetLeverage = value as number;
        if (ebitda > 0 && targetLeverage > 0) {
          const newTotalDebt = ebitda * targetLeverage;
          const currentTotalDebt = state.debt_tranches.reduce((s, t) => s + t.principal, 0);
          if (currentTotalDebt > 0) {
            const scaleFactor = newTotalDebt / currentTotalDebt;
            for (const tranche of state.debt_tranches) {
              tranche.principal = Math.round(tranche.principal * scaleFactor * 10) / 10;
            }
          }
          state.entry.leverage_ratio = targetLeverage;
        }
        state._lastEditedEntryField = null;
      } else if (path === 'exit.exit_ev_override') {
        // When exit EV override is set, back-solve exit multiple from projected EBITDA
        const exitEvVal = value as number;
        if (exitEvVal > 0 && state.exit.exit_ebitda > 0) {
          state.exit.exit_ebitda_multiple = exitEvVal / state.exit.exit_ebitda;
        }
        state._lastEditedEntryField = null;
      } else {
        state._lastEditedEntryField = null;
      }

      const result = fullRecalc(state);
      set({ modelState: result, isCalculating: false, memoContent: null, scenarios: [] });
    } catch (e: unknown) {
      set({ error: (e as Error).message, isCalculating: false });
    }
  },

  sendChatMessage: async (message) => {
    const { modelState, apiKey, aiProvider, chatHistory } = get();
    if (!modelState || !apiKey) return;

    const trimmed = message.trim();
    const trimmedLower = trimmed.toLowerCase();

    // Handle /accept command
    if (trimmedLower === '/accept') {
      const { pendingEdits } = get();
      if (pendingEdits.length === 0) {
        const msg: ChatMessage = { role: 'assistant', content: 'No pending edits to accept.', timestamp: new Date().toISOString() };
        set({ chatHistory: [...chatHistory, { role: 'user', content: trimmed, timestamp: new Date().toISOString() }, msg] });
        return;
      }
      const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
      set({ chatHistory: [...chatHistory, userMsg] });
      await get().acceptEdits();
      return;
    }

    // Handle /reject command
    if (trimmedLower === '/reject') {
      const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
      set({ chatHistory: [...chatHistory, userMsg] });
      get().rejectEdits();
      return;
    }

    const isEditMode = trimmedLower.startsWith('/edit ');
    const actualMessage = isEditMode ? trimmed.replace(/^\/edit\s+/i, '') : trimmed;

    const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
    set({ chatHistory: [...chatHistory, userMsg], isCalculating: true, error: null });

    try {
      const config = buildProviderConfig(aiProvider, apiKey);
      const result = await callAI(
        actualMessage,
        modelState,
        chatHistory.map((m) => ({ role: m.role, content: m.content })),
        config,
        { editMode: isEditMode, inquiryOnly: !isEditMode },
      );

      if (result.error) {
        set({ error: result.error, isCalculating: false });
        return;
      }

      if (isEditMode && result.appliedDiffs.length > 0) {
        // Edit mode: store as pending edits instead of applying
        const pending: PendingEdit[] = result.appliedDiffs.map((d) => ({
          field: d.field,
          oldValue: d.old,
          newValue: d.new,
          reason: '',
        }));

        const aiMsg: ChatMessage = {
          role: 'assistant',
          content: result.analysis?.message || `Suggested ${pending.length} change(s). Type /accept to apply or /reject to discard.`,
          timestamp: new Date().toISOString(),
          assumption_updates: Object.fromEntries(result.appliedDiffs.map((d) => [d.field, d.new])),
          analysis: result.analysis || undefined,
        };

        set({
          pendingEdits: pending,
          chatHistory: [...get().chatHistory, aiMsg],
          lastAnalysis: result.analysis,
          isCalculating: false,
        });
      } else {
        // Inquiry mode or edit mode with no diffs: just display text response
        const aiMsg: ChatMessage = {
          role: 'assistant',
          content: result.analysis?.message || result.analysis?.return_decomposition || 'No changes suggested.',
          timestamp: new Date().toISOString(),
          analysis: result.analysis || undefined,
        };

        set({
          chatHistory: [...get().chatHistory, aiMsg],
          lastAnalysis: result.analysis,
          isCalculating: false,
        });
      }
    } catch (e: unknown) {
      set({ error: (e as Error).message, isCalculating: false });
    }
  },

  acceptEdits: async () => {
    const { modelState, pendingEdits, chatHistory } = get();
    if (!modelState || pendingEdits.length === 0) return;
    set({ isCalculating: true });
    try {
      const stateDict = JSON.parse(JSON.stringify(modelState)) as Record<string, unknown>;
      for (const edit of pendingEdits) {
        applyUpdate(stateDict, edit.field, edit.newValue);
      }
      const state = stateDict as unknown as ModelState;
      // Handle EV/multiple sync if either was in the edits
      const evEdit = pendingEdits.find(e => e.field === 'entry.enterprise_value');
      const multEdit = pendingEdits.find(e => e.field === 'entry.entry_ebitda_multiple');
      if (evEdit) state._lastEditedEntryField = 'ev';
      else if (multEdit) state._lastEditedEntryField = 'multiple';

      const result = fullRecalc(state);
      const confirmMsg: ChatMessage = {
        role: 'assistant',
        content: `Applied ${pendingEdits.length} change(s) to the model.`,
        timestamp: new Date().toISOString(),
        assumption_updates: Object.fromEntries(pendingEdits.map(e => [e.field, e.newValue])),
      };
      set({
        modelState: result,
        pendingEdits: [],
        chatHistory: [...chatHistory, confirmMsg],
        isCalculating: false,
        memoContent: null,
        scenarios: [],
      });
      get().refreshPanelInsights();
    } catch (e: unknown) {
      set({ error: (e as Error).message, isCalculating: false });
    }
  },

  rejectEdits: () => {
    const { chatHistory } = get();
    const msg: ChatMessage = { role: 'assistant', content: 'Edits discarded.', timestamp: new Date().toISOString() };
    set({ pendingEdits: [], chatHistory: [...chatHistory, msg] });
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
      set({ modelState: updatedState, isCalculating: false, memoContent: null });
    } catch (e: unknown) {
      set({ error: (e as Error).message, isCalculating: false });
    }
  },

  loadScenarios: async () => {
    set({ isCalculating: true });
    try {
      const { modelState } = get();
      if (!modelState) throw new Error('No model initialized');
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
      set({
        modelState: result,
        isCalculating: false,
        chatHistory: [],
        scenarios: [],
        sensitivityTables: [],
        lastDiffs: [],
        lastAnalysis: null,
        aiPanelInsights: null,
        memoContent: null,
        error: null,
      });
      // Refresh panel insights for newly loaded model
      if (get().apiKey) get().refreshPanelInsights();
    } catch (e: unknown) {
      set({ error: (e as Error).message, isCalculating: false });
    }
  },

  refreshPanelInsights: async () => {
    const { modelState, apiKey, aiProvider } = get();
    if (!modelState || !apiKey) return;
    set({ aiPanelInsightsLoading: true });
    try {
      const config = buildProviderConfig(aiProvider, apiKey);
      const insights = await generatePanelInsights(modelState, config);
      set({ aiPanelInsights: insights, aiPanelInsightsLoading: false });
    } catch {
      set({ aiPanelInsightsLoading: false });
    }
  },

  addTranche: () => {
    const ms = get().modelState;
    if (!ms) return;
    const newTranche = {
      name: `Tranche ${ms.debt_tranches.length + 1}`,
      tranche_type: 'senior' as const,
      principal: 0,
      interest_rate: 0.05,
      rate_type: 'fixed' as const,
      base_rate: 0,
      spread: 0,
      amortization_type: 'bullet' as const,
      amortization_schedule: [] as number[],
      pik_rate: 0,
      cash_interest: true,
      commitment_fee: 0,
      floor: 0,
      cash_sweep_pct: 0,
    };
    const updated = { ...ms, debt_tranches: [...ms.debt_tranches, newTranche] };
    const result = fullRecalc(updated);
    set({ modelState: result, memoContent: null, scenarios: [] });
  },

  removeTranche: (index: number) => {
    const ms = get().modelState;
    if (!ms || ms.debt_tranches.length <= 1) return;
    const updated = { ...ms, debt_tranches: ms.debt_tranches.filter((_, i) => i !== index) };
    const result = fullRecalc(updated);
    set({ modelState: result, memoContent: null, scenarios: [] });
  },

  generateMemo: async () => {
    const { modelState, apiKey, aiProvider } = get();
    if (!modelState || !apiKey) return;
    set({ isMemoGenerating: true, memoContent: null, error: null });
    try {
      // Compute scenarios if not already loaded — scenarios live at store root,
      // but memo generator reads modelState.scenarios which would otherwise be empty.
      let scenarios = get().scenarios;
      if (!scenarios || scenarios.length === 0) {
        scenarios = generateScenarios(modelState);
        set({ scenarios });
      }

      // Inject scenarios into a modelState copy for the memo generator
      const msWithScenarios = { ...modelState, scenarios };

      const config = buildProviderConfig(aiProvider, apiKey);
      const memo = await generateInvestmentMemo(msWithScenarios, config);
      set({ memoContent: memo, isMemoGenerating: false });
    } catch (e: unknown) {
      set({ isMemoGenerating: false, error: (e as Error).message });
    }
  },

  setActiveScenario: (s) => set({ activeScenario: s }),
  setActiveSensitivityTable: (t) => set({ activeSensitivityTable: t }),
}));
