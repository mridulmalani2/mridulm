import React, { useState } from 'react';
import { useDealEngineStore } from '../store/dealEngine';
import Header from '../components/deal-engine/layout/Header';
import InputPanel from '../components/deal-engine/inputs/InputPanel';
import ReturnsSummary from '../components/deal-engine/outputs/ReturnsSummary';
import ValueBridge from '../components/deal-engine/outputs/ValueBridge';
import DebtScheduleTable from '../components/deal-engine/outputs/DebtScheduleTable';
import SensitivityHeatmap from '../components/deal-engine/outputs/SensitivityHeatmap';
import ScenarioPanel from '../components/deal-engine/outputs/ScenarioPanel';
import ExitRealityCheck from '../components/deal-engine/outputs/ExitRealityCheck';
import ChatPanel from '../components/deal-engine/chat/ChatPanel';
import ApiKeyModal from '../components/deal-engine/ApiKeyModal';

const INIT_DEFAULTS = {
  deal_name: 'New Deal',
  revenue: 100,
  ebitda_or_margin: 0.25,
  entry_multiple: 10,
  currency: 'GBP',
  sector: 'Technology',
};

const inputStyle = {
  background: '#ffffff',
  border: '1px solid rgba(17,17,17,0.15)',
  color: '#111111',
  fontFamily: "'JetBrains Mono', monospace",
  outline: 'none',
};

const InitializeForm: React.FC = () => {
  const initializeModel = useDealEngineStore((s) => s.initializeModel);
  const isCalculating = useDealEngineStore((s) => s.isCalculating);
  const error = useDealEngineStore((s) => s.error);
  const [form, setForm] = useState(INIT_DEFAULTS);

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
      <form onSubmit={handleSubmit} className="relative z-10 w-full max-w-md p-8" style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}>
        <div className="border-t-[2px] border-[#111] mb-6" />
        <h1 className="font-playfair text-3xl font-bold mb-1" style={{ color: '#111111' }}>
          Deal Engine
        </h1>
        <p className="mb-6" style={{ color: 'rgba(17,17,17,0.5)', fontFamily: 'Lora, serif', fontSize: 14 }}>
          Initialize a new LBO model with basic entry assumptions.
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
              {['GBP', 'EUR', 'USD', 'CHF'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>

        <label className="block mb-6">
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
          className="w-full py-2.5 text-sm font-medium transition-colors"
          style={{
            background: isCalculating ? 'rgba(17,17,17,0.05)' : '#CC0000',
            color: isCalculating ? 'rgba(17,17,17,0.3)' : '#ffffff',
            fontFamily: "'JetBrains Mono', monospace",
            border: isCalculating ? '1px solid rgba(17,17,17,0.1)' : '1px solid #CC0000',
          }}
        >
          {isCalculating ? 'Initializing...' : 'Build Model'}
        </button>
      </form>
    </div>
  );
};

type OutputTab = 'returns' | 'debt' | 'sensitivity' | 'scenarios' | 'reality';

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
    { id: 'debt', label: 'Debt' },
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
      {showApiKeyModal && !apiKey && <ApiKeyModal />}

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
              <>
                <ReturnsSummary />
                <ValueBridge />
              </>
            )}
            {activeTab === 'debt' && <DebtScheduleTable />}
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
