import React from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { oidAmortByYear } from '../../../lib/engine/oid';
import { attachTraceTarget } from '../TraceGraph/attachTraceTarget';
import { useTraceGraphContext } from '../TraceGraph/TraceGraphContext';

const DebtScheduleTable: React.FC = () => {
  const ms = useDealEngineStore((s) => s.modelState);
  const { traceModeActive, onOpenCard } = useTraceGraphContext();
  if (!ms || !ms.debt_schedule.tranche_schedules.length) return null;

  const ds = ms.debt_schedule;
  const hp = ms.exit.holding_period;
  const refiPremium = ds.refinancing_premium_by_year ?? [];
  const oidAmort = oidAmortByYear(ms);
  const hasRefiPremium = refiPremium.some((v) => v > 0);
  const hasOidAmort = oidAmort.some((v) => v > 0);

  return (
    <div className="p-5 mb-3" style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}>
      <div className="text-[10px] font-medium tracking-widest uppercase mb-4" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
        Debt Schedule
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <thead>
            <tr>
              <th className="text-left py-1.5 px-2" style={{ color: 'rgba(17,17,17,0.4)', borderBottom: '1px solid rgba(17,17,17,0.1)' }}></th>
              {Array.from({ length: hp }, (_, i) => (
                <th key={i} className="text-right py-1.5 px-2 text-[10px] tracking-wider" style={{ color: 'rgba(17,17,17,0.4)', borderBottom: '1px solid rgba(17,17,17,0.1)' }}>
                  Yr {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ds.tranche_schedules.map((sched, tIdx) => (
              <React.Fragment key={tIdx}>
                <tr>
                  <td className="py-1.5 px-2 font-medium text-[10px] tracking-widest uppercase" style={{ color: '#CC0000' }} colSpan={hp + 1}>
                    {sched[0]?.tranche_name || `Tranche ${tIdx + 1}`}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 px-2 text-[10px]" style={{ color: 'rgba(17,17,17,0.4)' }}>Beg Bal</td>
                  {sched.map((y, i) => (
                    <td key={i} className="text-right py-1 px-2" style={{ color: '#111111' }}>{y.beginning_balance.toFixed(1)}</td>
                  ))}
                </tr>
                <tr style={{ background: 'rgba(17,17,17,0.02)' }}>
                  <td className="py-1 px-2 text-[10px]" style={{ color: 'rgba(17,17,17,0.4)' }}>Interest</td>
                  {sched.map((y, i) => (
                    <td key={i} className="text-right py-1 px-2" style={{ color: '#b91c1c' }}>({y.cash_interest.toFixed(1)})</td>
                  ))}
                </tr>
                {sched.some((y) => y.pik_accrual > 0) && (
                  <tr>
                    <td className="py-1 px-2 text-[10px]" style={{ color: 'rgba(17,17,17,0.4)' }}>PIK</td>
                    {sched.map((y, i) => (
                      <td key={i} className="text-right py-1 px-2" style={{ color: '#b45309' }}>{y.pik_accrual.toFixed(1)}</td>
                    ))}
                  </tr>
                )}
                {ms.debt_tranches[tIdx]?.pik_toggle && (
                  <tr>
                    <td className="py-1 px-2 text-[10px]" style={{ color: 'rgba(17,17,17,0.4)' }}>Election</td>
                    {sched.map((y, i) => (
                      <td key={i} className="text-right py-1 px-2 text-[10px]" style={{ color: y.pik_accrual > 0 ? '#b45309' : '#15803d' }}>
                        {y.pik_accrual > 0 ? 'PIK' : 'Cash'}
                      </td>
                    ))}
                  </tr>
                )}
                <tr style={{ background: 'rgba(17,17,17,0.02)' }}>
                  <td className="py-1 px-2 text-[10px]" style={{ color: 'rgba(17,17,17,0.4)' }}>Repayment</td>
                  {sched.map((y, i) => (
                    <td key={i} className="text-right py-1 px-2" style={{ color: '#111111' }}>({y.total_repayment.toFixed(1)})</td>
                  ))}
                </tr>
                <tr>
                  <td className="py-1 px-2 font-medium text-[10px]" style={{ color: 'rgba(17,17,17,0.4)' }}>End Bal</td>
                  {sched.map((y, i) => (
                    <td key={i} className="text-right py-1 px-2 font-semibold" style={{ color: '#111111' }}>
                      {i === hp - 1 && tIdx === ds.tranche_schedules.length - 1 ? (
                        <span {...attachTraceTarget('debt_schedule.total_debt_at_exit', traceModeActive, onOpenCard)}>
                          {y.ending_balance.toFixed(1)}
                        </span>
                      ) : y.ending_balance.toFixed(1)}
                    </td>
                  ))}
                </tr>
              </React.Fragment>
            ))}
            {/* Footer metrics */}
            <tr style={{ borderTop: '1px solid rgba(17,17,17,0.1)' }}>
              <td className="py-1.5 px-2 font-medium text-[10px] tracking-wider uppercase" style={{ color: 'rgba(17,17,17,0.4)' }}>Leverage</td>
              {ds.leverage_ratio_by_year.map((v, i) => (
                <td key={i} className="text-right py-1.5 px-2" style={{ color: '#111111' }}>{v.toFixed(1)}x</td>
              ))}
            </tr>
            <tr>
              <td className="py-1.5 px-2 font-medium text-[10px] tracking-wider uppercase" style={{ color: 'rgba(17,17,17,0.4)' }}>Coverage</td>
              {ds.interest_coverage_by_year.map((v, i) => (
                <td key={i} className="text-right py-1.5 px-2" style={{ color: '#111111' }}>
                  {i === hp - 1 ? (
                    <span {...attachTraceTarget('debt_schedule.interest_coverage_at_exit', traceModeActive, onOpenCard)}>
                      {v > 50 ? '>50' : v.toFixed(1)}x
                    </span>
                  ) : (
                    <>{v > 50 ? '>50' : v.toFixed(1)}x</>
                  )}
                </td>
              ))}
            </tr>
            <tr style={{ background: 'rgba(17,17,17,0.02)' }}>
              <td className="py-1.5 px-2 font-medium text-[10px] tracking-wider uppercase" style={{ color: 'rgba(17,17,17,0.4)' }}>DSCR</td>
              {ds.dscr_by_year.map((v, i) => (
                <td key={i} className="text-right py-1.5 px-2" style={{ color: '#111111' }}>{v > 50 ? '>50' : v.toFixed(1)}x</td>
              ))}
            </tr>
            {hasRefiPremium && (
              <tr title="One-time refinancing call / prepayment premium paid in cash (P4-3)">
                <td className="py-1.5 px-2 font-medium text-[10px] tracking-wider uppercase" style={{ color: 'rgba(17,17,17,0.4)' }}>Refi Premium</td>
                {Array.from({ length: hp }, (_, i) => (
                  <td key={i} className="text-right py-1.5 px-2" style={{ color: (refiPremium[i] ?? 0) > 0 ? '#b91c1c' : 'rgba(17,17,17,0.25)' }}>
                    {(refiPremium[i] ?? 0) > 0 ? `(${refiPremium[i].toFixed(1)})` : '—'}
                  </td>
                ))}
              </tr>
            )}
            {hasOidAmort && (
              <tr style={{ background: 'rgba(17,17,17,0.02)' }} title="Non-cash OID amortisation (straight-line over maturity), tax-deductible (P4-14)">
                <td className="py-1.5 px-2 font-medium text-[10px] tracking-wider uppercase" style={{ color: 'rgba(17,17,17,0.4)' }}>OID Amort</td>
                {oidAmort.map((v, i) => (
                  <td key={i} className="text-right py-1.5 px-2" style={{ color: v > 0 ? '#b45309' : 'rgba(17,17,17,0.25)' }}>
                    {v > 0 ? v.toFixed(2) : '—'}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DebtScheduleTable;
