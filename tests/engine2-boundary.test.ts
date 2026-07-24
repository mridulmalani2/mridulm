/**
 * Import-boundary lint for the dual-engine regime (rebuild/PHASE_A_SPEC.md §A4).
 *
 * Rules enforced:
 *  1. lib/engine2/** may never import from lib/engine/** or lib/dealEngineTypes.ts —
 *     engine2 is a clean room; the old types must not leak into the new contract.
 *  2. No module outside lib/engine2 may import from BOTH engines — a mixed consumer is
 *     exactly the divergence vector that killed the TS/Python era.
 *
 * This is a test (not eslint config) so it runs in the existing CI gate with zero
 * new toolchain. Sunset: Phase F, when lib/engine is deleted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..');
const SCAN_DIRS = ['lib', 'components', 'pages', 'store', 'api'];
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

/** Match static + dynamic import sources. */
function importSources(src: string): string[] {
  const out: string[] = [];
  const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

const importsOldEngine = (specs: string[]) =>
  specs.some((s) => /(^|\/)lib\/engine\/|(^|\.\.?\/)engine\/|dealEngineTypes/.test(s) && !/engine2/.test(s));
const importsNewEngine = (specs: string[]) => specs.some((s) => /engine2/.test(s));

describe('engine2 import boundary (dual-engine regime)', () => {
  it('lib/engine2 never imports the old engine or its types', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f);
      if (!rel.startsWith('lib/engine2')) continue;
      const specs = importSources(readFileSync(f, 'utf8'));
      if (importsOldEngine(specs)) offenders.push(rel);
    }
    expect(offenders, `engine2 files importing the frozen engine: ${offenders.join(', ')}`).toEqual([]);
  });

  it('no module outside engine2 imports from both engines (one sanctioned bridge)', () => {
    // PHASE_E §E1 production wiring: the OLD import flow feeds the engine2 store (one
    // extraction, two consumers) — a STATE hand-off, not a calculation mix; the numbers
    // computed on each side never cross. This is the ONLY sanctioned mixed consumer and
    // it dies with the old engine at Phase F (sunset with this whole test).
    const MIXED_ALLOWLIST = new Set(['store/dealEngine.ts']);
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f);
      if (rel.startsWith('lib/engine2') || MIXED_ALLOWLIST.has(rel)) continue;
      const specs = importSources(readFileSync(f, 'utf8'));
      if (importsOldEngine(specs) && importsNewEngine(specs)) offenders.push(rel);
    }
    expect(offenders, `mixed-engine consumers: ${offenders.join(', ')}`).toEqual([]);
  });

  it('sanity: the scanner actually sees the codebase', () => {
    expect(files.length).toBeGreaterThan(50);
  });
});
