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
  min_cash_balance: number;
  currency: 'INR' | 'EUR' | 'USD' | 'GBP' | 'JPY';
}

export interface ExitAssumptions {
  holding_period: number;
  exit_ebitda_multiple: number;
  exit_revenue_multiple: number;
  exit_method: 'strategic' | 'secondary_buyout' | 'ipo' | 'recapitalization';
  mid_year_convention: boolean;
  interim_distributions: number[];
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
  total_distributions: number;
  dpi_by_year: number[];
  rvpi_by_year: number[];
  convergence_iterations: number;
  convergence_delta: number;
}

export interface ValueDriverRanking {
  driver: string;
  contribution_pct: number;
  contribution_abs: number;
  rank: number;
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
  // IC-grade additions
  ranked_drivers: ValueDriverRanking[];
  operational_pct: number;       // revenue + margin as % of total
  financial_engineering_pct: number; // multiple + debt + fees as % of total
  primary_driver: string;
  insights: string[];
}

// ── Fragility Analysis ──────────────────────────────────────────────────

export interface FragilityStressResult {
  scenario: string;
  irr: number | null;
  moic: number;
  delta_irr: number;   // vs base
  delta_moic: number;  // vs base
}

export interface FragilityAnalysis {
  base_irr: number | null;
  base_moic: number;
  stress_results: FragilityStressResult[];
  combined_irr: number | null;
  combined_moic: number;
  irr_drop: number;
  score: number;              // IRR_drop_combined / Base_IRR
  classification: 'Robust' | 'Moderate Risk' | 'Fragile';
  dominant_stress_driver: string;
  insights: string[];
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
  message: string;
  return_decomposition?: string;
  primary_driver?: string;
  risk_concentration?: string;
  fragility_test?: string;
  improvement_levers?: string[];
  assumption_rationale?: string;
}

export interface ModelState {
  deal_name: string;
  company_description: string;
  sector: string;
  currency: 'INR' | 'EUR' | 'USD' | 'GBP' | 'JPY';
  revenue: RevenueAssumptions;
  margins: MarginAssumptions;
  tax: TaxAssumptions;
  entry: EntryAssumptions;
  debt_tranches: DebtTranche[];
  fees: FeeStructure;
  mip: ManagementIncentive;
  exit: ExitAssumptions;
  // New: segments and add-ons
  revenue_segments: RevenueSegment[];
  add_on_acquisitions: AddOnAcquisition[];
  // Computed outputs
  projections: { years: AnnualProjectionYear[] };
  debt_schedule: DebtScheduleResult;
  returns: Returns;
  value_drivers: ValueDriverDecomposition;
  sources_and_uses: SourcesAndUses;
  credit_analysis: CreditAnalysis;
  ebitda_bridge: EBITDABridge;
  fragility: FragilityAnalysis;
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

// ── Sources & Uses ───────────────────────────────────────────────────────

export interface SourcesAndUses {
  // Uses
  enterprise_value: number;
  transaction_fees: number;
  financing_fees: number;
  cash_to_balance_sheet: number;
  total_uses: number;
  // Sources
  debt_sources: { name: string; amount: number }[];
  total_debt: number;
  rollover_equity: number;
  sponsor_equity: number;
  total_sources: number;
  // Derived
  equity_pct_of_total: number;
  debt_pct_of_total: number;
  implied_leverage: number;
  // Audit check
  sources_uses_balanced: boolean;
  imbalance: number;
}

// ── Credit Analysis ──────────────────────────────────────────────────────

export interface CreditMetricsYear {
  year: number;
  fccr: number;                    // (EBITDA - Capex - Tax) / (Cash Interest + Mandatory Amort)
  interest_coverage: number;       // EBITDA / Cash Interest
  dscr: number;                    // FCF pre-debt / (Cash Interest + Mandatory Amort)
  leverage: number;                // Net Debt / EBITDA
  senior_leverage: number;         // Senior Debt / EBITDA
  total_debt: number;
  cumulative_debt_paydown: number;
  debt_paydown_pct: number;
}

export interface CreditAnalysis {
  metrics_by_year: CreditMetricsYear[];
  max_debt_capacity_at_4x: number;
  max_debt_capacity_at_5x: number;
  max_debt_capacity_at_6x: number;
  covenant_headroom_by_year: number[];  // leverage headroom vs 6x covenant
  refinancing_risk: boolean;
  refinancing_risk_detail: string;
  recovery_waterfall: { tranche: string; recovery_pct: number }[];
  credit_rating_estimate: string;
}

// ── Revenue Segments ─────────────────────────────────────────────────────

export interface RevenueSegment {
  name: string;
  base_revenue: number;
  growth_rates: number[];
  margin_override: number | null;  // segment-level EBITDA margin if different
}

// ── Add-On Acquisitions ──────────────────────────────────────────────────

export interface AddOnAcquisition {
  name: string;
  year: number;                  // acquisition year (1-indexed)
  revenue: number;               // LTM revenue at acquisition
  ebitda_margin: number;
  purchase_multiple: number;
  funding: 'debt' | 'equity' | 'mixed';
  debt_pct: number;              // % funded by debt (if mixed)
  synergy_revenue: number;
  synergy_cost: number;          // cost synergies (positive = savings)
  integration_cost: number;      // one-time integration cost
}

// ── EBITDA Bridge ────────────────────────────────────────────────────────

export interface EBITDABridge {
  entry_ebitda: number;
  organic_revenue_contribution: number;
  margin_expansion_contribution: number;
  cost_synergies: number;
  add_on_ebitda: number;
  integration_costs: number;
  monitoring_fees: number;
  exit_ebitda: number;
}
