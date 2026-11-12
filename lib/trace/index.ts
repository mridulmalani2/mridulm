/**
 * lib/trace — where a number comes from.
 *
 * The exported Excel model is a complete, labelled formula graph of the deal, held to the engine
 * by the recalculation-parity suite. Tracing reads THAT graph: a figure is found by the label of
 * its row, and its formula's cell references are its precedents. Nothing is re-derived here, so
 * the trace on screen and the workbook a reviewer opens are the same thing by construction.
 */
import type { Workbook, Worksheet } from 'exceljs';
import type { Engine2ModelOutput } from '../engine2/facade';
import { buildFormulaWorkbook } from '../engine2/workbook';

export interface TraceNode {
  /** `Sheet!A1` */
  key: string;
  sheet: string;
  addr: string;
  /** The row's label in the workbook, without the formula note after "=". */
  label: string;
  /** The words after "=" in the row label, when the workbook states the formula in prose. */
  rule: string | null;
  /** "Close", "Year 3", or null for a figure that is not on the year axis. */
  period: string | null;
  unit: string | null;
  value: number | string | null;
  /** The cell's number format, so a caller can render the value as the workbook does. */
  format: string | null;
  /** The Excel formula as written (null for a typed input). */
  formula: string | null;
  /** True when the cell is a typed input on the Inputs sheet. */
  is_input: boolean;
  /** Cells the formula reads, in the order they appear. */
  precedents: string[];
}

/** One piece of a formula: plain text (functions, operators, constants) or a reference to cells. */
export type TracePart =
  | { kind: 'text'; text: string }
  | { kind: 'ref'; /** The cells referenced; a range lists its corners when it is long. */ keys: string[]; label: string; /** "Year 2", or "Close to Year 5" for a range along the year axis. */ span: string | null };

/** The cells one row contributes to a formula: a single figure, or a run of years of the same row. */
export interface TraceGroup { label: string; sheet: string; cells: TraceNode[] }

export interface TraceIndex {
  node: (key: string) => TraceNode | null;
  /** Find a figure by its row label (and year, for a yearly row). `sheet` defaults to the Model. */
  find: (label: string, year?: number, sheet?: string) => TraceNode | null;
  /** The formula with each reference replaced by the referenced row's label. */
  readable: (node: TraceNode) => string | null;
  /** The formula split into text and references, in the order written, for display. */
  parts: (node: TraceNode) => TracePart[];
  /** The precedents grouped by the row they sit on, in the order the formula reads them. */
  groups: (node: TraceNode) => TraceGroup[];
  /** The typed inputs the figure ultimately rests on, nearest first. `complete` is false when the
   *  walk stopped at its limit, so the list is then a part of them. */
  inputsBehind: (node: TraceNode, limit?: number) => { inputs: TraceNode[]; complete: boolean };
}

const COL = (n: number): string => { let s = ''; for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; };
const colNum = (letters: string): number => letters.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const norm = (s: string) => clean(s).toLowerCase();
const MAX_RANGE = 40;

/** `'Sheet'!$A$1`, `Sheet!A1:B2`, `A1`, `$D$5:$I$5` — with the sheet (if any) and both corners. */
const REF = /(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_.]*))?!?(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?/g;

export function buildTraceIndex(output: Engine2ModelOutput): TraceIndex {
  const { wb, parity } = buildFormulaWorkbook(output, { cachedResults: true }) as { wb: Workbook; parity: { sheet: string; addr: string; label: string }[] };
  const names = new Map<string, string>();
  for (const d of ((wb.definedNames as unknown as { model?: { name: string; ranges: string[] }[] }).model ?? [])) {
    if (d.ranges?.[0]) names.set(d.name, d.ranges[0].replace(/\$/g, '').replace(/'/g, ''));
  }
  const cache = new Map<string, TraceNode | null>();
  /** How many cells of each labelled row the model fills: one ⇒ a single figure, more ⇒ a yearly row. */
  const perRow = new Map<string, number>();
  for (const p of parity) { const k = `${p.sheet}!${p.addr.replace(/^[A-Z]+/, '')}`; perRow.set(k, (perRow.get(k) ?? 0) + 1); }
  const sheetOf = (name: string): Worksheet | undefined => wb.getWorksheet(name);

  /** The header row of the year axis on a sheet: the row whose cells read "Close" / "Year n". */
  const axisCache = new Map<string, Map<number, string>>();
  const axisOf = (ws: Worksheet): Map<number, string> => {
    const hit = axisCache.get(ws.name);
    if (hit) return hit;
    const axis = new Map<number, string>();
    ws.eachRow((row) => {
      if (axis.size) return;
      const found = new Map<number, string>();
      row.eachCell((c, col) => { if (typeof c.value === 'string' && /^(Close|Year \d+)$/.test(c.value)) found.set(col, c.value); });
      if (found.size >= 1 && [...found.values()].some((v) => v.startsWith('Year'))) found.forEach((v, k) => axis.set(k, v));
    });
    axisCache.set(ws.name, axis);
    return axis;
  };

  const precedentsOf = (sheet: string, formula: string): string[] => {
    const out: string[] = [];
    const add = (k: string) => { if (!out.includes(k)) out.push(k); };
    // strings inside the formula ("N/A", ">0") are not references
    let text = formula.replace(/"[^"]*"/g, '""');
    for (const [name, target] of names) text = text.replace(new RegExp(`\\b${name}\\b`, 'g'), target);
    for (const m of text.matchAll(REF)) {
      const explicit = m[1] ?? m[2];
      // a bare word before "(" is a function (MAX, IRR, LOG10); a bare word before "!" is a sheet
      if (m[2] && !m[0].includes('!')) continue;
      const before = text[m.index! - 1];
      if (before && /[A-Za-z0-9_.]/.test(before) && !explicit) continue;
      const after = text[m.index! + m[0].length];
      if (after === '(') continue;
      const sh = explicit ?? sheet;
      if (!sheetOf(sh)) continue;
      const a = m[3].replace(/\$/g, '');
      if (!m[4]) { add(`${sh}!${a}`); continue; }
      const b = m[4].replace(/\$/g, '');
      const [, c1, r1] = /^([A-Z]+)(\d+)$/.exec(a)!;
      const [, c2, r2] = /^([A-Z]+)(\d+)$/.exec(b)!;
      const cells: string[] = [];
      for (let r = Number(r1); r <= Number(r2); r++) for (let c = colNum(c1); c <= colNum(c2); c++) cells.push(`${sh}!${COL(c)}${r}`);
      (cells.length > MAX_RANGE ? [cells[0], cells[cells.length - 1]] : cells).forEach(add);
    }
    return out;
  };

  const node = (key: string): TraceNode | null => {
    if (cache.has(key)) return cache.get(key)!;
    const [sheet, addr] = key.split('!');
    const ws = sheetOf(sheet);
    const m = /^([A-Z]+)(\d+)$/.exec(addr ?? '');
    if (!ws || !m) { cache.set(key, null); return null; }
    const cell = ws.getCell(addr);
    const raw = cell.value as unknown;
    const isFormula = raw !== null && typeof raw === 'object' && 'formula' in (raw as object);
    const formula = isFormula ? String((raw as { formula: string }).formula) : null;
    const result = isFormula ? (raw as { result?: unknown }).result : raw;
    // a constant written as a formula ("=0") carries no cached result: its value is the constant
    const constant = formula !== null && /^-?[\d.]+$/.test(formula) ? Number(formula) : null;
    const value = typeof result === 'number' || typeof result === 'string' ? result : constant;
    if (value === null && formula === null) { cache.set(key, null); return null; }
    const row = ws.getRow(Number(m[2]));
    const rowLabel = [2, 1, 3].map((c) => row.getCell(c).value).find((v) => typeof v === 'string' && v.trim() !== '') as string | undefined;
    const [label, rule] = (rowLabel ?? addr).split(/\s{2,}=\s{2,}/);
    const unit = typeof row.getCell(3).value === 'string' && row.getCell(3).value !== rowLabel ? String(row.getCell(3).value) : null;
    // a constant written as a formula ("=0") reads nothing
    const precedents = formula && !/^-?[\d.]+$/.test(formula) ? precedentsOf(sheet, formula) : [];
    const n: TraceNode = {
      key, sheet, addr, label: clean(label), rule: rule ? clean(rule) : null,
      // a figure that exists once (an IRR, a multiple) is not "at close": only a yearly row has a period
      period: (perRow.get(`${sheet}!${m[2]}`) ?? 2) > 1 ? axisOf(ws).get(colNum(m[1])) ?? null : null, unit,
      value, format: cell.numFmt ?? null,
      formula: formula && !/^-?[\d.]+$/.test(formula) ? formula : null,
      is_input: sheet === 'Inputs' && (formula === null || /^-?[\d.]+$/.test(formula)),
      precedents,
    };
    cache.set(key, n);
    return n;
  };

  const rows = parity.map((p) => {
    const mm = /^(.*) \[(\d+)\]$/.exec(p.label);
    const full = mm ? mm[1] : p.label;
    return { sheet: p.sheet, addr: p.addr, label: norm(full.split(/\s{2,}=\s{2,}/)[0]), year: mm ? Number(mm[2]) : 0 };
  });

  const find = (label: string, year?: number, sheet = 'Model'): TraceNode | null => {
    const want = norm(label);
    const inSheet = rows.filter((r) => r.sheet === sheet);
    // an exact label, or the same label followed by a bracketed qualifier ("Enterprise value (the
    // purchase price)"). Never a looser match: a wrong trace is worse than none.
    const exact = inSheet.filter((r) => r.label === want);
    const loose = exact.length ? exact : inSheet.filter((r) => r.label.startsWith(`${want} (`));
    if (!loose.length) return null;
    const first = loose[0].label;
    const same = loose.filter((r) => r.label === first);
    const hit = year === undefined ? same[0] : same.find((r) => r.year === year);
    return hit ? node(`${hit.sheet}!${hit.addr}`) : null;
  };

  const readable = (n: TraceNode): string | null => {
    if (!n.formula) return null;
    let text = n.formula;
    for (const [name, target] of names) text = text.replace(new RegExp(`\\b${name}\\b`, 'g'), target);
    return text.replace(REF, (whole, q: string | undefined, bare: string | undefined, a: string, b: string | undefined) => {
      if (bare && !whole.includes('!')) return whole;
      const sh = q ?? bare ?? n.sheet;
      if (!sheetOf(sh)) return whole;
      const name = (addr: string) => {
        const p = node(`${sh}!${addr.replace(/\$/g, '')}`);
        return p ? `${p.label}${p.period && p.period !== n.period ? `, ${p.period}` : ''}` : addr.replace(/\$/g, '');
      };
      return b ? `[${name(a)} to ${name(b)}]` : `[${name(a)}]`;
    });
  };

  const parts = (n: TraceNode): TracePart[] => {
    if (!n.formula) return [];
    let text = n.formula;
    for (const [name, target] of names) text = text.replace(new RegExp(`\\b${name}\\b`, 'g'), target);
    // quoted strings are text, never references: split them out first
    const out: TracePart[] = [];
    const push = (t: string) => { if (!t) return; const last = out[out.length - 1]; if (last && last.kind === 'text') last.text += t; else out.push({ kind: 'text', text: t }); };
    for (const chunk of text.split(/("[^"]*")/)) {
      if (chunk.startsWith('"')) { push(chunk); continue; }
      let at = 0;
      for (const m of chunk.matchAll(REF)) {
        const explicit = m[1] ?? m[2];
        const before = chunk[m.index! - 1];
        const after = chunk[m.index! + m[0].length];
        const sh = explicit ?? n.sheet;
        if ((m[2] && !m[0].includes('!')) || (before && /[A-Za-z0-9_.]/.test(before) && !explicit) || after === '(' || !sheetOf(sh)) continue;
        const a = node(`${sh}!${m[3].replace(/\$/g, '')}`);
        const b = m[4] ? node(`${sh}!${m[4].replace(/\$/g, '')}`) : null;
        if (!a) continue;
        push(chunk.slice(at, m.index!));
        at = m.index! + m[0].length;
        const keys = precedentsOf(n.sheet, m[0]);
        const sameRow = b !== null && b.label === a.label;
        out.push({
          kind: 'ref', keys: keys.length ? keys : [a.key],
          label: b && !sameRow ? `${a.label} to ${b.label}` : a.label,
          span: b && sameRow && a.period && b.period ? `${a.period} to ${b.period}` : !b && a.period && a.period !== n.period ? a.period : null,
        });
      }
      push(chunk.slice(at));
    }
    return out;
  };

  const groups = (n: TraceNode): TraceGroup[] => {
    const out: TraceGroup[] = [];
    for (const k of n.precedents) {
      const p = node(k);
      if (!p) continue;
      const row = p.addr.replace(/^[A-Z]+/, '');
      const last = out[out.length - 1];
      if (last && last.sheet === p.sheet && last.cells[0].addr.replace(/^[A-Z]+/, '') === row && p.period !== null) last.cells.push(p);
      else out.push({ label: p.label, sheet: p.sheet, cells: [p] });
    }
    return out;
  };

  const inputsBehind = (n: TraceNode, limit = 1500): { inputs: TraceNode[]; complete: boolean } => {
    const seen = new Set<string>([n.key]);
    const inputs: TraceNode[] = [];
    let queue = [...n.precedents];
    while (queue.length && seen.size < limit) {
      const next: string[] = [];
      for (const k of queue) {
        if (seen.has(k) || seen.size >= limit) continue;
        seen.add(k);
        const p = node(k);
        if (!p) continue;
        if (p.is_input) inputs.push(p);
        else next.push(...p.precedents);
      }
      queue = next;
    }
    return { inputs, complete: queue.length === 0 };
  };

  return { node, find, readable, parts, groups, inputsBehind };
}

const indexes = new WeakMap<Engine2ModelOutput, TraceIndex>();
/** One index per model output; built on first use. */
export function traceIndexFor(output: Engine2ModelOutput): TraceIndex {
  let ix = indexes.get(output);
  if (!ix) { ix = buildTraceIndex(output); indexes.set(output, ix); }
  return ix;
}

/** Render a traced value the way the workbook formats it. */
export function formatTraced(n: Pick<TraceNode, 'value' | 'format'>): string {
  if (n.value === null) return '–';
  if (typeof n.value === 'string') return n.value;
  const f = n.format ?? '';
  const fixed = (v: number, dp: number) => v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  if (f.includes('%')) return `${fixed(n.value * 100, 2)}%`;
  if (f.includes('"x"')) return `${fixed(n.value, 2)}x`;
  if (Number.isInteger(n.value) && Math.abs(n.value) < 1000 && !f.includes('.')) return String(n.value);
  const body = fixed(Math.abs(n.value), 2);
  return n.value < 0 ? `(${body})` : body;
}
