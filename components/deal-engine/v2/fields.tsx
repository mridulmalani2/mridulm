/**
 * v2 input primitives (v2.0.0 "blank until entered").
 *
 * Every field reads the DRAFT (store/engine2Model): an unset number is NaN and renders BLANK
 * with a red underline; an unset choice is listed in `pending` and renders as still open. Nothing
 * is ever filled in for the analyst.
 *
 * Where the catalogue holds a proposal for a blank input (a filing figure, a cited convention, or
 * the AI's proposal where neither exists) it is shown INSIDE the cell, in grey with a star. It is
 * not a value: the build still waits for it. The keys are Excel's:
 *   Enter            shows why; Enter again accepts and moves to the next input
 *   F2               accepts into the cell for editing (Control + U on a Mac as well)
 *   Delete / Space   clears the suggestion
 *   typing           replaces it with the analyst's own number
 *   arrows / Tab     move on without accepting
 * Clicking the input's label opens the same explanation.
 *
 * The sheet behaves like a spreadsheet: Enter moves on, the arrow keys move between cells, a row
 * copied from Excel pastes across a by-year grid, and Ctrl+Enter fills a value to the right.
 * Choices and switches are cells too, so the whole sheet is worked from the keyboard.
 *
 * Percent fields cross the display boundary EXACTLY once (fromPctInput / toPctInput).
 */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cellSuggestion, useEngine2Model, type FieldBasis } from '../../../store/engine2Model';
import { useWorkspace } from '../../../store/workspace';
import { dealUiStore, useDealUi } from '../../../store/dealUi';
import { fromPctInput, num, toPctInput } from '../../../lib/format';
import { setPath } from '../../../lib/engine2/draft';
import type { DealAssumptions } from '../../../lib/engine2/types';
import { Dropdown, Segmented, Switch, cx, type Option } from '../ui/kit';
import { EDIT_KEY, chord, isEditKey } from '../ui/platform';
import { SECTIONS, sectionOf } from './sections';

export type Unit = 'pct' | 'money' | 'mult' | 'years' | 'days' | 'beta' | 'ratio';
const SUFFIX: Record<Unit, string> = { pct: '%', money: 'm', mult: 'x', years: 'yrs', days: 'd', beta: 'β', ratio: '' };

export const isSet = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

export function show(v: number | null | undefined, unit: Unit): string {
  if (!isSet(v)) return '';
  if (unit === 'pct') return toPctInput(v);
  if (unit === 'years') return String(v);
  if (unit === 'ratio') return String(v); // a rank (sweep priority): 1, not 1.000
  if (unit === 'beta') return num(v, 3);
  return num(v, 2);
}

/**
 * Parse a typed value; '' ⇒ NaN (the analyst cleared the field: it is unset again); text that is
 * not ONE number ⇒ null (refused). White space inside the text is never removed: "125 3" is two
 * numbers pasted together, not 1253.
 */
export function parse(text: string, unit: Unit): number | null {
  const t = text.trim().replace(/−/g, '-'); // a figure copied from the page carries the typographic minus
  if (t === '') return Number.NaN;
  if (/\s/.test(t)) return null;
  if (unit === 'pct') return fromPctInput(t);
  const v = Number(t.replace(/,/g, '').replace(/[xm%]$/i, ''));
  return Number.isFinite(v) ? v : null;
}

/** Split pasted text into cells (tabs across, new lines down). */
export const pastedCells = (text: string): string[] => text.replace(/\r/g, '').split(/[\t\n]/).map((c) => c.trim()).filter((c, i, all) => c !== '' || i < all.length - 1);

/** Edit ONE path of the draft (the path's basis becomes YOU). */
export function useSetField() {
  const a = useEngine2Model((s) => s.assumptions);
  const edit = useEngine2Model((s) => s.editAssumptions);
  return (path: string, value: unknown, alsoEdited: string[] = []) => {
    if (!a) return;
    edit(setPath<DealAssumptions>(a, path, value), [path, ...alsoEdited]);
  };
}

// ── keyboard movement between cells ─────────────────────────────────────────────────────────

/** Every cell of the sheet in reading order: number inputs, choices and switches. */
const cells = (): HTMLElement[] => (typeof document === 'undefined' ? [] : Array.from(document.querySelectorAll<HTMLElement>('[data-de-cell]')).filter((el) => el.offsetParent !== null));
const rowOf = (el: Element): Element | null => el.closest('[data-de-line]');
/** The cell an element belongs to (any option of a side-by-side choice stands for the choice). */
const homeOf = (el: HTMLElement): HTMLElement => (el.hasAttribute('data-de-cell') ? el : el.closest('[role="radiogroup"]')?.querySelector<HTMLElement>('[data-de-cell]') ?? el);

/** Put the keyboard in a cell and keep it comfortably in view, so the sheet never needs scrolling by hand. */
export function focusCell(target: HTMLElement): void {
  target.focus();
  if (target instanceof HTMLInputElement) target.select();
  const r = target.getBoundingClientRect();
  if (r.top < 150 || r.bottom > window.innerHeight - 120) {
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
  }
}

/** Move focus from `from`: the next / previous cell in reading order, or the same column a line up / down. */
export function moveFocus(from: HTMLElement, dir: 'next' | 'prev' | 'up' | 'down'): void {
  const el = homeOf(from);
  const all = cells();
  const i = all.indexOf(el);
  if (i < 0) return;
  let target: HTMLElement | undefined;
  if (dir === 'next') target = all[i + 1];
  else if (dir === 'prev') target = all[i - 1];
  else {
    const line = rowOf(el);
    const inLine = all.filter((c) => rowOf(c) === line);
    const col = inLine.indexOf(el);
    const edge = dir === 'down' ? all.indexOf(inLine[inLine.length - 1]) + 1 : all.indexOf(inLine[0]) - 1;
    const neighbour = all[edge];
    if (neighbour) {
      const theirs = all.filter((c) => rowOf(c) === rowOf(neighbour));
      target = theirs[col < theirs.length ? col : theirs.length - 1] ?? neighbour;
    }
  }
  if (target) focusCell(target);
}

/** The first cell still waiting for an answer. */
export const firstOpenCell = (): HTMLElement | undefined => cells().find((el) => el.closest('[data-blank],[data-suggested]') !== null);

/**
 * Move on after an accept or a choice. The sheet may have redrawn (a choice brings its own inputs
 * in), so the move happens once it has; if the cell itself is gone, go to the first one still open.
 */
export function advance(from: HTMLElement): void {
  const before = cells();
  const prev = before[before.indexOf(homeOf(from)) - 1];
  const isOpen = (el: HTMLElement) => el.closest('[data-blank],[data-suggested]') !== null;
  requestAnimationFrame(() => {
    if (from.isConnected) { moveFocus(from, 'next'); return; }
    // the cell was replaced by what it brought in (the debt structure by its facilities): carry on
    // from where it stood, at the first input still open
    const now = cells();
    const start = prev && prev.isConnected ? now.indexOf(prev) + 1 : 0;
    const next = now.slice(start).find(isOpen) ?? now[start] ?? firstOpenCell();
    if (next) focusCell(next);
  });
}

/** Ctrl/Cmd + Shift + Enter: accept every suggestion still open in the section the cell is in. */
export function acceptSectionOf(el: HTMLElement): void {
  const id = el.closest<HTMLElement>('[data-section]')?.dataset.section;
  if (!id) return;
  const n = useEngine2Model.getState().acceptAll((p) => sectionOf(p) === id);
  const title = SECTIONS.find((x) => x.id === id)?.title ?? 'this section';
  dealUiStore.getState().notify(n ? `${n} suggestion${n === 1 ? '' : 's'} accepted in ${title}. ${chord('Z')} undoes it.` : `No open suggestions in ${title}.`);
}

// ── the label side of a line ────────────────────────────────────────────────────────────────

/** An explanation kept off the sheet until it is asked for. */
export const Hint: React.FC<{ text: string }> = ({ text }) => (
  <span className="relative inline-flex group/hint">
    <button type="button" tabIndex={-1} aria-label={text}
      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-semibold text-[color:var(--de-ink-3)] border border-[color:var(--de-rule-strong)] hover:text-[color:var(--de-ink)] hover:border-[color:var(--de-ink-2)]">?</button>
    <span role="tooltip" className="de-pop pointer-events-none absolute left-0 top-full z-30 mt-1.5 w-64 max-w-[70vw] px-3 py-2 rounded-[var(--de-r-sm)] bg-[var(--de-ink)] text-white text-[12px] font-normal leading-snug hidden group-hover/hint:block group-focus-within/hint:block">{text}</span>
  </span>
);

/** Open (or close) the explanation of an input's suggestion, and put the keyboard in its cell. */
function toggleWhy(e: React.MouseEvent<HTMLElement>, id: string): void {
  const ui = dealUiStore.getState();
  const open = ui.why === id;
  const cell = e.currentTarget.closest('[data-de-line]')?.querySelector<HTMLElement>(`[data-why="${id.replace(/"/g, '')}"] [data-de-cell]`)
    ?? e.currentTarget.closest('[data-de-line]')?.querySelector<HTMLElement>('[data-de-cell]');
  if (cell && document.activeElement !== cell) cell.focus();
  ui.setWhy(open ? null : id);
}

/** The words beside an input. Where the input has a suggestion, clicking them explains it. */
export const Label: React.FC<{ children: React.ReactNode; hint?: string; whyId?: string | null }> = ({ children, hint, whyId }) => (
  <span className="inline-flex items-center gap-1.5 min-w-0">
    {whyId
      ? <button type="button" tabIndex={-1} data-why-toggle title="How the suggested value was reached" onMouseDown={(e) => e.preventDefault()} onClick={(e) => toggleWhy(e, whyId)}
          className="text-left text-[14px] text-[color:var(--de-ink)] leading-snug rounded-sm underline decoration-dotted decoration-[color:var(--de-rule-strong)] underline-offset-4 hover:decoration-[color:var(--de-ink-2)]">{children}</button>
      : <span className="text-[14px] text-[color:var(--de-ink)] leading-snug">{children}</span>}
    {hint && <Hint text={hint} />}
  </span>
);

/** The analyst's own note on an input ("CIM p.14"). Shown on the line once written. */
const NoteControl: React.FC<{ path: string; label: string }> = ({ path, label }) => {
  const note = useWorkspace((s) => s.notes[path]);
  const setNote = useWorkspace((s) => s.setNote);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  if (editing) {
    return (
      <input autoFocus aria-label={`Note on ${label}`} value={draft} placeholder="Where this number comes from"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setNote(path, draft); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }}
        className="de-control h-7 px-2 text-[12px] w-56 max-w-full" />
    );
  }
  return (
    <button type="button" tabIndex={-1} onClick={() => { setDraft(note ?? ''); setEditing(true); }}
      title={note ? 'Edit note' : 'Add a note on where this number comes from'}
      className={cx('inline-flex items-center gap-1 text-[12px] rounded px-1 max-w-[16rem] truncate',
        note ? 'text-[color:var(--de-ink-3)] hover:text-[color:var(--de-ink)]' : 'text-[color:var(--de-ink-3)] opacity-0 group-hover/line:opacity-100 focus:opacity-100 hover:text-[color:var(--de-ink)]')}>
      <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0"><path d="M2 2.5h8v5.5H6.5L4 10V8H2z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
      <span className="truncate">{note ?? 'note'}</span>
    </button>
  );
};

/** One line of the input sheet: the label (with its hint and note) and the control. */
export const Line: React.FC<{ path?: string; label: React.ReactNode; hint?: string; children: React.ReactNode; noteLabel?: string; sub?: React.ReactNode; whyId?: string | null }> = ({ path, label, hint, children, noteLabel, sub, whyId }) => (
  <div className="de-row group/line" data-path={path} data-de-line>
    <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <Label hint={hint} whyId={whyId}>{label}</Label>
      {path && <NoteControl path={path} label={noteLabel ?? (typeof label === 'string' ? label : path)} />}
      {sub && <span className="basis-full text-[12px] text-[color:var(--de-ink-3)]">{sub}</span>}
    </div>
    <div className="flex items-center justify-end gap-2 flex-wrap min-w-0">{children}</div>
  </div>
);

// ── suggestions ─────────────────────────────────────────────────────────────────────────────

const KIND_WORD: Record<string, string> = { history: 'Worked out from the filing history', convention: 'A cited market convention or statute', facts: 'Read from the source', template: 'A cited template', ai: 'Proposed by AI' };
const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => <span className="de-kbd">{children}</span>;

/**
 * How a suggested value was reached: the basis, the value, the working and the source, anchored
 * to its cell. Drawn `fixed`, and it follows the cell, so a scrolling table or the edge of the
 * window never cuts it off. `taken` says what became of the suggestion once the input is filled.
 */
export const WhyPop: React.FC<{
  anchor: HTMLElement | null;
  text: string;
  kind: string;
  detail: string;
  taken?: 'accepted' | 'own' | null;
  onAccept?: () => void;
  onClear?: () => void;
  onClose: () => void;
}> = ({ anchor, text, kind, detail, taken, onAccept, onClear, onClose }) => {
  const [, redraw] = useState(0);
  const pop = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const move = () => redraw((n) => n + 1);
    const away = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (pop.current?.contains(t) || anchor?.contains(t) || t.closest?.('[data-why-toggle]')) return;
      onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('scroll', move, true);
    window.addEventListener('resize', move);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { window.removeEventListener('scroll', move, true); window.removeEventListener('resize', move); document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [anchor, onClose]);
  if (!anchor || typeof window === 'undefined') return null;
  const r = anchor.getBoundingClientRect();
  const up = window.innerHeight - r.bottom < 300 && r.top > 300;
  const at: React.CSSProperties = {
    ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    ...(r.right >= 344 ? { right: window.innerWidth - r.right < 8 ? 8 : window.innerWidth - r.right } : { left: 8 }),
  };
  const [how, source] = detail.split(/\s*Source:\s*/);
  const act = 'inline-flex items-center gap-1.5 h-7 px-2 rounded-[var(--de-r-sm)] text-[12px] text-[color:var(--de-ink-2)] hover:bg-[var(--de-sunken)] hover:text-[color:var(--de-ink)]';
  // drawn at the root of the deal engine, not inside the page: the page slides in on a transform,
  // and a transformed ancestor would turn "fixed to the window" into "fixed to the page"
  const host = anchor.closest('.de-root') ?? document.body;
  return createPortal(
    <span ref={pop} role="dialog" aria-label="How this value was reached" style={at} onMouseDown={(e) => e.preventDefault()}
      className="de-pop fixed z-50 w-80 max-w-[calc(100vw-16px)] p-4 rounded-[var(--de-r)] bg-[var(--de-surface)] border border-[color:var(--de-rule)] shadow-[var(--de-shadow-pop)] text-left whitespace-normal font-sans font-normal">
      <span className="flex items-center gap-1.5 text-[12px] text-[color:var(--de-ink-3)]"><span aria-hidden="true" className="de-star !mr-0">★</span>{KIND_WORD[kind] ?? kind}</span>
      <span className="de-num block text-[22px] font-semibold leading-tight mt-1 text-[color:var(--de-ink)]">{text}</span>
      <span className="block text-[13px] leading-relaxed text-[color:var(--de-ink-2)] mt-2">{how}</span>
      {source && <span className="block text-[12px] leading-relaxed text-[color:var(--de-ink-3)] mt-2">{kind === 'ai' ? 'From' : 'Source:'} {source}</span>}
      {taken
        ? <span className="block text-[12px] text-[color:var(--de-ink-3)] mt-3 pt-3 border-t border-[color:var(--de-rule)]">{taken === 'accepted' ? 'You accepted this value. It is yours to change.' : 'You entered your own value for this input.'}</span>
        : (
          <span className="flex flex-wrap items-center gap-x-1 gap-y-1 mt-3 pt-2 border-t border-[color:var(--de-rule)] -mx-1">
            {onAccept && <button type="button" tabIndex={-1} onClick={onAccept} className={act}><Kbd>Enter</Kbd> accept</button>}
            <span className={cx(act, 'pointer-events-none')}><Kbd>{EDIT_KEY}</Kbd> edit</span>
            {onClear && <button type="button" tabIndex={-1} onClick={onClear} className={act}><Kbd>Space</Kbd> clear</button>}
          </span>
        )}
    </span>,
    host,
  );
};

/** What became of a suggestion once its input holds a value. */
const takenAs = (set: boolean, basis: FieldBasis | undefined): 'accepted' | 'own' | null => (!set ? null : basis && basis.kind !== 'user' ? 'accepted' : 'own');

/**
 * The keyboard for a cell that is not a number box: a choice, a switch, or a proposal that fills
 * several inputs at once. Enter moves on (and accepts a suggestion on its second press), Space
 * or the edit key changes the choice, the arrows move between cells. `stamp` is the choice as it
 * stands: when a key press changes it, the sheet moves on by itself.
 */
export const ChoiceCell: React.FC<{
  children: React.ReactNode;
  popId?: string | null;
  /** The suggestion on offer, when the choice is still open. */
  offer?: { key: string; text: string; kind: string; detail: string } | null;
  /** The same suggestion once the choice is made, kept so the label can still explain it. */
  taken?: { text: string; kind: string; detail: string; as: 'accepted' | 'own' } | null;
  stamp?: string;
  className?: string;
}> = ({ children, popId, offer, taken, stamp, className }) => {
  const wrap = useRef<HTMLSpanElement>(null);
  const keyAt = useRef(0);
  const swallow = useRef(false);
  const first = useRef(true);
  const whyOpen = useDealUi((s) => !!popId && s.why === popId);
  const close = React.useCallback(() => dealUiStore.getState().setWhy(null), []);
  const home = () => wrap.current?.querySelector<HTMLElement>('[data-de-cell]') ?? null;
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const el = home();
    if (el && Date.now() - keyAt.current < 800) advance(el);
  }, [stamp]);
  const take = () => {
    if (!offer) return;
    const el = home();
    close();
    useEngine2Model.getState().acceptSuggestion(offer.key);
    if (el) advance(el);
  };
  const clear = () => { if (offer) { close(); useEngine2Model.getState().dismissSuggestion(offer.key); } };
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (!t.matches('[role="radio"],[role="combobox"],[role="switch"],[data-de-cell]')) return;
    if (t.getAttribute('role') === 'combobox' && t.getAttribute('aria-expanded') === 'true') { keyAt.current = Date.now(); return; }
    const mod = e.ctrlKey || e.metaKey;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'Enter') {
      stop();
      if (mod && e.shiftKey) acceptSectionOf(t);
      else if (e.shiftKey) moveFocus(t, 'prev');
      else if (offer && !mod) { if (!whyOpen && popId) dealUiStore.getState().setWhy(popId); else take(); }
      else moveFocus(t, 'next');
    } else if (isEditKey(e)) {
      stop();
      if (t.getAttribute('role') === 'combobox') { keyAt.current = Date.now(); t.click(); }
    } else if (offer && (e.key === ' ' || e.key === 'Delete' || e.key === 'Backspace')) {
      stop(); swallow.current = e.key === ' '; clear();
    } else if (e.key === ' ') {
      // Space changes the choice: done here, not left to the browser, so it behaves the same everywhere
      stop(); swallow.current = true; keyAt.current = Date.now(); t.click();
    }
    else if (e.key === 'ArrowDown' && !e.altKey) { stop(); moveFocus(t, 'down'); }
    else if (e.key === 'ArrowUp') { stop(); moveFocus(t, 'up'); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      stop();
      const options = t.getAttribute('role') === 'radio' ? Array.from(t.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []) : [];
      const to = options[options.indexOf(t) + (e.key === 'ArrowRight' ? 1 : -1)];
      if (to) to.focus(); else moveFocus(t, e.key === 'ArrowRight' ? 'next' : 'prev');
    } else if (e.key === 'ArrowDown') { keyAt.current = Date.now(); }
  };
  const shown = offer ?? taken ?? null;
  return (
    <span ref={wrap} data-why={popId ?? undefined} className={cx('inline-flex max-w-full', className)} onKeyDownCapture={onKey}
      onKeyUpCapture={(e) => { if (swallow.current && e.key === ' ') { e.preventDefault(); swallow.current = false; } }}
      onBlur={(e) => { if (whyOpen && !e.currentTarget.contains(e.relatedTarget as Node)) close(); }}>
      {children}
      {whyOpen && shown && (
        <WhyPop anchor={wrap.current} text={shown.text} kind={shown.kind} detail={shown.detail} taken={offer ? null : taken?.as}
          onAccept={offer ? take : undefined} onClear={offer ? clear : undefined} onClose={close} />
      )}
    </span>
  );
};

/** A proposal that fills several inputs at once (the cited debt structure): one grey, starred cell. */
export const GroupSuggestion: React.FC<{ path: string; text: string }> = ({ path, text }) => {
  const sug = useEngine2Model((s) => s.suggestions[path]);
  const on = useDealUi((s) => s.features.suggestAssumptions);
  if (!sug || !on) return null;
  return (
    <ChoiceCell popId={path} offer={{ key: path, text, kind: sug.basis.kind, detail: sug.basis.detail }}>
      <button type="button" data-de-cell data-suggested="true" onClick={() => dealUiStore.getState().setWhy(dealUiStore.getState().why === path ? null : path)}
        className="de-control inline-flex items-center px-3 text-[13px] text-[color:var(--de-ink-3)]"><span aria-hidden="true" className="de-star">★</span>{text}</button>
    </ChoiceCell>
  );
};

// ── numbers ─────────────────────────────────────────────────────────────────────────────────

/** A numeric cell that commits on blur / Enter. Blank ⇔ unset. With `sugPath` it shows the
 *  catalogue's proposal for that input, in grey, until the analyst accepts, edits or clears it. */
export const NumBox: React.FC<{
  value: number | null | undefined;
  unit: Unit;
  onCommit: (v: number) => void;
  width?: string;
  ariaLabel: string;
  /** A row was pasted into this cell: the cells from here rightwards. */
  onPasteCells?: (values: number[]) => void;
  /** Ctrl+Enter: copy this cell's value to every cell to its right. */
  onFillRight?: (v: number) => void;
  /** The draft path whose proposal this cell shows (and, for a by-year line, which year). */
  sugPath?: string;
  sugIndex?: number;
  compact?: boolean;
}> = ({ value, unit, onCommit, width = 'w-28', ariaLabel, onPasteCells, onFillRight, sugPath, sugIndex, compact }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const caretToEnd = useRef(false);
  const suggestions = useEngine2Model((s) => s.suggestions);
  const dismissed = useEngine2Model((s) => s.dismissed);
  const popId = sugPath === undefined ? null : sugIndex === undefined ? sugPath : `${sugPath}.${sugIndex}`;
  const basis = useEngine2Model((s) => (popId ? s.basis[popId] ?? (sugPath ? s.basis[sugPath] : undefined) : undefined));
  const offered = useDealUi((s) => s.features.suggestAssumptions);
  const whyOpen = useDealUi((s) => popId !== null && s.why === popId);
  const sug = offered && sugPath ? cellSuggestion(suggestions, dismissed, sugPath, sugIndex) : null;
  const ghost = sug !== null && !isSet(value) && (draft === null || draft === '');
  const shown = show(value, unit);
  const sugText = sug ? `${show(sug.value, unit)}${SUFFIX[unit]}` : '';
  const close = React.useCallback(() => dealUiStore.getState().setWhy(null), []);
  useEffect(() => {
    if (!caretToEnd.current || !input.current) return;
    caretToEnd.current = false;
    const n = input.current.value.length;
    input.current.setSelectionRange(n, n);
  }, [draft]);
  const commit = (): number | null => {
    if (draft === null || draft === shown) { setDraft(null); return isSet(value) ? value : null; }
    const v = parse(draft, unit);
    if (v === null) { setBad(true); return null; }
    setBad(false);
    setDraft(null);
    onCommit(v);
    return v;
  };
  const take = () => {
    if (!sug) return;
    close();
    setDraft(null);
    useEngine2Model.getState().acceptSuggestion(sug.key, sug.index);
    if (input.current) advance(input.current);
  };
  const clear = () => {
    if (!sug) return;
    close();
    useEngine2Model.getState().dismissSuggestion(sug.index !== undefined ? `${sug.key}#${sug.index}` : sug.key);
  };
  return (
    <span ref={wrap} data-why={popId ?? undefined} className={cx('de-control inline-flex items-center', width, compact && '!h-8')}
      data-blank={(!isSet(value) && !ghost) || undefined} data-suggested={ghost || undefined} data-invalid={bad || undefined}>
      {ghost && <span aria-hidden="true" className="de-star pl-2 !mr-0 select-none">★</span>}
      <input
        ref={input}
        data-de-cell
        data-editing={(draft !== null && draft !== shown) || undefined}
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-description={ghost ? `Suggested: ${sugText}. Enter shows why, Enter again accepts, ${EDIT_KEY} edits, Space clears.` : undefined}
        aria-invalid={bad || undefined}
        placeholder={ghost ? show(sug.value, unit) : undefined}
        value={draft ?? shown}
        onChange={(e) => { setDraft(e.target.value); setBad(false); if (whyOpen) close(); }}
        onFocus={(e) => e.target.select()}
        onBlur={() => { commit(); if (whyOpen) close(); }}
        onPaste={(e) => {
          const parts = pastedCells(e.clipboardData.getData('text'));
          if (parts.length <= 1) return; // a single value pastes as text and is parsed on commit
          e.preventDefault();
          const values = parts.map((p) => parse(p, unit));
          if (values.some((v) => v === null)) { setBad(true); return; }
          setBad(false);
          setDraft(null);
          if (onPasteCells) onPasteCells(values as number[]);
          else onCommit(values[0] as number); // not a grid: the first cell only, never the cells run together
        }}
        onKeyDown={(e) => {
          const el = e.currentTarget;
          const mod = e.ctrlKey || e.metaKey;
          if (e.key === 'Enter' && mod && e.shiftKey) { e.preventDefault(); commit(); acceptSectionOf(el); return; }
          if (ghost) {
            // a suggestion sits in the cell: Excel's keys decide what becomes of it
            if (e.key === 'Enter' && !mod && !e.shiftKey) {
              e.preventDefault();
              if (!whyOpen && popId) dealUiStore.getState().setWhy(popId); else take();
              return;
            }
            if (isEditKey(e)) { e.preventDefault(); close(); caretToEnd.current = true; setDraft(show(sug.value, unit)); return; }
            if (e.key === ' ' || e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clear(); return; }
          } else if (isEditKey(e)) {
            // edit in the cell: the caret goes to the end, as in Excel
            e.preventDefault();
            el.setSelectionRange(el.value.length, el.value.length);
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            const v = commit();
            if (mod && onFillRight && v !== null && Number.isFinite(v)) { onFillRight(v); return; }
            // the commit may redraw the sheet, so the move waits for it
            if (e.shiftKey) moveFocus(el, 'prev'); else advance(el);
          } else if (e.key === 'Escape') { setDraft(null); setBad(false); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(el, 'down'); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(el, 'up'); }
          else if (e.key === 'ArrowRight' && el.selectionStart === el.value.length && el.selectionEnd === el.value.length) { e.preventDefault(); moveFocus(el, 'next'); }
          else if (e.key === 'ArrowLeft' && el.selectionStart === 0 && el.selectionEnd === 0) { e.preventDefault(); moveFocus(el, 'prev'); }
        }}
        className={cx('de-num min-w-0 w-full h-full bg-transparent outline-none text-right text-[14px] text-[color:var(--de-input)] pr-1', ghost ? 'pl-1' : 'pl-2')}
      />
      {SUFFIX[unit] && <span className="pr-2 text-[12px] text-[color:var(--de-ink-3)] select-none">{SUFFIX[unit]}</span>}
      {whyOpen && sug && (
        <WhyPop anchor={wrap.current} text={sugText} kind={sug.basis.kind} detail={sug.basis.detail} taken={takenAs(isSet(value), basis)}
          onAccept={ghost ? take : undefined} onClear={ghost ? clear : undefined} onClose={close} />
      )}
    </span>
  );
};

/** Does the catalogue hold a proposal this input's label can explain? */
function useWhyId(path: string, index?: number): string | null {
  const suggestions = useEngine2Model((s) => s.suggestions);
  const dismissed = useEngine2Model((s) => s.dismissed);
  const offered = useDealUi((s) => s.features.suggestAssumptions);
  if (!offered || !cellSuggestion(suggestions, dismissed, path, index)) return null;
  return index === undefined ? path : `${path}.${index}`;
}

/** One labelled numeric field bound to a draft path. */
export const NumField: React.FC<{
  path: string;
  label: string;
  unit: Unit;
  value: number | null | undefined;
  hint?: string;
  onCommit?: (v: number) => void;
}> = ({ path, label, unit, value, hint, onCommit }) => {
  const basis = useEngine2Model((s) => s.basis[path]);
  const whyId = useWhyId(path);
  const setField = useSetField();
  return (
    <Line path={path} label={label} hint={hint} whyId={whyId}>
      {isSet(value) && basis && <span className="sr-only" data-basis={basis.kind}>{basis.kind === 'user' ? 'entered by you' : 'accepted from a suggestion'}</span>}
      <NumBox value={value} unit={unit} ariaLabel={label} sugPath={path} onCommit={onCommit ?? ((v) => setField(path, v))} />
    </Line>
  );
};

// ── choices ─────────────────────────────────────────────────────────────────────────────────

/**
 * A choice bound to a draft path; pending ⇒ still open. Short lists show every option. `from`
 * names a proposal for a group of inputs that settles this choice with it (the filing's working
 * capital days settle the method).
 */
export function ChoiceField<T extends string | boolean>({ path, label, value, options, hint, onChoose, from }: {
  path: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  hint?: string;
  onChoose?: (v: T) => void;
  from?: { key: string; pick: (group: unknown) => unknown };
}) {
  const pending = useEngine2Model((s) => s.pending.includes(path));
  const basis = useEngine2Model((s) => s.basis[path] ?? (from ? s.basis[from.key] : undefined));
  const own = useEngine2Model((s) => s.suggestions[path]);
  const group = useEngine2Model((s) => (from ? s.suggestions[from.key] : undefined));
  const offered = useDealUi((s) => s.features.suggestAssumptions);
  const setField = useSetField();
  const opts: Option[] = options.map((o) => ({ value: String(o.value), label: o.label }));
  const choose = (v: string) => {
    const opt = options.find((o) => String(o.value) === v);
    if (opt) (onChoose ? onChoose(opt.value) : setField(path, opt.value));
  };
  const compact = options.length <= 3 && options.map((o) => o.label).join('').length <= 34;
  // the proposal for this choice: its own, or the one a group proposal carries
  const sug = !offered ? null : own ? { key: path, value: own.value, basis: own.basis } : group ? { key: from!.key, value: from!.pick(group.value), basis: group.basis } : null;
  const suggested = sug ? options.find((o) => String(o.value) === String(sug.value)) : undefined;
  const said = suggested && sug ? { text: suggested.label, kind: sug.basis.kind, detail: sug.basis.detail } : null;
  return (
    <Line path={path} label={label} hint={hint} whyId={said ? path : null}>
      <ChoiceCell popId={path} stamp={pending ? '' : String(value)}
        offer={pending && said && sug ? { key: sug.key, ...said } : null}
        taken={!pending && said ? { ...said, as: basis && basis.kind !== 'user' ? 'accepted' : 'own' } : null}>
        {compact
          ? <Segmented cell ariaLabel={label} value={pending ? '' : String(value)} options={opts} onChange={choose} blank={pending} suggested={pending && suggested ? String(suggested.value) : undefined} />
          : <Dropdown cell ariaLabel={label} value={pending ? '' : String(value)} options={opts} onChange={choose} blank={pending} placeholder="Choose" className="w-64 max-w-full" suggested={pending && suggested ? suggested.label : undefined} />}
      </ChoiceCell>
    </Line>
  );
}

/** A choice that is not a draft path (how a line is entered, a schedule shape). */
export const PlainChoice: React.FC<{ label: React.ReactNode; ariaLabel: string; value: string; options: Option[]; onChange: (v: string) => void; hint?: string; blank?: boolean; strong?: boolean }> = ({ label, ariaLabel, value, options, onChange, hint, blank, strong }) => (
  <Line label={strong ? <span className="font-semibold">{label}</span> : label} hint={hint}>
    <ChoiceCell stamp={blank ? '' : value}>
      <Dropdown cell ariaLabel={ariaLabel} value={blank ? '' : value} options={options} onChange={onChange} blank={blank} placeholder="Choose" className="w-64 max-w-full" />
    </ChoiceCell>
  </Line>
);

/** A feature switch. Enter passes it by; Space turns it on or off. */
export const Toggle: React.FC<{ on: boolean; label: string; onOn: () => void; onOff: () => void; hint?: string; disabled?: boolean }> = ({ on, label, onOn, onOff, hint, disabled }) => (
  <Line label={label} hint={hint}>
    <ChoiceCell>
      <Switch cell on={on} ariaLabel={label} disabled={disabled} onChange={(next) => (next ? onOn() : onOff())} />
    </ChoiceCell>
  </Line>
);

// ── by-year grids ───────────────────────────────────────────────────────────────────────────

/** A per-year grid (years 1..N, or from year `from`). */
export const YearGrid: React.FC<{
  path: string;
  label: string;
  unit: Unit;
  values: number[];
  from?: number;
  hint?: string;
  onCommit?: (next: number[]) => void;
}> = ({ path, label, unit, values, from = 1, hint, onCommit }) => {
  const setField = useSetField();
  const suggestions = useEngine2Model((s) => s.suggestions);
  const dismissed = useEngine2Model((s) => s.dismissed);
  const offered = useDealUi((s) => s.features.suggestAssumptions);
  const write = (next: number[]) => (onCommit ? onCommit(next) : setField(path, next));
  // the label explains the first year that has a proposal (a blank one where there is one)
  const withSug = offered ? values.map((_, i) => i).filter((i) => cellSuggestion(suggestions, dismissed, path, i)) : [];
  const explain = withSug.find((i) => !isSet(values[i])) ?? withSug[0];
  return (
    <div className="group/grid py-2 px-3 -mx-3 rounded-[var(--de-r-sm)] hover:bg-[var(--de-hover)]" data-path={path} data-de-line>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-1.5">
        <Label hint={hint} whyId={explain === undefined ? null : `${path}.${explain}`}>{label}</Label>
        <span className="text-[11px] text-[color:var(--de-ink-3)] opacity-0 group-focus-within/grid:opacity-100 transition-opacity whitespace-nowrap">
          paste a row from Excel · <span className="de-kbd">{chord('Enter')}</span> fills right
        </span>
      </div>
      <div className="de-scroll-x">
        <div className="flex gap-1.5 justify-end min-w-max">
          {values.map((v, i) => (
            <span key={i} className="flex flex-col items-stretch gap-1">
              <span className="text-[11px] text-[color:var(--de-ink-3)] text-right pr-2">Year {i + from}</span>
              <NumBox value={v} unit={unit} width="w-[5.25rem]" compact ariaLabel={`${label} year ${i + from}`} sugPath={path} sugIndex={i}
                onCommit={(x) => { const next = [...values]; next[i] = x; write(next); }}
                onPasteCells={(cells) => { const next = [...values]; cells.forEach((c, k) => { if (i + k < next.length) next[i + k] = c; }); write(next); }}
                onFillRight={(x) => write(values.map((old, k) => (k >= i ? x : old)))} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── sections ────────────────────────────────────────────────────────────────────────────────

/** How many inputs each section still needs. Provided by the panel; read by every Section. */
export const SectionCounts = createContext<Record<string, number>>({});

export const Section: React.FC<{ id?: string; title: string; children: React.ReactNode; note?: string; optional?: boolean }> = ({ id, title, children, note, optional }) => {
  const counts = useContext(SectionCounts);
  const collapsed = useDealUi((s) => (id ? !!s.collapsed[id] : false));
  const toggle = useDealUi((s) => s.toggleSection);
  const open = id ? counts[id] ?? 0 : 0;
  return (
    <section id={id ? `sec-${id}` : undefined} data-section={id} className="scroll-mt-32 border-t border-[color:var(--de-rule)] first:border-t-0">
      <header className="flex items-center justify-between gap-3 pt-5 pb-2">
        <button type="button" disabled={!id} onClick={() => id && toggle(id)} aria-expanded={!collapsed}
          className="flex items-center gap-2 text-left min-w-0">
          {id && (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={cx('shrink-0 text-[color:var(--de-ink-3)] transition-transform', collapsed && '-rotate-90')}>
              <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] truncate">{title}</h2>
          {optional && <span className="text-[12px] text-[color:var(--de-ink-3)]">optional</span>}
        </button>
        {id && open > 0 && <span className="de-num text-[12px] font-medium text-[color:var(--de-accent)] whitespace-nowrap">{open} to fill</span>}
      </header>
      {!collapsed && (
        <div className="pb-5">
          {note && <p className="text-[13px] text-[color:var(--de-ink-3)] mb-2 max-w-[62ch]">{note}</p>}
          {children}
        </div>
      )}
    </section>
  );
};

/** A sub-heading inside a section (one forecast line, one instrument). */
export const SubHead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-[13px] font-semibold text-[color:var(--de-ink-2)] mt-4 mb-1 first:mt-1">{children}</h3>
);

export const SmallButton: React.FC<{ onClick: () => void; children: React.ReactNode; danger?: boolean; title?: string }> = ({ onClick, children, danger, title }) => (
  <button type="button" onClick={onClick} title={title}
    className={cx('inline-flex items-center h-8 px-3 rounded-[var(--de-r-sm)] text-[13px] font-medium border transition-colors',
      danger ? 'border-transparent text-[color:var(--de-accent)] hover:bg-[var(--de-accent-soft)]' : 'border-[color:var(--de-rule)] bg-[var(--de-surface)] text-[color:var(--de-ink)] hover:border-[color:var(--de-rule-strong)] hover:bg-[var(--de-hover)]')}>
    {children}
  </button>
);

/** A read-only figure the sheet works out from the inputs beside it (ink, not blue). */
export const Derived: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="de-row" data-de-line>
    <Label hint={hint}><span className="text-[color:var(--de-ink-2)]">{label}</span></Label>
    <span className="de-num text-[14px] font-medium pr-2">{value}</span>
  </div>
);
