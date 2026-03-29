import React from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';

const fmt = (v: number, decimals = 1) => v.toFixed(decimals);
const pct = (v: number) => (v * 100).toFixed(1) + '%';

const SourcesUsesTable: React.FC = () => {
  const su = useDealEngineStore((s) => s.modelState?.sources_and_uses);
  const currency = useDealEngineStore((s) => s.modelState?.currency || 'GBP');

  if (!su || su.total_uses === 0) return null;

  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '\u20AC' : currency === 'INR' ? '₹' : currency === 'JPY' ? '¥' : '\u00A3';

  const rowStyle = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: '#111111',
  };
  const labelStyle = { ...rowStyle, color: 'rgba(17,17,17,0.6)' };
  const totalStyle = {
    ...rowStyle,
    fontWeight: 700 as const,
    borderTop: '1px solid rgba(17,17,17,0.2)',
    paddingTop: 4,
  };
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

  return (
    <div className="p-4" style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}>
      <div className="flex items-center justify-between mb-3">
        <span style={headerStyle}>Sources &amp; Uses</span>
        <span className="text-[10px]" style={{ color: '#CC0000', fontFamily: "'JetBrains Mono', monospace" }}>
          {fmt(su.implied_leverage, 1)}x leverage
        </span>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Uses */}
        <div>
          <div className="text-[10px] font-medium tracking-wider uppercase mb-2" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
            Uses
          </div>
          <div className="space-y-1">
            <div className="flex justify-between" style={labelStyle}>
              <span>Enterprise Value</span>
              <span style={rowStyle}>{sym}{fmt(su.enterprise_value)}</span>
            </div>
            <div className="flex justify-between" style={labelStyle}>
              <span>Transaction Fees</span>
              <span style={rowStyle}>{sym}{fmt(su.transaction_fees)}</span>
            </div>
            <div className="flex justify-between" style={labelStyle}>
              <span>Financing Fees</span>
              <span style={rowStyle}>{sym}{fmt(su.financing_fees)}</span>
            </div>
            {su.cash_to_balance_sheet > 0 && (
              <div className="flex justify-between" style={labelStyle}>
                <span>Cash to B/S</span>
                <span style={rowStyle}>{sym}{fmt(su.cash_to_balance_sheet)}</span>
              </div>
            )}
            <div className="flex justify-between mt-1" style={totalStyle}>
              <span>Total Uses</span>
              <span>{sym}{fmt(su.total_uses)}</span>
            </div>
          </div>
        </div>

        {/* Sources */}
        <div>
          <div className="text-[10px] font-medium tracking-wider uppercase mb-2" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
            Sources
          </div>
          <div className="space-y-1">
            {su.debt_sources.map((d) => (
              <div key={d.name} className="flex justify-between" style={labelStyle}>
                <span>{d.name}</span>
                <span style={rowStyle}>{sym}{fmt(d.amount)}</span>
              </div>
            ))}
            {su.rollover_equity > 0 && (
              <div className="flex justify-between" style={labelStyle}>
                <span>Rollover Equity</span>
                <span style={rowStyle}>{sym}{fmt(su.rollover_equity)}</span>
              </div>
            )}
            <div className="flex justify-between" style={labelStyle}>
              <span>Sponsor Equity</span>
              <span style={rowStyle}>{sym}{fmt(su.sponsor_equity)}</span>
            </div>
            <div className="flex justify-between mt-1" style={totalStyle}>
              <span>Total Sources</span>
              <span>{sym}{fmt(su.total_sources)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary bar + Audit check */}
      <div className="mt-3 flex items-center gap-4">
        <span className="text-[10px]" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
          Debt: {pct(su.debt_pct_of_total)}
        </span>
        <span className="text-[10px]" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
          Equity: {pct(su.equity_pct_of_total)}
        </span>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 ml-auto"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: su.sources_uses_balanced ? '#15803d' : '#b91c1c',
            border: `1px solid ${su.sources_uses_balanced ? 'rgba(21,128,61,0.3)' : 'rgba(185,28,28,0.3)'}`,
            background: su.sources_uses_balanced ? 'rgba(21,128,61,0.04)' : 'rgba(185,28,28,0.04)',
          }}
        >
          {su.sources_uses_balanced ? 'S=U ✓' : `IMBALANCE: ${sym}${fmt(Math.abs(su.imbalance))}`}
        </span>
      </div>
    </div>
  );
};

export default SourcesUsesTable;
