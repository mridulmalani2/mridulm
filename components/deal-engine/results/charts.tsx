/**
 * Charts of the Results step. Colours are the design tokens, so the charts follow the theme, and
 * any chart can be saved as a picture (SVG for slides, or PNG) from its frame.
 */
import React, { useRef } from 'react';
import { dealUiStore } from '../../../store/dealUi';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Engine2ModelOutput } from '../../../lib/engine2/facade';
import { operatingChartSeries } from '../../../lib/engine2/display';
import { num } from '../../../lib/format';
import { Card } from '../ui/kit';
import { saveChart } from './exportModel';

/** A card holding one chart, with "save as" actions that appear on hover. */
export const ChartFrame: React.FC<{ title: string; name: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, name, aside, children, className }) => {
  const body = useRef<HTMLDivElement>(null);
  const save = async (as: 'svg' | 'png') => {
    const svg = body.current?.querySelector('svg');
    if (!svg) return;
    try { await saveChart(svg as SVGSVGElement, name, as); dealUiStore.getState().notify(`Chart saved as ${as.toUpperCase()}`); } catch { dealUiStore.getState().notify('The chart could not be saved'); }
  };
  return (
    <Card title={title} className={`group/chart ${className ?? ''}`} aside={
      <span className="flex items-center gap-3">
        {aside}
        <span className="de-no-print flex items-center gap-1 opacity-0 group-hover/chart:opacity-100 focus-within:opacity-100 transition-opacity">
          <>
              <button type="button" onClick={() => save('png')} className="h-6 px-2 rounded text-[12px] text-[color:var(--de-ink-3)] hover:bg-[var(--de-sunken)] hover:text-[color:var(--de-ink)]">PNG</button>
              <button type="button" onClick={() => save('svg')} className="h-6 px-2 rounded text-[12px] text-[color:var(--de-ink-3)] hover:bg-[var(--de-sunken)] hover:text-[color:var(--de-ink)]">SVG</button>
          </>
        </span>
      </span>
    }>
      <div ref={body}>{children}</div>
    </Card>
  );
};

/** Series colours for stacked debt, in the order they are drawn. */
const SERIES = ['var(--de-ink)', 'var(--de-input)', 'var(--de-rule-strong)', 'var(--de-pos)', 'var(--de-warn)', 'var(--de-ink-3)'];
const AXIS = { fontSize: 11, fill: 'var(--de-ink-3)' } as const;
const tick = (v: number) => num(v, 0);
const TOOLTIP = { contentStyle: { borderRadius: 8, border: '1px solid var(--de-rule)', boxShadow: 'var(--de-shadow-pop)', fontSize: 12, padding: '8px 10px' }, cursor: { fill: 'var(--de-sunken)' } } as const;

export const OperatingChart: React.FC<{ o: Engine2ModelOutput }> = ({ o }) => {
  const c = operatingChartSeries(o); // which series exist is decided by the deal's data (lib/engine2/display)
  return (
    <ChartFrame title={c.title} name="operating" aside={<span className="text-[12px] text-[color:var(--de-ink-3)]">{c.note}</span>}>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={c.rows} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--de-rule)" />
            <XAxis dataKey="period" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--de-rule-strong)' }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={tick} width={56} />
            <Tooltip formatter={(v) => (typeof v === 'number' ? num(v, 1) : String(v))} {...TOOLTIP} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
            {c.has_revenue && <Bar dataKey="Revenue" fill="var(--de-rule-strong)" radius={[3, 3, 0, 0]} isAnimationActive={false} />}
            <Bar dataKey="EBITDA" fill="var(--de-ink)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
};

export const DebtChart: React.FC<{ o: Engine2ModelOutput }> = ({ o }) => {
  const names = o.sources_uses.debt_at_par.map((d) => d.name);
  const close = { period: 'Close', ...Object.fromEntries(o.sources_uses.debt_at_par.map((d) => [d.name, d.amount])) };
  const years = o.operating.map((_, i) => ({
    period: `Year ${i + 1}`,
    ...Object.fromEntries(o.tranches.map((t) => [t[i].name, t[i].ending_balance])),
    ...(o.revolver ? { Revolver: o.revolver[i].ending_drawn } : {}),
  }));
  const keys = [...new Set([...names, ...o.tranches.map((t) => t[0].name), ...(o.revolver ? ['Revolver'] : [])])];
  if (!keys.length) return <Card title="Debt outstanding"><p className="text-[14px] text-[color:var(--de-ink-2)]">All-equity deal: no debt.</p></Card>;
  return (
    <ChartFrame title="Debt outstanding" name="debt" aside={<span className="text-[12px] text-[color:var(--de-ink-3)]">closing balance by tranche</span>}>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[close, ...years]} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="34%">
            <CartesianGrid vertical={false} stroke="var(--de-rule)" />
            <XAxis dataKey="period" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--de-rule-strong)' }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={tick} width={56} />
            <Tooltip formatter={(v) => (typeof v === 'number' ? num(v, 1) : String(v))} {...TOOLTIP} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
            {keys.map((k, i) => <Bar key={k} dataKey={k} stackId="debt" fill={SERIES[i % SERIES.length]} isAnimationActive={false} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
};
