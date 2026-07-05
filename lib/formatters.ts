/**
 * Number, currency, percentage formatters — the display boundary.
 * Engine/store values are raw floats (money in millions, rates as decimal fractions);
 * conversion to display strings happens here and only here.
 */

import { csym } from './engine/utils';

/** Thousands-separated fixed-decimal number: 2026472.04 -> "2,026,472.0" */
export function fmtNumber(v: number, dp = 1): string {
  if (Object.is(v, -0)) v = 0; // Intl preserves the -0 sign; "−0.0" must never render
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtCurrency(v: number, currency = 'GBP'): string {
  return `${csym(currency)}${fmtNumber(Math.abs(v))}m`;
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

export function fmtMultiple(v: number): string {
  return `${v.toFixed(1)}x`;
}

/**
 * Decimal fraction -> percent display for INPUT fields: 0.3478173110887373 -> "34.78",
 * 0.05 -> "5". Max 2dp, trailing zeros trimmed, never scientific notation.
 */
export function pctToDisplay(v: number): string {
  return String(parseFloat((v * 100).toFixed(2)));
}

/** Percent input string -> decimal fraction: "34.78" -> 0.3478. Returns null when unparsable. */
export function displayToPct(s: string): number | null {
  const n = parseFloat(s);
  return isNaN(n) ? null : n / 100;
}

export function irrColor(irr: number | null | undefined): string {
  if (irr == null) return 'rgba(17,17,17,0.35)';
  if (irr > 0.25) return '#15803d';
  if (irr >= 0.15) return '#b45309';
  return '#b91c1c';
}
