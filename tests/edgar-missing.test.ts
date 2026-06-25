/**
 * Phase 1 — the MISSING-value invariant. A factual field the filing genuinely lacks must end up
 * provenance source 'missing' (rendered as an EMPTY input with a red MISSING badge), NEVER a
 * guessed default tagged 'user'. A neutral placeholder is kept inside ModelState only so the live
 * preview can compute — it is never shown. Editing a missing field flips its source to 'user'.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import { draftModelFromHistoricals } from '../lib/edgar/buildModel';
import { useDealEngineStore } from '../store/dealEngine';
import type { CompanyFacts } from '../lib/edgar/client';
import type { RawHistoricals } from '../lib/edgar/types';
import sample from './fixtures/companyfacts-sample.json';

const full = (): RawHistoricals => mapCompanyFacts(sample as unknown as CompanyFacts, { sicDescription: 'Industrial machinery & equipment' });
// A sparse extract: the filing provided everything EXCEPT capex and net debt.
const sparse = (): RawHistoricals => ({ ...full(), capex: null, capex_pct_revenue: null, gross_debt: null, cash: null, net_debt: null });

describe('MISSING invariant — draftModelFromHistoricals', () => {
  it("a field the filing lacks is provenance 'missing' (never 'user', never 'default')", () => {
    const { provenance } = draftModelFromHistoricals(sparse(), { sector: 'Industrials' });
    expect(provenance['margins.capex_pct_revenue'].source).toBe('missing');
    expect(provenance['entry.net_debt_at_entry'].source).toBe('missing');
    // Present fields are unaffected.
    expect(provenance['revenue.base_revenue'].source).toBe('edgar');
    expect(provenance['margins.base_ebitda_margin'].source).toBe('edgar');
  });

  it('keeps a neutral placeholder in ModelState so the live preview still computes', () => {
    const { state } = draftModelFromHistoricals(sparse(), { sector: 'Industrials' });
    // Placeholder values (never shown) — not NaN, so fullRecalc / preview never divide-by-zero.
    expect(state.margins.capex_pct_revenue).toBeCloseTo(0.03, 9);
    expect(state.entry.net_debt_at_entry).toBeCloseTo(0, 9);
    expect(Number.isFinite(state.margins.capex_pct_revenue)).toBe(true);
  });

  it("NO factual gap path ever produces source 'user' from the draft builder", () => {
    const { provenance } = draftModelFromHistoricals(sparse(), { sector: 'Industrials' });
    // The draft builder only emits edgar/esef (kept), default (assumptions/NOL) or missing (gaps).
    // 'user' must only ever appear after a real edit, never from a gap.
    for (const [path, p] of Object.entries(provenance)) {
      expect(p.source, `provenance for ${path}`).not.toBe('user');
    }
  });

  it('records the gap label and a "not reported" detail', () => {
    const { provenance } = draftModelFromHistoricals(sparse(), { sector: 'Industrials' });
    expect(provenance['margins.capex_pct_revenue'].detail).toMatch(/not reported in the filing/i);
  });
});

describe('MISSING invariant — store contract (missing → user on edit)', () => {
  beforeEach(() => { useDealEngineStore.getState().resetModel(); });

  it("loadFromHistoricals tags a gap 'missing', and editing it flips to 'user' + recalcs", () => {
    useDealEngineStore.getState().loadFromHistoricals(sparse(), { sector: 'Industrials' });
    expect(useDealEngineStore.getState().provenanceMap['entry.net_debt_at_entry'].source).toBe('missing');

    useDealEngineStore.getState().editAssumption('entry.net_debt_at_entry', 120);
    const s = useDealEngineStore.getState();
    expect(s.provenanceMap['entry.net_debt_at_entry'].source).toBe('user');
    expect(s.modelState!.entry.net_debt_at_entry).toBe(120);
  });

  it('blocks Build while any field is MISSING, and proceeds once all are filled', () => {
    useDealEngineStore.getState().loadFromHistoricals(sparse(), { sector: 'Industrials' });
    useDealEngineStore.getState().buildModelFromDraft();
    expect(useDealEngineStore.getState().startScreen).toBe('assumptions');     // blocked, not 'model'
    expect(useDealEngineStore.getState().error).toMatch(/MISSING/i);

    useDealEngineStore.getState().editAssumption('margins.capex_pct_revenue', 0.04);
    useDealEngineStore.getState().editAssumption('entry.net_debt_at_entry', 120);
    useDealEngineStore.getState().buildModelFromDraft();
    expect(useDealEngineStore.getState().startScreen).toBe('model');           // now allowed
  });

  it("updateField (model screen) also flips a MISSING field to 'user'", async () => {
    useDealEngineStore.getState().loadFromHistoricals(sparse(), { sector: 'Industrials' });
    expect(useDealEngineStore.getState().provenanceMap['margins.capex_pct_revenue'].source).toBe('missing');
    await useDealEngineStore.getState().updateField('margins.capex_pct_revenue', 0.04);
    expect(useDealEngineStore.getState().provenanceMap['margins.capex_pct_revenue'].source).toBe('user');
  });
});
