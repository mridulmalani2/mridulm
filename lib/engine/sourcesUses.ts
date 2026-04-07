/** Sources & Uses computation — the starting table of every LBO model. */

import type { ModelState, SourcesAndUses } from '../dealEngineTypes';

export function computeSourcesAndUses(state: ModelState): SourcesAndUses {
  const ev = state.entry.enterprise_value;
  const entryFee = state.fees.entry_fee_pct * ev;
  const totalTxnFees = entryFee + state.fees.transaction_costs;
  const financingFees = state.fees.financing_fee_pct * state.entry.total_debt_raised;
  const cashToBs = 0; // no excess cash modeled currently

  const totalUses = ev + totalTxnFees + financingFees + cashToBs;

  // Debt sources from tranches
  const debtSources = state.debt_tranches.map((t) => ({
    name: t.name,
    amount: t.principal,
  }));
  const totalDebt = debtSources.reduce((s, d) => s + d.amount, 0);

  // Rollover equity (sweet equity from management)
  const rolloverEquity = state.mip.sweet_equity_pct * ev;

  // Sponsor equity = plug (total uses - debt - rollover)
  const sponsorEquity = totalUses - totalDebt - rolloverEquity;

  const totalSources = totalDebt + rolloverEquity + sponsorEquity;

  return {
    enterprise_value: ev,
    transaction_fees: totalTxnFees,
    financing_fees: financingFees,
    cash_to_balance_sheet: cashToBs,
    total_uses: totalUses,
    debt_sources: debtSources,
    total_debt: totalDebt,
    rollover_equity: rolloverEquity,
    sponsor_equity: Math.max(0, sponsorEquity),
    total_sources: totalSources,
    equity_pct_of_total: totalSources > 0 ? (sponsorEquity + rolloverEquity) / totalSources : 0,
    debt_pct_of_total: totalSources > 0 ? totalDebt / totalSources : 0,
    implied_leverage: state.revenue.base_revenue * state.margins.base_ebitda_margin > 0
      ? totalDebt / (state.revenue.base_revenue * state.margins.base_ebitda_margin)
      : 0,
    // Audit check: Sources = Uses
    sources_uses_balanced: Math.abs(totalSources - totalUses) < 0.01,
    imbalance: totalSources - totalUses,
  };
}
