import React from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { fmtPct, irrColor } from '../../../lib/formatters';

const VERDICT_COLORS: Record<string, string> = {
  aggressive: '#b91c1c',
  realistic: '#15803d',
  conservative: '#b45309',
};

const ExitRealityCheck: React.FC = () => {
  const ms = useDealEngineStore((s) => s.modelState);
  const apiKey = useDealEngineStore((s) => s.apiKey);
  if (!ms) return null;

  const rc = ms.exit_reality_check;
  const verdictColor = VERDICT_COLORS[rc.verdict] || 'rgba(17,17,17,0.4)';

  return (
    <div className="p-5 mb-3" style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-medium tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
          Exit Reality Check
        </span>
        <span
          className="text-[10px] font-bold tracking-widest uppercase px-2.5 py-0.5"
          style={{
            color: verdictColor,
            border: `1px solid ${verdictColor}`,
            fontFamily: "'JetBrains Mono', monospace",
            background: 'transparent',
          }}
        >
          {rc.verdict}
        </span>
      </div>

      {rc.implied_buyer_irr != null && (
        <div className="mb-4 flex items-center gap-3 pb-4" style={{ borderBottom: '1px solid rgba(17,17,17,0.08)' }}>
          <span className="text-[10px] tracking-wider uppercase" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>Implied Buyer IRR</span>
          <span className="font-playfair text-xl font-bold" style={{ color: irrColor(rc.implied_buyer_irr) }}>
            {fmtPct(rc.implied_buyer_irr)}
          </span>
        </div>
      )}

      {rc.flags.length === 0 ? (
        <div className="text-xs" style={{ color: '#15803d', fontFamily: "'JetBrains Mono', monospace" }}>
          No flags triggered.
        </div>
      ) : (
        <div className="space-y-2">
          {rc.flags.map((flag, i) => (
            <div
              key={i}
              className="p-3"
              style={{
                borderLeft: `3px solid ${flag.severity === 'critical' ? '#b91c1c' : '#b45309'}`,
                background: '#F9F9F7',
                border: '1px solid rgba(17,17,17,0.08)',
                borderLeftColor: flag.severity === 'critical' ? '#b91c1c' : '#b45309',
                borderLeftWidth: 3,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[10px] font-medium uppercase tracking-widest"
                  style={{
                    color: flag.severity === 'critical' ? '#b91c1c' : '#b45309',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {flag.severity}
                </span>
                <span className="text-xs" style={{ color: '#111111', fontFamily: "'JetBrains Mono', monospace" }}>
                  {flag.flag_type.replace(/_/g, ' ')}
                </span>
              </div>
              {apiKey && (
                <p className="text-xs mb-1" style={{ color: 'rgba(17,17,17,0.5)', fontFamily: 'Lora, serif', lineHeight: '1.5' }}>
                  {flag.description}
                </p>
              )}
              <p className="text-[10px]" style={{ color: '#111111', fontFamily: "'JetBrains Mono', monospace" }}>
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
