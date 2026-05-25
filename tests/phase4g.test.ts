/**
 * Phase 4 — PR E3: monitoring-fee termination at exit (P4-11). Returns-affecting for
 * any deal with a monitoring fee (signed off). Deals with no monitoring fee are unchanged.
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { monitoringTerminationPayment } from '../lib/engine/returns';
import { canonicalDeals } from './fixtures/canonicalDeals';
import type { ModelState } from '../lib/dealEngineTypes';

function monitoringDeal(): ModelState {
  const s = canonicalDeals[0].build();
  s.fees.monitoring_fee_annual = 2; // £2m/yr
  return s;
}

describe('P4-11 monitoring-fee termination at exit', () => {
  it('drops the monitoring fee in the exit year only', () => {
    const out = fullRecalc(monitoringDeal());
    const yrs = out.projections.years;
    const last = yrs.length - 1;
    // Interim year: EBITDA is net of the £2m fee. Exit year: fee terminated.
    expect(yrs[0].ebitda_adj).toBeCloseTo(yrs[0].revenue * yrs[0].ebitda_margin - 2, 6);
    expect(yrs[last].ebitda_adj).toBeCloseTo(yrs[last].revenue * yrs[last].ebitda_margin, 6);
  });

  it('a deal with no monitoring fee is unchanged by the feature', () => {
    const base = fullRecalc(canonicalDeals[0].build());
    // monitoring_fee_annual defaults to 0 ⇒ exit-year zeroing is a no-op.
    expect(base.fees.monitoring_fee_annual).toBe(0);
    expect(monitoringTerminationPayment(canonicalDeals[0].build())).toBe(0);
  });

  it('termination payment is the NPV annuity of the remaining fees', () => {
    const s = monitoringDeal();
    s.fees.monitoring_fee_termination_years = 3;
    s.fees.monitoring_fee_discount_rate = 0.10;
    // 2 × (1 − 1.1^-3)/0.1 = 2 × 2.48685 ≈ 4.9737
    expect(monitoringTerminationPayment(s)).toBeCloseTo(4.9737, 3);
  });

  it('the termination payment lowers returns vs no acceleration; BS still closes', () => {
    const noTerm = monitoringDeal();
    noTerm.fees.monitoring_fee_termination_years = 0;
    const withTerm = monitoringDeal();
    withTerm.fees.monitoring_fee_termination_years = 5;
    withTerm.fees.monitoring_fee_discount_rate = 0.10;
    const a = fullRecalc(noTerm);
    const b = fullRecalc(withTerm);
    expect(b.returns.exit_equity).toBeLessThan(a.returns.exit_equity);
    expect(b.returns.moic).toBeLessThan(a.returns.moic);
    expect(b.balance_sheet.closes).toBe(true);
    // Value bridge reconciles with the termination payment folded into fee drag.
    expect(b.value_drivers.reconciliation_delta).toBeLessThan(0.5);
  });
});
