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

import type { DealAssumptions, DealFacts, LineSpec, OperationsAssumption } from './types';

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
  /** null ⇔ revenue `not_modelled` (§24.1). */
  revenue: number | null;
  /** null ⇔ revenue null (never a fabricated ratio). */
  margin: number | null;
  ebitda: number;
  /** EBITDA − monitoring annual fee; the ANNUAL fee is dropped in the exit year (§9). */
  ebitda_adj: number;
  monitoring_fee: number;
  da: number;
  ebit: number;
  /** §7 driver: maint % × revenue. Under a §24 capex line this carries the WHOLE given capex
   *  line and `growth_capex` is 0 — the case states one capex number, not a split. */
  maint_capex: number;
  growth_capex: number;
  nwc_balance: number;
  delta_nwc: number;
  oid_amortization: number;
  financing_fee_amortization: number;
}

export interface OperatingBuild {
  years: OperatingBuildYear[];
  /** NWC at close. §7 balance method: the §7 formulas on facts revenue/margin (adjudicated
   *  v1.0.2). §24 ΔNWC line: `facts.operating_nwc`, or 0 with `nwc0_seeded_at_zero` (a
   *  balance-sheet split only — the opening NWC level moves goodwill, never a cash flow). */
  nwc0: number;
  nwc0_seeded_at_zero: boolean;
  cost_schedules: AmortizingCostSchedule[];
}

/** §24.1 resolve one LineSpec to its N per-year values (R6 gates). */
export function resolveLine(spec: LineSpec, N: number, label: string): number[] {
  if (spec.mode === 'explicit') {
    if (spec.values.length !== N) {
      throw new RangeError(`operating: ${label} explicit values must have hold_years (${N}) entries, got ${spec.values.length} (§24.3 R6)`);
    }
    spec.values.forEach((v, i) => {
      if (!Number.isFinite(v)) throw new RangeError(`operating: ${label} year ${i + 1} is not a finite number (§24.3 R6)`);
    });
    return [...spec.values];
  }
  if (!Number.isFinite(spec.year1)) throw new RangeError(`operating: ${label} year-1 amount is not finite (§24.3 R6)`);
  if (spec.growth.length !== N - 1) {
    throw new RangeError(`operating: ${label} growth must have hold_years − 1 (${N - 1}) entries — years 2..${N} (§24.3 R6)`);
  }
  const out = [spec.year1];
  spec.growth.forEach((g, i) => {
    if (!Number.isFinite(g) || g <= -1) throw new RangeError(`operating: ${label} growth for year ${i + 2} must be finite and > −100% (§24.3 R6)`);
    out.push(out[i] * (1 + g));
  });
  return out;
}

/**
 * §24.5: growth of every line from year N into year N+1. lines null ⇒ the v1 §9 proxy
 * `operations.growth[N−1]`; lines non-null ⇒ the analyst-entered rate (null ⇒ not stated).
 */
export function yearNPlus1Growth(ops: OperationsAssumption, holdYears: number): number | null {
  const lines = ops.lines ?? null;
  if (lines === null) return ops.growth[holdYears - 1];
  return lines.year_n_plus_1_growth;
}

/** §24.3 R1–R3: is revenue a modelled line, and does every driver that reads it have it? */
function resolveRevenue(
  facts: Pick<DealFacts, 'fy_revenue'>,
  ops: OperationsAssumption,
  N: number,
): (number | null)[] {
  const spec = ops.lines?.revenue ?? null;
  if (spec === null) {
    if (facts.fy_revenue === null || !(facts.fy_revenue > 0)) {
      throw new RangeError('operating: the revenue growth driver needs historical revenue > 0 — enter revenue by year instead, or mark it not modelled (§24.3 R1)');
    }
    if (ops.growth.length !== N) {
      throw new RangeError(`operating: growth (${ops.growth.length}) must have hold_years (${N}) entries`);
    }
    return buildRevenue(facts.fy_revenue, ops.growth);
  }
  if (spec.mode === 'not_modelled') return Array.from({ length: N }, () => null);
  return resolveLine(spec, N, 'revenue');
}

function requireRevenue(rev: number | null, what: string): number {
  if (rev === null) {
    throw new RangeError(`operating: ${what} is a % of revenue, but revenue is not modelled — enter ${what} by year instead (§24.3 R3)`);
  }
  return rev;
}

export function buildOperating(
  facts: Pick<DealFacts, 'fy_revenue' | 'fy_ebitda_margin' | 'operating_nwc'>,
  assumptions: Pick<DealAssumptions, 'operations' | 'fees' | 'entry'>,
  costInputs: AmortizingCostInput[],
): OperatingBuild {
  const ops = assumptions.operations;
  const lines = ops.lines ?? null;
  const N = assumptions.entry.hold_years;
  if (!Number.isInteger(N) || N < 1) throw new RangeError(`operating: hold_years must be a positive integer, got ${N}`);
  if (lines === null && ops.growth_capex.length !== N) {
    throw new RangeError(`operating: growth_capex (${ops.growth_capex.length}) must have hold_years (${N}) entries`);
  }
  const revenue = resolveRevenue(facts, ops, N);

  // D&A first — an EBIT-measured line needs it (EBITDA ≡ EBIT + D&A, §24.1).
  const da: number[] = lines?.da
    ? resolveLine(lines.da, N, 'D&A')
    : revenue.map((r) => ops.da_pct_revenue * requireRevenue(r, 'D&A'));

  let ebitda: number[];
  let driverMargins: number[] | null = null;
  if (lines?.ebitda) {
    const given = resolveLine(lines.ebitda, N, lines.ebitda.measure === 'ebit' ? 'EBIT' : 'EBITDA');
    ebitda = lines.ebitda.measure === 'ebit' ? given.map((e, i) => e + da[i]) : given;
  } else {
    if (facts.fy_ebitda_margin === null) {
      throw new RangeError('operating: the margin driver needs a historical EBITDA margin — enter EBITDA (or EBIT) by year instead (§24.3 R2)');
    }
    driverMargins = marginPath(facts.fy_ebitda_margin, ops.target_margin, ops.margin_path, N);
    ebitda = revenue.map((r, i) => requireRevenue(r, 'the EBITDA margin driver') * driverMargins![i]);
  }
  const margin: (number | null)[] = driverMargins
    ? driverMargins
    : revenue.map((r, i) => (r === null || r === 0 ? null : ebitda[i] / r));

  let capexTotal: number[] | null = null;
  const capexLine = lines?.capex ?? null;
  if (capexLine !== null) {
    if (capexLine.mode === 'pct_of_da') {
      if (!Number.isFinite(capexLine.pct) || capexLine.pct < 0) throw new RangeError('operating: capex % of D&A must be finite and ≥ 0 (§24.3 R6)');
      capexTotal = da.map((d) => capexLine.pct * d);
    } else {
      capexTotal = resolveLine(capexLine, N, 'capex');
    }
  } else if (ops.growth_capex.length !== N) {
    throw new RangeError(`operating: growth_capex (${ops.growth_capex.length}) must have hold_years (${N}) entries`);
  }

  const schedules = buildAmortizingCostSchedules(costInputs, assumptions.fees.financing_pct_of_commitments, N);

  // NWC: the §7 balance method, or a §24 ΔNWC line.
  let nwc0: number;
  let nwc0SeededAtZero = false;
  let deltaNwc: number[];
  let nwcBalances: number[];
  if (lines?.delta_nwc) {
    deltaNwc = resolveLine(lines.delta_nwc, N, 'increase in NWC');
    nwc0SeededAtZero = facts.operating_nwc === null;
    nwc0 = facts.operating_nwc ?? 0;
    nwcBalances = [];
    let bal = nwc0;
    for (const d of deltaNwc) { bal += d; nwcBalances.push(bal); }
  } else {
    if (facts.fy_revenue === null || facts.fy_ebitda_margin === null) {
      throw new RangeError('operating: the NWC balance method needs historical revenue and margin for opening NWC — enter the increase in NWC by year instead (§24.3 R3)');
    }
    nwc0 = nwcBalance(ops.nwc, facts.fy_revenue, facts.fy_ebitda_margin);
    nwcBalances = revenue.map((r, i) => {
      const rev = requireRevenue(r, 'NWC');
      const m = margin[i];
      if (ops.nwc.method === 'days' && m === null) throw new RangeError('operating: the NWC days method needs a modelled margin (§24.3 R3)');
      return nwcBalance(ops.nwc, rev, m ?? 0);
    });
    deltaNwc = nwcBalances.map((b, i) => b - (i === 0 ? nwc0 : nwcBalances[i - 1]));
  }

  const years: OperatingBuildYear[] = [];
  for (let i = 0; i < N; i++) {
    const exitYear = i === N - 1;
    // §7/§9: annual monitoring fee reduces EBITDA_adj in years 1..N−1; dropped in year N
    // (the accelerated-NPV termination payment replaces it at exit — no double count).
    const monitoringFee =
      assumptions.fees.monitoring && !exitYear ? assumptions.fees.monitoring.annual : 0;
    const ebitdaAdj = ebitda[i] - monitoringFee;
    const rev = revenue[i];
    years.push({
      revenue: rev,
      margin: margin[i],
      ebitda: ebitda[i],
      ebitda_adj: ebitdaAdj,
      monitoring_fee: monitoringFee,
      da: da[i],
      ebit: ebitdaAdj - da[i],
      maint_capex: capexTotal ? capexTotal[i] : ops.maint_capex_pct_revenue * requireRevenue(rev, 'maintenance capex'),
      growth_capex: capexTotal ? 0 : ops.growth_capex[i],
      nwc_balance: nwcBalances[i],
      delta_nwc: deltaNwc[i],
      oid_amortization: schedules.reduce((s, t) => s + t.oid_amortization[i], 0),
      financing_fee_amortization: schedules.reduce((s, t) => s + t.fee_amortization[i], 0),
    });
  }
  return { years, nwc0, nwc0_seeded_at_zero: nwc0SeededAtZero, cost_schedules: schedules };
}

/**
 * SPEC §7: FCF_pre_debt = EBITDA_adj − cash tax − capex − ΔNWC. Cash tax is INJECTED from
 * the §6 tax module output (single-source rule, mirror invariant §14.16); D&A and both fee
 * amortizations are non-cash and already excluded.
 */
export function fcfPreDebt(year: OperatingBuildYear, cashTax: number): number {
  return year.ebitda_adj - cashTax - (year.maint_capex + year.growth_capex) - year.delta_nwc;
}
