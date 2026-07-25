/**
 * engine2 — the typed input/output contract (SPEC.md is the governing document; every
 * field annotation cites its SPEC section).
 *
 * THE STRUCTURAL RULE (master plan Part 2): facts, assumptions, and outputs are separate
 * types. A fact the filing lacks is MISSING at the extraction layer — it never arrives here
 * as a default. An assumption always carries a basis badge in the UI layer. A derived value
 * exists only on ModelOutput and is never editable.
 *
 * Units: money in MILLIONS of `currency`, float64, no intermediate rounding (SPEC §15).
 * Rates and percentages are DECIMAL FRACTIONS (0.0475 = 4.75%).
 *
 * ARRAY INDEXING (two families — SPEC §16):
 *  - Per-YEAR series (operating, tax, tranches[t], revolver, waterfall, credit, and every
 *    per-year assumption array): length = hold_years, index i = hold year i+1.
 *  - t0-ANCHORED series (balance_sheet, ReturnStreams.cashflows): length = hold_years + 1,
 *    index 0 = close (t=0); balance_sheet[i+1] is the year-end BS matching operating[i].
 *
 * No imports from lib/engine — enforced by tests/engine2-boundary.test.ts.
 */

// ── Class A: facts ────────────────────────────────────────────────────────────

export type Engine2Currency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'INR';

/** One historical fiscal year (Phase D populates; engine consumes only fy0). */
export interface HistoricalYear {
  fiscal_year: number;
  period_end: string; // ISO date — period identity is END DATE, never fy/fp (PHASE_D D1)
  revenue: number | null;
  ebitda: number | null;
  capex: number | null;
  operating_nwc: number | null;
}

/**
 * Factual inputs at close. `fy_*` is the ENGINE-CONTRACT name (retained for stability, DIFF_LEDGER
 * L-11/C-6); it holds the §1.1 SIZING BASIS — the LTM quarter-stitch when interim filings allow,
 * else the latest fiscal year — carried WITH its basis. NEVER infer the basis from the `fy_` name;
 * read `sizing_basis`/`provenance` (the exact mislabel L-11 exists to prevent). [G-2]
 */
export interface DealFacts {
  entity_name: string;
  source: 'edgar' | 'esef' | 'manual';
  sector: string;
  currency: Engine2Currency;
  fiscal_year: number;
  period_end: string;

  fy_revenue: number;
  fy_ebitda: number;
  /** = fy_ebitda / fy_revenue; carried for display, engine recomputes nothing from it. */
  fy_ebitda_margin: number;

  /** §1.1 sizing basis: 'LTM' when the quarter-stitch succeeded, else 'FY'. Default 'FY' (manual). */
  sizing_basis?: 'FY' | 'LTM';
  /** As-of date of the sizing figures (LTM anchor `e`, or the FY period end). The UI derives the
   *  staleness tier (fresh/aging/stale) from this vs now — `lib/format.stalenessTier`. */
  sizing_as_of?: string;
  da_pct_revenue: number;
  maint_capex_pct_revenue: number;
  /** Opening net PP&E seed for the BS roll (SPEC §8); null ⇒ seed 0 + disclosed note. */
  net_ppe: number | null;

  /** Operating NWC (excludes cash & debt — PHASE_D D2; the old CA−CL figure is banned). */
  operating_nwc: number | null;
  nwc_pct_revenue: number | null;
  /** Actual days from filing components; null when un-derivable (gated, PHASE_D D2). */
  dso: number | null;
  dio: number | null;
  dpo: number | null;

  gross_debt: number;
  cash: number;
  net_debt: number;
  effective_tax_rate: number;
  /** Extracted NOL is a FLOOR (companyfacts is non-dimensional — PHASE_D D6). */
  nol_carryforward_floor: number | null;

  /** Sanity anchors (null when suppressed by plausibility gates — PHASE_D D4/D5). */
  implied_cost_of_debt: number | null;
  implied_trading_ev_ebitda: number | null;

  history: HistoricalYear[];
}

// ── Class B: assumptions ─────────────────────────────────────────────────────

/** Sizing single-driver rule enforced structurally (never-optionals XOR — SPEC §16). */
export type TrancheSize =
  | { x_ebitda: number; amount?: never }
  | { amount: number; x_ebitda?: never };

export type TranchePricing =
  | { kind: 'fixed'; rate: number }
  /** all-in = max(base, floor) + spread — floor applies to the BASE (SPEC §4, DR-1). */
  | { kind: 'floating'; base_rate: number; spread: number; floor: number };

interface TermTrancheCommon {
  name: string;
  size: TrancheSize;
  /** Mandatory amortization: % of ORIGINAL FACE per year, capped at outstanding (SPEC §3.3, invariant §14.15). */
  amort_pct_of_face: number;
  maturity_years: number;
  /** OID as % of par; funded at close in uses; amortization is §163(j)-capped interest (SPEC §2/§6/§7). */
  oid_pct: number;
  sweep: { participates: boolean; priority: number };
}

/** Cash-pay term tranche. */
export interface CashPayTrancheAssumption extends TermTrancheCommon {
  type: 'senior' | 'unitranche' | 'mezzanine';
  pricing: TranchePricing;
}

/** Fixed-rate PIK note: cash coupon (may be 0) + PIK accrual on beginning balance (SPEC §4). */
export interface PikNoteAssumption extends TermTrancheCommon {
  type: 'pik_note';
  cash_coupon: number;
  pik_coupon: number;
}

export type TermTrancheAssumption = CashPayTrancheAssumption | PikNoteAssumption;

/** At most ONE revolver per deal (SPEC §16). */
export interface RevolverAssumption {
  name: string;
  type: 'revolver';
  commitment: TrancheSize;
  pricing: TranchePricing; // interest on beginning DRAWN balance (SPEC §4)
  commitment_fee: number; // on undrawn; in DSCR service; UNCAPPED tax deduction (SPEC §4/§6/§11)
  /** Financing-fee amortization horizon for the revolver's fee share (SPEC §7). */
  maturity_years: number;
  /** v1: 0 — min cash is funded via the cash-to-BS use line (SPEC §2). */
  drawn_at_close: number;
}

export type TrancheAssumption = TermTrancheAssumption | RevolverAssumption;

export interface SweepAssumption {
  /** ECF-pool percentage: sweepable = pct × max(0, cash − min_cash) after steps 1–4 (SPEC §3.5). */
  base_pct: number;
  /**
   * Optional leverage step-down grid. Semantics (SPEC §3.5): tier selected by
   * BEGINNING-of-year net leverage = (opening gross debt − opening cash) / EBITDA_adj[t]
   * (no dependence on the current year's sweep — §5 no-solver). Entries sorted descending;
   * first entry whose `above_net_leverage` is exceeded wins; below all thresholds
   * `else_pct` applies. When grid is set, base_pct is IGNORED.
   */
  grid: { tiers: { above_net_leverage: number; pct: number }[]; else_pct: number } | null;
}

export interface OperationsAssumption {
  /** One growth number per year (churn folded in — SPEC §7). Under NTM exit basis, growth[hold_years−1] is the year-N+1 proxy (SPEC §9). */
  growth: number[];
  target_margin: number;
  /** margin[t] = base + (target − base) × w(t)/w(N); linear: w(t)=t (year 1 takes the first step — SPEC §7). */
  margin_path: 'linear' | 'front_loaded' | 'back_loaded';
  da_pct_revenue: number;
  maint_capex_pct_revenue: number;
  growth_capex: number[];
  nwc:
    | { method: 'days'; dso: number; dio: number; dpo: number } // formulas in SPEC §7 (365 basis, COGS proxy)
    | { method: 'pct'; pct_revenue: number };
}

export interface TaxAssumption {
  rate: number;
  /** false = BEAT-style: interest permanently non-deductible; no carryforward accrues (SPEC §6.1). */
  interest_deductible: boolean;
  s163j: {
    /** false = small-business exception: capped pool fully deductible (SPEC §6.1). */
    applies: boolean;
    /** EBITDA default post-OBBBA (= EBITDA_adj basis); EBIT toggle = EBITDA_adj − D&A (SPEC §6). */
    ati_basis: 'ebitda' | 'ebit';
    ati_pct: number;
    /** v1: the carryforward is POST-CLOSE ONLY (opening = 0); acquired 163(j) carryforwards are out of scope (SPEC §6.1). */
  };
  nol: {
    /** Acquired (pre-change) NOL pool — subject to §382 and the layer cap (SPEC §6.3). */
    acquired_opening: number;
    /** Default FALSE — acquired NOLs rarely survive sponsor structures (SPEC §6.3, C-18). */
    acquired_usable: boolean;
    /** Governs the acquired layer's cap: pre-2018 ⇒ 100%, else 80%. Post-close pool is always 80% (derived; no independent limit_pct field). */
    arose_pre_2018: boolean;
    /** Suggested = target pre-change equity value × LTTER (= EV in a cash-free/debt-free deal); null = no limit (SPEC §6.3). */
    s382_annual_limit: number | null;
  };
  /** Floor: cash tax ≥ min_rate × PRE-NOL taxable base (SPEC §6.4). 0 = off. */
  minimum_rate: number;
}

export interface FeesAssumption {
  transaction_pct_of_ev: number;
  /** Base = TOTAL commitments including undrawn revolver (SPEC §2, DR-2 flag); amortization allocated pro-rata by commitment over each tranche's maturity (SPEC §7). */
  financing_pct_of_commitments: number;
  /** null = OFF (the suggested default). Annual fee dropped in the exit year — replaced by the termination payment (SPEC §9). */
  monitoring: { annual: number; termination_years: number; discount_rate: number } | null;
}

export interface CovenantAssumption {
  /** Scalar or per-year step-down schedule; null = not tested (cov-lite). */
  leverage_max: number | number[] | null;
  dscr_min: number | number[] | null;
  fccr_min: number | number[] | null;
  /** Springing leverage test: applies only in years where drawn/commitment > trigger (SPEC §11). */
  springing: { metric: 'leverage'; max: number | number[]; revolver_draw_trigger_pct: number } | null;
  /**
   * Restricted-payment cash trap (SPEC §3.7 [v1.1.0]). null = no trap — rp_max is +∞ and
   * only §3 step 7's two CASH caps bind. `'dscr'` is rejected in v1 (its numerator is the
   * year's own FCF, which the payment does not change — a vacuous pro-forma test).
   */
  rp_trap: { metric: 'net_leverage'; level: number } | null;
}

export interface DealAssumptions {
  deal_name: string;
  entry: {
    /** Single-driver rule: the other is derived, read-only (Class C). */
    driver: 'multiple' | 'ev';
    entry_multiple: number | null;
    enterprise_value: number | null;
    /** Valuation basis; leverage sizing & covenants ALWAYS use FY EBITDA (SPEC §11, C-14). */
    basis: 'fy' | 'ntm';
    hold_years: number;
  };
  structure: {
    tranches: TrancheAssumption[]; // at most one revolver
    min_cash: number; // funded at close via cash-to-BS (SPEC §2, C-9)
    sweep: SweepAssumption;
    /**
     * Per-year REQUESTED interim distributions in $m (SPEC §3 step 7 [v1.1.0]); length
     * hold_years, entries ≥ 0 (structural gate). null ≡ all-zero ≡ feature OFF, so every
     * pre-v1.1.0 deal is byte-identical to before. What is actually PAID is
     * `WaterfallYear.distribution_paid` — clipped by the two cash caps and the §3.7 trap;
     * blocked capacity never accrues.
     */
    distributions: number[] | null;
  };
  operations: OperationsAssumption;
  tax: TaxAssumption;
  fees: FeesAssumption;
  /** Netted from the sponsor check; pari-passu common at exit (SPEC §9, C-5). */
  rollover_equity: number;
  exit: { multiple: number; basis: 'fy' | 'ntm'; fees_pct: number };
  /** null = no promote. Promote pool only — sweet equity is a different instrument (SPEC §10). */
  mip: { pool_pct: number; hurdle_moic: number } | null;
  covenants: CovenantAssumption;
  /**
   * Display-only IRR option (SPEC §1): interim flows at t−0.5; t=0 and the EXIT flow never
   * shift. Scoped to the SPONSOR-SIDE streams. Numerically inert while the distribution
   * schedule is empty — that is when no interim sponsor flow exists [v1.1.1]. Selects which
   * of `irr` / `irr_mid_year` the UI headlines; both are always computed.
   */
  mid_year_irr: boolean;
}

// ── Output (Class C lives here — derived, never editable) ───────────────────

export interface OperatingYear {
  revenue: number;
  ebitda: number; // = revenue × margin (SPEC §7)
  ebitda_adj: number; // − monitoring fee (annual fee dropped in exit year — SPEC §9)
  margin: number;
  da: number;
  ebit: number;
  maint_capex: number;
  growth_capex: number;
  nwc_balance: number;
  delta_nwc: number;
  oid_amortization: number; // §163(j)-capped interest (SPEC §6/§7)
  financing_fee_amortization: number; // UNCAPPED ordinary deduction (SPEC §6/§7)
  /** = ebitda_adj − tax[i].cash_tax − capex − ΔNWC (SPEC §7); cash tax single-sourced from tax[i]. */
  fcf_pre_debt: number;
}

export interface TaxYear {
  ati: number;
  capped_interest_pool: number; // cash interest + PIK + OID amortization (SPEC §6.1)
  uncapped_deductions: number; // financing-fee amortization + commitment fees + exit write-off (SPEC §6.2)
  deductible_capped_interest: number;
  s163j_disallowed_added: number;
  s163j_carryforward_end: number;
  taxable_before_nol: number;
  acquired_nol_used: number;
  postclose_nol_used: number;
  nol_banked: number; // loss years bank into the post-close pool (SPEC §6.3)
  acquired_nol_end: number;
  postclose_nol_end: number;
  regular_tax: number;
  minimum_tax: number; // min_rate × pre-NOL base; NOL usage consumed in full even when the floor binds (SPEC §6.4)
  cash_tax: number;
}

/** Term tranches only — the revolver has its own schedule (below). */
export interface TrancheYear {
  name: string;
  beginning_balance: number;
  cash_interest: number; // beginning balance × all-in (SPEC §4)
  pik_accrual: number;
  mandatory_amort: number; // % of original face, capped (SPEC §3.3)
  sweep_repayment: number;
  ending_balance: number;
}

export interface RevolverYear {
  beginning_drawn: number;
  cash_interest: number; // on beginning drawn balance (SPEC §4)
  commitment_fee: number; // on undrawn commitment
  repayment: number; // step 4 (SPEC §3)
  draw: number; // step 6 (SPEC §3)
  ending_drawn: number;
  undrawn_commitment: number;
}

export interface WaterfallYear {
  opening_cash: number;
  fcf_pre_debt: number;
  cash_interest_total: number; // ≡ Σ tranche + revolver rows (mirror invariant §14.16)
  commitment_fees: number;
  mandatory_amort_total: number;
  revolver_repayment: number;
  sweep_pool: number; // max(0, cash − min_cash) at step 5 (SPEC §3)
  sweep_pct_applied: number;
  sweep_applied_total: number;
  revolver_draw: number;
  // ── §3 step 7 / §3.7 [v1.1.0] — interim distribution, AFTER the step-6 draw ──
  /** `structure.distributions[t]` (0 when the schedule is null). */
  distribution_requested: number;
  /**
   * §3.7 trap capacity: max(0, cash − (gross_debt_end − L × EBITDA_adj[t])). null = trap
   * OFF (+∞ — N/A, never a sentinel §11/§15). NORMATIVE for all EBITDA_adj incl. ≤ 0.
   */
  rp_max: number | null;
  /** max(0, min(requested, cash − min_cash, rp_max)) — never revolver-funded. */
  distribution_paid: number;
  /** §3.7: rp_max < min(requested, max(0, cash − min_cash)); ties ⇒ false. */
  distribution_blocked: boolean;
  closing_cash: number;
  cash_floor_breach: boolean; // invariant §14.4/§14.6
}

export interface BalanceSheetYear {
  cash: number;
  operating_nwc: number;
  /** Rolls mechanically: ppe[t] = ppe[t−1] + capex[t] − da[t]; may go negative → coherence warn (SPEC §8). */
  ppe: number;
  deferred_financing_costs: number; // incl. unamortized OID (SPEC §8)
  goodwill: number;
  total_assets: number;
  debt_at_par: number; // incl. accrued PIK; drawn revolver included
  equity: number;
  check: number; // |check| < 0.005 — merge-blocking invariant §14.2
}

export interface CreditYear {
  net_leverage: number | null; // null = N/A (rendered with reason; sentinels banned, SPEC §11)
  senior_net_leverage: number | null;
  icr: number | null;
  fccr: number | null;
  dscr: number | null; // scheduled service only — sweeps never in the denominator
  leverage_headroom: number | null; // signed; breach = negative
  dscr_headroom: number | null;
  fccr_headroom: number | null;
  springing_test_active: boolean;
  fcf_conversion: number | null; // FCF / EBITDA_adj (SPEC §11, DR-5)
  cumulative_paydown_pct_of_entry_debt: number | null; // null when entry debt = 0
}

export interface SourcesUses {
  enterprise_value: number; // ≡ derived.enterprise_value (mirror invariant §14.16)
  transaction_costs: number;
  financing_fees: number;
  oid_funded: number;
  cash_to_balance_sheet: number;
  total_uses: number;
  debt_at_par: { name: string; amount: number }[];
  rollover_equity: number;
  sponsor_equity: number; // the plug (SPEC §2)
  total_sources: number;
}

export interface ExitBlock {
  exit_ebitda_basis_value: number;
  exit_ev: number;
  debt_payoff_at_par_plus_pik: number; // SPEC §9 / C-8
  cash_at_exit: number; // = waterfall[N−1].closing_cash
  exit_fees: number; // = fees_pct × exit EV (SPEC §9)
  monitoring_termination: number;
  unamortized_fees_written_off: number; // non-cash; UNCAPPED year-N tax deduction (SPEC §6.2/§9)
  /** = exit_ev − payoff + cash_at_exit − exit_fees − monitoring_termination (SPEC §9). */
  exit_equity_pre_mip_total: number;
  mip_payout: number;
  /** sponsor_share + rollover_share + mip_payout ≡ exit_equity_pre_mip_total; sponsor_share ≡ final sponsor_net cashflow (§14.16). */
  sponsor_share: number;
  rollover_share: number;
}

/**
 * The three locked return series (SPEC §9); cashflows are t0-anchored (length N+1).
 * `irr` is ALWAYS the period-end convention. `irr_mid_year` is the §1 display alternative
 * (interim flows at t−0.5; t=0 and the EXIT flow never shift) and exists only on the
 * SPONSOR-SIDE streams — the unlevered stream always uses period-end times (§1 [v1.1.1]).
 * Both are carried so the UI can disclose the timing effect rather than silently swap a
 * headline number; the `mid_year_irr` assumption selects which one is headlined.
 */
export interface ReturnStreams {
  sponsor_net: { irr: number | null; irr_mid_year: number | null; moic: number | null; cashflows: number[] };
  unlevered: { irr: number | null; moic: number | null; cashflows: number[] };
  pre_promote: { irr: number | null; irr_mid_year: number | null; moic: number | null; cashflows: number[] };
  /**
   * §9 [v1.1.0] DPI[t] = cumulative SPONSOR-share distributions through t ÷ the sponsor's
   * t=0 check. Monotone non-decreasing (§14.18). Length hold_years (NOT t0-anchored).
   */
  dpi: number[];
  /**
   * §9 [v1.1.0] the first year (1-indexed) cumulative distributions ALONE reach the
   * sponsor outflow; null = never reached inside the hold. Exit proceeds do NOT count —
   * that is what made the old headline degenerate (ledger L-10).
   */
  payback_year: number | null;
}

export interface ValueBridge {
  entry_equity_pre_promote_total: number;
  /** M₀ × ΔB (SPEC §12 [v1.0.3] — bars decompose the frictionless EV − ND delta). */
  ebitda_growth_at_entry_multiple: number;
  /** ΔM × B₀ — the rigorous-school multiple bar; the cross term is NOT folded in
   *  (renamed from `multiple_change_on_exit_ebitda`, which named the rejected form). */
  multiple_change_bar: number;
  /** ND₀ − ND₁ (ND₀ = par − funded min cash; ND₁ = payoff − closing cash). */
  net_debt_paydown: number;
  interaction: number; // ΔM × ΔB — explicit bar (SPEC §12)
  exit_equity_pre_promote_total: number;
  /**
   * Walk-down from the bar sum to sponsor net (SPEC §12 [v1.0.3]): − entry costs
   * (transaction + financing fees + OID) − exit costs (exit advisory fees + monitoring
   * termination) − MIP − rollover Δ (rollover exit share − contributed).
   * `monitoring_leakage` is a MEMO of the ANNUAL drag only (Σ annual fees, per §12
   * "the annual drag shown as a memo from gp_fee_income") — it is NOT a subtraction:
   * the annual drag reaches the bridge through cash inside the paydown bar, and the
   * termination component sits inside `exit_costs`. [Doc corrected — C8/C9 review.]
   */
  walkdown: {
    entry_costs: number;
    exit_costs: number;
    monitoring_leakage: number;
    mip: number;
    rollover_delta: number;
    /**
     * §12 [v1.1.0] "+ interim distributions (sponsor share)" — cumulative SPONSOR-share
     * payments, ADDED back. They left via cash, so they already shrank the paydown bar;
     * the rollover's slice is deliberately NOT added back (it is not sponsor money and it
     * exits through the same smaller bar). 0 whenever the schedule is empty.
     */
    interim_distributions_sponsor: number;
    /**
     * §12 [v1.1.0] the sponsor-net TOTAL delta: sponsor_share + cumulative sponsor-share
     * distributions − sponsor equity. Degenerates to the pre-v1.1.0 exit-only delta when
     * no distribution is paid.
     */
    sponsor_net_delta: number;
  };
  reconciliation_residual: number; // must be ~0 — invariant §14.9 (both identities)
}

export interface CoherenceFlag {
  code:
    | 'covenant_breach_base_case'
    | 'entry_multiple_vs_trading'
    | 'basis_mismatch'
    | 'implausible_days'
    | 'ppe_seeded_at_zero'
    | 'cash_floor_breach'
    | 'negative_ppe'
    | 'negative_goodwill'
    | 'negative_sponsor_equity'
    /** §3.7: the RP trap clipped a distribution cash alone would have allowed. */
    | 'distribution_blocked';
  severity: 'block' | 'warn';
  message: string;
}

/**
 * A scenario = field-level delta-set merged onto base assumptions; post-close operating
 * fields + exit MULTIPLE only — entry EV/debt/equity and exit basis/fees FROZEN at base
 * close (SPEC §13 — closes live bug L-1). Merge is field-level: only the named fields
 * change; growth/growth_capex arrays replace whole.
 */
export interface ScenarioDeltas {
  operations?: Partial<
    Pick<
      OperationsAssumption,
      'growth' | 'target_margin' | 'margin_path' | 'growth_capex' | 'maint_capex_pct_revenue' | 'da_pct_revenue' | 'nwc'
    >
  >;
  exit_multiple?: number;
}

export interface ScenarioResult {
  name: string;
  deltas: ScenarioDeltas;
  returns: ReturnStreams;
  credit: CreditYear[];
  /**
   * Slim waterfall for the DR-5 credit dashboard (sweep/revolver behavior per §13), plus
   * distributions paid/blocked per year [v1.1.0] — a downside that traps the sponsor's
   * distributions is precisely what the credit dashboard exists to show.
   */
  waterfall: Pick<
    WaterfallYear,
    | 'revolver_draw' | 'revolver_repayment' | 'sweep_applied_total' | 'closing_cash'
    | 'cash_floor_breach' | 'distribution_paid' | 'distribution_blocked'
  >[];
  covenant_breach_year: number | null;
  /** Sponsor-net IRR delta vs base. */
  irr_delta_vs_base: number | null;
}

export type SensitivityAxis =
  | 'entry_multiple' // entry-side: re-prices entry (SPEC §13)
  | 'leverage' // entry-side
  | 'exit_multiple' // operating-side: entry frozen
  | 'growth' // operating-side
  | 'margin'; // operating-side

/** irr/moic are the SPONSOR-NET stream; base cell must equal the base run (§14.7). */
export interface SensitivityGrid {
  row_axis: SensitivityAxis;
  col_axis: SensitivityAxis;
  row_values: number[];
  col_values: number[];
  base_row_index: number; // row_values[base_row_index] = the base assumption value
  base_col_index: number;
  irr: (number | null)[][];
  moic: (number | null)[][];
}

export interface ModelOutput {
  facts: DealFacts;
  assumptions: DealAssumptions;
  derived: {
    enterprise_value: number;
    entry_multiple: number;
    entry_ebitda_for_sizing: number; // the §1.1 FY(LTM) sizing basis — FY, or the LTM stitch when interim filings allow (§11; read facts.sizing_basis, never the "fy_" name) [G-2/M2]
    total_debt_at_par: number;
    sponsor_equity: number;
    /**
     * §11 [v1.1.2] GROSS: total debt at PAR ÷ FY EBITDA — the quoted term-sheet number and
     * the basis §17 sizes tranches on. NOT netted against the funded min-cash (§2 does put
     * it on the t=0 BS, so the §11 net figure would be (par − min_cash) ÷ EBITDA — a
     * genuinely different number). Renamed from `entry_net_leverage_fy`, which named a
     * definition the value never had. ModelOutput carries NO entry-date NET leverage:
     * `credit[].net_leverage` is net from year 1 onward, so any surface showing both must
     * label the bases explicitly or it overstates deleveraging.
     */
    entry_gross_leverage_fy: number;
  };
  sources_uses: SourcesUses;
  operating: OperatingYear[];
  tax: TaxYear[];
  tranches: TrancheYear[][]; // TERM tranches only, [tranche][year]
  revolver: RevolverYear[] | null; // null when no revolver in the structure
  waterfall: WaterfallYear[];
  balance_sheet: BalanceSheetYear[]; // t0-anchored: length hold_years + 1
  credit: CreditYear[];
  exit: ExitBlock;
  returns: ReturnStreams;
  /** GP fee income memo — never silently dropped (SPEC §9); null when monitoring is null. */
  gp_fee_income: { annual: number[]; termination: number; total: number } | null;
  bridge: ValueBridge;
  coherence: CoherenceFlag[];
  scenarios: ScenarioResult[] | null;
  sensitivity: SensitivityGrid[] | null;
}
