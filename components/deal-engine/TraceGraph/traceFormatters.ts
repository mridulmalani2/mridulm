/** Value formatters for trace edge labels and chips. */
import { fmtNumber } from '../../../lib/formatters';

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '£', EUR: '€', USD: '$', CHF: 'CHF ', INR: '₹',
};

export function formatTraceValue(
  value: number | null,
  fieldPath: string,
  currency = 'GBP',
): string {
  if (value === null || value === undefined) return '—';
  const sym = CURRENCY_SYMBOLS[currency] ?? '£';
  const fp = fieldPath.toLowerCase();

  if (
    fp.includes('irr') ||
    fp.includes('margin') ||
    fp.includes('growth') ||
    fp.includes('pct') ||
    fp.includes('rate') ||
    fp.includes('yield')
  ) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (
    fp.includes('multiple') ||
    fp.includes('moic') ||
    fp.includes('hurdle') ||
    fp.includes('coverage') ||
    fp.includes('leverage') ||
    fp.includes('dscr')
  ) {
    return `${value.toFixed(1)}x`;
  }
  if (fp.includes('holding_period')) {
    return `${Math.round(value)}yr`;
  }
  if (fp.includes('mid_year_convention')) {
    return value ? 'On' : 'Off';
  }
  // Default: currency
  return `${sym}${fmtNumber(Math.abs(value))}m`;
}
