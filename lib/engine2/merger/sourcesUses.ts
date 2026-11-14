/**
 * lib/engine2/merger/sourcesUses.ts — price, sources and uses, consideration mix (SPEC §29.4).
 */
import type { MergerAssumptions, MergerDeal, MergerFacts } from './types';

/** Debt `D` is given (or solved by the caller); equity is the plug: E = total uses − D. */
export function mergerDeal(facts: MergerFacts, a: MergerAssumptions, debt: number): MergerDeal {
  const netDebt = facts.target.net_debt as number; // validated non-null
  const ev = a.price.driver === 'enterprise_value' ? a.price.enterprise_value : a.price.equity_value + netDebt;
  const eqv = a.price.driver === 'equity_value' ? a.price.equity_value : a.price.enterprise_value - netDebt;
  const fa = a.fees.advisory;
  const fees = fa.basis === 'pct_equity_value' ? fa.value * eqv : fa.basis === 'pct_enterprise_value' ? fa.value * ev : fa.value;
  const refinanced = a.target_debt === 'refinance_all' ? netDebt : 0;
  const uses = eqv + refinanced + fees;
  const equity = uses - debt;
  if (equity < -1e-9) {
    throw new RangeError(`The acquisition debt (${debt.toFixed(1)}) is more than the total uses of funds (${uses.toFixed(1)}). Reduce the debt or raise the price.`);
  }
  const newShares = equity / a.funding.issue_price;
  const pctStock = eqv === 0 ? 0 : equity / eqv;
  return {
    enterprise_value: ev, equity_value: eqv, target_net_debt: netDebt, refinanced_net_debt: refinanced, fees,
    total_uses: uses, debt_issued: debt, equity_issued: equity, total_sources: debt + equity, new_shares: newShares,
    pct_stock: pctStock, pct_cash: 1 - pctStock, dilution: newShares / (facts.acquirer.shares as number),
  };
}

/** The most debt the table can take: all of the uses (equity issued = 0). */
export function totalUses(facts: MergerFacts, a: MergerAssumptions): number {
  return mergerDeal(facts, a, 0).total_uses;
}
