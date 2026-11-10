/**
 * Phase 5 — the exported workbook is LIVE: for every input of three maximal deals, take the BASE
 * export, overwrite ONLY the Inputs-sheet cells that encode that input (found by diffing the base
 * export against the export of the changed deal), save, and later recalculate in LibreOffice.
 * Every parity cell must then equal the engine run on the CHANGED deal. An input that moves the
 * engine but changes no Inputs cell is reported: it would be a value baked into a formula.
 */
import { writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { runModel } from '../../lib/engine2/facade';
import { buildFormulaWorkbook } from '../../lib/engine2/workbook';
import { GOLDEN_DEALS as G } from '../../tests/fixtures/engine2-golden-deals';
import type { DealAssumptions, DealFacts } from '../../lib/engine2/types';
import { A, B, C } from './deals';

const OUT = process.argv[2];
type J = unknown;
function leaves(x: J, path: string[] = [], out: { path: string[]; value: J }[] = []) {
  if (x === null || x === undefined) return out;
  if (typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean') { out.push({ path, value: x }); return out; }
  if (Array.isArray(x)) { x.forEach((v, i) => leaves(v, [...path, String(i)], out)); return out; }
  for (const [k, v] of Object.entries(x as object)) leaves(v, [...path, k], out);
  return out;
}
function setAt<T>(obj: T, path: string[], value: J): T {
  const clone = structuredClone(obj) as Record<string, J>;
  let cur = clone as Record<string, J>;
  for (const k of path.slice(0, -1)) cur = cur[k] as Record<string, J>;
  cur[path[path.length - 1]] = value;
  return clone as T;
}
const CHOICES: Record<string, J[]> = { basis: ['fy', 'ntm'], margin_path: ['linear', 'front_loaded', 'back_loaded'], ati_basis: ['ebitda', 'ebit'],
  fee_basis: ['invested', 'committed'], waterfall: ['european', 'american'], start: ['immediately', 'after_debt_repaid'] };
const inputsMap = (wb: ExcelJS.Workbook) => {
  const m = new Map<string, J>();
  wb.getWorksheet('Inputs')!.eachRow((row, r) => row.eachCell((c, col) => { if (col >= 4) m.set(`${r}:${col}`, c.value); }));
  return m;
};
const manifest: { file: string; deal: string; change: string; parity: { sheet: string; addr: string; label: string; expected: number | null }[] }[] = [];
const findings: string[] = [];
let n = 0;
async function main() {
for (const [label, deal, facts] of [['A', A, G.G2.facts], ['B', B, G.G9SWEET.facts], ['C', C, G.G2DIST.facts]] as [string, DealAssumptions, DealFacts][]) {
  const base = runModel(facts, deal);
  const baseWb = buildFormulaWorkbook(base, { cachedResults: false });
  const baseIn = inputsMap(baseWb.wb);
  const baseAddrs = baseWb.parity.map((p) => p.sheet + p.addr).join('|');
  for (const { path, value } of leaves(deal)) {
    const key = path[path.length - 1];
    if (['deal_name', 'name', 'tranche_name', 'holder_label', 'type', 'kind', 'metric', 'driver', 'measure', 'mode', 'method'].includes(key)) continue;
    if (path[0] === 'entry' && key === 'hold_years') continue; // structural: re-export (stated on the Inputs sheet)
    const alts: J[] = typeof value === 'number' ? [value === 0 ? 0.01 : value * 1.07] : typeof value === 'boolean' ? [!value] : (CHOICES[key] ?? []).filter((c) => c !== value);
    for (let alt of alts) {
      if (typeof value === 'number' && Number.isInteger(value) && /year|maturity|priority|termination_years/.test(path.join('.'))) alt = value + 1;
      let mod;
      try { mod = runModel(facts, setAt(deal, path, alt)); } catch { continue; }
      const modWb = buildFormulaWorkbook(mod, { cachedResults: false });
      const change = `${path.join('.')}: ${JSON.stringify(value)} → ${JSON.stringify(alt)}`;
      if (modWb.parity.map((p) => p.sheet + p.addr).join('|') !== baseAddrs) continue; // a STRUCTURAL change (rows appear/vanish) — re-export territory
      const modIn = inputsMap(modWb.wb);
      const changed = [...modIn.keys()].filter((k) => JSON.stringify(modIn.get(k)) !== JSON.stringify(baseIn.get(k)));
      const engineMoved = modWb.parity.some((p, i) => p.expected !== baseWb.parity[i].expected);
      if (changed.length === 0) {
        if (engineMoved) findings.push(`${label} ${change}: the ENGINE moves but NO Inputs cell changes — a value baked into the export`);
        continue;
      }
      // the base workbook, with ONLY those Inputs cells overwritten
      const fresh = buildFormulaWorkbook(base, { cachedResults: false });
      const ws = fresh.wb.getWorksheet('Inputs')!;
      for (const k of changed) { const [r, col] = k.split(':').map(Number); ws.getRow(r).getCell(col).value = modIn.get(k) as ExcelJS.CellValue; }
      const file = `${label}_${String(n++).padStart(3, '0')}.xlsx`;
      writeFileSync(`${OUT}/${file}`, Buffer.from(await fresh.wb.xlsx.writeBuffer()));
      manifest.push({ file, deal: label, change, parity: modWb.parity });
    }
  }
}
}
main().then(() => {
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest));
console.log(`${manifest.length} single-input workbooks written; ${findings.length} findings`);
findings.forEach((f) => console.log('  FINDING', f));
});
