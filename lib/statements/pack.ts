/**
 * lib/statements/pack.ts — build the StatementPack beside a RawHistoricals (plan §3).
 *
 * Every route (EDGAR us-gaap, EDGAR IFRS, ESEF, upload, manual) gets a pack from what its
 * RawHistoricals already holds: the five history series and the anchor balance-sheet figures.
 * The EDGAR us-gaap route is then WIDENED from the companyfacts payload (more lines, more
 * years, and the detected adjustment candidates).
 *
 * Rules: reuse lib/edgar/history.ts for period resolution (one resolver, not two); a cell that
 * does not resolve is absent; a subtotal appears only when the filing tags it or every
 * component resolves; nothing is plugged.
 */
import type { CompanyFacts } from '../edgar/client';
import type { Provenance, ProvenanceSource, RawHistoricals, SourcedValue } from '../edgar/types';
import { buildAnnualSeries, type HistoryPoint, type HistorySeries } from '../edgar/history';
import {
  AP_TAGS, AR_TAGS, CASH_TAGS, COGS_TAGS, INTEREST_EXPENSE_TAGS, INVENTORY_TAGS, PPE_NET_TAGS,
  PRETAX_TAGS, SHORT_TERM_INVESTMENT_TAGS, TAX_EXPENSE_TAGS, filingUrl,
} from '../edgar/mapXbrl';
import { EBITDA_CANDIDATE_TAGS, NET_DEBT_CANDIDATE_TAGS } from './candidateTags';
import type { AdjustmentCandidate, Cell, Gaap, LineId, Period, PeriodKey, StatementPack } from './types';

/** How many fiscal years the grid shows. A display width, not a modelling assumption. */
export const PACK_FISCAL_YEARS = 5;

/** D&A aliases that include financing-cost amortisation or accretion (plan §3.1 D4). EBITDA built
 *  on them is overstated by that amount; the cell carries a note and the Clean step flags it. */
export const DA_ALIASES_WITH_FINANCING_COSTS: ReadonlySet<string> = new Set([
  'DepreciationAmortizationAndAccretionNet',
  'DepreciationDepletionAndAmortizationNonproductionAndAmortizationOfDeferredCharges',
]);
const DA_ALIAS_NOTE =
  'This D&A concept includes amortisation of financing costs or accretion, so EBITDA built on it is overstated by that amount. Check the cash-flow statement and restate D&A if needed.';

export interface PackInput {
  raw: RawHistoricals;
  /** The same extraction with lease liabilities left OUT of gross debt. null ⇔ this route cannot
   *  separate them (manual, upload), in which case "Borrowings" is gross debt as sourced. */
  rawExLeases: RawHistoricals | null;
  gaap: Gaap;
  /** companyfacts payload (EDGAR us-gaap) — widens the pack and enables detected candidates. */
  facts?: CompanyFacts;
}

const ORIGIN_SOURCE: Record<NonNullable<RawHistoricals['origin']>, ProvenanceSource> = {
  edgar: 'edgar', esef: 'esef', upload: 'upload', manual: 'user',
};

/** us-gaap alias chains for the lines the RawHistoricals does not carry. */
const US_GAAP_LINES: { id: LineId; tags: string[]; kind: 'duration' | 'instant'; abs?: boolean }[] = [
  { id: 'cogs', tags: COGS_TAGS, kind: 'duration' },
  { id: 'gross_profit', tags: ['GrossProfit'], kind: 'duration' },
  { id: 'sga', tags: ['SellingGeneralAndAdministrativeExpense'], kind: 'duration' },
  { id: 'rnd', tags: ['ResearchAndDevelopmentExpense'], kind: 'duration' },
  { id: 'interest_expense', tags: INTEREST_EXPENSE_TAGS, kind: 'duration' },
  { id: 'pretax_income', tags: PRETAX_TAGS, kind: 'duration' },
  { id: 'tax_expense', tags: TAX_EXPENSE_TAGS, kind: 'duration' },
  { id: 'net_income', tags: ['NetIncomeLoss'], kind: 'duration' },
  { id: 'cfo', tags: ['NetCashProvidedByUsedInOperatingActivities'], kind: 'duration' },
  { id: 'sbc', tags: ['ShareBasedCompensation'], kind: 'duration' },
  { id: 'acquisitions', tags: ['PaymentsToAcquireBusinessesNetOfCashAcquired'], kind: 'duration', abs: true },
  { id: 'cash', tags: CASH_TAGS, kind: 'instant' },
  { id: 'st_investments', tags: SHORT_TERM_INVESTMENT_TAGS, kind: 'instant' },
  { id: 'receivables', tags: AR_TAGS, kind: 'instant' },
  { id: 'inventory', tags: INVENTORY_TAGS, kind: 'instant' },
  { id: 'payables', tags: AP_TAGS, kind: 'instant' },
  { id: 'net_ppe', tags: PPE_NET_TAGS, kind: 'instant' },
  { id: 'goodwill', tags: ['Goodwill'], kind: 'instant' },
  { id: 'total_equity', tags: ['StockholdersEquity'], kind: 'instant' },
  { id: 'operating_lease_liab', tags: ['OperatingLeaseLiability'], kind: 'instant' },
];

/** The accession of the fact a history point resolved from (history.ts does not carry it). */
function accessionOf(facts: CompanyFacts | undefined, taxonomy: string, p: HistoryPoint): string | undefined {
  const units = facts?.facts?.[taxonomy]?.[p.tag]?.units;
  if (!units) return undefined;
  for (const list of Object.values(units)) {
    const hit = list.find((f) => f.end === p.end && (f.filed ?? null) === p.filed);
    if (hit) return hit.accn;
  }
  return undefined;
}

export function buildStatementPack(inp: PackInput): StatementPack {
  const { raw, rawExLeases, gaap, facts } = inp;
  const source = ORIGIN_SOURCE[raw.origin ?? 'edgar'];
  const taxonomy = gaap === 'ifrs' ? 'ifrs-full' : 'us-gaap';
  const notes: string[] = [];
  const lines: StatementPack['lines'] = {};
  const anchor: PeriodKey | null = raw.periodEnd ?? null;

  // ── periods: the latest fiscal years with revenue history (plus the anchor), then LTM ──
  const startOf = new Map<string, string | null>();
  for (const p of raw.history?.revenue.points ?? []) startOf.set(p.end, p.start);
  if (anchor && !startOf.has(anchor)) startOf.set(anchor, null);
  const fyEnds = [...startOf.keys()].sort().filter((e) => anchor === null || e <= anchor).slice(-PACK_FISCAL_YEARS);
  const periods: Period[] = fyEnds.map((end) => ({ key: end, kind: 'FY', end, start: startOf.get(end) ?? null }));
  const ltm = raw.basis === 'LTM';
  if (ltm) periods.push({ key: 'LTM', kind: 'LTM', end: raw.as_of ?? '', start: null });
  const inPack = new Set(fyEnds);

  const put = (line: LineId, period: PeriodKey, cell: Cell) => {
    const row = (lines[line] ??= {});
    if (!(period in row)) row[period] = cell; // first writer wins: RawHistoricals before the widening
  };
  const pointCell = (p: HistoryPoint, abs = false): Cell => {
    const derivedTag = p.tag.startsWith('derived:') || p.tag.startsWith('user');
    const prov: Provenance = {
      source,
      detail: `${p.tag} · FY ending ${p.end}${p.form ? ` · ${p.form}` : ''}${p.restated_note ? ` · ${p.restated_note}` : ''}`,
      tag: p.tag, taxonomy: source === 'user' ? undefined : taxonomy, form: p.form ?? undefined, filed: p.filed ?? undefined, period: p.end,
      url: derivedTag ? undefined : filingUrl(raw.cik10, accessionOf(facts, taxonomy, p)),
    };
    return { value: abs ? Math.abs(p.value) : p.value, provenance: prov };
  };
  const putSeries = (line: LineId, s: HistorySeries | undefined, abs = false) => {
    for (const p of s?.points ?? []) {
      if (!inPack.has(p.end)) continue;
      put(line, p.end, pointCell(p, abs));
    }
  };
  const putSourced = (line: LineId, period: PeriodKey | null, v: SourcedValue | null | undefined) => {
    if (period !== null && v) put(line, period, { value: v.value, provenance: v.provenance });
  };

  // ── 1. what the RawHistoricals already holds (identical figures to the ones the model reads) ──
  // The sizing pair goes in its own column FIRST so those cells are exactly raw.fy_*.
  putSourced('revenue', ltm ? 'LTM' : anchor, raw.fy_revenue);
  putSourced('ebitda', ltm ? 'LTM' : anchor, raw.fy_ebitda);
  putSourced('da', anchor, raw.da);
  putSourced('capex', anchor, raw.capex);
  putSeries('revenue', raw.history?.revenue);
  putSeries('operating_income', raw.history?.operating_income);
  putSeries('da', raw.history?.da);
  putSeries('ebitda', raw.history?.ebitda);
  putSeries('capex', raw.history?.capex, true);
  putSourced('cash', anchor, raw.cash);
  putSourced('net_ppe', anchor, raw.net_ppe);

  // ── 2. borrowings and leases, separated where the route can (plan §3.1 D5) ──
  const withLeases = raw.gross_debt;
  const exLeases = rawExLeases ? rawExLeases.gross_debt : raw.gross_debt;
  putSourced('borrowings', anchor, exLeases);
  if (rawExLeases === null) {
    if (withLeases) notes.push('This source does not separate lease liabilities from borrowings — “Borrowings” is gross debt as sourced.');
  } else if (withLeases && exLeases && anchor) {
    const leases = withLeases.value - exLeases.value;
    if (leases !== 0) {
      put(gaap === 'ifrs' ? 'lease_liab' : 'finance_lease_liab', anchor, {
        value: leases,
        provenance: {
          source, period: anchor, taxonomy,
          detail: `${gaap === 'ifrs' ? 'IFRS 16 lease liabilities' : 'Finance lease liabilities'} the filing reports separately from borrowings (${withLeases.provenance.detail})`,
          url: withLeases.provenance.url,
        },
      });
    } else if (/lease/i.test(withLeases.provenance.detail)) {
      notes.push('The filing’s debt concept already bundles lease liabilities — they cannot be separated from borrowings here.');
    }
  }

  // ── 3. EDGAR us-gaap widening: more lines across the same years, and the candidates ──
  const candidates: AdjustmentCandidate[] = [];
  if (facts && gaap === 'us-gaap') {
    const unit = raw.currency_unsupported ?? raw.currency;
    for (const def of US_GAAP_LINES) {
      // instants are tagged at every quarter end, so the window must reach back in PERIODS, not years
      const s = buildAnnualSeries(facts, def.id, def.tags, { kind: def.kind, unit, maxYears: def.kind === 'instant' ? 60 : 12 });
      putSeries(def.id, s, def.abs);
    }
    for (const t of EBITDA_CANDIDATE_TAGS) {
      const s = buildAnnualSeries(facts, t.tag, [t.tag], { kind: 'duration', unit, maxYears: 12 });
      const amounts: Record<PeriodKey, number> = {};
      let last: HistoryPoint | null = null;
      for (const p of s.points) {
        if (!inPack.has(p.end) || p.value === 0) continue;
        amounts[p.end] = t.sign * p.value;
        last = p;
      }
      if (!last) continue;
      candidates.push({
        id: `cand:${t.tag}`, bridge: 'ebitda', label: t.label, category: t.category, tag: t.tag, taxonomy: 'us-gaap',
        amounts, rationale: t.rationale, caveat: t.caveat, url: filingUrl(raw.cik10, accessionOf(facts, 'us-gaap', last)),
      });
    }
    const seenLabels = new Set<string>();
    for (const t of NET_DEBT_CANDIDATE_TAGS) {
      if (!anchor || seenLabels.has(t.label)) continue;
      const s = buildAnnualSeries(facts, t.tag, [t.tag], { kind: 'instant', unit, maxYears: 60 });
      const p = s.points.find((x) => x.end === anchor);
      if (!p || p.value === 0) continue;
      seenLabels.add(t.label);
      candidates.push({
        id: `cand:${t.tag}`, bridge: 'net_debt', side: t.side, label: t.label, category: t.category, tag: t.tag, taxonomy: 'us-gaap',
        amounts: { [anchor]: t.sign * p.value }, rationale: t.rationale, caveat: t.caveat,
        url: filingUrl(raw.cik10, accessionOf(facts, 'us-gaap', p)),
      });
    }
  } else if (gaap === 'ifrs') {
    notes.push('Detected adjustment proposals are available for US GAAP filers only — add rows by hand for this filing.');
  }

  // D4: a D&A cell resolved from an alias that includes financing costs carries the caveat.
  for (const cell of Object.values(lines.da ?? {})) {
    if (cell.provenance.tag && DA_ALIASES_WITH_FINANCING_COSTS.has(cell.provenance.tag)) cell.note = DA_ALIAS_NOTE;
  }

  if (ltm) notes.push('The deal is sized on trailing-twelve-months figures. Only revenue and EBITDA exist on that basis; every other line is the latest fiscal year.');

  return { entityName: raw.entityName, currency: raw.currency_unsupported ?? raw.currency, gaap, periods, anchor, sizing: ltm ? 'LTM' : anchor, lines, candidates, notes };
}
