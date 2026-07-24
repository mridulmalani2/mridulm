/**
 * lib/edgar/mapCompanyFactsIfrs.ts — PHASE_D §D6: IFRS-reporting 20-F filers in SEC
 * companyfacts (facts['ifrs-full']) previously extracted NOTHING (mapXbrl reads only
 * us-gaap). This mapper applies the mapIfrs.ts ifrs-full alias chains to the
 * companyfacts SHAPE (same units/facts arrays as us-gaap — not the ESEF OIM shape).
 *
 * Same reliability rules as mapCompanyFacts: one anchor period (latest full-year
 * revenue), STRICT per-period resolution (a concept missing at the anchor is a GAP,
 * never a cross-year substitution), derived values only when every component resolves,
 * currency honesty (unsupported ⇒ blocking `currency_unsupported`, no USD fallback).
 * Net debt: borrowings + IFRS-16 lease liabilities, leases added ONLY onto a clean
 * borrowings base, never onto BorrowingsAndLeaseLiabilities (double-count guard —
 * mirrors mapIfrs.ts). FPI history is FY-only (no 10-Qs) — noted.
 */

import type { CompanyFacts, XbrlFactValue } from './client';
import type { Provenance, RawHistoricals, SourcedValue } from './types';
import { buildAnnualSeries, deriveSeries } from './history';

const T = 'ifrs-full';
const REVENUE = ['Revenue', 'RevenueFromContractsWithCustomers'];
const OP_PROFIT = ['ProfitLossFromOperatingActivities'];
const DA = ['DepreciationAndAmortisationExpense', 'AdjustmentsForDepreciationAndAmortisationExpense'];
const DEPRECIATION = ['DepreciationExpense', 'DepreciationPropertyPlantAndEquipment'];
const AMORTISATION = ['AmortisationExpense', 'AmortisationOfIntangibleAssetsOtherThanGoodwill'];
const CAPEX = ['PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities', 'PaymentsToAcquirePropertyPlantAndEquipment'];
const CASH = ['CashAndCashEquivalents'];
const CURRENT_ASSETS = ['CurrentAssets'];
const CURRENT_LIABILITIES = ['CurrentLiabilities'];
const BORROW_TOTAL = ['Borrowings'];
const BORROW_BUNDLED = ['BorrowingsAndLeaseLiabilities']; // lease-INCLUSIVE — never add leases on top
const BORROW_NONCURRENT = ['NoncurrentBorrowings', 'BorrowingsNoncurrent', 'NoncurrentPortionOfNoncurrentBorrowings'];
const BORROW_CURRENT = ['CurrentBorrowings', 'BorrowingsCurrent', 'CurrentPortionOfNoncurrentBorrowings'];
const LEASE_TOTAL = ['LeaseLiabilities'];
const LEASE_NONCURRENT = ['NoncurrentLeaseLiabilities', 'LeaseLiabilitiesNoncurrent'];
const LEASE_CURRENT = ['CurrentLeaseLiabilities', 'LeaseLiabilitiesCurrent'];
const TAX_EXPENSE = ['IncomeTaxExpenseContinuingOperations', 'TaxExpenseIncome'];
const PRETAX = ['ProfitLossBeforeTax'];
// Net PP&E (engine2 §8 opening-roll seed) — carrying amount as presented; the
// ROU-inclusive concept only as a stated fallback.
const PPE = ['PropertyPlantAndEquipment', 'PropertyPlantAndEquipmentIncludingRightofuseAssets'];

const KNOWN_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'INR']);
const ANNUAL_FORMS = new Set(['20-F', '20-F/A', '40-F', '40-F/A', '10-K', '10-K/A']);

/** True when the payload should route to this mapper: ifrs-full present, us-gaap absent/sparse. */
export function isIfrsCompanyFacts(facts: CompanyFacts): boolean {
  const ifrs = facts.facts?.[T];
  if (!ifrs || !Object.keys(ifrs).length) return false;
  const usGaap = facts.facts?.['us-gaap'];
  return !usGaap || Object.keys(usGaap).length < 5; // sparse us-gaap (dei stubs etc.)
}

export function mapCompanyFactsIfrs(
  facts: CompanyFacts,
  opts: { unitScale?: number; statutoryTaxRate?: number; sicDescription?: string } = {},
): RawHistoricals {
  const scale = opts.unitScale ?? 1e6;
  const statutory = opts.statutoryTaxRate ?? 0.25;
  const cik10 = facts.cik != null ? `CIK${String(facts.cik).padStart(10, '0')}` : undefined;
  const gaps: string[] = [];
  const sv = (value: number, prov: Provenance): SourcedValue => ({ value, provenance: prov });
  const space = facts.facts?.[T] ?? {};

  const isFullYear = (f: XbrlFactValue) => {
    if (!f.start || !f.end) return false;
    const days = (Date.parse(f.end) - Date.parse(f.start)) / 86_400_000;
    return days >= 350 && days <= 380;
  };
  const isAnnual = (f: XbrlFactValue) => f.fp === 'FY' || (f.form != null && ANNUAL_FORMS.has(f.form));

  const factsFor = (tags: string[]): { tag: string; unit: string; list: XbrlFactValue[] } | null => {
    for (const tag of tags) {
      const units = space[tag]?.units ?? {};
      for (const unit of Object.keys(units)) {
        if (unit === 'shares' || unit === 'pure') continue;
        if (units[unit]?.length) return { tag, unit, list: units[unit] };
      }
    }
    return null;
  };
  const prov = (tag: string, unit: string, f: XbrlFactValue): Provenance => ({
    source: 'edgar',
    detail: `${T}:${tag} · ${f.fp === 'FY' && f.fy ? `FY${f.fy}` : f.end} · ${f.form ?? '20-F'}`,
    tag, taxonomy: T, unit, fy: f.fy, fp: f.fp, form: f.form, accession: f.accn, filed: f.filed, period: f.end,
    url: cik10 && f.accn ? `https://www.sec.gov/Archives/edgar/data/${Number(cik10.replace(/\D/g, ''))}/${f.accn.replace(/-/g, '')}/` : undefined,
  });
  const durationAt = (tags: string[], end?: string) => {
    if (!end) return null;
    const hit = factsFor(tags);
    if (!hit) return null;
    const f = hit.list.find((x) => x.end === end && isFullYear(x)) ?? hit.list.find((x) => x.end === end && isAnnual(x) && (!x.start || (Date.parse(x.end) - Date.parse(x.start)) / 86_400_000 >= 350));
    return f ? { value: f.val / scale, prov: prov(hit.tag, hit.unit, f), tag: hit.tag } : null;
  };
  const instantAt = (tags: string[], end?: string) => {
    if (!end) return null;
    const hit = factsFor(tags);
    if (!hit) return null;
    const f = hit.list.find((x) => x.end === end);
    return f ? { value: f.val / scale, prov: prov(hit.tag, hit.unit, f), tag: hit.tag } : null;
  };

  // Anchor: latest full-year revenue period
  const revHit = factsFor(REVENUE);
  const anchorFact = revHit?.list.filter((f) => isAnnual(f) && isFullYear(f)).reduce<XbrlFactValue | null>((a, b) => (!a || String(b.end) > String(a.end) ? b : a), null) ?? null;
  const anchorEnd = anchorFact?.end;
  const anchorFy = anchorFact?.fy;
  const anchorUnit = revHit?.unit;
  const detectedCcy = anchorUnit && KNOWN_CURRENCIES.has(anchorUnit) ? anchorUnit : undefined;
  const currency_unsupported = anchorUnit && !KNOWN_CURRENCIES.has(anchorUnit) ? anchorUnit : undefined;

  const revenue = durationAt(REVENUE, anchorEnd);
  const fy_revenue = revenue ? sv(revenue.value, revenue.prov) : null;
  if (!fy_revenue) gaps.push('FY revenue');
  const revenueVal = fy_revenue?.value ?? 0;

  const opProfit = durationAt(OP_PROFIT, anchorEnd);
  let daRaw = durationAt(DA, anchorEnd);
  if (!daRaw) {
    const dep = durationAt(DEPRECIATION, anchorEnd);
    const amort = durationAt(AMORTISATION, anchorEnd);
    if (dep && amort) daRaw = { value: dep.value + amort.value, tag: 'derived:DA', prov: { source: 'edgar', detail: `${dep.tag} + ${amort.tag} (derived D&A)`, tag: 'derived:DA', taxonomy: T, unit: dep.prov.unit, fy: anchorFy, period: anchorEnd } };
  }
  const da = daRaw ? sv(daRaw.value, daRaw.prov) : null;
  if (!da) gaps.push('D&A %');
  const fy_ebitda = opProfit && daRaw
    ? sv(opProfit.value + daRaw.value, { source: 'edgar', detail: `${opProfit.tag} + ${daRaw.tag} (derived EBITDA)`, tag: 'derived:EBITDA', taxonomy: T, unit: opProfit.prov.unit, fy: anchorFy, period: anchorEnd, url: opProfit.prov.url })
    : null;
  if (!fy_ebitda) gaps.push('FY EBITDA');

  const capexRaw = durationAt(CAPEX, anchorEnd);
  const capex = capexRaw ? sv(Math.abs(capexRaw.value), capexRaw.prov) : null;
  if (!capex) gaps.push('Capex %');

  // Operating NWC (D2 definition; IFRS component days are the noted follow-up)
  const ca = instantAt(CURRENT_ASSETS, anchorEnd);
  const cl = instantAt(CURRENT_LIABILITIES, anchorEnd);
  const cashRaw = instantAt(CASH, anchorEnd);
  const borrowCur = instantAt(BORROW_CURRENT, anchorEnd);
  const leaseCur = instantAt(LEASE_CURRENT, anchorEnd);
  let nwc: SourcedValue | null = null;
  if (ca && cl && cashRaw) {
    nwc = sv(ca.value - cashRaw.value - (cl.value - (borrowCur?.value ?? 0) - (leaseCur?.value ?? 0)), {
      source: 'edgar', detail: '(CurrentAssets − cash) − (CurrentLiabilities − current borrowings − current leases) — OPERATING NWC (derived)', tag: 'derived:OperatingNWC', taxonomy: T, period: anchorEnd, fy: anchorFy, url: ca.prov.url,
    });
  } else gaps.push('NWC %');

  // Gross debt: clean borrowings base + leases; bundled concept wins alone (no lease add)
  const bundled = instantAt(BORROW_BUNDLED, anchorEnd);
  const borrowTotal = instantAt(BORROW_TOTAL, anchorEnd);
  const borrowSplit = [instantAt(BORROW_NONCURRENT, anchorEnd), borrowCur].filter(Boolean) as { value: number; prov: Provenance; tag: string }[];
  const leaseTotal = instantAt(LEASE_TOTAL, anchorEnd);
  const leaseSplit = [instantAt(LEASE_NONCURRENT, anchorEnd), leaseCur].filter(Boolean) as { value: number; prov: Provenance; tag: string }[];
  let gross_debt: SourcedValue | null = null;
  if (bundled) {
    gross_debt = sv(bundled.value, { ...bundled.prov, detail: `${bundled.tag} (lease-inclusive — no separate lease add)` });
  } else {
    const base = borrowTotal ? [borrowTotal] : borrowSplit;
    if (base.length) {
      const leases = leaseTotal ? [leaseTotal] : leaseSplit;
      const total = base.reduce((s, p) => s + p.value, 0) + leases.reduce((s, p) => s + p.value, 0);
      gross_debt = sv(total, {
        source: 'edgar',
        detail: `${[...base, ...leases].map((p) => p.tag).join(' + ')}${leases.length ? ' (incl. IFRS-16 leases)' : ''} (derived)`,
        tag: 'derived:GrossDebt', taxonomy: T, period: anchorEnd, fy: anchorFy, url: base[0].prov.url,
      });
    }
  }
  const cash = cashRaw ? sv(cashRaw.value, cashRaw.prov) : null;
  // Net PP&E at the anchor (§8 seed) — absence stays null (engine's disclosed 0-seed fallback).
  const ppeRaw = instantAt(PPE, anchorEnd);
  const net_ppe = ppeRaw
    ? sv(ppeRaw.value, ppeRaw.tag === PPE[1]
        ? { ...ppeRaw.prov, detail: `${ppeRaw.prov.detail} (incl. right-of-use assets)` }
        : ppeRaw.prov)
    : null;
  const net_debt = gross_debt
    ? sv(gross_debt.value - (cash?.value ?? 0), { source: 'edgar', detail: cash ? 'Gross debt − cash (derived)' : 'Gross debt (no cash at period) (derived)', tag: 'derived:NetDebt', taxonomy: T, period: anchorEnd, fy: anchorFy })
    : null;
  if (!net_debt) gaps.push('Net debt at entry');

  const taxExp = durationAt(TAX_EXPENSE, anchorEnd);
  const pretax = durationAt(PRETAX, anchorEnd);
  const effective_tax_rate = taxExp && pretax && pretax.value > 0
    ? sv(Math.min(0.6, Math.max(0, taxExp.value / pretax.value)), { source: 'edgar', detail: `${taxExp.tag} ÷ ${pretax.tag} (derived)`, tag: 'derived:EffectiveTaxRate', taxonomy: T, period: anchorEnd, fy: anchorFy })
    : sv(statutory, { source: 'default', detail: `Statutory default ${(statutory * 100).toFixed(0)}% (no derivable effective rate)` });

  // D1 history on ifrs-full (FY-only for FPIs — no 10-Qs; noted)
  const seriesOpts = { kind: 'duration' as const, taxonomy: T, unitScale: scale, unit: anchorUnit };
  const revenueSeries = buildAnnualSeries(facts, 'revenue', REVENUE, seriesOpts);
  const opSeries = buildAnnualSeries(facts, 'operating_income', OP_PROFIT, seriesOpts);
  let daSeries = buildAnnualSeries(facts, 'da', DA, seriesOpts);
  if (!daSeries.points.length) {
    daSeries = deriveSeries('da', [buildAnnualSeries(facts, 'depreciation', DEPRECIATION, seriesOpts), buildAnnualSeries(facts, 'amortization', AMORTISATION, seriesOpts)], ([d, a]) => d + a);
  }
  const history = {
    revenue: revenueSeries,
    operating_income: opSeries,
    da: daSeries,
    capex: buildAnnualSeries(facts, 'capex', CAPEX, seriesOpts),
    ebitda: deriveSeries('ebitda', [opSeries, daSeries], ([oi, d]) => oi + d),
  };

  const margin = fy_ebitda && revenueVal > 0 ? sv(fy_ebitda.value / revenueVal, { source: 'edgar', detail: 'EBITDA ÷ revenue (derived)', tag: 'derived:EBITDAmargin', period: anchorEnd, fy: anchorFy }) : null;
  const pct = (x: SourcedValue | null, label: string): SourcedValue | null =>
    x && revenueVal > 0 ? sv(x.value / revenueVal, { ...x.provenance, detail: `${x.provenance.detail} ÷ revenue (${label})` }) : null;

  return {
    entityName: facts.entityName ?? 'Unknown',
    cik10,
    currency: detectedCcy ?? anchorUnit ?? 'USD',
    currency_unsupported,
    fiscalYear: anchorFy,
    periodEnd: anchorEnd,
    basis: 'FY',
    fy_revenue,
    fy_ebitda,
    ebitda_margin: margin,
    da,
    da_pct_revenue: pct(da, 'D&A %'),
    capex,
    capex_pct_revenue: pct(capex, 'capex %'),
    nwc,
    nwc_pct_revenue: pct(nwc, 'NWC %'),
    gross_debt,
    cash,
    net_debt,
    net_ppe,
    effective_tax_rate,
    nol_carryforward: null, // IFRS DTA disclosures don't map to the US NOL concept — gap by design
    sector: opts.sicDescription ? { value: 0, provenance: { source: 'edgar', detail: `SIC: ${opts.sicDescription}` } } : null,
    gaps,
    history,
    dso: null,
    dio: null,
    dpo: null,
    cogs: null,
    days_notes: ['working-capital days not derived for IFRS companyfacts (component chains are the D6 follow-up) — % method available; FPI history is FY-only (no 10-Qs)'],
    implied_cost_of_debt: null,
  };
}
