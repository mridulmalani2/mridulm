/**
 * lib/engine2/merger/rows.ts — the shared row arithmetic (SPEC §29.2, §29.6): the subtotals every
 * block computes the same way, and the in-block ratios.
 */
import type { AdditiveLine, MergerYear } from './types';

export type Amounts = Pick<MergerYear, AdditiveLine>;

/** The flows a block supplies; every subtotal below is derived from them, identically in every block. */
export interface RowInputs {
  revenue: number; ebitda: number; da: number; net_interest: number; tax_rate: number; nci: number;
  shares: number; other_cash_items: number; delta_nwc: number; acquisition: number; capex: number;
  other_items: number; nci_dividends: number; debt_flow: number; equity_issuance: number;
  cash_begin: number; acquisition_debt: number; bank_debt: number;
  /** Dividends depend on this year's income, so they are a function of the computed row. */
  dividends: (netIncomeGroup: number) => number;
  /** §29.10: zero in the standalone blocks. */
  one_offs?: number; non_cash_interest?: number; deferred_tax?: number;
  /** Cash counted in net debt, given the year-end cash. Default: all of it. */
  cashInNetDebt?: (cashEnd: number) => number;
}

/** §29.2 (§29.10): EBIT = EBITDA + one-offs + D&A; PBT = EBIT + net interest; tax = − PBT × rate; and so on down. */
export function buildRow(x: RowInputs): Amounts {
  const one_offs = x.one_offs ?? 0;
  const non_cash_interest = x.non_cash_interest ?? 0;
  const deferred_tax = x.deferred_tax ?? 0;
  const ebit = x.ebitda + one_offs + x.da;
  const pbt = ebit + x.net_interest;
  const tax = -pbt * x.tax_rate;
  const net_income = pbt + tax;
  const net_income_group = net_income + x.nci;
  const net_cash_before_wc = x.ebitda + one_offs + x.net_interest + non_cash_interest + x.other_cash_items + tax + deferred_tax;
  const fcf = net_cash_before_wc + x.delta_nwc + x.acquisition + x.capex;
  const dividends = x.dividends(net_income_group);
  const cash_change = fcf + x.other_items + dividends + x.nci_dividends + x.debt_flow + x.equity_issuance;
  const cash_end = x.cash_begin + cash_change;
  const cash_in_net_debt = x.cashInNetDebt ? x.cashInNetDebt(cash_end) : cash_end;
  const total_debt = x.acquisition_debt + x.bank_debt;
  return {
    revenue: x.revenue, ebitda: x.ebitda, one_offs, da: x.da, ebit, net_interest: x.net_interest, non_cash_interest, pbt, tax,
    net_income, nci: x.nci, net_income_group, shares: x.shares, other_cash_items: x.other_cash_items, deferred_tax, net_cash_before_wc,
    delta_nwc: x.delta_nwc, acquisition: x.acquisition, capex: x.capex, fcf, other_items: x.other_items,
    dividends, nci_dividends: x.nci_dividends, debt_flow: x.debt_flow, equity_issuance: x.equity_issuance,
    cash_begin: x.cash_begin, cash_change, cash_end, acquisition_debt: x.acquisition_debt, bank_debt: x.bank_debt,
    total_debt, cash_in_net_debt, net_debt: total_debt - cash_in_net_debt,
  };
}

/** a / b, or null when b is zero (a ratio with no meaning is shown as n/a, never as 0). */
export const ratio = (a: number, b: number): number | null => (Math.abs(b) < 1e-12 ? null : a / b);

/**
 * §29.6: ratios are recomputed inside each block from that block's own amounts. Growth compares
 * full years: `fullYear` is the same block at a full year 1 (§29.17), defaulting to `rows`.
 */
export function withRatios(rows: Amounts[], perShare: boolean, fullYear: Amounts[] = rows): MergerYear[] {
  const growth = (t: number): number | null => {
    if (t === 0) return null;
    const g = ratio(fullYear[t].revenue, fullYear[t - 1].revenue);
    return g === null ? null : g - 1;
  };
  return rows.map((r, t) => ({
    ...r,
    growth: growth(t),
    margin: ratio(r.ebitda, r.revenue),
    tax_rate: ratio(-r.tax, r.pbt),
    capex_pct: ratio(-r.capex, r.revenue),
    payout: ratio(-r.dividends, r.net_income_group),
    nci_payout: ratio(r.nci_dividends, r.nci),
    nd_ebitda: ratio(r.net_debt, r.ebitda),
    eps: perShare ? ratio(r.net_income_group, r.shares) : null,
    dps: perShare ? ratio(-r.dividends, r.shares) : null,
  }));
}

/** §29.6: the five-block law, element-wise over every additive line. */
export function addBlocks(a: Amounts[], b: Amounts[]): Amounts[] {
  return a.map((x, t) => {
    const out = {} as Amounts;
    for (const k of Object.keys(x) as AdditiveLine[]) out[k] = x[k] + b[t][k];
    return out;
  });
}
