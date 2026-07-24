/**
 * v2 OutputTabs (PHASE_E §E2, first slice): Summary (IC one-pager) · Returns (3 streams
 * + value bridge) · Operating (the FCF waterfall table — new) · S&U · Debt schedule
 * (deleveraging footer, SPEC §11) · Balance sheet · Credit (null ⇒ N/A — no 9999/99 can
 * render). Sensitivity/Scenarios/Methodology land in E2b. Everything reads ModelOutput
 * through lib/format; nothing here computes engine arithmetic.
 *
 * Deliberately ABSENT (the §E2 removal list): Fragility, Reality Check, fund economics,
 * add-ons, partial exits, ratchets, PIK elections, refi editors, distributions, trace.
 */
import React, { useState } from 'react';
import type { Engine2ModelOutput } from '../../../lib/engine2/facade';
import { headroom, money, multiple, num, pct } from '../../../lib/format';
import type { Engine2Currency } from '../../../lib/format';

const mono = "'JetBrains Mono', 'SF Mono', Menlo, monospace";
const label = { color: 'rgba(17,17,17,0.45)', fontFamily: mono } as const;
const th = 'text-right font-normal px-2 py-1';
const td = 'text-right px-2 py-1';
const rowB = { borderTop: '1px solid rgba(17,17,17,0.08)' } as const;

type Tab = 'summary' | 'returns' | 'operating' | 'su' | 'debt' | 'bs' | 'credit' | 'sensitivity' | 'scenarios' | 'methodology';
const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'returns', label: 'Returns' },
  { id: 'operating', label: 'Operating' },
  { id: 'su', label: 'S&U' },
  { id: 'debt', label: 'Debt' },
  { id: 'bs', label: 'Balance sheet' },
  { id: 'credit', label: 'Credit' },
  { id: 'sensitivity', label: 'Sensitivity' },
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'methodology', label: 'Methodology' },
];

const Table: React.FC<{ head: string[]; children: React.ReactNode }> = ({ head, children }) => (
  <div style={{ overflowX: 'auto' }}>
    <table className="w-full text-[11px]" style={{ fontFamily: mono, borderCollapse: 'collapse', color: '#111' }}>
      <thead><tr style={{ color: 'rgba(17,17,17,0.45)' }}>{head.map((h, i) => <th key={i} className={i === 0 ? 'text-left font-normal px-2 py-1' : th}>{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

const Summary: React.FC<{ o: Engine2ModelOutput; ccy: Engine2Currency }> = ({ o, ccy }) => (
  <div>
    <div className="flex gap-8 mb-4">
      <div><p className="text-[10px] uppercase tracking-widest" style={label}>Sponsor IRR</p>
        <p className="text-2xl" style={{ fontFamily: mono }}>{pct(o.returns.sponsor_net.irr)}</p></div>
      <div><p className="text-[10px] uppercase tracking-widest" style={label}>MOIC</p>
        <p className="text-2xl" style={{ fontFamily: mono }}>{multiple(o.returns.sponsor_net.moic)}</p></div>
      <div><p className="text-[10px] uppercase tracking-widest" style={label}>Entry → exit</p>
        <p className="text-2xl" style={{ fontFamily: mono }}>{multiple(o.derived.entry_multiple)} → {multiple(o.exit.exit_ev / o.exit.exit_ebitda_basis_value)}</p></div>
      {/* §11 [v1.1.2]: entry leverage is GROSS (par ÷ FY EBITDA) — labelled, because the
          per-year credit metrics on the other tabs are NET. */}
      <div><p className="text-[10px] uppercase tracking-widest" style={label}>Entry gross leverage · Y1 DSCR</p>
        <p className="text-2xl" style={{ fontFamily: mono }}>{multiple(o.derived.entry_gross_leverage_fy)} · {o.credit[0]?.dscr == null ? 'N/A' : num(o.credit[0].dscr, 2)}</p></div>
    </div>
    <Table head={['Value bridge', money(0, ccy) === '' ? '' : '']}>
      {[
        ['EBITDA growth @ entry multiple', o.bridge.ebitda_growth_at_entry_multiple],
        ['Multiple change', o.bridge.multiple_change_bar],
        ['Interaction', o.bridge.interaction],
        ['Net-debt paydown', o.bridge.net_debt_paydown],
      ].map(([l, v]) => (
        <tr key={l as string} style={rowB}><td className="px-2 py-1">{l}</td><td className={td}>{money(v as number, ccy)}</td></tr>
      ))}
    </Table>
    <p className="text-[10px] mt-2" style={label}>
      FCF conversion by year: {o.credit.map((c) => (c.fcf_conversion == null ? 'N/A' : pct(c.fcf_conversion))).join(' · ')}
    </p>
  </div>
);

const Returns: React.FC<{ o: Engine2ModelOutput; ccy: Engine2Currency }> = ({ o, ccy }) => (
  <Table head={['Stream', 'Outflow', 'Final inflow', 'IRR', 'MOIC']}>
    {([['Sponsor net', o.returns.sponsor_net], ['Pre-promote', o.returns.pre_promote], ['Unlevered', o.returns.unlevered]] as const).map(([l, s]) => (
      <tr key={l} style={rowB}>
        <td className="px-2 py-1">{l}</td>
        <td className={td}>{money(s.cashflows[0], ccy)}</td>
        <td className={td}>{money(s.cashflows[s.cashflows.length - 1], ccy)}</td>
        <td className={td}>{pct(s.irr)}</td>
        <td className={td}>{multiple(s.moic)}</td>
      </tr>
    ))}
  </Table>
);

const Operating: React.FC<{ o: Engine2ModelOutput; ccy: Engine2Currency }> = ({ o, ccy }) => (
  <Table head={['Year', 'Revenue', 'EBITDA', 'Margin', 'D&A', 'Capex', 'ΔNWC', 'Cash tax', 'FCF pre-debt']}>
    {o.operating.map((y, i) => (
      <tr key={i} style={rowB}>
        <td className="px-2 py-1">Y{i + 1}</td>
        <td className={td}>{money(y.revenue, ccy, 0)}</td>
        <td className={td}>{money(y.ebitda_adj, ccy, 0)}</td>
        <td className={td}>{pct(y.margin)}</td>
        <td className={td}>{num(y.da, 1)}</td>
        <td className={td}>{num(y.maint_capex + y.growth_capex, 1)}</td>
        <td className={td}>{num(y.delta_nwc, 1)}</td>
        <td className={td}>{num(o.tax[i].cash_tax, 1)}</td>
        <td className={td}>{money(y.fcf_pre_debt, ccy, 1)}</td>
      </tr>
    ))}
  </Table>
);

const SU: React.FC<{ o: Engine2ModelOutput; ccy: Engine2Currency }> = ({ o, ccy }) => (
  <div className="grid grid-cols-2 gap-6">
    <Table head={['Uses', '']}>
      {[
        ['Enterprise value', o.sources_uses.enterprise_value],
        ['Transaction costs', o.sources_uses.transaction_costs],
        ['Financing fees', o.sources_uses.financing_fees],
        ['OID', o.sources_uses.oid_funded],
        ['Cash to balance sheet', o.sources_uses.cash_to_balance_sheet],
        ['Total uses', o.sources_uses.total_uses],
      ].map(([l, v]) => <tr key={l as string} style={rowB}><td className="px-2 py-1">{l}</td><td className={td}>{money(v as number, ccy)}</td></tr>)}
    </Table>
    <Table head={['Sources', '']}>
      {[
        ...o.sources_uses.debt_at_par.map((d) => [d.name, d.amount] as const),
        ['Sponsor equity', o.sources_uses.sponsor_equity] as const,
        ['Total sources', o.sources_uses.total_sources] as const,
      ].map(([l, v]) => <tr key={l} style={rowB}><td className="px-2 py-1">{l}</td><td className={td}>{money(v, ccy)}</td></tr>)}
    </Table>
  </div>
);

const Debt: React.FC<{ o: Engine2ModelOutput; ccy: Engine2Currency }> = ({ o, ccy }) => {
  const last = o.credit[o.credit.length - 1];
  return (
    <div>
      {o.tranches.map((rows, k) => (
        <div key={k} className="mb-3">
          <p className="text-[10px] uppercase tracking-widest mb-1" style={label}>{rows[0]?.name ?? `Tranche ${k + 1}`}</p>
          <Table head={['Year', 'Beginning', 'Interest', 'PIK', 'Amort', 'Sweep', 'Ending']}>
            {rows.map((r, i) => (
              <tr key={i} style={rowB}>
                <td className="px-2 py-1">Y{i + 1}</td>
                <td className={td}>{num(r.beginning_balance, 1)}</td>
                <td className={td}>{num(r.cash_interest, 2)}</td>
                <td className={td}>{num(r.pik_accrual, 2)}</td>
                <td className={td}>{num(r.mandatory_amort, 2)}</td>
                <td className={td}>{num(r.sweep_repayment, 2)}</td>
                <td className={td}>{num(r.ending_balance, 1)}</td>
              </tr>
            ))}
          </Table>
        </div>
      ))}
      {o.revolver && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-widest mb-1" style={label}>Revolver</p>
          <Table head={['Year', 'Drawn (beg)', 'Draw', 'Repay', 'Interest', 'Fee', 'Drawn (end)']}>
            {o.revolver.map((r, i) => (
              <tr key={i} style={rowB}>
                <td className="px-2 py-1">Y{i + 1}</td>
                <td className={td}>{num(r.beginning_drawn, 2)}</td>
                <td className={td}>{num(r.draw, 2)}</td>
                <td className={td}>{num(r.repayment, 2)}</td>
                <td className={td}>{num(r.cash_interest, 2)}</td>
                <td className={td}>{num(r.commitment_fee, 2)}</td>
                <td className={td}>{num(r.ending_drawn, 2)}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
      {/* SPEC §11 deleveraging footer — first-class, never buried */}
      <p className="text-[10px] mt-1" style={label}>
        Cumulative paydown: {last?.cumulative_paydown_pct_of_entry_debt == null ? 'N/A' : pct(last.cumulative_paydown_pct_of_entry_debt)} of entry debt
        {' · '}FCF conversion (final year): {last?.fcf_conversion == null ? 'N/A' : pct(last.fcf_conversion)}
        {' · '}Closing cash: {money(o.waterfall[o.waterfall.length - 1]?.closing_cash ?? null, ccy)}
      </p>
    </div>
  );
};

const BS: React.FC<{ o: Engine2ModelOutput; ccy: Engine2Currency }> = ({ o, ccy }) => (
  <Table head={['Year', 'Cash', 'NWC', 'PP&E', 'DFC', 'Goodwill', 'Assets', 'Debt', 'Equity', 'Check']}>
    {o.balance_sheet.map((b, i) => (
      <tr key={i} style={rowB}>
        <td className="px-2 py-1">{i === 0 ? 'Open' : `Y${i}`}</td>
        <td className={td}>{num(b.cash, 1)}</td>
        <td className={td}>{num(b.operating_nwc, 1)}</td>
        <td className={td}>{num(b.ppe, 1)}</td>
        <td className={td}>{num(b.deferred_financing_costs, 1)}</td>
        <td className={td}>{num(b.goodwill, 1)}</td>
        <td className={td}>{money(b.total_assets, ccy)}</td>
        <td className={td}>{num(b.debt_at_par, 1)}</td>
        <td className={td}>{num(b.equity, 1)}</td>
        <td className={td}>{Math.abs(b.check) < 0.005 ? '✓' : num(b.check, 3)}</td>
      </tr>
    ))}
  </Table>
);

const Credit: React.FC<{ o: Engine2ModelOutput }> = ({ o }) => (
  <Table head={['Year', 'Net lev', 'Senior net', 'ICR', 'FCCR', 'DSCR', 'Lev headroom', 'Springing']}>
    {o.credit.map((c, i) => (
      <tr key={i} style={rowB}>
        <td className="px-2 py-1">Y{i + 1}</td>
        <td className={td}>{c.net_leverage == null ? 'N/A' : num(c.net_leverage, 2)}</td>
        <td className={td}>{c.senior_net_leverage == null ? 'N/A' : num(c.senior_net_leverage, 2)}</td>
        <td className={td}>{c.icr == null ? 'N/A' : num(c.icr, 2)}</td>
        <td className={td}>{c.fccr == null ? 'N/A' : num(c.fccr, 2)}</td>
        <td className={td}>{c.dscr == null ? 'N/A' : num(c.dscr, 2)}</td>
        <td className={td}>{headroom(c.leverage_headroom)}</td>
        <td className={td}>{c.springing_test_active ? 'active' : '—'}</td>
      </tr>
    ))}
  </Table>
);

const Sensitivity: React.FC<{ o: Engine2ModelOutput }> = ({ o }) => {
  const grid = o.sensitivity?.[0];
  if (!grid) return <p className="text-[11px]" style={label}>Run “Build” to compute the sensitivity exhibits.</p>;
  const cell = (c: number, v: number | null, isBase: boolean, fmt: (x: number | null) => string) => (
    <td key={c} className={td} style={isBase ? { background: 'rgba(21,93,252,0.10)', fontWeight: 600 } : undefined}>{fmt(v)}</td>
  );
  const block = (title: string, m: (number | null)[][], fmt: (x: number | null) => string) => (
    <div className="mb-4">
      <p className="text-[10px] uppercase tracking-widest mb-1" style={label}>{title} — {grid.row_axis} (rows) × {grid.col_axis} (cols)</p>
      <Table head={['', ...grid.col_values.map((v) => num(v, 1))]}>
        {m.map((row, r) => (
          <tr key={r} style={rowB}>
            <td className="px-2 py-1">{num(grid.row_values[r], 1)}</td>
            {row.map((v, c) => cell(c, v, r === grid.base_row_index && c === grid.base_col_index, fmt))}
          </tr>
        ))}
      </Table>
    </div>
  );
  return (
    <div>
      {block('Sponsor IRR', grid.irr, (x) => pct(x))}
      {block('Sponsor MOIC', grid.moic, (x) => multiple(x))}
      <p className="text-[10px]" style={label}>Entry-side axes re-price entry; operating axes hold the base structure frozen (SPEC §13). Center cell ≡ base.</p>
    </div>
  );
};

const Scenarios: React.FC<{ o: Engine2ModelOutput; ccy: Engine2Currency }> = ({ o, ccy }) => {
  if (!o.scenarios?.length) return <p className="text-[11px]" style={label}>Run “Build” to compute the scenario exhibits.</p>;
  return (
    <div>
      <Table head={['Scenario', 'IRR', 'Δ vs base', 'MOIC', 'Min closing cash', 'Breach year', 'Floor breach']}>
        {o.scenarios.map((s) => {
          const minCash = Math.min(...s.waterfall.map((w) => w.closing_cash));
          const anyBreach = s.waterfall.some((w) => w.cash_floor_breach);
          return (
            <tr key={s.name} style={rowB}>
              <td className="px-2 py-1">{s.name}</td>
              <td className={td}>{pct(s.returns.sponsor_net.irr)}</td>
              <td className={td}>{s.irr_delta_vs_base == null ? 'N/A' : pct(s.irr_delta_vs_base)}</td>
              <td className={td}>{multiple(s.returns.sponsor_net.moic)}</td>
              <td className={td}>{money(minCash, ccy)}</td>
              <td className={td}>{s.covenant_breach_year == null ? '—' : `Y${s.covenant_breach_year + 1}`}</td>
              <td className={td}>{anyBreach ? '■ yes' : '—'}</td>
            </tr>
          );
        })}
      </Table>
      <p className="text-[10px] mt-2" style={label}>Entry EV, debt quantum and sponsor equity are FROZEN at base-case close in every scenario (SPEC §13 — a downside never silently re-prices entry).</p>
    </div>
  );
};

/** SPEC §15: the assumptions & methodology page — every disclosed simplification, matter-of-fact. */
const DISCLOSURES: [string, string][] = [
  ['Annual periods', 'flows at period end; mid-year IRR display option only'],
  ['Beginning-balance interest', 'strictly sequential engine, no solver — conservative on amortizing/swept tranches'],
  ['Day-count', 'annual accrual understates Actual/360 cash interest ~1.0–1.4% of interest; basis stated per tranche'],
  ['Static rates', 'no forward curve in v1; base rate is a template value'],
  ['Constant tax rate', 'effective rate from the filing held flat'],
  ['Exit = entry multiple', 'multiple expansion requires an explicit thesis (DR-4)'],
  ['§382 limit static', 'unused-limitation carryforward omitted — conservative'],
  ['NOL usage not optimized', 'consumed in full per §6.3 even when the minimum-tax floor binds or the current-year benefit is nil'],
  ['Acquired §163(j) carryforwards', 'out of scope in v1'],
  ['Exit-year fee write-off', 'deducted UNCAPPED (Treas. Reg. §1.163(j)-1(b)(22))'],
  ['PP&E roll', 'mechanical (capex − D&A); may go negative — warned, never clamped'],
  ['Post-2025 OBBBA sub-changes', 'no interest capitalization, no CFC modeling'],
  ['Call protection', 'BSL soft call exempt for sweeps/mandatory; private-credit hard call + CoC put disclosed omissions (Phase G)'],
];

const Methodology: React.FC = () => (
  <div>
    <p className="text-[10px] uppercase tracking-widest mb-2" style={label}>Assumptions & methodology (SPEC §15) — a model is a range, not a point</p>
    <Table head={['Simplification', 'Why it is immaterial or conservative']}>
      {DISCLOSURES.map(([a, b]) => (
        <tr key={a} style={rowB}><td className="px-2 py-1">{a}</td><td className="px-2 py-1 text-left" style={{ color: 'rgba(17,17,17,0.65)' }}>{b}</td></tr>
      ))}
    </Table>
  </div>
);

const OutputTabs: React.FC<{ output: Engine2ModelOutput; currency: Engine2Currency }> = ({ output, currency }) => {
  const [tab, setTab] = useState<Tab>('summary');
  return (
    <div className="mt-5">
      <div className="flex gap-0.5 mb-3 flex-wrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="px-2.5 py-1 text-[9px] uppercase tracking-widest"
            style={{ background: tab === t.id ? '#111' : 'transparent', color: tab === t.id ? '#fff' : 'rgba(17,17,17,0.5)', fontFamily: mono, border: '1px solid rgba(17,17,17,0.12)' }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'summary' && <Summary o={output} ccy={currency} />}
      {tab === 'returns' && <Returns o={output} ccy={currency} />}
      {tab === 'operating' && <Operating o={output} ccy={currency} />}
      {tab === 'su' && <SU o={output} ccy={currency} />}
      {tab === 'debt' && <Debt o={output} ccy={currency} />}
      {tab === 'bs' && <BS o={output} ccy={currency} />}
      {tab === 'credit' && <Credit o={output} />}
      {tab === 'sensitivity' && <Sensitivity o={output} />}
      {tab === 'scenarios' && <Scenarios o={output} ccy={currency} />}
      {tab === 'methodology' && <Methodology />}
    </div>
  );
};

export default OutputTabs;
