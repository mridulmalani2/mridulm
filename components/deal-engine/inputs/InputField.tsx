import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import ProvenanceBadge from './ProvenanceBadge';
import { pctToDisplay, displayToPct } from '../../../lib/formatters';
import type { Provenance } from '../../../lib/edgar/types';

interface InputFieldProps {
  label: string;
  path: string;
  value: number | string;
  type?: 'number' | 'text' | 'select';
  options?: { value: string; label: string }[];
  suffix?: string;
  readOnly?: boolean;
  aiToggleable?: boolean;
  min?: number;
  max?: number;
  step?: number;
  warning?: string;
  formatter?: (v: number) => string;
  /** Optional provenance badge (EDGAR/AI/user/default) shown next to the label (Phase 1). */
  provenance?: Provenance;
}

const InputField: React.FC<InputFieldProps> = ({
  label, path, value, type = 'number', options, suffix, readOnly,
  aiToggleable: _aiToggleable, min: _min, max: _max, step: _step, warning, formatter, provenance,
}) => {
  void _aiToggleable; void _min; void _max; void _step;
  const updateField = useDealEngineStore((s) => s.updateField);
  // A factual field the filing lacked: render EMPTY (the neutral placeholder in ModelState is never
  // shown) with a MISSING badge. Editing it flips the source to 'user' (store.updateField), after
  // which it displays normally — the same invariant the assumptions-review Row enforces.
  const isMissing = provenance?.source === 'missing';
  // Percent boundary: store holds decimal fractions (0.3478); a "%"-suffixed number field
  // displays and edits in percent units (34.78). The conversion lives here and in the
  // assumptions-review Row — nowhere else.
  const isPercent = suffix === '%' && type === 'number';
  const toDisplay = (v: number | string): string =>
    isPercent && typeof v === 'number' ? pctToDisplay(v) : String(v);
  const [localVal, setLocalVal] = useState(isMissing ? '' : toDisplay(value));
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (isMissing) { setLocalVal(''); return; }
    // Precision guard: if the text on screen already parses to the store value, leave it
    // alone — resyncing through pctToDisplay's 2dp render would silently truncate what the
    // user typed (e.g. "4.375" → store 0.04375 → snap-back "4.38"). Only external changes
    // (AI-suggest, load, derived recompute) rewrite the field.
    if (type === 'number' && typeof value === 'number') {
      const cur = isPercent ? displayToPct(localVal) : parseFloat(localVal);
      if (cur != null && !isNaN(cur) &&
          Math.abs(cur - value) <= 1e-12 * Math.max(1, Math.abs(value))) return;
    }
    setLocalVal(toDisplay(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isMissing, isPercent]);

  const handleChange = useCallback((newVal: string) => {
    setLocalVal(newVal);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (type !== 'number') { updateField(path, newVal); return; }
      const parsed = isPercent ? displayToPct(newVal) : parseFloat(newVal);
      if (parsed == null || isNaN(parsed)) return;
      updateField(path, parsed);
    }, 400);
  }, [path, type, isPercent, updateField]);

  const displayVal = readOnly && formatter && typeof value === 'number'
    ? formatter(value)
    : undefined;

  const fieldStyle = {
    background: readOnly ? '#F9F9F7' : '#ffffff',
    border: `1px solid ${warning || isMissing ? 'rgba(185,28,28,0.55)' : 'rgba(17,17,17,0.12)'}`,
    color: readOnly ? 'rgba(17,17,17,0.4)' : '#111111',
    fontFamily: "'JetBrains Mono', monospace",
    outline: 'none',
  };

  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between mb-0.5">
        <label className="text-[10px] tracking-wider flex items-center gap-1.5" style={{ color: 'rgba(17,17,17,0.45)', fontFamily: "'JetBrains Mono', monospace" }}>
          {label}
          <ProvenanceBadge provenance={provenance} />
        </label>
        {suffix && (
          <span className="text-[10px]" style={{ color: 'rgba(17,17,17,0.25)', fontFamily: "'JetBrains Mono', monospace" }}>
            {suffix}
          </span>
        )}
      </div>
      {type === 'select' && options ? (
        <select
          value={String(value)}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full px-2 py-1.5 text-xs"
          style={fieldStyle}
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          type={type === 'number' ? 'text' : type}
          value={displayVal ?? localVal}
          onChange={(e) => handleChange(e.target.value)}
          readOnly={readOnly}
          placeholder={isMissing ? '— enter value —' : undefined}
          className="w-full px-2 py-1.5 text-xs"
          style={fieldStyle}
        />
      )}
      {warning && (
        <p className="text-[10px] mt-0.5" style={{ color: '#b91c1c', fontFamily: "'JetBrains Mono', monospace" }}>
          {warning}
        </p>
      )}
    </div>
  );
};

export default InputField;
