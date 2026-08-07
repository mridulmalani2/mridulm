/**
 * Display gate (c) — MUTATION-TESTED label assertion for the HistoryTable header label,
 * which is now SOURCE-AWARE: a hand-entered history must not wear the "Filing history"
 * label (the v1.1.2 mislabel class: right number, wrong basis/source wording). Flipping
 * either branch's wording, or the source switch itself, reddens this file.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HistoryTable from '../components/deal-engine/v2/HistoryTable';
import { manualHistoricals } from '../lib/edgar/buildModel';
import { adaptRawHistoricals } from '../lib/engine2/factsAdapter';

const manualFacts = () => adaptRawHistoricals(manualHistoricals({
  dealName: 'Label Co', sector: 'Other', currency: 'USD', basis: 'FY', ltm: null,
  years: [
    { end: '2023-12-31', revenue: 100, ebitda: 20, da: 4, capex: 5 },
    { end: '2024-12-31', revenue: 110, ebitda: 22, da: 4, capex: 5 },
    { end: '2025-12-31', revenue: 120, ebitda: 24, da: 4, capex: 5 },
  ],
  nwc: 10, grossDebt: 50, cash: 10, netDebt: null, netPpe: 30, taxRate: 0.25, nol: null,
})).facts;

const render = (facts: ReturnType<typeof manualFacts>) =>
  renderToStaticMarkup(React.createElement(HistoryTable, { facts, today: new Date('2026-08-07') }));

describe('HistoryTable header label is source-honest', () => {
  it("source 'manual' renders 'Entered history' (never 'Filing history')", () => {
    const html = render(manualFacts());
    expect(html).toContain('Entered history');
    expect(html).not.toContain('Filing history');
  });

  it("source 'edgar' renders 'Filing history' (never 'Entered history')", () => {
    const html = render({ ...manualFacts(), source: 'edgar' });
    expect(html).toContain('Filing history');
    expect(html).not.toContain('Entered history');
  });

  it('the manual EMPTY state says the history was not entered (not "in the filing")', () => {
    const empty = adaptRawHistoricals(manualHistoricals({
      dealName: 'Empty Co', sector: 'Other', currency: 'USD', basis: 'FY', ltm: null,
      years: [], nwc: null, grossDebt: null, cash: null, netDebt: null, netPpe: null, taxRate: null, nol: null,
    })).facts;
    const html = render(empty);
    expect(html).toContain('No usable multi-year history was entered');
    expect(html).not.toContain('in the filing');
  });
});
