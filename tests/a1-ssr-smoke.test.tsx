/**
 * A1 render smoke test for the new Fund/Returns panels. A real browser isn't
 * available in CI, so we SSR-render each panel (react-dom/server, DOM-free) with
 * representative engine states and assert it renders without throwing and shows
 * the expected content. The store is mocked at the module boundary because
 * zustand's server snapshot returns the initial (null) state under SSR.
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
import type { ModelState } from '../lib/dealEngineTypes';
import FundReturnsPanel from '../components/deal-engine/outputs/FundReturnsPanel';
import SponsorReturnsDetail from '../components/deal-engine/outputs/SponsorReturnsDetail';

function withState(mutate?: (s: ModelState) => void): ModelState {
  const s = canonicalDeals[0].build();
  mutate?.(s);
  return fullRecalc(s);
}

function render(Comp: React.FC, state: ModelState): string {
  holder.state = { modelState: state };
  return renderToStaticMarkup(React.createElement(Comp));
}

describe('A1 — FundReturnsPanel renders', () => {
  it('is empty when no fund_assumptions', () => {
    expect(render(FundReturnsPanel, withState())).toBe('');
  });

  it('shows net LP returns when fund_assumptions is set (european & american)', () => {
    for (const wf of ['european', 'american'] as const) {
      const html = render(FundReturnsPanel, withState((s) => {
        s.fund_assumptions = { management_fee_pct: 0.02, management_fee_basis: 'invested', carry_rate: 0.2, preferred_return: 0.08, carry_waterfall: wf, fund_size: 1000, deal_allocation_pct: 0.1 };
      }));
      expect(html).toContain('Net IRR');
      expect(html).toContain('Net MOIC');
      expect(html).toContain(wf);
    }
  });
});

describe('A1 — SponsorReturnsDetail renders', () => {
  it('surfaces MIP, partial exits and monitoring termination', () => {
    const html = render(SponsorReturnsDetail, withState((s) => {
      s.mip.ratchet_tiers = [{ moic_threshold: 1.2, pool_pct: 0.15 }, { moic_threshold: 2.5, pool_pct: 0.2 }];
      s.exit.partial_exits = [{ year: 2, pct_sold: 0.3, exit_multiple: 10, exit_fee_pct: 0.01 }];
      s.fees.monitoring_fee_annual = 2; s.fees.monitoring_fee_termination_years = 3; s.fees.monitoring_fee_discount_rate = 0.1;
    }));
    expect(html).toContain('Realisations');
    expect(html).toContain('MOIC Hurdle');         // ratchet table
    expect(html).toContain('Partial Exits');
    expect(html).toContain('Monitoring-Fee Termination');
    expect(html).toContain('Realised Equity Cashflows');
  });

  it('renders with an IRR dual-hurdle tier (no cleared marker path)', () => {
    const html = render(SponsorReturnsDetail, withState((s) => {
      s.mip.ratchet_tiers = [{ moic_threshold: 1.5, irr_threshold: 0.2, pool_pct: 0.15 }];
    }));
    expect(html).toContain('IRR Hurdle');
  });
});
