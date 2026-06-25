/**
 * Phase 0C — add-on economics flow to cash and EBITDA.
 *
 * Before 0C: add-on revenue was double-counted (injected AND compounded into the organic
 * base), consolidated EBITDA applied the PARENT margin to acquired revenue, and integration
 * costs / synergies only appeared in a display-only bridge. After 0C: organic and acquired
 * revenue are cleanly separated, each add-on contributes EBITDA at its OWN margin, cost
 * synergies lift EBITDA, and integration cost is a deductible cash outflow in FCF.
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { canonicalDeals, debtFundedAddOn } from './fixtures/canonicalDeals';
import type { AddOnAcquisition, ModelState } from '../lib/dealEngineTypes';

const cashSweep = () => canonicalDeals.find((d) => d.name === 'cash-sweep')!.build();

const withAddOn = (over: Partial<AddOnAcquisition> = {}): ModelState => {
  const s = cashSweep();
  s.add_on_acquisitions = [{ ...debtFundedAddOn(), ...over }];
  return fullRecalc(s);
};

describe('add-on revenue is no longer double-counted (Phase 0C)', () => {
  const o = withAddOn();
  it('total revenue = organic + acquired, every year', () => {
    for (const y of o.projections.years) {
      expect(Math.abs(y.revenue - (y.organic_revenue + y.acquisition_revenue))).toBeLessThan(1e-6);
    }
  });
  it('acquired revenue grows at the parent rate ONCE (not compounded twice)', () => {
    // debtFundedAddOn closes year 2 with revenue 50; parent growth ~5%/yr ⇒ ~57 by year 5,
    // not the ~228 the double-count produced.
    const exitAcq = o.projections.years[o.exit.holding_period - 1].acquisition_revenue;
    expect(exitAcq).toBeGreaterThan(50);
    expect(exitAcq).toBeLessThan(70);
  });
});

describe("consolidated EBITDA blends the add-on's own margin (not the parent margin)", () => {
  it('a low-margin add-on dilutes the consolidated margin below the parent path', () => {
    const o = withAddOn({ ebitda_margin: 0.20, synergy_cost: 0, synergy_revenue: 0, integration_cost: 0 });
    const exitIdx = o.exit.holding_period - 1;
    const y = o.projections.years[exitIdx];
    const parentMargin = o.margins.margin_by_year[exitIdx]; // ~0.25
    // Blended margin sits strictly between the add-on (0.20) and the parent (~0.25).
    expect(y.ebitda_margin).toBeGreaterThan(0.20);
    expect(y.ebitda_margin).toBeLessThan(parentMargin);
    // EBITDA = organic × parent margin + acquired × add-on margin (no synergies here).
    const expected = y.organic_revenue * parentMargin + y.acquisition_revenue * 0.20;
    expect(Math.abs(y.ebitda - expected)).toBeLessThan(1e-2);
  });
});

describe('integration cost is a deductible cash outflow in FCF (Phase 0C)', () => {
  // Use a cash-generative bullet deal + an equity-funded add-on so the integration cost is
  // comfortably affordable (the cash-sweep+debt structure runs at the floor and would simply
  // flag a cash shortfall — a separate, pre-existing limitation).
  const build = (integ: number): ModelState => {
    const s = canonicalDeals[0].build(); // simple-bullet, accumulates cash
    s.add_on_acquisitions = [{ ...debtFundedAddOn(), funding: 'equity', debt_pct: 0, revenue: 30, integration_cost: integ }];
    return fullRecalc(s);
  };
  it('lowers acquisition-year FCF and tax, and the cash identity holds; BS still closes', () => {
    const INTEG = 5;
    const withInt = build(INTEG);
    const noInt = build(0);
    const i = 1; // acquisition year (year 2) index

    expect(withInt.projections.years[i].integration_cost).toBeCloseTo(INTEG, 6);
    expect(withInt.projections.years.filter((y) => y.integration_cost > 0).length).toBe(1); // one-time

    const taxSaving = noInt.projections.years[i].tax - withInt.projections.years[i].tax;
    expect(taxSaving).toBeGreaterThan(0);                          // integration is deductible

    const fcfDrop = noInt.projections.years[i].fcf_pre_debt - withInt.projections.years[i].fcf_pre_debt;
    expect(fcfDrop).toBeGreaterThan(0);                            // real cash outflow
    // Exact cash identity: the FCF drop equals the gross cost net of the tax saving.
    expect(Math.abs(fcfDrop - (INTEG - taxSaving))).toBeLessThan(1e-6);
    // After-tax cash cost ≤ gross; ≥ gross×(1−rate) when fully deductible.
    expect(fcfDrop).toBeLessThanOrEqual(INTEG + 1e-9);
    expect(fcfDrop).toBeGreaterThan(INTEG * (1 - 0.25) - 1e-6);

    expect(withInt.balance_sheet.closes).toBe(true);
  });
});

describe('cost synergies lift consolidated EBITDA (Phase 0C)', () => {
  it('a deal with cost synergies has higher exit EBITDA than the same deal without', () => {
    const withSyn = withAddOn({ synergy_cost: 8 });
    const noSyn = withAddOn({ synergy_cost: 0 });
    const exitIdx = withSyn.exit.holding_period - 1;
    expect(withSyn.projections.years[exitIdx].ebitda).toBeGreaterThan(noSyn.projections.years[exitIdx].ebitda + 1);
    expect(withSyn.ebitda_bridge.cost_synergies).toBeGreaterThan(0);
    expect(withSyn.balance_sheet.closes).toBe(true);
  });
});

describe('the EBITDA bridge reconciles to consolidated exit EBITDA', () => {
  it('entry + organic + margin + add-on + cost synergies = exit EBITDA', () => {
    const b = withAddOn({ synergy_cost: 5, integration_cost: 10 }).ebitda_bridge;
    const walk = b.entry_ebitda + b.organic_revenue_contribution + b.margin_expansion_contribution
      + b.add_on_ebitda + b.cost_synergies;
    expect(Math.abs(walk - b.exit_ebitda)).toBeLessThan(0.05);
  });
});

describe('deals without add-ons are byte-for-byte unchanged (Phase 0C)', () => {
  it('consolidated EBITDA = revenue × parent margin, organic = total, no integration', () => {
    const o = fullRecalc(canonicalDeals[0].build());
    o.projections.years.forEach((y, t) => {
      expect(y.ebitda_margin).toBeCloseTo(o.margins.margin_by_year[t], 9);
      expect(y.organic_revenue).toBeCloseTo(y.revenue, 9);
      expect(y.integration_cost).toBe(0);
    });
  });
});
