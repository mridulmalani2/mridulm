/**
 * P0 financial-correctness fixes — returns module.
 *   Bug 1: management rollover scales reported sponsor equity (reconciles with S&U)
 *          without changing IRR/MOIC (pro-rata).
 *   Bug 2: MIP is carry ABOVE the hurdle, not a flat % of the whole equity (no cliff).
 *   Bug 5: unlevered IRR is taxed on unlevered EBIT, so it is invariant to leverage.
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { canonicalDeals } from './fixtures/canonicalDeals';
import type { ModelState } from '../lib/dealEngineTypes';

const baseDeal = (): ModelState => canonicalDeals[0].build();

describe('Bug 1 — management rollover (sponsor share)', () => {
  const noRoll = fullRecalc(baseDeal());
  const rollState = baseDeal();
  rollState.mip.sweet_equity_pct = 0.10; // management rolls 10% of EV
  const roll = fullRecalc(rollState);
  const rolloverEquity = 0.10 * rollState.entry.enterprise_value;

  it('leaves IRR and MOIC unchanged (pro-rata rollover)', () => {
    expect(Math.abs((roll.returns.irr ?? 0) - (noRoll.returns.irr ?? 0))).toBeLessThan(1e-9);
    expect(Math.abs(roll.returns.moic - noRoll.returns.moic)).toBeLessThan(1e-9);
  });

  it('reports the sponsor check (= total equity − rollover), reconciling with Sources & Uses', () => {
    expect(Math.abs(roll.returns.entry_equity - (noRoll.returns.entry_equity - rolloverEquity))).toBeLessThan(1e-6);
    expect(Math.abs(roll.returns.entry_equity - roll.sources_and_uses.sponsor_equity)).toBeLessThan(1e-6);
  });

  it('keeps the MOIC identity and the value-bridge reconciliation', () => {
    const moicId = (roll.returns.exit_equity + roll.returns.total_distributions) / roll.returns.entry_equity;
    expect(Math.abs(roll.returns.moic - moicId)).toBeLessThan(1e-4);
    // bridge recon delta scales with the sponsor share, so it cannot exceed the no-rollover delta.
    expect(roll.value_drivers.reconciliation_delta).toBeLessThanOrEqual(noRoll.value_drivers.reconciliation_delta + 1e-9);
  });
});

describe('Bug 2 — MIP is carry above the hurdle (no cliff)', () => {
  it('pays poolPct of equity ABOVE the hurdle, not poolPct of the whole equity', () => {
    const noMip = baseDeal();
    noMip.mip.hurdle_moic = 99; // never clears ⇒ pre-MIP equity
    const pre = fullRecalc(noMip).returns;

    const r = fullRecalc(baseDeal()).returns; // default pool 0.15, hurdle 2.0
    const expectedCarry = 0.15 * Math.max(0, pre.exit_equity - 2.0 * pre.entry_equity);
    expect(r.mip_payout).toBeCloseTo(expectedCarry, 2);

    // ...and strictly less than the old "% of the whole pie" cliff value.
    const cliffValue = 0.15 * pre.exit_equity;
    expect(r.mip_payout).toBeLessThan(cliffValue - 1);
  });

  it('pays ~0 promote for a deal that exits at the hurdle (continuity)', () => {
    const atHurdle = baseDeal();
    // Force exit equity to ~hurdle × entry by collapsing growth/margin expansion and the
    // exit multiple to entry, so pre-MIP MOIC sits just at/below 2.0x.
    atHurdle.mip.hurdle_moic = 2.0;
    atHurdle.revenue.growth_rates = atHurdle.revenue.growth_rates.map(() => 0);
    atHurdle.margins.target_ebitda_margin = atHurdle.margins.base_ebitda_margin;
    atHurdle.exit.exit_ebitda_multiple = atHurdle.entry.entry_ebitda_multiple;
    const r = fullRecalc(atHurdle).returns;
    // Whatever the exact MOIC, the promote is bounded by the small gain above 2.0x — never a
    // 15%-of-everything cliff.
    expect(r.mip_payout).toBeLessThan(0.15 * (r.exit_equity + r.mip_payout) * 0.5);
  });
});

describe('Bug 5 — unlevered IRR is invariant to capital structure', () => {
  it('the same operating deal returns the same unlevered IRR at low vs high leverage', () => {
    const lo = baseDeal();
    lo.debt_tranches = lo.debt_tranches.map((t) => ({ ...t, principal: t.principal * 0.5 }));
    const hi = baseDeal();
    hi.debt_tranches = hi.debt_tranches.map((t) => ({ ...t, principal: t.principal * 1.5 }));

    const loU = fullRecalc(lo).returns.irr_unlevered;
    const hiU = fullRecalc(hi).returns.irr_unlevered;
    expect(loU).not.toBeNull();
    expect(hiU).not.toBeNull();
    // Unlevered return measures the asset, not the financing — leverage must not move it.
    expect(Math.abs((loU as number) - (hiU as number))).toBeLessThan(1e-4);
  });
});
