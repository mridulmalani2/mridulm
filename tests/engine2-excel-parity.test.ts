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
    // §11: entry multiple is labelled by its ACTUAL basis. G2 is an FY entry ⇒ one row
    // labelled '(FY)', value = derived.entry_multiple, and NO stray canonical row.
    expect(cellByLabel('Entry multiple (FY)')).toBe(output.derived.entry_multiple);
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

  it('§1.1 LTM sizing basis: the Excel entry-leverage row + Methodology name "LTM", not "FY" [audit fix — 4-surface mislabel]', async () => {
    // the Excel export is a standalone deliverable (no HistoryTable badge travels with it)
    const ltmFacts = { ...facts, fy_ebitda: 328, fy_revenue: 1320, fy_ebitda_margin: 328 / 1320, sizing_basis: 'LTM' as const };
    const out = runModelWithScenarios(ltmFacts, assumptions, {});
    const rb = await roundTrip(buildEngine2Workbook(out, 'USD'));
    const labels: string[] = [];
    rb.getWorksheet('Summary')!.eachRow((row) => labels.push(String(row.getCell(1).value ?? '')));
    expect(labels).toContain('Entry gross leverage (LTM, par ÷ EBITDA)');
    expect(labels).not.toContain('Entry gross leverage (FY, par ÷ EBITDA)'); // the mislabel this fix removes
    const method: string[] = [];
    rb.getWorksheet('Methodology')!.eachRow((row) => method.push(String(row.getCell(1).value ?? '')));
    expect(method.some((t) => /debt at par ÷ LTM EBITDA/.test(t))).toBe(true);
  });

  it('scenario covenant breach year is displayed 1-indexed, NOT +1 [audit fix — off-by-one]', async () => {
    // credit.ts::covenantBreachYear returns t+1 (already a 1-indexed hold year); the Excel/Summary
    // display must render Y{value}, not Y{value+1} (which would put a year-N breach outside the hold).
    const tight = { ...assumptions, covenants: { ...assumptions.covenants, leverage_max: 3.0 } };
    const out = runModelWithScenarios(facts, tight, { scenarios: [{ name: 'Base', deltas: {} }] });
    const breach = out.scenarios![0].covenant_breach_year;
    expect(breach).not.toBeNull();
    expect(breach).toBeGreaterThanOrEqual(1); // 1-indexed
    const rb = await roundTrip(buildEngine2Workbook(out, 'USD'));
    const sc = rb.getWorksheet('Scenarios')!;
    // row 2 = first scenario; col 5 = "Covenant breach year"
    expect(sc.getCell(2, 5).value).toBe(`Y${breach}`); // NOT `Y${breach + 1}`
  });

  it('sensitivity sheet carries the engine grid verbatim incl. the base center cell', async () => {
    const rb = await roundTrip(buildEngine2Workbook(output, 'USD'));
    const ws = rb.getWorksheet('Sensitivity')!;
    // grid starts at row 3 (title, header); center cell = row 3+2, col 2+2
    expect(ws.getCell(5, 4).value).toBe(output.sensitivity![0].irr[2][2]);
    expect(output.sensitivity![0].irr[2][2]).toBe(output.returns.sponsor_net.irr); // §14.7
  });

  it('§11 NTM entry: the multiple row is labelled (NTM), a canonical FY/LTM row appears, and no (FY) mislabel survives', async () => {
    // NTM is golden-uncovered; directed. G2 growth[0]=6% ⇒ NTM ≠ FY.
    const ntm = { ...GOLDEN_DEALS.G2.assumptions, entry: { ...GOLDEN_DEALS.G2.assumptions.entry, basis: 'ntm' as const } };
    const out = runModelWithScenarios(GOLDEN_DEALS.G2.facts, ntm, {});
    const rb = await roundTrip(buildEngine2Workbook(out, 'USD'));
    const sum = rb.getWorksheet('Summary')!;
    const rows: [string, unknown][] = [];
    sum.eachRow((row) => rows.push([String(row.getCell(1).value ?? ''), row.getCell(2).value]));
    const byLabel = (l: string) => rows.find((r) => r[0] === l)?.[1];
    expect(byLabel('Entry multiple (NTM)')).toBe(out.derived.entry_multiple);
    expect(byLabel('Entry multiple (FY/LTM, canonical)')).toBeCloseTo(out.derived.enterprise_value / out.derived.entry_ebitda_for_sizing, 9);
    // the whole point: the false '(FY)' label must NOT appear on an NTM entry
    expect(rows.some((r) => r[0] === 'Entry multiple (FY)')).toBe(false);
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

describe('§18 refinancing — Excel surfaces disclose the event (G6-REFI)', () => {
  it('Methodology sheet carries the §18/§15 refinancing row; Debt sheet shows the ⟳ event from NAMED TrancheYear fields', async () => {
    const { runModel } = await import('../lib/engine2/facade');
    const { facts, assumptions } = GOLDEN_DEALS.G6REFI;
    const out = runModel(facts, assumptions);
    const rb = await roundTrip(buildEngine2Workbook(out, 'USD'));

    const methodText: string[] = [];
    rb.getWorksheet('Methodology')!.eachRow((row) => methodText.push(String(row.getCell(1).value ?? '')));
    expect(methodText.some((l) => l.startsWith('Refinancing:') && l.includes('uncapped the FOLLOWING year')), 'refi Methodology row').toBe(true);

    const debt = rb.getWorksheet('Debt')!;
    const header = (debt.getRow(1).values as unknown[]).map(String);
    expect(header).toContain('Refi (§18)');
    expect(header).toContain('Refi cash cost');
    expect(header).toContain('Write-off (old OID+fees)');
    let refiRow: unknown[] | null = null;
    debt.eachRow((row) => { if (String(row.getCell(9).value ?? '') === '⟳ refi') refiRow = [...(row.values as unknown[])]; });
    expect(refiRow, 'exactly the refi year row carries the marker').not.toBeNull();
    // value provenance: the two money cells ARE the named fields (no recomputation)
    const y3 = out.tranches[0][2];
    expect(refiRow![2]).toBe('Y3');
    expect(refiRow![10]).toBe(y3.refinancing_cash_cost);
    expect(refiRow![11]).toBe(y3.unamortized_writeoff);
    // and non-refi rows keep the event columns EMPTY (blank ≠ fabricated 0)
    let zeroCells = 0;
    debt.eachRow((row) => { if (row.getCell(10).value === 0 || row.getCell(11).value === 0) zeroCells += 1; });
    expect(zeroCells).toBe(0);
  });
});

describe('§19 fund overlay — Excel surfaces (G7-FUND)', () => {
  it('Summary RETURNS section carries the net-to-LP rows as NAMED FundBlock fields when the overlay is ON; absent when OFF; Methodology row always present', async () => {
    const { runModel } = await import('../lib/engine2/facade');
    const g7 = runModel(GOLDEN_DEALS.G7FUND.facts, GOLDEN_DEALS.G7FUND.assumptions);
    const rb = await roundTrip(buildEngine2Workbook(g7, 'USD'));
    const sum = rb.getWorksheet('Summary')!;
    const rows: [string, unknown][] = [];
    sum.eachRow((row) => rows.push([String(row.getCell(1).value ?? ''), row.getCell(2).value]));
    const byLabel = (l: string) => rows.find((r) => r[0] === l)?.[1];
    // value provenance: the cells ARE the named fields (raw floats, no display rounding)
    expect(byLabel('Net to LP IRR (after fund fees & carry, fund-of-one)')).toBe(g7.fund!.fund_lp_net.irr);
    expect(byLabel('Net to LP TVPI (= DPI — fully realized)')).toBe(g7.fund!.fund_lp_net.moic);
    expect(byLabel('LP paid-in (equity + fee draws)')).toBe(g7.fund!.paid_in_total);
    // §19.6(c): a fund-OFF workbook carries NONE of the rows (absent, never N/A rows)
    const off = runModel(GOLDEN_DEALS.G2.facts, GOLDEN_DEALS.G2.assumptions);
    const rbOff = await roundTrip(buildEngine2Workbook(off, 'USD'));
    const offLabels: string[] = [];
    rbOff.getWorksheet('Summary')!.eachRow((row) => offLabels.push(String(row.getCell(1).value ?? '')));
    expect(offLabels.some((l) => l.startsWith('Net to LP'))).toBe(false);
    expect(offLabels.some((l) => l.startsWith('LP paid-in'))).toBe(false);
    // §19.8 disclosure row (the #115 both-methodology-surfaces precedent) — unconditional
    const methodText: string[] = [];
    rb.getWorksheet('Methodology')!.eachRow((row) => methodText.push(String(row.getCell(1).value ?? '')));
    expect(methodText.some((l) => l.startsWith('Fund/LP overlay:') && l.includes('NO fee-recovery tier') && l.includes('NOT fund carry')), 'fund Methodology row').toBe(true);
  });
});

describe('§20.8 — the PIK-toggle disclosure row is on the Excel Methodology sheet (both surfaces, the #115 precedent)', () => {
  it('Methodology carries the §20 row with its load-bearing clauses (label mutation-tested)', async () => {
    const { runModel } = await import('../lib/engine2/facade');
    const { facts, assumptions } = GOLDEN_DEALS.G8PIKT;
    const rb = await roundTrip(buildEngine2Workbook(runModel(facts, assumptions), 'USD'));
    const methodText: string[] = [];
    rb.getWorksheet('Methodology')!.eachRow((row) => methodText.push(String(row.getCell(1).value ?? '')));
    const row = methodText.find((l) => l.startsWith('PIK toggle:'));
    expect(row, 'the §20 Methodology row').toBeTruthy();
    expect(row).toContain('WHOLE-coupon election only');
    expect(row).toContain('deducted as ACCRUED');
    expect(row).toContain('deliberately over-fires');
  });
});

describe('§15 completeness — the v1.1.0 interim-distributions row is on the Excel Methodology sheet', () => {
  it('Methodology carries the distributions/RP-trap sentence (label mutation-tested)', async () => {
    const { runModel } = await import('../lib/engine2/facade');
    const { facts, assumptions } = GOLDEN_DEALS.G2;
    const rb = await roundTrip(buildEngine2Workbook(runModel(facts, assumptions), 'USD'));
    const methodText: string[] = [];
    rb.getWorksheet('Methodology')!.eachRow((row) => methodText.push(String(row.getCell(1).value ?? '')));
    expect(methodText.some((l) => l.startsWith('Interim distributions:') && l.includes('no solver')), 'distributions Methodology row').toBe(true);
  });
});

describe('§22 [v1.7.0] — the Excel twins: M10 S&U obligations, the strip section, the §15 row', () => {
  const g9 = GOLDEN_DEALS.G9SWEET;
  const g3 = GOLDEN_DEALS.G3;

  const summaryRows = async (facts: typeof g9.facts, assumptions: typeof g9.assumptions) => {
    const { runModel } = await import('../lib/engine2/facade');
    const o = runModel(facts, assumptions);
    const rb = await roundTrip(buildEngine2Workbook(o as never, 'USD'));
    const rows: [string, unknown][] = [];
    rb.getWorksheet('Summary')!.eachRow((row) => rows.push([String(row.getCell(1).value ?? ''), row.getCell(2).value]));
    return { o, rows, cell: (label: string) => rows.find(([l]) => l === label)?.[1] };
  };

  it('M10: the subscription is a DISPLAYED source; Equity and Total capitalization fold it (labels state the basis)', async () => {
    const { o, cell, rows } = await summaryRows(g9.facts, g9.assumptions);
    expect(cell('Management subscription (sweet equity)')).toBe(o.sources_uses.management_subscription); // 2.0
    expect(cell('Equity (sponsor + rollover + mgmt subscription)')).toBe(
      o.sources_uses.sponsor_equity + o.sources_uses.rollover_equity + o.sources_uses.management_subscription,
    );
    expect(cell('Total capitalization')).toBe(
      o.derived.total_debt_at_par + o.sources_uses.rollover_equity + o.sources_uses.sponsor_equity + o.sources_uses.management_subscription,
    );
    // the OLD label must be gone on a strip deal — one label, one basis
    expect(rows.some(([l]) => l === 'Equity (sponsor + rollover)')).toBe(false);
  });

  it('M10 regression: a strip-less deal keeps the OLD label and the numerically identical rows', async () => {
    const { o, cell, rows } = await summaryRows(g3.facts, g3.assumptions);
    expect(cell('Equity (sponsor + rollover)')).toBe(o.sources_uses.sponsor_equity + o.sources_uses.rollover_equity);
    expect(rows.some(([l]) => l === 'Management subscription (sweet equity)')).toBe(false); // never a zero row
    expect(rows.some(([l]) => l.includes('SWEET EQUITY / WARRANT'))).toBe(false); // §22.10: section ABSENT when off
  });

  it('the §22 section reads NAMED equity_strip fields; the sanctioned derivation is labelled; tier count states its basis', async () => {
    const { o, cell } = await summaryRows(g9.facts, g9.assumptions);
    const es = o.equity_strip!;
    expect(cell('Loan notes subscribed (institutional strip)')).toBe(es.loan_notes_subscribed);
    expect(cell('Institutional ordinaries subscribed (= sponsor equity − loan notes)')).toBe(
      o.sources_uses.sponsor_equity - es.loan_notes_subscribed,
    );
    expect(cell('Loan notes accrued at exit (pre-redemption)')).toBe(es.loan_notes_accrued_balance);
    expect(cell('Loan notes redeemed at exit')).toBe(es.loan_notes_redeemed);
    expect(cell('Management ordinary share at exit')).toBe(es.management_ordinary_share);
    expect(cell('Sweet-equity ratchet tiers reached (§22.5 basis)')).toBe(es.ratchet_tiers_reached);
    expect(cell('Institution MOIC at ratchet (REALIZED figure)')).toBe(es.institution_moic_at_ratchet);
    expect(cell('Warrant payout (net of strike)')).toBe(es.warrant_payout_net);
    expect(cell(`Warrant exercised (${g9.assumptions.warrant!.holder_label} — label only)`)).toBe('YES');
  });

  it('[conformance B1] the S&U WORKSHEET SOURCES block FOOTS: enumerated rows sum to Total sources, strip on AND off', async () => {
    const { runModel } = await import('../lib/engine2/facade');
    for (const deal of [g9, g3]) {
      const o = runModel(deal.facts, deal.assumptions);
      const rb = await roundTrip(buildEngine2Workbook(o as never, 'USD'));
      const rows: [string, unknown][] = [];
      rb.getWorksheet('Sources & Uses')!.eachRow((row) => rows.push([String(row.getCell(1).value ?? ''), row.getCell(2).value]));
      const si = rows.findIndex(([l]) => l === 'SOURCES');
      const ti = rows.findIndex(([l]) => l === 'Total sources');
      expect(si).toBeGreaterThan(-1);
      const enumerated = rows.slice(si + 1, ti).reduce((t, [, v]) => t + (typeof v === 'number' ? v : 0), 0);
      expect(enumerated, `${o.facts.entity_name === 'Golden' ? 'deal' : ''} sources must foot`).toBeCloseTo(rows[ti][1] as number, 9);
      const hasRow = rows.some(([l]) => l === 'Management subscription (sweet equity)');
      expect(hasRow).toBe(o.assumptions.sweet_equity !== null); // strip-ON only, never a zero row
    }
  });

  it('the §22/§15 Methodology row is present with its load-bearing clauses', async () => {
    const { runModel } = await import('../lib/engine2/facade');
    const o = runModel(g9.facts, g9.assumptions);
    const rb = await roundTrip(buildEngine2Workbook(o as never, 'USD'));
    const methodText: string[] = [];
    rb.getWorksheet('Methodology')!.eachRow((row) => methodText.push(String(row.getCell(1).value ?? '')));
    const row = methodText.find((l) => l.startsWith('Sweet equity/ratchets/warrants:'));
    expect(row, '§22 Methodology row').toBeTruthy();
    for (const clause of ['EQUITY', 'MARGINAL', 'LOWER tier', 'DIFFERENT bases', 'input-gate rejections', 'HEADLINE MOIC', 'AT MOST ONE warrant', 'sweetness is never checked']) {
      expect(row!, clause).toContain(clause);
    }
  });
});
