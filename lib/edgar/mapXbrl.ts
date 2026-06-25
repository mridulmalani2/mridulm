/**
 * XBRL → RawHistoricals mapping (Phase 1) — the highest-risk correctness surface: a wrong tag
 * maps to a wrong headline number, which is a trust-killer. Every mapped value:
 *   • is pulled from an explicit alias chain (tag → fallback → fallback), so a filer using a
 *     different concept name still resolves;
 *   • is aligned to ONE fiscal year (anchored on revenue's latest annual period) so revenue,
 *     EBITDA, capex and the balance sheet all come from the same period;
 *   • carries provenance (tag, FY, form, accession, filing link);
 *   • is recorded as a GAP when it cannot be derived — never silently defaulted (the one
 *     exception is the effective tax rate, which falls back to a statutory default flagged as
 *     'default' provenance, since a tax rate is always needed).
 *
 * Monetary XBRL values are absolute; we scale to the engine's millions unit.
 */

import type { CompanyFacts, XbrlConcept, XbrlFactValue } from './client';
import type { RawHistoricals, SourcedValue, Provenance } from './types';

const ANNUAL_FORMS = new Set(['10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A']);

// ── Tag alias chains (most-preferred first) ─────────────────────────────────
const REVENUE_TAGS = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'RevenueFromContractWithCustomerIncludingAssessedTax',
  'Revenues',
  'SalesRevenueNet',
  'SalesRevenueGoodsNet',
];
const OPERATING_INCOME_TAGS = ['OperatingIncomeLoss'];
const DA_TAGS = [
  'DepreciationDepletionAndAmortization',
  'DepreciationAmortizationAndAccretionNet',
  'DepreciationAndAmortization',
  'DepreciationDepletionAndAmortizationNonproductionAndAmortizationOfDeferredCharges',
];
const CAPEX_TAGS = [
  'PaymentsToAcquirePropertyPlantAndEquipment',
  'PaymentsToAcquireProductiveAssets',
  'PaymentsForCapitalImprovements',
];
const ASSETS_CURRENT_TAGS = ['AssetsCurrent'];
const LIABILITIES_CURRENT_TAGS = ['LiabilitiesCurrent'];
const LT_DEBT_NONCURRENT_TAGS = ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations'];
const LT_DEBT_CURRENT_TAGS = ['LongTermDebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent'];
// ShortTermBorrowings is disjoint from the current LT portion. DebtCurrent is the TOTAL current
// debt (it usually already includes the current LT portion), so it's a fallback only — summing
// it alongside LongTermDebtCurrent would double-count (Finding 4).
const SHORT_TERM_DEBT_TAGS = ['ShortTermBorrowings'];
const DEBT_CURRENT_TOTAL_TAGS = ['DebtCurrent'];
const TOTAL_DEBT_TAGS = ['DebtLongtermAndShorttermCombinedAmount', 'LongTermDebt'];
const CASH_TAGS = [
  'CashAndCashEquivalentsAtCarryingValue',
  'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
  'CashAndCashEquivalentsAtCarryingValueIncludingDiscontinuedOperations',
];
const TAX_EXPENSE_TAGS = ['IncomeTaxExpenseBenefit'];
const PRETAX_TAGS = [
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic',
];
const NOL_TAGS = ['OperatingLossCarryforwards'];

/** Currencies the engine models — a detected XBRL unit outside this set falls back to USD. */
const KNOWN_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'INR']);

// ── Concept / fact selection ────────────────────────────────────────────────

function firstConcept(facts: CompanyFacts, tags: string[], taxonomy = 'us-gaap'): { tag: string; concept: XbrlConcept } | null {
  const space = facts.facts?.[taxonomy];
  if (!space) return null;
  for (const tag of tags) {
    const c = space[tag];
    if (c && c.units && Object.keys(c.units).length) return { tag, concept: c };
  }
  return null;
}

function monetaryFacts(concept: XbrlConcept): { unit: string; facts: XbrlFactValue[] } | null {
  const units = concept.units || {};
  if (units.USD?.length) return { unit: 'USD', facts: units.USD };
  // Fall back to the first available unit (foreign filers report e.g. EUR/GBP).
  const key = Object.keys(units).find((k) => k !== 'shares' && k !== 'USD/shares' && units[k]?.length);
  return key ? { unit: key, facts: units[key] } : null;
}

const isAnnual = (f: XbrlFactValue): boolean => f.fp === 'FY' || (f.form != null && ANNUAL_FORMS.has(f.form));

function isFullYear(f: XbrlFactValue): boolean {
  if (!f.start || !f.end) return false;
  const days = (Date.parse(f.end) - Date.parse(f.start)) / 86_400_000;
  return days >= 350 && days <= 380;
}

const latestBy = (a: XbrlFactValue, b: XbrlFactValue) => (Date.parse(b.end) > Date.parse(a.end) ? b : a);

/**
 * Latest FULL-YEAR (~12-month) annual duration fact — used ONLY to find the reporting anchor.
 * Returns null if the concept has only partial/interim periods: we never treat a sub-year
 * period (e.g. a fiscal-year-change transition stub) as a full year (Finding 2).
 */
function latestFullYearDuration(concept: XbrlConcept): { fact: XbrlFactValue; unit: string } | null {
  const m = monetaryFacts(concept); if (!m) return null;
  const fy = m.facts.filter((f) => isAnnual(f) && isFullYear(f));
  if (!fy.length) return null;
  return { fact: fy.reduce(latestBy), unit: m.unit };
}

/**
 * Full-year duration fact ending EXACTLY on the anchor `end`. STRICT — no cross-year drift: if
 * the concept has no fact at the anchor period it returns null (→ a gap), rather than silently
 * substituting a different fiscal year with false provenance (Findings 1 & 3).
 */
function durationAtStrict(concept: XbrlConcept, end?: string): { fact: XbrlFactValue; unit: string } | null {
  if (!end) return null;
  const m = monetaryFacts(concept); if (!m) return null;
  const f = m.facts.find((x) => x.end === end && isFullYear(x))
    ?? m.facts.find((x) => x.end === end && isAnnual(x));
  return f ? { fact: f, unit: m.unit } : null;
}

/** Instant (balance-sheet) fact at EXACTLY the anchor `end`. STRICT — no cross-year drift. */
function instantAtStrict(concept: XbrlConcept, end?: string): { fact: XbrlFactValue; unit: string } | null {
  if (!end) return null;
  const m = monetaryFacts(concept); if (!m) return null;
  const f = m.facts.find((x) => x.end === end);
  return f ? { fact: f, unit: m.unit } : null;
}

// ── Provenance ──────────────────────────────────────────────────────────────

function filingUrl(cik10?: string, accession?: string): string | undefined {
  if (!cik10 || !accession) return undefined;
  const cikNum = Number(cik10.replace(/\D/g, ''));
  const accNoDash = accession.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNoDash}/`;
}

function edgarProvenance(tag: string, taxonomy: string, unit: string, f: XbrlFactValue, cik10?: string): Provenance {
  const periodLabel = f.fp === 'FY' && f.fy ? `FY${f.fy}` : (f.frame ?? f.end);
  return {
    source: 'edgar',
    detail: `${taxonomy}:${tag} · ${periodLabel} · ${f.form ?? '—'}`,
    url: filingUrl(cik10, f.accn),
    tag, taxonomy, unit, fy: f.fy, fp: f.fp, form: f.form, accession: f.accn, filed: f.filed, period: f.end,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface MapOptions {
  /** Divide raw XBRL absolute values by this to reach the engine's millions unit. Default 1e6. */
  unitScale?: number;
  /** Fallback statutory tax rate (decimal) when an effective rate can't be computed. Default 0.21 (US federal). */
  statutoryTaxRate?: number;
  /** Reporting-currency override; defaults to 'USD' (EDGAR). */
  currency?: string;
  /** Sector hint (e.g. SIC description from the submissions payload). */
  sicDescription?: string;
}

export function mapCompanyFacts(facts: CompanyFacts, opts: MapOptions = {}): RawHistoricals {
  const scale = opts.unitScale ?? 1e6;
  const statutory = opts.statutoryTaxRate ?? 0.21;
  const cik10 = facts.cik != null ? `CIK${String(facts.cik).padStart(10, '0')}` : undefined;
  const M = (v: number) => v / scale;
  const gaps: string[] = [];
  const sv = (value: number, prov: Provenance): SourcedValue => ({ value, provenance: prov });

  const rawDuration = (tags: string[], end?: string): { value: number; prov: Provenance; tag: string } | null => {
    const c = firstConcept(facts, tags); if (!c) return null;
    const pick = durationAtStrict(c.concept, end); if (!pick) return null;
    return { value: M(pick.fact.val), prov: edgarProvenance(c.tag, 'us-gaap', pick.unit, pick.fact, cik10), tag: c.tag };
  };
  const rawInstant = (tags: string[], end?: string): { value: number; prov: Provenance; tag: string } | null => {
    const c = firstConcept(facts, tags); if (!c) return null;
    const pick = instantAtStrict(c.concept, end); if (!pick) return null;
    return { value: M(pick.fact.val), prov: edgarProvenance(c.tag, 'us-gaap', pick.unit, pick.fact, cik10), tag: c.tag };
  };

  // ── Reporting anchor: the latest FULL-YEAR period from revenue (or operating income when
  //    revenue is untagged). EVERY figure below is pulled STRICTLY from this one period — a
  //    concept missing at the anchor becomes a gap, never a cross-year substitution. ──
  const revC = firstConcept(facts, REVENUE_TAGS);
  const opC = firstConcept(facts, OPERATING_INCOME_TAGS);
  const anchor = (revC && latestFullYearDuration(revC.concept)) || (opC && latestFullYearDuration(opC.concept)) || null;
  const anchorEnd = anchor?.fact.end;
  const anchorFy = anchor?.fact.fy;
  // Reporting currency = the unit on the anchor fact (USD for EDGAR; EUR/GBP/… for foreign
  // filers). Falls back to USD only when the unit isn't a currency the engine models (Finding 5).
  const detectedCcy = anchor && KNOWN_CURRENCIES.has(anchor.unit) ? anchor.unit : undefined;

  // ── Revenue (strictly at the anchor) ──
  const revenue = rawDuration(REVENUE_TAGS, anchorEnd);
  const ltm_revenue = revenue ? sv(revenue.value, revenue.prov) : null;
  if (!ltm_revenue) gaps.push('LTM revenue');
  const revenueVal = ltm_revenue?.value ?? 0;

  // ── EBITDA = Operating income + D&A ──
  const opinc = rawDuration(OPERATING_INCOME_TAGS, anchorEnd);
  const daRaw = rawDuration(DA_TAGS, anchorEnd);
  const da = daRaw ? sv(daRaw.value, daRaw.prov) : null;
  let ltm_ebitda: SourcedValue | null = null;
  if (opinc && daRaw) {
    ltm_ebitda = sv(opinc.value + daRaw.value, {
      source: 'edgar',
      detail: `OperatingIncomeLoss + ${daRaw.tag} · FY${anchorFy ?? '—'} · 10-K`,
      tag: 'derived:EBITDA', taxonomy: 'us-gaap', unit: opinc.prov.unit, fy: anchorFy, period: anchorEnd,
      url: opinc.prov.url,
    });
  } else {
    gaps.push('LTM EBITDA');
  }
  const ebitda_margin = ltm_ebitda && revenueVal > 0
    ? sv(ltm_ebitda.value / revenueVal, { source: 'edgar', detail: 'EBITDA ÷ revenue (derived)', tag: 'derived:EBITDAmargin', period: anchorEnd, fy: anchorFy, url: ltm_ebitda.provenance.url })
    : null;

  const da_pct = da && revenueVal > 0
    ? sv(da.value / revenueVal, { ...da.provenance, detail: `${da.provenance.detail} ÷ revenue` })
    : null;
  if (!da) gaps.push('D&A %');

  // ── Capex ──
  const capexRaw = rawDuration(CAPEX_TAGS, anchorEnd);
  const capex = capexRaw ? sv(Math.abs(capexRaw.value), capexRaw.prov) : null; // cash-flow sign → magnitude
  const capex_pct = capex && revenueVal > 0
    ? sv(capex.value / revenueVal, { ...capex.provenance, detail: `${capex.provenance.detail} ÷ revenue` })
    : null;
  if (!capex) gaps.push('Capex %');

  // ── Net working capital = current assets − current liabilities ──
  const ac = rawInstant(ASSETS_CURRENT_TAGS, anchorEnd);
  const lc = rawInstant(LIABILITIES_CURRENT_TAGS, anchorEnd);
  let nwc: SourcedValue | null = null;
  if (ac && lc) {
    nwc = sv(ac.value - lc.value, {
      source: 'edgar', detail: 'AssetsCurrent − LiabilitiesCurrent (derived)', tag: 'derived:NWC',
      period: anchorEnd, fy: anchorFy, url: ac.prov.url,
    });
  } else {
    gaps.push('NWC %');
  }
  const nwc_pct = nwc && revenueVal > 0 ? sv(nwc.value / revenueVal, { ...nwc.provenance, detail: 'NWC ÷ revenue (derived)' }) : null;

  // ── Net debt = (LT noncurrent + current debt) − cash ──
  const ltNon = rawInstant(LT_DEBT_NONCURRENT_TAGS, anchorEnd);
  const ltCur = rawInstant(LT_DEBT_CURRENT_TAGS, anchorEnd);
  const stDebt = rawInstant(SHORT_TERM_DEBT_TAGS, anchorEnd);
  const debtCurrentTotal = rawInstant(DEBT_CURRENT_TOTAL_TAGS, anchorEnd);
  const totalDebtDirect = rawInstant(TOTAL_DEBT_TAGS, anchorEnd);
  const cashRaw = rawInstant(CASH_TAGS, anchorEnd);
  const cash = cashRaw ? sv(cashRaw.value, cashRaw.prov) : null;

  // Current debt: prefer the DISJOINT specifics (short-term borrowings + current LT maturities);
  // fall back to DebtCurrent (the total current-debt concept) only when neither is tagged, since
  // DebtCurrent usually already includes the current LT portion (Finding 4 — avoid double-count).
  const currentParts = [stDebt, ltCur].filter(Boolean) as { value: number; prov: Provenance; tag: string }[];
  const currentDebt = currentParts.length
    ? { value: currentParts.reduce((s, p) => s + p.value, 0), tag: currentParts.map((p) => p.tag).join(' + '), prov: currentParts[0].prov }
    : debtCurrentTotal;

  const debtParts = [ltNon, currentDebt].filter(Boolean) as { value: number; prov: Provenance; tag: string }[];
  let gross_debt: SourcedValue | null = null;
  if (debtParts.length) {
    const total = debtParts.reduce((s, p) => s + p.value, 0);
    gross_debt = sv(total, {
      source: 'edgar', detail: `${debtParts.map((p) => p.tag).join(' + ')} (derived)`, tag: 'derived:GrossDebt',
      period: anchorEnd, fy: anchorFy, url: debtParts[0].prov.url,
    });
  } else if (totalDebtDirect) {
    gross_debt = sv(totalDebtDirect.value, totalDebtDirect.prov);
  }
  let net_debt: SourcedValue | null = null;
  if (gross_debt) {
    net_debt = sv(gross_debt.value - (cash?.value ?? 0), {
      source: 'edgar',
      detail: cash ? 'Gross debt − cash (derived)' : 'Gross debt (no cash reported at period) (derived)',
      tag: 'derived:NetDebt', period: anchorEnd, fy: anchorFy, url: gross_debt.provenance.url,
    });
  } else {
    gaps.push('Net debt at entry');
  }

  // ── Effective tax rate = tax expense ÷ pretax income (statutory fallback) ──
  const taxExp = rawDuration(TAX_EXPENSE_TAGS, anchorEnd);
  const pretax = rawDuration(PRETAX_TAGS, anchorEnd);
  let effective_tax_rate: SourcedValue | null = null;
  if (taxExp && pretax && pretax.value > 0) {
    const rate = Math.min(0.6, Math.max(0, taxExp.value / pretax.value)); // clamp out nonsensical ratios
    effective_tax_rate = sv(rate, {
      source: 'edgar', detail: 'IncomeTaxExpenseBenefit ÷ pretax income (derived)', tag: 'derived:EffectiveTaxRate',
      period: anchorEnd, fy: anchorFy, url: taxExp.prov.url,
    });
  } else {
    // Always need a tax rate — fall back to statutory, flagged as a default (not a hard gap).
    effective_tax_rate = sv(statutory, { source: 'default', detail: `Statutory default ${(statutory * 100).toFixed(0)}% (no derivable effective rate)` });
  }

  // ── NOL carryforward (optional — absence is not a gap) ──
  const nolRaw = rawInstant(NOL_TAGS, anchorEnd);
  const nol_carryforward = nolRaw ? sv(nolRaw.value, nolRaw.prov) : null;

  const sector: SourcedValue | null = opts.sicDescription
    ? { value: 0, provenance: { source: 'edgar', detail: `SIC: ${opts.sicDescription}` } }
    : null;

  return {
    entityName: facts.entityName ?? 'Unknown',
    cik10,
    currency: opts.currency ?? detectedCcy ?? 'USD',
    fiscalYear: anchorFy,
    periodEnd: anchorEnd,
    basis: 'FY',
    ltm_revenue,
    ltm_ebitda,
    ebitda_margin,
    da,
    da_pct_revenue: da_pct,
    capex,
    capex_pct_revenue: capex_pct,
    nwc,
    nwc_pct_revenue: nwc_pct,
    gross_debt,
    cash,
    net_debt,
    effective_tax_rate,
    nol_carryforward,
    sector,
    gaps,
  };
}
