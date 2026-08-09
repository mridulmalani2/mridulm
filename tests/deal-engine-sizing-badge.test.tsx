/**
 * §1.1 sizing-basis badge (gate (c) label coverage): HistoryTable heads the facts block with the
 * SIZING basis (LTM quarter-stitch vs FY) + staleness tier — read off DealFacts.sizing_*, never
 * recomputed. Mutation-tested: an LTM deal must NOT render "sizing: FY", and vice versa.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import HistoryTable from '../components/deal-engine/v2/HistoryTable';
import type { DealFacts } from '../lib/engine2/types';

const facts = (over: Partial<DealFacts>): DealFacts => ({
  entity_name: 'X', source: 'edgar', sector: 'Other', currency: 'USD', fiscal_year: 2024, period_end: '2024-12-31',
  fy_revenue: 1080, fy_ebitda: 267, fy_ebitda_margin: 267 / 1080, da_pct_revenue: 0.03, maint_capex_pct_revenue: 0.03,
  net_ppe: 100, operating_nwc: 10, nwc_pct_revenue: 0.01, dso: null, dio: null, dpo: null,
  gross_debt: 0, cash: 0, net_debt: 0, effective_tax_rate: 0.21, nol_carryforward_floor: null,
  implied_cost_of_debt: null, implied_trading_ev_ebitda: null, sic_code: null, sector_comps: null,
  history: [{ fiscal_year: 2024, period_end: '2024-12-31', revenue: 1080, ebitda: 267, capex: null, operating_nwc: null }],
  ...over,
});

describe('sizing-basis badge (§1.1) in HistoryTable', () => {
  it('LTM deal shows "sizing: LTM ending <as_of>" + a fresh tier (derived from as-of vs today), not FY', () => {
    const html = renderToStaticMarkup(<HistoryTable facts={facts({ sizing_basis: 'LTM', sizing_as_of: '2025-09-30' })} today={new Date('2025-11-15')} />);
    expect(html).toContain('sizing: LTM ending 2025-09-30');
    expect(html).toContain('fresh'); // ~1.5m old ⇒ fresh
    expect(html).not.toContain('sizing: FY'); // mutation: an LTM deal mislabeled FY would fail here
  });

  it('FY deal shows "sizing: FY" + an aging tier, not an LTM date', () => {
    const html = renderToStaticMarkup(<HistoryTable facts={facts({ sizing_basis: 'FY', sizing_as_of: '2024-12-31' })} today={new Date('2025-11-15')} />);
    expect(html).toContain('sizing: FY');
    expect(html).toContain('aging'); // ~10.5m old ⇒ aging
    expect(html).not.toContain('LTM ending');
  });

  it('manual facts (no sizing_basis) render no badge — never a fabricated basis', () => {
    const html = renderToStaticMarkup(<HistoryTable facts={facts({ sizing_basis: undefined })} today={new Date('2025-11-15')} />);
    expect(html).not.toContain('sizing:');
  });
});
