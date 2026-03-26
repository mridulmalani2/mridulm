/** State helpers: derive entry fields, ensure list lengths, margin trajectory. */

import type { ModelState } from '../dealEngineTypes';

export function deriveEntryFields(state: ModelState): void {
  const ebitda = state.revenue.base_revenue * state.margins.base_ebitda_margin;
  if (state.entry.enterprise_value === 0 && ebitda > 0) {
    state.entry.enterprise_value = ebitda * state.entry.entry_ebitda_multiple;
  }
  if (state.entry.enterprise_value > 0 && state.revenue.base_revenue > 0) {
    state.entry.entry_revenue_multiple = state.entry.enterprise_value / state.revenue.base_revenue;
  }
  state.entry.total_debt_raised = state.debt_tranches.reduce((s, t) => s + t.principal, 0);
  if (ebitda > 0 && state.entry.total_debt_raised > 0) {
    state.entry.leverage_ratio = state.entry.total_debt_raised / ebitda;
  }
  const financingFees = state.fees.financing_fee_pct * state.entry.total_debt_raised;
  state.entry.equity_check =
    state.entry.enterprise_value + state.fees.transaction_costs + financingFees - state.entry.total_debt_raised;
}

function pad(lst: number[], defaultVal: number, length: number): number[] {
  if (lst.length < length) return [...lst, ...Array(length - lst.length).fill(defaultVal)];
  return lst.slice(0, length);
}

function buildMarginTrajectory(
  base: number,
  target: number,
  trajectory: string,
  hp: number,
): number[] {
  const expansion = target - base;

  if (trajectory === 'linear') {
    return Array.from({ length: hp }, (_, i) => base + expansion * ((i + 1) / hp));
  }
  if (trajectory === 'front_loaded') {
    const mid = Math.max(Math.floor(hp / 2), 1);
    const frontShare = 0.6;
    return Array.from({ length: hp }, (_, i) => {
      const t = i + 1;
      const frac = t <= mid
        ? frontShare * (t / mid)
        : frontShare + (1 - frontShare) * ((t - mid) / (hp - mid));
      return base + expansion * frac;
    });
  }
  if (trajectory === 'back_loaded') {
    const mid = Math.max(Math.floor(hp / 2), 1);
    const frontShare = 0.4;
    return Array.from({ length: hp }, (_, i) => {
      const t = i + 1;
      const frac = t <= mid
        ? frontShare * (t / mid)
        : frontShare + (1 - frontShare) * ((t - mid) / (hp - mid));
      return base + expansion * frac;
    });
  }
  if (trajectory === 'step') {
    const mid = Math.max(Math.floor(hp / 2), 1);
    return Array.from({ length: hp }, (_, i) => (i + 1 <= mid ? base : target));
  }
  return Array.from({ length: hp }, (_, i) => base + expansion * ((i + 1) / hp));
}

export function ensureListLengths(state: ModelState): void {
  const hp = state.exit.holding_period;

  state.revenue.growth_rates = pad(state.revenue.growth_rates, 0.05, hp);
  state.revenue.organic_growth = pad(state.revenue.organic_growth, 0.0, hp);
  state.revenue.acquisition_revenue = pad(state.revenue.acquisition_revenue, 0.0, hp);
  state.margins.growth_capex = pad(state.margins.growth_capex, 0.0, hp);

  if (!(state.margins.margin_by_year && state.margins.margin_by_year.length === hp)) {
    state.margins.margin_by_year = buildMarginTrajectory(
      state.margins.base_ebitda_margin,
      state.margins.target_ebitda_margin,
      state.margins.margin_trajectory,
      hp,
    );
  }

  for (const tranche of state.debt_tranches) {
    tranche.amortization_schedule = pad(tranche.amortization_schedule, 0.0, hp);
    if (
      tranche.amortization_type === 'straight_line' &&
      tranche.amortization_schedule.reduce((a, b) => a + b, 0) === 0 &&
      tranche.principal > 0
    ) {
      const annual = tranche.principal / hp;
      tranche.amortization_schedule = Array(hp).fill(annual);
    }
    if (
      tranche.amortization_type === 'bullet' &&
      tranche.amortization_schedule.reduce((a, b) => a + b, 0) === 0 &&
      tranche.principal > 0
    ) {
      tranche.amortization_schedule = [...Array(hp - 1).fill(0), tranche.principal];
    }
  }
}

/** Create a fresh default ModelState. */
export function createDefaultModelState(): ModelState {
  return {
    deal_name: 'Untitled Deal',
    company_description: '',
    sector: 'Industrials',
    currency: 'GBP',
    revenue: {
      base_revenue: 100,
      growth_rates: [0.05, 0.05, 0.05, 0.05, 0.05],
      organic_growth: [],
      acquisition_revenue: [],
      churn_rate: 0,
    },
    margins: {
      base_ebitda_margin: 0.2,
      target_ebitda_margin: 0.25,
      margin_trajectory: 'linear',
      margin_by_year: [],
      da_pct_revenue: 0.03,
      capex_pct_revenue: 0.03,
      growth_capex: [],
      nwc_pct_revenue: 0.1,
      nwc_movement_method: 'pct_change',
    },
    tax: {
      tax_rate: 0.25,
      tax_shield_on_interest: true,
      dtl_unwind_years: 0,
      nol_carryforward: 0,
      minimum_tax_rate: 0,
    },
    entry: {
      enterprise_value: 0,
      entry_ebitda_multiple: 10,
      entry_revenue_multiple: 0,
      net_debt_at_entry: 0,
      equity_check: 0,
      total_debt_raised: 0,
      leverage_ratio: 4,
      currency: 'GBP',
    },
    debt_tranches: [],
    fees: {
      entry_fee_pct: 0.02,
      exit_fee_pct: 0.015,
      monitoring_fee_annual: 0,
      financing_fee_pct: 0.02,
      transaction_costs: 0,
    },
    mip: {
      mip_pool_pct: 0.15,
      hurdle_moic: 2,
      vesting_years: 4,
      sweet_equity_pct: 0,
    },
    exit: {
      holding_period: 5,
      exit_ebitda_multiple: 10,
      exit_revenue_multiple: 0,
      exit_method: 'secondary_buyout',
      exit_ebitda: 0,
      exit_ev: 0,
      exit_net_debt: 0,
      exit_equity: 0,
      mip_payout: 0,
    },
    projections: { years: [] },
    debt_schedule: {
      tranche_schedules: [],
      total_debt_by_year: [],
      net_debt_by_year: [],
      leverage_ratio_by_year: [],
      interest_coverage_by_year: [],
      dscr_by_year: [],
      total_cash_interest_by_year: [],
      total_repayment_by_year: [],
      total_interest_tax_shield_by_year: [],
    },
    returns: {
      irr: null,
      moic: 0,
      dpi: 0,
      rvpi: 0,
      cash_yield_avg: 0,
      payback_years: 0,
      irr_gross: null,
      irr_levered: null,
      irr_unlevered: null,
      irr_convergence_failed: false,
      entry_equity: 0,
      exit_equity: 0,
      exit_ev: 0,
      exit_net_debt: 0,
      mip_payout: 0,
    },
    value_drivers: {
      revenue_growth_contribution_pct: 0,
      margin_expansion_contribution_pct: 0,
      multiple_expansion_contribution_pct: 0,
      debt_paydown_contribution_pct: 0,
      fees_drag_contribution_pct: 0,
      revenue_growth_contribution_abs: 0,
      margin_expansion_contribution_abs: 0,
      multiple_expansion_contribution_abs: 0,
      debt_paydown_contribution_abs: 0,
      fees_drag_contribution_abs: 0,
      entry_equity: 0,
      exit_equity: 0,
      total_equity_gain: 0,
      reconciliation_delta: 0,
    },
    scenarios: [],
    sensitivity_tables: [],
    exit_reality_check: {
      flags: [],
      implied_buyer_irr: null,
      ev_revenue_at_exit: 0,
      ev_ebitda_at_exit: 0,
      public_comps_multiple_range: [0, 0],
      multiple_delta: 0,
      verdict: 'realistic',
      narrative: '',
    },
    revenue_segments: [],
    add_on_acquisitions: [],
    sources_and_uses: {
      enterprise_value: 0,
      transaction_fees: 0,
      financing_fees: 0,
      cash_to_balance_sheet: 0,
      total_uses: 0,
      debt_sources: [],
      total_debt: 0,
      rollover_equity: 0,
      sponsor_equity: 0,
      total_sources: 0,
      equity_pct_of_total: 0,
      debt_pct_of_total: 0,
      implied_leverage: 0,
    },
    credit_analysis: {
      metrics_by_year: [],
      max_debt_capacity_at_4x: 0,
      max_debt_capacity_at_5x: 0,
      max_debt_capacity_at_6x: 0,
      covenant_headroom_by_year: [],
      refinancing_risk: false,
      refinancing_risk_detail: '',
      recovery_waterfall: [],
      credit_rating_estimate: '',
    },
    ebitda_bridge: {
      entry_ebitda: 0,
      organic_revenue_contribution: 0,
      margin_expansion_contribution: 0,
      cost_synergies: 0,
      add_on_ebitda: 0,
      integration_costs: 0,
      monitoring_fees: 0,
      exit_ebitda: 0,
    },
    ai_overrides: {},
    ai_toggle_fields: [],
    chat_history: [],
  };
}
