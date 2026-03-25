import React, { useState } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { fmtPct, irrColor } from '../../../lib/formatters';

const ReturnsSummary: React.FC = () => {
  const ms = useDealEngineStore((s) => s.modelState);
  const [showGross, setShowGross] = useState(false);
  const [showUnlevered, setShowUnlevered] = useState(false);

  if (!ms) return null;
  const ret = ms.returns;
  const displayIrr = showUnlevered ? ret.irr_unlevered : showGross ? ret.irr_gross : ret.irr;

  return (
    <div className="p-4 mb-3" style={{ background: '#0f1420', border: '1px solid #1e2a3a' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium tracking-widest uppercase" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>
          Returns
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowGross(!showGross); setShowUnlevered(false); }}
            className="text-xs px-1.5 py-0.5"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              color: showGross ? '#00d4ff' : '#6b7a96',
              border: `1px solid ${showGross ? '#00d4ff' : '#1e2a3a'}`,
            }}
          >
            Gross
          </button>
          <button
            onClick={() => { setShowUnlevered(!showUnlevered); setShowGross(false); }}
            className="text-xs px-1.5 py-0.5"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              color: showUnlevered ? '#00d4ff' : '#6b7a96',
              border: `1px solid ${showUnlevered ? '#00d4ff' : '#1e2a3a'}`,
            }}
          >
            Unlev
          </button>
        </div>
      </div>

      {/* Hero IRR */}
      <div className="mb-3">
        <div className="text-3xl font-bold" style={{ color: irrColor(displayIrr), fontFamily: "'IBM Plex Mono', monospace" }}>
          {displayIrr != null ? fmtPct(displayIrr) : 'N/C'}
        </div>
        <div className="text-xs" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>
          {showUnlevered ? 'Unlevered' : showGross ? 'Gross' : 'Equity'} IRR
          {ret.irr_convergence_failed && ' (non-convergent)'}
        </div>
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-sm font-semibold" style={{ color: '#e8edf5', fontFamily: "'IBM Plex Mono', monospace" }}>
            {ret.moic.toFixed(2)}x
          </div>
          <div className="text-xs" style={{ color: '#6b7a96' }}>MOIC</div>
        </div>
        <div>
          <div className="text-sm font-semibold" style={{ color: '#e8edf5', fontFamily: "'IBM Plex Mono', monospace" }}>
            {ret.payback_years.toFixed(1)}yr
          </div>
          <div className="text-xs" style={{ color: '#6b7a96' }}>Payback</div>
        </div>
        <div>
          <div className="text-sm font-semibold" style={{ color: '#e8edf5', fontFamily: "'IBM Plex Mono', monospace" }}>
            {fmtPct(ret.cash_yield_avg)}
          </div>
          <div className="text-xs" style={{ color: '#6b7a96' }}>Cash Yield</div>
        </div>
      </div>
    </div>
  );
};

export default ReturnsSummary;
