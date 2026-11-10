/**
 * v2 input primitives (v2.0.0 "blank until entered").
 *
 * Every field reads the DRAFT (store/engine2Model): an unset number is NaN and renders BLANK
 * with a red edge; an unset choice is listed in `pending` and renders "choose…". A field shows
 * its basis badge once set, and — when the suggestion catalogue holds a proposal for its path —
 * a one-click "use" chip carrying the proposal's basis. Nothing is ever filled in for the
 * analyst; accepting a suggestion is an explicit click.
 *
 * Percent fields cross the display boundary EXACTLY once (fromPctInput / toPctInput).
 */
import React, { useState } from 'react';
import { useEngine2Model } from '../../../store/engine2Model';
import { fromPctInput, num, toPctInput } from '../../../lib/format';
import { setPath } from '../../../lib/engine2/draft';
import type { DealAssumptions } from '../../../lib/engine2/types';
import BasisBadge from './BasisBadge';

export const mono = "'JetBrains Mono', 'SF Mono', Menlo, monospace";
export const labelStyle = { color: 'rgba(17,17,17,0.5)', fontFamily: mono } as const;
const inputBase = { background: '#fff', border: '1px solid rgba(17,17,17,0.14)', color: '#111', fontFamily: mono, outline: 'none' } as const;
const inputBlank = { ...inputBase, border: '1px solid rgba(204,0,0,0.55)', background: 'rgba(204,0,0,0.03)' } as const;

export type Unit = 'pct' | 'money' | 'mult' | 'years' | 'days' | 'beta' | 'ratio';
const SUFFIX: Record<Unit, string> = { pct: '%', money: 'm', mult: 'x', years: 'yrs', days: 'd', beta: 'β', ratio: '' };

export const isSet = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

function show(v: number | null | undefined, unit: Unit): string {
  if (!isSet(v)) return '';
  if (unit === 'pct') return toPctInput(v);
  if (unit === 'years') return String(v);
  if (unit === 'beta' || unit === 'ratio') return num(v, 3);
  return num(v, unit === 'mult' ? 2 : 2);
}

/** Parse a typed value; '' ⇒ NaN (the analyst cleared the field — it is unset again). */
function parse(text: string, unit: Unit): number | null {
  const t = text.trim();
  if (t === '') return Number.NaN;
  if (unit === 'pct') return fromPctInput(t);
  const v = Number(t.replace(/[,\s]/g, '').replace(/[xm%]$/i, ''));
  return Number.isFinite(v) ? v : null;
}

/** Edit ONE path of the draft (the path's basis becomes YOU). */
export function useSetField() {
  const a = useEngine2Model((s) => s.assumptions);
  const edit = useEngine2Model((s) => s.editAssumptions);
  return (path: string, value: unknown, alsoEdited: string[] = []) => {
    if (!a) return;
    edit(setPath<DealAssumptions>(a, path, value), [path, ...alsoEdited]);
  };
}

export const Label: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <span className="text-[10px] tracking-wider uppercase shrink-0" style={labelStyle} title={hint}>{children}</span>
);

/** The one-click suggestion chips for a path (the plain proposal and any variants, e.g. @ai). */
export const SuggestionChips: React.FC<{ path: string; unit?: Unit; render?: (v: unknown) => string }> = ({ path, unit, render }) => {
  const suggestions = useEngine2Model((s) => s.suggestions);
  const accept = useEngine2Model((s) => s.acceptSuggestion);
  const keys = Object.keys(suggestions).filter((k) => k === path || k.startsWith(`${path}@`));
  if (keys.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1 justify-end">
      {keys.map((k) => {
        const s = suggestions[k];
        const text = render
          ? render(s.value)
          : typeof s.value === 'number' && unit
            ? `${show(s.value, unit)}${SUFFIX[unit]}`
            : 'template';
        return (
          <button key={k} type="button" onClick={() => accept(k)} title={s.basis.detail}
            className="px-1.5 py-0.5 text-[9px] tracking-wide"
            style={{ border: '1px dashed rgba(17,17,17,0.3)', color: 'rgba(17,17,17,0.7)', fontFamily: mono, background: 'rgba(17,17,17,0.02)' }}>
            use {text} · {s.basis.kind}
          </button>
        );
      })}
    </span>
  );
};

/** A numeric input that commits on blur/Enter. Blank ⇔ unset. */
export const NumBox: React.FC<{
  value: number | null | undefined;
  unit: Unit;
  onCommit: (v: number) => void;
  width?: string;
  ariaLabel: string;
}> = ({ value, unit, onCommit, width = 'w-20', ariaLabel }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = show(value, unit);
  return (
    <span className="flex items-center gap-0.5">
      <input
        aria-label={ariaLabel}
        value={draft ?? shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null && draft !== shown) {
            const v = parse(draft, unit);
            if (v !== null) onCommit(v);
          }
          setDraft(null);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className={`${width} px-1.5 py-1 text-[11px] text-right`}
        style={isSet(value) ? inputBase : inputBlank}
      />
      <span className="text-[9px] w-4" style={labelStyle}>{SUFFIX[unit]}</span>
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
  const setField = useSetField();
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between gap-2">
        <Label hint={hint}>{label}</Label>
        <span className="flex items-center gap-1.5">
          {basis && isSet(value) && <BasisBadge kind={basis.kind} detail={basis.detail} />}
          <NumBox value={value} unit={unit} ariaLabel={label} onCommit={onCommit ?? ((v) => setField(path, v))} />
        </span>
      </div>
      {!isSet(value) && <div className="mt-0.5"><SuggestionChips path={path} unit={unit} /></div>}
    </div>
  );
};

/** A choice bound to a draft path; pending ⇒ "choose…". */
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
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <Label hint={hint}>{label}</Label>
      <select
        aria-label={label}
        value={pending ? '' : String(value)}
        onChange={(e) => {
          const opt = options.find((o) => String(o.value) === e.target.value);
          if (opt) (onChoose ? onChoose(opt.value) : setField(path, opt.value));
        }}
        className="px-1 py-1 text-[11px]"
        style={pending ? inputBlank : inputBase}
      >
        {pending && <option value="">choose…</option>}
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    </div>
  );
}

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
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <Label hint={hint}>{label}</Label>
        {anyBlank && <SuggestionChips path={path} render={(v) => (Array.isArray(v) && unit === 'pct' ? `${toPctInput(v[0] as number)}% × ${v.length}y` : 'proposal')} />}
      </div>
      <div className="flex gap-1 justify-end flex-wrap">
        {values.map((v, i) => (
          <span key={i} className="flex flex-col items-end">
            <span className="text-[8px]" style={labelStyle}>Y{i + from}</span>
            <NumBox value={v} unit={unit} width="w-14" ariaLabel={`${label} year ${i + from}`}
              onCommit={(x) => {
                const next = [...values];
                next[i] = x;
                if (onCommit) onCommit(next);
                else setField(path, next);
              }} />
          </span>
        ))}
      </div>
    </div>
  );
};

export const Section: React.FC<{ title: string; children: React.ReactNode; note?: string }> = ({ title, children, note }) => (
  <section className="mb-4">
    <h4 className="text-[10px] tracking-[0.2em] uppercase mb-2 pb-1" style={{ ...labelStyle, color: '#111', borderBottom: '1px solid rgba(17,17,17,0.1)' }}>{title}</h4>
    {note && <p className="text-[10px] mb-2" style={labelStyle}>{note}</p>}
    {children}
  </section>
);

export const SmallButton: React.FC<{ onClick: () => void; children: React.ReactNode; danger?: boolean; title?: string }> = ({ onClick, children, danger, title }) => (
  <button type="button" onClick={onClick} title={title}
    className="px-1.5 py-0.5 text-[9px] uppercase tracking-widest"
    style={{ border: `1px solid ${danger ? 'rgba(204,0,0,0.4)' : 'rgba(17,17,17,0.2)'}`, color: danger ? '#CC0000' : 'rgba(17,17,17,0.7)', fontFamily: mono }}>
    {children}
  </button>
);
