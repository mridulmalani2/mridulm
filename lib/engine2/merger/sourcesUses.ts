/**
 * lib/engine2/merger/sourcesUses.ts — price, consideration, sources and uses (SPEC §29.4, §29.11, §29.12).
 */
import { priceTarget } from './consideration';
import type { MergerAssumptions, MergerDeal, MergerFacts } from './types';

const r = (a: number, b: number): number | null => (Math.abs(b) < 1e-12 ? null : a / b);

/** Index of the tranche without an amount (the debt plug or the tranche sized to the cap), or -1. */
export const openTranche = (a: MergerAssumptions): number => a.funding.tranches.findIndex((t) => t.amount === null);

/**
 * `solvedDebt` fills the tranche entered without an amount when the debt is sized to the leverage
 * cap (§29.7); otherwise every amount is entered, or the open tranche is the plug.
 */
export function mergerDeal(facts: MergerFacts, a: MergerAssumptions, solvedDebt: number | null): MergerDeal {
  const tgt = facts.target;
  const pr = priceTarget(tgt, a);
  const eqv = pr.equity_value;
  const ev = pr.enterprise_value;
  const fa = a.fees.advisory;
  const fees = fa.basis === 'pct_equity_value' ? fa.value * eqv : fa.basis === 'pct_enterprise_value' ? fa.value * ev : fa.value;
  const refinanced = a.target_debt === 'refinance_all' ? pr.net_debt_used : 0;
  const S = a.consideration.pct_stock * eqv;
  const fu = a.funding;
  const cashUsed = fu.acquirer_cash_used;
  const eqPct = a.fees.equity_issuance_pct;
  const other = a.fees.other_one_off;
  const open = openTranche(a);
  const amounts = fu.tranches.map((t) => t.amount ?? 0);
  if (open >= 0 && solvedDebt !== null) amounts[open] = solvedDebt;

  let E: number;
  if (fu.plug === 'equity') {
    const ff = fu.tranches.reduce((s, t, i) => s + t.fee_pct * amounts[i], 0);
    const D = amounts.reduce((s, x) => s + x, 0);
    E = (eqv + refinanced + fees + ff + other - S - D - cashUsed) / (1 - eqPct);
    if (E < -1e-9) {
      throw new RangeError(`The debt and cash entered (${(D + cashUsed).toFixed(1)}) are more than the deal needs. Reduce the debt or the cash used, or raise the price.`);
    }
  } else {
    E = fu.equity_raise;
    const tp = fu.tranches[open];
    const ffOthers = fu.tranches.reduce((s, t, i) => (i === open ? s : s + t.fee_pct * amounts[i]), 0);
    const dOthers = amounts.reduce((s, x, i) => (i === open ? s : s + x), 0);
    const Dp = (eqv + refinanced + fees + ffOthers + other + eqPct * E - S - dOthers - E - cashUsed) / (1 - tp.fee_pct);
    if (Dp < -1e-9) {
      throw new RangeError(`The other sources already cover the deal, so ${tp.name} would be negative (${Dp.toFixed(1)}). Reduce the equity raised, the cash used or the other tranches.`);
    }
    amounts[open] = Dp;
  }
  const financingFees = fu.tranches.reduce((s, t, i) => s + t.fee_pct * amounts[i], 0);
  const eqFees = eqPct * E;
  const uses = eqv + refinanced + fees + financingFees + eqFees + other;
  const debt = amounts.reduce((s, x) => s + x, 0);
  const sources = S + debt + E + cashUsed;
  const newShares = (S + E) / fu.issue_price;
  const acqShares = facts.acquirer.shares as number;
  const all = acqShares + newShares;

  const P = pr.offer_per_share;
  const sa = a.standalone.target;
  const ebitda0 = tgt.year0.ebitda;
  const ebitda1 = tgt.year0.revenue * (1 + sa.revenue_growth[0]) * sa.ebitda_margin[0];
  const rs = a.synergies.revenue;
  const runRate = a.synergies.run_rate + (rs ? rs.run_rate * rs.flow_through_margin : 0);

  return {
    enterprise_value: ev, equity_value: eqv,
    offer_per_share: P,
    diluted_target_shares: pr.diluted,
    premium_current: P !== null && tgt.share_price ? P / tgt.share_price - 1 : null,
    premium_unaffected: P !== null && a.unaffected_price ? P / a.unaffected_price - 1 : null,
    exchange_ratio: P !== null ? (a.consideration.pct_stock * P) / fu.issue_price : null,
    multiples: {
      ev_ebitda_year0: r(ev, ebitda0), ev_ebitda_year1: r(ev, ebitda1),
      ev_ebitda_year0_with_synergies: r(ev, ebitda0 + runRate), ev_ebitda_year1_with_synergies: r(ev, ebitda1 + runRate),
    },
    target_net_debt: tgt.net_debt as number,
    net_debt_used: pr.net_debt_used,
    converted_principal: pr.converted_principal,
    refinanced_net_debt: refinanced,
    fees, financing_fees: financingFees, equity_issuance_fees: eqFees, other_one_off: other,
    total_uses: uses,
    stock_to_target: S,
    tranche_amounts: amounts,
    debt_issued: debt,
    equity_issued: S + E,
    equity_raised_for_cash: E,
    acquirer_cash_used: cashUsed,
    total_sources: sources,
    new_shares: newShares,
    ownership: { acquirer: acqShares / all, target_holders: S / fu.issue_price / all, placing: E / fu.issue_price / all },
    pct_stock: eqv === 0 ? 0 : (S + E) / eqv,
    pct_cash: eqv === 0 ? 1 : 1 - (S + E) / eqv,
    dilution: newShares / acqShares,
  };
}

/** §29.12: the most the open tranche can take when debt is sized to the cap: the size that makes E = 0. */
export function maxSolvedDebt(facts: MergerFacts, a: MergerAssumptions): number {
  const d0 = mergerDeal(facts, a, 0);
  const open = openTranche(a);
  // E(D) = (K + fee_p·D − D) / (1 − eqPct) is affine in D; E(D) = 0 at D = K / (1 − fee_p), K = E(0)·(1 − eqPct)
  const K = d0.equity_raised_for_cash * (1 - a.fees.equity_issuance_pct);
  return Math.max(0, K / (1 - a.funding.tranches[open].fee_pct));
}
