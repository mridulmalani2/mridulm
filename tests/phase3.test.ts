/**
 * Phase 3 tests: three-statement balance sheet close (P3-1), distributions paid
 * from cash (no double-count), per-year floating rates (P3-3), convergence
 * tolerance / iteration-0 exit (P3-2), and per-scenario credit + bridge (P3-5/6).
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc, generateScenarios, createDefaultModelState } from '../lib/engine/index';
import { canonicalDeals, tranche, debtFundedAddOn } from './fixtures/canonicalDeals';
import type { ModelState } from '../lib/dealEngineTypes';

// Straight-line amortising deal whose operating cash covers each year's
// repayment — debt fully repaid from cash with no phantom-cash floor.
function amortizingDeal(): ModelState {
  const s = canonicalDeals[0].build();
  s.entry.min_cash_balance = 0;
  s.debt_tranches = [tranche({ name: 'Senior TLA', principal: 50, interest_rate: 0.06, amortization_type: 'straight_line' })];
  return s;
}

describe('P3-1 balance sheet closes', () => {
  // All canonical deals now close (bullets carry to exit rather than being repaid
  // from phantom operating cash), plus a straight-line amortising deal.
  const closing: { name: string; build: () => ModelState }[] = [
    ...canonicalDeals.map((d) => ({ name: d.name, build: d.build })),
    { name: 'amortizing', build: amortizingDeal },
  ];
  for (const deal of closing) {
    it(`${deal.name} closes every year`, () => {
      const s = fullRecalc(deal.build());
      expect(s.balance_sheet.years.length).toBe(s.exit.holding_period);
      expect(s.balance_sheet.closes).toBe(true);
      expect(s.balance_sheet.max_abs_check).toBeLessThan(0.01);
      for (const y of s.balance_sheet.years) {
        expect(Math.abs(y.total_assets - y.total_liabilities_and_equity)).toBeLessThan(0.01);
      }
    });
  }

  it('a bullet tranche carries its balance to exit (not repaid from operating cash)', () => {
    const s = fullRecalc(canonicalDeals.find((d) => d.name === 'simple-bullet')!.build());
    const sched = s.debt_schedule.tranche_schedules[0];
    // No scheduled repayment in the final year — the balance is outstanding at exit.
    expect(sched[sched.length - 1].ending_balance).toBeGreaterThan(70);
    expect(s.returns.exit_net_debt).toBeGreaterThan(0); // bullet nets against exit proceeds
    expect(s.balance_sheet.closes).toBe(true);
  });

  it('closes for a debt-funded add-on (acquired goodwill offsets the new debt)', () => {
    const st = canonicalDeals.find((d) => d.name === 'cash-sweep')!.build();
    st.add_on_acquisitions = [debtFundedAddOn()];
    const s = fullRecalc(st);
    expect(s.balance_sheet.closes).toBe(true);
    // Goodwill steps up in/after the acquisition year as the bolt-on is booked.
    const gwY1 = s.balance_sheet.years[0].goodwill;
    const gwExit = s.balance_sheet.years[s.balance_sheet.years.length - 1].goodwill;
    expect(gwExit).toBeGreaterThan(gwY1);
  });

  it('closes for a deal with an interim distribution', () => {
    const st = canonicalDeals.find((d) => d.name === 'pik')!.build();
    st.exit.interim_distributions = [0, 3, 0, 0, 0];
    const s = fullRecalc(st);
    expect(s.balance_sheet.closes).toBe(true);
  });
});

describe('P3 distributions are paid from cash (no double-count)', () => {
  // PIK deal carries net debt > 0 at exit, so a distribution's cash reduction
  // genuinely flows into exit net debt (not floored away by full repayment).
  const pikBuild = canonicalDeals.find((d) => d.name === 'pik')!.build;

  it('a distribution does not create free MOIC, but improves IRR on timing', () => {
    const noDist = fullRecalc(pikBuild());
    const withDistState = pikBuild();
    withDistState.exit.interim_distributions = [0, 5, 0, 0, 0];
    const withDist = fullRecalc(withDistState);

    // No free money: the £5m left the company (lower exit equity), offset by the
    // +£5m distribution. The old double-count would have added ~5/entry (~0.04) to MOIC.
    expect(Math.abs(withDist.returns.moic - noDist.returns.moic)).toBeLessThan(0.02);
    // Exit net debt is higher because cash was paid out.
    expect(withDist.returns.exit_net_debt).toBeGreaterThan(noDist.returns.exit_net_debt);
    // Earlier cash to equity lifts IRR.
    expect((withDist.returns.irr ?? 0)).toBeGreaterThan(noDist.returns.irr ?? 0);
    // The distribution was actually paid (cash was available).
    expect(withDist.debt_schedule.distributions_paid_by_year[1]).toBeCloseTo(5, 1);
  });
});

describe('P3-3 per-year floating base rates', () => {
  it('cash interest tracks the forward rate path', () => {
    const s = canonicalDeals[0].build();
    s.debt_tranches = [tranche({
      name: 'Floating TLB', principal: 80, amortization_type: 'bullet',
      rate_type: 'floating', base_rate: 0.03, spread: 0.04, floor: 0,
      base_rate_by_year: [0.03, 0.03, 0.06, 0.06, 0.06], // +300bps step in year 3
    })];
    const out = fullRecalc(s);
    const sched = out.debt_schedule.tranche_schedules[0];
    // Year 3 carries a higher base rate than year 1 → higher cash interest (balance ~flat for a bullet).
    expect(sched[2].cash_interest).toBeGreaterThan(sched[0].cash_interest);
    expect(sched[2].effective_rate).toBeCloseTo(0.10, 5);
    expect(sched[0].effective_rate).toBeCloseTo(0.07, 5);
  });
});

describe('P3-2 convergence allows iteration-0 exit', () => {
  it('an all-equity deal converges immediately', () => {
    const s = createDefaultModelState();
    s.revenue.base_revenue = 100;
    s.debt_tranches = []; // no debt → zero interest → converged at iteration 0
    const out = fullRecalc(s);
    expect(out.returns.convergence_iterations).toBe(1);
    expect(out.returns.debt_convergence_failed).toBe(false);
  });
});

describe('P3-4 dynamic revolver draws and repays', () => {
  function revolverDeal(): ModelState {
    const s = canonicalDeals[0].build();
    s.entry.min_cash_balance = 30;
    s.debt_tranches = [
      tranche({ name: 'Senior TLB', principal: 80, amortization_type: 'bullet' }),
      tranche({ name: 'RCF', tranche_type: 'revolver', principal: 0, commitment: 50, commitment_fee: 0.005 }),
    ];
    return s;
  }

  it('draws on the revolver to fund a cash shortfall below the min-cash floor', () => {
    const s = fullRecalc(revolverDeal());
    const rcf = s.debt_schedule.tranche_schedules[1];
    // Year-1 operating cash is below the £30m floor → revolver is drawn to cover it.
    expect(rcf[0].ending_balance).toBeGreaterThan(10);
    expect(s.debt_schedule.cash_balance_by_year[0]).toBeCloseTo(30, 0);
  });

  it('repays the revolver from excess cash in later years', () => {
    const s = fullRecalc(revolverDeal());
    const rcf = s.debt_schedule.tranche_schedules[1];
    expect(rcf[rcf.length - 1].ending_balance).toBeLessThan(rcf[0].ending_balance);
  });

  it('balance sheet still closes with a drawing revolver', () => {
    const s = fullRecalc(revolverDeal());
    expect(s.balance_sheet.closes).toBe(true);
  });
});

describe('P3-5 / P3-6 scenarios carry credit metrics and a value bridge', () => {
  it('every scenario reports DSCR, leverage, survival and a value-driver bridge', () => {
    const scenarios = generateScenarios(canonicalDeals[0].build());
    expect(scenarios.length).toBe(4);
    for (const sc of scenarios) {
      expect(sc.dscr_by_year?.length).toBe(5);
      expect(sc.leverage_by_year?.length).toBe(5);
      expect(typeof sc.survives_hold).toBe('boolean');
      expect(sc.value_drivers).toBeDefined();
      expect(sc.value_drivers!.ranked_drivers.length).toBeGreaterThan(0);
    }
  });
});
