import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts';
import { useDealEngineStore } from '../../../store/dealEngine';

const ValueBridge: React.FC = () => {
  const ms = useDealEngineStore((s) => s.modelState);
  if (!ms) return null;

  const vd = ms.value_drivers;
  const data = [
    { name: 'Entry Equity', value: vd.entry_equity, base: 0, fill: '#111111' },
    { name: 'Rev Growth', value: vd.revenue_growth_contribution_abs, base: vd.entry_equity, fill: '#15803d' },
    { name: 'Margin', value: vd.margin_expansion_contribution_abs, base: vd.entry_equity + vd.revenue_growth_contribution_abs, fill: '#15803d' },
    { name: 'Multiple', value: vd.multiple_expansion_contribution_abs, base: vd.entry_equity + vd.revenue_growth_contribution_abs + vd.margin_expansion_contribution_abs, fill: vd.multiple_expansion_contribution_abs >= 0 ? '#1d4ed8' : '#b91c1c' },
    { name: 'Debt Paydown', value: vd.debt_paydown_contribution_abs, base: vd.entry_equity + vd.revenue_growth_contribution_abs + vd.margin_expansion_contribution_abs + vd.multiple_expansion_contribution_abs, fill: '#1d4ed8' },
    { name: 'Fees', value: vd.fees_drag_contribution_abs, base: vd.exit_equity - vd.fees_drag_contribution_abs, fill: '#b91c1c' },
    { name: 'Exit Equity', value: vd.exit_equity, base: 0, fill: '#111111' },
  ];

  return (
    <div className="p-5 mb-3" style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}>
      <div className="text-[10px] font-medium tracking-widest uppercase mb-4" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
        Value Bridge
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barCategoryGap="15%">
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}
            axisLine={{ stroke: 'rgba(17,17,17,0.1)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#111111' }}
            labelStyle={{ color: '#111111' }}
            formatter={(val) => val != null ? [`£${Number(val).toFixed(1)}m`, ''] : ['—', '']}
          />
          {/* Invisible base bar */}
          <Bar dataKey="base" stackId="a" fill="transparent" />
          <Bar dataKey="value" stackId="a">
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* Contribution table */}
      <div className="grid grid-cols-5 gap-1 mt-3" style={{ borderTop: '1px solid rgba(17,17,17,0.08)', paddingTop: 12 }}>
        {[
          { label: 'Revenue', pct: vd.revenue_growth_contribution_pct, abs: vd.revenue_growth_contribution_abs },
          { label: 'Margin', pct: vd.margin_expansion_contribution_pct, abs: vd.margin_expansion_contribution_abs },
          { label: 'Multiple', pct: vd.multiple_expansion_contribution_pct, abs: vd.multiple_expansion_contribution_abs },
          { label: 'Debt', pct: vd.debt_paydown_contribution_pct, abs: vd.debt_paydown_contribution_abs },
          { label: 'Fees', pct: vd.fees_drag_contribution_pct, abs: vd.fees_drag_contribution_abs },
        ].map((d) => (
          <div key={d.label} className="text-center">
            <div className="text-xs font-semibold mb-0.5" style={{ color: '#111111', fontFamily: "'JetBrains Mono', monospace" }}>
              {d.pct.toFixed(0)}%
            </div>
            <div className="text-[9px] tracking-wider uppercase" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>{d.label}</div>
          </div>
        ))}
      </div>

      {/* Operational vs Financial Engineering split */}
      {vd.operational_pct > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(17,17,17,0.08)' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(17,17,17,0.06)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(vd.operational_pct, 100)}%`,
                  background: vd.operational_pct >= 50 ? '#15803d' : '#b45309',
                }}
              />
            </div>
            <span className="text-[10px] font-semibold" style={{ color: '#111', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
              {vd.operational_pct.toFixed(0)}% Operational
            </span>
          </div>

          {/* IC Insights */}
          {vd.insights && vd.insights.length > 0 && (
            <div className="space-y-1">
              {vd.insights.map((insight, i) => (
                <div
                  key={i}
                  className="text-[11px] px-2.5 py-1.5"
                  style={{
                    background: '#F9F9F7',
                    border: '1px solid rgba(17,17,17,0.06)',
                    fontFamily: 'Lora, serif',
                    color: 'rgba(17,17,17,0.55)',
                    lineHeight: '1.5',
                  }}
                >
                  {insight}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ValueBridge;
