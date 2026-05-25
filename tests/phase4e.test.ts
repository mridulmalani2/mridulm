/**
 * Phase 4 — PR E1: capex FCF presentation (P4-6) + add-on synergy ramp (P4-12).
 * Both additive / opt-in.
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { canonicalDeals } from './fixtures/canonicalDeals';
import type { AddOnAcquisition } from '../lib/dealEngineTypes';

describe('P4-6 maintenance-vs-growth capex FCF presentation', () => {
  it('operating FCF (pre-growth) = total FCF pre-debt + growth capex, every year', () => {
    const s = canonicalDeals[0].build();
    s.margins.growth_capex = [2, 2, 3, 3, 4];
    const out = fullRecalc(s);
    for (const y of out.projections.years) {
      expect(y.operating_fcf_pre_growth_capex).toBeCloseTo(y.fcf_pre_debt + y.growth_capex, 6);
    }
  });

  it('with growth capex, operating FCF exceeds total FCF pre-debt', () => {
    const s = canonicalDeals[0].build();
    s.margins.growth_capex = [5, 5, 5, 5, 5];
    const out = fullRecalc(s);
    for (const y of out.projections.years) {
      expect(y.operating_fcf_pre_growth_capex).toBeGreaterThan(y.fcf_pre_debt);
    }
  });
});

describe('P4-12 add-on synergy ramp', () => {
  function addOn(extra: Partial<AddOnAcquisition> = {}): AddOnAcquisition {
    return {
      name: 'Bolt-on', year: 1, revenue: 50, ebitda_margin: 0.2, purchase_multiple: 8,
      funding: 'debt', debt_pct: 1, synergy_revenue: 10, synergy_cost: 4, integration_cost: 0,
      ...extra,
    };
  }

  it('ramps synergies in linearly vs full recognition the year after acquisition', () => {
    const noRamp = canonicalDeals[0].build();
    noRamp.add_on_acquisitions = [addOn()];
    const ramp = canonicalDeals[0].build();
    ramp.add_on_acquisitions = [addOn({ synergy_ramp_years: 2 })];

    const a = fullRecalc(noRamp).projections.years;
    const b = fullRecalc(ramp).projections.years;

    // Year 2 (yearsOwned = 1): no-ramp recognises full +10 synergy revenue; ramp(2) recognises half.
    expect(a[1].acquisition_revenue - b[1].acquisition_revenue).toBeCloseTo(5, 3);
  });

  it('synergy ramp completes once years-owned reaches the ramp length', () => {
    const noRamp = canonicalDeals[0].build();
    noRamp.add_on_acquisitions = [addOn()];
    const ramp = canonicalDeals[0].build();
    ramp.add_on_acquisitions = [addOn({ synergy_ramp_years: 2 })];
    const a = fullRecalc(noRamp).projections.years;
    const b = fullRecalc(ramp).projections.years;
    // Year 3 (yearsOwned = 2 = ramp length): synergy fully phased in ⇒ equal to no-ramp.
    expect(b[2].acquisition_revenue).toBeCloseTo(a[2].acquisition_revenue, 3);
  });
});
