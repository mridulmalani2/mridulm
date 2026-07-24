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
  CetparResult,
} from '../lib/dealEngineTypes';
import { fullRecalc, createDefaultModelState } from '../lib/engine/index';
import { generateScenarios, generateSensitivityTable, generateAllSensitivityTables } from '../lib/engine/scenarios';
import { callAI, generatePanelInsights, runCetpar, callRedlineAI, STRUCTURE_SYSTEM_PROMPT } from '../lib/engine/ai/gateway';
import type { PanelInsights } from '../lib/engine/ai/gateway';
import { generateInvestmentMemo } from '../lib/engine/ai/memoGenerator';
import { buildProviderConfig, detectProvider } from '../lib/engine/ai/providers';
import type { AIProvider } from '../lib/engine/ai/providers';
import { computeChangedTraceFields } from '../lib/traceMap';
import { getCompanyFacts, getSubmissions, extractRecentFilings } from '../lib/edgar/client';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import { isIfrsCompanyFacts, mapCompanyFactsIfrs } from '../lib/edgar/mapCompanyFactsIfrs';
import { getEsefFilings, getEsefReport } from '../lib/edgar/esef';
import { mapIfrsReport } from '../lib/edgar/mapIfrs';
import { draftModelFromHistoricals, inferSector } from '../lib/edgar/buildModel';
import type { RawHistoricals, ProvenanceMap, Provenance } from '../lib/edgar/types';
import { isMissing } from '../lib/edgar/missing';

// ── LBO Financial Sanity Check ──────────────────────────────────────────
// Derived from first principles:
//   - A real LBO over 5 years at 100% IRR = 32x MOIC — genuinely exceptional.
//     Anything beyond 100% IRR or 20x MOIC indicates a data/unit error.
//   - Entry equity ≤ 0 means total debt exceeds EV — impossible deal structure.
//   - Exit equity < 0 means the firm is underwater at exit — valid as a scenario
//     output only when purposely stressed, not as a result of AI changes.

interface LBOSanityResult {
  valid: boolean;
  reason?: string;
}

function checkLBOSanity(result: ModelState): LBOSanityResult {
  const ret = result.returns;

  if (ret.entry_equity <= 0) {
    return {
      valid: false,
      reason: `Entry equity is ${ret.entry_equity.toFixed(1)}M — total debt (${result.entry.total_debt_raised.toFixed(1)}M) exceeds enterprise value (${result.entry.enterprise_value.toFixed(1)}M). This deal structure is not viable. Likely cause: leverage or debt principal set too high relative to EV.`,
    };
  }

  if (ret.moic > 20) {
    return {
      valid: false,
      reason: `MOIC of ${ret.moic.toFixed(1)}x exceeds the realistic LBO ceiling of ~20x. This almost certainly reflects a unit error in the suggested changes — e.g. a growth rate set as 8 (meaning 800%) instead of 0.08 (8%), or an exit multiple set as a percentage integer instead of a multiplier.`,
    };
  }

  if (ret.irr !== null && ret.irr > 1.0) {
    return {
      valid: false,
      reason: `IRR of ${(ret.irr * 100).toFixed(1)}% exceeds the realistic LBO ceiling of ~100%. This almost certainly reflects a unit error in the suggested changes — check that all rates (growth, margin, interest) are expressed as decimals (0.08 = 8%, not 8).`,
    };
  }

  return { valid: true };
}

function OUTPUT_KEY_META_FORMAT(key: string, value: number): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const mult = (v: number) => `${v.toFixed(2)}x`;
  switch (key) {
    case 'irr': case 'gross_irr': return pct(value);
    case 'moic': case 'dpi': case 'leverage_y1': case 'leverage_y2': case 'leverage_y3': case 'icr_y1': return mult(value);
    default: return String(value);
  }
}

function formatParamValue(path: string, value: number): string {
  if (/margin|capex|nwc|da_pct|tax|growth_rate|organic/.test(path)) return `${(value * 100).toFixed(2)}%`;
  if (/multiple/.test(path)) return `${value.toFixed(1)}x`;
  if (/leverage/.test(path)) return `${value.toFixed(1)}x`;
  if (/holding_period/.test(path)) return `${Math.round(value)} years`;
  return value.toFixed(2);
}

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
  /** E1 [OWNER DECISION #2]: set when a save produced by the previous engine is loaded —
   *  the model screen shows the "re-import from source" banner (dismissable; the Phase F
   *  cutover turns this into the hard unsupported message). */
  legacySaveNotice: boolean;
  dismissLegacySaveNotice: () => void;
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
  /** Increments on every full recalculation — used by trace cards for stale-value detection. */
  modelVersion: number;
  /** Trace fields whose value changed in the last recalculation (recommendation #1). */
  lastChangedTraceFields: string[];
  /** Whether Trace Mode is active — double-click opens trace cards only when true (recommendation #8). */
  traceModeActive: boolean;
  /** Pending ceteris paribus solver result awaiting user option selection. */
  cetparResult: CetparResult | null;

  // ── Phase 1: real-filing import + assumptions review ──
  /** Which start-flow screen is active. 'model' once the deal is built. */
  startScreen: 'source' | 'assumptions' | 'model';
  /** Factual historicals extracted from filings (null until an import runs). */
  rawHistoricals: RawHistoricals | null;
  /** fieldPath → provenance for every populated input (EDGAR / AI / user / default). */
  provenanceMap: ProvenanceMap;
  /** Filing links surfaced on the review screen (the target's recent 10-Ks/20-Fs). */
  sourceFilings: { form: string; filingDate: string; documentUrl: string }[];
  /** True while AI is suggesting the assumptions group. */
  isSuggesting: boolean;

  setApiKey: (key: string) => void;
  setAiProvider: (provider: AIProvider) => void;
  setProviderAndKey: (provider: AIProvider, key: string) => void;
  clearApiKey: () => void;
  toggleTraceMode: () => void;
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
  selectCetparOption: (option: CetparResult['options'][number]) => void;
  dismissCetpar: () => void;

  // ── Phase 1 actions ──
  setStartScreen: (screen: 'source' | 'assumptions' | 'model') => void;
  /** Import a target by CIK: fetch + map filings, draft the assumptions, go to review. */
  importFromEdgar: (cik10: string, opts?: { dealName?: string; sector?: string }) => Promise<void>;
  /** Import a European target by LEI: fetch its latest ESEF report (filings.xbrl.org), map the
   *  IFRS facts, draft the assumptions, go to review — same downstream as the SEC path. */
  importFromEsef: (lei: string, opts?: { dealName?: string; sector?: string }) => Promise<void>;
  /** Draft directly from already-mapped historicals (10-K upload path / programmatic). */
  loadFromHistoricals: (raw: RawHistoricals, opts?: { dealName?: string; sector?: string }) => void;
  /** Edit one reviewed field; marks its provenance 'user' and re-derives the live draft. */
  editAssumption: (path: string, value: unknown) => void;
  /** AI-suggest the forward assumptions (sector-aware) using the saved provider/key. */
  aiSuggestAssumptions: () => Promise<void>;
  /** Commit the reviewed draft → full model, switch to the model screen. */
  buildModelFromDraft: () => void;
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
  modelVersion: 0,
  lastChangedTraceFields: [],
  traceModeActive: false,
  cetparResult: null,
  startScreen: 'source',
  rawHistoricals: null,
  provenanceMap: {},
  sourceFilings: [],
  isSuggesting: false,

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

  toggleTraceMode: () => set((s) => ({ traceModeActive: !s.traceModeActive })),

  resetModel: () => set({ modelState: null, chatHistory: [], lastDiffs: [], lastAnalysis: null, aiPanelInsights: null, aiPanelInsightsLoading: false, memoContent: null, isMemoGenerating: false, error: null, pendingEdits: [], startScreen: 'source', rawHistoricals: null, provenanceMap: {}, sourceFilings: [], isSuggesting: false }),

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
            set({ modelState: aiState, isCalculating: false, startScreen: 'model' });
            // Fire panel insights in background (non-blocking)
            get().refreshPanelInsights();
            return;
          }
        } catch {
          // AI init failed — fall through to sector-default result
        }
      }

      set({ modelState: initialResult, isCalculating: false, startScreen: 'model' });
      // Fire panel insights if API key available (non-blocking)
      if (get().apiKey) get().refreshPanelInsights();
    } catch (e: unknown) {
      set({ error: (e as Error).message, isCalculating: false });
    }
  },

  updateField: async (path, value) => {
    set({ isCalculating: true, error: null });
    try {
      const { modelState, modelVersion, provenanceMap } = get();
      if (!modelState) throw new Error('No model initialized');

      const stateDict = JSON.parse(JSON.stringify(modelState)) as Record<string, unknown>;
      applyUpdate(stateDict, path, value);
      const state = stateDict as unknown as ModelState;

      // Editing the multiple or EV makes THAT field the single valuation driver; the other
      // becomes a derived read-only output in deriveEntryFields (which also honours the
      // LTM/NTM basis — so we no longer hand-derive it here with LTM-only EBITDA).
      if (path === 'entry.entry_ebitda_multiple') {
        state.entry.entry_valuation_driver = 'multiple';
      } else if (path === 'entry.enterprise_value') {
        state.entry.entry_valuation_driver = 'ev';
      } else if (path === 'entry.leverage_ratio') {
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
      } else if (path === 'exit.exit_ev_override') {
        const exitEvVal = value as number;
        if (exitEvVal > 0 && state.exit.exit_ebitda > 0) {
          state.exit.exit_ebitda_multiple = exitEvVal / state.exit.exit_ebitda;
        }
      }

      const result = fullRecalc(state);
      const changedFields = computeChangedTraceFields(modelState, result);
      // Editing a field on the model screen makes it user-sourced — in particular this clears a
      // 'missing' provenance (the field is no longer an unfilled gap), mirroring editAssumption.
      const userProv: Provenance = { source: 'user', detail: 'Edited on the model screen' };
      set({
        modelState: result,
        provenanceMap: { ...provenanceMap, [path]: userProv },
        modelVersion: modelVersion + 1,
        lastChangedTraceFields: changedFields,
        isCalculating: false,
        memoContent: null,
        scenarios: [],
      });
    } catch (e: unknown) {
      set({ error: (e as Error).message, isCalculating: false });
    }
  },

  sendChatMessage: async (message) => {
    const { modelState, apiKey, aiProvider, chatHistory } = get();
    if (!modelState || !apiKey) return;

    const trimmed = message.trim();
    const trimmedLower = trimmed.toLowerCase();

    // ── /cetpar — ceteris paribus goal-seek ─────────────────────────────
    if (trimmedLower.startsWith('/cetpar')) {
      const cetparMsg = trimmed.replace(/^\/cetpar\s*/i, '').trim();
      if (!cetparMsg) {
        const hint: ChatMessage = {
          role: 'assistant',
          content: 'Usage: /cetpar <goal>\n\nExample: /cetpar I want IRR to be 20%, adjusting exit multiple or Year 1 growth rate',
          timestamp: new Date().toISOString(),
        };
        set({ chatHistory: [...chatHistory, { role: 'user', content: trimmed, timestamp: new Date().toISOString() }, hint] });
        return;
      }
      const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
      set({ chatHistory: [...chatHistory, userMsg], isCalculating: true, error: null, cetparResult: null });
      try {
        const config = buildProviderConfig(aiProvider, apiKey);
        const result = await runCetpar(cetparMsg, modelState, config);
        if ('error' in result) {
          set({ error: result.error, isCalculating: false });
          return;
        }
        const feasibleCount = result.options.filter((o) => o.feasible).length;
        const summary = feasibleCount > 0
          ? `Found ${feasibleCount} feasible option${feasibleCount > 1 ? 's' : ''} to achieve ${result.targetOutputLabel} of ${OUTPUT_KEY_META_FORMAT(result.targetOutputKey, result.targetValue)}. Select one to create a pending edit.`
          : `No single parameter can reach ${result.targetOutputLabel} of ${OUTPUT_KEY_META_FORMAT(result.targetOutputKey, result.targetValue)} within realistic bounds. See details below.`;
        const aiMsg: ChatMessage = { role: 'assistant', content: summary, timestamp: new Date().toISOString() };
        set({ cetparResult: result, chatHistory: [...get().chatHistory, aiMsg], isCalculating: false });
      } catch (e: unknown) {
        set({ error: (e as Error).message, isCalculating: false });
      }
      return;
    }

    // ── /redline — assumptions quality review ───────────────────────────
    if (trimmedLower === '/redline') {
      const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
      set({ chatHistory: [...chatHistory, userMsg], isCalculating: true, error: null });
      try {
        const config = buildProviderConfig(aiProvider, apiKey);
        const result = await callRedlineAI(modelState, config);
        if ('error' in result) {
          set({ error: result.error, isCalculating: false });
          return;
        }
        const aggressiveCount = result.items.filter((i) => i.rating === 'aggressive').length;
        const summary = `Assumptions review complete. ${aggressiveCount} assumption${aggressiveCount !== 1 ? 's' : ''} flagged as aggressive.`;
        const aiMsg: ChatMessage = {
          role: 'assistant',
          content: summary,
          timestamp: new Date().toISOString(),
          redlineData: result,
        };
        set({ chatHistory: [...get().chatHistory, aiMsg], isCalculating: false });
      } catch (e: unknown) {
        set({ error: (e as Error).message, isCalculating: false });
      }
      return;
    }

    // ── /structure — capital structure optimizer ─────────────────────────
    if (trimmedLower.startsWith('/structure')) {
      const targetMatch = trimmed.match(/[\d.]+\s*%/);
      const targetIrr = targetMatch ? parseFloat(targetMatch[0]) : null;
      const structurePrompt = targetIrr != null
        ? `Optimise the capital structure to achieve an IRR of ${targetIrr}%. Suggest specific changes to debt tranches, leverage, rates, and amortisation.`
        : 'Optimise the capital structure to maximise IRR while keeping credit metrics viable. Suggest specific changes to debt tranches, leverage, rates, and amortisation.';

      const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
      set({ chatHistory: [...chatHistory, userMsg], isCalculating: true, error: null });
      try {
        const config = buildProviderConfig(aiProvider, apiKey);
        const result = await callAI(
          structurePrompt,
          modelState,
          chatHistory.map((m) => ({ role: m.role, content: m.content })),
          config,
          { editMode: true, customSystemPrompt: STRUCTURE_SYSTEM_PROMPT, forceToolUse: true },
        );
        if (result.error) {
          set({ error: result.error, isCalculating: false });
          return;
        }
        if (result.appliedDiffs.length > 0) {
          const pending: PendingEdit[] = result.appliedDiffs.map((d) => ({
            field: d.field, oldValue: d.old, newValue: d.new, reason: 'Capital structure optimisation',
          }));
          const aiMsg: ChatMessage = {
            role: 'assistant',
            content: result.analysis?.message || `Suggested ${pending.length} structural change(s). Type /accept to apply or /reject to discard.`,
            timestamp: new Date().toISOString(),
            assumption_updates: Object.fromEntries(result.appliedDiffs.map((d) => [d.field, d.new])),
            analysis: result.analysis || undefined,
          };
          set({ pendingEdits: pending, chatHistory: [...get().chatHistory, aiMsg], lastAnalysis: result.analysis, isCalculating: false });
        } else {
          const aiMsg: ChatMessage = {
            role: 'assistant',
            content: result.analysis?.message || 'No structural changes suggested.',
            timestamp: new Date().toISOString(),
            analysis: result.analysis || undefined,
          };
          set({ chatHistory: [...get().chatHistory, aiMsg], lastAnalysis: result.analysis, isCalculating: false });
        }
      } catch (e: unknown) {
        set({ error: (e as Error).message, isCalculating: false });
      }
      return;
    }

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
    const { modelState, pendingEdits, chatHistory, modelVersion } = get();
    if (!modelState || pendingEdits.length === 0) return;
    set({ isCalculating: true });
    try {
      const stateDict = JSON.parse(JSON.stringify(modelState)) as Record<string, unknown>;
      for (const edit of pendingEdits) {
        // Wrap each apply so a bad path (non-existent field) doesn't abort the whole set
        try {
          applyUpdate(stateDict, edit.field, edit.newValue);
        } catch {
          // skip invalid paths — they'll be absent from the recalc
        }
      }
      const state = stateDict as unknown as ModelState;
      const evEdit = pendingEdits.find(e => e.field === 'entry.enterprise_value');
      const multEdit = pendingEdits.find(e => e.field === 'entry.entry_ebitda_multiple');
      if (evEdit) state.entry.entry_valuation_driver = 'ev';
      else if (multEdit) state.entry.entry_valuation_driver = 'multiple';

      const result = fullRecalc(state);

      // ── Financial sanity check — reject before touching store state ──────
      // This is the atomic revert: modelState is the pre-edit snapshot and is
      // untouched until set() is called. If sanity fails we simply never call it.
      const sanity = checkLBOSanity(result);
      if (!sanity.valid) {
        const editSummary = pendingEdits
          .map(e => `${e.field}: ${e.oldValue} → ${e.newValue}`)
          .join('\n  ');
        const errorMsg: ChatMessage = {
          role: 'assistant',
          content: `**Changes rejected — financial sanity check failed.**\n\nAttempted changes:\n  ${editSummary}\n\nReason: ${sanity.reason}\n\nAll assumptions have been reverted to their prior state. No changes were applied to the model.`,
          timestamp: new Date().toISOString(),
        };
        set({ pendingEdits: [], chatHistory: [...chatHistory, errorMsg], isCalculating: false });
        return;
      }

      const changedFields = computeChangedTraceFields(modelState, result);
      const confirmMsg: ChatMessage = {
        role: 'assistant',
        content: `Applied ${pendingEdits.length} change(s) to the model.`,
        timestamp: new Date().toISOString(),
        assumption_updates: Object.fromEntries(pendingEdits.map(e => [e.field, e.newValue])),
      };
      set({
        modelState: result,
        modelVersion: modelVersion + 1,
        lastChangedTraceFields: changedFields,
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

  selectCetparOption: (option) => {
    const { modelState, chatHistory, cetparResult } = get();
    if (!modelState || !cetparResult) return;
    const label = cetparResult.targetOutputLabel;
    const meta = OUTPUT_KEY_META_FORMAT(cetparResult.targetOutputKey, option.achievedOutput);
    const edit: PendingEdit = {
      field: option.paramPath,
      oldValue: option.currentValue,
      newValue: option.requiredValue,
      reason: `${option.paramName} change to achieve ${label} of ${meta}`,
    };
    const msg: ChatMessage = {
      role: 'assistant',
      content: `Selected: set ${option.paramName} to ${formatParamValue(option.paramPath, option.requiredValue)}. Review the pending change below and accept to apply it.`,
      timestamp: new Date().toISOString(),
    };
    set({ pendingEdits: [edit], cetparResult: null, chatHistory: [...chatHistory, msg] });
  },

  dismissCetpar: () => {
    const { chatHistory } = get();
    const msg: ChatMessage = { role: 'assistant', content: 'Ceteris paribus analysis dismissed.', timestamp: new Date().toISOString() };
    set({ cetparResult: null, chatHistory: [...chatHistory, msg] });
  },

  // ── Phase 1: real-filing import + assumptions review ───────────────────────

  setStartScreen: (screen) => set({ startScreen: screen }),

  importFromEdgar: async (cik10, opts) => {
    set({ isCalculating: true, error: null });
    try {
      const facts = await getCompanyFacts(cik10);

      // Submissions are best-effort: they enrich sector + filing links but aren't required.
      let sicDescription: string | undefined;
      let sicCode: string | undefined;
      let ticker: string | undefined;
      let filings: { form: string; filingDate: string; documentUrl: string }[] = [];
      try {
        const subs = await getSubmissions(cik10);
        sicDescription = subs.sicDescription;
        sicCode = (subs as { sic?: string }).sic;
        ticker = subs.tickers?.[0];
        filings = extractRecentFilings(subs, ['10-K', '20-F', '40-F'])
          .slice(0, 3)
          .map((f) => ({ form: f.form, filingDate: f.filingDate, documentUrl: f.documentUrl }));
      } catch { /* submissions unavailable — proceed with companyfacts only */ }

      // D6: IFRS-reporting 20-F filers carry facts['ifrs-full'] and (previously) extracted
      // NOTHING — route them to the IFRS companyfacts mapper.
      const raw = isIfrsCompanyFacts(facts)
        ? mapCompanyFactsIfrs(facts, { sicDescription })
        : mapCompanyFacts(facts, { sicDescription, sicCode });

      // E1 production wiring: the SAME extraction feeds the engine2 store (the v2 flow at
      // ?v2=1). The D5 trading anchor resolves best-effort in the background — null (no
      // key / no ticker / implausible) simply never renders, and a late anchor re-imports
      // with identical facts, which only enriches the coherence input pre-build.
      void import('./engine2Model').then(({ useEngine2Model }) => {
        useEngine2Model.getState().importFromRaw(raw, { trading_anchor: null });
        void import('../lib/edgar/quote')
          .then(({ fetchTradingAnchor }) =>
            fetchTradingAnchor(ticker, facts, raw.net_debt?.value ?? null, raw.fy_ebitda?.value ?? null))
          .then((a) => {
            if (!a) return;
            const s = useEngine2Model.getState();
            // never clobber work: enrich only while this exact import sits untouched
            const untouched = s.facts?.entity_name === raw.entityName
              && s.output === null
              && !Object.values(s.basis).some((b) => b.kind === 'user');
            if (untouched) useEngine2Model.getState().importFromRaw(raw, { trading_anchor: a.ev_ebitda });
          })
          .catch(() => undefined);
      });
      const sector = opts?.sector ?? inferSector(sicDescription);
      const { state, provenance } = draftModelFromHistoricals(raw, {
        dealName: opts?.dealName ?? raw.entityName,
        sector,
        // currency comes from the detected filing unit (raw.currency); overridable on review.
      });
      const recalc = fullRecalc(state);
      set({
        rawHistoricals: raw,
        provenanceMap: provenance,
        sourceFilings: filings,
        modelState: recalc,
        startScreen: 'assumptions',
        isCalculating: false,
        chatHistory: [],
        scenarios: [],
        sensitivityTables: [],
        memoContent: null,
        aiPanelInsights: null,
      });
    } catch (e: unknown) {
      // eslint-disable-next-line no-console
      console.error('importFromEdgar failed:', e);
      const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
      set({
        error: /not found/i.test(msg)
          ? 'Not found on EDGAR — this looks like a private target or an unknown CIK. Try the company autocomplete, or upload a 10-K (coming soon).'
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
      // Link to the rendered report (or the iXBRL viewer) so the user can open the filing to fill
      // gaps (ESEF often leaves D&A / debt / working capital untagged).
      const docUrl = (f: typeof filings[number]) => `${base}${f.reportUrl ?? f.viewerUrl ?? f.jsonUrl}`;
      const filing = filings[0];
      const report = await getEsefReport(filing.jsonUrl);
      const raw = mapIfrsReport(report, { entityName: opts?.dealName ?? filing.entityName, reportUrl: docUrl(filing) });
      const sector = opts?.sector ?? 'Other';
      const { state, provenance } = draftModelFromHistoricals(raw, {
        dealName: opts?.dealName ?? filing.entityName ?? raw.entityName,
        sector,
      });
      const recalc = fullRecalc(state);
      set({
        rawHistoricals: raw,
        provenanceMap: provenance,
        sourceFilings: filings.slice(0, 3).map((f) => ({ form: `ESEF${f.country ? ' · ' + f.country : ''}`, filingDate: f.periodEnd, documentUrl: docUrl(f) })),
        modelState: recalc,
        startScreen: 'assumptions',
        isCalculating: false,
        chatHistory: [], scenarios: [], sensitivityTables: [], memoContent: null, aiPanelInsights: null,
      });
    } catch (e: unknown) {
      // eslint-disable-next-line no-console
      console.error('importFromEsef failed:', e);
      const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
      set({ error: `ESEF import failed: ${msg || 'unknown error'}`, isCalculating: false });
    }
  },

  loadFromHistoricals: (raw, opts) => {
    const sector = opts?.sector ?? inferSector(raw.sector?.provenance.detail);
    const { state, provenance } = draftModelFromHistoricals(raw, { dealName: opts?.dealName ?? raw.entityName, sector });
    const recalc = fullRecalc(state);
    set({ rawHistoricals: raw, provenanceMap: provenance, modelState: recalc, startScreen: 'assumptions', sourceFilings: [] });
  },

  editAssumption: (path, value) => {
    const { modelState, provenanceMap, modelVersion } = get();
    if (!modelState) return;
    const stateDict = JSON.parse(JSON.stringify(modelState)) as Record<string, unknown>;
    applyUpdate(stateDict, path, value);
    const state = stateDict as unknown as ModelState;
    // Editing the multiple or EV makes that field the single valuation driver (deriveEntryFields
    // derives the other, honouring the LTM/NTM basis).
    if (path === 'entry.entry_ebitda_multiple') state.entry.entry_valuation_driver = 'multiple';
    else if (path === 'entry.enterprise_value') state.entry.entry_valuation_driver = 'ev';
    const result = fullRecalc(state);
    const userProv: Provenance = { source: 'user', detail: 'Edited on the assumptions review' };
    set({
      modelState: result,
      provenanceMap: { ...provenanceMap, [path]: userProv },
      modelVersion: modelVersion + 1,
      memoContent: null,
      scenarios: [],
    });
  },

  aiSuggestAssumptions: async () => {
    const { modelState, apiKey, aiProvider, provenanceMap } = get();
    if (!modelState) return;
    if (!apiKey) { set({ error: 'Add an API key (Settings) to use AI-suggest — it reuses your saved provider.' }); return; }
    set({ isSuggesting: true, error: null });
    try {
      const config = buildProviderConfig(aiProvider, apiKey);
      const revM = modelState.revenue.base_revenue.toFixed(0);
      const marM = (modelState.margins.base_ebitda_margin * 100).toFixed(1);
      // Only state a factual figure to the AI if the filing actually provided it — never feed a
      // 'missing' placeholder (e.g. the 0.2 EBITDA-margin default) as an "extracted fact", which
      // would anchor the AI's assumptions on a fabricated number.
      const facts: string[] = [];
      if (!isMissing(provenanceMap, 'revenue.base_revenue')) facts.push(`LTM revenue ${revM}M ${modelState.currency}`);
      if (!isMissing(provenanceMap, 'margins.base_ebitda_margin')) facts.push(`EBITDA margin ${marM}%`);
      const factsLine = facts.length
        ? `Extracted facts (do NOT change these): ${facts.join(', ')}.`
        : `No factual figures are confirmed yet — base your assumptions on sector norms, not on any stated figure.`;
      const message = `Set realistic FORWARD LBO assumptions for ${modelState.deal_name} (${modelState.sector}).
${factsLine}
Update ONLY these forward assumptions, each as the noted unit, citing sector comps in your rationale:
- revenue.growth_rates: 5-year array of DECIMAL growth rates (0.08 = 8%). PE range 0.03–0.20; never > 0.50.
- margins.target_ebitda_margin: DECIMAL exit margin after the hold.
- margins.margin_trajectory: linear | front_loaded | back_loaded.
- entry.entry_ebitda_multiple: sector-appropriate entry EV/EBITDA.
- exit.exit_ebitda_multiple: realistic exit multiple vs entry.
- entry.leverage_ratio: entry net leverage (×EBITDA), market-clearing for this credit profile.
Set trigger_recalculation true.`;
      const result = await callAI(message, modelState, [], config);
      if (result.error) { set({ error: result.error, isSuggesting: false }); return; }
      if (result.updatedStateDict && result.appliedDiffs.length > 0) {
        const ms = result.updatedStateDict as unknown as ModelState;
        // Clamp AI values to sane PE bounds (same guardrails as the manual init path).
        ms.revenue.growth_rates = (ms.revenue.growth_rates || []).map((g) => Math.max(-0.30, Math.min(0.50, g)));
        ms.margins.target_ebitda_margin = Math.max(0.05, Math.min(0.60, ms.margins.target_ebitda_margin));
        ms.entry.entry_ebitda_multiple = Math.max(3, Math.min(30, ms.entry.entry_ebitda_multiple));
        ms.exit.exit_ebitda_multiple = Math.max(3, Math.min(30, ms.exit.exit_ebitda_multiple));
        ms.entry.leverage_ratio = Math.max(0, Math.min(8, ms.entry.leverage_ratio));
        ms.entry.entry_valuation_driver = 'multiple';
        // Mark every AI-touched field's provenance.
        const nextProv: ProvenanceMap = { ...provenanceMap };
        for (const d of result.appliedDiffs) {
          const root = d.field.split('.').slice(0, 2).join('.');
          nextProv[root] = { source: 'ai', detail: `AI-suggested (${aiProvider})` };
        }
        const recalc = fullRecalc(ms);
        set({ modelState: recalc, provenanceMap: nextProv, isSuggesting: false });
        return;
      }
      set({ isSuggesting: false, error: 'AI returned no assumption changes — try again.' });
    } catch (e: unknown) {
      set({ error: (e as Error).message, isSuggesting: false });
    }
  },

  buildModelFromDraft: () => {
    const { modelState, provenanceMap } = get();
    if (!modelState) return;
    // A factual field the filing lacked must be confirmed before it can feed the headline model —
    // never let a neutral placeholder become an accepted input the user acts on (the cardinal
    // 'missing' invariant). The review screen also disables Build while any field is still 'missing'.
    const missing = Object.entries(provenanceMap).filter(([, p]) => p.source === 'missing').map(([path]) => path);
    if (missing.length) {
      // D6: an unsupported reporting currency is its own blocking condition with its own
      // message (a generic "confirm MISSING fields" would point at nothing fillable).
      const ccy = provenanceMap['meta.currency_unsupported'];
      set({
        error: missing.includes('meta.currency_unsupported') && ccy
          ? ccy.detail
          : `Confirm the ${missing.length} field(s) marked MISSING before building.`,
      });
      return;
    }
    const built = fullRecalc(modelState);
    set({ modelState: built, startScreen: 'model', modelVersion: get().modelVersion + 1, error: null });
    if (get().apiKey) get().refreshPanelInsights();
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
      // Recompute from scratch and attach the engine's own scenarios + full
      // sensitivity grid, so the workbook is a faithful projection of the live
      // model: never a stale snapshot, and its sensitivity sheets read the exact
      // tables the on-screen heatmap renders (no separate approximation).
      const exportState = fullRecalc(JSON.parse(JSON.stringify(modelState)) as ModelState);
      exportState.scenarios = generateScenarios(exportState);
      exportState.sensitivity_tables = generateAllSensitivityTables(exportState);
      const { buildExcel } = await import('../lib/engine/excelExport');
      const blob = await buildExcel(exportState);
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

  legacySaveNotice: false,
  dismissLegacySaveNotice: () => set({ legacySaveNotice: false }),

  loadModel: async (file) => {
    set({ legacySaveNotice: true }); // every .json save today is a previous-engine save
    const text = await file.text();
    const raw = JSON.parse(text) as Partial<ModelState>;
    // Deep-merge with defaults so an input-only template JSON (no output fields)
    // doesn't crash fullRecalc. For full saved models, outputs are reset anyway
    // because fullRecalc recomputes them all from scratch.
    const defaults = createDefaultModelState();
    const data: ModelState = {
      ...defaults,
      ...raw,
      // Nested input objects — merge field-by-field so partial overrides work
      revenue: { ...defaults.revenue, ...(raw.revenue || {}) },
      margins: { ...defaults.margins, ...(raw.margins || {}) },
      tax: { ...defaults.tax, ...(raw.tax || {}) },
      entry: { ...defaults.entry, ...(raw.entry || {}) },
      fees: { ...defaults.fees, ...(raw.fees || {}) },
      mip: { ...defaults.mip, ...(raw.mip || {}) },
      exit: { ...defaults.exit, ...(raw.exit || {}) },
      credit_covenants: { ...defaults.credit_covenants, ...(raw.credit_covenants || {}) },
      // Arrays — use raw if present
      debt_tranches: raw.debt_tranches ?? defaults.debt_tranches,
      revenue_segments: raw.revenue_segments ?? defaults.revenue_segments,
      add_on_acquisitions: raw.add_on_acquisitions ?? defaults.add_on_acquisitions,
      // Preserve user-generated data from full saves; empty for input-only templates
      scenarios: raw.scenarios ?? [],
      sensitivity_tables: raw.sensitivity_tables ?? [],
      chat_history: raw.chat_history ?? [],
      ai_overrides: raw.ai_overrides ?? {},
      ai_toggle_fields: raw.ai_toggle_fields ?? [],
      // Output fields — always reset; fullRecalc recomputes all of these
      projections: defaults.projections,
      debt_schedule: defaults.debt_schedule,
      returns: defaults.returns,
      value_drivers: defaults.value_drivers,
      sources_and_uses: defaults.sources_and_uses,
      credit_analysis: defaults.credit_analysis,
      ebitda_bridge: defaults.ebitda_bridge,
      fragility: defaults.fragility,
      exit_reality_check: defaults.exit_reality_check,
    };
    set({ isCalculating: true });
    try {
      const result = fullRecalc(data);
      set({
        modelState: result,
        isCalculating: false,
        startScreen: 'model', // a loaded saved model goes straight to the model view
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
