import React, { useState } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { ALL_PROVIDERS, PROVIDER_DEFAULTS, PROVIDER_KEY_PAGES, type AIProvider } from '../../../lib/ai2/gateway/providers';
import { Dropdown, Spinner } from '../ui/kit';

/**
 * The optional AI key. `setApiKey` reads the provider from the key's prefix and keeps both in this
 * browser's storage (the one place the store and the AI call read them from). The key goes
 * straight to the provider and nowhere else. The provider can be corrected by hand, because some
 * keys carry no prefix, and the key can be tried with one very small call the analyst asks for.
 */

const providerName = (p: AIProvider) => PROVIDER_DEFAULTS[p]?.displayName.replace(/\s*\(.*\)$/, '') ?? p;
const PROVIDER_OPTIONS = ALL_PROVIDERS.map((p) => ({ value: p, label: providerName(p) }));

const ApiKeyInline: React.FC<{ /** Leave out the line about storage when the surrounding text already says it. */ bare?: boolean }> = ({ bare }) => {
  const apiKey = useDealEngineStore((s) => s.apiKey);
  const aiProvider = useDealEngineStore((s) => s.aiProvider);
  const setApiKey = useDealEngineStore((s) => s.setApiKey);
  const setAiProvider = useDealEngineStore((s) => s.setAiProvider);
  const clearApiKey = useDealEngineStore((s) => s.clearApiKey);
  const [value, setValue] = useState('');
  const [test, setTest] = useState<{ state: 'idle' | 'busy' | 'ok' } | { state: 'failed'; message: string }>({ state: 'idle' });

  const save = () => {
    const k = value.trim();
    if (k) { setApiKey(k); setTest({ state: 'idle' }); }
    setValue('');
  };
  const tryKey = async () => {
    if (!apiKey) return;
    setTest({ state: 'busy' });
    const { testKey } = await import('../../../lib/ai2/textCall');
    const r = await testKey(aiProvider, apiKey);
    setTest(r.ok ? { state: 'ok' } : { state: 'failed', message: r.message });
  };

  return (
    <div>
      {apiKey ? (
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-2 text-[13px]">
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[var(--de-pos)]" />
              Key saved
            </span>
            <Dropdown ariaLabel="AI provider" value={aiProvider} options={PROVIDER_OPTIONS} onChange={(p) => { setAiProvider(p); setTest({ state: 'idle' }); }} align="left" className="!h-8 text-[13px]" />
            <span className="ml-auto flex items-center gap-3 text-[13px]">
              <button type="button" onClick={tryKey} disabled={test.state === 'busy'} className="inline-flex items-center gap-1.5 text-[color:var(--de-ink-2)] underline underline-offset-2 decoration-dotted hover:text-[color:var(--de-ink)] disabled:no-underline">
                {test.state === 'busy' && <Spinner />}{test.state === 'busy' ? 'Trying it' : 'Try the key'}
              </button>
              <button type="button" onClick={() => { clearApiKey(); setTest({ state: 'idle' }); }} className="text-[color:var(--de-ink-2)] underline underline-offset-2 decoration-dotted hover:text-[color:var(--de-ink)]">Remove</button>
            </span>
          </div>
          {test.state === 'ok' && <p role="status" className="mt-2 text-[12px] text-[color:var(--de-pos)]">{providerName(aiProvider)} answered. The key works.</p>}
          {test.state === 'failed' && <p role="status" className="mt-2 text-[12px] text-[color:var(--de-accent)]">{test.message}</p>}
        </div>
      ) : (
        <input
          type="password"
          value={value}
          aria-label="AI key"
          autoComplete="off"
          placeholder="Paste a key: gsk_…  AIza…  sk-ant-…  sk-…"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
          onBlur={save}
          className="de-control w-full px-3 text-[13px]"
        />
      )}
      {!bare && (
        <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--de-ink-3)]">
          Kept only in this browser and sent straight to the provider. A free key is enough: {PROVIDER_KEY_PAGES.groq} or {PROVIDER_KEY_PAGES.google}.
        </p>
      )}
    </div>
  );
};

export default ApiKeyInline;
