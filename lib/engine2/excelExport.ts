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
import { type Engine2ModelOutput } from './facade';
import { entryMultipleDisplay, exitMultipleDisplay } from './display';

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

  // ── Summary — the exportable one-pager follows the R&P panel order recorded in
  //    conventions.json presentation.summaryPanelOrder (§E2 DR-5 alignment):
  //    price & multiples → S&U → returns → capitalization → credit → FCF. The
  //    on-screen Summary tab is the returns-first dashboard VARIANT of the same data.
  const capTotal = o.derived.total_debt_at_par + o.sources_uses.rollover_equity + o.sources_uses.sponsor_equity;
  const entryMult = entryMultipleDisplay(o);
  sheetFromRows(wb, 'Summary', [`${o.facts.entity_name} — ${currency}m (R&P panel order)`, ''], [
    ['— PURCHASE PRICE & MULTIPLES —', null],
    ['Enterprise value', o.derived.enterprise_value],
    // §11: label the entry multiple by its ACTUAL basis (it is NTM-based under an NTM entry,
    // where 'Entry multiple (FY)' was a false label), and show the FY/LTM-canonical figure
    // alongside it when NTM ("shows both, LTM canonical"). FY deals get exactly one row,
    // unchanged.
    [`Entry multiple (${entryMult.basis_label})`, entryMult.valuation],
    ...(entryMult.fy_canonical !== null
      ? [['Entry multiple (FY/LTM, canonical)', entryMult.fy_canonical] as Cell[]]
      : []),
    ['Exit multiple', exitMultipleDisplay(o)],
    ['— SOURCES & USES —', null],
    ['Total uses', o.sources_uses.total_uses],
    ['Debt at par', o.derived.total_debt_at_par],
    ['Sponsor equity (plug)', o.sources_uses.sponsor_equity],
    ['— RETURNS —', null],
    ['Sponsor IRR', o.returns.sponsor_net.irr],
    ['Sponsor MOIC', o.returns.sponsor_net.moic],
    ['Pre-promote IRR', o.returns.pre_promote.irr],
    ['Unlevered IRR', o.returns.unlevered.irr],
    ['— CAPITALIZATION —', null],
    ...o.sources_uses.debt_at_par.map((d): Cell[] => [`${d.name} (x EBITDA · % of cap)`, d.amount]),
    ['Equity (sponsor + rollover)', o.sources_uses.sponsor_equity + o.sources_uses.rollover_equity],
    ['Total capitalization', capTotal],
    ['— CREDIT STATISTICS —', null],
    // §11 [v1.1.2]: entry is GROSS, final-year is NET — two different bases, so both are
    // labelled explicitly. They previously read 'Entry net leverage' / 'Final-year net
    // leverage', which looked like one series and overstated deleveraging by the funded
    // min-cash at the entry end.
    [`Entry gross leverage (${entryMult.sizing_label}, par ÷ EBITDA)`, o.derived.entry_gross_leverage_fy],
    ['Final-year NET leverage', o.credit[o.credit.length - 1]?.net_leverage ?? null],
    ['Y1 DSCR', o.credit[0]?.dscr ?? null],
    ['— FREE CASH FLOW —', null],
    ...o.operating.map((y, i): Cell[] => [`FCF pre-debt Y${i + 1}`, y.fcf_pre_debt]),
  ], [null, MONEY]);
  const sum = wb.getWorksheet('Summary')!;
  // metric-appropriate formats where the generic MONEY is wrong
  sum.eachRow((row, r) => {
    const labelCell = String(row.getCell(1).value ?? '');
    if (/IRR/.test(labelCell)) sum.getCell(r, 2).numFmt = PCT;
    if (/multiple|MOIC|leverage/i.test(labelCell)) sum.getCell(r, 2).numFmt = MULT;
    if (/DSCR/.test(labelCell)) sum.getCell(r, 2).numFmt = '0.00';
  });

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
    // §18: the refi event is DISCLOSED on the schedule (named TrancheYear fields — the ⟳ marker,
    // the year's cash cost, and the old-book write-off; write-off also fires on §7 early retirement).
    rows.forEach((r, i) => debtRows.push([r.name, `Y${i + 1}`, r.beginning_balance, r.cash_interest, r.pik_accrual, r.mandatory_amort, r.sweep_repayment, r.ending_balance, r.refinanced ? '⟳ refi' : '', r.refinancing_cash_cost || '', r.unamortized_writeoff || '']));
  });
  if (o.revolver) o.revolver.forEach((r, i) => debtRows.push(['Revolver', `Y${i + 1}`, r.beginning_drawn, r.cash_interest, r.commitment_fee, r.draw, r.repayment, r.ending_drawn, '', '', '']));
  sheetFromRows(wb, 'Debt', ['Tranche', 'Year', 'Beginning', 'Interest', 'PIK/Fee', 'Amort/Draw', 'Sweep/Repay', 'Ending', 'Refi (§18)', 'Refi cash cost', 'Write-off (old OID+fees)'],
    debtRows, [null, null, MONEY, MONEY2, MONEY2, MONEY2, MONEY2, MONEY, null, MONEY2, MONEY2]);
  const last = o.credit[o.credit.length - 1];
  wb.getWorksheet('Debt')!.addRow(['Deleveraging', '', 'Cumulative paydown % of entry debt', last?.cumulative_paydown_pct_of_entry_debt ?? 'N/A', 'FCF conversion (final yr)', last?.fcf_conversion ?? 'N/A', '', '']);

  // ── Balance sheet ──
  sheetFromRows(wb, 'Balance Sheet',
    ['Year', 'Cash', 'Operating NWC', 'PP&E', 'DFC', 'Goodwill', 'Total assets', 'Debt at par', 'Equity', 'Check'],
    o.balance_sheet.map((b, i) => [i === 0 ? 'Open' : `Y${i}`, b.cash, b.operating_nwc, b.ppe, b.deferred_financing_costs, b.goodwill, b.total_assets, b.debt_at_par, b.equity, b.check]),
    [null, MONEY2, MONEY2, MONEY2, MONEY2, MONEY2, MONEY, MONEY, MONEY, '0.000']);

  // ── Credit ──
  // §11 [v1.1.2]: the basis is in the header, because the Summary sheet's entry figure is
  // GROSS — a reader plotting Summary→Credit would otherwise read a deleveraging series
  // that spans two definitions.
  sheetFromRows(wb, 'Credit',
    ['Year', 'Net leverage (net of cash — entry figure on Summary is GROSS)', 'Senior net', 'ICR', 'FCCR', 'DSCR', 'FCF conversion', 'Cum. paydown %'],
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
        s.covenant_breach_year === null ? '—' : `Y${s.covenant_breach_year}`,
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
    ['Interim distributions: paid at year-end after full debt service (never revolver-funded); blocked capacity does not accrue; the RP trap is the closed-form pro-forma net-leverage test (§3.7 — no solver)', 'SPEC §3/§15'],
    ['Refinancing: scheduled per-tranche event (one per tranche), par-for-par, cash-pay term tranches only; repricing effective for the whole refi year; old OID/DFC write-off + call premium deducted uncapped the FOLLOWING year (conservative vs Treas. Reg. §1.1001-3)', 'SPEC §18/§15'],
    [`Entry leverage is GROSS (debt at par ÷ ${entryMult.sizing_label} EBITDA — the quoted sizing basis); the Credit sheet is NET of cash. Different bases: entry and final-year leverage are NOT a single deleveraging series`, 'SPEC §11'],
    ['A model is a range, not a point — the sensitivity/scenario exhibits are the primary caveat mechanism', 'SPEC §15'],
  ], [null, null]);

  return wb;
}
