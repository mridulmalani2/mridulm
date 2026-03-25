import React, { useState, useRef, useEffect } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import type { ChatMessage, AIAnalysis } from '../../../lib/dealEngineTypes';

const AnalysisCard: React.FC<{ analysis: AIAnalysis }> = ({ analysis }) => (
  <div className="mt-2 p-2 text-xs space-y-1.5" style={{ background: '#0a0d13', border: '1px solid #1e2a3a' }}>
    {analysis.primary_driver && (
      <div>
        <span style={{ color: '#00d4ff', fontFamily: "'IBM Plex Mono', monospace" }}>Primary Driver: </span>
        <span style={{ color: '#e8edf5' }}>{analysis.primary_driver}</span>
      </div>
    )}
    {analysis.risk_concentration && (
      <div>
        <span style={{ color: '#ffaa00', fontFamily: "'IBM Plex Mono', monospace" }}>Risk: </span>
        <span style={{ color: '#e8edf5' }}>{analysis.risk_concentration}</span>
      </div>
    )}
    {analysis.fragility_test && (
      <div>
        <span style={{ color: '#ff4757', fontFamily: "'IBM Plex Mono', monospace" }}>Fragility: </span>
        <span style={{ color: '#e8edf5' }}>{analysis.fragility_test}</span>
      </div>
    )}
    {analysis.improvement_levers?.length > 0 && (
      <div>
        <span style={{ color: '#00c896', fontFamily: "'IBM Plex Mono', monospace" }}>Levers: </span>
        <span style={{ color: '#e8edf5' }}>{analysis.improvement_levers.join('; ')}</span>
      </div>
    )}
  </div>
);

const DiffBadges: React.FC<{ updates: Record<string, unknown> }> = ({ updates }) => (
  <div className="flex flex-wrap gap-1 mt-1.5">
    {Object.entries(updates).map(([field, val]) => (
      <span
        key={field}
        className="text-xs px-1.5 py-0.5"
        style={{ background: '#1e2a3a', color: '#00d4ff', fontFamily: "'IBM Plex Mono', monospace" }}
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
        className="max-w-[85%] px-3 py-2"
        style={{
          background: isUser ? '#1a2740' : '#0f1420',
          border: `1px solid ${isUser ? '#1e2a3a' : '#1e2a3a'}`,
          borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        }}
      >
        <p className="text-xs whitespace-pre-wrap" style={{ color: '#e8edf5', fontFamily: 'Inter, sans-serif', lineHeight: '1.6' }}>
          {msg.content}
        </p>
        {msg.assumption_updates && Object.keys(msg.assumption_updates).length > 0 && (
          <DiffBadges updates={msg.assumption_updates} />
        )}
        {msg.analysis && <AnalysisCard analysis={msg.analysis} />}
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
    <div className="flex flex-col h-full" style={{ borderLeft: '1px solid #1e2a3a' }}>
      {/* Header */}
      <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #1e2a3a' }}>
        <span className="text-xs font-medium tracking-widest uppercase" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>
          AI Chat
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {chatHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <p className="text-xs mb-4 text-center" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>
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
                    className="w-full text-left px-2.5 py-1.5 text-xs transition-colors hover:bg-[#1e2a3a]"
                    style={{ color: '#6b7a96', border: '1px solid #1e2a3a', fontFamily: 'Inter, sans-serif' }}
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
            <div className="px-3 py-2" style={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: '12px 12px 12px 2px' }}>
              <span className="text-xs animate-pulse" style={{ color: '#00d4ff', fontFamily: "'IBM Plex Mono', monospace" }}>
                Thinking...
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-1.5 flex-shrink-0" style={{ background: '#1a0a0a', borderTop: '1px solid #3a1e1e' }}>
          <p className="text-xs" style={{ color: '#ff4757', fontFamily: 'Inter, sans-serif' }}>{error}</p>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 p-2" style={{ borderTop: '1px solid #1e2a3a' }}>
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
              background: '#0a0d13',
              border: '1px solid #1e2a3a',
              color: '#e8edf5',
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isCalculating || !apiKey}
            className="px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: input.trim() && apiKey ? '#00d4ff' : '#1e2a3a',
              color: input.trim() && apiKey ? '#0a0d13' : '#6b7a96',
              fontFamily: 'Inter, sans-serif',
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
