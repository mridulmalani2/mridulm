import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDealEngineStore } from '../store/dealEngine';
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
import ChatPanel from '../components/deal-engine/chat/ChatPanel';
import ApiKeyModal from '../components/deal-engine/ApiKeyModal';

const INIT_DEFAULTS = {
  deal_name: 'New Deal',
  revenue: 100,
  ebitda_or_margin: 0.25,
  entry_multiple: 10,
  currency: 'INR',
  sector: 'Technology',
};

const inputStyle = {
  background: '#ffffff',
  border: '1px solid rgba(17,17,17,0.15)',
  color: '#111111',
  fontFamily: "'JetBrains Mono', monospace",
  outline: 'none',
};

const STEPS: { n: string; title: string; body: React.ReactNode }[] = [
  {
    n: '01',
    title: 'Initialize',
    body: 'Enter deal name, revenue, EBITDA margin, entry multiple, currency, and sector. The engine builds a full leveraged buyout model — debt schedule, return attribution, sensitivity tables.',
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
        {' '}and watch it recalculate. Ask it to explain what drives returns, flag risks, or walk through any assumption. Free API key at{' '}
        <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" style={{ color: '#CC0000', textDecoration: 'none' }}>console.groq.com/keys</a>.
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
      className="p-8 max-w-md w-full relative"
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
  const [form, setForm] = useState(INIT_DEFAULTS);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    initializeModel(form);
  };

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

      <div className="relative z-10 w-full max-w-5xl mx-auto px-8 flex items-center gap-16">

        {/* ── Left: editorial explanation ───────────────────── */}
        <div className="flex-1 py-12">
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
          <h1 className="font-playfair text-5xl font-bold mb-3" style={{ color: '#111111' }}>
            Deal Engine
          </h1>
          <p className="mb-10" style={{ color: 'rgba(17,17,17,0.5)', fontFamily: 'Lora, serif', fontSize: 14, lineHeight: 1.8, maxWidth: 360 }}>
            A live LBO model with AI reasoning built in. Enter your deal, interrogate every assumption, and let the AI re-calibrate the numbers in plain English.
          </p>

          <div className="space-y-6">
            {STEPS.map(({ n, title, body }) => (
              <div key={n} className="flex gap-5">
                <span
                  className="flex-shrink-0 pt-0.5"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#CC0000', letterSpacing: '0.12em', width: 20 }}
                >
                  {n}
                </span>
                <div>
                  <div
                    className="mb-1 text-[10px] tracking-widest uppercase"
                    style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace" }}
                  >
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

        {/* ── Right: form card ───────────────────────────────── */}
        <div className="flex-shrink-0" style={{ width: 390 }}>
          <form
            onSubmit={handleSubmit}
            className="p-8"
            style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}
          >
            <div className="border-t-[2px] border-[#111] mb-5" />
            <p
              className="mb-5 text-[10px] tracking-widest uppercase"
              style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace" }}
            >
              Initialize Model
            </p>

            <label className="block mb-4">
              <span className="block mb-1 text-[10px] tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>Deal Name</span>
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
                <span className="block mb-1 text-[10px] tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>LTM Revenue (m)</span>
                <input
                  type="number"
                  value={form.revenue}
                  onChange={(e) => setForm({ ...form, revenue: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm"
                  style={inputStyle}
                />
              </label>
              <label className="block">
                <span className="block mb-1 text-[10px] tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>EBITDA Margin (%)</span>
                <input
                  type="number"
                  value={(form.ebitda_or_margin * 100).toFixed(1)}
                  onChange={(e) => setForm({ ...form, ebitda_or_margin: Number(e.target.value) / 100 })}
                  step={0.5}
                  className="w-full px-3 py-2 text-sm"
                  style={inputStyle}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <label className="block">
                <span className="block mb-1 text-[10px] tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>Entry Multiple (x)</span>
                <input
                  type="number"
                  value={form.entry_multiple}
                  onChange={(e) => setForm({ ...form, entry_multiple: Number(e.target.value) })}
                  step={0.5}
                  className="w-full px-3 py-2 text-sm"
                  style={inputStyle}
                />
              </label>
              <label className="block">
                <span className="block mb-1 text-[10px] tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>Currency</span>
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

            <label className="block mb-5">
              <span className="block mb-1 text-[10px] tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>Sector</span>
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
              {isCalculating ? 'Initializing...' : 'Build Model'}
            </button>

            <button
              type="button"
              onClick={() => setShowSuggestions(true)}
              className="w-full mt-2.5 py-1.5 text-[10px] tracking-widest uppercase transition-colors hover:border-[rgba(17,17,17,0.2)]"
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
          </form>
        </div>

      </div>
    </div>
  );
};

type OutputTab = 'returns' | 'su' | 'debt' | 'credit' | 'sensitivity' | 'scenarios' | 'reality';

const DealEngine: React.FC = () => {
  const modelState = useDealEngineStore((s) => s.modelState);
  const apiKey = useDealEngineStore((s) => s.apiKey);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [activeTab, setActiveTab] = useState<OutputTab>('returns');
  const [chatOpen, setChatOpen] = useState(true);

  // Show init form if no model loaded
  if (!modelState) return <InitializeForm />;

  const tabs: { id: OutputTab; label: string }[] = [
    { id: 'returns', label: 'Returns' },
    { id: 'su', label: 'S&U' },
    { id: 'debt', label: 'Debt' },
    { id: 'credit', label: 'Credit' },
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
      {showApiKeyModal && !apiKey && <ApiKeyModal onClose={() => setShowApiKeyModal(false)} />}

      {/* Header */}
      <Header />

      {/* Main 3-column layout */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* Left: Inputs (320px fixed) */}
        <InputPanel />

        {/* Center: Outputs (flex) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center gap-0 flex-shrink-0" style={{ borderBottom: '1px solid rgba(17,17,17,0.1)', background: '#F9F9F7' }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2.5 text-[11px] transition-colors relative"
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
            <div className="flex-1" />
            {!apiKey && (
              <button
                onClick={() => setShowApiKeyModal(true)}
                className="px-3 py-1.5 mr-2 text-[10px] tracking-widest uppercase transition-colors"
                style={{ color: '#b45309', border: '1px solid rgba(180,83,9,0.4)', fontFamily: "'JetBrains Mono', monospace" }}
              >
                Set API Key
              </button>
            )}
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className="px-3 py-1.5 mr-2 text-[10px] tracking-widest uppercase transition-colors"
              style={{
                color: chatOpen ? '#CC0000' : 'rgba(17,17,17,0.4)',
                border: `1px solid ${chatOpen ? 'rgba(204,0,0,0.3)' : 'rgba(17,17,17,0.15)'}`,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {chatOpen ? 'Hide Chat' : 'Show Chat'}
            </button>
          </div>

          {/* Output content */}
          <div className="flex-1 overflow-y-auto p-4">
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
            {activeTab === 'sensitivity' && <SensitivityHeatmap />}
            {activeTab === 'scenarios' && <ScenarioPanel />}
            {activeTab === 'reality' && <ExitRealityCheck />}
          </div>
        </div>

        {/* Right: Chat (340px, toggleable) */}
        {chatOpen && (
          <div className="flex-shrink-0" style={{ width: 340 }}>
            <ChatPanel />
          </div>
        )}
      </div>
    </div>
  );
};

export default DealEngine;
