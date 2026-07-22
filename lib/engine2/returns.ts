/**
 * engine2/returns.ts — SPEC §9 the three locked return streams (Phase C build order #6).
 *
 * The fee/flow membership table (§9) implemented as code, one stream at a time:
 *  - sponsor_net   : −sponsor equity at t0; interim 0 (no distributions in v1);
 *                    sponsor_share at exit (post-MIP, sponsor-only — rollover excluded).
 *  - pre_promote   : TOTAL pre-promote equity — −(sponsor + rollover) at t0,
 *                    exit_equity_pre_mip_total at exit (§12 reconciles the bridge to this
 *                    stream; "pre-promote", never "gross" — §9 naming).
 *  - unlevered     : −(EV + transaction costs) at t0 (transaction costs exist regardless
 *                    of leverage); interim UFCF (EBITDA-based taxes on EBIT — §6/§9);
 *                    exit year adds exit EV − exit fees. Financing fees, OID and the
 *                    monitoring fee are EXCLUDED (leverage/sponsor artifacts — DR-2 Item 6).
 *
 * Sponsor MOIC ≡ sponsor inflows / sponsor outflow (§14.10); undefined returns are null —
 * N/A semantics, never sentinels (§11/§15). The §1 mid-year option applies to the
 * sponsor-side streams (interim flows at t−0.5, exit NEVER shifts) and is numerically
 * inert in v1 — no interim sponsor flows exist; the unlevered stream always uses
 * period-end times (§1 applies the option to sponsor IRR display only).
 *
 * No imports from lib/engine (boundary test).
 */

import { irr, midYearTimes } from './kernel/irr';
import type { DealAssumptions, ExitBlock, ReturnStreams } from './types';

function stream(cashflows: number[], invested: number, midYear: boolean): ReturnStreams['sponsor_net'] {
  const inflows = cashflows.reduce((s, c) => (c > 0 ? s + c : s), 0);
  return {
    cashflows,
    irr: irr(cashflows, midYear ? midYearTimes(cashflows.length) : undefined),
    moic: invested > 0 ? inflows / invested : null,
  };
}

export interface ReturnsInputs {
  sponsor_equity: number;
  rollover_equity: number;
  enterprise_value: number;
  transaction_costs: number;
  /** Interim unlevered FCF per hold year (sequence.ts §9 run). */
  unlevered_fcf: number[];
  exit: Pick<ExitBlock, 'sponsor_share' | 'exit_equity_pre_mip_total' | 'exit_ev' | 'exit_fees'>;
  hold_years: number;
}

export function buildReturns(
  assumptions: Pick<DealAssumptions, 'mid_year_irr'>,
  inputs: ReturnsInputs,
): ReturnStreams {
  const N = inputs.hold_years;
  const zeros = Array.from({ length: Math.max(0, N - 1) }, () => 0);

  const sponsorCfs = [-inputs.sponsor_equity, ...zeros, inputs.exit.sponsor_share];
  const prePromoteTotal = inputs.sponsor_equity + inputs.rollover_equity;
  const prePromoteCfs = [-prePromoteTotal, ...zeros, inputs.exit.exit_equity_pre_mip_total];
  const unleveredOutflow = inputs.enterprise_value + inputs.transaction_costs;
  const unleveredCfs = [
    -unleveredOutflow,
    ...inputs.unlevered_fcf.slice(0, -1),
    (inputs.unlevered_fcf[N - 1] ?? 0) + inputs.exit.exit_ev - inputs.exit.exit_fees,
  ];

  return {
    sponsor_net: stream(sponsorCfs, inputs.sponsor_equity, assumptions.mid_year_irr),
    pre_promote: stream(prePromoteCfs, prePromoteTotal, assumptions.mid_year_irr),
    unlevered: stream(unleveredCfs, unleveredOutflow, false),
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
