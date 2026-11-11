/**
 * Step 4 — Results. The headline answer, the Excel model, how the figures were normalised, and
 * the full detail (rebuild/CLEANING_AND_SUITE_PLAN.md §6.4).
 *
 * Reads ModelOutput only. Every number shown is a ModelOutput field, a lib/engine2/display
 * helper, or the normalisation record carried on the facts — nothing is recomputed here.
 */
import React, { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useEngine2Model } from '../../../store/engine2Model';
import { money, multiple, num, pct } from '../../../lib/format';
import type { Engine2Currency } from '../../../lib/format';
import { entryLeverageDisplay, entryMultipleDisplay, operatingChartSeries, headlineNotMeaningful, impliedEquityDisplay } from '../../../lib/engine2/display';
import type { Engine2ModelOutput } from '../../../lib/engine2/facade';
import { ebitdaWaterfall, netDebtWaterfall, waterfall } from '../../../lib/cleaning/view';
import OutputTabs from '../v2/OutputTabs';
import { AiResults, AiToolbar } from '../v2/Workbench';
import Waterfall from '../ui/Waterfall';
import { Button, Callout, Card, Kpi, acct, cx } from '../ui/kit';

/** Series colours, in the order they are drawn. Variables, so the charts follow the theme. */
const SERIES = ['var(--de-ink)', 'var(--de-accent)', 'var(--de-input)', 'var(--de-pos)', 'var(--de-warn)', 'var(--de-ink-3)'];
const AXIS = { fontSize: 11, fill: 'var(--de-ink-3)', fontFamily: 'JetBrains Mono, monospace' } as const;
const tick = (v: number) => num(v, 0);

const OperatingChart: React.FC<{ o: Engine2ModelOutput }> = ({ o }) => {
  const c = operatingChartSeries(o); // which series exist is decided by the deal's data (lib/engine2/display)
  return (
    <Card title={c.title} aside={<span className="font-sans text-[12px] text-[color:var(--de-ink-3)]">{c.note}</span>}>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={c.rows} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--de-rule)" />
            <XAxis dataKey="period" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--de-rule-strong)' }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={tick} width={56} />
            <Tooltip formatter={(v) => (typeof v === 'number' ? num(v, 1) : String(v))} cursor={{ fill: 'var(--de-sunken)' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {c.has_revenue && <Bar dataKey="Revenue" fill="var(--de-ink-3)" isAnimationActive={false} />}
            <Bar dataKey="EBITDA" fill="var(--de-ink)" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

const DebtChart: React.FC<{ o: Engine2ModelOutput }> = ({ o }) => {
  const names = o.sources_uses.debt_at_par.map((d) => d.name);
  const close = { period: 'Close', ...Object.fromEntries(o.sources_uses.debt_at_par.map((d) => [d.name, d.amount])) };
  const years = o.operating.map((_, i) => ({
    period: `Year ${i + 1}`,
    ...Object.fromEntries(o.tranches.map((t) => [t[i].name, t[i].ending_balance])),
    ...(o.revolver ? { Revolver: o.revolver[i].ending_drawn } : {}),
  }));
  const keys = [...new Set([...names, ...o.tranches.map((t) => t[0].name), ...(o.revolver ? ['Revolver'] : [])])];
  if (!keys.length) return <Card title="Debt outstanding"><p className="font-sans text-[13px] text-[color:var(--de-ink-2)]">All-equity deal — no debt.</p></Card>;
  return (
    <Card title="Debt outstanding" aside={<span className="font-sans text-[12px] text-[color:var(--de-ink-3)]">closing balance by tranche</span>}>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[close, ...years]} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--de-rule)" />
            <XAxis dataKey="period" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--de-rule-strong)' }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={tick} width={56} />
            <Tooltip formatter={(v) => (typeof v === 'number' ? num(v, 1) : String(v))} cursor={{ fill: 'var(--de-sunken)' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {keys.map((k, i) => <Bar key={k} dataKey={k} stackId="debt" fill={SERIES[i % SERIES.length]} isAnimationActive={false} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

/** Where the equity value comes from: the four SPEC §12 bars on top of the equity invested. */
const ValueBridgeCard: React.FC<{ o: Engine2ModelOutput }> = ({ o }) => {
  const b = o.bridge;
  const steps = waterfall('Equity invested', b.entry_equity_pre_promote_total, [
    { key: 'growth', label: 'EBITDA growth', amount: b.ebitda_growth_at_entry_multiple },
    { key: 'multiple', label: 'Multiple change', amount: b.multiple_change_bar },
    { key: 'cross', label: 'Growth × multiple', amount: b.interaction },
    { key: 'paydown', label: 'Net debt paid down', amount: b.net_debt_paydown },
  ], 'Before fees and promote');
  return (
    <Card title="Where the value comes from">
      <Waterfall steps={steps} />
      <p className="font-sans text-[12px] text-[color:var(--de-ink-3)] mt-3">
        The last bar is before transaction costs, exit fees and the management promote. The walk from there to the sponsor’s net proceeds is on the Returns tab below.
      </p>
    </Card>
  );
};

/** Sponsor IRR across entry and exit multiples; the base case is outlined. */
const SensitivityCard: React.FC<{ o: Engine2ModelOutput }> = ({ o }) => {
  const g = o.sensitivity?.[0];
  if (!g) return null;
  const base = g.irr[g.base_row_index]?.[g.base_col_index] ?? null;
  const axis = (a: string) => a.replace(/_/g, ' ');
  return (
    <Card title="Sponsor IRR sensitivity" aside={<span className="font-sans text-[12px] text-[color:var(--de-ink-3)]">{axis(g.row_axis)} down · {axis(g.col_axis)} across</span>}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="w-16" />
            {g.col_values.map((v) => <th key={v} className="de-num text-[12px] font-semibold text-right px-2 py-1.5 border-b border-[color:var(--de-rule-strong)]">{multiple(v)}</th>)}
          </tr>
        </thead>
        <tbody>
          {g.irr.map((row, r) => (
            <tr key={g.row_values[r]}>
              <th scope="row" className="de-num text-[12px] font-semibold text-right px-2 py-1.5 border-r border-[color:var(--de-rule-strong)]">{multiple(g.row_values[r])}</th>
              {row.map((v, c) => {
                const isBase = r === g.base_row_index && c === g.base_col_index;
                return (
                  <td key={g.col_values[c]} className={cx('de-num text-[13px] text-right px-2 py-1.5 border border-[color:var(--de-rule)]',
                    isBase && 'outline outline-2 -outline-offset-2 outline-[color:var(--de-ink)] font-semibold',
                    v === null ? 'text-[color:var(--de-ink-3)]' : base !== null && v > base ? 'bg-[var(--de-pos-soft)]' : base !== null && v < base ? 'bg-[var(--de-accent-soft)]' : '')}>
                    {v === null ? 'N/A' : pct(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="font-sans text-[12px] text-[color:var(--de-ink-3)] mt-3">Green is above the base case, red below. N/A means the structure does not hold at that point.</p>
    </Card>
  );
};

const Row: React.FC<{ label: string; value: string; strong?: boolean; note?: string }> = ({ label, value, strong, note }) => (
  <div className={`flex items-baseline justify-between gap-3 py-1.5 ${strong ? 'border-t border-[color:var(--de-rule-strong)] font-semibold' : 'border-t border-[color:var(--de-rule)]'}`}>
    <span className="font-sans text-[13px]">{label}{note && <span className="block font-normal text-[12px] text-[color:var(--de-ink-3)]">{note}</span>}</span>
    <span className="de-num text-[13px] whitespace-nowrap">{value}</span>
  </div>
);

const NormalisationCards: React.FC<{ o: Engine2ModelOutput; ccy: Engine2Currency }> = ({ o, ccy }) => {
  const n = o.facts.normalisation ?? null;
  const eq = impliedEquityDisplay(o);
  const eb = n?.ebitda.find((b) => b.period === n.sizing) ?? null;
  const sizingLabel = n?.periods.find((p) => p.key === n.sizing)?.label ?? 'the sizing period';
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card title={`EBITDA: reported to adjusted · ${sizingLabel}`}>
        {!n ? <p className="font-sans text-[13px] text-[color:var(--de-ink-2)]">This case was entered directly — there are no sourced figures to normalise.</p>
          : n.as_reported ? <p className="font-sans text-[13px] text-[color:var(--de-ink-2)]">Modelled on the figures as reported. No normalisation was applied.</p>
          : eb ? <Waterfall steps={ebitdaWaterfall(eb)} /> : null}
      </Card>
      <Card title="Net debt at entry">
        {n?.net_debt && !n.as_reported ? <Waterfall steps={netDebtWaterfall(n.net_debt)} debt />
          : <Row label="Net debt as sourced" value={eq.net_debt === null ? '–' : acct(eq.net_debt)} />}
      </Card>
      <Card title="What the sellers receive">
        <Row label="Purchase price (enterprise value)" value={money(eq.enterprise_value, ccy)} />
        <Row label={n && !n.as_reported ? 'Less adjusted net debt' : 'Less net debt'} value={eq.net_debt === null ? 'not in the source' : money(eq.net_debt, ccy)} />
        <Row strong label="Equity value to the sellers" value={eq.equity_value === null ? 'needs the target’s net debt' : money(eq.equity_value, ccy)} />
        {eq.per_share !== null && <Row label="Per share" value={num(eq.per_share, 2)} note="on the share count in the latest filing" />}
        {eq.premium_to_market !== null && <Row label="Premium to the current market value" value={pct(eq.premium_to_market)} />}
        {o.facts.implied_trading_ev_ebitda !== null && (
          <Row label="Currently trades at" value={multiple(o.facts.implied_trading_ev_ebitda)}
            note={n && n.trading_ev_ebitda_reported !== null && !n.as_reported ? `EV ÷ adjusted EBITDA · ${multiple(n.trading_ev_ebitda_reported)} on reported figures` : 'EV ÷ EBITDA'} />
        )}
        <p className="font-sans text-[12px] text-[color:var(--de-ink-3)] mt-2">
          Net debt changes this figure, not the sponsor’s returns: the model prices the whole enterprise.
        </p>
      </Card>
    </div>
  );
};

const ResultsScreen: React.FC<{ onEdit: () => void }> = ({ onEdit }) => {
  const output = useEngine2Model((s) => s.output);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  if (!output) return null;
  const facts = output.facts;
  const ccy = facts.currency as Engine2Currency;
  const nm = headlineNotMeaningful(output);
  const entry = entryMultipleDisplay(output);
  const lev = entryLeverageDisplay(output);
  const blocks = output.coherence.filter((f) => f.severity === 'block');
  const warns = output.coherence.filter((f) => f.severity !== 'block');

  const exportExcel = async () => {
    setExporting(true);
    setExportError(null);
    try {
      // SPEC §26: a live formula model. A feature the formulas do not cover BLOCKS the export by name.
      const { buildFormulaWorkbook, formulaCoverageBlockers } = await import('../../../lib/engine2/workbook');
      const missing = formulaCoverageBlockers(output);
      if (missing.length) {
        setExportError(`The Excel model does not yet cover: ${missing.join(', ')}. Export is blocked rather than exporting pasted values.`);
        return;
      }
      const buf = await buildFormulaWorkbook(output, { cachedResults: true }).wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${facts.entity_name.replace(/[^\w-]+/g, '_')}_LBO_model.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setExportError(`The export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-playfair text-[30px] font-bold leading-tight">{output.assumptions.deal_name}</h1>
          <p className="font-sans text-[14px] text-[color:var(--de-ink-2)] mt-1">
            {output.assumptions.entry.hold_years}-year hold · priced at {multiple(entry.valuation)} {entry.basis_label} EBITDA
            {facts.sizing_as_of ? ` · sized on ${entry.sizing_label} figures to ${facts.sizing_as_of}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onEdit}>← Edit assumptions</Button>
          <Button variant="primary" disabled={exporting} onClick={exportExcel}>{exporting ? 'Building the workbook…' : 'Export Excel model ↓'}</Button>
        </div>
      </div>
      {exportError && <Callout tone="block">{exportError}</Callout>}
      {blocks.length > 0 && (
        <Callout tone="block" title="These results are not meaningful yet">
          <ul className="list-disc pl-4">{blocks.map((f) => <li key={f.code + f.message}>{f.message}</li>)}</ul>
        </Callout>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 bg-[var(--de-surface)] border border-[color:var(--de-rule)] divide-x divide-[color:var(--de-rule)]">
        <Kpi label="Sponsor IRR" value={nm ? 'N/M' : pct(output.returns.sponsor_net.irr)} tone={nm ? 'warn' : 'neutral'} sub="net of fees and the management promote" />
        <Kpi label="Money multiple" value={nm ? 'N/M' : multiple(output.returns.sponsor_net.moic)} sub="sponsor, net" />
        <Kpi label="Equity cheque" value={money(output.sources_uses.sponsor_equity, ccy, 0)} sub={`of ${money(output.sources_uses.total_uses, ccy, 0)} total uses`} />
        <Kpi label="Entry leverage" value={multiple(lev.value)} sub={`gross debt ÷ ${lev.basis_label} EBITDA`} />
        <Kpi label="Purchase price" value={money(output.derived.enterprise_value, ccy, 0)} sub={`${multiple(entry.valuation)} ${entry.basis_label} EBITDA`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <OperatingChart o={output} />
        <DebtChart o={output} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ValueBridgeCard o={output} />
        <SensitivityCard o={output} />
      </div>

      <NormalisationCards o={output} ccy={ccy} />

      {warns.length > 0 && (
        <Card title="Things to check">
          <div className="space-y-2">{warns.map((f) => <Callout key={f.code + f.message} tone="warn">{f.message}</Callout>)}</div>
        </Card>
      )}

      <Card title="Tools" aside={<span className="font-sans text-[12px] text-[color:var(--de-ink-3)]">goal-seek works without a key</span>}>
        <AiToolbar />
        <AiResults />
      </Card>

      <Card title="The full model" flush>
        <div className="p-4"><OutputTabs output={output} currency={ccy} /></div>
      </Card>
    </div>
  );
};

export default ResultsScreen;
