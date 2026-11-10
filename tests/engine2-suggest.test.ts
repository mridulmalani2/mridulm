/**
 * The v2.0.0 suggestion catalogue against a realistic large-cap fixture: every proposal has a
 * real basis; nothing is pre-filled; uncited template values are gone; and a draft built from
 * accepted proposals + the analyst's own entries is coherent (§14.13).
 */
import { describe, it, expect } from 'vitest';
import { suggestionsFor } from '../lib/engine2/suggest';
import { blankAssumptions, CHOICE_PATHS, missingInputs, setPath } from '../lib/engine2/draft';
import { runModel } from '../lib/engine2/facade';
import type { DealFacts, TrancheAssumption } from '../lib/engine2/types';

/** Realistic large-cap industrial: $8.2bn revenue, 24.4% margin, 4 clean history years. */
const LARGE_CAP: DealFacts = {
  entity_name: 'Meridian Industrial Group',
  source: 'edgar',
  sector: 'IndustrialsMaterials',
  currency: 'USD',
  fiscal_year: 2025,
  period_end: '2025-12-31',
  fy_revenue: 8200,
  fy_ebitda: 2000,
  fy_ebitda_margin: 2000 / 8200,
  da_pct_revenue: 0.032,
  maint_capex_pct_revenue: 0.036,
  net_ppe: 2400,
  operating_nwc: 700,
  nwc_pct_revenue: 700 / 8200,
  dso: 48,
  dio: 55,
  dpo: 62,
  gross_debt: 3100,
  cash: 900,
  net_debt: 2200,
  effective_tax_rate: 0.24,
  nol_carryforward_floor: null,
  implied_cost_of_debt: 0.058,
  implied_trading_ev_ebitda: 11.0, sic_code: null, sector_comps: null, // 12.0x suggestion ≤ 11.0 × 1.15 — no warn
  history: [
    { fiscal_year: 2022, period_end: '2022-12-31', revenue: 7150, ebitda: 1690, capex: 250, operating_nwc: 610 },
    { fiscal_year: 2023, period_end: '2023-12-31', revenue: 7480, ebitda: 1790, capex: 262, operating_nwc: 640 },
    { fiscal_year: 2024, period_end: '2024-12-31', revenue: 7840, ebitda: 1900, capex: 274, operating_nwc: 668 },
    { fiscal_year: 2025, period_end: '2025-12-31', revenue: 8200, ebitda: 2000, capex: 295, operating_nwc: 700 },
  ],
};

describe('v2.0.0 — the suggestion CATALOGUE: proposals with a real basis, never pre-fills', () => {
  const cat = suggestionsFor(LARGE_CAP, 5);

  it('every proposal carries a FACTS / HISTORY / CONVENTION basis — no template guesses survive', () => {
    expect(Object.keys(cat).length).toBeGreaterThan(5);
    for (const [path, sug] of Object.entries(cat)) {
      expect(['facts', 'history', 'convention'], path).toContain(sug.basis.kind);
      expect(sug.basis.detail.length, path).toBeGreaterThan(10);
    }
  });

  it('uncited v1 template values are GONE: no min-cash, sweep, static base rate or flat-3% growth proposal', () => {
    expect(cat['structure.min_cash']).toBeUndefined();
    expect(cat['structure.sweep']).toBeUndefined();
    expect(cat['structure.sweep.base_pct']).toBeUndefined();
    const tranche = (cat['structure.tranches'].value as TrancheAssumption[])[0];
    expect(tranche.type).not.toBe('revolver');
    if (tranche.type !== 'revolver' && tranche.type !== 'pik_note' && tranche.pricing.kind === 'floating') {
      expect(Number.isNaN(tranche.pricing.base_rate)).toBe(true); // no cited live rate ⇒ left for the analyst
    }
    expect(Number.isNaN(tranche.maturity_years)).toBe(true);
  });

  it('growth comes from HISTORY (4 points ≥ the D1 gate) as a true-span CAGR', () => {
    expect(cat['operations.growth'].basis.kind).toBe('history');
    const spanDays = (Date.parse('2025-12-31') - Date.parse('2022-12-31')) / 86_400_000;
    const cagr = Math.pow(8200 / 7150, 365.25 / spanDays) - 1;
    for (const g of cat['operations.growth'].value as number[]) expect(g).toBeCloseTo(cagr, 12);
  });

  it('fewer than 3 history points ⇒ NO growth proposal at all (never a fake history claim, never a flat 3%)', () => {
    const thin = suggestionsFor({ ...LARGE_CAP, history: LARGE_CAP.history.slice(-2) }, 5);
    expect(thin['operations.growth']).toBeUndefined();
  });

  it('NWC proposes the DAYS method when all three gated days survived D2', () => {
    expect(cat['operations.nwc'].value).toEqual({ method: 'days', dso: 48, dio: 55, dpo: 62 });
    expect(cat['operations.nwc'].basis.kind).toBe('facts');
  });

  it('the entry multiple cites its source; exit = entry only once an entry multiple has been ENTERED', () => {
    expect(cat['entry.entry_multiple'].basis.kind).toBe('convention');
    expect(cat['entry.entry_multiple'].basis.detail).toMatch(/PitchBook|GF Data/);
    expect(cat['exit.multiple']).toBeUndefined();
    const withEntry = suggestionsFor(LARGE_CAP, 5, { entry: { driver: 'multiple', entry_multiple: 10.5, enterprise_value: null, basis: 'fy', hold_years: 5 } });
    expect(withEntry['exit.multiple'].value).toBe(10.5);
  });

  it('§163(j) is proposed only for a US filer (a statute, not a universal default)', () => {
    expect(cat['tax.s163j']).toBeDefined();
    expect(suggestionsFor({ ...LARGE_CAP, source: 'esef', currency: 'EUR' }, 5)['tax.s163j']).toBeUndefined();
  });

  it('a forecast-only case (no historical year) gets NO proposals that need history', () => {
    const none = suggestionsFor({ ...LARGE_CAP, fy_revenue: null, fy_ebitda: null, fy_ebitda_margin: null, history: [], da_pct_revenue: null, maint_capex_pct_revenue: null, effective_tax_rate: null, dso: null, dio: null, dpo: null, nwc_pct_revenue: null }, 5);
    for (const p of ['entry.entry_multiple', 'operations.growth', 'operations.target_margin', 'structure.tranches', 'tax.rate']) expect(none[p], p).toBeUndefined();
  });
});

describe('a fully ACCEPTED draft is coherent — and accepting is explicit, so it still has blanks', () => {
  it('accepting every proposal leaves the inputs no proposal can stand behind blank (min cash, hold, base rate…)', () => {
    let a = blankAssumptions('t', 5);
    for (const [path, sug] of Object.entries(suggestionsFor(LARGE_CAP, 5))) a = setPath(a, path.split('@')[0], sug.value);
    const blank = missingInputs(LARGE_CAP, a, [...CHOICE_PATHS]).map((m) => m.path);
    expect(blank).toEqual(expect.arrayContaining(['structure.min_cash', 'structure.sweep.base_pct', 'structure.tranches.0.pricing.base_rate', 'structure.tranches.0.maturity_years']));
  });

  it('accepted proposals + the analyst’s remaining entries run with ZERO coherence flags (§14.13)', () => {
    let a = blankAssumptions('t', 5);
    for (const [path, sug] of Object.entries(suggestionsFor(LARGE_CAP, 5))) a = setPath(a, path.split('@')[0], sug.value);
    a = setPath(a, 'entry.entry_multiple', 10.5);
    a = setPath(a, 'exit.multiple', 10.5);
    a = setPath(a, 'structure.min_cash', 150);
    a = setPath(a, 'structure.sweep.base_pct', 0.5);
    a = setPath(a, 'structure.tranches.0.pricing.base_rate', 0.04);
    a = setPath(a, 'structure.tranches.0.maturity_years', 7);
    a = setPath(a, 'exit.fees_pct', 0.01);
    a = setPath(a, 'rollover_equity', 0);
    a = setPath(a, 'tax.minimum_rate', 0);
    a = setPath(a, 'tax.nol.acquired_opening', 0);
    a = setPath(a, 'operations.growth_capex', [0, 0, 0, 0, 0]);
    expect(missingInputs(LARGE_CAP, a, []).map((m) => m.path)).toEqual([]);
    const out = runModel(LARGE_CAP, a);
    expect(out.coherence).toEqual([]);
    expect(out.returns.sponsor_net.irr).not.toBeNull();
  });
});
