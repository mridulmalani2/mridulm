/**
 * §21.11 — the golden-uncovered branches of the sector comps band, as DIRECTED fixtures.
 * The bands themselves are gospel (two blind passes SIGNED, byte-gated by
 * comps-regeneration.test.ts); what this file pins is SELECTION — region from currency,
 * bucket from the numeric SIC, and the three-outcome trichotomy.
 *
 * MUTANTS (run RED via string-replace, then reverted):
 * (M-a) the SIC table sorted ASCENDING BY `lo` and first-match-wins, instead of
 *   most-specific-wins — this reproduces the round-2 sign-off defect exactly (every REIT to
 *   Financial Services, 38.03/38.03/57.52 instead of Real Estate's 19.87×3). MEASURED at step 5: reds 6 tests — 5 in this file (both (x) items, the defect set, the
 *   parse rules, the override precedence) and the REIT end-to-end in comps-wiring. NOTE, because it matters to a future
 *   maintainer: a WEAKER variant — first match in the array's own order — does NOT red, because
 *   the committed array happens to list the 6798 and 1531 carve-outs first. Array order is
 *   therefore NOT the mechanism and must never be relied on as one; most-specific-wins is, and
 *   it is order-independent by construction;
 * (M-b) an absent SIC returning 'Other' instead of null — the defect the promoted `inferSector`
 *   ladder could not avoid — reds (viii);
 * (M-c) GBP routed to its own region instead of Europe reds (vi).
 */
import { describe, it, expect } from 'vitest';
import { compsBucket, sectorCompsFor } from '../lib/edgar/comps';

describe('§21.11(x) — THE ORDERING PIN: most-specific-wins, not ascending scan', () => {
  it('SIC 6798 (REITs) and 6512 bucket to Real Estate, NOT the 6000–6999 financial default', () => {
    // The round-2 sign-off found `inferSector` sending every EDGAR REIT to Financial Services
    // via /invest/ before /reit/ — a 2× wrong band on the canonical real-estate issuer code.
    expect(compsBucket('6798')).toBe('Real Estate');
    expect(compsBucket('6512')).toBe('Real Estate');
    expect(compsBucket('6022')).toBe('Financial Services'); // the default still applies elsewhere
  });

  it('the ordering is VISIBLE in the band a REIT actually gets', () => {
    const reit = sectorCompsFor({ currency: 'USD', sicCode: '6798' })!;
    expect(reit.bucket).toBe('Real Estate');
    expect([reit.low, reit.median, reit.high]).toEqual([19.87, 19.87, 19.87]);
    const bank = sectorCompsFor({ currency: 'USD', sicCode: '6022' })!;
    expect([bank.low, bank.median, bank.high]).toEqual([38.03, 38.03, 57.52]);
  });
});

describe('§21.11(viii) — the three outcomes are DISTINGUISHABLE, not merely non-crashing', () => {
  it('a mapped code ⇒ a bucket (the sector basis)', () => {
    const b = sectorCompsFor({ currency: 'USD', sicCode: '7372' })!; // prepackaged software
    expect(b.bucket).toBe('Technology');
    expect(b.basis).toBe('sector');
    expect(b.industries_used).toBeGreaterThanOrEqual(1);
  });

  it("a code in NO range ⇒ 'Other' ⇒ the whole-market fallback, labelled as such", () => {
    expect(compsBucket('9995')).toBe('Other'); // nonclassifiable
    const b = sectorCompsFor({ currency: 'USD', sicCode: '9995' })!;
    expect(b.basis).toBe('total_market_ex_financials');
    expect(b.industries_used).toBe(0);
    expect(b.firms).toBe(4822);
    expect([b.low, b.median, b.high]).toEqual([16.95, 16.95, 16.95]);
  });

  it('NO code at all ⇒ null bucket ⇒ null band — "we know nothing" is NOT "we looked"', () => {
    for (const absent of [null, undefined, '', '   ']) {
      expect(compsBucket(absent as string | null | undefined), String(absent)).toBeNull();
    }
    expect(sectorCompsFor({ currency: 'USD', sicCode: null })).toBeNull();   // the ESEF/upload route
    expect(sectorCompsFor({ currency: 'EUR', sicCode: '' })).toBeNull();
  });

  it('the manual dropdown is taken DIRECTLY as the bucket (no inference)', () => {
    const b = sectorCompsFor({ currency: 'USD', sicCode: null, bucketOverride: 'Healthcare' })!;
    expect(b.bucket).toBe('Healthcare');
    expect([b.low, b.median, b.high]).toEqual([15.25, 15.78, 19.78]);
  });
});

describe('§21.11(vi) — region selection across the five modelled currencies', () => {
  it('USD→US, EUR→Europe, GBP→Europe, JPY→Japan, INR→India', () => {
    const region = (c: 'USD' | 'EUR' | 'GBP' | 'JPY' | 'INR') =>
      sectorCompsFor({ currency: c, sicCode: '7372' })!.region;
    expect(region('USD')).toBe('US');
    expect(region('EUR')).toBe('Europe');
    expect(region('GBP')).toBe('Europe'); // both European currencies share the dataset
    expect(region('JPY')).toBe('Japan');
    expect(region('INR')).toBe('India');
  });

  it('the region genuinely changes the number (the dataset is not a US table in disguise)', () => {
    const us = sectorCompsFor({ currency: 'USD', sicCode: '7372' })!;
    const jp = sectorCompsFor({ currency: 'JPY', sicCode: '7372' })!;
    expect(us.median).toBe(24.48);
    expect(jp.median).toBe(12.51); // Japan trades ~half the US multiple on the same bucket
    expect(jp.vintage).toBe(us.vintage);
  });
});

describe('§21.11 — the SIC table routes the cases the sign-off measured', () => {
  it('the round-2/3 defect set all bucket correctly (each was a live misroute or fall-through)', () => {
    const cases: [string, string][] = [
      ['2911', 'Energy'],            // Petroleum Refining — fell through to 'Other' (16.95x) in r3
      ['4911', 'Energy'],            // Electric Services — went to Business Services via /service/
      ['3661', 'Technology'],        // Telephone & Telegraph Apparatus
      ['4841', 'Consumer'],          // Cable & Other Pay TV
      ['7812', 'Consumer'],          // Motion Picture Production
      ['7011', 'Consumer'],          // Hotels & Motels — the r3 regression
      ['1531', 'Consumer'],          // Operative Builders (homebuilding)
      ['3711', 'Industrials'],       // Motor Vehicles
      ['3312', 'Industrials'],       // Steel Works
      ['4512', 'Industrials'],       // Air Transportation
      ['4813', 'Business Services'], // Telephone Communications
      ['2836', 'Healthcare'],        // Biological Products
      ['8062', 'Healthcare'],        // General Medical & Surgical Hospitals
      ['3674', 'Technology'],        // Semiconductors
      ['5812', 'Consumer'],          // Eating Places
    ];
    for (const [sic, want] of cases) expect(compsBucket(sic), `SIC ${sic}`).toBe(want);
  });

  it('§21.5 parse rules: base-10 with leading zeros preserved', () => {
    expect(compsBucket('0100')).toBe('Industrials'); // NOT parsed as octal
    expect(compsBucket(' 6798 ')).toBe('Real Estate'); // trimmed
  });
});

describe('§21.11(iv) — the honest-null rule has a directed fixture (no live case exists)', () => {
  it('a bucket with no band in a region returns null, never a fallback to another bucket', () => {
    // Every vendored (region, bucket) pair currently HAS a band — both adjudication passes
    // confirmed no null exists in the committed set — so the rule is exercised here directly.
    expect(sectorCompsFor({ currency: 'USD', sicCode: null, bucketOverride: 'Nonexistent Bucket' })).toBeNull();
  });
});

describe('audit hardening — the mutants that survived the first cut', () => {
  it('M-b: NO silent CROSS-REGION fallback (a bucket missing here must not borrow the US band)', () => {
    for (const c of ['USD', 'EUR', 'JPY', 'INR'] as const) {
      const b = sectorCompsFor({ currency: c, sicCode: '7372' })!;
      expect(b.region, c).toBe({ USD: 'US', EUR: 'Europe', JPY: 'Japan', INR: 'India' }[c]);
    }
  });

  it('M-c: bucketOverride WINS over the SIC, and a whitespace-only override falls back to it', () => {
    // both supplied ⇒ the explicit user choice governs
    expect(sectorCompsFor({ currency: 'USD', sicCode: '6022', bucketOverride: 'Technology' })!.bucket).toBe('Technology');
    // a blank override is not a choice ⇒ the SIC still governs
    expect(sectorCompsFor({ currency: 'USD', sicCode: '6798', bucketOverride: '   ' })!.bucket).toBe('Real Estate');
  });

  it('M-d/M-e: garbage and out-of-domain codes are NULL ("we know nothing"), never a cited band', () => {
    for (const bad of ['ABCD', '0000', '0', '-1', '-6798', '10000', '99999', '99', 'NaN', 'Infinity']) {
      expect(compsBucket(bad), bad).toBeNull();
    }
    // …while a genuine in-domain code with no mapped range IS 'Other' — "we looked"
    expect(compsBucket('9995')).toBe('Other');
  });

  it('M-a: a prototype key can never masquerade as a band', () => {
    for (const proto of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(sectorCompsFor({ currency: 'USD', sicCode: null, bucketOverride: proto }), proto).toBeNull();
    }
  });
});
