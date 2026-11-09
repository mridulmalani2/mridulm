/**
 * §23 [v2.2.0] partial exits — display surfaces (label/value provenance). The Selldown block
 * renders ONLY when `selldown` is non-null; every cell reads a named field; the Summary's DPI /
 * payback labels state the realized basis; the panel offers the input and explains when it is
 * unavailable; the Methodology tab carries the §15-SELL disclosure.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { Methodology, Returns, Selldown } from '../components/deal-engine/v2/OutputTabs';
import { runModel } from '../lib/engine2/facade';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';
import { money, pct } from '../lib/format';

describe('§23 display surface', () => {
  it('G11-SELL: every Selldown cell is a named field at its value', () => {
    const o = runModel(GOLDEN_DEALS.G11SELL.facts, GOLDEN_DEALS.G11SELL.assumptions);
    const s = o.selldown!;
    const html = renderToStaticMarkup(React.createElement(Selldown, { o, ccy: 'USD' as const }));
    expect(html).toContain('Partial exit — secondary selldown');
    expect(html).toContain('>Y3<');
    expect(html).toContain(pct(s.fraction));
    expect(html).toContain(money(s.implied_event_ev, 'USD'));
    expect(html).toContain(money(s.implied_event_equity, 'USD'));
    expect(html).toContain(money(s.selldown_proceeds, 'USD'));
    expect(html).toContain(money(s.implied_event_ev - s.implied_event_equity, 'USD')); // event net debt
    expect(html).toContain(money(o.exit.selldown_buyer_share, 'USD'));
    expect(html).toContain(money(o.exit.sponsor_share, 'USD'));
    expect(html).toContain('count toward DPI and payback');
    expect(html).toContain('balance sheet are');
  });
  it('absent without an event — never a zero table', () => {
    const o = runModel(GOLDEN_DEALS.G2DIST.facts, GOLDEN_DEALS.G2DIST.assumptions);
    expect(renderToStaticMarkup(React.createElement(Selldown, { o, ccy: 'USD' as const }))).toBe('');
    expect(renderToStaticMarkup(React.createElement(Returns, { o, ccy: 'USD' as const }))).not.toContain('secondary selldown');
  });
  it('the Methodology tab carries the §23 and §3.8 disclosures', () => {
    const html = renderToStaticMarkup(React.createElement(Methodology));
    expect(html).toContain('Partial exits (§23)');
    expect(html).toContain('SECONDARY selldowns only');
    expect(html).toContain('Surplus-cash distributions (§3.8)');
  });
});
