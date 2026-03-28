import React, { useState } from 'react';
import { useDealEngineStore } from '../../store/dealEngine';
import { ALL_PROVIDERS, PROVIDER_DEFAULTS, PROVIDER_KEY_HINTS, detectProvider } from '../../lib/engine/ai/providers';
import type { AIProvider } from '../../lib/engine/ai/providers';

const ApiKeyModal: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [key, setKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('anthropic');
  const setProviderAndKey = useDealEngineStore((s) => s.setProviderAndKey);

  const handleKeyChange = (value: string) => {
    setKey(value);
    if (value.length > 3) {
      const detected = detectProvider(value);
      setSelectedProvider(detected);
    }
  };

  const handleConnect = () => {
    if (key.trim()) {
      setProviderAndKey(selectedProvider, key.trim());
    }
  };

  const hint = PROVIDER_KEY_HINTS[selectedProvider];

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(249,249,247,0.92)' }}
      onClick={onClose}
    >
      <div
        className="p-8 max-w-md w-full relative"
        style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-[11px] transition-colors hover:text-[#111]"
            style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace" }}
            aria-label="Close"
          >
            ✕
          </button>
        )}
        <div className="border-t-[2px] border-[#111] mb-5" />
        <h2 className="font-playfair text-2xl font-bold mb-2" style={{ color: '#111111' }}>
          Connect AI Provider
        </h2>
        <p className="mb-4" style={{ color: 'rgba(17,17,17,0.5)', fontFamily: 'Lora, serif', fontSize: 13, lineHeight: '1.6' }}>
          Your key is used directly and never stored server-side.
        </p>

        {/* Provider selector */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {ALL_PROVIDERS.map((p) => (
            <button
              key={p}
              onClick={() => setSelectedProvider(p)}
              className="px-3 py-1.5 text-[10px] font-medium tracking-wider uppercase transition-colors"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                background: selectedProvider === p ? '#CC0000' : '#F9F9F7',
                color: selectedProvider === p ? '#ffffff' : 'rgba(17,17,17,0.5)',
                border: selectedProvider === p
                  ? '1px solid #CC0000'
                  : '1px solid rgba(17,17,17,0.12)',
              }}
            >
              {PROVIDER_DEFAULTS[p].displayName}
            </button>
          ))}
        </div>

        <input
          type="password"
          value={key}
          onChange={(e) => handleKeyChange(e.target.value)}
          placeholder={hint.placeholder}
          className="w-full px-3 py-2 text-sm mb-4 outline-none"
          style={{
            background: '#F9F9F7',
            border: '1px solid rgba(17,17,17,0.15)',
            color: '#111111',
            fontFamily: "'JetBrains Mono', monospace",
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' && key.trim()) handleConnect(); }}
        />
        <button
          onClick={handleConnect}
          disabled={!key.trim()}
          className="w-full py-2.5 text-sm font-medium tracking-widest uppercase transition-colors"
          style={{
            background: key.trim() ? '#CC0000' : 'rgba(17,17,17,0.05)',
            color: key.trim() ? '#ffffff' : 'rgba(17,17,17,0.3)',
            fontFamily: "'JetBrains Mono', monospace",
            border: key.trim() ? '1px solid #CC0000' : '1px solid rgba(17,17,17,0.1)',
          }}
        >
          Connect
        </button>
      </div>
    </div>
  );
};

export default ApiKeyModal;
