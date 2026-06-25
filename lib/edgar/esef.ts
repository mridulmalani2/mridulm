/**
 * ESEF (European Single Electronic Format) client (Phase 1+). European-listed issuers file
 * annual reports as inline-XBRL under the EU ESEF mandate; XBRL International's free
 * `filings.xbrl.org` indexes them and serves each report's facts as OIM xBRL-JSON. Company
 * search is by LEI, so we resolve name→LEI via GLEIF (free, keyless). All calls go through the
 * same-origin proxy (`/api/edgar?path=…`); the IFRS mapper (`mapIfrs.ts`) turns a report into
 * the same `RawHistoricals` the SEC path produces, so everything downstream is shared.
 */

import { getJson } from './client';

// ── OIM xBRL-JSON shapes (the subset we consume) ────────────────────────────

export interface XbrlJsonFact {
  value: string | number;
  decimals?: number | string;
  dimensions: {
    concept: string;     // prefixed, e.g. "ifrs-full:Revenue"
    entity?: string;
    period?: string;     // duration "START/END" or instant "INSTANT"
    unit?: string;       // e.g. "iso4217:EUR"
    language?: string;
    [axis: string]: string | undefined;  // taxonomy axes (dimensional breakdowns)
  };
}

export interface XbrlJsonReport {
  documentInfo?: { namespaces?: Record<string, string>; taxonomy?: string[] };
  facts: Record<string, XbrlJsonFact>;
}

export interface EsefEntityMatch {
  name: string;
  lei: string;
}

export interface EsefFiling {
  lei: string;
  entityName?: string;
  periodEnd: string;        // YYYY-MM-DD
  country?: string;
  jsonUrl: string;          // path to the xBRL-JSON facts (relative to filings.xbrl.org)
  reportUrl?: string;       // the iXBRL report (HTML)
  viewerUrl?: string;       // the inline-XBRL viewer
}

// ── Name → LEI search (over the entities that actually have ESEF filings) ────
// We search the filings.xbrl.org entity universe (~7k) rather than GLEIF: GLEIF returns EVERY
// legal entity, so a query like "Unilever" surfaces non-filing subsidiaries above the listed
// parent. Here every match is guaranteed to have an ESEF report. Mirrors SEC company_tickers.

export interface EsefTickerEntry { lei: string; name: string }

interface EntitiesApiResponse { data?: { attributes?: { identifier?: string; name?: string } }[] }

let entityCache: EsefTickerEntry[] | null = null;

/** Fetch (and memoise) the full ESEF-filer list for client-side autocomplete. */
export async function loadEsefEntities(): Promise<EsefTickerEntry[]> {
  if (entityCache) return entityCache;
  const res = await getJson<EntitiesApiResponse>('esef-entities');
  entityCache = (res.data ?? [])
    .map((e) => ({ lei: e.attributes?.identifier ?? '', name: e.attributes?.name ?? '' }))
    .filter((e) => e.lei && e.name);
  return entityCache;
}

/** Deterministic fuzzy ranking over filer names: exact > prefix > word-boundary > substring. */
export function rankEsefMatches(entities: EsefTickerEntry[], query: string, limit = 12): EsefEntityMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { e: EsefTickerEntry; score: number }[] = [];
  for (const e of entities) {
    const name = e.name.toLowerCase();
    let score = 0;
    if (name === q) score = 1000;
    else if (name.startsWith(q)) score = 800 - name.length;
    else if (name.includes(` ${q}`)) score = 500 - name.length;
    else if (name.includes(q)) score = 200 - name.length;
    if (score > 0) scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name));
  return scored.slice(0, limit).map(({ e }) => ({ name: e.name, lei: e.lei }));
}

/** Resolve a free-text company name to candidate {name, LEI} from the ESEF-filer universe. */
export async function searchEsefByName(query: string, limit = 12): Promise<EsefEntityMatch[]> {
  if (query.trim().length < 2) return [];
  return rankEsefMatches(await loadEsefEntities(), query, limit);
}

// ── Filings for an entity ───────────────────────────────────────────────────

interface FilingApiItem {
  attributes?: { period_end?: string; json_url?: string; report_url?: string; viewer_url?: string; country?: string };
}
interface FilingApiResponse {
  data?: FilingApiItem[];
  included?: { type?: string; attributes?: { name?: string } }[];
}

/** An entity's ESEF reports (newest first), one per distinct fiscal-period-end. */
export async function getEsefFilings(lei: string): Promise<EsefFiling[]> {
  if (!/^[A-Za-z0-9]{18,20}$/.test(lei)) throw new Error(`Invalid LEI: ${lei}`);
  const res = await getJson<FilingApiResponse>(`esef-filings/${lei}`);
  const entityName = res.included?.find((i) => i.type === 'entity')?.attributes?.name;
  const rows: EsefFiling[] = [];
  for (const it of res.data ?? []) {
    const a = it.attributes; if (!a?.json_url || !a.period_end) continue;
    rows.push({
      lei: lei.toUpperCase(), entityName, periodEnd: a.period_end, country: a.country,
      jsonUrl: a.json_url, reportUrl: a.report_url, viewerUrl: a.viewer_url,
    });
  }
  rows.sort((x, y) => (x.periodEnd < y.periodEnd ? 1 : -1));   // newest first
  // Keep one filing per period-end (avoid duplicate language variants).
  const byPeriod = new Map<string, EsefFiling>();
  for (const r of rows) if (!byPeriod.has(r.periodEnd)) byPeriod.set(r.periodEnd, r);
  return [...byPeriod.values()];
}

// ── Report facts ────────────────────────────────────────────────────────────

/** Fetch a report's xBRL-JSON facts by its `json_url` (from a filing). */
export async function getEsefReport(jsonUrl: string): Promise<XbrlJsonReport> {
  const rel = jsonUrl.replace(/^\/+/, '');                 // strip leading slash(es)
  if (!rel.endsWith('.json')) throw new Error(`Unexpected ESEF report URL: ${jsonUrl}`);
  return getJson<XbrlJsonReport>(`esef-report/${rel}`);
}
