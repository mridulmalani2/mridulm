/**
 * engine2/debt.ts — SPEC §3–§5 debt schedule, wrapping kernel/waterfall
 * (Phase C build order #4). Strict year loop, NO solver (§5).
 *
 * The §5 evaluation order forces a two-call shape per year:
 *   1. `financeLines`  — interest, PIK accrual and commitment fee from BEGINNING balances
 *                        (§4); these feed the §6 tax run, which feeds FCF (§7).
 *   2. `runDebtYear`   — the §3 waterfall with that FCF; returns the typed schedule rows
 *                        and the end-of-year state.
 * The sweep % for the year is resolved by `resolveSweepPct` (§3.5 grid on BEGINNING-of-
 * year net leverage — no dependence on the current year's sweep, so no circularity).
 *
 * No imports from lib/engine (boundary test).
 */

import { scheduledAmort } from './kernel/amort';
import { allInRate, cashInterest, commitmentFee, pikAccrual } from './kernel/rates';
import { waterfallYear } from './kernel/waterfall';
import type { SizedStructure } from './sourcesUses';
import type { RevolverYear, SweepAssumption, TrancheYear, WaterfallYear } from './types';

/** Economically-retired threshold, matching the reference derivation (±$0.005m — §15). */
const RETIRED_TOL = 5e-3;

export interface DebtState {
  /** Term-tranche balances, §16 order (PIK accrued in at each year end). */
  term_balances: number[];
  revolver_drawn: number;
}

export function openingDebtState(sized: SizedStructure): DebtState {
  return {
    term_balances: sized.terms.map((t) => t.par),
    revolver_drawn: sized.revolver?.assumption.drawn_at_close ?? 0,
  };
}

/**
 * v1 structural constraint [SPEC §3/§16, v1.0.3]: every term-tranche maturity must
 * EXCEED hold_years — a tranche maturing inside the hold would balloon with no
 * refinancing module (Phase G); §3 defines no balloon step. Input-gate rejection,
 * validated at Build. The revolver's maturity only drives its fee-amortization horizon
 * (exempt from the gate).
 */
export function validateStructureForHold(sized: SizedStructure, holdYears: number): void {
  for (const t of sized.terms) {
    if (t.assumption.maturity_years <= holdYears) {
      throw new RangeError(
        `debt: ${t.assumption.name} matures in year ${t.assumption.maturity_years}, inside the ${holdYears}-year hold — v1 has no refinancing/balloon module (SPEC §3 scope; Phase G)`,
      );
    }
  }
}

export interface FinanceLines {
  per_tranche: { cash_interest: number; pik_accrual: number }[];
  revolver_interest: number;
  commitment_fee: number;
  /** All tranches + revolver (mirror invariant §14.16 feeds from here). */
  cash_interest_total: number;
  pik_accrual_total: number;
}

/** §4: every accrual on BEGINNING-of-year balances — interest, PIK, and the commitment fee on beginning undrawn. */
export function financeLines(sized: SizedStructure, state: DebtState): FinanceLines {
  const perTranche = sized.terms.map((t, i) => {
    const balance = state.term_balances[i];
    if (t.assumption.type === 'pik_note') {
      return {
        cash_interest: cashInterest(balance, t.assumption.cash_coupon),
        pik_accrual: pikAccrual(balance, t.assumption.pik_coupon),
      };
    }
    return {
      cash_interest: cashInterest(balance, allInRate(t.assumption.pricing)),
      pik_accrual: 0,
    };
  });
  const revolverInterest = sized.revolver
    ? cashInterest(state.revolver_drawn, allInRate(sized.revolver.assumption.pricing))
    : 0;
  const fee = sized.revolver
    ? commitmentFee(sized.revolver.commitment - state.revolver_drawn, sized.revolver.assumption.commitment_fee)
    : 0;
  return {
    per_tranche: perTranche,
    revolver_interest: revolverInterest,
    commitment_fee: fee,
    cash_interest_total: perTranche.reduce((s, t) => s + t.cash_interest, 0) + revolverInterest,
    pik_accrual_total: perTranche.reduce((s, t) => s + t.pik_accrual, 0),
  };
}

/**
 * §3.5 sweep % for the year. Grid semantics (types.ts SweepAssumption): tier selected by
 * BEGINNING-of-year net leverage = (opening gross debt − opening cash) / EBITDA_adj[t];
 * tiers sorted descending, first whose `above_net_leverage` is exceeded wins; below all
 * thresholds `else_pct`. When a grid is set, base_pct is IGNORED. EBITDA_adj ≤ 0 reads as
 * infinite leverage → the highest (lender-friendliest) tier — conservative and monotone.
 */
export function resolveSweepPct(
  sweep: SweepAssumption,
  openingGrossDebt: number,
  openingCash: number,
  ebitdaAdj: number,
): number {
  if (!sweep.grid) return sweep.base_pct;
  const leverage =
    ebitdaAdj > 0 ? (openingGrossDebt - openingCash) / ebitdaAdj : Number.POSITIVE_INFINITY;
  const tiers = [...sweep.grid.tiers].sort((a, b) => b.above_net_leverage - a.above_net_leverage);
  for (const tier of tiers) {
    if (leverage > tier.above_net_leverage) return tier.pct;
  }
  return sweep.grid.else_pct;
}

export interface DebtYearOut {
  tranche_rows: TrancheYear[];
  revolver_row: RevolverYear | null;
  waterfall_row: WaterfallYear;
  state_end: DebtState;
  /** Term tranches that fully retired THIS year (≤ ±$0.005m) — triggers the §7 write-off. */
  fully_retired: string[];
}

export function runDebtYear(
  sized: SizedStructure,
  state: DebtState,
  lines: FinanceLines,
  year: {
    opening_cash: number;
    fcf_pre_debt: number;
    min_cash: number;
    sweep_pct: number;
    /** §3 step 7 — the year's requested distribution (0 when the schedule is null). */
    distribution_request: number;
    /** §3.7 trap level; null = OFF. */
    rp_trap_level: number | null;
    /** §3.7 metric input — may be ≤ 0 (normative). */
    ebitda_adj: number;
  },
): DebtYearOut {
  const out = waterfallYear({
    opening_cash: year.opening_cash,
    fcf_pre_debt: year.fcf_pre_debt,
    min_cash: year.min_cash,
    sweep_pct: year.sweep_pct,
    distribution_request: year.distribution_request,
    rp_trap_level: year.rp_trap_level,
    ebitda_adj: year.ebitda_adj,
    tranches: sized.terms.map((t, i) => ({
      name: t.assumption.name,
      // repayment caps apply to balance + current-year PIK accrual (§3/§4, reference derivation)
      outstanding: state.term_balances[i] + lines.per_tranche[i].pik_accrual,
      scheduled_amort: scheduledAmort(
        { kind: 'straight_line_pct', pct_of_face: t.assumption.amort_pct_of_face },
        t.par,
        0, // straight-line: year-independent (§14.15)
      ),
      cash_interest: lines.per_tranche[i].cash_interest,
      sweep_participates: t.assumption.sweep.participates,
      sweep_priority: t.assumption.sweep.priority,
    })),
    revolver: sized.revolver
      ? {
          beginning_drawn: state.revolver_drawn,
          commitment: sized.revolver.commitment,
          cash_interest: lines.revolver_interest,
          commitment_fee: lines.commitment_fee,
        }
      : null,
  });

  const trancheRows: TrancheYear[] = sized.terms.map((t, i) => ({
    name: t.assumption.name,
    beginning_balance: state.term_balances[i],
    cash_interest: lines.per_tranche[i].cash_interest,
    pik_accrual: lines.per_tranche[i].pik_accrual,
    mandatory_amort: out.tranches[i].mandatory_amort,
    sweep_repayment: out.tranches[i].sweep_repayment,
    ending_balance: out.tranches[i].ending_outstanding,
  }));

  const fullyRetired = sized.terms
    .filter((_t, i) => state.term_balances[i] > RETIRED_TOL && out.tranches[i].ending_outstanding <= RETIRED_TOL)
    .map((t) => t.assumption.name);

  return {
    tranche_rows: trancheRows,
    revolver_row: sized.revolver
      ? {
          beginning_drawn: state.revolver_drawn,
          cash_interest: lines.revolver_interest,
          commitment_fee: lines.commitment_fee,
          repayment: out.revolver_repayment,
          draw: out.revolver_draw,
          ending_drawn: out.revolver_ending_drawn,
          undrawn_commitment: sized.revolver.commitment - out.revolver_ending_drawn,
        }
      : null,
    waterfall_row: {
      opening_cash: year.opening_cash,
      fcf_pre_debt: year.fcf_pre_debt,
      cash_interest_total: out.cash_interest_total,
      commitment_fees: out.commitment_fees,
      mandatory_amort_total: out.mandatory_amort_total,
      revolver_repayment: out.revolver_repayment,
      sweep_pool: out.sweep_pool,
      sweep_pct_applied: out.sweep_pct_applied,
      sweep_applied_total: out.sweep_applied_total,
      revolver_draw: out.revolver_draw,
      distribution_requested: out.distribution_requested,
      rp_max: out.rp_max,
      distribution_paid: out.distribution_paid,
      distribution_blocked: out.distribution_blocked,
      closing_cash: out.closing_cash,
      cash_floor_breach: out.cash_floor_breach,
    },
    state_end: {
      term_balances: out.tranches.map((t) => t.ending_outstanding),
      revolver_drawn: out.revolver_ending_drawn,
    },
    fully_retired: fullyRetired,
  };
}
