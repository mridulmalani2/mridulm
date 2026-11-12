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
