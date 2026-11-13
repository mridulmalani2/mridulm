/**
 * Owner rule (2026-11-12): nothing a user reads carries an em dash. This scans every file that
 * produces user-visible text (the interface, the stores, the engine's labels, warnings and
 * disclosures, the Excel labels, the data-layer notes, the memo) with comments removed.
 * Comments are for developers and are not checked.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const ROOTS = ['components/deal-engine', 'pages/DealEngine.tsx', 'store', 'lib/engine2', 'lib/cleaning', 'lib/statements', 'lib/edgar', 'lib/format', 'lib/analysis', 'lib/trace', 'lib/ai2/memo.ts', 'lib/assistant'];

function walk(rel: string): string[] {
  const abs = join(ROOT, rel);
  if (statSync(abs).isFile()) return [rel];
  return readdirSync(abs, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${rel}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${rel}/${e.name}`] : []));
}

/** Source with block comments and whole-line / trailing line comments blanked out. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l.replace(/\s\/\/\s.*$/, '')))
    .join('\n');
}

describe('no em dash in anything a user reads', () => {
  it('the scan reaches the files it is meant to', () => {
    const files = ROOTS.flatMap(walk);
    for (const known of ['components/deal-engine/v2/OutputTabs.tsx', 'lib/engine2/check.ts', 'lib/engine2/workbook.ts', 'lib/engine2/disclosures.ts', 'lib/edgar/ixbrl.ts']) expect(files).toContain(known);
  });

  for (const rel of ROOTS.flatMap(walk)) {
    it(rel, () => {
      const hits = code(readFileSync(join(ROOT, rel), 'utf8')).split('\n')
        .map((l, i) => [i + 1, l.trim()] as const)
        .filter(([, l]) => l.includes('—') || l.includes('\\u2014'));
      expect(hits.map(([n, l]) => `${n}: ${l.slice(0, 120)}`), `${rel} still shows an em dash to the user`).toEqual([]);
    });
  }

  it('the cited conventions shown as sources carry none either', () => {
    const json = JSON.parse(readFileSync(join(ROOT, 'lib/engine2/suggestions/conventions.json'), 'utf8')) as unknown;
    const cites: string[] = [];
    const visit = (n: unknown) => { if (n && typeof n === 'object') for (const [k, v] of Object.entries(n)) { if (k === 'citation' && typeof v === 'string') cites.push(v); else visit(v); } };
    visit(json);
    expect(cites.filter((c) => c.includes('—'))).toEqual([]);
  });
});
