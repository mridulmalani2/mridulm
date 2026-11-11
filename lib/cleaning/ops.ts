/**
 * lib/cleaning/ops.ts — pure ledger edits. Every function returns a new ledger; none invents a
 * value. Any edit clears `as_reported` (the analyst is adjusting again).
 */
import type { AdjustmentCandidate, LineId, PeriodKey, StatementPack } from '../statements/types';
import type { Adjustment, AdjustmentCategory, AdjustmentTarget, CleaningLedger, LeaseChoice, NetDebtCategory, NetDebtItem } from './types';

const nextId = (ledger: CleaningLedger, prefix: string): string => {
  const used = [...ledger.overrides, ...ledger.adjustments, ...ledger.net_debt_items]
    .map((x) => Number(x.id.split('-')[1])).filter(Number.isFinite);
  let n = 1;
  for (const u of used) if (u >= n) n = u + 1;
  return `${prefix}-${n}`;
};
const edit = (ledger: CleaningLedger, patch: Partial<CleaningLedger>): CleaningLedger => ({ ...ledger, ...patch, as_reported: false });

const ADJ_CATEGORIES: ReadonlySet<string> = new Set(['non_recurring', 'restructuring', 'impairment', 'sbc', 'transaction_costs', 'litigation', 'pro_forma', 'run_rate', 'accounting_policy', 'other']);
const ND_CATEGORIES: ReadonlySet<string> = new Set(['pension', 'earn_out', 'deferred_consideration', 'nci', 'preferred', 'restricted_cash', 'trapped_cash', 'other']);

/** A blank row: no label, no amounts. The checks keep the step open until it is filled in. */
export function addAdjustment(ledger: CleaningLedger, target: AdjustmentTarget): CleaningLedger {
  const row: Adjustment = {
    id: nextId(ledger, 'adj'), target, label: '', category: 'other', amounts: {}, forecast: null,
    source: { kind: 'user' }, note: '', included: true,
  };
  return edit(ledger, { adjustments: [...ledger.adjustments, row] });
}

/** Accept a detected proposal: the filing's amounts for the years it tags; every other period
 *  (LTM included) stays NOT ENTERED. */
export function acceptCandidate(ledger: CleaningLedger, c: AdjustmentCandidate): CleaningLedger {
  if (c.bridge === 'ebitda') {
    const row: Adjustment = {
      id: nextId(ledger, 'adj'), target: 'ebitda', label: c.label,
      category: (ADJ_CATEGORIES.has(c.category) ? c.category : 'other') as AdjustmentCategory,
      amounts: { ...c.amounts }, forecast: null, source: { kind: 'filing', tag: c.tag, url: c.url }, note: c.rationale, included: true,
    };
    return edit(ledger, { adjustments: [...ledger.adjustments, row] });
  }
  const amount = Object.values(c.amounts)[0] ?? null;
  const item: NetDebtItem = {
    id: nextId(ledger, 'nd'), side: c.side ?? 'debt_like', label: c.label,
    category: (ND_CATEGORIES.has(c.category) ? c.category : 'other') as NetDebtCategory,
    amount, source: { kind: 'filing', tag: c.tag, url: c.url }, note: c.rationale, included: true,
  };
  return edit(ledger, { net_debt_items: [...ledger.net_debt_items, item] });
}

export const candidateAccepted = (ledger: CleaningLedger, c: AdjustmentCandidate): boolean =>
  [...ledger.adjustments, ...ledger.net_debt_items].some((x) => x.source.kind === 'filing' && x.source.tag === c.tag);

export function updateAdjustment(ledger: CleaningLedger, id: string, patch: Partial<Omit<Adjustment, 'id'>>): CleaningLedger {
  return edit(ledger, { adjustments: ledger.adjustments.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
}
export function setAdjustmentAmount(ledger: CleaningLedger, id: string, period: PeriodKey, amount: number | null): CleaningLedger {
  return edit(ledger, { adjustments: ledger.adjustments.map((a) => (a.id === id ? { ...a, amounts: { ...a.amounts, [period]: amount } } : a)) });
}
/** "Nil in the other years": write an EXPLICIT zero in every period that has no amount yet. */
export function fillNilElsewhere(ledger: CleaningLedger, id: string, pack: StatementPack): CleaningLedger {
  return edit(ledger, {
    adjustments: ledger.adjustments.map((a) => {
      if (a.id !== id) return a;
      const amounts = { ...a.amounts };
      for (const p of pack.periods) if ((amounts[p.key] ?? null) === null) amounts[p.key] = 0;
      return { ...a, amounts };
    }),
  });
}
export const removeAdjustment = (ledger: CleaningLedger, id: string): CleaningLedger =>
  edit(ledger, { adjustments: ledger.adjustments.filter((a) => a.id !== id) });

export function addNetDebtItem(ledger: CleaningLedger, side: NetDebtItem['side']): CleaningLedger {
  const item: NetDebtItem = { id: nextId(ledger, 'nd'), side, label: '', category: 'other', amount: null, source: { kind: 'user' }, note: '', included: true };
  return edit(ledger, { net_debt_items: [...ledger.net_debt_items, item] });
}
export function updateNetDebtItem(ledger: CleaningLedger, id: string, patch: Partial<Omit<NetDebtItem, 'id'>>): CleaningLedger {
  return edit(ledger, { net_debt_items: ledger.net_debt_items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
}
export const removeNetDebtItem = (ledger: CleaningLedger, id: string): CleaningLedger =>
  edit(ledger, { net_debt_items: ledger.net_debt_items.filter((i) => i.id !== id) });

export function setOverride(ledger: CleaningLedger, line: LineId, period: PeriodKey, value: number, reason: string): CleaningLedger {
  const rest = ledger.overrides.filter((o) => !(o.line === line && o.period === period));
  return edit(ledger, { overrides: [...rest, { id: nextId(ledger, 'ovr'), line, period, value, reason }] });
}
export const removeOverride = (ledger: CleaningLedger, line: LineId, period: PeriodKey): CleaningLedger =>
  edit(ledger, { overrides: ledger.overrides.filter((o) => !(o.line === line && o.period === period)) });

export const setLeaseChoice = (ledger: CleaningLedger, choice: LeaseChoice | null): CleaningLedger =>
  edit(ledger, { choices: { leases_in_net_debt: choice } });

/** Has the analyst entered anything that changes a figure? */
export const ledgerIsEmpty = (ledger: CleaningLedger): boolean =>
  ledger.overrides.length === 0 && ledger.adjustments.length === 0 && ledger.net_debt_items.length === 0 && ledger.choices.leases_in_net_debt === null;
