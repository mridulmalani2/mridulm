import React, { useState, useRef, useEffect } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import type { ChatMessage, AIAnalysis } from '../../../lib/dealEngineTypes';

const AnalysisCard: React.FC<{ analysis: AIAnalysis }> = ({ analysis }) => (
  <div className="mt-2 p-2.5 text-xs space-y-1.5" style={{ background: '#F9F9F7', border: '1px solid rgba(17,17,17,0.08)' }}>
    {analysis.primary_driver && (
      <div>
        <span style={{ color: '#1d4ed8', fontFamily: "'JetBrains Mono', monospace" }}>Primary Driver: </span>
        <span style={{ color: '#111111' }}>{analysis.primary_driver}</span>
      </div>
    )}
    {analysis.risk_concentration && (
      <div>
        <span style={{ color: '#b45309', fontFamily: "'JetBrains Mono', monospace" }}>Risk: </span>
        <span style={{ color: '#111111' }}>{analysis.risk_concentration}</span>
      </div>
    )}
    {analysis.fragility_test && (
      <div>
        <span style={{ color: '#b91c1c', fontFamily: "'JetBrains Mono', monospace" }}>Fragility: </span>
        <span style={{ color: '#111111' }}>{analysis.fragility_test}</span>
      </div>
    )}
    {analysis.improvement_levers?.length > 0 && (
      <div>
        <span style={{ color: '#15803d', fontFamily: "'JetBrains Mono', monospace" }}>Levers: </span>
        <span style={{ color: '#111111' }}>{analysis.improvement_levers.join('; ')}</span>
      </div>
    )}
  </div>
);

const DiffBadges: React.FC<{ updates: Record<string, unknown> }> = ({ updates }) => (
  <div className="flex flex-wrap gap-1 mt-1.5">
    {Object.entries(updates).map(([field, val]) => (
      <span
        key={field}
        className="text-[10px] px-1.5 py-0.5"
        style={{ background: '#eff6ff', color: '#1d4ed8', fontFamily: "'JetBrains Mono', monospace", border: '1px solid rgba(29,78,216,0.2)' }}
      >
        {field.split('.').pop()}: {String(val)}
      </span>
    ))}
  </div>
);

const MessageBubble: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className="max-w-[88%] px-3 py-2.5"
        style={{
          background: isUser ? '#eff6ff' : '#ffffff',
          border: `1px solid ${isUser ? 'rgba(29,78,216,0.15)' : 'rgba(17,17,17,0.1)'}`,
          borderRadius: isUser ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
        }}
      >
        <p className="text-xs whitespace-pre-wrap" style={{ color: '#111111', fontFamily: 'Lora, serif', lineHeight: '1.65', fontSize: 12 }}>
          {msg.content}
        </p>
        {msg.assumption_updates && Object.keys(msg.assumption_updates).length > 0 && (
          <DiffBadges updates={msg.assumption_updates} />
        )}
        {msg.analysis && (msg.analysis.primary_driver || msg.analysis.risk_concentration || msg.analysis.fragility_test || (msg.analysis.improvement_levers?.length ?? 0) > 0) && (
          <AnalysisCard analysis={msg.analysis} />
        )}
      </div>
    </div>
  );
};

const ChatPanel: React.FC = () => {
  const chatHistory = useDealEngineStore((s) => s.chatHistory);
  const sendChatMessage = useDealEngineStore((s) => s.sendChatMessage);
  const isCalculating = useDealEngineStore((s) => s.isCalculating);
  const apiKey = useDealEngineStore((s) => s.apiKey);
  const error = useDealEngineStore((s) => s.error);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatHistory]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isCalculating) return;
    setInput('');
    sendChatMessage(trimmed);
  };

  const suggestions = [
    'What drives the IRR here?',
    'Stress test leverage at 7x',
    'Compare to a secondary buyout exit',
    'How fragile is this deal?',
  ];

  return (
    <div className="flex flex-col h-full" style={{ borderLeft: '1px solid rgba(17,17,17,0.1)', background: '#F9F9F7' }}>
      {/* Header */}
      <div className="px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(17,17,17,0.1)', background: '#ffffff' }}>
        <span className="text-[10px] font-medium tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
          AI Chat
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {chatHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <p className="text-xs mb-4 text-center" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: 'Lora, serif', lineHeight: '1.6', maxWidth: 220 }}>
              {apiKey
                ? 'Ask the AI to analyse your deal, update assumptions, or stress test scenarios.'
                : 'Set your API key to enable AI chat.'}
            </p>
            {apiKey && (
              <div className="space-y-1.5 w-full max-w-[240px]">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setInput(s); }}
                    className="w-full text-left px-3 py-2 text-xs transition-colors"
                    style={{
                      color: 'rgba(17,17,17,0.5)',
                      border: '1px solid rgba(17,17,17,0.1)',
                      fontFamily: 'Lora, serif',
                      background: '#ffffff',
                      fontSize: 11,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          chatHistory.map((msg, i) => <MessageBubble key={i} msg={msg} />)
        )}
        {isCalculating && chatHistory.length > 0 && (
          <div className="flex justify-start mb-3">
            <div className="px-3 py-2" style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)', borderRadius: '10px 10px 10px 2px' }}>
              <span className="text-[10px] tracking-widest animate-pulse" style={{ color: '#CC0000', fontFamily: "'JetBrains Mono', monospace" }}>
                Thinking...
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-1.5 flex-shrink-0" style={{ background: '#fff5f5', borderTop: '1px solid rgba(185,28,28,0.2)' }}>
          <p className="text-[10px]" style={{ color: '#b91c1c', fontFamily: "'JetBrains Mono', monospace" }}>{error}</p>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 p-2.5" style={{ borderTop: '1px solid rgba(17,17,17,0.1)', background: '#ffffff' }}>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
            placeholder={apiKey ? 'Ask about this deal...' : 'Set API key first'}
            disabled={!apiKey}
            className="flex-1 px-2.5 py-1.5 text-xs outline-none"
            style={{
              background: '#F9F9F7',
              border: '1px solid rgba(17,17,17,0.12)',
              color: '#111111',
              fontFamily: 'Lora, serif',
              fontSize: 12,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isCalculating || !apiKey}
            className="px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase transition-colors"
            style={{
              background: input.trim() && apiKey ? '#CC0000' : 'rgba(17,17,17,0.05)',
              color: input.trim() && apiKey ? '#ffffff' : 'rgba(17,17,17,0.3)',
              fontFamily: "'JetBrains Mono', monospace",
              border: input.trim() && apiKey ? '1px solid #CC0000' : '1px solid rgba(17,17,17,0.1)',
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
