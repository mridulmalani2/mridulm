/**
 * Static dependency map for the Trace Graph feature.
 *
 * Design principle: only include fields that give an analyst genuine analytical
 * insight when traced. Technical toggles (mid_year_convention), list inputs
 * (growth_rates, interim_distributions), and near-zero operational parameters
 * (min_cash_balance) are excluded — they produce empty or misleading trace cards.
 *
 * formula_fn: when defined, substitutes actual model values into the formula so
 * the analyst sees e.g. "₹25.0m × 10.0x = ₹250.0m" rather than just the
 * algebraic structure. This is the primary mechanism for making calculations
 * immediately defensible.
 */

import type { ModelState } from './dealEngineTypes';

// ── Iterative / circular fields ─────────────────────────────────────────────
export const ITERATIVE_FIELDS = new Set([
  'projections.interest',
  'projections.tax',
  'projections.nopat',
  'projections.fcf_pre_debt',
  'projections.fcf_to_equity',
  'debt_schedule.total_debt_at_exit',
]);

export interface TraceMapEntry {
  label: string;
  formula_symbolic: string;
  /** Returns numbers-substituted formula string, or null if not applicable. */
  formula_fn?: (ms: ModelState, currency: string) => string | null;
  inputs: string[];
  outputs: string[];
  is_user_input: boolean;
}

// ── Helpers used by formula_fn ───────────────────────────────────────────────
function csym(currency: string): string {
  return ({ USD: '$', EUR: '€', INR: '₹', JPY: '¥' } as Record<string, string>)[currency] ?? '£';
}
function fm(v: number | null | undefined, dec = 1): string {
  return v != null ? v.toFixed(dec) : '—';
}

export const TRACE_MAP: Record<string, TraceMapEntry> = {
  // ── Returns ────────────────────────────────────────────────────────────────

  'returns.irr': {
    label: 'Equity IRR',
    formula_symbolic:
      'solve r: Σ CF[tᵢ]/(1+r)^tᵢ = 0\n(t₀=0; tₙ=HP at year-end; interim at tₙ−0.5 when mid-year convention active)',
    // IRR is a numerical solve — no closed-form substitution possible
    inputs: ['returns.entry_equity', 'returns.exit_equity'],
    outputs: [],
    is_user_input: false,
  },

  'returns.moic': {
    label: 'Equity MOIC',
    formula_symbolic: 'Exit Equity / Entry Equity',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const exitEq = ms.returns?.exit_equity ?? 0;
      const entryEq = ms.returns?.entry_equity ?? 0;
      const moic = ms.returns?.moic ?? 0;
      return `${s}${fm(exitEq)}m ÷ ${s}${fm(entryEq)}m = ${fm(moic, 2)}x`;
    },
    inputs: ['returns.entry_equity', 'returns.exit_equity'],
    outputs: [],
    is_user_input: false,
  },

  'returns.entry_equity': {
    label: 'Entry Equity (Sponsor)',
    formula_symbolic:
      'EV + Transaction Costs + Financing Fees − Total Debt\n(entry advisory fee is target-borne, excluded)',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const ev = ms.entry?.enterprise_value ?? 0;
      const tx = ms.fees?.transaction_costs ?? 0;
      const debt = ms.entry?.total_debt_raised ?? 0;
      const finFee = debt * (ms.fees?.financing_fee_pct ?? 0);
      const equity = ms.returns?.entry_equity ?? 0;
      return `${s}${fm(ev)}m EV + ${s}${fm(tx)}m tx + ${s}${fm(finFee)}m fin fees − ${s}${fm(debt)}m debt = ${s}${fm(equity)}m`;
    },
    inputs: ['entry.enterprise_value', 'fees.transaction_costs', 'fees.financing_fee_pct', 'entry.total_debt_raised'],
    outputs: ['returns.irr', 'returns.moic'],
    is_user_input: false,
  },

  'returns.exit_equity': {
    label: 'Exit Equity',
    formula_symbolic: 'Exit EV − Exit Net Debt − Exit Fee − MIP Payout',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const ev = ms.returns?.exit_ev ?? 0;
      const netDebt = ms.returns?.exit_net_debt ?? 0;
      const exitFee = ev * (ms.fees?.exit_fee_pct ?? 0);
      const mip = ms.returns?.mip_payout ?? 0;
      const equity = ms.returns?.exit_equity ?? 0;
      const parts = [`${s}${fm(ev)}m exit EV`];
      if (netDebt > 0) parts.push(`− ${s}${fm(netDebt)}m debt`);
      if (exitFee > 0) parts.push(`− ${s}${fm(exitFee)}m exit fee`);
      if (mip > 0) parts.push(`− ${s}${fm(mip)}m MIP`);
      return parts.join('  ') + `  = ${s}${fm(equity)}m`;
    },
    inputs: ['returns.exit_ev', 'returns.exit_net_debt', 'fees.exit_fee_pct', 'returns.mip_payout'],
    outputs: ['returns.irr', 'returns.moic'],
    is_user_input: false,
  },

  'returns.exit_ev': {
    label: 'Exit EV',
    formula_symbolic: 'Exit EBITDA × Exit Multiple',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const ebitda = ms.exit?.exit_ebitda ?? 0;
      const multiple = ms.exit?.exit_ebitda_multiple ?? 0;
      const ev = ms.returns?.exit_ev ?? 0;
      return `${s}${fm(ebitda)}m EBITDA × ${fm(multiple)}x = ${s}${fm(ev)}m`;
    },
    inputs: ['exit.exit_ebitda', 'exit.exit_ebitda_multiple'],
    outputs: ['returns.exit_equity', 'returns.mip_payout'],
    is_user_input: false,
  },

  'returns.exit_net_debt': {
    label: 'Exit Net Debt',
    formula_symbolic: 'Gross Debt at Exit (sum of tranche ending balances)',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const ds = ms.debt_schedule;
      const entryDebt = ms.entry?.total_debt_raised ?? 0;
      const exitDebt = ds?.total_debt_by_year?.[ds.total_debt_by_year.length - 1] ?? 0;
      const paid = entryDebt - exitDebt;
      return `${s}${fm(entryDebt)}m entered − ${s}${fm(paid)}m repaid = ${s}${fm(exitDebt)}m remaining`;
    },
    inputs: ['entry.total_debt_raised', 'debt_schedule.total_debt_at_exit'],
    outputs: ['returns.exit_equity'],
    is_user_input: false,
  },

  'returns.mip_payout': {
    label: 'MIP Payout',
    formula_symbolic:
      'MIP Pool % × (Exit EV − Exit Net Debt − Exit Fee)  [if gross MOIC ≥ hurdle, else 0]',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const mip = ms.returns?.mip_payout ?? 0;
      const moic = ms.returns?.moic ?? 0;
      const hurdle = ms.mip?.hurdle_moic ?? 0;
      if (mip === 0) return `₹0m — MOIC ${fm(moic, 2)}x below hurdle ${fm(hurdle, 2)}x`;
      const pool = ms.mip?.mip_pool_pct ?? 0;
      const base = ms.returns?.exit_ev ?? 0;
      return `${(pool * 100).toFixed(1)}% × ${s}${fm(base)}m = ${s}${fm(mip)}m`;
    },
    inputs: ['mip.mip_pool_pct', 'mip.hurdle_moic', 'returns.exit_ev', 'returns.exit_net_debt', 'fees.exit_fee_pct'],
    outputs: ['returns.exit_equity'],
    is_user_input: false,
  },

  // ── Exit assumptions ───────────────────────────────────────────────────────

  'exit.exit_ebitda': {
    label: 'Exit EBITDA',
    formula_symbolic: 'Revenue[HP] × EBITDA Margin[HP]',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const years = ms.projections?.years ?? [];
      const last = years[years.length - 1];
      const rev = last?.revenue ?? 0;
      const margin = last?.ebitda_margin ?? 0;
      const ebitda = ms.exit?.exit_ebitda ?? 0;
      return `${s}${fm(rev)}m × ${(margin * 100).toFixed(1)}% = ${s}${fm(ebitda)}m`;
    },
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

  // ── Entry assumptions ──────────────────────────────────────────────────────

  'entry.enterprise_value': {
    label: 'Entry EV',
    formula_symbolic: 'Base EBITDA × Entry Multiple',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const ebitda = (ms.revenue?.base_revenue ?? 0) * (ms.margins?.base_ebitda_margin ?? 0);
      const multiple = ms.entry?.entry_ebitda_multiple ?? 0;
      const ev = ms.entry?.enterprise_value ?? 0;
      return `${s}${fm(ebitda)}m EBITDA × ${fm(multiple)}x = ${s}${fm(ev)}m`;
    },
    inputs: ['revenue.base_revenue', 'margins.base_ebitda_margin', 'entry.entry_ebitda_multiple'],
    outputs: ['returns.entry_equity'],
    is_user_input: false,
  },

  'entry.equity_check': {
    label: 'Equity Check (Sponsor Equity)',
    formula_symbolic: 'EV + Transaction Costs + Financing Fees − Total Debt',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const ev = ms.entry?.enterprise_value ?? 0;
      const tx = ms.fees?.transaction_costs ?? 0;
      const debt = ms.entry?.total_debt_raised ?? 0;
      const finFee = debt * (ms.fees?.financing_fee_pct ?? 0);
      const equity = ms.entry?.equity_check ?? 0;
      return `${s}${fm(ev)}m + ${s}${fm(tx)}m tx + ${s}${fm(finFee)}m fin − ${s}${fm(debt)}m = ${s}${fm(equity)}m`;
    },
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
    outputs: ['entry.equity_check', 'returns.entry_equity'],
    is_user_input: false,
  },

  // ── Revenue & Projections ──────────────────────────────────────────────────

  'revenue.base_revenue': {
    label: 'LTM Revenue',
    formula_symbolic: 'user input',
    inputs: [],
    outputs: ['projections.revenue', 'entry.enterprise_value'],
    is_user_input: true,
  },

  'projections.revenue': {
    label: 'Revenue[t]',
    formula_symbolic: 'Revenue[t−1] × (1 + Growth[t]) + Acquisition Revenue[t]',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const years = ms.projections?.years ?? [];
      if (years.length < 2) return null;
      const prev = years[years.length - 2];
      const last = years[years.length - 1];
      const growth = last?.revenue_growth ?? 0;
      return `${s}${fm(prev?.revenue)}m × (1 + ${(growth * 100).toFixed(1)}%) = ${s}${fm(last?.revenue)}m at exit`;
    },
    inputs: ['revenue.base_revenue'],
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
    formula_symbolic: 'Revenue[t] × EBITDA Margin[t]',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const years = ms.projections?.years ?? [];
      const last = years[years.length - 1];
      const rev = last?.revenue ?? 0;
      const margin = last?.ebitda_margin ?? 0;
      const ebitda = last?.ebitda_adj ?? 0;
      return `${s}${fm(rev)}m × ${(margin * 100).toFixed(1)}% = ${s}${fm(ebitda)}m at exit`;
    },
    inputs: ['projections.revenue', 'margins.base_ebitda_margin'],
    outputs: ['projections.fcf_pre_debt', 'exit.exit_ebitda'],
    is_user_input: false,
  },

  'projections.ebitda_margin': {
    label: 'EBITDA Margin[t]',
    formula_symbolic: 'EBITDA[t] / Revenue[t]  (interpolated base → target over holding period)',
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
      'NOPAT + D&A − Capex − ΔNWC\n(NOPAT = EBIT × (1 − effective tax rate))',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const years = ms.projections?.years ?? [];
      const last = years[years.length - 1];
      const fcf = last?.fcf_pre_debt ?? 0;
      const nopat = last?.nopat ?? 0;
      return `NOPAT ${s}${fm(nopat)}m → FCFF ${s}${fm(fcf)}m at exit`;
    },
    inputs: ['projections.ebitda', 'projections.tax', 'margins.da_pct_revenue', 'margins.capex_pct_revenue'],
    outputs: ['returns.irr'],
    is_user_input: false,
  },

  'projections.fcf_to_equity': {
    label: 'Levered FCF[t] (FCFE)',
    formula_symbolic:
      'Net Income + D&A − Capex − ΔNWC + Net Borrowing',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const years = ms.projections?.years ?? [];
      const last = years[years.length - 1];
      const fcfe = last?.fcf_to_equity ?? 0;
      return `FCFE at exit: ${s}${fm(fcfe)}m`;
    },
    inputs: ['projections.ebitda', 'projections.interest', 'projections.tax'],
    outputs: ['returns.irr'],
    is_user_input: false,
  },

  // ── Debt schedule ──────────────────────────────────────────────────────────

  'debt_schedule.total_debt_at_exit': {
    label: 'Total Debt at Exit',
    formula_symbolic: 'Σ Ending Balance[tranche][HP]',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const ds = ms.debt_schedule;
      const entry = ms.entry?.total_debt_raised ?? 0;
      const exit = ds?.total_debt_by_year?.[ds.total_debt_by_year.length - 1] ?? 0;
      const paidPct = entry > 0 ? ((entry - exit) / entry * 100).toFixed(0) : '0';
      return `${s}${fm(exit)}m remaining (${paidPct}% of ${s}${fm(entry)}m repaid)`;
    },
    inputs: ['entry.total_debt_raised'],
    outputs: ['returns.exit_net_debt'],
    is_user_input: false,
  },

  'debt_schedule.interest_coverage_at_exit': {
    label: 'Interest Coverage at Exit',
    formula_symbolic: 'EBITDA[HP] / Total Cash Interest[HP]',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const years = ms.projections?.years ?? [];
      const last = years[years.length - 1];
      const ebitda = last?.ebitda_adj ?? 0;
      const interest = last?.interest_expense ?? 0;
      const ds = ms.debt_schedule;
      const cov = ds?.interest_coverage_by_year?.[ds.interest_coverage_by_year.length - 1] ?? 0;
      return `${s}${fm(ebitda)}m EBITDA ÷ ${s}${fm(interest)}m interest = ${cov > 50 ? '>50' : fm(cov)}x`;
    },
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
    outputs: ['returns.entry_equity', 'entry.equity_check'],
    is_user_input: true,
  },

  'fees.transaction_costs': {
    label: 'Transaction Costs',
    formula_symbolic: 'user input',
    inputs: [],
    outputs: ['returns.entry_equity', 'entry.equity_check'],
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

  // ── Value bridge ───────────────────────────────────────────────────────────

  'value_drivers.revenue_growth_contribution_abs': {
    label: 'Revenue Growth Contribution',
    formula_symbolic: '(Exit Revenue × Entry Margin × Entry Multiple) − Entry EV',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const v = ms.value_drivers?.revenue_growth_contribution_abs ?? 0;
      const pct = ms.value_drivers?.revenue_growth_contribution_pct ?? 0;
      return `${s}${fm(v)}m  (${(pct * 100).toFixed(0)}% of total equity gain)`;
    },
    inputs: ['revenue.base_revenue', 'exit.exit_ebitda', 'margins.base_ebitda_margin', 'entry.entry_ebitda_multiple', 'entry.enterprise_value'],
    outputs: [],
    is_user_input: false,
  },

  'value_drivers.margin_expansion_contribution_abs': {
    label: 'Margin Expansion Contribution',
    formula_symbolic: 'Exit Revenue × (Exit Margin − Entry Margin) × Entry Multiple',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const v = ms.value_drivers?.margin_expansion_contribution_abs ?? 0;
      const pct = ms.value_drivers?.margin_expansion_contribution_pct ?? 0;
      const entryM = (ms.margins?.base_ebitda_margin ?? 0) * 100;
      const years = ms.projections?.years ?? [];
      const exitM = (years[years.length - 1]?.ebitda_margin ?? 0) * 100;
      return `${entryM.toFixed(1)}% → ${exitM.toFixed(1)}% margin  →  ${s}${fm(v)}m  (${(pct * 100).toFixed(0)}%)`;
    },
    inputs: ['projections.ebitda', 'projections.revenue', 'margins.base_ebitda_margin', 'entry.entry_ebitda_multiple'],
    outputs: [],
    is_user_input: false,
  },

  'value_drivers.multiple_expansion_contribution_abs': {
    label: 'Multiple Expansion Contribution',
    formula_symbolic: 'Exit Revenue × Exit Margin × (Exit Multiple − Entry Multiple)',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const v = ms.value_drivers?.multiple_expansion_contribution_abs ?? 0;
      const pct = ms.value_drivers?.multiple_expansion_contribution_pct ?? 0;
      const entryX = ms.entry?.entry_ebitda_multiple ?? 0;
      const exitX = ms.exit?.exit_ebitda_multiple ?? 0;
      return `${fm(entryX)}x entry → ${fm(exitX)}x exit  →  ${s}${fm(v)}m  (${(pct * 100).toFixed(0)}%)`;
    },
    inputs: ['projections.ebitda', 'exit.exit_ebitda_multiple', 'entry.entry_ebitda_multiple'],
    outputs: [],
    is_user_input: false,
  },

  'value_drivers.debt_paydown_contribution_abs': {
    label: 'Debt Paydown Contribution',
    formula_symbolic: 'Entry Total Debt − Exit Net Debt',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const entry = ms.entry?.total_debt_raised ?? 0;
      const exit = ms.returns?.exit_net_debt ?? 0;
      const v = ms.value_drivers?.debt_paydown_contribution_abs ?? 0;
      const pct = ms.value_drivers?.debt_paydown_contribution_pct ?? 0;
      return `${s}${fm(entry)}m → ${s}${fm(exit)}m  =  ${s}${fm(v)}m paid down  (${(pct * 100).toFixed(0)}%)`;
    },
    inputs: ['entry.total_debt_raised', 'returns.exit_net_debt'],
    outputs: [],
    is_user_input: false,
  },

  'value_drivers.fees_drag_contribution_abs': {
    label: 'Fees & Leakage Drag',
    formula_symbolic:
      '−(Transaction Costs + Financing Fees + Exit Fee + MIP Payout)',
    formula_fn: (ms, currency) => {
      const s = csym(currency);
      const v = ms.value_drivers?.fees_drag_contribution_abs ?? 0;
      const pct = ms.value_drivers?.fees_drag_contribution_pct ?? 0;
      return `${s}${fm(Math.abs(v))}m total drag  (${Math.abs((pct * 100)).toFixed(0)}% of equity gain)`;
    },
    inputs: ['fees.transaction_costs', 'fees.financing_fee_pct', 'fees.exit_fee_pct', 'returns.mip_payout'],
    outputs: [],
    is_user_input: false,
  },
};

/** Return the display label for a field path. */
export function traceLabel(fieldPath: string): string {
  const base = fieldPath.replace(/\.\d+$/, '');
  return TRACE_MAP[base]?.label ?? fieldPath;
}

/** Resolve the scalar value for a trace field from the current model state. */
export function resolveTraceValue(ms: ModelState, fieldPath: string): number | null {
  const parts = fieldPath.split('.');

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
    'exit.exit_ebitda': () => ms.exit?.exit_ebitda ?? null,
    'exit.exit_ebitda_multiple': () => ms.exit?.exit_ebitda_multiple ?? null,
    'entry.enterprise_value': () => ms.entry?.enterprise_value ?? null,
    'entry.equity_check': () => ms.entry?.equity_check ?? null,
    'entry.entry_ebitda_multiple': () => ms.entry?.entry_ebitda_multiple ?? null,
    'entry.total_debt_raised': () => ms.entry?.total_debt_raised ?? null,
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
    'projections.tax': () => yr?.tax ?? null,
    'projections.nopat': () => yr?.nopat ?? null,
    'debt_schedule.total_debt_at_exit': () => {
      const arr = ds?.total_debt_by_year;
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
