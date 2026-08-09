/**
 * Manual-entry facts + sector inference (post-cutover residue of the old draft layer).
 *
 * The old draft-ModelState bridge died with the F-tail deletion (2026-07-24; tag
 * `pre-deletion-lib-engine`). What remains: `manualHistoricals` (private targets typed by
 * hand → the SAME RawHistoricals shape every mapper emits, feeding engine2) and
 * `inferSector` (EDGAR sicDescription → sector bucket for facts.sector provenance).
 */

import type { RawHistoricals, SourcedValue, Provenance } from './types';
import type { HistorySeries, HistoryPoint } from './history';

/** Map an EDGAR `sicDescription` (free text) onto one of the engine's sector buckets. */
export function inferSector(sic?: string): string {
  if (!sic) return 'Other';
  const s = sic.toLowerCase();
  if (/(software|semiconductor|computer|internet|technolog|electronic)/.test(s)) return 'Technology';
  if (/(pharm|biotech|health|medical|hospital|drug)/.test(s)) return 'Healthcare';
  if (/(bank|insurance|financ|invest|capital|credit)/.test(s)) return 'Financial Services';
  if (/(real estate|reit|property)/.test(s)) return 'Real Estate';
  if (/(oil|gas|energy|petroleum|mining|coal)/.test(s)) return 'Energy';
  if (/(retail|consumer|food|beverage|apparel|restaurant)/.test(s)) return 'Consumer';
  if (/(service|consult|staffing|advertis)/.test(s)) return 'Business Services';
  if (/(manufactur|industrial|machinery|aerospace|construction|chemical)/.test(s)) return 'Industrials';
  return 'Other';
}

/** One hand-entered fiscal year (a CIM / management-accounts column). Every cell is nullable:
 *  a blank stays a BLANK — it becomes a gap/hole downstream, NEVER a fabricated 0. */
export interface ManualYearRow {
  /** Fiscal-year END date, YYYY-MM-DD (period identity is the end date — D1 rule 3). */
  end: string;
  revenue: number | null;
  ebitda: number | null;
  da: number | null;
  capex: number | null;
}

/** The factual inputs a user types on the manual-entry screen — the SAME surface the 10-K/EDGAR
 *  mapper extracts, just sourced by hand (a CIM, a dataroom, management accounts). Decimals for
 *  rates/margins; money in millions of `currency`. */
export interface ManualFactsInput {
  dealName: string;
  sector: string;
  currency: 'USD' | 'EUR' | 'GBP' | 'JPY' | 'INR';
  /** What the SIZING pair (revenue + EBITDA) represents (§1.1): the latest full fiscal year,
   *  or a more-current LTM (the usual CIM presentation). */
  basis: 'FY' | 'LTM';
  /** Required when basis === 'LTM': the LTM sizing pair and its as-of date (drives the
   *  staleness tier exactly as the G-2 quarter-stitch does). Ignored when basis === 'FY'. */
  ltm?: { asOf: string; revenue: number; ebitda: number } | null;
  /** Full fiscal years, ascending by end. The LAST row is the anchor FY — operating rates
   *  (D&A/capex/NWC %) always derive from it, whatever the sizing basis (types.ts §1.1 rule). */
  years: ManualYearRow[];
  /** Operating NWC level at the anchor FY end (millions). */
  nwc: number | null;
  grossDebt: number | null;
  cash: number | null;
  /** Direct net-debt entry — consulted only when grossDebt and cash are not BOTH present
   *  (when both are, net debt is DERIVED as gross − cash; a contradicting third number
   *  cannot be entered). */
  netDebt: number | null;
  netPpe: number | null;
  taxRate: number | null;    // decimal
  nol: number | null;
}

/** Shift a fiscal-year-end date back by whole years, clamping Feb-29 → Feb-28 off leap years.
 *  Shared by the data layer AND the entry screen (one definition for the year-column dates). */
export function shiftYearEnd(end: string, yearsBack: number): string {
  const [y, m, d] = end.split('-').map(Number);
  const t = new Date(Date.UTC(y - yearsBack, m - 1, d));
  if (t.getUTCMonth() !== m - 1) t.setUTCDate(0); // rolled into next month ⇒ clamp to month end
  return t.toISOString().slice(0, 10);
}

/** Approximate duration start for a hand-entered fiscal year: the day after the prior year end. */
const startOfYear = (end: string): string =>
  new Date(Date.parse(shiftYearEnd(end, 1)) + 86_400_000).toISOString().slice(0, 10);

/** Build one metric's HistorySeries from the entered rows — points exist ONLY where the user
 *  typed a value (per-cell blanks stay holes; D1 rule 5: no fake totals, no fake points). */
function manualSeries(
  metric: string,
  rows: ManualYearRow[],
  pick: (r: ManualYearRow) => number | null,
  unit: string,
  tag: string,
): HistorySeries {
  const points: HistoryPoint[] = [];
  for (const r of rows) {
    const v = pick(r);
    if (v === null || !Number.isFinite(v)) continue;
    points.push({ end: r.end, start: startOfYear(r.end), value: v, tag, filed: null, form: null });
  }
  return { metric, points, anchor_tag: points.length ? tag : null, unit, notes: [] };
}

/**
 * Build a RawHistoricals from manually-entered facts — identical SHAPE to what
 * `mapCompanyFacts` produces, with every value tagged 'user' provenance and origin 'manual'.
 * This is what unifies the manual and EDGAR routes: both yield a RawHistoricals that feeds
 * the SAME engine2 adapter → suggest → workbench path. Zero divergence.
 *
 * Honesty rules (the same ones the extraction mappers obey):
 *  - a blank input is a GAP (null + `gaps` entry), never a fabricated 0 tagged 'user';
 *  - derived values (margin, %-rates, EBITDA−D&A operating income, gross−cash net debt)
 *    carry the derivation in their provenance detail;
 *  - operating rates derive from the ANCHOR FY even when the sizing basis is LTM
 *    (da/capex/nwc stay FY-basis rates — types.ts §1.1);
 *  - the multi-year history contains points only where the user typed the cell, so the D1
 *    ≥3-points gate and CAGR spans behave exactly as they do for filings.
 */
export function manualHistoricals(inp: ManualFactsInput): RawHistoricals {
  const userProv = (label: string): Provenance => ({ source: 'user', detail: `Manually entered — ${label}` });
  const sv = (value: number, label: string): SourcedValue => ({ value, provenance: userProv(label) });
  const derived = (value: number, detail: string): SourcedValue => ({ value, provenance: { source: 'user', detail } });
  const has = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

  const years = [...inp.years].sort((a, b) => a.end.localeCompare(b.end));
  const anchor = years.length ? years[years.length - 1] : null;
  const anchorFy = anchor ? anchor.end.slice(0, 4) : '—';
  const gaps: string[] = [];

  // ── Sizing pair (§1.1): LTM when provided, else the anchor FY ──
  const ltm = inp.basis === 'LTM' && inp.ltm && has(inp.ltm.revenue) && has(inp.ltm.ebitda) ? inp.ltm : null;
  const basis: 'FY' | 'LTM' = ltm ? 'LTM' : 'FY';
  const sizingLabel = ltm ? `LTM revenue as of ${ltm.asOf}` : `FY${anchorFy} revenue`;
  const fy_revenue = ltm ? sv(ltm.revenue, sizingLabel)
    : anchor && has(anchor.revenue) ? sv(anchor.revenue, sizingLabel) : null;
  const fy_ebitda = ltm ? sv(ltm.ebitda, `LTM EBITDA as of ${ltm.asOf}`)
    : anchor && has(anchor.ebitda) ? sv(anchor.ebitda, `FY${anchorFy} EBITDA`) : null;
  if (!fy_revenue) gaps.push('FY revenue');
  if (!fy_ebitda) gaps.push('FY EBITDA');
  const ebitda_margin = fy_revenue && fy_ebitda && fy_revenue.value > 0
    ? derived(fy_ebitda.value / fy_revenue.value, `EBITDA ÷ revenue (entered, ${basis === 'LTM' ? `LTM as of ${ltm!.asOf}` : `FY${anchorFy}`})`)
    : null;

  // ── Operating rates: ALWAYS from the anchor FY (never the LTM pair) ──
  const rateOf = (num: number | null | undefined, label: string): SourcedValue | null =>
    anchor && has(num) && has(anchor.revenue) && anchor.revenue > 0
      ? derived(num / anchor.revenue, `${label} ÷ revenue (entered, FY${anchorFy})`)
      : null;
  const da = anchor && has(anchor.da) ? sv(anchor.da, `FY${anchorFy} D&A`) : null;
  const da_pct_revenue = rateOf(anchor?.da, 'D&A');
  if (!da_pct_revenue) gaps.push('D&A %');
  const capex = anchor && has(anchor.capex) ? sv(anchor.capex, `FY${anchorFy} capex`) : null;
  const capex_pct_revenue = rateOf(anchor?.capex, 'Capex');
  if (!capex_pct_revenue) gaps.push('Capex %');
  const nwc = has(inp.nwc) ? sv(inp.nwc, `Operating NWC at FY${anchorFy} end`) : null;
  const nwc_pct_revenue = rateOf(inp.nwc, 'Operating NWC');
  if (!nwc_pct_revenue) gaps.push('NWC %');

  // ── Net debt: derived when BOTH legs are entered; direct entry otherwise; else a gap.
  //    A missing leg NEVER silently becomes 0 (gross without cash is a gap, not gross − 0). ──
  const gross_debt = has(inp.grossDebt) ? sv(inp.grossDebt, 'Gross debt at entry') : null;
  const cash = has(inp.cash) ? sv(inp.cash, 'Cash at entry') : null;
  const net_debt = gross_debt && cash
    ? derived(gross_debt.value - cash.value, 'gross debt − cash (both entered)')
    : has(inp.netDebt) ? sv(inp.netDebt, 'Net debt at entry') : null;
  if (!net_debt) gaps.push('Net debt at entry');

  // ── D1 history from the entered rows (per-cell holes preserved). Operating income is
  //    derived EBITDA − D&A only where BOTH cells exist — the exact inverse of the EDGAR
  //    derivation (EBITDA = operating income + D&A), same no-fake-totals rule. ──
  const history = {
    revenue: manualSeries('revenue', years, (r) => r.revenue, inp.currency, 'user'),
    operating_income: manualSeries('operating_income', years,
      (r) => (has(r.ebitda) && has(r.da) ? r.ebitda - r.da : null), inp.currency, 'user-derived:ebitda−da'),
    da: manualSeries('da', years, (r) => r.da, inp.currency, 'user'),
    capex: manualSeries('capex', years, (r) => r.capex, inp.currency, 'user'),
    ebitda: manualSeries('ebitda', years, (r) => r.ebitda, inp.currency, 'user'),
  };

  return {
    entityName: inp.dealName,
    origin: 'manual',
    currency: inp.currency,
    fiscalYear: anchor ? Number(anchorFy) : undefined,
    periodEnd: anchor?.end,
    basis,
    as_of: ltm ? ltm.asOf : anchor?.end,
    fy_revenue,
    fy_ebitda,
    ebitda_margin,
    da,
    da_pct_revenue,
    capex,
    capex_pct_revenue,
    nwc,
    nwc_pct_revenue,
    gross_debt,
    cash,
    net_debt,
    net_ppe: has(inp.netPpe) ? sv(inp.netPpe, 'Net PP&E at entry') : null, // absent ⇒ engine2 §8 seeds 0 with its disclosed note
    effective_tax_rate: has(inp.taxRate) ? sv(inp.taxRate, 'Effective tax rate') : null, // absent ⇒ adapter's honest statutory-default downgrade
    nol_carryforward: has(inp.nol) && inp.nol > 0 ? sv(inp.nol, 'NOL carryforward') : null,
    // the DETAIL carries the user's actual sector pick — the adapter surfaces provenance
    // detail as facts.sector, so anything else here discards the user's choice (F-tail
    // review MAJOR: "Manually entered — Sector" was reaching the AI prompt verbatim)
    sector: { value: 0, provenance: { source: 'user', detail: inp.sector } },
    // §21.5 [v1.6.0]: the manual dropdown ALREADY carries the nine bucket names, so it IS
    // the comps bucket — no SIC, no inference. Without this line `bucketOverride` is a dead
    // wire and every manual deal silently shows no band [audit B2].
    sectorBucket: inp.sector || null,
    gaps,
    dso: null,
    dio: null,
    dpo: null,
    cogs: null,
    days_notes: [],
    history,
  };
}
