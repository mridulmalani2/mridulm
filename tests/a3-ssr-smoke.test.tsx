/**
 * A3 render smoke: SSR-render CreditPanel (cash trap + springing + recovery) and
 * BalanceSheetTable (days-based NWC), asserting the new surfaces appear. Store
 * mocked at the module boundary (zustand SSR snapshot is the initial null state).
 */

import { vi, describe, it, expect } from 'vitest';

const holder = vi.hoisted(() => ({ state: null as unknown }));
vi.mock('../store/dealEngine', () => ({
  useDealEngineStore: (selector: (s: unknown) => unknown) => selector(holder.state),
}));

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fullRecalc } from '../lib/engine/index';
import { canonicalDeals } from './fixtures/canonicalDeals';
import CreditPanel from '../components/deal-engine/outputs/CreditPanel';
import BalanceSheetTable from '../components/deal-engine/outputs/BalanceSheetTable';

describe('A3 — CreditPanel surfaces cash trap, springing and recovery basis', () => {
  it('renders the new rows/annotations when configured', () => {
    const s = canonicalDeals[0].build();
    s.exit.interim_distributions = [10, 0, 0, 0, 0];
    s.credit_covenants.distribution_block_leverage = 0.1;
    s.credit_covenants.springing_dscr_covenant = 1.5;
    s.credit_covenants.springing_utilization_threshold = 0.35;
    holder.state = { modelState: fullRecalc(s) };

    const html = renderToStaticMarkup(React.createElement(CreditPanel));
    expect(html).toContain('Credit Analysis');
    expect(html).toContain('Dist. Blocked');
    expect(html).toContain('Springing DSCR');
    expect(html).toContain('Recovery Waterfall');
    expect(html).toContain('Yr-of-default');
  });
});

describe('A3 — BalanceSheetTable surfaces days-based NWC', () => {
  it('annotates DSO/DIO/DPO when days-based working capital is on', () => {
    const s = canonicalDeals[0].build();
    s.margins.nwc_dso = 45; s.margins.nwc_dio = 60; s.margins.nwc_dpo = 45;
    holder.state = { modelState: fullRecalc(s) };

    const html = renderToStaticMarkup(React.createElement(BalanceSheetTable));
    expect(html).toContain('Balance Sheet');
    expect(html).toContain('days-based');
    expect(html).toContain('DSO 45');
  });

  it('omits the annotation for a pct-peg deal', () => {
    holder.state = { modelState: fullRecalc(canonicalDeals[0].build()) };
    const html = renderToStaticMarkup(React.createElement(BalanceSheetTable));
    expect(html).not.toContain('days-based');
  });
});
