// @vitest-environment happy-dom
/**
 * The TS parser is held to the SAME adjudicated gospel as the Python reference
 * (IXBRL_SPEC §5): parseIxbrlUpload(fixture) must equal tests/fixtures/ixbrl/expected/*.json
 * on facts, notes, identity, routing and modal currency — two independent implementations,
 * one committed truth (the regeneration gate keeps the truth honest). Plus the §2/§3
 * orchestration pins: restamp (default-sparing, URL-honest, cik10-cleared), fix-ups,
 * interim/zero-fact rejections, and the mapper integrations.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseIxbrlUpload, uploadedFilingToRaw } from '../lib/edgar/ixbrl';

const ROOT = join(__dirname, '..');
const FIX = (f: string) => new Uint8Array(readFileSync(join(ROOT, 'tests/fixtures/ixbrl', f)));
const EXPECTED = (n: string) => JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/ixbrl/expected', `${n}.json`), 'utf8'));

const FIXTURES = ['synthetic-min.xhtml', 'aapl-10k-trimmed.htm', 'ch-real.xhtml', 'esef-mini.zip'];

describe('parseIxbrlUpload ≡ the adjudicated reference gospel (per-fixture)', () => {
  for (const f of FIXTURES) {
    it(f, () => {
      const name = f.split('.')[0];
      const exp = EXPECTED(name);
      const got = parseIxbrlUpload(f, FIX(f));
      const projected = got.facts.map(({ concept, period, unit, dims, value, decimals }) =>
        ({ concept, period, unit, dims, value, decimals }));
      expect(projected).toEqual(exp.facts);
      expect([...got.notes]).toEqual(exp.notes);
      expect(got.identity).toEqual(exp.identity);
      expect(got.routing).toBe(exp.routing);
      expect(got.modalCurrency).toBe(exp.modal_currency);
    });
  }
});

describe('uploadedFilingToRaw — the §2/§3 orchestration (mappers reused, restamp honest)', () => {
  it('Apple 10-K: us-gaap route through mapCompanyFacts; headline values exact; restamp + no fabricated URL/CIK', () => {
    const raw = uploadedFilingToRaw('aapl-10k-trimmed.htm', FIX('aapl-10k-trimmed.htm'));
    expect(raw.origin).toBe('upload');
    expect(raw.cik10).toBeUndefined(); // R3-1: the pseudo-CIK never presents
    expect(raw.entityName).toBe('Apple Inc.');
    expect(raw.basis).toBe('FY'); // the stitch RUNS and REFUSES (no interim durations)
    expect(raw.fy_revenue?.value).toBeCloseTo(391035, 6); // $m — EDGAR-published FY2024
    expect(raw.fy_revenue?.provenance.source).toBe('upload');
    expect(raw.fy_revenue?.provenance.detail.endsWith('· uploaded aapl-10k-trimmed.htm')).toBe(true);
    expect(raw.fy_revenue?.provenance.url).toBeUndefined(); // accn '' short-circuits filingUrl
    expect(raw.fy_ebitda?.provenance.detail).toContain('· 10-K'); // form from the FACT (synthesized docType)
    expect(raw.history?.revenue.points.length).toBeGreaterThanOrEqual(3); // in-document comparatives
    expect(raw.as_of).toBe('2024-09-28');
  });

  it("ch-real (Companies House FRC): identity-only import — gaps, GBP, staleness date, FRC note, and the 'default' tax tag SURVIVES the restamp", () => {
    const exp = EXPECTED('ch-real');
    const raw = uploadedFilingToRaw('ch-real.xhtml', FIX('ch-real.xhtml'));
    expect(raw.origin).toBe('upload');
    expect(raw.entityName).toBe(exp.identity.name); // uk-bus legal name
    expect(raw.fy_revenue).toBeNull(); // §2b truth: v1 maps NO financial field from FRC
    expect(raw.fy_ebitda).toBeNull();
    expect(raw.currency).toBe('GBP'); // §2c fix-up from the document's modal unit — never the mapper's EUR default
    expect(raw.periodEnd).toBe(exp.identity.balanceSheetDate); // §2c: badges STALE off its own date
    expect(raw.as_of).toBe(exp.identity.balanceSheetDate);
    expect(raw.fiscalYear).toBe(Number(exp.identity.balanceSheetDate.slice(0, 4)));
    expect(raw.days_notes.some((n) => n.startsWith('FRC (Companies House) accounts:'))).toBe(true);
    // R2-2: the statutory tax fallback keeps its 'default' tag — the template-badge
    // downgrade in factsAdapter depends on it (an 'upload' stamp here is the mislabel class)
    if (raw.effective_tax_rate) expect(raw.effective_tax_rate.provenance.source).toBe('default');
    expect(raw.gaps.length).toBeGreaterThan(0);
  });

  it('esef-mini.zip: nested reports parsed + merged through mapIfrsReport; conflict became a gap-note', () => {
    const raw = uploadedFilingToRaw('esef-mini.zip', FIX('esef-mini.zip'));
    expect(raw.origin).toBe('upload');
    expect(raw.entityName).toBe('Mini ESEF Oy');
    expect(raw.fy_revenue?.value).toBeCloseTo(1.0, 9); // 1,000,000 EUR → 1.0m
    expect(raw.fy_revenue?.provenance.source).toBe('upload');
    expect(raw.days_notes.some((n) => n.includes('inconsistent duplicate ifrs-full:CashAndCashEquivalents'))).toBe(true);
  });

  it('interim uploads are REJECTED up-front (scope: annual documents only)', () => {
    const interim = new TextEncoder().encode(readFileSync(join(ROOT, 'tests/fixtures/ixbrl/synthetic-min.xhtml'), 'utf8')
      .replace('>FY</ix:nonNumeric>', '>Q2</ix:nonNumeric>')
      .replace('>10-K</ix:nonNumeric>', '>10-Q</ix:nonNumeric>'));
    expect(() => uploadedFilingToRaw('interim.htm', interim)).toThrow(/interim filings aren't supported/);
  });

  it('zero-fact uploads are an ERROR, never an empty import', () => {
    const none = new TextEncoder().encode('<html xmlns="http://www.w3.org/1999/xhtml"><body><p>just prose</p></body></html>');
    expect(() => uploadedFilingToRaw('prose.htm', none)).toThrow(/no XBRL facts found/);
  });
});
