/**
 * lib/cleaning/apply.ts — applyCleaning: sourced figures + ledger → the figures the model reads
 * (rebuild/CLEANING_AND_SUITE_PLAN.md §4.2). Pure: no I/O, no clock, no defaults.
 *
 * Shape of the result: a RawHistoricals (so engine2's existing adapter is untouched) plus the
 * bridges that explain it.
 *
 * THE IDENTITY RULE. A field of the result is REPLACED only when a ledger entry reaches it;
 * every other field is the sourced object itself. So an empty ledger returns figures that
 * deep-equal the input by construction, and one adjustment moves exactly the fields it should.
 *
 * Per period p, for a line L:
 *   restated[L][p] = the override on (L, p) if there is one, else the sourced cell
 *   EBITDA restated = operating income + D&A where both exist and one was overridden; a direct
 *                     EBITDA override applies only where the components do not both exist
 *   adjusted[L][p] = restated[L][p] + Σ amounts[p] over the INCLUDED rows on L
 * A row whose amount for p is not entered makes adjusted[L][p] null — never zero.
 *
 * Ratios stay FY-basis at the anchor year even when the deal is sized on LTM (SPEC §1.1).
 */
import type { Provenance, RawHistoricals, SourcedValue } from '../edgar/types';
import type { HistorySeries } from '../edgar/history';
import { cellAt, type LineId, type PeriodKey, type StatementPack } from '../statements/types';
import { lineLabel } from '../statements/lines';
import type {
  Adjustment, AdjustmentTarget, BridgeRow, Bridges, CleaningLedger, LeaseChoice, LineBridge, NetDebtBridge, NetDebtItem,
} from './types';

export interface CleanedHistoricals {
  raw: RawHistoricals;
  bridges: Bridges;
}

const LEASE_LINES: { line: LineId; counted: LeaseChoice[] }[] = [
  { line: 'finance_lease_liab', counted: ['finance', 'all'] },
  { line: 'operating_lease_liab', counted: ['all'] },
  { line: 'lease_liab', counted: ['all'] },
];

const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`;

export const periodLabel = (pack: StatementPack, key: PeriodKey): string => {
  const p = pack.periods.find((x) => x.key === key);
  if (!p) return key;
  return p.kind === 'LTM' ? `LTM ${p.end}` : `FY${p.end.slice(0, 4)}`;
};

/** True where the EBITDA cell is derived from its components (so the components are restated,
 *  not the total). */
export const ebitdaHasComponents = (pack: StatementPack, period: PeriodKey): boolean =>
  cellAt(pack, 'operating_income', period) !== null && cellAt(pack, 'da', period) !== null;

/** Whether the Clean step may restate this cell — only cells with a defined path to the model. */
export function restatableAt(pack: StatementPack, line: LineId, period: PeriodKey): boolean {
  const isFy = pack.periods.find((p) => p.key === period)?.kind === 'FY';
  switch (line) {
    case 'revenue': return true;
    case 'ebitda': return !ebitdaHasComponents(pack, period);
    case 'operating_income':
    case 'da':
    case 'capex': return isFy;
    case 'cash':
    case 'borrowings': return period === pack.anchor;
    default: return false;
  }
}

function activeLedger(ledger: CleaningLedger): CleaningLedger {
  return ledger.as_reported
    ? { ...ledger, overrides: [], adjustments: [], net_debt_items: [], choices: { leases_in_net_debt: null } }
    : ledger;
}

export function applyCleaning(raw: RawHistoricals, pack: StatementPack, ledgerIn: CleaningLedger): CleanedHistoricals {
  const ledger = activeLedger(ledgerIn);
  const overrideOn = (line: LineId, p: PeriodKey) => ledger.overrides.find((o) => o.line === line && o.period === p) ?? null;
  const sourced = (line: LineId, p: PeriodKey): number | null => cellAt(pack, line, p)?.value ?? null;
  const cellRestated = (line: LineId, p: PeriodKey): number | null => overrideOn(line, p)?.value ?? sourced(line, p);

  const restated = (line: LineId, p: PeriodKey): number | null => {
    if (line !== 'ebitda') return cellRestated(line, p);
    if (ebitdaHasComponents(pack, p)) {
      if (!overrideOn('operating_income', p) && !overrideOn('da', p)) return sourced('ebitda', p);
      const oi = cellRestated('operating_income', p);
      const da = cellRestated('da', p);
      return oi === null || da === null ? null : oi + da;
    }
    return cellRestated('ebitda', p);
  };
  const overridden = (line: LineId, p: PeriodKey): boolean =>
    line === 'ebitda'
      ? (ebitdaHasComponents(pack, p) ? !!overrideOn('operating_income', p) || !!overrideOn('da', p) : !!overrideOn('ebitda', p))
      : !!overrideOn(line, p);

  const included = (t: AdjustmentTarget): Adjustment[] => ledger.adjustments.filter((a) => a.included && a.target === t);
  const rowsAt = (t: AdjustmentTarget, p: PeriodKey): BridgeRow[] =>
    included(t).map((a) => ({ id: a.id, label: a.label, category: a.category, amount: a.amounts[p] ?? null, note: a.note, source: a.source.kind, ...(t === 'ebitda' ? { forecast: a.forecast } : {}) }));
  const total = (base: number | null, rows: BridgeRow[]): number | null => {
    if (base === null) return null;
    let s = base;
    for (const r of rows) {
      if (r.amount === null) return null; // not entered ⇒ not known. Never zero.
      s += r.amount;
    }
    return s;
  };
  const lineBridge = (line: 'revenue' | 'ebitda' | 'da' | 'capex'): LineBridge[] =>
    pack.periods.map((per) => {
      const rows = rowsAt(line, per.key);
      const rst = restated(line, per.key);
      return { period: per.key, reported: sourced(line, per.key), restated: rst, rows, adjusted: total(rst, rows) };
    });

  const bridges: Bridges = {
    as_reported: ledgerIn.as_reported,
    sizing: pack.sizing,
    anchor: pack.anchor,
    periods: pack.periods.map((p) => ({ key: p.key, label: periodLabel(pack, p.key) })),
    revenue: lineBridge('revenue'),
    ebitda: lineBridge('ebitda'),
    da: lineBridge('da'),
    capex: lineBridge('capex'),
    net_debt: null,
  };
  const at = (list: LineBridge[], p: PeriodKey | null) => (p === null ? null : list.find((b) => b.period === p) ?? null);
  /** Did the ledger reach (line, period)? An included row reaches every period of its line. */
  const touched = (line: 'revenue' | 'ebitda' | 'da' | 'capex', p: PeriodKey | null): boolean =>
    p !== null && (included(line).length > 0 || overridden(line, p));

  const adjustedProv = (b: LineBridge, what: string, base: Provenance | undefined): Provenance => {
    const parts: string[] = [];
    if (b.reported !== null && b.restated !== null && b.restated !== b.reported) parts.push(`restated from ${fmt(b.reported)}`);
    if (b.reported === null && b.restated !== null) parts.push('entered on the Clean step (the source lacks it)');
    if (b.rows.length && b.adjusted !== null && b.restated !== null) {
      parts.push(`${b.rows.length} adjustment${b.rows.length === 1 ? '' : 's'} (${signed(b.adjusted - b.restated)})`);
    }
    return {
      source: 'adjusted',
      detail: `${what}: ${b.reported === null ? 'not in the source' : `reported ${fmt(b.reported)}`}${parts.length ? ` · ${parts.join(' · ')}` : ''}`,
      url: base?.url, period: base?.period, fy: base?.fy,
    };
  };
  const sv = (value: number | null, provenance: Provenance): SourcedValue | null => (value === null ? null : { value, provenance });

  const out: RawHistoricals = { ...raw };
  const S = pack.sizing;
  const A = pack.anchor;

  // ── the sizing pair ──
  const revS = at(bridges.revenue, S);
  const ebS = at(bridges.ebitda, S);
  const revTouchedS = touched('revenue', S);
  const ebTouchedS = touched('ebitda', S);
  if (revS && revTouchedS) out.fy_revenue = sv(revS.adjusted, adjustedProv(revS, `${periodLabel(pack, S!)} revenue`, raw.fy_revenue?.provenance));
  if (ebS && ebTouchedS) out.fy_ebitda = sv(ebS.adjusted, adjustedProv(ebS, `${periodLabel(pack, S!)} EBITDA`, raw.fy_ebitda?.provenance));
  // §27: an add-back that CONTINUES is in the price basis but not in forecast cash flow, so the
  // forecast margin starts from adjusted EBITDA less those rows. No such row ⇒ the field is not
  // set at all and the forecast base is the adjusted EBITDA itself (the pre-§27 behaviour).
  const continuing = ebS ? ebS.rows.filter((r) => r.forecast === 'continues') : [];
  if (ebS && continuing.length) {
    let base: number | null = ebS.adjusted;
    for (const r of continuing) base = base === null || r.amount === null ? null : base - r.amount;
    out.forecast_ebitda = sv(base, {
      source: 'adjusted',
      detail: `forecast margin base: adjusted EBITDA less ${continuing.length} add-back${continuing.length === 1 ? '' : 's'} that continue${continuing.length === 1 ? 's' : ''} (${continuing.map((r) => r.label).join(', ')})`,
    });
  }
  if (revTouchedS || ebTouchedS) {
    const r = out.fy_revenue?.value ?? null;
    const e = continuing.length ? out.forecast_ebitda?.value ?? null : out.fy_ebitda?.value ?? null;
    out.ebitda_margin = r !== null && e !== null && r > 0
      ? { value: e / r, provenance: { source: 'adjusted', detail: continuing.length ? 'forecast-base EBITDA ÷ adjusted revenue (§27)' : 'adjusted EBITDA ÷ adjusted revenue' } }
      : null;
  }

  // ── anchor-year lines and their FY-basis ratios ──
  const revA = at(bridges.revenue, A);
  const revTouchedA = touched('revenue', A);
  const revAdjA = revA?.adjusted ?? null;
  const ratio = (num: number | null, what: string): SourcedValue | null =>
    num !== null && revAdjA !== null && revAdjA > 0
      ? { value: num / revAdjA, provenance: { source: 'adjusted', detail: `adjusted ${what} ÷ adjusted FY revenue` } }
      : null;
  for (const [line, field, pctField, what] of [
    ['da', 'da', 'da_pct_revenue', 'D&A'],
    ['capex', 'capex', 'capex_pct_revenue', 'capex'],
  ] as const) {
    const b = at(bridges[line], A);
    const lineTouched = touched(line, A);
    if (b && lineTouched) out[field] = sv(b.adjusted, adjustedProv(b, `FY ${what}`, raw[field]?.provenance));
    if (lineTouched || revTouchedA) out[pctField] = ratio(out[field]?.value ?? null, what);
  }
  // Operating NWC: itemised rows only (the sourced figure is a composite the grid cannot restate).
  const nwcRows = A === null ? [] : rowsAt('nwc', A);
  if (nwcRows.length) {
    const b: LineBridge = { period: A!, reported: raw.nwc?.value ?? null, restated: raw.nwc?.value ?? null, rows: nwcRows, adjusted: total(raw.nwc?.value ?? null, nwcRows) };
    out.nwc = sv(b.adjusted, adjustedProv(b, 'Operating NWC', raw.nwc?.provenance));
  }
  if (nwcRows.length || revTouchedA) out.nwc_pct_revenue = ratio(out.nwc?.value ?? null, 'operating NWC');
  // DSO is receivables ÷ revenue: restated revenue moves it; receivables are unchanged.
  if (revTouchedA && raw.dso && revA) {
    out.dso = revA.reported !== null && revAdjA !== null && revAdjA > 0
      ? { value: (raw.dso.value * revA.reported) / revAdjA, provenance: { source: 'adjusted', detail: `${raw.dso.provenance.detail} · on adjusted revenue` } }
      : null;
  }

  // ── history: the adjusted series, year by year. A year with a row not entered is a hole. ──
  if (raw.history) {
    const rebuild = (series: HistorySeries, line: 'revenue' | 'ebitda' | 'da' | 'capex'): HistorySeries => {
      const hasRows = included(line).length > 0;
      const anyOverride = pack.periods.some((p) => overridden(line, p.key));
      if (!hasRows && !anyOverride) return series; // untouched ⇒ the sourced object itself
      const points = series.points.flatMap((pt) => {
        const b = at(bridges[line], pt.end);
        // years older than the grid cannot carry an amount; with rows on the line they are not comparable
        if (!b) return hasRows ? [] : [pt];
        return b.adjusted === null ? [] : [{ ...pt, value: b.adjusted }];
      });
      return { ...series, points, notes: [...series.notes, `${series.metric}: adjusted on the Clean step`] };
    };
    const oiOverride = pack.periods.some((p) => !!overrideOn('operating_income', p.key));
    out.history = {
      ...raw.history,
      revenue: rebuild(raw.history.revenue, 'revenue'),
      ebitda: rebuild(raw.history.ebitda, 'ebitda'),
      da: rebuild(raw.history.da, 'da'),
      capex: rebuild(raw.history.capex, 'capex'),
      operating_income: oiOverride
        ? { ...raw.history.operating_income, points: raw.history.operating_income.points.map((pt) => ({ ...pt, value: cellRestated('operating_income', pt.end) ?? pt.value })) }
        : raw.history.operating_income,
    };
  }

  // ── net debt at the anchor date ──
  if (A !== null) {
    const leaseCells = LEASE_LINES.flatMap(({ line, counted }) => {
      const c = cellAt(pack, line, A);
      return c ? [{ line, label: lineLabel(line), amount: c.value, counted }] : [];
    });
    const choice = ledger.choices.leases_in_net_debt;
    const items = (side: NetDebtItem['side']): BridgeRow[] =>
      ledger.net_debt_items.filter((i) => i.included && i.side === side)
        .map((i) => ({ id: i.id, label: i.label, category: i.category, amount: i.amount, note: i.note, source: i.source.kind }));
    const debtLike = items('debt_like');
    const cashLike = items('cash_like');
    const borrowings = cellRestated('borrowings', A);
    const cash = cellRestated('cash', A);
    const leases = leaseCells.map((l) => ({ line: l.line, label: l.label, amount: l.amount, included: choice !== null && l.counted.includes(choice) }));
    // a lease liability exists and nobody has said whether it is debt ⇒ gross debt is not known
    const leaseOpen = leaseCells.length > 0 && choice === null;
    let gross: number | null = borrowings;
    if (gross !== null) for (const l of leases) if (l.included) gross += l.amount;
    if (leaseOpen) gross = null;
    const debtSide = total(gross, debtLike);
    const cashSide = total(cash, cashLike);
    const nd: NetDebtBridge = {
      reported: raw.net_debt?.value ?? null,
      borrowings, lease_choice: choice, leases, debt_like: debtLike, cash, cash_like: cashLike,
      gross, adjusted: debtSide === null || cashSide === null ? null : debtSide - cashSide,
    };
    bridges.net_debt = nd;
    const netTouched = debtLike.length > 0 || cashLike.length > 0 || choice !== null || overridden('borrowings', A) || overridden('cash', A);
    if (netTouched) {
      const prov = (detail: string): Provenance => ({ source: 'adjusted', detail, period: A, url: raw.net_debt?.provenance.url });
      const leaseWord = choice === null ? 'lease treatment not chosen' : choice === 'none' ? 'no leases' : choice === 'finance' ? 'finance leases' : 'all leases';
      out.gross_debt = sv(nd.gross, prov(`borrowings + ${leaseWord}`));
      if (overridden('cash', A)) out.cash = sv(cash, prov(`cash restated from ${raw.cash ? fmt(raw.cash.value) : 'nothing in the source'}`));
      out.net_debt = sv(nd.adjusted, prov(
        `adjusted net debt: borrowings + ${leaseWord}${debtLike.length ? ` + ${debtLike.length} debt-like item${debtLike.length === 1 ? '' : 's'}` : ''} − cash${cashLike.length ? ` − ${cashLike.length} cash-like item${cashLike.length === 1 ? '' : 's'}` : ''}${nd.reported !== null ? ` (reported ${fmt(nd.reported)})` : ''}`));
    }
  }

  // an operating-NWC row restates the anchor year only; earlier years are not comparable to it
  if (nwcRows.length && out.history?.operating_nwc) {
    out.history = {
      ...out.history,
      operating_nwc: {
        ...out.history.operating_nwc,
        points: out.nwc && A !== null ? out.history.operating_nwc.points.filter((p) => p.end === A).map((p) => ({ ...p, value: out.nwc!.value })) : [],
      },
    };
  }

  // gaps the ledger closed stop being gaps; ones it opened are reported by cleaningChecks
  out.gaps = raw.gaps.filter((g) =>
    !((g === 'FY revenue' && out.fy_revenue) || (g === 'FY EBITDA' && out.fy_ebitda) || (g === 'Net debt at entry' && out.net_debt)));
  if (out.gaps.length === raw.gaps.length) out.gaps = raw.gaps;

  return { raw: out, bridges };
}
