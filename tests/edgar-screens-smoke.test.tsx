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
  it('renders the three honest paths with the take-private/demo framing, plus the search', () => {
    holder.state = { importFromEdgar: noop, importFromEsef: noop, loadModel: noop, isCalculating: false, error: null };
    const html = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(SourceScreen, { onManual: noop })),
    );
    expect(html).toContain('Source the target');
    // the honest sourcing map: manual = realistic private path; filings = take-private + demo
    expect(html).toContain('Manual entry');
    expect(html).toContain('the realistic path');
    expect(html).toContain('take-private screen');
    expect(html).toContain('fastest demo');
    // upload path is LIVE (IXBRL_SPEC v1) with the privacy promise on the card
    expect(html).toContain('Upload a filing');
    expect(html).toContain('parsed in your browser');
    expect(html).toContain('never leaves your machine');
    // the filings search renders expanded by default
    expect(html).toContain('Company name or ticker');
    expect(html).toContain('open a saved model'); // the previous-engine load path
  });
});

describe('ManualFactsScreen SSR', () => {
  it('renders the CIM-style multi-year form with the blank-stays-blank promise', () => {
    holder.state = { loadFromHistoricals: noop };
    const html = renderToStaticMarkup(React.createElement(ManualFactsScreen, { onBack: noop }));
    expect(html).toContain('Enter the facts');
    expect(html).toContain('Operating history');
    expect(html).toContain('Latest FY end');
    expect(html).toContain('Implied margin');
    expect(html).toContain('Sizing figures are');
    expect(html).toContain('Gross Debt');
    expect(html).toContain('Net PP&amp;E');
    expect(html).toContain('Blank cells stay blank');
    // empty form ⇒ the submit is GATED on the sizing pair (no silent 0-EBITDA submit)
    expect(html).toContain('revenue &amp; EBITDA to continue');
  });
});

