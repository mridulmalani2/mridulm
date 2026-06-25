/**
 * Phase 1 — SSR render smoke for the import start-flow screens. A browser isn't available in
 * CI, so we SSR-render (react-dom/server, DOM-free) with a mocked store and assert each screen
 * renders without throwing and shows its key content + provenance badges.
 */

import { vi, describe, it, expect } from 'vitest';

const holder = vi.hoisted(() => ({ state: null as unknown }));
vi.mock('../store/dealEngine', () => ({
  useDealEngineStore: (selector: (s: unknown) => unknown) => selector(holder.state),
}));

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import { draftModelFromHistoricals } from '../lib/edgar/buildModel';
import type { CompanyFacts } from '../lib/edgar/client';
import sample from './fixtures/companyfacts-sample.json';
import AssumptionsReview from '../components/deal-engine/start/AssumptionsReview';
import SourceScreen from '../components/deal-engine/start/SourceScreen';
import ManualFactsScreen from '../components/deal-engine/start/ManualFactsScreen';
import ProvenanceBadge from '../components/deal-engine/inputs/ProvenanceBadge';

const draft = () => {
  const raw = mapCompanyFacts(sample as unknown as CompanyFacts, { sicDescription: 'Industrial machinery' });
  const { state, provenance } = draftModelFromHistoricals(raw, { dealName: raw.entityName });
  return { state, provenance, raw };
};

const noop = () => {};

describe('AssumptionsReview SSR', () => {
  it('renders both groups, the deal name, provenance badges and Build', () => {
    const { state, provenance, raw } = draft();
    holder.state = {
      modelState: state, provenanceMap: provenance, rawHistoricals: raw, sourceFilings: [],
      editAssumption: noop, aiSuggestAssumptions: noop, isSuggesting: false,
      buildModelFromDraft: noop, setStartScreen: noop, error: null, apiKey: null,
    };
    const html = renderToStaticMarkup(React.createElement(AssumptionsReview));
    expect(html).toContain('Northwind Industries Inc.');
    expect(html).toContain('Extracted from filings');
    expect(html).toContain('Assumptions you set');
    expect(html).toContain('Build Model');
    expect(html).toContain('EDGAR');      // a factual-field provenance badge
    expect(html).toContain('AI-suggest');
  });
});

describe('SourceScreen SSR', () => {
  it('renders the search, URL path and the coming-soon upload', () => {
    holder.state = { importFromEdgar: noop, importFromEsef: noop, isCalculating: false, error: null };
    const html = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(SourceScreen, { onManual: noop })),
    );
    expect(html).toContain('Source the target');
    expect(html).toContain('Company name or ticker');
    expect(html).toContain('coming soon');
    expect(html).toContain('Manual entry');
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
    expect(html).toContain('Review Assumptions');
  });
});

describe('ProvenanceBadge', () => {
  it('renders the source label and a link when a url is present', () => {
    const html = renderToStaticMarkup(React.createElement(ProvenanceBadge, {
      provenance: { source: 'edgar', detail: 'us-gaap:Revenues', url: 'https://www.sec.gov/x' },
    }));
    expect(html).toContain('EDGAR');
    expect(html).toContain('https://www.sec.gov/x');
  });
  it('renders nothing without provenance', () => {
    expect(renderToStaticMarkup(React.createElement(ProvenanceBadge, {}))).toBe('');
  });
});
