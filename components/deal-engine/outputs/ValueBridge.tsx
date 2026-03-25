import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts';
import { useDealEngineStore } from '../../../store/dealEngine';

const ValueBridge: React.FC = () => {
  const ms = useDealEngineStore((s) => s.modelState);
  if (!ms) return null;

  const vd = ms.value_drivers;
  const data = [
    { name: 'Entry Equity', value: vd.entry_equity, base: 0, fill: '#e8edf5' },
    { name: 'Rev Growth', value: vd.revenue_growth_contribution_abs, base: vd.entry_equity, fill: '#00d4ff' },
    { name: 'Margin', value: vd.margin_expansion_contribution_abs, base: vd.entry_equity + vd.revenue_growth_contribution_abs, fill: '#00d4ff' },
    { name: 'Multiple', value: vd.multiple_expansion_contribution_abs, base: vd.entry_equity + vd.revenue_growth_contribution_abs + vd.margin_expansion_contribution_abs, fill: vd.multiple_expansion_contribution_abs >= 0 ? '#00d4ff' : '#ff4757' },
    { name: 'Debt Paydown', value: vd.debt_paydown_contribution_abs, base: vd.entry_equity + vd.revenue_growth_contribution_abs + vd.margin_expansion_contribution_abs + vd.multiple_expansion_contribution_abs, fill: '#00c896' },
    { name: 'Fees', value: vd.fees_drag_contribution_abs, base: vd.exit_equity - vd.fees_drag_contribution_abs, fill: '#ff4757' },
    { name: 'Exit Equity', value: vd.exit_equity, base: 0, fill: '#e8edf5' },
  ];

  return (
    <div className="p-4 mb-3" style={{ background: '#0f1420', border: '1px solid #1e2a3a' }}>
      <div className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>
        Value Bridge
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barCategoryGap="15%">
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: '#6b7a96', fontFamily: "'IBM Plex Mono', monospace" }}
            axisLine={{ stroke: '#1e2a3a' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: '#6b7a96', fontFamily: "'IBM Plex Mono', monospace" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{ background: '#0a0d13', border: '1px solid #1e2a3a', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}
            labelStyle={{ color: '#e8edf5' }}
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
      <div className="grid grid-cols-5 gap-1 mt-2">
        {[
          { label: 'Revenue', pct: vd.revenue_growth_contribution_pct, abs: vd.revenue_growth_contribution_abs },
          { label: 'Margin', pct: vd.margin_expansion_contribution_pct, abs: vd.margin_expansion_contribution_abs },
          { label: 'Multiple', pct: vd.multiple_expansion_contribution_pct, abs: vd.multiple_expansion_contribution_abs },
          { label: 'Debt', pct: vd.debt_paydown_contribution_pct, abs: vd.debt_paydown_contribution_abs },
          { label: 'Fees', pct: vd.fees_drag_contribution_pct, abs: vd.fees_drag_contribution_abs },
        ].map((d) => (
          <div key={d.label} className="text-center">
            <div className="text-xs font-medium" style={{ color: '#e8edf5', fontFamily: "'IBM Plex Mono', monospace" }}>
              {d.pct.toFixed(0)}%
            </div>
            <div className="text-xs" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ValueBridge;
