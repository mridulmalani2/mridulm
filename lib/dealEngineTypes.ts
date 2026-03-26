/** TypeScript types mirroring the backend Pydantic models. */

export interface DebtTranche {
  name: string;
  principal: number;
  interest_rate: number;
  rate_type: 'fixed' | 'floating';
  base_rate: number;
  spread: number;
  amortization_type: 'bullet' | 'straight_line' | 'cash_sweep' | 'PIK';
  amortization_schedule: number[];
  pik_rate: number;
  cash_interest: boolean;
  commitment_fee: number;
  floor: number;
  cash_sweep_pct: number;
}

export interface FeeStructure {
  entry_fee_pct: number;
  exit_fee_pct: number;
  monitoring_fee_annual: number;
  financing_fee_pct: number;
  transaction_costs: number;
}

export interface ManagementIncentive {
  mip_pool_pct: number;
  hurdle_moic: number;
  vesting_years: number;
  sweet_equity_pct: number;
}

export interface RevenueAssumptions {
  base_revenue: number;
  growth_rates: number[];
  organic_growth: number[];
  acquisition_revenue: number[];
  churn_rate: number;
}

export interface MarginAssumptions {
  base_ebitda_margin: number;
  target_ebitda_margin: number;
  margin_trajectory: 'linear' | 'front_loaded' | 'back_loaded' | 'step';
  margin_by_year: number[];
  da_pct_revenue: number;
  capex_pct_revenue: number;
  growth_capex: number[];
  nwc_pct_revenue: number;
  nwc_movement_method: 'pct_change' | 'explicit';
}

export interface TaxAssumptions {
  tax_rate: number;
  tax_shield_on_interest: boolean;
  dtl_unwind_years: number;
  nol_carryforward: number;
  minimum_tax_rate: number;
}

export interface EntryAssumptions {
  enterprise_value: number;
  entry_ebitda_multiple: number;
  entry_revenue_multiple: number;
  net_debt_at_entry: number;
  equity_check: number;
  total_debt_raised: number;
  leverage_ratio: number;
  currency: 'GBP' | 'EUR' | 'USD' | 'CHF';
}

export interface ExitAssumptions {
  holding_period: number;
  exit_ebitda_multiple: number;
  exit_revenue_multiple: number;
  exit_method: 'strategic' | 'secondary_buyout' | 'ipo' | 'recapitalization';
  exit_ebitda: number;
  exit_ev: number;
  exit_net_debt: number;
  exit_equity: number;
  mip_payout: number;
}

export interface AnnualProjectionYear {
  year: number;
  revenue: number;
  revenue_growth: number;
  organic_revenue: number;
  acquisition_revenue: number;
  ebitda: number;
  ebitda_margin: number;
  ebitda_adj: number;
  da: number;
  ebit: number;
  interest_expense: number;
  financing_fee_amort: number;
  ebt: number;
  tax: number;
  nol_used: number;
  net_income: number;
  nopat: number;
  maintenance_capex: number;
  growth_capex: number;
  total_capex: number;
  delta_nwc: number;
  fcf_pre_debt: number;
  fcf_to_equity: number;
}

export interface DebtScheduleYear {
  year: number;
  tranche_name: string;
  beginning_balance: number;
  cash_interest: number;
  pik_accrual: number;
  scheduled_repayment: number;
  sweep_repayment: number;
  total_repayment: number;
  ending_balance: number;
  effective_rate: number;
  interest_tax_shield: number;
  commitment_fee_paid: number;
}

export interface DebtScheduleResult {
  tranche_schedules: DebtScheduleYear[][];
  total_debt_by_year: number[];
  net_debt_by_year: number[];
  leverage_ratio_by_year: number[];
  interest_coverage_by_year: number[];
  dscr_by_year: number[];
  total_cash_interest_by_year: number[];
  total_repayment_by_year: number[];
  total_interest_tax_shield_by_year: number[];
}

export interface Returns {
  irr: number | null;
  moic: number;
  dpi: number;
  rvpi: number;
  cash_yield_avg: number;
  payback_years: number;
  irr_gross: number | null;
  irr_levered: number | null;
  irr_unlevered: number | null;
  irr_convergence_failed: boolean;
  entry_equity: number;
  exit_equity: number;
  exit_ev: number;
  exit_net_debt: number;
  mip_payout: number;
}

export interface ValueDriverDecomposition {
  revenue_growth_contribution_pct: number;
  margin_expansion_contribution_pct: number;
  multiple_expansion_contribution_pct: number;
  debt_paydown_contribution_pct: number;
  fees_drag_contribution_pct: number;
  revenue_growth_contribution_abs: number;
  margin_expansion_contribution_abs: number;
  multiple_expansion_contribution_abs: number;
  debt_paydown_contribution_abs: number;
  fees_drag_contribution_abs: number;
  entry_equity: number;
  exit_equity: number;
  total_equity_gain: number;
  reconciliation_delta: number;
}

export interface ScenarioSet {
  name: 'base' | 'bull' | 'bear' | 'stress';
  growth_rates: number[];
  margin_by_year: number[];
  exit_multiple: number;
  leverage_ratio: number;
  irr: number | null;
  moic: number;
  exit_equity: number;
  description: string;
}

export interface SensitivityTable {
  table_id: number;
  row_variable: string;
  col_variable: string;
  row_values: number[];
  col_values: number[];
  irr_matrix: (number | null)[][];
  moic_matrix: number[][];
}

export interface ExitFlag {
  flag_type: string;
  severity: 'warning' | 'critical';
  description: string;
  quantified_impact: string;
}

export interface ExitRealityCheck {
  flags: ExitFlag[];
  implied_buyer_irr: number | null;
  ev_revenue_at_exit: number;
  ev_ebitda_at_exit: number;
  public_comps_multiple_range: [number, number];
  multiple_delta: number;
  verdict: 'aggressive' | 'realistic' | 'conservative';
  narrative: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  assumption_updates?: Record<string, unknown>;
  analysis?: AIAnalysis;
}

export interface AIAnalysis {
  return_decomposition: string;
  primary_driver: string;
  risk_concentration: string;
  fragility_test: string;
  improvement_levers: string[];
  assumption_rationale?: string;
}

export interface ModelState {
  deal_name: string;
  company_description: string;
  sector: string;
  currency: 'GBP' | 'EUR' | 'USD' | 'CHF';
  revenue: RevenueAssumptions;
  margins: MarginAssumptions;
  tax: TaxAssumptions;
  entry: EntryAssumptions;
  debt_tranches: DebtTranche[];
  fees: FeeStructure;
  mip: ManagementIncentive;
  exit: ExitAssumptions;
  projections: { years: AnnualProjectionYear[] };
  debt_schedule: DebtScheduleResult;
  returns: Returns;
  value_drivers: ValueDriverDecomposition;
  scenarios: ScenarioSet[];
  sensitivity_tables: SensitivityTable[];
  exit_reality_check: ExitRealityCheck;
  ai_overrides: Record<string, unknown>;
  ai_toggle_fields: string[];
  chat_history: ChatMessage[];
}

export interface AppliedDiff {
  field: string;
  old: unknown;
  new: unknown;
}
