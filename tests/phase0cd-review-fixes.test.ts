/**
 * Adversarial-review fixes on Phase 0C/0D (presentation/attribution — engine numbers were
 * already correct):
 *   • The EBITDA bridge walk excludes below-EBITDA cash items (integration / monitoring), so
 *     it foots to exit EBITDA.
 *   • An NTM exit's forward-growth premium is attributed to revenue growth, not multiple
 *     expansion (a deal with equal entry/exit multiples shows zero multiple expansion).
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { canonicalDeals, debtFundedAddOn } from './fixtures/canonicalDeals';

describe('EBITDA bridge walk foots to exit EBITDA (no below-EBITDA bars)', () => {
  it('entry + organic + margin + synergies + add-on EBITDA = exit EBITDA, even with integration costs', () => {
    const s = canonicalDeals.find((d) => d.name === 'cash-sweep')!.build();
    s.add_on_acquisitions = [{ ...debtFundedAddOn(), integration_cost: 10, synergy_cost: 5 }];
    s.fees.monitoring_fee_annual = 2; // a below-EBITDA item that must NOT appear in the walk
    const eb = fullRecalc(s).ebitda_bridge;
    const walk = eb.entry_ebitda + eb.organic_revenue_contribution + eb.margin_expansion_contribution
      + eb.cost_synergies + eb.add_on_ebitda;
    expect(Math.abs(walk - eb.exit_ebitda)).toBeLessThan(0.5);
  });
});

describe('NTM exit forward-growth is revenue growth, not multiple expansion', () => {
  it('equal entry/exit multiples under NTM ⇒ zero multiple-expansion contribution', () => {
    const s = canonicalDeals[0].build();
    s.entry.entry_ebitda_multiple = 10;
    s.exit.exit_ebitda_multiple = 10; // no genuine multiple change
    s.exit.exit_ebitda_basis = 'ntm';
    const out = fullRecalc(s);
    const vd = out.value_drivers;
    expect(Math.abs(vd.multiple_expansion_contribution_abs)).toBeLessThan(1e-6); // no phantom expansion
    expect(vd.reconciliation_delta).toBeLessThan(0.5);                            // bridge still reconciles
  });

  it('LTM (default) leaves the multiple-expansion attribution unchanged', () => {
    const s = canonicalDeals[0].build();
    s.entry.entry_ebitda_multiple = 10;
    s.exit.exit_ebitda_multiple = 10;
    // default LTM basis
    const vd = fullRecalc(s).value_drivers;
    expect(Math.abs(vd.multiple_expansion_contribution_abs)).toBeLessThan(1e-6);
  });
});
