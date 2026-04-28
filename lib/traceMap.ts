/**
 * Static dependency map for the Trace Graph feature — frontend mirror of
 * backend/trace_map.py. Keep in sync whenever the engine changes.
 *
 * MAINTENANCE NOTE: when returns.py / projections.py / debt_schedule.py are
 * updated, update this map to stay aligned.
 */

import type { ModelState } from './dealEngineTypes';

// ── Iterative / circular fields ─────────────────────────────────────────────
// Resolved via 2-pass convergence loop. Trace cards show a badge for these.
export const ITERATIVE_FIELDS = new Set([
  'projections.interest',
  'projections.tax',
  'projections.nopat',
  'projections.fcf_pre_debt',
  'projections.fcf_to_equity',
  'projections.cash_balance',
  'debt_schedule.total_debt_at_exit',
]);

export interface TraceMapEntry {
  label: string;
  formula_symbolic: string;
  inputs: string[];
  outputs: string[];
  is_user_input: boolean;
}

export const TRACE_MAP: Record<string, TraceMapEntry> = {
  // ── Returns ────────────────────────────────────────────────────────────────
  'returns.irr': {
    label: 'Equity IRR',
    formula_symbolic:
      'solve r: Σ CF[tᵢ]/(1+r)^tᵢ = 0\n(t₀=0; tₙ=HP at year-end; interim at tₙ−0.5 when mid-year convention active)',
    inputs: ['entry.equity_check', 'exit.exit_equity', 'exit.interim_distributions'],
    outputs: [],
    is_user_input: false,
  },
  'returns.moic': {
    label: 'Equity MOIC',
    formula_symbolic: '(Exit Equity + Σ Distributions) / Entry Equity',
    inputs: ['returns.entry_equity', 'returns.exit_equity', 'returns.total_distributions'],
    outputs: [],
    is_user_input: false,
  },
  'returns.entry_equity': {
    label: 'Entry Equity (Sponsor)',
    formula_symbolic:
      'EV + Transaction Costs + Financing Fees − Total Debt\n(entry advisory fee is target-borne, excluded)',
    inputs: ['entry.enterprise_value', 'fees.transaction_costs', 'fees.financing_fee_pct', 'entry.total_debt_raised'],
    outputs: ['returns.irr', 'returns.moic'],
    is_user_input: false,
  },
  'returns.exit_equity': {
    label: 'Exit Equity',
    formula_symbolic: 'Exit EV − Exit Net Debt − Exit Fee − MIP Payout',
    inputs: ['returns.exit_ev', 'returns.exit_net_debt', 'fees.exit_fee_pct', 'returns.mip_payout'],
    outputs: ['returns.irr', 'returns.moic'],
    is_user_input: false,
  },
  'returns.exit_ev': {
    label: 'Exit EV',
    formula_symbolic: 'Exit EBITDA × Exit Multiple  [or exit_ev_override if set]',
    inputs: ['exit.exit_ebitda', 'exit.exit_ebitda_multiple'],
    outputs: ['returns.exit_equity', 'returns.mip_payout'],
    is_user_input: false,
  },
  'returns.exit_net_debt': {
    label: 'Exit Net Debt',
    formula_symbolic: 'max(0, Gross Debt[HP] − max(Min Cash, Cash[HP]))',
    inputs: ['debt_schedule.total_debt_at_exit', 'debt_schedule.cash_balance_at_exit', 'entry.min_cash_balance'],
    outputs: ['returns.exit_equity'],
    is_user_input: false,
  },
  'returns.mip_payout': {
    label: 'MIP Payout',
    formula_symbolic:
      'MIP Pool % × (Exit EV − Exit Net Debt − Exit Fee)  [if gross MOIC ≥ hurdle, else 0]',
    inputs: ['mip.mip_pool_pct', 'mip.hurdle_moic', 'returns.exit_ev', 'returns.exit_net_debt', 'fees.exit_fee_pct'],
    outputs: ['returns.exit_equity'],
    is_user_input: false,
  },
  'returns.total_distributions': {
    label: 'Total Interim Distributions',
    formula_symbolic: 'Σ Distributions[t=1..HP]',
    inputs: ['exit.interim_distributions'],
    outputs: ['returns.moic'],
    is_user_input: false,
  },

  // ── Exit assumptions ───────────────────────────────────────────────────────
  'exit.exit_ebitda': {
    label: 'Exit EBITDA',
    formula_symbolic: 'Revenue[HP] × Margin[HP]',
    inputs: ['projections.revenue', 'projections.ebitda_margin'],
    outputs: ['returns.exit_ev'],
    is_user_input: false,
  },
  'exit.exit_ebitda_multiple': {
    label: 'Exit EV/EBITDA Multiple',
    formula_symbolic: 'user input',
    inputs: [],
    outputs: ['returns.exit_ev'],
    is_user_input: true,
  },
  'exit.holding_period': {
    label: 'Holding Period (Years)',
    formula_symbolic: 'user input',
    inputs: [],
    outputs: ['returns.irr'],
    is_user_input: true,
  },
  'exit.interim_distributions': {
    label: 'Interim Distributions (per year)',
    formula_symbolic: 'user input  (list, one per holding-period year)',
    inputs: [],
    outputs: ['returns.total_distributions'],
    is_user_input: true,
  },
  'exit.mid_year_convention': {
    label: 'Mid-Year Convention',
    formula_symbolic:
      'user input  (boolean: if true, interim CFs discounted at t−0.5; exit at t=HP)',
    inputs: [],
    outputs: ['returns.irr'],
    is_user_input: true,
  },

  // ── Entry assumptions ──────────────────────────────────────────────────────
  'entry.enterprise_value': {
    label: 'Entry EV',
    formula_symbolic: 'Base EBITDA × Entry Multiple  [or direct EV input]',
    inputs: ['revenue.base_revenue', 'margins.base_ebitda_margin', 'entry.entry_ebitda_multiple'],
    outputs: ['returns.entry_equity'],
    is_user_input: false,
  },
  'entry.equity_check': {
    label: 'Equity Check (Sponsor Equity)',
    formula_symbolic: 'EV + Transaction Costs + Financing Fees − Total Debt',
    inputs: ['entry.enterprise_value', 'fees.transaction_costs', 'fees.financing_fee_pct', 'entry.total_debt_raised'],
    outputs: ['returns.irr', 'returns.moic'],
    is_user_input: false,
  },
  'entry.entry_ebitda_multiple': {
    label: 'Entry EV/EBITDA Multiple',
    formula_symbolic: 'user input',
    inputs: [],
    outputs: ['entry.enterprise_value'],
    is_user_input: true,
  },
  'entry.total_debt_raised': {
    label: 'Total Debt Raised',
    formula_symbolic: 'Σ Tranche Principal[i]',
    inputs: [],
    outputs: ['entry.equity_check'],
    is_user_input: false,
  },
  'entry.min_cash_balance': {
    label: 'Minimum Cash Balance',
    formula_symbolic: 'user input',
    inputs: [],
    outputs: ['returns.exit_net_debt'],
    is_user_input: true,
  },

  // ── Revenue ────────────────────────────────────────────────────────────────
  'revenue.base_revenue': {
    label: 'LTM Revenue',
    formula_symbolic: 'user input',
    inputs: [],
    outputs: ['projections.revenue', 'entry.enterprise_value'],
    is_user_input: true,
  },
  'revenue.growth_rates': {
    label: 'Revenue Growth Rates (per year)',
    formula_symbolic: 'user input  (list of annual growth rates as decimals)',
    inputs: [],
    outputs: ['projections.revenue'],
    is_user_input: true,
  },
  'projections.revenue': {
    label: 'Revenue[t]',
    formula_symbolic: 'Revenue[t−1] × (1 + Growth[t]) + Acquisition Revenue[t]',
    inputs: ['revenue.base_revenue', 'revenue.growth_rates'],
    outputs: ['projections.ebitda', 'exit.exit_ebitda'],
    is_user_input: false,
  },

  // ── Margins ────────────────────────────────────────────────────────────────
  'margins.base_ebitda_margin': {
    label: 'Base EBITDA Margin',
    formula_symbolic: 'user input',
    inputs: [],
    outputs: ['projections.ebitda', 'entry.enterprise_value'],
    is_user_input: true,
  },
  'margins.target_ebitda_margin': {
    label: 'Target EBITDA Margin',
    formula_symbolic: 'user input',
    inputs: [],
    outputs: ['projections.ebitda'],
    is_user_input: true,
  },

  // ── Projections ────────────────────────────────────────────────────────────
  'projections.ebitda': {
    label: 'EBITDA[t]',
    formula_symbolic: 'Revenue[t] × Margin[t]',
    inputs: ['projections.revenue', 'margins.base_ebitda_margin'],
    outputs: ['projections.fcf_pre_debt', 'exit.exit_ebitda'],
    is_user_input: false,
  },
  'projections.ebitda_margin': {
    label: 'EBITDA Margin[t]',
    formula_symbolic: 'EBITDA[t] / Revenue[t]  (interpolated from base → target via trajectory)',
    inputs: ['margins.base_ebitda_margin', 'margins.target_ebitda_margin'],
    outputs: ['projections.ebitda'],
    is_user_input: false,
  },
  'projections.interest': {
    label: 'Interest Expense[t]',
    formula_symbolic:
      'Σ Beginning Balance[tranche][t] × Rate[tranche]  [resolved via convergence loop]',
    inputs: ['debt_schedule.total_debt_at_exit'],
    outputs: ['projections.fcf_to_equity', 'projections.tax'],
    is_user_input: false,
  },
  'projections.fcf_pre_debt': {
    label: 'Unlevered FCF[t] (FCFF)',
    formula_symbolic:
      'NOPAT[t] + D&A[t] − Capex[t] − ΔNWC[t] − Monitoring Fee\n(NOPAT = EBIT × (1 − effective tax rate))',
    inputs: ['projections.ebitda', 'projections.tax', 'margins.da_pct_revenue', 'margins.capex_pct_revenue'],
    outputs: ['returns.irr'],
    is_user_input: false,
  },
  'projections.fcf_to_equity': {
    label: 'Levered FCF[t] (FCFE)',
    formula_symbolic:
      'Net Income[t] + D&A[t] − Capex[t] − ΔNWC[t] + Net Borrowing[t] − Monitoring Fee',
    inputs: ['projections.ebitda', 'projections.interest', 'projections.tax'],
    outputs: ['returns.irr'],
    is_user_input: false,
  },
  'projections.cash_balance': {
    label: 'Cash Balance[t]',
    formula_symbolic:
      'Cash[t−1] + FCFF[t] − Cash Interest[t] − Repayment[t] + New Borrowing[t]',
    inputs: ['projections.fcf_pre_debt', 'projections.interest'],
    outputs: ['returns.exit_net_debt'],
    is_user_input: false,
  },

  // ── Debt schedule ──────────────────────────────────────────────────────────
  'debt_schedule.total_debt_at_exit': {
    label: 'Total Debt at Exit',
    formula_symbolic: 'Σ Ending Balance[tranche][HP]',
    inputs: ['entry.total_debt_raised'],
    outputs: ['returns.exit_net_debt'],
    is_user_input: false,
  },
  'debt_schedule.interest_coverage_at_exit': {
    label: 'Interest Coverage at Exit',
    formula_symbolic: 'EBITDA[HP] / Total Cash Interest[HP]',
    inputs: ['projections.ebitda', 'projections.interest'],
    outputs: [],
    is_user_input: false,
  },

  // ── Fees ───────────────────────────────────────────────────────────────────
  'fees.exit_fee_pct': {
    label: 'Exit Fee %',
    formula_symbolic: 'user input  (% of exit EV)',
    inputs: [],
    outputs: ['returns.exit_equity', 'returns.mip_payout'],
    is_user_input: true,
  },
  'fees.financing_fee_pct': {
    label: 'Financing Fee %',
    formula_symbolic: 'user input  (% of total debt)',
    inputs: [],
    outputs: ['returns.entry_equity'],
    is_user_input: true,
  },
  'fees.transaction_costs': {
    label: 'Transaction Costs',
    formula_symbolic: 'user input  (absolute £m)',
    inputs: [],
    outputs: ['returns.entry_equity'],
    is_user_input: true,
  },

  // ── MIP ────────────────────────────────────────────────────────────────────
  'mip.mip_pool_pct': {
    label: 'MIP Pool %',
    formula_symbolic: 'user input  (% of exit equity)',
    inputs: [],
    outputs: ['returns.mip_payout'],
    is_user_input: true,
  },
  'mip.hurdle_moic': {
    label: 'MIP Hurdle MOIC',
    formula_symbolic: 'user input  (gross MOIC threshold for MIP to vest)',
    inputs: [],
    outputs: ['returns.mip_payout'],
    is_user_input: true,
  },

  // ── Value bridge (all formulas fully specified per Section 3.5) ────────────
  'value_drivers.revenue_growth_contribution_abs': {
    label: 'Revenue Growth Contribution',
    formula_symbolic: '(Exit Revenue × Entry Margin × Entry Multiple) − Entry EV',
    inputs: [
      'revenue.base_revenue',
      'exit.exit_ebitda',
      'margins.base_ebitda_margin',
      'entry.entry_ebitda_multiple',
      'entry.enterprise_value',
    ],
    outputs: [],
    is_user_input: false,
  },
  'value_drivers.margin_expansion_contribution_abs': {
    label: 'Margin Expansion Contribution',
    formula_symbolic: 'Exit Revenue × (Exit Margin − Entry Margin) × Entry Multiple',
    inputs: ['projections.ebitda', 'projections.revenue', 'margins.base_ebitda_margin', 'entry.entry_ebitda_multiple'],
    outputs: [],
    is_user_input: false,
  },
  'value_drivers.multiple_expansion_contribution_abs': {
    label: 'Multiple Expansion Contribution',
    formula_symbolic: 'Exit Revenue × Exit Margin × (Exit Multiple − Entry Multiple)',
    inputs: ['projections.ebitda', 'exit.exit_ebitda_multiple', 'entry.entry_ebitda_multiple'],
    outputs: [],
    is_user_input: false,
  },
  'value_drivers.debt_paydown_contribution_abs': {
    label: 'Debt Paydown Contribution',
    formula_symbolic: 'Entry Total Debt − Exit Net Debt',
    inputs: ['entry.total_debt_raised', 'returns.exit_net_debt'],
    outputs: [],
    is_user_input: false,
  },
  'value_drivers.fees_drag_contribution_abs': {
    label: 'Fees & Leakage Drag',
    formula_symbolic:
      '−(Transaction Costs + Financing Fees + Exit Fee + MIP Payout)\n(entry advisory fee excluded — target-borne)',
    inputs: ['fees.transaction_costs', 'fees.financing_fee_pct', 'fees.exit_fee_pct', 'returns.mip_payout'],
    outputs: [],
    is_user_input: false,
  },
};

/** Return the display label for a field path. */
export function traceLabel(fieldPath: string): string {
  // Normalise year-indexed paths
  const base = fieldPath.replace(/\.\d+$/, '');
  return TRACE_MAP[base]?.label ?? fieldPath;
}

/** Resolve the scalar value for a trace field from the current model state. */
export function resolveTraceValue(ms: ModelState, fieldPath: string): number | null {
  const parts = fieldPath.split('.');

  // Year-indexed projection: projections.revenue.3 → year index 2 (0-based)
  let yearIdx: number | null = null;
  let basePath = fieldPath;
  if (parts.length === 3 && parts[0] === 'projections' && /^\d+$/.test(parts[2])) {
    yearIdx = parseInt(parts[2], 10) - 1;
    basePath = parts[0] + '.' + parts[1];
  }

  const years = ms.projections?.years ?? [];
  const yr = yearIdx !== null ? years[yearIdx] : years[years.length - 1];
  const ds = ms.debt_schedule;

  const map: Record<string, () => number | null> = {
    'returns.irr': () => ms.returns?.irr ?? null,
    'returns.moic': () => ms.returns?.moic ?? null,
    'returns.entry_equity': () => ms.returns?.entry_equity ?? null,
    'returns.exit_equity': () => ms.returns?.exit_equity ?? null,
    'returns.exit_ev': () => ms.returns?.exit_ev ?? null,
    'returns.exit_net_debt': () => ms.returns?.exit_net_debt ?? null,
    'returns.mip_payout': () => ms.returns?.mip_payout ?? null,
    'returns.total_distributions': () => ms.returns?.total_distributions ?? null,
    'exit.exit_ebitda': () => ms.exit?.exit_ebitda ?? null,
    'exit.exit_ebitda_multiple': () => ms.exit?.exit_ebitda_multiple ?? null,
    'exit.holding_period': () => ms.exit?.holding_period ?? null,
    'exit.mid_year_convention': () => (ms.exit?.mid_year_convention ? 1 : 0),
    'entry.enterprise_value': () => ms.entry?.enterprise_value ?? null,
    'entry.equity_check': () => ms.entry?.equity_check ?? null,
    'entry.entry_ebitda_multiple': () => ms.entry?.entry_ebitda_multiple ?? null,
    'entry.total_debt_raised': () => ms.entry?.total_debt_raised ?? null,
    'entry.min_cash_balance': () => ms.entry?.min_cash_balance ?? null,
    'revenue.base_revenue': () => ms.revenue?.base_revenue ?? null,
    'margins.base_ebitda_margin': () => ms.margins?.base_ebitda_margin ?? null,
    'margins.target_ebitda_margin': () => ms.margins?.target_ebitda_margin ?? null,
    'margins.da_pct_revenue': () => ms.margins?.da_pct_revenue ?? null,
    'margins.capex_pct_revenue': () => ms.margins?.capex_pct_revenue ?? null,
    'margins.nwc_pct_revenue': () => ms.margins?.nwc_pct_revenue ?? null,
    'projections.revenue': () => yr?.revenue ?? null,
    'projections.ebitda': () => yr?.ebitda_adj ?? null,
    'projections.ebitda_margin': () => yr?.ebitda_margin ?? null,
    'projections.interest': () => yr?.interest_expense ?? null,
    'projections.fcf_pre_debt': () => yr?.fcf_pre_debt ?? null,
    'projections.fcf_to_equity': () => yr?.fcf_to_equity ?? null,
    'projections.cash_balance': () => yr?.cash_balance ?? null,
    'projections.tax': () => yr?.tax ?? null,
    'projections.nopat': () => yr?.nopat ?? null,
    'debt_schedule.total_debt_at_exit': () => {
      const arr = ds?.total_debt_by_year;
      return arr?.length ? arr[arr.length - 1] : null;
    },
    'debt_schedule.cash_balance_at_exit': () => {
      const arr = ds?.cash_balance_by_year;
      return arr?.length ? arr[arr.length - 1] : null;
    },
    'debt_schedule.interest_coverage_at_exit': () => {
      const arr = ds?.interest_coverage_by_year;
      return arr?.length ? arr[arr.length - 1] : null;
    },
    'fees.exit_fee_pct': () => ms.fees?.exit_fee_pct ?? null,
    'fees.financing_fee_pct': () => ms.fees?.financing_fee_pct ?? null,
    'fees.transaction_costs': () => ms.fees?.transaction_costs ?? null,
    'mip.mip_pool_pct': () => ms.mip?.mip_pool_pct ?? null,
    'mip.hurdle_moic': () => ms.mip?.hurdle_moic ?? null,
    'value_drivers.revenue_growth_contribution_abs': () =>
      ms.value_drivers?.revenue_growth_contribution_abs ?? null,
    'value_drivers.margin_expansion_contribution_abs': () =>
      ms.value_drivers?.margin_expansion_contribution_abs ?? null,
    'value_drivers.multiple_expansion_contribution_abs': () =>
      ms.value_drivers?.multiple_expansion_contribution_abs ?? null,
    'value_drivers.debt_paydown_contribution_abs': () =>
      ms.value_drivers?.debt_paydown_contribution_abs ?? null,
    'value_drivers.fees_drag_contribution_abs': () =>
      ms.value_drivers?.fees_drag_contribution_abs ?? null,
  };

  return map[basePath]?.() ?? null;
}

/** Compute which TRACE_MAP field paths changed between two model states. */
export function computeChangedTraceFields(oldMs: ModelState, newMs: ModelState): string[] {
  const changed: string[] = [];
  for (const fp of Object.keys(TRACE_MAP)) {
    const oldV = resolveTraceValue(oldMs, fp);
    const newV = resolveTraceValue(newMs, fp);
    if (oldV !== newV) changed.push(fp);
  }
  return changed;
}
