/**
 * Deal-engine UI kit: the few primitives every screen shares. Colours come from the `--de-*`
 * variables on `.de-root` (index.css) — no component carries a hex value. Figures are set in
 * tabular mono; prose and labels in the proportional face.
 */
import React, { useEffect, useState } from 'react';

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

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'dark' | 'ghost' | 'quiet'; size?: 'sm' | 'md' };
export const Button: React.FC<ButtonProps> = ({ variant = 'ghost', size = 'md', className, disabled, ...rest }) => (
  <button
    type="button"
    disabled={disabled}
    className={cx(
      'inline-flex items-center justify-center gap-1.5 font-sans font-medium whitespace-nowrap transition-colors',
      size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-4 py-2 text-[13px]',
      disabled && 'opacity-40 cursor-not-allowed',
      variant === 'primary' && 'bg-[var(--de-accent)] text-white hover:brightness-95',
      variant === 'dark' && 'bg-[var(--de-ink)] text-white hover:opacity-90',
      variant === 'ghost' && 'border border-[color:var(--de-rule)] bg-[var(--de-surface)] text-[color:var(--de-ink)] hover:border-[color:var(--de-rule-strong)]',
      variant === 'quiet' && 'text-[color:var(--de-ink-2)] hover:text-[color:var(--de-ink)] underline underline-offset-2 decoration-[color:var(--de-rule)]',
      className,
    )}
    {...rest}
  />
);

export const Card: React.FC<{ title?: React.ReactNode; aside?: React.ReactNode; className?: string; flush?: boolean; children: React.ReactNode }> = ({ title, aside, className, flush, children }) => (
  <section className={cx('bg-[var(--de-surface)] border border-[color:var(--de-rule)]', className)}>
    {(title || aside) && (
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[color:var(--de-rule)]">
        <h3 className="font-sans text-[13px] font-semibold tracking-wide text-[color:var(--de-ink)]">{title}</h3>
        {aside}
      </header>
    )}
    <div className={flush ? '' : 'p-4'}>{children}</div>
  </section>
);

export const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <p className={cx('font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--de-ink-3)]', className)}>{children}</p>
);

export const Kpi: React.FC<{ label: string; value: string; sub?: React.ReactNode; tone?: 'neutral' | 'pos' | 'accent' | 'warn' }> = ({ label, value, sub, tone = 'neutral' }) => (
  <div className="px-4 py-3 min-w-0">
    <Eyebrow>{label}</Eyebrow>
    <p className={cx('de-num text-[24px] leading-tight mt-1',
      tone === 'pos' && 'text-[color:var(--de-pos)]', tone === 'accent' && 'text-[color:var(--de-accent)]', tone === 'warn' && 'text-[color:var(--de-warn)]')}>{value}</p>
    {sub && <p className="font-sans text-[12px] text-[color:var(--de-ink-2)] mt-0.5">{sub}</p>}
  </div>
);

export const Tag: React.FC<{ tone?: 'neutral' | 'input' | 'pos' | 'warn' | 'accent'; children: React.ReactNode; title?: string }> = ({ tone = 'neutral', children, title }) => (
  <span title={title} className={cx('inline-block px-1.5 py-0.5 font-sans text-[11px] font-medium whitespace-nowrap',
    tone === 'neutral' && 'bg-[var(--de-sunken)] text-[color:var(--de-ink-2)]',
    tone === 'input' && 'bg-[var(--de-input-soft)] text-[color:var(--de-input)]',
    tone === 'pos' && 'bg-[var(--de-pos-soft)] text-[color:var(--de-pos)]',
    tone === 'warn' && 'bg-[var(--de-warn-soft)] text-[color:var(--de-warn)]',
    tone === 'accent' && 'bg-[var(--de-accent-soft)] text-[color:var(--de-accent)]')}>{children}</span>
);

export const Callout: React.FC<{ tone: 'block' | 'warn' | 'info'; title?: string; children: React.ReactNode }> = ({ tone, title, children }) => (
  <div className={cx('px-3 py-2.5 border-l-2 font-sans text-[13px] leading-relaxed',
    tone === 'block' && 'border-[color:var(--de-accent)] bg-[var(--de-accent-soft)]',
    tone === 'warn' && 'border-[color:var(--de-warn)] bg-[var(--de-warn-soft)]',
    tone === 'info' && 'border-[color:var(--de-rule-strong)] bg-[var(--de-sunken)]')}>
    {title && <p className="font-semibold mb-0.5">{title}</p>}
    <div className="text-[color:var(--de-ink-2)]">{children}</div>
  </div>
);

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
      className={cx('de-num w-full px-1.5 py-1 text-[13px] text-right bg-[var(--de-surface)] border text-[color:var(--de-input)] placeholder:text-[color:var(--de-ink-3)]',
        bad || (required && value === null) ? 'border-[color:var(--de-accent)]' : 'border-[color:var(--de-rule)]', className)}
    />
  );
};

export const TextInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }> = ({ className, invalid, ...rest }) => (
  <input
    className={cx('w-full px-2 py-1 font-sans text-[13px] bg-[var(--de-surface)] border text-[color:var(--de-ink)] placeholder:text-[color:var(--de-ink-3)]',
      invalid ? 'border-[color:var(--de-accent)]' : 'border-[color:var(--de-rule)]', className)}
    {...rest}
  />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className, ...rest }) => (
  <select className={cx('px-1.5 py-1 font-sans text-[12px] bg-[var(--de-surface)] border border-[color:var(--de-rule)] text-[color:var(--de-ink)]', className)} {...rest} />
);

export interface StepItem { id: string; label: string; state: 'done' | 'current' | 'open' | 'locked'; note?: string }
/** The four steps and where the deal stands. A locked step says what it is waiting for. */
export const Stepper: React.FC<{ steps: StepItem[]; onGo: (id: string) => void }> = ({ steps, onGo }) => (
  <nav aria-label="Steps" className="flex items-stretch">
    {steps.map((s, i) => {
      const reachable = s.state !== 'locked';
      return (
        <button
          key={s.id}
          type="button"
          disabled={!reachable}
          aria-current={s.state === 'current' ? 'step' : undefined}
          title={s.note}
          onClick={() => reachable && onGo(s.id)}
          className={cx('group flex items-center gap-2 px-3 py-2 font-sans text-[13px] border-b-2 -mb-px',
            s.state === 'current' ? 'border-[color:var(--de-accent)] text-[color:var(--de-ink)] font-semibold' : 'border-transparent',
            s.state === 'done' && 'text-[color:var(--de-ink-2)] hover:text-[color:var(--de-ink)]',
            s.state === 'open' && 'text-[color:var(--de-ink-2)] hover:text-[color:var(--de-ink)]',
            s.state === 'locked' && 'text-[color:var(--de-ink-3)] cursor-not-allowed')}
        >
          <span className={cx('de-num inline-flex items-center justify-center w-5 h-5 text-[11px] border',
            s.state === 'current' && 'bg-[var(--de-accent)] border-[color:var(--de-accent)] text-white',
            s.state === 'done' && 'bg-[var(--de-ink)] border-[color:var(--de-ink)] text-white',
            (s.state === 'open' || s.state === 'locked') && 'border-[color:var(--de-rule)]')}>
            {s.state === 'done' ? '✓' : i + 1}
          </span>
          {s.label}
        </button>
      );
    })}
  </nav>
);

export { cx };
