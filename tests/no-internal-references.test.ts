/**
 * Nothing a user reads cites the project's own working documents. A reader of the interface or the
 * Excel model has never seen the specification, the research notes or the code, so a pointer into
 * them ("SPEC §9", "DR-4", "§8 roll", "da_pct") explains nothing and reads as unfinished work.
 *
 * What is checked, in every file that produces user-visible text (comments removed):
 *   - the word SPEC;
 *   - a section mark that points into the specification. A statute keeps its mark: a section
 *     numbered 100 or above (§163(j), §382), or one introduced as "IRC §" or "Reg. §";
 *   - research-note ids (DR-1 to DR-5), "owner decision", build-phase names (Phase A to G);
 *   - the engine's own version labels (v1, v2) and field names inside a sentence.
 *
 * Comments are for developers and are not checked. Statute citations are sources a reader can
 * look up, so they stay.
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

/** A section mark that is not a statute: below 100 and not introduced as IRC or a Treasury regulation. */
export function internalSectionMarks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/§\s?(\d+)/g)) {
    const before = text.slice(Math.max(0, m.index - 6), m.index);
    if (Number(m[1]) >= 100 || /(IRC|Reg\.) $/.test(before)) continue;
    out.push(m[0]);
  }
  return out;
}

/** Every internal reference found in a piece of user-visible text. */
export function internalReferences(text: string): string[] {
  return [
    ...(text.match(/\bSPEC\b/g) ?? []),
    ...internalSectionMarks(text),
    ...(text.match(/\bDR-\d/g) ?? []),
    ...(text.match(/owner[- ]deci(sion|ded)/gi) ?? []),
    ...(text.match(/\bPhase [A-G]\b/g) ?? []),
  ];
}

describe('no internal reference in anything a user reads', () => {
  it('a statute keeps its section mark; a pointer into the specification does not', () => {
    expect(internalReferences('IRC §163(j): 30% of ATI; the §382 limit; IRC §11(b); Treas. Reg. §1.163-7(c); §338(h)(10)')).toEqual([]);
    expect(internalReferences('the §8 mechanical roll (SPEC §9/§11), per DR-4 Cat.7; owner decision; Phase G')).toEqual(['SPEC', '§8', '§9', '§11', 'DR-4', 'owner decision', 'Phase G']);
  });

  it('the scan reaches the files it is meant to', () => {
    const files = ROOTS.flatMap(walk);
    for (const known of ['components/deal-engine/v2/OutputTabs.tsx', 'lib/engine2/check.ts', 'lib/engine2/workbook.ts', 'lib/engine2/disclosures.ts', 'lib/engine2/suggest.ts']) expect(files).toContain(known);
  });

  for (const rel of ROOTS.flatMap(walk)) {
    it(rel, () => {
      const hits = code(readFileSync(join(ROOT, rel), 'utf8')).split('\n')
        .map((l, i) => [i + 1, l.trim()] as const)
        .filter(([, l]) => internalReferences(l).length > 0);
      expect(hits.map(([n, l]) => `${n}: ${l.slice(0, 140)}`), `${rel} still shows an internal reference to the user`).toEqual([]);
    });
  }

  it('the cited conventions shown as sources carry none either', () => {
    const json = JSON.parse(readFileSync(join(ROOT, 'lib/engine2/suggestions/conventions.json'), 'utf8')) as unknown;
    const cites: string[] = [];
    const visit = (n: unknown) => { if (n && typeof n === 'object') for (const [k, v] of Object.entries(n)) { if (k === 'citation' && typeof v === 'string') cites.push(v); else visit(v); } };
    visit(json);
    expect(cites.filter((c) => internalReferences(c).length > 0 || /\binternal\b/i.test(c))).toEqual([]);
  });
});
