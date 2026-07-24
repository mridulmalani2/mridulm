/**
 * lib/edgar/quote.ts — D5 trading-multiple anchor (PHASE_D §D5, owner decision IN).
 *
 * shares outstanding (dei tag, multi-class caveat noted) × price (Finnhub via the
 * api/edgar proxy — key server-side only) + net debt, ÷ FY EBITDA → a READ-ONLY
 * "trades at ~Nx FY EBITDA" line and the ±band coherence input. Honest failure modes:
 * no key configured / no ticker / no shares / implausible result ⇒ null anchor with a
 * reason — the coherence gate suppresses on null; nothing is guessed.
 */

import { getJson } from './client';
import type { CompanyFacts } from './client';

export interface TradingAnchor {
  /** EV / FY EBITDA (implied from market cap + net debt). */
  ev_ebitda: number;
  price: number;
  shares_millions: number;
  /** e.g. "Finnhub delayed quote × dei shares (single class) + net debt ÷ FY EBITDA". */
  detail: string;
  /** Set when dei reports MULTIPLE share-class facts at the period (sum used — caveat). */
  multi_class: boolean;
}

/** Plausibility band: outside [1x, 60x] the anchor is noise, not a check. */
const ANCHOR_MIN = 1;
const ANCHOR_MAX = 60;

/** Latest dei shares outstanding across classes: single fact → its value; multiple
 *  same-date class facts → their SUM with the multi-class caveat. Absolute count. */
export function sharesOutstanding(facts: CompanyFacts): { shares: number; multiClass: boolean } | null {
  const dei = facts.facts?.['dei']?.['EntityCommonStockSharesOutstanding'];
  const list = dei?.units?.['shares'];
  if (!list?.length) return null;
  const latestEnd = list.reduce((a, b) => (String(b.end) > String(a.end) ? b : a)).end;
  const atLatest = list.filter((f) => f.end === latestEnd);
  // companyfacts is non-dimensional: multi-class filers surface one fact per cover-page
  // class row only when tagged without members — dedupe identical values (re-filings).
  const distinct = [...new Set(atLatest.map((f) => f.val))];
  const shares = distinct.reduce((s, v) => s + v, 0);
  if (!(shares > 0)) return null;
  return { shares, multiClass: distinct.length > 1 };
}

/** Pure anchor math (unit-tested): price × shares → mcap, + net debt, ÷ FY EBITDA. */
export function computeTradingAnchor(
  price: number,
  sharesAbs: number,
  netDebtMillions: number,
  fyEbitdaMillions: number,
  multiClass: boolean,
): TradingAnchor | null {
  if (!(price > 0) || !(sharesAbs > 0) || !(fyEbitdaMillions > 0)) return null;
  const sharesM = sharesAbs / 1e6;
  const ev = price * sharesM + netDebtMillions;
  const multiple = ev / fyEbitdaMillions;
  if (multiple < ANCHOR_MIN || multiple > ANCHOR_MAX) return null; // noise, not a check
  return {
    ev_ebitda: multiple,
    price,
    shares_millions: sharesM,
    multi_class: multiClass,
    detail: `Finnhub delayed quote × dei shares${multiClass ? ' (MULTI-CLASS sum — approximate)' : ''} + net debt ÷ FY EBITDA`,
  };
}

/** Finnhub quote via the proxy. null when unconfigured (501) or on any failure. */
export async function fetchQuotePrice(ticker: string): Promise<number | null> {
  try {
    const q = await getJson<{ c?: number }>(`quote/${encodeURIComponent(ticker)}`);
    return q && typeof q.c === 'number' && q.c > 0 ? q.c : null;
  } catch {
    return null; // unconfigured key / network / bad ticker — the anchor just doesn't render
  }
}

/** End-to-end: ticker + facts payload + net debt/EBITDA (millions) → anchor or null. */
export async function fetchTradingAnchor(
  ticker: string | undefined,
  facts: CompanyFacts,
  netDebtMillions: number | null,
  fyEbitdaMillions: number | null,
): Promise<TradingAnchor | null> {
  if (!ticker || netDebtMillions == null || fyEbitdaMillions == null) return null;
  const sh = sharesOutstanding(facts);
  if (!sh) return null;
  const price = await fetchQuotePrice(ticker);
  if (price == null) return null;
  return computeTradingAnchor(price, sh.shares, netDebtMillions, fyEbitdaMillions, sh.multiClass);
}
