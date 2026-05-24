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
import { canonicalDeals } from './fixtures/canonicalDeals';

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
});
