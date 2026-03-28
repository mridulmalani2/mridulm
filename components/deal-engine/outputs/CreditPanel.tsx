import React from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';

const fmt = (v: number, decimals = 1) => v.toFixed(decimals);
const pct = (v: number) => (v * 100).toFixed(1) + '%';

const CreditPanel: React.FC = () => {
  const ca = useDealEngineStore((s) => s.modelState?.credit_analysis);
  const currency = useDealEngineStore((s) => s.modelState?.currency || 'GBP');

  if (!ca || ca.metrics_by_year.length === 0) return null;

  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '\u20AC' : currency === 'INR' ? '\u20B9' : currency === 'JPY' ? '\u00A5' : '\u00A3';

  const headerStyle = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    fontWeight: 600 as const,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'rgba(17,17,17,0.4)',
  };
  const cellStyle = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: '#111111',
    textAlign: 'right' as const,
    padding: '3px 6px',
  };
  const labelCell = {
    ...cellStyle,
    textAlign: 'left' as const,
    color: 'rgba(17,17,17,0.6)',
  };

  const ratingColor = ca.credit_rating_estimate.startsWith('BBB') ? '#15803d'
    : ca.credit_rating_estimate.startsWith('BB') ? '#b45309'
    : '#b91c1c';

  return (
    <div className="p-4" style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}>
      <div className="flex items-center justify-between mb-3">
        <span style={{ ...headerStyle, borderBottom: '2px solid #111', paddingBottom: 6 }}>
          Credit Analysis
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[10px]" style={{ color: ratingColor, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
            Est. {ca.credit_rating_estimate}
          </span>
          {ca.refinancing_risk && (
            <span className="text-[10px] px-1.5 py-0.5" style={{ background: '#fff5f5', color: '#b91c1c', fontFamily: "'JetBrains Mono', monospace", border: '1px solid rgba(185,28,28,0.2)' }}>
              REFI RISK
            </span>
          )}
        </div>
      </div>

      {/* Credit metrics table */}
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(17,17,17,0.1)' }}>
              <th style={{ ...headerStyle, textAlign: 'left', padding: '3px 6px' }}>Year</th>
              {ca.metrics_by_year.map((m) => (
                <th key={m.year} style={{ ...headerStyle, textAlign: 'right', padding: '3px 6px' }}>
                  {m.year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={labelCell}>Leverage (x)</td>
              {ca.metrics_by_year.map((m) => (
                <td key={m.year} style={{ ...cellStyle, color: m.leverage > 6 ? '#b91c1c' : m.leverage > 4.5 ? '#b45309' : '#111' }}>
                  {fmt(m.leverage)}x
                </td>
              ))}
            </tr>
            <tr style={{ background: '#F9F9F7' }}>
              <td style={labelCell}>Senior Lev. (x)</td>
              {ca.metrics_by_year.map((m) => (
                <td key={m.year} style={cellStyle}>{fmt(m.senior_leverage)}x</td>
              ))}
            </tr>
            <tr>
              <td style={labelCell}>ICR (x)</td>
              {ca.metrics_by_year.map((m) => (
                <td key={m.year} style={{ ...cellStyle, color: m.interest_coverage < 2 ? '#b91c1c' : '#111' }}>
                  {fmt(m.interest_coverage)}x
                </td>
              ))}
            </tr>
            <tr style={{ background: '#F9F9F7' }}>
              <td style={labelCell}>FCCR (x)</td>
              {ca.metrics_by_year.map((m) => (
                <td key={m.year} style={{ ...cellStyle, color: m.fccr < 1.1 ? '#b91c1c' : m.fccr < 1.5 ? '#b45309' : '#111' }}>
                  {fmt(m.fccr)}x
                </td>
              ))}
            </tr>
            <tr>
              <td style={labelCell}>DSCR (x)</td>
              {ca.metrics_by_year.map((m) => (
                <td key={m.year} style={{ ...cellStyle, color: m.dscr < 1 ? '#b91c1c' : '#111' }}>
                  {fmt(m.dscr)}x
                </td>
              ))}
            </tr>
            <tr style={{ background: '#F9F9F7' }}>
              <td style={labelCell}>Cov. Headroom</td>
              {ca.covenant_headroom_by_year.map((h, i) => (
                <td key={i} style={{ ...cellStyle, color: h < 1 ? '#b91c1c' : h < 2 ? '#b45309' : '#15803d' }}>
                  {fmt(h)}x
                </td>
              ))}
            </tr>
            <tr>
              <td style={labelCell}>Debt Paydown</td>
              {ca.metrics_by_year.map((m) => (
                <td key={m.year} style={cellStyle}>{pct(m.debt_paydown_pct)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Debt capacity + Recovery */}
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div>
          <div className="text-[10px] font-medium tracking-wider uppercase mb-2" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
            Max Debt Capacity
          </div>
          <div className="space-y-1">
            {[
              { label: '4.0x EBITDA', value: ca.max_debt_capacity_at_4x },
              { label: '5.0x EBITDA', value: ca.max_debt_capacity_at_5x },
              { label: '6.0x EBITDA', value: ca.max_debt_capacity_at_6x },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                <span style={{ color: 'rgba(17,17,17,0.5)' }}>{label}</span>
                <span style={{ color: '#111' }}>{sym}{fmt(value)}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-medium tracking-wider uppercase mb-2" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
            Recovery (50% EV Stress)
          </div>
          <div className="space-y-1">
            {ca.recovery_waterfall.map((r) => (
              <div key={r.tranche} className="flex justify-between" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                <span style={{ color: 'rgba(17,17,17,0.5)' }}>{r.tranche}</span>
                <span style={{ color: r.recovery_pct >= 1 ? '#15803d' : r.recovery_pct >= 0.5 ? '#b45309' : '#b91c1c' }}>
                  {pct(r.recovery_pct)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {ca.refinancing_risk && (
        <div className="mt-3 p-2 text-[10px]" style={{ background: '#fff5f5', border: '1px solid rgba(185,28,28,0.15)', fontFamily: "'JetBrains Mono', monospace", color: '#b91c1c' }}>
          {ca.refinancing_risk_detail}
        </div>
      )}
    </div>
  );
};

export default CreditPanel;
