/**
 * PHASE F §F1 gate — the bounded differential runs in CI: zero INVESTIGATE cells, hard
 * identities hold, and the report artifact (rebuild/F1_DIFFERENTIAL.md) is regenerated so
 * the committed report can never drift from the engines it describes.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { renderF1Report, runF1 } from '../scripts/f1/runF1';

describe('Phase F1 — differential vs DIFF_LEDGER (goldens as arbiter)', () => {
  const result = runF1();

  it('every cell is categorized; ZERO INVESTIGATE cells open (the §F1 gate)', () => {
    const detail = result.investigate.map((c) => `${c.regime} · ${c.quantity}: ${c.detail}`).join('\n');
    expect(result.investigate, `open INVESTIGATE cells:\n${detail}`).toEqual([]);
  });

  it('hard identities: entry EV and debt at par MATCH in every regime', () => {
    for (const q of ['entry EV', 'debt at par']) {
      for (const c of result.cells.filter((x) => x.quantity === q)) {
        expect(c.status, `${c.regime} ${q}: ${c.detail}`).toBe('MATCH');
      }
    }
  });

  it('G1 (all-equity) closes quantitatively: taxes MATCH; returns delta is exactly C-9 + L-16', () => {
    const g1 = result.cells.filter((c) => c.regime === 'G1');
    expect(g1.find((c) => c.quantity === 'cash taxes')?.status).toBe('MATCH');
    const irr = g1.find((c) => c.quantity === 'sponsor IRR/MOIC');
    expect(irr?.status).toBe('EXPLAINED');
    // C-9 (min cash funded) + L-16 (old engine drops surplus cash at exit — found by this
    // differential, adjudicated by golden G1, appended to the ledger 2026-07-24).
    expect(irr?.rows).toEqual(['C-9', 'L-16']);
  });

  it('every non-MATCH cell cites at least one ledger row', () => {
    for (const c of result.cells.filter((x) => x.status === 'EXPLAINED' || x.status === 'ATTRIBUTED')) {
      expect(c.rows.length, `${c.regime} · ${c.quantity} cites no ledger row`).toBeGreaterThan(0);
    }
  });

  it('writes the report artifact (rebuild/F1_DIFFERENTIAL.md) and it states the CLEAN gate', () => {
    const md = renderF1Report(result, '2026-07-24');
    writeFileSync(join(__dirname, '..', 'rebuild', 'F1_DIFFERENTIAL.md'), md);
    // the artifact must assert the gate outcome in its own text — a regressed differential
    // can't silently regenerate a passing-looking report
    expect(md).toContain('ZERO open INVESTIGATE cells');
  });
});
