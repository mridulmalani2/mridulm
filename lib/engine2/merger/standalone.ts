/**
 * lib/engine2/merger/standalone.ts — one company's standalone forecast (SPEC §29.2, §29.3).
 */
import { buildRow, type Amounts } from './rows';
import type { MergerSide, StandaloneForecast } from './types';

/**
 * Year 0 from the cleaned actuals, years 1..N from the forecast. `debtFree` presents the company
 * debt free and cash free (the target when its net debt is refinanced, §29.3): no interest, no
 * bank debt, no opening cash. `countShares` = false for the target, whose shares are cancelled in
 * the combination (§29.6).
 */
export function standaloneRows(side: MergerSide, f: StandaloneForecast, n: number, opts: { debtFree: boolean; countShares: boolean }): Amounts[] {
  const y0 = side.year0;
  const shares = opts.countShares ? side.shares ?? 0 : 0;
  const rows: Amounts[] = [];
  for (let t = 0; t <= n; t++) {
    const prev = rows[t - 1];
    const revenue = t === 0 ? y0.revenue : prev.revenue * (1 + f.revenue_growth[t - 1]);
    const debt = opts.debtFree ? 0 : t === 0 ? y0.debt : f.debt[t - 1];
    const prevDebt = opts.debtFree ? 0 : t === 0 ? y0.debt : t === 1 ? y0.debt : f.debt[t - 2];
    const nci = t === 0 ? y0.nci : f.nci[t - 1];
    rows.push(buildRow({
      revenue,
      ebitda: t === 0 ? y0.ebitda : revenue * f.ebitda_margin[t - 1],
      da: t === 0 ? y0.da : f.da[t - 1],
      net_interest: opts.debtFree ? 0 : t === 0 ? y0.net_interest : f.net_interest[t - 1],
      tax_rate: f.tax_rate,
      nci,
      shares,
      other_cash_items: t === 0 ? y0.other_cash_items : f.other_cash_items[t - 1],
      delta_nwc: t === 0 ? y0.delta_nwc : f.delta_nwc[t - 1],
      acquisition: 0,
      capex: t === 0 ? y0.capex : -f.capex_pct_revenue[t - 1] * revenue,
      other_items: t === 0 ? y0.other_items : f.other_items[t - 1],
      nci_dividends: t === 0 ? y0.nci_dividends : f.nci_payout[t - 1] * nci,
      // year 0 shows no debt flow: its opening balance is not in the model (the reference leaves it blank)
      debt_flow: t === 0 ? 0 : debt - prevDebt,
      equity_issuance: 0,
      cash_begin: t === 0 ? (opts.debtFree ? 0 : y0.opening_cash) : prev.cash_end,
      acquisition_debt: 0,
      bank_debt: debt,
      dividends: (nig) => (t === 0 ? y0.dividends : -f.payout[t - 1] * nig),
    }));
  }
  return rows;
}
