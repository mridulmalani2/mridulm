/**
 * lib/engine2/merger/standalone.ts — one company's standalone forecast (SPEC §29.2, §29.3, §29.17).
 */
import { buildRow, type Amounts } from './rows';
import type { MergerSide, StandaloneForecast } from './types';

export interface StandaloneOptions {
  /** Debt free and cash free (the target when its net debt is refinanced, §29.3). */
  debtFree: boolean;
  /** false for the target, whose shares are cancelled in the combination (§29.6). */
  countShares: boolean;
  /** §29.17: the share of year 1 this block owns (the target after a part-year close); 1 otherwise. */
  fraction1: number;
  /** §29.14: year 1's opening cash when it comes from the closing balance sheet; null = the year-0 roll. */
  year1OpenCash: number | null;
}

/**
 * Year 0 from the cleaned actuals, years 1..N from the forecast. Under a part-year close, year 1's
 * flows are scaled by the owned fraction (debt flows follow the balance schedule and are not), and
 * year 2 grows from the FULL year-1 revenue.
 */
export function standaloneRows(side: MergerSide, f: StandaloneForecast, n: number, opts: StandaloneOptions): Amounts[] {
  const y0 = side.year0;
  const shares = opts.countShares ? side.shares ?? 0 : 0;
  const rows: Amounts[] = [];
  let fullRevenue = y0.revenue;
  for (let t = 0; t <= n; t++) {
    const prev = rows[t - 1];
    const s = t === 1 ? opts.fraction1 : 1;
    if (t > 0) fullRevenue *= 1 + f.revenue_growth[t - 1];
    const debt = opts.debtFree ? 0 : t === 0 ? y0.debt : f.debt[t - 1];
    const prevDebt = opts.debtFree ? 0 : t <= 1 ? y0.debt : f.debt[t - 2];
    const nci = s * (t === 0 ? y0.nci : f.nci[t - 1]);
    const cashBegin = t === 0
      ? (opts.debtFree ? 0 : y0.opening_cash)
      : t === 1 && opts.year1OpenCash !== null ? opts.year1OpenCash : prev.cash_end;
    rows.push(buildRow({
      revenue: s * fullRevenue,
      ebitda: s * (t === 0 ? y0.ebitda : fullRevenue * f.ebitda_margin[t - 1]),
      da: s * (t === 0 ? y0.da : f.da[t - 1]),
      net_interest: opts.debtFree ? 0 : s * (t === 0 ? y0.net_interest : f.net_interest[t - 1]),
      tax_rate: f.tax_rate,
      nci,
      shares,
      other_cash_items: s * (t === 0 ? y0.other_cash_items : f.other_cash_items[t - 1]),
      delta_nwc: s * (t === 0 ? y0.delta_nwc : f.delta_nwc[t - 1]),
      acquisition: 0,
      capex: s * (t === 0 ? y0.capex : -f.capex_pct_revenue[t - 1] * fullRevenue),
      other_items: s * (t === 0 ? y0.other_items : f.other_items[t - 1]),
      nci_dividends: t === 0 ? y0.nci_dividends : f.nci_payout[t - 1] * nci,
      // year 0 shows no debt flow: its opening balance is not in the model (the reference leaves it blank)
      debt_flow: t === 0 ? 0 : debt - prevDebt,
      equity_issuance: 0,
      cash_begin: cashBegin,
      acquisition_debt: 0,
      bank_debt: debt,
      dividends: (nig) => (t === 0 ? y0.dividends : -f.payout[t - 1] * nig),
    }));
  }
  return rows;
}
