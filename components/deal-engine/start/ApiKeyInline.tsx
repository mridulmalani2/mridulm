import React, { useState } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { PROVIDER_DEFAULTS } from '../../../lib/ai2/gateway/providers';

/**
 * Compact, optional API-key entry for the start screens (Phase 1). The AI-suggest step on the
 * assumptions review reuses the saved provider/key, so capturing it here lets a user set it up
 * front. `setApiKey` auto-detects the provider from the key prefix and persists to localStorage
 * (the single source of truth the store + AI gateway both read), so frontend and the gateway
 * stay in sync. Keys live only in the browser and go straight to the chosen provider.
 */

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
    <div className="mt-3">
      {apiKey && !editing ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-[color:var(--de-pos)]">Key saved for {providerName}</span>
          <button type="button" onClick={() => { clearApiKey(); setEditing(true); }}
            className="text-[13px] text-[color:var(--de-ink-2)] underline underline-offset-2 decoration-dotted hover:text-[color:var(--de-ink)]">
            Change
          </button>
        </div>
      ) : (
        <input
          type="password"
          value={value}
          aria-label="AI key"
          placeholder="Paste a key: gsk_…  sk-ant-…  sk-…  AIza…"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
          onBlur={save}
          className="de-control w-full px-3 text-[13px]"
        />
      )}
      <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--de-ink-3)]">
        Stored only in your browser and sent directly to the provider. A free Groq key is available at console.groq.com/keys.
      </p>
    </div>
  );
};

export default ApiKeyInline;
