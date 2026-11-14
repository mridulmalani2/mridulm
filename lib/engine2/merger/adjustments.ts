/**
 * lib/engine2/merger/adjustments.ts — the transaction impact block (SPEC §29.5).
 */
import { buildRow, type Amounts } from './rows';
import type { MergerAssumptions, MergerDeal } from './types';

/**
 * Everything the deal adds on top of acquirer + target. Interest on the acquisition debt is on its
 * beginning balance (SPEC §4); the debt is not amortised in Phase 1, so every year's beginning
 * balance is the amount raised. Year 0 is the pro forma year: the deal is taken to have closed at
 * its start, so it carries the acquisition, the funding and a full year of synergies and interest.
 */
export function impactRows(a: MergerAssumptions, deal: MergerDeal, target: Amounts[], targetDividends: number[], n: number): Amounts[] {
  const D = deal.debt_issued;
  const shares = deal.new_shares;
  const rows: Amounts[] = [];
  for (let t = 0; t <= n; t++) {
    const prev = rows[t - 1];
    const cashBegin = t === 0 ? 0 : t === 1 && !a.year0_cash_carried ? 0 : prev.cash_end;
    const interest = -a.funding.acquisition_debt.rate * D + (a.interest_on_impact_cash ?? 0) * cashBegin;
    rows.push(buildRow({
      revenue: 0,
      ebitda: a.synergies.run_rate * a.synergies.phasing[t],
      da: 0,
      net_interest: interest,
      tax_rate: a.adjustments_tax_rate,
      nci: 0,
      shares,
      other_cash_items: 0,
      delta_nwc: 0,
      acquisition: t === 0 ? -deal.total_uses : 0,
      capex: 0,
      other_items: 0,
      nci_dividends: 0,
      debt_flow: t === 0 ? D : 0,
      equity_issuance: t === 0 ? deal.equity_issued : 0,
      cash_begin: cashBegin,
      acquisition_debt: D,
      bank_debt: 0,
      // §29.5: the combined company pays the acquirer's ratio on the group income the deal adds
      // (target income + impact income), and the target's own dividend is replaced, not added.
      dividends: (nig) => (t === 0 ? 0 : -a.combined_dividends.ratio[t - 1] * (target[t].net_income_group + nig) - targetDividends[t]),
      // a year-0 cash balance that is not carried is not counted in net debt either
      cashInNetDebt: (end) => (t === 0 && !a.year0_cash_carried ? 0 : end),
    }));
  }
  return rows;
}
