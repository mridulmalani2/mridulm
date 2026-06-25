/** Core type definitions for the deal engine. */

/** Refinancing of a single tranche at a given hold year (P4-3): reprice the rate,
 *  pay a one-time call/prepayment premium, and extend the maturity. */
export interface RefinancingEvent {
  year: number;                 // 1-indexed hold year the refinancing takes effect
  new_spread: number;           // floating: new spread over base; fixed: new all-in rate
  new_floor: number;            // floating rate floor after refi (ignored for fixed)
  prepayment_premium: number;   // one-time cash cost as % of the refinanced balance (e.g. 0.02 = 102%)
  extend_maturity_by: number;   // years added to the tranche maturity (clears the maturity wall)
}

export interface DebtTranche {
  name: string;
  tranche_type: 'senior' | 'mezzanine' | 'unitranche' | 'revolver' | 'pik_note';
  principal: number;
  interest_rate: number;
  rate_type: 'fixed' | 'floating';
  base_rate: number;
  /** Optional forward base-rate path (e.g. SOFR/EURIBOR) for floating tranches.
   *  Falls back to the scalar base_rate when absent. Index = hold year (0-based). */
  base_rate_by_year?: number[];
  spread: number;
  amortization_type: 'bullet' | 'straight_line' | 'cash_sweep' | 'PIK';
  amortization_schedule: number[];
  pik_rate: number;
  cash_interest: boolean;
  commitment_fee: number;
  /** Revolver facility size (£m). Drawn balance starts at `principal` (usually 0) and
   *  can be drawn up to this commitment. Falls back to `principal` when omitted. */
  commitment?: number;
  floor: number;
  cash_sweep_pct: number;
  /** Lower number = higher sweep priority. Tranches in the same tier receive pro-rata allocation. Defaults to array index when omitted. */
  sweep_priority?: number;
  /** PIK-toggle (P4-4): when true on a PIK tranche, the issuer elects PIK or cash pay each
   *  period via pik_election_by_year. Absent/false ⇒ always-PIK (unchanged). */
  pik_toggle?: boolean;
  /** Per-year PIK election for a pik_toggle tranche: true = accrue PIK, false = pay cash.
   *  Missing entries default to PIK (preserves always-PIK behaviour). */
  pik_election_by_year?: boolean[];
  /** Optional refinancing event (P4-3): reprices the tranche and books a prepayment premium
   *  from its year onward. Absent ⇒ no refinancing (unchanged). */
  refinancing?: RefinancingEvent;
  /** Original Issue Discount as a fraction of par (P4-14). Funded by extra equity at close,
   *  amortised as non-cash tax-deductible interest over debt_maturity_years. Absent ⇒ none. */
  oid_pct?: number;
  /** Maturity (years) over which OID amortises; falls back to the holding period. */
  debt_maturity_years?: number;
  /** 0-indexed hold year in which the tranche is drawn. Omitted/0 = drawn at entry. Used for add-on acquisition debt funded mid-hold. */
  draw_year_index?: number;
  /** Internal flag: tranche synthesised from add-on acquisition debt. Stripped/rebuilt on every recalc — never persisted or user-editable. */
  _synthetic_addon?: boolean;
}

export interface FeeStructure {
  entry_fee_pct: number;
  exit_fee_pct: number;
  monitoring_fee_annual: number;
  financing_fee_pct: number;
  transaction_costs: number;
  /** Monitoring-fee termination at exit (P4-11). The annual fee is dropped in the exit
   *  year (the agreement terminates on sale); if termination_years > 0, the NPV of that
   *  many remaining contractual years is accelerated into a one-time exit cost,
   *  discounted at monitoring_fee_discount_rate (default 10%). */
  monitoring_fee_termination_years?: number;
  monitoring_fee_discount_rate?: number;
}

export interface MIPRatchetTier {
  /** Total-return MOIC (pre-MIP) at or above which this tier's pool applies. */
  moic_threshold: number;
  /** Optional dual hurdle — pre-MIP equity IRR must also clear this to unlock the tier. */
  irr_threshold?: number;
  /** Management pool % of pre-MIP exit equity granted at this tier. */
  pool_pct: number;
}

export interface ManagementIncentive {
  mip_pool_pct: number;
  hurdle_moic: number;
  vesting_years: number;
  sweet_equity_pct: number;
  /** Optional ratchet schedule. When present (non-empty), the highest cleared tier's
   *  pool_pct overrides the single-hurdle mip_pool_pct / hurdle_moic. Absent ⇒ unchanged. */
  ratchet_tiers?: MIPRatchetTier[];
}

export interface RevenueAssumptions {
  base_revenue: number;
  growth_rates: number[];
  organic_growth: number[];
  /** Add-on (bolt-on) revenue per hold year, FULLY GROWN to that year. Derived: injected by
   *  `injectAddOns` from `add_on_acquisitions`. This is the add-on's own revenue path and is
   *  added ON TOP of the organic business — it must NOT be compounded into the organic growth
   *  base again (that double-counted it pre-Phase-0C). */
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
  /** Per-year NWC movements (£m) used when nwc_movement_method === 'explicit'. Falls back to pct_change when absent. */
  nwc_explicit_by_year?: number[];
  /** Days-based NWC (P4-9): when any is set, NWC = A/R + Inventory − A/P from first
   *  principles (A/R on revenue; Inventory/A/P on the cost base = revenue × (1 − EBITDA
   *  margin), since the model has no separate COGS line). Absent ⇒ nwc_pct_revenue. */
  nwc_dso?: number;   // days sales outstanding
  nwc_dio?: number;   // days inventory outstanding
  nwc_dpo?: number;   // days payable outstanding
}

export interface TaxAssumptions {
  tax_rate: number;
  tax_shield_on_interest: boolean;
  dtl_unwind_years: number;
  nol_carryforward: number;
  minimum_tax_rate: number;
  /** Post-2017 NOL usage cap as a fraction of taxable income computed *before* the NOL
   *  deduction. Default 0.80 — the TCJA limits post-2017 NOLs to 80% of taxable income.
   *  (Phase 0A) */
  nol_limitation_pct?: number;
  /** Pre-2017 NOLs are NOT subject to the 80% cap (they offset 100% of taxable income,
   *  but expire after 20 years). When true the 80% limitation is bypassed. Default false
   *  (treat the carryforward as post-2017). (Phase 0A) */
  nol_is_pre_2017?: boolean;
  /** Optional §382 ownership-change annual NOL-usage limit (absolute, deal currency £m).
   *  An LBO is itself an ownership change, capping annual use of acquired NOLs at roughly
   *  (equity value × long-term tax-exempt rate). Absent/0 ⇒ no §382 limit. (Phase 0A) */
  section_382_annual_limit?: number;
  /** §163(j) business-interest-expense limitation. When enabled, deductible interest is
   *  capped at section_163j_ati_pct × ATI and disallowed interest carries forward. Default
   *  false — preserves the unlimited-deduction behaviour of existing/saved models. (Phase 0A) */
  section_163j_enabled?: boolean;
  /** §163(j) cap as a fraction of ATI. Default 0.30 (30% of ATI). (Phase 0A) */
  section_163j_ati_pct?: number;
  /** ATI basis: 'ebit' (post-2022 — no depreciation/amortisation add-back, the default) or
   *  'ebitda' (pre-2022 — adds D&A back to the cap base). (Phase 0A) */
  section_163j_ati_basis?: 'ebit' | 'ebitda';
  /** Optional opening §163(j) disallowed-interest carryforward (deal currency £m). Default 0. (Phase 0A) */
  section_163j_carryforward?: number;
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
  /** EBITDA basis the entry multiple is applied to (Phase 0D). 'ltm' (default) values off the
   *  last-twelve-months base EBITDA; 'ntm' values off forward EBITDA = base × (1 + Y1 growth),
   *  so the same multiple implies a higher EV on a growing target. Leverage stays on LTM. */
  entry_ebitda_basis?: 'ltm' | 'ntm';
}

export interface PartialExitEvent {
  /** 1-indexed hold year of the partial realisation (must be < holding_period). */
  year: number;
  /** Fraction (0–1) of the sponsor's CURRENT remaining stake sold at this event. */
  pct_sold: number;
  /** EV/EBITDA applied to that year's EBITDA to value the stake. */
  exit_multiple: number;
  /** Advisory fee (% of the realised gross proceeds) on this tranche. */
  exit_fee_pct: number;
}

export interface ExitAssumptions {
  holding_period: number;
  exit_ebitda_multiple: number;
  exit_revenue_multiple: number;
  exit_method: 'strategic' | 'secondary_buyout' | 'ipo' | 'recapitalization';
  /** EBITDA basis the exit multiple is applied to (Phase 0D). 'ltm' (default) values off the
   *  final hold-year EBITDA; 'ntm' values off forward EBITDA = exit-year EBITDA × (1 + terminal
   *  growth), i.e. the buyer pays the multiple on next-twelve-months EBITDA. */
  exit_ebitda_basis?: 'ltm' | 'ntm';
  mid_year_convention: boolean;
  interim_distributions: number[];
  exit_ev_override: number | null;
  /** Optional interim partial realisations (IPO float / secondary selldown). When present,
   *  each event books a proceeds inflow at its year and reduces the residual stake sold at
   *  final exit. Absent/empty ⇒ a single full exit (unchanged). */
  partial_exits?: PartialExitEvent[];
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
  /** §163(j) business interest disallowed (and carried forward) this year, or — when the
   *  interest tax shield is switched off — the interest denied deduction. 0 by default. (Phase 0A) */
  disallowed_interest: number;
  /** One-time add-on integration cash cost expensed this year (Phase 0C). Deductible (reduces
   *  the tax base) and a cash outflow in FCF, but excluded from adjusted EBITDA. 0 by default. */
  integration_cost: number;
  net_income: number;
  nopat: number;
  maintenance_capex: number;
  growth_capex: number;
  total_capex: number;
  delta_nwc: number;
  /** Operating FCF before growth investment (P4-6): EBITDA − tax − maintenance capex − ΔNWC.
   *  Equals fcf_pre_debt + growth_capex. Surfaces the PE FCF bridge
   *  (EBITDA → less maint capex → operating FCF → less growth capex → total FCF pre-debt). */
  operating_fcf_pre_growth_capex: number;
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
  total_mandatory_amort_by_year: number[];   // Scheduled repayments only (excludes discretionary sweeps)
  total_interest_tax_shield_by_year: number[];
  ecf_by_year: number[];                     // Excess Cash Flow = FCF - mandatory amort - cash interest - commitment fees
  total_commitment_fees_by_year: number[];  // Sum of all commitment fees paid across tranches each year
  cash_balance_by_year: number[];            // Accumulated cash on balance sheet after each year's debt service (net of distributions)
  distributions_paid_by_year: number[];      // Interim distributions actually paid (capped at available cash)
  distribution_blocked_by_year: boolean[];   // True when a cash-trap / restricted-payment covenant blocked the year's distribution (P4-13)
  refinancing_premium_by_year: number[];     // One-time refinancing call/prepayment premium paid in cash each year (P4-3)
}

export interface Returns {
  irr: number | null;
  moic: number;
  dpi: number;
  rvpi: number;
  payback_years: number;
  irr_gross: number | null;
  irr_levered: number | null;
  irr_unlevered: number | null;
  irr_convergence_failed: boolean;
  debt_convergence_failed: boolean;          // True when debt/interest loop didn't converge
  entry_equity: number;
  exit_equity: number;
  exit_ev: number;
  exit_net_debt: number;
  mip_payout: number;
  total_distributions: number;
  dpi_by_year: number[];
  rvpi_by_year: number[];
  /** Realised sponsor equity cashflow stream [t0..hp]: −entry at t0, distributions +
   *  partial-exit proceeds during the hold, post-MIP residual at exit. Single source of
   *  truth for the equity IRR and the fund-level overlay (P4-2). */
  equity_cashflows: number[];
  /** Total follow-on sponsor equity deployed into add-on acquisitions over the hold
   *  (equity/mixed-funded bolt-ons). Part of the invested base for MOIC; booked as
   *  an outflow at each acquisition year in the IRR streams (D). 0 with no add-ons. */
  add_on_equity_invested: number;
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

// ── Fund-Level Returns (P4-2) ─────────────────────────────────────────────

export interface FundAssumptions {
  management_fee_pct: number;             // % of basis per annum
  management_fee_basis: 'committed' | 'invested';
  carry_rate: number;                     // GP carry, e.g. 0.20
  preferred_return: number;               // LP hurdle, e.g. 0.08
  carry_waterfall: 'american' | 'european';
  fund_size: number;                      // total LP commitments (deal currency, £m)
  deal_allocation_pct: number;            // this deal's share of the fund (0–1)
}

export interface FundReturns {
  net_irr: number | null;                 // LP IRR after mgmt fees + carry
  net_moic: number;                       // LP value / LP paid-in
  gross_irr: number | null;               // deal equity IRR (pre fund-level fees/carry)
  gross_moic: number;
  gross_to_net_spread: number | null;     // gross_irr − net_irr (pp)
  management_fees_total: number;          // cumulative mgmt fee borne by this deal
  carried_interest: number;               // GP carry taken
  preferred_return_shortfall: number;     // pref owed but unmet (0 when cleared)
  lp_paid_in: number;                     // invested capital + mgmt fees
  lp_distributions: number;               // total cash returned to LPs (post-carry)
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
  // Per-scenario credit analysis (P3-5) — answers "does it survive / breach in this case?"
  dscr_by_year?: number[];
  leverage_by_year?: number[];
  covenant_breach_year?: number | null;   // first breach year (1-indexed), null if none
  survives_hold?: boolean;                 // ECF ≥ 0 in every year
  // Per-scenario value-driver bridge (P3-6) — explains the IRR/MOIC delta vs base.
  value_drivers?: ValueDriverDecomposition;
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
  redlineData?: RedlineResult;
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
  credit_covenants: CreditCovenants;
  /** Optional fund-level (LP-facing) economics. When present, fullRecalc computes fund_returns. */
  fund_assumptions?: FundAssumptions;
  // New: segments and add-ons
  revenue_segments: RevenueSegment[];
  add_on_acquisitions: AddOnAcquisition[];
  // Computed outputs
  projections: { years: AnnualProjectionYear[] };
  debt_schedule: DebtScheduleResult;
  returns: Returns;
  fund_returns?: FundReturns;   // computed only when fund_assumptions is set (P4-2)
  value_drivers: ValueDriverDecomposition;
  sources_and_uses: SourcesAndUses;
  credit_analysis: CreditAnalysis;
  ebitda_bridge: EBITDABridge;
  balance_sheet: BalanceSheet;
  fragility: FragilityAnalysis;
  scenarios: ScenarioSet[];
  sensitivity_tables: SensitivityTable[];
  exit_reality_check: ExitRealityCheck;
  ai_overrides: Record<string, unknown>;
  ai_toggle_fields: string[];
  chat_history: ChatMessage[];
  // Transient: tracks which entry field was last edited for EV/Multiple sync
  _lastEditedEntryField?: 'multiple' | 'ev' | null;
  /** Transient (Phase 0C): add-on EBITDA contribution per hold year — each bolt-on's revenue at
   *  ITS OWN margin plus cost synergies. Injected by `injectAddOns`, consumed by the projection
   *  build so consolidated EBITDA blends the add-on margin instead of the parent's. Recomputed
   *  every recalc; never user-edited or persisted. */
  _addon_ebitda_by_year?: number[];
  /** Transient (Phase 0C): one-time add-on integration cash cost per hold year. Injected by
   *  `injectAddOns`, flowed into FCF and the tax base in the projection build. */
  _addon_integration_by_year?: number[];
}

export interface PendingEdit {
  field: string;       // dot-notation path
  oldValue: unknown;
  newValue: unknown;
  reason: string;      // AI's explanation
}

// ── Ceteris Paribus (Goal-Seek) ──────────────────────────────────────────

export interface CetparOption {
  paramName: string;
  paramPath: string;
  currentValue: number;
  requiredValue: number;
  achievedOutput: number;
  feasible: boolean;
  effortPct: number;
  rank: number;
  bestAchievableOutput?: number;
}

export interface CetparResult {
  targetOutputKey: string;
  targetOutputLabel: string;
  targetValue: number;
  options: CetparOption[];
  parseMessage: string;
}

// ── Redline (Assumptions Quality Review) ────────────────────────────────

export interface RedlineItem {
  fieldName: string;
  currentValue: string;
  rating: 'aggressive' | 'in-line' | 'conservative';
  reason: string;
}

export interface RedlineResult {
  items: RedlineItem[];
  overallAssessment: string;
  keyRisk: string;
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
  fccr: number;                    // (EBITDA - Capex - Tax) / (Cash Interest + Mandatory Scheduled Amort)
  interest_coverage: number;       // EBITDA / Cash Interest
  dscr: number;                    // FCF pre-debt / (Cash Interest + Mandatory Scheduled Amort)
  leverage: number;                // Gross Debt / EBITDA
  senior_leverage: number;         // Senior Debt / EBITDA
  total_debt: number;
  cumulative_debt_paydown: number;
  debt_paydown_pct: number;
  ecf: number;                     // Excess Cash Flow = FCF pre-debt - mandatory amort - cash interest
}

export interface CreditAnalysis {
  metrics_by_year: CreditMetricsYear[];
  max_debt_capacity_at_4x: number;
  max_debt_capacity_at_5x: number;
  max_debt_capacity_at_6x: number;
  covenant_headroom_by_year: number[];       // Leverage headroom = covenant_leverage - actual leverage
  dscr_headroom_by_year: number[];           // DSCR headroom = actual DSCR - covenant_dscr
  fccr_headroom_by_year: number[];           // FCCR headroom = actual FCCR - covenant_fccr
  insolvency_warning_by_year: boolean[];     // True when ECF < 0 (default risk)
  ecf_by_year: number[];                     // Excess Cash Flow per year
  refinancing_risk: boolean;
  refinancing_risk_detail: string;
  recovery_waterfall: { tranche: string; recovery_pct: number }[];
  /** Year-of-default recovery basis (P4-10): the hold year used (peak leverage) and the
   *  distressed EV recovered against. */
  recovery_default_year?: number;
  recovery_stress_ev?: number;
  /** Springing DSCR covenant (P4-8): true in any year the test is active (revolver
   *  utilisation > threshold) AND breached. */
  springing_breach_by_year?: boolean[];
  /** Indicative leverage-tier characterisation (entry leverage only). NOT a credit rating —
   *  does not account for coverage, industry, business quality, or jurisdiction. */
  leverage_assessment: string;
}

// ── Credit Covenants ─────────────────────────────────────────────────────

export interface CreditCovenants {
  leverage_covenant: number;   // Maximum net leverage (e.g., 6.0x) — fallback scalar
  dscr_covenant: number;       // Minimum DSCR (e.g., 1.25x) — fallback scalar
  fccr_covenant: number;       // Minimum FCCR (e.g., 1.15x) — fallback scalar
  // Optional per-year step schedules. When present, override the scalar for that year.
  // Real credit agreements tighten covenants over the hold (e.g., 6.5x → 5.0x).
  leverage_covenant_by_year?: number[];
  dscr_covenant_by_year?: number[];
  fccr_covenant_by_year?: number[];
  // Cash trap / restricted-payment block (P4-13). When set, interim distributions are
  // blocked in any year the trigger is hit. Absent ⇒ distributions never blocked.
  distribution_block_leverage?: number;   // block when leverage > this
  distribution_block_dscr?: number;       // block when DSCR < this
  // Springing covenant (P4-8): a DSCR test that only applies when revolver utilisation
  // exceeds the threshold. Absent ⇒ no springing test.
  springing_dscr_covenant?: number;
  springing_utilization_threshold?: number;  // e.g. 0.35 = drawn > 35% of commitment
  // Recovery haircuts (P4-10). Defaults: 40% EBITDA, 50% multiple, 10% distressed costs.
  recovery_ebitda_haircut?: number;
  recovery_multiple_haircut?: number;
  recovery_distressed_cost_pct?: number;
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
  /** Synergy ramp (P4-12): years over which revenue/cost synergies phase in linearly.
   *  Absent ⇒ full synergy from the year after acquisition (unchanged). */
  synergy_ramp_years?: number;
}

// ── Balance Sheet (three-statement close) ─────────────────────────────────

export interface BalanceSheetYear {
  year: number;
  // Assets
  cash: number;
  net_working_capital: number;       // single net NWC line (A/R + inventory − A/P); DSO/DIO/DPO split is a later phase
  net_ppe: number;                   // entry PP&E + cumulative capex − cumulative D&A
  deferred_financing_costs: number;  // capitalised financing fees, amortised over the hold
  goodwill: number;                  // purchase-accounting residual fixed at entry
  total_assets: number;
  // Liabilities
  total_debt: number;                // gross debt (incl. any add-on / PIK accretion)
  deferred_tax_liability: number;
  total_liabilities: number;
  // Equity
  shareholders_equity: number;       // entry equity + cumulative net income − distributions − financing cash costs
  total_liabilities_and_equity: number;
  // Integrity check
  balance_check: number;             // total_assets − total_liabilities_and_equity (≈ 0 when the model closes)
  is_balanced: boolean;
}

export interface BalanceSheet {
  years: BalanceSheetYear[];
  closes: boolean;          // every year within tolerance
  max_abs_check: number;    // largest |balance_check| across the hold
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
