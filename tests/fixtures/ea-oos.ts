/**
 * OUT-OF-SAMPLE case: the Electronic Arts take-private course model ("Electronic Arts - LBO and
 * FTE - v4.xlsx"), entered exactly as its Assumptions sheet states it. Unlike G12-PROF, this
 * workbook was never used while the engine was being built — it is a check that the engine is a
 * general calculator and not a reproduction of one reference case. EBITDA, D&A, capex and the
 * change in NWC are stated BY YEAR; ΔNWC is negative (an inflow); the tax rate is 20%.
 */
import type { DealAssumptions, DealFacts } from '../../lib/engine2/types';
import { G12_ASSUMPTIONS, G12_FACTS } from './g12-prof';

export const EA_FACTS: DealFacts = { ...G12_FACTS, entity_name: 'Electronic Arts' };

export const EA_ASSUMPTIONS: DealAssumptions = {
  ...G12_ASSUMPTIONS,
  deal_name: 'EA-OOS',
  entry: { driver: 'ev', entry_multiple: null, enterprise_value: 55000, basis: 'ntm', hold_years: 5 },
  structure: {
    ...G12_ASSUMPTIONS.structure,
    tranches: [{
      name: 'Debt', type: 'senior', size: { amount: 18000 }, pricing: { kind: 'fixed', rate: 0.075 },
      amort_pct_of_face: 0, maturity_years: 7, oid_pct: 0, sweep: { participates: true, priority: 1 },
    }],
  },
  operations: {
    ...G12_ASSUMPTIONS.operations,
    lines: {
      revenue: { mode: 'not_modelled' },
      ebitda: { measure: 'ebitda', mode: 'explicit', values: [3100, 3600, 4150, 4700, 5250] },
      da: { mode: 'explicit', values: [500, 500, 500, 500, 500] },
      capex: { mode: 'explicit', values: [250, 250, 250, 250, 250] },
      delta_nwc: { mode: 'explicit', values: [-60, -60, -60, -60, -60] },
      year_n_plus_1_growth: 0.035,
    },
  },
  tax: { ...G12_ASSUMPTIONS.tax, rate: 0.2 },
  exit: { multiple: 55000 / 3100, basis: 'fy', fees_pct: 0 },
  valuation: {
    risk_free: 0.0455, mrp: 0.057, asset_beta: 0.9, debt_beta: 0, long_run_growth: 0.035, leverage_timing: 'end_of_year',
    // Assumptions!D27 / D28: terminal capex = 1.0 × D&A; terminal ΔNWC −60 before growth (§28)
    terminal: { capex_pct_of_da: 1, delta_nwc_before_growth: -60 },
  },
};
