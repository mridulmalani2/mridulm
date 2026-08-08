/**
 * D7 suggestion assembly + SPEC §14.13: an ALL-SUGGESTED model runs with ZERO coherence
 * warnings, against a realistic large-cap fixture. Every suggested field carries a basis.
 */
import { describe, it, expect } from 'vitest';
import { suggestAssumptions } from '../lib/engine2/suggest';
import { runModel } from '../lib/engine2/facade';
import type { DealFacts } from '../lib/engine2/types';

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
  implied_trading_ev_ebitda: 11.0, // 12.0x suggestion ≤ 11.0 × 1.15 — no warn
  history: [
    { fiscal_year: 2022, period_end: '2022-12-31', revenue: 7150, ebitda: 1690, capex: 250, operating_nwc: 610 },
    { fiscal_year: 2023, period_end: '2023-12-31', revenue: 7480, ebitda: 1790, capex: 262, operating_nwc: 640 },
    { fiscal_year: 2024, period_end: '2024-12-31', revenue: 7840, ebitda: 1900, capex: 274, operating_nwc: 668 },
    { fiscal_year: 2025, period_end: '2025-12-31', revenue: 8200, ebitda: 2000, capex: 295, operating_nwc: 700 },
  ],
};

describe('D7 — suggestion assembly (bases mandatory)', () => {
  const { assumptions, basis } = suggestAssumptions(LARGE_CAP);

  it('§19 preamble/B7: the suggestion layer proposes NO fund overlay — fund starts null (audit B2: a live-overlay mutant ran green through the whole suite before this pin)', () => {
    expect(assumptions.fund).toBeNull();
  });

  it('growth comes from HISTORY (4 points ≥ the D1 gate) as a true-span CAGR', () => {
    expect(basis['operations.growth'].kind).toBe('history');
    const spanDays = (Date.parse('2025-12-31') - Date.parse('2022-12-31')) / 86_400_000;
    const cagr = Math.pow(8200 / 7150, 365.25 / spanDays) - 1;
    for (const g of assumptions.operations.growth) expect(g).toBeCloseTo(cagr, 12);
  });

  it('NWC uses the DAYS method when all three gated days survived D2', () => {
    expect(assumptions.operations.nwc).toEqual({ method: 'days', dso: 48, dio: 55, dpo: 62 });
    expect(basis['operations.nwc'].kind).toBe('facts');
  });

  it('entry/exit multiples cite the SCALE-band convention (caveated sector medians withheld); exit = entry (flat)', () => {
    expect(assumptions.entry.entry_multiple).toBeCloseTo(12.0, 9); // usBuyoutOverall
    expect(assumptions.exit.multiple).toBe(assumptions.entry.entry_multiple);
    expect(basis['entry.entry_multiple'].kind).toBe('convention');
    expect(basis['entry.entry_multiple'].detail).toContain('verifyBeforeDisplay');
    expect(basis['exit.multiple'].detail).toContain('flat');
  });

  it('large-cap structure template: TLB at the conventions leverage with a revolver; NOL usable OFF', () => {
    const [tlb, rcf] = assumptions.structure.tranches;
    expect(tlb.type).toBe('senior');
    expect((tlb as any).size.x_ebitda).toBeCloseTo(5.0, 9);
    expect(rcf.type).toBe('revolver');
    expect(assumptions.tax.nol.acquired_usable).toBe(false);
  });

  it('EVERY suggested field group carries a basis with kind + detail', () => {
    for (const key of ['entry.entry_multiple', 'operations.growth', 'operations.target_margin', 'operations.maint_capex_pct_revenue', 'operations.nwc', 'structure.tranches', 'structure.sweep', 'tax.rate', 'fees', 'exit.multiple', 'mip', 'covenants']) {
      expect(basis[key]?.kind, key).toBeTruthy();
      expect(basis[key]?.detail?.length, key).toBeGreaterThan(8);
    }
  });

  it('fewer than 3 history points ⇒ growth falls back to a TEMPLATE basis (never a fake history claim)', () => {
    const sparse = suggestAssumptions({ ...LARGE_CAP, history: LARGE_CAP.history.slice(-2) });
    expect(sparse.basis['operations.growth'].kind).toBe('template');
    expect(sparse.basis['operations.growth'].detail).toContain('review');
  });
});

describe('SPEC §14.13 — the all-suggested model is coherent', () => {
  it('MIDDLE-MARKET branch (unitranche template, fy_ebitda < $100m) ⇒ ZERO flags too (accuracy audit 2026-07-24: this branch never flowed through runModel in any test)', () => {
    const MID_CAP: DealFacts = {
      ...LARGE_CAP,
      entity_name: 'Mid Market Co',
      fy_revenue: 240, fy_ebitda: 48, fy_ebitda_margin: 0.2,
      net_ppe: 40, gross_debt: 0, cash: 0, net_debt: 0,
      history: LARGE_CAP.history.map((h) => ({ ...h, revenue: h.revenue === null ? null : h.revenue / 10, ebitda: h.ebitda === null ? null : h.ebitda / 10, capex: h.capex === null ? null : h.capex / 10 })),
    };
    const { assumptions, basis } = suggestAssumptions(MID_CAP);
    expect(basis['entry.entry_multiple'].detail).toContain('middle-market'); // the OTHER branch
    const out = runModel(MID_CAP, assumptions);
    expect(out.coherence).toEqual([]);
    expect(out.returns.sponsor_net.irr).not.toBeNull();
    for (const bs of out.balance_sheet) expect(Math.abs(bs.check)).toBeLessThan(0.005);
  });

  it('runModel(facts, suggestAssumptions(facts)) ⇒ ZERO coherence flags; sane outputs', () => {
    const { assumptions } = suggestAssumptions(LARGE_CAP);
    const out = runModel(LARGE_CAP, assumptions);
    expect(out.coherence).toEqual([]); // §14.13 — no warnings, no blocks
    expect(out.sources_uses.sponsor_equity).toBeGreaterThan(0);
    expect(out.returns.sponsor_net.irr).not.toBeNull();
    expect(out.returns.sponsor_net.irr!).toBeGreaterThan(0);
    expect(out.waterfall.every((w) => !w.cash_floor_breach)).toBe(true);
    for (const bs of out.balance_sheet) expect(Math.abs(bs.check)).toBeLessThan(0.005);
  });

  it('the trading-anchor coherence flag still fires when the suggestion is >15% above it (the gate is live, not vacuous)', () => {
    const cheapAnchor = { ...LARGE_CAP, implied_trading_ev_ebitda: 8.0 }; // 12.0 > 8.0 × 1.15
    const { assumptions } = suggestAssumptions(cheapAnchor);
    const out = runModel(cheapAnchor, assumptions);
    expect(out.coherence.some((f) => f.code === 'entry_multiple_vs_trading' && f.severity === 'warn')).toBe(true);
  });
});
