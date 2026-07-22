/**
 * IFRS (ESEF) xBRL-JSON → RawHistoricals mapping (Phase 1+). The European analogue of
 * `mapXbrl.ts`: same output shape, same strict fiscal-year alignment and gap discipline, but it
 * mines the WHOLE OIM xBRL-JSON report — not just the standard non-dimensional `ifrs-full` face
 * concepts.
 *
 * ESEF reality (verified against live filers): face-statement concepts — revenue, operating
 * profit, tax expense, cash, equity — are reliably `ifrs-full`-tagged, but D&A, borrowings (esp.
 * IFRS-16 lease liabilities), capex and current assets/liabilities are FREQUENTLY untagged on the
 * face: they live in the notes, in DIMENSIONAL facts, and in issuer EXTENSION taxonomies. So each
 * factual field is resolved by a LAYERED strategy, stopping at the first layer that yields a value
 * (precedence is the core double-counting guard — a higher-confidence total always wins, so parts
 * are never summed on top of a total):
 *
 *   (a) non-dimensional `ifrs-full` alias          — the clean face-statement path
 *   (b) EXPANDED `ifrs-full` alias chains          — incl. cash-flow-statement adjustment lines
 *   (c) EXTENSION-namespace regex on the local-name (only if a/b are silent; trap-denylisted)
 *   (d) COMPONENT RECONSTRUCTION (sum disjoint sub-concepts)
 *   (e) DIMENSIONAL ROLL-UP (sum members across exactly ONE axis, default member excluded)
 *
 * Every recovered value carries a `provenance.detail` stating the method ("extension company:X
 * matched", "reconstructed: …", "summed across N members on …", "borrowings + lease liabilities
 * (IFRS 16)") so each headline number is auditable on the review screen and assertable in tests.
 * A field that NO layer can derive becomes a GAP — surfaced to the user, never silently defaulted.
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
  // Cash-flow-statement reconciliation lines — where function-of-expense filers most often expose D&A.
  'AdjustmentsForDepreciationAndAmortisationExpense',
  'AdjustmentsForDepreciationAmortisationAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss',
];
const DEPRECIATION = ['DepreciationExpense', 'DepreciationPropertyPlantAndEquipment'];
const AMORTISATION = ['AmortisationExpense', 'AmortisationOfIntangibleAssetsOtherThanGoodwill', 'AmortisationIntangibleAssetsOtherThanGoodwill'];
const PRETAX = ['ProfitLossBeforeTax'];
const TAX = ['IncomeTaxExpenseContinuingOperations', 'TaxExpenseIncome'];
const CASH = ['CashAndCashEquivalents'];
const BORROW_TOTAL = ['Borrowings', 'BorrowingsAndLeaseLiabilities'];
const BORROW_NONCURRENT = ['NoncurrentBorrowings', 'BorrowingsNoncurrent', 'NoncurrentPortionOfNoncurrentBorrowings'];
const BORROW_CURRENT = ['CurrentBorrowings', 'BorrowingsCurrent', 'CurrentPortionOfNoncurrentBorrowings'];
const LEASE_TOTAL = ['LeaseLiabilities'];
const LEASE_NONCURRENT = ['NoncurrentLeaseLiabilities', 'LeaseLiabilitiesNoncurrent'];
const LEASE_CURRENT = ['CurrentLeaseLiabilities', 'LeaseLiabilitiesCurrent'];
const CURRENT_ASSETS = ['CurrentAssets'];
const CURRENT_LIABILITIES = ['CurrentLiabilities'];
const INVENTORIES = ['Inventories'];
const RECEIVABLES = ['TradeAndOtherCurrentReceivables', 'CurrentTradeReceivables'];
const OTHER_CA = ['OtherCurrentAssets', 'OtherCurrentFinancialAssets'];
const CURRENT_TAX_ASSET = ['CurrentTaxAssetsCurrent'];
const PAYABLES = ['TradeAndOtherCurrentPayables', 'CurrentTradePayables'];
const CURRENT_TAX_LIAB = ['CurrentTaxLiabilitiesCurrent'];
const CURRENT_PROVISIONS = ['CurrentProvisions'];
const OTHER_CL = ['OtherCurrentLiabilities', 'OtherCurrentFinancialLiabilities'];
const CAPEX = [
  'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities',
  'AdditionsOtherThanThroughBusinessCombinationsPropertyPlantAndEquipment',
  'PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities',
  'AdditionsToNoncurrentAssets',                  // broad → lowest preference
];

// ── Extension-namespace matching (the dangerous layer — heavily guarded) ─────
// Standard / national / infra taxonomy prefixes are NOT issuer extensions — a concept in one of
// these must never be mapped as the entity's own figure (it may be national-GAAP or parent-only).
// The extension scan only considers prefixes OUTSIDE this set.
const STANDARD_PREFIXES = new Set([
  'ifrs-full', 'ifrs', 'ifrs_full', 'esef_cor', 'esef_all', 'esef', 'esma',
  'frc', 'us-gaap', 'srt', 'dei', 'xbrli', 'xbrldi', 'xbrldt', 'link', 'xlink',
  'iso4217', 'utr', 'country', 'currency', 'nace', 'lang',
]);
// Namespace-URI hosts of standard/national/infra taxonomy authorities. The authoritative way to
// tell a standard taxonomy from an issuer extension is the namespace URI, not the (document-local)
// prefix token — a national taxonomy may be bound to a generic prefix like 'core'/'uk-core'. Any
// declared prefix whose URI matches one of these is treated as standard (excluded from the scan).
const STANDARD_URI = /(xbrl\.org|xbrl\.ifrs\.org|ifrs\.org|esma\.europa\.eu|frc\.org\.uk|w3\.org|sec\.gov|fasb\.org|\.iso\.org|xbrl\.sec\.gov|xbrl\.us)/i;
// A global denylist applied to the concept LOCAL-NAME before ANY accept regex, so issuer-specific
// ratios / margins / movements / segment & geography breakdowns / partial subtotals can never
// masquerade as a total. (`rightofuse` blocks an IFRS-16 ROU-only D&A subtotal.)
const EXT_TRAP = /(margin|ratio|percent|pershare|guidance|target|covenant|average|weighted|fairvalue|change|increase|decrease|movement|comparativ|restated|segment|geograph|forecast|growth|yield|maturit|undrawn|available|headroom|number|count|rightofuse)/i;
// Accept regexes (local-name, no spaces — XBRL concepts are camelCase). Anchored to whole names.
// Net debt deliberately EXCLUDES "position" — "net financial position" has no standard sign
// convention (often net CASH), so it must not win terminally; such filers fall to the derived path.
const RX_NET_DEBT = /^net\.?financial\.?(debt|liabilit(y|ies)|indebtedness)$|^net\.?debt$/i;
const RX_BORROW = /^(grossfinancial|totalfinancial|financial|gross|total|bank)?(debt|borrowings|indebtedness)$|^interestbearing(loansand)?(borrowings|liabilities|loans)$|^loansandborrowings$/i;
// Anchored so trailing qualifiers (…OfRightOfUseAssets, …Leases) don't slip a partial subtotal in.
const RX_DA = /^(total)?depreciation(and)?amorti[sz]ation(expense|charge|andimpairment.*)?$/i;
const RX_CAPEX = /^(capitalexpenditures?|capex)$|(additions?|purchaseof|paymentsto.*acquire).*(property|tangible|noncurrentassets)/i;
// OIM domain/default/total members duplicate the sum of their children — exclude from roll-up.
// Anchored to member-naming conventions so a legitimate leaf (e.g. TotalReturnSwapFinancingMember,
// ConsolidatedJointVentureMember) whose name merely contains "total"/"consolidat" is NOT dropped.
const DEFAULT_MEMBER = /(domain|defaultmember)(member)?$|(total|consolidated|aggregated?|allsegments|eliminations?)member$|^(total|aggregate|eliminations?|consolidated|domain)$/i;

// ── Fact selection ──────────────────────────────────────────────────────────

const yr = (iso: string): number => Number(iso.slice(0, 4));

function fiscalYear(f: XbrlJsonFact): number | null {
  const p = f.dimensions.period; if (!p) return null;
  // Use END-of-period semantics for BOTH durations and instants, so a non-December fiscal year
  // (e.g. 30-June) aligns its income statement with its closing balance sheet. (Taking the year of
  // a duration's START disagreed with the instant convention by one for non-calendar filers,
  // blending current-year P&L with the PRIOR year-end balance sheet.) Period-ends are often encoded
  // as next-day midnight, so shift back ~12h before taking the year.
  const end = p.includes('/') ? p.split('/')[1] : p;
  // Parse the DATE part as UTC (append 'Z') so the result is timezone-INVARIANT — the engine runs
  // in browsers across time zones, and a bare `Date.parse('YYYY-01-01T00:00:00')` is local-time,
  // which combined with the fixed −12h shift could land on the wrong year. Shift back ~12h so a
  // next-day-midnight-encoded year-end (YYYY-01-01) maps to the prior fiscal year.
  const t = Date.parse(`${end.slice(0, 10)}T00:00:00Z`) - 12 * 3_600_000;
  return Number.isNaN(t) ? yr(end) : new Date(t).getUTCFullYear();
}

function isFullYearDuration(f: XbrlJsonFact): boolean {
  const p = f.dimensions.period; if (!p || !p.includes('/')) return false;
  const [s, e] = p.split('/');
  const days = (Date.parse(e) - Date.parse(s)) / 86_400_000;
  return days >= 350 && days <= 380;
}

const isInstant = (f: XbrlJsonFact): boolean => !f.dimensions.period?.includes('/');
const numeric = (f: XbrlJsonFact): number => (typeof f.value === 'number' ? f.value : parseFloat(String(f.value)));
const unitCurrency = (f: XbrlJsonFact): string | undefined => f.dimensions.unit?.split(':').pop();
const localOf = (concept: string): string => concept.slice(concept.indexOf(':') + 1);
const prefixOf = (concept: string): string => concept.slice(0, concept.indexOf(':'));

/** A fact paired with its parsed concept (prefix + local-name). */
interface IndexedFact { fact: XbrlJsonFact; concept: string; prefix: string; localName: string; }

interface ReportIndex {
  /** Non-dimensional `ifrs-full` facts, keyed by local-name (layers a/b/d). */
  ifrsByLocal: Map<string, IndexedFact[]>;
  /** ALL non-dimensional facts of ANY namespace (the extension scan, layer c). */
  core: IndexedFact[];
  /** Dimensional facts keyed by full prefixed concept (roll-up candidates, layer e). */
  dimByConcept: Map<string, IndexedFact[]>;
}

function buildIndex(report: XbrlJsonReport): ReportIndex {
  const ifrsByLocal = new Map<string, IndexedFact[]>();
  const core: IndexedFact[] = [];
  const dimByConcept = new Map<string, IndexedFact[]>();
  const push = (m: Map<string, IndexedFact[]>, k: string, v: IndexedFact) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };

  for (const fact of Object.values(report.facts ?? {})) {
    const concept = fact.dimensions.concept; if (!concept || !concept.includes(':')) continue;
    const i: IndexedFact = { fact, concept, prefix: prefixOf(concept), localName: localOf(concept) };
    const axes = Object.keys(fact.dimensions).filter((k) => !STD_DIMS.has(k));
    if (axes.length === 0) {
      core.push(i);
      if (i.prefix === 'ifrs-full') push(ifrsByLocal, i.localName, i);
    } else {
      push(dimByConcept, concept, i);
    }
  }
  return { ifrsByLocal, core, dimByConcept };
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface MapIfrsOptions {
  unitScale?: number;          // ÷ to reach engine millions. Default 1e6.
  statutoryTaxRate?: number;   // fallback effective rate. Default 0.25.
  entityName?: string;
  reportUrl?: string;          // filings.xbrl.org viewer/report URL, for provenance links
  /** Include IFRS-16 lease liabilities in gross/net debt (default true — leverage-relevant). */
  includeLeasesInDebt?: boolean;
}

const KNOWN_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'INR']);

/** A resolved value plus how it was obtained (drives provenance). */
type HitKind = 'ifrs' | 'ext' | 'derived';
interface Hit { value: number; kind: HitKind; method: string; concept?: string; prefix?: string; period?: string; }

export function mapIfrsReport(report: XbrlJsonReport, opts: MapIfrsOptions = {}): RawHistoricals {
  const scale = opts.unitScale ?? 1e6;
  const statutory = opts.statutoryTaxRate ?? 0.25;
  const includeLeases = opts.includeLeasesInDebt ?? true;
  const url = opts.reportUrl;
  const idx = buildIndex(report);
  // Standard/national taxonomy prefixes for THIS report: the static set plus any declared prefix
  // whose namespace URI resolves to a standard authority (catches national taxonomies bound to
  // generic prefixes like 'core'/'uk-core'). The extension scan considers only prefixes outside it.
  const standardPrefixes = new Set(STANDARD_PREFIXES);
  for (const [prefix, uri] of Object.entries(report.documentInfo?.namespaces ?? {})) {
    if (typeof uri === 'string' && STANDARD_URI.test(uri)) standardPrefixes.add(prefix);
  }
  const M = (v: number) => v / scale;
  const gaps: string[] = [];
  const sv = (value: number, prov: Provenance): SourcedValue => ({ value, provenance: prov });
  const round1 = (v: number) => Math.round(v * 10) / 10;

  // ── Anchor: latest full-year revenue period (operating profit if revenue is untagged) ──
  const ifrsFactsFor = (aliases: string[]): IndexedFact[] => {
    for (const tag of aliases) { const fs = idx.ifrsByLocal.get(tag); if (fs && fs.length) return fs; }
    return [];
  };
  const endMs = (i: IndexedFact) => Date.parse(i.fact.dimensions.period!.split('/')[1]);
  const latestFY = (facts: IndexedFact[]) => {
    const fy = facts.filter((i) => isFullYearDuration(i.fact));
    return fy.length ? fy.reduce((a, b) => (endMs(b) > endMs(a) ? b : a)) : null;
  };
  const anchorFact = latestFY(ifrsFactsFor(REVENUE)) ?? latestFY(ifrsFactsFor(OPERATING_PROFIT));
  const anchorFy = anchorFact ? fiscalYear(anchorFact.fact) : null;
  const detectedCcy = anchorFact ? unitCurrency(anchorFact.fact) : undefined;
  const currency = detectedCcy && KNOWN_CURRENCIES.has(detectedCcy) ? detectedCcy : 'EUR';

  const prov = (tag: string, period?: string): Provenance => ({
    source: 'esef', detail: `${IFRS}${tag} · FY${anchorFy ?? '—'} · ESEF`, url,
    tag: `${IFRS}${tag}`, taxonomy: 'ifrs-full', fy: anchorFy ?? undefined, period,
  });
  const derivedProv = (detail: string): Provenance => ({ source: 'esef', detail: `${detail} (derived)`, fy: anchorFy ?? undefined, url });
  const provHit = (h: Hit): Provenance => {
    if (h.kind === 'ifrs') return prov(localOf(h.concept!), h.period);
    if (h.kind === 'ext') return { source: 'esef', detail: h.method, url, tag: h.concept, taxonomy: h.prefix, fy: anchorFy ?? undefined, period: h.period };
    return derivedProv(h.method);
  };

  // ── Layer helpers (all return Hit | null, scaled to millions) ──
  const matchesAnchor = (f: XbrlJsonFact, wantInstant: boolean): boolean =>
    fiscalYear(f) === anchorFy && (wantInstant ? isInstant(f) : isFullYearDuration(f));

  /** Layers a+b: first ifrs-full alias with a fact at the anchor (scans EVERY alias, not just the
   *  first tag present — a preferred tag with no anchor-period fact must fall through to the next). */
  const ifrsAt = (aliases: string[], wantInstant: boolean): Hit | null => {
    for (const tag of aliases) {
      const fs = idx.ifrsByLocal.get(tag); if (!fs) continue;
      const m = fs.find((i) => matchesAnchor(i.fact, wantInstant));
      if (m) return { value: M(numeric(m.fact)), kind: 'ifrs', method: `${IFRS}${tag}`, concept: `${IFRS}${tag}`, period: m.fact.dimensions.period };
    }
    return null;
  };
  const ifrsFlow = (a: string[]) => ifrsAt(a, false);
  const ifrsInstant = (a: string[]) => ifrsAt(a, true);

  /** Layer c: extension-namespace scan by local-name regex, with trap denylist + tie-break.
   *  Only ISSUER-extension prefixes are considered (standard/national/infra taxonomies excluded),
   *  so a national-GAAP or parent-only concept can never become the consolidated headline. */
  const extAt = (rx: RegExp, wantInstant: boolean, sanityMax?: number): Hit | null => {
    const cands = idx.core.filter((i) =>
      !standardPrefixes.has(i.prefix) && !EXT_TRAP.test(i.localName) && rx.test(i.localName) && matchesAnchor(i.fact, wantInstant));
    if (!cands.length) return null;
    // Tie-break: (1) unit currency == anchor currency, (2) magnitude sanity, then (3) prefer the
    // LARGEST magnitude (a total is, by construction, ≥ any one of its component sub-lines — so a
    // short generic sub-line like company:Debt can't beat company:TotalBorrowings), (4) shortest name.
    let pool = cands;
    const ccy = pool.filter((i) => unitCurrency(i.fact) === detectedCcy);
    if (ccy.length) pool = ccy;
    if (sanityMax != null) { const ok = pool.filter((i) => Math.abs(M(numeric(i.fact))) <= sanityMax); if (ok.length) pool = ok; }
    pool = [...pool].sort((a, b) => Math.abs(numeric(b.fact)) - Math.abs(numeric(a.fact)) || a.localName.length - b.localName.length || a.localName.localeCompare(b.localName));
    const pick = pool[0];
    const rejected = cands.length - 1;
    return { value: M(numeric(pick.fact)), kind: 'ext', concept: pick.concept, prefix: pick.prefix, period: pick.fact.dimensions.period,
      method: `extension ${pick.concept} matched${rejected > 0 ? ` (${rejected} other candidate(s) rejected)` : ''}` };
  };

  /** Layer e: a dimensional aggregate, validated. Only accepts when an explicit domain/total member
   *  exists on a SINGLE axis AND the leaf members reconcile to it (within 2%) — so an INCOMPLETE
   *  breakdown can never be passed off as a total. If nothing reconciles, returns null → the field
   *  stays a gap ('missing') rather than a fabricated headline number. */
  const rollup = (concept: string, wantInstant: boolean): Hit | null => {
    const facts = idx.dimByConcept.get(concept); if (!facts) return null;
    const elig = facts.filter((i) => {
      const axes = Object.keys(i.fact.dimensions).filter((k) => !STD_DIMS.has(k));
      return axes.length === 1 && matchesAnchor(i.fact, wantInstant);
    });
    if (!elig.length) return null;
    const axes = new Set(elig.map((i) => Object.keys(i.fact.dimensions).filter((k) => !STD_DIMS.has(k))[0]));
    if (axes.size !== 1) return null;                 // cross-tabulated / ambiguous → abort
    const axis = [...axes][0];
    const memberLocal = (i: IndexedFact) => localOf(i.fact.dimensions[axis] ?? '');
    const totals = elig.filter((i) => DEFAULT_MEMBER.test(memberLocal(i)));
    // Require EXACTLY ONE authoritative total/domain member. Zero → can't validate completeness;
    // more than one (e.g. an "Aggregated" subtotal AND a "Consolidated" total) → ambiguous which is
    // the real total, and picking the first would let a subtotal masquerade as the whole. Either
    // way, fall through to a gap rather than risk a wrong headline number.
    if (totals.length !== 1) return null;
    const domain = totals[0];
    const leaves = elig.filter((i) => i !== domain && !DEFAULT_MEMBER.test(memberLocal(i)));
    // Need parts that reconcile to the total — never fabricate a total from a partial member set.
    if (!leaves.length) return null;
    const domainVal = numeric(domain.fact);
    const sum = leaves.reduce((s, i) => s + numeric(i.fact), 0);
    if (domainVal === 0 || Math.abs(sum - domainVal) > Math.abs(domainVal) * 0.02) return null;
    return { value: M(domainVal), kind: 'derived', method: `${concept}: ${leaves.length} member(s) reconcile to the reported total on ${localOf(axis)}` };
  };

  const firstHit = (...fns: Array<() => Hit | null>): Hit | null => {
    for (const f of fns) { const h = f(); if (h) return h; }
    return null;
  };

  // ── Revenue (the anchor figure) ──
  const revHit = ifrsFlow(REVENUE);
  const fy_revenue = revHit ? sv(revHit.value, provHit(revHit)) : null;
  if (!fy_revenue) gaps.push('FY revenue');
  const revenueVal = fy_revenue?.value ?? 0;
  const sanity = revenueVal > 0 ? revenueVal * 50 : undefined;

  // ── EBITDA = operating profit + D&A ──
  const opHit = ifrsFlow(OPERATING_PROFIT);
  const reconstructDA = (): Hit | null => {
    const dep = ifrsFlow(DEPRECIATION); const amo = ifrsFlow(AMORTISATION);
    if (!dep || !amo) return null;                    // require both, else risk understating D&A
    return { value: Math.abs(dep.value) + Math.abs(amo.value), kind: 'derived', method: 'D&A reconstructed: depreciation + amortisation' };
  };
  // Reconstruction (clean ifrs-full depreciation + amortisation) is preferred OVER the regex
  // extension scan — a higher-confidence taxonomy figure beats a pattern-matched extension subtotal.
  const daHit = firstHit(() => ifrsFlow(DA), reconstructDA, () => extAt(RX_DA, false, sanity));
  const da = daHit ? sv(Math.abs(daHit.value), provHit(daHit)) : null;
  if (!da) gaps.push('D&A %');
  let fy_ebitda: SourcedValue | null = null;
  if (opHit && daHit) fy_ebitda = sv(opHit.value + Math.abs(daHit.value), derivedProv('Operating profit + D&A'));
  else gaps.push('FY EBITDA');
  const ebitda_margin = fy_ebitda && revenueVal > 0 ? sv(fy_ebitda.value / revenueVal, derivedProv('EBITDA ÷ revenue')) : null;
  const da_pct_revenue = da && revenueVal > 0 ? sv(da.value / revenueVal, derivedProv('D&A ÷ revenue')) : null;

  // ── Capex ──
  const capexHit = firstHit(() => ifrsFlow(CAPEX), () => extAt(RX_CAPEX, false, sanity));
  const capex = capexHit ? sv(Math.abs(capexHit.value), provHit(capexHit)) : null;
  const capex_pct_revenue = capex && revenueVal > 0 ? sv(capex.value / revenueVal, derivedProv('Capex ÷ revenue')) : null;
  if (!capex) gaps.push('Capex %');

  // ── Cash ──
  const cashHit = ifrsInstant(CASH);
  const cash = cashHit ? sv(cashHit.value, provHit(cashHit)) : null;

  // ── NWC = current assets − current liabilities ──
  const sumParts = (parts: Array<Hit | null>, labels: string[], min: number): Hit | null => {
    const kept = parts.map((h, i) => ({ h, label: labels[i] })).filter((x) => x.h) as { h: Hit; label: string }[];
    if (kept.length < min) return null;
    return { value: kept.reduce((s, x) => s + x.h.value, 0), kind: 'derived', method: `reconstructed: ${kept.map((x) => x.label).join(' + ')}` };
  };
  const reconstructCA = (): Hit | null => sumParts(
    [ifrsInstant(INVENTORIES), ifrsInstant(RECEIVABLES), ifrsInstant(OTHER_CA), ifrsInstant(CURRENT_TAX_ASSET), cashHit],
    ['inventories', 'receivables', 'other current assets', 'current tax', 'cash'], 2);
  const reconstructCL = (): Hit | null => sumParts(
    [ifrsInstant(PAYABLES), ifrsInstant(CURRENT_TAX_LIAB), ifrsInstant(CURRENT_PROVISIONS), ifrsInstant(OTHER_CL), ifrsInstant(BORROW_CURRENT), ifrsInstant(LEASE_CURRENT)],
    ['payables', 'current tax', 'provisions', 'other current liabilities', 'current borrowings', 'current lease'], 2);
  const caHit = firstHit(() => ifrsInstant(CURRENT_ASSETS), reconstructCA, () => rollup(`${IFRS}CurrentAssets`, true));
  const clHit = firstHit(() => ifrsInstant(CURRENT_LIABILITIES), reconstructCL, () => rollup(`${IFRS}CurrentLiabilities`, true));
  const nwc = caHit && clHit ? sv(caHit.value - clHit.value, derivedProv(`Current assets [${caHit.method}] ${round1(caHit.value)} − current liabilities [${clHit.method}] ${round1(clHit.value)}`)) : null;
  if (!nwc) gaps.push('NWC %');
  const nwc_pct_revenue = nwc && revenueVal > 0 ? sv(nwc.value / revenueVal, derivedProv('NWC ÷ revenue')) : null;

  // ── Gross / net debt = borrowings (+ IFRS-16 lease liabilities) − cash ──
  // Borrowings (bank/bond, excluding leases): prefer split (noncurrent + current), then a total,
  // then an extension match, then a dimensional roll-up.
  const borrowNC = ifrsInstant(BORROW_NONCURRENT);
  const borrowC = ifrsInstant(BORROW_CURRENT);
  let borrowings: Hit | null = null;
  let leasesAlreadyIn = false;
  if (borrowNC || borrowC) {
    borrowings = { value: (borrowNC?.value ?? 0) + (borrowC?.value ?? 0), kind: 'derived', method: 'noncurrent + current borrowings' };
  } else {
    const total = ifrsInstant(BORROW_TOTAL);
    if (total) { borrowings = total; if (localOf(total.concept!) === 'BorrowingsAndLeaseLiabilities') leasesAlreadyIn = true; }
    else borrowings = firstHit(() => extAt(RX_BORROW, true, sanity), () => rollup(`${IFRS}Borrowings`, true));
  }

  // Lease liabilities are added ONLY when the borrowings figure is a clean ifrs-full bank/bond
  // concept that excludes leases by taxonomy definition (split, ifrs-full:Borrowings, or a
  // reconciled roll-up of ifrs-full:Borrowings). An ISSUER-EXTENSION total (kind 'ext') has
  // unstandardised lease treatment — it frequently ALREADY bundles IFRS-16 leases — so we never add
  // leases on top of it (that would double-count); we surface the uncertainty in provenance instead.
  const leaseCandidate = (() => {
    const leaseNC = ifrsInstant(LEASE_NONCURRENT); const leaseC = ifrsInstant(LEASE_CURRENT);
    if (leaseNC || leaseC) return (leaseNC?.value ?? 0) + (leaseC?.value ?? 0);
    const lt = ifrsInstant(LEASE_TOTAL); return lt ? lt.value : 0;
  })();
  const borrowingsAmbiguous = borrowings?.kind === 'ext';
  const addLeases = includeLeases && !!borrowings && !leasesAlreadyIn && !borrowingsAmbiguous;
  const lease = addLeases ? leaseCandidate : 0;

  let gross_debt: SourcedValue | null = null;
  if (borrowings) {
    const total = borrowings.value + lease;
    if (lease > 0) {
      gross_debt = sv(total, derivedProv(`borrowings (${round1(borrowings.value)}) + lease liabilities (${round1(lease)}) (IFRS 16)`));
    } else if (borrowingsAmbiguous && leaseCandidate > 0) {
      // Borrowings from an issuer-extension total; lease liabilities exist separately but are NOT
      // added because the extension total may already include them — flag for the analyst.
      gross_debt = sv(borrowings.value, { source: 'esef', detail: `${borrowings.method}; ${round1(leaseCandidate)} lease liabilities NOT added (issuer-extension total — verify IFRS-16 inclusion)`, url, taxonomy: borrowings.prefix, tag: borrowings.concept, fy: anchorFy ?? undefined });
    } else {
      gross_debt = sv(total, provHit(borrowings));
    }
  }

  // Reported net debt as an issuer extension wins terminally (it already nets cash).
  const reportedNetDebt = extAt(RX_NET_DEBT, true, sanity);
  let net_debt: SourcedValue | null = null;
  if (reportedNetDebt) {
    net_debt = sv(reportedNetDebt.value, provHit(reportedNetDebt));
  } else if (gross_debt) {
    const leaseNote = lease > 0 ? ' incl. lease liabilities (IFRS 16)' : '';
    // net_debt is the field the draft/review actually consume, so the lease-ambiguity caveat must
    // ride on IT (not only gross_debt) — otherwise the analyst sees a confident, possibly
    // lease-understated leverage figure with no flag at the point of use.
    const ambigNote = borrowingsAmbiguous && leaseCandidate > 0
      ? ` — ${round1(leaseCandidate)} lease liabilities excluded (issuer-extension total; may understate IFRS-16 leverage — verify)`
      : '';
    net_debt = sv(gross_debt.value - (cash?.value ?? 0), derivedProv(
      `Gross debt (${round1(gross_debt.value)})${leaseNote} − cash (${round1(cash?.value ?? 0)})${cash ? '' : ' — no cash reported'}${ambigNote}`));
  } else {
    gaps.push('Net debt at entry');
  }

  // ── Effective tax rate (statutory fallback) ──
  const taxHit = ifrsFlow(TAX);
  const pretaxHit = ifrsFlow(PRETAX);
  let effective_tax_rate: SourcedValue | null = null;
  if (taxHit && pretaxHit && pretaxHit.value > 0) {
    const rate = Math.min(0.6, Math.max(0, Math.abs(taxHit.value) / pretaxHit.value));
    effective_tax_rate = sv(rate, derivedProv('Income tax expense ÷ pretax profit'));
  } else {
    effective_tax_rate = sv(statutory, { source: 'default', detail: `Statutory default ${(statutory * 100).toFixed(0)}% (no derivable effective rate)` });
  }

  // Period end: ESEF often encodes the year-end instant as the next-day midnight (YYYY-01-01),
  // so normalise that back to the actual closing date (YYYY-1-12-31).
  let periodEnd = anchorFact?.fact.dimensions.period?.split('/')[1]?.slice(0, 10);
  if (periodEnd && /-01-01$/.test(periodEnd)) {
    periodEnd = new Date(Date.parse(periodEnd) - 86_400_000).toISOString().slice(0, 10);
  }

  return {
    entityName: opts.entityName ?? 'Unknown',
    currency,
    fiscalYear: anchorFy ?? undefined,
    periodEnd,
    basis: 'FY',
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
    effective_tax_rate,
    nol_carryforward: null,   // not consistently tagged in ESEF
    sector: null,
    gaps,
  };
}
