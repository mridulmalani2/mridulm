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
  aiToggleable: _aiToggleable, min: _min, max: _max, step: _step, warning, formatter,
}) => {
  void _aiToggleable; void _min; void _max; void _step;
  const updateField = useDealEngineStore((s) => s.updateField);
  const [localVal, setLocalVal] = useState(String(value));
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  const fieldStyle = {
    background: readOnly ? '#F9F9F7' : '#ffffff',
    border: `1px solid ${warning ? '#b91c1c' : 'rgba(17,17,17,0.12)'}`,
    color: readOnly ? 'rgba(17,17,17,0.4)' : '#111111',
    fontFamily: "'JetBrains Mono', monospace",
    outline: 'none',
  };

  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between mb-0.5">
        <label className="text-[10px] tracking-wider" style={{ color: 'rgba(17,17,17,0.45)', fontFamily: "'JetBrains Mono', monospace" }}>
          {label}
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
