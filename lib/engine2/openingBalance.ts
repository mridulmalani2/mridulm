/**
 * engine2/openingBalance.ts — SPEC §8 opening balance sheet & purchase accounting
 * (Phase C build order #2, paired with sourcesUses.ts).
 *
 * Stock deal, no §338(h)(10)/§336(e) election, no tax step-up (v1). At t = 0:
 *   assets      = min-cash + opening NWC + PP&E seed + capitalized financing fees + OID
 *                 + GOODWILL (the plug that closes the BS)
 *   liabilities = debt at PAR (incl. any drawn revolver — v1: 0 at close)
 *   equity      = sponsor + rollover
 * Goodwill is a plug and is not amortized thereafter. Debt carried at par with OID as a
 * separate deferred cost (avoids the book-vs-payoff trap at exit — §9). The BS merges
 * capitalized financing fees + unamortized OID into one deferred_financing_costs line
 * (adjudicated v1.0.2). PP&E seed = facts net PP&E, else 0 with a disclosed note
 * (the caller surfaces the note; this module records which seed applied).
 *
 * No imports from lib/engine (boundary test).
 */

import type { BalanceSheetYear, DealFacts, SourcesUses } from './types';

export interface OpeningBalanceResult {
  row: BalanceSheetYear;
  /** true when facts.net_ppe was null and the roll seeds at 0 (§8 disclosed note). */
  ppe_seeded_at_zero: boolean;
}

/**
 * §8 opening BS from the §2 S&U and the §7 opening NWC. `drawnAtClose` is 0 in v1
 * (min cash is funded via the cash-to-BS use line — §2/C-9) but the §16 schema carries it.
 */
export function buildOpeningBalance(
  su: SourcesUses,
  nwc0: number,
  facts: Pick<DealFacts, 'net_ppe'>,
  drawnAtClose = 0,
): OpeningBalanceResult {
  const cash = su.cash_to_balance_sheet;
  const ppe = facts.net_ppe ?? 0;
  const dfc = su.financing_fees + su.oid_funded; // one merged deferred-cost line (v1.0.2)
  const debtAtPar = su.debt_at_par.reduce((s, t) => s + t.amount, 0) + drawnAtClose;
  const equity = su.sponsor_equity + su.rollover_equity;
  const goodwill = debtAtPar + equity - (cash + nwc0 + ppe + dfc); // §8 plug closes the BS
  const totalAssets = cash + nwc0 + ppe + dfc + goodwill;
  return {
    row: {
      cash,
      operating_nwc: nwc0,
      ppe,
      deferred_financing_costs: dfc,
      goodwill,
      total_assets: totalAssets,
      debt_at_par: debtAtPar,
      equity,
      check: totalAssets - debtAtPar - equity, // ≡ 0 by construction (§14.2)
    },
    ppe_seeded_at_zero: facts.net_ppe === null,
  };
}
