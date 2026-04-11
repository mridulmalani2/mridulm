/**
 * AI Import Kit — downloadable input template + AI prompt.
 *
 * The template contains only the *input* fields that drive the LBO model.
 * All computed outputs (projections, returns, debt_schedule, credit_analysis, etc.)
 * are intentionally omitted; fullRecalc generates them on load.
 */

/** Pure-input snapshot of ModelState — a realistic B2B SaaS example (£100m revenue). */
export function getInputTemplate(): Record<string, unknown> {
  return {
    deal_name: "Acme Software Ltd",
    company_description: "B2B SaaS company providing workflow automation software to mid-market manufacturers. ARR-led with 85% subscription revenue, 110% net revenue retention.",
    sector: "Technology",
    currency: "GBP",

    revenue: {
      base_revenue: 100,
      growth_rates: [0.12, 0.10, 0.09, 0.08, 0.07],
      organic_growth: [0.12, 0.10, 0.09, 0.08, 0.07],
      acquisition_revenue: [0, 0, 0, 0, 0],
      churn_rate: 0.03,
    },

    margins: {
      base_ebitda_margin: 0.22,
      target_ebitda_margin: 0.27,
      margin_trajectory: "linear",
      margin_by_year: [],
      da_pct_revenue: 0.03,
      capex_pct_revenue: 0.03,
      growth_capex: [0, 0, 0, 0, 0],
      nwc_pct_revenue: 0.08,
      nwc_movement_method: "pct_change",
    },

    tax: {
      tax_rate: 0.25,
      tax_shield_on_interest: true,
      dtl_unwind_years: 0,
      nol_carryforward: 0,
      minimum_tax_rate: 0,
    },

    entry: {
      entry_ebitda_multiple: 11.5,
      net_debt_at_entry: 0,
      min_cash_balance: 5,
      leverage_ratio: 4.5,
    },

    debt_tranches: [
      {
        name: "Term Loan B",
        tranche_type: "senior",
        principal: 85,
        interest_rate: 0.075,
        rate_type: "floating",
        base_rate: 0.05,
        spread: 0.025,
        amortization_type: "bullet",
        amortization_schedule: [0, 0, 0, 0, 85],
        pik_rate: 0,
        cash_interest: true,
        commitment_fee: 0,
        floor: 0.01,
        cash_sweep_pct: 0.5,
      },
      {
        name: "Revolver",
        tranche_type: "revolver",
        principal: 20,
        interest_rate: 0.065,
        rate_type: "floating",
        base_rate: 0.05,
        spread: 0.015,
        amortization_type: "bullet",
        amortization_schedule: [0, 0, 0, 0, 0],
        pik_rate: 0,
        cash_interest: true,
        commitment_fee: 0.00375,
        floor: 0,
        cash_sweep_pct: 0,
      },
    ],

    fees: {
      entry_fee_pct: 0.02,
      exit_fee_pct: 0.015,
      monitoring_fee_annual: 0,
      financing_fee_pct: 0.02,
      transaction_costs: 2.5,
    },

    mip: {
      mip_pool_pct: 0.15,
      hurdle_moic: 2.0,
      vesting_years: 4,
      sweet_equity_pct: 0,
    },

    exit: {
      holding_period: 5,
      exit_ebitda_multiple: 12.0,
      exit_revenue_multiple: 0,
      exit_method: "secondary_buyout",
      mid_year_convention: false,
      interim_distributions: [0, 0, 0, 0, 0],
      exit_ev_override: null,
    },

    credit_covenants: {
      leverage_covenant: 6.0,
      dscr_covenant: 1.15,
      fccr_covenant: 1.10,
    },

    revenue_segments: [],
    add_on_acquisitions: [],
  };
}

/** Comprehensive AI prompt. Embed the template inline so the AI has a concrete schema to fill. */
export function getAiPrompt(): string {
  const templateJson = JSON.stringify(getInputTemplate(), null, 2);

  return `You are a financial data extraction assistant. Your task is to read raw deal data provided by the user — which may be a CIM, information memorandum, deal summary, news article, financial model, or any other source format — and output a single, valid JSON object that matches the LBO deal engine input structure below.

═══════════════════════════════════════════════════
CRITICAL OUTPUT RULES
═══════════════════════════════════════════════════
1. Output ONLY the JSON object. No markdown, no explanation, no surrounding text — just the raw JSON.
2. All percentages as decimals: 22% → 0.22, 7.5% → 0.075, 37.5bps → 0.00375.
3. All monetary values in millions of the target currency: £250m → 250, $1.2bn → 1200.
4. Array lengths for growth_rates, organic_growth, acquisition_revenue, growth_capex, interim_distributions, and each tranche's amortization_schedule MUST all equal holding_period (e.g., if holding_period is 5, each of these arrays must have exactly 5 elements).
5. Leave margin_by_year as an empty array []. The engine computes this from base_ebitda_margin, target_ebitda_margin, and margin_trajectory.
6. Do NOT include any computed output fields — no projections, returns, debt_schedule, sources_and_uses, credit_analysis, value_drivers, fragility, scenarios, sensitivity_tables, exit_reality_check, chat_history, or ai_overrides.
7. If a field is not stated in the source material, use the default value from the template at the bottom of this prompt.

═══════════════════════════════════════════════════
FIELD-BY-FIELD REFERENCE
═══════════════════════════════════════════════════

DEAL METADATA
  deal_name          Company name as it would appear on an IC memo.
  company_description  1–2 sentence summary of business model, sector, and revenue characteristics.
  sector             Must be exactly one of: Technology, Healthcare, Industrials, Consumer,
                     Financial Services, Real Estate, Energy, Business Services, Other
  currency           Must be exactly one of: GBP, USD, EUR, INR, JPY

REVENUE
  base_revenue       LTM (last twelve months) revenue in millions at acquisition date.
  growth_rates       Year-by-year total revenue growth rates (array, length = holding_period).
                     Example for 5-year hold: [0.12, 0.10, 0.09, 0.08, 0.07]
  organic_growth     Organic-only growth rates (array, same length). Equal to growth_rates
                     if no M&A growth is modelled.
  acquisition_revenue  Incremental revenue from add-on acquisitions per year (array, same length).
                     Use all zeros if no M&A acquisitions.
  churn_rate         Annual revenue or customer churn (decimal). Use 0 for non-subscription
                     businesses; typically 0.02–0.10 for SaaS.

MARGINS
  base_ebitda_margin   LTM EBITDA as a proportion of LTM revenue (decimal). E.g., 22% → 0.22.
  target_ebitda_margin EBITDA margin at exit (decimal). Usually higher than base due to operating
                       leverage, cost reduction, or mix shift.
  margin_trajectory  How margin expands between entry and exit:
                       "linear"      — equal step-up each year
                       "front_loaded" — 60% of expansion in first half of hold
                       "back_loaded"  — 60% of expansion in second half
                       "step"         — stays at base for first half, jumps to target in second half
  margin_by_year     Leave as [] — computed automatically.
  da_pct_revenue     D&A as a proportion of revenue (decimal). Typical 2–6%.
  capex_pct_revenue  Maintenance capex as a proportion of revenue (decimal). Typical 2–8%.
  growth_capex       Incremental growth/expansion capex per year in £m (array, length = holding_period).
                     Use all zeros if not separately specified.
  nwc_pct_revenue    Net Working Capital as a proportion of revenue (decimal). Typical 5–15%
                     for services, 15–25% for manufacturing/distribution.
  nwc_movement_method  "pct_change" — NWC moves proportionally to revenue growth (most common).
                       "explicit"   — use only if you have explicit NWC forecast figures.

TAX
  tax_rate           Statutory corporate income tax rate (decimal). E.g., UK 25% → 0.25.
  tax_shield_on_interest  true if interest expense is tax-deductible (standard). false for BEAT
                          or non-deductible structures.
  dtl_unwind_years   Deferred tax liability amortisation period in years. Use 0 if not specified.
  nol_carryforward   Net operating loss carryforward balance in £m. Use 0 if none.
  minimum_tax_rate   Minimum effective tax rate if subject to Pillar Two global minimum tax.
                     Use 0 if not applicable.

ENTRY
  entry_ebitda_multiple  EV / LTM EBITDA multiple paid at acquisition (e.g., 11.5 for 11.5×).
  net_debt_at_entry   Net debt (gross debt minus cash) on the target's balance sheet at closing,
                      in £m. Use 0 if a clean, debt-free balance sheet or unknown.
  min_cash_balance    Minimum operational cash the business must hold at all times, in £m.
                      Typically 1–10% of annual revenue.
  leverage_ratio      This is a reference field only. The engine back-calculates leverage from the
                      actual tranche principals you specify. You can leave this at 4.5 or set it
                      to the sponsor's target leverage (e.g., 4.5 for 4.5× EBITDA).

DEBT_TRANCHES  (array — include one object per tranche in the capital structure)
  name               Label (e.g. "Term Loan B", "Second Lien", "Mezzanine", "Revolver", "PIK Note").
  tranche_type       Must be one of: "senior", "mezzanine", "unitranche", "revolver", "pik_note"
  principal          Tranche size in £m (for a revolver, this is the committed facility limit).
  interest_rate      All-in annual interest rate (decimal). For floating rate tranches,
                     set this to base_rate + spread.
  rate_type          "fixed" or "floating"
  base_rate          Benchmark rate (SOFR, SONIA, EURIBOR — as decimal). Use 0 for fixed rate.
  spread             Credit spread over benchmark (decimal). Use 0 for fixed rate.
  amortization_type  "bullet"        — full principal repaid at exit
                     "straight_line" — equal annual repayments over hold period
                     "cash_sweep"    — excess cash flow sweeps applied to principal
                     "PIK"           — interest accrues to principal, paid at exit
  amortization_schedule  Year-by-year principal repayments in £m (array, length = holding_period).
                         Bullet: [0, 0, 0, 0, principal]. Straight-line: [p/n, p/n, ...].
                         The engine auto-fills this if all zeros and type is bullet or straight_line.
  pik_rate           PIK interest rate if the tranche has a PIK component (decimal). 0 for cash-pay.
  cash_interest      true if the tranche pays cash interest; false if fully PIK.
  commitment_fee     Annual fee on the UNDRAWN revolver balance (decimal). E.g., 37.5bps → 0.00375.
                     Use 0 for all non-revolver tranches.
  floor              Interest rate floor (decimal). E.g., 1% floor → 0.01. Use 0 if no floor.
  cash_sweep_pct     Proportion of excess cash flow applied to prepay this tranche (decimal).
                     E.g., 50% sweep → 0.5. Use 0 if no cash sweep on this tranche.

FEES
  entry_fee_pct      Sponsor advisory/deal fee as % of entry EV (decimal). Typical 1.5–2.5%.
  exit_fee_pct       Exit fee as % of exit EV (decimal). Typical 1–2%.
  monitoring_fee_annual  Annual monitoring / management fee charged to the company in £m.
                         Use 0 if none or included in entry_fee_pct.
  financing_fee_pct  Debt arrangement/financing fee as % of total debt raised (decimal).
                     Typical 1.5–2.5%.
  transaction_costs  One-time costs (legal, due diligence, accounting) in £m.

MIP — Management Incentive Plan
  mip_pool_pct       Total MIP pool as a proportion of exit equity proceeds (decimal).
                     Typical PE deals: 10–20%. E.g., 15% → 0.15.
  hurdle_moic        MOIC hurdle that must be exceeded before any MIP vests (e.g. 2.0 for 2×).
  vesting_years      Number of years over which the MIP vests (typically 3–5).
  sweet_equity_pct   Sweet / free-carry equity as % of total equity. Use 0 if no sweet equity.

EXIT
  holding_period     Investment hold period in years (integer, typically 3–7).
                     IMPORTANT: This controls all array lengths elsewhere in the model.
  exit_ebitda_multiple  EV / EBITDA multiple at exit.
  exit_revenue_multiple Use 0 — model defaults to EBITDA-based exit valuation.
  exit_method        One of: "secondary_buyout", "strategic", "ipo", "recapitalization"
  mid_year_convention  false (year-end cash flows, standard for PE).
                       true only if mid-year discounting is explicitly specified.
  interim_distributions  Dividend recaps or other equity distributions in £m per year
                          (array, length = holding_period). Use all zeros if none.
  exit_ev_override   Override the exit EV with a hardcoded value in £m. Use null to derive
                     exit EV from exit_ebitda_multiple × projected EBITDA (most common).

CREDIT COVENANTS
  leverage_covenant  Maximum permitted Net Debt / EBITDA (e.g. 6.0 for 6.0×).
  dscr_covenant      Minimum Debt Service Coverage Ratio (FCF / Debt Service). Typical: 1.10–1.25.
  fccr_covenant      Minimum Fixed Charge Coverage Ratio. Typical: 1.05–1.20.

revenue_segments     Leave as [] unless you have explicit segment-level revenue and margin data.
add_on_acquisitions  Leave as [] unless the deal specifically models bolt-on acquisitions with
                     known timing, size, and purchase price.

═══════════════════════════════════════════════════
TEMPLATE JSON — Fill this with the actual deal's values
═══════════════════════════════════════════════════

${templateJson}
`;
}
