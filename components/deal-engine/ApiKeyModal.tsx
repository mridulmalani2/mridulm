import React, { useState } from 'react';
import { useDealEngineStore } from '../../store/dealEngine';

const ApiKeyModal: React.FC = () => {
  const [key, setKey] = useState('');
  const setApiKey = useDealEngineStore((s) => s.setApiKey);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(10,13,19,0.92)' }}>
      <div className="p-6 max-w-md w-full" style={{ background: '#0f1420', border: '1px solid #1e2a3a' }}>
        <h2 className="text-lg font-semibold mb-3" style={{ color: '#e8edf5', fontFamily: 'Inter, sans-serif' }}>
          Anthropic API Key
        </h2>
        <p className="text-xs mb-4" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>
          Your key is used directly and never stored server-side.
        </p>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full px-3 py-2 text-sm mb-4 outline-none"
          style={{
            background: '#0a0d13',
            border: '1px solid #1e2a3a',
            color: '#e8edf5',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' && key.trim()) setApiKey(key.trim()); }}
        />
        <button
          onClick={() => { if (key.trim()) setApiKey(key.trim()); }}
          disabled={!key.trim()}
          className="w-full py-2 text-sm font-medium transition-colors"
          style={{
            background: key.trim() ? '#00d4ff' : '#1e2a3a',
            color: key.trim() ? '#0a0d13' : '#6b7a96',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          Connect
        </button>
      </div>
    </div>
  );
};

export default ApiKeyModal;
