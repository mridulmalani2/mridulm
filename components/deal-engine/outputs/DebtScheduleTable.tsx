import React from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';

const DebtScheduleTable: React.FC = () => {
  const ms = useDealEngineStore((s) => s.modelState);
  if (!ms || !ms.debt_schedule.tranche_schedules.length) return null;

  const ds = ms.debt_schedule;
  const hp = ms.exit.holding_period;

  return (
    <div className="p-4 mb-3" style={{ background: '#0f1420', border: '1px solid #1e2a3a' }}>
      <div className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>
        Debt Schedule
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
          <thead>
            <tr>
              <th className="text-left py-1 px-2" style={{ color: '#6b7a96', borderBottom: '1px solid #1e2a3a' }}></th>
              {Array.from({ length: hp }, (_, i) => (
                <th key={i} className="text-right py-1 px-2" style={{ color: '#6b7a96', borderBottom: '1px solid #1e2a3a' }}>
                  Yr {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ds.tranche_schedules.map((sched, tIdx) => (
              <React.Fragment key={tIdx}>
                <tr>
                  <td className="py-1 px-2 font-medium" style={{ color: '#00d4ff' }} colSpan={hp + 1}>
                    {sched[0]?.tranche_name || `Tranche ${tIdx + 1}`}
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5 px-2" style={{ color: '#6b7a96' }}>Beg Bal</td>
                  {sched.map((y, i) => (
                    <td key={i} className="text-right py-0.5 px-2" style={{ color: '#e8edf5' }}>{y.beginning_balance.toFixed(1)}</td>
                  ))}
                </tr>
                <tr style={{ background: '#0a0d13' }}>
                  <td className="py-0.5 px-2" style={{ color: '#6b7a96' }}>Interest</td>
                  {sched.map((y, i) => (
                    <td key={i} className="text-right py-0.5 px-2" style={{ color: '#ff4757' }}>({y.cash_interest.toFixed(1)})</td>
                  ))}
                </tr>
                {sched.some((y) => y.pik_accrual > 0) && (
                  <tr>
                    <td className="py-0.5 px-2" style={{ color: '#6b7a96' }}>PIK</td>
                    {sched.map((y, i) => (
                      <td key={i} className="text-right py-0.5 px-2" style={{ color: '#ffaa00' }}>{y.pik_accrual.toFixed(1)}</td>
                    ))}
                  </tr>
                )}
                <tr style={{ background: '#0a0d13' }}>
                  <td className="py-0.5 px-2" style={{ color: '#6b7a96' }}>Repayment</td>
                  {sched.map((y, i) => (
                    <td key={i} className="text-right py-0.5 px-2" style={{ color: '#e8edf5' }}>({y.total_repayment.toFixed(1)})</td>
                  ))}
                </tr>
                <tr>
                  <td className="py-0.5 px-2 font-medium" style={{ color: '#6b7a96' }}>End Bal</td>
                  {sched.map((y, i) => (
                    <td key={i} className="text-right py-0.5 px-2 font-medium" style={{ color: '#e8edf5' }}>{y.ending_balance.toFixed(1)}</td>
                  ))}
                </tr>
              </React.Fragment>
            ))}
            {/* Footer metrics */}
            <tr style={{ borderTop: '1px solid #1e2a3a' }}>
              <td className="py-1 px-2 font-medium" style={{ color: '#6b7a96' }}>Leverage</td>
              {ds.leverage_ratio_by_year.map((v, i) => (
                <td key={i} className="text-right py-1 px-2" style={{ color: '#e8edf5' }}>{v.toFixed(1)}x</td>
              ))}
            </tr>
            <tr>
              <td className="py-1 px-2 font-medium" style={{ color: '#6b7a96' }}>Coverage</td>
              {ds.interest_coverage_by_year.map((v, i) => (
                <td key={i} className="text-right py-1 px-2" style={{ color: '#e8edf5' }}>{v > 50 ? '>50' : v.toFixed(1)}x</td>
              ))}
            </tr>
            <tr style={{ background: '#0a0d13' }}>
              <td className="py-1 px-2 font-medium" style={{ color: '#6b7a96' }}>DSCR</td>
              {ds.dscr_by_year.map((v, i) => (
                <td key={i} className="text-right py-1 px-2" style={{ color: '#e8edf5' }}>{v > 50 ? '>50' : v.toFixed(1)}x</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DebtScheduleTable;
