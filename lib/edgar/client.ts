/**
 * Typed SEC EDGAR client (Phase 1). Calls the same-origin proxy at `/api/edgar/*`
 * (api/edgar/[...path].ts) — never SEC directly (browsers can't set the required User-Agent
 * and SEC sends no CORS). Pure helpers (CIK padding, EDGAR-URL parsing, fuzzy company ranking)
 * are exported separately so they unit-test without a network.
 */

// ── SEC response shapes (the fields we consume) ─────────────────────────────

/** One entry from company_tickers.json (`{ "0": {cik_str, ticker, title}, ... }`). */
export interface CompanyTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

export interface CompanyMatch {
  cik: number;          // numeric CIK
  cik10: string;        // zero-padded, e.g. "CIK0000320193"
  ticker: string;
  title: string;
}

/** A single XBRL fact value (one period of one concept/unit). */
export interface XbrlFactValue {
  start?: string;       // period start (duration concepts)
  end: string;          // period end (instant or duration end)
  val: number;
  accn: string;         // accession number
  fy?: number;          // fiscal year
  fp?: string;          // fiscal period: FY, Q1..Q4
  form?: string;        // 10-K, 10-Q, 20-F, …
  filed?: string;       // filing date
  frame?: string;       // e.g. CY2023
}

export interface XbrlConcept {
  label?: string;
  description?: string;
  units: Record<string, XbrlFactValue[]>;   // keyed by unit, e.g. "USD", "USD/shares", "shares"
}

/** companyfacts/CIK##########.json. */
export interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, XbrlConcept>>;  // taxonomy → concept → data
}

/** submissions/CIK##########.json (the subset we use). */
export interface Submissions {
  cik: string;
  name: string;
  tickers?: string[];
  sicDescription?: string;
  filings: {
    recent: {
      accessionNumber: string[];
      form: string[];
      filingDate: string[];
      reportDate?: string[];
      primaryDocument: string[];
      primaryDocDescription?: string[];
    };
  };
}

/** A recent filing flattened from the column-oriented submissions payload. */
export interface FilingRef {
  accession: string;        // dashed, e.g. 0000320193-23-000106
  form: string;
  filingDate: string;
  reportDate?: string;
  primaryDocument: string;
  /** Canonical URL to the primary filing document on EDGAR. */
  documentUrl: string;
  /** URL to the filing index page. */
  filingIndexUrl: string;
}

// ── Pure helpers (no network) ───────────────────────────────────────────────

/** Zero-pad a numeric CIK to the 10-digit `CIK##########` form SEC's APIs require. */
export function padCik(cik: number | string): string {
  const digits = String(cik).replace(/\D/g, '');
  return `CIK${digits.padStart(10, '0')}`;
}

/**
 * Parse a pasted EDGAR URL or raw identifier into a CIK (and accession, if present).
 * Accepts browse-edgar `CIK=` params, `/Archives/edgar/data/<cik>/<accession>/...` paths,
 * a bare 10-digit `CIK##########`, or a bare numeric CIK. Returns null if nothing parses.
 */
export function parseEdgarUrl(input: string): { cik10: string; accession?: string } | null {
  const text = input.trim();
  if (!text) return null;

  let cikDigits: string | null = null;

  // browse-edgar ?CIK=0000320193 (numeric only — a ticker here needs the autocomplete path)
  const q = text.match(/[?&]CIK=(\d{1,10})\b/i);
  if (q) cikDigits = q[1];

  // /Archives/edgar/data/320193/000032019323000106/...
  const dataPath = text.match(/\/data\/(\d{1,10})(?:\/(\d{10}-?\d{2}-?\d{6}|\d{18}))?/);
  if (!cikDigits && dataPath) cikDigits = dataPath[1];

  // bare CIK########## or a bare number
  if (!cikDigits) {
    const bare = text.match(/\bCIK(\d{10})\b/i) ?? text.match(/^(\d{1,10})$/);
    if (bare) cikDigits = bare[1];
  }

  if (!cikDigits) return null;

  let accession: string | undefined;
  const accMatch = text.match(/(\d{10}-\d{2}-\d{6})/) ?? text.match(/\b(\d{18})\b/);
  if (accMatch) {
    const raw = accMatch[1].replace(/\D/g, '');
    if (raw.length === 18) accession = `${raw.slice(0, 10)}-${raw.slice(10, 12)}-${raw.slice(12)}`;
  }

  return { cik10: padCik(cikDigits), ...(accession ? { accession } : {}) };
}

/**
 * Rank company_tickers entries against a free-text query (name or ticker). Deterministic
 * scoring: exact ticker > ticker prefix > word-boundary title prefix > title substring.
 * Returns up to `limit` matches. Pure — drives the autocomplete without any network call.
 */
export function rankCompanyMatches(
  entries: CompanyTickerEntry[],
  query: string,
  limit = 12,
): CompanyMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: { e: CompanyTickerEntry; score: number }[] = [];
  for (const e of entries) {
    const ticker = (e.ticker || '').toLowerCase();
    const title = (e.title || '').toLowerCase();
    let score = 0;
    if (ticker === q) score = 1000;
    else if (ticker.startsWith(q)) score = 800 - ticker.length;
    else if (title.startsWith(q)) score = 600 - title.length;
    else if (title.includes(` ${q}`)) score = 400 - title.length;   // word-boundary hit
    else if (title.includes(q)) score = 200 - title.length;
    else if (q.length >= 2 && ticker.includes(q)) score = 100 - ticker.length;
    if (score > 0) scored.push({ e, score });
  }

  scored.sort((a, b) => b.score - a.score || a.e.title.localeCompare(b.e.title));
  return scored.slice(0, limit).map(({ e }) => ({
    cik: e.cik_str,
    cik10: padCik(e.cik_str),
    ticker: e.ticker,
    title: e.title,
  }));
}

/** Flatten the column-oriented `filings.recent` arrays into typed rows, newest first. */
export function extractRecentFilings(subs: Submissions, forms?: string[]): FilingRef[] {
  const r = subs.filings?.recent;
  if (!r) return [];
  const cikDigits = String(subs.cik).replace(/\D/g, '');
  const want = forms ? new Set(forms) : null;
  const out: FilingRef[] = [];
  for (let i = 0; i < r.accessionNumber.length; i++) {
    const form = r.form?.[i];
    const accession = r.accessionNumber[i];
    if (!accession || !form) continue;           // malformed/truncated parallel arrays — skip
    if (want && !want.has(form)) continue;
    const accNoDash = accession.replace(/-/g, '');
    const primaryDocument = r.primaryDocument?.[i] ?? '';
    out.push({
      accession,
      form,
      filingDate: r.filingDate?.[i] ?? '',
      reportDate: r.reportDate?.[i],
      primaryDocument,
      documentUrl: `https://www.sec.gov/Archives/edgar/data/${Number(cikDigits)}/${accNoDash}/${primaryDocument}`,
      filingIndexUrl: `https://www.sec.gov/Archives/edgar/data/${Number(cikDigits)}/${accNoDash}/`,
    });
  }
  return out;
}

// ── Network (via the proxy) ─────────────────────────────────────────────────

const PROXY_BASE = '/api/edgar';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${PROXY_BASE}/${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    let detail = `EDGAR request failed (${res.status})`;
    // The error body may be a string OR an object (e.g. a platform 500). Coerce so callers
    // never surface a useless "[object Object]".
    try {
      const body = await res.json() as { error?: unknown };
      if (body?.error != null) detail = typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
    } catch { /* non-JSON error body */ }
    throw new Error(detail);
  }
  // A 200 that isn't JSON means the request didn't reach the proxy function — almost always the
  // SPA rewrite serving index.html for /api/* (the rewrite must exclude /api). Give a clear
  // diagnostic instead of a cryptic "Unexpected token '<'" JSON-parse error.
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    throw new Error('The EDGAR proxy is not reachable — /api/edgar returned a non-JSON page. The serverless function may not be deployed, or the SPA rewrite is intercepting /api/*.');
  }
  return res.json() as Promise<T>;
}

let tickerCache: CompanyTickerEntry[] | null = null;

/** Fetch (and memoise) the full company_tickers map for client-side autocomplete. */
export async function loadCompanyTickers(): Promise<CompanyTickerEntry[]> {
  if (tickerCache) return tickerCache;
  const raw = await getJson<Record<string, CompanyTickerEntry>>('company_tickers');
  tickerCache = Object.values(raw);
  return tickerCache;
}

/** Resolve a free-text query to ranked company matches (loads the ticker map on first use). */
export async function searchCompanies(query: string, limit = 12): Promise<CompanyMatch[]> {
  if (!query.trim()) return [];
  const entries = await loadCompanyTickers();
  return rankCompanyMatches(entries, query, limit);
}

/** Recent filings for a CIK (optionally filtered to specific forms, e.g. ['10-K','20-F']). */
export async function getSubmissions(cik10: string): Promise<Submissions> {
  if (!/^CIK\d{10}$/.test(cik10)) throw new Error(`Invalid CIK: ${cik10}`);
  return getJson<Submissions>(`submissions/${cik10}`);
}

/** All XBRL facts for a CIK. */
export async function getCompanyFacts(cik10: string): Promise<CompanyFacts> {
  if (!/^CIK\d{10}$/.test(cik10)) throw new Error(`Invalid CIK: ${cik10}`);
  return getJson<CompanyFacts>(`companyfacts/${cik10}`);
}
