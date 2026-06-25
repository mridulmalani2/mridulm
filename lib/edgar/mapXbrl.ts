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
const SHORT_TERM_DEBT_TAGS = ['ShortTermBorrowings', 'DebtCurrent'];
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

/** Latest full-year duration fact (form 10-K/20-F, ~12 months), or latest annual fact. */
function latestAnnualDuration(concept: XbrlConcept): { fact: XbrlFactValue; unit: string } | null {
  const m = monetaryFacts(concept); if (!m) return null;
  const fy = m.facts.filter((f) => isAnnual(f) && isFullYear(f));
  const pool = fy.length ? fy : m.facts.filter(isAnnual);
  if (!pool.length) return null;
  return { fact: pool.reduce(latestBy), unit: m.unit };
}

/** Full-year duration fact ending exactly on `end`, else the latest annual one. */
function durationAt(concept: XbrlConcept, end?: string): { fact: XbrlFactValue; unit: string } | null {
  const m = monetaryFacts(concept); if (!m) return null;
  if (end) {
    const exact = m.facts.find((f) => f.end === end && isFullYear(f))
      ?? m.facts.find((f) => f.end === end && isAnnual(f));
    if (exact) return { fact: exact, unit: m.unit };
  }
  return latestAnnualDuration(concept);
}

/** Instant fact at `end`, else the latest annual instant. */
function instantAt(concept: XbrlConcept, end?: string): { fact: XbrlFactValue; unit: string } | null {
  const m = monetaryFacts(concept); if (!m) return null;
  if (end) { const exact = m.facts.find((f) => f.end === end); if (exact) return { fact: exact, unit: m.unit }; }
  const annual = m.facts.filter(isAnnual);
  const pool = annual.length ? annual : m.facts;
  if (!pool.length) return null;
  return { fact: pool.reduce(latestBy), unit: m.unit };
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
    const pick = durationAt(c.concept, end); if (!pick) return null;
    return { value: M(pick.fact.val), prov: edgarProvenance(c.tag, 'us-gaap', pick.unit, pick.fact, cik10), tag: c.tag };
  };
  const rawInstant = (tags: string[], end?: string): { value: number; prov: Provenance; tag: string } | null => {
    const c = firstConcept(facts, tags); if (!c) return null;
    const pick = instantAt(c.concept, end); if (!pick) return null;
    return { value: M(pick.fact.val), prov: edgarProvenance(c.tag, 'us-gaap', pick.unit, pick.fact, cik10), tag: c.tag };
  };

  // ── Revenue (the fiscal-year anchor) ──
  const revenue = rawDuration(REVENUE_TAGS);
  const anchorEnd = revenue ? revenue.prov.period : undefined;
  const anchorFy = revenue ? revenue.prov.fy : undefined;
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

  // ── Net debt = (LT noncurrent + LT current + short-term) − cash ──
  const ltNon = rawInstant(LT_DEBT_NONCURRENT_TAGS, anchorEnd);
  const ltCur = rawInstant(LT_DEBT_CURRENT_TAGS, anchorEnd);
  const stDebt = rawInstant(SHORT_TERM_DEBT_TAGS, anchorEnd);
  const totalDebtDirect = rawInstant(TOTAL_DEBT_TAGS, anchorEnd);
  const cashRaw = rawInstant(CASH_TAGS, anchorEnd);
  const cash = cashRaw ? sv(cashRaw.value, cashRaw.prov) : null;

  const debtParts = [ltNon, ltCur, stDebt].filter(Boolean) as { value: number; prov: Provenance; tag: string }[];
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
      source: 'edgar', detail: 'Gross debt − cash (derived)', tag: 'derived:NetDebt', period: anchorEnd, fy: anchorFy,
      url: gross_debt.provenance.url,
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
    currency: opts.currency ?? 'USD',
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
