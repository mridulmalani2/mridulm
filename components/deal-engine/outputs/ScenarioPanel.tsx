import React, { useEffect } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { fmtPct, irrColor, fmtCurrency } from '../../../lib/formatters';

const SCENARIO_ACCENT: Record<string, string> = {
  bear: 'rgba(17,17,17,0.35)',
  base: '#111111',
  bull: '#15803d',
  stress: '#b91c1c',
};

// Display labels avoid "Bear"/"Stress" — those imply correlated, probabilistic
// stress testing; these scenarios are deterministic perturbations (refactor plan §7.2).
const SCENARIO_LABEL: Record<string, string> = {
  bear: 'Downside',
  base: 'Base',
  bull: 'Bull',
  stress: 'Severe Downside',
};

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
    <div className="p-5 mb-3" style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}>
      <div className="flex items-center gap-1.5 mb-4">
        <span className="text-[10px] font-medium tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
          Scenarios
        </span>
        <span
          title="Deterministic perturbations of the base case (growth, exit multiple, margin) — not correlated or probabilistic stress tests. Downside and Severe Downside size debt off their own forward EBITDA; each card shows survival and covenant-breach checks."
          style={{ cursor: 'help', color: 'rgba(17,17,17,0.3)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
        >
          ⓘ
        </span>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {['bear', 'base', 'bull', 'stress'].map((name) => {
          const sc = scenarios.find((s) => s.name === name);
          if (!sc) return null;
          const irrDelta = base && sc.irr != null && base.irr != null ? sc.irr - base.irr : null;
          const accent = SCENARIO_ACCENT[name] || 'rgba(17,17,17,0.35)';
          return (
            <div key={name} className="p-3" style={{ background: '#F9F9F7', border: '1px solid rgba(17,17,17,0.08)', borderTop: `2px solid ${accent}` }}>
              <div className="text-[9px] font-medium tracking-widest uppercase mb-2.5" style={{ color: accent, fontFamily: "'JetBrains Mono', monospace" }}>
                {SCENARIO_LABEL[name] ?? name}
              </div>
              <div className="font-playfair text-2xl font-bold mb-1" style={{ color: irrColor(sc.irr) }}>
                {sc.irr != null ? fmtPct(sc.irr) : 'N/C'}
              </div>
              <div className="text-xs mb-1" style={{ color: '#111111', fontFamily: "'JetBrains Mono', monospace" }}>
                {sc.moic.toFixed(2)}x MOIC
              </div>
              <div className="text-[10px]" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
                {fmtCurrency(sc.exit_equity, ms?.currency)} equity
              </div>
              {irrDelta != null && name !== 'base' && (
                <div className="text-[10px] mt-1.5 font-medium" style={{ color: irrDelta >= 0 ? '#15803d' : '#b91c1c', fontFamily: "'JetBrains Mono', monospace" }}>
                  {irrDelta >= 0 ? '+' : ''}{(irrDelta * 10000).toFixed(0)}bps
                </div>
              )}
              {sc.survives_hold != null && (
                <div
                  className="text-[10px] mt-2 pt-2"
                  style={{ borderTop: '1px solid rgba(17,17,17,0.06)', fontFamily: "'JetBrains Mono', monospace", color: sc.covenant_breach_year ? '#b91c1c' : sc.survives_hold ? '#15803d' : '#b45309' }}
                >
                  {sc.covenant_breach_year
                    ? `⚠ Covenant breach Yr ${sc.covenant_breach_year}`
                    : sc.survives_hold ? '✓ Survives, no breach' : '⚠ Negative ECF'}
                </div>
              )}
              {(() => {
                const valid = (sc.dscr_by_year ?? []).filter((d) => d < 50);
                if (!valid.length) return null;
                const minDscr = Math.min(...valid);
                return (
                  <div className="text-[10px]" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
                    min DSCR {minDscr.toFixed(2)}x
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ScenarioPanel;
