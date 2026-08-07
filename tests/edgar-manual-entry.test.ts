/**
 * Directed fixtures for the multi-year MANUAL entry builder (lib/edgar/buildModel.ts) —
 * the private-target/CIM path. Data-side (Tier-B allowlist): every derivation asserted
 * here is hand-computed in the comment next to it; the blank→gap invariant (nothing is
 * ever coerced to a fabricated 0) is the load-bearing property.
 */

import { describe, it, expect } from 'vitest';
import { manualHistoricals, shiftYearEnd, type ManualFactsInput } from '../lib/edgar/buildModel';
import { adaptRawHistoricals } from '../lib/engine2/factsAdapter';
import { suggestAssumptions } from '../lib/engine2/suggest';

const FULL: ManualFactsInput = {
  dealName: 'Fixture Full Co', sector: 'Industrials', currency: 'USD', basis: 'FY', ltm: null,
  years: [
    { end: '2023-12-31', revenue: 100, ebitda: 20, da: 4, capex: 5 },
    { end: '2024-12-31', revenue: 110, ebitda: 23, da: 4.5, capex: 5.5 },
    { end: '2025-12-31', revenue: 121, ebitda: 26, da: 5, capex: 6 },
  ],
  nwc: 12, grossDebt: 60, cash: 10,
  netDebt: 999, // must be IGNORED: both legs present ⇒ net debt is DERIVED
  netPpe: 40, taxRate: 0.25, nol: 7,
};

describe('manualHistoricals — full multi-year entry (FY basis)', () => {
  const raw = manualHistoricals(FULL);

  it('sizing pair + anchor identity come from the LAST fiscal year', () => {
    expect(raw.basis).toBe('FY');
    expect(raw.origin).toBe('manual');
    expect(raw.fiscalYear).toBe(2025);
    expect(raw.periodEnd).toBe('2025-12-31');
    expect(raw.as_of).toBe('2025-12-31');
    expect(raw.fy_revenue?.value).toBe(121);
    expect(raw.fy_revenue?.provenance.source).toBe('user');
    expect(raw.fy_ebitda?.value).toBe(26);
  });

  it('derived rates are anchor-FY ratios (hand-computed)', () => {
    expect(raw.ebitda_margin?.value).toBeCloseTo(26 / 121, 12);      // 0.214876…
    expect(raw.da_pct_revenue?.value).toBeCloseTo(5 / 121, 12);      // 0.041322…
    expect(raw.capex_pct_revenue?.value).toBeCloseTo(6 / 121, 12);   // 0.049587…
    expect(raw.nwc_pct_revenue?.value).toBeCloseTo(12 / 121, 12);    // 0.099174…
    expect(raw.ebitda_margin?.provenance.detail).toContain('EBITDA ÷ revenue');
  });

  it('net debt DERIVES from gross − cash when both are entered; the direct field is ignored', () => {
    expect(raw.gross_debt?.value).toBe(60);
    expect(raw.cash?.value).toBe(10);
    expect(raw.net_debt?.value).toBe(50); // 60 − 10, NOT the contradicting direct 999
    expect(raw.net_debt?.provenance.detail).toBe('gross debt − cash (both entered)');
    expect(raw.gaps).toEqual([]);
  });

  it('history series carry one point per ENTERED cell; operating income = EBITDA − D&A per year', () => {
    expect(raw.history?.revenue.points.map((p) => p.value)).toEqual([100, 110, 121]);
    expect(raw.history?.ebitda.points.map((p) => p.value)).toEqual([20, 23, 26]);
    expect(raw.history?.operating_income.points.map((p) => p.value)).toEqual([16, 18.5, 21]);
    // duration start = day after the prior year end (shared shiftYearEnd definition)
    expect(raw.history?.revenue.points[0].start).toBe('2023-01-01');
    expect(raw.history?.revenue.points[0].end).toBe('2023-12-31');
  });

  it('flows through the adapter with source=manual, no missing facts, and a HISTORY growth basis', () => {
    const adapted = adaptRawHistoricals(raw);
    expect(adapted.facts.source).toBe('manual');
    expect(adapted.missing).toEqual([]);
    expect(adapted.facts.history.length).toBe(3);
    const { basis, assumptions } = suggestAssumptions(adapted.facts);
    expect(basis['operations.growth'].kind).toBe('history');
    // CAGR over the true span: (121/100)^(365.25/731) − 1 = 0.0999243…
    expect(assumptions.operations.growth[0]).toBeCloseTo(0.0999243, 5);
  });
});

describe('manualHistoricals — sparse entry: blanks stay gaps, NEVER fabricated zeros', () => {
  const raw = manualHistoricals({
    dealName: 'Fixture Sparse Co', sector: 'Other', currency: 'EUR', basis: 'FY', ltm: null,
    years: [{ end: '2025-06-30', revenue: 200, ebitda: 50, da: null, capex: null }],
    nwc: null, grossDebt: 80, cash: null, netDebt: null, netPpe: null, taxRate: null, nol: null,
  });

  it('unentered operating fields are null + gap-listed (mapper-identical labels)', () => {
    expect(raw.da).toBeNull();
    expect(raw.da_pct_revenue).toBeNull();
    expect(raw.capex_pct_revenue).toBeNull();
    expect(raw.nwc_pct_revenue).toBeNull();
    expect(raw.gaps).toEqual(['D&A %', 'Capex %', 'NWC %', 'Net debt at entry']);
  });

  it('gross debt WITHOUT cash never becomes net debt (no silent −0); tax stays null for the honest statutory downgrade', () => {
    expect(raw.gross_debt?.value).toBe(80);
    expect(raw.cash).toBeNull();
    expect(raw.net_debt).toBeNull(); // a missing leg is a gap, not gross − 0
    expect(raw.effective_tax_rate).toBeNull();
    const adapted = adaptRawHistoricals(raw);
    expect(adapted.missing).toContain('net_debt');
    expect(adapted.templateBases['tax.rate']).toContain('statutory default');
  });

  it('a single history point keeps the growth suggestion on its TEMPLATE basis (D1 ≥3 gate)', () => {
    const adapted = adaptRawHistoricals(raw);
    const { basis } = suggestAssumptions(adapted.facts);
    expect(basis['operations.growth'].kind).toBe('template');
  });
});

describe('manualHistoricals — LTM sizing basis (§1.1, the CIM presentation)', () => {
  const raw = manualHistoricals({
    dealName: 'Fixture LTM Co', sector: 'Consumer', currency: 'GBP', basis: 'LTM',
    ltm: { asOf: '2026-06-30', revenue: 118, ebitda: 25 },
    years: [
      { end: '2024-12-31', revenue: 100, ebitda: 20, da: 4, capex: 5 },
      { end: '2025-12-31', revenue: 110, ebitda: 22, da: 5, capex: 6 },
    ],
    nwc: 11, grossDebt: null, cash: null, netDebt: 30, netPpe: null, taxRate: 0.24, nol: null,
  });

  it('the sizing pair is the LTM pair, carried WITH its basis and as-of', () => {
    expect(raw.basis).toBe('LTM');
    expect(raw.as_of).toBe('2026-06-30');
    expect(raw.fy_revenue?.value).toBe(118);
    expect(raw.fy_revenue?.provenance.detail).toBe('Manually entered — LTM revenue as of 2026-06-30');
    expect(raw.ebitda_margin?.value).toBeCloseTo(25 / 118, 12);
  });

  it('operating rates STILL derive from the anchor FY, never the LTM pair (§1.1 rule)', () => {
    expect(raw.da_pct_revenue?.value).toBeCloseTo(5 / 110, 12);
    expect(raw.capex_pct_revenue?.value).toBeCloseTo(6 / 110, 12);
    expect(raw.nwc_pct_revenue?.value).toBeCloseTo(11 / 110, 12);
    expect(raw.da_pct_revenue?.provenance.detail).toContain('FY2025');
  });

  it('the annual history contains ONLY full fiscal years — no LTM contamination of CAGR spans', () => {
    expect(raw.history?.revenue.points.map((p) => p.end)).toEqual(['2024-12-31', '2025-12-31']);
    expect(raw.net_debt?.value).toBe(30); // direct entry honoured when legs are absent
    const adapted = adaptRawHistoricals(raw);
    expect(adapted.facts.sizing_basis).toBe('LTM');
    expect(adapted.facts.sizing_as_of).toBe('2026-06-30');
  });
});

describe('shiftYearEnd — fiscal-year date arithmetic', () => {
  it('steps whole years and clamps Feb-29 off leap years', () => {
    expect(shiftYearEnd('2025-12-31', 1)).toBe('2024-12-31');
    expect(shiftYearEnd('2025-03-31', 2)).toBe('2023-03-31');
    expect(shiftYearEnd('2024-02-29', 1)).toBe('2023-02-28'); // clamp
    expect(shiftYearEnd('2024-02-29', 4)).toBe('2020-02-29'); // leap → leap survives
  });
});
