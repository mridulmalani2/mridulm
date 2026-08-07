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
import { Debt, Methodology } from '../components/deal-engine/v2/OutputTabs';
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
    expect(html).toContain('Old OID + fees written off');
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

  it('OID-bearing refi: the write-off column labels its basis honestly (OID + fees, not "fees")', () => {
    // Conformance-review finding (2026-07-27): the column is `unamortized_writeoff` = old OID +
    // old fees, so a "fees"-only label understates the basis on an OID-bearing tranche (the
    // §18.11(vi) mainstream case, which G6-REFI's OID=0 TLB leaves golden-uncovered on the DISPLAY
    // path). This renders that case and pins the honest label + the OID-inclusive value.
    const base = GOLDEN_DEALS.G2;
    const facts = base.facts;
    const assumptions: typeof base.assumptions = JSON.parse(JSON.stringify(base.assumptions));
    assumptions.structure.tranches = [
      { name: 'TLB', type: 'senior', size: { x_ebitda: 4 }, pricing: { kind: 'floating', base_rate: 0.036, spread: 0.0375, floor: 0 }, amort_pct_of_face: 0.01, maturity_years: 8, oid_pct: 0.02, sweep: { participates: true, priority: 1 } },
    ];
    assumptions.structure.refinancing = [
      { tranche_name: 'TLB', year: 3, new_pricing: { kind: 'floating', base_rate: 0.036, spread: 0.0275, floor: 0 }, call_premium_pct: 0.01, new_maturity_years: 6, new_oid_pct: 0.01, new_financing_fee_pct: 0.01, new_amort_pct_of_face: 0.01 },
    ];
    const o = runModel(facts, assumptions);
    const html = renderToStaticMarkup(React.createElement(Debt, { o, ccy: 'USD' as const }));
    const wo = o.tranches[0][2].unamortized_writeoff;
    // the write-off genuinely INCLUDES the OID leg here (old OID 6.60 + old fees 4.95 ≈ 11.55),
    // so a "fees"-only label would be false; the honest label + the OID-inclusive value both render.
    expect(wo).toBeGreaterThan(6); // OID leg alone is ~6.60, so wo ≫ any fees-only figure
    expect(html).toContain('Old OID + fees written off');
    expect(html).toContain(money(wo, 'USD', 2));
  });

  it('non-refi golden (G2): NO refi table, NO ⟳ marker (unconditional field, conditional render)', () => {
    const { html } = render('G2');
    expect(html).not.toContain('Refinancing events');
    expect(html).not.toContain('⟳');
  });
});

describe('§18.8 — the v1 refi simplifications are LISTED on the methodology page (SPEC §15)', () => {
  it('the Disclosures table carries the Refinancing row with the §18.5 deferral wording (label mutation-tested)', () => {
    const html = renderToStaticMarkup(React.createElement(Methodology));
    expect(html).toContain('Refinancing (§18)');
    // the load-bearing clauses of the §15 sentence — a paraphrase drift reddens here
    expect(html).toContain('par-for-par');
    expect(html).toContain('deducted UNCAPPED the FOLLOWING year');
    expect(html).toContain('no forward-curve or covenant-cure trigger');
  });
});
