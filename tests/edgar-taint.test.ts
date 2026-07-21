/**
 * Phase 1 — the MISSING-value TAINT: no displayed figure derived from an unconfirmed ('missing')
 * placeholder may be presented as a real number. Verifies the shared dependency map so the review
 * preview, derived rows and AI prompt all gate identically.
 */

import { describe, it, expect } from 'vitest';
import { isMissing, anyFactualMissing, dependsOnMissing, FACTUAL_INPUT_PATHS } from '../lib/edgar/missing';
import type { ProvenanceMap } from '../lib/edgar/types';

const base: ProvenanceMap = {
  'revenue.base_revenue': { source: 'esef', detail: '' },
  'margins.base_ebitda_margin': { source: 'esef', detail: '' },
  'margins.da_pct_revenue': { source: 'esef', detail: '' },
  'margins.capex_pct_revenue': { source: 'esef', detail: '' },
  'margins.nwc_pct_revenue': { source: 'esef', detail: '' },
  'entry.net_debt_at_entry': { source: 'esef', detail: '' },
};
const withMissing = (path: string): ProvenanceMap => ({ ...base, [path]: { source: 'missing', detail: '' } });

describe('MISSING taint — helpers', () => {
  it('isMissing / anyFactualMissing reflect the provenance map', () => {
    expect(anyFactualMissing(base)).toBe(false);
    expect(anyFactualMissing(withMissing('margins.base_ebitda_margin'))).toBe(true);
    expect(isMissing(withMissing('entry.net_debt_at_entry'), 'entry.net_debt_at_entry')).toBe(true);
  });
});

describe('MISSING taint — dependency map (financially traced)', () => {
  it('EV / entry multiple depend ONLY on revenue + margin', () => {
    expect(dependsOnMissing(withMissing('margins.base_ebitda_margin'), 'entry.enterprise_value')).toBe(true);
    expect(dependsOnMissing(withMissing('revenue.base_revenue'), 'entry.enterprise_value')).toBe(true);
    // EV does NOT depend on D&A / capex / NWC / net debt → still computable.
    expect(dependsOnMissing(withMissing('margins.da_pct_revenue'), 'entry.enterprise_value')).toBe(false);
    expect(dependsOnMissing(withMissing('entry.net_debt_at_entry'), 'entry.enterprise_value')).toBe(false);
    expect(dependsOnMissing(withMissing('margins.capex_pct_revenue'), 'entry.entry_ebitda_multiple')).toBe(false);
  });

  it('implied RETURNS are tainted by ANY missing factual input (conservative + honest)', () => {
    for (const path of FACTUAL_INPUT_PATHS) {
      expect(dependsOnMissing(withMissing(path), 'returns.irr'), `irr vs ${path}`).toBe(true);
      expect(dependsOnMissing(withMissing(path), 'returns.moic'), `moic vs ${path}`).toBe(true);
      expect(dependsOnMissing(withMissing(path), 'returns.entry_equity'), `equity vs ${path}`).toBe(true);
    }
  });

  it('nothing is tainted when all factual inputs are present', () => {
    for (const out of ['entry.enterprise_value', 'returns.irr', 'returns.moic', 'returns.entry_equity']) {
      expect(dependsOnMissing(base, out)).toBe(false);
    }
  });

  it('an UNKNOWN output path fails safe (tainted if anything factual is missing)', () => {
    expect(dependsOnMissing(withMissing('margins.nwc_pct_revenue'), 'returns.some_future_metric')).toBe(true);
    expect(dependsOnMissing(base, 'returns.some_future_metric')).toBe(false);
  });
});
