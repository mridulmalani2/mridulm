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
import { suggestAssumptions, type SuggestionBasis } from '../lib/engine2/suggest';
import type { RawHistoricals } from '../lib/edgar/types';
import type { DealAssumptions, DealFacts } from '../lib/engine2/types';

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
  assumptions: DealAssumptions | null;
  /** fieldPath → basis badge (suggestion bases; 'user' after an edit). */
  basis: Record<string, FieldBasis>;
  output: Engine2ModelOutput | null;
  error: string | null;

  /** Screen 1 → 2: adapt extraction, then AUTO-suggest (one-click re-suggest = same call).
   *  opts.trading_anchor: the D5 EV/EBITDA anchor when the quote resolved (null = no key/
   *  ticker/implausible — the coherence gate suppresses on null). */
  importFromRaw: (raw: RawHistoricals, opts?: { hold_years?: number; trading_anchor?: number | null }) => void;
  /** Re-run the D7 suggestion pass over current facts (overwrites non-user bases only). */
  resuggest: () => void;
  /** Confirm a MISSING fact with a user-entered value (flips it out of the Build gate). */
  confirmFact: (path: string, value: number) => void;
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
  /** AI-suggest: Class-B refinements only, clamped to the suggestion rails, AI badges. */
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

  importFromRaw: (raw, opts) => {
    const adapted = adaptRawHistoricals(raw);
    const facts = { ...adapted.facts, implied_trading_ev_ebitda: opts?.trading_anchor ?? null };
    const { assumptions, basis } = suggestAssumptions(facts, opts);
    set({
      facts,
      sourceCurrency: raw.currency_unsupported ?? raw.currency,
      missingFacts: adapted.missing, factNotes: adapted.notes, assumptions, basis, output: null, error: null,
    });
  },

  resuggest: () => {
    const { facts, basis: prior } = get();
    if (!facts) return;
    const { assumptions, basis } = suggestAssumptions(facts);
    // user-owned fields keep their YOU badge AND their values are NOT overwritten:
    // suggestions never clobber an explicit decision (re-suggest is additive).
    const merged: Record<string, FieldBasis> = { ...basis };
    for (const [path, b] of Object.entries(prior)) if (b.kind === 'user') merged[path] = b;
    const current = get().assumptions;
    set({
      assumptions: current
        ? { ...assumptions, ...pickUserOwned(current, prior) }
        : assumptions,
      basis: merged,
      output: null,
    });
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
      nextFacts.fy_ebitda_margin = nextFacts.fy_revenue > 0 ? nextFacts.fy_ebitda / nextFacts.fy_revenue : 0;
    }
    set({
      facts: nextFacts,
      missingFacts: missingFacts.filter((p) => p !== path),
      basis: { ...get().basis, [`facts.${path}`]: { kind: 'user', detail: 'confirmed by you (the filing lacked it)' } },
      output: null,
      error: null,
    });
  },

  editAssumptions: (next, editedPaths) => {
    const marked = { ...get().basis };
    for (const p of editedPaths) marked[p] = { kind: 'user', detail: 'edited by you' };
    set({ assumptions: next, basis: marked, output: null });
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
    if (missingFacts.length) {
      get().build(); // reuse the gate + message path
      return;
    }
    try {
      const m = assumptions.entry.entry_multiple ?? assumptions.exit.multiple;
      const step = 0.5;
      const around = (center: number) => [center - 2 * step, center - step, center, center + step, center + 2 * step];
      const g = assumptions.operations.growth;
      const output = runModelWithScenarios(facts, assumptions, {
        scenarios: [
          // §13 committed downside + single-factor stress rows (entry frozen for all)
          { name: 'Downside (growth −200bps, exit −0.5x)', deltas: { operations: { growth: g.map((x) => x - 0.02) }, exit_multiple: assumptions.exit.multiple - 0.5 } },
          { name: 'Growth stress (−200bps)', deltas: { operations: { growth: g.map((x) => x - 0.02) } } },
          { name: 'Margin stress (−200bps target)', deltas: { operations: { target_margin: assumptions.operations.target_margin - 0.02 } } },
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
      set({
        assumptions: result.assumptions,
        basis: { ...get().basis, ...result.aiBasis },
        aiNotes: [
          ...result.applied.map((a) => `AI: ${a.path} → ${Array.isArray(a.value) ? 'per-year path' : a.value} — ${a.basis}`),
          ...result.dropped.map((d) => `dropped: ${d}`),
        ],
        output: null, // assumptions moved — outputs never survive an edit
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

  reset: () => set({ facts: null, sourceCurrency: null, missingFacts: [], factNotes: [], assumptions: null, basis: {}, output: null, error: null, aiBusy: false, redlineItems: null, aiNotes: [] }),
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

/** The assumption groups a YOU badge protects from re-suggest overwrite. */
function pickUserOwned(current: DealAssumptions, basis: Record<string, FieldBasis>): Partial<DealAssumptions> {
  const owned: Partial<DealAssumptions> = {};
  const has = (prefix: string) => Object.entries(basis).some(([p, b]) => b.kind === 'user' && p.startsWith(prefix));
  if (has('entry.')) owned.entry = current.entry;
  if (has('structure.')) owned.structure = current.structure;
  if (has('operations.')) owned.operations = current.operations;
  if (has('tax.')) owned.tax = current.tax;
  if (has('fees')) owned.fees = current.fees;
  if (has('exit.')) owned.exit = current.exit;
  if (has('mip')) owned.mip = current.mip;
  if (has('covenants')) owned.covenants = current.covenants;
  return owned;
}
