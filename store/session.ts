/**
 * store/session.ts — keep the deal in THIS browser across a reload
 * (rebuild/CLEANING_AND_SUITE_PLAN.md §6.1).
 *
 * Saved: the figures as sourced (or, for a case entered directly, its name and currency), the cleaning ledger, the assumptions the analyst entered, their
 * badges and open choices, and any fact confirmed by hand. NOT saved: anything derived — the
 * cleaned figures, the proposals and the model output are rebuilt from the saved inputs, so a
 * restored deal can never show a number the current code would not compute. A deal that had been
 * built is built again on restore (only the fact that it was built is saved, never its figures),
 * so a reload on Results stays on Results.
 *
 * localStorage only. Nothing is sent anywhere.
 */
import { cleaningStore } from './cleaning';
import { engine2Store, type FieldBasis } from './engine2Model';
import { suggestionsFor, type SuggestionCatalogue } from '../lib/engine2/suggest';
import type { DealAssumptions, DealFacts } from '../lib/engine2/types';

const KEY = 'deal-engine-session-v1';
/** Blank inputs are NaN in the draft; JSON has no NaN, so it travels as this marker. */
const NAN = '__blank__';

/** Which kind of deal a save holds. The merger flow (rebuild/MA_MODEL_PLAN.md) keeps its own
 *  stores; a save restores only into the flow it came from. */
export type DealType = 'lbo' | 'merger';

interface Saved {
  v: 1;
  /** Absent in saves made before the merger model existed: those are all 'lbo'. */
  dealType?: DealType;
  /** null ⇔ a forecast-only case (SPEC §24.2): no sourced figures, so nothing to clean. */
  cleaning: Parameters<ReturnType<typeof cleaningStore.getState>['hydrate']>[0] | null;
  /** The facts of a forecast-only case (name and currency; every figure null). Absent otherwise:
   *  sourced facts are never saved, they are rebuilt from `cleaning`. */
  forecastFacts?: DealFacts;
  assumptions: DealAssumptions | null;
  pending: string[];
  basis: Record<string, FieldBasis>;
  confirmed: Record<string, number>;
  /** The AI's proposals, the inputs it was asked about and the suggestions the analyst cleared:
   *  kept so a reload neither loses them nor asks (and pays) for them again. */
  ai?: { proposals: SuggestionCatalogue; asked: string[]; dismissed: string[] };
  /** The model had been built when this was saved: it is run again on restore, never read back. */
  built?: boolean;
}

const storage = (): Storage | null => {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
};

export function serialiseSession(): string | null {
  const c = cleaningStore.getState();
  const m = engine2Store.getState();
  if (!m.facts) return null;
  const sourced = c.raw !== null && c.pack !== null;
  // A case entered directly has no sourced figures; it is still the analyst's work and is kept.
  const forecastOnly = !sourced && m.facts.source === 'manual' && m.facts.history.length === 0 && m.facts.fy_ebitda === null;
  if (!sourced && !forecastOnly) return null;
  const confirmed: Record<string, number> = {};
  for (const [key, b] of Object.entries(m.basis)) {
    if (!key.startsWith('facts.') || b.kind !== 'user') continue;
    const v = (m.facts as unknown as Record<string, unknown>)[key.slice(6)];
    if (typeof v === 'number') confirmed[key.slice(6)] = v;
  }
  const saved: Saved = {
    v: 1,
    dealType: 'lbo',
    cleaning: sourced ? { raw: c.raw!, pack: c.pack!, ledger: c.ledger, market: c.market, done: c.done, dismissed: c.dismissed } : null,
    ...(forecastOnly ? { forecastFacts: m.facts } : {}),
    assumptions: m.assumptions, pending: m.pending, basis: m.basis, confirmed,
    ai: { proposals: m.aiProposals, asked: m.aiAsked, dismissed: m.dismissed },
    ...(m.output !== null ? { built: true } : {}),
  };
  return JSON.stringify(saved, (_k, v) => (typeof v === 'number' && Number.isNaN(v) ? NAN : v));
}

/** Run the model again for a deal that had been built. If the inputs no longer build on the current
 *  code, the deal opens on Assumptions with nothing said: the message appears when Build is pressed. */
function rebuild(saved: Saved): void {
  if (!saved.built) return;
  engine2Store.getState().buildWithExhibits(); // the same build the Build button runs
  if (engine2Store.getState().output === null) engine2Store.setState({ error: null });
}

/** Put back the AI's proposals and the cleared suggestions, then merge them into the catalogue. */
function restoreAi(saved: Saved): void {
  if (!saved.ai) return;
  engine2Store.setState({ aiProposals: saved.ai.proposals ?? {}, aiAsked: saved.ai.asked ?? [], dismissed: saved.ai.dismissed ?? [] });
  engine2Store.getState().resuggest();
}

/** Rebuild both stores from a saved session. Returns false (and changes nothing) if it is not one. */
export function restoreSession(text: string | null): boolean {
  if (!text) return false;
  let saved: Saved;
  try {
    saved = JSON.parse(text, (_k, v) => (v === NAN ? Number.NaN : v)) as Saved;
  } catch { return false; }
  if (saved?.v !== 1) return false;
  if ((saved.dealType ?? 'lbo') !== 'lbo') return false; // a merger save restores through the merger store
  if (saved.cleaning === null || saved.cleaning === undefined) {
    const f = saved.forecastFacts;
    if (!f || !saved.assumptions || f.source !== 'manual' || !Array.isArray(f.history) || f.history.length !== 0) return false;
    engine2Store.setState({
      facts: f, sourceCurrency: f.currency, missingFacts: [], factNotes: [],
      assumptions: saved.assumptions, pending: saved.pending ?? [], basis: saved.basis ?? {},
      suggestions: suggestionsFor(f, saved.assumptions.entry.hold_years, saved.assumptions, saved.pending ?? []),
      output: null, error: null, // never restored: rebuilt below, on the current code
    });
    restoreAi(saved);
    rebuild(saved);
    return true;
  }
  if (!saved.cleaning.raw || !saved.cleaning.pack || saved.cleaning.ledger?.version !== 1) return false;
  cleaningStore.getState().hydrate(saved.cleaning); // sourced figures + ledger → cleaned facts
  for (const [path, value] of Object.entries(saved.confirmed ?? {})) engine2Store.getState().confirmFact(path, value);
  const facts = engine2Store.getState().facts;
  if (facts && saved.assumptions) {
    engine2Store.setState({
      assumptions: saved.assumptions, pending: saved.pending ?? [],
      basis: { ...engine2Store.getState().basis, ...saved.basis },
      suggestions: suggestionsFor(facts, saved.assumptions.entry.hold_years, saved.assumptions, saved.pending ?? []),
      output: null, // never restored: rebuilt below, on the current code
    });
    restoreAi(saved);
    rebuild(saved);
  }
  return true;
}

/** The deal type of a saved session, without restoring it (null = not a session). */
export function sessionDealType(text: string | null): DealType | null {
  if (!text) return null;
  try {
    const saved = JSON.parse(text) as Partial<Saved>;
    if (saved?.v !== 1) return null;
    return saved.dealType ?? 'lbo';
  } catch { return null; }
}

let started = false;
/** Restore once, then save on every change. Safe to call on every mount. */
export function startSessionPersistence(): void {
  const ls = storage();
  if (!ls || started) return;
  started = true;
  if (!cleaningStore.getState().raw) restoreSession(ls.getItem(KEY));
  const save = () => {
    try {
      const text = serialiseSession();
      if (text === null) ls.removeItem(KEY);
      else ls.setItem(KEY, text);
    } catch { /* storage full or blocked: the deal simply is not kept */ }
  };
  cleaningStore.subscribe(save);
  engine2Store.subscribe(save);
}
