/** Number, currency, percentage formatters. */

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹', EUR: '€', USD: '$', GBP: '£', JPY: '¥',
};

export function fmtCurrency(v: number, currency = 'GBP'): string {
  const sym = CURRENCY_SYMBOLS[currency] || '£';
  return `${sym}${Math.abs(v).toFixed(1)}m`;
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

export function fmtMultiple(v: number): string {
  return `${v.toFixed(1)}x`;
}

export function fmtNumber(v: number, dp = 1): string {
  return v.toFixed(dp);
}

export function irrColor(irr: number | null | undefined): string {
  if (irr == null) return 'rgba(17,17,17,0.35)';
  if (irr > 0.25) return '#15803d';
  if (irr >= 0.15) return '#b45309';
  return '#b91c1c';
}
