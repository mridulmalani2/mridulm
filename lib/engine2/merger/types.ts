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
    | { driver: 'equity_value'; equity_value: number };
  /** refinance_all: the target's net debt is a use of funds and the target is shown debt free and
   *  cash free. assume_all: its debt stays in place, with its interest and cash. */
  target_debt: 'refinance_all' | 'assume_all';
  fees: {
    advisory: {
      basis: 'pct_equity_value' | 'pct_enterprise_value' | 'amount';
      value: number;
      /** Phase 1 carries fees as a use of funds only (as the reference does). Expensing lands with
       *  purchase accounting. */
      treatment: 'not_recognised';
    };
  };
  funding: {
    /** amount null ⇔ solved (solve = 'max_debt_at_cap'). Not amortised in Phase 1. */
    acquisition_debt: { amount: number | null; rate: number };
    /** Price the new acquirer shares are issued at. */
    issue_price: number;
    /** Which source balances the table. Phase 1: equity. */
    plug: 'equity';
    /** Combined net debt / EBITDA, tested in `test_year` (0 = the pro forma year). */
    leverage_cap: { max: number; test_year: number } | null;
    solve: 'none' | 'max_debt_at_cap';
  };
  /** Pre-tax cost synergies: run_rate × phasing[t], phasing has length N + 1 (year 0 first). */
  synergies: { run_rate: number; phasing: number[] };
  /** Tax rate on the transaction impact block. */
  adjustments_tax_rate: number;
  /** Rate earned (or paid) on the impact block's beginning cash; null = none. */
  interest_on_impact_cash: number | null;
  /** The combined company pays the acquirer's ratio on the group income the deal adds. Length N. */
  combined_dividends: { mode: 'acquirer_payout_on_group_income'; ratio: number[] };
  /** false: the impact block's year-0 cash is not carried into year 1 (the deal is taken to close
   *  at the start of year 1; year 0 is a pro forma income view). */
  year0_cash_carried: boolean;
}

/** One block, one year. Signed. Ratios are null where they have no meaning (division by zero). */
export interface MergerYear {
  revenue: number;
  ebitda: number;
  da: number;
  ebit: number;
  net_interest: number;
  pbt: number;
  tax: number;
  net_income: number;
  nci: number;
  net_income_group: number;
  shares: number;
  other_cash_items: number;
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
  'revenue', 'ebitda', 'da', 'ebit', 'net_interest', 'pbt', 'tax', 'net_income', 'nci', 'net_income_group',
  'shares', 'other_cash_items', 'net_cash_before_wc', 'delta_nwc', 'acquisition', 'capex', 'fcf', 'other_items',
  'dividends', 'nci_dividends', 'debt_flow', 'equity_issuance', 'cash_begin', 'cash_change', 'cash_end',
  'acquisition_debt', 'bank_debt', 'total_debt', 'cash_in_net_debt', 'net_debt',
] as const satisfies readonly (keyof MergerYear)[];
export type AdditiveLine = (typeof ADDITIVE_LINES)[number];

export interface MergerDeal {
  enterprise_value: number;
  equity_value: number;
  target_net_debt: number;
  refinanced_net_debt: number;
  fees: number;
  total_uses: number;
  debt_issued: number;
  equity_issued: number;
  total_sources: number;
  new_shares: number;
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
    | 'combined_loss_flat_tax';
  severity: 'block' | 'warn';
  message: string;
}

export interface MergerOutput {
  facts: MergerFacts;
  assumptions: MergerAssumptions;
  years: { label: string; fiscal_year: number; kind: 'pro_forma_actual' | 'forecast' }[];
  deal: MergerDeal;
  blocks: Record<MergerBlock, MergerYear[]>;
  eps: { acquirer: (number | null)[]; combined: (number | null)[]; accretion: (number | null)[] };
  dps: { acquirer: (number | null)[]; combined: (number | null)[]; uplift: (number | null)[] };
  leverage: {
    cap: { max: number; test_year: number; actual: number | null; headroom: number | null } | null;
    /** Present when the debt was sized to the cap. */
    solve: { debt: number; binding: boolean; iterations: number } | null;
  };
  checks: { sources_minus_uses: number; combined_cash: number[] };
  flags: MergerFlag[];
}
