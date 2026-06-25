/**
 * SEC EDGAR proxy (Phase 1) — the ONLY server-side surface in this otherwise static SPA.
 *
 * Why this exists: SEC EDGAR cannot be called directly from the browser —
 *   • SEC requires a descriptive `User-Agent` with contact info, and browsers forbid setting
 *     `User-Agent` from `fetch` (so direct calls 403);
 *   • `data.sec.gov` / `sec.gov` send no permissive CORS headers for browser XHR;
 *   • SEC throttles to ≤ 10 requests/second per IP.
 *
 * This thin proxy sets the compliant User-Agent, forwards to a strict allowlist of EDGAR
 * endpoints (SSRF-safe — it never forwards an arbitrary URL), streams large responses, edge-
 * caches them so repeat lookups never re-hit SEC, and best-effort throttles. It returns ONLY
 * public EDGAR data and holds no secrets.
 *
 * Routing: a SINGLE fixed route `/api/edgar?path=<endpoint>/<args>` (e.g.
 * `/api/edgar?path=companyfacts/CIK0000320193`). A fixed function + query param is far more
 * reliable on Vercel than a `[...path]` catch-all, which was intermittently 404ing multi-
 * segment paths. Runs on the Vercel Edge runtime (Web `Request`/`Response`; server-side `fetch`
 * may set `User-Agent`).
 */

export const config = { runtime: 'edge' };

const CONTACT_EMAIL = (globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env?.SEC_CONTACT_EMAIL ?? 'malanimridul4@gmail.com';
const SEC_USER_AGENT = `Mridul Malani LBO Deal Engine (${CONTACT_EMAIL})`;

const CIK_RE = /^CIK\d{10}$/;                 // zero-padded 10-digit, e.g. CIK0000320193
const TAXONOMY_ALLOW = new Set(['us-gaap', 'dei', 'ifrs-full', 'srt']);
const TAG_RE = /^[A-Za-z][A-Za-z0-9]{0,80}$/; // XBRL concept names are alphanumeric
const LEI_RE = /^[A-Za-z0-9]{18,20}$/;        // Legal Entity Identifier (20 alphanumeric)
const ESEF_SEG_RE = /^[A-Za-z0-9._-]+$/;      // safe path segment for an ESEF report json_url

interface Resolved {
  url: string;
  /** Edge cache lifetime (seconds) for this resource class. */
  sMaxAge: number;
}

/**
 * Map an allowlisted client `path` to a concrete SEC URL. Returns null for anything not on the
 * allowlist (defends against SSRF — we never forward a caller-supplied host/path verbatim).
 */
function resolveTarget(segments: string[]): Resolved | null {
  const [endpoint, ...rest] = segments;

  if (endpoint === 'company_tickers' && rest.length === 0) {
    return { url: 'https://www.sec.gov/files/company_tickers.json', sMaxAge: 86_400 };
  }
  if (endpoint === 'submissions' && rest.length === 1 && CIK_RE.test(rest[0])) {
    return { url: `https://data.sec.gov/submissions/${rest[0]}.json`, sMaxAge: 21_600 };
  }
  if (endpoint === 'companyfacts' && rest.length === 1 && CIK_RE.test(rest[0])) {
    return { url: `https://data.sec.gov/api/xbrl/companyfacts/${rest[0]}.json`, sMaxAge: 21_600 };
  }
  if (endpoint === 'companyconcept' && rest.length === 3
      && CIK_RE.test(rest[0]) && TAXONOMY_ALLOW.has(rest[1]) && TAG_RE.test(rest[2])) {
    return { url: `https://data.sec.gov/api/xbrl/companyconcept/${rest[0]}/${rest[1]}/${rest[2]}.json`, sMaxAge: 21_600 };
  }

  // ── Europe (ESEF) ──
  // GLEIF fuzzy name → LEI completion (free, keyless). Drives the European autocomplete.
  if (endpoint === 'gleif' && rest.length === 1 && rest[0].length >= 2 && rest[0].length <= 120) {
    return { url: `https://api.gleif.org/api/v1/fuzzycompletions?field=entity.legalName&q=${encodeURIComponent(rest[0])}`, sMaxAge: 86_400 };
  }
  // An entity's ESEF filings on filings.xbrl.org (keyed by LEI).
  if (endpoint === 'esef-filings' && rest.length === 1 && LEI_RE.test(rest[0])) {
    return { url: `https://filings.xbrl.org/api/entities/${rest[0].toUpperCase()}/filings?include=entity`, sMaxAge: 21_600 };
  }
  // An ESEF report's xBRL-JSON facts file (the `json_url` from the filings list). Each path
  // segment is validated to safe chars and the last must be a .json; the host is fixed, so no
  // SSRF — and we reject any `..` traversal segment.
  if (endpoint === 'esef-report' && rest.length >= 1
      && rest.every((s) => ESEF_SEG_RE.test(s) && s !== '..')
      && rest[rest.length - 1].endsWith('.json')) {
    return { url: `https://filings.xbrl.org/${rest.join('/')}`, sMaxAge: 21_600 };
  }
  return null;
}

// Best-effort throttle: serialise within a warm instance so a buggy client loop can't burst
// SEC. Real protection is the edge cache below; this is defence-in-depth, not a global limiter.
let lastFetchAt = 0;
const MIN_INTERVAL_MS = 120; // ≈ 8 req/s per warm instance, under SEC's 10/s ceiling
async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, lastFetchAt + MIN_INTERVAL_MS - now);
  lastFetchAt = now + wait;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed. Use GET.' }, 405);

  // The endpoint travels in the `path` query param (e.g. ?path=companyfacts/CIK0000320193).
  const pathParam = new URL(request.url).searchParams.get('path') ?? '';
  const segments = pathParam.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  if (segments.length === 0) return json({ error: 'Missing EDGAR endpoint (?path=…).' }, 400);

  const target = resolveTarget(segments);
  if (!target) return json({ error: `Unsupported or malformed EDGAR endpoint: ${pathParam}` }, 400);

  try {
    await throttle();
    const upstream = await fetch(target.url, {
      // filings.xbrl.org + GLEIF speak JSON:API; SEC speaks plain JSON — accept both.
      headers: { 'User-Agent': SEC_USER_AGENT, 'Accept': 'application/json, application/vnd.api+json', 'Accept-Encoding': 'gzip, deflate' },
    });

    if (!upstream.ok) {
      const detail = upstream.status === 404 ? 'Not found on EDGAR (unknown CIK or no such filing/concept).'
        : upstream.status === 403 ? 'EDGAR refused the request (User-Agent / rate policy).'
        : upstream.status === 429 ? 'EDGAR rate limit hit — please retry shortly.'
        : `EDGAR returned ${upstream.status}.`;
      return json({ error: detail, status: upstream.status }, upstream.status === 429 ? 429 : 502);
    }

    // STREAM the upstream body straight through rather than buffering it — companyfacts for a
    // large issuer is tens of MB and buffering would blow the Edge function's limit.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': `public, s-maxage=${target.sMaxAge}, stale-while-revalidate=86400`,
        'access-control-allow-origin': '*',
      },
    });
  } catch (err) {
    return json({ error: `Proxy failed to reach EDGAR: ${(err as Error).message}` }, 502);
  }
}
