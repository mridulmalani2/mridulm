/**
 * engine2/check.ts — the §16 coherence gate (Phase C build order #5, with facade.ts).
 *
 * A POST-RUN check over the ModelOutput of the SAME runModel call — never a second
 * calculation path (architecture-review finding, 2026-07-04). Anything the model can't
 * stand behind renders as a flag; nothing here recomputes engine arithmetic.
 *
 * Severities: `block` = the model's economics are broken (insolvent close, floor breach —
 * v1.0.3 post-breach semantics); `warn` = rendered warning on the exhibit (§14.6, §8).
 * The facts-anchored flags (entry_multiple_vs_trading, implausible_days) activate only
 * when the corresponding fact anchors exist (Phase D populates them; null anchors are
 * suppressed by the plausibility gates, PHASE_D D4/D5).
 *
 * No imports from lib/engine (boundary test).
 */

import { covenantBreachYear } from './credit';
import type { BalanceSheetYear, CoherenceFlag, CovenantAssumption, CreditYear, DealAssumptions, DealFacts, SourcesUses, WaterfallYear } from './types';

export interface CoherenceInputs {
  facts: Pick<DealFacts, 'implied_trading_ev_ebitda' | 'dso' | 'dio' | 'dpo'>;
  assumptions: Pick<DealAssumptions, 'entry' | 'exit' | 'operations' | 'covenants'>;
  sources_uses: SourcesUses;
  derived: { entry_multiple: number };
  waterfall: WaterfallYear[];
  balance_sheet: BalanceSheetYear[];
  credit: CreditYear[];
  covenants: CovenantAssumption;
}

/** Entry multiple further above the trading anchor than this ⇒ warn (DR-4 Cat.7 discipline). */
const TRADING_PREMIUM_WARN = 0.15;
/** Days plausibility rails (PHASE_D D2 heuristics; engine-side re-check on assumption days). */
const DAYS_MAX = { dso: 180, dio: 365, dpo: 180 };

export function runCoherence(x: CoherenceInputs): CoherenceFlag[] {
  const flags: CoherenceFlag[] = [];

  if (x.sources_uses.sponsor_equity <= 0) {
    flags.push({
      code: 'negative_sponsor_equity',
      severity: 'block',
      message: `Sponsor equity plug is ${x.sources_uses.sponsor_equity.toFixed(1)} — uses exceed debt + rollover capacity (§2 solvency check)`,
    });
  }

  const breachYear = x.waterfall.findIndex((w) => w.cash_floor_breach);
  if (breachYear >= 0) {
    flags.push({
      code: 'cash_floor_breach',
      severity: 'block',
      message: `Cash floor breached in year ${breachYear + 1} with the revolver exhausted — post-breach years are not economically meaningful (§3 step 6, v1.0.3)`,
    });
  }

  const negativePpeYear = x.balance_sheet.findIndex((b) => b.ppe < 0);
  if (negativePpeYear >= 0) {
    flags.push({
      code: 'negative_ppe',
      severity: 'warn',
      message: `Net PP&E rolls negative from year ${negativePpeYear} — D&A outruns capex (§8 mechanical roll; revisit da_pct vs capex_pct)`,
    });
  }

  const covenantBreach = covenantBreachYear(x.covenants, x.credit);
  if (covenantBreach !== null) {
    flags.push({
      code: 'covenant_breach_base_case',
      severity: 'warn',
      message: `Base case breaches a covenant in year ${covenantBreach} (signed headroom negative — §11)`,
    });
  }

  if (
    x.facts.implied_trading_ev_ebitda !== null &&
    x.derived.entry_multiple > x.facts.implied_trading_ev_ebitda * (1 + TRADING_PREMIUM_WARN)
  ) {
    flags.push({
      code: 'entry_multiple_vs_trading',
      severity: 'warn',
      message: `Entry ${x.derived.entry_multiple.toFixed(1)}x is >${Math.round(TRADING_PREMIUM_WARN * 100)}% above the trading anchor ${x.facts.implied_trading_ev_ebitda.toFixed(1)}x`,
    });
  }

  if (x.assumptions.entry.basis !== x.assumptions.exit.basis) {
    flags.push({
      code: 'basis_mismatch',
      severity: 'warn',
      message: `Entry basis (${x.assumptions.entry.basis}) differs from exit basis (${x.assumptions.exit.basis}) — the multiple comparison is apples-to-oranges (§9/§11)`,
    });
  }

  const nwc = x.assumptions.operations.nwc;
  if (nwc.method === 'days') {
    const bad = (['dso', 'dio', 'dpo'] as const).filter((k) => nwc[k] < 0 || nwc[k] > DAYS_MAX[k]);
    if (bad.length) {
      flags.push({
        code: 'implausible_days',
        severity: 'warn',
        message: `NWC days outside plausible rails: ${bad.map((k) => `${k.toUpperCase()}=${nwc[k]}`).join(', ')} (§7)`,
      });
    }
  }

  return flags;
}
