/**
 * engine2/workbook.ts — SPEC §26 [v2.0.0]: the exported workbook is a LIVE FORMULA MODEL.
 *
 * One `Inputs` sheet holds every input (blue). The `Model` sheet holds only formulas (black)
 * that restate THIS spec cell by cell — the same order and the same conventions as the engine
 * (§3 waterfall, §4 opening-balance interest, §5 strict sequence, §6 tax state machine, §7
 * fee amortization incl. the v1.0.3 write-off timing, §8 balance sheet, §9 exit, §10 MIP,
 * §11 credit, §25 flow to equity). Headline answers are green. A `Checks` sheet holds
 * identities that must read zero.
 *
 * It is NOT a second engine: every formula cell that has a ModelOutput counterpart is paired
 * with the engine's own value (`parity`), and the test suite recalculates the workbook in an
 * independent spreadsheet engine (LibreOffice) and asserts every pair agrees (§14.26). A
 * feature the formulas do not yet implement BLOCKS export by name (`formulaCoverageBlockers`)
 * — never a pasted value, never a silent omission.
 *
 * Formulas are written with SYMBOLIC row references (`ref`) and resolved once every row
 * exists, because a financial model references forward (opening balance ← prior closing
 * balance; tax ← the prior year's carryforward).
 *
 * No imports from lib/engine (boundary test).
 */

import ExcelJS from 'exceljs';
import type { Engine2ModelOutput } from './facade';
import type { CashPayTrancheAssumption, LineSpec, PikNoteAssumption } from './types';
import { DISCLOSURES } from './disclosures';
import { runModel } from './facade';

/**
 * A robust IRR cell: the spreadsheet IRR seeded with the money-multiple estimate
 * (inflows ÷ outlay)^(1/N) − 1, so deep losses still converge (the default 10% guess fails
 * there in Excel and LibreOffice alike); "N/A" when there is no rate, never a fabricated one.
 */
function irrF(first: string, last: string, n: number): string {
  return `IFERROR(IRR(${first}:${last},MAX(-0.95,(SUMIF(${first}:${last},">0")/MAX(1E-9,-${first}))^(1/${n})-1)),"N/A")`;
}

/** The exit-multiple sensitivity: the base multiple and two steps of 0.5× either side. */
const SENS_STEPS = [-1, -0.5, 0, 0.5, 1];

// ── styling (the reference model's conventions) ──────────────────────────────────────────
const BLUE = 'FF0000FF';
const NAVY = 'FF1F4E79';
const GREEN = 'FF00703C';
const GREY = 'FF777777';
const FILL_HEAD = 'FFEBF3FA';
const FILL_ANSWER = 'FFE2EFDA';
const FMT_MONEY = '#,##0.00_);(#,##0.00);"–"_)';
const FMT_PCT = '0.00%';
const FMT_MULT = '0.00"x"';
const FMT_NUM = '0.0000';
const FMT_YEAR = '0';

export interface ParityCell {
  sheet: string;
  addr: string;
  label: string;
  /** The engine's value; null ⇔ the engine reports N/A, and the cell must not be a number. */
  expected: number | null;
}

export interface FormulaWorkbook {
  wb: ExcelJS.Workbook;
  parity: ParityCell[];
}

/**
 * §26 coverage rule: the features the formula model does not implement yet. A non-empty
 * list BLOCKS export — the UI shows these names; nothing is exported as pasted values.
 */
export function formulaCoverageBlockers(o: Engine2ModelOutput): string[] {
  const a = o.assumptions;
  const out: string[] = [];
  void a; // every engine feature is formula-covered today; a new feature registers here until it is
  return out;
}

// ── address helpers ─────────────────────────────────────────────────────────────────────
function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
/** Year t (0 = close) lives in column D + t on BOTH sheets, so a year reads the same letter everywhere. */
const Y = (t: number) => colLetter(4 + t);

/** Symbolic reference: `@{sheet:key:t:abs}` — resolved by `resolve()` once all rows exist. */
const REF = /@\{([^:}]+):([^:}]+):(-?\d+):([01])\}/g;
const ref = (sheet: string, key: string, t: number, abs: boolean) => `@{${sheet}:${key}:${t}:${abs ? 1 : 0}}`;

type Val = number | null;
type Cell =
  | { f: string; v: Val; fmt?: string } // formula + the engine value it must equal
  | { input: number | string | boolean; fmt?: string }; // an input (Inputs sheet only)

interface RowOpts {
  bold?: boolean;
  answer?: boolean;
  fmt?: string;
  note?: string;
  italic?: boolean;
  /** An intermediate with no ModelOutput counterpart (still a live formula; not parity-mapped). */
  noParity?: boolean;
}

interface PendingFormula {
  sheet: SheetBuilder;
  addr: string;
  formula: string;
  /** The engine's value, cached for viewers that do not recalculate; null ⇒ no cache (the
   *  viewer computes it — never a placeholder like "N/A" or 0 standing in for a number). */
  result: number | null;
}

class SheetBuilder {
  readonly ws: ExcelJS.Worksheet;
  r = 1;
  readonly rows = new Map<string, number>();
  constructor(
    wb: ExcelJS.Workbook,
    readonly name: string,
    private readonly parity: ParityCell[],
    private readonly pending: PendingFormula[],
    labelWidth: number,
    yearCols: number,
    tabColor: string,
    private readonly unitWord: string,
  ) {
    this.ws = wb.addWorksheet(name, {
      properties: { tabColor: { argb: tabColor } },
      views: [{ showGridLines: false, state: 'frozen', xSplit: 3, ySplit: 3 }],
      // print the whole year grid on one page width (a model is read across, not down two pages)
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    });
    this.ws.getColumn(1).width = 2;
    this.ws.getColumn(2).width = labelWidth;
    this.ws.getColumn(3).width = 7; // the units column
    for (let c = 4; c < 4 + yearCols; c++) this.ws.getColumn(c).width = 13;
    this.ws.getColumn(4 + yearCols).width = 3;
    this.ws.getColumn(5 + yearCols).width = 90;
    this.noteCol = 5 + yearCols;
  }
  private readonly noteCol: number;
  /** The units column (C): what every number on the row is measured in. */
  private unitOf(fmt: string | undefined): string {
    if (fmt === FMT_PCT) return '%';
    if (fmt === FMT_MULT) return 'x';
    if (fmt === FMT_YEAR) return 'year';
    if (fmt === FMT_MONEY || fmt === undefined) return this.unitWord;
    return '';
  }
  row(key: string): number {
    const r = this.rows.get(key);
    if (r === undefined) throw new Error(`workbook: a formula references row "${key}" on ${this.name}, which was never written`);
    return r;
  }
  at(key: string, t: number, abs = false): string {
    return ref(this.name, key, t, abs);
  }
  /** Cross-sheet reference (always absolute). */
  ext(key: string, t: number): string {
    return ref(this.name, key, t, true);
  }
  title(text: string, sub: string[]) {
    const c = this.ws.getCell(`B${this.r}`);
    c.value = text;
    c.font = { bold: true, size: 14, color: { argb: NAVY } };
    this.r += 1;
    for (const s of sub) {
      const d = this.ws.getCell(`B${this.r}`);
      d.value = s;
      d.font = { italic: true, color: { argb: GREY } };
      this.r += 1;
    }
  }
  section(text: string) {
    this.r += 1;
    const c = this.ws.getCell(`B${this.r}`);
    c.value = text;
    c.font = { bold: true, size: 12, color: { argb: NAVY } };
    this.r += 1;
  }
  header(labels: Record<number, string>) {
    for (const [col, text] of Object.entries(labels)) {
      const c = this.ws.getCell(`${Y(Number(col))}${this.r}`);
      c.value = text;
      c.font = { bold: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_HEAD } };
      c.alignment = { horizontal: 'right' };
    }
    this.r += 1;
  }
  note(text: string) {
    const c = this.ws.getCell(`B${this.r}`);
    c.value = text;
    c.font = { italic: true, color: { argb: GREY } };
    this.r += 1;
  }
  /** One labelled row; `cells` maps year index t → cell. Returns the row number. */
  line(key: string, label: string, cells: Record<number, Cell>, opts: RowOpts = {}): number {
    if (this.rows.has(key)) throw new Error(`workbook: duplicate row key "${key}" on ${this.name}`);
    const r = this.r;
    this.rows.set(key, r);
    const lab = this.ws.getCell(`B${r}`);
    lab.value = label;
    if (opts.bold || opts.answer) lab.font = { bold: true, color: opts.answer ? { argb: GREEN } : undefined };
    if (opts.italic) lab.font = { italic: true, color: { argb: GREY } };
    const first = Object.values(cells)[0];
    const isText = first && 'input' in first && (typeof first.input === 'string' || typeof first.input === 'boolean');
    const unit = isText ? '' : this.unitOf((first && first.fmt) ?? opts.fmt);
    if (unit) {
      const u = this.ws.getCell(`C${r}`);
      u.value = unit;
      u.font = { italic: true, size: 9, color: { argb: GREY } };
    }
    for (const [tStr, cell] of Object.entries(cells)) {
      const addr = `${Y(Number(tStr))}${r}`;
      const c = this.ws.getCell(addr);
      if ('input' in cell) {
        c.value = cell.input;
        c.font = { color: { argb: BLUE } };
        // a TRUE/FALSE input must read TRUE/FALSE, never a number format's rendering of 1/0
        c.numFmt = typeof cell.input === 'boolean' ? 'General' : cell.fmt ?? opts.fmt ?? FMT_MONEY;
        continue;
      }
      c.numFmt = cell.fmt ?? opts.fmt ?? FMT_MONEY;
      if (opts.bold || opts.answer) c.border = { top: { style: 'thin', color: { argb: GREY } } }; // a total reads as a total
      if (opts.bold) c.font = { bold: true };
      if (opts.answer) {
        c.font = { bold: true, color: { argb: GREEN } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_ANSWER } };
      }
      this.pending.push({ sheet: this, addr, formula: cell.f, result: cell.v });
      if (!opts.noParity) this.parity.push({ sheet: this.name, addr, label: `${label.trim()} [${tStr}]`, expected: cell.v });
    }
    if (opts.note) {
      const n = this.ws.getCell(`${colLetter(this.noteCol)}${r}`);
      n.value = opts.note;
      n.font = { italic: true, color: { argb: GREY } };
    }
    this.r += 1;
    return r;
  }
}

const range = (n: number, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const per = (from: number, to: number, fn: (t: number) => Cell): Record<number, Cell> =>
  Object.fromEntries(range(to - from + 1, from).map((t) => [t, fn(t)]));

export function buildFormulaWorkbook(o: Engine2ModelOutput, opts: { cachedResults: boolean }): FormulaWorkbook {
  const blockers = formulaCoverageBlockers(o);
  if (blockers.length) {
    throw new RangeError(`workbook: the formula model does not implement yet: ${blockers.join(', ')} — export blocked (SPEC §26 coverage rule)`);
  }
  const a = o.assumptions;
  const f = o.facts;
  const N = a.entry.hold_years;
  const lines = a.operations.lines;
  const ops = a.operations;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Deal Engine (engine2 v2.0.0)';
  wb.calcProperties = { fullCalcOnLoad: true };
  const parity: ParityCell[] = [];
  const pending: PendingFormula[] = [];
  const unitWord = `${f.currency}m`;
  const S = new SheetBuilder(wb, 'Summary', parity, pending, 58, N + 1, 'FF00703C', unitWord);
  const I = new SheetBuilder(wb, 'Inputs', parity, pending, 64, N + 1, 'FF0000FF', unitWord);
  // The Clean step's bridges (display-only facts) get their own sheet, between Inputs and Model.
  const nz = f.normalisation ?? null;
  const NZ = nz ? new SheetBuilder(wb, 'Normalisation', parity, pending, 62, Math.max(nz.periods.length, 1), 'FF7F6000', unitWord) : null;
  const M = new SheetBuilder(wb, 'Model', parity, pending, 66, N + 1, 'FF404040', unitWord);
  const K = SENS_STEPS.length;
  const X = new SheetBuilder(wb, 'Sensitivity', parity, pending, 62, Math.max(N + 1, K), 'FF7030A0', unitWord);
  const C = new SheetBuilder(wb, 'Checks', parity, pending, 66, 1, 'FFC00000', unitWord);
  const sheets = new Map([[S.name, S], [I.name, I], [M.name, M], [X.name, X], [C.name, C]]);
  if (NZ) sheets.set(NZ.name, NZ);
  const ccy = f.currency;
  const years = (from: number, to: number) => Object.fromEntries(range(to - from + 1, from).map((t) => [t, `Year ${t}`]));
  const iv = (key: string) => I.ext(key, 0); // a scalar input (column D)
  const iy = (key: string, t: number) => I.ext(key, t); // a per-year input
  const m = (key: string, t: number, abs = false) => M.at(key, t, abs);
  const terms = a.structure.tranches.filter((t): t is CashPayTrancheAssumption | PikNoteAssumption => t.type !== 'revolver');
  const rcfA = a.structure.tranches.find((t) => t.type === 'revolver');
  const revolver = rcfA && rcfA.type === 'revolver' ? rcfA : null;
  const tk = terms.map((_, i) => `t${i}`);
  const refiOf = (name: string) => (a.structure.refinancing ?? []).find((r) => r.tranche_name === name) ?? null;
  const all = (t: number) => range(N + 1, 0).map((x) => x === t);
  void all;

  // ═══════════════════════════════ INPUTS ═══════════════════════════════
  I.title(`${a.deal_name} — inputs`, [
    `${ccy} millions unless stated. Blue = input. Every other number in this workbook is a formula on these cells.`,
    'Structural choices (holding period, the tranche list, forecast-line modes, the NWC method) are fixed at export — re-export from the deal engine to change them.',
  ]);
  // ═══════════════════════════════ NORMALISATION ═══════════════════════════════
  // How the sourced figures became the figures the model reads. Reported lines and every
  // adjustment are inputs (blue); the adjusted figures are formulas; and the Inputs sheet's
  // sizing revenue / EBITDA REFERENCE this sheet — so adding to an amount here moves the model.
  // A period where an amount was not entered reads "n/a", never a number (blank ≠ zero).
  const sizingCol = nz && nz.sizing !== null ? nz.periods.findIndex((p) => p.key === nz.sizing) : -1;
  const linked = { revenue: false, ebitda: false, forecast: false };
  if (nz && NZ) {
    const P = nz.periods.length;
    const close = (x: number | null, y: number | null) => x !== null && y !== null && Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y));
    NZ.title(`${a.deal_name} — normalisation`, [
      `${ccy} millions. Blue = input. The adjusted figures are formulas, and the model's sizing revenue and EBITDA on the Inputs sheet point here.`,
      nz.as_reported
        ? 'This deal is modelled on the figures AS REPORTED — no normalisation was applied.'
        : 'A positive amount increases the line (a cost added back to EBITDA is entered as a positive number). The type in brackets is a label only.',
    ]);
    const bridge = (key: 'rev' | 'eb', label: string, list: typeof nz.ebitda) => {
      NZ.section(label);
      NZ.header(Object.fromEntries(nz.periods.map((p, t) => [t, p.label])));
      const restatedNote = list.filter((b) => b.reported !== null && b.restated !== null && b.reported !== b.restated)
        .map((b) => `${nz.periods.find((p) => p.key === b.period)?.label ?? b.period}: restated from ${b.reported}`).join('; ');
      const cells = (pick: (b: (typeof list)[number]) => number | null): Record<number, Cell> =>
        Object.fromEntries(list.flatMap((b, t) => { const x = pick(b); return x === null ? [] : [[t, { input: x } as Cell]]; }));
      NZ.line(`${key}_rep`, `${label} as sourced${restatedNote ? ' (restated)' : ''}`, cells((b) => b.restated), { note: restatedNote || undefined });
      const rows = list[0]?.rows ?? [];
      rows.forEach((r, i) => {
        const fc = key === 'eb' && r.forecast === 'continues' ? '; continues — not in the forecast base' : '';
        NZ.line(`${key}_a${i}`, `   ${r.label || 'Adjustment'} (${r.category.replace(/_/g, ' ')}${fc})`, cells((b) => b.rows[i]?.amount ?? null), { note: r.note || undefined });
      });
      const last = rows.length ? `${key}_a${rows.length - 1}` : `${key}_rep`;
      NZ.line(`${key}_adj`, `Adjusted ${label.toLowerCase()}`, Object.fromEntries(range(P, 0).map((t) => [t, {
        f: `IF(COUNT(${NZ.at(`${key}_rep`, t)}:${NZ.at(last, t)})<${rows.length + 1},"n/a",SUM(${NZ.at(`${key}_rep`, t)}:${NZ.at(last, t)}))`,
        v: list[t].adjusted,
      } as Cell])), { bold: true });
    };
    bridge('rev', 'Revenue', nz.revenue);
    bridge('eb', 'EBITDA', nz.ebitda);
    // §27: the forecast margin starts from adjusted EBITDA less the add-backs that continue.
    const contIdx = (nz.ebitda[0]?.rows ?? []).flatMap((r, i) => (r.forecast === 'continues' ? [i] : []));
    if (contIdx.length) {
      NZ.line('eb_fc', 'EBITDA base for the forecast margin (adjusted, less the add-backs that continue)', Object.fromEntries(range(P, 0).map((t) => {
        const b = nz.ebitda[t];
        const known = b.adjusted !== null && contIdx.every((i) => b.rows[i].amount !== null);
        let v: number | null = known ? b.adjusted : null;
        if (v !== null) for (const i of contIdx) v -= b.rows[i].amount!;
        return [t, { f: `IF(ISNUMBER(${NZ.at('eb_adj', t)}),${NZ.at('eb_adj', t)}${contIdx.map((i) => `-${NZ.at(`eb_a${i}`, t)}`).join('')},"n/a")`, v } as Cell];
      })), { bold: true, note: 'SPEC §27: an add-back that keeps costing cash is in the price basis, not in forecast cash flow.' });
    }
    const nd = nz.net_debt;
    NZ.section(`Net debt at ${nz.anchor ?? 'entry'}`);
    if (nd && !nz.as_reported && nd.adjusted !== null && nd.borrowings !== null && nd.cash !== null) {
      NZ.line('nd_borrow', 'Borrowings', { 0: { input: nd.borrowings } });
      const debtRows = [...nd.leases.filter((l) => l.included).map((l) => ({ label: l.label, amount: l.amount, note: '' })), ...nd.debt_like.map((r) => ({ label: r.label, amount: r.amount!, note: r.note }))];
      debtRows.forEach((r, i) => NZ.line(`nd_d${i}`, `   ${r.label}`, { 0: { input: r.amount } }, { note: r.note || undefined }));
      NZ.line('nd_cash', 'Cash', { 0: { input: nd.cash } });
      nd.cash_like.forEach((r, i) => NZ.line(`nd_c${i}`, `   ${r.label} (cash-like; negative = not available)`, { 0: { input: r.amount! } }, { note: r.note || undefined }));
      const lastDebt = debtRows.length ? `nd_d${debtRows.length - 1}` : 'nd_borrow';
      const lastCash = nd.cash_like.length ? `nd_c${nd.cash_like.length - 1}` : 'nd_cash';
      NZ.line('nd_adj', 'Adjusted net debt', { 0: { f: `SUM(${NZ.at('nd_borrow', 0)}:${NZ.at(lastDebt, 0)})-SUM(${NZ.at('nd_cash', 0)}:${NZ.at(lastCash, 0)})`, v: nd.adjusted } }, { bold: true,
        note: nd.leases.some((l) => !l.included) ? `Lease liabilities not counted as debt: ${nd.leases.filter((l) => !l.included).map((l) => `${l.label} ${l.amount}`).join('; ')}` : undefined });
    } else if (f.net_debt !== null) {
      NZ.line('nd_adj', 'Net debt as sourced', { 0: { input: f.net_debt } });
    } else {
      NZ.note('The source gives no net debt figure.');
    }
    NZ.note('Net debt does not enter the model’s returns (the model prices the whole enterprise); it sets what the sellers receive — see the Summary.');
    // The Inputs cells point here only when the bridge reproduces the figure the engine read.
    if (sizingCol >= 0) {
      linked.revenue = close(nz.revenue[sizingCol]?.adjusted ?? null, f.fy_revenue);
      linked.ebitda = close(nz.ebitda[sizingCol]?.adjusted ?? null, f.fy_ebitda);
      linked.forecast = linked.ebitda && linked.revenue && contIdx.length > 0 && nz.forecast_ebitda !== null
        && f.fy_revenue !== null && close(nz.forecast_ebitda / f.fy_revenue, f.fy_ebitda_margin);
    }
  }

  I.section('1. Historical facts (the debt-sizing basis)');
  const basisWord = f.sizing_basis === 'LTM' ? 'LTM' : 'FY';
  const fromNz = 'From the Normalisation sheet — change the amounts there.';
  if (f.fy_revenue !== null) {
    if (linked.revenue && NZ) I.line('ltm_revenue', `${basisWord} revenue (adjusted)`, { 0: { f: NZ.ext('rev_adj', sizingCol), v: f.fy_revenue } }, { note: fromNz });
    else I.line('ltm_revenue', `${basisWord} revenue`, { 0: { input: f.fy_revenue } });
  }
  if (f.fy_ebitda !== null) {
    if (linked.ebitda && NZ) I.line('ltm_ebitda', `${basisWord} EBITDA (adjusted)`, { 0: { f: NZ.ext('eb_adj', sizingCol), v: f.fy_ebitda } }, { note: fromNz });
    else I.line('ltm_ebitda', `${basisWord} EBITDA`, { 0: { input: f.fy_ebitda } });
  }
  if (linked.forecast && NZ && nz) {
    I.line('ltm_ebitda_fc', `${basisWord} EBITDA base for the forecast margin (§27)`, { 0: { f: NZ.ext('eb_fc', sizingCol), v: nz.forecast_ebitda } }, { note: fromNz });
  }
  if (f.fy_revenue === null && f.fy_ebitda === null) I.note('This case states no historical year — every operating line is entered directly.');
  I.line('net_ppe', 'Net PP&E at close (0 if the source states none)', { 0: { input: f.net_ppe ?? 0 } },
    { note: f.net_ppe === null ? 'Not stated in the source — seeded at 0. It moves goodwill only, never a cash flow.' : undefined });

  I.section('2. Transaction');
  I.line('hold', 'Holding period, years (structural)', { 0: { input: N, fmt: FMT_YEAR } });
  I.line('entry_basis', 'Entry multiple basis: FY (historical) or NTM (forecast year 1)', { 0: { input: a.entry.basis === 'fy' ? 'FY' : 'NTM', fmt: '@' } });
  if (a.entry.driver === 'ev') I.line('entry_ev', 'Purchase price (enterprise value)', { 0: { input: a.entry.enterprise_value! } });
  else I.line('entry_mult', 'Entry multiple (× basis EBITDA)', { 0: { input: a.entry.entry_multiple!, fmt: FMT_MULT } });
  I.line('txn_pct', 'Transaction costs (% of EV)', { 0: { input: a.fees.transaction_pct_of_ev, fmt: FMT_PCT } });
  I.line('fin_pct', 'Financing fees (% of total commitments incl. the undrawn revolver)', { 0: { input: a.fees.financing_pct_of_commitments, fmt: FMT_PCT } });
  I.line('min_cash', 'Minimum cash (funded at close)', { 0: { input: a.structure.min_cash } });
  const mon = a.fees.monitoring;
  if (mon) {
    I.line('mon_annual', 'Sponsor monitoring fee, a year (charged years 1…N−1)', { 0: { input: mon.annual } });
    I.line('mon_T', 'Monitoring fee: years accelerated at exit (termination)', { 0: { input: mon.termination_years, fmt: FMT_YEAR } });
    I.line('mon_r', 'Monitoring fee: termination discount rate', { 0: { input: mon.discount_rate, fmt: FMT_PCT } });
  }
  I.line('rollover', 'Rollover equity', { 0: { input: a.rollover_equity } });
  const grid = a.structure.sweep.grid;
  const gridTiers = grid ? [...grid.tiers].sort((x, y) => y.above_net_leverage - x.above_net_leverage) : [];
  if (!grid) I.line('sweep_pct', 'Cash sweep (% of cash above the minimum)', { 0: { input: a.structure.sweep.base_pct, fmt: FMT_PCT } });
  else {
    I.note('Cash sweep by opening net leverage — tiers in DESCENDING threshold order (the first threshold exceeded wins):');
    gridTiers.forEach((tier, j) => {
      I.line(`sg${j}_lev`, `   sweep tier ${j + 1}: when opening net leverage is above`, { 0: { input: tier.above_net_leverage, fmt: FMT_MULT } });
      I.line(`sg${j}_pct`, `   sweep tier ${j + 1}: sweep %`, { 0: { input: tier.pct, fmt: FMT_PCT } });
    });
    I.line('sg_else', '   sweep % below every threshold', { 0: { input: grid.else_pct, fmt: FMT_PCT } });
  }
  const sched = a.structure.distributions;
  const surplusD = a.structure.surplus_distribution;
  /** a distribution policy is in force — a requested schedule OR the §3.8 surplus policy */
  const dists = sched !== null || surplusD !== null;
  const trap = a.covenants.rp_trap;
  if (trap) I.line('rp_level', 'Restricted-payment trap: distributions only while pro-forma net leverage ≤', { 0: { input: trap.level, fmt: FMT_MULT } });
  const covs = a.covenants;
  // a per-year schedule is shown year by year exactly as the engine resolves it (credit.ts covenantLevel)
  const lvl = (x: number | number[] | null, t: number) => (x === null ? null : Array.isArray(x) ? x[t - 1] ?? x[x.length - 1] : x);

  I.section('3. Debt');
  terms.forEach((t, i) => {
    const k = tk[i];
    I.note(`${t.name} — ${t.type.replace('_', ' ')}; ${t.sweep.participates ? `sweep priority ${t.sweep.priority}` : 'does not take the sweep'}`);
    if (t.size.x_ebitda !== undefined) I.line(`${k}_x`, `${t.name}: size (× ${basisWord} EBITDA)`, { 0: { input: t.size.x_ebitda, fmt: FMT_MULT } });
    else I.line(`${k}_amt`, `${t.name}: size (amount)`, { 0: { input: t.size.amount } });
    if (t.type === 'pik_note') {
      I.line(`${k}_cash`, `${t.name}: cash coupon`, { 0: { input: t.cash_coupon, fmt: FMT_PCT } });
      I.line(`${k}_pik`, `${t.name}: PIK coupon (accrues on the opening balance)`, { 0: { input: t.pik_coupon, fmt: FMT_PCT } });
    } else if (t.pricing.kind === 'fixed') {
      I.line(`${k}_rate`, `${t.name}: fixed rate`, { 0: { input: t.pricing.rate, fmt: FMT_PCT } });
    } else {
      I.line(`${k}_base`, `${t.name}: base rate`, { 0: { input: t.pricing.base_rate, fmt: FMT_PCT } });
      I.line(`${k}_floor`, `${t.name}: base-rate floor`, { 0: { input: t.pricing.floor, fmt: FMT_PCT } });
      I.line(`${k}_spread`, `${t.name}: spread`, { 0: { input: t.pricing.spread, fmt: FMT_PCT } });
    }
    I.line(`${k}_amort`, `${t.name}: mandatory amortization (% of original face a year)`, { 0: { input: t.amort_pct_of_face, fmt: FMT_PCT } });
    I.line(`${k}_oid`, `${t.name}: OID (% of par)`, { 0: { input: t.oid_pct, fmt: FMT_PCT } });
    I.line(`${k}_mat`, `${t.name}: maturity, years (the fee/OID amortization horizon)`, { 0: { input: t.maturity_years, fmt: FMT_YEAR } });
    const ev = refiOf(t.name);
    if (ev) {
      I.note(`${t.name} — refinanced at the START of the year below, par for par on its opening balance`);
      I.line(`${k}_rf_y`, `${t.name}: refinancing year`, { 0: { input: ev.year, fmt: FMT_YEAR } });
      if (ev.new_pricing.kind === 'fixed') I.line(`${k}_rf_rate`, `${t.name}: new fixed rate`, { 0: { input: ev.new_pricing.rate, fmt: FMT_PCT } });
      else {
        I.line(`${k}_rf_base`, `${t.name}: new base rate`, { 0: { input: ev.new_pricing.base_rate, fmt: FMT_PCT } });
        I.line(`${k}_rf_floor`, `${t.name}: new base-rate floor`, { 0: { input: ev.new_pricing.floor, fmt: FMT_PCT } });
        I.line(`${k}_rf_spread`, `${t.name}: new spread`, { 0: { input: ev.new_pricing.spread, fmt: FMT_PCT } });
      }
      I.line(`${k}_rf_prem`, `${t.name}: call premium (% of the refinanced balance)`, { 0: { input: ev.call_premium_pct, fmt: FMT_PCT } });
      I.line(`${k}_rf_mat`, `${t.name}: new maturity (years from the refinancing year)`, { 0: { input: ev.new_maturity_years, fmt: FMT_YEAR } });
      I.line(`${k}_rf_oid`, `${t.name}: new OID (% of the refinanced balance)`, { 0: { input: ev.new_oid_pct, fmt: FMT_PCT } });
      I.line(`${k}_rf_fee`, `${t.name}: new financing fee (% of the refinanced balance)`, { 0: { input: ev.new_financing_fee_pct, fmt: FMT_PCT } });
      I.line(`${k}_rf_amort`, `${t.name}: new mandatory amortization (% of the new face a year)`, { 0: { input: ev.new_amort_pct_of_face, fmt: FMT_PCT } });
    }
  });
  if (revolver) {
    I.note(`${revolver.name} — revolver (undrawn at close)`);
    if (revolver.commitment.x_ebitda !== undefined) I.line('rcf_x', `${revolver.name}: commitment (× ${basisWord} EBITDA)`, { 0: { input: revolver.commitment.x_ebitda, fmt: FMT_MULT } });
    else I.line('rcf_amt', `${revolver.name}: commitment (amount)`, { 0: { input: revolver.commitment.amount } });
    if (revolver.pricing.kind === 'fixed') I.line('rcf_rate', `${revolver.name}: fixed rate on drawn`, { 0: { input: revolver.pricing.rate, fmt: FMT_PCT } });
    else {
      I.line('rcf_base', `${revolver.name}: base rate`, { 0: { input: revolver.pricing.base_rate, fmt: FMT_PCT } });
      I.line('rcf_floor', `${revolver.name}: base-rate floor`, { 0: { input: revolver.pricing.floor, fmt: FMT_PCT } });
      I.line('rcf_spread', `${revolver.name}: spread`, { 0: { input: revolver.pricing.spread, fmt: FMT_PCT } });
    }
    I.line('rcf_fee', `${revolver.name}: commitment fee on undrawn`, { 0: { input: revolver.commitment_fee, fmt: FMT_PCT } });
    I.line('rcf_mat', `${revolver.name}: maturity, years (the fee amortization horizon)`, { 0: { input: revolver.maturity_years, fmt: FMT_YEAR } });
  }
  if (terms.length === 0 && !revolver) I.note('All-equity deal — no debt.');

  I.section('4. Operating forecast');
  I.header(years(1, N));
  const lineInputs = (key: string, label: string, spec: LineSpec) => {
    if (spec.mode === 'explicit') I.line(key, label, per(1, N, (t) => ({ input: spec.values[t - 1] })));
    else {
      I.line(`${key}_y1`, `${label}: year-1 amount`, { 1: { input: spec.year1 } });
      I.line(`${key}_g`, `${label}: growth`, per(2, N, (t) => ({ input: spec.growth[t - 2], fmt: FMT_PCT })));
    }
  };
  const revModelled = !(lines?.revenue && lines.revenue.mode === 'not_modelled');
  if (!lines?.revenue) I.line('g', 'Revenue growth', per(1, N, (t) => ({ input: ops.growth[t - 1], fmt: FMT_PCT })));
  else if (lines.revenue.mode !== 'not_modelled') lineInputs('rev', 'Revenue', lines.revenue);
  else I.note('Revenue: not modelled in this case.');
  if (!lines?.ebitda) {
    I.line('target_margin', 'Target EBITDA margin (reached in the final hold year)', { 0: { input: ops.target_margin, fmt: FMT_PCT } });
    I.line('margin_path', 'Margin path: linear / front_loaded / back_loaded', { 0: { input: ops.margin_path, fmt: '@' } });
  } else lineInputs('ebx', lines.ebitda.measure === 'ebit' ? 'EBIT' : 'EBITDA', lines.ebitda);
  if (!lines?.da) I.line('da_pct', 'D&A (% of revenue)', { 0: { input: ops.da_pct_revenue, fmt: FMT_PCT } });
  else lineInputs('da', 'Depreciation & amortization', lines.da);
  if (!lines?.capex) {
    I.line('capex_pct', 'Maintenance capex (% of revenue)', { 0: { input: ops.maint_capex_pct_revenue, fmt: FMT_PCT } });
    I.line('gcapex', 'Growth capex', per(1, N, (t) => ({ input: ops.growth_capex[t - 1] })));
  } else if (lines.capex.mode === 'pct_of_da') {
    I.line('capex_da', 'Capex as a multiple of D&A (1.00 = capex equals depreciation)', { 0: { input: lines.capex.pct, fmt: FMT_NUM } });
  } else lineInputs('capex', 'Capital expenditure', lines.capex);
  if (!lines?.delta_nwc) {
    if (ops.nwc.method === 'pct') I.line('nwc_pct', 'Operating NWC (% of revenue)', { 0: { input: ops.nwc.pct_revenue, fmt: FMT_PCT } });
    else {
      I.line('dso', 'DSO (days, 365 basis)', { 0: { input: ops.nwc.dso, fmt: '0.0' } });
      I.line('dio', 'DIO (days, on the COGS proxy = revenue × (1 − margin))', { 0: { input: ops.nwc.dio, fmt: '0.0' } });
      I.line('dpo', 'DPO (days, on the COGS proxy)', { 0: { input: ops.nwc.dpo, fmt: '0.0' } });
    }
  } else {
    lineInputs('dnwc', 'Increase in net working capital', lines.delta_nwc);
    I.line('nwc0', 'Opening operating NWC (0 if the source states none)', { 0: { input: f.operating_nwc ?? 0 } },
      { note: f.operating_nwc === null ? 'Not stated — seeded at 0. It moves goodwill only, never a cash flow.' : undefined });
  }
  if (lines && lines.year_n_plus_1_growth !== null) I.line('gN1', 'Growth of every line into year N+1 (NTM exit and terminal value)', { 0: { input: lines.year_n_plus_1_growth, fmt: FMT_PCT } });

  if (covs.leverage_max !== null) I.line('cov_lev', 'Covenant: maximum net leverage', per(1, N, (t) => ({ input: lvl(covs.leverage_max, t)!, fmt: FMT_MULT })));
  if (covs.dscr_min !== null) I.line('cov_dscr', 'Covenant: minimum DSCR', per(1, N, (t) => ({ input: lvl(covs.dscr_min, t)!, fmt: FMT_MULT })));
  if (covs.fccr_min !== null) I.line('cov_fccr', 'Covenant: minimum FCCR', per(1, N, (t) => ({ input: lvl(covs.fccr_min, t)!, fmt: FMT_MULT })));
  if (covs.springing) {
    I.line('spr_max', 'Springing leverage test: maximum net leverage', per(1, N, (t) => ({ input: lvl(covs.springing!.max, t)!, fmt: FMT_MULT })));
    I.line('spr_trig', 'Springing test applies when revolver drawn ÷ commitment exceeds', { 0: { input: covs.springing.revolver_draw_trigger_pct, fmt: FMT_PCT } });
  }
  terms.forEach((t, i) => {
    if (t.type === 'pik_note' && t.elections) {
      const el = t.elections;
      I.line(`${tk[i]}_el`, `${t.name}: coupon election (cash / pik)`, per(1, N, (y) => ({ input: el[y - 1], fmt: '@' })));
    }
  });
  if (sched) I.line('dist_req', 'Requested distribution to equity (paid only from cash above the minimum)', per(1, N, (t) => ({ input: sched[t - 1] })));
  if (surplusD) {
    I.line('sd_payout', 'Surplus cash paid to equity each year (% of cash above the minimum, after the sweep)', { 0: { input: surplusD.payout_pct, fmt: FMT_PCT } });
    I.line('sd_start', 'Surplus distributions start: immediately / after_debt_repaid', { 0: { input: surplusD.start, fmt: '@' } });
  }
  I.section('5. Tax');
  I.line('tax_rate', 'Tax rate', { 0: { input: a.tax.rate, fmt: FMT_PCT } });
  I.line('int_ded', 'Interest is tax-deductible (TRUE/FALSE)', { 0: { input: a.tax.interest_deductible } });
  I.line('s163j', 'An interest-deduction cap applies, e.g. US §163(j) (TRUE/FALSE)', { 0: { input: a.tax.s163j.applies } });
  I.line('ati_pct', 'Cap: % of adjusted taxable income (ATI)', { 0: { input: Number.isFinite(a.tax.s163j.ati_pct) ? a.tax.s163j.ati_pct : 0, fmt: FMT_PCT } },
    { note: a.tax.s163j.applies ? undefined : 'Not used while the cap does not apply.' });
  I.line('ati_basis', 'ATI basis: EBITDA or EBIT', { 0: { input: a.tax.s163j.ati_basis === 'ebitda' ? 'EBITDA' : 'EBIT', fmt: '@' } });
  I.line('nol_acq', 'Acquired NOLs at close', { 0: { input: a.tax.nol.acquired_opening } });
  I.line('nol_usable', 'Acquired NOLs are usable (TRUE/FALSE)', { 0: { input: a.tax.nol.acquired_usable } });
  I.line('nol_pre18', 'Acquired NOLs arose before 2018 — 100% cap instead of 80% (TRUE/FALSE)', { 0: { input: a.tax.nol.arose_pre_2018 } });
  I.line('s382', '§382 annual limit on acquired NOLs (blank = none)', { 0: { input: a.tax.nol.s382_annual_limit ?? '' } });
  I.line('min_tax', 'Minimum tax rate on the pre-NOL base (0 = none)', { 0: { input: a.tax.minimum_rate, fmt: FMT_PCT } });

  I.section('6. Exit');
  I.line('exit_mult', 'Exit multiple', { 0: { input: a.exit.multiple, fmt: FMT_MULT } });
  I.line('exit_basis', 'Exit multiple basis: FY (exit-year EBITDA) or NTM (year N+1)', { 0: { input: a.exit.basis === 'fy' ? 'FY' : 'NTM', fmt: '@' } });
  I.line('exit_fee', 'Exit fees (% of exit EV)', { 0: { input: a.exit.fees_pct, fmt: FMT_PCT } });
  if (a.mip) {
    I.line('mip_pool', 'Management promote: pool (% of total proceeds above the hurdle)', { 0: { input: a.mip.pool_pct, fmt: FMT_PCT } });
    I.line('mip_hurdle', 'Management promote: hurdle (× total invested equity)', { 0: { input: a.mip.hurdle_moic, fmt: FMT_MULT } });
    (a.mip.ratchet ?? []).forEach((r, j) => {
      I.line(`mip_r${j}_h`, `Promote ratchet tier ${j + 1}: hurdle (× invested)`, { 0: { input: r.hurdle_moic, fmt: FMT_MULT } });
      I.line(`mip_r${j}_s`, `Promote ratchet tier ${j + 1}: share of proceeds above it`, { 0: { input: r.share_pct, fmt: FMT_PCT } });
    });
  }
  if (a.warrant) {
    I.line('w_pct', `Warrant (${a.warrant.holder_label}): % of ordinary, fully diluted`, { 0: { input: a.warrant.pct_of_ordinary, fmt: FMT_PCT } });
    I.line('w_strike', 'Warrant: total strike (paid in on exercise)', { 0: { input: a.warrant.strike_total } });
  }
  const sweet = a.sweet_equity;
  if (sweet) {
    I.note('Sweet-equity strip — the institution subscribes loan notes + ordinaries; management buys ordinaries (sweet equity)');
    I.line('se_p', 'Institutional strip: ordinaries as % of the institution’s equity (loan notes take the rest)', { 0: { input: sweet.sponsor_ordinary_pct, fmt: FMT_PCT } });
    I.line('se_r', 'Loan-note coupon (rolled up annually; no accretion in year 0)', { 0: { input: sweet.loan_note_rate, fmt: FMT_PCT } });
    I.line('se_sub', 'Management subscription for ordinaries (a source of funds at close)', { 0: { input: sweet.management_subscription } });
    I.line('se_s0', 'Management share of the ordinaries (base, before any ratchet)', { 0: { input: sweet.management_ordinary_pct, fmt: FMT_PCT } });
    (sweet.ratchet ?? []).forEach((r, j) => {
      I.line(`se_r${j}_h`, `Sweet ratchet tier ${j + 1}: institution MOIC above which it applies`, { 0: { input: r.hurdle_moic, fmt: FMT_MULT } });
      I.line(`se_r${j}_s`, `Sweet ratchet tier ${j + 1}: management share of ordinaries above it`, { 0: { input: r.share_pct, fmt: FMT_PCT } });
    });
  }
  const sell = a.structure.selldown;
  if (sell) {
    I.note('Partial exit — a secondary sale of part of the sponsor’s stake (the company is untouched)');
    I.line('sd_year', 'Partial exit: the sale settles at the end of year', { 0: { input: sell.year, fmt: FMT_YEAR } });
    I.line('sd_frac', 'Partial exit: share of the sponsor’s stake sold', { 0: { input: sell.fraction, fmt: FMT_PCT } });
    I.line('sd_mult', 'Partial exit: sale multiple (× that year’s EBITDA after the monitoring fee)', { 0: { input: sell.event_multiple, fmt: FMT_MULT } });
  }
  const fund = a.fund;
  if (fund) {
    I.section('Fund overlay — the sponsor’s equity held by a fund-of-one (net returns to the LP)');
    I.line('f_fee', 'Management fee (% of the fee basis a year)', { 0: { input: fund.mgmt_fee_pct, fmt: FMT_PCT } });
    I.line('f_basis', 'Fee basis: invested or committed', { 0: { input: fund.fee_basis, fmt: '@' } });
    I.line('f_commit', 'Committed capital (blank = the LP commits exactly what it pays in)', { 0: { input: fund.committed_capital ?? '' } });
    I.line('f_pref', 'Preferred return (compounded annually)', { 0: { input: fund.pref_rate, fmt: FMT_PCT } });
    I.line('f_carry', 'Carried interest', { 0: { input: fund.carry_pct, fmt: FMT_PCT } });
    I.line('f_cu', 'GP catch-up share (0 = hard hurdle; 100% = full catch-up)', { 0: { input: fund.catchup_pct, fmt: FMT_PCT } });
    I.line('f_wf', 'Waterfall: european (whole-fund; fees returned first) or american (deal-by-deal)', { 0: { input: fund.waterfall, fmt: '@' } });
    I.line('f_off', 'Monitoring-fee offset against the management fee', { 0: { input: fund.fee_offset_pct, fmt: FMT_PCT } });
  }
  const v = a.valuation;
  const val = o.valuation;
  if (v && val) {
    I.section('7. Valuation — flow to equity (CAPM)');
    I.line('rf', 'Risk-free rate', { 0: { input: v.risk_free, fmt: FMT_PCT } });
    I.line('mrp', 'Market risk premium', { 0: { input: v.mrp, fmt: FMT_PCT } });
    I.line('beta_a', 'Asset beta', { 0: { input: v.asset_beta, fmt: '0.000' } });
    I.line('beta_d', 'Debt beta (0 = riskless debt)', { 0: { input: v.debt_beta, fmt: '0.000' } });
    I.line('g_lr', 'Long-run growth after the exit', { 0: { input: v.long_run_growth, fmt: FMT_PCT } });
    // §28 [v2.6.0]: the terminal year stated in steady state — live inputs the year N+1 FCF reads.
    if (v.terminal) {
      I.line('term_capex', 'Terminal capex ÷ D&A (1.00 = spend what wears out)', { 0: { input: v.terminal.capex_pct_of_da, fmt: '0.000' } });
      I.line('term_nwc', 'Terminal increase in NWC, before growth into year N+1 (negative = an inflow)', { 0: { input: v.terminal.delta_nwc_before_growth } });
    }
    I.line('timing', 'Leverage timing for the cost of equity (structural)', { 0: { input: v.leverage_timing === 'end_of_year' ? 'end of year' : 'start of year', fmt: '@' } });
    I.section('8. Break-evens (engine-solved; Goal Seek targets after you change inputs)');
    const be = val.break_evens;
    const beRow = (key: string, label: string, b: { value: number | null; reason: string | null }, fmt: string) =>
      I.line(key, label, { 0: { input: b.value ?? '', fmt } }, { note: b.value === null ? `Not defined — ${b.reason}` : 'Solved by the deal engine. Re-solve with Goal Seek if you change any input.' });
    beRow('be_mult', 'Break-even exit multiple, exit (a)', be.exit_multiple, FMT_MULT);
    beRow('be_beta', 'Break-even asset beta, exit (b)', be.asset_beta, '0.0000');
    beRow('be_g', 'Break-even long-run growth, exit (b)', be.long_run_growth, FMT_PCT);
  }

  // ═══════════════════════════════ MODEL ═══════════════════════════════
  M.title(`${a.deal_name} — LBO model`, [
    `${ccy} millions unless stated. Black = formula on the Inputs sheet. Green = answer.`,
    'Conventions: interest on the opening balance (no circularity); tax after interest; flows at year end; sweep after mandatory amortization.',
  ]);
  const op = o.operating;
  M.section('1. Operating forecast');
  M.header({ 0: 'Close', ...years(1, N) });
  M.line('year', 'Year', Object.fromEntries(range(N + 1, 0).map((t) => [t, { f: `${t}`, v: t, fmt: FMT_YEAR }])), { italic: true, noParity: true });
  const yr = (t: number) => m('year', t);
  const lineF = (key: string, spec: LineSpec, t: number, rowKey: string): string =>
    spec.mode === 'explicit' ? iy(key, t) : t === 1 ? iy(`${key}_y1`, 1) : `${m(rowKey, t - 1)}*(1+${iy(`${key}_g`, t)})`;

  if (revModelled) {
    if (!lines?.revenue) {
      M.line('rev', 'Revenue  =  prior × (1 + growth)', {
        0: { f: iv('ltm_revenue'), v: f.fy_revenue },
        ...per(1, N, (t) => ({ f: `${m('rev', t - 1)}*(1+${iy('g', t)})`, v: op[t - 1].revenue })),
      });
    } else {
      M.line('rev', 'Revenue', per(1, N, (t) => ({ f: lineF('rev', lines.revenue as LineSpec, t, 'rev'), v: op[t - 1].revenue })));
    }
  }
  if (!lines?.da) M.line('da', 'Depreciation & amortization  =  % × revenue', per(1, N, (t) => ({ f: `${iv('da_pct')}*${m('rev', t)}`, v: op[t - 1].da })));
  else M.line('da', 'Depreciation & amortization', per(1, N, (t) => ({ f: lineF('da', lines.da!, t, 'da'), v: op[t - 1].da })));
  if (!lines?.ebitda) {
    M.line('w', '   margin-path weight  w(t) ÷ w(N)', per(1, N, (t) => ({
      f: `IF(${iv('margin_path')}="front_loaded",SQRT(${yr(t)})/SQRT(${iv('hold')}),IF(${iv('margin_path')}="back_loaded",(${yr(t)}/${iv('hold')})^2,${yr(t)}/${iv('hold')}))`,
      v: null, fmt: FMT_NUM,
    })), { italic: true, noParity: true });
    M.line('margin', 'EBITDA margin  =  base + (target − base) × weight', {
      0: { f: `${iv(linked.forecast ? 'ltm_ebitda_fc' : 'ltm_ebitda')}/${iv('ltm_revenue')}`, v: f.fy_ebitda_margin, fmt: FMT_PCT },
      ...per(1, N, (t) => ({ f: `${m('margin', 0, true)}+(${iv('target_margin')}-${m('margin', 0, true)})*${m('w', t)}`, v: op[t - 1].margin, fmt: FMT_PCT })),
    });
    M.line('ebitda', 'EBITDA  =  revenue × margin', per(1, N, (t) => ({ f: `${m('rev', t)}*${m('margin', t)}`, v: op[t - 1].ebitda })), { bold: true });
  } else if (lines.ebitda.measure === 'ebit') {
    M.line('ebit_given', 'EBIT (as the case states it)', per(1, N, (t) => ({ f: lineF('ebx', lines.ebitda!, t, 'ebit_given'), v: op[t - 1].ebit })));
    M.line('ebitda', 'EBITDA  =  EBIT + D&A', per(1, N, (t) => ({ f: `${m('ebit_given', t)}+${m('da', t)}`, v: op[t - 1].ebitda })), { bold: true });
  } else {
    M.line('ebitda', 'EBITDA', per(1, N, (t) => ({ f: lineF('ebx', lines.ebitda!, t, 'ebitda'), v: op[t - 1].ebitda })), { bold: true });
  }
  if (revModelled && lines?.ebitda) M.line('margin', 'EBITDA margin', per(1, N, (t) => ({ f: `IF(${m('rev', t)}=0,"N/A",${m('ebitda', t)}/${m('rev', t)})`, v: op[t - 1].margin, fmt: FMT_PCT })));
  // §7/§9 monitoring fee: off EBITDA in years 1…N−1, dropped in the exit year (the accelerated
  // termination replaces it at exit — no double count). EBITDA_adj drives tax, FCF and credit.
  const ea = (t: number) => (mon ? m('ebitda_adj', t) : m('ebitda', t));
  if (mon) {
    M.line('mon_fee', 'Sponsor monitoring fee (none in the exit year)', per(1, N, (t) => ({ f: t === N ? '0' : iv('mon_annual'), v: op[t - 1].ebitda - op[t - 1].ebitda_adj })));
    M.line('ebitda_adj', 'EBITDA after the monitoring fee', per(1, N, (t) => ({ f: `${m('ebitda', t)}-${m('mon_fee', t)}`, v: op[t - 1].ebitda_adj })), { bold: true });
  }
  M.line('ebit', `EBIT  =  EBITDA${mon ? ' after fee' : ''} − D&A`, per(1, N, (t) => ({ f: `${ea(t)}-${m('da', t)}`, v: op[t - 1].ebit })));
  if (!lines?.capex) {
    M.line('capex', 'Capex  =  maintenance % × revenue + growth capex', per(1, N, (t) => ({ f: `${iv('capex_pct')}*${m('rev', t)}+${iy('gcapex', t)}`, v: op[t - 1].maint_capex + op[t - 1].growth_capex })));
  } else if (lines.capex.mode === 'pct_of_da') {
    M.line('capex', 'Capex  =  k × D&A', per(1, N, (t) => ({ f: `${iv('capex_da')}*${m('da', t)}`, v: op[t - 1].maint_capex })));
  } else {
    M.line('capex', 'Capital expenditure', per(1, N, (t) => ({ f: lineF('capex', lines.capex as LineSpec, t, 'capex'), v: op[t - 1].maint_capex })));
  }
  if (!lines?.delta_nwc) {
    const bal = (revRef: string, marginRef: string) =>
      ops.nwc.method === 'pct'
        ? `${iv('nwc_pct')}*${revRef}`
        : `${iv('dso')}/365*${revRef}+(${iv('dio')}-${iv('dpo')})/365*${revRef}*(1-${marginRef})`;
    M.line('nwc', `Operating NWC (balance)  =  ${ops.nwc.method === 'pct' ? '% × revenue' : 'receivables + inventory − payables (days)'}`, {
      0: { f: bal(iv('ltm_revenue'), `${iv('ltm_ebitda')}/${iv('ltm_revenue')}`), v: o.balance_sheet[0].operating_nwc },
      ...per(1, N, (t) => ({ f: bal(m('rev', t), m('margin', t)), v: op[t - 1].nwc_balance })),
    });
    M.line('dnwc', 'Increase in NWC', per(1, N, (t) => ({ f: `${m('nwc', t)}-${m('nwc', t - 1)}`, v: op[t - 1].delta_nwc })));
  } else {
    M.line('dnwc', 'Increase in NWC', per(1, N, (t) => ({ f: lineF('dnwc', lines.delta_nwc!, t, 'dnwc'), v: op[t - 1].delta_nwc })));
    M.line('nwc', 'Operating NWC (balance)  =  prior + increase', {
      0: { f: iv('nwc0'), v: o.balance_sheet[0].operating_nwc },
      ...per(1, N, (t) => ({ f: `${m('nwc', t - 1)}+${m('dnwc', t)}`, v: op[t - 1].nwc_balance })),
    });
  }

  // ── Sources & uses ──
  M.section('2. Sources & uses at close');
  const su = o.sources_uses;
  M.line('entry_basis_ebitda', 'EBITDA the entry multiple applies to (FY, or forecast year 1 under NTM)', {
    0: { f: `IF(${iv('entry_basis')}="FY",${f.fy_ebitda !== null ? iv('ltm_ebitda') : 'NA()'},${m('ebitda', 1)})`, v: o.derived.entry_ebitda_for_valuation },
  });
  if (a.entry.driver === 'ev') {
    M.line('ev', 'Enterprise value (the purchase price)', { 0: { f: iv('entry_ev'), v: su.enterprise_value } }, { bold: true });
    M.line('entry_mult', 'Entry multiple  =  EV ÷ basis EBITDA', { 0: { f: `${m('ev', 0)}/${m('entry_basis_ebitda', 0)}`, v: o.derived.entry_multiple, fmt: FMT_MULT } });
  } else {
    M.line('entry_mult', 'Entry multiple', { 0: { f: iv('entry_mult'), v: o.derived.entry_multiple, fmt: FMT_MULT } });
    M.line('ev', 'Enterprise value  =  multiple × basis EBITDA', { 0: { f: `${m('entry_mult', 0)}*${m('entry_basis_ebitda', 0)}`, v: su.enterprise_value } }, { bold: true });
  }
  const sizeF = (xKey: string, amtKey: string, isX: boolean) => (isX ? `${iv(xKey)}*${iv('ltm_ebitda')}` : iv(amtKey));
  terms.forEach((t, i) => {
    M.line(`${tk[i]}_par`, `${t.name}: par at close`, { 0: { f: sizeF(`${tk[i]}_x`, `${tk[i]}_amt`, t.size.x_ebitda !== undefined), v: su.debt_at_par[i].amount } });
  });
  // The commitment has no ModelOutput field of its own; it is verified TRANSITIVELY through the
  // commitment-fee and financing-fee rows (both parity-mapped), never reconstructed here.
  if (revolver) M.line('rcf_commit', `${revolver.name}: commitment`, { 0: { f: sizeF('rcf_x', 'rcf_amt', revolver.commitment.x_ebitda !== undefined), v: null } }, { noParity: true });
  const sumOf = (keys: string[], t: number) => (keys.length ? keys.map((k) => m(k, t)).join('+') : '0');
  M.line('total_par', 'Total debt at par', { 0: { f: sumOf(tk.map((k) => `${k}_par`), 0), v: o.derived.total_debt_at_par } }, { bold: true });
  M.line('commitments', 'Total commitments  =  debt at par + revolver commitment', { 0: { f: `${m('total_par', 0)}${revolver ? `+${m('rcf_commit', 0)}` : ''}`, v: null } }, { noParity: true });
  M.line('txn', 'Transaction costs  =  % × EV', { 0: { f: `${iv('txn_pct')}*${m('ev', 0)}`, v: su.transaction_costs } });
  M.line('fin_fees', 'Financing fees  =  % × total commitments', { 0: { f: `${iv('fin_pct')}*${m('commitments', 0)}`, v: su.financing_fees } });
  terms.forEach((t, i) => {
    M.line(`${tk[i]}_oid_amt`, `${t.name}: OID funded  =  par × OID %`, { 0: { f: `${m(`${tk[i]}_par`, 0)}*${iv(`${tk[i]}_oid`)}`, v: su.debt_at_par[i].amount * t.oid_pct } });
  });
  M.line('oid', 'OID funded (total)', { 0: { f: sumOf(tk.map((k) => `${k}_oid_amt`), 0), v: su.oid_funded } });
  M.line('cash_bs', 'Cash to the balance sheet (the minimum cash)', { 0: { f: iv('min_cash'), v: su.cash_to_balance_sheet } });
  M.line('uses', 'Total uses', { 0: { f: `${m('ev', 0)}+${m('txn', 0)}+${m('fin_fees', 0)}+${m('oid', 0)}+${m('cash_bs', 0)}`, v: su.total_uses } }, { bold: true });
  M.line('rollover', 'Rollover equity', { 0: { f: iv('rollover'), v: su.rollover_equity } });
  // §22.8: the management subscription is its own source; the sponsor plug is the residual after it
  if (sweet) M.line('mgmt_sub', 'Management subscription (sweet equity)', { 0: { f: iv('se_sub'), v: su.management_subscription } });
  const subTerm = sweet ? `-${m('mgmt_sub', 0)}` : '';
  M.line('sponsor', `Sponsor equity  =  uses − debt − rollover${sweet ? ' − management subscription' : ''} (the plug)`, { 0: { f: `${m('uses', 0)}-${m('total_par', 0)}-${m('rollover', 0)}${subTerm}`, v: su.sponsor_equity } }, { answer: true });
  M.line('sources', 'Total sources', { 0: { f: `${m('total_par', 0)}+${m('rollover', 0)}+${m('sponsor', 0)}${sweet ? `+${m('mgmt_sub', 0)}` : ''}`, v: su.total_sources } }, { bold: true });
  M.line('equity_total', `Total equity invested  =  sponsor + rollover${sweet ? ' + management' : ''}`, { 0: { f: `${m('sponsor', 0)}+${m('rollover', 0)}${sweet ? `+${m('mgmt_sub', 0)}` : ''}`, v: su.sponsor_equity + su.rollover_equity + su.management_subscription } });
  if (sweet) {
    M.line('ln0', 'Loan notes subscribed by the institution  =  (1 − ordinary %) × sponsor equity', { 0: { f: `(1-${iv('se_p')})*${m('sponsor', 0)}`, v: o.equity_strip!.loan_notes_subscribed } });
    M.line('inst_ord_sub', '   institutional ordinaries subscribed  =  sponsor equity − loan notes', { 0: { f: `${m('sponsor', 0)}-${m('ln0', 0)}`, v: null } }, { italic: true, noParity: true });
  }

  // ── Fee & OID amortization ──
  M.section('3. Financing fees and OID — straight-line over each maturity; written off when a tranche is fully repaid, and at exit');
  M.header(years(1, N));
  type Amortee = { key: string; name: string; isRevolver: boolean };
  const amortees: Amortee[] = [...terms.map((t, i) => ({ key: tk[i], name: t.name, isRevolver: false })), ...(revolver ? [{ key: 'rcf', name: revolver.name, isRevolver: true }] : [])];
  const oidAmKeys: string[] = [];
  const feeAmKeys: string[] = [];
  const afterKeysByAmortee = new Map<string, string[]>();
  for (const am of amortees) {
    const commitRef = am.isRevolver ? m('rcf_commit', 0, true) : m(`${am.key}_par`, 0, true);
    M.line(`${am.key}_fee_alloc`, `${am.name}: financing fee allocated (pro rata to commitment)`, {
      0: { f: `IF(${m('commitments', 0, true)}>0,${m('fin_fees', 0, true)}*${commitRef}/${m('commitments', 0, true)},0)`, v: null },
    }, { noParity: true });
    const afterKeys: string[] = [];
    for (const kind of (am.isRevolver ? ['fee'] : ['oid', 'fee']) as ('oid' | 'fee')[]) {
      const amount = kind === 'oid' ? m(`${am.key}_oid_amt`, 0, true) : m(`${am.key}_fee_alloc`, 0, true);
      const word = kind === 'oid' ? 'OID' : 'fee';
      const remKey = `${am.key}_${kind}_rem`;
      const amKey = `${am.key}_${kind}_am`;
      const afterKey = `${am.key}_${kind}_after`;
      const refi = am.isRevolver ? null : refiOf(am.name);
      const isR = (t: number) => `${yr(t)}=${iv(`${am.key}_rf_y`)}`;
      const post = (t: number) => `${yr(t)}>=${iv(`${am.key}_rf_y`)}`;
      // §18.3: from the refinancing year the schedule is the NEW incarnation's — amount = new % ×
      // the refinanced balance, horizon = the new maturity, restarting at the full new amount.
      const amtKey = `${am.key}_${kind}_amt_y`;
      if (refi) {
        M.line(amtKey, `${am.name}: ${word} being amortized (new ${word} from the refinancing year)`, per(1, N, (t) => ({
          // year 1 has no prior column: there "after the refinancing" can only mean "is the refinancing year"
          f: t === 1
            ? `IF(${isR(t)},${iv(`${am.key}_rf_${kind}`)}*${m(`${am.key}_open`, t)},${amount})`
            : `IF(${isR(t)},${iv(`${am.key}_rf_${kind}`)}*${m(`${am.key}_open`, t)},IF(${post(t)},${m(amtKey, t - 1)},${amount}))`,
          v: null,
        })), { italic: true, noParity: true });
      }
      const amt = (t: number) => (refi ? m(amtKey, t) : amount);
      const prevRem = (t: number) => {
        const carried = t === 1 ? amount : m(remKey, t - 1);
        return refi ? `IF(${isR(t)},${m(amtKey, t)},${carried})` : carried;
      };
      const mat = (t: number) => (refi ? `IF(${post(t)},${iv(`${am.key}_rf_mat`)},${iv(`${am.key}_mat`)})` : iv(`${am.key}_mat`));
      M.line(amKey, `${am.name}: ${word} amortization`, per(1, N, (t) => ({ f: `IF(${amt(t)}>0,MIN(${prevRem(t)},${amt(t)}/${mat(t)}),0)`, v: null })), { italic: true, noParity: true });
      M.line(afterKey, `${am.name}: ${word} remaining after amortization`, per(1, N, (t) => ({ f: `${prevRem(t)}-${m(amKey, t)}`, v: null })), { italic: true, noParity: true });
      M.line(remKey, `${am.name}: ${word} remaining at year end (0 once written off)`, per(1, N, (t) => ({
        f: t === N ? '0' : am.isRevolver ? m(afterKey, t) : `IF(${m(`${am.key}_retired`, t)},0,${m(afterKey, t)})`, v: null,
      })), { italic: true, noParity: true });
      (kind === 'oid' ? oidAmKeys : feeAmKeys).push(amKey);
      afterKeys.push(afterKey);
    }
    afterKeysByAmortee.set(am.key, afterKeys);
    const refi = am.isRevolver ? null : refiOf(am.name);
    if (refi) {
      const i = terms.findIndex((t) => t.name === am.name);
      const rows = o.tranches[i];
      const isR = (t: number) => `${yr(t)}=${iv(`${am.key}_rf_y`)}`;
      const remPrev = (t: number, kind: 'oid' | 'fee') => (t === 1 ? (kind === 'oid' ? m(`${am.key}_oid_amt`, 0, true) : m(`${am.key}_fee_alloc`, 0, true)) : m(`${am.key}_${kind}_rem`, t - 1));
      M.line(`${am.key}_rf_wo`, `${am.name}: old OID + fees written off at refinancing (book)`, per(1, N, (t) => ({ f: `IF(${isR(t)},${remPrev(t, 'oid')}+${remPrev(t, 'fee')},0)`, v: rows[t - 1].unamortized_writeoff })));
      // §18.5 [v2.4.0] the OID part of the write-off is repurchase premium (§163(j) interest)
      M.line(`${am.key}_rf_wo_oid`, `${am.name}:    of which old OID (repurchase premium — interest for tax)`, per(1, N, (t) => ({ f: `IF(${isR(t)},${remPrev(t, 'oid')},0)`, v: null })), { italic: true, noParity: true });
      M.line(`${am.key}_rf_premium`, `${am.name}: call premium`, per(1, N, (t) => ({ f: `IF(${isR(t)},${iv(`${am.key}_rf_prem`)}*${m(`${am.key}_open`, t)},0)`, v: null })), { noParity: true });
      M.line(`${am.key}_rf_cost`, `${am.name}: refinancing cash cost  =  premium + new OID + new fees`, per(1, N, (t) => ({
        f: `IF(${isR(t)},(${iv(`${am.key}_rf_prem`)}+${iv(`${am.key}_rf_oid`)}+${iv(`${am.key}_rf_fee`)})*${m(`${am.key}_open`, t)},0)`, v: rows[t - 1].refinancing_cash_cost,
      })));
      M.line(`${am.key}_rf_newcap`, `${am.name}: new OID + fees capitalized`, per(1, N, (t) => ({ f: `IF(${isR(t)},(${iv(`${am.key}_rf_oid`)}+${iv(`${am.key}_rf_fee`)})*${m(`${am.key}_open`, t)},0)`, v: null })), { noParity: true });
    }
  }
  const refis = amortees.filter((am) => !am.isRevolver && refiOf(am.name));
  const refiSum = (suffix: string, t: number) => sumOf(refis.map((am) => `${am.key}_${suffix}`), t);
  M.line('oid_am', 'OID amortization (total) — capped interest for tax', per(1, N, (t) => ({ f: sumOf(oidAmKeys, t), v: op[t - 1].oid_amortization })));
  M.line('fee_am', 'Financing-fee amortization (total) — an uncapped deduction', per(1, N, (t) => ({ f: sumOf(feeAmKeys, t), v: op[t - 1].financing_fee_amortization })));
  const allAfter = [...afterKeysByAmortee.values()].flat();
  M.line('book_wo', 'Unamortized fees/OID written off (book): retired tranches; everything at exit', per(1, N, (t) => ({
    f: t === N
      ? sumOf(allAfter, t)
      : amortees.filter((am) => !am.isRevolver).map((am) => `IF(${m(`${am.key}_retired`, t)},${sumOf(afterKeysByAmortee.get(am.key)!, t)},0)`).join('+') || '0',
    v: t === N ? o.exit.unamortized_fees_written_off : null,
  })), { noParity: false });
  // only the exit-year book write-off has a ModelOutput counterpart
  for (let t = 1; t < N; t++) {
    const idx = parity.findIndex((p) => p.sheet === 'Model' && p.addr === `${Y(t)}${M.rows.get('book_wo')}`);
    if (idx >= 0) parity.splice(idx, 1);
  }
  // §7.1 [v2.4.0] the TAX deduction for debt retired or refinanced, by CHARACTER: unamortized OID
  // and any call premium are repurchase premium — §163(j) INTEREST (capped pool); unamortized
  // debt-issuance costs are not interest (uncapped pool). Timing: the exit and a scheduled
  // refinancing deduct in their own year; a sweep-driven early retirement deducts the year after
  // (the retirement is that year's own cash outcome — a same-year deduction would be circular).
  const oidAfter = amortees.filter((am) => !am.isRevolver).map((am) => `${am.key}_oid_after`);
  M.line('book_wo_oid', '   of which unamortized OID', per(1, N, (t) => ({
    f: t === N
      ? sumOf(oidAfter, t)
      : amortees.filter((am) => !am.isRevolver).map((am) => `IF(${m(`${am.key}_retired`, t)},${m(`${am.key}_oid_after`, t)},0)`).join('+') || '0',
    v: null,
  })), { italic: true, noParity: true });
  M.line('tax_wo_int', 'Repurchase premium deductible this year (interest, capped)  =  OID of prior-year retirements (+ exit OID) + refinancing: old OID + call premium', per(1, N, (t) => ({
    f: `${t > 1 ? m('book_wo_oid', t - 1) : '0'}${t === N ? `+${m('book_wo_oid', t)}` : ''}${refis.length ? `+${refiSum('rf_wo_oid', t)}+${refiSum('rf_premium', t)}` : ''}`, v: null,
  })), { noParity: true });
  M.line('tax_wo_fee', 'Debt-issuance costs deductible this year (not interest, uncapped)  =  fees of prior-year retirements (+ exit fees) + refinancing: old fees', per(1, N, (t) => ({
    f: `${t > 1 ? `${m('book_wo', t - 1)}-${m('book_wo_oid', t - 1)}` : '0'}${t === N ? `+${m('book_wo', t)}-${m('book_wo_oid', t)}` : ''}${refis.length ? `+${refiSum('rf_wo', t)}-${refiSum('rf_wo_oid', t)}` : ''}`, v: null,
  })), { noParity: true });

  // ── Debt & waterfall ──
  M.section('4. Debt schedule and cash waterfall — order: interest → mandatory amortization → revolver → sweep → draw');
  M.header({ 0: 'Close', ...years(1, N) });
  const priorities = [...new Set(terms.filter((t) => t.sweep.participates).map((t) => t.sweep.priority))].sort((x, y) => x - y);
  terms.forEach((t, i) => {
    const k = tk[i];
    const rows = o.tranches[i];
    M.note(t.name);
    M.line(`${k}_open`, `${t.name}: opening balance`, per(1, N, (tt) => ({ f: tt === 1 ? m(`${k}_par`, 0) : m(`${k}_close`, tt - 1), v: rows[tt - 1].beginning_balance })));
    const oldRate = t.type === 'pik_note' ? iv(`${k}_cash`) : t.pricing.kind === 'fixed' ? iv(`${k}_rate`) : `(MAX(${iv(`${k}_base`)},${iv(`${k}_floor`)})+${iv(`${k}_spread`)})`;
    const ev = refiOf(t.name);
    const newRate = ev ? (ev.new_pricing.kind === 'fixed' ? iv(`${k}_rf_rate`) : `(MAX(${iv(`${k}_rf_base`)},${iv(`${k}_rf_floor`)})+${iv(`${k}_rf_spread`)})`) : '';
    // §18.3: the new pricing applies for the WHOLE refinancing year onward
    const rateAt = (tt: number) => (ev ? `IF(${yr(tt)}>=${iv(`${k}_rf_y`)},${newRate},${oldRate})` : oldRate);
    if (ev) {
      M.line(`${k}_rf_face`, `${t.name}: refinanced face (the opening balance in the refinancing year)`, per(1, N, (tt) => ({
        f: `IF(${yr(tt)}=${iv(`${k}_rf_y`)},${m(`${k}_open`, tt)},${tt === 1 ? '0' : m(`${k}_rf_face`, tt - 1)})`, v: null,
      })), { italic: true, noParity: true });
    }
    // §20 PIK toggle: a WHOLE-coupon election each year — 'cash' pays the cash coupon with no
    // accrual; 'pik' accrues the PIK coupon with no cash. No election ⇒ the fixed note pays both.
    const toggled = t.type === 'pik_note' && t.elections !== null;
    const cashF = (tt: number) => (toggled ? `IF(${iy(`${k}_el`, tt)}="cash",${m(`${k}_open`, tt)}*${oldRate},0)` : `${m(`${k}_open`, tt)}*${rateAt(tt)}`);
    const pikF = (tt: number) => (t.type !== 'pik_note' ? '0' : toggled ? `IF(${iy(`${k}_el`, tt)}="pik",${m(`${k}_open`, tt)}*${iv(`${k}_pik`)},0)` : `${m(`${k}_open`, tt)}*${iv(`${k}_pik`)}`);
    M.line(`${k}_int`, `${t.name}: cash interest  =  rate × opening balance${toggled ? ' (cash years)' : ''}`, per(1, N, (tt) => ({ f: cashF(tt), v: rows[tt - 1].cash_interest })));
    M.line(`${k}_pik`, `${t.name}: PIK accrual  =  PIK coupon × opening balance${toggled ? ' (PIK years)' : ''}`, per(1, N, (tt) => ({ f: pikF(tt), v: rows[tt - 1].pik_accrual })));
    M.line(`${k}_out`, `${t.name}: outstanding before repayment  =  opening + PIK`, per(1, N, (tt) => ({ f: `${m(`${k}_open`, tt)}+${m(`${k}_pik`, tt)}`, v: null })), { italic: true, noParity: true });
    M.line(`${k}_mand`, `${t.name}: mandatory amortization  =  MIN(% × original face, outstanding)`, per(1, N, (tt) => ({
      f: ev
        ? `MIN(IF(${yr(tt)}>=${iv(`${k}_rf_y`)},${iv(`${k}_rf_amort`)}*${m(`${k}_rf_face`, tt)},${iv(`${k}_amort`)}*${m(`${k}_par`, 0, true)}),MAX(0,${m(`${k}_out`, tt)}))`
        : `MIN(${iv(`${k}_amort`)}*${m(`${k}_par`, 0, true)},MAX(0,${m(`${k}_out`, tt)}))`,
      v: rows[tt - 1].mandatory_amort,
    })));
    M.line(`${k}_cap`, `${t.name}: room for the sweep  =  outstanding − mandatory`, per(1, N, (tt) => ({ f: t.sweep.participates ? `MAX(0,${m(`${k}_out`, tt)}-${m(`${k}_mand`, tt)})` : '0', v: null })), { italic: true, noParity: true });
  });
  if (revolver && o.revolver) {
    const rr = o.revolver;
    M.note(`${revolver.name} (revolver)`);
    M.line('rcf_open', `${revolver.name}: opening drawn`, per(1, N, (t) => ({ f: t === 1 ? '0' : m('rcf_close', t - 1), v: rr[t - 1].beginning_drawn })));
    const rrate = revolver.pricing.kind === 'fixed' ? iv('rcf_rate') : `(MAX(${iv('rcf_base')},${iv('rcf_floor')})+${iv('rcf_spread')})`;
    M.line('rcf_int', `${revolver.name}: interest on the opening drawn balance`, per(1, N, (t) => ({ f: `${m('rcf_open', t)}*${rrate}`, v: rr[t - 1].cash_interest })));
    M.line('rcf_cfee', `${revolver.name}: commitment fee on the opening undrawn amount`, per(1, N, (t) => ({ f: `(${m('rcf_commit', 0, true)}-${m('rcf_open', t)})*${iv('rcf_fee')}`, v: rr[t - 1].commitment_fee })));
  }
  const wf = o.waterfall;
  M.note('Cash waterfall');
  M.line('cash_open', 'Opening cash', per(1, N, (t) => ({ f: t === 1 ? m('cash_bs', 0) : m('cash_close', t - 1), v: wf[t - 1].opening_cash })));
  M.line('fcf', 'Free cash flow before debt service  =  EBITDA − cash tax − capex − ΔNWC', per(1, N, (t) => ({ f: `${ea(t)}-${m('cash_tax', t)}-${m('capex', t)}-${m('dnwc', t)}`, v: op[t - 1].fcf_pre_debt })), { bold: true });
  const intKeys = [...tk.map((k) => `${k}_int`), ...(revolver ? ['rcf_int'] : [])];
  M.line('int_total', 'Cash interest (total)', per(1, N, (t) => ({ f: sumOf(intKeys, t), v: wf[t - 1].cash_interest_total })));
  M.line('cfee_total', 'Commitment fees', per(1, N, (t) => ({ f: revolver ? m('rcf_cfee', t) : '0', v: wf[t - 1].commitment_fees })));
  M.line('mand_total', 'Mandatory amortization (total)', per(1, N, (t) => ({ f: sumOf(tk.map((k) => `${k}_mand`), t), v: wf[t - 1].mandatory_amort_total })));
  M.line('cash_a', '   cash after interest, fees and mandatory amortization', per(1, N, (t) => ({ f: `${m('cash_open', t)}+${m('fcf', t)}-${m('int_total', t)}-${m('cfee_total', t)}${refis.length ? `-${refiSum('rf_cost', t)}` : ''}-${m('mand_total', t)}`, v: null })), { italic: true, noParity: true });
  M.line('rcf_repay', 'Revolver repayment  =  MIN(drawn, cash above the minimum)', per(1, N, (t) => ({ f: revolver ? `MIN(${m('rcf_open', t)},MAX(0,${m('cash_a', t)}-${iv('min_cash')}))` : '0', v: wf[t - 1].revolver_repayment })));
  M.line('pool', 'Sweep pool  =  MAX(0, cash − minimum)', per(1, N, (t) => ({ f: `MAX(0,${m('cash_a', t)}-${m('rcf_repay', t)}-${iv('min_cash')})`, v: wf[t - 1].sweep_pool })));
  if (grid) {
    const termOpen = (t: number) => [...tk.map((k) => m(`${k}_open`, t)), ...(revolver ? [m('rcf_open', t)] : [])].join('+') || '0';
    M.line('sw_lev', '   opening net leverage for the sweep  =  (opening debt − opening cash) ÷ EBITDA', per(1, N, (t) => ({
      f: `IF(${ea(t)}>0,(${termOpen(t)}-${m('cash_open', t)})/${ea(t)},1E+300)`, v: null, fmt: FMT_MULT,
    })), { italic: true, noParity: true });
    const pick = (t: number) => gridTiers.reduceRight((inner, _tier, j) => `IF(${m('sw_lev', t)}>${iv(`sg${j}_lev`)},${iv(`sg${j}_pct`)},${inner})`, iv('sg_else'));
    M.line('sw_pct', 'Sweep % applied (first tier whose threshold is exceeded)', per(1, N, (t) => ({ f: pick(t), v: wf[t - 1].sweep_pct_applied, fmt: FMT_PCT })));
  }
  M.line('sweepable', 'Available to sweep  =  sweep % × pool', per(1, N, (t) => ({ f: `${grid ? m('sw_pct', t) : iv('sweep_pct')}*${m('pool', t)}`, v: wf[t - 1].sweep_pct_applied * wf[t - 1].sweep_pool })));
  priorities.forEach((p, pi) => {
    const members = terms.map((t, i) => ({ t, i })).filter(({ t }) => t.sweep.participates && t.sweep.priority === p);
    const before = (t: number) => (pi === 0 ? m('sweepable', t) : m(`tier${pi - 1}_rem`, t));
    M.line(`tier${pi}_cap`, `   sweep priority ${p}: room in this tier`, per(1, N, (t) => ({ f: members.map(({ i }) => m(`${tk[i]}_cap`, t)).join('+'), v: null })), { italic: true, noParity: true });
    M.line(`tier${pi}_alloc`, `   sweep priority ${p}: allocated`, per(1, N, (t) => ({ f: `IF(${m(`tier${pi}_cap`, t)}<=0,0,MIN(MAX(0,${before(t)}),${m(`tier${pi}_cap`, t)}))`, v: null })), { italic: true, noParity: true });
    M.line(`tier${pi}_rem`, `   sweep priority ${p}: left for lower priorities`, per(1, N, (t) => ({ f: `${before(t)}-${m(`tier${pi}_alloc`, t)}`, v: null })), { italic: true, noParity: true });
  });
  terms.forEach((t, i) => {
    const k = tk[i];
    const pi = priorities.indexOf(t.sweep.priority);
    M.line(`${k}_sweep`, `${t.name}: sweep repayment (pro rata within its priority)`, per(1, N, (tt) => ({
      f: t.sweep.participates
        ? `IF(${m(`tier${pi}_cap`, tt)}<=0,0,IF(${m(`tier${pi}_alloc`, tt)}=${m(`tier${pi}_cap`, tt)},${m(`${k}_cap`, tt)},MIN(${m(`tier${pi}_alloc`, tt)}*${m(`${k}_cap`, tt)}/${m(`tier${pi}_cap`, tt)},${m(`${k}_cap`, tt)})))`
        : '0',
      v: o.tranches[i][tt - 1].sweep_repayment,
    })));
    M.line(`${k}_close`, `${t.name}: closing balance`, {
      0: { f: m(`${k}_par`, 0), v: su.debt_at_par[i].amount },
      ...per(1, N, (tt) => ({ f: `${m(`${k}_out`, tt)}-${m(`${k}_mand`, tt)}-${m(`${k}_sweep`, tt)}`, v: o.tranches[i][tt - 1].ending_balance })),
    }, { bold: true });
    M.line(`${k}_retired`, `${t.name}: fully repaid this year (opening > 0.005, closing ≤ 0.005)`, per(1, N, (tt) => ({ f: `AND(${m(`${k}_open`, tt)}>0.005,${m(`${k}_close`, tt)}<=0.005)`, v: null, fmt: 'General' })), { italic: true, noParity: true });
  });
  M.line('sweep_total', 'Sweep applied (total)', per(1, N, (t) => ({ f: sumOf(tk.map((k) => `${k}_sweep`), t), v: wf[t - 1].sweep_applied_total })));
  M.line('cash_b', '   cash after the sweep', per(1, N, (t) => ({ f: `${m('cash_a', t)}-${m('rcf_repay', t)}-${m('sweep_total', t)}`, v: null })), { italic: true, noParity: true });
  M.line('rcf_draw', 'Revolver draw  =  MIN(shortfall below the minimum, undrawn commitment)', per(1, N, (t) => ({
    f: revolver ? `IF(${m('cash_b', t)}<${iv('min_cash')}-1E-12,MIN(${iv('min_cash')}-${m('cash_b', t)},${m('rcf_commit', 0, true)}-(${m('rcf_open', t)}-${m('rcf_repay', t)})),0)` : '0',
    v: wf[t - 1].revolver_draw,
  })));
  if (revolver && o.revolver) {
    const rr = o.revolver;
    M.line('rcf_close', `${revolver.name}: closing drawn`, {
      0: { f: '0', v: 0 },
      ...per(1, N, (t) => ({ f: `${m('rcf_open', t)}-${m('rcf_repay', t)}+${m('rcf_draw', t)}`, v: rr[t - 1].ending_drawn })),
    }, { bold: true });
  }
  // §3 step 7 / §3.7: the distribution — after the draw; capped by cash above the minimum and,
  // when a trap is set, by the pro-forma net-leverage capacity. Blocked capacity never carries.
  const paid = (t: number) => (dists ? m('dist_paid', t) : '0');
  if (dists) {
    M.line('cash_c', '   cash before the distribution', per(1, N, (t) => ({ f: `${m('cash_b', t)}+${m('rcf_draw', t)}`, v: null })), { italic: true, noParity: true });
    if (trap) {
      M.line('rp_max', 'Trap capacity  =  MAX(0, cash − (debt − trap level × EBITDA))', per(1, N, (t) => ({
        f: `MAX(0,${m('cash_c', t)}-(${m('debt_close', t)}-${iv('rp_level')}*${ea(t)}))`, v: wf[t - 1].rp_max,
      })));
    }
    // §3.8: under the surplus policy the request IS the surplus — payout × the cash above the
    // floor — gated, when 'after_debt_repaid', on the year's closing debt (term + revolver)
    M.line('dist_req_m', surplusD ? 'Surplus offered to equity  =  payout × MAX(0, cash − minimum), once the gate is open' : 'Requested distribution', per(1, N, (t) => ({
      f: surplusD
        ? `IF(OR(${iv('sd_start')}="immediately",${m('debt_close', t)}<=0.005),${iv('sd_payout')}*MAX(0,${m('cash_c', t)}-${iv('min_cash')}),0)`
        : iy('dist_req', t),
      v: wf[t - 1].distribution_requested,
    })));
    M.line('dist_paid', 'Distribution paid  =  MAX(0, MIN(request, cash − minimum' + (trap ? ', trap capacity))' : '))'), per(1, N, (t) => ({
      f: `MAX(0,MIN(${m('dist_req_m', t)},${m('cash_c', t)}-${iv('min_cash')}${trap ? `,${m('rp_max', t)}` : ''}))`, v: wf[t - 1].distribution_paid,
    })), { bold: true });
  }
  M.line('cash_close', 'Closing cash', {
    0: { f: m('cash_bs', 0), v: su.cash_to_balance_sheet },
    ...per(1, N, (t) => ({ f: dists ? `${m('cash_c', t)}-${m('dist_paid', t)}` : `${m('cash_b', t)}+${m('rcf_draw', t)}`, v: wf[t - 1].closing_cash })),
  }, { bold: true });
  const debtKeys = [...tk.map((k) => `${k}_close`), ...(revolver ? ['rcf_close'] : [])];
  M.line('debt_close', 'Total debt at par (incl. accrued PIK and the drawn revolver)', Object.fromEntries(range(N + 1, 0).map((t) => [t, { f: sumOf(debtKeys, t), v: o.balance_sheet[t].debt_at_par }])), { bold: true });

  // ── Tax ──
  M.section('5. Tax — interest cap with an indefinite carryforward; acquired and post-close NOL pools; minimum tax');
  M.header(years(1, N));
  const tx = o.tax;
  const pikSum = (t: number) => sumOf(tk.map((k) => `${k}_pik`), t);
  M.line('ati', 'Adjusted taxable income (ATI)', per(1, N, (t) => ({ f: `IF(${iv('ati_basis')}="EBITDA",${ea(t)},${m('ebit', t)})`, v: tx[t - 1].ati })));
  M.line('capped', 'Capped interest pool  =  cash interest + PIK + OID amortization + repurchase premium on debt retired', per(1, N, (t) => ({ f: `${m('int_total', t)}+${pikSum(t)}+${m('oid_am', t)}+${m('tax_wo_int', t)}`, v: tx[t - 1].capped_interest_pool })));
  M.line('uncapped', 'Uncapped deductions  =  fee amortization + commitment fees + debt-issuance costs written off', per(1, N, (t) => ({ f: `${m('fee_am', t)}+${m('cfee_total', t)}+${m('tax_wo_fee', t)}`, v: tx[t - 1].uncapped_deductions })));
  const cfOpen = (t: number) => (t === 1 ? '0' : m('cf_end', t - 1));
  M.line('ded', 'Deductible interest  =  MIN(pool + carryforward, cap × ATI) when capped', per(1, N, (t) => ({
    f: `IF(NOT(${iv('int_ded')}),0,IF(NOT(${iv('s163j')}),${m('capped', t)}+${cfOpen(t)},MIN(${m('capped', t)}+${cfOpen(t)},MAX(0,${iv('ati_pct')}*${m('ati', t)}))))`,
    v: tx[t - 1].deductible_capped_interest,
  })));
  M.line('cf_end', 'Disallowed interest carried forward', per(1, N, (t) => ({ f: `IF(AND(${iv('int_ded')},${iv('s163j')}),${m('capped', t)}+${cfOpen(t)}-${m('ded', t)},0)`, v: tx[t - 1].s163j_carryforward_end })));
  M.line('taxable', 'Taxable income before NOLs  =  EBIT − deductible interest − uncapped deductions', per(1, N, (t) => ({ f: `${m('ebit', t)}-${m('ded', t)}-${m('uncapped', t)}`, v: tx[t - 1].taxable_before_nol })));
  const nolBlock = (prefix: string, taxableKey: string, label: string, expected: (t: number) => { acq: Val; pc: Val; acqEnd: Val; pcEnd: Val }) => {
    const acqOpen = (t: number) => (t === 1 ? iv('nol_acq') : m(`${prefix}acq_end`, t - 1));
    const pcOpen = (t: number) => (t === 1 ? '0' : m(`${prefix}pc_end`, t - 1));
    const np = expected(1).acq === null;
    M.line(`${prefix}acq_used`, `${label}acquired NOLs used (80% cap, or 100% if pre-2018; §382 limit)`, per(1, N, (t) => ({
      f: `IF(OR(${m(taxableKey, t)}<=0,NOT(${iv('nol_usable')})),0,MIN(${acqOpen(t)},IF(ISNUMBER(${iv('s382')}),${iv('s382')},${acqOpen(t)}),IF(${iv('nol_pre18')},1,0.8)*${m(taxableKey, t)}))`,
      v: expected(t).acq,
    })), { noParity: np, italic: np });
    M.line(`${prefix}pc_used`, `${label}post-close NOLs used (80% limitation)`, per(1, N, (t) => ({
      f: `IF(${m(taxableKey, t)}<=0,0,MIN(${pcOpen(t)},MAX(0,0.8*(${m(taxableKey, t)}-IF(${iv('nol_pre18')},${m(`${prefix}acq_used`, t)},0))-IF(${iv('nol_pre18')},0,${m(`${prefix}acq_used`, t)}))))`,
      v: expected(t).pc,
    })), { noParity: np, italic: np });
    M.line(`${prefix}acq_end`, `${label}acquired NOL pool at year end`, per(1, N, (t) => ({ f: `${acqOpen(t)}-${m(`${prefix}acq_used`, t)}`, v: expected(t).acqEnd })), { noParity: np, italic: np });
    M.line(`${prefix}pc_end`, `${label}post-close NOL pool at year end (losses banked)`, per(1, N, (t) => ({ f: `${pcOpen(t)}-${m(`${prefix}pc_used`, t)}+IF(${m(taxableKey, t)}<=0,-${m(taxableKey, t)},0)`, v: expected(t).pcEnd })), { noParity: np, italic: np });
  };
  nolBlock('', 'taxable', '', (t) => ({ acq: tx[t - 1].acquired_nol_used, pc: tx[t - 1].postclose_nol_used, acqEnd: tx[t - 1].acquired_nol_end, pcEnd: tx[t - 1].postclose_nol_end }));
  M.line('reg_tax', 'Regular tax  =  rate × (taxable − NOLs used)', per(1, N, (t) => ({ f: `IF(${m('taxable', t)}<=0,0,${iv('tax_rate')}*(${m('taxable', t)}-${m('acq_used', t)}-${m('pc_used', t)}))`, v: tx[t - 1].regular_tax })));
  M.line('min_tax', 'Minimum tax  =  minimum rate × taxable before NOLs', per(1, N, (t) => ({ f: `IF(${m('taxable', t)}<=0,0,${iv('min_tax')}*${m('taxable', t)})`, v: tx[t - 1].minimum_tax })));
  M.line('cash_tax', 'Cash tax  =  MAX(regular, minimum)', per(1, N, (t) => ({ f: `MAX(${m('reg_tax', t)},${m('min_tax', t)})`, v: tx[t - 1].cash_tax })), { bold: true });

  // ── Balance sheet ──
  M.section('6. Balance sheet — goodwill is the purchase-accounting plug at close');
  M.header({ 0: 'Close', ...years(1, N) });
  const bs = o.balance_sheet;
  M.line('ppe', 'Net PP&E  =  prior + capex − D&A', { 0: { f: iv('net_ppe'), v: bs[0].ppe }, ...per(1, N, (t) => ({ f: `${m('ppe', t - 1)}+${m('capex', t)}-${m('da', t)}`, v: bs[t].ppe })) });
  M.line('dfc', 'Deferred financing costs  =  prior − amortization − write-offs', {
    0: { f: `${m('fin_fees', 0)}+${m('oid', 0)}`, v: bs[0].deferred_financing_costs },
    ...per(1, N, (t) => ({ f: `${m('dfc', t - 1)}-${m('oid_am', t)}-${m('fee_am', t)}-${m('book_wo', t)}${refis.length ? `+${refiSum('rf_newcap', t)}-${refiSum('rf_wo', t)}` : ''}`, v: bs[t].deferred_financing_costs })),
  });
  M.line('goodwill', 'Goodwill (the plug at close, then constant)', {
    0: { f: `${m('debt_close', 0)}+${m('equity_total', 0)}-(${m('cash_close', 0)}+${m('nwc', 0)}+${m('ppe', 0)}+${m('dfc', 0)})`, v: bs[0].goodwill },
    ...per(1, N, (t) => ({ f: m('goodwill', t - 1), v: bs[t].goodwill })),
  });
  M.line('assets', 'Total assets', Object.fromEntries(range(N + 1, 0).map((t) => [t, { f: `${m('cash_close', t)}+${m('nwc', t)}+${m('ppe', t)}+${m('dfc', t)}+${m('goodwill', t)}`, v: bs[t].total_assets }])), { bold: true });
  M.line('ni', 'Net income  =  EBIT − interest − PIK − fee/OID amortization − commitment fees − write-offs − tax', per(1, N, (t) => ({
    f: `${m('ebit', t)}-(${m('int_total', t)}+${pikSum(t)}+${m('oid_am', t)}+${m('fee_am', t)}+${m('cfee_total', t)}+${m('book_wo', t)}${refis.length ? `+${refiSum('rf_wo', t)}+${refiSum('rf_premium', t)}` : ''})-${m('cash_tax', t)}`, v: null,
  })), { noParity: true });
  M.line('equity', `Shareholders’ equity  =  prior + net income${dists ? ' − distributions' : ''}`, { 0: { f: m('equity_total', 0), v: bs[0].equity }, ...per(1, N, (t) => ({ f: `${m('equity', t - 1)}+${m('ni', t)}-${paid(t)}`, v: bs[t].equity })) });
  M.line('bs_check', 'Check: assets − debt − equity (must be 0; rounded to 6 dp)', Object.fromEntries(range(N + 1, 0).map((t) => [t, { f: `ROUND(${m('assets', t)}-${m('debt_close', t)}-${m('equity', t)},6)`, v: bs[t].check }])), { italic: true });

  // ── Exit & returns ──
  M.section('7. Exit and returns');
  const ex = o.exit;
  const gN1Ref = lines ? (lines.year_n_plus_1_growth !== null ? iv('gN1') : 'NA()') : iy('g', N);
  M.line('exit_basis_ebitda', 'EBITDA the exit multiple applies to (exit year, or year N+1 under NTM)', { 0: { f: `IF(${iv('exit_basis')}="FY",${ea(N)},${ea(N)}*(1+${gN1Ref}))`, v: ex.exit_ebitda_basis_value } });
  M.line('exit_ev', 'Exit enterprise value  =  multiple × basis EBITDA', { 0: { f: `${iv('exit_mult')}*${m('exit_basis_ebitda', 0)}`, v: ex.exit_ev } }, { bold: true });
  M.line('exit_fees', 'Exit fees', { 0: { f: `${iv('exit_fee')}*${m('exit_ev', 0)}`, v: ex.exit_fees } });
  M.line('payoff', 'Debt repaid at exit (par + accrued PIK + drawn revolver)', { 0: { f: m('debt_close', N), v: ex.debt_payoff_at_par_plus_pik } });
  M.line('exit_cash', 'Cash at exit', { 0: { f: m('cash_close', N), v: ex.cash_at_exit } });
  M.line('mon_term', 'Monitoring-fee termination  =  annual × annuity(years, rate)', {
    0: { f: mon ? `IF(${iv('mon_T')}<=0,0,IF(${iv('mon_r')}=0,${iv('mon_annual')}*${iv('mon_T')},${iv('mon_annual')}*(1-(1+${iv('mon_r')})^(-${iv('mon_T')}))/${iv('mon_r')}))` : '0', v: ex.monitoring_termination },
  });
  if (mon && o.gp_fee_income) {
    const gp = o.gp_fee_income;
    M.line('gp_total', 'Memo: monitoring fees received by the sponsor (annual + termination)', { 0: { f: `SUM(${m('mon_fee', 1)}:${m('mon_fee', N)})+${m('mon_term', 0)}`, v: gp.total } }, { italic: true });
  }
  // §9.1 limited liability: equity is worth zero at worst; the lenders take any shortfall
  M.line('exit_resid', '   residual value  =  EV − debt + cash − fees − termination', { 0: { f: `${m('exit_ev', 0)}-${m('payoff', 0)}+${m('exit_cash', 0)}-${m('exit_fees', 0)}-${m('mon_term', 0)}`, v: null } }, { italic: true, noParity: true });
  M.line('shortfall', 'Debt the exit does not cover (the lenders’ loss)  =  MAX(0, −residual)', { 0: { f: `MAX(0,-${m('exit_resid', 0)})`, v: ex.debt_shortfall_at_exit } });
  M.line('exit_eq', 'Exit equity, all holders  =  MAX(0, residual) — limited liability', { 0: { f: `MAX(0,${m('exit_resid', 0)})`, v: ex.exit_equity_pre_mip_total } }, { bold: true });
  // §10/§22.4 promote: MARGINAL tiers on total proceeds (exit equity + distributions paid)
  // against total invested equity; capped at the positive exit equity.
  const tiers = a.mip ? [{ h: iv('mip_hurdle'), s: iv('mip_pool') }, ...(a.mip.ratchet ?? []).map((_, j) => ({ h: iv(`mip_r${j}_h`), s: iv(`mip_r${j}_s`) }))] : [];
  if (a.mip) M.line('proceeds', '   total proceeds for the promote  =  exit equity + distributions paid', { 0: { f: `${m('exit_eq', 0)}${dists ? `+SUM(${m('dist_paid', 1)}:${m('dist_paid', N)})` : ''}`, v: null } }, { italic: true, noParity: true });
  const promote = tiers.map((tr, j) => {
    const lo = `${tr.h}*${m('equity_total', 0)}`;
    const hiArg = j + 1 < tiers.length ? `MIN(${m('proceeds', 0)},${tiers[j + 1].h}*${m('equity_total', 0)})` : m('proceeds', 0);
    return `${tr.s}*MAX(0,${hiArg}-${lo})`;
  }).join('+');
  M.line('mip', `Management promote  =  ${tiers.length > 1 ? 'Σ tier share × proceeds in the tier' : 'pool × MAX(0, proceeds − hurdle × invested)'}, capped at exit equity`, {
    0: { f: a.mip ? `MIN(${promote},MAX(0,${m('exit_eq', 0)}))` : '0', v: ex.mip_payout },
  });
  const strip = o.equity_strip;
  // §22.2/§22.7 the loan-note walk: accretes from year 1; an interim distribution redeems the
  // accreted notes first, and only the remainder reaches the ordinaries, split at the BASE share.
  if (sweet) {
    M.header({ 0: 'Close', ...years(1, N) });
    M.line('ln_open', 'Loan notes: opening balance', per(1, N, (t) => ({ f: t === 1 ? m('ln0', 0, true) : m('ln_bal', t - 1), v: null })), { italic: true, noParity: true });
    M.line('ln_grown', 'Loan notes: balance after the year’s coupon rolls up  =  opening × (1 + coupon)', per(1, N, (t) => ({ f: `${m('ln_open', t)}*(1+${iv('se_r')})`, v: null })), { noParity: true });
    M.line('ln_red', 'Loan notes redeemed from the year’s distribution  =  MIN(balance, distribution)', per(1, N, (t) => ({ f: `MIN(${m('ln_grown', t)},${paid(t)})`, v: null })), { noParity: true });
    M.line('ln_bal', 'Loan notes: closing balance', per(1, N, (t) => ({ f: `${m('ln_grown', t)}-${m('ln_red', t)}`, v: t === N ? strip!.loan_notes_accrued_balance : null })));
    for (let t = 1; t < N; t++) {
      const idx = parity.findIndex((p) => p.sheet === 'Model' && p.addr === `${Y(t)}${M.rows.get('ln_bal')}`);
      if (idx >= 0) parity.splice(idx, 1); // only the exit-year balance has a ModelOutput counterpart
    }
    M.line('ord_int', '   distribution reaching the ordinaries  =  distribution − loan notes redeemed', per(1, N, (t) => ({ f: `${paid(t)}-${m('ln_red', t)}`, v: null })), { italic: true, noParity: true });
    M.line('inst_int', 'Institution’s interim receipts  =  loan notes redeemed + (1 − base share) × ordinary distribution', per(1, N, (t) => ({ f: `${m('ln_red', t)}+(1-${iv('se_s0')})*${m('ord_int', t)}`, v: null })), { noParity: true });
    M.line('mgmt_int', 'Management’s interim receipts  =  base share × ordinary distribution', per(1, N, (t) => ({ f: `${iv('se_s0')}*${m('ord_int', t)}`, v: null })), { noParity: true });
    M.line('ln_exit_red', 'Loan notes redeemed at exit  =  MIN(accrued balance, MAX(0, exit equity))', { 0: { f: `MIN(${m('ln_bal', N)},MAX(0,${m('exit_eq', 0)}))`, v: strip!.loan_notes_redeemed } }, { bold: true });
  }
  const lnRed = sweet ? `-${m('ln_exit_red', 0)}` : '';
  // §22.6 warrant: exercised iff w × (pot + K) > K; settles on full dilution with the strike paid in
  if (a.warrant || sweet) {
    M.line('w_pot', `Ordinary pot before the warrant  =  exit equity${sweet ? ' − loan notes' : ''} − promote`, { 0: { f: `${m('exit_eq', 0)}${lnRed}-${m('mip', 0)}`, v: strip ? strip.ordinary_pot_pre_warrant : null } }, strip ? {} : { italic: true, noParity: true });
  }
  if (a.warrant) {
    M.line('w_net', 'Warrant payout, net of strike (0 if not exercised)', { 0: { f: `IF(${iv('w_pct')}*(${m('w_pot', 0)}+${iv('w_strike')})>${iv('w_strike')},${iv('w_pct')}*(${m('w_pot', 0)}+${iv('w_strike')})-${iv('w_strike')},0)`, v: ex.warrant_payout_net } });
  }
  const pot = a.warrant ? `(${m('w_pot', 0)}-${m('w_net', 0)})` : sweet ? m('w_pot', 0) : `(${m('exit_eq', 0)}-${m('mip', 0)})`;
  if (sweet) {
    // §22.5 the sweet ratchet: a MARGINAL walk on the institution's OWN realized value — every
    // $1 of ordinary pot adds (1 − s) to the institution's value at the share s in force; the
    // share steps up as each institution-MOIC threshold is crossed. Struck once, at exit.
    const tiersS = sweet.ratchet ?? [];
    M.line('pot', 'Ordinary pot after the warrant (signed)', { 0: { f: pot, v: strip!.ordinary_pot } }, { bold: true });
    M.line('se_I', '   institution’s investment (the ratchet base)  =  sponsor equity', { 0: { f: m('sponsor', 0), v: null } }, { italic: true, noParity: true });
    M.line('se_V0', '   institution value already realized  =  interim receipts + loan notes redeemed at exit', { 0: { f: `SUM(${m('inst_int', 1)}:${m('inst_int', N)})+${m('ln_exit_red', 0)}`, v: null } }, { italic: true, noParity: true });
    M.line('se_rem0', '   pot to allocate (0 when the pot is not positive)', { 0: { f: `MAX(0,${m('pot', 0)})`, v: null } }, { italic: true, noParity: true });
    let prevV = m('se_V0', 0);
    let prevRem = m('se_rem0', 0);
    let prevShare = iv('se_s0');
    const mTerms: string[] = [];
    tiersS.forEach((_, j) => {
      const T = `${iv(`se_r${j}_h`)}*${m('se_I', 0)}`;
      M.line(`se_t${j}_take`, `   pot taken at ${j === 0 ? 'the base' : `tier-${j}`} share until institution MOIC reaches tier ${j + 1}`, {
        0: { f: `IF(${prevV}<${T},MIN((${T}-${prevV})/(1-${prevShare}),${prevRem}),0)`, v: null },
      }, { italic: true, noParity: true });
      M.line(`se_t${j}_V`, `   institution value after that slice`, { 0: { f: `${prevV}+(1-${prevShare})*${m(`se_t${j}_take`, 0)}`, v: null } }, { italic: true, noParity: true });
      M.line(`se_t${j}_rem`, `   pot left`, { 0: { f: `${prevRem}-${m(`se_t${j}_take`, 0)}`, v: null } }, { italic: true, noParity: true });
      mTerms.push(`${prevShare}*${m(`se_t${j}_take`, 0)}`);
      prevV = m(`se_t${j}_V`, 0);
      prevRem = m(`se_t${j}_rem`, 0);
      prevShare = iv(`se_r${j}_s`);
    });
    mTerms.push(`${prevShare}*${prevRem}`);
    M.line('mgmt_ord', 'Management’s ordinary share (sweet equity, after the ratchet)', { 0: { f: `IF(${m('pot', 0)}<=0,0,${mTerms.join('+')})`, v: strip!.management_ordinary_share } }, { bold: true });
    M.line('inst_ord', 'Institution’s ordinary share  =  pot − management', { 0: { f: `${m('pot', 0)}-${m('mgmt_ord', 0)}`, v: strip!.institution_ordinary_share } });
    M.line('se_moic', 'Institution MOIC at the ratchet  =  value realized ÷ investment', { 0: { f: `IF(${m('pot', 0)}<=0,${m('se_V0', 0)}+${m('pot', 0)},${prevV}+(1-${prevShare})*${prevRem})/${m('se_I', 0)}`, v: strip!.institution_moic_at_ratchet, fmt: FMT_NUM } });
    M.line('se_tiers', 'Sweet ratchet tiers reached (MOIC strictly above the threshold)', { 0: { f: tiersS.length ? tiersS.map((_, j) => `IF(${m('se_moic', 0)}>${iv(`se_r${j}_h`)},1,0)`).join('+') : '0', v: strip!.ratchet_tiers_reached, fmt: FMT_YEAR } });
    M.line('se_eff', 'Management’s effective share of the ordinary pot', { 0: { f: `IF(${m('pot', 0)}>0,${m('mgmt_ord', 0)}/${m('pot', 0)},"N/A")`, v: strip!.management_effective_ordinary_pct, fmt: FMT_PCT } });
  }
  M.line('roll_share', 'Rollover holders’ share (pari passu)', { 0: { f: sweet ? '0' : `IF(${m('equity_total', 0)}>0,${pot}*${m('rollover', 0)}/${m('equity_total', 0)},0)`, v: ex.rollover_share } });
  const sdb = o.selldown;
  if (sell && sdb) {
    // §23.2: the sale valued at the END of its year — the §9 form on that year's figures (the
    // year is an input, so INDEX keeps the timing live); §23.5: the buyer takes the fraction of
    // the post-promote, post-warrant sponsor split
    const yrRange = (key: string) => `${m(key, 1, true)}:${m(key, N, true)}`;
    M.line('sd_ev', 'Partial exit: implied EV  =  sale multiple × that year’s EBITDA', { 0: { f: `${iv('sd_mult')}*INDEX(${yrRange(mon ? 'ebitda_adj' : 'ebitda')},${iv('sd_year')})`, v: sdb.implied_event_ev } });
    M.line('sd_nd', '   net debt at that year end  =  debt (par + PIK + revolver) − cash', { 0: { f: `INDEX(${yrRange('debt_close')},${iv('sd_year')})-INDEX(${yrRange('cash_close')},${iv('sd_year')})`, v: null } }, { italic: true, noParity: true });
    M.line('sd_eq', 'Partial exit: implied equity value  =  EV − net debt', { 0: { f: `${m('sd_ev', 0)}-${m('sd_nd', 0)}`, v: sdb.implied_event_equity } });
    M.line('sd_proc', 'Partial exit: proceeds to the sponsor  =  share sold × MAX(0, equity value)', { 0: { f: `${iv('sd_frac')}*MAX(0,${m('sd_eq', 0)})`, v: sdb.selldown_proceeds } }, { bold: true });
    M.line('sd_pre', '   sponsor split before the partition  =  pot − rollover share', { 0: { f: `${pot}-${m('roll_share', 0)}`, v: null } }, { italic: true, noParity: true });
    M.line('sd_buyer', 'Buyer’s share of the exit proceeds  =  share sold × sponsor split', { 0: { f: `${iv('sd_frac')}*${m('sd_pre', 0)}`, v: ex.selldown_buyer_share } });
  }
  M.line('sponsor_exit', sweet ? 'Sponsor (institution) exit proceeds  =  loan notes redeemed + ordinary share' : sell ? 'Sponsor exit proceeds (the retained stake)' : 'Sponsor exit proceeds', {
    0: { f: sweet ? `${m('ln_exit_red', 0)}+${m('inst_ord', 0)}` : sell ? `${m('sd_pre', 0)}-${m('sd_buyer', 0)}` : `${pot}-${m('roll_share', 0)}`, v: ex.sponsor_share },
  }, { bold: true });
  M.header({ 0: 'Year 0', ...years(1, N) });
  // interim flows = the distributions PAID; the sponsor takes its pro-rata share (pari passu
  // with rollover) — or, under a strip, the institution's §22.7 receipts
  if (dists && !sweet) M.line('sp_frac', '   sponsor share of distributions  =  sponsor ÷ (sponsor + rollover)', { 0: { f: `IF(${m('equity_total', 0)}>0,${m('sponsor', 0)}/${m('equity_total', 0)},0)`, v: null, fmt: FMT_NUM } }, { italic: true, noParity: true });
  // §23.5: after the sale year the sponsor keeps (1 − share sold) of each distribution; the
  // sale-year distribution is the seller's whole, and the proceeds land in that year's flow
  const partition = (t: number) => (sell ? `*IF(${yr(t)}>${iv('sd_year')},1-${iv('sd_frac')},1)` : '');
  const proceedsAt = (t: number) => (sell && t < N ? `+IF(${yr(t)}=${iv('sd_year')},${m('sd_proc', 0, true)},0)` : '');
  const spPaid = (t: number) => (sweet ? m('inst_int', t) : `${dists ? `${paid(t)}*${m('sp_frac', 0, true)}${partition(t)}` : '0'}${proceedsAt(t)}`);
  const cfRow = (key: string, label: string, t0: string, interim: (t: number) => string, last: string, values: number[]) =>
    M.line(key, label, Object.fromEntries(range(N + 1, 0).map((t) => [t, { f: t === 0 ? t0 : t === N ? `${last}+${interim(t)}` : interim(t), v: values[t] }])));
  cfRow('cf_sponsor', 'Sponsor cash flows', `-${m('sponsor', 0)}`, spPaid, m('sponsor_exit', 0), o.returns.sponsor_net.cashflows);
  cfRow('cf_equity', 'Total equity cash flows (before the promote)', `-${m('equity_total', 0)}`, paid, m('exit_eq', 0), o.returns.pre_promote.cashflows);
  if (dists || sell) {
    M.line('dpi', `DPI  =  cash realized before the exit (distributions${sell ? ' + selldown' : ''}) ÷ sponsor equity`, per(1, N, (t) => ({
      f: `IF(${m('sponsor', 0, true)}>0,(SUM(${m('cf_sponsor', 1, true)}:${m('cf_sponsor', t)})${t === N ? `-${m('sponsor_exit', 0)}` : ''})/${m('sponsor', 0, true)},0)`,
      v: o.returns.dpi[t - 1], fmt: FMT_NUM,
    })));
    // payback: the FIRST year realized cash reaches the cheque (a later dip never clears it)
    M.line('pbk', '   payback test (year if reached, else blank)', per(1, N, (t) => ({
      f: `IF(AND(${m('sponsor', 0, true)}>0,${m('dpi', t)}>=1),${t},"")`, v: null,
    })), { italic: true, noParity: true });
    M.line('payback', 'Payback year (cash realized before the exit reaches the cheque)', { 0: { f: `IF(COUNT(${m('pbk', 1)}:${m('pbk', N)})=0,"N/A",MIN(${m('pbk', 1)}:${m('pbk', N)}))`, v: o.returns.payback_year, fmt: FMT_YEAR } });
  }
  M.line('u_taxable', '   unlevered: taxable income  =  EBITDA − D&A (no interest)', per(1, N, (t) => ({ f: `${m('ebitda', t)}-${m('da', t)}`, v: null })), { italic: true, noParity: true });
  nolBlock('u_', 'u_taxable', '   unlevered: ', () => ({ acq: null, pc: null, acqEnd: null, pcEnd: null }));
  M.line('u_tax', '   unlevered: cash tax', per(1, N, (t) => ({ f: `IF(${m('u_taxable', t)}<=0,0,MAX(${iv('tax_rate')}*(${m('u_taxable', t)}-${m('u_acq_used', t)}-${m('u_pc_used', t)}),${iv('min_tax')}*${m('u_taxable', t)}))`, v: null })), { italic: true, noParity: true });
  M.line('cf_unlev', 'Unlevered cash flows  =  −(EV + costs); unlevered FCF; + exit EV − fees', Object.fromEntries(range(N + 1, 0).map((t) => [t, {
    f: t === 0 ? `-(${m('ev', 0)}+${m('txn', 0)})` : `${m('ebitda', t)}-${m('u_tax', t)}-${m('capex', t)}-${m('dnwc', t)}${t === N ? `+${m('exit_ev', 0)}-${m('exit_fees', 0)}` : ''}`,
    v: o.returns.unlevered.cashflows[t],
  }])));
  const irrRow = (key: string, label: string, cfKey: string, valIrr: number | null, answer = false) =>
    M.line(key, label, { 0: { f: irrF(m(cfKey, 0), m(cfKey, N), N), v: valIrr, fmt: FMT_PCT } }, { answer, bold: !answer });
  const moicRow = (key: string, label: string, cfKey: string, invested: string, valM: number | null) =>
    M.line(key, label, { 0: { f: `SUMIF(${m(cfKey, 0)}:${m(cfKey, N)},">0")/${invested}`, v: valM, fmt: FMT_MULT } });
  irrRow('irr_sponsor', 'Sponsor IRR', 'cf_sponsor', o.returns.sponsor_net.irr, true);
  moicRow('moic_sponsor', 'Sponsor money multiple', 'cf_sponsor', m('sponsor', 0), o.returns.sponsor_net.moic);
  irrRow('irr_equity', 'Total equity IRR (before the promote)', 'cf_equity', o.returns.pre_promote.irr);
  moicRow('moic_equity', 'Total equity money multiple (before the promote)', 'cf_equity', m('equity_total', 0), o.returns.pre_promote.moic);
  irrRow('irr_unlev', 'Unlevered IRR', 'cf_unlev', o.returns.unlevered.irr);

  // ── §19 Fund overlay ──
  const fo = o.fund;
  if (fund && fo) {
    M.section('Fund overlay — the LP’s net return (event order each year-end: accrue the pref, draw the fee, distribute)');
    M.header({ 0: 'Year 0', ...years(1, N) });
    const c = iv('f_carry');
    const q = iv('f_cu');
    const eu = `${iv('f_wf')}="european"`;
    const prev = (key: string, t: number, first: string) => (t === 1 ? first : m(key, t - 1));
    M.line('f_in', 'Sponsor proceeds reaching the fund  =  sponsor cash flows (interim + exit)', per(1, N, (t) => ({ f: m('cf_sponsor', t), v: null })), { noParity: true });
    M.line('f_basis_amt', '   fee basis  =  sponsor equity (invested) or committed capital', { 0: { f: `IF(${iv('f_basis')}="invested",${m('sponsor', 0)},${iv('f_commit')})`, v: null } }, { italic: true, noParity: true });
    M.line('f_prefacc', 'Pref outstanding after this year’s accrual  =  prior + rate × (unreturned + prior pref)', per(1, N, (t) => ({
      f: `${prev('f_prefend', t, '0')}+${iv('f_pref')}*(${prev('f_unret', t, m('sponsor', 0, true))}+${prev('f_prefend', t, '0')})`, v: null,
    })), { italic: true, noParity: true });
    M.line('f_offset', '   monitoring fees offset', per(1, N, (t) => ({
      f: mon ? `${iv('f_off')}*(${m('mon_fee', t)}${t === N ? `+${m('mon_term', 0)}` : ''})` : '0', v: null,
    })), { italic: true, noParity: true });
    M.line('f_fees', 'Management fee drawn from the LP  =  MAX(0, fee % × basis − offset)', per(1, N, (t) => ({ f: `MAX(0,${iv('f_fee')}*${m('f_basis_amt', 0, true)}-${m('f_offset', t)})`, v: fo.mgmt_fees_net[t - 1] })));
    M.line('f_contrib', 'LP contributions  =  sponsor equity at close, then the fees', {
      0: { f: m('sponsor', 0), v: fo.lp_contributions[0] },
      ...per(1, N, (t) => ({ f: m('f_fees', t), v: fo.lp_contributions[t] })),
    });
    M.line('f_unret_pre', '   unreturned capital before distributing (european: fees join it)', per(1, N, (t) => ({ f: `${prev('f_unret', t, m('sponsor', 0, true))}+IF(${eu},${m('f_fees', t)},0)`, v: null })), { italic: true, noParity: true });
    M.line('f_d1', 'Step 1 — return of capital to the LP', per(1, N, (t) => ({ f: `MIN(${m('f_in', t)},${m('f_unret_pre', t)})`, v: null })), { noParity: true });
    M.line('f_d2', 'Step 2 — preferred return to the LP', per(1, N, (t) => ({ f: `MIN(${m('f_in', t)}-${m('f_d1', t)},${m('f_prefacc', t)})`, v: null })), { noParity: true });
    M.line('f_r2', '   left after return of capital and pref', per(1, N, (t) => ({ f: `${m('f_in', t)}-${m('f_d1', t)}-${m('f_d2', t)}`, v: null })), { italic: true, noParity: true });
    M.line('f_prefpaid', '   pref paid to date', per(1, N, (t) => ({ f: `${prev('f_prefpaid', t, '0')}+${m('f_d2', t)}`, v: null })), { italic: true, noParity: true });
    // the catch-up runs until the GP holds carry% of everything distributed above capital:
    // x = (c × (pref + catch-up + LP carry split to date) − GP to date) ÷ (q − c); q = c ⇒ unbounded
    M.line('f_x', 'Step 3 — catch-up slice (the GP takes the catch-up share of it)', per(1, N, (t) => ({
      f: `IF(AND(${m('f_r2', t)}>0,${q}>0),MIN(${m('f_r2', t)},IF(${q}-${c}<=0,${m('f_r2', t)},MAX(0,(${c}*(${m('f_prefpaid', t)}+${prev('f_s3', t, '0')}+${prev('f_s4lp', t, '0')})-${prev('f_gpcum', t, '0')})/(${q}-${c})))),0)`,
      v: null,
    })), { noParity: true });
    M.line('f_r3', 'Step 4 — residual split carry% / (1 − carry%)', per(1, N, (t) => ({ f: `${m('f_r2', t)}-${m('f_x', t)}`, v: null })), { noParity: true });
    M.line('f_gp', 'GP carried interest', per(1, N, (t) => ({ f: `${q}*${m('f_x', t)}+IF(${m('f_r3', t)}>0,${c}*${m('f_r3', t)},0)`, v: fo.gp_carry[t - 1] })), { bold: true });
    M.line('f_lp', 'LP distributions', per(1, N, (t) => ({ f: `${m('f_d1', t)}+${m('f_d2', t)}+(1-${q})*${m('f_x', t)}+IF(${m('f_r3', t)}>0,(1-${c})*${m('f_r3', t)},0)`, v: fo.lp_distributions[t - 1] })), { bold: true });
    M.line('f_s3', '   catch-up slices to date', per(1, N, (t) => ({ f: `${prev('f_s3', t, '0')}+${m('f_x', t)}`, v: null })), { italic: true, noParity: true });
    M.line('f_s4lp', '   LP share of step-4 splits to date', per(1, N, (t) => ({ f: `${prev('f_s4lp', t, '0')}+IF(${m('f_r3', t)}>0,(1-${c})*${m('f_r3', t)},0)`, v: null })), { italic: true, noParity: true });
    M.line('f_gpcum', '   GP carry to date', per(1, N, (t) => ({ f: `${prev('f_gpcum', t, '0')}+${m('f_gp', t)}`, v: null })), { italic: true, noParity: true });
    M.line('f_unret', '   unreturned capital at year end', per(1, N, (t) => ({ f: `${m('f_unret_pre', t)}-${m('f_d1', t)}`, v: null })), { italic: true, noParity: true });
    M.line('f_prefend', '   pref outstanding at year end', per(1, N, (t) => ({ f: `${m('f_prefacc', t)}-${m('f_d2', t)}`, v: null })), { italic: true, noParity: true });
    M.line('f_dpi', 'LP DPI  =  distributions to date ÷ contributions to date', per(1, N, (t) => ({
      f: `IF(SUM(${m('f_contrib', 0, true)}:${m('f_contrib', t)})>0,SUM(${m('f_lp', 1, true)}:${m('f_lp', t)})/SUM(${m('f_contrib', 0, true)}:${m('f_contrib', t)}),0)`, v: fo.fund_lp_net.dpi[t - 1], fmt: FMT_NUM,
    })));
    // payback: the first INTERIM year (never year N — interim and exit merge there) in which
    // distributions to date reach contributions to date
    M.line('f_pbk', '   payback test (year if reached, else blank)', per(1, N, (t) => ({
      f: t < N ? `IF(SUM(${m('f_lp', 1, true)}:${m('f_lp', t)})>=SUM(${m('f_contrib', 0, true)}:${m('f_contrib', t)})-1E-12,${t},"")` : '""', v: null,
    })), { italic: true, noParity: true });
    M.line('f_payback', 'LP payback year (interim distributions alone)', { 0: { f: `IF(COUNT(${m('f_pbk', 1)}:${m('f_pbk', N)})=0,"N/A",MIN(${m('f_pbk', 1)}:${m('f_pbk', N)}))`, v: fo.fund_lp_net.payback_year, fmt: FMT_YEAR } });
    M.line('f_paidin', 'LP paid-in capital', { 0: { f: `SUM(${m('f_contrib', 0)}:${m('f_contrib', N)})`, v: fo.paid_in_total } });
    M.line('f_committed', 'Committed capital (reported)', { 0: { f: `IF(ISNUMBER(${iv('f_commit')}),${iv('f_commit')},${m('f_paidin', 0)})`, v: fo.committed_capital } });
    M.line('f_cf', 'LP net cash flows  =  distributions − contributions', Object.fromEntries(range(N + 1, 0).map((t) => [t, { f: t === 0 ? `-${m('f_contrib', 0)}` : `${m('f_lp', t)}-${m('f_contrib', t)}`, v: null }])), { noParity: true });
    M.line('f_irr', 'LP net IRR', { 0: { f: irrF(m('f_cf', 0), m('f_cf', N), N), v: fo.fund_lp_net.irr, fmt: FMT_PCT } }, { answer: true });
    M.line('f_moic', 'LP net money multiple  =  distributions ÷ paid-in', { 0: { f: `IF(${m('f_paidin', 0)}>0,SUM(${m('f_lp', 1)}:${m('f_lp', N)})/${m('f_paidin', 0)},0)`, v: fo.fund_lp_net.moic, fmt: FMT_MULT } }, { answer: true });
  }

  // ── Credit ──
  M.section('8. Credit statistics (closing balances; N/A where the denominator is not positive)');
  M.header(years(1, N));
  const cr = o.credit;
  const na = (cond: string, value: string) => `IF(${cond},${value},"N/A")`;
  M.line('net_lev', 'Net leverage  =  (debt − cash) ÷ EBITDA', per(1, N, (t) => ({ f: na(`${ea(t)}>0`, `(${m('debt_close', t)}-${m('cash_close', t)})/${ea(t)}`), v: cr[t - 1].net_leverage, fmt: FMT_MULT })));
  M.line('icr', 'Interest cover  =  EBITDA ÷ cash interest', per(1, N, (t) => ({ f: na(`${m('int_total', t)}>0`, `${ea(t)}/${m('int_total', t)}`), v: cr[t - 1].icr, fmt: FMT_MULT })));
  M.line('svc', '   debt service  =  cash interest + commitment fees + mandatory amortization', per(1, N, (t) => ({ f: `${m('int_total', t)}+${m('cfee_total', t)}+${m('mand_total', t)}`, v: null })), { italic: true, noParity: true });
  M.line('dscr', 'DSCR  =  FCF before debt service ÷ debt service', per(1, N, (t) => ({ f: na(`${m('svc', t)}>0`, `${m('fcf', t)}/${m('svc', t)}`), v: cr[t - 1].dscr, fmt: FMT_MULT })));
  const seniorKeys = [...terms.map((t, i) => (t.type === 'senior' || t.type === 'unitranche' ? `${tk[i]}_close` : null)).filter((x): x is string => x !== null), ...(revolver ? ['rcf_close'] : [])];
  M.line('sr_lev', 'Senior net leverage  =  MAX(0, senior debt − cash) ÷ EBITDA', per(1, N, (t) => ({ f: na(`${ea(t)}>0`, `MAX(0,${sumOf(seniorKeys, t)}-${m('cash_close', t)})/${ea(t)}`), v: cr[t - 1].senior_net_leverage, fmt: FMT_MULT })));
  const maint = (t: number) => (lines?.capex ? m('capex', t) : `${iv('capex_pct')}*${m('rev', t)}`);
  M.line('fccr', 'FCCR  =  (EBITDA − maintenance capex − cash tax) ÷ debt service', per(1, N, (t) => ({ f: na(`${m('svc', t)}>0`, `(${ea(t)}-${maint(t)}-${m('cash_tax', t)})/${m('svc', t)}`), v: cr[t - 1].fccr, fmt: FMT_MULT })));
  M.line('fcf_conv', 'FCF conversion  =  FCF before debt service ÷ EBITDA', per(1, N, (t) => ({ f: na(`${ea(t)}>0`, `${m('fcf', t)}/${ea(t)}`), v: cr[t - 1].fcf_conversion, fmt: FMT_PCT })));
  if (covs.leverage_max !== null) M.line('hr_lev', 'Leverage covenant headroom  =  maximum − net leverage (negative = breach)', per(1, N, (t) => ({ f: `IF(ISNUMBER(${m('net_lev', t)}),${iy('cov_lev', t)}-${m('net_lev', t)},"N/A")`, v: cr[t - 1].leverage_headroom, fmt: FMT_MULT })));
  if (covs.dscr_min !== null) M.line('hr_dscr', 'DSCR covenant headroom  =  DSCR − minimum', per(1, N, (t) => ({ f: `IF(ISNUMBER(${m('dscr', t)}),${m('dscr', t)}-${iy('cov_dscr', t)},"N/A")`, v: cr[t - 1].dscr_headroom, fmt: FMT_MULT })));
  if (covs.fccr_min !== null) M.line('hr_fccr', 'FCCR covenant headroom  =  FCCR − minimum', per(1, N, (t) => ({ f: `IF(ISNUMBER(${m('fccr', t)}),${m('fccr', t)}-${iy('cov_fccr', t)},"N/A")`, v: cr[t - 1].fccr_headroom, fmt: FMT_MULT })));
  if (covs.springing && revolver) {
    M.line('spr_on', 'Springing leverage test active (revolver drawn ÷ commitment above the trigger)', per(1, N, (t) => ({ f: `AND(${m('rcf_commit', 0, true)}>0,${m('rcf_close', t)}/${m('rcf_commit', 0, true)}>${iv('spr_trig')})`, v: null, fmt: 'General' })), { noParity: true });
    M.line('spr_hr', 'Springing test headroom when active  =  maximum − net leverage', per(1, N, (t) => ({ f: `IF(AND(${m('spr_on', t)},ISNUMBER(${m('net_lev', t)})),${iy('spr_max', t)}-${m('net_lev', t)},"not tested")`, v: null, fmt: FMT_MULT })), { noParity: true });
  }
  M.line('paydown', 'Cumulative paydown (% of entry debt)', per(1, N, (t) => ({ f: na(`${m('total_par', 0, true)}>0`, `(${m('total_par', 0, true)}-${m('debt_close', t)})/${m('total_par', 0, true)}`), v: cr[t - 1].cumulative_paydown_pct_of_entry_debt, fmt: FMT_PCT })));

  // ── Valuation ──
  if (v && val) {
    M.section('9. Flow to equity — what the equity is worth (CAPM; the cost of equity re-levered every year)');
    M.line('ru', 'Unlevered cost of capital  rU  =  rf + βA × MRP', { 0: { f: `${iv('rf')}+${iv('beta_a')}*${iv('mrp')}`, v: val.r_unlevered, fmt: FMT_PCT } });
    // §28.2 [v2.6.0]: capex and ΔNWC are year N's own, or the stated steady-state terminal lines
    const termCapex = v.terminal ? `${iv('term_capex')}*${m('da', N)}` : m('capex', N);
    const termNwc = v.terminal ? iv('term_nwc') : m('dnwc', N);
    M.line('ufcf6', v.terminal
      ? 'Year N+1 unlevered FCF  =  (1+g) × [EBIT(1−t) + D&A − terminal capex − terminal ΔNWC]'
      : 'Year N+1 unlevered FCF  =  (1+g) × [EBIT(1−t) + D&A − capex − ΔNWC]', {
      0: { f: `(1+${gN1Ref})*((${m('ebitda', N)}-${m('da', N)})*(1-${iv('tax_rate')})+${m('da', N)}-${termCapex}-${termNwc})`, v: val.ufcf_n_plus_1 },
    }, { note: 'Every line of this cash flow must be able to continue for ever at g — check capex against D&A, and the working-capital build.' });
    M.line('ev_b', 'Exit EV from fundamentals  =  UFCF(N+1) ÷ (rU − g)', { 0: { f: `IF(${m('ru', 0)}>${iv('g_lr')},${m('ufcf6', 0)}/(${m('ru', 0)}-${iv('g_lr')}),"N/A")`, v: val.gordon_ev } }, { bold: true });
    M.line('mult_b', '   as a multiple of the exit-basis EBITDA', { 0: { f: `IF(ISNUMBER(${m('ev_b', 0)}),${m('ev_b', 0)}/${m('exit_basis_ebitda', 0)},"N/A")`, v: val.gordon_implied_multiple, fmt: FMT_MULT } });
    const sooy = v.leverage_timing === 'start_of_year';
    const cases = [
      { k: 'a', title: '(a) Exit at the assumed multiple', c: val.assumed, ev: m('exit_ev', 0) },
      { k: 'b', title: '(b) Exit from fundamentals', c: val.fundamentals, ev: m('ev_b', 0) },
    ] as const;
    for (const { k, title, c, ev } of cases) {
      if (c === null) { M.note(`${title}: not defined — ${val.gordon_null_reason ?? ''}`); continue; }
      M.note(title);
      M.header({ 0: 'Year 0', ...years(1, N) });
      M.line(`${k}_exit_eq`, 'Exit equity  =  MAX(0, EV − debt + cash − exit fees − termination)', { 0: { f: `MAX(0,${ev}-${m('payoff', 0)}+${m('exit_cash', 0)}-${iv('exit_fee')}*${ev}-${m('mon_term', 0)})`, v: c.exit_equity_total } });
      M.line(`${k}_ecf`, 'Cash flow to equity during the year (distributions paid)', per(1, N, (t) => ({ f: paid(t), v: null })), { noParity: true });
      const eFormula = (t: number) => {
        if (t === N) return m(`${k}_exit_eq`, 0);
        if (!sooy) return `(${m(`${k}_E`, t + 1)}+${m(`${k}_ecf`, t + 1)})/(1+${m(`${k}_re`, t + 1)})`;
        return `(${m(`${k}_E`, t + 1)}+${m(`${k}_ecf`, t + 1)}-${iv('mrp')}*(${iv('beta_a')}*(${m(`${k}_D`, t)}-${m(`${k}_C`, t)})-${iv('beta_d')}*${m(`${k}_D`, t)}))/(1+${iv('rf')}+${iv('beta_a')}*${iv('mrp')})`;
      };
      M.line(`${k}_E`, 'Equity value, end of year — worked backwards from the exit', Object.fromEntries(range(N + 1, 0).map((t) => [t, { f: eFormula(t), v: c.equity_value ? c.equity_value[t] : null }])), { bold: true },
      );
      M.line(`${k}_D`, 'Debt, end of year', Object.fromEntries(range(N + 1, 0).map((t) => [t, { f: m('debt_close', t), v: c.debt[t] }])));
      M.line(`${k}_C`, 'Cash, end of year', Object.fromEntries(range(N + 1, 0).map((t) => [t, { f: m('cash_close', t), v: c.cash[t] }])));
      M.line(`${k}_w`, 'Equity ÷ (debt + equity)', Object.fromEntries(range(N + 1, 0).map((t) => [t, { f: `${m(`${k}_E`, t)}/(${m(`${k}_D`, t)}+${m(`${k}_E`, t)})`, v: c.equity_weight ? c.equity_weight[t] : null, fmt: FMT_NUM }])));
      M.line(`${k}_beta`, 'Equity beta  =  βA + (βA × (D − C) − βD × D) ÷ E', Object.fromEntries(range(N + 1, 0).map((t) => [t, {
        f: `${iv('beta_a')}+(${iv('beta_a')}*(${m(`${k}_D`, t)}-${m(`${k}_C`, t)})-${iv('beta_d')}*${m(`${k}_D`, t)})/${m(`${k}_E`, t)}`, v: c.beta_equity ? c.beta_equity[t] : null, fmt: '0.000',
      }])));
      M.line(`${k}_re`, `Cost of equity  =  rf + βE × MRP — leverage at the ${sooy ? 'START' : 'END'} of the year discounted`,
        sooy
          ? per(1, N, (t) => ({ f: `${iv('rf')}+${m(`${k}_beta`, t - 1)}*${iv('mrp')}`, v: c.cost_of_equity ? c.cost_of_equity[t] : null, fmt: FMT_PCT }))
          : Object.fromEntries(range(N + 1, 0).map((t) => [t, { f: `${iv('rf')}+${m(`${k}_beta`, t)}*${iv('mrp')}`, v: c.cost_of_equity ? c.cost_of_equity[t] : null, fmt: FMT_PCT }])));
      M.line(`${k}_value`, 'Equity value at entry', { 0: { f: m(`${k}_E`, 0), v: c.equity_value_at_entry } }, { answer: true });
      M.line(`${k}_npv`, 'NPV of the equity investment  =  value − equity invested', { 0: { f: `${m(`${k}_E`, 0)}-${m('equity_total', 0)}`, v: c.npv } }, { answer: true });
      M.line(`${k}_vpd`, 'Value per dollar invested', { 0: { f: `${m(`${k}_E`, 0)}/${m('equity_total', 0)}`, v: c.value_per_dollar, fmt: '0.000' } });
      M.line(`${k}_cfe`, 'Equity cash flows at this exit', Object.fromEntries(range(N + 1, 0).map((t) => [t, {
        f: t === 0 ? `-${m('equity_total', 0)}` : t === N ? `${m(`${k}_ecf`, t)}+${m(`${k}_exit_eq`, 0)}` : m(`${k}_ecf`, t), v: c.equity_cashflows[t],
      }])));
      M.line(`${k}_cfv`, '   helper: the same flows, bought at value', Object.fromEntries(range(N + 1, 0).map((t) => [t, {
        f: t === 0 ? `-${m(`${k}_E`, 0)}` : t === N ? `${m(`${k}_ecf`, t)}+${m(`${k}_E`, N)}` : m(`${k}_ecf`, t), v: null,
      }])), { italic: true, noParity: true });
      M.line(`${k}_irr`, 'Equity IRR at this exit', { 0: { f: irrF(m(`${k}_cfe`, 0), m(`${k}_cfe`, N), N), v: c.equity_irr, fmt: FMT_PCT } }, { answer: true });
      M.line(`${k}_req`, 'Return the equity requires over the hold  =  IRR on value', { 0: { f: irrF(m(`${k}_cfv`, 0), m(`${k}_cfv`, N), N), v: c.required_return, fmt: FMT_PCT } });
      M.line(`${k}_excess`, 'Excess return a year  =  IRR − required (same sign as the NPV, always)', { 0: { f: `${m(`${k}_irr`, 0)}-${m(`${k}_req`, 0)}`, v: c.excess_return, fmt: FMT_PCT } }, { bold: true });
    }
    M.section('10. What would have to be true — break-evens (NPV = 0, one input at a time)');
    const be = val.break_evens;
    M.line('be_mult_m', 'Break-even exit multiple, exit (a) — from Inputs', { 0: { f: `IF(ISNUMBER(${iv('be_mult')}),${iv('be_mult')},"N/A")`, v: be.exit_multiple.value, fmt: FMT_MULT } }, { note: 'Solved by the deal engine; after you change inputs, re-solve with Goal Seek. The live NPV below shows when it stops reading 0.' });
    M.line('be_beta_m', 'Break-even asset beta, exit (b) — from Inputs', { 0: { f: `IF(ISNUMBER(${iv('be_beta')}),${iv('be_beta')},"N/A")`, v: be.asset_beta.value, fmt: '0.0000' } });
    M.line('be_g_m', 'Break-even long-run growth, exit (b) — from Inputs', { 0: { f: `IF(ISNUMBER(${iv('be_g')}),${iv('be_g')},"N/A")`, v: be.long_run_growth.value, fmt: FMT_PCT } });
    if (be.exit_multiple.value !== null && !sooy) {
      M.header({ 0: 'Year 0', ...years(1, N) });
      M.line('be_E', '   equity value at the break-even exit multiple (live recursion)', Object.fromEntries(range(N + 1, 0).map((t) => [t, {
        f: t === N
          ? `MAX(0,${m('be_mult_m', 0)}*${m('exit_basis_ebitda', 0)}*(1-${iv('exit_fee')})-${m('payoff', 0)}+${m('exit_cash', 0)}-${m('mon_term', 0)})`
          : `(${m('be_E', t + 1)}+${paid(t + 1)})/(1+${iv('rf')}+(${iv('beta_a')}+(${iv('beta_a')}*(${m('debt_close', t + 1)}-${m('cash_close', t + 1)})-${iv('beta_d')}*${m('debt_close', t + 1)})/${m('be_E', t + 1)})*${iv('mrp')})`,
        v: null,
      }])), { italic: true, noParity: true });
      M.line('be_npv', 'NPV at the break-even exit multiple (reads 0 until an input changes)', { 0: { f: `${m('be_E', 0)}-${m('equity_total', 0)}`, v: 0 } }, { bold: true });
    }
  }

  // ═══════════════════════════════ SENSITIVITY ═══════════════════════════════
  // The exit multiple moves ONLY the exit: every interim flow, the debt path and the interim
  // equity flows are unchanged, so each point restates the §9/§10/§22/§23 exit chain on the
  // Model's own year-N figures — live formulas, held to a full engine re-run at that multiple.
  {
    const mm = (key: string, t = 0) => M.ext(key, t);
    const sensMults = SENS_STEPS.map((d) => Math.max(0.5, a.exit.multiple + d));
    const runs = sensMults.map((mult) => runModel(f, { ...a, exit: { ...a.exit, multiple: mult } }));
    const pts = (fn: (j: number) => Cell): Record<number, Cell> => Object.fromEntries(range(K, 0).map((j) => [j, fn(j)]));
    const pointHead = Object.fromEntries(range(K, 0).map((j) => [j, `Point ${j + 1}`]));
    I.section('Sensitivity — exit multiples to test (the Sensitivity sheet recalculates at each)');
    I.header(pointHead);
    I.line('sens_m', 'Exit multiple', pts((j) => ({ input: sensMults[j], fmt: FMT_MULT })));
    X.title(`${a.deal_name} — sensitivity to the exit multiple`, [
      'Each column re-runs the exit at the multiple on the Inputs sheet (Sensitivity section). Every interim flow is the Model’s own.',
    ]);
    X.section('The exit at each multiple');
    X.header(pointHead);
    const x = (key: string, j: number) => X.at(key, j);
    X.line('x_m', 'Exit multiple', pts((j) => ({ f: I.ext('sens_m', j), v: sensMults[j], fmt: FMT_MULT })), { bold: true });
    X.line('x_ev', 'Exit enterprise value  =  multiple × basis EBITDA', pts((j) => ({ f: `${x('x_m', j)}*${mm('exit_basis_ebitda')}`, v: runs[j].exit.exit_ev })));
    X.line('x_eq', 'Exit equity, all holders  =  MAX(0, EV − debt + cash − exit fees − termination)', pts((j) => ({
      f: `MAX(0,${x('x_ev', j)}-${mm('payoff')}+${mm('exit_cash')}-${iv('exit_fee')}*${x('x_ev', j)}-${mm('mon_term')})`, v: runs[j].exit.exit_equity_pre_mip_total,
    })), { bold: true });
    const lnRedX = (j: number) => (sweet ? `-${x('x_lnred', j)}` : '');
    if (sweet) X.line('x_lnred', 'Loan notes redeemed  =  MIN(accrued, MAX(0, exit equity))', pts((j) => ({ f: `MIN(${mm('ln_bal', N)},MAX(0,${x('x_eq', j)}))`, v: runs[j].equity_strip!.loan_notes_redeemed })));
    if (a.mip) {
      X.line('x_proc', '   proceeds for the promote  =  exit equity + distributions paid', pts((j) => ({ f: `${x('x_eq', j)}${dists ? `+SUM(${mm('dist_paid', 1)}:${mm('dist_paid', N)})` : ''}`, v: null })), { italic: true, noParity: true });
      X.line('x_mip', 'Management promote', pts((j) => {
        const prom = tiers.map((tr, k) => {
          const lo = `${tr.h}*${mm('equity_total')}`;
          const hi = k + 1 < tiers.length ? `MIN(${x('x_proc', j)},${tiers[k + 1].h}*${mm('equity_total')})` : x('x_proc', j);
          return `${tr.s}*MAX(0,${hi}-${lo})`;
        }).join('+');
        return { f: `MIN(${prom},MAX(0,${x('x_eq', j)}))`, v: runs[j].exit.mip_payout };
      }));
    }
    const mipX = (j: number) => (a.mip ? `-${x('x_mip', j)}` : '');
    X.line('x_wpot', '   ordinary pot before the warrant', pts((j) => ({ f: `${x('x_eq', j)}${lnRedX(j)}${mipX(j)}`, v: null })), { italic: true, noParity: true });
    if (a.warrant) {
      X.line('x_wnet', 'Warrant payout, net of strike', pts((j) => ({
        f: `IF(${iv('w_pct')}*(${x('x_wpot', j)}+${iv('w_strike')})>${iv('w_strike')},${iv('w_pct')}*(${x('x_wpot', j)}+${iv('w_strike')})-${iv('w_strike')},0)`, v: runs[j].exit.warrant_payout_net,
      })));
    }
    X.line('x_pot', '   ordinary pot after the warrant', pts((j) => ({ f: a.warrant ? `${x('x_wpot', j)}-${x('x_wnet', j)}` : x('x_wpot', j), v: null })), { italic: true, noParity: true });
    let preF: (j: number) => string;
    if (sweet) {
      const tiersS = sweet.ratchet ?? [];
      X.line('x_V0', '   institution value realized before the ordinary split', pts((j) => ({ f: `SUM(${mm('inst_int', 1)}:${mm('inst_int', N)})+${x('x_lnred', j)}`, v: null })), { italic: true, noParity: true });
      X.line('x_rem0', '   pot to allocate', pts((j) => ({ f: `MAX(0,${x('x_pot', j)})`, v: null })), { italic: true, noParity: true });
      const finalTerms: ((j: number) => string)[] = [];
      let prevV = (j: number) => x('x_V0', j);
      let prevRem = (j: number) => x('x_rem0', j);
      let prevShare = iv('se_s0');
      tiersS.forEach((_, k) => {
        const T = `${iv(`se_r${k}_h`)}*${mm('sponsor')}`;
        const pv = prevV; const pr = prevRem; const ps = prevShare;
        X.line(`x_t${k}_take`, `   pot taken below sweet ratchet tier ${k + 1}`, pts((j) => ({ f: `IF(${pv(j)}<${T},MIN((${T}-${pv(j)})/(1-${ps}),${pr(j)}),0)`, v: null })), { italic: true, noParity: true });
        X.line(`x_t${k}_V`, '   institution value after that slice', pts((j) => ({ f: `${pv(j)}+(1-${ps})*${x(`x_t${k}_take`, j)}`, v: null })), { italic: true, noParity: true });
        X.line(`x_t${k}_rem`, '   pot left', pts((j) => ({ f: `${pr(j)}-${x(`x_t${k}_take`, j)}`, v: null })), { italic: true, noParity: true });
        finalTerms.push((j) => `${ps}*${x(`x_t${k}_take`, j)}`);
        prevV = (j) => x(`x_t${k}_V`, j);
        prevRem = (j) => x(`x_t${k}_rem`, j);
        prevShare = iv(`se_r${k}_s`);
      });
      const lastShare = prevShare; const lastRem = prevRem;
      X.line('x_mgmt', 'Management’s sweet equity', pts((j) => ({ f: `IF(${x('x_pot', j)}<=0,0,${[...finalTerms.map((t) => t(j)), `${lastShare}*${lastRem(j)}`].join('+')})`, v: runs[j].exit.management_ordinary_share })));
      preF = (j) => `${x('x_lnred', j)}+${x('x_pot', j)}-${x('x_mgmt', j)}`;
    } else {
      preF = (j) => `${x('x_pot', j)}*(1-IF(${mm('equity_total')}>0,${mm('rollover')}/${mm('equity_total')},0))`;
    }
    X.line('x_pre', '   sponsor split (before any partial-exit partition)', pts((j) => ({ f: preF(j), v: null })), { italic: true, noParity: true });
    X.line('x_sp', 'Sponsor exit proceeds', pts((j) => ({ f: sell ? `(1-${iv('sd_frac')})*${x('x_pre', j)}` : x('x_pre', j), v: runs[j].exit.sponsor_share })), { bold: true });

    X.section('Cash flows at each multiple (only the exit year changes)');
    X.header({ 0: 'Year 0', ...years(1, N) });
    range(K, 0).forEach((j) => {
      X.line(`x_cf${j}`, `Sponsor cash flows at point ${j + 1}`, Object.fromEntries(range(N + 1, 0).map((t) => [t, {
        f: t < N ? mm('cf_sponsor', t) : `${x('x_sp', j)}+${mm('cf_sponsor', N)}-${mm('sponsor_exit')}`, v: runs[j].returns.sponsor_net.cashflows[t],
      }])), { noParity: false });
    });
    range(K, 0).forEach((j) => {
      X.line(`x_ecf${j}`, `Total equity cash flows at point ${j + 1}`, Object.fromEntries(range(N + 1, 0).map((t) => [t, {
        f: t < N ? mm('cf_equity', t) : `${x('x_eq', j)}+${mm('cf_equity', N)}-${mm('exit_eq')}`, v: runs[j].returns.pre_promote.cashflows[t],
      }])));
    });
    const sooyX = v?.leverage_timing === 'start_of_year';
    if (v && val) {
      range(K, 0).forEach((j) => {
        const key = `x_E${j}`;
        const E = (t: number) => X.at(key, t);
        X.line(key, `   equity value by year at point ${j + 1} (flow to equity, worked back from the exit)`, Object.fromEntries(range(N + 1, 0).map((t) => {
          let fml: string;
          if (t === N) fml = x('x_eq', j);
          else if (!sooyX) fml = `(${E(t + 1)}+${paid(t + 1)})/(1+${iv('rf')}+(${iv('beta_a')}+(${iv('beta_a')}*(${mm('debt_close', t + 1)}-${mm('cash_close', t + 1)})-${iv('beta_d')}*${mm('debt_close', t + 1)})/${E(t + 1)})*${iv('mrp')})`;
          else fml = `(${E(t + 1)}+${paid(t + 1)}-${iv('mrp')}*(${iv('beta_a')}*(${mm('debt_close', t)}-${mm('cash_close', t)})-${iv('beta_d')}*${mm('debt_close', t)}))/(1+${iv('rf')}+${iv('beta_a')}*${iv('mrp')})`;
          return [t, { f: fml, v: null }];
        })), { italic: true, noParity: true });
      });
    }

    X.section('Returns at each multiple');
    X.header(pointHead);
    X.line('x_m2', 'Exit multiple', pts((j) => ({ f: x('x_m', j), v: sensMults[j], fmt: FMT_MULT })), { bold: true });
    const irrOf = (key: string) => irrF(X.at(key, 0), X.at(key, N), N);
    X.line('x_irr', 'Sponsor IRR', pts((j) => ({ f: irrOf(`x_cf${j}`), v: runs[j].returns.sponsor_net.irr, fmt: FMT_PCT })), { answer: true });
    X.line('x_moic', 'Sponsor money multiple', pts((j) => ({ f: `SUMIF(${X.at(`x_cf${j}`, 0)}:${X.at(`x_cf${j}`, N)},">0")/${mm('sponsor')}`, v: runs[j].returns.sponsor_net.moic, fmt: FMT_MULT })), { answer: true });
    X.line('x_eqirr', 'Total equity IRR (before the promote)', pts((j) => ({ f: irrOf(`x_ecf${j}`), v: runs[j].returns.pre_promote.irr, fmt: FMT_PCT })));
    if (v && val) {
      X.line('x_npv', 'NPV of the equity at this exit (flow to equity)', pts((j) => ({ f: `${X.at(`x_E${j}`, 0)}-${mm('equity_total')}`, v: runs[j].valuation!.assumed.npv })), { bold: true });
    }
  }

  // ═══════════════════════════════ CHECKS ═══════════════════════════════
  C.title('Checks — every row must read zero', ['A non-zero row means an input change has broken an identity the model relies on.']);
  C.r += 1;
  const mx = (key: string, t: number) => M.ext(key, t);
  const checks: [string, string, string][] = [
    ['ck_su', 'Sources = uses', `${mx('sources', 0)}-${mx('uses', 0)}`],
    ['ck_bs', 'Balance sheet balances in every year (sum of |assets − debt − equity|)', range(N + 1, 0).map((t) => `ABS(${mx('bs_check', t)})`).join('+')],
    ['ck_exit', `Exit split: sponsor + rollover + promote + warrant${sweet ? ' + management sweet equity' : ''} = exit equity`, `${mx('sponsor_exit', 0)}+${mx('roll_share', 0)}+${mx('mip', 0)}${a.warrant ? `+${mx('w_net', 0)}` : ''}${sweet ? `+${mx('mgmt_ord', 0)}` : ''}${sell ? `+${mx('sd_buyer', 0)}` : ''}-${mx('exit_eq', 0)}`],
    ['ck_debt', 'Debt roll: par − repayments + PIK = closing debt (terms)', terms.length
      ? `${mx('total_par', 0)}${range(N, 1).map((t) => terms.map((_, i) => `-${mx(`${tk[i]}_mand`, t)}-${mx(`${tk[i]}_sweep`, t)}+${mx(`${tk[i]}_pik`, t)}`).join('')).join('')}-(${terms.map((_, i) => mx(`${tk[i]}_close`, N)).join('+')})`
      : '0'],
  ];
  if (NZ && linked.ebitda) {
    checks.push(['ck_norm', 'Sizing EBITDA is the adjusted EBITDA on the Normalisation sheet (non-zero ⇒ the link was overwritten)', `${I.ext('ltm_ebitda', 0)}-${NZ.ext('eb_adj', sizingCol)}`]);
  }
  if (sweet) {
    // §22.3(vi): a strip needs a positive institutional plug — otherwise the loan-note /
    // ordinary split is meaningless (the deal engine refuses to build such a deal)
    checks.push(['ck_plug', 'Strip: the sponsor plug after the management subscription is positive (1 = not)', `IF(${mx('sponsor', 0)}>0,0,1)`]);
    checks.push(['ck_interim', 'Strip: interim distributions = institution + management receipts', range(N, 1).map((t) => `${mx('inst_int', t)}+${mx('mgmt_int', t)}-${dists ? mx('dist_paid', t) : '0'}`).join('+')]);
  }
  if (fund && o.fund) {
    checks.push(['ck_fund_split', 'Fund: every dollar reaching the fund goes to the LP or the GP', range(N, 1).map((t) => `${mx('f_in', t)}-${mx('f_lp', t)}-${mx('f_gp', t)}`).join('+')]);
    checks.push(['ck_fund_commit', 'Fund: committed capital covers paid-in (1 = not; the deal engine refuses such a fund)', `IF(${mx('f_committed', 0)}>=${mx('f_paidin', 0)}-0.005,0,1)`]);
  }
  if (v && val) {
    checks.push(['ck_sign_a', 'Flow to equity (a): the NPV and the excess return have the same sign', `IF(SIGN(ROUND(${mx('a_npv', 0)},9))=SIGN(ROUND(${mx('a_excess', 0)},12)),0,1)`]);
    if (val.fundamentals) checks.push(['ck_sign_b', 'Flow to equity (b): the NPV and the excess return have the same sign', `IF(SIGN(ROUND(${mx('b_npv', 0)},9))=SIGN(ROUND(${mx('b_excess', 0)},12)),0,1)`]);
  }
  for (const [key, label, fml] of checks) C.line(key, label, { 0: { f: `ROUND(${fml},6)`, v: 0, fmt: '0.000000' } });
  C.line('ck_total', 'Total (must be 0)', { 0: { f: `SUMPRODUCT(ABS(${C.at(checks[0][0], 0)}:${C.at(checks[checks.length - 1][0], 0)}))`, v: 0, fmt: '0.000000' } }, { answer: true });

  // Deal WARNINGS are outcomes of the deal, not broken identities — they are shown with the
  // engine's own figure and are never part of the must-be-zero total.
  C.section('Deal warnings (outcomes to review — not model errors)');
  const breach = o.waterfall.some((w) => w.cash_floor_breach);
  C.line('wn_cash', 'Cash below the minimum, summed over the hold (0 = never breached)', { 0: { f: range(N, 1).map((t) => `MAX(0,${iv('min_cash')}-${mx('cash_close', t)}-1E-9)`).join('+'), v: null } },
    { noParity: true, note: breach ? 'The engine flags a cash-floor breach — add a revolver, lower the debt, or revisit the forecast.' : undefined });
  C.line('wn_short', 'Debt the exit does not cover (0 = covered; else the lenders’ loss)', { 0: { f: mx('shortfall', 0), v: null } },
    { noParity: true, note: 'Positive when exit value is below the debt: equity is worth zero (limited liability) and the lenders take this loss.' });
  if (sell) {
    C.line('wn_sd', 'Partial exit below the pro-rata entry cost (0 = not below; else the shortfall)', { 0: { f: `MAX(0,${iv('sd_frac')}*${mx('sponsor', 0)}-0.005-${mx('sd_proc', 0)})`, v: null } },
      { noParity: true, note: 'Positive when the sold slice fetches less than its share of the sponsor’s entry cheque — a warning, not an error.' });
  }
  if (sweet) {
    C.line('wn_ln', 'Loan notes NOT covered by exit equity (0 = fully redeemed)', { 0: { f: `${mx('ln_bal', N)}-${mx('ln_exit_red', 0)}`, v: null } },
      { noParity: true, note: 'When positive, the ordinary pot is wiped out and management’s sweet equity is worthless on this case.' });
  }

  // ═══════════════════════════════ SUMMARY ═══════════════════════════════
  // The one page an MD reads first. Every number is a formula on the Model / Checks sheets.
  {
    const mm = (key: string, t = 0) => M.ext(key, t);
    S.title(`${a.deal_name} — summary`, [
      `${ccy} millions unless stated. Every number on this page is a live formula on the Model sheet; change the Inputs sheet and it moves.`,
    ]);
    S.section('Price and structure');
    S.line('s_ev', 'Purchase price (enterprise value)', { 0: { f: mm('ev'), v: su.enterprise_value } }, { bold: true });
    S.line('s_entry_mult', `Entry multiple (× ${a.entry.basis === 'fy' ? 'historical' : 'forecast year-1'} EBITDA)`, { 0: { f: mm('entry_mult'), v: o.derived.entry_multiple, fmt: FMT_MULT } });
    S.line('s_debt', 'Debt at close (par)', { 0: { f: mm('total_par'), v: o.derived.total_debt_at_par } });
    if (nz && NZ && linked.ebitda) {
      const eb = nz.ebitda[sizingCol];
      if (eb.restated !== null) S.line('s_ebitda_rep', `${basisWord} EBITDA as sourced`, { 0: { f: NZ.ext('eb_rep', sizingCol), v: eb.restated } });
      S.line('s_ebitda_adj', `${basisWord} EBITDA, adjusted (the pricing and leverage basis)`, { 0: { f: NZ.ext('eb_adj', sizingCol), v: f.fy_ebitda } });
    }
    if (NZ && f.net_debt !== null) {
      S.line('s_net_debt', nz && !nz.as_reported ? 'Net debt at entry, adjusted' : 'Net debt at entry', { 0: { f: NZ.ext('nd_adj', 0), v: f.net_debt } });
      S.line('s_seller_eq', 'Implied equity value to the sellers (purchase price − net debt)', { 0: { f: `${mm('ev')}-${NZ.ext('nd_adj', 0)}`, v: su.enterprise_value - f.net_debt } });
    }
    if (f.fy_ebitda !== null && o.derived.entry_gross_leverage_fy !== null) {
      S.line('s_lev', `Gross leverage at close (debt ÷ ${basisWord} EBITDA)`, { 0: { f: `${mm('total_par')}/${I.ext('ltm_ebitda', 0)}`, v: o.derived.entry_gross_leverage_fy, fmt: FMT_MULT } });
    }
    S.line('s_sponsor', 'Sponsor equity', { 0: { f: mm('sponsor'), v: su.sponsor_equity } }, { bold: true });
    S.line('s_eq_total', 'Total equity invested (incl. rollover and management)', { 0: { f: mm('equity_total'), v: su.sponsor_equity + su.rollover_equity + su.management_subscription } });
    S.line('s_eq_pct', 'Equity as % of total sources', { 0: { f: `${mm('equity_total')}/${mm('sources')}`, v: (su.sponsor_equity + su.rollover_equity + su.management_subscription) / su.total_sources, fmt: FMT_PCT } });
    S.section('Exit');
    S.line('s_exit_mult', 'Exit multiple', { 0: { f: I.ext('exit_mult', 0), v: a.exit.multiple, fmt: FMT_MULT } });
    S.line('s_exit_ev', 'Exit enterprise value', { 0: { f: mm('exit_ev'), v: ex.exit_ev } });
    S.line('s_exit_eq', 'Exit equity, all holders', { 0: { f: mm('exit_eq'), v: ex.exit_equity_pre_mip_total } });
    S.line('s_sponsor_exit', 'Sponsor exit proceeds', { 0: { f: mm('sponsor_exit'), v: ex.sponsor_share } });
    S.section('Returns');
    S.line('s_irr', 'Sponsor IRR', { 0: { f: mm('irr_sponsor'), v: o.returns.sponsor_net.irr, fmt: FMT_PCT } }, { answer: true });
    S.line('s_moic', 'Sponsor money multiple', { 0: { f: mm('moic_sponsor'), v: o.returns.sponsor_net.moic, fmt: FMT_MULT } }, { answer: true });
    S.line('s_irr_eq', 'Total equity IRR (before the promote)', { 0: { f: mm('irr_equity'), v: o.returns.pre_promote.irr, fmt: FMT_PCT } });
    S.line('s_irr_u', 'Unlevered IRR', { 0: { f: mm('irr_unlev'), v: o.returns.unlevered.irr, fmt: FMT_PCT } });
    if (dists || sell) {
      S.line('s_dpi', 'DPI at exit (cash realized before the exit ÷ sponsor equity)', { 0: { f: mm('dpi', N), v: o.returns.dpi[N - 1], fmt: FMT_NUM } });
      S.line('s_payback', 'Payback year', { 0: { f: mm('payback'), v: o.returns.payback_year, fmt: FMT_YEAR } });
    }
    if (fund && o.fund) {
      S.line('s_lp_irr', 'LP net IRR (after fund fees and carry)', { 0: { f: mm('f_irr'), v: o.fund.fund_lp_net.irr, fmt: FMT_PCT } }, { answer: true });
      S.line('s_lp_moic', 'LP net money multiple', { 0: { f: mm('f_moic'), v: o.fund.fund_lp_net.moic, fmt: FMT_MULT } });
    }
    if (v && val) {
      S.section('Valuation — flow to equity');
      for (const [k, title, c] of [['a', 'at the assumed exit multiple', val.assumed], ['b', 'from fundamentals', val.fundamentals]] as const) {
        if (!c) continue;
        S.line(`s_${k}_npv`, `NPV of the equity, ${title}`, { 0: { f: mm(`${k}_npv`), v: c.npv } }, { answer: true });
        S.line(`s_${k}_req`, `   return the equity requires, ${title}`, { 0: { f: mm(`${k}_req`), v: c.required_return, fmt: FMT_PCT } });
      }
    }
    S.section('Credit by year (closing balances)');
    S.header(years(1, N));
    S.line('s_netlev', 'Net leverage', per(1, N, (t) => ({ f: mm('net_lev', t), v: o.credit[t - 1].net_leverage, fmt: FMT_MULT })));
    S.line('s_icr', 'Interest cover (EBITDA ÷ cash interest)', per(1, N, (t) => ({ f: mm('icr', t), v: o.credit[t - 1].icr, fmt: FMT_MULT })));
    S.line('s_dscr', 'Debt service cover', per(1, N, (t) => ({ f: mm('dscr', t), v: o.credit[t - 1].dscr, fmt: FMT_MULT })));
    S.line('s_debt_close', 'Debt at year end', per(1, N, (t) => ({ f: mm('debt_close', t), v: o.balance_sheet[t].debt_at_par })));
    S.section('Integrity');
    // live mirrors of the Checks-sheet WARNINGS: a deal that breaches its cash floor, or whose
    // exit does not cover the debt, is flagged on the page the reader opens first
    S.line('s_cashwarn', 'Cash below the minimum, summed over the hold (0 = never; else the deal needs more liquidity)', { 0: { f: C.ext('wn_cash', 0), v: null } }, { noParity: true });
    S.line('s_shortfall', 'Debt the exit does not cover (0 = covered; else the lenders’ loss)', { 0: { f: mm('shortfall'), v: ex.debt_shortfall_at_exit } });
    S.line('s_checks', 'Model checks total (must read 0 — see the Checks sheet)', { 0: { f: C.ext('ck_total', 0), v: 0, fmt: '0.000000' } }, { bold: true });
  }

  // ═══════════════════════════════ METHODOLOGY ═══════════════════════════════
  {
    const ws = wb.addWorksheet('Methodology', { properties: { tabColor: { argb: GREY } }, views: [{ showGridLines: false }] });
    ws.getColumn(1).width = 2;
    ws.getColumn(2).width = 44;
    ws.getColumn(3).width = 120;
    const t = ws.getCell('B1');
    t.value = 'Assumptions and methodology (SPEC §15) — what this model simplifies, and why';
    t.font = { bold: true, size: 14, color: { argb: NAVY } };
    DISCLOSURES.forEach(([what, why], i) => {
      const r = i + 3;
      const a1 = ws.getCell(`B${r}`);
      a1.value = what;
      a1.font = { bold: true };
      a1.alignment = { vertical: 'top', wrapText: true };
      const b1 = ws.getCell(`C${r}`);
      b1.value = why;
      b1.alignment = { vertical: 'top', wrapText: true };
    });
    if (nz) {
      const r = DISCLOSURES.length + 3;
      const a1 = ws.getCell(`B${r}`);
      a1.value = 'Normalisation of the sourced figures';
      a1.font = { bold: true };
      a1.alignment = { vertical: 'top', wrapText: true };
      const b1 = ws.getCell(`C${r}`);
      b1.value = nz.as_reported
        ? 'The deal is modelled on the figures as reported: the analyst chose to apply no normalisation.'
        : 'Revenue, EBITDA and net debt were normalised before modelling. Every restated figure and every adjustment is itemised on the Normalisation sheet, which the Inputs sheet references. An add-back marked as continuing (SPEC §27) is in the price and leverage basis but not in the forecast margin base, because the cost keeps being paid in cash; every other add-back is in both.';
      b1.alignment = { vertical: 'top', wrapText: true };
    }
  }

  // ═══════════════════ resolve symbolic references, write formulas ═══════════════════
  for (const p of pending) {
    const formula = p.formula.replace(REF, (_all, sheetName: string, key: string, tStr: string, abs: string) => {
      const target = sheets.get(sheetName);
      if (!target) throw new Error(`workbook: unknown sheet ${sheetName}`);
      const row = target.row(key);
      const col = Y(Number(tStr));
      if (sheetName === p.sheet.name) return abs === '1' ? `$${col}$${row}` : `${col}${row}`;
      return `'${sheetName}'!$${col}$${row}`;
    });
    p.sheet.ws.getCell(p.addr).value = opts.cachedResults && p.result !== null ? { formula, result: p.result } : { formula };
  }
  // named ranges for the inputs an analyst flexes most (they survive row insertions in Excel)
  const named: [string, string][] = [
    ['exit_mult', 'Exit_Multiple'], ['entry_mult', 'Entry_Multiple'], ['entry_ev', 'Purchase_Price'],
    ['tax_rate', 'Tax_Rate'], ['min_cash', 'Minimum_Cash'], ['exit_fee', 'Exit_Fees_Pct'], ['hold', 'Hold_Years'],
  ];
  for (const [key, name] of named) {
    const r = I.rows.get(key);
    if (r !== undefined) wb.definedNames.add(`'Inputs'!$D$${r}`, name);
  }
  // print areas: the whole used block of each sheet, landscape, one page wide
  for (const b of [S, I, M, X, C]) b.ws.pageSetup.printArea = `A1:${colLetter(b.ws.columnCount)}${b.ws.rowCount}`;
  return { wb, parity };
}
