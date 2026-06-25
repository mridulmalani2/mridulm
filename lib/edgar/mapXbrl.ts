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
// Components to reconstruct D&A when no combined concept is tagged (require BOTH — depreciation
// alone would understate). Mirrors the IFRS reconstruction in mapIfrs.ts.
const DEPRECIATION_TAGS = ['Depreciation', 'DepreciationNonproduction'];
const AMORTIZATION_TAGS = ['AmortizationOfIntangibleAssets', 'AmortizationOfDeferredChargesAndOtherDeferredCosts'];
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
// us-gaap:LongTermDebt is the roll-up of current+noncurrent BORROWINGS and EXCLUDES leases, so
// finance leases are safe to add on top of it (like the split base). DebtLongtermAndShorttermCombinedAmount
// has ambiguous lease treatment, so leases are NOT added when it is the base.
const LEASE_EXCLUDING_TOTAL_TAGS = new Set(['LongTermDebt']);
// Finance (capital) lease liabilities are debt-like and added to gross debt by default — but ONLY
// when the chosen long-term-debt concept EXCLUDES leases (LongTermDebtNoncurrent), never when it's
// the combined LongTermDebtAndCapitalLeaseObligations (which already includes them → double-count).
// Operating lease liabilities (ASC 842) are conventionally excluded from debt in credit analysis,
// so they are NOT added (this is the US-GAAP analogue of the all-leases IFRS-16 treatment, which
// has no operating/finance split for lessees).
const FINANCE_LEASE_NONCURRENT_TAGS = ['FinanceLeaseLiabilityNoncurrent'];
const FINANCE_LEASE_CURRENT_TAGS = ['FinanceLeaseLiabilityCurrent'];
const LEASE_INCLUSIVE_DEBT_TAGS = new Set(['LongTermDebtAndCapitalLeaseObligations', 'LongTermDebtAndCapitalLeaseObligationsCurrent']);
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
  // The isAnnual fallback exists to catch annual facts whose duration can't be computed (no
  // `start`). It must NOT accept a fact with a computable, clearly sub-year duration (e.g. a Q4 /
  // fiscal-year-change stub tagged fp:'FY') — summing such a stub with a full-year component
  // understates a headline flow (relevant to D&A reconstruction, which sums two facts).
  const notPartial = (x: XbrlFactValue) => !x.start || !x.end || (Date.parse(x.end) - Date.parse(x.start)) / 86_400_000 >= 350;
  const f = m.facts.find((x) => x.end === end && isFullYear(x))
    ?? m.facts.find((x) => x.end === end && isAnnual(x) && notPartial(x));
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
  /** Include finance (capital) lease liabilities in gross/net debt (default true). Operating
   *  leases are always excluded (conventional US credit treatment). */
  includeFinanceLeasesInDebt?: boolean;
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
  // D&A: a combined concept first; else reconstruct from depreciation + amortization (both
  // required — depreciation alone understates). Reconstruction carries derived provenance.
  let daRaw = rawDuration(DA_TAGS, anchorEnd);
  if (!daRaw) {
    const dep = rawDuration(DEPRECIATION_TAGS, anchorEnd);
    const amort = rawDuration(AMORTIZATION_TAGS, anchorEnd);
    if (dep && amort) {
      daRaw = {
        value: dep.value + amort.value, tag: `${dep.tag} + ${amort.tag}`,
        prov: { source: 'edgar', detail: `${dep.tag} + ${amort.tag} (derived D&A)`, tag: 'derived:DA', taxonomy: 'us-gaap', unit: dep.prov.unit, fy: anchorFy, period: anchorEnd, url: dep.prov.url },
      };
    }
  }
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

  // Base debt: prefer the DISJOINT specifics; otherwise fall back to a single aggregate total-debt
  // concept (LongTermDebt / DebtLongtermAndShorttermCombinedAmount). The fallback must never be
  // SILENTLY DROPPED — a lone lease fact must not suppress the real total (which would collapse
  // gross debt to just the lease and flip the deal to false net-cash).
  const splitParts = [ltNon, currentDebt].filter(Boolean) as { value: number; prov: Provenance; tag: string }[];
  const baseFromSplit = splitParts.length > 0;
  const baseParts = baseFromSplit ? splitParts : (totalDebtDirect ? [totalDebtDirect] : []);
  // The aggregate fallback is lease-eligible only when it is the lease-EXCLUDING LongTermDebt (not
  // the ambiguous combined total) — so an identical filer who tags the roll-up concept instead of
  // the split specifics still gets leases added, while a possibly-lease-inclusive combined total
  // does not (avoids double-count).
  const aggregateLeaseExcluding = !baseFromSplit && !!totalDebtDirect && LEASE_EXCLUDING_TOTAL_TAGS.has(totalDebtDirect.tag);

  // Finance (capital) lease liabilities — added by default, but ONLY onto a base that EXCLUDES them
  // (the split specifics, or the lease-excluding aggregate LongTermDebt), and only for the slot that
  // didn't already bundle them:
  //   • a lease-inclusive concept in a slot (LongTermDebtAndCapitalLeaseObligations[Current]) → skip that slot's lease;
  //   • currentDebt sourced from the DebtCurrent TOTAL already includes current finance leases → skip the current lease;
  //   • an AGGREGATE total-debt base has ambiguous lease treatment → add no separate leases (avoids double-count).
  // Operating leases (ASC 842) are intentionally never added.
  const includeFinLeases = opts.includeFinanceLeasesInDebt ?? true;
  const ltNonBundled = !!(ltNon && LEASE_INCLUSIVE_DEBT_TAGS.has(ltNon.tag));
  const ltCurBundled = !!(ltCur && LEASE_INCLUSIVE_DEBT_TAGS.has(ltCur.tag));
  const currentFromTotal = !currentParts.length && !!debtCurrentTotal;   // DebtCurrent bundles current leases
  const finLeaseNon = rawInstant(FINANCE_LEASE_NONCURRENT_TAGS, anchorEnd);
  const finLeaseCur = rawInstant(FINANCE_LEASE_CURRENT_TAGS, anchorEnd);
  const leaseParts = includeFinLeases && (baseFromSplit || aggregateLeaseExcluding)
    ? [ltNonBundled ? null : finLeaseNon, (ltCurBundled || currentFromTotal) ? null : finLeaseCur].filter(Boolean) as { value: number; prov: Provenance; tag: string }[]
    : [];

  const debtParts = [...baseParts, ...leaseParts];
  let gross_debt: SourcedValue | null = null;
  if (debtParts.length) {
    const total = debtParts.reduce((s, p) => s + p.value, 0);
    const leaseNote = leaseParts.length ? ' (incl. finance leases)' : '';
    gross_debt = sv(total, {
      source: 'edgar', detail: `${debtParts.map((p) => p.tag).join(' + ')}${leaseNote} (derived)`, tag: 'derived:GrossDebt',
      period: anchorEnd, fy: anchorFy, url: debtParts[0].prov.url,
    });
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
