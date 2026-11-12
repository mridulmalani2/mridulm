/**
 * Step 4 — Results. The headline answer first, then the model and the analysis in a rail of
 * views, with a review view and a one-page summary for the people who read rather than build.
 *
 * Reads ModelOutput only. Every number shown is a ModelOutput field, a lib/engine2/display
 * helper, the normalisation record carried on the facts, or a full engine run through
 * lib/analysis — nothing is recomputed here.
 */
import React, { useState } from 'react';
import { useEngine2Model } from '../../../store/engine2Model';
import { useWorkspace } from '../../../store/workspace';
import { dealUiStore, useDealUi } from '../../../store/dealUi';
import { money, multiple, num, pct } from '../../../lib/format';
import type { Engine2Currency } from '../../../lib/format';
import { entryBasisText, entryLeverageDisplay, entryMultipleDisplay, exitMultipleDisplay, headlineNotMeaningful, impliedEquityDisplay } from '../../../lib/engine2/display';
import type { Engine2ModelOutput } from '../../../lib/engine2/facade';
import { ebitdaWaterfall, netDebtWaterfall, waterfall } from '../../../lib/cleaning/view';
import { DETAIL_VIEWS, Debt, Methodology, Returns, SU, Valuation } from '../v2/OutputTabs';
import Waterfall from '../ui/Waterfall';
import Fig from '../ui/Fig';
import { Button, Callout, Card, Kpi, acct, cx } from '../ui/kit';
import { BreakEvenCard, CovenantCards, GridCard, TornadoCard } from './Analysis';
import { DebtChart, OperatingChart } from './charts';
import { exportExcelModel } from './exportModel';
import { RESULT_VIEWS } from './views';
import { CasesCompare, SaveCase } from '../shell/WorkspaceDrawers';

const { Operating, BS, Credit, Scenarios } = DETAIL_VIEWS;

/** Where the equity value comes from: the four SPEC §12 bars on top of the equity invested. */
const ValueBridgeCard: React.FC<{ o: Engine2ModelOutput; note?: boolean }> = ({ o, note = true }) => {
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
      {note && <p className="text-[12px] text-[color:var(--de-ink-3)] mt-4">The last bar is before transaction costs, exit fees and the management promote. The walk to the sponsor’s net proceeds is under Returns.</p>}
    </Card>
  );
};

/** Sponsor IRR across entry and exit multiples; the base case is outlined. */
const SensitivityCard: React.FC<{ o: Engine2ModelOutput }> = ({ o }) => {
  const setView = useDealUi((s) => s.setResultsView);
  const g = o.sensitivity?.[0];
  if (!g) return null;
  const base = g.irr[g.base_row_index]?.[g.base_col_index] ?? null;
  const axis = (a: string) => a.replace(/_/g, ' ');
  return (
    <Card title="Sponsor IRR sensitivity" aside={<button type="button" onClick={() => setView('sensitivity')} className="de-no-print text-[12px] text-[color:var(--de-ink-2)] underline underline-offset-2 decoration-dotted hover:text-[color:var(--de-ink)]">Flex other inputs</button>}>
      <p className="text-[12px] text-[color:var(--de-ink-3)] mb-2">{axis(g.row_axis)} down, {axis(g.col_axis)} across</p>
      <div className="de-scroll-x">
        <table className="w-full border-separate border-spacing-1 de-num">
          <thead>
            <tr>
              <th className="w-14" />
              {g.col_values.map((v, c) => <th key={v} className={cx('text-[12px] font-medium text-right px-2 pb-1', c === g.base_col_index ? 'text-[color:var(--de-ink)]' : 'text-[color:var(--de-ink-3)]')}>{multiple(v)}</th>)}
            </tr>
          </thead>
          <tbody>
            {g.irr.map((row, r) => (
              <tr key={g.row_values[r]}>
                <th scope="row" className={cx('text-[12px] font-medium text-right pr-2', r === g.base_row_index ? 'text-[color:var(--de-ink)]' : 'text-[color:var(--de-ink-3)]')}>{multiple(g.row_values[r])}</th>
                {row.map((v, c) => {
                  const isBase = r === g.base_row_index && c === g.base_col_index;
                  return (
                    <td key={g.col_values[c]} className={cx('text-[13px] text-right px-2 h-9 rounded-[5px]',
                      isBase && 'font-semibold shadow-[inset_0_0_0_1.5px_var(--de-ink)]',
                      v === null ? 'bg-[var(--de-sunken)] text-[color:var(--de-ink-3)]' : base !== null && v > base ? 'bg-[var(--de-pos-soft)]' : base !== null && v < base ? 'bg-[var(--de-accent-soft)]' : 'bg-[var(--de-sunken)]')}>
                      {v === null ? 'N/A' : pct(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-[color:var(--de-ink-3)] mt-3">Green is above the base case, red below. When the entry multiple moves, debt is held and the equity takes up the difference. N/A means the structure does not hold at that point.</p>
    </Card>
  );
};

const Row: React.FC<{ label: string; value: React.ReactNode; strong?: boolean; note?: string }> = ({ label, value, strong, note }) => (
  <div className={cx('flex items-baseline justify-between gap-3 py-2 border-t first:border-t-0', strong ? 'border-[color:var(--de-rule-strong)] font-semibold' : 'border-[color:var(--de-rule)]')}>
    <span className="text-[13px]">{label}{note && <span className="block font-normal text-[12px] text-[color:var(--de-ink-3)]">{note}</span>}</span>
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
        {!n ? <p className="text-[13px] text-[color:var(--de-ink-2)]">This case was entered directly. There are no sourced figures to normalise.</p>
          : n.as_reported ? <p className="text-[13px] text-[color:var(--de-ink-2)]">Modelled on the figures as reported. No normalisation was applied.</p>
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
        <p className="text-[12px] text-[color:var(--de-ink-3)] mt-3">Net debt changes this figure, not the sponsor’s returns: the model prices the whole enterprise.</p>
      </Card>
    </div>
  );
};

/** The five figures a reader looks for first. Each opens its formula. */
const Headline: React.FC<{ o: Engine2ModelOutput; ccy: Engine2Currency }> = ({ o, ccy }) => {
  const nm = headlineNotMeaningful(o);
  const entry = entryMultipleDisplay(o);
  const lev = entryLeverageDisplay(o);
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 bg-[var(--de-surface)] border border-[color:var(--de-rule)] rounded-[var(--de-r)] divide-x divide-y lg:divide-y-0 divide-[color:var(--de-rule)] overflow-hidden">
      <Kpi label="Sponsor IRR" value={nm ? 'N/M' : <Fig label="Sponsor IRR">{pct(o.returns.sponsor_net.irr, 2)}</Fig>} tone={nm ? 'warn' : 'neutral'} sub="net of fees and the management promote" />
      <Kpi label="Money multiple" value={nm ? 'N/M' : <Fig label="Sponsor money multiple">{multiple(o.returns.sponsor_net.moic, 2)}</Fig>} sub="sponsor, net" />
      <Kpi label="Equity cheque" value={<Fig label="Sponsor equity" year={0}>{money(o.sources_uses.sponsor_equity, ccy, 0)}</Fig>} sub={`of ${money(o.sources_uses.total_uses, ccy, 0)} total uses`} />
      <Kpi label="Entry leverage" value={multiple(lev.value, 2)} sub={`gross debt ÷ ${lev.basis_label} EBITDA`} />
      <Kpi label="Purchase price" value={<Fig label="Enterprise value" year={0}>{money(o.derived.enterprise_value, ccy, 0)}</Fig>} sub={`${multiple(entry.valuation, 2)} ${entryBasisText(entry)} EBITDA`} />
    </div>
  );
};

const Checks: React.FC<{ o: Engine2ModelOutput }> = ({ o }) => {
  const warns = o.coherence.filter((f) => f.severity !== 'block');
  if (!warns.length) return null;
  return (
    <Card title="Things to check">
      <ul className="space-y-2">{warns.map((f) => <li key={f.code + f.message}><Callout tone="warn">{f.message}</Callout></li>)}</ul>
    </Card>
  );
};

/** The answer and nothing else: for the reader who reviews the deal rather than builds it. */
const ReviewView: React.FC<{ o: Engine2ModelOutput; ccy: Engine2Currency }> = ({ o, ccy }) => {
  const be = o.valuation?.break_evens ?? null;
  const last = o.credit[o.credit.length - 1];
  return (
    <div className="space-y-5 max-w-[1100px] mx-auto">
      <Headline o={o} ccy={ccy} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ValueBridgeCard o={o} note={false} />
        <Card title="What has to be true">
          <Row label="Exit multiple assumed" value={multiple(exitMultipleDisplay(o), 2)} note={`against ${multiple(entryMultipleDisplay(o).valuation, 2)} paid at entry`} />
          <Row label="EBITDA at exit" value={money(o.operating[o.operating.length - 1].ebitda_adj, ccy, 0)} note={`from ${money(o.operating[0].ebitda_adj, ccy, 0)} in year 1`} />
          <Row label="Net leverage at exit" value={last?.net_leverage == null ? 'N/A' : multiple(last.net_leverage, 2)} note={`debt paid down by ${last?.cumulative_paydown_pct_of_entry_debt == null ? 'N/A' : pct(last.cumulative_paydown_pct_of_entry_debt)} of the amount at close`} />
          {be && be.exit_multiple.value !== null && <Row label="Exit multiple at which the equity just earns its required return" value={multiple(be.exit_multiple.value, 2)} />}
          {o.scenarios?.[0] && <Row label={o.scenarios[0].name} value={o.scenarios[0].returns.sponsor_net.irr === null ? 'N/A' : pct(o.scenarios[0].returns.sponsor_net.irr, 2)} note="sponsor IRR, entry price and debt held" />}
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SensitivityCard o={o} />
        <Checks o={o} />
      </div>
      <NormalisationCards o={o} ccy={ccy} />
    </div>
  );
};

/** One printed page, in the order a committee paper uses: price, funding, returns, capital, credit, cash. */
const OnePager: React.FC<{ o: Engine2ModelOutput; ccy: Engine2Currency }> = ({ o, ccy }) => {
  const su = o.sources_uses;
  const entry = entryMultipleDisplay(o);
  const lev = entryLeverageDisplay(o);
  const nm = headlineNotMeaningful(o);
  const fy = o.facts.fy_ebitda;
  const cap = o.derived.total_debt_at_par + su.rollover_equity + su.sponsor_equity + su.management_subscription;
  const capRow = (name: string, amt: number, strong = false) => (
    <tr key={name} data-total={strong || undefined}><td>{name}</td><td>{money(amt, ccy)}</td><td>{fy !== null && fy > 0 ? multiple(amt / fy, 2) : '–'}</td><td>{cap > 0 ? pct(amt / cap) : '–'}</td></tr>
  );
  const H2: React.FC<{ children: React.ReactNode }> = ({ children }) => <h2 className="text-[13px] font-semibold mt-5 mb-1.5 pb-1 border-b border-[color:var(--de-rule-strong)]">{children}</h2>;
  return (
    <article className="de-print-page mx-auto max-w-[820px] bg-[var(--de-surface)] border border-[color:var(--de-rule)] rounded-[var(--de-r)] px-10 py-9 text-[12.5px] leading-snug">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="de-display text-[26px] leading-tight">{o.facts.entity_name}</h1>
          <p className="text-[color:var(--de-ink-2)]">Leveraged buyout summary · {o.assumptions.entry.hold_years}-year hold · {ccy} millions</p>
        </div>
        <p className="text-[color:var(--de-ink-3)] whitespace-nowrap">{new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </header>

      <H2>Price and multiples</H2>
      <div className="grid grid-cols-4 gap-4 de-num">
        {[
          ['Purchase price', money(o.derived.enterprise_value, ccy, 0)],
          [`Entry multiple (${entryBasisText(entry)})`, multiple(entry.valuation, 2)],
          ['Exit multiple', multiple(exitMultipleDisplay(o), 2)],
          [`Debt at close ÷ ${lev.basis_label} EBITDA`, multiple(lev.value, 2)],
        ].map(([l, v]) => <div key={l}><p className="text-[11px] text-[color:var(--de-ink-3)]">{l}</p><p className="text-[18px] font-semibold">{v}</p></div>)}
      </div>

      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <H2>Uses</H2>
          <table className="de-table de-num !text-[12.5px]"><tbody>
            <tr><td>Enterprise value</td><td>{money(su.enterprise_value, ccy)}</td></tr>
            <tr><td>Transaction costs</td><td>{money(su.transaction_costs, ccy)}</td></tr>
            <tr><td>Financing fees and OID</td><td>{money(su.financing_fees + su.oid_funded, ccy)}</td></tr>
            <tr><td>Cash to the balance sheet</td><td>{money(su.cash_to_balance_sheet, ccy)}</td></tr>
            <tr data-total="true"><td>Total uses</td><td>{money(su.total_uses, ccy)}</td></tr>
          </tbody></table>
        </div>
        <div>
          <H2>Sources</H2>
          <table className="de-table de-num !text-[12.5px]"><tbody>
            {su.debt_at_par.map((d) => <tr key={d.name}><td>{d.name}</td><td>{money(d.amount, ccy)}</td></tr>)}
            {su.rollover_equity > 0 && <tr><td>Rollover equity</td><td>{money(su.rollover_equity, ccy)}</td></tr>}
            {su.management_subscription > 0 && <tr><td>Management subscription</td><td>{money(su.management_subscription, ccy)}</td></tr>}
            <tr><td>Sponsor equity</td><td>{money(su.sponsor_equity, ccy)}</td></tr>
            <tr data-total="true"><td>Total sources</td><td>{money(su.total_sources, ccy)}</td></tr>
          </tbody></table>
        </div>
      </div>

      <H2>Returns</H2>
      <table className="de-table de-num !text-[12.5px]">
        <thead><tr><th>Stream</th><th>IRR</th><th>Money multiple</th></tr></thead>
        <tbody>
          <tr><td>Sponsor, net of fees and promote</td><td>{nm ? 'N/M' : pct(o.returns.sponsor_net.irr, 2)}</td><td>{nm ? 'N/M' : multiple(o.returns.sponsor_net.moic, 2)}</td></tr>
          <tr><td>All equity, before the promote</td><td>{nm ? 'N/M' : pct(o.returns.pre_promote.irr, 2)}</td><td>{nm ? 'N/M' : multiple(o.returns.pre_promote.moic, 2)}</td></tr>
          <tr><td>Unlevered</td><td>{pct(o.returns.unlevered.irr, 2)}</td><td>{multiple(o.returns.unlevered.moic, 2)}</td></tr>
        </tbody>
      </table>
      <p className="text-[color:var(--de-ink-2)] mt-1.5">
        Value created: EBITDA growth {money(o.bridge.ebitda_growth_at_entry_multiple, ccy, 0)}, multiple change {money(o.bridge.multiple_change_bar, ccy, 0)}, growth × multiple {money(o.bridge.interaction, ccy, 0)}, net debt paid down {money(o.bridge.net_debt_paydown, ccy, 0)}.
      </p>

      <H2>Capitalisation at close</H2>
      <table className="de-table de-num !text-[12.5px]">
        <thead><tr><th>Layer</th><th>Amount</th><th>x {lev.basis_label === 'forecast year-1' ? 'historical' : lev.basis_label} EBITDA</th><th>% of capital</th></tr></thead>
        <tbody>
          {su.debt_at_par.map((d) => capRow(d.name, d.amount))}
          {capRow('Equity (sponsor, rollover and management)', su.sponsor_equity + su.rollover_equity + su.management_subscription)}
          {capRow('Total', cap, true)}
        </tbody>
      </table>

      <H2>Credit and cash by year</H2>
      <table className="de-table de-num !text-[12.5px]">
        <thead><tr><th />{o.credit.map((_, i) => <th key={i}>Year {i + 1}</th>)}</tr></thead>
        <tbody>
          <tr><td>EBITDA</td>{o.operating.map((y, i) => <td key={i}>{num(y.ebitda_adj, 0)}</td>)}</tr>
          <tr><td>Free cash flow before debt service</td>{o.operating.map((y, i) => <td key={i}>{num(y.fcf_pre_debt, 0)}</td>)}</tr>
          <tr><td>Net leverage</td>{o.credit.map((c, i) => <td key={i}>{c.net_leverage == null ? 'N/A' : `${num(c.net_leverage, 2)}x`}</td>)}</tr>
          <tr><td>Interest cover</td>{o.credit.map((c, i) => <td key={i}>{c.icr == null ? 'N/A' : `${num(c.icr, 2)}x`}</td>)}</tr>
          <tr><td>Debt service cover</td>{o.credit.map((c, i) => <td key={i}>{c.dscr == null ? 'N/A' : `${num(c.dscr, 2)}x`}</td>)}</tr>
          <tr><td>Closing cash</td>{o.waterfall.map((w, i) => <td key={i}>{num(w.closing_cash, 0)}</td>)}</tr>
        </tbody>
      </table>

      {o.coherence.length > 0 && (
        <>
          <H2>Points to check</H2>
          <ul className="list-disc pl-4 text-[color:var(--de-ink-2)] space-y-0.5">{o.coherence.map((f) => <li key={f.code + f.message}>{f.message}</li>)}</ul>
        </>
      )}
      <p className="text-[11px] text-[color:var(--de-ink-3)] mt-5">
        Entry leverage is gross; yearly leverage is net of cash. A model is a range, not a point: see the sensitivity and scenario exhibits. Every figure is reproduced by formula in the accompanying Excel model.
      </p>
    </article>
  );
};

const ResultsScreen: React.FC<{ onEdit: () => void }> = ({ onEdit }) => {
  const output = useEngine2Model((s) => s.output);
  const notes = useWorkspace((s) => s.notes);
  const view = useDealUi((s) => s.resultsView);
  const setView = useDealUi((s) => s.setResultsView);
  const setOverlay = useDealUi((s) => s.setOverlay);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  if (!output) return null;
  const facts = output.facts;
  const ccy = facts.currency as Engine2Currency;
  const entry = entryMultipleDisplay(output);
  const blocks = output.coherence.filter((f) => f.severity === 'block');
  const special = view === 'review' || view === 'onepager';

  const exportExcel = async () => {
    setExporting(true);
    const failed = await exportExcelModel(output, notes);
    setExportError(failed);
    setExporting(false);
    if (!failed) dealUiStore.getState().notify('Excel model saved to your downloads');
  };

  const groups = ['Answer', 'Model', 'Analysis', 'Reference'] as const;
  const body = (() => {
    switch (view) {
      case 'returns': return <div className="space-y-5"><ValueBridgeCard o={output} /><Card title="Returns by stream"><Returns o={output} ccy={ccy} /></Card></div>;
      case 'operating': return <div className="space-y-5"><OperatingChart o={output} /><Card title="Operating forecast and cash flow"><Operating o={output} ccy={ccy} /></Card></div>;
      case 'su': return <Card title="Sources and uses"><SU o={output} ccy={ccy} /></Card>;
      case 'debt': return <div className="space-y-5"><DebtChart o={output} /><Card title="Debt schedule"><Debt o={output} ccy={ccy} /></Card></div>;
      case 'credit': return <div className="space-y-5"><CovenantCards o={output} ccy={ccy} /><Card title="Credit statistics"><Credit o={output} /></Card></div>;
      case 'bs': return <Card title="Balance sheet"><BS o={output} ccy={ccy} /></Card>;
      case 'sensitivity': return <div className="space-y-5"><TornadoCard o={output} /><GridCard o={output} /><BreakEvenCard o={output} /></div>;
      case 'scenarios': return (
        <div className="space-y-5">
          <Card title="Stress scenarios"><Scenarios o={output} ccy={ccy} /></Card>
          <Card title="Cases" aside={<span className="text-[12px] text-[color:var(--de-ink-3)]">saved input sets, recomputed on the current figures</span>}>
            <div className="max-w-md mb-5"><SaveCase /></div>
            <CasesCompare onLoaded={onEdit} />
          </Card>
        </div>
      );
      case 'valuation': return <Card title="Valuation: flow to equity"><Valuation o={output} ccy={ccy} /></Card>;
      case 'methodology': return <Card title="Methodology"><Methodology o={output} /></Card>;
      default: return (
        <div className="space-y-5">
          <Headline o={output} ccy={ccy} />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5"><OperatingChart o={output} /><DebtChart o={output} /></div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5"><ValueBridgeCard o={output} /><SensitivityCard o={output} /></div>
          <NormalisationCards o={output} ccy={ccy} />
          <Checks o={output} />
        </div>
      );
    }
  })();

  return (
    <div className="max-w-[1440px] mx-auto px-6 pt-8 pb-20">
      <div className="de-no-print flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="de-display text-[34px] leading-tight truncate">{output.assumptions.deal_name}</h1>
          <p className="text-[14px] text-[color:var(--de-ink-2)] mt-1">
            {output.assumptions.entry.hold_years}-year hold, priced at {multiple(entry.valuation, 2)} {entryBasisText(entry)} EBITDA
            {facts.sizing_as_of ? `, sized on ${entry.sizing_label} figures to ${facts.sizing_as_of}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {special ? <Button onClick={() => setView('overview')}>Back to the working view</Button> : (
            <>
              <Button onClick={onEdit}>Edit assumptions</Button>
              <Button onClick={() => setView('review')}>Review view</Button>
              <Button onClick={() => setView('onepager')}>One-page summary</Button>
              <Button onClick={() => setOverlay('tools')}>Tools</Button>
            </>
          )}
          {view === 'onepager' && <Button onClick={() => window.print()}>Print or save as PDF</Button>}
          <Button variant="primary" busy={exporting} onClick={exportExcel}>{exporting ? 'Building the workbook' : 'Export Excel model'}</Button>
        </div>
      </div>
      {exportError && <div className="mb-5"><Callout tone="block">{exportError}</Callout></div>}
      {blocks.length > 0 && (
        <div className="mb-5">
          <Callout tone="block" title="These results are not meaningful yet">
            <ul className="list-disc pl-4">{blocks.map((f) => <li key={f.code + f.message}>{f.message}</li>)}</ul>
          </Callout>
        </div>
      )}

      {view === 'review' ? <ReviewView o={output} ccy={ccy} />
        : view === 'onepager' ? <OnePager o={output} ccy={ccy} />
        : (
          <div className="grid grid-cols-1 lg:grid-cols-[13.5rem_minmax(0,1fr)] gap-x-8 gap-y-5">
            <nav aria-label="Results views" className="lg:sticky lg:top-24 self-start">
              <div className="flex lg:block gap-1 overflow-x-auto pb-1 lg:pb-0">
                {groups.map((g) => (
                  <div key={g} className="flex lg:block gap-1 lg:mb-4">
                    <p className="hidden lg:block text-[12px] font-medium text-[color:var(--de-ink-3)] px-3 mb-1">{g}</p>
                    {RESULT_VIEWS.filter((v) => v.group === g && (v.id !== 'valuation' || output.valuation)).map((v) => (
                      <button key={v.id} type="button" aria-current={view === v.id ? 'page' : undefined} onClick={() => setView(v.id)}
                        className={cx('lg:w-full text-left h-9 px-3 rounded-[var(--de-r-sm)] text-[13px] whitespace-nowrap transition-colors',
                          view === v.id ? 'bg-[var(--de-ink)] text-white font-medium' : 'text-[color:var(--de-ink-2)] hover:bg-[var(--de-sunken)] hover:text-[color:var(--de-ink)]')}>
                        {v.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </nav>
            <div key={view} className="de-enter min-w-0">{body}</div>
          </div>
        )}
    </div>
  );
};

export default ResultsScreen;
