/**
 * lib/format — THE formatting boundary (PHASE_E §E1; SPEC §15 display rules).
 *
 * The ONLY place %-vs-decimal conversion and number formatting happen. Engine floats
 * never reach the DOM raw (kills the `0.3478173110887373` bug class), and null NEVER
 * renders as a sentinel — undefined metrics display "N/A" (§11/§15).
 *
 * Engine-free: no imports from lib/engine (frozen) or lib/engine2 (pure math). Display
 * rules (SPEC §15): thousands separators; money 1 decimal of millions; IRR/percentages
 * 1 decimal; multiples 1 decimal + "x"; percent↔decimal conversion happens EXACTLY once,
 * at the input boundary (fromPctInput/toPctInput).
 */

export type Engine2Currency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'INR';

const CSYM: Record<Engine2Currency, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹' };

export const currencySymbol = (c: Engine2Currency): string => CSYM[c];

const clean = (v: number): number => (Object.is(v, -0) ? 0 : v); // "−0.0" must never render

/** Thousands-separated fixed-decimal: 2026472.04 → "2,026,472.0". */
export function num(v: number | null | undefined, dp = 1): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  return clean(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Money in millions of deal currency, 1dp (§15): 1234.567 → "$1,234.6m". */
export function money(v: number | null | undefined, currency: Engine2Currency, dp = 1): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  const sign = v < 0 ? '−' : '';
  return `${sign}${CSYM[currency]}${num(Math.abs(v), dp)}m`;
}

/** Money prefixed with an ISO code for currencies OUTSIDE the modelled set (display-only
 *  surfaces like the history table): 210838 → "SEK 210,838m". The modelled five keep their
 *  symbols via money(); an unsupported filing must never wear another currency's symbol. */
export function moneyIso(v: number | null | undefined, isoCode: string, dp = 1): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  const sign = v < 0 ? '−' : '';
  return `${sign}${isoCode} ${num(Math.abs(v), dp)}m`;
}

/** Rate/IRR as a percentage, 1dp (§15): 0.1596 → "16.0%"; null → "N/A" (never 9999). */
export function pct(v: number | null | undefined, dp = 1): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  return `${(clean(v) * 100).toFixed(dp)}%`;
}

/** Multiple, 1dp + "x" (§15): 2.104 → "2.1x"; null → "N/A". */
export function multiple(v: number | null | undefined, dp = 1): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  return `${clean(v).toFixed(dp)}x`;
}

/** Basis points for spreads: 0.0375 → "375bps". */
export function bps(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  return `${Math.round(clean(v) * 10_000)}bps`;
}

/** Signed covenant headroom: negative = breach (§11). null → "N/A" (not tested / undefined). */
export function headroom(v: number | null | undefined, dp = 2): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  const c = clean(v);
  return `${c > 0 ? '+' : c < 0 ? '−' : ''}${Math.abs(c).toFixed(dp)}x`;
}

/**
 * INPUT boundary, decimal → percent STRING for an editable field (the exactly-once rule):
 * 0.3478173110887373 → "34.78"; 0.05 → "5". Max 2dp, trailing zeros trimmed, never
 * scientific notation.
 */
export function toPctInput(decimal: number): string {
  const p = clean(decimal) * 100;
  if (!Number.isFinite(p)) return '';
  return p.toFixed(2).replace(/\.?0+$/, '') || '0';
}

/** INPUT boundary, percent string → decimal: "34.78" → 0.3478. NaN-safe (null on garbage). */
export function fromPctInput(text: string): number | null {
  const p = Number(text.replace(/[%\s,]/g, ''));
  if (!Number.isFinite(p)) return null;
  return p / 100;
}

/** Staleness label for the review screen (D3): "FY2025 · ended 2025-09-27 · 9 months ago". */
export function staleness(fiscalYear: number | undefined, periodEnd: string | undefined, today: Date): string | null {
  if (!periodEnd) return null;
  const endMs = Date.parse(periodEnd);
  if (!Number.isFinite(endMs)) return null;
  const months = Math.max(0, Math.floor((today.getTime() - endMs) / (30.44 * 86_400_000)));
  const age = months >= 24 ? `${Math.floor(months / 12)} years ago` : months >= 1 ? `${months} month${months === 1 ? '' : 's'} ago` : 'this month';
  return `${fiscalYear ? `FY${fiscalYear} · ` : ''}ended ${periodEnd} · ${age}`;
}
