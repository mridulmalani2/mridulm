/**
 * engine2/operating.ts — the SPEC §7 operating build (Phase C build order #1).
 *
 * Produces every operating line that does NOT depend on the year loop: revenue, margin
 * trajectory, EBITDA/EBITDA_adj (monitoring-fee treatment incl. the §9 exit-year drop),
 * D&A, EBIT, capex, NWC balances & deltas, and the SCHEDULED OID / financing-fee
 * amortization streams. FCF_pre_debt needs the §6 cash tax (computed later in the §5
 * evaluation order), so it is exposed as `fcfPreDebt` and assembled by sequence.ts —
 * cash tax stays single-sourced from the tax module (mirror invariant §14.16).
 *
 * Early-retirement and exit-year write-offs of the unamortized OID/fee balances are
 * EVENTS the debt/exit modules detect (§7/§9); this module only provides the scheduled
 * streams and remaining-balance schedules they consume.
 *
 * No imports from lib/engine (boundary test); kernel not needed here — §7 is pure
 * operating arithmetic.
 */

import type { DealAssumptions, DealFacts, OperationsAssumption } from './types';

/**
 * SPEC §7 margin trajectory: margin[t] = base + (target − base) × w(t)/w(N), t = 1..N.
 * linear: w(t) = t (year 1 takes the first step); front_loaded: w(t) = √t;
 * back_loaded: w(t) = t².
 */
export function marginPath(
  base: number,
  target: number,
  path: OperationsAssumption['margin_path'],
  holdYears: number,
): number[] {
  if (!Number.isInteger(holdYears) || holdYears < 1) {
    throw new RangeError(`operating: holdYears must be a positive integer, got ${holdYears}`);
  }
  const w = (t: number): number =>
    path === 'linear' ? t : path === 'front_loaded' ? Math.sqrt(t) : t * t;
  const wN = w(holdYears);
  return Array.from({ length: holdYears }, (_, i) => base + (target - base) * (w(i + 1) / wN));
}

/** SPEC §7: rev[t] = rev[t−1] × (1 + g[t]); one growth number per year (churn folded in). */
export function buildRevenue(fyRevenue: number, growth: number[]): number[] {
  const out: number[] = [];
  let prev = fyRevenue;
  for (const g of growth) {
    prev = prev * (1 + g);
    out.push(prev);
  }
  return out;
}

/**
 * SPEC §7 operating NWC balance for one year. Days method (365 basis):
 * AR = DSO/365 × revenue; Inventory = DIO/365 × COGS; AP = DPO/365 × COGS;
 * COGS proxy = revenue × (1 − EBITDA margin) — a disclosed proxy.
 */
export function nwcBalance(
  nwc: OperationsAssumption['nwc'],
  revenue: number,
  margin: number,
): number {
  if (nwc.method === 'pct') return nwc.pct_revenue * revenue;
  const cogs = revenue * (1 - margin);
  return (nwc.dso / 365) * revenue + (nwc.dio / 365) * cogs - (nwc.dpo / 365) * cogs;
}

/**
 * SPEC §7 fee amortization — two separate lines with different §6 tax treatment:
 * OID (per tranche par × oid_pct) amortizes straight-line over ITS tranche's maturity and
 * is §163(j)-CAPPED interest; the financing fee (pct × TOTAL commitments incl. undrawn
 * revolver — §2) is allocated pro-rata by commitment/par across tranches (incl. the
 * revolver) and amortizes straight-line over EACH tranche's maturity — UNCAPPED
 * (Treas. Reg. §1.163(j)-1(b)(22)).
 */
export interface AmortizingCostInput {
  name: string;
  /** Par for term tranches; commitment for the revolver (§2/§7 allocation base). */
  commitment: number;
  maturity_years: number;
  /** Par × oid_pct; 0 for the revolver (OID is a term-tranche concept in v1 — §2). */
  oid_amount: number;
}

export interface AmortizingCostSchedule {
  name: string;
  /** This tranche's share of the total financing fee (pro-rata by commitment). */
  fee_allocated: number;
  oid_amount: number;
  /** Scheduled per-hold-year amortization (0 after maturity); length = hold_years. */
  oid_amortization: number[];
  fee_amortization: number[];
  /** Remaining UNAMORTIZED balance at the END of each hold year (before any write-off). */
  oid_remaining_end: number[];
  fee_remaining_end: number[];
}

export function buildAmortizingCostSchedules(
  tranches: AmortizingCostInput[],
  financingFeePctOfCommitments: number,
  holdYears: number,
): AmortizingCostSchedule[] {
  const totalCommitments = tranches.reduce((s, t) => s + t.commitment, 0);
  const totalFee = financingFeePctOfCommitments * totalCommitments;
  return tranches.map((t) => {
    if (!Number.isInteger(t.maturity_years) || t.maturity_years < 1) {
      throw new RangeError(`operating: ${t.name}.maturity_years must be a positive integer`);
    }
    const feeAllocated = totalCommitments > 0 ? (totalFee * t.commitment) / totalCommitments : 0;
    const line = (total: number): { amort: number[]; remaining: number[] } => {
      const perYear = total / t.maturity_years;
      const amort: number[] = [];
      const remaining: number[] = [];
      let rem = total;
      for (let y = 0; y < holdYears; y++) {
        const a = total > 0 ? Math.min(rem, perYear) : 0;
        rem -= a;
        amort.push(a);
        remaining.push(rem);
      }
      return { amort, remaining };
    };
    const oid = line(t.oid_amount);
    const fee = line(feeAllocated);
    return {
      name: t.name,
      fee_allocated: feeAllocated,
      oid_amount: t.oid_amount,
      oid_amortization: oid.amort,
      fee_amortization: fee.amort,
      oid_remaining_end: oid.remaining,
      fee_remaining_end: fee.remaining,
    };
  });
}

/** The tax-independent operating lines for one hold year (per-year indexing, i = year i+1). */
export interface OperatingBuildYear {
  revenue: number;
  margin: number;
  ebitda: number;
  /** EBITDA − monitoring annual fee; the ANNUAL fee is dropped in the exit year (§9). */
  ebitda_adj: number;
  monitoring_fee: number;
  da: number;
  ebit: number;
  maint_capex: number;
  growth_capex: number;
  nwc_balance: number;
  delta_nwc: number;
  oid_amortization: number;
  financing_fee_amortization: number;
}

export interface OperatingBuild {
  years: OperatingBuildYear[];
  /** NWC at close (SPEC §7: the §7 formulas on facts revenue/margin — adjudicated v1.0.2). */
  nwc0: number;
  cost_schedules: AmortizingCostSchedule[];
}

export function buildOperating(
  facts: Pick<DealFacts, 'fy_revenue' | 'fy_ebitda_margin'>,
  assumptions: Pick<DealAssumptions, 'operations' | 'fees' | 'entry'>,
  costInputs: AmortizingCostInput[],
): OperatingBuild {
  const ops = assumptions.operations;
  const N = assumptions.entry.hold_years;
  if (ops.growth.length !== N || ops.growth_capex.length !== N) {
    throw new RangeError(
      `operating: growth (${ops.growth.length}) and growth_capex (${ops.growth_capex.length}) must have hold_years (${N}) entries`,
    );
  }
  const revenue = buildRevenue(facts.fy_revenue, ops.growth);
  const margins = marginPath(facts.fy_ebitda_margin, ops.target_margin, ops.margin_path, N);
  const schedules = buildAmortizingCostSchedules(
    costInputs,
    assumptions.fees.financing_pct_of_commitments,
    N,
  );
  const nwc0 = nwcBalance(ops.nwc, facts.fy_revenue, facts.fy_ebitda_margin);

  const years: OperatingBuildYear[] = [];
  let prevNwc = nwc0;
  for (let i = 0; i < N; i++) {
    const exitYear = i === N - 1;
    const rev = revenue[i];
    const margin = margins[i];
    const ebitda = rev * margin;
    // §7/§9: annual monitoring fee reduces EBITDA_adj in years 1..N−1; dropped in year N
    // (the accelerated-NPV termination payment replaces it at exit — no double count).
    const monitoringFee =
      assumptions.fees.monitoring && !exitYear ? assumptions.fees.monitoring.annual : 0;
    const ebitdaAdj = ebitda - monitoringFee;
    const da = ops.da_pct_revenue * rev;
    const nwc = nwcBalance(ops.nwc, rev, margin);
    years.push({
      revenue: rev,
      margin,
      ebitda,
      ebitda_adj: ebitdaAdj,
      monitoring_fee: monitoringFee,
      da,
      ebit: ebitdaAdj - da,
      maint_capex: ops.maint_capex_pct_revenue * rev,
      growth_capex: ops.growth_capex[i],
      nwc_balance: nwc,
      delta_nwc: nwc - prevNwc,
      oid_amortization: schedules.reduce((s, t) => s + t.oid_amortization[i], 0),
      financing_fee_amortization: schedules.reduce((s, t) => s + t.fee_amortization[i], 0),
    });
    prevNwc = nwc;
  }
  return { years, nwc0, cost_schedules: schedules };
}

/**
 * SPEC §7: FCF_pre_debt = EBITDA_adj − cash tax − capex − ΔNWC. Cash tax is INJECTED from
 * the §6 tax module output (single-source rule, mirror invariant §14.16); D&A and both fee
 * amortizations are non-cash and already excluded.
 */
export function fcfPreDebt(year: OperatingBuildYear, cashTax: number): number {
  return year.ebitda_adj - cashTax - (year.maint_capex + year.growth_capex) - year.delta_nwc;
}
