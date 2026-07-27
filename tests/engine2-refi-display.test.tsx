/**
 * §18 refinancing — display surface (label/value provenance). The Debt tab renders a
 * "Refinancing events" table and marks the refi year on the tranche schedule. This directed
 * test pins the LABELS and proves each displayed number equals its named ModelOutput field
 * (`refinancing_cash_cost` / `unamortized_writeoff`) — the gate-(c) discipline: a mislabel or a
 * swapped field is exactly what Tier C/A must catch on a displayed number. Non-refi deals render
 * NO refi table and no ⟳ marker (unconditional-field, conditional-render).
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { Debt } from '../components/deal-engine/v2/OutputTabs';
import { runModel } from '../lib/engine2/facade';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';
import { money } from '../lib/format';

const render = (golden: keyof typeof GOLDEN_DEALS) => {
  const { facts, assumptions } = GOLDEN_DEALS[golden];
  const o = runModel(facts, assumptions);
  return { o, html: renderToStaticMarkup(React.createElement(Debt, { o, ccy: 'USD' as const })) };
};

describe('§18 refi display surface — Debt tab', () => {
  it('G6-REFI: the "Refinancing events" table renders with the SPEC-labelled columns and named-field values', () => {
    const { o, html } = render('G6REFI');
    // labels present (mutating any of these strings reddens this assertion — gate (c))
    expect(html).toContain('Refinancing events (§18)');
    expect(html).toContain('Cash cost (premium + new OID + fees)');
    expect(html).toContain('Old fees written off');
    // value provenance: the displayed numbers are money(named field) — NOT a recomputation.
    const tlbY3 = o.tranches[0][2];
    expect(tlbY3.refinanced).toBe(true);
    const costStr = money(tlbY3.refinancing_cash_cost, 'USD', 2); // 8.76
    const woStr = money(tlbY3.unamortized_writeoff, 'USD', 2); // 4.71
    expect(html).toContain(costStr);
    expect(html).toContain(woStr);
    // Column ORDER pins the field→column mapping (a cost↔write-off swap keeps both values present
    // but flips their order, so a plain toContain would miss it): cost column precedes write-off.
    expect(html.indexOf(costStr)).toBeLessThan(html.indexOf(woStr));
    expect(html.indexOf(costStr)).toBeGreaterThan(html.indexOf('Refinancing events'));
    // the refi year is marked on the tranche schedule (⟳), and ONLY that year.
    const marks = (html.match(/⟳/g) ?? []).length;
    expect(marks).toBe(1);
    expect(html).toContain('Y3 ⟳');
  });

  it('non-refi golden (G2): NO refi table, NO ⟳ marker (unconditional field, conditional render)', () => {
    const { html } = render('G2');
    expect(html).not.toContain('Refinancing events');
    expect(html).not.toContain('⟳');
  });
});
