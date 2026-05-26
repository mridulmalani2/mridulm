import React from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { fmtPct, fmtCurrency } from '../../../lib/formatters';
import { monitoringTerminationPayment } from '../../../lib/engine/returns';

/**
 * Sponsor-side return detail that the headline Returns card doesn't surface:
 *   • MIP promote payout and (when a ratchet schedule is set) the cleared tier
 *   • Monitoring-fee termination cost at exit (P4-11)
 *   • Partial-exit / IPO-selldown events (P4-5)
 *   • The realised equity cashflow stream (single source of truth for the IRR)
 * All values are read from existing engine outputs or recomputed from exposed
 * fields, so nothing here changes the computed returns.
 */
const SponsorReturnsDetail: React.FC = () => {
  const ms = useDealEngineStore((s) => s.modelState);
  if (!ms) return null;

  const ret = ms.returns;
  const currency = ms.currency ?? 'GBP';
  const hp = ms.exit.holding_period;
  const tiers = ms.mip.ratchet_tiers ?? [];
  const partialExits = (ms.exit.partial_exits ?? []).filter((e) => e.pct_sold > 0);
  const monTerm = monitoringTerminationPayment(ms);
  const cfs = ret.equity_cashflows ?? [];

  // Pre-MIP full-exit MOIC, recomputed exactly as the engine does (returns.ts),
  // so the "cleared tier" annotation matches the engine's hurdle test.
  const exitFee = ms.fees.exit_fee_pct * ret.exit_ev;
  const exitEquityPreMipFull = ret.exit_ev - ret.exit_net_debt - exitFee - monTerm;
  const preMipMoic = ret.entry_equity > 0 ? exitEquityPreMipFull / ret.entry_equity : 0;
  // Only annotate the cleared tier when no IRR dual-hurdle is configured (we don't
  // surface pre-MIP IRR here, so a MOIC-only marker would misrepresent that case).
  const tiersHaveIrrHurdle = tiers.some((t) => t.irr_threshold != null);
  let clearedIdx = -1;
  if (tiers.length && !tiersHaveIrrHurdle) {
    for (let i = 0; i < tiers.length; i++) {
      if (preMipMoic >= tiers[i].moic_threshold && (clearedIdx === -1 || tiers[i].moic_threshold > tiers[clearedIdx].moic_threshold)) {
        clearedIdx = i;
      }
    }
  }

  const hasInterim = cfs.slice(1, Math.max(1, cfs.length - 1)).some((c) => Math.abs(c) > 1e-9);
  const showMip = ret.mip_payout > 0 || tiers.length > 0;
  const showCashflows = partialExits.length > 0 || hasInterim;

  if (!showMip && monTerm <= 0 && partialExits.length === 0 && !showCashflows) return null;

  const sectionLabel = (text: string) => (
    <div className="text-[10px] font-medium tracking-widest uppercase mb-2" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
      {text}
    </div>
  );
  const mono = { fontFamily: "'JetBrains Mono', monospace" };

  const periodLabel = (i: number) => (i === 0 ? 'Entry' : i === hp ? 'Exit' : `Year ${i}`);

  return (
    <div className="p-5 mb-3" style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}>
      <div className="text-[10px] font-medium tracking-widest uppercase mb-4" style={{ color: 'rgba(17,17,17,0.4)', ...mono }}>
        Realisations &amp; Promote
      </div>

      {/* MIP promote */}
      {showMip && (
        <div className="mb-4">
          {sectionLabel('Management Incentive (MIP)')}
          <div className="flex items-baseline gap-3 mb-2">
            <span className="text-xl font-semibold" style={{ color: '#111111', ...mono }}>
              {fmtCurrency(ret.mip_payout, currency)}
            </span>
            <span className="text-[10px]" style={{ color: 'rgba(17,17,17,0.4)', ...mono }}>
              promote · pre-MIP MOIC {preMipMoic.toFixed(2)}x
            </span>
          </div>
          {tiers.length > 0 && (
            <table className="w-full text-[11px]" style={mono}>
              <thead>
                <tr style={{ color: 'rgba(17,17,17,0.35)' }}>
                  <th className="text-left font-normal py-1">Tier</th>
                  <th className="text-right font-normal py-1">MOIC Hurdle</th>
                  {tiersHaveIrrHurdle && <th className="text-right font-normal py-1">IRR Hurdle</th>}
                  <th className="text-right font-normal py-1">Pool %</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t, i) => {
                  const isCleared = i === clearedIdx;
                  return (
                    <tr key={i} style={{ color: isCleared ? '#15803d' : 'rgba(17,17,17,0.7)', fontWeight: isCleared ? 600 : 400 }}>
                      <td className="text-left py-1">{isCleared ? '▶ ' : ''}{i + 1}</td>
                      <td className="text-right py-1">{t.moic_threshold.toFixed(2)}x</td>
                      {tiersHaveIrrHurdle && <td className="text-right py-1">{t.irr_threshold != null ? fmtPct(t.irr_threshold) : '—'}</td>}
                      <td className="text-right py-1">{fmtPct(t.pool_pct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {tiers.length > 0 && clearedIdx === -1 && !tiersHaveIrrHurdle && (
            <div className="text-[10px] mt-1" style={{ color: 'rgba(17,17,17,0.4)', ...mono }}>No tier cleared at this MOIC.</div>
          )}
        </div>
      )}

      {/* Monitoring-fee termination */}
      {monTerm > 0 && (
        <div className="mb-4">
          {sectionLabel('Monitoring-Fee Termination (exit cost)')}
          <span className="text-base font-semibold" style={{ color: '#b91c1c', ...mono }}>
            −{fmtCurrency(monTerm, currency)}
          </span>
          <span className="text-[10px] ml-2" style={{ color: 'rgba(17,17,17,0.4)', ...mono }}>
            NPV of {ms.fees.monitoring_fee_termination_years} remaining yrs @ {fmtPct(ms.fees.monitoring_fee_discount_rate ?? 0.10)}
          </span>
        </div>
      )}

      {/* Partial exits */}
      {partialExits.length > 0 && (
        <div className="mb-4">
          {sectionLabel('Partial Exits / Selldown')}
          <table className="w-full text-[11px]" style={mono}>
            <thead>
              <tr style={{ color: 'rgba(17,17,17,0.35)' }}>
                <th className="text-left font-normal py-1">Year</th>
                <th className="text-right font-normal py-1">% of Stake</th>
                <th className="text-right font-normal py-1">Exit Mult.</th>
                <th className="text-right font-normal py-1">Fee %</th>
              </tr>
            </thead>
            <tbody>
              {partialExits.map((e, i) => (
                <tr key={i} style={{ color: 'rgba(17,17,17,0.7)' }}>
                  <td className="text-left py-1">{e.year}</td>
                  <td className="text-right py-1">{fmtPct(e.pct_sold)}</td>
                  <td className="text-right py-1">{e.exit_multiple.toFixed(1)}x</td>
                  <td className="text-right py-1">{fmtPct(e.exit_fee_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Realised equity cashflows */}
      {showCashflows && cfs.length > 0 && (
        <div>
          {sectionLabel('Realised Equity Cashflows')}
          <table className="w-full text-[11px]" style={mono}>
            <tbody>
              {cfs.map((cf, i) => (
                <tr key={i} style={{ color: cf < 0 ? '#b91c1c' : 'rgba(17,17,17,0.7)' }}>
                  <td className="text-left py-1">{periodLabel(i)}</td>
                  <td className="text-right py-1">{cf < 0 ? '−' : ''}{fmtCurrency(cf, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[9px] mt-1" style={{ color: 'rgba(17,17,17,0.35)', ...mono }}>
            Interim = distributions + partial-exit proceeds; exit = post-MIP residual.
          </div>
        </div>
      )}
    </div>
  );
};

export default SponsorReturnsDetail;
