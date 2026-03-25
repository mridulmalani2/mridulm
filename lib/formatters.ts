/** Number, currency, percentage formatters. */

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '£', EUR: '€', USD: '$', CHF: 'CHF ',
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
  if (irr == null) return '#6b7a96';
  if (irr > 0.25) return '#00c896';
  if (irr >= 0.15) return '#ffaa00';
  return '#ff4757';
}
