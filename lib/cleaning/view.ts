/**
 * lib/cleaning/view.ts — shapes the bridges for display (waterfall geometry, the impact strip).
 * Display components do no arithmetic of their own: every number they draw comes from here or
 * from applyCleaning. Pure.
 */
import type { RawHistoricals } from '../edgar/types';
import type { CleanedHistoricals } from './apply';
import type { BridgeRow, LineBridge, NetDebtBridge } from './types';

export interface WaterfallStep {
  key: string;
  label: string;
  kind: 'total' | 'delta';
  /** null ⇔ not known (an amount above it is not entered). */
  value: number | null;
  /** Bar geometry as a percentage of the track. */
  left: number;
  width: number;
  /** A delta that reduces the running total. */
  down: boolean;
  /** Why the value is blank, in the analyst's words. */
  blank: string;
}

interface Delta { key: string; label: string; amount: number | null; blank?: string }

/** start → each delta → end, on a track that always includes zero. */
export function waterfall(startLabel: string, start: number | null, deltas: Delta[], endLabel: string): WaterfallStep[] {
  const spans: { key: string; label: string; kind: 'total' | 'delta'; value: number | null; from: number; to: number; blank: string }[] = [];
  let running: number | null = start;
  spans.push({ key: 'start', label: startLabel, kind: 'total', value: start, from: 0, to: start ?? 0, blank: 'not in the source' });
  for (const d of deltas) {
    if (running === null || d.amount === null) {
      spans.push({ key: d.key, label: d.label, kind: 'delta', value: d.amount, from: 0, to: 0, blank: d.blank ?? 'not entered' });
      running = null;
      continue;
    }
    spans.push({ key: d.key, label: d.label, kind: 'delta', value: d.amount, from: running, to: running + d.amount, blank: '' });
    running += d.amount;
  }
  spans.push({ key: 'end', label: endLabel, kind: 'total', value: running, from: 0, to: running ?? 0, blank: 'not known yet' });
  let lo = 0;
  let hi = 0;
  for (const s of spans) {
    lo = Math.min(lo, s.from, s.to);
    hi = Math.max(hi, s.from, s.to);
  }
  const range = hi - lo || 1;
  return spans.map((s) => ({
    key: s.key, label: s.label, kind: s.kind, value: s.value, blank: s.blank,
    left: ((Math.min(s.from, s.to) - lo) / range) * 100,
    width: (Math.abs(s.to - s.from) / range) * 100,
    down: s.to < s.from,
  }));
}

/** The row shape both the cleaning bridges and the model's display copy of them satisfy. */
type RowLike = Pick<BridgeRow, 'label' | 'amount'> & { id?: string };
type LineLike = Pick<LineBridge, 'reported' | 'restated'> & { rows: RowLike[] };
type NetDebtLike = Pick<NetDebtBridge, 'borrowings' | 'lease_choice' | 'cash'> & {
  leases: { label: string; amount: number; included: boolean }[];
  debt_like: RowLike[];
  cash_like: RowLike[];
};

const rowsAsDeltas = (rows: RowLike[], prefix: string, sign: 1 | -1 = 1): Delta[] =>
  rows.map((r, i) => ({ key: r.id ?? `${prefix}${i}`, label: r.label.trim() || 'Unnamed', amount: r.amount === null ? null : sign * r.amount }));

export function ebitdaWaterfall(b: LineLike): WaterfallStep[] {
  const deltas: Delta[] = [];
  if (b.reported !== null && b.restated !== null && b.restated !== b.reported) {
    deltas.push({ key: 'restated', label: 'Restated cells', amount: b.restated - b.reported });
  }
  const start = b.reported ?? b.restated;
  return waterfall(b.reported === null ? 'Entered' : 'Reported', start, [...deltas, ...rowsAsDeltas(b.rows, 'row')], 'Adjusted');
}

export function netDebtWaterfall(nd: NetDebtLike): WaterfallStep[] {
  const leaseOpen = nd.leases.length > 0 && nd.lease_choice === null;
  const deltas: Delta[] = [
    ...nd.leases.filter((l) => l.included || leaseOpen).map((l) => ({ key: `lease:${l.label}`, label: l.label, amount: leaseOpen ? null : l.amount, blank: 'choose below' })),
    ...rowsAsDeltas(nd.debt_like, 'debt'),
    { key: 'cash', label: 'Less cash', amount: nd.cash === null ? null : -nd.cash },
    ...rowsAsDeltas(nd.cash_like, 'cash', -1),
  ];
  return waterfall('Borrowings', nd.borrowings, deltas, 'Adjusted net debt');
}

export interface ImpactSummary {
  ebitda: { reported: number | null; adjusted: number | null; delta: number | null };
  margin: { reported: number | null; adjusted: number | null };
  net_debt: { reported: number | null; adjusted: number | null; delta: number | null };
  leverage: { reported: number | null; adjusted: number | null };
}

/** The figures the model reads, before and after the ledger. */
export function impactSummary(raw: RawHistoricals, cleaned: CleanedHistoricals): ImpactSummary {
  const pair = (a: number | null | undefined, b: number | null | undefined) => {
    const reported = a ?? null;
    const adjusted = b ?? null;
    return { reported, adjusted, delta: reported !== null && adjusted !== null ? adjusted - reported : null };
  };
  const ratio = (n: number | null, d: number | null) => (n !== null && d !== null && d > 0 ? n / d : null);
  const ebitda = pair(raw.fy_ebitda?.value, cleaned.raw.fy_ebitda?.value);
  const net_debt = pair(raw.net_debt?.value, cleaned.raw.net_debt?.value);
  return {
    ebitda,
    margin: { reported: raw.ebitda_margin?.value ?? null, adjusted: cleaned.raw.ebitda_margin?.value ?? null },
    net_debt,
    leverage: { reported: ratio(net_debt.reported, ebitda.reported), adjusted: ratio(net_debt.adjusted, ebitda.adjusted) },
  };
}
