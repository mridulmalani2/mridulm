/**
 * The analyst's notes travel with the Excel model as comments on the input cells. The mapping
 * from an input to its cell is checked against the workbook itself: the cell a note lands on
 * must hold that input's value.
 */
import { describe, expect, it } from 'vitest';
import { runModel } from '../lib/engine2/facade';
import { buildFormulaWorkbook } from '../lib/engine2/workbook';
import { attachNotes, inputRowKey } from '../components/deal-engine/results/exportModel';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';
import { EA_ASSUMPTIONS, EA_FACTS } from './fixtures/ea-oos';

const get = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown> | undefined)?.[k], o);
const leaves = (node: unknown, prefix = '', out: string[] = []): string[] => {
  if (node === null || typeof node !== 'object') { if (prefix) out.push(prefix); return out; }
  if (Array.isArray(node)) {
    if (node.every((v) => v === null || typeof v !== 'object')) { out.push(prefix); return out; }
    node.forEach((v, i) => leaves(v, `${prefix}.${i}`, out));
    return out;
  }
  for (const [k, v] of Object.entries(node)) leaves(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
};

describe('notes export as comments on the Inputs cells', () => {
  const deals = { ...Object.fromEntries(Object.entries(GOLDEN_DEALS)), EA: { facts: EA_FACTS, assumptions: EA_ASSUMPTIONS } };
  for (const [name, d] of Object.entries(deals)) {
    it(`${name}: every mapped numeric input lands on the cell that holds its value`, () => {
      const o = runModel(d.facts, d.assumptions);
      const { wb, inputRows } = buildFormulaWorkbook(o, { cachedResults: true });
      const paths = leaves(d.assumptions).filter((p) => inputRowKey(p, d.assumptions) !== null);
      const notes = Object.fromEntries(paths.map((p) => [p, `note on ${p}`]));
      const placed = attachNotes(wb, inputRows, d.assumptions, notes);
      const ws = wb.getWorksheet('Inputs')!;
      let checked = 0;
      for (const p of paths) {
        const row = inputRows[inputRowKey(p, d.assumptions)!];
        if (row === undefined) continue; // the input is not in use on this deal, so the sheet has no row for it
        const v = get(d.assumptions, p);
        const want = Array.isArray(v) ? v[0] : v;
        const cell = [`D${row}`, `E${row}`].map((c) => ws.getCell(c)).find((c) => c.note);
        expect(cell, p).toBeDefined();
        expect(JSON.stringify(cell!.note)).toContain(`note on ${p}`);
        if (typeof want === 'number' && Number.isFinite(want) && typeof cell!.value === 'number') { expect(cell!.value, p).toBeCloseTo(want, 12); checked += 1; }
      }
      expect(placed).toBeGreaterThan(5);
      expect(checked).toBeGreaterThan(5);
      expect(wb.getWorksheet('Analyst notes')!.getCell('C5').value).toMatch(/^Inputs![DE]\d+$|no single cell/);
    });
  }

  it('a note on an input with no cell of its own still travels on the notes sheet; no notes, no sheet', () => {
    const d = GOLDEN_DEALS.G2;
    const o = runModel(d.facts, d.assumptions);
    const a = buildFormulaWorkbook(o, { cachedResults: true });
    expect(attachNotes(a.wb, a.inputRows, d.assumptions, { 'structure.tranches.0.sweep.priority': 'per the term sheet' })).toBe(0);
    expect(a.wb.getWorksheet('Analyst notes')!.getCell('C5').value).toBe('no single cell');
    const b = buildFormulaWorkbook(o, { cachedResults: true });
    expect(attachNotes(b.wb, b.inputRows, d.assumptions, {})).toBe(0);
    expect(b.wb.getWorksheet('Analyst notes')).toBeUndefined();
  });
});
