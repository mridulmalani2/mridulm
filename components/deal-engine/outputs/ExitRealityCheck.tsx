import React from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { fmtPct, irrColor } from '../../../lib/formatters';

const VERDICT_COLORS: Record<string, string> = {
  aggressive: '#ff4757',
  realistic: '#00c896',
  conservative: '#ffaa00',
};

const ExitRealityCheck: React.FC = () => {
  const ms = useDealEngineStore((s) => s.modelState);
  if (!ms) return null;

  const rc = ms.exit_reality_check;

  return (
    <div className="p-4 mb-3" style={{ background: '#0f1420', border: '1px solid #1e2a3a' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium tracking-widest uppercase" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>
          Exit Reality Check
        </span>
        <span
          className="text-xs font-bold tracking-widest uppercase px-2 py-0.5"
          style={{
            color: VERDICT_COLORS[rc.verdict] || '#6b7a96',
            border: `1px solid ${VERDICT_COLORS[rc.verdict] || '#1e2a3a'}`,
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          {rc.verdict}
        </span>
      </div>

      {rc.implied_buyer_irr != null && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>Implied Buyer IRR:</span>
          <span className="text-sm font-bold" style={{ color: irrColor(rc.implied_buyer_irr), fontFamily: "'IBM Plex Mono', monospace" }}>
            {fmtPct(rc.implied_buyer_irr)}
          </span>
        </div>
      )}

      {rc.flags.length === 0 ? (
        <div className="text-xs" style={{ color: '#00c896', fontFamily: 'Inter, sans-serif' }}>
          No flags triggered.
        </div>
      ) : (
        <div className="space-y-2">
          {rc.flags.map((flag, i) => (
            <div
              key={i}
              className="p-2"
              style={{
                borderLeft: `3px solid ${flag.severity === 'critical' ? '#ff4757' : '#ffaa00'}`,
                background: '#0a0d13',
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-xs font-medium uppercase"
                  style={{
                    color: flag.severity === 'critical' ? '#ff4757' : '#ffaa00',
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}
                >
                  {flag.severity}
                </span>
                <span className="text-xs" style={{ color: '#e8edf5', fontFamily: 'Inter, sans-serif' }}>
                  {flag.flag_type.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-xs mb-1" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>
                {flag.description}
              </p>
              <p className="text-xs" style={{ color: '#e8edf5', fontFamily: "'IBM Plex Mono', monospace" }}>
                {flag.quantified_impact}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExitRealityCheck;
