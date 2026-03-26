import React, { useState } from 'react';
import { useDealEngineStore } from '../../store/dealEngine';

const ApiKeyModal: React.FC = () => {
  const [key, setKey] = useState('');
  const setApiKey = useDealEngineStore((s) => s.setApiKey);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(249,249,247,0.92)' }}>
      <div className="p-8 max-w-md w-full" style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}>
        <div className="border-t-[2px] border-[#111] mb-5" />
        <h2 className="font-playfair text-2xl font-bold mb-2" style={{ color: '#111111' }}>
          Anthropic API Key
        </h2>
        <p className="mb-5" style={{ color: 'rgba(17,17,17,0.5)', fontFamily: 'Lora, serif', fontSize: 13, lineHeight: '1.6' }}>
          Your key is used directly and never stored server-side.
        </p>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full px-3 py-2 text-sm mb-4 outline-none"
          style={{
            background: '#F9F9F7',
            border: '1px solid rgba(17,17,17,0.15)',
            color: '#111111',
            fontFamily: "'JetBrains Mono', monospace",
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' && key.trim()) setApiKey(key.trim()); }}
        />
        <button
          onClick={() => { if (key.trim()) setApiKey(key.trim()); }}
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
