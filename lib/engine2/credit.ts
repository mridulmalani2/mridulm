/**
 * engine2/credit.ts — SPEC §11 credit metrics (Phase C build order #7).
 *
 * Conventions carried over from FINANCIAL_DEFINITIONS.md with the §11 fixes:
 *  - Net leverage = (gross closing debt − closing cash) / EBITDA_adj — SIGNED (net cash
 *    reads negative). Senior net leverage filters by tranche TYPE {senior, unitranche,
 *    revolver-drawn}, net of cash (cash flows to the most-senior creditors first),
 *    floored at 0; ≤ total whenever total ≥ 0.
 *  - ICR = EBITDA_adj / cash interest (commitment fees are NOT ICR interest — §4).
 *  - FCCR = (EBITDA_adj − maint capex − cash tax) / scheduled service;
 *    DSCR = FCF_pre_debt / scheduled service; scheduled service = cash interest
 *    + commitment fees + mandatory amortization ACTUALLY DUE (§3 step 3, capped) —
 *    discretionary sweeps NEVER enter the denominator (DR-1 Item 8).
 *  - Undefined ⇒ null (N/A with reason at the UI). 9999/99-style sentinels are banned.
 *  - Covenant headroom SIGNED (breach = negative magnitude); scalar or per-year
 *    step-down schedules (an array plateaus at its LAST element for years beyond it —
 *    engine2 semantics; the old engine's per-year-else-scalar P2-4 fallback is retired).
 *  - Springing leverage test active only in years where drawn/commitment > trigger.
 *  - Deleveraging first-class (DR-5): FCF conversion (FCF/EBITDA_adj) and cumulative
 *    paydown as % of entry debt.
 *
 * Every metric uses CLOSING balances/cash — the same cash definition as §9 exit.
 * Leverage covenants always test FY-frame EBITDA_adj (the §11 LTM-canonical rule; entry
 * NTM valuation never leaks into covenant tests).
 *
 * No imports from lib/engine (boundary test).
 */

import type {
  CovenantAssumption,
  CreditYear,
  OperatingYear,
  RevolverYear,
  TrancheYear,
  WaterfallYear,
} from './types';

/** Tranche types counted as senior debt (FINANCIAL_DEFINITIONS.md; filter by TYPE, never array position). */
export const SENIOR_TYPES: ReadonlySet<string> = new Set(['senior', 'unitranche']);

/** `covenant[t] ?? scalar` step-down resolution; null = not tested (cov-lite). */
export function covenantLevel(level: number | number[] | null, yearIndex: number): number | null {
  if (level === null) return null;
  if (Array.isArray(level)) return level[yearIndex] ?? level[level.length - 1] ?? null;
  return level;
}

export interface CreditYearInputs {
  operating: OperatingYear;
  waterfall: WaterfallYear;
  /** This year's row per term tranche, with its §16 type for the senior filter. */
  tranches: { type: string; row: TrancheYear }[];
  revolver: RevolverYear | null;
  revolver_commitment: number;
  cash_tax: number;
  entry_total_debt: number;
}

export function buildCreditYear(
  covenants: CovenantAssumption,
  yearIndex: number,
  y: CreditYearInputs,
): CreditYear {
  const ebitda = y.operating.ebitda_adj;
  const cash = y.waterfall.closing_cash;
  const grossEnd =
    y.tranches.reduce((s, t) => s + t.row.ending_balance, 0) + (y.revolver?.ending_drawn ?? 0);
  const seniorGrossEnd =
    y.tranches.reduce((s, t) => s + (SENIOR_TYPES.has(t.type) ? t.row.ending_balance : 0), 0) +
    (y.revolver?.ending_drawn ?? 0);

  const netLeverage = ebitda > 0 ? (grossEnd - cash) / ebitda : null;
  const seniorNetLeverage = ebitda > 0 ? Math.max(0, seniorGrossEnd - cash) / ebitda : null;

  const cashInterest = y.waterfall.cash_interest_total;
  const icr = cashInterest > 0 ? ebitda / cashInterest : null;

  // §11 scheduled service — never sweeps
  const service =
    y.waterfall.cash_interest_total + y.waterfall.commitment_fees + y.waterfall.mandatory_amort_total;
  const fccr =
    service > 0 ? (ebitda - y.operating.maint_capex - y.cash_tax) / service : null;
  const dscr = service > 0 ? y.operating.fcf_pre_debt / service : null;

  // covenants: signed headroom; leverage max is a ceiling, coverage minimums are floors
  const leverageMax = covenantLevel(covenants.leverage_max, yearIndex);
  const dscrMin = covenantLevel(covenants.dscr_min, yearIndex);
  const fccrMin = covenantLevel(covenants.fccr_min, yearIndex);
  const leverageHeadroom =
    leverageMax !== null && netLeverage !== null ? leverageMax - netLeverage : null;
  const dscrHeadroom = dscrMin !== null && dscr !== null ? dscr - dscrMin : null;
  const fccrHeadroom = fccrMin !== null && fccr !== null ? fccr - fccrMin : null;

  // springing leverage test (§11): only in years where the revolver is drawn past the trigger
  const springingActive =
    covenants.springing !== null &&
    y.revolver !== null &&
    y.revolver_commitment > 0 &&
    y.revolver.ending_drawn / y.revolver_commitment > covenants.springing.revolver_draw_trigger_pct;

  const fcfConversion = ebitda > 0 ? y.operating.fcf_pre_debt / ebitda : null;
  const cumulativePaydown =
    y.entry_total_debt > 0 ? (y.entry_total_debt - grossEnd) / y.entry_total_debt : null;

  return {
    net_leverage: netLeverage,
    senior_net_leverage: seniorNetLeverage,
    icr,
    fccr,
    dscr,
    leverage_headroom: leverageHeadroom,
    dscr_headroom: dscrHeadroom,
    fccr_headroom: fccrHeadroom,
    springing_test_active: springingActive,
    fcf_conversion: fcfConversion,
    cumulative_paydown_pct_of_entry_debt: cumulativePaydown,
  };
}

/**
 * First covenant-breach year (1-indexed), or null. A breach is negative headroom on any
 * tested covenant, or an ACTIVE springing leverage test exceeded (§11/§13).
 */
export function covenantBreachYear(
  covenants: CovenantAssumption,
  credit: CreditYear[],
): number | null {
  for (let t = 0; t < credit.length; t++) {
    const c = credit[t];
    if (
      (c.leverage_headroom !== null && c.leverage_headroom < 0) ||
      (c.dscr_headroom !== null && c.dscr_headroom < 0) ||
      (c.fccr_headroom !== null && c.fccr_headroom < 0)
    ) {
      return t + 1;
    }
    if (c.springing_test_active && covenants.springing && c.net_leverage !== null) {
      const max = covenantLevel(covenants.springing.max, t);
      if (max !== null && c.net_leverage > max) return t + 1;
    }
  }
  return null;
}
