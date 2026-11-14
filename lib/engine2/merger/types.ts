/**
 * lib/engine2/merger/types.ts — the merger model's contracts (SPEC §29).
 *
 * A public acquirer buys a public target. The output is laid out in five blocks, each a column of
 * years: acquirer standalone, target as acquired, their sum, the transaction impact, and the
 * combined company. The law of the layout: sum = acquirer + target and combined = sum + impact for
 * every flow and stock line; ratios are recomputed inside each block, never added.
 *
 * SIGN CONVENTION (§29.1): unlike the LBO side, every merger amount is SIGNED as it appears in a
 * statement: income positive, costs negative; cash in positive, cash out negative. That makes the
 * five-block law a plain element-wise sum for every line, with no per-line sign table to get wrong.
 *
 * Units: millions of the deal currency; shares in millions; per-share figures in currency units.
 * Year index 0 is the last actual year shown "as if combined" (pro forma); 1..N are forecasts.
 */
import type { Engine2Currency } from '../types';

export type MergerBlock = 'acquirer' | 'target' | 'sum' | 'impact' | 'combined';
export const MERGER_BLOCKS: readonly MergerBlock[] = ['acquirer', 'target', 'sum', 'impact', 'combined'];

/** One company's last actual year, after cleaning. Signed (see header). */
export interface CompanyYear0 {
  revenue: number;
  ebitda: number;
  da: number;
  net_interest: number;
  nci: number;
  other_cash_items: number;
  delta_nwc: number;
  capex: number;
  other_items: number;
  dividends: number;
  nci_dividends: number;
  /** Bank debt outstanding at the end of year 0. */
  debt: number;
  /** Cash at the START of year 0 (the cash roll begins here). */
  opening_cash: number;
}

export interface MergerSide {
  entity_name: string;
  currency: Engine2Currency;
  /** The last actual fiscal year (year 0). */
  fiscal_year: number;
  year0: CompanyYear0;
  /** Shares outstanding, millions. Required for the acquirer. */
  shares: number | null;
  share_price: number | null;
  /** Net debt at the deal date, after cleaning. Required for the target (it bridges EV and equity). */
  net_debt: number | null;
  /** §29.11: dilutive securities (the target's); empty when none were entered. */
  securities: DilutiveSecurity[];
  /** §29.11: the dilutive increment the filing reports (measured at the average market price). */
  reported_dilutive_increment: number | null;
  /** §29.14: the balance sheet at the end of year 0, needed for purchase accounting. */
  balance: SideBalance | null;
}

export type DilutiveSecurity =
  | { kind: 'option'; count: number; strike: number }
  | { kind: 'rsu'; count: number }
  | { kind: 'convertible'; principal: number; conversion_price: number };

/** End of year 0. Positive magnitudes as on a balance sheet; debt is `year0.debt`. It must tie:
 *  cash + nwc + fixed_assets + goodwill + other_net_assets = debt + dtl + equity_parent + nci_equity. */
export interface SideBalance {
  cash: number;
  nwc: number;
  /** Net PP&E plus book intangibles other than goodwill. */
  fixed_assets: number;
  goodwill: number;
  /** Everything else, net (may be negative). */
  other_net_assets: number;
  /** Net deferred tax liability (negative = a net asset). */
  deferred_tax_liability: number;
  equity_parent: number;
  nci_equity: number;
}

/** §29.13: one acquisition debt tranche. Sizes and repayments are positive magnitudes. */
export interface MergerTranche {
  name: string;
  /** null: the plug (plug = 'debt') or the tranche sized to the leverage cap. */
  amount: number | null;
  rate: number;
  /** Scheduled repayment in each forecast year (length N), capped at the outstanding. */
  repayment: number[];
  fee_pct: number;
  fee_years: number;
  sweep: boolean;
}

/** §29.14: purchase accounting. */
export interface PurchaseAccounting {
  structure: 'stock_purchase' | 'asset_purchase';
  ppe_writeup: number;
  ppe_life_years: number;
  /** life_years null = indefinite (not amortised). */
  intangibles: { name: string; amount: number; life_years: number | null }[];
  writeoff_existing_goodwill: boolean;
  /** Uplift of assumed target debt to fair value (positive = marked up); amortised over debt_fv_years. */
  debt_fair_value_adjustment: number;
  debt_fv_years: number;
  /** Asset purchase only: years over which goodwill and indefinite intangibles are amortised for tax. */
  tax_goodwill_life_years: number | null;
}

export interface MergerFacts {
  acquirer: MergerSide;
  target: MergerSide;
}

/** A company's standalone forecast for years 1..N. Every array has length N. */
export interface StandaloneForecast {
  revenue_growth: number[];
  ebitda_margin: number[];
  /** Signed (negative). */
  da: number[];
  net_interest: number[];
  /** One rate, applied to every year including year 0. */
  tax_rate: number;
  nci: number[];
  /** Minority dividends as a share of minority income (both negative, so the ratio is positive). */
  nci_payout: number[];
  other_cash_items: number[];
  delta_nwc: number[];
  capex_pct_revenue: number[];
  other_items: number[];
  /** Dividends as a share of group net income. */
  payout: number[];
  /** Bank debt outstanding at the end of each year. */
  debt: number[];
}

export interface MergerAssumptions {
  deal_name: string;
  horizon_years: number;
  standalone: { acquirer: StandaloneForecast; target: StandaloneForecast };
  price:
    | { driver: 'enterprise_value'; enterprise_value: number }
    | { driver: 'equity_value'; equity_value: number }
    | { driver: 'offer_per_share'; offer_per_share: number }
    | { driver: 'premium'; premium: number; premium_to: 'current' | 'unaffected' };
  /** The target's undisturbed share price, if the analyst sets one (premium reference). */
  unaffected_price: number | null;
  /** §29.17: share of year 1 after the close (1 = closes at the start of year 1). */
  timing: { fraction_of_year_1: number };
  /** §29.12: share of the equity value paid to target holders in acquirer shares. */
  consideration: { pct_stock: number };
  /** refinance_all: the target's net debt is a use of funds and the target is shown debt free and
   *  cash free. assume_all: its debt stays in place, with its interest and cash. */
  target_debt: 'refinance_all' | 'assume_all';
  fees: {
    advisory: {
      basis: 'pct_equity_value' | 'pct_enterprise_value' | 'amount';
      value: number;
      /** §29.16: not_recognised = a use of funds only (the reference); expensed = charged to equity at close. */
      treatment: 'not_recognised' | 'expensed';
      tax_deductible: boolean;
    };
    /** On new equity raised for cash. */
    equity_issuance_pct: number;
    /** Other one-off costs at close (charged to equity, not deductible). */
    other_one_off: number;
  };
  funding: {
    tranches: MergerTranche[];
    /** Price the new acquirer shares are issued at. */
    issue_price: number;
    /** Which source balances the table (§29.12). */
    plug: 'equity' | 'debt';
    /** Acquirer balance sheet cash spent on the deal (positive). */
    acquirer_cash_used: number;
    /** New equity raised for cash when the plug is debt (the plug sets it otherwise). */
    equity_raise: number;
    /** Combined net debt / EBITDA, tested in `test_year` (0 = the pro forma year). */
    leverage_cap: { max: number; test_year: number } | null;
    solve: 'none' | 'max_debt_at_cap';
  };
  /** §29.15. Phasings and dis-synergies have length N + 1 (year 0 first); costs to achieve length N. */
  synergies: {
    /** Pre-tax cost synergies: run_rate × phasing[t]. */
    run_rate: number;
    phasing: number[];
    revenue: { run_rate: number; phasing: number[]; flow_through_margin: number } | null;
    /** Signed (≤ 0), forecast years only. */
    cost_to_achieve: number[] | null;
    /** Signed (≤ 0), EBITDA. */
    dis_synergies: number[] | null;
  };
  ppa: PurchaseAccounting | null;
  /** Tax rate on the transaction impact block. */
  adjustments_tax_rate: number;
  /** Rate earned (or paid) on the impact block's beginning cash; null = none. */
  interest_on_impact_cash: number | null;
  /** The combined company pays the acquirer's ratio on the group income the deal adds. Length N. */
  combined_dividends: { mode: 'acquirer_payout_on_group_income'; ratio: number[] };
  /** §29.13: optional sweep of combined cash into the sweeping tranches. */
  sweep: { pct: number; min_cash: number } | null;
  /** false: the impact block's year-0 cash is not carried into year 1 (the deal is taken to close
   *  at the start of year 1; year 0 is a pro forma income view). */
  year0_cash_carried: boolean;
}

/** One block, one year. Signed. Ratios are null where they have no meaning (division by zero). */
export interface MergerYear {
  revenue: number;
  ebitda: number;
  /** Costs to achieve (signed); below EBITDA. */
  one_offs: number;
  da: number;
  ebit: number;
  net_interest: number;
  /** Add-back of the non-cash part of net interest. */
  non_cash_interest: number;
  pbt: number;
  tax: number;
  net_income: number;
  nci: number;
  net_income_group: number;
  shares: number;
  other_cash_items: number;
  /** Book tax less cash tax (positive = less cash tax paid than booked). */
  deferred_tax: number;
  net_cash_before_wc: number;
  delta_nwc: number;
  acquisition: number;
  capex: number;
  fcf: number;
  other_items: number;
  dividends: number;
  nci_dividends: number;
  debt_flow: number;
  equity_issuance: number;
  cash_begin: number;
  cash_change: number;
  cash_end: number;
  acquisition_debt: number;
  bank_debt: number;
  total_debt: number;
  /** Cash counted against debt in net debt (positive). */
  cash_in_net_debt: number;
  net_debt: number;
  // in-block ratios
  growth: number | null;
  margin: number | null;
  tax_rate: number | null;
  capex_pct: number | null;
  payout: number | null;
  nci_payout: number | null;
  nd_ebitda: number | null;
  eps: number | null;
  dps: number | null;
}

/** Lines that obey the five-block law (sum and combined are element-wise sums). */
export const ADDITIVE_LINES = [
  'revenue', 'ebitda', 'one_offs', 'da', 'ebit', 'net_interest', 'non_cash_interest', 'pbt', 'tax', 'net_income', 'nci',
  'net_income_group', 'shares', 'other_cash_items', 'deferred_tax', 'net_cash_before_wc', 'delta_nwc', 'acquisition', 'capex', 'fcf', 'other_items',
  'dividends', 'nci_dividends', 'debt_flow', 'equity_issuance', 'cash_begin', 'cash_change', 'cash_end',
  'acquisition_debt', 'bank_debt', 'total_debt', 'cash_in_net_debt', 'net_debt',
] as const satisfies readonly (keyof MergerYear)[];
export type AdditiveLine = (typeof ADDITIVE_LINES)[number];

export interface MergerDeal {
  enterprise_value: number;
  equity_value: number;
  /** §29.11: null without target shares. */
  offer_per_share: number | null;
  diluted_target_shares: number | null;
  premium_current: number | null;
  premium_unaffected: number | null;
  exchange_ratio: number | null;
  multiples: { ev_ebitda_year0: number | null; ev_ebitda_year1: number | null; ev_ebitda_year0_with_synergies: number | null; ev_ebitda_year1_with_synergies: number | null };
  /** Net debt as given, and as used (less convertibles that convert). */
  target_net_debt: number;
  net_debt_used: number;
  converted_principal: number;
  refinanced_net_debt: number;
  /** Advisory fee (Phase 1's `fees`). */
  fees: number;
  financing_fees: number;
  equity_issuance_fees: number;
  other_one_off: number;
  total_uses: number;
  stock_to_target: number;
  tranche_amounts: number[];
  debt_issued: number;
  /** New equity for cash plus stock to target holders (Phase 1's definition). */
  equity_issued: number;
  equity_raised_for_cash: number;
  acquirer_cash_used: number;
  total_sources: number;
  new_shares: number;
  ownership: { acquirer: number; target_holders: number; placing: number };
  /** Share of the equity value paid that is funded by new shares (the reference's "% share"). */
  pct_stock: number;
  pct_cash: number;
  /** New shares / acquirer shares outstanding. */
  dilution: number;
}

export interface MergerFlag {
  code:
    | 'leverage_cap_breached'
    | 'leverage_cap_not_binding'
    | 'acquirer_eps_not_positive'
    | 'combined_loss_flat_tax'
    | 'bargain_purchase'
    | 'dilution_from_reported_increment'
    | 'convertible_converts';
  severity: 'block' | 'warn' | 'note';
  message: string;
}

export interface MergerOutput {
  facts: MergerFacts;
  assumptions: MergerAssumptions;
  years: { label: string; fiscal_year: number; kind: 'pro_forma_actual' | 'forecast' }[];
  deal: MergerDeal;
  blocks: Record<MergerBlock, MergerYear[]>;
  eps: {
    acquirer: (number | null)[];
    combined: (number | null)[];
    accretion: (number | null)[];
    /** §29.18 */
    combined_adjusted: (number | null)[];
    accretion_adjusted: (number | null)[];
    breakeven_synergies: (number | null)[];
    extra_synergies_needed: (number | null)[];
    breakeven_pct_target_costs: (number | null)[];
    /** §29.17: year 1 at a full year, when the close is part-way through it. */
    year1_full_year: { combined: number | null; accretion: number | null } | null;
  };
  dps: { acquirer: (number | null)[]; combined: (number | null)[]; uplift: (number | null)[] };
  leverage: {
    cap: { max: number; test_year: number; actual: number | null; headroom: number | null } | null;
    /** Present when the debt was sized to the cap. */
    solve: { debt: number; binding: boolean; iterations: number } | null;
  };
  debt: { tranches: TrancheYear[][] };
  ppa: PpaResult | null;
  /** §29.14: index 0 = at the close (end of year 0), then the end of each forecast year. */
  balance_sheet: BalanceSheet[] | null;
  checks: { sources_minus_uses: number; combined_cash: number[]; balance_sheet: number[] | null };
  flags: MergerFlag[];
}

/** §29.13: one tranche, one year (t = 0..N). */
export interface TrancheYear {
  begin: number;
  scheduled: number;
  sweep: number;
  end: number;
  interest: number;
  fee_amortisation: number;
}

export interface BalanceSheet {
  cash: number;
  nwc: number;
  fixed_assets: number;
  acquired_intangibles: number;
  goodwill: number;
  deferred_financing_fees: number;
  other_net_assets: number;
  total_assets: number;
  debt: number;
  debt_fair_value: number;
  deferred_tax_liability: number;
  equity_parent: number;
  nci_equity: number;
  total_liabilities_and_equity: number;
}

export interface PpaResult {
  target_equity: number;
  goodwill_written_off: number;
  ppe_writeup: number;
  intangibles: number;
  debt_fair_value_adjustment: number;
  existing_dtl_removed: number;
  new_dtl: number;
  adjusted_net_assets: number;
  goodwill: number;
  opening: { acquirer: BalanceSheet; target: BalanceSheet; adjustments: BalanceSheet; combined: BalanceSheet };
  /** Per year t = 0..N (year 0 is the pro forma view). Positive magnitudes. */
  schedule: { writeup_depreciation: number; intangible_amortisation: number; fv_amortisation: number; tax_amortisation: number; deferred_tax: number }[];
}
