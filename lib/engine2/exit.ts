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
 *   (sponsor_share + rollover_share + mip_payout + management_ordinary_share +
 *   warrant_payout_net ≡ pre-MIP total — the §14.16 FIVE-term mirror [v1.7.0]; the two
 *   new terms are 0 whenever their instruments are null).
 *
 * No imports from lib/engine (boundary test).
 */

import type { DealAssumptions, EquityStripBlock, ExitBlock, RatchetTier } from './types';

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

/** §22.3(iii)/(iv) [v1.7.0]: shared tier gates for BOTH ratchets. `baseHurdle` is null for
 *  §22.5 (no base threshold — the base share applies from zero). Fires only when tiers
 *  exist: a bare v1 `mip` (incl. pool_pct = 1.0) stays legal, per §14.23(f). */
export function validateRatchetTiers(
  tiers: RatchetTier[] | null,
  baseHurdle: number | null,
  baseShare: number,
  home: string,
): void {
  if (!tiers || tiers.length === 0) return; // null ≡ [] ≡ no tiers (§22.3)
  const bad = (msg: string): never => { throw new RangeError(`${home}: ${msg} (SPEC §22.3)`); };
  let prevH = baseHurdle;
  let prevS = baseShare;
  for (const t of tiers) {
    if (!(t.hurdle_moic > 0)) bad('hurdle_moic must be > 0');
    if (prevH !== null && !(t.hurdle_moic > prevH)) {
      bad('hurdle_moic must be strictly ascending (and strictly above the base threshold it sits on)');
    }
    if (!(t.share_pct >= prevS)) bad('share_pct must be non-decreasing and ≥ the base share — a ratchet only ever ratchets up');
    if (!(t.share_pct < 1)) bad('share_pct must be < 1 (§22.5: the (1 − s) bracket denominator; §22.4: a pool taking 100% of a slice)');
    prevH = t.hurdle_moic;
    prevS = t.share_pct;
  }
}

/** §22.3 [v1.7.0] input-gate REJECTIONS for the strip/warrant (Build-time; the §22.3(vi)
 *  non-positive-plug gate lives in sourcesUses.ts where the plug is computed). */
export function validateSweetEquity(
  a: Pick<DealAssumptions, 'sweet_equity' | 'warrant' | 'mip' | 'rollover_equity'>,
): void {
  const bad = (msg: string): never => { throw new RangeError(`sweet_equity: ${msg} (SPEC §22.3)`); };
  const sw = a.sweet_equity;
  if (sw) {
    if (a.mip) bad('a promote and a strip may not coexist — the DR-2 double-count made STRUCTURAL (§22.3(i))');
    if (a.rollover_equity > 0) bad('a strip may not coexist with a rollover in v1 — the allocation is negotiated with no defensible default (§22.3(ii))');
    if (!(sw.sponsor_ordinary_pct > 0 && sw.sponsor_ordinary_pct <= 1)) bad('sponsor_ordinary_pct must be in (0, 1]');
    if (!(sw.loan_note_rate >= 0)) bad('loan_note_rate must be ≥ 0');
    if (!(sw.management_subscription >= 0)) bad('management_subscription must be ≥ 0');
    if (!(sw.management_ordinary_pct >= 0 && sw.management_ordinary_pct < 1)) bad('management_ordinary_pct must be in [0, 1)');
    if (sw.management_ordinary_pct === 0 && sw.management_subscription > 0) {
      bad('management paying a real subscription for a ZERO ordinary share is a typo, not a structure (§22.3(vii)); a zero subscription with a zero share stays legal (the all-institutional strip)');
    }
    validateRatchetTiers(sw.ratchet, null, sw.management_ordinary_pct, 'sweet_equity.ratchet');
  }
  if (a.mip) validateRatchetTiers(a.mip.ratchet, a.mip.hurdle_moic, a.mip.pool_pct, 'mip.ratchet');
  const w = a.warrant;
  if (w) {
    if (!(w.pct_of_ordinary > 0 && w.pct_of_ordinary < 1)) bad('warrant.pct_of_ordinary must be in (0, 1) (§22.3(v))');
    if (!(w.strike_total >= 0)) bad('warrant.strike_total must be ≥ 0 (§22.3(v))');
  }
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
  /**
   * §10 [v1.1.0] cumulative TOTAL interim distributions paid over the hold (§3 step 7).
   * They count toward the hurdle — it tests total value RETURNED — but the promote is still
   * computed and paid AT EXIT ONLY, out of exit proceeds.
   */
  cumulative_distributions: number;
  /** §22.2 [v1.7.0] LN[0] = (1 − sponsor_ordinary_pct) × plug — from sequence.ts's interim
   *  split so exit never re-derives it (0 when `sweet_equity` is null). */
  loan_notes_subscribed: number;
  /** §22.2 [v1.7.0] LN[N] grown to exit, net of interim redemptions, BEFORE the exit
   *  redemption (0 when `sweet_equity` is null). */
  loan_note_balance_at_exit: number;
  /** §22.5 [v1.7.0] institutional value already banked before the ordinary split:
   *  Σ institution shares of paid[t] (§22.7's interim block); 0 with no distributions. */
  institutional_interim_value: number;
}

/** §22.4 [v1.7.0]: the MARGINAL bracket walk over the promote tiers on §10's own base.
 *  ONE tier reproduces §10 verbatim: s₀ × max(0, min(X, ∞) − T₀) ≡ pool × max(0, X − T). */
function promoteUncapped(
  mip: NonNullable<DealAssumptions['mip']>,
  totalProceeds: number,
  investedEquityTotal: number,
): number {
  const tiers = [
    { hurdle_moic: mip.hurdle_moic, share_pct: mip.pool_pct },
    ...(mip.ratchet ?? []),
  ];
  let sum = 0;
  for (let j = 0; j < tiers.length; j++) {
    const lo = tiers[j].hurdle_moic * investedEquityTotal;
    const hi = j + 1 < tiers.length ? tiers[j + 1].hurdle_moic * investedEquityTotal : Infinity;
    sum += tiers[j].share_pct * Math.max(0, Math.min(totalProceeds, hi) - lo);
  }
  return sum;
}

export function buildExitWaterfall(
  assumptions: Pick<DealAssumptions, 'exit' | 'mip' | 'fees' | 'sweet_equity' | 'warrant'>,
  inputs: ExitInputs,
): { exit: ExitBlock; equity_strip: EquityStripBlock | null } {
  const basisValue = exitBasisValue(inputs.exit_year_ebitda_adj, assumptions.exit.basis, inputs.last_growth);
  const exitEv = assumptions.exit.multiple * basisValue;
  const exitFees = assumptions.exit.fees_pct * exitEv; // §9: base = exit EV
  const termination = monitoringTermination(assumptions.fees.monitoring);
  const exitEquityPreMip =
    exitEv - inputs.debt_payoff + inputs.closing_cash - exitFees - termination;

  // ── §22.7 [v1.7.0]: the exit waterfall, ONE pipeline with null stages. `E` stays
  // SIGNED throughout — the clamp appears in exactly one place (a redemption cannot be
  // negative) and every residual is carried signed. With all three instruments null every
  // stage is the identity and the arithmetic is float-identical to v1.6.0 (§14.23(f)).
  const sweet = assumptions.sweet_equity;
  const warrant = assumptions.warrant;

  // stage 1 — loan notes (§22.2): redeemed = min(LN[N], max(0, E)); strip null ⇒ 0.
  const lnRedeemed = Math.min(inputs.loan_note_balance_at_exit, Math.max(0, exitEquityPreMip));
  let pot = exitEquityPreMip - lnRedeemed;

  // stage 2 — promote (§10/§22.4): the hurdle tests total value RETURNED (exit + interim);
  // paid AT EXIT ONLY, capped at the exit equity available. mip non-null ⇒ sweet null
  // (§22.3(i)), so the promote always acts on the FULL pot.
  let mip = 0;
  if (assumptions.mip) {
    const totalProceeds = exitEquityPreMip + inputs.cumulative_distributions;
    mip = Math.min(
      promoteUncapped(assumptions.mip, totalProceeds, inputs.invested_equity_total),
      Math.max(0, exitEquityPreMip),
    );
    pot -= mip;
  }

  // stage 3 — warrant (§22.6): full dilution with the strike paid in; STRICT `>` at the
  // money (at-the-money does NOT exercise); a negative pot is never in the money.
  const potPreWarrant = pot;
  let warrantExercised = false;
  let warrantGross = 0;
  let warrantNet = 0;
  let warrantStrike = 0;
  if (warrant) {
    const w = warrant.pct_of_ordinary;
    const K = warrant.strike_total;
    if (w * (potPreWarrant + K) > K) {
      warrantExercised = true;
      warrantGross = w * (potPreWarrant + K);
      warrantNet = warrantGross - K;
      warrantStrike = K;
      pot = (1 - w) * (potPreWarrant + K);
    }
  }

  // stage 4 — the ordinary split.
  let sponsorShare: number;
  let rolloverShare: number;
  let managementShare = 0;
  let institutionOrdinary: number;
  let tiersReached = 0;
  let institutionMoic: number | null = null;
  let managementEffectivePct: number | null = null;
  if (sweet) {
    // §22.5: the bracket walk is the SINGLE authority for the strip arm at EVERY sign of
    // the pot — its own opener handles P ≤ 0 and the reporting lines still run.
    const I = inputs.invested_equity_total; // ≡ the §2 plug (rollover forced 0, §22.3(ii))
    const V0 = inputs.institutional_interim_value + lnRedeemed;
    const P = pot;
    let vFinal: number;
    if (P <= 0) {
      managementShare = 0;
      institutionOrdinary = P;
      vFinal = V0 + P; // VALUE-REALIZED, not V₀ — §22.5's worked counterexample
    } else {
      const tiers = sweet.ratchet ?? [];
      let V = V0;
      let rem = P;
      let M = 0;
      let share = sweet.management_ordinary_pct;
      for (const t of tiers) {
        if (!(rem > 0)) break;
        const T = t.hurdle_moic * I;
        if (V < T) {
          const need = (T - V) / (1 - share); // linear: each $1 of pot adds (1 − s) to V
          const take = Math.min(need, rem);
          M += share * take;
          V += (1 - share) * take;
          rem -= take;
        }
        share = t.share_pct;
      }
      M += share * rem; // the top tier takes the remainder
      V += (1 - share) * rem;
      vFinal = V;
      managementShare = M;
      institutionOrdinary = P - M;
    }
    institutionMoic = vFinal / I; // I > 0 by §22.3(vi)'s Build rejection
    for (const t of sweet.ratchet ?? []) {
      if (institutionMoic > t.hurdle_moic) tiersReached += 1; // STRICT (§14.23(d))
    }
    managementEffectivePct = pot > 0 ? managementShare / pot : null; // 0/0 at P ≤ 0 (§14.23(e))
    sponsorShare = institutionOrdinary + lnRedeemed;
    rolloverShare = 0; // §22.3(ii)
  } else {
    // today's §9 pari-passu pro-rata split, verbatim — ALREADY signed (it multiplies,
    // never clamps), so a negative residual splits pro-rata exactly as v1 does.
    const rolloverFraction =
      inputs.invested_equity_total > 0 ? inputs.rollover_equity / inputs.invested_equity_total : 0;
    rolloverShare = pot * rolloverFraction;
    sponsorShare = pot - rolloverShare;
    institutionOrdinary = sponsorShare; // warrant-only arm: ≡ sponsor_share (§22.7)
  }

  const exit: ExitBlock = {
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
    // §22.10 [v1.7.0]: unconditional carriers (§14.16's FIVE-term mirror).
    management_ordinary_share: managementShare,
    warrant_payout_net: warrantNet,
  };

  // §22.10: null ⇔ both instruments null (the `fund` precedent).
  const equityStrip: EquityStripBlock | null =
    sweet || warrant
      ? {
          loan_notes_subscribed: inputs.loan_notes_subscribed,
          loan_notes_accrued_balance: inputs.loan_note_balance_at_exit,
          loan_notes_redeemed: lnRedeemed,
          ordinary_pot_pre_warrant: potPreWarrant,
          warrant_exercised: warrantExercised,
          warrant_strike_paid: warrantStrike,
          warrant_payout_gross: warrantGross,
          warrant_payout_net: warrantNet,
          ordinary_pot: pot,
          management_ordinary_share: managementShare,
          institution_ordinary_share: institutionOrdinary,
          ratchet_tiers_reached: tiersReached,
          management_effective_ordinary_pct: managementEffectivePct,
          institution_moic_at_ratchet: institutionMoic,
        }
      : null;

  return { exit, equity_strip: equityStrip };
}

/** The ExitBlock alone — the pre-v1.7.0 surface; one computation path (a thin wrapper). */
export function buildExit(
  assumptions: Pick<DealAssumptions, 'exit' | 'mip' | 'fees' | 'sweet_equity' | 'warrant'>,
  inputs: ExitInputs,
): ExitBlock {
  return buildExitWaterfall(assumptions, inputs).exit;
}
