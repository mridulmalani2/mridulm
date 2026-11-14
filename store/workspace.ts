/**
 * store/workspace.ts — what an analyst builds AROUND a deal: basis notes on inputs, named cases,
 * the history of builds, and the library of deals kept in this browser.
 *
 * Nothing here is model arithmetic. A case and a version are saved INPUTS; whenever one is shown
 * its figures are recomputed by the one engine on the current facts, so a saved number can never
 * disagree with what the current code would compute. localStorage only; nothing is sent anywhere.
 */
import { useSyncExternalStore } from 'react';
import { createStore } from 'zustand/vanilla';
import { cleaningStore } from './cleaning';
import { engine2Store, type FieldBasis } from './engine2Model';
import { restoreSession, serialiseSession, type DealType } from './session';
import { suggestionsFor } from '../lib/engine2/suggest';
import type { DealAssumptions } from '../lib/engine2/types';

const WORK_KEY = 'deal-engine-workspace-v1';
const LIB_KEY = 'deal-engine-library-v1';
const NAN = '__blank__';
const MAX_VERSIONS = 25;

/** A saved set of inputs. Blank inputs stay blank: a case may be incomplete. */
export interface InputSet {
  assumptions: DealAssumptions;
  pending: string[];
  basis: Record<string, FieldBasis>;
}
export interface SavedCase extends InputSet { id: string; name: string; savedAt: string }
export interface SavedVersion extends InputSet { id: string; builtAt: string }
/** `dealType` absent ⇔ 'lbo' (entries saved before the merger model existed). */
export interface LibraryEntry { id: string; name: string; savedAt: string; session: string; workspace: string; dealType?: DealType }

interface DealWork { notes: Record<string, string>; cases: SavedCase[]; versions: SavedVersion[] }
const emptyWork = (): DealWork => ({ notes: {}, cases: [], versions: [] });

export interface WorkspaceStore extends DealWork {
  library: LibraryEntry[];
  /** The library entry the open deal was loaded from or last saved to (null = never saved). */
  libraryId: string | null;

  setNote: (path: string, text: string) => void;
  saveCase: (name: string) => void;
  loadCase: (id: string) => void;
  renameCase: (id: string, name: string) => void;
  deleteCase: (id: string) => void;
  /** Record the inputs of a successful build. A build identical to the last one is not repeated. */
  recordVersion: () => void;
  restoreVersion: (id: string) => void;
  clearVersions: () => void;

  saveToLibrary: (name?: string) => void;
  openFromLibrary: (id: string) => boolean;
  duplicateInLibrary: (id: string) => void;
  deleteFromLibrary: (id: string) => void;
  /** The open deal as one file: the session plus the notes, cases and versions. */
  exportDealFile: () => string | null;
  importDealFile: (text: string) => boolean;
  /** A new deal starts with a clean workspace. */
  resetDeal: () => void;
}

const storage = (): Storage | null => {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
};
const encode = (v: unknown): string => JSON.stringify(v, (_k, x) => (typeof x === 'number' && Number.isNaN(x) ? NAN : x));
const decode = <T,>(text: string | null): T | null => {
  if (!text) return null;
  try { return JSON.parse(text, (_k, x) => (x === NAN ? Number.NaN : x)) as T; } catch { return null; }
};
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toISOString();

const currentInputs = (): InputSet | null => {
  const m = engine2Store.getState();
  return m.assumptions ? { assumptions: m.assumptions, pending: m.pending, basis: m.basis } : null;
};
const applyInputs = (s: InputSet) => {
  const facts = engine2Store.getState().facts;
  if (!facts) return;
  engine2Store.setState({
    assumptions: s.assumptions, pending: s.pending, basis: s.basis, output: null, error: null,
    suggestions: suggestionsFor(facts, s.assumptions.entry.hold_years, s.assumptions, s.pending),
  });
};
const workOf = (s: DealWork): DealWork => ({ notes: s.notes, cases: s.cases, versions: s.versions });
const dealName = (): string => engine2Store.getState().assumptions?.deal_name ?? engine2Store.getState().facts?.entity_name ?? 'Untitled deal';

export const workspaceStore = createStore<WorkspaceStore>()((set, get) => ({
  ...emptyWork(),
  library: [],
  libraryId: null,

  setNote: (path, text) => {
    const notes = { ...get().notes };
    if (text.trim() === '') delete notes[path]; else notes[path] = text.trim();
    set({ notes });
  },

  saveCase: (name) => {
    const cur = currentInputs();
    if (!cur) return;
    const label = name.trim() || `Case ${get().cases.length + 1}`;
    const existing = get().cases.find((c) => c.name.toLowerCase() === label.toLowerCase());
    const entry: SavedCase = { ...cur, id: existing?.id ?? uid(), name: label, savedAt: now() };
    set({ cases: existing ? get().cases.map((c) => (c.id === existing.id ? entry : c)) : [...get().cases, entry] });
  },
  loadCase: (id) => { const c = get().cases.find((x) => x.id === id); if (c) applyInputs(c); },
  renameCase: (id, name) => set({ cases: get().cases.map((c) => (c.id === id && name.trim() ? { ...c, name: name.trim() } : c)) }),
  deleteCase: (id) => set({ cases: get().cases.filter((c) => c.id !== id) }),

  recordVersion: () => {
    const cur = currentInputs();
    if (!cur) return;
    const last = get().versions[get().versions.length - 1];
    if (last && encode(last.assumptions) === encode(cur.assumptions)) return;
    set({ versions: [...get().versions, { ...cur, id: uid(), builtAt: now() }].slice(-MAX_VERSIONS) });
  },
  restoreVersion: (id) => { const v = get().versions.find((x) => x.id === id); if (v) applyInputs(v); },
  clearVersions: () => set({ versions: [] }),

  saveToLibrary: (name) => {
    const session = serialiseSession();
    if (session === null) return;
    const id = get().libraryId ?? uid();
    const entry: LibraryEntry = { id, name: (name ?? '').trim() || dealName(), savedAt: now(), session, workspace: encode(workOf(get())), dealType: 'lbo' };
    const rest = get().library.filter((e) => e.id !== id);
    set({ library: [entry, ...rest], libraryId: id });
  },
  openFromLibrary: (id) => {
    const e = get().library.find((x) => x.id === id);
    if (!e) return false;
    // the deal on screen is kept before it is replaced: opening another never loses work
    if (get().libraryId !== id) get().saveToLibrary();
    engine2Store.getState().reset();
    cleaningStore.getState().reset();
    if (!restoreSession(e.session)) return false;
    set({ ...(decode<DealWork>(e.workspace) ?? emptyWork()), libraryId: id });
    return true;
  },
  duplicateInLibrary: (id) => {
    const e = get().library.find((x) => x.id === id);
    if (e) set({ library: [{ ...e, id: uid(), name: `${e.name} (copy)`, savedAt: now() }, ...get().library] });
  },
  deleteFromLibrary: (id) => set({ library: get().library.filter((e) => e.id !== id), libraryId: get().libraryId === id ? null : get().libraryId }),

  exportDealFile: () => {
    const session = serialiseSession();
    if (session === null) return null;
    return JSON.stringify({ kind: 'deal-engine-deal', v: 1, dealType: 'lbo', name: dealName(), savedAt: now(), session, workspace: encode(workOf(get())) }, null, 1);
  },
  importDealFile: (text) => {
    let file: { kind?: string; v?: number; session?: string; workspace?: string };
    try { file = JSON.parse(text); } catch { return false; }
    if (file?.kind !== 'deal-engine-deal' || file.v !== 1 || typeof file.session !== 'string') return false;
    get().saveToLibrary(); // keep the deal on screen before the file replaces it
    engine2Store.getState().reset();
    cleaningStore.getState().reset();
    if (!restoreSession(file.session)) return false;
    set({ ...(decode<DealWork>(file.workspace ?? null) ?? emptyWork()), libraryId: null });
    return true;
  },

  resetDeal: () => set({ ...emptyWork(), libraryId: null }),
}));

let started = false;
/** Restore the workspace and the library once, then save on every change. Safe on every mount. */
export function startWorkspacePersistence(): void {
  const ls = storage();
  if (!ls || started) return;
  started = true;
  const work = decode<DealWork & { libraryId?: string | null }>(ls.getItem(WORK_KEY));
  const library = decode<LibraryEntry[]>(ls.getItem(LIB_KEY));
  workspaceStore.setState({
    ...(work ? { notes: work.notes ?? {}, cases: work.cases ?? [], versions: work.versions ?? [], libraryId: work.libraryId ?? null } : {}),
    ...(Array.isArray(library) ? { library } : {}),
  });
  workspaceStore.subscribe((s) => {
    try {
      ls.setItem(WORK_KEY, encode({ ...workOf(s), libraryId: s.libraryId }));
      ls.setItem(LIB_KEY, encode(s.library));
    } catch { /* storage full or blocked: the workspace simply is not kept */ }
  });
}

export function useWorkspace<T>(selector: (s: WorkspaceStore) => T): T {
  return useSyncExternalStore(workspaceStore.subscribe, () => selector(workspaceStore.getState()), () => selector(workspaceStore.getState()));
}
