import React from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { fmtPct, irrColor } from '../../../lib/formatters';

const CLASSIFICATION_COLORS: Record<string, string> = {
  Robust: '#15803d',
  'Moderate Risk': '#b45309',
  Fragile: '#b91c1c',
};

const FragilityPanel: React.FC = () => {
  const frag = useDealEngineStore((s) => s.modelState?.fragility);
  const apiKey = useDealEngineStore((s) => s.apiKey);

  if (!frag || frag.stress_results.length === 0) return null;

  const classColor = CLASSIFICATION_COLORS[frag.classification] || 'rgba(17,17,17,0.4)';

  return (
    <div className="p-5 mb-3" style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span
          className="text-[10px] font-medium tracking-widest uppercase"
          style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}
        >
          Fragility Dashboard
        </span>
        <span
          className="text-[10px] font-bold tracking-widest uppercase px-2.5 py-0.5"
          style={{
            color: classColor,
            border: `1px solid ${classColor}`,
            fontFamily: "'JetBrains Mono', monospace",
            background: 'transparent',
          }}
        >
          {frag.classification}
        </span>
      </div>

      {/* Base vs Stressed IRR hero */}
      <div className="grid grid-cols-3 gap-4 mb-4 pb-4" style={{ borderBottom: '1px solid rgba(17,17,17,0.08)' }}>
        <div>
          <div className="font-playfair text-3xl font-bold mb-1" style={{ color: irrColor(frag.base_irr) }}>
            {frag.base_irr != null ? fmtPct(frag.base_irr) : 'N/C'}
          </div>
          <div
            className="text-[10px] tracking-widest uppercase"
            style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace" }}
          >
            Base IRR
          </div>
        </div>
        <div>
          <div className="font-playfair text-3xl font-bold mb-1" style={{ color: irrColor(frag.combined_irr) }}>
            {frag.combined_irr != null ? fmtPct(frag.combined_irr) : 'N/C'}
          </div>
          <div
            className="text-[10px] tracking-widest uppercase"
            style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace" }}
          >
            Stressed IRR
          </div>
        </div>
        <div>
          <div
            className="font-playfair text-3xl font-bold mb-1"
            style={{ color: classColor }}
          >
            {(frag.score * 100).toFixed(0)}%
          </div>
          <div
            className="text-[10px] tracking-widest uppercase"
            style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace" }}
          >
            Fragility Score
          </div>
        </div>
      </div>

      {/* Stress scenarios table */}
      <div className="overflow-x-auto mb-4">
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(17,17,17,0.1)' }}>
              {['Scenario', 'IRR', 'MOIC', '\u0394IRR', '\u0394MOIC'].map((h) => (
                <th
                  key={h}
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'rgba(17,17,17,0.4)',
                    textAlign: h === 'Scenario' ? 'left' : 'right',
                    padding: '3px 6px',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {frag.stress_results.map((sr, i) => (
              <tr
                key={sr.scenario}
                style={{ background: i % 2 === 1 ? '#F9F9F7' : 'transparent' }}
              >
                <td
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: 'rgba(17,17,17,0.6)',
                    textAlign: 'left',
                    padding: '3px 6px',
                  }}
                >
                  {sr.scenario}
                </td>
                <td
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: irrColor(sr.irr),
                    textAlign: 'right',
                    padding: '3px 6px',
                  }}
                >
                  {sr.irr != null ? fmtPct(sr.irr) : 'N/C'}
                </td>
                <td
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: '#111',
                    textAlign: 'right',
                    padding: '3px 6px',
                  }}
                >
                  {sr.moic.toFixed(2)}x
                </td>
                <td
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: sr.delta_irr < 0 ? '#b91c1c' : '#15803d',
                    textAlign: 'right',
                    padding: '3px 6px',
                    fontWeight: 600,
                  }}
                >
                  {sr.delta_irr >= 0 ? '+' : ''}{(sr.delta_irr * 10000).toFixed(0)}bps
                </td>
                <td
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: sr.delta_moic < 0 ? '#b91c1c' : '#15803d',
                    textAlign: 'right',
                    padding: '3px 6px',
                  }}
                >
                  {sr.delta_moic >= 0 ? '+' : ''}{sr.delta_moic.toFixed(2)}x
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Key sensitivity callouts — only shown when API key is set */}
      {apiKey && frag.insights.length > 0 && (
        <>
          <div
            className="text-[10px] font-medium tracking-wider uppercase mb-2"
            style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}
          >
            IC Insights
          </div>
          <div className="space-y-1.5">
            {frag.insights.map((insight, i) => (
              <div
                key={i}
                className="text-xs px-3 py-2"
                style={{
                  background: '#F9F9F7',
                  border: '1px solid rgba(17,17,17,0.08)',
                  fontFamily: 'Lora, serif',
                  color: 'rgba(17,17,17,0.6)',
                  lineHeight: '1.5',
                }}
              >
                {insight}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default FragilityPanel;
