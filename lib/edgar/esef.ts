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

// ── Name → LEI (GLEIF fuzzy completion) ─────────────────────────────────────

interface GleifCompletion {
  attributes?: { value?: string };
  relationships?: { 'lei-records'?: { data?: { id?: string } } };
}

/** Resolve a free-text company name to candidate {name, LEI} via GLEIF. Deduped by LEI. */
export async function searchEsefByName(query: string, limit = 10): Promise<EsefEntityMatch[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await getJson<{ data?: GleifCompletion[] }>(`gleif/${q}`);
  const out: EsefEntityMatch[] = [];
  const seen = new Set<string>();
  for (const c of res.data ?? []) {
    const lei = c.relationships?.['lei-records']?.data?.id;
    const name = c.attributes?.value;
    if (lei && name && !seen.has(lei)) { seen.add(lei); out.push({ name, lei }); }
    if (out.length >= limit) break;
  }
  return out;
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

/** Convenience: resolve an entity's latest report straight to its facts (+ the chosen filing). */
export async function getLatestEsefReport(lei: string): Promise<{ filing: EsefFiling; report: XbrlJsonReport } | null> {
  const filings = await getEsefFilings(lei);
  if (!filings.length) return null;
  const filing = filings[0];
  const report = await getEsefReport(filing.jsonUrl);
  return { filing, report };
}
