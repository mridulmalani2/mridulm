/**
 * engine2/draft.ts — the DRAFT deal (v2.0.0, owner rule 2026-11-09: "blank until entered").
 *
 * A draft is a `DealAssumptions` object in which every assumption the analyst has not yet
 * entered is UNSET: numbers are NaN (internal marker only — never displayed, never computed:
 * Build is gated on `missingInputs` returning empty) and modelling CHOICES (bases, toggles,
 * methods) are listed in `pending` until chosen. Optional features (MIP, strip, warrant,
 * covenants, distributions, refinancing, fund, valuation, monitoring) start ABSENT — absent
 * is not a value, it is the feature not being modelled; switching one on brings its own
 * unset fields into scope.
 *
 * Nothing in this module chooses a number. `missingInputs` is the single gate the store and
 * the exporter both call, so "the model ran on a value nobody entered" cannot happen.
 */

import type { DealAssumptions, DealFacts, LineSpec } from './types';

/** The modelling choices that start pending (a type-valid placeholder value sits under each,
 *  but the path stays in `pending` until the analyst chooses — Build is gated on it). */
export const CHOICE_PATHS = [
  'entry.basis',
  'exit.basis',
  'operations.margin_path',
  'operations.nwc.method',
  'tax.interest_deductible',
  'tax.s163j.applies',
  'tax.nol.acquired_usable',
  'structure.tranches',
] as const;
export type ChoicePath = (typeof CHOICE_PATHS)[number];

const U = Number.NaN;
const unsetArray = (n: number) => Array.from({ length: n }, () => U);

/** A blank deal: every assumption unset, every optional feature absent. */
export function blankAssumptions(dealName: string, holdYears: number): DealAssumptions {
  if (!Number.isInteger(holdYears) || holdYears < 1) {
    throw new RangeError('draft: choose a whole-number holding period of at least one year first');
  }
  const N = holdYears;
  return {
    deal_name: dealName,
    entry: { driver: 'multiple', entry_multiple: U, enterprise_value: null, basis: 'fy', hold_years: N },
    structure: { tranches: [], min_cash: U, sweep: { base_pct: U, grid: null }, distributions: null, surplus_distribution: null, refinancing: null, selldown: null },
    operations: {
      growth: unsetArray(N), target_margin: U, margin_path: 'linear',
      da_pct_revenue: U, maint_capex_pct_revenue: U, growth_capex: unsetArray(N),
      nwc: { method: 'pct', pct_revenue: U },
      lines: null,
    },
    tax: {
      rate: U,
      interest_deductible: true,
      s163j: { applies: false, ati_basis: 'ebitda', ati_pct: U },
      nol: { acquired_opening: U, acquired_usable: false, arose_pre_2018: false, s382_annual_limit: null },
      minimum_rate: U,
    },
    fees: { transaction_pct_of_ev: U, financing_pct_of_commitments: U, monitoring: null },
    rollover_equity: U,
    exit: { multiple: U, basis: 'fy', fees_pct: U },
    mip: null,
    sweet_equity: null,
    warrant: null,
    covenants: { leverage_max: null, dscr_min: null, fccr_min: null, springing: null, rp_trap: null },
    fund: null,
    mid_year_irr: false,
    valuation: null,
  };
}

export interface MissingInput {
  path: string;
  label: string;
}

const LABELS: Record<string, string> = {
  'entry.entry_multiple': 'Entry multiple',
  'entry.enterprise_value': 'Purchase price (enterprise value)',
  'entry.basis': 'Entry multiple basis (FY/LTM or NTM)',
  'exit.basis': 'Exit multiple basis (FY or NTM)',
  'exit.multiple': 'Exit multiple',
  'exit.fees_pct': 'Exit fees (% of exit EV)',
  'structure.tranches': 'Debt structure (add tranches, or confirm an all-equity deal)',
  'structure.min_cash': 'Minimum cash balance',
  'structure.sweep.base_pct': 'Cash sweep %',
  'operations.growth': 'Revenue growth by year',
  'operations.target_margin': 'Target EBITDA margin',
  'operations.margin_path': 'Margin path (linear / front-loaded / back-loaded)',
  'operations.da_pct_revenue': 'D&A (% of revenue)',
  'operations.maint_capex_pct_revenue': 'Maintenance capex (% of revenue)',
  'operations.growth_capex': 'Growth capex by year',
  'operations.nwc.method': 'NWC method (days or % of revenue)',
  'operations.nwc.pct_revenue': 'NWC (% of revenue)',
  'operations.nwc.dso': 'DSO', 'operations.nwc.dio': 'DIO', 'operations.nwc.dpo': 'DPO',
  'operations.lines.year_n_plus_1_growth': 'Growth into year N+1',
  'operations.lines.revenue': 'Revenue: choose how it is entered (no historical revenue to grow)',
  'operations.lines.ebitda': 'EBITDA: choose how it is entered (by year, or EBIT + D&A)',
  'operations.lines.da': 'D&A: choose how it is entered (no revenue line to take a % of)',
  'operations.lines.capex': 'Capex: choose how it is entered (no revenue line to take a % of)',
  'operations.lines.delta_nwc': 'Working capital: choose how it is entered (no historical balance to roll)',
  'tax.rate': 'Tax rate',
  'tax.interest_deductible': 'Is interest tax-deductible?',
  'tax.s163j.applies': 'Does an interest-deduction cap (US §163(j)) apply?',
  'tax.s163j.ati_pct': 'Interest cap (% of ATI)',
  'structure.surplus_distribution.start': 'Surplus cash: pay out every year, or only once debt is repaid',
  'tax.s163j.ati_basis': 'Interest cap: ATI basis (EBITDA or EBIT)',
  'tax.nol.acquired_opening': 'Acquired NOLs at close (0 if none)',
  'tax.nol.acquired_usable': 'Are acquired NOLs usable?',
  'tax.minimum_rate': 'Minimum tax rate (0 = none)',
  'fees.transaction_pct_of_ev': 'Transaction fees (% of EV)',
  'fees.financing_pct_of_commitments': 'Financing fees (% of commitments)',
  'rollover_equity': 'Rollover equity (0 if none)',
  'structure.sweep.grid': 'Cash sweep step-down grid',
  'structure.sweep.grid.else_pct': 'Cash sweep % below every threshold',
  'structure.sweep.grid.tiers': 'Cash sweep step',
  'structure.distributions': 'Requested distribution',
  'structure.surplus_distribution.payout_pct': 'Share of surplus cash paid out',
  'covenants.leverage_max': 'Maximum net leverage covenant',
  'covenants.dscr_min': 'Minimum DSCR covenant',
  'covenants.fccr_min': 'Minimum FCCR covenant',
  'covenants.springing.max': 'Springing test: maximum net leverage',
  'covenants.springing.revolver_draw_trigger_pct': 'Springing test: revolver draw trigger',
  'covenants.rp_trap.level': 'Restricted-payment trap level',
  'mip': 'Management promote',
  'mip.ratchet': 'Promote ratchet tier',
  'sweet_equity': 'Sweet-equity strip',
  'sweet_equity.ratchet': 'Sweet ratchet tier',
  'warrant': 'Warrant',
  'fund': 'Fund overlay',
  'valuation': 'Valuation',
  'valuation.terminal': 'Terminal year (N+1): carry year N, or state a steady state',
  'valuation.terminal.capex_pct_of_da': 'Terminal capex ÷ D&A',
  'valuation.terminal.delta_nwc_before_growth': 'Terminal increase in NWC (before growth)',
  'fees.monitoring': 'Monitoring fee',
  'structure.selldown.year': 'Partial exit: year of the sale',
  'structure.selldown.fraction': 'Partial exit: share of the sponsor’s stake sold',
  'structure.selldown.event_multiple': 'Partial exit: sale multiple (× that year’s EBITDA)',
};

/** A human label for any assumption path (exact entry, else the nearest labelled parent). */
export function labelFor(path: string): string {
  if (LABELS[path]) return LABELS[path];
  const year = /\.(\d+)$/.exec(path);
  if (year) {
    const parent = path.slice(0, year.index);
    return `${labelFor(parent)}, year ${Number(year[1]) + 1}`;
  }
  const parts = path.split('.');
  for (let k = parts.length - 1; k > 0; k--) {
    const p = parts.slice(0, k).join('.');
    if (LABELS[p]) {
      // a list item reads as "<label> 2 — share pct", 1-based, never "<label> — 1 share_pct"
      const rest = parts.slice(k);
      const idx = /^\d+$/.test(rest[0]) ? ` ${Number(rest.shift()) + 1}` : '';
      return `${LABELS[p]}${idx}${rest.length ? `, ${rest.join(' ').replace(/_/g, ' ')}` : ''}`;
    }
  }
  return path;
}

/** Every NaN leaf under `node`, as dotted paths (array indices included). */
function nanPaths(node: unknown, prefix: string, out: string[]): void {
  if (typeof node === 'number') {
    if (Number.isNaN(node)) out.push(prefix);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => nanPaths(v, `${prefix}.${i}`, out));
    return;
  }
  if (node !== null && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) nanPaths(v, prefix ? `${prefix}.${k}` : k, out);
  }
}

function lineScan(spec: LineSpec | { mode: 'not_modelled' } | { mode: 'pct_of_da'; pct: number } | null, path: string, out: string[]) {
  if (spec !== null) nanPaths(spec, path, out);
}

/**
 * THE Build gate: every input the model will actually read, that is still unset. Inactive
 * fields (a driver whose line is entered directly, §163(j) detail when it does not apply,
 * the multiple when the price is entered) are not demanded.
 */
export function missingInputs(
  facts: DealFacts,
  a: DealAssumptions,
  pending: readonly string[],
): MissingInput[] {
  const miss: string[] = [];
  const ops = a.operations;
  const lines = ops.lines;
  const has = (p: string) => pending.includes(p);

  // ── choices still pending, where they matter ──
  if (has('entry.basis')) miss.push('entry.basis');
  if (has('exit.basis')) miss.push('exit.basis');
  if (has('structure.tranches')) miss.push('structure.tranches');
  if (has('tax.interest_deductible')) miss.push('tax.interest_deductible');
  if (has('tax.s163j.applies') && a.tax.interest_deductible) miss.push('tax.s163j.applies');
  const ebitdaIsDriver = !lines?.ebitda;
  const marginDriverUsable = facts.fy_ebitda_margin !== null;
  if (has('operations.margin_path') && ebitdaIsDriver && marginDriverUsable) miss.push('operations.margin_path');
  const nwcIsDriver = !lines?.delta_nwc;
  if (has('operations.nwc.method') && nwcIsDriver && facts.fy_revenue !== null) miss.push('operations.nwc.method');

  // ── entry / exit ──
  const e = a.entry;
  if (e.driver === 'multiple') nanPaths(e.entry_multiple ?? U, 'entry.entry_multiple', miss);
  else nanPaths(e.enterprise_value ?? U, 'entry.enterprise_value', miss);
  nanPaths(a.exit.multiple, 'exit.multiple', miss);
  nanPaths(a.exit.fees_pct, 'exit.fees_pct', miss);
  nanPaths(a.rollover_equity, 'rollover_equity', miss);

  // ── structure ──
  nanPaths(a.structure.min_cash, 'structure.min_cash', miss);
  const hasTerm = a.structure.tranches.some((t) => t.type !== 'revolver');
  // a leverage grid REPLACES the flat % (§3.5: base_pct is ignored under a grid), so only the
  // basis actually in force is demanded
  if (hasTerm) {
    if (a.structure.sweep.grid) nanPaths(a.structure.sweep.grid, 'structure.sweep.grid', miss);
    else nanPaths(a.structure.sweep.base_pct, 'structure.sweep.base_pct', miss);
  }
  a.structure.tranches.forEach((t, i) => {
    const tm: string[] = [];
    nanPaths(t, `structure.tranches.${i}`, tm);
    // a tranche that does not take the sweep has no sweep priority to enter
    const skip = t.type !== 'revolver' && !t.sweep.participates ? `structure.tranches.${i}.sweep.priority` : null;
    miss.push(...tm.filter((p) => p !== skip));
  });
  for (const opt of ['distributions', 'refinancing', 'surplus_distribution', 'selldown'] as const) {
    if (a.structure[opt] !== null) nanPaths(a.structure[opt], `structure.${opt}`, miss);
  }

  // ── operations: only the drivers the deal actually uses ──
  if (lines) {
    lineScan(lines.revenue, 'operations.lines.revenue', miss);
    lineScan(lines.ebitda, 'operations.lines.ebitda', miss);
    lineScan(lines.da, 'operations.lines.da', miss);
    lineScan(lines.capex, 'operations.lines.capex', miss);
    lineScan(lines.delta_nwc, 'operations.lines.delta_nwc', miss);
    if (lines.year_n_plus_1_growth !== null) nanPaths(lines.year_n_plus_1_growth, 'operations.lines.year_n_plus_1_growth', miss);
    else if (a.exit.basis === 'ntm' || a.valuation !== null) miss.push('operations.lines.year_n_plus_1_growth');
  }
  // A §7 driver the FACTS cannot support (§24.3 R1–R3) is not "blank" — its input MODE is
  // unchosen: the analyst must pick how the line is entered, never fill a driver that cannot run.
  const revenueAvailable = lines?.revenue ? lines.revenue.mode !== 'not_modelled' : facts.fy_revenue !== null;
  if (!lines?.revenue) {
    if (facts.fy_revenue === null) miss.push('operations.lines.revenue');
    else nanPaths(ops.growth, 'operations.growth', miss);
  }
  if (ebitdaIsDriver) {
    if (facts.fy_ebitda_margin === null || !revenueAvailable) miss.push('operations.lines.ebitda');
    else nanPaths(ops.target_margin, 'operations.target_margin', miss);
  }
  if (!lines?.da) {
    if (!revenueAvailable) miss.push('operations.lines.da');
    else nanPaths(ops.da_pct_revenue, 'operations.da_pct_revenue', miss);
  }
  if (!lines?.capex) {
    if (!revenueAvailable) miss.push('operations.lines.capex');
    else {
      nanPaths(ops.maint_capex_pct_revenue, 'operations.maint_capex_pct_revenue', miss);
      nanPaths(ops.growth_capex, 'operations.growth_capex', miss);
    }
  }
  if (nwcIsDriver) {
    if (facts.fy_revenue === null || !revenueAvailable) miss.push('operations.lines.delta_nwc');
    else nanPaths(ops.nwc, 'operations.nwc', miss);
  }

  // ── tax ──
  nanPaths(a.tax.rate, 'tax.rate', miss);
  nanPaths(a.tax.minimum_rate, 'tax.minimum_rate', miss);
  if (a.tax.interest_deductible && a.tax.s163j.applies) nanPaths(a.tax.s163j.ati_pct, 'tax.s163j.ati_pct', miss);
  nanPaths(a.tax.nol.acquired_opening, 'tax.nol.acquired_opening', miss);
  if (has('tax.nol.acquired_usable') && Number.isFinite(a.tax.nol.acquired_opening) && a.tax.nol.acquired_opening > 0) {
    miss.push('tax.nol.acquired_usable');
  }

  // ── fees ──
  nanPaths(a.fees.transaction_pct_of_ev, 'fees.transaction_pct_of_ev', miss);
  if (a.structure.tranches.length > 0) nanPaths(a.fees.financing_pct_of_commitments, 'fees.financing_pct_of_commitments', miss);
  if (a.fees.monitoring !== null) nanPaths(a.fees.monitoring, 'fees.monitoring', miss);

  // ── optional features, when switched on ──
  for (const opt of ['mip', 'sweet_equity', 'warrant', 'fund', 'valuation'] as const) {
    if (a[opt] !== null) nanPaths(a[opt], opt, miss);
  }
  nanPaths(a.covenants, 'covenants', miss);

  // ── choices added on the fly (a new tranche's sweep election, a feature's methods) ──
  for (const p of pending) if (!(CHOICE_PATHS as readonly string[]).includes(p)) miss.push(p);

  // ── facts the chosen drivers need (a §24.3 rejection, surfaced here as a missing input) ──
  if (a.entry.basis === 'fy' && !has('entry.basis') && facts.fy_ebitda === null) miss.push('facts.fy_ebitda');

  return [...new Set(miss)].map((path) => ({ path, label: labelFor(path) }));
}

/** Immutable set-by-path (arrays replaced whole at the addressed node). */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const rec = (node: unknown, i: number): unknown => {
    if (i === keys.length) return value;
    const k = keys[i];
    if (Array.isArray(node)) {
      const copy = [...node];
      copy[Number(k)] = rec(node[Number(k)], i + 1);
      return copy;
    }
    const base = (node ?? {}) as Record<string, unknown>;
    return { ...base, [k]: rec(base[k], i + 1) };
  };
  return rec(obj, 0) as T;
}

/** Resize every per-year array to a new holding period: kept years keep their values, new
 *  years are UNSET (never copied from the last year — that would be an invented ramp). */
export function resizeHold(a: DealAssumptions, holdYears: number): DealAssumptions {
  const fit = (arr: number[], n: number) => Array.from({ length: n }, (_, i) => (i < arr.length ? arr[i] : U));
  const N = holdYears;
  const fitLine = (l: LineSpec | null): LineSpec | null => {
    if (l === null) return null;
    return l.mode === 'explicit' ? { mode: 'explicit', values: fit(l.values, N) } : { mode: 'grown', year1: l.year1, growth: fit(l.growth, N - 1) };
  };
  const lines = a.operations.lines;
  return {
    ...a,
    entry: { ...a.entry, hold_years: N },
    structure: {
      ...a.structure,
      distributions: a.structure.distributions ? fit(a.structure.distributions, N) : null,
    },
    operations: {
      ...a.operations,
      growth: fit(a.operations.growth, N),
      growth_capex: fit(a.operations.growth_capex, N),
      lines: lines && {
        ...lines,
        revenue: lines.revenue && lines.revenue.mode !== 'not_modelled' ? fitLine(lines.revenue) : lines.revenue,
        ebitda: lines.ebitda ? { ...fitLine(lines.ebitda)!, measure: lines.ebitda.measure } : null,
        da: fitLine(lines.da),
        capex: lines.capex && lines.capex.mode === 'pct_of_da' ? lines.capex : fitLine(lines.capex as LineSpec | null),
        delta_nwc: fitLine(lines.delta_nwc),
      },
    },
  };
}
