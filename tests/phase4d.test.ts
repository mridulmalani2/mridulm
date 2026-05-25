/**
 * Phase 4 — PR D: credit-analysis features.
 *   P4-8  springing DSCR covenant (revolver-utilisation-gated)
 *   P4-10 recovery waterfall on year-of-default (peak-leverage) EV, configurable haircuts
 *
 * Credit analysis does not affect IRR/MOIC; P4-10 changes a displayed credit output
 * for all deals (signed off). P4-8 is opt-in.
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { canonicalDeals, tranche } from './fixtures/canonicalDeals';
import type { ModelState } from '../lib/dealEngineTypes';

describe('P4-10 recovery on year-of-default EV', () => {
  it('recovers against a peak-leverage distressed EV (not entry-EV × 50%) and reports the basis', () => {
    const s = fullRecalc(canonicalDeals[0].build()); // single senior 80 bullet
    const ca = s.credit_analysis;
    expect(ca.recovery_default_year).toBeGreaterThanOrEqual(1);
    expect(ca.recovery_default_year).toBeLessThanOrEqual(s.exit.holding_period);
    expect(ca.recovery_stress_ev).toBeGreaterThan(0);
    // Senior recovers first; with one tranche its recovery = min(stressEV, balance)/balance.
    const senior = ca.recovery_waterfall.find((r) => r.tranche === 'Senior TLB')!;
    expect(senior.recovery_pct).toBeGreaterThan(0);
    expect(senior.recovery_pct).toBeLessThanOrEqual(1);
  });

  it('a deeper haircut lowers recovery', () => {
    const mild = canonicalDeals[0].build();
    mild.credit_covenants = { ...mild.credit_covenants, recovery_ebitda_haircut: 0.2, recovery_multiple_haircut: 0.3, recovery_distressed_cost_pct: 0.05 };
    const severe = canonicalDeals[0].build();
    severe.credit_covenants = { ...severe.credit_covenants, recovery_ebitda_haircut: 0.6, recovery_multiple_haircut: 0.6, recovery_distressed_cost_pct: 0.15 };
    const a = fullRecalc(mild).credit_analysis;
    const b = fullRecalc(severe).credit_analysis;
    expect(b.recovery_stress_ev!).toBeLessThan(a.recovery_stress_ev!);
    const sa = a.recovery_waterfall.find((r) => r.tranche === 'Senior TLB')!;
    const sb = b.recovery_waterfall.find((r) => r.tranche === 'Senior TLB')!;
    expect(sb.recovery_pct).toBeLessThanOrEqual(sa.recovery_pct);
  });

  it('pays senior before junior in the waterfall ordering', () => {
    const s = canonicalDeals[0].build();
    s.debt_tranches = [
      tranche({ name: 'Mezz', tranche_type: 'mezzanine', principal: 40, amortization_type: 'bullet' }),
      tranche({ name: 'Senior', tranche_type: 'senior', principal: 60, amortization_type: 'bullet' }),
    ];
    const ca = fullRecalc(s).credit_analysis;
    // Senior listed first in the waterfall despite being second in the input array.
    expect(ca.recovery_waterfall[0].tranche).toBe('Senior');
    expect(ca.recovery_waterfall.findIndex((r) => r.tranche === 'Senior'))
      .toBeLessThan(ca.recovery_waterfall.findIndex((r) => r.tranche === 'Mezz'));
  });
});

describe('P4-8 springing DSCR covenant', () => {
  function revolverDeal(): ModelState {
    const s = canonicalDeals[0].build();
    s.entry.min_cash_balance = 30; // forces a revolver draw
    s.debt_tranches = [
      tranche({ name: 'Senior TLB', principal: 80, amortization_type: 'bullet' }),
      tranche({ name: 'RCF', tranche_type: 'revolver', principal: 0, commitment: 50, commitment_fee: 0.005 }),
    ];
    return s;
  }

  it('flags a springing breach only when the revolver is drawn above the threshold', () => {
    const s = revolverDeal();
    s.credit_covenants = { ...s.credit_covenants, springing_dscr_covenant: 99, springing_utilization_threshold: 0.2 };
    const ca = fullRecalc(s).credit_analysis;
    // The revolver is drawn (>20% of £50m) early; an unreachable 99x DSCR test ⇒ breach flagged.
    expect(ca.springing_breach_by_year!.some((b) => b === true)).toBe(true);
  });

  it('does not flag when no springing covenant is configured', () => {
    const ca = fullRecalc(revolverDeal()).credit_analysis;
    expect((ca.springing_breach_by_year ?? []).every((b) => b === false)).toBe(true);
  });

  it('tightens DSCR headroom in drawn years vs the base covenant', () => {
    const base = fullRecalc(revolverDeal()).credit_analysis;
    const s = revolverDeal();
    s.credit_covenants = { ...s.credit_covenants, springing_dscr_covenant: 2.0, springing_utilization_threshold: 0.2 };
    const spr = fullRecalc(s).credit_analysis;
    // In at least one (drawn) year the springing test is tighter ⇒ less DSCR headroom.
    const tighter = spr.dscr_headroom_by_year.some((h, i) => h < base.dscr_headroom_by_year[i] - 1e-9);
    expect(tighter).toBe(true);
  });
});
