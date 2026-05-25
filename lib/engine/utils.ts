/** Pure engine utilities shared across modules (no framework deps). */

export const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹', EUR: '€', USD: '$', GBP: '£', JPY: '¥',
};

/** Resolve a currency symbol, defaulting to £ for unknown codes. */
export function csym(currency: string | undefined | null): string {
  return (currency && CURRENCY_SYMBOLS[currency]) || '£';
}
