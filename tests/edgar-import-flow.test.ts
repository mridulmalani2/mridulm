/**
 * Phase 1 — the import → review → build store sequence (network-free path) and the draft
 * builder. Verifies factual fields are seeded from filings with EDGAR provenance, forward
 * assumptions carry 'default', edits flip provenance to 'user', the single valuation driver
 * works, and Build advances to the model screen.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import { draftModelFromHistoricals, manualHistoricals } from '../lib/edgar/buildModel';
import { useDealEngineStore } from '../store/dealEngine';
import type { CompanyFacts } from '../lib/edgar/client';
import sample from './fixtures/companyfacts-sample.json';

const raw = () => mapCompanyFacts(sample as unknown as CompanyFacts, { sicDescription: 'Industrial machinery & equipment' });

describe('draftModelFromHistoricals', () => {
  const { state, provenance } = draftModelFromHistoricals(raw());

  it('seeds factual fields from filings with EDGAR provenance', () => {
    expect(state.revenue.base_revenue).toBeCloseTo(1250, 6);
    expect(state.margins.base_ebitda_margin).toBeCloseTo(0.20, 6);
    expect(state.margins.capex_pct_revenue).toBeCloseTo(0.04, 6);
    expect(state.entry.net_debt_at_entry).toBeCloseTo(255, 6);
    expect(state.tax.tax_rate).toBeCloseTo(0.21, 6);
    expect(provenance['revenue.base_revenue'].source).toBe('edgar');
    expect(provenance['margins.base_ebitda_margin'].source).toBe('edgar');
    expect(provenance['tax.tax_rate'].source).toBe('edgar');
  });

  it('seeds forward/structure assumptions from sector defaults with default provenance', () => {
    expect(state.sector).toBe('Industrials');                       // inferred from SIC
    expect(state.revenue.growth_rates.length).toBe(state.exit.holding_period);
    expect(provenance['revenue.growth_rates'].source).toBe('default');
    expect(provenance['entry.entry_ebitda_multiple'].source).toBe('default');
    expect(provenance['debt_tranches'].source).toBe('default');
    expect(state.entry.entry_valuation_driver).toBe('multiple');
    expect(state.debt_tranches.length).toBeGreaterThan(0);
  });

  it('defaults imported currency to USD', () => {
    expect(state.currency).toBe('USD');
  });

  it("flags a factual field the filing lacks as 'missing' (never 'user'/guessed)", () => {
    const gapped = { ...raw(), net_debt: null };
    const { provenance } = draftModelFromHistoricals(gapped, { sector: 'Industrials' });
    expect(provenance['entry.net_debt_at_entry'].source).toBe('missing');  // not 'user', not 'default'
    expect(provenance['revenue.base_revenue'].source).toBe('edgar');       // present fields unaffected
  });
});

describe('store import → review → build sequence', () => {
  beforeEach(() => { useDealEngineStore.getState().resetModel(); });

  it('loadFromHistoricals drafts the model and moves to the review screen', () => {
    useDealEngineStore.getState().loadFromHistoricals(raw());
    const s = useDealEngineStore.getState();
    expect(s.startScreen).toBe('assumptions');
    expect(s.modelState).not.toBeNull();
    expect(s.rawHistoricals?.ltm_revenue?.value).toBeCloseTo(1250, 6);
    expect(s.modelState!.returns.irr).not.toBeUndefined(); // draft is live (already recalc'd)
    expect(s.provenanceMap['revenue.base_revenue'].source).toBe('edgar');
  });

  it('editAssumption marks provenance user and re-derives the live draft', () => {
    useDealEngineStore.getState().loadFromHistoricals(raw());
    useDealEngineStore.getState().editAssumption('exit.exit_ebitda_multiple', 11);
    const s = useDealEngineStore.getState();
    expect(s.modelState!.exit.exit_ebitda_multiple).toBe(11);
    expect(s.provenanceMap['exit.exit_ebitda_multiple'].source).toBe('user');
  });

  it('the single valuation driver: editing EV derives the multiple (read-only)', () => {
    useDealEngineStore.getState().loadFromHistoricals(raw());
    const before = useDealEngineStore.getState().modelState!;
    const valuationEbitda = before.revenue.base_revenue * before.margins.base_ebitda_margin; // LTM basis
    useDealEngineStore.getState().editAssumption('entry.enterprise_value', 15000);
    const s = useDealEngineStore.getState().modelState!;
    expect(s.entry.entry_valuation_driver).toBe('ev');
    expect(s.entry.entry_ebitda_multiple).toBeCloseTo(15000 / valuationEbitda, 4);
  });

  it('buildModelFromDraft advances to the model screen', () => {
    useDealEngineStore.getState().loadFromHistoricals(raw());
    useDealEngineStore.getState().buildModelFromDraft();
    expect(useDealEngineStore.getState().startScreen).toBe('model');
    expect(useDealEngineStore.getState().modelState!.balance_sheet.closes).toBe(true);
  });
});

describe('manual entry converges on the SAME downstream as EDGAR (zero divergence)', () => {
  beforeEach(() => { useDealEngineStore.getState().resetModel(); });

  const manual = () => manualHistoricals({
    dealName: 'PrivateCo', sector: 'Industrials', currency: 'USD',
    ltmRevenue: 200, ebitdaMargin: 0.22, daPctRevenue: 0.04, capexPctRevenue: 0.05,
    nwcPctRevenue: 0.12, netDebt: 60, taxRate: 0.25, nol: 0,
  });

  it('manualHistoricals seeds the factual fields with USER provenance', () => {
    const { state, provenance } = draftModelFromHistoricals(manual(), { sector: 'Industrials' });
    expect(state.revenue.base_revenue).toBeCloseTo(200, 6);
    expect(state.margins.base_ebitda_margin).toBeCloseTo(0.22, 6);
    expect(state.entry.net_debt_at_entry).toBeCloseTo(60, 6);
    // Factual fields are 'user' (typed), not 'edgar'; assumptions still 'default'.
    expect(provenance['revenue.base_revenue'].source).toBe('user');
    expect(provenance['margins.base_ebitda_margin'].source).toBe('user');
    expect(provenance['revenue.growth_rates'].source).toBe('default');
  });

  it('flows through the identical loadFromHistoricals → assumptions → build path', () => {
    useDealEngineStore.getState().loadFromHistoricals(manual(), { sector: 'Industrials', dealName: 'PrivateCo' });
    expect(useDealEngineStore.getState().startScreen).toBe('assumptions');       // SAME review screen
    expect(useDealEngineStore.getState().provenanceMap['revenue.base_revenue'].source).toBe('user');
    useDealEngineStore.getState().editAssumption('exit.exit_ebitda_multiple', 9);
    useDealEngineStore.getState().buildModelFromDraft();
    expect(useDealEngineStore.getState().startScreen).toBe('model');             // SAME model screen
    expect(useDealEngineStore.getState().modelState!.balance_sheet.closes).toBe(true);
  });
});
