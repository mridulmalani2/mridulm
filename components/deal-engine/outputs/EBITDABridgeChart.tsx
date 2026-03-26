import React from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';

const fmt = (v: number) => v.toFixed(1);

const EBITDABridgeChart: React.FC = () => {
  const bridge = useDealEngineStore((s) => s.modelState?.ebitda_bridge);
  const currency = useDealEngineStore((s) => s.modelState?.currency || 'GBP');

  if (!bridge || bridge.entry_ebitda === 0) return null;

  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '\u20AC' : currency === 'CHF' ? 'CHF ' : '\u00A3';

  const headerStyle = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    fontWeight: 600 as const,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'rgba(17,17,17,0.4)',
    paddingBottom: 6,
    borderBottom: '2px solid #111',
  };

  const items = [
    { label: 'Entry EBITDA', value: bridge.entry_ebitda, type: 'base' as const },
    { label: 'Revenue Growth', value: bridge.organic_revenue_contribution, type: 'positive' as const },
    { label: 'Margin Expansion', value: bridge.margin_expansion_contribution, type: bridge.margin_expansion_contribution >= 0 ? 'positive' as const : 'negative' as const },
    ...(bridge.cost_synergies !== 0 ? [{ label: 'Cost Synergies', value: bridge.cost_synergies, type: 'positive' as const }] : []),
    ...(bridge.add_on_ebitda !== 0 ? [{ label: 'Add-on EBITDA', value: bridge.add_on_ebitda, type: 'positive' as const }] : []),
    ...(bridge.integration_costs !== 0 ? [{ label: 'Integration Costs', value: -bridge.integration_costs, type: 'negative' as const }] : []),
    ...(bridge.monitoring_fees !== 0 ? [{ label: 'Monitoring Fees', value: -bridge.monitoring_fees, type: 'negative' as const }] : []),
    { label: 'Exit EBITDA', value: bridge.exit_ebitda, type: 'base' as const },
  ];

  // Waterfall chart bars
  const maxVal = Math.max(...items.map((i) => Math.abs(i.value)), bridge.entry_ebitda, bridge.exit_ebitda);
  const barScale = maxVal > 0 ? 100 / maxVal : 0;

  return (
    <div className="p-4" style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}>
      <span style={headerStyle}>EBITDA Bridge</span>

      <div className="mt-4 space-y-2">
        {items.map((item) => {
          const width = Math.abs(item.value) * barScale;
          const color = item.type === 'base' ? '#111111'
            : item.type === 'positive' ? '#15803d'
            : '#b91c1c';
          const bgColor = item.type === 'base' ? 'rgba(17,17,17,0.08)'
            : item.type === 'positive' ? 'rgba(21,128,61,0.12)'
            : 'rgba(185,28,28,0.12)';

          return (
            <div key={item.label} className="flex items-center gap-3">
              <span
                className="w-32 text-right flex-shrink-0"
                style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'rgba(17,17,17,0.5)' }}
              >
                {item.label}
              </span>
              <div className="flex-1 h-5 relative" style={{ background: '#F9F9F7' }}>
                <div
                  className="h-full"
                  style={{ width: `${Math.min(width, 100)}%`, background: bgColor, borderRight: `2px solid ${color}` }}
                />
              </div>
              <span
                className="w-16 text-right flex-shrink-0"
                style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color, fontWeight: item.type === 'base' ? 600 : 400 }}
              >
                {item.value >= 0 ? '+' : ''}{sym}{fmt(item.value)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Growth summary */}
      <div className="mt-3 flex gap-4">
        <span className="text-[10px]" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
          EBITDA Growth: {bridge.entry_ebitda > 0 ? ((bridge.exit_ebitda / bridge.entry_ebitda - 1) * 100).toFixed(1) : '0.0'}%
        </span>
        <span className="text-[10px]" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
          CAGR: {bridge.entry_ebitda > 0 ? ((Math.pow(bridge.exit_ebitda / bridge.entry_ebitda, 0.2) - 1) * 100).toFixed(1) : '0.0'}%
        </span>
      </div>
    </div>
  );
};

export default EBITDABridgeChart;
