/**
 * ixbrl reference REGENERATION GATE (IXBRL_SPEC §5 — the DERIVATION.md method's CI leg,
 * same mechanism as tests/goldens.test.ts): re-run the independent Python reference over
 * every committed fixture and BYTE-compare against the committed expected JSON. Any drift —
 * in the fixtures, the reference, or the committed gospel — is a red test, never a silent
 * re-baseline. (The TS parser is held to these same files in tests/edgar-ixbrl.test.ts.)
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const FIXTURES = ['synthetic-min.xhtml', 'aapl-10k-trimmed.htm', 'ch-real.xhtml', 'esef-mini.zip'];

describe('ixbrl goldens — the committed expected JSONs regenerate byte-identically', () => {
  for (const f of FIXTURES) {
    it(`${f}`, () => {
      const name = f.split('.')[0];
      const tmp = join(mkdtempSync(join(tmpdir(), 'ixbrl-')), 'out.json');
      execFileSync('python3', [
        join(ROOT, 'scripts/goldens/ixbrl_ref.py'),
        join(ROOT, 'tests/fixtures/ixbrl', f),
        tmp,
      ], { stdio: 'pipe' });
      expect(readFileSync(tmp, 'utf8')).toBe(
        readFileSync(join(ROOT, 'tests/fixtures/ixbrl/expected', `${name}.json`), 'utf8'),
      );
    });
  }
});
