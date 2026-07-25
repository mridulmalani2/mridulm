/**
 * E3 — engine2 Excel export parity: the workbook's cells ARE the ModelOutput numbers
 * (one output, two projections), null renders "N/A" (never a sentinel), the sensitivity
 * sheet carries the engine grid verbatim, and every expected sheet exists.
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildEngine2Workbook } from '../lib/engine2/excelExport';
import { runModelWithScenarios } from '../lib/engine2/scenarios';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';

const roundTrip = async (wb: ExcelJS.Workbook): Promise<ExcelJS.Workbook> => {
  const buf = await wb.xlsx.writeBuffer();
  const rb = new ExcelJS.Workbook();
  await rb.xlsx.load(buf as ArrayBuffer);
  return rb;
};

describe('E3 — engine2 Excel export (G2 with exhibits)', () => {
  const { facts, assumptions } = GOLDEN_DEALS.G2;
  const g = assumptions.operations.growth;
  const output = runModelWithScenarios(facts, assumptions, {
    scenarios: [{ name: 'Downside', deltas: { operations: { growth: g.map((x: number) => x - 0.02) }, exit_multiple: assumptions.exit.multiple - 0.5 } }],
    sensitivity: [{ row_axis: 'entry_multiple', col_axis: 'exit_multiple', row_values: [8, 8.5, 9, 9.5, 10], col_values: [8, 8.5, 9, 9.5, 10], base_row_index: 2, base_col_index: 2 }],
  });

  it('all sheets exist and survive a write/load round-trip', async () => {
    const rb = await roundTrip(buildEngine2Workbook(output, 'USD'));
    for (const name of ['Summary', 'Operating', 'Sources & Uses', 'Debt', 'Balance Sheet', 'Credit', 'Sensitivity', 'Scenarios', 'Methodology']) {
      expect(rb.getWorksheet(name), name).toBeTruthy();
    }
  });

  it('PARITY: cells equal the ModelOutput numbers exactly (raw floats, no display rounding)', async () => {
    const rb = await roundTrip(buildEngine2Workbook(output, 'USD'));
    const sum = rb.getWorksheet('Summary')!;
    // R&P panel order (§E2): find by label — the order itself is asserted below
    const cellByLabel = (label: string) => {
      let v: unknown = undefined;
      sum.eachRow((row) => { if (String(row.getCell(1).value) === label) v = row.getCell(2).value; });
      return v;
    };
    expect(cellByLabel('Sponsor IRR')).toBe(output.returns.sponsor_net.irr);
    expect(cellByLabel('Enterprise value')).toBe(output.derived.enterprise_value);
    // §11 [v1.1.2] — the LABEL is the thing under test here, not just the number. This row
    // used to read 'Entry net leverage (FY)' directly above a genuinely-net final-year row,
    // so the workbook presented a deleveraging series spanning two bases. Nothing tested
    // labels, so neither the defect nor its recurrence was detectable (hostile review F6).
    expect(cellByLabel('Entry gross leverage (FY, par ÷ EBITDA)')).toBe(output.derived.entry_gross_leverage_fy);
    const summaryLabels: string[] = [];
    sum.eachRow((row) => summaryLabels.push(String(row.getCell(1).value ?? '')));
    expect(summaryLabels).not.toContain('Entry net leverage (FY)');
    expect(summaryLabels.some((l) => /entry.*\bnet\b.*leverage/i.test(l))).toBe(false);
    // and the basis divergence is disclosed where §15 puts disclosures
    const method = rb.getWorksheet('Methodology')!;
    const methodText: string[] = [];
    method.eachRow((row) => methodText.push(String(row.getCell(1).value ?? '')));
    expect(methodText.some((t) => /Entry leverage is GROSS/.test(t))).toBe(true);
    // the R&P section order: price → S&U → returns → capitalization → credit → FCF
    const sections: string[] = [];
    sum.eachRow((row) => { const s = String(row.getCell(1).value ?? ''); if (s.startsWith('— ')) sections.push(s); });
    expect(sections).toEqual([
      '— PURCHASE PRICE & MULTIPLES —', '— SOURCES & USES —', '— RETURNS —',
      '— CAPITALIZATION —', '— CREDIT STATISTICS —', '— FREE CASH FLOW —',
    ]);
    const op = rb.getWorksheet('Operating')!;
    expect(op.getCell(2, 2).value).toBe(output.operating[0].revenue);
    expect(op.getCell(6, 10).value).toBe(output.operating[4].fcf_pre_debt);
    const su = rb.getWorksheet('Sources & Uses')!;
    expect(su.getCell(8, 2).value).toBe(output.sources_uses.total_uses);
    const bs = rb.getWorksheet('Balance Sheet')!;
    expect(bs.getCell(2, 7).value).toBe(output.balance_sheet[0].total_assets);
  });

  it('sensitivity sheet carries the engine grid verbatim incl. the base center cell', async () => {
    const rb = await roundTrip(buildEngine2Workbook(output, 'USD'));
    const ws = rb.getWorksheet('Sensitivity')!;
    // grid starts at row 3 (title, header); center cell = row 3+2, col 2+2
    expect(ws.getCell(5, 4).value).toBe(output.sensitivity![0].irr[2][2]);
    expect(output.sensitivity![0].irr[2][2]).toBe(output.returns.sponsor_net.irr); // §14.7
  });

  it('null semantics: a no-debt deal exports credit ratios as the literal "N/A" — never 9999', async () => {
    const g1 = runModelWithScenarios(GOLDEN_DEALS.G1.facts, GOLDEN_DEALS.G1.assumptions, {});
    const rb = await roundTrip(buildEngine2Workbook(g1, 'USD'));
    const credit = rb.getWorksheet('Credit')!;
    expect(credit.getCell(2, 4).value).toBe('N/A'); // ICR on the all-equity golden
    let found9999 = false;
    rb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => { if (String(c.value).includes('9999')) found9999 = true; })));
    expect(found9999).toBe(false);
  });
});
