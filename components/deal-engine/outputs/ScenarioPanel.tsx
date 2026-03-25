import React, { useEffect } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { fmtPct, irrColor, fmtCurrency } from '../../../lib/formatters';

const ScenarioPanel: React.FC = () => {
  const scenarios = useDealEngineStore((s) => s.scenarios);
  const loadScenarios = useDealEngineStore((s) => s.loadScenarios);
  const ms = useDealEngineStore((s) => s.modelState);

  useEffect(() => {
    if (scenarios.length === 0 && ms) loadScenarios();
  }, [ms]);

  if (!scenarios.length) return null;

  const base = scenarios.find((s) => s.name === 'base');

  return (
    <div className="p-4 mb-3" style={{ background: '#0f1420', border: '1px solid #1e2a3a' }}>
      <div className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>
        Scenarios
      </div>
      <div className="grid grid-cols-4 gap-2">
        {['bear', 'base', 'bull', 'stress'].map((name) => {
          const sc = scenarios.find((s) => s.name === name);
          if (!sc) return null;
          const irrDelta = base && sc.irr != null && base.irr != null ? sc.irr - base.irr : null;
          return (
            <div key={name} className="p-2" style={{ background: '#0a0d13', border: '1px solid #1e2a3a' }}>
              <div className="text-xs font-medium tracking-wide uppercase mb-2" style={{ color: name === 'stress' ? '#ff4757' : '#6b7a96', fontFamily: 'Inter, sans-serif' }}>
                {name}
              </div>
              <div className="text-lg font-bold mb-1" style={{ color: irrColor(sc.irr), fontFamily: "'IBM Plex Mono', monospace" }}>
                {sc.irr != null ? fmtPct(sc.irr) : 'N/C'}
              </div>
              <div className="text-xs mb-1" style={{ color: '#e8edf5', fontFamily: "'IBM Plex Mono', monospace" }}>
                {sc.moic.toFixed(2)}x MOIC
              </div>
              <div className="text-xs" style={{ color: '#6b7a96', fontFamily: "'IBM Plex Mono', monospace" }}>
                {fmtCurrency(sc.exit_equity, ms?.currency)} equity
              </div>
              {irrDelta != null && name !== 'base' && (
                <div className="text-xs mt-1" style={{ color: irrDelta >= 0 ? '#00c896' : '#ff4757', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {irrDelta >= 0 ? '+' : ''}{(irrDelta * 10000).toFixed(0)}bps
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ScenarioPanel;
