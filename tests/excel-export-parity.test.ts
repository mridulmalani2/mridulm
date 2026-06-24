/**
 * Excel export parity (refactor plan P2-6).
 *
 * The Excel workbook is a CONSUMER of engine outputs (it reads state.returns,
 * state.debt_schedule, state.value_drivers, state.ebitda_bridge, …) rather than
 * re-deriving financial formulas, so the historical BUG-pattern formulas were
 * never duplicated there. This test renders the workbook for a canonical deal,
 * reads it back, and asserts key engine values surface in the export — guarding
 * against future divergence between the export and the engine.
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { fullRecalc } from '../lib/engine/index';
import { generateSensitivityTable, generateAllSensitivityTables } from '../lib/engine/scenarios';
import { canonicalDeals } from './fixtures/canonicalDeals';

/**
 * Locate the sensitivity grid that follows a section header containing `needle`
 * and read it back as a {rows, cols, values} block. Row headers and column
 * headers are formatted like "10.0x"; data cells are raw numbers (IRR as a
 * fraction, MOIC as a multiple) with display formatting only.
 */
function readGrid(
  wb: ExcelJS.Workbook,
  needle: string,
): { rows: string[]; cols: string[]; values: (number | null)[][] } | null {
  const isMultLabel = (v: unknown) => typeof v === 'string' && /^\d+(\.\d+)?x$/.test(v);
  for (const ws of wb.worksheets) {
    let startRow = -1;
    ws.eachRow((row, rn) => {
      if (startRow !== -1) return;
      row.eachCell((cell) => {
        if (typeof cell.value === 'string' && cell.value.includes(needle)) startRow = rn;
      });
    });
    if (startRow === -1) continue;

    const headerRow = ws.getRow(startRow + 1);
    const cols: string[] = [];
    for (let c = 2; ; c++) {
      const v = headerRow.getCell(c).value;
      if (!isMultLabel(v)) break;
      cols.push(String(v));
    }
    if (!cols.length) continue;

    const rows: string[] = [];
    const values: (number | null)[][] = [];
    for (let r = startRow + 2; ; r++) {
      const label = ws.getRow(r).getCell(1).value;
      if (!isMultLabel(label)) break;
      rows.push(String(label));
      const rowVals: (number | null)[] = [];
      for (let c = 2; c < 2 + cols.length; c++) {
        const v = ws.getRow(r).getCell(c).value;
        rowVals.push(typeof v === 'number' ? v : null);
      }
      values.push(rowVals);
    }
    return { rows, cols, values };
  }
  return null;
}

async function loadWorkbook(blob: Blob): Promise<ExcelJS.Workbook> {
  // Round-trip via a temp file: readFile(path) avoids the @types/node↔exceljs
  // Buffer generic-type skew that load(Buffer) trips at compile time.
  const buf = Buffer.from(await blob.arrayBuffer());
  const tmp = join(tmpdir(), `lbo-export-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  writeFileSync(tmp, buf);
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmp);
    return wb;
  } finally {
    rmSync(tmp, { force: true });
  }
}

function collectCells(wb: ExcelJS.Workbook): { strings: string[]; numbers: number[] } {
  const strings: string[] = [];
  const numbers: number[] = [];
  wb.eachSheet((ws) => {
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        const v = cell.value;
        if (typeof v === 'number') numbers.push(v);
        else if (v != null) strings.push(String(v));
      });
    });
  });
  return { strings, numbers };
}

describe('P2-6 Excel export reflects engine outputs', () => {
  it('renders a workbook and surfaces the leverage assessment + MOIC', async () => {
    // Import lazily so a load failure surfaces inside the test, not at module load.
    const { buildExcel } = await import('../lib/engine/excelExport');
    const s = fullRecalc(canonicalDeals[0].build());
    const blob = await buildExcel(s);
    const wb = await loadWorkbook(blob);
    const { strings, numbers } = collectCells(wb);

    expect(wb.worksheets.length).toBeGreaterThan(0);
    expect(strings.length + numbers.length).toBeGreaterThan(100);

    // P2-3: the renamed leverage assessment (not a credit-rating letter grade) is present.
    expect(s.credit_analysis.leverage_assessment.length).toBeGreaterThan(0);
    expect(strings.some((v) => v.includes(s.credit_analysis.leverage_assessment))).toBe(true);

    // The export must NOT reintroduce a rating-style label.
    expect(strings.some((v) => /Estimated Credit Rating/i.test(v))).toBe(false);

    // MOIC from the engine surfaces as a numeric cell (consumer, not re-derived).
    expect(numbers.some((n) => Math.abs(n - s.returns.moic) < 0.01)).toBe(true);
  });

  it('surfaces the Phase-4 outputs (fund returns, partial exits, OID, refi, cash trap, recovery)', async () => {
    const { buildExcel } = await import('../lib/engine/excelExport');
    const s = canonicalDeals[0].build();
    s.exit.interim_distributions = [10, 0, 0, 0, 0];
    s.exit.partial_exits = [{ year: 2, pct_sold: 0.3, exit_multiple: 10, exit_fee_pct: 0.01 }];
    s.fund_assumptions = {
      management_fee_pct: 0.02, management_fee_basis: 'invested', carry_rate: 0.2,
      preferred_return: 0.08, carry_waterfall: 'european', fund_size: 1000, deal_allocation_pct: 0.1,
    };
    s.credit_covenants.distribution_block_leverage = 0.1; // always blocks ⇒ flag set
    s.debt_tranches[0].oid_pct = 0.02;
    s.debt_tranches[0].debt_maturity_years = 5;
    s.debt_tranches[0].refinancing = { year: 3, new_spread: 0.08, new_floor: 0, prepayment_premium: 0.02, extend_maturity_by: 0 };
    const st = fullRecalc(s);
    const wb = await loadWorkbook(await buildExcel(st));
    const { strings, numbers } = collectCells(wb);
    const has = (needle: string) => strings.some((v) => v.includes(needle));

    expect(has('FUND-LEVEL RETURNS')).toBe(true);
    expect(has('Net IRR (LP')).toBe(true);
    expect(has('REALISED EQUITY CASHFLOWS')).toBe(true);
    expect(has('PARTIAL EXITS')).toBe(true);
    expect(has('Refinancing Premium')).toBe(true);
    expect(has('OID Amortisation')).toBe(true);
    expect(has('OID (funded by equity')).toBe(true);
    expect(has('Distribution Blocked')).toBe(true);
    expect(has('Year of default')).toBe(true);

    // Fund net MOIC surfaces as a numeric cell (consumer of fund_returns).
    expect(st.fund_returns).toBeDefined();
    expect(numbers.some((n) => Math.abs(n - st.fund_returns!.net_moic) < 1e-3)).toBe(true);
  });
});

describe('WS2: Excel sensitivity grid equals the engine (UI == Excel)', () => {
  // The workbook's entry×exit IRR/MOIC sensitivity sheets must be the SAME data
  // the on-screen heatmap renders — i.e. the engine's table-3 grid where every
  // cell is a full model re-run — not a separate simplified approximation. This
  // pins them together so the old divergence can never come back.
  it('IRR and MOIC sensitivity grids match generateSensitivityTable(state, 3)', async () => {
    const { buildExcel } = await import('../lib/engine/excelExport');
    const s = fullRecalc(canonicalDeals[0].build());
    const wb = await loadWorkbook(await buildExcel(s));

    // Engine's canonical entry×exit grid (table 3) on an identical, fresh state.
    const table = generateSensitivityTable(fullRecalc(canonicalDeals[0].build()), 3);
    expect(table.row_variable).toBe('entry_multiple');
    expect(table.col_variable).toBe('exit_multiple');
    expect(table.row_values.length).toBe(9); // full 9×9 engine grid, not a 5×5 approximation

    const irrGrid = readGrid(wb, 'IRR SENSITIVITY');
    const moicGrid = readGrid(wb, 'MOIC SENSITIVITY');
    expect(irrGrid).not.toBeNull();
    expect(moicGrid).not.toBeNull();

    // Same dimensions as the engine grid.
    expect(irrGrid!.values.length).toBe(table.irr_matrix.length);
    expect(irrGrid!.cols.length).toBe(table.col_values.length);

    // Cell-by-cell parity: every Excel cell equals the engine cell.
    for (let i = 0; i < table.irr_matrix.length; i++) {
      for (let j = 0; j < table.col_values.length; j++) {
        const engineIrr = table.irr_matrix[i][j];
        const xlIrr = irrGrid!.values[i][j];
        if (engineIrr == null) {
          expect(xlIrr).toBeNull();
        } else {
          expect(xlIrr).not.toBeNull();
          expect(Math.abs((xlIrr as number) - engineIrr)).toBeLessThan(1e-9);
        }
        const engineMoic = table.moic_matrix[i][j];
        const xlMoic = moicGrid!.values[i][j];
        expect(xlMoic).not.toBeNull();
        expect(Math.abs((xlMoic as number) - engineMoic)).toBeLessThan(1e-9);
      }
    }
  });

  it('uses the store-populated sensitivity_tables when present (the live export path)', async () => {
    // The store's exportExcel pre-populates state.sensitivity_tables via
    // generateAllSensitivityTables before calling buildExcel. Confirm the
    // workbook reads those tables (identical grid), not only the lazy fallback.
    const { buildExcel } = await import('../lib/engine/excelExport');
    const s = fullRecalc(canonicalDeals[0].build());
    s.sensitivity_tables = generateAllSensitivityTables(s);
    const table = s.sensitivity_tables.find(
      (t) => t.row_variable === 'entry_multiple' && t.col_variable === 'exit_multiple',
    )!;
    const wb = await loadWorkbook(await buildExcel(s));
    const irrGrid = readGrid(wb, 'IRR SENSITIVITY');
    expect(irrGrid).not.toBeNull();
    expect(irrGrid!.values.length).toBe(table.irr_matrix.length);
    for (let i = 0; i < table.irr_matrix.length; i++) {
      for (let j = 0; j < table.col_values.length; j++) {
        const eng = table.irr_matrix[i][j];
        const xl = irrGrid!.values[i][j];
        if (eng == null) expect(xl).toBeNull();
        else expect(Math.abs((xl as number) - eng)).toBeLessThan(1e-9);
      }
    }
  });
});
