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

const InitializeForm: React.FC = () => {
  const initializeModel = useDealEngineStore((s) => s.initializeModel);
  const isCalculating = useDealEngineStore((s) => s.isCalculating);
  const error = useDealEngineStore((s) => s.error);
  const [form, setForm] = useState(INIT_DEFAULTS);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    initializeModel(form);
  };

  const inputStyle = {
    background: '#0a0d13',
    border: '1px solid #1e2a3a',
    color: '#e8edf5',
    fontFamily: "'IBM Plex Mono', monospace",
  };

  return (
    <div className="flex items-center justify-center h-screen" style={{ background: '#080b11' }}>
      <form onSubmit={handleSubmit} className="w-full max-w-md p-6" style={{ background: '#0f1420', border: '1px solid #1e2a3a' }}>
        <h1 className="text-lg font-semibold mb-1" style={{ color: '#e8edf5', fontFamily: 'Inter, sans-serif' }}>
          Deal Engine
        </h1>
        <p className="text-xs mb-5" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>
          Initialize a new LBO model with basic entry assumptions.
        </p>

        <label className="block mb-3">
          <span className="text-xs mb-1 block" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>Deal Name</span>
          <input
            type="text"
            value={form.deal_name}
            onChange={(e) => setForm({ ...form, deal_name: e.target.value })}
            className="w-full px-3 py-2 text-sm outline-none"
            style={inputStyle}
          />
        </label>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="text-xs mb-1 block" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>LTM Revenue (m)</span>
            <input
              type="number"
              value={form.revenue}
              onChange={(e) => setForm({ ...form, revenue: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </label>
          <label className="block">
            <span className="text-xs mb-1 block" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>EBITDA Margin (%)</span>
            <input
              type="number"
              value={(form.ebitda_or_margin * 100).toFixed(1)}
              onChange={(e) => setForm({ ...form, ebitda_or_margin: Number(e.target.value) / 100 })}
              step={0.5}
              className="w-full px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="text-xs mb-1 block" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>Entry Multiple (x)</span>
            <input
              type="number"
              value={form.entry_multiple}
              onChange={(e) => setForm({ ...form, entry_multiple: Number(e.target.value) })}
              step={0.5}
              className="w-full px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </label>
          <label className="block">
            <span className="text-xs mb-1 block" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>Currency</span>
            <select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="w-full px-3 py-2 text-sm outline-none"
              style={inputStyle}
            >
              {['GBP', 'EUR', 'USD', 'CHF'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>

        <label className="block mb-5">
          <span className="text-xs mb-1 block" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>Sector</span>
          <select
            value={form.sector}
            onChange={(e) => setForm({ ...form, sector: e.target.value })}
            className="w-full px-3 py-2 text-sm outline-none"
            style={inputStyle}
          >
            {['Technology', 'Healthcare', 'Industrials', 'Consumer', 'Financial Services', 'Real Estate', 'Energy', 'Business Services', 'Other'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        {error && (
          <p className="text-xs mb-3" style={{ color: '#ff4757', fontFamily: 'Inter, sans-serif' }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={isCalculating}
          className="w-full py-2.5 text-sm font-medium transition-colors"
          style={{
            background: isCalculating ? '#1e2a3a' : '#00d4ff',
            color: isCalculating ? '#6b7a96' : '#0a0d13',
            fontFamily: 'Inter, sans-serif',
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
    <div className="flex flex-col h-screen" style={{ background: '#080b11' }}>
      {/* API Key Modal */}
      {showApiKeyModal && !apiKey && <ApiKeyModal />}

      {/* Header */}
      <Header />

      {/* Main 3-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Inputs (320px fixed) */}
        <InputPanel />

        {/* Center: Outputs (flex) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center gap-0 flex-shrink-0" style={{ borderBottom: '1px solid #1e2a3a' }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2 text-xs transition-colors relative"
                style={{
                  color: activeTab === tab.id ? '#00d4ff' : '#6b7a96',
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-px" style={{ background: '#00d4ff' }} />
                )}
              </button>
            ))}
            <div className="flex-1" />
            {!apiKey && (
              <button
                onClick={() => setShowApiKeyModal(true)}
                className="px-3 py-1.5 mr-2 text-xs transition-colors"
                style={{ color: '#ffaa00', border: '1px solid #ffaa00', fontFamily: "'IBM Plex Mono', monospace" }}
              >
                Set API Key
              </button>
            )}
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className="px-3 py-1.5 mr-2 text-xs transition-colors"
              style={{
                color: chatOpen ? '#00d4ff' : '#6b7a96',
                border: `1px solid ${chatOpen ? '#00d4ff' : '#1e2a3a'}`,
                fontFamily: "'IBM Plex Mono', monospace",
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
