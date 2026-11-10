/**
 * Step 2 — Clean. The sourced statements, the analyst's adjustments and the two bridges
 * (rebuild/CLEANING_AND_SUITE_PLAN.md §6.2).
 *
 * This screen edits the ledger and draws what lib/cleaning returns. It does no arithmetic:
 * every figure comes from `applyCleaning` (the bridges) or lib/cleaning/view (geometry and the
 * impact strip). Nothing is pre-ticked, nothing is defaulted, and a blank stays a blank.
 */
import React, { useState } from 'react';
import { useCleaning } from '../../../store/cleaning';
import { LINES, LINE_META, type Statement } from '../../../lib/statements/lines';
import { cellAt, type AdjustmentCandidate, type LineId, type PeriodKey, type StatementPack } from '../../../lib/statements/types';
import { periodLabel, restatableAt } from '../../../lib/cleaning/apply';
import { blockers } from '../../../lib/cleaning/checks';
import {
  acceptCandidate, addAdjustment, addNetDebtItem, candidateAccepted, fillNilElsewhere, ledgerIsEmpty, removeAdjustment,
  removeNetDebtItem, removeOverride, setAdjustmentAmount, setLeaseChoice, setOverride, updateAdjustment, updateNetDebtItem,
} from '../../../lib/cleaning/ops';
import { ebitdaWaterfall, impactSummary, netDebtWaterfall } from '../../../lib/cleaning/view';
import { multiple, pct } from '../../../lib/format';
import Waterfall from '../ui/Waterfall';
import type { Adjustment, AdjustmentCategory, AdjustmentTarget, Bridges, LeaseChoice, LineBridge, NetDebtCategory } from '../../../lib/cleaning/types';
import { AmountInput, Button, Callout, Card, Eyebrow, Kpi, Select, Tag, TextInput, acct, cx, delta } from '../ui/kit';

const STATEMENTS: { id: Statement; label: string }[] = [
  { id: 'income', label: 'Income statement' },
  { id: 'balance_sheet', label: 'Balance sheet' },
  { id: 'cash_flow', label: 'Cash flow' },
];
/** Shown even when the source lacks them — they are the lines the model reads. */
const CORE_LINES: ReadonlySet<LineId> = new Set(['revenue', 'operating_income', 'da', 'ebitda', 'capex', 'cash', 'borrowings']);
const ADJUSTED_LINES: ReadonlySet<LineId> = new Set(['revenue', 'ebitda', 'da', 'capex']);

const TARGET_LABEL: Record<AdjustmentTarget, string> = { ebitda: 'EBITDA', revenue: 'Revenue', da: 'D&A', capex: 'Capex', nwc: 'Operating NWC' };
const CATEGORY_LABEL: Record<AdjustmentCategory, string> = {
  non_recurring: 'Non-recurring', restructuring: 'Restructuring', impairment: 'Impairment', sbc: 'Share-based pay',
  transaction_costs: 'Transaction costs', litigation: 'Litigation', pro_forma: 'Pro forma', run_rate: 'Run-rate',
  accounting_policy: 'Accounting policy', other: 'Other',
};
const ND_CATEGORY_LABEL: Record<NetDebtCategory, string> = {
  pension: 'Pension', earn_out: 'Earn-out', deferred_consideration: 'Deferred consideration', nci: 'Minority interests',
  preferred: 'Preferred', restricted_cash: 'Restricted cash', trapped_cash: 'Trapped cash', other: 'Other',
};
const LEASE_OPTIONS: { id: LeaseChoice; label: string; hint: string }[] = [
  { id: 'none', label: 'Not debt', hint: 'No lease liability counts as debt.' },
  { id: 'finance', label: 'Finance leases only', hint: 'The usual US GAAP credit view: operating leases stay out, their rent stays in EBITDA.' },
  { id: 'all', label: 'All leases', hint: 'The IFRS 16 view: every lease liability is debt, and EBITDA is before lease cost.' },
];

// ── statements grid ───────────────────────────────────────────────────────────────────────
const StatementsCard: React.FC<{ pack: StatementPack; bridges: Bridges }> = ({ pack, bridges }) => {
  const ledger = useCleaning((s) => s.ledger);
  const edit = useCleaning((s) => s.edit);
  const [tab, setTab] = useState<Statement>('income');
  const [sel, setSel] = useState<{ line: LineId; period: PeriodKey } | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  const lines = LINES.filter((l) => l.statement === tab && (CORE_LINES.has(l.id) || pack.lines[l.id]));
  const untagged = LINES.filter((l) => l.statement === tab && !CORE_LINES.has(l.id) && !pack.lines[l.id]).length;
  const overrideOf = (line: LineId, period: PeriodKey) => ledger.overrides.find((o) => o.line === line && o.period === period) ?? null;
  const select = (line: LineId, period: PeriodKey) => {
    const o = overrideOf(line, period);
    setSel({ line, period });
    setValue(o?.value ?? null);
    setReason(o?.reason ?? '');
  };
  const selCell = sel ? cellAt(pack, sel.line, sel.period) : null;
  const selOverride = sel ? overrideOf(sel.line, sel.period) : null;
  const selRestatable = sel ? restatableAt(pack, sel.line, sel.period) : false;

  return (
    <Card
      flush
      title="Statements as sourced"
      aside={<span className="font-sans text-[12px] text-[color:var(--de-ink-3)]">{pack.currency} millions · click a figure to see its source or restate it</span>}
    >
      <div className="flex border-b border-[color:var(--de-rule)] px-2" role="tablist">
        {STATEMENTS.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={tab === s.id} onClick={() => { setTab(s.id); setSel(null); }}
            className={cx('px-3 py-2 font-sans text-[13px] border-b-2 -mb-px', tab === s.id ? 'border-[color:var(--de-ink)] font-semibold' : 'border-transparent text-[color:var(--de-ink-2)] hover:text-[color:var(--de-ink)]')}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[color:var(--de-rule-strong)]">
              <th className="sticky left-0 bg-[var(--de-surface)] text-left font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--de-ink-3)] px-4 py-2 min-w-[15rem]">Line</th>
              {pack.periods.map((p) => (
                <th key={p.key} className="text-right font-sans text-[12px] font-semibold px-3 py-2 whitespace-nowrap">
                  {periodLabel(pack, p.key)}
                  {p.key === pack.sizing && <span className="ml-1.5 align-middle"><Tag tone="accent" title="The period the deal is priced and sized on">sizing</Tag></span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const bridge: LineBridge[] | null = ADJUSTED_LINES.has(l.id) ? bridges[l.id as 'revenue' | 'ebitda' | 'da' | 'capex'] : null;
              const showAdjusted = !!bridge && bridge.some((b) => b.rows.length > 0 || (b.restated !== b.reported));
              return (
                <React.Fragment key={l.id}>
                  <tr className={cx('border-b border-[color:var(--de-rule)]', l.total && 'border-t border-t-[color:var(--de-rule-strong)]')}>
                    <th scope="row" className={cx('sticky left-0 bg-[var(--de-surface)] text-left font-sans text-[13px] px-4 py-1.5', l.total ? 'font-semibold' : 'font-normal')}>
                      {l.label}
                      {l.hint && <span className="block text-[11px] font-normal text-[color:var(--de-ink-3)]">{l.hint}</span>}
                    </th>
                    {pack.periods.map((p) => {
                      const cell = cellAt(pack, l.id, p.key);
                      const o = overrideOf(l.id, p.key);
                      const can = restatableAt(pack, l.id, p.key);
                      const active = sel?.line === l.id && sel.period === p.key;
                      if (!cell && !o && !can) {
                        return <td key={p.key} className="px-3 py-1.5 text-right font-sans text-[12px] text-[color:var(--de-ink-3)]">{p.kind === 'LTM' || (l.kind === 'instant' && cellAt(pack, l.id, p.key) === null && pack.lines[l.id]) ? '' : 'not tagged'}</td>;
                      }
                      return (
                        <td key={p.key} className={cx('px-1 py-0.5 text-right', active && 'bg-[var(--de-input-soft)]')}>
                          <button type="button" onClick={() => select(l.id, p.key)}
                            title={o ? `Restated from ${cell ? acct(cell.value) : 'nothing in the source'} — ${o.reason}` : cell ? cell.provenance.detail : 'Not in the source — click to enter'}
                            className={cx('de-num w-full px-2 py-1 text-[13px] text-right hover:bg-[var(--de-input-soft)]', l.total && 'font-semibold', o && 'text-[color:var(--de-input)]', !cell && !o && 'text-[color:var(--de-ink-3)] font-sans text-[12px]')}>
                            {o ? acct(o.value) : cell ? acct(cell.value) : 'not tagged'}
                            {o && <sup aria-label="restated" className="ml-0.5">r</sup>}
                            {cell?.note && !o && <sup aria-label="has a caveat" className="ml-0.5 text-[color:var(--de-warn)]">!</sup>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                  {showAdjusted && bridge && (
                    <tr className="border-b border-[color:var(--de-rule)]">
                      <th scope="row" className="sticky left-0 bg-[var(--de-surface)] text-left font-sans text-[13px] font-semibold px-4 py-1.5 pl-7 text-[color:var(--de-pos)]">Adjusted</th>
                      {pack.periods.map((p) => {
                        const b = bridge.find((x) => x.period === p.key);
                        const blank = !b || b.adjusted === null;
                        return (
                          <td key={p.key} className={cx('de-num px-3 py-1.5 text-right text-[13px] font-semibold', blank ? 'text-[color:var(--de-ink-3)]' : 'text-[color:var(--de-pos)]')}
                            title={blank && b && b.rows.length ? 'An adjustment has no amount for this period, so the adjusted figure is not known' : undefined}>
                            {blank ? '–' : acct(b!.adjusted)}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {untagged > 0 && (
        <p className="px-4 py-2 font-sans text-[12px] text-[color:var(--de-ink-3)] border-t border-[color:var(--de-rule)]">
          {untagged} other line{untagged === 1 ? ' is' : 's are'} not tagged in this source and {untagged === 1 ? 'is' : 'are'} not shown. Nothing is estimated in their place.
        </p>
      )}

      {sel && (
        <div className="border-t border-[color:var(--de-rule-strong)] p-4 bg-[var(--de-sunken)]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-sans text-[13px] font-semibold">{LINE_META[sel.line].label} · {periodLabel(pack, sel.period)}</p>
            <Button variant="quiet" size="sm" onClick={() => setSel(null)}>Close</Button>
          </div>
          <p className="font-sans text-[12px] text-[color:var(--de-ink-2)] mt-1">
            {selCell ? <>Source: {selCell.provenance.detail}{selCell.provenance.filed ? ` · filed ${selCell.provenance.filed}` : ''}</> : 'The source does not give this figure.'}
            {selCell?.provenance.url && <> · <a className="underline text-[color:var(--de-input)]" href={selCell.provenance.url} target="_blank" rel="noreferrer">open the filing ↗</a></>}
          </p>
          {selCell?.note && <p className="font-sans text-[12px] text-[color:var(--de-warn)] mt-1">{selCell.note}</p>}
          {selRestatable ? (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-[9rem_minmax(0,1fr)_auto] gap-2 items-end">
              <label className="font-sans text-[12px] text-[color:var(--de-ink-2)]">
                {selCell ? 'Restated figure' : 'Figure'}
                <AmountInput ariaLabel="Restated figure" value={value} onCommit={setValue} />
              </label>
              <label className="font-sans text-[12px] text-[color:var(--de-ink-2)]">
                Reason (required)
                <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. reclassified a one-off cost below operating income" />
              </label>
              <span className="flex gap-2">
                <Button variant="dark" size="sm" disabled={value === null || !reason.trim()}
                  onClick={() => { if (value !== null) edit((l) => setOverride(l, sel.line, sel.period, value, reason.trim())); }}>
                  {selOverride ? 'Update' : 'Restate'}
                </Button>
                {selOverride && (
                  <Button size="sm" onClick={() => { edit((l) => removeOverride(l, sel.line, sel.period)); setValue(null); setReason(''); }}>Back to sourced</Button>
                )}
              </span>
            </div>
          ) : (
            <p className="font-sans text-[12px] text-[color:var(--de-ink-3)] mt-2">
              {sel.line === 'ebitda'
                ? 'Reported EBITDA here is operating income plus D&A — restate those cells, or add an adjustment row below.'
                : 'This line is shown for reference. The model does not read it, so it cannot be restated here.'}
            </p>
          )}
        </div>
      )}
    </Card>
  );
};

// ── adjustments ───────────────────────────────────────────────────────────────────────────
const AdjustmentsCard: React.FC<{ pack: StatementPack }> = ({ pack }) => {
  const adjustments = useCleaning((s) => s.ledger.adjustments);
  const edit = useCleaning((s) => s.edit);
  const required = (a: Adjustment): PeriodKey | null => (a.target === 'ebitda' || a.target === 'revenue' ? pack.sizing : pack.anchor);
  return (
    <Card
      flush
      title="Adjustments"
      aside={
        <span className="flex flex-wrap gap-1.5">
          {(['ebitda', 'revenue', 'capex', 'da', 'nwc'] as AdjustmentTarget[]).map((t) => (
            <Button key={t} size="sm" onClick={() => edit((l) => addAdjustment(l, t))}>+ {TARGET_LABEL[t]}</Button>
          ))}
        </span>
      }
    >
      {adjustments.length === 0 ? (
        <p className="p-4 font-sans text-[13px] text-[color:var(--de-ink-2)]">
          No adjustments. Add a row above, or take one from “Found in the filing” below. A positive amount increases the line; enter a cost you are adding back to EBITDA as a positive number.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--de-rule-strong)] font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--de-ink-3)]">
                <th className="px-3 py-2 w-8"><span className="sr-only">Include</span></th>
                <th className="text-left px-2 py-2 min-w-[12rem]">Adjustment</th>
                <th className="text-left px-2 py-2">Line</th>
                <th className="text-left px-2 py-2" title="Does the cost stop or continue after the deal?">After the deal</th>
                <th className="text-left px-2 py-2">Type</th>
                {pack.periods.map((p) => <th key={p.key} className="text-right px-2 py-2 whitespace-nowrap">{periodLabel(pack, p.key)}</th>)}
                <th className="px-2 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((a) => {
                const need = required(a);
                const gaps = pack.periods.some((p) => (a.amounts[p.key] ?? null) === null);
                return (
                  <tr key={a.id} className={cx('border-b border-[color:var(--de-rule)] align-top', !a.included && 'opacity-50')}>
                    <td className="px-3 py-2">
                      <input type="checkbox" aria-label={`Include ${a.label || 'this adjustment'}`} checked={a.included}
                        onChange={(e) => edit((l) => updateAdjustment(l, a.id, { included: e.target.checked }))} />
                    </td>
                    <td className="px-2 py-1.5">
                      <TextInput aria-label="Adjustment name" value={a.label} invalid={a.included && !a.label.trim()} placeholder="Name this adjustment"
                        onChange={(e) => edit((l) => updateAdjustment(l, a.id, { label: e.target.value }))} />
                      <span className="flex flex-wrap items-center gap-1.5 mt-1">
                        {a.source.kind === 'filing' && <Tag title={a.source.tag}>from the filing</Tag>}
                        {a.source.kind === 'filing' && a.source.url && <a className="font-sans text-[11px] underline text-[color:var(--de-input)]" href={a.source.url} target="_blank" rel="noreferrer">filing ↗</a>}
                        {a.source.kind === 'user' && <Tag tone="pos">yours</Tag>}
                        {a.source.kind === 'filing' && pack.candidates.find((c) => c.tag === (a.source.kind === 'filing' ? a.source.tag : ''))?.caveat && (
                          <label className="font-sans text-[11px] text-[color:var(--de-ink-2)] inline-flex items-center gap-1">
                            <input type="checkbox" checked={!!a.confirmed_in_operating_income}
                              onChange={(e) => edit((l) => updateAdjustment(l, a.id, { confirmed_in_operating_income: e.target.checked }))} />
                            I have checked the caveat
                          </label>
                        )}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <Select aria-label="Line adjusted" value={a.target} onChange={(e) => edit((l) => updateAdjustment(l, a.id, { target: e.target.value as AdjustmentTarget }))}>
                        {(Object.keys(TARGET_LABEL) as AdjustmentTarget[]).map((t) => <option key={t} value={t}>{TARGET_LABEL[t]}</option>)}
                      </Select>
                    </td>
                    <td className="px-2 py-1.5">
                      {a.target === 'ebitda' ? (
                        <Select aria-label="After the deal" value={a.forecast ?? ''} className={a.included && a.forecast === null ? 'border-[color:var(--de-accent)]' : undefined}
                          onChange={(e) => edit((l) => updateAdjustment(l, a.id, { forecast: (e.target.value || null) as Adjustment['forecast'] }))}>
                          <option value="">choose…</option>
                          <option value="gone">stops</option>
                          <option value="continues">continues</option>
                        </Select>
                      ) : <span className="font-sans text-[12px] text-[color:var(--de-ink-3)]">–</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <Select aria-label="Type" value={a.category} onChange={(e) => edit((l) => updateAdjustment(l, a.id, { category: e.target.value as AdjustmentCategory }))}>
                        {(Object.keys(CATEGORY_LABEL) as AdjustmentCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                      </Select>
                    </td>
                    {pack.periods.map((p) => (
                      <td key={p.key} className="px-1 py-1.5 min-w-[6.25rem]">
                        <AmountInput ariaLabel={`${a.label || 'Adjustment'} — ${periodLabel(pack, p.key)}`} value={a.amounts[p.key] ?? null}
                          required={a.included && p.key === need}
                          onCommit={(v) => edit((l) => setAdjustmentAmount(l, a.id, p.key, v))} />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 whitespace-nowrap text-right">
                      {gaps && <Button variant="quiet" size="sm" title="Write an explicit zero in every period that has no amount" onClick={() => edit((l) => fillNilElsewhere(l, a.id, pack))}>nil elsewhere</Button>}
                      <Button variant="quiet" size="sm" onClick={() => edit((l) => removeAdjustment(l, a.id))}>remove</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-4 py-2 font-sans text-[12px] text-[color:var(--de-ink-3)] border-t border-[color:var(--de-rule)]">
        A blank amount means “not entered”, never zero: the adjusted figure for that period stays blank until you enter an amount or choose “nil elsewhere”. For an EBITDA add-back, say whether the cost stops after the deal or continues: one that continues is added back for the price and leverage, but stays in the forecast, so it never turns into cash flow it will not produce. The type is a label only.
      </p>
    </Card>
  );
};

// ── proposals ─────────────────────────────────────────────────────────────────────────────
const ProposalsCard: React.FC<{ pack: StatementPack }> = ({ pack }) => {
  const ledger = useCleaning((s) => s.ledger);
  const dismissed = useCleaning((s) => s.dismissed);
  const edit = useCleaning((s) => s.edit);
  const dismiss = useCleaning((s) => s.dismiss);
  const open = pack.candidates.filter((c) => !dismissed.includes(c.id) && !candidateAccepted(ledger, c));
  const amounts = (c: AdjustmentCandidate) => pack.periods.filter((p) => p.key in c.amounts).map((p) => `${periodLabel(pack, p.key)} ${delta(c.amounts[p.key])}`).join(' · ');
  return (
    <Card title="Found in the filing" aside={<span className="font-sans text-[12px] text-[color:var(--de-ink-3)]">proposals only — nothing is applied until you add it</span>}>
      {open.length === 0 ? (
        <p className="font-sans text-[13px] text-[color:var(--de-ink-2)]">
          {pack.candidates.length ? 'Every item found in the filing has been added or dismissed.' : pack.notes.find((n) => n.startsWith('Detected')) ?? 'No tagged one-off or debt-like items were found in this source. Add adjustments by hand above.'}
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--de-rule)] -my-3">
          {open.map((c) => (
            <li key={c.id} className="py-3 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 items-start">
              <div className="min-w-0">
                <p className="font-sans text-[13px] font-semibold">
                  {c.label} <Tag>{c.bridge === 'ebitda' ? 'EBITDA' : c.side === 'cash_like' ? 'Net debt · cash' : 'Net debt · debt-like'}</Tag>
                </p>
                <p className="de-num text-[12px] mt-0.5">{amounts(c)}</p>
                <p className="font-sans text-[12px] text-[color:var(--de-ink-2)] mt-1">{c.rationale}</p>
                {c.caveat && <p className="font-sans text-[12px] text-[color:var(--de-warn)] mt-1">{c.caveat}</p>}
                <p className="font-sans text-[11px] text-[color:var(--de-ink-3)] mt-1">
                  {c.taxonomy}:{c.tag}{c.url && <> · <a className="underline text-[color:var(--de-input)]" href={c.url} target="_blank" rel="noreferrer">filing ↗</a></>}
                </p>
              </div>
              <span className="flex gap-2">
                <Button variant="dark" size="sm" onClick={() => edit((l) => acceptCandidate(l, c))}>Add to bridge</Button>
                <Button size="sm" onClick={() => dismiss(c.id)}>Dismiss</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

// ── bridges (right rail) ──────────────────────────────────────────────────────────────────
const EbitdaBridgeCard: React.FC<{ pack: StatementPack; bridges: Bridges }> = ({ pack, bridges }) => {
  const [period, setPeriod] = useState<PeriodKey | null>(null);
  const key = period ?? pack.sizing;
  const b = bridges.ebitda.find((x) => x.period === key) ?? null;
  return (
    <Card title="EBITDA bridge" aside={
      <Select aria-label="Bridge period" value={key ?? ''} onChange={(e) => setPeriod(e.target.value)}>
        {pack.periods.map((p) => <option key={p.key} value={p.key}>{periodLabel(pack, p.key)}{p.key === pack.sizing ? ' (sizing)' : ''}</option>)}
      </Select>
    }>
      {b ? <Waterfall steps={ebitdaWaterfall(b)} /> : <p className="font-sans text-[13px] text-[color:var(--de-ink-2)]">No historical period in this source.</p>}
      <p className="font-sans text-[12px] text-[color:var(--de-ink-3)] mt-3">
        Adjusted EBITDA is what the deal is priced and levered on, and the base of the forecast margin.
      </p>
    </Card>
  );
};

const NetDebtCard: React.FC<{ pack: StatementPack; bridges: Bridges }> = ({ pack, bridges }) => {
  const items = useCleaning((s) => s.ledger.net_debt_items);
  const edit = useCleaning((s) => s.edit);
  const nd = bridges.net_debt;
  if (!nd) return null;
  return (
    <Card title="Net debt bridge" aside={<span className="font-sans text-[12px] text-[color:var(--de-ink-3)]">at {pack.anchor}</span>}>
      <Waterfall steps={netDebtWaterfall(nd)} debt />
      {nd.leases.length > 0 && (
        <fieldset className="mt-4">
          <legend className="font-sans text-[12px] font-semibold">Are lease liabilities debt?</legend>
          <p className="font-sans text-[12px] text-[color:var(--de-ink-2)] mt-0.5">
            {pack.gaap === 'ifrs' ? 'This filing is IFRS: EBITDA is before lease cost.' : pack.gaap === 'us-gaap' ? 'This filing is US GAAP: EBITDA is after operating-lease rent.' : 'Match this to how rent is treated in the EBITDA you entered.'}
            {' '}No option is pre-selected.
          </p>
          <div className="mt-2 space-y-1">
            {LEASE_OPTIONS.filter((o) => o.id !== 'finance' || nd.leases.some((l) => l.line === 'finance_lease_liab')).map((o) => (
              <label key={o.id} className="flex items-start gap-2 font-sans text-[13px] cursor-pointer">
                <input type="radio" name="lease-choice" className="mt-1" checked={nd.lease_choice === o.id} onChange={() => edit((l) => setLeaseChoice(l, o.id))} />
                <span>{o.label}<span className="block text-[12px] text-[color:var(--de-ink-3)]">{o.hint}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="mt-4 space-y-2">
        {items.map((i) => (
          <div key={i.id} className={cx('grid grid-cols-[1.25rem_minmax(0,1fr)_6rem] gap-2 items-start', !i.included && 'opacity-50')}>
            <input type="checkbox" className="mt-2" aria-label={`Include ${i.label || 'this item'}`} checked={i.included} onChange={(e) => edit((l) => updateNetDebtItem(l, i.id, { included: e.target.checked }))} />
            <span>
              <TextInput aria-label="Item name" value={i.label} invalid={i.included && !i.label.trim()} placeholder={i.side === 'debt_like' ? 'Debt-like item' : 'Cash-like item'}
                onChange={(e) => edit((l) => updateNetDebtItem(l, i.id, { label: e.target.value }))} />
              <span className="flex items-center gap-1.5 mt-1">
                <Tag>{i.side === 'debt_like' ? 'adds to debt' : 'cash'}</Tag>
                <Select aria-label="Type" value={i.category} onChange={(e) => edit((l) => updateNetDebtItem(l, i.id, { category: e.target.value as NetDebtCategory }))}>
                  {(Object.keys(ND_CATEGORY_LABEL) as NetDebtCategory[]).map((c) => <option key={c} value={c}>{ND_CATEGORY_LABEL[c]}</option>)}
                </Select>
                <Button variant="quiet" size="sm" onClick={() => edit((l) => removeNetDebtItem(l, i.id))}>remove</Button>
              </span>
            </span>
            <AmountInput ariaLabel={`${i.label || 'Item'} amount`} value={i.amount} required={i.included} onCommit={(v) => edit((l) => updateNetDebtItem(l, i.id, { amount: v }))} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        <Button size="sm" onClick={() => edit((l) => addNetDebtItem(l, 'debt_like'))}>+ Debt-like item</Button>
        <Button size="sm" onClick={() => edit((l) => addNetDebtItem(l, 'cash_like'))}>+ Cash-like item</Button>
      </div>
      <p className="font-sans text-[12px] text-[color:var(--de-ink-3)] mt-3">
        Net debt does not change the sponsor’s returns: the model prices the whole enterprise. It changes what the sellers receive — enterprise value less net debt — which the results show as implied equity value. For cash that is restricted or trapped, add a cash-like item with a negative amount.
      </p>
    </Card>
  );
};

// ── the screen ────────────────────────────────────────────────────────────────────────────
const CleanScreen: React.FC<{ onContinue: () => void }> = ({ onContinue }) => {
  const raw = useCleaning((s) => s.raw);
  const pack = useCleaning((s) => s.pack);
  const cleaned = useCleaning((s) => s.cleaned);
  const flags = useCleaning((s) => s.flags);
  const ledger = useCleaning((s) => s.ledger);
  const confirmAdjusted = useCleaning((s) => s.confirmAdjusted);
  const leaveAsReported = useCleaning((s) => s.useAsReported);
  if (!raw || !pack || !cleaned) return null;

  const impact = impactSummary(raw, cleaned);
  const open = blockers(flags);
  const warnings = flags.filter((f) => f.severity === 'warn');
  const infos = flags.filter((f) => f.severity === 'info');
  const empty = ledgerIsEmpty(ledger);
  const sizing = pack.sizing ? periodLabel(pack, pack.sizing) : 'no historical period';
  const changed = (d: number | null) => d !== null && d !== 0;

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-6">
      <div className="max-w-3xl">
        <h1 className="font-playfair text-[30px] font-bold leading-tight">Clean the numbers</h1>
        <p className="font-sans text-[14px] text-[color:var(--de-ink-2)] mt-2 leading-relaxed">
          These are {pack.entityName}’s figures as sourced. Before they go into the model, decide what EBITDA and net debt mean for this company: restate a figure, add back one-offs, and say what counts as debt. Every change is itemised, reversible, and carried into the Excel model as a live bridge.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 bg-[var(--de-surface)] border border-[color:var(--de-rule)] divide-x divide-[color:var(--de-rule)]">
        <Kpi label={`Adjusted EBITDA · ${sizing}`} value={acct(impact.ebitda.adjusted)}
          tone={changed(impact.ebitda.delta) ? 'pos' : 'neutral'}
          sub={impact.ebitda.adjusted === null ? 'not known yet — an amount is missing' : changed(impact.ebitda.delta) ? `${delta(impact.ebitda.delta)} vs reported ${acct(impact.ebitda.reported)}` : 'as reported'} />
        <Kpi label="EBITDA margin" value={impact.margin.adjusted === null ? '–' : pct(impact.margin.adjusted)}
          sub={impact.margin.reported !== null && impact.margin.adjusted !== null && impact.margin.adjusted !== impact.margin.reported ? `reported ${pct(impact.margin.reported)}` : 'as reported'} />
        <Kpi label="Net debt" value={acct(impact.net_debt.adjusted)}
          tone={changed(impact.net_debt.delta) ? 'pos' : 'neutral'}
          sub={cleaned.bridges.net_debt && cleaned.bridges.net_debt.adjusted === null && impact.net_debt.adjusted !== null ? 'as sourced — the lease treatment is not chosen yet' : impact.net_debt.adjusted === null ? (impact.net_debt.reported === null ? 'not in the source' : 'not known yet — an item is open') : changed(impact.net_debt.delta) ? `${delta(impact.net_debt.delta)} vs reported ${acct(impact.net_debt.reported)}` : impact.leverage.adjusted !== null ? `${multiple(impact.leverage.adjusted)} EBITDA` : 'as reported'} />
        <Kpi label="Open items" value={String(open.length)} tone={open.length ? 'accent' : 'neutral'}
          sub={open.length ? 'to finish before continuing with adjusted figures' : empty ? 'no adjustments made' : 'ready to continue'} />
      </div>

      <div className="mt-5 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_25rem] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <StatementsCard pack={pack} bridges={cleaned.bridges} />
          <AdjustmentsCard pack={pack} />
          <ProposalsCard pack={pack} />
          {pack.notes.filter((n) => !n.startsWith('Detected')).map((n) => (
            <p key={n} className="font-sans text-[12px] text-[color:var(--de-ink-3)]">{n}</p>
          ))}
        </div>

        <aside className="space-y-5 xl:sticky xl:top-[7.5rem]">
          <EbitdaBridgeCard pack={pack} bridges={cleaned.bridges} />
          <NetDebtCard pack={pack} bridges={cleaned.bridges} />
          <Card title="Before you continue">
            <div className="space-y-2">
              {open.length > 0 && (
                <Callout tone="block" title={`${open.length} open item${open.length === 1 ? '' : 's'}`}>
                  <ul className="list-disc pl-4 space-y-0.5">{open.map((f) => <li key={f.code + f.message}>{f.message}</li>)}</ul>
                </Callout>
              )}
              {warnings.map((f) => <Callout key={f.code + f.message} tone="warn">{f.message}</Callout>)}
              {infos.map((f) => <Callout key={f.code + f.message} tone="info">{f.message}</Callout>)}
              {flags.length === 0 && <p className="font-sans text-[13px] text-[color:var(--de-ink-2)]">Nothing to flag.</p>}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {!empty && (
                <Button variant="primary" disabled={open.length > 0} onClick={() => { if (confirmAdjusted()) onContinue(); }}>
                  Continue with adjusted figures →
                </Button>
              )}
              <Button variant={empty ? 'primary' : 'ghost'} onClick={() => { leaveAsReported(); onContinue(); }}>
                Use the figures as reported →
              </Button>
              <Eyebrow className="normal-case tracking-normal font-normal">
                {empty
                  ? 'Choosing this is recorded in the model, so a reader knows no normalisation was applied.'
                  : 'Using the figures as reported keeps your entries here but does not apply them, and says so in the model.'}
              </Eyebrow>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
};

export default CleanScreen;
