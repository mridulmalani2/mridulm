/**
 * §21 sector comps band — display surface (label/value provenance), under the Tier-C display
 * rules PHASE_G applies to every tier. The band is a FACT, so what matters is that the surface
 * states its BASIS honestly: §21.8(e) is an explicit NON-claim (a public-market trading range
 * is not a buyout-entry range), so a label that drops "NOT buyout entry", or that renders a
 * number without its region/vintage/constituent count, is exactly the v1.1.2 mislabel class.
 *
 * MUTANTS (run RED, then reverted): (D-a) dropping "NOT buyout entry"; (D-b) rendering the band
 * when it is null instead of the unavailable state; (D-c) swapping low/high.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { Summary, Methodology } from '../components/deal-engine/v2/OutputTabs';
import { runModel } from '../lib/engine2/facade';
import { adaptRawHistoricals } from '../lib/engine2/factsAdapter';
import { manualHistoricals } from '../lib/edgar/buildModel';
import { suggestAssumptions } from '../lib/engine2/suggest';

const build = (sector: string) => {
  const { facts } = adaptRawHistoricals(manualHistoricals({
    dealName: 'Comps Display Co', sector, currency: 'USD', basis: 'FY', ltm: null,
    years: [{ end: '2025-12-31', revenue: 1000, ebitda: 250, da: 40, capex: 30 }],
    nwc: 100, grossDebt: 0, cash: 0, netDebt: 0, netPpe: 200, taxRate: 0.25, nol: null,
  }));
  const { assumptions } = suggestAssumptions(facts);
  return renderToStaticMarkup(React.createElement(Summary, { o: runModel(facts, assumptions), ccy: 'USD' as const }));
};

describe('§21 comps display — the band renders with its basis, region, vintage and constituents', () => {
  it('a Healthcare deal shows the band AND every load-bearing qualifier', () => {
    const html = build('Healthcare');
    expect(html).toContain('Healthcare peers trade');
    expect(html).toContain('15.3x');            // low  (multiple() renders 1dp)
    expect(html).toContain('19.8x');            // high
    expect(html).toContain('15.8x');            // median
    expect(html).toContain('NOT buyout entry'); // §21.8(e)'s NON-claim, on the face of it
    expect(html).toContain('US');               // region
    expect(html).toContain('5 Jan 26');         // vintage
    expect(html).toContain('6 industries, 1178 firms');
  });

  it('the band is a RANGE low→high in that order (a swap would still contain both numbers)', () => {
    const html = build('Healthcare');
    expect(html.indexOf('15.3x')).toBeLessThan(html.indexOf('19.8x'));
  });

  it("the 'Other' fallback labels itself as the whole market, never as a sector", () => {
    const html = build('Other');
    expect(html).toContain('Whole market (ex-financials) trades');
    expect(html).toContain('4822 firms'); // raw count, not money-formatted
    expect(html).not.toContain('Other peers trade');
  });

  it('no sector source ⇒ the unavailable state with its REASON, never a number', () => {
    const html = build('');
    expect(html).toContain('Sector comps unavailable');
    expect(html).toContain('no sector source');
    expect(html).not.toContain('peers trade');
  });
});

describe('§21.9 — the disclosure row is on the Methodology surface (label mutation-tested)', () => {
  it('carries the load-bearing clauses', () => {
    const html = renderToStaticMarkup(React.createElement(Methodology));
    expect(html).toContain('Sector comps band (§21)');
    expect(html).toContain('NOT buyout-entry multiples');
    expect(html).toContain('INDUSTRY AGGREGATE');
    expect(html).toContain('industry POPULATION');
    expect(html).toContain('financials are NOT uniformly unavailable');
    expect(html).toContain('collapse to a point');
  });
});
