/**
 * Canonical deal fixtures shared by the engine parity / regression suite.
 *
 * Each deal starts from the engine default state and applies a focused set of
 * overrides so the suite exercises a representative spread of structures:
 * plain bullet, PIK, cash-sweep, buy-and-build (add-on debt), and a
 * revolver-first stack (for the senior-leverage metric).
 */

import type { ModelState, DebtTranche, AddOnAcquisition } from '../../lib/dealEngineTypes';
import { createDefaultModelState } from '../../lib/engine/index';

export function tranche(overrides: Partial<DebtTranche> & { name: string; principal: number }): DebtTranche {
  return {
    tranche_type: 'senior',
    interest_rate: 0.07,
    rate_type: 'fixed',
    base_rate: 0,
    spread: 0,
    amortization_type: 'bullet',
    amortization_schedule: [],
    pik_rate: 0,
    cash_interest: true,
    commitment_fee: 0,
    floor: 0,
    cash_sweep_pct: 0,
    ...overrides,
  };
}

function base(): ModelState {
  const s = createDefaultModelState();
  s.deal_name = 'Canonical Base';
  s.revenue.base_revenue = 100;
  s.revenue.growth_rates = [0.06, 0.05, 0.05, 0.04, 0.04];
  s.margins.base_ebitda_margin = 0.2;
  s.margins.target_ebitda_margin = 0.25;
  s.entry.entry_ebitda_multiple = 10;
  s.exit.holding_period = 5;
  s.exit.exit_ebitda_multiple = 10;
  s.debt_tranches = [tranche({ name: 'Senior TLB', principal: 80, amortization_type: 'bullet' })];
  return s;
}

export interface CanonicalDeal {
  name: string;
  build: () => ModelState;
}

export const canonicalDeals: CanonicalDeal[] = [
  { name: 'simple-bullet', build: base },
  {
    name: 'pik',
    build: () => {
      const s = base();
      s.deal_name = 'Canonical PIK';
      s.debt_tranches = [
        tranche({ name: 'Senior TLB', principal: 70, amortization_type: 'bullet' }),
        tranche({ name: 'PIK Note', tranche_type: 'pik_note', principal: 30, amortization_type: 'PIK', pik_rate: 0.12, cash_interest: false }),
      ];
      return s;
    },
  },
  {
    name: 'cash-sweep',
    build: () => {
      const s = base();
      s.deal_name = 'Canonical Sweep';
      s.debt_tranches = [
        tranche({ name: 'Senior TLB', principal: 90, amortization_type: 'cash_sweep', cash_sweep_pct: 0.75 }),
      ];
      return s;
    },
  },
  {
    name: 'revolver-first',
    build: () => {
      const s = base();
      s.deal_name = 'Canonical Revolver-First';
      // Revolver in slot 0 (undrawn at entry) + senior TLB in slot 1. The old
      // senior-leverage metric used slot 0 only and would report ~0.
      s.debt_tranches = [
        tranche({ name: 'RCF', tranche_type: 'revolver', principal: 0, commitment_fee: 0.005 }),
        tranche({ name: 'Senior TLB', tranche_type: 'senior', principal: 80, amortization_type: 'bullet' }),
      ];
      return s;
    },
  },
];

/** A bolt-on acquisition funded entirely by debt, closing in year 2. */
export function debtFundedAddOn(): AddOnAcquisition {
  return {
    name: 'Bolt-on Co',
    year: 2,
    revenue: 50,
    ebitda_margin: 0.2,
    purchase_multiple: 8, // purchase price = 50 * 0.2 * 8 = 80; fully debt-funded
    funding: 'debt',
    debt_pct: 1,
    synergy_revenue: 0,
    synergy_cost: 0,
    integration_cost: 0,
  };
}
