/**
 * SEC EDGAR proxy (Phase 1) — the ONLY server-side surface in this otherwise static SPA.
 *
 * Why this exists: SEC EDGAR cannot be called directly from the browser —
 *   • SEC requires a descriptive `User-Agent` with contact info on every request, and
 *     browsers forbid setting `User-Agent` from `fetch` (so direct calls 403);
 *   • `data.sec.gov` / `sec.gov` do not send permissive CORS headers for browser XHR;
 *   • SEC throttles to ≤ 10 requests/second per IP.
 *
 * This thin proxy sets the compliant User-Agent, forwards to a strict allowlist of EDGAR
 * endpoints (SSRF-safe — it never forwards an arbitrary URL), caches responses at the Vercel
 * edge (company_tickers ~1 day; submissions/companyfacts ~6h) so repeat lookups never re-hit
 * SEC, and applies a best-effort per-instance throttle. It returns ONLY public EDGAR data and
 * holds no secrets.
 *
 * Runs on the Vercel Edge runtime (Web `Request`/`Response`; server-side `fetch` may set
 * `User-Agent`). Route: `/api/edgar/<endpoint>...` (Vercel catch-all `[...path]`).
 */

export const config = { runtime: 'edge' };

// SEC asks for a descriptive UA naming the app + a contact email. Overridable via env at
// deploy; defaults to the project owner's contact.
const CONTACT_EMAIL = (globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env?.SEC_CONTACT_EMAIL ?? 'malanimridul4@gmail.com';
const SEC_USER_AGENT = `Mridul Malani LBO Deal Engine (${CONTACT_EMAIL})`;

const CIK_RE = /^CIK\d{10}$/;                 // zero-padded 10-digit, e.g. CIK0000320193
const TAXONOMY_ALLOW = new Set(['us-gaap', 'dei', 'ifrs-full', 'srt']);
const TAG_RE = /^[A-Za-z][A-Za-z0-9]{0,80}$/; // XBRL concept names are alphanumeric

interface Resolved {
  url: string;
  /** Edge cache lifetime (seconds) for this resource class. */
  sMaxAge: number;
}

/**
 * Map an allowlisted client path to a concrete SEC URL. Returns null for anything not on the
 * allowlist (defends against SSRF — we never forward a caller-supplied host/path verbatim).
 */
function resolveTarget(segments: string[]): Resolved | null {
  const [endpoint, ...rest] = segments;

  // company tickers map (name/ticker → CIK). Large, slow-moving ⇒ cache a day.
  if (endpoint === 'company_tickers' && rest.length === 0) {
    return { url: 'https://www.sec.gov/files/company_tickers.json', sMaxAge: 86_400 };
  }

  // recent filings list for a CIK.
  if (endpoint === 'submissions' && rest.length === 1 && CIK_RE.test(rest[0])) {
    return { url: `https://data.sec.gov/submissions/${rest[0]}.json`, sMaxAge: 21_600 };
  }

  // all XBRL facts for a CIK.
  if (endpoint === 'companyfacts' && rest.length === 1 && CIK_RE.test(rest[0])) {
    return { url: `https://data.sec.gov/api/xbrl/companyfacts/${rest[0]}.json`, sMaxAge: 21_600 };
  }

  // a single concept for a CIK: companyconcept/<CIK>/<taxonomy>/<Tag>
  if (endpoint === 'companyconcept' && rest.length === 3
      && CIK_RE.test(rest[0]) && TAXONOMY_ALLOW.has(rest[1]) && TAG_RE.test(rest[2])) {
    return { url: `https://data.sec.gov/api/xbrl/companyconcept/${rest[0]}/${rest[1]}/${rest[2]}.json`, sMaxAge: 21_600 };
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

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed. Use GET.' }, 405);
  }

  // Path after `/api/edgar/`, split into clean segments.
  const { pathname } = new URL(request.url);
  const after = pathname.replace(/^\/api\/edgar\/?/, '');
  const segments = after.split('/').filter(Boolean).map((s) => decodeURIComponent(s));

  if (segments.length === 0) {
    return json({ error: 'Missing EDGAR endpoint.' }, 400);
  }

  const target = resolveTarget(segments);
  if (!target) {
    return json({ error: `Unsupported or malformed EDGAR endpoint: ${after}` }, 400);
  }

  try {
    await throttle();
    const upstream = await fetch(target.url, {
      headers: {
        'User-Agent': SEC_USER_AGENT,
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
    });

    if (!upstream.ok) {
      // Surface a clean status; don't leak SEC's HTML error bodies to the client.
      const detail = upstream.status === 404 ? 'Not found on EDGAR (unknown CIK or no such filing/concept).'
        : upstream.status === 403 ? 'EDGAR refused the request (User-Agent / rate policy).'
        : upstream.status === 429 ? 'EDGAR rate limit hit — please retry shortly.'
        : `EDGAR returned ${upstream.status}.`;
      return json({ error: detail, status: upstream.status }, upstream.status === 429 ? 429 : 502);
    }

    // STREAM the upstream body straight through rather than buffering it. companyfacts for a
    // large issuer (e.g. Apple) is tens of MB — buffering via `.text()` blows the Edge
    // function's memory/response limit and 500s. Streaming pipes it without holding it all.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        // Edge-cache so repeat lookups never re-hit SEC; allow brief stale serving on refresh.
        'cache-control': `public, s-maxage=${target.sMaxAge}, stale-while-revalidate=86400`,
        // Same-origin app; expose for safety if served cross-origin in dev.
        'access-control-allow-origin': '*',
      },
    });
  } catch (err) {
    return json({ error: `Proxy failed to reach EDGAR: ${(err as Error).message}` }, 502);
  }
}
