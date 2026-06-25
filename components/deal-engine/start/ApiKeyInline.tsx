import React, { useState } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { PROVIDER_DEFAULTS } from '../../../lib/engine/ai/providers';

/**
 * Compact, optional API-key entry for the start screens (Phase 1). The AI-suggest step on the
 * assumptions review reuses the saved provider/key, so capturing it here lets a user set it up
 * front. `setApiKey` auto-detects the provider from the key prefix and persists to localStorage
 * (the single source of truth the store + AI gateway both read), so frontend and the gateway
 * stay in sync. Keys live only in the browser and go straight to the chosen provider.
 */

const mono = "'JetBrains Mono', monospace";

const ApiKeyInline: React.FC = () => {
  const apiKey = useDealEngineStore((s) => s.apiKey);
  const aiProvider = useDealEngineStore((s) => s.aiProvider);
  const setApiKey = useDealEngineStore((s) => s.setApiKey);
  const clearApiKey = useDealEngineStore((s) => s.clearApiKey);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  const save = () => {
    const k = value.trim();
    if (k) setApiKey(k);
    setValue('');
    setEditing(false);
  };

  const providerName = apiKey ? (PROVIDER_DEFAULTS[aiProvider]?.displayName ?? aiProvider) : null;

  return (
    <div className="mt-6 pt-5" style={{ borderTop: '1px solid rgba(17,17,17,0.08)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] tracking-widest uppercase" style={{ color: apiKey ? '#15803d' : 'rgba(17,17,17,0.4)', fontFamily: mono }}>
          {apiKey ? `AI Key ✓ ${providerName}` : 'AI Key'}
          <span className="ml-1.5 text-[9px]" style={{ color: 'rgba(17,17,17,0.3)' }}>optional · for AI-suggested assumptions</span>
        </span>
        {apiKey && !editing && (
          <button type="button" onClick={() => { clearApiKey(); setEditing(true); }}
            className="text-[10px] tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: mono, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Change
          </button>
        )}
      </div>
      {(!apiKey || editing) && (
        <div className="flex gap-2">
          <input
            type="password"
            value={value}
            placeholder="gsk_… · sk-ant-… · sk-… · AIza…"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
            onBlur={save}
            className="flex-1 px-2.5 py-1.5 text-xs outline-none"
            style={{ background: '#fff', border: '1px solid rgba(17,17,17,0.12)', color: '#111', fontFamily: mono }}
          />
        </div>
      )}
      <p className="mt-1.5 text-[9px]" style={{ color: 'rgba(17,17,17,0.3)', fontFamily: mono, lineHeight: 1.6 }}>
        Stored only in your browser; sent directly to the provider. Free Groq key at console.groq.com/keys.
      </p>
    </div>
  );
};

export default ApiKeyInline;
