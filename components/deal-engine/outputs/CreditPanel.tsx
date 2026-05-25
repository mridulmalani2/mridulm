import React from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';

const fmt = (v: number, decimals = 1) => v.toFixed(decimals);
const fmtCcy = (v: number, decimals = 1) => (v >= 0 ? '' : '(') + Math.abs(v).toFixed(decimals) + (v < 0 ? ')' : '');
const pct = (v: number) => (v * 100).toFixed(1) + '%';

const CreditPanel: React.FC = () => {
  const ca = useDealEngineStore((s) => s.modelState?.credit_analysis);
  const cov = useDealEngineStore((s) => s.modelState?.credit_covenants);
  const ds = useDealEngineStore((s) => s.modelState?.debt_schedule);
  const currency = useDealEngineStore((s) => s.modelState?.currency || 'GBP');
  // When the debt/interest loop didn't converge, credit metrics are computed on an
  // unconverged schedule — degrade them visually rather than presenting as reliable.
  const degraded = useDealEngineStore((s) => s.modelState?.returns?.debt_convergence_failed ?? false);

  if (!ca || ca.metrics_by_year.length === 0) return null;

  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '\u20AC' : currency === 'INR' ? '\u20B9' : currency === 'JPY' ? '\u00A5' : '\u00A3';

  const leverageCov = cov?.leverage_covenant ?? 6.0;
  const dscrCov = cov?.dscr_covenant ?? 1.15;
  const fccrCov = cov?.fccr_covenant ?? 1.10;

  const hasInsolvencyRisk = ca.insolvency_warning_by_year?.some(w => w);

  // A3: cash-trap (distribution block) + springing-DSCR covenant surfacing.
  const distBlocked = ds?.distribution_blocked_by_year ?? [];
  const springBreach = ca.springing_breach_by_year ?? [];
  const showDistBlocked = cov?.distribution_block_leverage != null || cov?.distribution_block_dscr != null || distBlocked.some(Boolean);
  const showSpringing = cov?.springing_dscr_covenant != null || springBreach.some(Boolean);

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

  const assessmentColor = (a: string) => (a === 'Conservative' || a === 'Unlevered') ? '#15803d'
    : (a === 'Moderate' || a === 'Leveraged') ? '#b45309'
    : '#b91c1c';

  // Helper: colour a headroom value (positive = OK, negative = breach)
  const headroomColor = (h: number) => h < 0 ? '#b91c1c' : h < 0.25 ? '#b45309' : '#111';

  return (
    <div className="p-4" style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}>
      <div className="flex items-center justify-between mb-3">
        <span style={{ ...headerStyle, borderBottom: '2px solid #111', paddingBottom: 6 }}>
          Credit Analysis
        </span>
        <div className="flex items-center gap-3">
          <span
            className="text-[10px]"
            title="Indicative leverage tier based on entry leverage only — not a credit rating. Excludes coverage, industry, business quality and jurisdiction."
            style={{ color: assessmentColor(ca.leverage_assessment), fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}
          >
            Lev: {ca.leverage_assessment}
          </span>
          {hasInsolvencyRisk && (
            <span className="text-[10px] px-1.5 py-0.5" style={{ background: '#fff5f5', color: '#b91c1c', fontFamily: "'JetBrains Mono', monospace", border: '1px solid rgba(185,28,28,0.2)', fontWeight: 700 }}>
              DEFAULT RISK
            </span>
          )}
          {ca.refinancing_risk && (
            <span className="text-[10px] px-1.5 py-0.5" style={{ background: '#fff5f5', color: '#b91c1c', fontFamily: "'JetBrains Mono', monospace", border: '1px solid rgba(185,28,28,0.2)' }}>
              REFI RISK
            </span>
          )}
        </div>
      </div>

      {/* Insolvency warning banner */}
      {hasInsolvencyRisk && (
        <div className="mb-3 p-2 text-[10px]" style={{ background: '#fff5f5', border: '1px solid rgba(185,28,28,0.3)', fontFamily: "'JetBrains Mono', monospace", color: '#b91c1c', fontWeight: 600 }}>
          ⚠ INSOLVENCY RISK: Negative Excess Cash Flow detected — mandatory debt service exceeds operating cash flow.
          This is a covenant breach / potential default scenario. Consider revolver availability, equity cure rights, or debt restructuring.
        </div>
      )}

      {degraded && (
        <div className="mb-3 p-2 text-[10px]" style={{ background: '#fff5f5', border: '1px solid rgba(185,28,28,0.3)', fontFamily: "'JetBrains Mono', monospace", color: '#b91c1c', fontWeight: 600 }}>
          ⚠ UNCONVERGED: Credit metrics below are computed on an unconverged debt schedule — indicative only.
        </div>
      )}

      {/* Credit metrics table */}
      <div className="overflow-x-auto" style={{ opacity: degraded ? 0.5 : 1 }}>
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
            {/* Leverage */}
            <tr>
              <td style={labelCell}>Leverage (x)</td>
              {ca.metrics_by_year.map((m) => (
                <td key={m.year} style={{ ...cellStyle, color: m.leverage > leverageCov ? '#b91c1c' : m.leverage > leverageCov * 0.75 ? '#b45309' : '#111' }}>
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
            {/* ICR */}
            <tr>
              <td style={labelCell}>ICR (x)</td>
              {ca.metrics_by_year.map((m) => (
                <td key={m.year} style={{ ...cellStyle, color: m.interest_coverage < 2 ? '#b91c1c' : '#111' }}>
                  {fmt(m.interest_coverage)}x
                </td>
              ))}
            </tr>
            {/* FCCR with covenant */}
            <tr style={{ background: '#F9F9F7' }}>
              <td style={{ ...labelCell, fontWeight: 600 }}>FCCR (x) ≥{fccrCov.toFixed(2)}x</td>
              {ca.metrics_by_year.map((m) => (
                <td key={m.year} style={{ ...cellStyle, color: m.fccr < fccrCov ? '#b91c1c' : m.fccr < fccrCov + 0.25 ? '#b45309' : '#111' }}>
                  {fmt(m.fccr)}x
                </td>
              ))}
            </tr>
            {/* FCCR covenant headroom */}
            {ca.fccr_headroom_by_year?.length > 0 && (
              <tr>
                <td style={{ ...labelCell, fontSize: 10, color: 'rgba(17,17,17,0.45)' }}>  FCCR Headroom</td>
                {ca.fccr_headroom_by_year.map((h, i) => (
                  <td key={i} style={{ ...cellStyle, fontSize: 10, color: headroomColor(h) }}>
                    {h >= 0 ? '+' : ''}{fmt(h)}x
                  </td>
                ))}
              </tr>
            )}
            {/* DSCR with covenant */}
            <tr style={{ background: '#F9F9F7' }}>
              <td style={{ ...labelCell, fontWeight: 600 }}>DSCR (x) ≥{dscrCov.toFixed(2)}x</td>
              {ca.metrics_by_year.map((m) => (
                <td key={m.year} style={{ ...cellStyle, color: m.dscr < dscrCov ? '#b91c1c' : m.dscr < dscrCov + 0.15 ? '#b45309' : '#111' }}>
                  {fmt(m.dscr)}x
                </td>
              ))}
            </tr>
            {/* DSCR covenant headroom */}
            {ca.dscr_headroom_by_year?.length > 0 && (
              <tr>
                <td style={{ ...labelCell, fontSize: 10, color: 'rgba(17,17,17,0.45)' }}>  DSCR Headroom</td>
                {ca.dscr_headroom_by_year.map((h, i) => (
                  <td key={i} style={{ ...cellStyle, fontSize: 10, color: headroomColor(h) }}>
                    {h >= 0 ? '+' : ''}{fmt(h)}x
                  </td>
                ))}
              </tr>
            )}
            {/* Leverage covenant headroom */}
            <tr style={{ background: '#F9F9F7' }}>
              <td style={labelCell}>Lev. Headroom vs {leverageCov.toFixed(1)}x</td>
              {ca.covenant_headroom_by_year.map((h, i) => (
                <td key={i} style={{ ...cellStyle, color: h < 0 ? '#b91c1c' : h < 1 ? '#b45309' : '#15803d' }}>
                  {fmt(h)}x
                </td>
              ))}
            </tr>
            {/* ECF — Excess Cash Flow */}
            {ca.ecf_by_year?.length > 0 && (
              <tr>
                <td style={{ ...labelCell, fontWeight: 600 }}>ECF ({sym}m)</td>
                {ca.ecf_by_year.map((ecf, i) => (
                  <td key={i} style={{ ...cellStyle, color: ecf < 0 ? '#b91c1c' : '#15803d', fontWeight: ecf < 0 ? 700 : 400 }}>
                    {ecf < 0 ? '⚠ ' : ''}{fmtCcy(ecf)}
                  </td>
                ))}
              </tr>
            )}
            {/* Debt Paydown */}
            <tr style={{ background: '#F9F9F7' }}>
              <td style={labelCell}>Debt Paydown</td>
              {ca.metrics_by_year.map((m) => (
                <td key={m.year} style={cellStyle}>{pct(m.debt_paydown_pct)}</td>
              ))}
            </tr>
            {/* Springing DSCR covenant (P4-8) — only in drawn years */}
            {showSpringing && (
              <tr>
                <td style={{ ...labelCell, fontWeight: 600 }} title="Tighter DSCR test that springs when revolver utilisation exceeds the trigger.">
                  Springing DSCR{cov?.springing_dscr_covenant != null ? ` ≥${cov.springing_dscr_covenant.toFixed(2)}x` : ''}
                </td>
                {ca.metrics_by_year.map((m, i) => (
                  <td key={m.year} style={{ ...cellStyle, color: springBreach[i] ? '#b91c1c' : 'rgba(17,17,17,0.35)', fontWeight: springBreach[i] ? 700 : 400 }}>
                    {springBreach[i] ? 'BREACH' : '—'}
                  </td>
                ))}
              </tr>
            )}
            {/* Cash trap / restricted payments (P4-13) */}
            {showDistBlocked && (
              <tr style={{ background: '#F9F9F7' }}>
                <td style={{ ...labelCell, fontWeight: 600 }} title="Interim distributions blocked when the leverage / DSCR trigger is hit.">
                  Dist. Blocked
                </td>
                {ca.metrics_by_year.map((m, i) => (
                  <td key={m.year} style={{ ...cellStyle, color: distBlocked[i] ? '#b91c1c' : 'rgba(17,17,17,0.35)', fontWeight: distBlocked[i] ? 700 : 400 }}>
                    {distBlocked[i] ? 'BLOCKED' : '—'}
                  </td>
                ))}
              </tr>
            )}
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
              { label: `${leverageCov.toFixed(1)}x EBITDA`, value: ca.max_debt_capacity_at_6x },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                <span style={{ color: 'rgba(17,17,17,0.5)' }}>{label}</span>
                <span style={{ color: '#111' }}>{sym}{fmt(value)}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-medium tracking-wider uppercase mb-1" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
            Recovery Waterfall
          </div>
          {(ca.recovery_default_year != null || ca.recovery_stress_ev != null) && (
            <div className="text-[9px] mb-2" style={{ color: 'rgba(17,17,17,0.45)', fontFamily: "'JetBrains Mono', monospace" }}>
              {ca.recovery_default_year != null ? `Yr-of-default: Yr ${ca.recovery_default_year}` : ''}
              {ca.recovery_stress_ev != null ? ` · distressed EV ${sym}${fmt(ca.recovery_stress_ev)}` : ''}
            </div>
          )}
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
