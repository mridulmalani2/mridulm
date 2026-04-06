/** Client-side Excel export engine -- 8-sheet professional PE workbook. */

import type {
  ModelState,
  AnnualProjectionYear,
} from '../dealEngineTypes';

let ExcelJS: typeof import('exceljs') | null = null;

async function getExcelJS() {
  if (!ExcelJS) {
    ExcelJS = await import('exceljs');
  }
  return ExcelJS;
}

type WS = import('exceljs').Worksheet;
type WB = import('exceljs').Workbook;

// ── Design System ────────────────────────────────────────────────────────

const CCY_SYMBOLS: Record<string, string> = { GBP: '\u00a3', EUR: '\u20ac', USD: '$', INR: '₹', JPY: '¥' };

// Colors
const NAVY = 'FF1a2744';
const WHITE = 'FFFFFFFF';
const LIGHT_GREY = 'FFf5f7fa';
const MID_GREY = 'FFe8ebf0';
const BORDER_GREY = 'FFd0d5dd';
const GREEN_C = 'FF006100';
const GREEN_BG = 'FFe6f4ea';
const RED_C = 'FF9C0006';
const RED_BG = 'FFfce8e6';
const AMBER_C = 'FF9C6500';
const AMBER_BG = 'FFfef7e0';
const BLUE_INPUT = 'FF0000FF';
const ACCENT_RED = 'FFCC0000';

// Fills
const NAVY_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: NAVY } };
const LIGHT_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: LIGHT_GREY } };
const MID_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: MID_GREY } };
const GREEN_BG_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: GREEN_BG } };
const RED_BG_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: RED_BG } };
const AMBER_BG_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: AMBER_BG } };
const ACCENT_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: ACCENT_RED } };

// Fonts
const F_TITLE = { name: 'Calibri', size: 18, bold: true, color: { argb: NAVY } };
const F_SUBTITLE = { name: 'Calibri', size: 11, color: { argb: 'FF666666' } };
const F_HEADER = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
const F_SECTION = { name: 'Calibri', size: 11, bold: true, color: { argb: NAVY } };
const F_BODY = { name: 'Calibri', size: 10, color: { argb: 'FF111111' } };
const F_BODY_BOLD = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF111111' } };
const F_INPUT = { name: 'Calibri', size: 10, color: { argb: BLUE_INPUT } };
const F_GREEN = { name: 'Calibri', size: 10, bold: true, color: { argb: GREEN_C } };
const F_RED = { name: 'Calibri', size: 10, bold: true, color: { argb: RED_C } };
const F_AMBER = { name: 'Calibri', size: 10, bold: true, color: { argb: AMBER_C } };
const F_COVER_METRIC = { name: 'Calibri', size: 22, bold: true, color: { argb: NAVY } };
const F_COVER_LABEL = { name: 'Calibri', size: 9, color: { argb: 'FF888888' } };
const F_WHITE_LG = { name: 'Calibri', size: 12, bold: true, color: { argb: WHITE } };

// Borders
const THIN_BOTTOM = { bottom: { style: 'thin' as const, color: { argb: BORDER_GREY } } };
const MED_BOTTOM = { bottom: { style: 'medium' as const, color: { argb: NAVY } } };
const THICK_BOTTOM = { bottom: { style: 'thick' as const, color: { argb: NAVY } } };

// Number formats
const FMT_CCY = '#,##0.0;(#,##0.0);"-"';
const FMT_PCT = '0.0%;(0.0%);"-"';
const FMT_MULT = '0.0"x"';
const FMT_NUM = '#,##0.0;(#,##0.0);"-"';
const FMT_INT = '#,##0';

// ── Formula helpers ──────────────────────────────────────────────────────

/** 1-based column number → Excel letter. 1→A, 2→B, 26→Z, 27→AA */
function cl(n: number): string {
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

/** Cell reference string, e.g. cr(3,2) → "B3" */
function cr(r: number, c: number): string { return `${cl(c)}${r}`; }

/** Build a formula value object for ExcelJS */
function fv(formula: string, result: number): { formula: string; result: number } {
  return { formula, result };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CellVal = number | string | null | { formula: string; result: number };

function irrFont(irr: number | null) {
  if (irr == null) return F_BODY;
  if (irr > 0.25) return F_GREEN;
  if (irr >= 0.15) return F_AMBER;
  return F_RED;
}

function irrBgFill(irr: number | null) {
  if (irr == null) return undefined;
  if (irr > 0.25) return GREEN_BG_FILL;
  if (irr >= 0.15) return AMBER_BG_FILL;
  return RED_BG_FILL;
}

function verdictFont(v: string) {
  if (v === 'aggressive') return F_RED;
  if (v === 'conservative') return F_AMBER;
  return F_GREEN;
}

function verdictBg(v: string) {
  if (v === 'aggressive') return RED_BG_FILL;
  if (v === 'conservative') return AMBER_BG_FILL;
  return GREEN_BG_FILL;
}

function severityFont(s: string) { return s === 'critical' ? F_RED : F_AMBER; }
function severityBg(s: string) { return s === 'critical' ? RED_BG_FILL : AMBER_BG_FILL; }

// ── Helpers ─────────────────────────────────────────────────────────────

function styleHeaderRow(ws: WS, row: number, fromCol: number, toCol: number) {
  for (let c = fromCol; c <= toCol; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = NAVY_FILL;
    cell.font = F_HEADER;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BOTTOM;
  }
}

function writeSectionHeader(ws: WS, row: number, title: string, maxCol: number): number {
  ws.mergeCells(row, 1, row, maxCol);
  const cell = ws.getCell(row, 1);
  cell.value = title;
  cell.font = F_SECTION;
  cell.border = MED_BOTTOM;
  cell.alignment = { vertical: 'middle' };
  ws.getRow(row).height = 22;
  return row + 1;
}

function writeDataRow(
  ws: WS, row: number, label: string,
  values: CellVal[],
  fmt: string = FMT_CCY,
  options: { alt?: boolean; bold?: boolean; topBorder?: boolean; font?: object; inputCols?: Set<number> } = {},
): number {
  const labelCell = ws.getCell(row, 1);
  labelCell.value = label;
  labelCell.font = options.bold ? F_BODY_BOLD : F_BODY;
  labelCell.border = THIN_BOTTOM;
  if (options.alt) labelCell.fill = LIGHT_FILL;

  for (let i = 0; i < values.length; i++) {
    const cell = ws.getCell(row, i + 2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cell.value = values[i] as any;
    const isInput = options.inputCols?.has(i);
    cell.font = isInput ? F_INPUT : (options.font || (options.bold ? F_BODY_BOLD : F_BODY));
    cell.numFmt = fmt;
    cell.alignment = { horizontal: 'right' };
    cell.border = options.topBorder
      ? { top: { style: 'medium' as const, color: { argb: NAVY } }, bottom: { style: 'thin' as const, color: { argb: BORDER_GREY } } }
      : THIN_BOTTOM;
    if (options.alt) cell.fill = LIGHT_FILL;
  }
  return row + 1;
}

function writeKvRow(
  ws: WS, row: number, label: string, value: string | number | null,
  options: { fmt?: string; font?: object; labelFont?: object; alt?: boolean; input?: boolean } = {},
): number {
  const lc = ws.getCell(row, 1);
  lc.value = label;
  lc.font = options.labelFont || F_BODY;
  lc.border = THIN_BOTTOM;
  if (options.alt) lc.fill = LIGHT_FILL;

  const vc = ws.getCell(row, 2);
  vc.value = value;
  vc.font = options.input ? F_INPUT : (options.font || F_BODY);
  if (options.fmt) vc.numFmt = options.fmt;
  else if (typeof value === 'number' && Math.abs(value) < 1 && value !== 0) vc.numFmt = FMT_PCT;
  else if (typeof value === 'number') vc.numFmt = FMT_CCY;
  vc.alignment = { horizontal: 'right' };
  vc.border = THIN_BOTTOM;
  if (options.alt) vc.fill = LIGHT_FILL;
  return row + 1;
}

function freezeAndPrint(ws: WS, freezeRow: number, freezeCol: number, landscape = true) {
  const ySplit = Math.max(0, freezeRow - 1);
  const xSplit = Math.max(0, freezeCol - 1);

  if (ySplit > 0 || xSplit > 0) {
    // Compute correct topLeftCell (the first unfrozen cell)
    const colLetter = String.fromCharCode(65 + xSplit); // A=0, B=1, etc.
    const topLeftCell = `${colLetter}${ySplit + 1}`;
    const activePane = xSplit > 0 && ySplit > 0 ? 'bottomRight'
      : ySplit > 0 ? 'bottomLeft'
      : 'topRight';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ws.views = [{ state: 'frozen', xSplit, ySplit, topLeftCell, activePane } as any];
  }

  ws.pageSetup = {
    orientation: landscape ? 'landscape' : 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };
  ws.headerFooter = {
    oddFooter: '&L&8Deal Intelligence Engine&C&8Confidential&R&8Page &P of &N',
  };
}

// ── Cross-sheet reference types ─────────────────────────────────────────

/** Cell references from the Assumptions sheet, used by P&L and Cash Flow. */
interface AssumptionCells {
  baseRevenue: string;
  baseMargin: string;
  ltmEbitda: string;
  entryMultiple: string;
  ev: string;
  holdingPeriod: string;
  exitMultiple: string;
  targetMargin: string;
  daPct: string;
  capexPct: string;
  nwcPct: string;
  taxRate: string;
  entryFeePct: string;
  exitFeePct: string;
  monitoringFee: string;
  financingFeePct: string;
  /** Cross-sheet ref for growth rate in year i (0-based). */
  growthRate: (i: number) => string;
  /** Cross-sheet ref for EBITDA margin in year i (0-based). */
  margin: (i: number) => string;
  /** Cross-sheet ref for entry margin (col B in schedule row). */
  entryMargin: string;
}

/** Row positions from the P&L sheet, used by Cash Flow. */
interface PLRefs {
  revenueRow: number;
  ebitdaAdjRow: number;
  taxRow: number;
  entryCol: number;
}

const ASHEET = "'Assumptions'";
const PLSHEET = "'P&L'";

// ── Main Export ──────────────────────────────────────────────────────────

export async function buildExcel(state: ModelState): Promise<Blob> {
  const { Workbook } = await getExcelJS();
  const wb = new Workbook();
  wb.creator = 'Deal Intelligence Engine';
  wb.created = new Date();

  const ccy = CCY_SYMBOLS[state.currency] || '\u00a3';
  const hp = state.exit.holding_period;
  const years = state.projections.years;
  const ds = state.debt_schedule;

  buildCoverSheet(wb, state, ccy);
  buildSourcesUsesSheet(wb, state, ccy);
  const aRefs = buildAssumptionsSheet(wb, state, ccy);
  const plRefs = buildPLSheet(wb, state, ccy, hp, years, aRefs);
  buildCashFlowDebtSheet(wb, state, ccy, hp, years, ds, aRefs, plRefs);
  buildReturnsSheet(wb, state, ccy, aRefs);
  if (state.scenarios.length || state.sensitivity_tables.length) {
    buildScenariosSheet(wb, state, ccy);
  }
  buildRiskSheet(wb, state, ccy, hp);

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ── Sheet 1: Cover ──────────────────────────────────────────────────────

function buildCoverSheet(wb: WB, state: ModelState, ccy: string) {
  const ws = wb.addWorksheet('Cover', { properties: { tabColor: { argb: ACCENT_RED.slice(2) } } });
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 24;
  ws.getColumn(3).width = 20;
  ws.getColumn(4).width = 20;
  ws.getColumn(5).width = 20;
  ws.getColumn(6).width = 20;
  ws.getColumn(7).width = 4;

  // Top accent bar
  for (let c = 1; c <= 7; c++) {
    ws.getCell(1, c).fill = ACCENT_FILL;
    ws.getCell(2, c).fill = ACCENT_FILL;
  }
  ws.getRow(1).height = 4;
  ws.getRow(2).height = 4;

  let row = 4;
  ws.mergeCells(row, 2, row, 6);
  ws.getCell(row, 2).value = 'DEAL INTELLIGENCE ENGINE';
  ws.getCell(row, 2).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF999999' } };
  ws.getCell(row, 2).alignment = { horizontal: 'left' };
  row += 1;

  ws.mergeCells(row, 2, row, 6);
  ws.getCell(row, 2).value = state.deal_name;
  ws.getCell(row, 2).font = F_TITLE;
  row += 1;

  ws.mergeCells(row, 2, row, 6);
  ws.getCell(row, 2).value = `${state.sector}  |  ${state.currency}  |  ${state.exit.holding_period}-Year Hold`;
  ws.getCell(row, 2).font = F_SUBTITLE;
  row += 2;

  // Horizontal line
  for (let c = 2; c <= 6; c++) ws.getCell(row, c).border = { top: { style: 'medium' as const, color: { argb: NAVY } } };
  row += 1;

  // Key metrics in a 2x3 grid
  const ret = state.returns;
  const metrics: [string, string | number, string][] = [
    [`EQUITY IRR${state.exit.mid_year_convention ? ' (MID-YR)' : ''}`, ret.irr != null ? ret.irr : 'N/A', FMT_PCT],
    ['MOIC', ret.moic, FMT_MULT],
    ['ENTRY EV', state.entry.enterprise_value, `${ccy}#,##0.0"m"`],
    ['ENTRY EQUITY', ret.entry_equity, `${ccy}#,##0.0"m"`],
    ['EXIT EV', ret.exit_ev, `${ccy}#,##0.0"m"`],
    ['LEVERAGE', state.entry.leverage_ratio, FMT_MULT],
  ];

  const cols = [2, 4, 6];
  for (let i = 0; i < metrics.length; i++) {
    const [label, value, fmt] = metrics[i];
    const c = cols[i % 3];
    const r = row + Math.floor(i / 3) * 3;

    ws.getCell(r, c).value = value;
    ws.getCell(r, c).font = F_COVER_METRIC;
    if (typeof value === 'number') ws.getCell(r, c).numFmt = fmt;
    if (label === 'EQUITY IRR' && typeof value === 'number') ws.getCell(r, c).font = { ...F_COVER_METRIC, color: irrFont(value as number).color };

    ws.getCell(r + 1, c).value = label;
    ws.getCell(r + 1, c).font = F_COVER_LABEL;
  }

  row += 7;
  for (let c = 2; c <= 6; c++) ws.getCell(row, c).border = { top: { style: 'thin' as const, color: { argb: BORDER_GREY } } };
  row += 1;

  // Scenario summary if available
  if (state.scenarios.length) {
    ws.mergeCells(row, 2, row, 6);
    ws.getCell(row, 2).value = 'SCENARIO OVERVIEW';
    ws.getCell(row, 2).font = F_SECTION;
    ws.getCell(row, 2).border = MED_BOTTOM;
    row += 1;

    const scHeaders = ['', ...state.scenarios.map(s => s.name.toUpperCase())];
    for (let i = 0; i < scHeaders.length; i++) {
      ws.getCell(row, i + 2).value = scHeaders[i];
    }
    styleHeaderRow(ws, row, 2, 2 + scHeaders.length - 1);
    row += 1;

    // IRR row
    ws.getCell(row, 2).value = 'IRR'; ws.getCell(row, 2).font = F_BODY;
    state.scenarios.forEach((s, i) => {
      const c = ws.getCell(row, i + 3);
      c.value = s.irr;
      c.numFmt = FMT_PCT;
      c.font = irrFont(s.irr);
      const bg = irrBgFill(s.irr);
      if (bg) c.fill = bg;
    });
    row += 1;

    ws.getCell(row, 2).value = 'MOIC'; ws.getCell(row, 2).font = F_BODY;
    state.scenarios.forEach((s, i) => {
      const c = ws.getCell(row, i + 3);
      c.value = s.moic;
      c.numFmt = FMT_MULT;
      c.font = F_BODY;
    });
    row += 1;

    ws.getCell(row, 2).value = 'Exit Multiple'; ws.getCell(row, 2).font = F_BODY;
    state.scenarios.forEach((s, i) => {
      const c = ws.getCell(row, i + 3);
      c.value = s.exit_multiple;
      c.numFmt = FMT_MULT;
      c.font = F_BODY;
    });
    row += 2;
  }

  // Reality check verdict
  const rc = state.exit_reality_check;
  ws.mergeCells(row, 2, row, 3);
  ws.getCell(row, 2).value = 'EXIT REALITY CHECK';
  ws.getCell(row, 2).font = F_SECTION;
  ws.getCell(row, 4).value = rc.verdict.toUpperCase();
  ws.getCell(row, 4).font = verdictFont(rc.verdict);
  ws.getCell(row, 4).fill = verdictBg(rc.verdict);
  ws.getCell(row, 4).alignment = { horizontal: 'center' };
  row += 1;

  row += 3;

  // Footer
  ws.mergeCells(row, 2, row, 6);
  ws.getCell(row, 2).value = `Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} | Deal Intelligence Engine | Confidential`;
  ws.getCell(row, 2).font = { name: 'Calibri', size: 8, color: { argb: 'FF999999' } };

  freezeAndPrint(ws, 1, 1, false);
}

// ── Sheet 2: Sources & Uses ─────────────────────────────────────────────

function buildSourcesUsesSheet(wb: WB, state: ModelState, ccy: string) {
  const ws = wb.addWorksheet('Sources & Uses', { properties: { tabColor: { argb: NAVY.slice(2) } } });
  ws.getColumn(1).width = 32;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 6;
  ws.getColumn(5).width = 32;
  ws.getColumn(6).width = 18;
  ws.getColumn(7).width = 14;

  const su = state.sources_and_uses;
  let row = 1;

  // Title
  ws.mergeCells(row, 1, row, 7);
  ws.getCell(row, 1).value = `${state.deal_name} - Sources & Uses (${ccy}m)`;
  ws.getCell(row, 1).font = F_SECTION;
  ws.getCell(row, 1).border = THICK_BOTTOM;
  row += 2;

  // Side-by-side: Uses (left) | Sources (right)
  // Headers
  ws.getCell(row, 1).value = 'USES'; ws.getCell(row, 2).value = `${ccy}m`; ws.getCell(row, 3).value = '% Total';
  ws.getCell(row, 5).value = 'SOURCES'; ws.getCell(row, 6).value = `${ccy}m`; ws.getCell(row, 7).value = '% Total';
  styleHeaderRow(ws, row, 1, 3);
  styleHeaderRow(ws, row, 5, 7);
  row += 1;

  const total = su.total_uses || 1;
  const pctOf = (v: number) => v / total;

  // Uses — track rows for SUM formula
  let ur = row;
  const usesStartRow = ur;
  const writeUse = (label: string, amt: number, alt: boolean) => {
    ws.getCell(ur, 1).value = label; ws.getCell(ur, 1).font = F_BODY; ws.getCell(ur, 1).border = THIN_BOTTOM;
    ws.getCell(ur, 2).value = amt; ws.getCell(ur, 2).font = F_INPUT; ws.getCell(ur, 2).numFmt = FMT_CCY; ws.getCell(ur, 2).border = THIN_BOTTOM;
    ws.getCell(ur, 3).value = pctOf(amt); ws.getCell(ur, 3).font = F_BODY; ws.getCell(ur, 3).numFmt = FMT_PCT; ws.getCell(ur, 3).border = THIN_BOTTOM;
    if (alt) { for (let c = 1; c <= 3; c++) ws.getCell(ur, c).fill = LIGHT_FILL; }
    ur++;
  };
  writeUse('Enterprise Value', su.enterprise_value, false);
  writeUse('Transaction Fees', su.transaction_fees, true);
  writeUse('Financing Fees', su.financing_fees, false);
  if (su.cash_to_balance_sheet > 0) writeUse('Cash to Balance Sheet', su.cash_to_balance_sheet, true);
  // Total uses = SUM formula
  const usesEndRow = ur - 1;
  ws.getCell(ur, 1).value = 'Total Uses'; ws.getCell(ur, 1).font = F_BODY_BOLD;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws.getCell(ur, 2).value = { formula: `SUM(${cr(usesStartRow, 2)}:${cr(usesEndRow, 2)})`, result: su.total_uses } as any;
  ws.getCell(ur, 2).font = F_BODY_BOLD; ws.getCell(ur, 2).numFmt = FMT_CCY;
  ws.getCell(ur, 3).value = 1; ws.getCell(ur, 3).font = F_BODY_BOLD; ws.getCell(ur, 3).numFmt = FMT_PCT;
  for (let c = 1; c <= 3; c++) ws.getCell(ur, c).border = { top: { style: 'medium' as const, color: { argb: NAVY } }, bottom: { style: 'double' as const, color: { argb: NAVY } } };
  const totalUsesRow = ur;
  ur++;

  // Sources — track rows for SUM formula
  let sr = row;
  const sourcesStartRow = sr;
  const writeSource = (label: string, amt: number, alt: boolean) => {
    ws.getCell(sr, 5).value = label; ws.getCell(sr, 5).font = F_BODY; ws.getCell(sr, 5).border = THIN_BOTTOM;
    ws.getCell(sr, 6).value = amt; ws.getCell(sr, 6).font = F_INPUT; ws.getCell(sr, 6).numFmt = FMT_CCY; ws.getCell(sr, 6).border = THIN_BOTTOM;
    // % = amount / total uses (formula)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ws.getCell(sr, 7).value = { formula: `IF(${cr(totalUsesRow, 2)}=0,0,${cr(sr, 6)}/${cr(totalUsesRow, 2)})`, result: pctOf(amt) } as any;
    ws.getCell(sr, 7).font = F_BODY; ws.getCell(sr, 7).numFmt = FMT_PCT; ws.getCell(sr, 7).border = THIN_BOTTOM;
    if (alt) { for (let c = 5; c <= 7; c++) ws.getCell(sr, c).fill = LIGHT_FILL; }
    sr++;
  };
  // Debt tranches
  for (let i = 0; i < su.debt_sources.length; i++) {
    const d = su.debt_sources[i];
    writeSource(d.name, d.amount, i % 2 === 1);
  }
  writeSource('Total Debt', su.total_debt, false);
  if (su.rollover_equity > 0) writeSource('Rollover Equity', su.rollover_equity, true);
  // Sponsor Equity = Total Uses - Total Debt - Rollover (formula)
  ws.getCell(sr, 5).value = 'Sponsor Equity'; ws.getCell(sr, 5).font = F_BODY; ws.getCell(sr, 5).border = THIN_BOTTOM;
  const debtRow = sr - (su.rollover_equity > 0 ? 2 : 1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws.getCell(sr, 6).value = { formula: `${cr(totalUsesRow, 2)}-${cr(debtRow, 6)}${su.rollover_equity > 0 ? `-${cr(sr - 1, 6)}` : ''}`, result: su.sponsor_equity } as any;
  ws.getCell(sr, 6).font = F_INPUT; ws.getCell(sr, 6).numFmt = FMT_CCY; ws.getCell(sr, 6).border = THIN_BOTTOM;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws.getCell(sr, 7).value = { formula: `IF(${cr(totalUsesRow, 2)}=0,0,${cr(sr, 6)}/${cr(totalUsesRow, 2)})`, result: pctOf(su.sponsor_equity) } as any;
  ws.getCell(sr, 7).font = F_BODY; ws.getCell(sr, 7).numFmt = FMT_PCT; ws.getCell(sr, 7).border = THIN_BOTTOM;
  if (su.rollover_equity > 0 ? false : true) { for (let c = 5; c <= 7; c++) ws.getCell(sr, c).fill = LIGHT_FILL; }
  sr++;
  // Total sources = SUM formula
  const sourcesEndRow = sr - 1;
  ws.getCell(sr, 5).value = 'Total Sources'; ws.getCell(sr, 5).font = F_BODY_BOLD;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws.getCell(sr, 6).value = { formula: `SUM(${cr(sourcesStartRow, 6)}:${cr(sourcesEndRow, 6)})`, result: su.total_sources } as any;
  ws.getCell(sr, 6).font = F_BODY_BOLD; ws.getCell(sr, 6).numFmt = FMT_CCY;
  ws.getCell(sr, 7).value = 1; ws.getCell(sr, 7).font = F_BODY_BOLD; ws.getCell(sr, 7).numFmt = FMT_PCT;
  for (let c = 5; c <= 7; c++) ws.getCell(sr, c).border = { top: { style: 'medium' as const, color: { argb: NAVY } }, bottom: { style: 'double' as const, color: { argb: NAVY } } };
  sr++;

  row = Math.max(ur, sr) + 2;

  // Key metrics
  row = writeSectionHeader(ws, row, 'CAPITALISATION METRICS', 3);
  row = writeKvRow(ws, row, 'Implied Leverage (Debt / EBITDA)', su.implied_leverage, { fmt: FMT_MULT });
  row = writeKvRow(ws, row, 'Equity as % of Total Capitalisation', su.equity_pct_of_total, { fmt: FMT_PCT, alt: true });
  row = writeKvRow(ws, row, 'Debt as % of Total Capitalisation', su.debt_pct_of_total, { fmt: FMT_PCT });

  freezeAndPrint(ws, 3, 1);
}

// ── Sheet 3: Assumptions (structured, formula-linked) ──────────────────
//
// Layout uses FIXED row positions for all scalar and time-series assumptions
// so that P&L, Cash Flow, and Returns sheets can reference them reliably.
// Variable-length sections (debt tranches, add-ons) come at the end.

function buildAssumptionsSheet(wb: WB, state: ModelState, _ccy: string): AssumptionCells {
  const ws = wb.addWorksheet('Assumptions', { properties: { tabColor: { argb: '1a5276' } } });
  const hp = state.exit.holding_period;
  const maxCol = hp + 2; // col 1 = label, col 2 = Entry, cols 3..hp+2 = years
  ws.getColumn(1).width = 32;
  ws.getColumn(2).width = 18;
  for (let c = 3; c <= maxCol; c++) ws.getColumn(c).width = 14;

  const ai = new Set(state.ai_toggle_fields);
  const isAi = (p: string) => ai.has(p);

  // ── Section 1: Entry Assumptions (rows 1-10) ──────────────────────────

  let row = 1;
  ws.mergeCells(row, 1, row, 2);
  ws.getCell(row, 1).value = `${state.deal_name} — Model Assumptions`;
  ws.getCell(row, 1).font = F_SECTION;
  ws.getCell(row, 1).border = THICK_BOTTOM;
  row = 3; // row 2 blank

  row = writeSectionHeader(ws, row, 'ENTRY ASSUMPTIONS', 2); // row 3 header → row becomes 4
  // Row 4: LTM Revenue
  writeKvRow(ws, 4, 'LTM Revenue', state.revenue.base_revenue, { fmt: FMT_CCY, input: true });
  // Row 5: Base EBITDA Margin
  writeKvRow(ws, 5, 'Base EBITDA Margin', state.margins.base_ebitda_margin, { fmt: FMT_PCT, input: isAi('margins.base_ebitda_margin') });
  // Row 6: LTM EBITDA (formula = B4 * B5)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws.getCell(6, 1).value = 'LTM EBITDA'; ws.getCell(6, 1).font = F_BODY; ws.getCell(6, 1).border = THIN_BOTTOM;
  ws.getCell(6, 2).value = { formula: 'B4*B5', result: state.revenue.base_revenue * state.margins.base_ebitda_margin } as any;
  ws.getCell(6, 2).font = F_BODY; ws.getCell(6, 2).numFmt = FMT_CCY; ws.getCell(6, 2).border = THIN_BOTTOM; ws.getCell(6, 2).alignment = { horizontal: 'right' };
  // Row 7: Entry EBITDA Multiple
  writeKvRow(ws, 7, 'Entry EBITDA Multiple', state.entry.entry_ebitda_multiple, { fmt: FMT_MULT, input: true });
  // Row 8: Enterprise Value (formula = B6 * B7)
  ws.getCell(8, 1).value = 'Enterprise Value'; ws.getCell(8, 1).font = F_BODY_BOLD; ws.getCell(8, 1).border = THIN_BOTTOM;
  ws.getCell(8, 2).value = { formula: 'B6*B7', result: state.entry.enterprise_value } as any;
  ws.getCell(8, 2).font = F_BODY_BOLD; ws.getCell(8, 2).numFmt = FMT_CCY; ws.getCell(8, 2).border = THIN_BOTTOM; ws.getCell(8, 2).alignment = { horizontal: 'right' };
  // Row 9: Leverage Ratio
  writeKvRow(ws, 9, 'Leverage Ratio', state.entry.leverage_ratio, { fmt: FMT_MULT });
  // Row 10: Equity Check
  writeKvRow(ws, 10, 'Equity Check', state.entry.equity_check, { fmt: FMT_CCY, alt: true });

  // ── Section 2: Exit Assumptions (rows 12-15) ──────────────────────────

  writeSectionHeader(ws, 12, 'EXIT ASSUMPTIONS', 2); // row 12 header
  // Row 13: Holding Period
  writeKvRow(ws, 13, 'Holding Period (years)', state.exit.holding_period, { fmt: FMT_INT, input: true });
  // Row 14: Exit EBITDA Multiple
  writeKvRow(ws, 14, 'Exit EBITDA Multiple', state.exit.exit_ebitda_multiple, { fmt: FMT_MULT, input: isAi('exit.exit_ebitda_multiple') });
  // Row 15: Exit Method
  writeKvRow(ws, 15, 'Exit Method', state.exit.exit_method);
  // Row 16: Mid-Year Convention
  writeKvRow(ws, 16, 'Mid-Year Convention', state.exit.mid_year_convention ? 'Yes' : 'No');
  // Row 17: Exit EV Override
  writeKvRow(ws, 17, 'Exit EV Override',
    state.exit.exit_ev_override != null && state.exit.exit_ev_override > 0
      ? state.exit.exit_ev_override
      : 'N/A',
    { fmt: state.exit.exit_ev_override ? FMT_CCY : undefined },
  );

  // ── Section 3: Operating Assumptions (rows 19-23) ─────────────────────

  writeSectionHeader(ws, 18, 'OPERATING ASSUMPTIONS', 2); // row 18 header
  // Row 19: Target EBITDA Margin
  writeKvRow(ws, 19, 'Target EBITDA Margin', state.margins.target_ebitda_margin, { fmt: FMT_PCT, input: isAi('margins.target_ebitda_margin') });
  // Row 20: Margin Trajectory
  writeKvRow(ws, 20, 'Margin Trajectory', state.margins.margin_trajectory, { input: isAi('margins.margin_trajectory') });
  // Row 21: D&A % Revenue
  writeKvRow(ws, 21, 'D&A (% Revenue)', state.margins.da_pct_revenue, { fmt: FMT_PCT, input: true });
  // Row 22: Capex % Revenue
  writeKvRow(ws, 22, 'Maintenance Capex (% Revenue)', state.margins.capex_pct_revenue, { fmt: FMT_PCT, input: true });
  // Row 23: NWC % Revenue
  writeKvRow(ws, 23, 'NWC (% Revenue)', state.margins.nwc_pct_revenue, { fmt: FMT_PCT, input: true });

  // ── Section 4: Fees & Tax (rows 25-31) ────────────────────────────────

  writeSectionHeader(ws, 25, 'FEES & TAX', 2); // row 25 header
  // Row 26: Tax Rate
  writeKvRow(ws, 26, 'Tax Rate', state.tax.tax_rate, { fmt: FMT_PCT, input: true });
  // Row 27: Entry Fee %
  writeKvRow(ws, 27, 'Entry Fee %', state.fees.entry_fee_pct, { fmt: FMT_PCT, alt: true });
  // Row 28: Exit Fee %
  writeKvRow(ws, 28, 'Exit Fee %', state.fees.exit_fee_pct, { fmt: FMT_PCT });
  // Row 29: Monitoring Fee
  writeKvRow(ws, 29, 'Monitoring Fee (p.a.)', state.fees.monitoring_fee_annual, { fmt: FMT_CCY, input: true, alt: true });
  // Row 30: Financing Fee %
  writeKvRow(ws, 30, 'Financing Fee %', state.fees.financing_fee_pct, { fmt: FMT_PCT });
  // Row 31: Transaction Costs
  writeKvRow(ws, 31, 'Transaction Costs', state.fees.transaction_costs, { fmt: FMT_CCY, alt: true });

  // ── Section 5: Year-by-Year Schedule (rows 33-36) ─────────────────────

  writeSectionHeader(ws, 33, 'YEAR-BY-YEAR ASSUMPTIONS', maxCol); // row 33 header

  // Row 34: column headers (Entry, Y1, Y2, ...)
  ws.getCell(34, 1).value = ''; ws.getCell(34, 1).font = F_HEADER;
  ws.getCell(34, 2).value = 'Entry (LTM)'; ws.getCell(34, 2).font = F_HEADER;
  for (let i = 0; i < hp; i++) { ws.getCell(34, i + 3).value = `Year ${i + 1}`; ws.getCell(34, i + 3).font = F_HEADER; }
  styleHeaderRow(ws, 34, 1, maxCol);

  // Row 35: Revenue Growth Rates
  const growthVals: CellVal[] = ['--', ...state.revenue.growth_rates.slice(0, hp)];
  writeDataRow(ws, 35, 'Revenue Growth %', growthVals, FMT_PCT, { inputCols: new Set(Array.from({ length: hp }, (_, i) => i + 1)) });

  // Row 36: EBITDA Margin Schedule
  const years = state.projections.years;
  const marginVals: CellVal[] = [state.margins.base_ebitda_margin, ...years.slice(0, hp).map(y => y.ebitda_margin)];
  writeDataRow(ws, 36, 'EBITDA Margin %', marginVals, FMT_PCT, { alt: true, inputCols: new Set([0, ...Array.from({ length: hp }, (_, i) => i + 1)]) });

  // ── Section 6: Debt Structure (variable-length, starts at row 38) ─────

  row = 38;
  row = writeSectionHeader(ws, row, 'DEBT STRUCTURE', 2);
  for (const t of state.debt_tranches) {
    ws.getCell(row, 1).value = t.name; ws.getCell(row, 1).font = F_BODY_BOLD; ws.getCell(row, 1).fill = MID_FILL;
    ws.getCell(row, 2).fill = MID_FILL;
    row++;
    row = writeKvRow(ws, row, '  Principal', t.principal, { fmt: FMT_CCY, input: true });
    row = writeKvRow(ws, row, '  Rate Type', t.rate_type, { alt: true });
    row = writeKvRow(ws, row, '  Interest Rate', t.interest_rate, { fmt: FMT_PCT, input: true });
    row = writeKvRow(ws, row, '  Amortization', t.amortization_type, { alt: true });
    if (t.pik_rate > 0) row = writeKvRow(ws, row, '  PIK Rate', t.pik_rate, { fmt: FMT_PCT });
    if (t.rate_type === 'floating') {
      row = writeKvRow(ws, row, '  Base Rate', t.base_rate, { fmt: FMT_PCT });
      row = writeKvRow(ws, row, '  Spread', t.spread, { fmt: FMT_PCT, alt: true });
      row = writeKvRow(ws, row, '  Floor', t.floor, { fmt: FMT_PCT });
    }
  }
  row++;

  // MIP
  row = writeSectionHeader(ws, row, 'MANAGEMENT INCENTIVE PLAN', 2);
  row = writeKvRow(ws, row, 'MIP Pool %', state.mip.mip_pool_pct, { fmt: FMT_PCT, input: true });
  row = writeKvRow(ws, row, 'Hurdle MOIC', state.mip.hurdle_moic, { fmt: FMT_MULT, alt: true });
  row = writeKvRow(ws, row, 'Vesting Years', state.mip.vesting_years, { fmt: FMT_INT });
  row = writeKvRow(ws, row, 'Sweet Equity %', state.mip.sweet_equity_pct, { fmt: FMT_PCT, alt: true });

  // Add-ons
  if (state.add_on_acquisitions && state.add_on_acquisitions.length > 0) {
    row++;
    row = writeSectionHeader(ws, row, 'ADD-ON ACQUISITIONS', 2);
    for (const a of state.add_on_acquisitions) {
      ws.getCell(row, 1).value = a.name; ws.getCell(row, 1).font = F_BODY_BOLD; ws.getCell(row, 1).fill = MID_FILL;
      ws.getCell(row, 2).fill = MID_FILL; row++;
      row = writeKvRow(ws, row, '  Year', a.year, { fmt: FMT_INT });
      row = writeKvRow(ws, row, '  Revenue', a.revenue, { fmt: FMT_CCY, alt: true });
      row = writeKvRow(ws, row, '  EBITDA Margin', a.ebitda_margin, { fmt: FMT_PCT });
      row = writeKvRow(ws, row, '  Purchase Multiple', a.purchase_multiple, { fmt: FMT_MULT, alt: true });
      row = writeKvRow(ws, row, '  Funding', a.funding);
    }
  }

  // NOL / Min Tax (informational, at end)
  if (state.tax.nol_carryforward > 0 || state.tax.minimum_tax_rate > 0) {
    row++;
    row = writeSectionHeader(ws, row, 'TAX ADJUSTMENTS', 2);
    if (state.tax.nol_carryforward > 0) row = writeKvRow(ws, row, 'NOL Carryforward', state.tax.nol_carryforward, { fmt: FMT_CCY });
    if (state.tax.minimum_tax_rate > 0) row = writeKvRow(ws, row, 'Minimum Tax Rate', state.tax.minimum_tax_rate, { fmt: FMT_PCT, alt: true });
  }

  freezeAndPrint(ws, 34, 1, false);

  // ── Build cross-sheet reference map ───────────────────────────────────

  return {
    baseRevenue: `${ASHEET}!B4`,
    baseMargin: `${ASHEET}!B5`,
    ltmEbitda: `${ASHEET}!B6`,
    entryMultiple: `${ASHEET}!B7`,
    ev: `${ASHEET}!B8`,
    holdingPeriod: `${ASHEET}!B13`,
    exitMultiple: `${ASHEET}!B14`,
    targetMargin: `${ASHEET}!B18`,
    daPct: `${ASHEET}!B20`,
    capexPct: `${ASHEET}!B21`,
    nwcPct: `${ASHEET}!B22`,
    taxRate: `${ASHEET}!B25`,
    entryFeePct: `${ASHEET}!B26`,
    exitFeePct: `${ASHEET}!B27`,
    monitoringFee: `${ASHEET}!B28`,
    financingFeePct: `${ASHEET}!B29`,
    growthRate: (i: number) => `${ASHEET}!${cl(i + 3)}34`,
    margin: (i: number) => `${ASHEET}!${cl(i + 3)}35`,
    entryMargin: `${ASHEET}!B35`,
  };
}

// ── Sheet 4: P&L (Formula-linked to Assumptions) ──────────────────────

function buildPLSheet(wb: WB, state: ModelState, ccy: string, hp: number, years: AnnualProjectionYear[], aRefs: AssumptionCells): PLRefs {
  const ws = wb.addWorksheet('P&L', { properties: { tabColor: { argb: '2e86c1' } } });
  ws.getColumn(1).width = 30;
  for (let c = 2; c <= hp + 2; c++) ws.getColumn(c).width = 14;

  if (!years.length) {
    ws.getCell(1, 1).value = 'No projections calculated';
    return { revenueRow: 0, ebitdaAdjRow: 0, taxRow: 0, entryCol: 2 };
  }

  let row = 1;
  ws.mergeCells(row, 1, row, hp + 2);
  ws.getCell(row, 1).value = `${state.deal_name} - Income Statement (${ccy}m)`;
  ws.getCell(row, 1).font = F_SECTION;
  ws.getCell(row, 1).border = THICK_BOTTOM;
  row += 1;

  // Year headers with Entry column
  ws.getCell(row, 1).value = ''; ws.getCell(row, 1).font = F_HEADER;
  ws.getCell(row, 2).value = 'Entry (LTM)'; ws.getCell(row, 2).font = F_HEADER;
  for (let i = 0; i < hp; i++) {
    ws.getCell(row, i + 3).value = `Year ${i + 1}`;
    ws.getCell(row, i + 3).font = F_HEADER;
  }
  styleHeaderRow(ws, row, 1, hp + 2);
  row += 1;

  // Track row positions for formula references
  const R: Record<string, number> = {};

  // --- Revenue: Entry = Assumptions!BaseRevenue; Year N = Year N-1 * (1 + Growth N) ---
  R.rev = row;
  const revValues: CellVal[] = [fv(aRefs.baseRevenue, state.revenue.base_revenue)];
  for (let i = 0; i < hp; i++) {
    const col = i + 3;
    const prevCol = col - 1;
    revValues.push(fv(`${cr(R.rev, prevCol)}*(1+${cr(R.rev + 1, col)})`, years[i].revenue));
  }
  row = writeDataRow(ws, row, 'Revenue', revValues, FMT_CCY, { bold: true });

  // --- Revenue Growth: linked to Assumptions year-by-year schedule ---
  R.growth = row;
  const growthVals: CellVal[] = ['--' as CellVal];
  for (let i = 0; i < hp; i++) {
    growthVals.push(fv(aRefs.growthRate(i), years[i].revenue_growth));
  }
  row = writeDataRow(ws, row, 'Revenue Growth', growthVals, FMT_PCT, { alt: true });
  row++; // blank

  // --- EBITDA = Revenue * EBITDA Margin ---
  R.ebitda = row;
  const ebitdaVals: CellVal[] = [fv(`${cr(R.rev, 2)}*${cr(row + 1, 2)}`, state.revenue.base_revenue * state.margins.base_ebitda_margin)];
  for (let i = 0; i < hp; i++) {
    const col = i + 3;
    ebitdaVals.push(fv(`${cr(R.rev, col)}*${cr(row + 1, col)}`, years[i].ebitda));
  }
  row = writeDataRow(ws, row, 'EBITDA', ebitdaVals, FMT_CCY, { bold: true });

  // --- EBITDA Margin: linked to Assumptions year-by-year schedule ---
  R.margin = row;
  const marginVals: CellVal[] = [fv(aRefs.entryMargin, state.margins.base_ebitda_margin)];
  for (let i = 0; i < hp; i++) {
    marginVals.push(fv(aRefs.margin(i), years[i].ebitda_margin));
  }
  row = writeDataRow(ws, row, 'EBITDA Margin', marginVals, FMT_PCT, { alt: true });

  // --- Monitoring Fee: linked to Assumptions ---
  R.monFee = row;
  const monFeeVals: CellVal[] = [0 as CellVal];
  for (let i = 0; i < hp; i++) {
    monFeeVals.push(fv(`-${aRefs.monitoringFee}`, -state.fees.monitoring_fee_annual));
  }
  row = writeDataRow(ws, row, 'Monitoring Fee Adj.', monFeeVals, FMT_CCY);

  // --- EBITDA Adjusted = EBITDA + Monitoring Fee ---
  R.ebitdaAdj = row;
  const ebitdaAdjVals: CellVal[] = [fv(`${cr(R.ebitda, 2)}+${cr(R.monFee, 2)}`, state.revenue.base_revenue * state.margins.base_ebitda_margin)];
  for (let i = 0; i < hp; i++) {
    const col = i + 3;
    ebitdaAdjVals.push(fv(`${cr(R.ebitda, col)}+${cr(R.monFee, col)}`, years[i].ebitda_adj));
  }
  row = writeDataRow(ws, row, 'EBITDA Adjusted', ebitdaAdjVals, FMT_CCY, { bold: true, alt: true });
  row++; // blank

  // --- D&A = -Revenue * D&A% (linked to Assumptions) ---
  R.da = row;
  const daVals: CellVal[] = [null as CellVal];
  for (let i = 0; i < hp; i++) {
    const col = i + 3;
    daVals.push(fv(`-${cr(R.rev, col)}*${aRefs.daPct}`, -years[i].da));
  }
  row = writeDataRow(ws, row, 'D&A', daVals, FMT_CCY);

  // --- EBIT = EBITDA Adj + D&A (D&A is negative on sheet) ---
  R.ebit = row;
  const ebitVals: CellVal[] = [null as CellVal];
  for (let i = 0; i < hp; i++) {
    const col = i + 3;
    ebitVals.push(fv(`${cr(R.ebitdaAdj, col)}+${cr(R.da, col)}`, years[i].ebit));
  }
  row = writeDataRow(ws, row, 'EBIT', ebitVals, FMT_CCY, { bold: true, alt: true });

  // --- Interest Expense: static (from debt schedule — complex tranche-level logic) ---
  R.interest = row;
  row = writeDataRow(ws, row, 'Interest Expense', [null, ...years.map(y => -y.interest_expense)], FMT_CCY);

  // --- Financing Fee Amort = -(EV * Financing Fee %) / Holding Period (linked to Assumptions) ---
  R.finFee = row;
  const finFeeVals: CellVal[] = [null as CellVal];
  const totalFinFee = state.entry.enterprise_value * state.fees.financing_fee_pct;
  for (let i = 0; i < hp; i++) {
    finFeeVals.push(fv(`-(${aRefs.ev}*${aRefs.financingFeePct})/${aRefs.holdingPeriod}`, -(totalFinFee / hp)));
  }
  row = writeDataRow(ws, row, 'Financing Fee Amort.', finFeeVals, FMT_CCY, { alt: true });

  // --- EBT = EBIT + Interest + Fin Fee Amort (interest & fin fee are negative) ---
  R.ebt = row;
  const ebtVals: CellVal[] = [null as CellVal];
  for (let i = 0; i < hp; i++) {
    const col = i + 3;
    ebtVals.push(fv(`${cr(R.ebit, col)}+${cr(R.interest, col)}+${cr(R.finFee, col)}`, years[i].ebt));
  }
  row = writeDataRow(ws, row, 'EBT', ebtVals, FMT_CCY, { bold: true });

  // --- Tax = -MAX(EBT * Tax Rate, 0) linked to Assumptions ---
  // Note: if NOL carryforward exists, engine uses complex logic — use hardcoded values
  R.tax = row;
  const hasNol = state.tax.nol_carryforward > 0;
  if (hasNol) {
    row = writeDataRow(ws, row, 'Tax', [null, ...years.map(y => -y.tax)], FMT_CCY, { alt: true });
    row = writeDataRow(ws, row, '  NOL Utilised', [null, ...years.map(y => y.nol_used)], FMT_CCY);
  } else {
    const taxVals: CellVal[] = [null as CellVal];
    for (let i = 0; i < hp; i++) {
      const col = i + 3;
      taxVals.push(fv(`-MAX(${cr(R.ebt, col)}*${aRefs.taxRate},0)`, -years[i].tax));
    }
    row = writeDataRow(ws, row, 'Tax', taxVals, FMT_CCY, { alt: true });
  }

  // --- Net Income = EBT + Tax (tax is negative on sheet) ---
  R.netIncome = row;
  const niVals: CellVal[] = [null as CellVal];
  for (let i = 0; i < hp; i++) {
    const col = i + 3;
    niVals.push(fv(`${cr(R.ebt, col)}+${cr(R.tax, col)}`, years[i].net_income));
  }
  row = writeDataRow(ws, row, 'Net Income', niVals, FMT_CCY, { bold: true, topBorder: true });
  row++; // blank

  // --- Net Income Margin = Net Income / Revenue ---
  const niMarginVals: CellVal[] = [null as CellVal];
  for (let i = 0; i < hp; i++) {
    const col = i + 3;
    niMarginVals.push(fv(`IF(${cr(R.rev, col)}=0,0,${cr(R.netIncome, col)}/${cr(R.rev, col)})`, years[i].revenue > 0 ? years[i].net_income / years[i].revenue : 0));
  }
  row = writeDataRow(ws, row, 'Net Income Margin', niMarginVals, FMT_PCT, { alt: true });

  // --- NOPAT = EBIT * (1 - Tax Rate) linked to Assumptions ---
  const nopatVals: CellVal[] = [null as CellVal];
  for (let i = 0; i < hp; i++) {
    const col = i + 3;
    nopatVals.push(fv(`${cr(R.ebit, col)}*(1-${aRefs.taxRate})`, years[i].nopat));
  }
  row = writeDataRow(ws, row, 'NOPAT', nopatVals, FMT_CCY);

  freezeAndPrint(ws, 3, 1);

  return { revenueRow: R.rev, ebitdaAdjRow: R.ebitdaAdj, taxRow: R.tax, entryCol: 2 };
}

// ── Sheet 5: Cash Flow & Debt (Formula-linked to P&L and Assumptions) ──

function buildCashFlowDebtSheet(
  wb: WB, state: ModelState, ccy: string, hp: number,
  years: AnnualProjectionYear[],
  ds: ModelState['debt_schedule'],
  aRefs: AssumptionCells,
  plRefs: PLRefs,
) {
  const ws = wb.addWorksheet('Cash Flow & Debt', { properties: { tabColor: { argb: '1e8449' } } });
  ws.getColumn(1).width = 30;
  for (let c = 2; c <= hp + 1; c++) ws.getColumn(c).width = 14;

  if (!years.length) { ws.getCell(1, 1).value = 'No projections calculated'; return; }

  // Helper: P&L cross-sheet cell reference. CF Year 1 is col 2, but P&L Year 1 is col 3.
  const plRef = (plRow: number, cfCol: number) => `${PLSHEET}!${cr(plRow, cfCol + 1)}`;

  let row = 1;
  ws.mergeCells(row, 1, row, hp + 1);
  ws.getCell(row, 1).value = `${state.deal_name} - Cash Flow & Debt Schedule (${ccy}m)`;
  ws.getCell(row, 1).font = F_SECTION;
  ws.getCell(row, 1).border = THICK_BOTTOM;
  row += 1;

  // Year headers
  ws.getCell(row, 1).value = '';
  for (let i = 0; i < hp; i++) ws.getCell(row, i + 2).value = `Year ${i + 1}`;
  styleHeaderRow(ws, row, 1, hp + 1);
  row += 1;

  // Track rows for formulas
  const R: Record<string, number> = {};

  // FCF Build
  row = writeSectionHeader(ws, row, 'FREE CASH FLOW BUILD', hp + 1);

  // --- EBITDA Adjusted: linked to P&L ---
  R.ebitdaAdj = row;
  const ebitdaAdjVals: CellVal[] = [];
  for (let i = 0; i < hp; i++) {
    const col = i + 2;
    ebitdaAdjVals.push(fv(plRef(plRefs.ebitdaAdjRow, col), years[i].ebitda_adj));
  }
  row = writeDataRow(ws, row, 'EBITDA Adjusted', ebitdaAdjVals, FMT_CCY, { bold: true });

  // --- Tax Paid: linked to P&L (sign already negative in P&L Tax row) ---
  R.tax = row;
  const taxVals: CellVal[] = [];
  for (let i = 0; i < hp; i++) {
    const col = i + 2;
    taxVals.push(fv(plRef(plRefs.taxRow, col), -years[i].tax));
  }
  row = writeDataRow(ws, row, 'Tax Paid', taxVals, FMT_CCY, { alt: true });

  // --- Maintenance Capex = -Revenue * Capex% (linked to P&L Revenue and Assumptions) ---
  R.maintCapex = row;
  const capexVals: CellVal[] = [];
  for (let i = 0; i < hp; i++) {
    const col = i + 2;
    capexVals.push(fv(`-${plRef(plRefs.revenueRow, col)}*${aRefs.capexPct}`, -years[i].maintenance_capex));
  }
  row = writeDataRow(ws, row, 'Maintenance Capex', capexVals, FMT_CCY);

  // --- Growth Capex: static (complex add-on acquisition logic) ---
  R.growthCapex = row;
  row = writeDataRow(ws, row, 'Growth Capex', years.map(y => -y.growth_capex), FMT_CCY, { alt: true });

  // --- Change in NWC = -NWC% * (Revenue_Y(i) - Revenue_Y(i-1)), linked to Assumptions & P&L ---
  R.nwc = row;
  const nwcVals: CellVal[] = [];
  for (let i = 0; i < hp; i++) {
    // P&L revenue: entry is col 2 (plRefs.entryCol), Y1 is col 3, so Y(i) is col i+3
    const plRevCurr = `${PLSHEET}!${cr(plRefs.revenueRow, i + 3)}`;
    const plRevPrev = `${PLSHEET}!${cr(plRefs.revenueRow, i + 2)}`;
    nwcVals.push(fv(`-${aRefs.nwcPct}*(${plRevCurr}-${plRevPrev})`, -years[i].delta_nwc));
  }
  row = writeDataRow(ws, row, 'Change in NWC', nwcVals, FMT_CCY);

  // --- FCF Pre-Debt = EBITDA Adj + Tax + Maint Capex + Growth Capex + NWC ---
  R.fcfPreDebt = row;
  const fcfPreVals: CellVal[] = [];
  for (let i = 0; i < hp; i++) {
    const col = i + 2;
    fcfPreVals.push(fv(
      `${cr(R.ebitdaAdj, col)}+${cr(R.tax, col)}+${cr(R.maintCapex, col)}+${cr(R.growthCapex, col)}+${cr(R.nwc, col)}`,
      years[i].fcf_pre_debt,
    ));
  }
  row = writeDataRow(ws, row, 'FCF Pre-Debt Service', fcfPreVals, FMT_CCY, { bold: true, topBorder: true, alt: true });

  R.cashInt = row;
  row = writeDataRow(ws, row, 'Cash Interest', ds.total_cash_interest_by_year.map(v => -v), FMT_CCY);

  R.debtRepay = row;
  row = writeDataRow(ws, row, 'Debt Repayment', ds.total_repayment_by_year.map(v => -v), FMT_CCY, { alt: true });

  // --- FCF to Equity = FCF Pre-Debt + Cash Interest + Debt Repayment ---
  R.fcfEquity = row;
  const fcfEqVals: CellVal[] = [];
  for (let i = 0; i < hp; i++) {
    const col = i + 2;
    fcfEqVals.push(fv(
      `${cr(R.fcfPreDebt, col)}+${cr(R.cashInt, col)}+${cr(R.debtRepay, col)}`,
      years[i].fcf_to_equity,
    ));
  }
  row = writeDataRow(ws, row, 'FCF to Equity', fcfEqVals, FMT_CCY, { bold: true, topBorder: true });
  row++;

  // --- Cash Conversion = FCF Pre-Debt / EBITDA Adj ---
  const ccVals: CellVal[] = [];
  for (let i = 0; i < hp; i++) {
    const col = i + 2;
    const result = years[i].ebitda_adj > 0 ? years[i].fcf_pre_debt / years[i].ebitda_adj : 0;
    ccVals.push(fv(`IF(${cr(R.ebitdaAdj, col)}=0,0,${cr(R.fcfPreDebt, col)}/${cr(R.ebitdaAdj, col)})`, result));
  }
  row = writeDataRow(ws, row, 'Cash Conversion (FCF/EBITDA)', ccVals, FMT_PCT, { alt: true });
  row += 1;

  // Debt schedule — tranche details use static values (complex per-tranche logic)
  row = writeSectionHeader(ws, row, 'DEBT SCHEDULE', hp + 1);
  const trancheClosingRows: number[] = [];
  for (let tIdx = 0; tIdx < ds.tranche_schedules.length; tIdx++) {
    const trancheSched = ds.tranche_schedules[tIdx];
    if (!trancheSched.length) continue;
    const name = trancheSched[0]?.tranche_name || `Tranche ${tIdx + 1}`;
    const trancheType = tIdx < state.debt_tranches.length
      ? ((state.debt_tranches[tIdx] as Record<string, unknown>).tranche_type as string || 'senior')
      : 'senior';
    const trancheLabel = `${name} (${trancheType.replace('_', ' ')})`;

    // Tranche sub-header
    ws.getCell(row, 1).value = trancheLabel; ws.getCell(row, 1).font = F_BODY_BOLD; ws.getCell(row, 1).fill = MID_FILL;
    for (let c = 2; c <= hp + 1; c++) ws.getCell(row, c).fill = MID_FILL;
    row++;

    const openRow = row;
    row = writeDataRow(ws, row, '  Opening Balance', trancheSched.map(y => y.beginning_balance), FMT_CCY);
    row = writeDataRow(ws, row, '  Cash Interest', trancheSched.map(y => -y.cash_interest), FMT_CCY, { alt: true });
    const hasPik = trancheSched.some(y => y.pik_accrual > 0);
    let pikRow = -1;
    if (hasPik) {
      pikRow = row;
      row = writeDataRow(ws, row, '  PIK Accrual', trancheSched.map(y => y.pik_accrual), FMT_CCY);
    }
    const schedRepayRow = row;
    row = writeDataRow(ws, row, '  Scheduled Repayment', trancheSched.map(y => -y.scheduled_repayment), FMT_CCY, { alt: true });
    const hasSweep = trancheSched.some(y => y.sweep_repayment > 0);
    let sweepRow = -1;
    if (hasSweep) {
      sweepRow = row;
      row = writeDataRow(ws, row, '  Cash Sweep', trancheSched.map(y => -y.sweep_repayment), FMT_CCY);
    }

    // --- Closing Balance = Opening + PIK + Scheduled Repayment + Sweep (repayments are negative) ---
    const closingRow = row;
    trancheClosingRows.push(closingRow);
    const closingVals: CellVal[] = [];
    for (let i = 0; i < hp; i++) {
      const col = i + 2;
      let formula = `${cr(openRow, col)}+${cr(schedRepayRow, col)}`;
      if (hasPik) formula += `+${cr(pikRow, col)}`;
      if (hasSweep) formula += `+${cr(sweepRow, col)}`;
      closingVals.push(fv(formula, trancheSched[i].ending_balance));
    }
    row = writeDataRow(ws, row, '  Closing Balance', closingVals, FMT_CCY, { bold: true, topBorder: true, alt: true });
    row++;
  }

  // --- Total Debt = SUM of all tranche closing balances ---
  R.totalDebt = row;
  const totalDebtVals: CellVal[] = [];
  for (let i = 0; i < hp; i++) {
    const col = i + 2;
    if (trancheClosingRows.length > 0) {
      const sumParts = trancheClosingRows.map(r => cr(r, col)).join('+');
      totalDebtVals.push(fv(sumParts, ds.total_debt_by_year[i]));
    } else {
      totalDebtVals.push(ds.total_debt_by_year[i]);
    }
  }
  row = writeDataRow(ws, row, 'Total Debt Outstanding', totalDebtVals, FMT_CCY, { bold: true });
  row++;

  // --- Credit Metrics with formulas ---
  row = writeSectionHeader(ws, row, 'CREDIT METRICS', hp + 1);

  // Leverage = Total Debt / EBITDA Adj
  const levVals: CellVal[] = [];
  for (let i = 0; i < hp; i++) {
    const col = i + 2;
    levVals.push(fv(`IF(${cr(R.ebitdaAdj, col)}=0,0,${cr(R.totalDebt, col)}/${cr(R.ebitdaAdj, col)})`, ds.leverage_ratio_by_year[i]));
  }
  row = writeDataRow(ws, row, 'Net Debt / EBITDA', levVals, FMT_MULT, { bold: true });

  // Interest Coverage = EBITDA Adj / -Cash Interest (cash interest row is negative)
  const icVals: CellVal[] = [];
  for (let i = 0; i < hp; i++) {
    const col = i + 2;
    icVals.push(fv(`IF(${cr(R.cashInt, col)}=0,99,-${cr(R.ebitdaAdj, col)}/${cr(R.cashInt, col)})`, Math.min(ds.interest_coverage_by_year[i], 99)));
  }
  row = writeDataRow(ws, row, 'Interest Coverage (EBITDA / Int)', icVals, FMT_NUM, { alt: true });

  row = writeDataRow(ws, row, 'DSCR', ds.dscr_by_year.map(v => Math.min(v, 99)), FMT_NUM);

  // Extended credit metrics from credit_analysis
  const ca = state.credit_analysis;
  if (ca.metrics_by_year.length) {
    row = writeDataRow(ws, row, 'FCCR', ca.metrics_by_year.map(m => Math.min(m.fccr, 99)), FMT_NUM, { alt: true });
    row = writeDataRow(ws, row, 'Senior Leverage', ca.metrics_by_year.map(m => m.senior_leverage), FMT_MULT);
    row = writeDataRow(ws, row, 'Cumulative Debt Paydown', ca.metrics_by_year.map(m => m.cumulative_debt_paydown), FMT_CCY, { alt: true });
    row = writeDataRow(ws, row, 'Debt Paydown (% Entry)', ca.metrics_by_year.map(m => m.debt_paydown_pct), FMT_PCT);
  }

  freezeAndPrint(ws, 3, 1);
}

// ── Sheet 6: Returns ────────────────────────────────────────────────────

function buildReturnsSheet(wb: WB, state: ModelState, ccy: string, _aRefs: AssumptionCells) {
  const ws = wb.addWorksheet('Returns', { properties: { tabColor: { argb: '7d3c98' } } });
  ws.getColumn(1).width = 32;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 4;
  ws.getColumn(5).width = 28;
  ws.getColumn(6).width = 18;
  ws.getColumn(7).width = 14;

  const ret = state.returns;
  let row = 1;

  ws.mergeCells(row, 1, row, 7);
  ws.getCell(row, 1).value = `${state.deal_name} - Returns Analysis (${ccy}m)`;
  ws.getCell(row, 1).font = F_SECTION;
  ws.getCell(row, 1).border = THICK_BOTTOM;
  row += 2;

  // Returns summary — with key formulas for MOIC and Exit Equity
  row = writeSectionHeader(ws, row, 'RETURNS SUMMARY', 3);
  const RR: Record<string, number> = {};
  const addRet = (label: string, value: number | null | CellVal, fmt: string, alt = false, trackKey?: string) => {
    if (trackKey) RR[trackKey] = row;
    ws.getCell(row, 1).value = label; ws.getCell(row, 1).font = F_BODY; ws.getCell(row, 1).border = THIN_BOTTOM;
    const vc = ws.getCell(row, 2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vc.value = value as any;
    vc.numFmt = fmt;
    vc.border = THIN_BOTTOM;
    vc.alignment = { horizontal: 'right' };
    const numVal = typeof value === 'number' ? value : (value && typeof value === 'object' && 'result' in value ? value.result : null);
    if (label.includes('IRR') && typeof numVal === 'number') {
      vc.font = irrFont(numVal);
      const bg = irrBgFill(numVal);
      if (bg) vc.fill = bg;
    } else {
      vc.font = F_BODY;
    }
    if (alt && !vc.fill) { ws.getCell(row, 1).fill = LIGHT_FILL; vc.fill = LIGHT_FILL; }
    row++;
  };

  const irrSuffix = state.exit.mid_year_convention ? ' (mid-year)' : '';
  addRet(`Equity IRR (Post-Fees, Post-MIP)${irrSuffix}`, ret.irr, FMT_PCT);
  addRet(`Gross IRR (Pre-MIP)${irrSuffix}`, ret.irr_gross, FMT_PCT, true);
  addRet(`Levered IRR (Pre-Fees)${irrSuffix}`, ret.irr_levered, FMT_PCT);
  addRet(`Unlevered IRR${irrSuffix}`, ret.irr_unlevered, FMT_PCT, true);
  row++;
  addRet('Entry Equity', ret.entry_equity, FMT_CCY, false, 'entryEq');
  addRet('Exit Equity', ret.exit_equity, FMT_CCY, true, 'exitEq');
  // MOIC = (Exit Equity + Total Distributions) / Entry Equity
  const totalDist = ret.total_distributions ?? 0;
  if (totalDist > 0) {
    addRet('MOIC (incl. distributions)', fv(`IF(${cr(RR.entryEq, 2)}=0,0,(${cr(RR.exitEq, 2)}+${totalDist.toFixed(2)})/${cr(RR.entryEq, 2)})`, ret.moic), FMT_MULT);
  } else {
    addRet('MOIC', fv(`IF(${cr(RR.entryEq, 2)}=0,0,${cr(RR.exitEq, 2)}/${cr(RR.entryEq, 2)})`, ret.moic), FMT_MULT);
  }
  addRet('DPI', ret.dpi, FMT_MULT, true);
  addRet('Payback Period (years)', ret.payback_years, '0.0');
  addRet('Average Cash Yield', ret.cash_yield_avg, FMT_PCT, true);
  // Distribution metrics (shown when distributions exist)
  if (totalDist > 0) {
    addRet('Total Distributions', totalDist, FMT_CCY);
    if (ret.dpi_by_year && ret.dpi_by_year.length) {
      addRet('DPI (Final)', ret.dpi_by_year[ret.dpi_by_year.length - 1], FMT_MULT, true);
    }
  }
  row++;
  addRet('Exit Enterprise Value', ret.exit_ev, FMT_CCY, false, 'exitEv');
  addRet('Exit Net Debt', ret.exit_net_debt, FMT_CCY, true, 'exitDebt');
  addRet('MIP Payout', ret.mip_payout, FMT_CCY, false, 'mip');
  // Convergence metadata (audit transparency)
  if ((ret.convergence_iterations ?? 1) > 1) {
    addRet('Convergence Iterations', ret.convergence_iterations, '0');
    addRet('Convergence Delta (£m)', ret.convergence_delta, '0.0000', true);
  }
  row += 2;

  // Value Driver Bridge
  const vd = state.value_drivers;
  row = writeSectionHeader(ws, row, 'VALUE CREATION BRIDGE', 3);
  ws.getCell(row, 1).value = 'Driver'; ws.getCell(row, 2).value = `${ccy}m`; ws.getCell(row, 3).value = '% Contribution';
  styleHeaderRow(ws, row, 1, 3);
  row++;

  // Write bridge rows and track positions for exit equity formula
  const bridgeData: [string, number, number | null, boolean][] = [
    ['Entry Equity', vd.entry_equity, null, false],
    ['(+) Revenue Growth', vd.revenue_growth_contribution_abs, vd.revenue_growth_contribution_pct, true],
    ['(+) Margin Expansion', vd.margin_expansion_contribution_abs, vd.margin_expansion_contribution_pct, false],
    ['(+) Multiple Expansion', vd.multiple_expansion_contribution_abs, vd.multiple_expansion_contribution_pct, true],
    ['(+) Debt Paydown', vd.debt_paydown_contribution_abs, vd.debt_paydown_contribution_pct, false],
    ['(-) Fees & Costs', vd.fees_drag_contribution_abs, vd.fees_drag_contribution_pct, true],
    ['Exit Equity', vd.exit_equity, null, false],
  ];

  const bridgeStartRow = row;
  for (let bIdx = 0; bIdx < bridgeData.length; bIdx++) {
    const [label, absVal, pctVal, alt] = bridgeData[bIdx];
    const isTotal = label === 'Entry Equity' || label === 'Exit Equity';
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = isTotal ? F_BODY_BOLD : F_BODY;
    ws.getCell(row, 1).border = isTotal ? MED_BOTTOM : THIN_BOTTOM;

    // Exit Equity = SUM of all bridge components (Entry + contributions)
    if (label === 'Exit Equity') {
      const sumRange = `${cr(bridgeStartRow, 2)}:${cr(row - 1, 2)}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ws.getCell(row, 2).value = { formula: `SUM(${sumRange})`, result: absVal } as any;
    } else {
      ws.getCell(row, 2).value = absVal;
    }
    ws.getCell(row, 2).numFmt = FMT_CCY;
    ws.getCell(row, 2).font = isTotal ? F_BODY_BOLD : F_BODY;
    ws.getCell(row, 2).border = isTotal ? MED_BOTTOM : THIN_BOTTOM;
    ws.getCell(row, 2).alignment = { horizontal: 'right' };

    if (pctVal != null) {
      ws.getCell(row, 3).value = pctVal / 100;
      ws.getCell(row, 3).numFmt = FMT_PCT;
      ws.getCell(row, 3).font = F_BODY;
      ws.getCell(row, 3).alignment = { horizontal: 'right' };
    }
    ws.getCell(row, 3).border = isTotal ? MED_BOTTOM : THIN_BOTTOM;
    if (alt && !isTotal) { for (let c = 1; c <= 3; c++) ws.getCell(row, c).fill = LIGHT_FILL; }
    row++;
  }
  row += 1;

  // EBITDA Bridge
  const eb = state.ebitda_bridge;
  if (eb && eb.entry_ebitda > 0) {
    row = writeSectionHeader(ws, row, 'EBITDA BRIDGE (Entry to Exit)', 3);
    ws.getCell(row, 1).value = 'Component'; ws.getCell(row, 2).value = `${ccy}m`;
    styleHeaderRow(ws, row, 1, 2);
    row++;

    const ebRows: [string, number, boolean][] = [
      ['Entry EBITDA', eb.entry_ebitda, false],
      ['(+) Organic Revenue Contribution', eb.organic_revenue_contribution, true],
      ['(+) Margin Expansion', eb.margin_expansion_contribution, false],
      ['(+) Cost Synergies', eb.cost_synergies, true],
      ['(+) Add-On EBITDA', eb.add_on_ebitda, false],
      ['(-) Integration Costs', -eb.integration_costs, true],
      ['(-) Monitoring Fees', -eb.monitoring_fees, false],
      ['Exit EBITDA (Adjusted)', eb.exit_ebitda, false],
    ];
    for (const [label, val, alt] of ebRows) {
      const isTotal = label.startsWith('Entry') || label.startsWith('Exit');
      ws.getCell(row, 1).value = label; ws.getCell(row, 1).font = isTotal ? F_BODY_BOLD : F_BODY;
      ws.getCell(row, 1).border = isTotal ? MED_BOTTOM : THIN_BOTTOM;
      ws.getCell(row, 2).value = val; ws.getCell(row, 2).numFmt = FMT_CCY;
      ws.getCell(row, 2).font = isTotal ? F_BODY_BOLD : F_BODY;
      ws.getCell(row, 2).border = isTotal ? MED_BOTTOM : THIN_BOTTOM;
      ws.getCell(row, 2).alignment = { horizontal: 'right' };
      if (alt && !isTotal) { ws.getCell(row, 1).fill = LIGHT_FILL; ws.getCell(row, 2).fill = LIGHT_FILL; }
      row++;
    }
  }

  freezeAndPrint(ws, 3, 1);
}

// ── Sheet 7: Scenarios & Sensitivity ────────────────────────────────────

function buildScenariosSheet(wb: WB, state: ModelState, ccy: string) {
  const ws = wb.addWorksheet('Scenarios', { properties: { tabColor: { argb: 'ca6f1e' } } });
  ws.getColumn(1).width = 24;

  let row = 1;
  ws.mergeCells(row, 1, row, 10);
  ws.getCell(row, 1).value = `${state.deal_name} - Scenario Analysis & Sensitivity`;
  ws.getCell(row, 1).font = F_SECTION;
  ws.getCell(row, 1).border = THICK_BOTTOM;
  row += 2;

  // Scenario comparison
  if (state.scenarios.length) {
    row = writeSectionHeader(ws, row, 'SCENARIO COMPARISON', state.scenarios.length + 1);
    const headers = ['Metric', ...state.scenarios.map(s => s.name.toUpperCase())];
    for (let i = 0; i < headers.length; i++) {
      ws.getCell(row, i + 1).value = headers[i];
      ws.getColumn(i + 1).width = i === 0 ? 24 : 16;
    }
    styleHeaderRow(ws, row, 1, headers.length);
    row++;

    // IRR
    ws.getCell(row, 1).value = 'Equity IRR'; ws.getCell(row, 1).font = F_BODY;
    state.scenarios.forEach((s, i) => {
      const c = ws.getCell(row, i + 2);
      c.value = s.irr; c.numFmt = FMT_PCT; c.font = irrFont(s.irr);
      const bg = irrBgFill(s.irr);
      if (bg) c.fill = bg;
      c.alignment = { horizontal: 'center' };
    });
    row++;

    // MOIC
    ws.getCell(row, 1).value = 'MOIC'; ws.getCell(row, 1).font = F_BODY;
    state.scenarios.forEach((s, i) => {
      const c = ws.getCell(row, i + 2);
      c.value = s.moic; c.numFmt = FMT_MULT; c.font = F_BODY; c.alignment = { horizontal: 'center' };
    });
    row++;

    // Exit Multiple
    ws.getCell(row, 1).value = 'Exit Multiple'; ws.getCell(row, 1).font = F_BODY;
    state.scenarios.forEach((s, i) => {
      const c = ws.getCell(row, i + 2);
      c.value = s.exit_multiple; c.numFmt = FMT_MULT; c.font = F_BODY; c.alignment = { horizontal: 'center' };
    });
    row++;

    // Exit Equity
    ws.getCell(row, 1).value = `Exit Equity (${ccy}m)`; ws.getCell(row, 1).font = F_BODY;
    state.scenarios.forEach((s, i) => {
      const c = ws.getCell(row, i + 2);
      c.value = s.exit_equity; c.numFmt = FMT_CCY; c.font = F_BODY; c.alignment = { horizontal: 'center' };
    });
    row++;

    // Descriptions
    ws.getCell(row, 1).value = 'Description'; ws.getCell(row, 1).font = F_BODY_BOLD;
    state.scenarios.forEach((s, i) => {
      const c = ws.getCell(row, i + 2);
      c.value = s.description; c.font = { ...F_BODY, size: 9 };
      c.alignment = { wrapText: true, vertical: 'top' };
    });
    ws.getRow(row).height = 36;
    row += 3;
  }

  // Sensitivity tables
  if (state.sensitivity_tables.length) {
    row = writeSectionHeader(ws, row, 'SENSITIVITY ANALYSIS - IRR', 10);
    row++;

    const tableLabels: Record<string, string> = {
      'revenue_growth': 'Revenue Growth',
      'exit_multiple': 'Exit Multiple',
      'ebitda_margin': 'EBITDA Margin',
      'entry_multiple': 'Entry Multiple',
      'leverage': 'Leverage (Debt/EBITDA)',
    };

    for (const table of state.sensitivity_tables) {
      const rowLabel = tableLabels[table.row_variable] || table.row_variable;
      const colLabel = tableLabels[table.col_variable] || table.col_variable;

      ws.mergeCells(row, 1, row, table.col_values.length + 1);
      ws.getCell(row, 1).value = `Table ${table.table_id}: ${rowLabel} vs ${colLabel}`;
      ws.getCell(row, 1).font = F_BODY_BOLD;
      ws.getCell(row, 1).border = MED_BOTTOM;
      row++;

      // Column headers
      ws.getCell(row, 1).value = `${rowLabel} \\ ${colLabel}`;
      ws.getCell(row, 1).font = F_HEADER;
      const isColPct = table.col_variable === 'revenue_growth' || table.col_variable === 'ebitda_margin';
      const isRowPct = table.row_variable === 'revenue_growth' || table.row_variable === 'ebitda_margin';

      for (let j = 0; j < table.col_values.length; j++) {
        const c = ws.getCell(row, j + 2);
        c.value = table.col_values[j];
        c.numFmt = isColPct ? FMT_PCT : FMT_MULT;
        c.font = F_HEADER;
        ws.getColumn(j + 2).width = 12;
      }
      styleHeaderRow(ws, row, 1, table.col_values.length + 1);
      row++;

      // Data rows
      for (let i = 0; i < table.row_values.length; i++) {
        // Row header
        const rhc = ws.getCell(row, 1);
        rhc.value = table.row_values[i];
        rhc.numFmt = isRowPct ? FMT_PCT : FMT_MULT;
        rhc.font = F_BODY_BOLD;
        rhc.fill = MID_FILL;
        rhc.border = THIN_BOTTOM;

        // IRR values
        for (let j = 0; j < table.col_values.length; j++) {
          const irr = table.irr_matrix[i]?.[j] ?? null;
          const c = ws.getCell(row, j + 2);
          c.value = irr;
          c.numFmt = FMT_PCT;
          c.font = irrFont(irr);
          c.alignment = { horizontal: 'center' };
          c.border = THIN_BOTTOM;
          const bg = irrBgFill(irr);
          if (bg) c.fill = bg;
          else if (i % 2 === 1) c.fill = LIGHT_FILL;
        }
        row++;
      }
      row += 2;
    }
  }

  freezeAndPrint(ws, 3, 1);
}

// ── Sheet 8: Risk Assessment ────────────────────────────────────────────

function buildRiskSheet(wb: WB, state: ModelState, ccy: string, hp: number) {
  const ws = wb.addWorksheet('Risk', { properties: { tabColor: { argb: 'c0392b' } } });
  ws.getColumn(1).width = 36;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 50;
  ws.getColumn(4).width = 40;

  const rc = state.exit_reality_check;
  const ca = state.credit_analysis;
  let row = 1;

  ws.mergeCells(row, 1, row, 4);
  ws.getCell(row, 1).value = `${state.deal_name} - Risk Assessment`;
  ws.getCell(row, 1).font = F_SECTION;
  ws.getCell(row, 1).border = THICK_BOTTOM;
  row += 2;

  // Verdict banner
  ws.mergeCells(row, 1, row, 4);
  ws.getCell(row, 1).value = `EXIT REALITY CHECK: ${rc.verdict.toUpperCase()}`;
  ws.getCell(row, 1).font = { ...F_WHITE_LG, color: { argb: WHITE } };
  ws.getCell(row, 1).fill = rc.verdict === 'aggressive'
    ? { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: RED_C } }
    : rc.verdict === 'conservative'
      ? { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: AMBER_C } }
      : { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: GREEN_C } };
  ws.getCell(row, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(row).height = 28;
  row += 2;

  // Key exit metrics
  row = writeSectionHeader(ws, row, 'EXIT VALUATION METRICS', 2);
  row = writeKvRow(ws, row, 'Exit EV / EBITDA', rc.ev_ebitda_at_exit, { fmt: FMT_MULT });
  row = writeKvRow(ws, row, 'Exit EV / Revenue', rc.ev_revenue_at_exit, { fmt: FMT_MULT, alt: true });
  row = writeKvRow(ws, row, 'Multiple Delta (Exit - Entry)', rc.multiple_delta, { fmt: '0.0"x"' });
  const [compLow, compHigh] = rc.public_comps_multiple_range;
  row = writeKvRow(ws, row, 'Sector Comps Range', `${compLow.toFixed(1)}x - ${compHigh.toFixed(1)}x`, { alt: true });
  if (rc.implied_buyer_irr != null) {
    row = writeKvRow(ws, row, 'Implied Buyer IRR', rc.implied_buyer_irr, { fmt: FMT_PCT, font: irrFont(rc.implied_buyer_irr) });
  }
  row += 1;

  // Flags table
  if (rc.flags.length) {
    row = writeSectionHeader(ws, row, 'RISK FLAGS', 4);
    ws.getCell(row, 1).value = 'Rule'; ws.getCell(row, 2).value = 'Severity';
    ws.getCell(row, 3).value = 'Description'; ws.getCell(row, 4).value = 'Quantified Impact';
    styleHeaderRow(ws, row, 1, 4);
    row++;

    for (let i = 0; i < rc.flags.length; i++) {
      const flag = rc.flags[i];
      const alt = i % 2 === 1;
      const flagName = flag.flag_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      ws.getCell(row, 1).value = flagName; ws.getCell(row, 1).font = F_BODY; ws.getCell(row, 1).border = THIN_BOTTOM;
      ws.getCell(row, 2).value = flag.severity.toUpperCase(); ws.getCell(row, 2).font = severityFont(flag.severity);
      ws.getCell(row, 2).fill = severityBg(flag.severity); ws.getCell(row, 2).alignment = { horizontal: 'center' };
      ws.getCell(row, 2).border = THIN_BOTTOM;
      ws.getCell(row, 3).value = flag.description; ws.getCell(row, 3).font = F_BODY;
      ws.getCell(row, 3).alignment = { wrapText: true }; ws.getCell(row, 3).border = THIN_BOTTOM;
      ws.getCell(row, 4).value = flag.quantified_impact; ws.getCell(row, 4).font = F_BODY_BOLD;
      ws.getCell(row, 4).border = THIN_BOTTOM;
      if (alt) { ws.getCell(row, 1).fill = LIGHT_FILL; ws.getCell(row, 3).fill = LIGHT_FILL; ws.getCell(row, 4).fill = LIGHT_FILL; }
      ws.getRow(row).height = 30;
      row++;
    }
    row++;
  }

  // Credit analysis detail
  if (ca.metrics_by_year.length) {
    row = writeSectionHeader(ws, row, 'CREDIT ANALYSIS', 4);

    row = writeKvRow(ws, row, 'Estimated Credit Rating', ca.credit_rating_estimate);
    row = writeKvRow(ws, row, `Max Debt Capacity @ 4.0x (${ccy}m)`, ca.max_debt_capacity_at_4x, { fmt: FMT_CCY, alt: true });
    row = writeKvRow(ws, row, `Max Debt Capacity @ 5.0x (${ccy}m)`, ca.max_debt_capacity_at_5x, { fmt: FMT_CCY });
    row = writeKvRow(ws, row, `Max Debt Capacity @ 6.0x (${ccy}m)`, ca.max_debt_capacity_at_6x, { fmt: FMT_CCY, alt: true });
    row++;

    // Refinancing risk
    ws.getCell(row, 1).value = 'Refinancing Risk'; ws.getCell(row, 1).font = F_BODY_BOLD;
    ws.getCell(row, 2).value = ca.refinancing_risk ? 'YES' : 'NO';
    ws.getCell(row, 2).font = ca.refinancing_risk ? F_RED : F_GREEN;
    ws.getCell(row, 2).fill = ca.refinancing_risk ? RED_BG_FILL : GREEN_BG_FILL;
    ws.getCell(row, 2).alignment = { horizontal: 'center' };
    row++;
    if (ca.refinancing_risk_detail) {
      ws.mergeCells(row, 1, row, 4);
      ws.getCell(row, 1).value = ca.refinancing_risk_detail;
      ws.getCell(row, 1).font = { ...F_BODY, size: 9 };
      ws.getCell(row, 1).alignment = { wrapText: true };
      row++;
    }
    row++;

    // Recovery waterfall
    if (ca.recovery_waterfall.length) {
      row = writeSectionHeader(ws, row, 'RECOVERY WATERFALL (50% EV Stress)', 2);
      ws.getCell(row, 1).value = 'Tranche'; ws.getCell(row, 2).value = 'Recovery %';
      styleHeaderRow(ws, row, 1, 2);
      row++;
      for (let i = 0; i < ca.recovery_waterfall.length; i++) {
        const rw = ca.recovery_waterfall[i];
        ws.getCell(row, 1).value = rw.tranche; ws.getCell(row, 1).font = F_BODY; ws.getCell(row, 1).border = THIN_BOTTOM;
        ws.getCell(row, 2).value = rw.recovery_pct; ws.getCell(row, 2).numFmt = FMT_PCT;
        ws.getCell(row, 2).font = rw.recovery_pct >= 1 ? F_GREEN : rw.recovery_pct >= 0.5 ? F_AMBER : F_RED;
        ws.getCell(row, 2).border = THIN_BOTTOM;
        ws.getCell(row, 2).alignment = { horizontal: 'center' };
        if (i % 2 === 1) { ws.getCell(row, 1).fill = LIGHT_FILL; ws.getCell(row, 2).fill = LIGHT_FILL; }
        row++;
      }
    }

    row++;

    // Covenant headroom
    if (ca.covenant_headroom_by_year.length) {
      row = writeSectionHeader(ws, row, 'COVENANT HEADROOM (vs 6.0x)', hp + 1);
      ws.getCell(row, 1).value = '';
      for (let i = 0; i < hp; i++) ws.getCell(row, i + 2).value = `Year ${i + 1}`;
      styleHeaderRow(ws, row, 1, hp + 1);
      row++;
      row = writeDataRow(ws, row, 'Leverage Headroom (turns)', ca.covenant_headroom_by_year, FMT_NUM);
    }
  }

  freezeAndPrint(ws, 3, 1, false);
}
