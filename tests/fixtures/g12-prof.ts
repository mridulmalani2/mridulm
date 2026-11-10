/**
 * Golden G12-PROF inputs (SPEC §25.9): the Corporate Finance 2 "LBO and FTE" worked example,
 * entered EXACTLY as the case states it. Shared by the golden test and the workbook parity test.
 */
import type { DealAssumptions, DealFacts } from '../../lib/engine2/types';

const U = Number.NaN; // a driver field the case does not use — any read would poison the run

export const G12_FACTS: DealFacts = {
  entity_name: 'Worked example', source: 'manual', sector: 'Other', currency: 'USD',
  fiscal_year: null, period_end: null,
  fy_revenue: null, fy_ebitda: null, fy_ebitda_margin: null,
  da_pct_revenue: null, maint_capex_pct_revenue: null, net_ppe: null,
  operating_nwc: null, nwc_pct_revenue: null, dso: null, dio: null, dpo: null,
  gross_debt: null, cash: null, net_debt: null, effective_tax_rate: null,
  nol_carryforward_floor: null, implied_cost_of_debt: null, implied_trading_ev_ebitda: null,
  sic_code: null, sector_comps: null, history: [],
};

const g4 = [0.03, 0.03, 0.03, 0.03];

export const G12_ASSUMPTIONS: DealAssumptions = {
  deal_name: 'G12-PROF',
  entry: { driver: 'ev', entry_multiple: null, enterprise_value: 1100, basis: 'ntm', hold_years: 5 },
  structure: {
    tranches: [{
      name: 'Debt', type: 'senior', size: { amount: 900 }, pricing: { kind: 'fixed', rate: 0.07 },
      amort_pct_of_face: 0, maturity_years: 7, oid_pct: 0, sweep: { participates: true, priority: 1 },
    }],
    min_cash: 0, sweep: { base_pct: 1, grid: null }, distributions: null, surplus_distribution: null, refinancing: null, selldown: null,
  },
  operations: {
    growth: [U, U, U, U, U], target_margin: U, margin_path: 'linear',
    da_pct_revenue: U, maint_capex_pct_revenue: U, growth_capex: [U, U, U, U, U],
    nwc: { method: 'pct', pct_revenue: U },
    lines: {
      revenue: { mode: 'not_modelled' },
      ebitda: { measure: 'ebit', mode: 'grown', year1: 125, growth: g4 },
      da: { mode: 'grown', year1: 20, growth: g4 },
      capex: { mode: 'pct_of_da', pct: 1 },
      delta_nwc: { mode: 'grown', year1: 10, growth: g4 },
      year_n_plus_1_growth: 0.03,
    },
  },
  tax: {
    rate: 0.36, interest_deductible: true,
    s163j: { applies: false, ati_basis: 'ebitda', ati_pct: U },
    nol: { acquired_opening: 0, acquired_usable: false, arose_pre_2018: false, s382_annual_limit: null },
    minimum_rate: 0,
  },
  fees: { transaction_pct_of_ev: 0, financing_pct_of_commitments: 0, monitoring: null },
  rollover_equity: 0,
  exit: { multiple: 1100 / 145, basis: 'fy', fees_pct: 0 },
  mip: null, sweet_equity: null, warrant: null,
  covenants: { leverage_max: null, dscr_min: null, fccr_min: null, springing: null, rp_trap: null },
  fund: null,
  mid_year_irr: false,
  valuation: { risk_free: 0.04, mrp: 0.06, asset_beta: 0.85, debt_beta: 0, long_run_growth: 0.03, leverage_timing: 'end_of_year' },
};
