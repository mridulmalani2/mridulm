/**
 * lib/engine2/merger/consideration.ts — the offer price per share and the diluted target shares
 * (SPEC §29.11).
 */
import type { MergerAssumptions, MergerSide } from './types';

/** Treasury stock method at the offer price P (§29.11). */
export function dilutedShares(t: MergerSide, P: number): number {
  const basic = t.shares as number;
  if (t.securities.length === 0) return basic + (t.reported_dilutive_increment ?? 0);
  let d = basic;
  for (const s of t.securities) {
    if (s.kind === 'option') d += P > 0 ? Math.max(0, s.count * (1 - s.strike / P)) : 0;
    else if (s.kind === 'rsu') d += s.count;
    else if (P > s.conversion_price) d += s.principal / s.conversion_price;
  }
  return d;
}

/** Principal of the convertibles that convert at P: it leaves net debt (§29.11). */
export function convertedPrincipal(t: MergerSide, P: number): number {
  let b = 0;
  for (const s of t.securities) if (s.kind === 'convertible' && P > s.conversion_price) b += s.principal;
  return b;
}

/**
 * Solve h(P) = v where h is increasing and affine between the sorted breakpoints (strikes and
 * conversion prices). Each segment's line is read from two interior points; a root is accepted
 * only if h reproduces v there to 1e-9 (§29.11). null: no root (v falls in a conversion jump).
 */
export function solvePrice(h: (P: number) => number, breakpoints: number[], v: number): number | null {
  const pts = [...new Set(breakpoints.filter((b) => b > 0))].sort((a, b) => a - b);
  const edges = [0, ...pts];
  for (let i = 0; i < edges.length; i++) {
    const lo = edges[i];
    const hi = i + 1 < edges.length ? edges[i + 1] : Infinity;
    const a = Number.isFinite(hi) ? lo + (hi - lo) / 3 : lo + 1;
    const b = Number.isFinite(hi) ? lo + (2 * (hi - lo)) / 3 : lo + 2;
    const slope = (h(b) - h(a)) / (b - a);
    if (!(slope > 0)) continue;
    const P = a + (v - h(a)) / slope;
    if (P > lo - 1e-12 && P <= hi + 1e-12 && Math.abs(h(P) - v) <= 1e-9 * Math.max(1, Math.abs(v))) return P;
  }
  return null;
}

export interface PriceResult {
  offer_per_share: number | null;
  diluted: number | null;
  equity_value: number;
  enterprise_value: number;
  net_debt_used: number;
  converted_principal: number;
}

/** §29.11: from the chosen driver to P, diluted shares, equity value and EV. */
export function priceTarget(t: MergerSide, a: MergerAssumptions): PriceResult {
  const nd = t.net_debt as number;
  const p = a.price;
  const hasShares = typeof t.shares === 'number';
  const fromP = (P: number): PriceResult => {
    const conv = convertedPrincipal(t, P);
    const dil = dilutedShares(t, P);
    const eqv = P * dil;
    return { offer_per_share: P, diluted: dil, equity_value: eqv, enterprise_value: eqv + nd - conv, net_debt_used: nd - conv, converted_principal: conv };
  };
  if (p.driver === 'offer_per_share') return fromP(p.offer_per_share);
  if (p.driver === 'premium') {
    const ref = p.premium_to === 'current' ? (t.share_price as number) : (a.unaffected_price as number);
    return fromP(ref * (1 + p.premium));
  }
  if (!hasShares) {
    const ev = p.driver === 'enterprise_value' ? p.enterprise_value : p.equity_value + nd;
    const eqv = p.driver === 'equity_value' ? p.equity_value : p.enterprise_value - nd;
    return { offer_per_share: null, diluted: null, equity_value: eqv, enterprise_value: ev, net_debt_used: nd, converted_principal: 0 };
  }
  const bps = t.securities.map((s) => (s.kind === 'option' ? s.strike : s.kind === 'convertible' ? s.conversion_price : 0));
  const P = p.driver === 'equity_value'
    ? solvePrice((x) => x * dilutedShares(t, x), bps, p.equity_value)
    : solvePrice((x) => x * dilutedShares(t, x) - convertedPrincipal(t, x), bps, p.enterprise_value - nd);
  if (P === null) {
    throw new RangeError('No offer price per share gives this value: it falls where a convertible switches to shares. Enter the price per share instead.');
  }
  return fromP(P);
}
