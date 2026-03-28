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

const CCY_SYMBOLS: Record<string, string> = { GBP: '\u00a3', EUR: '\u20ac', USD: '$', CHF: 'CHF ' };

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
  values: (number | string | null)[],
  fmt: string = FMT_CCY,
  options: { alt?: boolean; bold?: boolean; topBorder?: boolean; font?: object } = {},
): number {
  const labelCell = ws.getCell(row, 1);
  labelCell.value = label;
  labelCell.font = options.bold ? F_BODY_BOLD : F_BODY;
  labelCell.border = THIN_BOTTOM;
  if (options.alt) labelCell.fill = LIGHT_FILL;

  for (let i = 0; i < values.length; i++) {
    const cell = ws.getCell(row, i + 2);
    cell.value = values[i];
    cell.font = options.font || (options.bold ? F_BODY_BOLD : F_BODY);
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
  buildAssumptionsSheet(wb, state, ccy);
  buildPLSheet(wb, state, ccy, hp, years);
  buildCashFlowDebtSheet(wb, state, ccy, hp, years, ds);
  buildReturnsSheet(wb, state, ccy);
  buildScenariosSheet(wb, state, ccy);
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
    ['EQUITY IRR', ret.irr != null ? ret.irr : 'N/A', FMT_PCT],
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

  if (rc.flags.length) {
    ws.getCell(row, 2).value = `${rc.flags.filter(f => f.severity === 'critical').length} critical, ${rc.flags.filter(f => f.severity === 'warning').length} warning flags`;
    ws.getCell(row, 2).font = F_SUBTITLE;
  }
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

  // Uses
  let ur = row;
  const writeUse = (label: string, amt: number, alt: boolean) => {
    ws.getCell(ur, 1).value = label; ws.getCell(ur, 1).font = F_BODY; ws.getCell(ur, 1).border = THIN_BOTTOM;
    ws.getCell(ur, 2).value = amt; ws.getCell(ur, 2).font = F_BODY; ws.getCell(ur, 2).numFmt = FMT_CCY; ws.getCell(ur, 2).border = THIN_BOTTOM;
    ws.getCell(ur, 3).value = pctOf(amt); ws.getCell(ur, 3).font = F_BODY; ws.getCell(ur, 3).numFmt = FMT_PCT; ws.getCell(ur, 3).border = THIN_BOTTOM;
    if (alt) { for (let c = 1; c <= 3; c++) ws.getCell(ur, c).fill = LIGHT_FILL; }
    ur++;
  };
  writeUse('Enterprise Value', su.enterprise_value, false);
  writeUse('Transaction Fees', su.transaction_fees, true);
  writeUse('Financing Fees', su.financing_fees, false);
  if (su.cash_to_balance_sheet > 0) writeUse('Cash to Balance Sheet', su.cash_to_balance_sheet, true);
  // Total uses
  ws.getCell(ur, 1).value = 'Total Uses'; ws.getCell(ur, 1).font = F_BODY_BOLD;
  ws.getCell(ur, 2).value = su.total_uses; ws.getCell(ur, 2).font = F_BODY_BOLD; ws.getCell(ur, 2).numFmt = FMT_CCY;
  ws.getCell(ur, 3).value = 1; ws.getCell(ur, 3).font = F_BODY_BOLD; ws.getCell(ur, 3).numFmt = FMT_PCT;
  for (let c = 1; c <= 3; c++) ws.getCell(ur, c).border = { top: { style: 'medium' as const, color: { argb: NAVY } }, bottom: { style: 'double' as const, color: { argb: NAVY } } };
  ur++;

  // Sources
  let sr = row;
  const writeSource = (label: string, amt: number, alt: boolean) => {
    ws.getCell(sr, 5).value = label; ws.getCell(sr, 5).font = F_BODY; ws.getCell(sr, 5).border = THIN_BOTTOM;
    ws.getCell(sr, 6).value = amt; ws.getCell(sr, 6).font = F_BODY; ws.getCell(sr, 6).numFmt = FMT_CCY; ws.getCell(sr, 6).border = THIN_BOTTOM;
    ws.getCell(sr, 7).value = pctOf(amt); ws.getCell(sr, 7).font = F_BODY; ws.getCell(sr, 7).numFmt = FMT_PCT; ws.getCell(sr, 7).border = THIN_BOTTOM;
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
  writeSource('Sponsor Equity', su.sponsor_equity, su.rollover_equity > 0 ? false : true);
  // Total sources
  ws.getCell(sr, 5).value = 'Total Sources'; ws.getCell(sr, 5).font = F_BODY_BOLD;
  ws.getCell(sr, 6).value = su.total_sources; ws.getCell(sr, 6).font = F_BODY_BOLD; ws.getCell(sr, 6).numFmt = FMT_CCY;
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

// ── Sheet 3: Assumptions ────────────────────────────────────────────────

function buildAssumptionsSheet(wb: WB, state: ModelState, _ccy: string) {
  const ws = wb.addWorksheet('Assumptions', { properties: { tabColor: { argb: '1a5276' } } });
  ws.getColumn(1).width = 32;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 6;
  ws.getColumn(4).width = 32;
  ws.getColumn(5).width = 18;

  const ai = new Set(state.ai_toggle_fields);
  let row = 1;

  const add = (label: string, value: string | number | null, fieldPath = '', fmt?: string, alt = false) => {
    const isAi = ai.has(fieldPath);
    const prefix = isAi ? '[AI] ' : '';
    row = writeKvRow(ws, row, `${prefix}${label}`, value, { fmt, input: isAi, alt });
  };

  // Entry
  row = writeSectionHeader(ws, row, 'ENTRY ASSUMPTIONS', 2);
  add('Deal Name', state.deal_name, '', undefined);
  add('Sector', state.sector, '', undefined, true);
  add('Currency', state.currency);
  add('LTM Revenue', state.revenue.base_revenue, '', FMT_CCY, true);
  add('LTM EBITDA', state.revenue.base_revenue * state.margins.base_ebitda_margin, '', FMT_CCY);
  add('LTM EBITDA Margin', state.margins.base_ebitda_margin, 'margins.base_ebitda_margin', FMT_PCT, true);
  add('Entry EBITDA Multiple', state.entry.entry_ebitda_multiple, '', FMT_MULT);
  add('Entry Revenue Multiple', state.entry.entry_revenue_multiple, '', FMT_MULT, true);
  add('Enterprise Value', state.entry.enterprise_value, '', FMT_CCY);
  add('Total Debt Raised', state.entry.total_debt_raised, '', FMT_CCY, true);
  add('Leverage Ratio', state.entry.leverage_ratio, 'entry.leverage_ratio', FMT_MULT);
  add('Equity Check', state.entry.equity_check, '', FMT_CCY, true);
  row++;

  // Debt structure
  row = writeSectionHeader(ws, row, 'DEBT STRUCTURE', 2);
  for (const t of state.debt_tranches) {
    ws.getCell(row, 1).value = t.name; ws.getCell(row, 1).font = F_BODY_BOLD; ws.getCell(row, 1).fill = MID_FILL;
    ws.getCell(row, 2).fill = MID_FILL;
    row++;
    add('  Principal', t.principal, '', FMT_CCY);
    add('  Rate Type', t.rate_type, '', undefined, true);
    add('  Interest Rate', t.interest_rate, '', FMT_PCT);
    add('  Amortization', t.amortization_type, '', undefined, true);
    if (t.pik_rate > 0) add('  PIK Rate', t.pik_rate, '', FMT_PCT);
    if (t.rate_type === 'floating') {
      add('  Base Rate', t.base_rate, '', FMT_PCT);
      add('  Spread', t.spread, '', FMT_PCT, true);
      add('  Floor', t.floor, '', FMT_PCT);
    }
  }
  row++;

  // Revenue
  row = writeSectionHeader(ws, row, 'REVENUE ASSUMPTIONS', 2);
  state.revenue.growth_rates.forEach((g, i) => add(`Year ${i + 1} Revenue Growth`, g, 'revenue.growth_rates', FMT_PCT, i % 2 === 1));
  if (state.revenue.churn_rate > 0) add('Churn Rate', state.revenue.churn_rate, '', FMT_PCT);
  row++;

  // Margins
  row = writeSectionHeader(ws, row, 'MARGIN & OPERATING ASSUMPTIONS', 2);
  add('Base EBITDA Margin', state.margins.base_ebitda_margin, 'margins.base_ebitda_margin', FMT_PCT);
  add('Target EBITDA Margin', state.margins.target_ebitda_margin, 'margins.target_ebitda_margin', FMT_PCT, true);
  add('Margin Trajectory', state.margins.margin_trajectory, 'margins.margin_trajectory');
  add('D&A (% Revenue)', state.margins.da_pct_revenue, '', FMT_PCT, true);
  add('Maintenance Capex (% Revenue)', state.margins.capex_pct_revenue, '', FMT_PCT);
  add('NWC (% Revenue)', state.margins.nwc_pct_revenue, '', FMT_PCT, true);
  row++;

  // Fees & Tax
  row = writeSectionHeader(ws, row, 'FEES & TAX', 2);
  add('Entry Fee %', state.fees.entry_fee_pct, '', FMT_PCT);
  add('Exit Fee %', state.fees.exit_fee_pct, '', FMT_PCT, true);
  add('Monitoring Fee (p.a.)', state.fees.monitoring_fee_annual, 'fees.monitoring_fee_annual', FMT_CCY);
  add('Financing Fee %', state.fees.financing_fee_pct, '', FMT_PCT, true);
  add('Transaction Costs', state.fees.transaction_costs, '', FMT_CCY);
  add('Tax Rate', state.tax.tax_rate, '', FMT_PCT, true);
  if (state.tax.nol_carryforward > 0) add('NOL Carryforward', state.tax.nol_carryforward, '', FMT_CCY);
  if (state.tax.minimum_tax_rate > 0) add('Minimum Tax Rate', state.tax.minimum_tax_rate, '', FMT_PCT);
  row++;

  // Exit
  row = writeSectionHeader(ws, row, 'EXIT ASSUMPTIONS', 2);
  add('Holding Period (years)', state.exit.holding_period, 'exit.holding_period', FMT_INT);
  add('Exit EBITDA Multiple', state.exit.exit_ebitda_multiple, 'exit.exit_ebitda_multiple', FMT_MULT, true);
  add('Exit Method', state.exit.exit_method);
  row++;

  // MIP
  row = writeSectionHeader(ws, row, 'MANAGEMENT INCENTIVE PLAN', 2);
  add('MIP Pool %', state.mip.mip_pool_pct, '', FMT_PCT);
  add('Hurdle MOIC', state.mip.hurdle_moic, '', FMT_MULT, true);
  add('Vesting Years', state.mip.vesting_years, '', FMT_INT);
  add('Sweet Equity %', state.mip.sweet_equity_pct, '', FMT_PCT, true);

  // Add-ons
  if (state.add_on_acquisitions && state.add_on_acquisitions.length > 0) {
    row++;
    row = writeSectionHeader(ws, row, 'ADD-ON ACQUISITIONS', 2);
    for (const a of state.add_on_acquisitions) {
      ws.getCell(row, 1).value = a.name; ws.getCell(row, 1).font = F_BODY_BOLD; ws.getCell(row, 1).fill = MID_FILL;
      ws.getCell(row, 2).fill = MID_FILL; row++;
      add('  Year', a.year, '', FMT_INT);
      add('  Revenue', a.revenue, '', FMT_CCY, true);
      add('  EBITDA Margin', a.ebitda_margin, '', FMT_PCT);
      add('  Purchase Multiple', a.purchase_multiple, '', FMT_MULT, true);
      add('  Funding', a.funding);
    }
  }

  freezeAndPrint(ws, 2, 1, false);
}

// ── Sheet 4: P&L ────────────────────────────────────────────────────────

function buildPLSheet(wb: WB, state: ModelState, ccy: string, hp: number, years: AnnualProjectionYear[]) {
  const ws = wb.addWorksheet('P&L', { properties: { tabColor: { argb: '2e86c1' } } });
  ws.getColumn(1).width = 30;
  for (let c = 2; c <= hp + 2; c++) ws.getColumn(c).width = 14;

  if (!years.length) { ws.getCell(1, 1).value = 'No projections calculated'; return; }

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

  const entryRev = state.revenue.base_revenue;
  const entryEbitda = entryRev * state.margins.base_ebitda_margin;

  row = writeDataRow(ws, row, 'Revenue', [entryRev, ...years.map(y => y.revenue)], FMT_CCY, { bold: true });
  row = writeDataRow(ws, row, 'Revenue Growth', ['--', ...years.map(y => y.revenue_growth)], FMT_PCT, { alt: true });
  row++;
  row = writeDataRow(ws, row, 'EBITDA', [entryEbitda, ...years.map(y => y.ebitda)], FMT_CCY, { bold: true });
  row = writeDataRow(ws, row, 'EBITDA Margin', [state.margins.base_ebitda_margin, ...years.map(y => y.ebitda_margin)], FMT_PCT, { alt: true });
  row = writeDataRow(ws, row, 'Monitoring Fee Adj.', [0, ...Array(hp).fill(-state.fees.monitoring_fee_annual)], FMT_CCY);
  row = writeDataRow(ws, row, 'EBITDA Adjusted', [entryEbitda, ...years.map(y => y.ebitda_adj)], FMT_CCY, { bold: true, alt: true });
  row++;
  row = writeDataRow(ws, row, 'D&A', [null, ...years.map(y => -y.da)], FMT_CCY);
  row = writeDataRow(ws, row, 'EBIT', [null, ...years.map(y => y.ebit)], FMT_CCY, { bold: true, alt: true });
  row = writeDataRow(ws, row, 'Interest Expense', [null, ...years.map(y => -y.interest_expense)], FMT_CCY);
  row = writeDataRow(ws, row, 'Financing Fee Amort.', [null, ...years.map(y => -y.financing_fee_amort)], FMT_CCY, { alt: true });
  row = writeDataRow(ws, row, 'EBT', [null, ...years.map(y => y.ebt)], FMT_CCY, { bold: true });
  row = writeDataRow(ws, row, 'Tax', [null, ...years.map(y => -y.tax)], FMT_CCY, { alt: true });
  if (state.tax.nol_carryforward > 0) {
    row = writeDataRow(ws, row, '  NOL Utilised', [null, ...years.map(y => y.nol_used)], FMT_CCY);
  }
  row = writeDataRow(ws, row, 'Net Income', [null, ...years.map(y => y.net_income)], FMT_CCY, { bold: true, topBorder: true });
  row++;
  // Margin analysis
  row = writeDataRow(ws, row, 'Net Income Margin', [null, ...years.map(y => y.revenue > 0 ? y.net_income / y.revenue : 0)], FMT_PCT, { alt: true });
  row = writeDataRow(ws, row, 'NOPAT', [null, ...years.map(y => y.nopat)], FMT_CCY);

  freezeAndPrint(ws, 3, 1);
}

// ── Sheet 5: Cash Flow & Debt ───────────────────────────────────────────

function buildCashFlowDebtSheet(
  wb: WB, state: ModelState, ccy: string, hp: number,
  years: AnnualProjectionYear[],
  ds: ModelState['debt_schedule'],
) {
  const ws = wb.addWorksheet('Cash Flow & Debt', { properties: { tabColor: { argb: '1e8449' } } });
  ws.getColumn(1).width = 30;
  for (let c = 2; c <= hp + 1; c++) ws.getColumn(c).width = 14;

  if (!years.length) { ws.getCell(1, 1).value = 'No projections calculated'; return; }

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

  // FCF Build
  row = writeSectionHeader(ws, row, 'FREE CASH FLOW BUILD', hp + 1);
  row = writeDataRow(ws, row, 'EBITDA Adjusted', years.map(y => y.ebitda_adj), FMT_CCY, { bold: true });
  row = writeDataRow(ws, row, 'Tax Paid', years.map(y => -y.tax), FMT_CCY, { alt: true });
  row = writeDataRow(ws, row, 'Maintenance Capex', years.map(y => -y.maintenance_capex), FMT_CCY);
  row = writeDataRow(ws, row, 'Growth Capex', years.map(y => -y.growth_capex), FMT_CCY, { alt: true });
  row = writeDataRow(ws, row, 'Change in NWC', years.map(y => -y.delta_nwc), FMT_CCY);
  row = writeDataRow(ws, row, 'FCF Pre-Debt Service', years.map(y => y.fcf_pre_debt), FMT_CCY, { bold: true, topBorder: true, alt: true });
  row = writeDataRow(ws, row, 'Cash Interest', ds.total_cash_interest_by_year.map(v => -v), FMT_CCY);
  row = writeDataRow(ws, row, 'Debt Repayment', ds.total_repayment_by_year.map(v => -v), FMT_CCY, { alt: true });
  row = writeDataRow(ws, row, 'FCF to Equity', years.map(y => y.fcf_to_equity), FMT_CCY, { bold: true, topBorder: true });
  row++;

  // Cash conversion
  row = writeDataRow(ws, row, 'Cash Conversion (FCF/EBITDA)', years.map(y => y.ebitda_adj > 0 ? y.fcf_pre_debt / y.ebitda_adj : 0), FMT_PCT, { alt: true });
  row += 1;

  // Debt schedule
  row = writeSectionHeader(ws, row, 'DEBT SCHEDULE', hp + 1);
  for (let tIdx = 0; tIdx < ds.tranche_schedules.length; tIdx++) {
    const trancheSched = ds.tranche_schedules[tIdx];
    if (!trancheSched.length) continue;
    const name = trancheSched[0]?.tranche_name || `Tranche ${tIdx + 1}`;

    // Tranche sub-header
    ws.getCell(row, 1).value = name; ws.getCell(row, 1).font = F_BODY_BOLD; ws.getCell(row, 1).fill = MID_FILL;
    for (let c = 2; c <= hp + 1; c++) ws.getCell(row, c).fill = MID_FILL;
    row++;

    row = writeDataRow(ws, row, '  Opening Balance', trancheSched.map(y => y.beginning_balance), FMT_CCY);
    row = writeDataRow(ws, row, '  Cash Interest', trancheSched.map(y => -y.cash_interest), FMT_CCY, { alt: true });
    if (trancheSched.some(y => y.pik_accrual > 0)) {
      row = writeDataRow(ws, row, '  PIK Accrual', trancheSched.map(y => y.pik_accrual), FMT_CCY);
    }
    row = writeDataRow(ws, row, '  Scheduled Repayment', trancheSched.map(y => -y.scheduled_repayment), FMT_CCY, { alt: true });
    if (trancheSched.some(y => y.sweep_repayment > 0)) {
      row = writeDataRow(ws, row, '  Cash Sweep', trancheSched.map(y => -y.sweep_repayment), FMT_CCY);
    }
    row = writeDataRow(ws, row, '  Closing Balance', trancheSched.map(y => y.ending_balance), FMT_CCY, { bold: true, topBorder: true, alt: true });
    row++;
  }

  // Aggregate
  row = writeDataRow(ws, row, 'Total Debt Outstanding', ds.total_debt_by_year, FMT_CCY, { bold: true });
  row++;

  // Credit metrics
  row = writeSectionHeader(ws, row, 'CREDIT METRICS', hp + 1);
  row = writeDataRow(ws, row, 'Net Debt / EBITDA', ds.leverage_ratio_by_year, FMT_MULT, { bold: true });
  row = writeDataRow(ws, row, 'Interest Coverage (EBITDA / Int)', ds.interest_coverage_by_year.map(v => Math.min(v, 99)), FMT_NUM, { alt: true });
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

function buildReturnsSheet(wb: WB, state: ModelState, ccy: string) {
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

  // Returns summary
  row = writeSectionHeader(ws, row, 'RETURNS SUMMARY', 3);
  const addRet = (label: string, value: number | null, fmt: string, alt = false) => {
    ws.getCell(row, 1).value = label; ws.getCell(row, 1).font = F_BODY; ws.getCell(row, 1).border = THIN_BOTTOM;
    const vc = ws.getCell(row, 2);
    vc.value = value;
    vc.numFmt = fmt;
    vc.border = THIN_BOTTOM;
    vc.alignment = { horizontal: 'right' };
    if (label.includes('IRR') && typeof value === 'number') {
      vc.font = irrFont(value);
      const bg = irrBgFill(value);
      if (bg) vc.fill = bg;
    } else {
      vc.font = F_BODY;
    }
    if (alt && !vc.fill) { ws.getCell(row, 1).fill = LIGHT_FILL; vc.fill = LIGHT_FILL; }
    row++;
  };

  addRet('Equity IRR (Post-Fees, Post-MIP)', ret.irr, FMT_PCT);
  addRet('Gross IRR (Pre-MIP)', ret.irr_gross, FMT_PCT, true);
  addRet('Levered IRR (Pre-Fees)', ret.irr_levered, FMT_PCT);
  addRet('Unlevered IRR', ret.irr_unlevered, FMT_PCT, true);
  row++;
  addRet('MOIC', ret.moic, FMT_MULT);
  addRet('DPI', ret.dpi, FMT_MULT, true);
  addRet('Payback Period (years)', ret.payback_years, '0.0');
  addRet('Average Cash Yield', ret.cash_yield_avg, FMT_PCT, true);
  row++;
  addRet('Entry Equity', ret.entry_equity, FMT_CCY);
  addRet('Exit Equity', ret.exit_equity, FMT_CCY, true);
  addRet('Exit Enterprise Value', ret.exit_ev, FMT_CCY);
  addRet('Exit Net Debt', ret.exit_net_debt, FMT_CCY, true);
  addRet('MIP Payout', ret.mip_payout, FMT_CCY);
  row += 2;

  // Value Driver Bridge
  const vd = state.value_drivers;
  row = writeSectionHeader(ws, row, 'VALUE CREATION BRIDGE', 3);
  ws.getCell(row, 1).value = 'Driver'; ws.getCell(row, 2).value = `${ccy}m`; ws.getCell(row, 3).value = '% Contribution';
  styleHeaderRow(ws, row, 1, 3);
  row++;

  const bridges: [string, number, number | null, boolean][] = [
    ['Entry Equity', vd.entry_equity, null, false],
    ['(+) Revenue Growth', vd.revenue_growth_contribution_abs, vd.revenue_growth_contribution_pct, true],
    ['(+) Margin Expansion', vd.margin_expansion_contribution_abs, vd.margin_expansion_contribution_pct, false],
    ['(+) Multiple Expansion', vd.multiple_expansion_contribution_abs, vd.multiple_expansion_contribution_pct, true],
    ['(+) Debt Paydown', vd.debt_paydown_contribution_abs, vd.debt_paydown_contribution_pct, false],
    ['(-) Fees & Costs', vd.fees_drag_contribution_abs, vd.fees_drag_contribution_pct, true],
    ['Exit Equity', vd.exit_equity, null, false],
  ];

  for (const [label, absVal, pctVal, alt] of bridges) {
    const isTotal = label === 'Entry Equity' || label === 'Exit Equity';
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = isTotal ? F_BODY_BOLD : F_BODY;
    ws.getCell(row, 1).border = isTotal ? MED_BOTTOM : THIN_BOTTOM;
    ws.getCell(row, 2).value = absVal;
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
