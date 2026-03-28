import React, { useState, useRef, useEffect } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import type { ChatMessage, AIAnalysis } from '../../../lib/dealEngineTypes';

// ── Web Speech API type shims (not in default TS lib) ──────────────────
interface SpeechRecognitionResultItem { readonly transcript: string; }
interface SpeechRecognitionResult { readonly length: number; [index: number]: SpeechRecognitionResultItem; }
interface SpeechRecognitionResultList { readonly length: number; [index: number]: SpeechRecognitionResult; }
interface SpeechRecognitionEvent extends Event { readonly results: SpeechRecognitionResultList; }
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

// ── SVG icons ──────────────────────────────────────────────────────────

const MicIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" fill={active ? 'currentColor' : 'none'} />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
  </svg>
);

const SpeakerIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill={active ? 'currentColor' : 'none'} />
    {active
      ? <><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></>
      : <line x1="23" y1="9" x2="17" y2="15" />
    }
  </svg>
);

// ── Sub-components ─────────────────────────────────────────────────────

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
    {(analysis.improvement_levers?.length ?? 0) > 0 && (
      <div>
        <span style={{ color: '#15803d', fontFamily: "'JetBrains Mono', monospace" }}>Levers: </span>
        <span style={{ color: '#111111' }}>{analysis.improvement_levers?.join('; ')}</span>
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

// ── Get browser Speech APIs ────────────────────────────────────────────

function getSpeechRecognitionClass(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w['SpeechRecognition'] as (new () => SpeechRecognition) | undefined) ||
         (w['webkitSpeechRecognition'] as (new () => SpeechRecognition) | undefined) ||
         null;
}

// ── Main ChatPanel ─────────────────────────────────────────────────────

const ChatPanel: React.FC = () => {
  const chatHistory = useDealEngineStore((s) => s.chatHistory);
  const sendChatMessage = useDealEngineStore((s) => s.sendChatMessage);
  const isCalculating = useDealEngineStore((s) => s.isCalculating);
  const apiKey = useDealEngineStore((s) => s.apiKey);
  const error = useDealEngineStore((s) => s.error);

  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [triggerVoiceSend, setTriggerVoiceSend] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const prevHistoryLenRef = useRef(chatHistory.length);

  const voiceSupported = !!getSpeechRecognitionClass();
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatHistory]);

  // Auto-speak new AI responses
  useEffect(() => {
    const newLen = chatHistory.length;
    const prevLen = prevHistoryLenRef.current;
    prevHistoryLenRef.current = newLen;
    if (!autoSpeak || !ttsSupported || newLen <= prevLen) return;
    const last = chatHistory[newLen - 1];
    if (last?.role === 'assistant' && last.content) {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(last.content);
      utt.rate = 1.05;
      window.speechSynthesis.speak(utt);
    }
  }, [chatHistory, autoSpeak, ttsSupported]);

  // Handle auto-send after voice recognition ends
  useEffect(() => {
    if (!triggerVoiceSend) return;
    setTriggerVoiceSend(false);
    const trimmed = input.trim();
    if (trimmed && !isCalculating && apiKey) {
      setInput('');
      sendChatMessage(trimmed);
    }
  }, [triggerVoiceSend, input, isCalculating, apiKey, sendChatMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isCalculating || !apiKey) return;
    setInput('');
    sendChatMessage(trimmed);
  };

  const startListening = () => {
    const SpeechRec = getSpeechRecognitionClass();
    if (!SpeechRec || !apiKey) return;

    const rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    rec.onerror = () => setIsListening(false);

    rec.onend = () => {
      setIsListening(false);
      setTriggerVoiceSend(true);
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setIsListening(true);
      setInput('');
    } catch {
      setIsListening(false);
    }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const toggleAutoSpeak = () => {
    if (autoSpeak) window.speechSynthesis?.cancel();
    setAutoSpeak((v) => !v);
  };

  const suggestions = [
    'What drives the IRR here?',
    'Stress test leverage at 7x',
    'Compare to a secondary buyout exit',
    'How fragile is this deal?',
  ];

  return (
    <div className="flex flex-col h-full" style={{ borderLeft: '1px solid rgba(17,17,17,0.1)', background: '#F9F9F7' }}>

      {/* ── Header ── */}
      <div
        className="px-4 py-2.5 flex-shrink-0 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(17,17,17,0.1)', background: '#ffffff' }}
      >
        <span
          className="text-[10px] font-medium tracking-widest uppercase"
          style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}
        >
          AI Chat
        </span>
        {ttsSupported && (
          <button
            onClick={toggleAutoSpeak}
            className="flex items-center gap-1.5 px-2 py-1 text-[9px] tracking-wider uppercase transition-all"
            style={{
              color: autoSpeak ? '#CC0000' : 'rgba(17,17,17,0.3)',
              border: `1px solid ${autoSpeak ? 'rgba(204,0,0,0.25)' : 'rgba(17,17,17,0.1)'}`,
              fontFamily: "'JetBrains Mono', monospace",
              background: 'transparent',
            }}
            title={autoSpeak ? 'Voice responses on — click to mute' : 'Enable voice responses'}
          >
            <SpeakerIcon active={autoSpeak} />
            <span>{autoSpeak ? 'Voice On' : 'Voice Off'}</span>
          </button>
        )}
      </div>

      {/* ── Messages ── */}
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
                    onClick={() => setInput(s)}
                    className="w-full text-left px-3 py-2 text-xs transition-colors hover:border-[rgba(17,17,17,0.2)]"
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

      {/* ── Listening indicator ── */}
      {isListening && (
        <div
          className="flex-shrink-0 px-3 py-1.5 flex items-center gap-2"
          style={{ background: '#fff5f5', borderTop: '1px solid rgba(204,0,0,0.15)' }}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#CC0000' }} />
          <span className="text-[10px] tracking-widest uppercase" style={{ color: '#CC0000', fontFamily: "'JetBrains Mono', monospace" }}>
            Listening — speak now
          </span>
          <button
            onClick={stopListening}
            className="ml-auto text-[10px] tracking-widest uppercase"
            style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="px-3 py-1.5 flex-shrink-0" style={{ background: '#fff5f5', borderTop: '1px solid rgba(185,28,28,0.2)' }}>
          <p className="text-[10px]" style={{ color: '#b91c1c', fontFamily: "'JetBrains Mono', monospace" }}>{error}</p>
        </div>
      )}

      {/* ── Input row ── */}
      <div className="flex-shrink-0 p-2.5" style={{ borderTop: '1px solid rgba(17,17,17,0.1)', background: '#ffffff' }}>
        <div className="flex gap-1.5">
          {/* Mic button */}
          {voiceSupported && apiKey && (
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={isCalculating}
              className="flex items-center justify-center px-2 py-1.5 transition-all flex-shrink-0"
              style={{
                background: isListening ? '#CC0000' : 'rgba(17,17,17,0.04)',
                color: isListening ? '#ffffff' : 'rgba(17,17,17,0.45)',
                border: `1px solid ${isListening ? '#CC0000' : 'rgba(17,17,17,0.12)'}`,
                minWidth: 32,
              }}
              title={isListening ? 'Stop recording' : 'Voice input — speak your question'}
            >
              <MicIcon active={isListening} />
            </button>
          )}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
            placeholder={
              isListening
                ? 'Listening...'
                : apiKey
                ? 'Ask about this deal...'
                : 'Set API key first'
            }
            disabled={!apiKey}
            className="flex-1 px-2.5 py-1.5 text-xs outline-none"
            style={{
              background: isListening ? '#fff8f8' : '#F9F9F7',
              border: `1px solid ${isListening ? 'rgba(204,0,0,0.2)' : 'rgba(17,17,17,0.12)'}`,
              color: '#111111',
              fontFamily: 'Lora, serif',
              fontSize: 12,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isCalculating || !apiKey}
            className="px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase transition-colors flex-shrink-0"
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
        {voiceSupported && apiKey && (
          <p className="mt-1.5 text-[9px] text-center" style={{ color: 'rgba(17,17,17,0.25)', fontFamily: "'JetBrains Mono', monospace" }}>
            Mic sends automatically when you stop speaking
          </p>
        )}
      </div>
    </div>
  );
};

export default ChatPanel;
