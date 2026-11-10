import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from '../../node_modules/fflate';
const [dir, recalc] = process.argv.slice(2);
// the same raw-XML reader the parity suite uses (ExcelJS drops a cached 0)
function read(path: string) {
  const zip = unzipSync(readFileSync(path));
  const text = (n: string) => strFromU8(zip[n]);
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
  const rels = text('xl/_rels/workbook.xml.rels');
  const sheets = new Map<string, Map<string, unknown>>();
  for (const m of text('xl/workbook.xml').matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`Target="([^"]+)"[^>]*Id="${m[2]}"`).exec(rels)![1];
    const xml = text(`xl/${target.replace(/^\/?xl\//, '')}`);
    const cells = new Map<string, unknown>();
    for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const t = /t="([^"]+)"/.exec(c[2])?.[1] ?? 'n';
      const v = c[3] ? /<v>([\s\S]*?)<\/v>/.exec(c[3])?.[1] ?? null : null;
      cells.set(c[1], v === null ? null : t === 's' ? shared[Number(v)] : t === 'b' ? v === '1' : t === 'str' || t === 'e' ? v : Number(v));
    }
    sheets.set(m[1], cells);
  }
  return (s: string, a: string) => sheets.get(s)?.get(a) ?? null;
}
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
let cells = 0; const bad: string[] = [];
for (const m of manifest) {
  const get = read(`${recalc}/${m.file}`);
  for (const p of m.parity) {
    cells++;
    const got = get(p.sheet, p.addr);
    if (p.expected === null) { if (typeof got === 'number') bad.push(`${m.deal} [${m.change}] ${p.sheet}!${p.addr} ${p.label}: engine N/A, cell ${got}`); continue; }
    if (typeof got !== 'number' || Math.abs(got - p.expected) > 1e-6 * Math.max(1, Math.abs(p.expected))) bad.push(`${m.deal} [${m.change}] ${p.sheet}!${p.addr} ${p.label}: expected ${p.expected}, got ${got}`);
  }
}
console.log(`${manifest.length} changed workbooks, ${cells} cells checked, ${bad.length} mismatches`);
const byChange = new Map<string, number>();
for (const b of bad) { const k = b.slice(0, b.indexOf(']') + 1); byChange.set(k, (byChange.get(k) ?? 0) + 1); }
for (const [k, v] of byChange) console.log(`  ${v} cells  ${k}`);
bad.slice(0, 12).forEach((b) => console.log('   ', b));
