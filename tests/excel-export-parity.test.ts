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
