import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDealEngineStore } from '../store/dealEngine';
import { getInputTemplate, getAiPrompt } from '../lib/importTemplate';
import Header from '../components/deal-engine/layout/Header';
import InputPanel from '../components/deal-engine/inputs/InputPanel';
import ReturnsSummary from '../components/deal-engine/outputs/ReturnsSummary';
import ValueBridge from '../components/deal-engine/outputs/ValueBridge';
import DebtScheduleTable from '../components/deal-engine/outputs/DebtScheduleTable';
import SensitivityHeatmap from '../components/deal-engine/outputs/SensitivityHeatmap';
import ScenarioPanel from '../components/deal-engine/outputs/ScenarioPanel';
import ExitRealityCheck from '../components/deal-engine/outputs/ExitRealityCheck';
import SourcesUsesTable from '../components/deal-engine/outputs/SourcesUsesTable';
import CreditPanel from '../components/deal-engine/outputs/CreditPanel';
import EBITDABridgeChart from '../components/deal-engine/outputs/EBITDABridgeChart';
import FragilityPanel from '../components/deal-engine/outputs/FragilityPanel';
import ChatPanel from '../components/deal-engine/chat/ChatPanel';
import ApiKeyModal from '../components/deal-engine/ApiKeyModal';

const INIT_DEFAULTS = {
  deal_name: 'New Deal',
  revenue: 100,
  ebitda_or_margin: 0.25,
  entry_multiple: 10,
  currency: 'INR',
  sector: 'Technology',
  _ebitdaMarginInput: undefined as string | undefined,
  _entryMultipleInput: undefined as string | undefined,
};

// Sector comps data — median EV/EBITDA multiples from precedent PE transactions
const SECTOR_COMPS: Record<string, { low: number; median: number; high: number }> = {
  Technology:            { low: 9.0, median: 12.0, high: 18.0 },
  Healthcare:            { low: 8.0, median: 11.0, high: 16.0 },
  Industrials:           { low: 6.0, median: 8.0,  high: 11.0 },
  Consumer:              { low: 7.0, median: 9.5,  high: 13.0 },
  'Financial Services':  { low: 7.0, median: 10.0, high: 14.0 },
  'Real Estate':         { low: 10.0, median: 14.0, high: 20.0 },
  Energy:                { low: 5.0, median: 7.0,  high: 10.0 },
  'Business Services':   { low: 8.0, median: 10.5, high: 14.0 },
  Other:                 { low: 7.0, median: 9.0,  high: 13.0 },
};

const inputStyle = {
  background: '#ffffff',
  border: '1px solid rgba(17,17,17,0.15)',
  color: '#111111',
  fontFamily: "'JetBrains Mono', monospace",
  outline: 'none',
};

const monoLabel = {
  color: 'rgba(17,17,17,0.4)',
  fontFamily: "'JetBrains Mono', monospace",
};

const STEPS: { n: string; title: string; body: React.ReactNode }[] = [
  {
    n: '01',
    title: 'Initialize',
    body: 'Enter company name, revenue, EBITDA margin, entry multiple, currency, and sector. The engine builds a full leveraged buyout model — debt schedule, return attribution, sensitivity tables.',
  },
  {
    n: '02',
    title: 'Edit Assumptions',
    body: 'A detailed panel lets you adjust every lever — year-by-year revenue growth, margins, leverage, exit multiple — with instant recalculation on every change.',
  },
  {
    n: '03',
    title: 'AI Chat',
    body: (
      <>
        Connected to the live model. Say{' '}
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'rgba(17,17,17,0.65)' }}>"make revenue growth more conservative"</span>
        {' '}and watch it recalculate. Ask it to explain what drives returns, flag risks, or walk through any assumption. Free key at{' '}
        <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" style={{ color: '#CC0000', textDecoration: 'none' }}>console.groq.com/keys</a>
        {' '}— generated in under 60 seconds.
      </>
    ),
  },
  {
    n: '04',
    title: 'Export',
    body: 'Download your calibrated model as a formatted Excel file — ready to share or continue offline.',
  },
];

const SuggestionsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div
    className="fixed inset-0 z-[300] flex items-center justify-center"
    style={{ background: 'rgba(249,249,247,0.94)' }}
    onClick={onClose}
  >
    <div
      className="p-8 max-w-md w-full mx-4 relative"
      style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-[11px] transition-colors hover:text-[#111]"
        style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace" }}
        aria-label="Close"
      >
        ✕
      </button>
      <div className="border-t-[2px] border-[#111] mb-5" />
      <h2 className="font-playfair text-2xl font-bold mb-4" style={{ color: '#111111' }}>
        Suggestions
      </h2>
      <p style={{ color: 'rgba(17,17,17,0.6)', fontFamily: 'Lora, serif', fontSize: 13, lineHeight: 1.85 }}>
        Anyone with suggestions or improvements, please feel free to reach out at{' '}
        <a
          href="mailto:mridul.malani@alumni.ashoka.edu.in"
          style={{ color: '#CC0000', textDecoration: 'none' }}
        >
          mridul.malani@alumni.ashoka.edu.in
        </a>
        . If there are any specific assumptions or levers you want added, or if you find faults or scopes for improvement, I am very open to suggestions.
      </p>
    </div>
  </div>
);

const InitializeForm: React.FC = () => {
  const initializeModel = useDealEngineStore((s) => s.initializeModel);
  const isCalculating = useDealEngineStore((s) => s.isCalculating);
  const error = useDealEngineStore((s) => s.error);
  const storedApiKey = useDealEngineStore((s) => s.apiKey);
  const clearApiKey = useDealEngineStore((s) => s.clearApiKey);
  const [form, setForm] = useState(INIT_DEFAULTS);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiInfo, setShowApiInfo] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAiImport, setShowAiImport] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(getAiPrompt()).then(() => {
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    });
  };

  const handleDownloadTemplate = () => {
    const json = JSON.stringify(getInputTemplate(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'deal-engine-template.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    initializeModel({
      ...form,
      apiKey: apiKeyInput.trim() || undefined,
    });
  };

  const effectiveKey = apiKeyInput.trim() || storedApiKey;

  return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: '#F9F9F7' }}>
      {/* Subtle paper texture */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='0.5' fill='%23111111'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
        }}
      />

      {showSuggestions && <SuggestionsModal onClose={() => setShowSuggestions(false)} />}

      {/* Two-column layout: stacked on mobile, side-by-side on lg+ */}
      <div className="relative z-10 w-full max-w-5xl mx-auto px-6 lg:px-8 py-10 lg:py-0 flex flex-col lg:flex-row lg:items-center gap-8 lg:gap-16">

        {/* ── Left: editorial explanation — below form on mobile ──────── */}
        <div className="flex-1 order-2 lg:order-1 pb-8 lg:py-12">
          {/* Back link */}
          <div className="mb-5">
            <Link
              to="/"
              className="text-[10px] tracking-widest uppercase transition-colors hover:text-[#111]"
              style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace", textDecoration: 'none' }}
            >
              ← mridulmalani.com
            </Link>
          </div>

          <div className="border-t-[3px] border-[#111] mb-6" />
          <h1 className="font-playfair text-4xl lg:text-5xl font-bold mb-3" style={{ color: '#111111' }}>
            Deal Engine
          </h1>
          <p className="mb-8 lg:mb-10" style={{ color: 'rgba(17,17,17,0.5)', fontFamily: 'Lora, serif', fontSize: 14, lineHeight: 1.8, maxWidth: 360 }}>
            A live LBO model with AI reasoning built in. Enter your deal, interrogate every assumption, and let the AI re-calibrate the numbers in plain English.
          </p>

          <div className="space-y-5 lg:space-y-6">
            {STEPS.map(({ n, title, body }) => (
              <div key={n} className="flex gap-5">
                <span
                  className="flex-shrink-0 pt-0.5"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#CC0000', letterSpacing: '0.12em', width: 20 }}
                >
                  {n}
                </span>
                <div>
                  <div className="mb-1 text-[10px] tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {title}
                  </div>
                  <p style={{ color: 'rgba(17,17,17,0.55)', fontFamily: 'Lora, serif', fontSize: 13, lineHeight: 1.72 }}>
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: form card — on top on mobile ──────────────────────── */}
        <div className="flex-shrink-0 w-full order-1 lg:order-2 lg:w-[390px]">
          <form
            onSubmit={handleSubmit}
            className="p-6 lg:p-8"
            style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}
          >
            <div className="border-t-[2px] border-[#111] mb-5" />
            <p className="mb-5 text-[10px] tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace" }}>
              Initialize Model
            </p>

            {/* Company Name */}
            <label className="block mb-4">
              <span className="block mb-1 text-[10px] tracking-widest uppercase" style={monoLabel}>Company Name</span>
              <input
                type="text"
                value={form.deal_name}
                onChange={(e) => setForm({ ...form, deal_name: e.target.value })}
                className="w-full px-3 py-2 text-sm"
                style={inputStyle}
              />
            </label>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <label className="block">
                <span className="block mb-1 text-[10px] tracking-widest uppercase" style={monoLabel}>LTM Revenue (m)</span>
                <input
                  type="number"
                  value={form.revenue}
                  onChange={(e) => setForm({ ...form, revenue: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm"
                  style={inputStyle}
                />
              </label>
              <label className="block">
                <span className="block mb-1 text-[10px] tracking-widest uppercase" style={monoLabel}>EBITDA Margin (%)</span>
                <input
                  type="text"
                  value={form._ebitdaMarginInput ?? (form.ebitda_or_margin * 100).toFixed(1)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const num = parseFloat(raw);
                    if (!isNaN(num)) {
                      setForm((prev) => ({ ...prev, ebitda_or_margin: num / 100, _ebitdaMarginInput: raw }));
                    } else {
                      setForm((prev) => ({ ...prev, _ebitdaMarginInput: raw }));
                    }
                  }}
                  onBlur={() => setForm((prev) => ({ ...prev, _ebitdaMarginInput: undefined }))}
                  className="w-full px-3 py-2 text-sm"
                  style={inputStyle}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <label className="block">
                <span className="block mb-1 text-[10px] tracking-widest uppercase" style={monoLabel}>Entry Multiple (x)</span>
                <input
                  type="text"
                  value={form._entryMultipleInput ?? form.entry_multiple}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const num = parseFloat(raw);
                    if (!isNaN(num)) {
                      setForm((prev) => ({ ...prev, entry_multiple: num, _entryMultipleInput: raw }));
                    } else {
                      setForm((prev) => ({ ...prev, _entryMultipleInput: raw }));
                    }
                  }}
                  onBlur={() => setForm((prev) => ({ ...prev, _entryMultipleInput: undefined }))}
                  className="w-full px-3 py-2 text-sm"
                  style={inputStyle}
                />
                {(() => {
                  const comps = SECTOR_COMPS[form.sector] || SECTOR_COMPS['Other'];
                  const val = form.entry_multiple;
                  const position = val < comps.low ? 'below comps' : val > comps.high ? 'above comps' : val <= comps.median ? 'low–mid' : 'mid–high';
                  const color = val < comps.low || val > comps.high ? '#b91c1c' : 'rgba(17,17,17,0.4)';
                  return (
                    <span className="block mt-1 text-[9px]" style={{ color, fontFamily: "'JetBrains Mono', monospace" }}>
                      {form.sector} comps: {comps.low}–{comps.high}x (med {comps.median}x) · {position}
                    </span>
                  );
                })()}
              </label>
              <label className="block">
                <span className="block mb-1 text-[10px] tracking-widest uppercase" style={monoLabel}>Currency</span>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full px-3 py-2 text-sm"
                  style={inputStyle}
                >
                  {['INR', 'EUR', 'USD', 'GBP', 'JPY'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>

            <label className="block mb-4">
              <span className="block mb-1 text-[10px] tracking-widest uppercase" style={monoLabel}>Sector</span>
              <select
                value={form.sector}
                onChange={(e) => setForm({ ...form, sector: e.target.value })}
                className="w-full px-3 py-2 text-sm"
                style={inputStyle}
              >
                {['Technology', 'Healthcare', 'Industrials', 'Consumer', 'Financial Services', 'Real Estate', 'Energy', 'Business Services', 'Other'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>

            {/* Implied snapshot */}
            {(() => {
              const ebitda = form.revenue * (form.ebitda_or_margin < 1 ? form.ebitda_or_margin : (form.revenue > 0 ? form.ebitda_or_margin / form.revenue : 0));
              const ev = ebitda * form.entry_multiple;
              return ebitda > 0 ? (
                <div className="mb-4 px-3 py-2" style={{ background: '#F9F9F7', border: '1px solid rgba(17,17,17,0.08)' }}>
                  <span className="text-[9px] tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace" }}>
                    Implied: EBITDA {ebitda.toFixed(1)}m · EV {ev.toFixed(0)}m · Rev Multiple {form.revenue > 0 ? (ev / form.revenue).toFixed(1) : '–'}x
                  </span>
                </div>
              ) : null;
            })()}

            {/* API Key section */}
            <div className="mb-5 p-3" style={{ background: '#F9F9F7', border: '1px solid rgba(17,17,17,0.08)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] tracking-widest uppercase" style={{ color: effectiveKey ? '#15803d' : 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
                  {effectiveKey ? 'API Key ✓' : 'API Key'}
                  <span className="ml-1.5 text-[9px]" style={{ color: 'rgba(17,17,17,0.3)' }}>optional</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowApiInfo(!showApiInfo)}
                  className="text-[10px] w-4 h-4 flex items-center justify-center rounded-full transition-colors"
                  style={{
                    color: showApiInfo ? '#CC0000' : 'rgba(17,17,17,0.35)',
                    border: `1px solid ${showApiInfo ? 'rgba(204,0,0,0.3)' : 'rgba(17,17,17,0.2)'}`,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                  aria-label="API key info"
                >
                  i
                </button>
              </div>

              {showApiInfo && (
                <p className="mb-2 text-[11px] leading-[1.65]" style={{ color: 'rgba(17,17,17,0.55)', fontFamily: 'Lora, serif' }}>
                  With an API key, the AI generates company-specific assumptions on initialization — not generic sector defaults. Highly recommended.{' '}
                  <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" style={{ color: '#CC0000', textDecoration: 'none' }}>
                    Free Groq key in under 60 seconds.
                  </a>
                </p>
              )}

              {storedApiKey ? (
                <button
                  type="button"
                  onClick={() => { clearApiKey(); setApiKeyInput(''); }}
                  className="text-[10px] tracking-widest uppercase transition-colors"
                  style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace", background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  Change Key
                </button>
              ) : (
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="gsk_... or sk-ant-..."
                  className="w-full px-2.5 py-1.5 text-xs outline-none"
                  style={{
                    background: '#ffffff',
                    border: '1px solid rgba(17,17,17,0.12)',
                    color: '#111111',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                />
              )}
            </div>

            {error && (
              <p className="text-xs mb-3" style={{ color: '#b91c1c', fontFamily: "'JetBrains Mono', monospace" }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={isCalculating}
              className="w-full py-2.5 text-sm font-medium tracking-widest uppercase transition-colors"
              style={{
                background: isCalculating ? 'rgba(17,17,17,0.05)' : '#CC0000',
                color: isCalculating ? 'rgba(17,17,17,0.3)' : '#ffffff',
                fontFamily: "'JetBrains Mono', monospace",
                border: isCalculating ? '1px solid rgba(17,17,17,0.1)' : '1px solid #CC0000',
                letterSpacing: '0.12em',
              }}
            >
              {isCalculating
                ? (effectiveKey ? 'Building with AI…' : 'Initializing…')
                : 'Build Model'}
            </button>

            <button
              type="button"
              onClick={() => setShowSuggestions(true)}
              className="w-full mt-2.5 py-1.5 text-[10px] tracking-widest uppercase transition-colors"
              style={{
                background: 'transparent',
                color: 'rgba(17,17,17,0.35)',
                fontFamily: "'JetBrains Mono', monospace",
                border: '1px solid rgba(17,17,17,0.1)',
                letterSpacing: '0.12em',
              }}
            >
              Suggestions
            </button>

            {/* AI Import Kit */}
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => setShowAiImport(!showAiImport)}
                className="w-full py-1.5 text-[10px] tracking-widest uppercase transition-colors flex items-center justify-between px-3"
                style={{
                  background: 'transparent',
                  color: showAiImport ? '#CC0000' : 'rgba(17,17,17,0.35)',
                  fontFamily: "'JetBrains Mono', monospace",
                  border: `1px solid ${showAiImport ? 'rgba(204,0,0,0.25)' : 'rgba(17,17,17,0.1)'}`,
                  letterSpacing: '0.12em',
                }}
              >
                <span>AI Import Kit</span>
                <span style={{ fontSize: 8, opacity: 0.7 }}>{showAiImport ? '▲' : '▼'}</span>
              </button>

              {showAiImport && (
                <div className="mt-1.5 p-3" style={{ background: '#F9F9F7', border: '1px solid rgba(17,17,17,0.08)' }}>
                  <p className="mb-3 leading-relaxed" style={{ color: 'rgba(17,17,17,0.5)', fontFamily: 'Lora, serif', fontSize: 12, lineHeight: 1.7 }}>
                    Download a JSON template + copy an AI prompt. Feed any deal data to an AI, get structured JSON back, then load it here via the Load button.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      className="py-2 text-[10px] tracking-widest uppercase transition-colors"
                      style={{
                        background: promptCopied ? 'rgba(21,128,61,0.06)' : 'transparent',
                        color: promptCopied ? '#15803d' : 'rgba(17,17,17,0.5)',
                        fontFamily: "'JetBrains Mono', monospace",
                        border: `1px solid ${promptCopied ? 'rgba(21,128,61,0.3)' : 'rgba(17,17,17,0.15)'}`,
                        letterSpacing: '0.1em',
                      }}
                    >
                      {promptCopied ? '✓ Copied' : 'Copy Prompt'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="py-2 text-[10px] tracking-widest uppercase transition-colors"
                      style={{
                        background: 'transparent',
                        color: 'rgba(17,17,17,0.5)',
                        fontFamily: "'JetBrains Mono', monospace",
                        border: '1px solid rgba(17,17,17,0.15)',
                        letterSpacing: '0.1em',
                      }}
                    >
                      Download JSON
                    </button>
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>

      </div>
    </div>
  );
};

type OutputTab = 'returns' | 'su' | 'debt' | 'credit' | 'fragility' | 'sensitivity' | 'scenarios' | 'reality';

const DealEngine: React.FC = () => {
  const modelState = useDealEngineStore((s) => s.modelState);
  const apiKey = useDealEngineStore((s) => s.apiKey);
  const clearApiKey = useDealEngineStore((s) => s.clearApiKey);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [activeTab, setActiveTab] = useState<OutputTab>('returns');
  const [chatOpen, setChatOpen] = useState(true);
  const [inputPanelOpen, setInputPanelOpen] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );

  useEffect(() => {
    const handler = () => setIsLargeScreen(window.innerWidth >= 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // On large screens hide the mobile chat default; on small screens hide chat
  useEffect(() => {
    if (!isLargeScreen) setChatOpen(false);
  }, [isLargeScreen]);

  if (!modelState) return <InitializeForm />;

  const showInputPanel = isLargeScreen || inputPanelOpen;

  const tabs: { id: OutputTab; label: string }[] = [
    { id: 'returns', label: 'Returns' },
    { id: 'su', label: 'S&U' },
    { id: 'debt', label: 'Debt' },
    { id: 'credit', label: 'Credit' },
    { id: 'fragility', label: 'Fragility' },
    { id: 'sensitivity', label: 'Sensitivity' },
    { id: 'scenarios', label: 'Scenarios' },
    { id: 'reality', label: 'Reality Check' },
  ];

  return (
    <div className="flex flex-col h-screen" style={{ background: '#F9F9F7' }}>
      {/* Subtle paper texture */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='0.5' fill='%23111111'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
        }}
      />

      {/* API Key Modal */}
      {showApiKeyModal && <ApiKeyModal onClose={() => setShowApiKeyModal(false)} />}

      {/* Header */}
      <Header />

      {/* Main layout */}
      <div className="relative z-10 flex flex-1 overflow-hidden">

        {/* Left: Inputs — hidden on mobile unless toggled */}
        {showInputPanel && <InputPanel />}

        {/* Center: Outputs */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Tab bar */}
          <div
            className="flex items-center flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(17,17,17,0.1)', background: '#F9F9F7' }}
          >
            {/* Mobile: inputs toggle */}
            {!isLargeScreen && (
              <button
                onClick={() => setInputPanelOpen(!inputPanelOpen)}
                className="px-3 py-2.5 text-[11px] flex-shrink-0 transition-colors"
                style={{
                  color: inputPanelOpen ? '#CC0000' : 'rgba(17,17,17,0.4)',
                  fontFamily: "'JetBrains Mono', monospace",
                  borderRight: '1px solid rgba(17,17,17,0.08)',
                }}
              >
                ☰
              </button>
            )}
            {/* Scrollable tabs */}
            <div className="flex-1 flex items-center overflow-x-auto min-w-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="px-3 lg:px-4 py-2.5 text-[11px] transition-colors relative flex-shrink-0"
                  style={{
                    color: activeTab === tab.id ? '#CC0000' : 'rgba(17,17,17,0.4)',
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: '#CC0000' }} />
                  )}
                </button>
              ))}
            </div>
            {/* Fixed action buttons */}
            <div className="flex items-center flex-shrink-0" style={{ borderLeft: '1px solid rgba(17,17,17,0.08)' }}>
              {!apiKey ? (
                <button
                  onClick={() => setShowApiKeyModal(true)}
                  className="px-3 py-1.5 mx-1 text-[10px] tracking-widest uppercase transition-colors flex-shrink-0"
                  style={{ color: '#b45309', border: '1px solid rgba(180,83,9,0.4)', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  Set API Key
                </button>
              ) : (
                <button
                  onClick={() => { clearApiKey(); setShowApiKeyModal(true); }}
                  className="px-3 py-1.5 mx-1 text-[10px] tracking-widest uppercase transition-colors flex-shrink-0"
                  style={{ color: 'rgba(17,17,17,0.4)', border: '1px solid rgba(17,17,17,0.12)', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  Change Key
                </button>
              )}
              <button
                onClick={() => setChatOpen(!chatOpen)}
                className="px-3 py-1.5 mx-1 mr-2 text-[10px] tracking-widest uppercase transition-colors flex-shrink-0"
                style={{
                  color: chatOpen ? '#CC0000' : 'rgba(17,17,17,0.4)',
                  border: `1px solid ${chatOpen ? 'rgba(204,0,0,0.3)' : 'rgba(17,17,17,0.15)'}`,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {chatOpen ? 'Hide Chat' : 'AI Chat'}
              </button>
            </div>
          </div>

          {/* Output content */}
          <div className="flex-1 overflow-y-auto p-3 lg:p-4">
            {activeTab === 'returns' && (
              <div className="space-y-4">
                <ReturnsSummary />
                <ValueBridge />
                <EBITDABridgeChart />
              </div>
            )}
            {activeTab === 'su' && <SourcesUsesTable />}
            {activeTab === 'debt' && <DebtScheduleTable />}
            {activeTab === 'credit' && <CreditPanel />}
            {activeTab === 'fragility' && <FragilityPanel />}
            {activeTab === 'sensitivity' && <SensitivityHeatmap />}
            {activeTab === 'scenarios' && <ScenarioPanel />}
            {activeTab === 'reality' && <ExitRealityCheck />}
          </div>
        </div>

        {/* Right: Chat */}
        {chatOpen && (
          <div className="flex-shrink-0" style={{ width: isLargeScreen ? 340 : '100%', maxWidth: 340 }}>
            <ChatPanel />
          </div>
        )}
      </div>
    </div>
  );
};

export default DealEngine;
