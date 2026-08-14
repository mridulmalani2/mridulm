/**
 * engine2/check.ts — the §16 coherence gate (Phase C build order #5, with facade.ts).
 *
 * A POST-RUN check over the ModelOutput of the SAME runModel call — never a second
 * calculation path (architecture-review finding, 2026-07-04). Anything the model can't
 * stand behind renders as a flag; nothing here recomputes engine arithmetic.
 *
 * Severities: `block` = the model's economics are broken (insolvent close, floor breach —
 * v1.0.3 post-breach semantics); `warn` = rendered warning on the exhibit (§14.6, §8).
 * entry_multiple_vs_trading is facts-anchored (null anchor ⇒ suppressed; Phase D
 * populates it). implausible_days rails the ASSUMPTION days the model actually runs on
 * (PHASE_D D2 heuristics re-checked engine-side) — deliberately not the facts' days.
 *
 * No imports from lib/engine (boundary test).
 */

import { covenantBreachYear } from './credit';
import { RETIRED_TOL } from './debt';
import type { BalanceSheetYear, CoherenceFlag, CovenantAssumption, CreditYear, DealAssumptions, DealFacts, EquityStripBlock, SourcesUses, TrancheYear, WaterfallYear } from './types';

export interface CoherenceInputs {
  facts: Pick<DealFacts, 'implied_trading_ev_ebitda'>;
  assumptions: Pick<DealAssumptions, 'entry' | 'exit' | 'operations' | 'covenants' | 'structure'>;
  sources_uses: SourcesUses;
  derived: { entry_multiple: number };
  waterfall: WaterfallYear[];
  balance_sheet: BalanceSheetYear[];
  credit: CreditYear[];
  covenants: CovenantAssumption;
  /** §8: PP&E seed fell back to 0 because facts.net_ppe was null — "else 0 with note". */
  ppe_seeded_at_zero: boolean;
  /** §18.8 [v1.3.1]: per-tranche year rows — read for the refi no-op flag (named fields only). */
  tranches: TrancheYear[][];
  /** §14.23(g) [v1.7.0]: read for the loan_notes_unredeemed WARN; null when no strip/warrant. */
  equity_strip: EquityStripBlock | null;
}

/** Entry multiple further above the trading anchor than this ⇒ warn (DR-4 Cat.7 discipline). */
const TRADING_PREMIUM_WARN = 0.15;
/** Days plausibility rails (PHASE_D D2 heuristics; engine-side re-check on assumption days). */
const DAYS_MAX = { dso: 180, dio: 365, dpo: 180 };

export function runCoherence(x: CoherenceInputs): CoherenceFlag[] {
  const flags: CoherenceFlag[] = [];

  // §14.23(g) [v1.7.0]: fires EXACTLY on `loan_notes_accrued_balance > loan_notes_redeemed
  // + $0.005m`, on §22.2's pinned measurement pair (balance grown to exit BEFORE the exit
  // redemption; redeemed = the EXIT redemption alone). Once per run; WARN — the run's
  // arithmetic already carries the shortfall truthfully (a zero-or-negative ordinary pot).
  // Named for its CONDITION, so the flag cannot mislabel what it detects. The strip fields
  // do not exist when the block is null, hence the domain gate.
  if (
    x.equity_strip &&
    x.equity_strip.loan_notes_accrued_balance > x.equity_strip.loan_notes_redeemed + 0.005
  ) {
    const b = x.equity_strip.loan_notes_accrued_balance;
    const r = x.equity_strip.loan_notes_redeemed;
    flags.push({
      code: 'loan_notes_unredeemed',
      severity: 'warn',
      message: `Exit equity does not cover the accreted loan notes: $${b.toFixed(2)}m accrued vs $${r.toFixed(2)}m redeemed at exit. The ordinary pot is zero-or-negative to that extent and management's sweet equity is worthless on this run (SPEC §22.2/§14.23(g)).`,
    });
  }

  // §20.6(e) [v1.5.0]: the AHYDO SHAPE — structural, on the tranche TERMS alone (no run data),
  // so it is deterministic and fires identically under every election pattern that accrues.
  // TWO of §163(i)'s three legs are NOT tested here: the YIELD leg (YTM ≥ AFR + 5pts) needs the
  // monthly AFR — external data this engine has no source for — and the SIGNIFICANT-OID leg is
  // PROXIED by "an accruing year exists", which over-fires on small coupons (a WARN: the safe
  // direction) and under-fires only on issue-OID-only cash tranches (immaterial at v1's ≤2.5%
  // OID). Boundary is `> 5`, not `≥ 5` (§163(i)(1)'s "more than 5 years").
  for (const tr of x.assumptions.structure.tranches) {
    if (tr.type !== 'pik_note') continue;
    const accrues = tr.elections != null ? tr.elections.some((e) => e === 'pik') : tr.pik_coupon > 0;
    if (tr.maturity_years > 5 && accrues) {
      flags.push({
        code: 'ahydo_shape',
        severity: 'warn',
        message: `"${tr.name}" has the AHYDO shape (maturity ${tr.maturity_years}y > 5 with accruing PIK): under §163(e)(5)/§163(i) the accrued-PIK deduction can be DEFERRED until paid and a disqualified portion permanently disallowed. v1 deducts PIK as accrued and does NOT model this (SPEC §20.4/§20.8) — the assumed cure is the contractual AHYDO catch-up payment most such indentures carry. The yield leg (YTM ≥ AFR + 5pts) is NOT tested here (needs the monthly AFR) and the significant-OID leg is proxied, so this flag is structural and deliberately over-inclusive.`,
      });
    }
  }

  // §18.8 [v1.3.1]: a scheduled refi that hit an already-retired balance is a stamped NO-OP —
  // and a scheduled structural event that did nothing must say so. POST-RUN read of named
  // TrancheYear fields; ε = RETIRED_TOL (§7's economically-retired threshold, = §15's ±$0.005m),
  // the ONE tolerance, so the flagged class ≡ the engine-retired class (sign-off round 1, B1).
  for (const rows of x.tranches) {
    for (let t = 0; t < rows.length; t++) {
      const r = rows[t];
      if (r.refinanced && r.beginning_balance <= RETIRED_TOL) {
        flags.push({
          code: 'refi_noop',
          severity: 'warn',
          message: `Refinancing of "${r.name}" scheduled for year ${t + 1} is a no-op — the tranche entered the year at/below the §7 retired tolerance (already repaid); the stamped premium, new OID/fees and write-off are ~0 (§18.8)`,
        });
      }
    }
  }

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

  // §3.7: the restricted-payment trap clipped a distribution that CASH alone would have
  // allowed. Raised once per run listing every blocked year — a sponsor plan that assumes
  // its distributions get paid has to see this. WARN, not block: the model is coherent and
  // the trap doing its job is a real-world outcome, not a broken input.
  const blockedYears = x.waterfall
    .map((w, i) => (w.distribution_blocked ? i + 1 : 0))
    .filter((y) => y > 0);
  if (blockedYears.length > 0) {
    flags.push({
      code: 'distribution_blocked',
      severity: 'warn',
      message: `Restricted-payment trap blocks distributions in year${blockedYears.length > 1 ? 's' : ''} ${blockedYears.join(', ')} — cash was available but the pro-forma net-leverage test was not met; blocked capacity does NOT carry forward (§3.7)`,
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

  // §8 [v1.0.5]: the goodwill plug is SIGNED and never clamped — a negative plug (purchase
  // price + capitalized transaction costs below the carrying value of net identifiable
  // assets) is the bargain-purchase signal and must never render silently. The trigger is
  // the SIGN OF THE PLUG on the t=0 ModelOutput row (constant thereafter — never amortized).
  if (x.balance_sheet.length > 0 && x.balance_sheet[0].goodwill < 0) {
    flags.push({
      code: 'negative_goodwill',
      severity: 'warn',
      message: `Goodwill plug is NEGATIVE (${x.balance_sheet[0].goodwill.toFixed(1)}) — entry price (incl. transaction costs) sits below the carrying value of net identifiable assets; bargain-purchase signal, shown unclamped (§8; ASC 805 gain recognition out of scope in v1)`,
    });
  }

  // §8 "seed = facts net PP&E, else 0 with NOTE" — the note must reach the product
  // boundary (C2 review F3: it previously died inside EngineCore).
  if (x.ppe_seeded_at_zero) {
    flags.push({
      code: 'ppe_seeded_at_zero',
      severity: 'warn',
      message: 'Opening PP&E seeded at 0 — the filing/facts provided no net PP&E; the §8 roll and D&A basis start from zero (disclosed §8 fallback)',
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
