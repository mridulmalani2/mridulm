/**
 * engine2/returns.ts — SPEC §9 the three locked return streams (Phase C build order #6).
 *
 * The fee/flow membership table (§9) implemented as code, one stream at a time:
 *  - sponsor_net   : −sponsor equity at t0; interim = the SPONSOR SHARE of each paid
 *                    distribution (§3 step 7 [v1.1.0]); at exit, sponsor_share PLUS the
 *                    sponsor share of the year-N distribution — the model is annual, one
 *                    flow per period, and a year-N distribution settles in the same
 *                    period-N number as the exit (§14.16).
 *  - pre_promote   : TOTAL pre-promote equity — −(sponsor + rollover) at t0, the TOTAL
 *                    paid distributions as interim flows, exit_equity_pre_mip_total (+ the
 *                    year-N total) at exit (§12 reconciles the bridge to this stream;
 *                    "pre-promote", never "gross" — §9 naming).
 *  - unlevered     : −(EV + transaction costs) at t0 (transaction costs exist regardless
 *                    of leverage); interim UFCF (EBITDA-based taxes on EBIT — §6/§9);
 *                    exit year adds exit EV − exit fees. Financing fees, OID, the
 *                    monitoring fee AND interim distributions are EXCLUDED
 *                    (leverage/sponsor artifacts — DR-2 Item 6; the unlevered stream is
 *                    capital-structure-blind, so a distribution cannot enter it).
 *
 * The sponsor's share of a distribution is pari-passu pro-rata — the SAME rule as the exit
 * split (§9) — so it is sponsor/(sponsor + rollover). With rollover = 0 it is 100%.
 *
 * Sponsor MOIC ≡ sponsor inflows / sponsor outflow (§14.10); undefined returns are null —
 * N/A semantics, never sentinels (§11/§15). The §1 mid-year option applies to the
 * SPONSOR-SIDE streams only (interim flows at t−0.5; t=0 and the exit NEVER shift); the
 * unlevered stream always uses period-end times. Both conventions are always computed and
 * carried (`irr` period-end, `irr_mid_year`) so the UI can DISCLOSE the timing effect
 * rather than silently swap a headline; `mid_year_irr` selects which one is headlined.
 *
 * No imports from lib/engine (boundary test).
 */

import { irr, midYearTimes } from './kernel/irr';
import type { DealAssumptions, ExitBlock, ReturnStreams } from './types';

function stream(cashflows: number[], invested: number): ReturnStreams['unlevered'] {
  const inflows = cashflows.reduce((s, c) => (c > 0 ? s + c : s), 0);
  return {
    cashflows,
    irr: irr(cashflows),
    moic: invested > 0 ? inflows / invested : null,
  };
}

/** Sponsor-side stream: carries the §1 mid-year alternative alongside the period-end IRR. */
function sponsorSideStream(cashflows: number[], invested: number): ReturnStreams['sponsor_net'] {
  return {
    ...stream(cashflows, invested),
    irr_mid_year: irr(cashflows, midYearTimes(cashflows.length)),
  };
}

export interface ReturnsInputs {
  sponsor_equity: number;
  rollover_equity: number;
  enterprise_value: number;
  transaction_costs: number;
  /** Interim unlevered FCF per hold year (sequence.ts §9 run). */
  unlevered_fcf: number[];
  /** §3 step 7 — TOTAL equity distributions actually paid per year (sequence.ts). */
  distributions_paid: number[];
  exit: Pick<ExitBlock, 'sponsor_share' | 'exit_equity_pre_mip_total' | 'exit_ev' | 'exit_fees'>;
  hold_years: number;
}

/**
 * §9 [v1.1.0] the SPONSOR share of each paid distribution — pari-passu pro-rata, the same
 * rule the exit split uses. Degenerates to the full amount when rollover = 0.
 */
export function sponsorShareOfDistributions(
  paid: number[],
  sponsor_equity: number,
  rollover_equity: number,
): number[] {
  const total = sponsor_equity + rollover_equity;
  // A non-positive total equity check has no meaningful pro-rata split; the §16 solvency
  // gate blocks the run before this matters, so credit the sponsor with nothing rather
  // than inventing a share.
  const share = total > 0 ? sponsor_equity / total : 0;
  return paid.map((p) => p * share);
}

export function buildReturns(
  _assumptions: Pick<DealAssumptions, 'mid_year_irr'>,
  inputs: ReturnsInputs,
): ReturnStreams {
  const N = inputs.hold_years;
  const paid = inputs.distributions_paid;
  const sponsorPaid = sponsorShareOfDistributions(paid, inputs.sponsor_equity, inputs.rollover_equity);

  // §14.16: the year-N distribution and the exit settle in the SAME period-N flow.
  const sponsorCfs = [
    -inputs.sponsor_equity,
    ...sponsorPaid.slice(0, -1),
    inputs.exit.sponsor_share + (sponsorPaid[N - 1] ?? 0),
  ];
  const prePromoteTotal = inputs.sponsor_equity + inputs.rollover_equity;
  const prePromoteCfs = [
    -prePromoteTotal,
    ...paid.slice(0, -1),
    inputs.exit.exit_equity_pre_mip_total + (paid[N - 1] ?? 0),
  ];
  const unleveredOutflow = inputs.enterprise_value + inputs.transaction_costs;
  const unleveredCfs = [
    -unleveredOutflow,
    ...inputs.unlevered_fcf.slice(0, -1),
    (inputs.unlevered_fcf[N - 1] ?? 0) + inputs.exit.exit_ev - inputs.exit.exit_fees,
  ];

  // §9 [v1.1.0] DPI and payback — on DISTRIBUTIONS ALONE. Exit proceeds never count toward
  // payback: that is exactly what made the old headline degenerate (ledger L-10).
  const dpi: number[] = [];
  let payback: number | null = null;
  let cumulative = 0;
  for (let t = 0; t < N; t++) {
    cumulative += sponsorPaid[t] ?? 0;
    dpi.push(inputs.sponsor_equity > 0 ? cumulative / inputs.sponsor_equity : 0);
    if (payback === null && inputs.sponsor_equity > 0 && cumulative >= inputs.sponsor_equity) {
      payback = t + 1;
    }
  }

  return {
    sponsor_net: sponsorSideStream(sponsorCfs, inputs.sponsor_equity),
    pre_promote: sponsorSideStream(prePromoteCfs, prePromoteTotal),
    unlevered: stream(unleveredCfs, unleveredOutflow),
    dpi,
    payback_year: payback,
  };
}

/** §9 GP fee income memo — never silently dropped; null when monitoring is OFF. */
export function buildGpFeeIncome(
  monitoring: DealAssumptions['fees']['monitoring'],
  monitoringFeesByYear: number[],
  termination: number,
): { annual: number[]; termination: number; total: number } | null {
  if (!monitoring) return null;
  const total = monitoringFeesByYear.reduce((a, b) => a + b, 0) + termination;
  return { annual: monitoringFeesByYear, termination, total };
}
