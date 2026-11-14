/**
 * lib/engine2/merger/adjustments.ts — the transaction impact block (SPEC §29.5, §29.13 to §29.17).
 */
import { applySweep, trancheYear0, trancheYearPreSweep } from './financing';
import { advisoryReceivable } from './ppa';
import { buildRow, type Amounts, type RowInputs } from './rows';
import type { MergerAssumptions, MergerDeal, PpaResult, TrancheYear } from './types';

export interface ImpactResult {
  rows: Amounts[];
  /** [tranche][t] */
  tranches: TrancheYear[][];
  feeAmortisation: number[];
}

/**
 * Everything the deal adds on top of acquirer + target. Year 0 is the pro forma view: the deal is
 * taken to have closed at its start, so it carries the acquisition, the funding and a full year of
 * synergies, interest and step-up D&A. Interest is on beginning balances (SPEC §4).
 */
export function impactRows(
  a: MergerAssumptions, deal: MergerDeal, acquirer: Amounts[], target: Amounts[], ppa: PpaResult | null, n: number,
): ImpactResult {
  const f = a.timing.fraction_of_year_1;
  const syn = a.synergies;
  const tr = a.funding.tranches;
  const amounts = deal.tranche_amounts;
  const recv = advisoryReceivable(a, deal);
  const rows: Amounts[] = [];
  const tranches: TrancheYear[][] = tr.map(() => []);
  const feeLeft = tr.map((t, i) => t.fee_pct * amounts[i]);
  const feeAmortisation: number[] = [];

  for (let t = 0; t <= n; t++) {
    const s = t === 1 ? f : 1;
    const prev = rows[t - 1];
    const cashBegin = t === 0 ? 0 : t === 1 && !a.year0_cash_carried ? 0 - deal.acquirer_cash_used : prev.cash_end;
    let years = tr.map((x, i) => (t === 0 ? trancheYear0(x, amounts[i]) : trancheYearPreSweep(x, amounts[i], t === 1 ? null : tranches[i][t - 1], feeLeft[i], s, t)));
    const sch = ppa ? ppa.schedule[t] : null;
    const fvAm = sch ? sch.fv_amortisation : 0;
    const rev = syn.revenue ? syn.revenue.run_rate * syn.revenue.phasing[t] * s : 0;

    const inputs = (ys: TrancheYear[]): RowInputs => {
      const interest = ys.reduce((x, y) => x + y.interest, 0);
      const feeAm = ys.reduce((x, y) => x + y.fee_amortisation, 0);
      return {
        revenue: rev,
        ebitda: syn.run_rate * syn.phasing[t] * s + rev * (syn.revenue ? syn.revenue.flow_through_margin : 0) + (syn.dis_synergies ? syn.dis_synergies[t] * s : 0),
        one_offs: t >= 1 && syn.cost_to_achieve ? syn.cost_to_achieve[t - 1] : 0,
        da: sch ? -(sch.writeup_depreciation + sch.intangible_amortisation) : 0,
        net_interest: -interest - feeAm + fvAm + (a.interest_on_impact_cash ?? 0) * cashBegin,
        non_cash_interest: feeAm - fvAm,
        deferred_tax: sch ? sch.deferred_tax : 0,
        tax_rate: a.adjustments_tax_rate,
        nci: 0,
        shares: t === 1 ? f * deal.new_shares : deal.new_shares,
        other_cash_items: 0,
        delta_nwc: 0,
        acquisition: t === 0 ? -deal.total_uses : 0,
        capex: 0,
        other_items: t === 1 ? recv : 0,
        nci_dividends: 0,
        debt_flow: t === 0 ? deal.debt_issued : 0 - ys.reduce((x, y) => x + y.scheduled + y.sweep, 0),
        equity_issuance: t === 0 ? deal.equity_issued : 0,
        cash_begin: cashBegin,
        acquisition_debt: ys.reduce((x, y) => x + y.end, 0),
        bank_debt: 0,
        // §29.5: the combined company pays the acquirer's ratio on the group income the deal adds
        // (target income + impact income); the target's own dividend is replaced, not added.
        dividends: (nig) => (t === 0 ? 0 : -a.combined_dividends.ratio[t - 1] * (target[t].net_income_group + nig) - target[t].dividends),
        // a year-0 cash balance that is not carried is not counted in net debt either
        cashInNetDebt: (end) => (t === 0 && !a.year0_cash_carried ? 0 : end),
      };
    };

    let row = buildRow(inputs(years));
    if (t >= 1 && a.sweep) {
      // §29.13: the pre-sweep COMBINED cash change; dividends and interest do not depend on the sweep
      const X = acquirer[t].cash_change + target[t].cash_change + row.cash_change;
      const begin = acquirer[t].cash_begin + target[t].cash_begin + cashBegin;
      const amount = Math.min(a.sweep.pct * Math.max(0, X), Math.max(0, begin + X - a.sweep.min_cash));
      if (amount > 0) {
        years = applySweep(tr, years, amount);
        row = buildRow(inputs(years));
      }
    }
    rows.push(row);
    years.forEach((y, i) => {
      tranches[i].push(y);
      if (t >= 1) feeLeft[i] -= y.fee_amortisation;
    });
    feeAmortisation.push(years.reduce((x, y) => x + y.fee_amortisation, 0));
  }
  return { rows, tranches, feeAmortisation };
}
