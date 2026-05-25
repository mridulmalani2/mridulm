/**
 * P4-7 — three-statement close gate (CI).
 *
 * The balance sheet closes BY CONSTRUCTION when the engine's flows are mutually
 * consistent, so any future change that breaks the P&L ↔ cash ↔ balance-sheet
 * tie-out will fail here. Covers the canonical structures plus the Phase-4
 * additions (partial exits, fund overlay) which must NOT disturb the company
 * balance sheet (they are sponsor / LP-level, not entity-level).
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { canonicalDeals, tranche, debtFundedAddOn } from './fixtures/canonicalDeals';
import type { ModelState } from '../lib/dealEngineTypes';

// The balance sheet closes by construction; the only residual is the debt/interest
// convergence tolerance (£0.01m), which the cash-sweep feedback loop leaves behind.
// This is the engine's own close contract — the gate fails on any structural break.
const CLOSE_TOLERANCE = 0.01;

function closingDeals(): { name: string; build: () => ModelState }[] {
  return [
    ...canonicalDeals.map((d) => ({ name: d.name, build: d.build })),
    {
      name: 'amortizing',
      build: () => {
        const s = canonicalDeals[0].build();
        s.entry.min_cash_balance = 0;
        s.debt_tranches = [tranche({ name: 'Senior TLA', principal: 50, interest_rate: 0.06, amortization_type: 'straight_line' })];
        return s;
      },
    },
    {
      name: 'revolver',
      build: () => {
        const s = canonicalDeals[0].build();
        s.entry.min_cash_balance = 30;
        s.debt_tranches = [
          tranche({ name: 'Senior TLB', principal: 80, amortization_type: 'bullet' }),
          tranche({ name: 'RCF', tranche_type: 'revolver', principal: 0, commitment: 50, commitment_fee: 0.005 }),
        ];
        return s;
      },
    },
    {
      name: 'add-on (debt-funded)',
      build: () => {
        const s = canonicalDeals.find((d) => d.name === 'cash-sweep')!.build();
        s.add_on_acquisitions = [debtFundedAddOn()];
        return s;
      },
    },
    {
      name: 'distribution',
      build: () => {
        const s = canonicalDeals.find((d) => d.name === 'pik')!.build();
        s.exit.interim_distributions = [0, 3, 0, 0, 0];
        return s;
      },
    },
    {
      name: 'partial-exit',
      build: () => {
        const s = canonicalDeals[0].build();
        s.exit.partial_exits = [{ year: 3, pct_sold: 0.3, exit_multiple: 10, exit_fee_pct: 0 }];
        return s;
      },
    },
    {
      name: 'fund-overlay',
      build: () => {
        const s = canonicalDeals[0].build();
        s.fund_assumptions = {
          management_fee_pct: 0.02, management_fee_basis: 'invested', carry_rate: 0.2,
          preferred_return: 0.08, carry_waterfall: 'european', fund_size: 1000, deal_allocation_pct: 0.1,
        };
        return s;
      },
    },
  ];
}

describe('P4-7 three-statement model closes for every canonical structure', () => {
  for (const deal of closingDeals()) {
    it(`${deal.name} closes every year`, () => {
      const s = fullRecalc(deal.build());
      expect(s.balance_sheet.years.length).toBe(s.exit.holding_period);
      expect(s.balance_sheet.closes).toBe(true);
      expect(s.balance_sheet.max_abs_check).toBeLessThan(CLOSE_TOLERANCE);
      for (const y of s.balance_sheet.years) {
        expect(Math.abs(y.total_assets - y.total_liabilities_and_equity)).toBeLessThan(CLOSE_TOLERANCE);
      }
    });
  }
});
