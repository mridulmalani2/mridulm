/**
 * v2 input primitives (v2.0.0 "blank until entered").
 *
 * Every field reads the DRAFT (store/engine2Model): an unset number is NaN and renders BLANK
 * with a red underline; an unset choice is listed in `pending` and renders as still open. A set
 * field says where its value came from, and where the suggestion catalogue holds a proposal for
 * its path a quiet one-click "use" link offers it with its basis. Nothing is ever filled in for
 * the analyst; accepting a suggestion is an explicit click (or S in the blank field).
 *
 * The sheet behaves like a spreadsheet: Enter moves down, the arrow keys move between cells, a
 * row copied from Excel pastes across a by-year grid, and Ctrl+Enter fills a value to the right.
 *
 * Percent fields cross the display boundary EXACTLY once (fromPctInput / toPctInput).
 */
import React, { createContext, useContext, useState } from 'react';
import { useEngine2Model, type FieldBasis } from '../../../store/engine2Model';
import { useWorkspace } from '../../../store/workspace';
import { useDealUi } from '../../../store/dealUi';
import { fromPctInput, num, toPctInput } from '../../../lib/format';
import { setPath } from '../../../lib/engine2/draft';
import type { DealAssumptions } from '../../../lib/engine2/types';
import { Dropdown, Segmented, Switch, cx, type Option } from '../ui/kit';

export type Unit = 'pct' | 'money' | 'mult' | 'years' | 'days' | 'beta' | 'ratio';
const SUFFIX: Record<Unit, string> = { pct: '%', money: 'm', mult: 'x', years: 'yrs', days: 'd', beta: 'β', ratio: '' };

export const isSet = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

export function show(v: number | null | undefined, unit: Unit): string {
  if (!isSet(v)) return '';
  if (unit === 'pct') return toPctInput(v);
  if (unit === 'years') return String(v);
  if (unit === 'beta' || unit === 'ratio') return num(v, 3);
  return num(v, 2);
}

/**
 * Parse a typed value; '' ⇒ NaN (the analyst cleared the field: it is unset again); text that is
 * not ONE number ⇒ null (refused). White space inside the text is never removed: "125 3" is two
 * numbers pasted together, not 1253.
 */
export function parse(text: string, unit: Unit): number | null {
  const t = text.trim();
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

const cells = (): HTMLInputElement[] => Array.from(document.querySelectorAll<HTMLInputElement>('input[data-de-cell]')).filter((el) => el.offsetParent !== null);
const rowOf = (el: Element): Element | null => el.closest('[data-de-line]');

/** Move focus from `el`: the next / previous cell in reading order, or the same column a line up / down. */
function moveFocus(el: HTMLInputElement, dir: 'next' | 'prev' | 'up' | 'down'): void {
  const all = cells();
  const i = all.indexOf(el);
  if (i < 0) return;
  let target: HTMLInputElement | undefined;
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
  if (target) { target.focus(); target.select(); }
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

export const Label: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <span className="inline-flex items-center gap-1.5 min-w-0">
    <span className="text-[14px] text-[color:var(--de-ink)] leading-snug">{children}</span>
    {hint && <Hint text={hint} />}
  </span>
);

const BASIS_WORD: Record<string, string> = { history: 'history', convention: 'convention', facts: 'filing', template: 'template', ai: 'AI', fact: 'filing' };

/** Where a set value came from. A typed value needs no mark: blue already says so. */
export const BasisMark: React.FC<{ basis: FieldBasis | undefined }> = ({ basis }) => {
  const [open, setOpen] = useState(false);
  if (!basis) return null;
  if (basis.kind === 'user') return <span className="sr-only" data-basis="user">YOU</span>;
  return (
    <span className="relative inline-flex">
      <button type="button" tabIndex={-1} data-basis={basis.kind} onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)}
        className={cx('inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-medium whitespace-nowrap',
          basis.kind === 'ai' ? 'bg-[var(--de-ai-soft)] text-[color:var(--de-ai)]' : 'bg-[var(--de-sunken)] text-[color:var(--de-ink-2)] hover:text-[color:var(--de-ink)]')}>
        {BASIS_WORD[basis.kind] ?? basis.kind}
      </button>
      {open && basis.detail && (
        <span role="status" className="de-pop absolute right-0 top-full z-30 mt-1.5 w-72 px-3 py-2.5 rounded-[var(--de-r-sm)] bg-[var(--de-surface)] border border-[color:var(--de-rule)] shadow-[var(--de-shadow-pop)] text-[12px] leading-snug text-[color:var(--de-ink-2)] text-left">
          {basis.detail}
        </span>
      )}
    </span>
  );
};

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
export const Line: React.FC<{ path?: string; label: React.ReactNode; hint?: string; children: React.ReactNode; noteLabel?: string; sub?: React.ReactNode }> = ({ path, label, hint, children, noteLabel, sub }) => (
  <div className="de-row group/line" data-path={path} data-de-line>
    <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <Label hint={hint}>{label}</Label>
      {path && <NoteControl path={path} label={noteLabel ?? (typeof label === 'string' ? label : path)} />}
      {sub && <span className="basis-full text-[12px] text-[color:var(--de-ink-3)]">{sub}</span>}
    </div>
    <div className="flex items-center justify-end gap-2 flex-wrap min-w-0">{children}</div>
  </div>
);

// ── suggestions ─────────────────────────────────────────────────────────────────────────────

const KIND_WORD: Record<string, string> = { history: 'Worked out from the filing history', convention: 'A cited market convention or statute', facts: 'Read from the source', template: 'A cited template', ai: 'Proposed by the AI model you connected' };

/** One proposal: "use X" applies it; the word after it opens how the value was reached. */
const SuggestionLink: React.FC<{ text: string; kind: string; detail: string; onUse: () => void }> = ({ text, kind, detail, onUse }) => {
  const [open, setOpen] = useState(false);
  const [how, source] = detail.split(/\s*Source:\s*/);
  const tone = kind === 'ai' ? 'text-[color:var(--de-ai)]' : 'text-[color:var(--de-input)]';
  return (
    <span className="relative inline-flex items-baseline text-[12px] whitespace-nowrap">
      {/* out of the tab order: tabbing through the sheet moves between inputs only */}
      <button type="button" tabIndex={-1} onClick={onUse} title={detail} className={cx('font-medium underline underline-offset-2 decoration-dotted rounded px-1 hover:bg-[var(--de-input-soft)]', tone)}>use {text}</button>
      <button type="button" tabIndex={-1} onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)} aria-expanded={open} title="How this value was reached"
        className="text-[color:var(--de-ink-3)] hover:text-[color:var(--de-ink)] rounded pr-1"> · {kind}</button>
      {open && (
        <span role="dialog" aria-label="How this value was reached" className="de-pop absolute right-0 top-full z-30 mt-1.5 w-80 max-w-[80vw] p-4 rounded-[var(--de-r)] bg-[var(--de-surface)] border border-[color:var(--de-rule)] shadow-[var(--de-shadow-pop)] text-left whitespace-normal">
          <span className="block text-[12px] text-[color:var(--de-ink-3)]">{KIND_WORD[kind] ?? kind}</span>
          <span className={cx('de-num block text-[22px] font-semibold leading-tight mt-1', tone)}>{text}</span>
          <span className="block text-[13px] leading-relaxed text-[color:var(--de-ink-2)] mt-2">{how}</span>
          {source && <span className="block text-[12px] leading-relaxed text-[color:var(--de-ink-3)] mt-2">Source: {source}</span>}
          <span className="block text-[12px] text-[color:var(--de-ink-3)] mt-3">Nothing is applied until you click “use”.</span>
        </span>
      )}
    </span>
  );
};

/** The one-click proposals for a path (the plain proposal and any variants, e.g. @ai). */
export const SuggestionChips: React.FC<{ path: string; unit?: Unit; render?: (v: unknown) => string }> = ({ path, unit, render }) => {
  const suggestions = useEngine2Model((s) => s.suggestions);
  const accept = useEngine2Model((s) => s.acceptSuggestion);
  const keys = Object.keys(suggestions).filter((k) => k === path || k.startsWith(`${path}@`));
  if (keys.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-1 justify-end">
      {keys.map((k) => {
        const s = suggestions[k];
        const text = render
          ? render(s.value)
          : typeof s.value === 'number' && unit
            ? `${show(s.value, unit)}${SUFFIX[unit]}`
            : 'template';
        return <SuggestionLink key={k} text={text} kind={s.basis.kind} detail={s.basis.detail} onUse={() => accept(k)} />;
      })}
    </span>
  );
};

// ── numbers ─────────────────────────────────────────────────────────────────────────────────

/** A numeric cell that commits on blur / Enter. Blank ⇔ unset. */
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
  /** S in a blank cell accepts the field's suggestion. */
  onUseSuggestion?: () => void;
  compact?: boolean;
}> = ({ value, unit, onCommit, width = 'w-28', ariaLabel, onPasteCells, onFillRight, onUseSuggestion, compact }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const shown = show(value, unit);
  const commit = (): number | null => {
    if (draft === null || draft === shown) { setDraft(null); return isSet(value) ? value : null; }
    const v = parse(draft, unit);
    if (v === null) { setBad(true); return null; }
    setBad(false);
    setDraft(null);
    onCommit(v);
    return v;
  };
  return (
    <span className={cx('de-control inline-flex items-center', width, compact && '!h-8')} data-blank={!isSet(value) || undefined} data-invalid={bad || undefined}>
      <input
        data-de-cell
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-invalid={bad || undefined}
        value={draft ?? shown}
        onChange={(e) => { setDraft(e.target.value); setBad(false); }}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
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
          if (e.key === 'Enter') {
            e.preventDefault();
            const v = commit();
            if ((e.ctrlKey || e.metaKey) && onFillRight && v !== null && Number.isFinite(v)) { onFillRight(v); return; }
            moveFocus(el, e.shiftKey ? 'prev' : 'next');
          } else if (e.key === 'Escape') { setDraft(null); setBad(false); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(el, 'down'); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(el, 'up'); }
          else if (e.key === 'ArrowRight' && el.selectionStart === el.value.length && el.selectionEnd === el.value.length) { e.preventDefault(); moveFocus(el, 'next'); }
          else if (e.key === 'ArrowLeft' && el.selectionStart === 0 && el.selectionEnd === 0) { e.preventDefault(); moveFocus(el, 'prev'); }
          else if ((e.key === 's' || e.key === 'S') && onUseSuggestion && el.value === '') { e.preventDefault(); onUseSuggestion(); }
        }}
        className="de-num min-w-0 w-full h-full bg-transparent outline-none text-right text-[14px] text-[color:var(--de-input)] pl-2 pr-1"
      />
      {SUFFIX[unit] && <span className="pr-2 text-[12px] text-[color:var(--de-ink-3)] select-none">{SUFFIX[unit]}</span>}
    </span>
  );
};

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
  const hasSuggestion = useEngine2Model((s) => path in s.suggestions);
  const accept = useEngine2Model((s) => s.acceptSuggestion);
  const setField = useSetField();
  return (
    <Line path={path} label={label} hint={hint}>
      {!isSet(value) && <SuggestionChips path={path} unit={unit} />}
      {isSet(value) && <BasisMark basis={basis} />}
      <NumBox value={value} unit={unit} ariaLabel={label} onCommit={onCommit ?? ((v) => setField(path, v))}
        onUseSuggestion={hasSuggestion ? () => accept(path) : undefined} />
    </Line>
  );
};

// ── choices ─────────────────────────────────────────────────────────────────────────────────

/** A choice bound to a draft path; pending ⇒ still open. Short lists show every option. */
export function ChoiceField<T extends string | boolean>({ path, label, value, options, hint, onChoose }: {
  path: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  hint?: string;
  onChoose?: (v: T) => void;
}) {
  const pending = useEngine2Model((s) => s.pending.includes(path));
  const setField = useSetField();
  const opts: Option[] = options.map((o) => ({ value: String(o.value), label: o.label }));
  const choose = (v: string) => {
    const opt = options.find((o) => String(o.value) === v);
    if (opt) (onChoose ? onChoose(opt.value) : setField(path, opt.value));
  };
  const compact = options.length <= 3 && options.map((o) => o.label).join('').length <= 34;
  const said = (v: unknown) => options.find((o) => String(o.value) === String(v))?.label ?? String(v);
  return (
    <Line path={path} label={label} hint={hint}>
      {pending && <SuggestionChips path={path} render={said} />}
      {compact
        ? <Segmented ariaLabel={label} value={pending ? '' : String(value)} options={opts} onChange={choose} blank={pending} />
        : <Dropdown ariaLabel={label} value={pending ? '' : String(value)} options={opts} onChange={choose} blank={pending} placeholder="Choose" className="w-64 max-w-full" />}
    </Line>
  );
}

/** A choice that is not a draft path (how a line is entered, a schedule shape). */
export const PlainChoice: React.FC<{ label: React.ReactNode; ariaLabel: string; value: string; options: Option[]; onChange: (v: string) => void; hint?: string; blank?: boolean; strong?: boolean }> = ({ label, ariaLabel, value, options, onChange, hint, blank, strong }) => (
  <Line label={strong ? <span className="font-semibold">{label}</span> : label} hint={hint}>
    <Dropdown ariaLabel={ariaLabel} value={blank ? '' : value} options={options} onChange={onChange} blank={blank} placeholder="Choose" className="w-64 max-w-full" />
  </Line>
);

/** A feature switch. */
export const Toggle: React.FC<{ on: boolean; label: string; onOn: () => void; onOff: () => void; hint?: string; disabled?: boolean }> = ({ on, label, onOn, onOff, hint, disabled }) => (
  <Line label={label} hint={hint}>
    <Switch on={on} ariaLabel={label} disabled={disabled} onChange={(next) => (next ? onOn() : onOff())} />
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
  const anyBlank = values.some((v) => !isSet(v));
  const write = (next: number[]) => (onCommit ? onCommit(next) : setField(path, next));
  return (
    <div className="group/grid py-2 px-3 -mx-3 rounded-[var(--de-r-sm)] hover:bg-[var(--de-hover)]" data-path={path} data-de-line>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-1.5">
        <Label hint={hint}>{label}</Label>
        <span className="flex items-center gap-3">
          {anyBlank && <SuggestionChips path={path} render={(v) => (Array.isArray(v) && unit === 'pct' ? `${toPctInput(v[0] as number)}% × ${v.length}y` : 'proposal')} />}
          <span className="text-[11px] text-[color:var(--de-ink-3)] opacity-0 group-focus-within/grid:opacity-100 transition-opacity whitespace-nowrap">
            paste a row from Excel · <span className="de-kbd">Ctrl</span> <span className="de-kbd">Enter</span> fills right
          </span>
        </span>
      </div>
      <div className="de-scroll-x">
        <div className="flex gap-1.5 justify-end min-w-max">
          {values.map((v, i) => (
            <span key={i} className="flex flex-col items-stretch gap-1">
              <span className="text-[11px] text-[color:var(--de-ink-3)] text-right pr-2">Year {i + from}</span>
              <NumBox value={v} unit={unit} width="w-[5.25rem]" compact ariaLabel={`${label} year ${i + from}`}
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
