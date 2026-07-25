/**
 * G-2 LTM-stitch golden agreement + assertion gate (Phase G-2, Tier B; SPEC §1.1).
 * Mirrors tests/goldens.test.ts for the DATA-SIDE stitch:
 *  1. Agreement: re-runs the independent reference (scripts/goldens/ltm_stitch.py — Python, zero
 *     repo imports) and fails on ANY drift from the committed tests/goldens/g2ltm/<case>/expected.json
 *     (guards against silent fixture edits — the goldens are gospel only after the DERIVATION.md
 *     G-2 adjudication is signed).
 *  2. Re-asserts the §1.1 stitch/refusal decisions in CI, permanently.
 *
 * NOTE: this adjudicates the EXPECTED outputs (the oracle). The step-3 extraction PR adds the
 * conformance test `stitch(fixture) === expected.json` once the TS stitch exists; until then these
 * fixtures are the target it must hit.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const CASES = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix'];
const load = (c: string) => JSON.parse(readFileSync(join(ROOT, 'tests/goldens/g2ltm', c, 'expected.json'), 'utf8'));

describe('G-2 LTM stitch — golden agreement', () => {
  it('committed fixtures match a fresh run of the reference derivation (no silent drift)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'g2ltm-'));
    execFileSync('python3', [join(ROOT, 'scripts/goldens/ltm_stitch.py'), tmp], { stdio: 'pipe' });
    for (const c of CASES) {
      const fresh = readFileSync(join(tmp, c, 'expected.json'), 'utf8');
      const committed = readFileSync(join(ROOT, 'tests/goldens/g2ltm', c, 'expected.json'), 'utf8');
      expect(committed, `g2ltm/${c} drifted from the reference derivation`).toBe(fresh);
    }
  });
});

describe('G-2 §1.1 committed stitch/refusal assertions', () => {
  it('(i) clean mid-year PROCEEDS — LTM rev 1080 / EBITDA 267, fresh (the M1 no-op regression guard)', () => {
    const g = load('i');
    expect(g.stitched).toBe(true);
    expect(g.revenue).toEqual({ basis: 'ltm_stitched', value: 1080.0, as_of: '2025-09-30' });
    expect(g.ebitda).toEqual({ basis: 'ltm_stitched', value: 267.0, as_of: '2025-09-30' });
    expect(g.badge).toBe('fresh');
  });

  it('(ii) 52/53-week PROCEEDS with the ≤7d disclosure note [F7]', () => {
    const g = load('ii');
    expect(g.stitched).toBe(true);
    expect(g.revenue.value).toBe(1080.0);
    expect(g.notes).toContain('<=1-week 52/53 approximation disclosed');
  });

  it('(iii) FPI/annual-only → FY, no stitch, staleness badge', () => {
    const g = load('iii');
    expect(g.stitched).toBe(false);
    expect(g.revenue.basis).toBe('fy');
    expect(g.ebitda.basis).toBe('fy');
    expect(g.badge).toBe('aging');
    expect(g.refusal_reason).toMatch(/annual-only/);
  });

  it('(iv) missing EBITDA component (D&A) → BOTH FY, EBITDA recomputed to FY 250 [F4/F5]', () => {
    const g = load('iv');
    expect(g.stitched).toBe(false);
    expect(g.revenue).toMatchObject({ basis: 'fy', value: 1000.0 });
    expect(g.ebitda).toMatchObject({ basis: 'fy', value: 250.0 }); // NOT the LTM value
    expect(g.refusal_reason).toMatch(/D&A absent/);
  });

  it('(v) FYE-change abutment failure → FY [F1]', () => {
    const g = load('v');
    expect(g.stitched).toBe(false);
    expect(g.revenue).toMatchObject({ basis: 'fy', value: 950.0 });
    expect(g.ebitda).toMatchObject({ basis: 'fy', value: 238.0 });
    expect(g.refusal_reason).toMatch(/not adjacent/);
  });

  it('(vi) restated prior-YTD >1% → BOTH FY, EBITDA is FY 250 not the stitched 267 [F3]', () => {
    const g = load('vi');
    expect(g.stitched).toBe(false);
    expect(g.revenue).toMatchObject({ basis: 'fy', value: 1000.0 });
    expect(g.ebitda).toMatchObject({ basis: 'fy', value: 250.0 }); // the pair-fallback bug guard
    expect(g.refusal_reason).toMatch(/restated >1%/);
  });

  it('(vii) revenue stitchable but EBITDA (OperInc) refuses → BOTH FY [F4]', () => {
    const g = load('vii');
    expect(g.stitched).toBe(false);
    expect(g.revenue.basis).toBe('fy');
    expect(g.ebitda.basis).toBe('fy');
    expect(g.refusal_reason).toMatch(/OperInc absent/);
  });

  it('(viii) NTM base case PROCEEDS — LTM rev 1320 / EBITDA 328 [B1 stitch part]', () => {
    const g = load('viii');
    expect(g.stitched).toBe(true);
    expect(g.revenue.value).toBe(1320.0);
    expect(g.ebitda.value).toBe(328.0);
  });

  it('(ix) ESEF single-vintage prior-YTD → FY, fail-closed (un-evaluable) [M1]', () => {
    const g = load('ix');
    expect(g.stitched).toBe(false);
    expect(g.revenue.basis).toBe('fy');
    expect(g.refusal_reason).toMatch(/single vintage.*un-evaluable/);
  });
});
