/**
 * engine2/excelExport.ts — PHASE_E §E3: the Excel exporter REWRITE. Reads ModelOutput
 * ONLY (the old 106KB ModelState exporter dies with the old engine at Phase F). Sheets
 * mirror the v2 tab set; every cell is the SAME ModelOutput number the tab renders —
 * raw floats with Excel number formats (the DOM formatting boundary does not apply to
 * xlsx; Excel is its own display layer), null ⇒ the literal string "N/A" (§11/§15 — a
 * 9999/99 sentinel can never appear). Sensitivity sheets read the engine's grids
 * (parity preserved by construction: one ModelOutput, two projections).
 */

import ExcelJS from 'exceljs';
import type { Engine2ModelOutput } from './facade';

const MONEY = '#,##0.0';
const MONEY2 = '#,##0.00';
const PCT = '0.0%';
const MULT = '0.0"x"';

type Cell = number | string | null;

function sheetFromRows(
  wb: ExcelJS.Workbook,
  name: string,
  head: string[],
  rows: Cell[][],
  fmts: (string | null)[],
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name);
  ws.addRow(head).font = { bold: true };
  for (const r of rows) {
    const row = ws.addRow(r.map((c) => (c === null ? 'N/A' : c)));
    r.forEach((c, i) => {
      if (typeof c === 'number' && fmts[i]) row.getCell(i + 1).numFmt = fmts[i]!;
    });
  }
  ws.columns.forEach((col) => { col.width = 16; });
  return ws;
}

export function buildEngine2Workbook(o: Engine2ModelOutput, currency: string): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Deal Engine v2 (engine2)';

  // ── Summary ──
  sheetFromRows(wb, 'Summary', [`${o.facts.entity_name} — ${currency}m`, ''], [
    ['Sponsor IRR', o.returns.sponsor_net.irr],
    ['Sponsor MOIC', o.returns.sponsor_net.moic],
    ['Pre-promote IRR', o.returns.pre_promote.irr],
    ['Unlevered IRR', o.returns.unlevered.irr],
    ['Entry multiple', o.derived.entry_multiple],
    ['Exit multiple', o.exit.exit_ev / o.exit.exit_ebitda_basis_value],
    ['Entry net leverage (FY)', o.derived.entry_net_leverage_fy],
    ['Enterprise value', o.derived.enterprise_value],
    ['Sponsor equity', o.sources_uses.sponsor_equity],
    ['Exit equity (pre-MIP)', o.exit.exit_equity_pre_mip_total],
    ['Bridge: EBITDA growth @ entry', o.bridge.ebitda_growth_at_entry_multiple],
    ['Bridge: multiple change', o.bridge.multiple_change_bar],
    ['Bridge: interaction', o.bridge.interaction],
    ['Bridge: net-debt paydown', o.bridge.net_debt_paydown],
  ], [null, PCT]);
  const sum = wb.getWorksheet('Summary')!;
  // metric-appropriate formats on the value column
  [1, 2, 3, 4].forEach((r) => { sum.getCell(r + 1, 2).numFmt = PCT; });
  [5, 6, 7].forEach((r) => { sum.getCell(r + 1, 2).numFmt = MULT; });
  [8, 9, 10, 11, 12, 13, 14].forEach((r) => { sum.getCell(r + 1, 2).numFmt = MONEY; });

  // ── Operating ──
  sheetFromRows(wb, 'Operating',
    ['Year', 'Revenue', 'EBITDA_adj', 'Margin', 'D&A', 'Maint capex', 'Growth capex', 'ΔNWC', 'Cash tax', 'FCF pre-debt'],
    o.operating.map((y, i) => [`Y${i + 1}`, y.revenue, y.ebitda_adj, y.margin, y.da, y.maint_capex, y.growth_capex, y.delta_nwc, o.tax[i].cash_tax, y.fcf_pre_debt]),
    [null, MONEY, MONEY, PCT, MONEY2, MONEY2, MONEY2, MONEY2, MONEY2, MONEY]);

  // ── S&U ──
  sheetFromRows(wb, 'Sources & Uses', ['Line', 'Amount'], [
    ['USES', null],
    ['Enterprise value', o.sources_uses.enterprise_value],
    ['Transaction costs', o.sources_uses.transaction_costs],
    ['Financing fees', o.sources_uses.financing_fees],
    ['OID', o.sources_uses.oid_funded],
    ['Cash to balance sheet', o.sources_uses.cash_to_balance_sheet],
    ['Total uses', o.sources_uses.total_uses],
    ['SOURCES', null],
    ...o.sources_uses.debt_at_par.map((d): Cell[] => [d.name, d.amount]),
    ['Rollover equity', o.sources_uses.rollover_equity],
    ['Sponsor equity (plug)', o.sources_uses.sponsor_equity],
    ['Total sources', o.sources_uses.total_sources],
  ], [null, MONEY]);

  // ── Debt schedule ──
  const debtRows: Cell[][] = [];
  o.tranches.forEach((rows) => {
    rows.forEach((r, i) => debtRows.push([r.name, `Y${i + 1}`, r.beginning_balance, r.cash_interest, r.pik_accrual, r.mandatory_amort, r.sweep_repayment, r.ending_balance]));
  });
  if (o.revolver) o.revolver.forEach((r, i) => debtRows.push(['Revolver', `Y${i + 1}`, r.beginning_drawn, r.cash_interest, r.commitment_fee, r.draw, r.repayment, r.ending_drawn]));
  sheetFromRows(wb, 'Debt', ['Tranche', 'Year', 'Beginning', 'Interest', 'PIK/Fee', 'Amort/Draw', 'Sweep/Repay', 'Ending'],
    debtRows, [null, null, MONEY, MONEY2, MONEY2, MONEY2, MONEY2, MONEY]);
  const last = o.credit[o.credit.length - 1];
  wb.getWorksheet('Debt')!.addRow(['Deleveraging', '', 'Cumulative paydown % of entry debt', last?.cumulative_paydown_pct_of_entry_debt ?? 'N/A', 'FCF conversion (final yr)', last?.fcf_conversion ?? 'N/A', '', '']);

  // ── Balance sheet ──
  sheetFromRows(wb, 'Balance Sheet',
    ['Year', 'Cash', 'Operating NWC', 'PP&E', 'DFC', 'Goodwill', 'Total assets', 'Debt at par', 'Equity', 'Check'],
    o.balance_sheet.map((b, i) => [i === 0 ? 'Open' : `Y${i}`, b.cash, b.operating_nwc, b.ppe, b.deferred_financing_costs, b.goodwill, b.total_assets, b.debt_at_par, b.equity, b.check]),
    [null, MONEY2, MONEY2, MONEY2, MONEY2, MONEY2, MONEY, MONEY, MONEY, '0.000']);

  // ── Credit ──
  sheetFromRows(wb, 'Credit',
    ['Year', 'Net leverage', 'Senior net', 'ICR', 'FCCR', 'DSCR', 'FCF conversion', 'Cum. paydown %'],
    o.credit.map((c, i) => [`Y${i + 1}`, c.net_leverage, c.senior_net_leverage, c.icr, c.fccr, c.dscr, c.fcf_conversion, c.cumulative_paydown_pct_of_entry_debt]),
    [null, MULT, MULT, '0.00', '0.00', '0.00', PCT, PCT]);

  // ── Sensitivity (engine grids — §E3 parity rule) ──
  if (o.sensitivity?.length) {
    const g = o.sensitivity[0];
    const ws = wb.addWorksheet('Sensitivity');
    ws.addRow([`Sponsor IRR — ${g.row_axis} (rows) × ${g.col_axis} (cols)`]).font = { bold: true };
    ws.addRow(['', ...g.col_values]);
    g.irr.forEach((row, r) => {
      const added = ws.addRow([g.row_values[r], ...row.map((v) => v ?? 'N/A')]);
      row.forEach((v, c) => { if (typeof v === 'number') added.getCell(c + 2).numFmt = PCT; });
    });
    ws.addRow([]);
    ws.addRow([`Sponsor MOIC`]).font = { bold: true };
    ws.addRow(['', ...g.col_values]);
    g.moic.forEach((row, r) => {
      const added = ws.addRow([g.row_values[r], ...row.map((v) => v ?? 'N/A')]);
      row.forEach((v, c) => { if (typeof v === 'number') added.getCell(c + 2).numFmt = MULT; });
    });
  }

  // ── Scenarios ──
  if (o.scenarios?.length) {
    sheetFromRows(wb, 'Scenarios',
      ['Scenario', 'IRR', 'Δ vs base', 'MOIC', 'Covenant breach year', 'Floor breach'],
      o.scenarios.map((s) => [
        s.name, s.returns.sponsor_net.irr, s.irr_delta_vs_base, s.returns.sponsor_net.moic,
        s.covenant_breach_year === null ? '—' : `Y${s.covenant_breach_year + 1}`,
        s.waterfall.some((w) => w.cash_floor_breach) ? 'YES' : '—',
      ]),
      [null, PCT, PCT, MULT, null, null]);
  }

  // ── Methodology (SPEC §15) ──
  sheetFromRows(wb, 'Methodology', ['Disclosed simplification', 'Basis'], [
    ['Annual periods; beginning-balance interest (conservative); static rates; constant tax rate', 'SPEC §4/§15'],
    ['Exit = entry multiple unless edited; §382 static; NOL usage not optimized across years', 'SPEC §6/§9/§15'],
    ['Exit-year fee write-off deducted uncapped; PP&E rolls mechanically (may go negative, warned)', 'SPEC §7/§8/§15'],
    ['BSL soft call exempt for sweeps/mandatory; private-credit hard call + CoC put disclosed omissions', 'SPEC §3/§15'],
    ['A model is a range, not a point — the sensitivity/scenario exhibits are the primary caveat mechanism', 'SPEC §15'],
  ], [null, null]);

  return wb;
}
