/**
 * The debt stack as a term sheet: one column per facility, one row per term. A term that does
 * not apply to a facility is an en dash, never a zero. Every cell is the same blank-until-entered
 * input as the rest of the sheet and writes the same draft path; the all-in rate is worked out by
 * the engine's own helper (kernel/rates) and shown in ink, because nobody typed it.
 */
import React from 'react';
import type { TrancheAssumption } from '../../../lib/engine2/types';
import { allInRate } from '../../../lib/engine2/kernel/rates';
import { pct } from '../../../lib/format';
import { Dropdown, Segmented } from '../ui/kit';
import { useEngine2Model } from '../../../store/engine2Model';
import { ChoiceCell, NumBox, isSet, type Unit } from './fields';
import { cellSuggestion } from '../../../store/engine2Model';
import { dealUiStore, useDealUi } from '../../../store/dealUi';

const NA = <span className="text-[color:var(--de-ink-3)]">–</span>;

type Cell = React.ReactNode | null;
interface Row { label: string; hint?: string; cell: (t: TrancheAssumption, i: number) => Cell }

const DebtTable: React.FC<{
  tranches: TrancheAssumption[];
  hasLtm: boolean;
  pending: string[];
  onSet: (path: string, value: unknown) => void;
  onRemove: (i: number) => void;
}> = ({ tranches, hasLtm, pending, onSet, onRemove }) => {
  const suggestions = useEngine2Model((s) => s.suggestions);
  const dismissed = useEngine2Model((s) => s.dismissed);
  const offered = useDealUi((s) => s.features.suggestAssumptions);
  // which inputs each row holds, so the row's label can explain the first suggestion in it
  const rowPaths: Record<string, { path: string; set: boolean }[]> = {};
  let drawing = '';
  const numCell = (path: string, label: string, unit: Unit, value: number | null | undefined) => {
    (rowPaths[drawing] ??= []).push({ path, set: isSet(value) });
    return (
      <span data-path={path} className="inline-flex w-full">
        <NumBox value={value} unit={unit} compact width="w-full" ariaLabel={label} sugPath={path} onCommit={(v) => onSet(path, v)} />
      </span>
    );
  };
  const explains = (label: string): string | null => {
    if (!offered) return null;
    const withSug = (rowPaths[label] ?? []).filter((c) => cellSuggestion(suggestions, dismissed, c.path));
    return (withSug.find((c) => !c.set) ?? withSug[0])?.path ?? null;
  };
  const sizeOf = (t: TrancheAssumption) => (t.type === 'revolver' ? t.commitment : t.size);
  const sizePath = (t: TrancheAssumption, i: number) => `structure.tranches.${i}.${t.type === 'revolver' ? 'commitment' : 'size'}`;
  const what = (t: TrancheAssumption) => (t.type === 'revolver' ? 'commitment' : 'size');
  const pricing = (t: TrancheAssumption) => (t.type === 'pik_note' ? null : t.pricing);

  const rows: Row[] = [
    {
      label: 'Ranking',
      cell: (t, i) => (t.type === 'revolver' ? <span className="text-[13px] text-[color:var(--de-ink-2)]">revolver</span>
        : t.type === 'pik_note' ? <span className="text-[13px] text-[color:var(--de-ink-2)]">PIK note</span>
        : (
          <span data-path={`structure.tranches.${i}.type`} className="block">
            <ChoiceCell stamp={t.type} className="w-full"><Dropdown cell ariaLabel={`${t.name}: ranking`} value={t.type} className="w-full" align="left"
              options={[{ value: 'senior', label: 'senior' }, { value: 'unitranche', label: 'unitranche' }, { value: 'mezzanine', label: 'mezzanine' }]}
              onChange={(v) => onSet(`structure.tranches.${i}.type`, v)} /></ChoiceCell>
          </span>
        )),
    },
    {
      label: 'Sized as',
      cell: (t, i) => (hasLtm ? (
        <ChoiceCell stamp={sizeOf(t).x_ebitda !== undefined ? 'x' : 'amt'}><Segmented cell size="sm" ariaLabel={`${t.name} ${what(t)} basis`} value={sizeOf(t).x_ebitda !== undefined ? 'x' : 'amt'}
          options={[{ value: 'amt', label: 'amount' }, { value: 'x', label: '× EBITDA' }]}
          onChange={(v) => onSet(sizePath(t, i), v === 'x' ? { x_ebitda: Number.NaN } : { amount: Number.NaN })} /></ChoiceCell>
      ) : <span className="text-[13px] text-[color:var(--de-ink-2)]">amount</span>),
    },
    {
      label: 'Size',
      cell: (t, i) => (sizeOf(t).x_ebitda !== undefined
        ? numCell(`${sizePath(t, i)}.x_ebitda`, `${t.name}: ${what(t)} (× EBITDA)`, 'mult', sizeOf(t).x_ebitda)
        : numCell(`${sizePath(t, i)}.amount`, `${t.name}: ${what(t)} (amount)`, 'money', sizeOf(t).amount)),
    },
    { label: 'Fixed rate', cell: (t, i) => { const p = pricing(t); return p?.kind === 'fixed' ? numCell(`structure.tranches.${i}.pricing.rate`, `${t.name}: fixed rate`, 'pct', p.rate) : null; } },
    { label: 'Base rate', hint: 'For example term SOFR or EURIBOR at the deal date.', cell: (t, i) => { const p = pricing(t); return p?.kind === 'floating' ? numCell(`structure.tranches.${i}.pricing.base_rate`, `${t.name}: base rate`, 'pct', p.base_rate) : null; } },
    { label: 'Base-rate floor', cell: (t, i) => { const p = pricing(t); return p?.kind === 'floating' ? numCell(`structure.tranches.${i}.pricing.floor`, `${t.name}: base-rate floor`, 'pct', p.floor) : null; } },
    { label: 'Spread', cell: (t, i) => { const p = pricing(t); return p?.kind === 'floating' ? numCell(`structure.tranches.${i}.pricing.spread`, `${t.name}: spread`, 'pct', p.spread) : null; } },
    { label: 'Cash coupon', cell: (t, i) => (t.type === 'pik_note' ? numCell(`structure.tranches.${i}.cash_coupon`, `${t.name}: cash coupon`, 'pct', t.cash_coupon) : null) },
    { label: 'PIK coupon', cell: (t, i) => (t.type === 'pik_note' ? numCell(`structure.tranches.${i}.pik_coupon`, `${t.name}: PIK coupon`, 'pct', t.pik_coupon) : null) },
    {
      label: 'All-in rate',
      cell: (t) => {
        const p = pricing(t);
        if (!p || p.kind !== 'floating' || !isSet(p.base_rate) || !isSet(p.floor) || !isSet(p.spread)) return null;
        return <span className="de-num text-[14px] font-medium pr-2" title="max(base rate, floor) + spread">{pct(allInRate(p), 2)}</span>;
      },
    },
    { label: 'Amortization (% of face a year)', cell: (t, i) => (t.type === 'revolver' ? null : numCell(`structure.tranches.${i}.amort_pct_of_face`, `${t.name}: mandatory amortization (% face / yr)`, 'pct', t.amort_pct_of_face)) },
    { label: 'OID (% of par)', cell: (t, i) => (t.type === 'revolver' ? null : numCell(`structure.tranches.${i}.oid_pct`, `${t.name}: OID (% of par)`, 'pct', t.oid_pct)) },
    { label: 'Maturity', hint: 'A term facility must mature after the exit.', cell: (t, i) => numCell(`structure.tranches.${i}.maturity_years`, t.type === 'revolver' ? `${t.name}: maturity` : `${t.name}: maturity (must exceed the hold)`, 'years', t.maturity_years) },
    { label: 'Commitment fee (undrawn)', cell: (t, i) => (t.type === 'revolver' ? numCell(`structure.tranches.${i}.commitment_fee`, `${t.name}: commitment fee (undrawn)`, 'pct', t.commitment_fee) : null) },
    { label: 'Drawn at close', hint: 'The revolver is undrawn at close: it funds shortfalls during the hold, not the purchase.', cell: (t) => (t.type === 'revolver' ? <span className="text-[13px] text-[color:var(--de-ink-2)] pr-2">undrawn</span> : null) },
    {
      label: 'Takes the cash sweep',
      cell: (t, i) => (t.type === 'revolver' ? null : (
        <span data-path={`structure.tranches.${i}.sweep.participates`} className="inline-flex">
          <ChoiceCell stamp={pending.includes(`structure.tranches.${i}.sweep.participates`) ? '' : String(t.sweep.participates)}><Segmented cell size="sm" ariaLabel={`${t.name}: takes the cash sweep?`} blank={pending.includes(`structure.tranches.${i}.sweep.participates`)}
            value={pending.includes(`structure.tranches.${i}.sweep.participates`) ? '' : String(t.sweep.participates)}
            options={[{ value: 'true', label: 'yes' }, { value: 'false', label: 'no' }]}
            onChange={(v) => onSet(`structure.tranches.${i}.sweep.participates`, v === 'true')} /></ChoiceCell>
        </span>
      )),
    },
    { label: 'Sweep priority (1 = first)', cell: (t, i) => (t.type !== 'revolver' && t.sweep.participates ? numCell(`structure.tranches.${i}.sweep.priority`, `${t.name}: sweep priority (1 = first)`, 'ratio', t.sweep.priority) : null) },
  ];

  // a row is drawn only if at least one facility has that term
  const cells = rows.map((r) => { drawing = r.label; return { r, cells: tranches.map((t, i) => r.cell(t, i)) }; }).filter((x) => x.cells.some((c) => c !== null));
  const explain = (label: string) => {
    const id = explains(label);
    if (!id) return;
    const ui = dealUiStore.getState();
    document.querySelector<HTMLElement>(`[data-why="${id}"] [data-de-cell]`)?.focus();
    ui.setWhy(ui.why === id ? null : id);
  };

  return (
    <div className="de-scroll-x -mx-1 px-1 pb-1">
      <table className="border-separate border-spacing-0 min-w-full">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-[var(--de-surface)] text-left font-medium text-[12px] text-[color:var(--de-ink-3)] pb-2 pr-4 min-w-[11rem]">Facility</th>
            {tranches.map((t, i) => (
              <th key={i} className="pb-2 pl-2 min-w-[9.5rem] w-[11rem] font-normal">
                <input aria-label={`tranche ${i + 1} name`} value={t.name} data-path={`structure.tranches.${i}.name`}
                  onChange={(e) => onSet(`structure.tranches.${i}.name`, e.target.value)}
                  className="de-control w-full px-2 text-[14px] font-semibold text-[color:var(--de-ink)]" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cells.map(({ r, cells: row }) => (
            <tr key={r.label} data-de-line className="group/row">
              <th scope="row" title={r.hint} className="sticky left-0 z-10 bg-[var(--de-surface)] text-left font-normal text-[13px] text-[color:var(--de-ink-2)] py-1 pr-4 border-t border-[color:var(--de-rule)] whitespace-nowrap">
                {explains(r.label)
                  ? <button type="button" tabIndex={-1} data-why-toggle title="How the suggested value was reached" onMouseDown={(e) => e.preventDefault()} onClick={() => explain(r.label)}
                      className="text-left rounded-sm underline decoration-dotted decoration-[color:var(--de-rule-strong)] underline-offset-4 hover:decoration-[color:var(--de-ink-2)]">{r.label}</button>
                  : r.label}
              </th>
              {row.map((c, i) => (
                <td key={i} className="py-1 pl-2 border-t border-[color:var(--de-rule)] text-right">{c ?? NA}</td>
              ))}
            </tr>
          ))}
          <tr>
            <th className="sticky left-0 bg-[var(--de-surface)] border-t border-[color:var(--de-rule)]" />
            {tranches.map((t, i) => (
              <td key={i} className="pt-2 pl-2 border-t border-[color:var(--de-rule)] text-right">
                <button type="button" onClick={() => onRemove(i)} aria-label={`Remove ${t.name}`}
                  className="text-[12px] text-[color:var(--de-ink-3)] hover:text-[color:var(--de-accent)] rounded px-1">Remove</button>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default DebtTable;
