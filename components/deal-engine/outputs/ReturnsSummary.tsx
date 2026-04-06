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

  const toggleBtnStyle = (active: boolean) => ({
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: active ? '#CC0000' : 'rgba(17,17,17,0.4)',
    border: `1px solid ${active ? 'rgba(204,0,0,0.3)' : 'rgba(17,17,17,0.12)'}`,
    background: 'transparent',
  });

  return (
    <div className="p-5 mb-3" style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-medium tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
          Returns
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={() => { setShowGross(!showGross); setShowUnlevered(false); }}
            className="text-xs px-2 py-0.5 transition-colors"
            style={toggleBtnStyle(showGross)}
          >
            Gross
          </button>
          <button
            onClick={() => { setShowUnlevered(!showUnlevered); setShowGross(false); }}
            className="text-xs px-2 py-0.5 transition-colors"
            style={toggleBtnStyle(showUnlevered)}
          >
            Unlev
          </button>
        </div>
      </div>

      {/* Hero IRR */}
      <div className="mb-5">
        <div className="font-playfair text-5xl font-bold mb-1" style={{ color: irrColor(displayIrr) }}>
          {displayIrr != null ? fmtPct(displayIrr) : 'N/C'}
        </div>
        <div className="text-[11px]" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>
          {showUnlevered ? 'Unlevered' : showGross ? 'Gross' : 'Equity'} IRR
          {ret.irr_convergence_failed && ' (non-convergent)'}
        </div>
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-3 gap-4" style={{ borderTop: '1px solid rgba(17,17,17,0.08)', paddingTop: 16 }}>
        <div>
          <div className="text-lg font-semibold mb-0.5" style={{ color: '#111111', fontFamily: "'JetBrains Mono', monospace" }}>
            {ret.moic.toFixed(2)}x
          </div>
          <div className="text-[10px] tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace" }}>MOIC</div>
        </div>
        <div>
          <div className="text-lg font-semibold mb-0.5" style={{ color: '#111111', fontFamily: "'JetBrains Mono', monospace" }}>
            {ret.payback_years.toFixed(1)}yr
          </div>
          <div className="text-[10px] tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace" }}>Payback</div>
        </div>
        <div>
          <div className="text-lg font-semibold mb-0.5" style={{ color: '#111111', fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtPct(ret.cash_yield_avg)}
          </div>
          <div className="text-[10px] tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace" }}>Cash Yield</div>
        </div>
      </div>

      {/* DPI / Distributions row (shown only when distributions exist) */}
      {(ret.total_distributions ?? 0) > 0 && (
        <div className="grid grid-cols-3 gap-4 mt-3" style={{ borderTop: '1px solid rgba(17,17,17,0.08)', paddingTop: 12 }}>
          <div>
            <div className="text-lg font-semibold mb-0.5" style={{ color: '#111111', fontFamily: "'JetBrains Mono', monospace" }}>
              {ret.total_distributions.toFixed(1)}
            </div>
            <div className="text-[10px] tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace" }}>Dist. (£m)</div>
          </div>
          <div>
            <div className="text-lg font-semibold mb-0.5" style={{ color: '#111111', fontFamily: "'JetBrains Mono', monospace" }}>
              {ret.dpi_by_year && ret.dpi_by_year.length ? fmtPct(ret.dpi_by_year[ret.dpi_by_year.length - 1]) : '0%'}
            </div>
            <div className="text-[10px] tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace" }}>DPI</div>
          </div>
          <div>
            <div className="text-lg font-semibold mb-0.5" style={{ color: '#111111', fontFamily: "'JetBrains Mono', monospace" }}>
              {ret.rvpi_by_year && ret.rvpi_by_year.length > 0 ? ret.rvpi_by_year[0].toFixed(2) + 'x' : '—'}
            </div>
            <div className="text-[10px] tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace" }}>RVPI (Yr 1)</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReturnsSummary;
