/**
 * A2 render smoke: SSR-render the DebtScheduleTable with PIK-toggle, refinancing
 * and OID set, asserting the new rows surface. Store mocked at the module
 * boundary (zustand's server snapshot is the initial null state under SSR).
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
import DebtScheduleTable from '../components/deal-engine/outputs/DebtScheduleTable';

describe('A2 — DebtScheduleTable surfaces PIK election, refi premium, OID amort', () => {
  it('renders the new rows when the features are configured', () => {
    const s = canonicalDeals.find((d) => d.name === 'pik')!.build(); // [Senior TLB, PIK Note]
    s.debt_tranches[1].pik_toggle = true;
    s.debt_tranches[1].pik_election_by_year = [false, true, true, true, true];
    s.debt_tranches[0].refinancing = { year: 3, new_spread: 0.08, new_floor: 0, prepayment_premium: 0.02, extend_maturity_by: 0 };
    s.debt_tranches[0].oid_pct = 0.02;
    s.debt_tranches[0].debt_maturity_years = 5;
    holder.state = { modelState: fullRecalc(s) };

    const html = renderToStaticMarkup(React.createElement(DebtScheduleTable));
    expect(html).toContain('Debt Schedule');
    expect(html).toContain('Election');     // PIK-toggle election row
    expect(html).toContain('Refi Premium'); // refinancing premium footer row
    expect(html).toContain('OID Amort');    // OID amortisation footer row
  });

  it('omits the new rows for a plain deal', () => {
    holder.state = { modelState: fullRecalc(canonicalDeals[0].build()) };
    const html = renderToStaticMarkup(React.createElement(DebtScheduleTable));
    expect(html).toContain('Debt Schedule');
    expect(html).not.toContain('Refi Premium');
    expect(html).not.toContain('OID Amort');
  });
});
