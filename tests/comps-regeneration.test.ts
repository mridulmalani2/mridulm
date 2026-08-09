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
