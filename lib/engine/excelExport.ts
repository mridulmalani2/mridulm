/** Client-side Excel export engine — three-sheet workbook. */

import type { ModelState } from '../dealEngineTypes';

// Lazy-load exceljs to avoid blocking initial page load
let ExcelJS: typeof import('exceljs') | null = null;

async function getExcelJS() {
  if (!ExcelJS) {
    ExcelJS = await import('exceljs');
  }
  return ExcelJS;
}

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', EUR: '€', USD: '$', CHF: 'CHF ' };

const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1a2744' } };
const HEADER_FONT = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
const BODY_FONT = { name: 'Calibri', size: 10 };
const SECTION_FONT = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1a2744' } };
const ALT_ROW_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFf5f7fa' } };
const GREEN_FONT = { name: 'Calibri', size: 10, color: { argb: 'FF006100' } };
const RED_FONT = { name: 'Calibri', size: 10, color: { argb: 'FF9C0006' } };
const AMBER_FONT = { name: 'Calibri', size: 10, color: { argb: 'FF9C6500' } };

function irrFont(irr: number | null) {
  if (irr == null) return BODY_FONT;
  if (irr > 0.25) return GREEN_FONT;
  if (irr >= 0.15) return AMBER_FONT;
  return RED_FONT;
}

export async function buildExcel(state: ModelState): Promise<Blob> {
  const { Workbook } = await getExcelJS();
  const wb = new Workbook();
  const ccy = CURRENCY_SYMBOLS[state.currency] || '£';
  const hp = state.exit.holding_period;

  buildAssumptionsSheet(wb, state, ccy);
  buildCalculationsSheet(wb, state, ccy, hp);
  buildOutputsSheet(wb, state, ccy, hp);

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function styleHeaderRow(ws: import('exceljs').Worksheet, row: number, maxCol: number) {
  for (let col = 1; col <= maxCol; col++) {
    const cell = ws.getCell(row, col);
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: 'center' };
  }
}

function writeSectionHeader(ws: import('exceljs').Worksheet, row: number, title: string, maxCol: number): number {
  ws.mergeCells(row, 1, row, maxCol);
  const cell = ws.getCell(row, 1);
  cell.value = title;
  cell.font = SECTION_FONT;
  cell.border = { bottom: { style: 'medium', color: { argb: 'FF1a2744' } } };
  return row + 1;
}

function writeRow(
  ws: import('exceljs').Worksheet,
  row: number,
  label: string,
  values: (number | string)[],
  fmt: string = 'number',
  alt: boolean = false,
): number {
  const labelCell = ws.getCell(row, 1);
  labelCell.value = label;
  labelCell.font = BODY_FONT;
  for (let i = 0; i < values.length; i++) {
    const cell = ws.getCell(row, i + 2);
    cell.value = values[i];
    cell.font = BODY_FONT;
    if (fmt === 'pct') cell.numFmt = '0.0%';
    else cell.numFmt = '#,##0.0';
    if (alt) cell.fill = ALT_ROW_FILL;
  }
  return row + 1;
}

function buildAssumptionsSheet(wb: import('exceljs').Workbook, state: ModelState, _ccy: string) {
  const ws = wb.addWorksheet('Assumptions');
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 18;

  let row = 1;
  const aiFields = new Set(state.ai_toggle_fields);

  const add = (label: string, value: string | number, fieldPath = '') => {
    const prefix = aiFields.has(fieldPath) ? '[AI] ' : '';
    const lc = ws.getCell(row, 1);
    lc.value = `${prefix}${label}`;
    lc.font = BODY_FONT;
    const vc = ws.getCell(row, 2);
    vc.value = value;
    vc.font = BODY_FONT;
    if (typeof value === 'number' && value < 1 && value > 0) vc.numFmt = '0.0%';
    else if (typeof value === 'number') vc.numFmt = '#,##0.0';
    row++;
  };

  row = writeSectionHeader(ws, row, 'ENTRY ASSUMPTIONS', 2);
  add('Deal Name', state.deal_name);
  add('Sector', state.sector);
  add('Currency', state.currency);
  add('LTM Revenue', state.revenue.base_revenue);
  add('LTM EBITDA Margin', state.margins.base_ebitda_margin, 'margins.base_ebitda_margin');
  add('Entry EBITDA Multiple', state.entry.entry_ebitda_multiple);
  add('Enterprise Value', state.entry.enterprise_value);
  add('Entry Revenue Multiple', state.entry.entry_revenue_multiple);
  add('Total Debt Raised', state.entry.total_debt_raised);
  add('Leverage Ratio', state.entry.leverage_ratio, 'entry.leverage_ratio');
  add('Equity Check', state.entry.equity_check);
  row++;

  row = writeSectionHeader(ws, row, 'DEBT STRUCTURE', 2);
  for (const t of state.debt_tranches) {
    add(`Tranche: ${t.name}`, '');
    add('  Principal', t.principal);
    add('  Rate Type', t.rate_type);
    add('  Interest Rate', t.interest_rate);
    add('  Amortization', t.amortization_type);
    if (t.pik_rate > 0) add('  PIK Rate', t.pik_rate);
  }
  row++;

  row = writeSectionHeader(ws, row, 'REVENUE ASSUMPTIONS', 2);
  state.revenue.growth_rates.forEach((g, i) => add(`Year ${i + 1} Growth`, g, 'revenue.growth_rates'));
  add('Churn Rate', state.revenue.churn_rate);
  row++;

  row = writeSectionHeader(ws, row, 'MARGIN ASSUMPTIONS', 2);
  add('Target EBITDA Margin', state.margins.target_ebitda_margin, 'margins.target_ebitda_margin');
  add('Trajectory', state.margins.margin_trajectory, 'margins.margin_trajectory');
  add('D&A % Revenue', state.margins.da_pct_revenue);
  add('Capex % Revenue', state.margins.capex_pct_revenue);
  add('NWC % Revenue', state.margins.nwc_pct_revenue);
  row++;

  row = writeSectionHeader(ws, row, 'FEES & TAX', 2);
  add('Entry Fee %', state.fees.entry_fee_pct);
  add('Exit Fee %', state.fees.exit_fee_pct);
  add('Monitoring Fee (p.a.)', state.fees.monitoring_fee_annual, 'fees.monitoring_fee_annual');
  add('Financing Fee %', state.fees.financing_fee_pct);
  add('Transaction Costs', state.fees.transaction_costs);
  add('Tax Rate', state.tax.tax_rate);
  add('NOL Carryforward', state.tax.nol_carryforward);
  row++;

  row = writeSectionHeader(ws, row, 'EXIT ASSUMPTIONS', 2);
  add('Holding Period', state.exit.holding_period, 'exit.holding_period');
  add('Exit EBITDA Multiple', state.exit.exit_ebitda_multiple, 'exit.exit_ebitda_multiple');
  add('Exit Method', state.exit.exit_method);
  row++;

  row = writeSectionHeader(ws, row, 'MANAGEMENT INCENTIVE', 2);
  add('MIP Pool %', state.mip.mip_pool_pct);
  add('Hurdle MOIC', state.mip.hurdle_moic);
  add('Vesting Years', state.mip.vesting_years);
  add('Sweet Equity %', state.mip.sweet_equity_pct);
}

function buildCalculationsSheet(wb: import('exceljs').Workbook, state: ModelState, _ccy: string, hp: number) {
  const ws = wb.addWorksheet('Calculations');
  ws.getColumn(1).width = 28;
  for (let c = 2; c <= hp + 1; c++) ws.getColumn(c).width = 14;

  const years = state.projections.years;
  if (!years.length) {
    ws.getCell(1, 1).value = 'No projections calculated';
    return;
  }

  let row = 1;
  ws.getCell(row, 1).value = '';
  for (let i = 0; i < hp; i++) {
    ws.getCell(row, i + 2).value = `Year ${i + 1}`;
    ws.getCell(row, i + 2).font = HEADER_FONT;
  }
  styleHeaderRow(ws, row, hp + 1);
  row++;

  row = writeSectionHeader(ws, row, 'INCOME STATEMENT', hp + 1);
  row = writeRow(ws, row, 'Revenue', years.map((y) => y.revenue), 'currency');
  row = writeRow(ws, row, 'Revenue Growth', years.map((y) => y.revenue_growth), 'pct', true);
  row = writeRow(ws, row, 'EBITDA', years.map((y) => y.ebitda), 'currency');
  row = writeRow(ws, row, 'EBITDA Margin', years.map((y) => y.ebitda_margin), 'pct', true);
  row = writeRow(ws, row, 'Monitoring Fee Adj.', Array(hp).fill(-state.fees.monitoring_fee_annual), 'currency');
  row = writeRow(ws, row, 'EBITDA Adjusted', years.map((y) => y.ebitda_adj), 'currency', true);
  row = writeRow(ws, row, 'D&A', years.map((y) => -y.da), 'currency');
  row = writeRow(ws, row, 'EBIT', years.map((y) => y.ebit), 'currency', true);
  row = writeRow(ws, row, 'Interest Expense', years.map((y) => -y.interest_expense), 'currency');
  row = writeRow(ws, row, 'EBT', years.map((y) => y.ebt), 'currency', true);
  row = writeRow(ws, row, 'Tax', years.map((y) => -y.tax), 'currency');
  row = writeRow(ws, row, 'Net Income', years.map((y) => y.net_income), 'currency', true);
  row++;

  row = writeSectionHeader(ws, row, 'FREE CASH FLOW', hp + 1);
  row = writeRow(ws, row, 'EBITDA Adjusted', years.map((y) => y.ebitda_adj), 'currency');
  row = writeRow(ws, row, 'Tax', years.map((y) => -y.tax), 'currency', true);
  row = writeRow(ws, row, 'Maintenance Capex', years.map((y) => -y.maintenance_capex), 'currency');
  row = writeRow(ws, row, 'Growth Capex', years.map((y) => -y.growth_capex), 'currency', true);
  row = writeRow(ws, row, 'Change in NWC', years.map((y) => -y.delta_nwc), 'currency');
  row = writeRow(ws, row, 'FCF Pre-Debt', years.map((y) => y.fcf_pre_debt), 'currency', true);
  row = writeRow(ws, row, 'FCF to Equity', years.map((y) => y.fcf_to_equity), 'currency');
  row++;

  row = writeSectionHeader(ws, row, 'DEBT SCHEDULE', hp + 1);
  const ds = state.debt_schedule;
  for (let tIdx = 0; tIdx < ds.tranche_schedules.length; tIdx++) {
    const trancheSched = ds.tranche_schedules[tIdx];
    const name = trancheSched[0]?.tranche_name || `Tranche ${tIdx + 1}`;
    row = writeRow(ws, row, `${name} — Beg Balance`, trancheSched.map((y) => y.beginning_balance), 'currency');
    row = writeRow(ws, row, '  Cash Interest', trancheSched.map((y) => -y.cash_interest), 'currency', true);
    row = writeRow(ws, row, '  PIK Accrual', trancheSched.map((y) => y.pik_accrual), 'currency');
    row = writeRow(ws, row, '  Repayment', trancheSched.map((y) => -y.total_repayment), 'currency', true);
    row = writeRow(ws, row, '  End Balance', trancheSched.map((y) => y.ending_balance), 'currency');
    row++;
  }

  row = writeRow(ws, row, 'Total Debt', ds.total_debt_by_year, 'currency');
  row = writeRow(ws, row, 'Leverage Ratio', ds.leverage_ratio_by_year, 'number', true);
  row = writeRow(ws, row, 'Interest Coverage', ds.interest_coverage_by_year, 'number');
  row = writeRow(ws, row, 'DSCR', ds.dscr_by_year, 'number', true);
}

function buildOutputsSheet(wb: import('exceljs').Workbook, state: ModelState, ccy: string, _hp: number) {
  const ws = wb.addWorksheet('Outputs');
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 18;

  let row = 1;
  const ret = state.returns;

  row = writeSectionHeader(ws, row, 'RETURNS SUMMARY', 3);

  const addMetric = (label: string, value: number | null, fmt = '0.0%') => {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = BODY_FONT;
    const cell = ws.getCell(row, 2);
    cell.value = value;
    cell.numFmt = fmt;
    cell.font = label.includes('IRR') && typeof value === 'number' ? irrFont(value) : BODY_FONT;
    row++;
  };

  addMetric('Equity IRR', ret.irr);
  addMetric('Gross IRR', ret.irr_gross);
  addMetric('Levered IRR', ret.irr_levered);
  addMetric('Unlevered IRR', ret.irr_unlevered);
  addMetric('MOIC', ret.moic, '0.00x');
  addMetric('Payback (years)', ret.payback_years, '0.0');
  addMetric('Cash Yield (avg)', ret.cash_yield_avg);
  addMetric('Entry Equity', ret.entry_equity, '#,##0.0');
  addMetric('Exit Equity', ret.exit_equity, '#,##0.0');
  addMetric('Exit EV', ret.exit_ev, '#,##0.0');
  addMetric('MIP Payout', ret.mip_payout, '#,##0.0');
  row++;

  // Value Driver Bridge
  const vd = state.value_drivers;
  row = writeSectionHeader(ws, row, 'VALUE DRIVER BRIDGE', 3);
  ws.getCell(row, 1).value = 'Driver';
  ws.getCell(row, 1).font = HEADER_FONT;
  ws.getCell(row, 2).value = `${ccy}m`;
  ws.getCell(row, 2).font = HEADER_FONT;
  ws.getCell(row, 3).value = '% Contribution';
  ws.getCell(row, 3).font = HEADER_FONT;
  styleHeaderRow(ws, row, 3);
  row++;

  const bridges: [string, number, number | ''][] = [
    ['Entry Equity', vd.entry_equity, ''],
    ['Revenue Growth', vd.revenue_growth_contribution_abs, vd.revenue_growth_contribution_pct],
    ['Margin Expansion', vd.margin_expansion_contribution_abs, vd.margin_expansion_contribution_pct],
    ['Multiple Expansion', vd.multiple_expansion_contribution_abs, vd.multiple_expansion_contribution_pct],
    ['Debt Paydown', vd.debt_paydown_contribution_abs, vd.debt_paydown_contribution_pct],
    ['Fees Drag', vd.fees_drag_contribution_abs, vd.fees_drag_contribution_pct],
    ['Exit Equity', vd.exit_equity, ''],
  ];
  for (const [label, absVal, pctVal] of bridges) {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = BODY_FONT;
    ws.getCell(row, 2).value = absVal;
    ws.getCell(row, 2).numFmt = '#,##0.0';
    if (typeof pctVal === 'number') {
      ws.getCell(row, 3).value = pctVal / 100;
      ws.getCell(row, 3).numFmt = '0.0%';
    }
    row++;
  }
  row++;

  // Scenarios
  if (state.scenarios.length) {
    row = writeSectionHeader(ws, row, 'SCENARIO COMPARISON', 6);
    const headers = ['Metric', ...state.scenarios.map((s) => s.name.toUpperCase())];
    for (let i = 0; i < headers.length; i++) {
      ws.getCell(row, i + 1).value = headers[i];
      ws.getCell(row, i + 1).font = HEADER_FONT;
    }
    styleHeaderRow(ws, row, headers.length);
    row++;

    ws.getCell(row, 1).value = 'IRR';
    ws.getCell(row, 1).font = BODY_FONT;
    state.scenarios.forEach((s, i) => {
      const cell = ws.getCell(row, i + 2);
      cell.value = s.irr;
      cell.numFmt = '0.0%';
      cell.font = irrFont(s.irr);
    });
    row++;

    ws.getCell(row, 1).value = 'MOIC';
    ws.getCell(row, 1).font = BODY_FONT;
    state.scenarios.forEach((s, i) => {
      ws.getCell(row, i + 2).value = s.moic;
      ws.getCell(row, i + 2).numFmt = '0.00x';
    });
    row++;

    ws.getCell(row, 1).value = 'Exit Multiple';
    ws.getCell(row, 1).font = BODY_FONT;
    state.scenarios.forEach((s, i) => {
      ws.getCell(row, i + 2).value = s.exit_multiple;
      ws.getCell(row, i + 2).numFmt = '0.0x';
    });
    row += 2;
  }

  // Exit Reality Check
  const rc = state.exit_reality_check;
  row = writeSectionHeader(ws, row, 'EXIT REALITY CHECK', 4);
  ws.getCell(row, 1).value = 'Verdict';
  ws.getCell(row, 1).font = SECTION_FONT;
  const verdictCell = ws.getCell(row, 2);
  verdictCell.value = rc.verdict.toUpperCase();
  verdictCell.font = rc.verdict === 'aggressive' ? RED_FONT : rc.verdict === 'conservative' ? AMBER_FONT : GREEN_FONT;
  row++;

  if (rc.implied_buyer_irr != null) {
    ws.getCell(row, 1).value = 'Implied Buyer IRR';
    ws.getCell(row, 1).font = BODY_FONT;
    const cell = ws.getCell(row, 2);
    cell.value = rc.implied_buyer_irr;
    cell.numFmt = '0.0%';
    cell.font = irrFont(rc.implied_buyer_irr);
    row++;
  }
  row++;

  if (rc.flags.length) {
    ws.getCell(row, 1).value = 'Rule';
    ws.getCell(row, 1).font = HEADER_FONT;
    ws.getCell(row, 2).value = 'Severity';
    ws.getCell(row, 2).font = HEADER_FONT;
    ws.getCell(row, 3).value = 'Description';
    ws.getCell(row, 3).font = HEADER_FONT;
    ws.getCell(row, 4).value = 'Impact';
    ws.getCell(row, 4).font = HEADER_FONT;
    styleHeaderRow(ws, row, 4);
    row++;

    for (const flag of rc.flags) {
      ws.getCell(row, 1).value = flag.flag_type;
      ws.getCell(row, 1).font = BODY_FONT;
      const sevCell = ws.getCell(row, 2);
      sevCell.value = flag.severity.toUpperCase();
      sevCell.font = flag.severity === 'critical' ? RED_FONT : AMBER_FONT;
      ws.getCell(row, 3).value = flag.description;
      ws.getCell(row, 3).font = BODY_FONT;
      ws.getCell(row, 4).value = flag.quantified_impact;
      ws.getCell(row, 4).font = BODY_FONT;
      row++;
    }
  }
}
