/**
 * The trace reads the exported workbook's own formula graph. These tests pin that a headline
 * figure is found by its row label, that its precedents are the cells its formula reads, that
 * the traced value equals the engine's, and that the walk reaches typed inputs.
 */
import { describe, expect, it } from 'vitest';
import { runModel } from '../lib/engine2/facade';
import { buildTraceIndex, formatTraced } from '../lib/trace';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';

describe('trace index', () => {
  for (const [name, deal] of Object.entries(GOLDEN_DEALS).slice(0, 4)) {
    it(`${name}: headline figures trace to the engine's numbers and down to inputs`, () => {
      const o = runModel(deal.facts, deal.assumptions);
      const ix = buildTraceIndex(o);
      const irr = ix.find('Sponsor IRR')!;
      expect(irr).not.toBeNull();
      if (o.returns.sponsor_net.irr !== null) expect(irr.value as number).toBeCloseTo(o.returns.sponsor_net.irr, 9);
      expect(irr.formula).toContain('IRR(');
      expect(irr.precedents.length).toBeGreaterThan(1);
      // every precedent resolves to a labelled node
      for (const k of irr.precedents) expect(ix.node(k)?.label).toBeTruthy();
      expect(ix.readable(irr)).toContain('[Sponsor cash flows');

      const ev = ix.find('Enterprise value')!;
      expect(ev.value as number).toBeCloseTo(o.derived.enterprise_value, 6);
      const N = deal.assumptions.entry.hold_years;
      const cash = ix.find('Closing cash', N)!;
      expect(cash.period).toBe(`Year ${N}`);
      expect(cash.value as number).toBeCloseTo(o.waterfall[N - 1].closing_cash, 6);

      // walking precedents from the exit value reaches a typed input on the Inputs sheet
      const seen = new Set<string>();
      const stack = [ix.find('Exit enterprise value')!.key];
      let reachedInput = false;
      while (stack.length && seen.size < 400) {
        const k = stack.pop()!;
        if (seen.has(k)) continue;
        seen.add(k);
        const n = ix.node(k);
        if (!n) continue;
        if (n.is_input) reachedInput = true;
        stack.push(...n.precedents);
      }
      expect(reachedInput).toBe(true);
    });
  }

  it('the formula splits into text and named references; a row across years is one group; the typed inputs behind a figure are found', () => {
    const d = Object.values(GOLDEN_DEALS)[0];
    const o = runModel(d.facts, d.assumptions);
    const ix = buildTraceIndex(o);
    const irr = ix.find('Sponsor IRR')!;

    // the parts put back together are the formula as written, with each reference replaced by its row
    const parts = ix.parts(irr);
    const refs = parts.filter((p) => p.kind === 'ref');
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) if (r.kind === 'ref') { expect(r.label).toBe('Sponsor cash flows'); for (const k of r.keys) expect(irr.precedents).toContain(k); }
    expect(parts.filter((p) => p.kind === 'text').map((p) => (p.kind === 'text' ? p.text : '')).join('')).toContain('IRR(');
    expect(refs.some((r) => r.kind === 'ref' && r.span === `Close to Year ${d.assumptions.entry.hold_years}`)).toBe(true);
    // a quoted string in a formula is text, never a reference
    expect(parts.some((p) => p.kind === 'text' && p.text.includes('"N/A"'))).toBe(true);

    // every precedent sits in exactly one group, in order; the cash-flow row is one group across the years
    const groups = ix.groups(irr);
    expect(groups.flatMap((g) => g.cells.map((c) => c.key))).toEqual(irr.precedents);
    expect(groups).toHaveLength(1);
    expect(groups[0].cells.map((c) => c.period)).toEqual(['Close', ...Array.from({ length: d.assumptions.entry.hold_years }, (_, i) => `Year ${i + 1}`)]);

    // the inputs behind the IRR are all typed inputs, none twice, and include the exit multiple
    const behind = ix.inputsBehind(irr, 100000);
    expect(behind.complete).toBe(true);
    expect(behind.inputs.length).toBeGreaterThan(5);
    expect(behind.inputs.every((n) => n.is_input)).toBe(true);
    expect(new Set(behind.inputs.map((n) => n.key)).size).toBe(behind.inputs.length);
    expect(behind.inputs.some((n) => /exit multiple/i.test(n.label))).toBe(true);
    // a walk cut short says so
    expect(ix.inputsBehind(irr, 5).complete).toBe(false);
    // a typed input has nothing behind it and no formula to split
    const input = behind.inputs[0];
    expect(ix.parts(input)).toEqual([]);
    expect(ix.groups(input)).toEqual([]);
  });

  it('formats a traced value as the workbook does', () => {
    expect(formatTraced({ value: 0.2123, format: '0.00%' })).toBe('21.23%');
    expect(formatTraced({ value: 4.5, format: '0.00"x"' })).toBe('4.50x');
    expect(formatTraced({ value: -12.5, format: '#,##0.00_);(#,##0.00)' })).toBe('(12.50)');
    expect(formatTraced({ value: 'N/A', format: null })).toBe('N/A');
  });

  it('a label that is not in the model is not found, never guessed', () => {
    const d = Object.values(GOLDEN_DEALS)[0];
    expect(buildTraceIndex(runModel(d.facts, d.assumptions)).find('No such row')).toBeNull();
  });
});
