import React, { useState, useEffect } from 'react';
import { SHOW_LEGACY_OUTPUTS } from '../lib/legacyOutputs';
import { useDealEngineStore } from '../store/dealEngine';
import Header from '../components/deal-engine/layout/Header';
import InputPanel from '../components/deal-engine/inputs/InputPanel';
import SourceScreen from '../components/deal-engine/start/SourceScreen';
import AssumptionsReview from '../components/deal-engine/start/AssumptionsReview';
import ManualFactsScreen from '../components/deal-engine/start/ManualFactsScreen';
import ReturnsSummary from '../components/deal-engine/outputs/ReturnsSummary';
import FundReturnsPanel from '../components/deal-engine/outputs/FundReturnsPanel';
import SponsorReturnsDetail from '../components/deal-engine/outputs/SponsorReturnsDetail';
import ValueBridge from '../components/deal-engine/outputs/ValueBridge';
import DebtScheduleTable from '../components/deal-engine/outputs/DebtScheduleTable';
import BalanceSheetTable from '../components/deal-engine/outputs/BalanceSheetTable';
import SensitivityHeatmap from '../components/deal-engine/outputs/SensitivityHeatmap';
import ScenarioPanel from '../components/deal-engine/outputs/ScenarioPanel';
import ExitRealityCheck from '../components/deal-engine/outputs/ExitRealityCheck';
import SourcesUsesTable from '../components/deal-engine/outputs/SourcesUsesTable';
import CreditPanel from '../components/deal-engine/outputs/CreditPanel';
import EBITDABridgeChart from '../components/deal-engine/outputs/EBITDABridgeChart';
import FragilityPanel from '../components/deal-engine/outputs/FragilityPanel';
import ChatPanel from '../components/deal-engine/chat/ChatPanel';
import ApiKeyModal from '../components/deal-engine/ApiKeyModal';
import TraceGraphOverlay from '../components/deal-engine/TraceGraph';
import { useTraceGraph } from '../components/deal-engine/TraceGraph/useTraceGraph';
import { TraceGraphProvider } from '../components/deal-engine/TraceGraph/TraceGraphContext';

type OutputTab = 'returns' | 'su' | 'debt' | 'balancesheet' | 'credit' | 'fragility' | 'sensitivity' | 'scenarios' | 'reality';

const DealEngine: React.FC = () => {
  const modelState = useDealEngineStore((s) => s.modelState);
  const startScreen = useDealEngineStore((s) => s.startScreen);
  const apiKey = useDealEngineStore((s) => s.apiKey);
  const clearApiKey = useDealEngineStore((s) => s.clearApiKey);
  const traceModeActive = useDealEngineStore((s) => s.traceModeActive);
  const toggleTraceMode = useDealEngineStore((s) => s.toggleTraceMode);
  const modelVersion = useDealEngineStore((s) => s.modelVersion);
  const lastChangedTraceFields = useDealEngineStore((s) => s.lastChangedTraceFields);

  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [activeTab, setActiveTab] = useState<OutputTab>('returns');
  const [chatOpen, setChatOpen] = useState(true);
  const [inputPanelOpen, setInputPanelOpen] = useState(false);
  const [showTraceHint, setShowTraceHint] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );

  const traceGraph = useTraceGraph(modelState, modelVersion, lastChangedTraceFields);

  useEffect(() => {
    const handler = () => setIsLargeScreen(window.innerWidth >= 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // On large screens hide the mobile chat default; on small screens hide chat
  useEffect(() => {
    if (!isLargeScreen) setChatOpen(false);
  }, [isLargeScreen]);

  // ── 3-screen start flow (Phase 1): Source → Assumptions review → Model ──
  if (startScreen === 'assumptions') return <AssumptionsReview />;
  if (startScreen !== 'model' || !modelState) {
    return manualEntry
      ? <ManualFactsScreen onBack={() => setManualEntry(false)} />
      : <SourceScreen onManual={() => setManualEntry(true)} />;
  }

  const showInputPanel = isLargeScreen || inputPanelOpen;

  // PHASE 0 (rebuild/PHASE_0_HOTFIX.md): Fragility and Reality Check are hidden, not deleted
  // — see lib/legacyOutputs.ts (shared with the Excel export so workbook and screen agree).
  const tabs: { id: OutputTab; label: string }[] = ([
    { id: 'returns', label: 'Returns' },
    { id: 'su', label: 'S&U' },
    { id: 'debt', label: 'Debt' },
    { id: 'balancesheet', label: 'Balance Sheet' },
    { id: 'credit', label: 'Credit' },
    { id: 'fragility', label: 'Fragility' },
    { id: 'sensitivity', label: 'Sensitivity' },
    { id: 'scenarios', label: 'Scenarios' },
    { id: 'reality', label: 'Reality Check' },
  ] as { id: OutputTab; label: string }[]).filter(
    (t) => SHOW_LEGACY_OUTPUTS || (t.id !== 'fragility' && t.id !== 'reality'),
  );

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
              {/* Trace Mode toggle */}
              <button
                onClick={() => {
                  if (traceModeActive) {
                    traceGraph.closeOverlay();
                  } else {
                    // Show a brief desktop hint on first activation
                    setShowTraceHint(true);
                    setTimeout(() => setShowTraceHint(false), 4000);
                  }
                  toggleTraceMode();
                }}
                className="px-3 py-1.5 mx-1 text-[10px] tracking-widest uppercase transition-colors flex-shrink-0"
                title={traceModeActive ? 'Disable trace mode' : 'Enable trace mode — underlined numbers become clickable entry points'}
                style={{
                  color: traceModeActive ? '#CC0000' : 'rgba(17,17,17,0.4)',
                  border: `1px solid ${traceModeActive ? 'rgba(204,0,0,0.35)' : 'rgba(17,17,17,0.15)'}`,
                  background: traceModeActive ? 'rgba(204,0,0,0.05)' : 'transparent',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {traceModeActive ? '⬡ Trace On' : '⬡ Trace'}
              </button>
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

          {/* Output content — wrapped in TraceGraphProvider so output components can attach trace targets */}
          <TraceGraphProvider traceModeActive={traceModeActive} onOpenCard={traceGraph.openCard}>
            <div className="flex-1 overflow-y-auto p-3 lg:p-4">
              {activeTab === 'returns' && (
                <div className="space-y-4">
                  <ReturnsSummary />
                  <FundReturnsPanel />
                  <SponsorReturnsDetail />
                  <ValueBridge />
                  <EBITDABridgeChart />
                </div>
              )}
              {activeTab === 'su' && <SourcesUsesTable />}
              {activeTab === 'debt' && <DebtScheduleTable />}
              {activeTab === 'balancesheet' && <BalanceSheetTable />}
              {activeTab === 'credit' && <CreditPanel />}
              {activeTab === 'fragility' && <FragilityPanel />}
              {activeTab === 'sensitivity' && <SensitivityHeatmap />}
              {activeTab === 'scenarios' && <ScenarioPanel />}
              {activeTab === 'reality' && <ExitRealityCheck />}
            </div>
          </TraceGraphProvider>
        </div>

        {/* Right: Chat */}
        {chatOpen && (
          <div className="flex-shrink-0" style={{ width: isLargeScreen ? 340 : '100%', maxWidth: 340 }}>
            <ChatPanel />
          </div>
        )}
      </div>

      {/* Trace Graph Overlay — always mounted, display:none when closed */}
      <TraceGraphOverlay
        graphHook={traceGraph}
        currency={modelState.currency ?? 'GBP'}
        traceModeActive={traceModeActive}
      />

      {/* Trace mode screen-size hint — fades in/out, laptop-only advisory */}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 200,
          pointerEvents: 'none',
          opacity: showTraceHint ? 1 : 0,
          transition: 'opacity 0.4s ease',
          background: 'rgba(17,17,17,0.82)',
          color: 'rgba(255,255,255,0.8)',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: '0.07em',
          padding: '5px 12px',
          whiteSpace: 'nowrap',
        }}
      >
        TRACE VIEW · BEST ON LAPTOP OR WIDER SCREEN
      </div>
    </div>
  );
};

export default DealEngine;
