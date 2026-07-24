/**
 * SSR render smoke for the LIVE import screens (post-cutover: SourceScreen + ManualFactsScreen
 * feed engine2; the old review screen died with the F-tail deletion — its MISSING/N-C
 * protections live on in the engine2 adapter + workbench tests).
 */

import { vi, describe, it, expect } from 'vitest';

const holder = vi.hoisted(() => ({ state: null as unknown }));
vi.mock('../store/dealEngine', () => ({
  useDealEngineStore: (selector: (s: unknown) => unknown) => selector(holder.state),
}));

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import SourceScreen from '../components/deal-engine/start/SourceScreen';
import ManualFactsScreen from '../components/deal-engine/start/ManualFactsScreen';

const noop = () => {};

describe('SourceScreen SSR', () => {
  it('renders the search, URL path and the coming-soon upload', () => {
    holder.state = { importFromEdgar: noop, importFromEsef: noop, loadModel: noop, isCalculating: false, error: null };
    const html = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(SourceScreen, { onManual: noop })),
    );
    expect(html).toContain('Source the target');
    expect(html).toContain('Company name or ticker');
    expect(html).toContain('coming soon');
    expect(html).toContain('Manual entry');
    expect(html).toContain('open a saved model'); // the previous-engine load path
  });
});

describe('ManualFactsScreen SSR', () => {
  it('renders the factual-inputs form mirroring the 10-K surface', () => {
    holder.state = { loadFromHistoricals: noop };
    const html = renderToStaticMarkup(React.createElement(ManualFactsScreen, { onBack: noop }));
    expect(html).toContain('Enter the facts');
    expect(html).toContain('LTM Revenue');
    expect(html).toContain('EBITDA Margin');
    expect(html).toContain('Net Debt at Entry');
    expect(html).toContain('Open the workbench');
  });
});

