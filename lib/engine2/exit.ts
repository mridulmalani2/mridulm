/**
 * engine2/exit.ts — SPEC §9 exit + §10 MIP (Phase C build order #6, with returns.ts).
 *
 * Exit EV = exit multiple × exit-year EBITDA_adj (FY basis; NTM = ×(1 + g[N−1] proxy) —
 * golden-uncovered, flagged in §9). Debt payoff = par + accrued PIK (accruals are already
 * compounded into the §3 balances). Unamortized OID/financing fees are written off
 * NON-CASH — they affect exit only through the year-N §6 deduction, never cash proceeds.
 * Closing cash conveys:
 *   exit equity (pre-MIP, total) = exit EV − payoff + closing cash − exit fees
 *                                  − monitoring termination.
 * §10 MIP (one instrument, US-style promote pool):
 *   MIP = min(pool_pct × max(0, pre-MIP total proceeds − hurdle_moic × invested equity),
 *             exit equity available); rollover shares the post-MIP pot pari-passu
 *   (sponsor_share + rollover_share + mip_payout ≡ pre-MIP total — mirror §14.16).
 *
 * No imports from lib/engine (boundary test).
 */

import type { DealAssumptions, ExitBlock } from './types';

/** §9 exit-basis EBITDA: FY = exit-year EBITDA_adj; NTM = ×(1 + growth[N−1] proxy). */
export function exitBasisValue(
  exitYearEbitdaAdj: number,
  basis: 'fy' | 'ntm',
  lastGrowth: number,
): number {
  return basis === 'fy' ? exitYearEbitdaAdj : exitYearEbitdaAdj * (1 + lastGrowth);
}

/**
 * §9 monitoring termination: the accelerated NPV of the remaining annual fee — replaces
 * the (dropped) year-N annual fee, a real exit Use (DR-2 Item 5; no double count).
 * annual × Σ_{k=1..T} (1+r)^−k; r = 0 degenerates to annual × T.
 */
export function monitoringTermination(
  monitoring: DealAssumptions['fees']['monitoring'],
): number {
  if (!monitoring) return 0;
  const { annual, termination_years: T, discount_rate: r } = monitoring;
  if (T <= 0) return 0;
  if (r === 0) return annual * T;
  return (annual * (1 - Math.pow(1 + r, -T))) / r;
}

export interface ExitInputs {
  /** operating[N−1].ebitda_adj (§9 basis figure before any NTM proxy). */
  exit_year_ebitda_adj: number;
  /** growth[N−1] — the year-N+1 proxy under NTM basis (§9). */
  last_growth: number;
  /** Σ final term balances (par + accrued PIK) + drawn revolver (§9/C-8). */
  debt_payoff: number;
  /** waterfall[N−1].closing_cash — same cash definition as credit metrics (§9). */
  closing_cash: number;
  /** Exit-year unamortized OID + fee write-off (non-cash — §9), from sequence.ts. */
  unamortized_writeoff: number;
  /** Sponsor equity + rollover — the §10 hurdle base (invested equity incl. fees, §2 plug). */
  invested_equity_total: number;
  rollover_equity: number;
}

export function buildExit(
  assumptions: Pick<DealAssumptions, 'exit' | 'mip' | 'fees'>,
  inputs: ExitInputs,
): ExitBlock {
  const basisValue = exitBasisValue(inputs.exit_year_ebitda_adj, assumptions.exit.basis, inputs.last_growth);
  const exitEv = assumptions.exit.multiple * basisValue;
  const exitFees = assumptions.exit.fees_pct * exitEv; // §9: base = exit EV
  const termination = monitoringTermination(assumptions.fees.monitoring);
  const exitEquityPreMip =
    exitEv - inputs.debt_payoff + inputs.closing_cash - exitFees - termination;

  // §10 promote: carry above an MOIC hurdle, capped at available exit equity
  let mip = 0;
  if (assumptions.mip) {
    const hurdleValue = assumptions.mip.hurdle_moic * inputs.invested_equity_total;
    mip = Math.min(
      assumptions.mip.pool_pct * Math.max(0, exitEquityPreMip - hurdleValue),
      Math.max(0, exitEquityPreMip),
    );
  }

  // rollover pari-passu pro-rata on the post-MIP pot (§9 fee-membership table)
  const postMip = exitEquityPreMip - mip;
  const rolloverFraction =
    inputs.invested_equity_total > 0 ? inputs.rollover_equity / inputs.invested_equity_total : 0;
  const rolloverShare = postMip * rolloverFraction;
  const sponsorShare = postMip - rolloverShare;

  return {
    exit_ebitda_basis_value: basisValue,
    exit_ev: exitEv,
    debt_payoff_at_par_plus_pik: inputs.debt_payoff,
    cash_at_exit: inputs.closing_cash,
    exit_fees: exitFees,
    monitoring_termination: termination,
    unamortized_fees_written_off: inputs.unamortized_writeoff,
    exit_equity_pre_mip_total: exitEquityPreMip,
    mip_payout: mip,
    sponsor_share: sponsorShare,
    rollover_share: rolloverShare,
  };
}
