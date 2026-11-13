/**
 * Deal-engine UI kit: the primitives every screen shares. Colour, type and shape come from the
 * `--de-*` variables on `.de-root` (index.css); no component carries a hex value. Figures are
 * set in the text face with tabular numerals. Blue is a typed number, ink a calculated one.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { dealUiStore, useDealUi } from '../../../store/dealUi';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/** Accounting format: thousands separators, negatives in parentheses, an en dash for nothing. */
export function acct(v: number | null | undefined, dp = 1): string {
  if (v == null || !Number.isFinite(v)) return '–';
  const body = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return v < 0 && body !== (0).toFixed(dp) ? `(${body})` : body;
}
/** A signed change: +12.0 / (12.0). */
export function delta(v: number | null | undefined, dp = 1): string {
  if (v == null || !Number.isFinite(v)) return '–';
  return v > 0 ? `+${acct(v, dp)}` : acct(v, dp);
}

/** "1,234.5", "(20)", "-20" → number; blank → null; anything else → undefined (rejected). */
export function parseAmount(text: string): number | null | undefined {
  const t = text.trim();
  if (t === '') return null;
  const neg = /^\(.*\)$/.test(t) || /^[-−]/.test(t);
  const n = Number(t.replace(/[(),\s−-]/g, ''));
  if (!Number.isFinite(n) || t.replace(/[(),\s−-]/g, '') === '') return undefined;
  return neg ? -n : n;
}

/** A small turning ring: something is being worked on and will finish by itself. */
export const Spinner: React.FC<{ className?: string }> = ({ className }) => <span aria-hidden="true" className={cx('de-spinner inline-block shrink-0', className)} />;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'dark' | 'ghost' | 'quiet' | 'danger'; size?: 'sm' | 'md'; /** Working: shows a spinner and cannot be pressed again. */ busy?: boolean };
export const Button: React.FC<ButtonProps> = ({ variant = 'ghost', size = 'md', className, disabled, busy, children, ...rest }) => (
  <button
    type="button"
    disabled={disabled || busy}
    aria-busy={busy || undefined}
    className={cx(
      'inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap rounded-[var(--de-r-sm)] transition-colors select-none',
      size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-[14px]',
      disabled && !busy && 'opacity-40 cursor-not-allowed',
      busy && 'cursor-progress',
      (variant === 'primary' || variant === 'dark') && 'bg-[var(--de-ink)] text-white hover:bg-[var(--de-ink-hover)]',
      variant === 'ghost' && 'border border-[color:var(--de-rule)] bg-[var(--de-surface)] text-[color:var(--de-ink)] hover:border-[color:var(--de-rule-strong)] hover:bg-[var(--de-hover)]',
      variant === 'quiet' && 'text-[color:var(--de-ink-2)] hover:text-[color:var(--de-ink)] hover:bg-[var(--de-sunken)]',
      variant === 'danger' && 'text-[color:var(--de-accent)] hover:bg-[var(--de-accent-soft)]',
      className,
    )}
    {...rest}
  >{busy && <Spinner />}{children}</button>
);

/** A square button that carries only a glyph; `label` is what a screen reader and the tooltip say. */
export const IconButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; /** Where the label opens: centred under the button, or flush with its right edge. */ tipSide?: 'center' | 'end' }> = ({ label, active, className, children, tipSide = 'center', ...rest }) => (
  <button type="button" aria-label={label} data-tip={label} data-tip-side={tipSide}
    className={cx('de-tip inline-flex items-center justify-center w-8 h-8 rounded-[var(--de-r-sm)] text-[color:var(--de-ink-2)] hover:text-[color:var(--de-ink)] hover:bg-[var(--de-sunken)] transition-colors',
      active && 'bg-[var(--de-sunken)] text-[color:var(--de-ink)]', className)}
    {...rest}>{children}</button>
);

export const Card: React.FC<{ title?: React.ReactNode; aside?: React.ReactNode; className?: string; flush?: boolean; children: React.ReactNode; id?: string }> = ({ title, aside, className, flush, children, id }) => (
  <section id={id} className={cx('bg-[var(--de-surface)] border border-[color:var(--de-rule)] rounded-[var(--de-r)] min-w-0', className)}>
    {(title || aside) && (
      <header className={cx('flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 pt-4', flush ? 'pb-3' : 'pb-1')}>
        <h3 className="text-[15px] font-semibold text-[color:var(--de-ink)]">{title}</h3>
        {aside}
      </header>
    )}
    <div className={flush ? '' : 'px-5 pb-5 pt-3'}>{children}</div>
  </section>
);

/** A small label above a figure or a group. Sentence case, never tracked capitals. */
export const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <p className={cx('text-[12px] font-medium text-[color:var(--de-ink-3)]', className)}>{children}</p>
);

export const Kpi: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'neutral' | 'pos' | 'accent' | 'warn' }> = ({ label, value, sub, tone = 'neutral' }) => (
  <div className="px-5 py-4 min-w-0">
    <Eyebrow>{label}</Eyebrow>
    <p className={cx('de-num text-[28px] font-semibold leading-tight mt-1 truncate',
      tone === 'pos' && 'text-[color:var(--de-pos)]', tone === 'accent' && 'text-[color:var(--de-accent)]', tone === 'warn' && 'text-[color:var(--de-warn)]')}>{value}</p>
    {sub && <p className="text-[12px] text-[color:var(--de-ink-3)] mt-1 leading-snug">{sub}</p>}
  </div>
);

export const Tag: React.FC<{ tone?: 'neutral' | 'input' | 'pos' | 'warn' | 'accent' | 'ai'; children: React.ReactNode; title?: string }> = ({ tone = 'neutral', children, title }) => (
  <span title={title} className={cx('inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium whitespace-nowrap',
    tone === 'neutral' && 'bg-[var(--de-sunken)] text-[color:var(--de-ink-2)]',
    tone === 'input' && 'bg-[var(--de-input-soft)] text-[color:var(--de-input)]',
    tone === 'pos' && 'bg-[var(--de-pos-soft)] text-[color:var(--de-pos)]',
    tone === 'warn' && 'bg-[var(--de-warn-soft)] text-[color:var(--de-warn)]',
    tone === 'ai' && 'bg-[var(--de-ai-soft)] text-[color:var(--de-ai)]',
    tone === 'accent' && 'bg-[var(--de-accent-soft)] text-[color:var(--de-accent)]')}>{children}</span>
);

export const Callout: React.FC<{ tone: 'block' | 'warn' | 'info'; title?: string; children: React.ReactNode }> = ({ tone, title, children }) => (
  <div className={cx('px-4 py-3 rounded-[var(--de-r-sm)] text-[13px] leading-relaxed',
    tone === 'block' && 'bg-[var(--de-accent-soft)]',
    tone === 'warn' && 'bg-[var(--de-warn-soft)]',
    tone === 'info' && 'bg-[var(--de-sunken)]')}>
    {title && <p className={cx('font-semibold mb-0.5', tone === 'block' && 'text-[color:var(--de-accent)]', tone === 'warn' && 'text-[color:var(--de-warn)]')}>{title}</p>}
    <div className="text-[color:var(--de-ink-2)]">{children}</div>
  </div>
);

const Chevron: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0 text-[color:var(--de-ink-3)]"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export interface Option<T extends string = string> { value: T; label: string; note?: string }

/**
 * A drop-down list. A button shows the choice; the list opens beneath it and is driven by the
 * arrow keys, Enter and Esc. With no value it reads `placeholder` and is marked as still open.
 */
export function Dropdown<T extends string>({ value, options, onChange, ariaLabel, placeholder = 'Choose', blank, className, align = 'right', cell, suggested }: {
  value: T | '';
  options: Option<T>[];
  onChange: (v: T) => void;
  ariaLabel: string;
  placeholder?: string;
  /** The choice has not been made yet: drawn as a blank that still needs an answer. */
  blank?: boolean;
  className?: string;
  align?: 'left' | 'right';
  /** A cell of the input sheet: the keyboard moves to it like any other input. */
  cell?: boolean;
  /** A suggested option not yet accepted: shown in grey with a star in place of the placeholder. */
  suggested?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const openList = () => { const at = options.findIndex((o) => o.value === value); setActive(at < 0 ? 0 : at); setOpen(true); };
  const choose = (o: Option<T>) => { setOpen(false); if (o.value !== value) onChange(o.value); };
  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i < options.length - 1 ? i + 1 : i)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i > 0 ? i - 1 : 0)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[active]) choose(options[active]); }
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1) {
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) setActive(i);
    }
  };
  return (
    <div ref={root} className={cx('relative inline-block text-left', className)}>
      <button type="button" role="combobox" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={id}
        data-blank={(blank && !suggested) || undefined} data-suggested={(blank && !!suggested) || undefined} data-de-cell={cell || undefined}
        onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKey}
        className={cx('de-control inline-flex items-center justify-between gap-2 pl-3 pr-2.5 text-[13px] max-w-full w-full', current && !blank ? 'text-[color:var(--de-ink)]' : suggested ? 'text-[color:var(--de-ink-3)]' : 'text-[color:var(--de-accent)]')}>
        <span className="truncate">{current && !blank ? current.label : suggested ? <><span aria-hidden="true" className="de-star">★</span>{suggested}</> : placeholder}</span>
        <Chevron />
      </button>
      <ul id={id} role="listbox" aria-label={ariaLabel} hidden={!open}
        className={cx('de-pop absolute z-40 mt-1 min-w-full w-max max-w-[min(26rem,80vw)] max-h-72 overflow-auto p-1 bg-[var(--de-surface)] border border-[color:var(--de-rule)] rounded-[var(--de-r)] shadow-[var(--de-shadow-pop)]', align === 'right' ? 'right-0' : 'left-0')}>
        {options.map((o, i) => (
          <li key={o.value} role="option" aria-selected={o.value === value}
            onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); choose(o); }}
            className={cx('flex items-center justify-between gap-4 px-2.5 py-2 rounded-[var(--de-r-sm)] text-[13px] cursor-pointer', i === active && 'bg-[var(--de-sunken)]')}>
            <span>
              <span className={o.value === value ? 'font-medium' : ''}>{o.label}</span>
              {o.note && <span className="block text-[12px] text-[color:var(--de-ink-3)]">{o.note}</span>}
            </span>
            {o.value === value && !blank && <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.5 5 9l4.5-5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Two to four short options shown side by side: one click, and every option is visible. */
export function Segmented<T extends string>({ value, options, onChange, ariaLabel, blank, size = 'md', cell, suggested }: {
  value: T | '';
  options: Option<T>[];
  onChange: (v: T) => void;
  ariaLabel: string;
  blank?: boolean;
  size?: 'sm' | 'md';
  /** A cell of the input sheet: the keyboard moves to it like any other input. */
  cell?: boolean;
  /** A suggested option not yet accepted: marked in grey with a star until taken. */
  suggested?: T;
}) {
  const ghost = blank && suggested !== undefined && options.some((o) => o.value === suggested);
  // the one option the keyboard lands on: the choice made, else the suggestion, else the first
  const home = !blank && options.some((o) => o.value === value) ? value : ghost ? suggested : options[0]?.value;
  return (
    <div role="radiogroup" aria-label={ariaLabel} data-blank={(blank && !ghost) || undefined} data-suggested={ghost || undefined}
      className={cx('inline-flex p-0.5 rounded-[var(--de-r-sm)] max-w-full', ghost ? 'bg-[var(--de-sunken)] shadow-[inset_0_-2px_0_var(--de-rule-strong)]' : blank ? 'bg-[var(--de-accent-soft)] shadow-[inset_0_-2px_0_var(--de-accent)]' : 'bg-[var(--de-sunken)]')}>
      {options.map((o) => {
        const on = !blank && o.value === value;
        const offered = ghost && o.value === suggested;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} title={o.note}
            data-de-cell={(cell && o.value === home) || undefined} data-offered={offered || undefined}
            onClick={() => { if (!on) onChange(o.value); }}
            className={cx('px-3 rounded-[5px] text-[13px] whitespace-nowrap transition-colors', size === 'sm' ? 'h-7' : 'h-[30px]',
              on ? 'bg-[var(--de-surface)] text-[color:var(--de-ink)] font-medium shadow-[var(--de-shadow-sm)]'
                : offered ? 'text-[color:var(--de-ink-3)] border border-dashed border-[color:var(--de-rule-strong)]' : 'text-[color:var(--de-ink-2)] hover:text-[color:var(--de-ink)]')}>
            {offered && <span aria-hidden="true" className="de-star">★</span>}{o.label}
          </button>
        );
      })}
    </div>
  );
}

export const Switch: React.FC<{ on: boolean; onChange: (on: boolean) => void; ariaLabel: string; disabled?: boolean; cell?: boolean }> = ({ on, onChange, ariaLabel, disabled, cell }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={ariaLabel} disabled={disabled} data-de-cell={(cell && !disabled) || undefined}
    onClick={() => onChange(!on)}
    className={cx('relative inline-flex w-9 h-5 rounded-full transition-colors shrink-0', on ? 'bg-[var(--de-ink)]' : 'bg-[var(--de-rule-strong)]', disabled && 'opacity-40 cursor-not-allowed')}>
    <span className={cx('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform', on && 'translate-x-4')} />
  </button>
);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** A date, picked from a small calendar. The value is an ISO date (YYYY-MM-DD). */
export const DateField: React.FC<{ value: string; onChange: (v: string) => void; ariaLabel: string }> = ({ value, onChange, ariaLabel }) => {
  const [y0, m0, d0] = value.split('-').map(Number);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ y: y0, m: m0 - 1 });
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // weeks start on Monday
  const step = (by: number) => setView((v) => { const d = new Date(v.y, v.m + by, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const nav = 'inline-flex items-center justify-center w-7 h-7 rounded-[var(--de-r-sm)] text-[color:var(--de-ink-2)] hover:bg-[var(--de-sunken)]';
  return (
    <div ref={root} className="relative inline-block">
      <button type="button" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => { setView({ y: y0, m: m0 - 1 }); setOpen((o) => !o); }}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        className="de-control de-num inline-flex items-center gap-2 px-3 text-[13px]">
        {d0} {MONTHS[m0 - 1]} {y0}
        <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true" className="text-[color:var(--de-ink-3)]"><rect x="1.5" y="2.5" width="11" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M1.5 5.5h11M4.5 1v3M9.5 1v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
      </button>
      {open && (
        <div role="dialog" aria-label={ariaLabel} className="de-pop absolute right-0 z-40 mt-1 w-64 p-3 bg-[var(--de-surface)] border border-[color:var(--de-rule)] rounded-[var(--de-r)] shadow-[var(--de-shadow-pop)]">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-0.5">
              <button type="button" aria-label="Previous year" className={nav} onClick={() => step(-12)}>«</button>
              <button type="button" aria-label="Previous month" className={nav} onClick={() => step(-1)}>‹</button>
            </span>
            <span className="text-[13px] font-semibold">{MONTHS[view.m]} {view.y}</span>
            <span className="flex items-center gap-0.5">
              <button type="button" aria-label="Next month" className={nav} onClick={() => step(1)}>›</button>
              <button type="button" aria-label="Next year" className={nav} onClick={() => step(12)}>»</button>
            </span>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="text-[11px] text-[color:var(--de-ink-3)] py-1">{d}</span>)}
            {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
            {Array.from({ length: days }, (_, i) => {
              const day = i + 1;
              const on = view.y === y0 && view.m === m0 - 1 && day === d0;
              return (
                <button key={day} type="button" onClick={() => { onChange(iso(view.y, view.m, day)); setOpen(false); }}
                  className={cx('de-num h-8 rounded-[var(--de-r-sm)] text-[13px]', on ? 'bg-[var(--de-ink)] text-white font-medium' : 'hover:bg-[var(--de-sunken)]')}>
                  {day}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => { onChange(iso(view.y, view.m, days)); setOpen(false); }}
            className="w-full mt-2 h-8 rounded-[var(--de-r-sm)] text-[12px] text-[color:var(--de-ink-2)] hover:bg-[var(--de-sunken)]">
            Use the month end, {days} {MONTHS[view.m]} {view.y}
          </button>
        </div>
      )}
    </div>
  );
};

/** A panel that slides in from the right over the page. Esc and a click on the backdrop close it. */
export const Drawer: React.FC<{ open: boolean; onClose: () => void; title: React.ReactNode; width?: string; children: React.ReactNode; aside?: React.ReactNode }> = ({ open, onClose, title, width = 'w-[28rem]', children, aside }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  // Focus moves into the panel when it opens (unless something inside has already taken it) and
  // goes back to the control that opened it when it closes, so the keyboard never loses its place.
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const from = document.activeElement as HTMLElement | null;
    if (panel.current && !panel.current.contains(document.activeElement)) panel.current.focus({ preventScroll: true });
    return () => { if (from && document.contains(from)) from.focus({ preventScroll: true }); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="de-no-print fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="de-scrim absolute inset-0 bg-[var(--de-scrim)] cursor-default" onClick={onClose} />
      <aside ref={panel} tabIndex={-1} className={cx('de-drawer outline-none relative h-full max-w-[94vw] flex flex-col bg-[var(--de-surface)] shadow-[var(--de-shadow-pop)]', width)}>
        <header className="flex items-center justify-between gap-3 px-5 h-14 border-b border-[color:var(--de-rule)] shrink-0">
          <h2 className="text-[15px] font-semibold truncate">{title}</h2>
          <span className="flex items-center gap-1">
            {aside}
            <IconButton label="Close" tipSide="end" onClick={onClose}><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></IconButton>
          </span>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </aside>
    </div>
  );
};

/**
 * A number the analyst types. Commits on blur or Enter; Esc puts the old value back. Blank
 * commits null (not entered) — never zero. Text that is not a number is refused and marked.
 */
export const AmountInput: React.FC<{
  value: number | null;
  onCommit: (v: number | null) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
}> = ({ value, onCommit, ariaLabel, placeholder = '–', className, required }) => {
  const shown = value === null ? '' : acct(value);
  const [draft, setDraft] = useState(shown);
  const [bad, setBad] = useState(false);
  useEffect(() => { setDraft(shown); setBad(false); }, [shown]);
  const commit = () => {
    const parsed = parseAmount(draft);
    if (parsed === undefined) { setBad(true); return; }
    setBad(false);
    if (parsed !== value) onCommit(parsed);
    else setDraft(shown);
  };
  return (
    <input
      inputMode="decimal"
      aria-label={ariaLabel}
      aria-invalid={bad || undefined}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setDraft(shown); setBad(false); }
      }}
      data-blank={(required && value === null) || undefined}
      data-invalid={bad || undefined}
      className={cx('de-control de-num w-full px-2 text-[13px] text-right text-[color:var(--de-input)] placeholder:text-[color:var(--de-ink-3)]', className)}
    />
  );
};

export const TextInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }> = ({ className, invalid, ...rest }) => (
  <input
    data-invalid={invalid || undefined}
    className={cx('de-control w-full px-3 text-[14px] text-[color:var(--de-ink)] placeholder:text-[color:var(--de-ink-3)]', className)}
    {...rest}
  />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className, ...rest }) => (
  <select className={cx('de-control px-2 text-[13px] text-[color:var(--de-ink)]', className)} {...rest} />
);

export interface StepItem { id: string; label: string; state: 'done' | 'current' | 'open' | 'locked'; note?: string }
/** The four steps and where the deal stands. A locked step says what it is waiting for. */
export const Stepper: React.FC<{ steps: StepItem[]; onGo: (id: string) => void }> = ({ steps, onGo }) => (
  <nav aria-label="Steps" className="flex items-center gap-1">
    {steps.map((s, i) => {
      const reachable = s.state !== 'locked';
      return (
        <React.Fragment key={s.id}>
          {i > 0 && <span aria-hidden="true" className={cx('w-5 h-px', s.state === 'locked' ? 'bg-[var(--de-rule)]' : 'bg-[var(--de-rule-strong)]')} />}
          <button
            type="button"
            disabled={!reachable}
            aria-current={s.state === 'current' ? 'step' : undefined}
            title={s.note}
            onClick={() => reachable && onGo(s.id)}
            className={cx('flex items-center gap-2 h-8 pl-1.5 pr-3 rounded-full text-[13px] transition-colors',
              s.state === 'current' && 'bg-[var(--de-ink)] text-white font-medium',
              (s.state === 'done' || s.state === 'open') && 'text-[color:var(--de-ink-2)] hover:bg-[var(--de-sunken)] hover:text-[color:var(--de-ink)]',
              s.state === 'locked' && 'text-[color:var(--de-ink-3)] opacity-60 cursor-not-allowed')}
          >
            <span className={cx('de-num inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-medium',
              s.state === 'current' && 'bg-white text-[color:var(--de-ink)]',
              s.state === 'done' && 'bg-[var(--de-pos-soft)] text-[color:var(--de-pos)]',
              (s.state === 'open' || s.state === 'locked') && 'bg-[var(--de-sunken)]')}>
              {s.state === 'done' ? <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.5 5 9l4.5-5.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg> : i + 1}
            </span>
            {s.label}
          </button>
        </React.Fragment>
      );
    })}
  </nav>
);

/** A grey bar standing in for text or a figure that is on its way. */
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => <span aria-hidden="true" className={cx('de-skeleton block', className)} />;

/** How much of something is done, as a thin bar. */
export const Meter: React.FC<{ value: number; total: number; label: string; done?: boolean }> = ({ value, total, label, done }) => (
  <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value} className="de-meter h-1 rounded-full bg-[var(--de-sunken)] overflow-hidden">
    <span style={{ width: total > 0 ? `${(value / total) * 100}%` : '0%', background: done ? 'var(--de-pos)' : undefined }} />
  </div>
);

/** Copy text to the clipboard and say so. Returns false when the browser refuses. */
export async function copyText(text: string, said: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    dealUiStore.getState().notify(said);
    return true;
  } catch {
    dealUiStore.getState().notify('Copying is blocked in this browser');
    return false;
  }
}

/** A small "copy" control beside something worth taking elsewhere (a cell reference, a formula, an answer). */
export const CopyButton: React.FC<{ text: string; said: string; label: string; className?: string }> = ({ text, said, label, className }) => (
  <button type="button" aria-label={label} data-tip={label} onClick={() => void copyText(text, said)}
    className={cx('de-tip inline-flex items-center justify-center w-6 h-6 rounded text-[color:var(--de-ink-3)] hover:text-[color:var(--de-ink)] hover:bg-[var(--de-sunken)] transition-colors', className)}>
    <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><rect x="4.5" y="4.5" width="7.5" height="7.5" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M9.5 4.5V3.2A1.2 1.2 0 0 0 8.3 2H3.2A1.2 1.2 0 0 0 2 3.2v5.1a1.2 1.2 0 0 0 1.2 1.2h1.3" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
  </button>
);

/** The one place a short confirmation appears: bottom centre, read out politely, gone after a few seconds. */
export const ToastHost: React.FC = () => {
  const toast = useDealUi((s) => s.toast);
  const dismiss = useDealUi((s) => s.dismissToast);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(dismiss, 3200);
    return () => window.clearTimeout(t);
  }, [toast, dismiss]);
  return (
    <div aria-live="polite" role="status" className="de-no-print fixed bottom-6 inset-x-0 z-[80] flex justify-center pointer-events-none px-4">
      {toast && (
        <p key={toast.id} className="de-toast pointer-events-auto inline-flex items-center gap-2 h-10 pl-3 pr-4 rounded-full bg-[var(--de-ink)] text-white text-[13px] font-medium shadow-[var(--de-shadow-pop)]">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.5 6 10.5l5-6.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {toast.text}
        </p>
      )}
    </div>
  );
};

export { cx };
