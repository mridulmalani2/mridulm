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
  // §22.10/M10 [v1.7.0]: the subscription folds into Total capitalization (0 when the
  // strip is off — the row is numerically identical to pre-v1.7.0 on every old deal).
  const capTotal = o.derived.total_debt_at_par + o.sources_uses.rollover_equity + o.sources_uses.sponsor_equity + o.sources_uses.management_subscription;
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
    // §22.10/M10 [v1.7.0]: the management subscription is a DISPLAYED §2 source entering
    // total_sources; rendered only when the strip is ON (the §19 no-zero-row discipline).
    ...(o.assumptions.sweet_equity !== null
      ? [['Management subscription (sweet equity)', o.sources_uses.management_subscription] as Cell[]]
      : []),
    ['— RETURNS —', null],
    ['Sponsor IRR', o.returns.sponsor_net.irr],
    ['Sponsor MOIC', o.returns.sponsor_net.moic],
    ['Pre-promote IRR', o.returns.pre_promote.irr],
    ['Unlevered IRR', o.returns.unlevered.irr],
    // §19 [v1.4.0]: the net-to-LP stream rides the RETURNS section ONLY when the overlay is
    // ON — §19.6(c) makes it ABSENT when OFF (no N/A rows for a feature that is off).
    ...(o.fund !== null
      ? [
          ['Net to LP IRR (after fund fees & carry, fund-of-one)', o.fund.fund_lp_net.irr] as Cell[],
          ['Net to LP TVPI (= DPI — fully realized)', o.fund.fund_lp_net.moic] as Cell[],
          ['LP paid-in (equity + fee draws)', o.fund.paid_in_total] as Cell[],
        ]
      : []),
    // §22.10 [v1.7.0]: the strip/warrant block — ABSENT when both instruments are off
    // (§22.10's biconditional; never a zero section). Every cell reads a NAMED
    // EquityStripBlock field; the ONE sanctioned derivation is the institutional ordinary
    // subscription = sponsor_equity − loan_notes_subscribed (§22.10). The tier count is
    // labelled by its §22.5 basis (the §9 naming rule — the promote ratchet emits none).
    ...(o.equity_strip !== null
      ? [
          ['— SWEET EQUITY / WARRANT (§22) —', null] as Cell[],
          ...(o.assumptions.sweet_equity !== null
            ? [
                ['Loan notes subscribed (institutional strip)', o.equity_strip.loan_notes_subscribed] as Cell[],
                ['Institutional ordinaries subscribed (= sponsor equity − loan notes)', o.sources_uses.sponsor_equity - o.equity_strip.loan_notes_subscribed] as Cell[],
                ['Loan notes accrued at exit (pre-redemption)', o.equity_strip.loan_notes_accrued_balance] as Cell[],
                ['Loan notes redeemed at exit', o.equity_strip.loan_notes_redeemed] as Cell[],
              ]
            : []),
          ['Ordinary pot pre-warrant', o.equity_strip.ordinary_pot_pre_warrant] as Cell[],
          [`Warrant exercised (${o.assumptions.warrant?.holder_label ?? 'no warrant'} — label only)`, o.equity_strip.warrant_exercised ? 'YES' : 'no'] as Cell[],
          ['Warrant payout (net of strike)', o.equity_strip.warrant_payout_net] as Cell[],
          ...(o.assumptions.sweet_equity !== null
            ? [
                ['Management ordinary share at exit', o.equity_strip.management_ordinary_share] as Cell[],
                ['Institutional ordinary share at exit', o.equity_strip.institution_ordinary_share] as Cell[],
                ['Sweet-equity ratchet tiers reached (§22.5 basis)', o.equity_strip.ratchet_tiers_reached] as Cell[],
                ['Institution MOIC at ratchet (REALIZED figure)', o.equity_strip.institution_moic_at_ratchet] as Cell[],
              ]
            : []),
        ]
      : []),
    ['— CAPITALIZATION —', null],
    ...o.sources_uses.debt_at_par.map((d): Cell[] => [`${d.name} (x EBITDA · % of cap)`, d.amount]),
    // §22.10/M10 [v1.7.0]: the Equity line carries the subscription (§22.8's §8 rule) —
    // labelled by its basis when the strip is ON, byte-identical to the old row when OFF.
    [o.assumptions.sweet_equity !== null ? 'Equity (sponsor + rollover + mgmt subscription)' : 'Equity (sponsor + rollover)',
      o.sources_uses.sponsor_equity + o.sources_uses.rollover_equity + o.sources_uses.management_subscription],
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
    if (/tiers reached/.test(labelCell)) sum.getCell(r, 2).numFmt = '0'; // an integer COUNT, never '1.0'
    if (/multiple|MOIC|TVPI|leverage/i.test(labelCell)) sum.getCell(r, 2).numFmt = MULT;
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
    // §22.10/M10 [v1.7.0]: the subscription is a DISPLAYED source in THIS sheet's SOURCES
    // block — without it the enumerated sources misfoot Total sources by exactly the
    // subscription on every strip deal (conformance B1; strip-ON only, the §19 discipline).
    ...(o.assumptions.sweet_equity !== null
      ? [['Management subscription (sweet equity)', o.sources_uses.management_subscription] as Cell[]]
      : []),
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
    ["Fund/LP overlay: fund-of-one on the SPONSOR side only; annual fee on a constant basis (no step-downs/NAV); no subscription line, no GP commitment, no clawback (nothing to claw back by construction); european = all-contributions hurdle + pref base, american = invested-capital base with NO fee-recovery tier; the §10 promote is NOT fund carry; the year-N fee draws BEFORE the final distribution", 'SPEC §19/§15'],
    ["Sector comps band: public-market TRADING multiples, NOT buyout-entry multiples (no ordering against your entry multiple is asserted); industry AGGREGATES (aggregate EV ÷ aggregate EBITDA), not median firms, trailing through the prior year's Q3; annual vintage from a COMMITTED dataset, refreshed manually (no live feed); positive-EBITDA block only, NA and non-positive excluded; the firm count is the industry POPULATION; the sector map is a stated convention keyed on the numeric SIC (primary activity only); financials are not uniformly unavailable; a band may collapse to a point; region inferred from reporting currency", 'SPEC §21/§15'],
    ['PIK toggle: per-year WHOLE-coupon election only (no partial/50-50 — v2); elections frozen across scenarios; PIK deducted as ACCRUED with AHYDO (§163(e)(5)/§163(i)) a disclosed omission — deferral-until-paid and the disqualified-portion disallowance are NOT modelled; qualifying notes carry the structural ahydo_shape warning (maturity > 5y + an accruing year), yield leg untested (needs the monthly AFR) and significant-OID leg proxied, so it deliberately over-fires; PIK notes stay non-refinanceable and sweep-exempt by default', 'SPEC §20/§15'],
    ["Sweet equity/ratchets/warrants: loan notes are EQUITY — outside §11 leverage, the §3 waterfall and the §9 payoff, NO interest deduction (never anti-conservative), accruing only, no year-0 accretion; ratchets are MARGINAL top-slice MOIC step functions struck at EXIT ONLY, never cliffs (no solution over an interval), exact-threshold takes the LOWER tier (strict >), IRR ratchets deferred; the two ratchets are struck on DIFFERENT bases (total proceeds vs the institution's own realized value); strip/ratchet/warrant frozen across scenarios; the subscription reduces the sponsor's own cheque (a §2 source); promote ∧ strip and strip ∧ rollover are input-gate rejections; an unredeemed accreted balance warns and zeroes the sweet layer; a negative final sponsor flow makes the HEADLINE MOIC exceed the realized one (the ratchet reads the realized figure); AT MOST ONE warrant, full dilution with strike paid in, not exercised at-the-money, non-participating, tranche association a label; subscription price and ordinary % are independent — sweetness is never checked", 'SPEC §22/§15'],
    [`Entry leverage is GROSS (debt at par ÷ ${entryMult.sizing_label} EBITDA — the quoted sizing basis); the Credit sheet is NET of cash. Different bases: entry and final-year leverage are NOT a single deleveraging series`, 'SPEC §11'],
    ['A model is a range, not a point — the sensitivity/scenario exhibits are the primary caveat mechanism', 'SPEC §15'],
  ], [null, null]);

  return wb;
}
