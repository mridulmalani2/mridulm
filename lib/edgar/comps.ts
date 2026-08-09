/**
 * lib/edgar/comps.ts — the §21 sector comps band [v1.6.0]. DATA-SIDE (Tier B): this computes a
 * FACT the model DISPLAYS. It touches NO engine arithmetic, feeds no suggestion value and emits
 * no coherence flag (the `entry_multiple_vs_sector` comparison lives in `check.ts`, on the
 * engine arithmetic path, so §21.7 defers it to a separately-gated Tier-A PR).
 *
 * The numbers are NOT computed here — `data/comps/bands.json` is the adjudicated gospel,
 * derived offline by `scripts/comps/derive_bands.py` (a different-language reference with zero
 * imports of this file) and byte-gated by `tests/comps-regeneration.test.ts`. This module only
 * SELECTS: region from currency (§21.6) and bucket from the numeric SIC code (§21.5).
 */
import bands from '../../data/comps/bands.json';
import sectorMap from '../../data/comps/sector-map.json';
import type { SectorCompsBand } from '../engine2/types';

/** §21.6 — the five modelled currencies EXHAUST the domain, so there is no `else` arm and
 *  Global/Emerging/China are unreachable and not vendored. */
const REGION_BY_CURRENCY = {
  USD: 'US', EUR: 'Europe', GBP: 'Europe', JPY: 'Japan', INR: 'India',
} as const;
export type CompsRegion = (typeof REGION_BY_CURRENCY)[keyof typeof REGION_BY_CURRENCY];

type Range = [number, number, string];
const SIC_RANGES = sectorMap.sic_ranges.ranges as Range[];

/**
 * §21.5 — the bucket key. THREE deliberately distinct outcomes:
 *   `null`     no sector information at all ⇒ the band is null and the surface says why
 *   `'Other'`  a code exists but lands in no mapped range ⇒ the whole-market fallback
 *   a bucket   the SIC range table
 * MOST-SPECIFIC RANGE WINS is the sole tie-break (§21.5/round-3 M2). An EMPTY or absent code is
 * null — "we know nothing" — never `'Other'`, which asserts "we looked" (round-3 M1).
 */
export function compsBucket(sicCode: string | null | undefined): string | null {
  if (sicCode === null || sicCode === undefined || sicCode.trim() === '') return null;
  const n = Number.parseInt(sicCode.trim(), 10); // base 10: "0100" → 100
  if (!Number.isFinite(n)) return null;
  let best: string | null = null;
  let width = Infinity;
  for (const [lo, hi, bucket] of SIC_RANGES) {
    if (n >= lo && n <= hi && hi - lo < width) {
      best = bucket;
      width = hi - lo;
    }
  }
  return best ?? 'Other';
}

export interface CompsInputs {
  /** `DealFacts.currency` — already coerced to the five modelled values (§21.6). */
  currency: keyof typeof REGION_BY_CURRENCY;
  /** The EDGAR numeric SIC. null on ESEF/upload and on the §D6 IFRS-in-SEC route until it
   *  threads `sicCode` (§21.5b); manual deals pass `bucketOverride` instead. */
  sicCode: string | null;
  /** The manual entry screen's nine-value dropdown — already a bucket name, no inference. */
  bucketOverride?: string | null;
}

/**
 * §21.4/§21.5/§21.6 — select the adjudicated band for a deal. Returns null when there is no
 * sector information, or when the resolved bucket has no band in that region (the honest-null
 * rule: never a fabricated number, never a silent fallback to another bucket or region).
 */
export function sectorCompsFor(x: CompsInputs): SectorCompsBand | null {
  const region = REGION_BY_CURRENCY[x.currency];
  if (!region) return null;
  const bucket = x.bucketOverride?.trim() ? x.bucketOverride.trim() : compsBucket(x.sicCode);
  if (bucket === null) return null; // no sector source at all — the surface says so
  const byRegion = (bands as Record<string, Record<string, SectorCompsBand | null>>)[region];
  return byRegion?.[bucket] ?? null;
}
