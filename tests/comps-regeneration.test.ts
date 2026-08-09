/**
 * SPEC §21.10(3)/(4) — the Tier-B CI gates for the sector comps band.
 *
 * Tier B demands the SAME enforceable mechanism the engine goldens carry, redirected at the new
 * data-side computation: an ordinary same-language fixture with no regeneration gate is NOT
 * acceptable (PHASE_G). So, exactly as `goldens.test.ts` does for `spec_calc.py`:
 *   (1) re-run the DIFFERENT-LANGUAGE reference (`scripts/comps/derive_bands.py`) into a temp
 *       dir and BYTE-compare against the committed `bands.json`;
 *   (2) pin each vendored CSV's SHA-256, so a silent upstream re-publish cannot slip in
 *       unadjudicated;
 *   (3) REDDEN once the committed vintage is more than 15 months old — the manual annual
 *       refresh is the one step this design rests on, so it gets a forcing function rather
 *       than a hope (§21.10(4); the repo's `stalenessTier` is deliberately NOT reused, its
 *       filing-cadence thresholds being wrong for an annual January publication).
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync, mkdtempSync } from 'fs';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const RAW = join(ROOT, 'data/comps/raw');

/** §21.3 — pinned in scripts/comps/refresh.md; both must move together, deliberately. */
const SHA256: Record<string, string> = {
  US: 'acdcf15ee968468dca0e976d86cccc80fe35ca3ed7889de80ff0a88aee5b2cc4',
  Europe: 'e55066e0d7195f04f0db3d8f7632706fd691f581b27f4c13064eafb04da2a189',
  Japan: '5c22303d4f714eb33b32164f8387e8d4a01052d6a10c5a11c521d77f3dd6f009',
  India: '835a077306a424fcaf22c82a713b47d973d88a4f5feda86ee167ac3eca1f0fbc',
};
const VINTAGE_MAX_MONTHS = 15;

const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

describe('§21.10(3) — bands.json regenerates byte-identically from the reference derivation', () => {
  it('committed bands.json matches a fresh run of scripts/comps/derive_bands.py', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'comps-'));
    execFileSync('python3', [join(ROOT, 'scripts/comps/derive_bands.py'), tmp], { stdio: 'pipe' });
    const fresh = readFileSync(join(tmp, 'bands.json'), 'utf8');
    const committed = readFileSync(join(ROOT, 'data/comps/bands.json'), 'utf8');
    expect(committed, 'bands.json drifted from the reference derivation').toBe(fresh);
  });
});

describe('§21.10(4) — the vendored CSVs are integrity- and freshness-pinned', () => {
  for (const [region, want] of Object.entries(SHA256)) {
    it(`${region}.csv matches its pinned SHA-256 (an upstream re-publish must be adjudicated, not absorbed)`, () => {
      expect(sha256(join(RAW, `${region}.csv`)), `${region}.csv changed — re-run scripts/comps/refresh.md and RE-ADJUDICATE`).toBe(want);
    });
  }

  it(`the committed vintage is younger than ${VINTAGE_MAX_MONTHS} months (the forcing function on the manual annual refresh)`, () => {
    const bands = JSON.parse(readFileSync(join(ROOT, 'data/comps/bands.json'), 'utf8'));
    const vintage: string = bands.US.Technology.vintage; // e.g. "5 Jan 26"
    const m = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2})$/.exec(vintage.trim());
    expect(m, `unparseable vintage "${vintage}"`).not.toBeNull();
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mi = months.indexOf(m![2].toLowerCase());
    expect(mi, `unknown month in "${vintage}"`).toBeGreaterThanOrEqual(0);
    const published = new Date(2000 + Number(m![3]), mi, Number(m![1]));
    const ageMonths = (Date.now() - published.getTime()) / (365.25 / 12 * 86_400_000);
    expect(ageMonths, `comps vintage "${vintage}" is ${ageMonths.toFixed(1)} months old — run scripts/comps/refresh.md and RE-ADJUDICATE (SPEC §21.10(4))`)
      .toBeLessThan(VINTAGE_MAX_MONTHS);
  });
});

describe('§21.4/§21.5 — the committed bands carry the shape the spec pins', () => {
  const bands = JSON.parse(readFileSync(join(ROOT, 'data/comps/bands.json'), 'utf8'));

  it('four regions only — Global/Emerging/China are unreachable and NOT vendored (§21.6)', () => {
    expect(Object.keys(bands).sort()).toEqual(['Europe', 'India', 'Japan', 'US']);
  });

  it('every non-null band is ordered low ≤ median ≤ high (§21.8(a))', () => {
    for (const [region, buckets] of Object.entries(bands as Record<string, Record<string, null | { low: number; median: number; high: number }>>)) {
      for (const [bucket, b] of Object.entries(buckets)) {
        if (b === null) continue;
        expect(b.low, `${region}/${bucket}`).toBeLessThanOrEqual(b.median);
        expect(b.median, `${region}/${bucket}`).toBeLessThanOrEqual(b.high);
      }
    }
  });

  it("§21.8(b): the 'sector' basis carries constituents; the 'Other' basis carries none but IS non-null", () => {
    const us = bands.US;
    expect(us.Technology.basis).toBe('sector');
    expect(us.Technology.industries_used).toBeGreaterThanOrEqual(1);
    // the carve-out the round-1 review found as a live counterexample to the biconditional
    expect(us.Other.basis).toBe('total_market_ex_financials');
    expect(us.Other.industries_used).toBe(0);
    expect(us.Other.low).toBe(us.Other.median);
    expect(us.Other.firms).toBe(4822);
  });

  it('the pinned §21.5 worked bands (US) reproduce exactly — the spec is checkable, not decorative', () => {
    const us = bands.US;
    expect([us.Technology.low, us.Technology.median, us.Technology.high]).toEqual([22.01, 24.48, 24.48]);
    expect([us.Healthcare.low, us.Healthcare.median, us.Healthcare.high]).toEqual([15.25, 15.78, 19.78]);
    expect([us.Industrials.low, us.Industrials.median, us.Industrials.high]).toEqual([11.39, 15.61, 17.18]);
    expect([us.Consumer.low, us.Consumer.median, us.Consumer.high]).toEqual([10.39, 13.17, 14.93]);
    expect([us.Energy.low, us.Energy.median, us.Energy.high]).toEqual([5.15, 8.63, 11.56]);
    expect([us['Business Services'].low, us['Business Services'].median, us['Business Services'].high]).toEqual([9.26, 12.00, 14.26]);
    // §21.9's corrected disclosure: US financials are NOT unavailable — the three NA bank rows
    // drop out and asset managers/non-bank financials set the band (round-1 B2).
    expect([us['Financial Services'].low, us['Financial Services'].median, us['Financial Services'].high]).toEqual([38.03, 38.03, 57.52]);
    expect(us['Financial Services'].industries_used).toBe(6);
    expect(us['Financial Services'].firms).toBe(558); // NOT 1173 — the 15+568+32 NA rows are excluded
    // §21.4: a dominant constituent collapses the band, and that is correct
    expect([us['Real Estate'].low, us['Real Estate'].median, us['Real Estate'].high]).toEqual([19.87, 19.87, 19.87]);
  });

  it('§21.10(2): the Japan Real Estate DISCRIMINATOR — nearest-rank 8.91, not interpolation 10.71', () => {
    const jp = bands.Japan['Real Estate'];
    expect(jp.firms).toBe(168);            // W; p·W = 42.00 lands EXACTLY on c₁ (n=42)
    expect(jp.low).toBe(8.91);             // `≥` takes constituent 1
    expect(jp.low).not.toBe(10.71);        // the interpolated answer
    expect(jp.low).not.toBe(11.31);        // the `>` answer — the boundary rule is load-bearing
  });
});

describe('§21.10(4) — ALL 36 bands are pinned, not just the US nine (audit B3: the drift bound was US-only)', () => {
  const bands = JSON.parse(readFileSync(join(ROOT, 'data/comps/bands.json'), 'utf8'));

  // The signed gospel, in full. The byte gate is regeneration-SYMMETRIC — it re-runs the same
  // reference over the same inputs, so it cannot catch a change to an INPUT of the reference
  // (sector-map.json, derive_bands.py). The audit built three such changes that moved a
  // displayed band with all gates green. This table is what closes that hole.
  const GOSPEL: [string, string, number, number, number, number, number][] = [
    ['US', 'Business Services', 9.26, 12.0, 14.26, 7, 324],
    ['US', 'Consumer', 10.39, 13.17, 14.93, 23, 917],
    ['US', 'Energy', 5.15, 8.63, 11.56, 9, 371],
    ['US', 'Financial Services', 38.03, 38.03, 57.52, 6, 558],
    ['US', 'Healthcare', 15.25, 15.78, 19.78, 6, 1178],
    ['US', 'Industrials', 11.39, 15.61, 17.18, 24, 929],
    ['US', 'Other', 16.95, 16.95, 16.95, 0, 4822],
    ['US', 'Real Estate', 19.87, 19.87, 19.87, 5, 296],
    ['US', 'Technology', 22.01, 24.48, 24.48, 11, 806],
    ['Europe', 'Business Services', 8.41, 12.81, 12.81, 7, 442],
    ['Europe', 'Consumer', 10.92, 12.43, 15.23, 23, 1340],
    ['Europe', 'Energy', 2.66, 7.58, 9.5, 9, 357],
    ['Europe', 'Financial Services', 10.43, 10.43, 17.01, 7, 625],
    ['Europe', 'Healthcare', 12.59, 16.17, 17.0, 6, 642],
    ['Europe', 'Industrials', 8.78, 11.01, 14.98, 24, 1597],
    ['Europe', 'Other', 10.77, 10.77, 10.77, 0, 5757],
    ['Europe', 'Real Estate', 18.83, 24.11, 24.55, 5, 491],
    ['Europe', 'Technology', 12.03, 17.27, 20.85, 11, 884],
    ['Japan', 'Business Services', 6.21, 11.73, 11.73, 7, 417],
    ['Japan', 'Consumer', 8.97, 10.25, 12.84, 23, 1073],
    ['Japan', 'Energy', 7.86, 7.86, 8.45, 5, 56],
    ['Japan', 'Financial Services', 18.5, 18.5, 93.68, 6, 122],
    ['Japan', 'Healthcare', 9.7, 12.39, 15.03, 6, 206],
    ['Japan', 'Industrials', 7.11, 8.94, 12.15, 24, 1064],
    ['Japan', 'Other', 10.36, 10.36, 10.36, 0, 3762],
    ['Japan', 'Real Estate', 8.91, 11.31, 23.86, 5, 168],
    ['Japan', 'Technology', 11.77, 12.51, 12.52, 11, 777],
    ['India', 'Business Services', 25.16, 25.16, 29.97, 7, 187],
    ['India', 'Consumer', 26.5, 27.38, 27.45, 22, 1395],
    ['India', 'Energy', 10.79, 11.11, 11.94, 8, 107],
    ['India', 'Financial Services', 16.65, 24.65, 28.93, 6, 605],
    ['India', 'Healthcare', 20.91, 20.91, 34.98, 6, 328],
    ['India', 'Industrials', 17.18, 18.26, 23.2, 23, 1869],
    ['India', 'Other', 17.56, 17.56, 17.56, 0, 4523],
    ['India', 'Real Estate', 26.65, 26.65, 26.65, 5, 220],
    ['India', 'Technology', 17.73, 17.73, 24.41, 11, 414],
  ];

  for (const [region, bucket, low, median, high, k, firms] of GOSPEL) {
    it(`${region} / ${bucket} = ${low} / ${median} / ${high} (k=${k}, W=${firms})`, () => {
      const b = bands[region][bucket];
      expect(b, `${region}/${bucket} missing`).not.toBeNull();
      expect([b.low, b.median, b.high, b.industries_used, b.firms]).toEqual([low, median, high, k, firms]);
    });
  }

  it('§21.8(b) holds STRUCTURALLY on every band, not just on spot values', () => {
    for (const region of Object.keys(bands)) {
      for (const [bucket, b] of Object.entries(bands[region] as Record<string, any>)) {
        if (b === null) continue;
        if (b.basis === 'sector') expect(b.industries_used, `${region}/${bucket}`).toBeGreaterThanOrEqual(1);
        else expect(b.industries_used, `${region}/${bucket}`).toBe(0);
        expect(b.firms, `${region}/${bucket}`).toBeGreaterThan(0);
        expect(b.region, `${region}/${bucket}`).toBe(region);
        expect(b.bucket, `${region}/${bucket}`).toBe(bucket);
      }
    }
  });

  it('§21.11(v): India takes the FIRST duplicate aggregate row — 17.56/4523, NEVER 16.35/3850', () => {
    // The round-1 B6 defect is silently reintroducible: the audit removed the first-row rule
    // from the reference, regenerated, and every gate stayed green.
    expect([bands.India.Other.low, bands.India.Other.firms]).toEqual([17.56, 4523]);
    expect(bands.India.Other.low).not.toBe(16.35);
    expect(bands.India.Other.firms).not.toBe(3850);
  });

  it('every region carries the SAME bucket key set (so a cross-region fallback is detectable)', () => {
    const keys = Object.keys(bands.US).sort();
    for (const r of ['Europe', 'Japan', 'India']) expect(Object.keys(bands[r]).sort()).toEqual(keys);
  });

  it('the vintage gate covers EVERY band, not one region (audit M-f)', () => {
    for (const region of Object.keys(bands)) {
      for (const [bucket, b] of Object.entries(bands[region] as Record<string, any>)) {
        if (b !== null) expect(b.vintage, `${region}/${bucket}`).toBe('5 Jan 26');
      }
    }
  });
});
