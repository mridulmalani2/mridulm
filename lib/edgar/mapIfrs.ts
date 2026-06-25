/**
 * IFRS (ESEF) xBRL-JSON → RawHistoricals mapping (Phase 1+). The European analogue of
 * `mapXbrl.ts`: same output shape, same strict fiscal-year alignment and gap discipline, but it
 * reads OIM xBRL-JSON facts tagged with the `ifrs-full` taxonomy.
 *
 * ESEF reality (verified against live filers): face-statement concepts — revenue, operating
 * profit, tax expense, cash, equity — are reliably `ifrs-full`-tagged, but D&A, borrowings and
 * current assets/liabilities frequently are NOT (issuers tag the primary statements, not the
 * notes, and lean on extension taxonomies). So those land as GAPS the user fills on the review
 * screen — never silently defaulted. Only NON-dimensional facts (no taxonomy axes beyond
 * concept/entity/period/unit) are used, so we take consolidated totals, not segment breakdowns.
 */

import type { XbrlJsonReport, XbrlJsonFact } from './esef';
import type { RawHistoricals, SourcedValue, Provenance } from './types';

const IFRS = 'ifrs-full:';
const STD_DIMS = new Set(['concept', 'entity', 'period', 'unit', 'language', 'noteId']);

// ── IFRS tag alias chains (most-preferred first) ────────────────────────────
const REVENUE = ['Revenue', 'RevenueFromContractsWithCustomers'];
const OPERATING_PROFIT = ['ProfitLossFromOperatingActivities'];
const DA = [
  'DepreciationAndAmortisationExpense',
  'DepreciationAmortisationAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss',
];
const PRETAX = ['ProfitLossBeforeTax'];
const TAX = ['IncomeTaxExpenseContinuingOperations', 'TaxExpenseIncome'];
const CASH = ['CashAndCashEquivalents'];
const BORROWINGS_TOTAL = ['Borrowings'];
const BORROWINGS_NONCURRENT = ['NoncurrentBorrowings'];
const BORROWINGS_CURRENT = ['CurrentBorrowings'];
const CURRENT_ASSETS = ['CurrentAssets'];
const CURRENT_LIABILITIES = ['CurrentLiabilities'];
const CAPEX = [
  'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities',
  'AdditionsOtherThanThroughBusinessCombinationsPropertyPlantAndEquipment',
];

// ── Fact selection ──────────────────────────────────────────────────────────

const isCore = (f: XbrlJsonFact): boolean => Object.keys(f.dimensions).every((k) => STD_DIMS.has(k));
const yr = (iso: string): number => Number(iso.slice(0, 4));

function fiscalYear(f: XbrlJsonFact): number | null {
  const p = f.dimensions.period; if (!p) return null;
  if (p.includes('/')) return yr(p.split('/')[0]);          // duration → fiscal year = year of start
  // Instant (a balance date): period-ends are often encoded as next-day midnight, so shift back.
  const t = Date.parse(p) - 12 * 3_600_000;
  return Number.isNaN(t) ? yr(p) : new Date(t).getUTCFullYear();
}

function isFullYearDuration(f: XbrlJsonFact): boolean {
  const p = f.dimensions.period; if (!p || !p.includes('/')) return false;
  const [s, e] = p.split('/');
  const days = (Date.parse(e) - Date.parse(s)) / 86_400_000;
  return days >= 350 && days <= 380;
}

/** Build concept(tag) → core facts. */
function indexConcepts(report: XbrlJsonReport): Map<string, XbrlJsonFact[]> {
  const m = new Map<string, XbrlJsonFact[]>();
  for (const f of Object.values(report.facts ?? {})) {
    if (!isCore(f)) continue;
    const c = f.dimensions.concept;
    if (!c || !c.startsWith(IFRS)) continue;
    const tag = c.slice(IFRS.length);
    const arr = m.get(tag); if (arr) arr.push(f); else m.set(tag, [f]);
  }
  return m;
}

function firstWithFacts(idx: Map<string, XbrlJsonFact[]>, tags: string[]): { tag: string; facts: XbrlJsonFact[] } | null {
  for (const t of tags) { const fs = idx.get(t); if (fs && fs.length) return { tag: t, facts: fs }; }
  return null;
}

const numeric = (f: XbrlJsonFact): number => (typeof f.value === 'number' ? f.value : parseFloat(String(f.value)));
const unitCurrency = (f: XbrlJsonFact): string | undefined => f.dimensions.unit?.split(':').pop();

// ── Public API ──────────────────────────────────────────────────────────────

export interface MapIfrsOptions {
  unitScale?: number;          // ÷ to reach engine millions. Default 1e6.
  statutoryTaxRate?: number;   // fallback effective rate. Default 0.25.
  entityName?: string;
  reportUrl?: string;          // filings.xbrl.org viewer/report URL, for provenance links
}

const KNOWN_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'INR']);

export function mapIfrsReport(report: XbrlJsonReport, opts: MapIfrsOptions = {}): RawHistoricals {
  const scale = opts.unitScale ?? 1e6;
  const statutory = opts.statutoryTaxRate ?? 0.25;
  const url = opts.reportUrl;
  const idx = indexConcepts(report);
  const M = (v: number) => v / scale;
  const gaps: string[] = [];
  const sv = (value: number, prov: Provenance): SourcedValue => ({ value, provenance: prov });

  // ── Anchor: revenue's latest full-year period ──
  const revHit = firstWithFacts(idx, REVENUE);
  const revFullYears = (revHit?.facts ?? []).filter(isFullYearDuration);
  const anchorFact = revFullYears.length
    ? revFullYears.reduce((a, b) => (Date.parse(b.dimensions.period!.split('/')[1]) > Date.parse(a.dimensions.period!.split('/')[1]) ? b : a))
    : null;
  const anchorFy = anchorFact ? fiscalYear(anchorFact) : null;
  const detectedCcy = anchorFact ? unitCurrency(anchorFact) : undefined;
  const currency = detectedCcy && KNOWN_CURRENCIES.has(detectedCcy) ? detectedCcy : 'EUR';

  const prov = (tag: string, period?: string): Provenance => ({
    source: 'esef', detail: `${IFRS}${tag} · FY${anchorFy ?? '—'} · ESEF`, url,
    tag: `${IFRS}${tag}`, taxonomy: 'ifrs-full', fy: anchorFy ?? undefined, period,
  });
  const derivedProv = (detail: string): Provenance => ({ source: 'esef', detail: `${detail} (derived)`, fy: anchorFy ?? undefined, url });

  /** A flow value (full-year duration) at the anchor fiscal year. */
  const flow = (tags: string[]): { value: number; tag: string; period?: string } | null => {
    const hit = firstWithFacts(idx, tags); if (!hit || anchorFy == null) return null;
    const f = hit.facts.find((x) => isFullYearDuration(x) && fiscalYear(x) === anchorFy);
    return f ? { value: M(numeric(f)), tag: hit.tag, period: f.dimensions.period } : null;
  };
  /** An instant (balance-sheet) value at the anchor fiscal year. */
  const instant = (tags: string[]): { value: number; tag: string; period?: string } | null => {
    const hit = firstWithFacts(idx, tags); if (!hit || anchorFy == null) return null;
    const f = hit.facts.find((x) => !x.dimensions.period?.includes('/') && fiscalYear(x) === anchorFy);
    return f ? { value: M(numeric(f)), tag: hit.tag, period: f.dimensions.period } : null;
  };

  // ── Revenue ──
  const ltm_revenue = anchorFact && revHit ? sv(M(numeric(anchorFact)), prov(revHit.tag, anchorFact.dimensions.period)) : null;
  if (!ltm_revenue) gaps.push('LTM revenue');
  const revenueVal = ltm_revenue?.value ?? 0;

  // ── EBITDA = operating profit + D&A (both must be tagged) ──
  const opinc = flow(OPERATING_PROFIT);
  const daHit = flow(DA);
  const da = daHit ? sv(Math.abs(daHit.value), prov(daHit.tag, daHit.period)) : null;
  let ltm_ebitda: SourcedValue | null = null;
  if (opinc && daHit) ltm_ebitda = sv(opinc.value + Math.abs(daHit.value), derivedProv('Operating profit + D&A'));
  else gaps.push('LTM EBITDA');
  const ebitda_margin = ltm_ebitda && revenueVal > 0 ? sv(ltm_ebitda.value / revenueVal, derivedProv('EBITDA ÷ revenue')) : null;
  const da_pct_revenue = da && revenueVal > 0 ? sv(da.value / revenueVal, derivedProv('D&A ÷ revenue')) : null;
  if (!da) gaps.push('D&A %');

  // ── Capex ──
  const capexHit = flow(CAPEX);
  const capex = capexHit ? sv(Math.abs(capexHit.value), prov(capexHit.tag, capexHit.period)) : null;
  const capex_pct_revenue = capex && revenueVal > 0 ? sv(capex.value / revenueVal, derivedProv('Capex ÷ revenue')) : null;
  if (!capex) gaps.push('Capex %');

  // ── NWC = current assets − current liabilities ──
  const ca = instant(CURRENT_ASSETS);
  const cl = instant(CURRENT_LIABILITIES);
  const nwc = ca && cl ? sv(ca.value - cl.value, derivedProv('Current assets − current liabilities')) : null;
  if (!nwc) gaps.push('NWC %');
  const nwc_pct_revenue = nwc && revenueVal > 0 ? sv(nwc.value / revenueVal, derivedProv('NWC ÷ revenue')) : null;

  // ── Net debt = borrowings − cash ──
  const cashHit = instant(CASH);
  const cash = cashHit ? sv(cashHit.value, prov(cashHit.tag, cashHit.period)) : null;
  const totalBorrow = instant(BORROWINGS_TOTAL);
  const ncBorrow = instant(BORROWINGS_NONCURRENT);
  const cBorrow = instant(BORROWINGS_CURRENT);
  let gross_debt: SourcedValue | null = null;
  if (ncBorrow || cBorrow) {
    gross_debt = sv((ncBorrow?.value ?? 0) + (cBorrow?.value ?? 0), derivedProv('Noncurrent + current borrowings'));
  } else if (totalBorrow) {
    gross_debt = sv(totalBorrow.value, prov(totalBorrow.tag, totalBorrow.period));
  }
  let net_debt: SourcedValue | null = null;
  if (gross_debt) net_debt = sv(gross_debt.value - (cash?.value ?? 0), derivedProv(cash ? 'Gross debt − cash' : 'Gross debt (no cash reported)'));
  else gaps.push('Net debt at entry');

  // ── Effective tax rate (statutory fallback) ──
  const taxExp = flow(TAX);
  const pretax = flow(PRETAX);
  let effective_tax_rate: SourcedValue | null = null;
  if (taxExp && pretax && pretax.value > 0) {
    const rate = Math.min(0.6, Math.max(0, Math.abs(taxExp.value) / pretax.value));
    effective_tax_rate = sv(rate, derivedProv('Income tax expense ÷ pretax profit'));
  } else {
    effective_tax_rate = sv(statutory, { source: 'default', detail: `Statutory default ${(statutory * 100).toFixed(0)}% (no derivable effective rate)` });
  }

  // Period end: ESEF often encodes the year-end instant as the next-day midnight (YYYY-01-01),
  // so normalise that back to the actual closing date (YYYY-1-12-31).
  let periodEnd = anchorFact?.dimensions.period?.split('/')[1]?.slice(0, 10);
  if (periodEnd && /-01-01$/.test(periodEnd)) {
    periodEnd = new Date(Date.parse(periodEnd) - 86_400_000).toISOString().slice(0, 10);
  }

  return {
    entityName: opts.entityName ?? 'Unknown',
    currency,
    fiscalYear: anchorFy ?? undefined,
    periodEnd,
    basis: 'FY',
    ltm_revenue,
    ltm_ebitda,
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
    effective_tax_rate,
    nol_carryforward: null,   // not consistently tagged in ESEF
    sector: null,
    gaps,
  };
}
