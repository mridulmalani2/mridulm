/**
 * Single-engine guard (post-cutover). The dual-engine regime SUNSET with the F-tail
 * deletion (2026-07-24, owner-accelerated; tag `pre-deletion-lib-engine`): lib/engine,
 * lib/dealEngineTypes.ts and the sanctioned mixed-consumer bridge are gone. What remains
 * enforced: the old paths STAY gone — nothing may reintroduce an import of the deleted
 * engine, and lib/engine2 is the one calculation tree.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..');
const SCAN_DIRS = ['lib', 'components', 'pages', 'store', 'api', 'scripts'];
const EXTS = new Set(['.ts', '.tsx']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTS.has(p.slice(p.lastIndexOf('.')))) out.push(p);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => {
  try { return walk(join(ROOT, d)); } catch { return []; }
});

function importSources(src: string): string[] {
  const out: string[] = [];
  const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

describe('single-engine guard (the dual-engine regime is sunset)', () => {
  it('the old engine tree is deleted and stays deleted', () => {
    expect(existsSync(join(ROOT, 'lib', 'engine'))).toBe(false);
    expect(existsSync(join(ROOT, 'lib', 'dealEngineTypes.ts'))).toBe(false);
  });

  it('no module imports the deleted engine paths', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const specs = importSources(readFileSync(f, 'utf8'));
      if (specs.some((s) => (/(^|\/)lib\/engine\/|dealEngineTypes/.test(s) || /(^|\.\.?\/)engine\/(?!.*gateway)/.test(s)) && !/engine2/.test(s))) {
        offenders.push(relative(ROOT, f));
      }
    }
    expect(offenders, `imports of the deleted engine: ${offenders.join(', ')}`).toEqual([]);
  });

  it('sanity: the scanner actually sees the codebase', () => {
    expect(files.length).toBeGreaterThan(40);
  });
});
