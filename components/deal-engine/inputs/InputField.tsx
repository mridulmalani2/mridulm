import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';

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
}

const InputField: React.FC<InputFieldProps> = ({
  label, path, value, type = 'number', options, suffix, readOnly,
  aiToggleable, min, max, step, warning, formatter,
}) => {
  const updateField = useDealEngineStore((s) => s.updateField);
  const [localVal, setLocalVal] = useState(String(value));
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setLocalVal(String(value));
  }, [value]);

  const handleChange = useCallback((newVal: string) => {
    setLocalVal(newVal);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const parsed = type === 'number' ? parseFloat(newVal) : newVal;
      if (type === 'number' && isNaN(parsed as number)) return;
      updateField(path, parsed);
    }, 400);
  }, [path, type, updateField]);

  const displayVal = readOnly && formatter && typeof value === 'number'
    ? formatter(value)
    : undefined;

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between mb-0.5">
        <label className="text-xs" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>
          {label}
        </label>
        {suffix && (
          <span className="text-xs" style={{ color: '#3d4f6a', fontFamily: "'IBM Plex Mono', monospace" }}>
            {suffix}
          </span>
        )}
      </div>
      {type === 'select' && options ? (
        <select
          value={String(value)}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full px-2 py-1.5 text-xs outline-none"
          style={{
            background: '#0a0d13', border: '1px solid #1e2a3a', color: '#e8edf5',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          type={type === 'number' ? 'text' : type}
          value={displayVal ?? localVal}
          onChange={(e) => handleChange(e.target.value)}
          readOnly={readOnly}
          className="w-full px-2 py-1.5 text-xs outline-none"
          style={{
            background: readOnly ? '#080b10' : '#0a0d13',
            border: `1px solid ${warning ? '#ff4757' : '#1e2a3a'}`,
            color: readOnly ? '#6b7a96' : '#e8edf5',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        />
      )}
      {warning && (
        <p className="text-xs mt-0.5" style={{ color: '#ff4757', fontFamily: 'Inter, sans-serif' }}>
          {warning}
        </p>
      )}
    </div>
  );
};

export default InputField;
