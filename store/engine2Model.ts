/**
 * store/engine2Model.ts — the NEW model lifecycle (PHASE_E §E1):
 *   importFacts (adapter) → suggest (D7, auto) → editAssumptions (badged) → build
 *   (= ONE runModel call) → ModelOutput in state.
 *
 * The old ModelState never enters this store; the old store keeps driving the legacy
 * screens until the Phase F cutover. Rules carried over: a missing REQUIRED fact gates
 * Build (the 'missing' invariant); every assumption carries a basis badge — editing a
 * field flips its basis to YOU ('user'); outputs are derived-only (never editable) and
 * are REPLACED atomically by each build (no stale mixed outputs).
 */

import { useSyncExternalStore } from 'react';
import { createStore } from 'zustand/vanilla';
import { adaptRawHistoricals } from '../lib/engine2/factsAdapter';
import { runModel, type Engine2ModelOutput } from '../lib/engine2/facade';
import { runModelWithScenarios } from '../lib/engine2/scenarios';
import { holdSuggestion, suggestionsFor, type SuggestionBasis, type SuggestionCatalogue } from '../lib/engine2/suggest';

/** Before the draft exists the one thing that can be proposed is the holding period itself. */
const holdOnly = (): SuggestionCatalogue => { const h = holdSuggestion(); return h ? { 'entry.hold_years': h } : {}; };
import { blankAssumptions, CHOICE_PATHS, missingInputs, resizeHold, setPath, type MissingInput } from '../lib/engine2/draft';
import type { RawHistoricals } from '../lib/edgar/types';
import type { DealAssumptions, DealFacts, NormalisationFacts } from '../lib/engine2/types';

export type FieldBasis = SuggestionBasis | { kind: 'user'; detail: string } | { kind: 'ai'; detail: string };

export interface Engine2ModelStore {
  facts: DealFacts | null;
  /** The FILING's currency code as extracted (e.g. 'SEK') — when it is outside the modelled
   *  set, facts.currency holds a display placeholder and Build is gated; display surfaces
   *  (history table) use THIS code so an unsupported filing never wears another symbol. */
  sourceCurrency: string | null;
  /** DealFacts paths extraction could not provide — Build is gated until confirmed. */
  missingFacts: string[];
  /** Honest-degradation notes from extraction (days gating, FPI history, currency). */
  factNotes: string[];
  /** The DRAFT deal (v2.0.0 "blank until entered"): unset numbers are NaN and unset choices
   *  are listed in `pending`; `missingInputs` is the Build gate (lib/engine2/draft.ts). */
  assumptions: DealAssumptions | null;
  /** Modelling choices not yet made (entry/exit basis, toggles, methods, the debt stack). */
  pending: string[];
  /** One-click proposals with their basis — NEVER applied unless the analyst accepts one. */
  suggestions: SuggestionCatalogue;
  /** fieldPath → basis badge ('user' after an edit; the suggestion's basis after an accept). */
  basis: Record<string, FieldBasis>;
  output: Engine2ModelOutput | null;
  error: string | null;

  /** Screen 1 → 2: adapt extraction, then AUTO-suggest (one-click re-suggest = same call).
   *  opts.trading_anchor: the D5 EV/EBITDA anchor when the quote resolved (null = no key/
   *  ticker/implausible — the coherence gate suppresses on null). */
  /** Screen 1 → 2. With no `hold_years` the draft does not exist yet: the holding period is
   *  the FIRST input (it sizes every per-year array — no default N). */
  importFromRaw: (raw: RawHistoricals, opts?: { hold_years?: number; trading_anchor?: number | null }) => void;
  /** The Clean step changed the figures (store/cleaning): swap the FACTS for the cleaned ones and
   *  refresh the proposals. Unlike a re-import this keeps everything the analyst entered — the
   *  assumptions, the open choices, the badges and any fact confirmed by hand. The output is
   *  cleared (outputs never render stale). `trading_anchor: undefined` keeps the current one. */
  applyCleaned: (raw: RawHistoricals, opts: { normalisation: NormalisationFacts | null; trading_anchor?: number | null }) => void;
  /** The D5 trading anchor resolved in the background: update the fact in place (never a
   *  re-import — nothing the analyst entered is touched). */
  setTradingAnchor: (entityName: string, anchor: number | null) => void;
  /** Start a forecast-only case (no historical year — §24.2): facts carry the name and
   *  currency only; every line is entered directly. */
  startForecastOnly: (p: { entity_name: string; currency: DealFacts['currency']; hold_years: number }) => void;
  /** Recompute the suggestion catalogue (never touches the assumptions). */
  resuggest: () => void;
  /** Apply ONE proposal from the catalogue: the value lands with the proposal's basis badge. */
  acceptSuggestion: (path: string) => void;
  /** Change the holding period: kept years keep values, new years are unset. */
  setHoldYears: (n: number) => void;
  /** The inputs still blank — Build is disabled while this is non-empty. */
  missing: () => MissingInput[];
  /** Apply a whole-object edit AND register choices it brings into scope (e.g. a new tranche's
   *  sweep election) — each stays pending, gating Build, until the analyst makes it. */
  editWithChoices: (next: DealAssumptions, editedPaths: string[], newChoices: string[], clearedPrefixes?: string[]) => void;
  /** Confirm a MISSING fact with a user-entered value (flips it out of the Build gate). */
  confirmFact: (path: string, value: number) => void;
  /** True while the CURRENT import for `entityName` sits untouched — no build, no user
   *  edit, no AI-applied refinement. The background trading-anchor enrich re-imports only
   *  in this state; any work (user OR ai badge) blocks the clobber (review 2026-07-24). */
  importUntouched: (entityName: string) => boolean;
  /** Replace the assumptions object (typed, whole-object per §13 array semantics) and mark
   *  the edited field paths as YOU. */
  editAssumptions: (next: DealAssumptions, editedPaths: string[]) => void;
  /** ONE runModel call; atomic output replace. Gated on missingFacts. */
  build: () => void;
  /** Build WITH exhibits (§13): preset single-factor stress scenarios + the committed
   *  downside, and a 5×5 entry×exit sensitivity centered on base. Same gate as build. */
  buildWithExhibits: () => void;

  // ── E4 AI (key/provider shared with the old store's localStorage) ──
  aiBusy: boolean;
  redlineItems: import('../lib/ai2/redline').RedlineItem[] | null;
  aiNotes: string[];
  /** AI-suggest: Class-B PROPOSALS only (catalogue keys '<path>@ai'); out-of-rail values dropped, never clamped; nothing applied. */
  aiSuggest: () => Promise<void>;
  /** Redline: hostile challenges over assumptions + bases + coherence; edits nothing. */
  runRedlineAction: () => Promise<void>;
  reset: () => void;
}


export const engine2Store = createStore<Engine2ModelStore>()((set, get) => ({
  facts: null,
  sourceCurrency: null,
  missingFacts: [],
  factNotes: [],
  assumptions: null,
  basis: {},
  output: null,
  error: null,

  pending: [],
  suggestions: {},

  importFromRaw: (raw, opts) => {
    const adapted = adaptRawHistoricals(raw);
    const facts = { ...adapted.facts, implied_trading_ev_ebitda: opts?.trading_anchor ?? null };
    const N = opts?.hold_years ?? null;
    set({
      facts,
      sourceCurrency: raw.currency_unsupported ?? raw.currency,
      missingFacts: adapted.missing, factNotes: adapted.notes,
      // v2.0.0: NOTHING pre-filled — a blank draft plus a catalogue of proposals.
      assumptions: N === null ? null : blankAssumptions(`${facts.entity_name} LBO`, N),
      pending: [...CHOICE_PATHS],
      suggestions: N === null ? holdOnly() : suggestionsFor(facts, N),
      basis: {},
      output: null, error: null,
      // AI notes/redlines describe assumptions that no longer exist after ANY re-import
      aiNotes: [], redlineItems: null,
    });
  },

  applyCleaned: (raw, opts) => {
    const prev = get();
    if (!prev.facts) return;
    const adapted = adaptRawHistoricals(raw);
    const facts: DealFacts = {
      ...adapted.facts,
      implied_trading_ev_ebitda: opts.trading_anchor === undefined ? prev.facts.implied_trading_ev_ebitda : opts.trading_anchor,
      normalisation: opts.normalisation,
    };
    // a fact the analyst confirmed by hand (the source lacked it) stays confirmed
    let missing = adapted.missing;
    const bag = facts as unknown as Record<string, unknown>;
    let pairConfirmed = false;
    for (const [key, b] of Object.entries(prev.basis)) {
      if (!key.startsWith('facts.') || b.kind !== 'user') continue;
      const path = key.slice('facts.'.length);
      if (!missing.includes(path)) continue;
      bag[path] = (prev.facts as unknown as Record<string, unknown>)[path];
      missing = missing.filter((m) => m !== path);
      if (path === 'fy_revenue' || path === 'fy_ebitda') pairConfirmed = true;
    }
    // only a hand-confirmed sizing figure needs the margin re-formed; otherwise the adapter's
    // margin stands (it carries the §27 forecast base)
    if (pairConfirmed) facts.fy_ebitda_margin = facts.fy_revenue !== null && facts.fy_ebitda !== null && facts.fy_revenue > 0 ? facts.fy_ebitda / facts.fy_revenue : null;
    const a = prev.assumptions;
    set({
      facts, missingFacts: missing, factNotes: adapted.notes,
      suggestions: a ? suggestionsFor(facts, a.entry.hold_years, a, prev.pending) : holdOnly(),
      output: null, error: null,
    });
  },

  startForecastOnly: ({ entity_name, currency, hold_years }) => {
    const facts: DealFacts = {
      entity_name, source: 'manual', sector: 'Other', currency,
      fiscal_year: null, period_end: null,
      fy_revenue: null, fy_ebitda: null, fy_ebitda_margin: null,
      da_pct_revenue: null, maint_capex_pct_revenue: null, net_ppe: null,
      operating_nwc: null, nwc_pct_revenue: null, dso: null, dio: null, dpo: null,
      gross_debt: null, cash: null, net_debt: null, effective_tax_rate: null,
      nol_carryforward_floor: null, implied_cost_of_debt: null, implied_trading_ev_ebitda: null,
      sic_code: null, sector_comps: null, history: [],
    };
    set({
      facts, sourceCurrency: currency, missingFacts: [], factNotes: [],
      assumptions: blankAssumptions(`${entity_name} LBO`, hold_years),
      pending: [...CHOICE_PATHS], suggestions: {}, basis: {},
      output: null, error: null, aiNotes: [], redlineItems: null,
    });
  },

  resuggest: () => {
    const { facts, assumptions } = get();
    if (!facts || !assumptions) return;
    set({ suggestions: suggestionsFor(facts, assumptions.entry.hold_years, assumptions, get().pending) });
  },

  acceptSuggestion: (key) => {
    const { assumptions, suggestions, basis, pending } = get();
    const sug = suggestions[key];
    if (sug && !assumptions && key === 'entry.hold_years' && typeof sug.value === 'number') { get().setHoldYears(sug.value); return; }
    if (!assumptions || !sug) return;
    // catalogue keys may carry a variant (`entry.entry_multiple@ai`) — the target is the path
    const path = key.split('@')[0];
    // the holding period resizes every per-year line: it goes through its own action
    if (path === 'entry.hold_years') { if (typeof sug.value === 'number') get().setHoldYears(sug.value); return; }
    let next = setPath(assumptions, path, sug.value);
    if (path === 'entry.entry_multiple') next = { ...next, entry: { ...next.entry, driver: 'multiple', enterprise_value: null } };
    set({
      assumptions: next,
      basis: { ...basis, [path]: sug.basis },
      pending: pending.filter((p) => p !== path && !p.startsWith(`${path}.`)),
      output: null,
    });
  },

  setTradingAnchor: (entityName, anchor) => {
    const { facts, assumptions } = get();
    if (!facts || facts.entity_name !== entityName) return;
    const next = { ...facts, implied_trading_ev_ebitda: anchor };
    set({ facts: next, suggestions: assumptions ? suggestionsFor(next, assumptions.entry.hold_years, assumptions, get().pending) : get().suggestions });
  },

  setHoldYears: (n) => {
    const { assumptions, facts } = get();
    if (!facts) return;
    if (!Number.isInteger(n) || n < 1) { set({ error: 'Holding period must be a whole number of years ≥ 1.' }); return; }
    const next = assumptions ? resizeHold(assumptions, n) : blankAssumptions(`${facts.entity_name} LBO`, n);
    set({ assumptions: next, suggestions: suggestionsFor(facts, n, next, get().pending), output: null, error: null });
  },

  missing: () => {
    const { facts, assumptions, pending } = get();
    if (!facts || !assumptions) return [];
    return missingInputs(facts, assumptions, pending);
  },

  importUntouched: (entityName) => {
    const s = get();
    return s.facts?.entity_name === entityName
      && s.output === null
      && !Object.values(s.basis).some((b) => b.kind === 'user' || b.kind === 'ai');
  },

  confirmFact: (path, value) => {
    const { facts, missingFacts } = get();
    if (!facts || !missingFacts.includes(path)) return;
    if (!Number.isFinite(value)) {
      set({ error: `${path}: enter a number to confirm` });
      return;
    }
    const nextFacts = { ...facts } as DealFacts & Record<string, unknown>;
    if (path in nextFacts) (nextFacts as Record<string, unknown>)[path] = value;
    // derived margin stays consistent when revenue/EBITDA are confirmed
    if (path === 'fy_revenue' || path === 'fy_ebitda') {
      // null, never a 0 sentinel, when either side is absent or revenue is non-positive (§15)
      const rev = nextFacts.fy_revenue;
      const ebitda = nextFacts.fy_ebitda;
      nextFacts.fy_ebitda_margin = rev !== null && ebitda !== null && rev > 0 ? ebitda / rev : null;
    }
    set({
      facts: nextFacts,
      missingFacts: missingFacts.filter((p) => p !== path),
      basis: { ...get().basis, [`facts.${path}`]: { kind: 'user', detail: 'confirmed by you (the filing lacked it)' } },
      output: null,
      error: null,
    });
  },

  editWithChoices: (next, editedPaths, newChoices, clearedPrefixes = []) => {
    const keep = get().pending.filter((p) => !clearedPrefixes.some((c) => p === c || p.startsWith(`${c}.`)));
    set({ pending: [...new Set([...keep, ...newChoices])] });
    get().editAssumptions(next, editedPaths);
    // editAssumptions removed edited paths from pending; re-add the brand-new choices
    set({ pending: [...new Set([...get().pending, ...newChoices.filter((c) => !editedPaths.includes(c))])] });
  },

  editAssumptions: (next, editedPaths) => {
    const marked = { ...get().basis };
    for (const p of editedPaths) marked[p] = { kind: 'user', detail: 'entered by you' };
    // an edit IS the choice: the path (and anything under it) leaves `pending`
    const pending = get().pending.filter((p) => !editedPaths.some((e) => p === e || p.startsWith(`${e}.`)));
    const { facts } = get();
    set({
      assumptions: next, basis: marked, pending, output: null,
      // proposals that follow other inputs (exit = entry) track what was entered
      suggestions: facts ? suggestionsFor(facts, next.entry.hold_years, next, pending) : get().suggestions,
    });
  },

  build: () => {
    const { facts, assumptions, missingFacts } = get();
    if (!facts || !assumptions) return;
    if (missingFacts.length) {
      set({
        error: missingFacts.includes('currency_unsupported')
          ? get().factNotes.find((n) => n.includes('currency')) ?? 'Reporting currency not supported.'
          : `Confirm the ${missingFacts.length} field(s) marked MISSING before building.`,
      });
      return;
    }
    const blank = get().missing();
    if (blank.length) {
      set({ error: `${blank.length} input(s) still blank: ${blank.slice(0, 6).map((m) => m.label).join('; ')}${blank.length > 6 ? '; …' : ''}`, output: null });
      return;
    }
    try {
      const output = runModel(facts, assumptions); // the ONE call — §16 single path
      set({ output, error: null });
    } catch (e: unknown) {
      set({ error: (e as Error).message, output: null });
    }
  },

  buildWithExhibits: () => {
    const { facts, assumptions, missingFacts } = get();
    if (!facts || !assumptions) return;
    if (missingFacts.length || get().missing().length) {
      get().build(); // reuse the gate + message path
      return;
    }
    try {
      // Center the entry axis on the DERIVED entry multiple of the base run — under an EV
      // driver `entry_multiple` is null, and centering on the exit multiple (the old
      // fallback) labelled the base cell with a multiple the deal was never priced at.
      const m = runModel(facts, assumptions).derived.entry_multiple;
      const step = 0.5;
      const around = (center: number) => [center - 2 * step, center - step, center, center + step, center + 2 * step];
      const g = assumptions.operations.growth;
      const lines = assumptions.operations.lines;
      // §24.3 R8: a stress on a driver the deal does not use would silently move nothing —
      // only offer the rows whose driver is live.
      const growthLive = !lines?.revenue;
      const marginLive = !lines?.ebitda;
      const output = runModelWithScenarios(facts, assumptions, {
        scenarios: [
          // §13 committed downside + single-factor stress rows (entry frozen for all)
          ...(growthLive ? [{ name: 'Downside (growth −200bps, exit −0.5x)', deltas: { operations: { growth: g.map((x) => x - 0.02) }, exit_multiple: assumptions.exit.multiple - 0.5 } }] : []),
          ...(growthLive ? [{ name: 'Growth stress (−200bps)', deltas: { operations: { growth: g.map((x) => x - 0.02) } } }] : []),
          ...(marginLive ? [{ name: 'Margin stress (−200bps target)', deltas: { operations: { target_margin: assumptions.operations.target_margin - 0.02 } } }] : []),
          { name: 'Exit stress (−1.0x)', deltas: { exit_multiple: assumptions.exit.multiple - 1.0 } },
        ],
        sensitivity: [{
          row_axis: 'entry_multiple', col_axis: 'exit_multiple',
          row_values: around(m), col_values: around(assumptions.exit.multiple),
          base_row_index: 2, base_col_index: 2,
        }],
      });
      set({ output, error: null });
    } catch (e: unknown) {
      set({ error: (e as Error).message, output: null });
    }
  },

  aiBusy: false,
  redlineItems: null,
  aiNotes: [],

  aiSuggest: async () => {
    const { facts, assumptions, missingFacts } = get();
    if (!facts || !assumptions) return;
    set({ aiBusy: true, error: null, aiNotes: [] });
    try {
      const { aiRefineAssumptions } = await import('../lib/ai2/suggest');
      const { makeAiText, savedAiConfig } = await import('../lib/ai2/textCall');
      const cfg = savedAiConfig();
      if (!cfg) { set({ error: 'Add an API key (Settings in the classic flow) to use AI-suggest.', aiBusy: false }); return; }
      const result = await aiRefineAssumptions(facts, assumptions, missingFacts, makeAiText(cfg.provider, cfg.apiKey));
      // v2.0.0: AI values are PROPOSALS (catalogue keys `<path>@ai`), never applied.
      const proposals: SuggestionCatalogue = {};
      for (const a of result.applied) proposals[`${a.path}@ai`] = { value: a.value, basis: { kind: 'ai', detail: a.basis } };
      set({
        suggestions: { ...get().suggestions, ...proposals },
        aiNotes: [
          ...result.applied.map((a) => `AI: ${a.path} → ${Array.isArray(a.value) ? 'per-year path' : a.value}, ${a.basis}`),
          ...result.dropped.map((d) => `dropped: ${d}`),
        ],
        aiBusy: false,
      });
    } catch (e: unknown) {
      set({ error: (e as Error).message, aiBusy: false });
    }
  },

  runRedlineAction: async () => {
    const { assumptions, basis, output } = get();
    if (!assumptions) return;
    set({ aiBusy: true, error: null });
    try {
      const { runRedline } = await import('../lib/ai2/redline');
      const { makeAiText, savedAiConfig } = await import('../lib/ai2/textCall');
      const cfg = savedAiConfig();
      if (!cfg) { set({ error: 'Add an API key (Settings in the classic flow) to use Redline.', aiBusy: false }); return; }
      const items = await runRedline(assumptions, basis, output?.coherence ?? [], makeAiText(cfg.provider, cfg.apiKey));
      set({ redlineItems: items, aiBusy: false });
    } catch (e: unknown) {
      set({ error: (e as Error).message, aiBusy: false });
    }
  },

  reset: () => set({ facts: null, sourceCurrency: null, missingFacts: [], factNotes: [], assumptions: null, pending: [], suggestions: {}, basis: {}, output: null, error: null, aiBusy: false, redlineItems: null, aiNotes: [] }),
}));

/**
 * Selector hook over the vanilla store. The SERVER snapshot reads CURRENT state (not
 * zustand v5's initial-state default): this app is a pure SPA — renderToStaticMarkup
 * appears only in the SSR smoke tests, where the store is populated before render and
 * hydration mismatches cannot exist.
 */
export function useEngine2Model<T>(selector: (s: Engine2ModelStore) => T): T {
  return useSyncExternalStore(
    engine2Store.subscribe,
    () => selector(engine2Store.getState()),
    () => selector(engine2Store.getState()),
  );
}
useEngine2Model.getState = engine2Store.getState;
useEngine2Model.setState = engine2Store.setState;
useEngine2Model.subscribe = engine2Store.subscribe;
