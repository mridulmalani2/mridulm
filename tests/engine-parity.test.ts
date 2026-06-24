/**
 * Engine invariants / regression suite (refactor plan P1-6).
 *
 * Runs canonical deals through the live TypeScript engine (`fullRecalc`) and
 * asserts the structural invariants that MUST hold. Also pins the specific
 * Phase-1 defects fixed earlier so they cannot silently regress.
 *
 * Asserts invariants and within-engine relationships (e.g. net-debt
 * monotonicity, senior-leverage filtering), not specific IRR/MOIC values —
 * those are pinned by the regression baseline (tests/regression.test.ts).
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc, generateScenarios, generateSensitivityTable } from '../lib/engine/index';
import { resizeJuniorToDebt } from '../lib/engine/scenarios';
import { canonicalDeals, tranche, debtFundedAddOn } from './fixtures/canonicalDeals';
import type { ModelState } from '../lib/dealEngineTypes';

const TOL = 1e-6;

describe('engine invariants (all canonical deals)', () => {
  for (const deal of canonicalDeals) {
    describe(deal.name, () => {
      const s = fullRecalc(deal.build());
      const ds = s.debt_schedule;
      const ret = s.returns;
      const hp = s.exit.holding_period;

      it('produces a solvent entry equity and a finite MOIC', () => {
        expect(ret.entry_equity).toBeGreaterThan(0);
        expect(Number.isFinite(ret.moic)).toBe(true);
        expect(ret.moic).toBeGreaterThan(0);
      });

      it('MOIC reconciles to (exit equity + distributions) / entry equity', () => {
        const expected = (ret.exit_equity + ret.total_distributions) / ret.entry_equity;
        expect(Math.abs(ret.moic - expected)).toBeLessThan(1e-4);
      });

      it('net debt = max(0, gross debt − cash) every year', () => {
        for (let i = 0; i < hp; i++) {
          const gross = ds.total_debt_by_year[i];
          const cash = ds.cash_balance_by_year[i] ?? 0;
          const expected = Math.max(0, gross - cash);
          expect(Math.abs(ds.net_debt_by_year[i] - expected)).toBeLessThan(1e-3);
        }
      });

      it('per-year leverage is NET debt / EBITDA in both series (debt schedule + credit analysis)', () => {
        for (let i = 0; i < hp; i++) {
          const ebitda = s.projections.years[i].ebitda_adj;
          if (ebitda <= 0) continue; // sentinel territory
          const expected = ds.net_debt_by_year[i] / ebitda;
          expect(Math.abs(ds.leverage_ratio_by_year[i] - expected)).toBeLessThan(1e-6);
          expect(Math.abs(s.credit_analysis.metrics_by_year[i].leverage - expected)).toBeLessThan(1e-6);
          // …and strictly below the gross ratio whenever cash is on hand.
          if ((ds.cash_balance_by_year[i] ?? 0) > 0) {
            expect(ds.leverage_ratio_by_year[i]).toBeLessThan(ds.total_debt_by_year[i] / ebitda + 1e-9);
          }
        }
      });

      it('does not leak synthetic add-on tranches into the input state', () => {
        expect(s.debt_tranches.some((t) => t._synthetic_addon)).toBe(false);
      });
    });
  }
});

describe('P1-1 leverage sensitivity resizes the junior tranche only', () => {
  function twoTranche(): ModelState {
    const s = canonicalDeals[0].build();
    s.debt_tranches = [
      tranche({ name: 'Senior', principal: 80 }),
      tranche({ name: 'Junior', tranche_type: 'mezzanine', principal: 20 }),
    ];
    return s;
  }

  it('absorbs the leverage delta in the junior tranche, leaving senior fixed', () => {
    const s = twoTranche();
    resizeJuniorToDebt(s, 90); // total was 100 → reduce by 10
    expect(s.debt_tranches[0].principal).toBe(80); // senior unchanged
    expect(s.debt_tranches[1].principal).toBe(10); // junior absorbs the −10
  });

  it('never drives senior below its commitment (junior floors at zero)', () => {
    const s = twoTranche();
    resizeJuniorToDebt(s, 70); // delta −30 exceeds the 20 of junior
    expect(s.debt_tranches[0].principal).toBe(80); // senior preserved (no pro-rata cut)
    expect(s.debt_tranches[1].principal).toBe(0); // junior clamped at 0
  });

  it('generateSensitivityTable case 4 returns a well-formed 9×9 matrix', () => {
    const table = generateSensitivityTable(canonicalDeals[0].build(), 4);
    expect(table.irr_matrix.length).toBe(9);
    expect(table.irr_matrix.every((row) => row.length === 9)).toBe(true);
  });
});

describe('P1-2 add-on acquisition debt enters the debt schedule', () => {
  const baseState = fullRecalc(canonicalDeals[0].build());
  const addonInput = canonicalDeals[0].build();
  addonInput.add_on_acquisitions = [debtFundedAddOn()]; // £80m debt drawn in year 2
  const addon = fullRecalc(addonInput);

  it('leaves year-1 debt unchanged (add-on not yet drawn)', () => {
    expect(Math.abs(addon.debt_schedule.total_debt_by_year[0] - baseState.debt_schedule.total_debt_by_year[0])).toBeLessThan(TOL);
  });

  it('raises debt from the acquisition year by the financing amount', () => {
    const delta = addon.debt_schedule.total_debt_by_year[1] - baseState.debt_schedule.total_debt_by_year[1];
    expect(delta).toBeGreaterThan(75); // ≈ £80m add-on financing
  });

  it('adds a self-labelled add-on tranche to the schedule', () => {
    const names = addon.debt_schedule.tranche_schedules.map((t) => t[0]?.tranche_name ?? '');
    expect(names.some((n) => n.includes('Add-on Debt'))).toBe(true);
  });

  it('does NOT change entry equity (add-on is drawn mid-hold, not at entry)', () => {
    expect(Math.abs(addon.returns.entry_equity - baseState.returns.entry_equity)).toBeLessThan(1e-3);
  });

  it('is idempotent across repeated recalcs (no synthetic-tranche accumulation)', () => {
    const before = addon.debt_tranches.length;
    const totalY2 = addon.debt_schedule.total_debt_by_year[1];
    const again = fullRecalc(addon);
    expect(again.debt_tranches.length).toBe(before);
    expect(Math.abs(again.debt_schedule.total_debt_by_year[1] - totalY2)).toBeLessThan(1e-3);
  });
});

describe('P1-3 fragility & scenarios use the same add-on revenue base as the base case', () => {
  const addonInput = canonicalDeals[0].build();
  addonInput.add_on_acquisitions = [debtFundedAddOn()];
  const s = fullRecalc(addonInput);

  it('fragility base IRR matches fullRecalc IRR', () => {
    expect(s.fragility.base_irr).not.toBeNull();
    expect(s.returns.irr).not.toBeNull();
    expect(Math.abs((s.fragility.base_irr ?? 0) - (s.returns.irr ?? 0))).toBeLessThan(0.005);
  });

  it('base scenario IRR matches fullRecalc IRR', () => {
    const scenarios = generateScenarios(addonInput);
    const baseScenario = scenarios.find((sc) => sc.name === 'base');
    expect(baseScenario).toBeDefined();
    expect(Math.abs((baseScenario!.irr ?? 0) - (s.returns.irr ?? 0))).toBeLessThan(0.005);
  });
});

describe('P1-4 senior leverage sums senior-type tranches, not array position', () => {
  it('reports senior NET leverage from the term loan even when an undrawn revolver is in slot 0', () => {
    const s = fullRecalc(canonicalDeals.find((d) => d.name === 'revolver-first')!.build());
    const ebitdaY1 = s.projections.years[0].ebitda_adj; // metric uses each year's EBITDA
    const tlbBalanceY1 = s.debt_schedule.tranche_schedules[1][0].ending_balance;
    const cashY1 = s.debt_schedule.cash_balance_by_year[0] ?? 0;
    const seniorLevY1 = s.credit_analysis.metrics_by_year[0].senior_leverage;
    expect(seniorLevY1).toBeGreaterThan(0); // old bug reported ~0 (revolver slot 0)
    // Senior leverage nets cash (same basis as total net leverage); revolver in slot 0 is 0.
    expect(Math.abs(seniorLevY1 - Math.max(0, tlbBalanceY1 - cashY1) / ebitdaY1)).toBeLessThan(1e-3);
  });

  it('senior net leverage never exceeds total net leverage, every deal/year (Bug 7)', () => {
    for (const deal of canonicalDeals) {
      const s = fullRecalc(deal.build());
      for (let i = 0; i < s.exit.holding_period; i++) {
        const m = s.credit_analysis.metrics_by_year[i];
        if (s.projections.years[i].ebitda_adj <= 0) continue; // 9999 sentinel years
        expect(m.senior_leverage).toBeLessThanOrEqual(m.leverage + 1e-6);
      }
    }
  });
});

describe('Bug 4 — resizeJuniorToDebt flexes the junior tranche by seniority, not array order', () => {
  it('absorbs the delta in the mezzanine even when senior is the LAST array element', () => {
    const s = canonicalDeals[0].build();
    s.debt_tranches = [
      tranche({ name: 'Mezz', tranche_type: 'mezzanine', principal: 20 }),
      tranche({ name: 'Senior', tranche_type: 'senior', principal: 80 }), // last, but most senior
    ];
    resizeJuniorToDebt(s, 90); // reduce total debt by 10
    expect(s.debt_tranches[1].principal).toBe(80); // senior preserved despite being last
    expect(s.debt_tranches[0].principal).toBe(10); // mezzanine (junior) absorbs the −10
  });

  it('never flexes a revolver; picks the most-junior non-revolver tranche', () => {
    const s = canonicalDeals[0].build();
    s.debt_tranches = [
      tranche({ name: 'TLB', tranche_type: 'senior', principal: 70 }),
      tranche({ name: 'PIK', tranche_type: 'pik_note', principal: 20 }),
      tranche({ name: 'RCF', tranche_type: 'revolver', principal: 10 }),
    ];
    resizeJuniorToDebt(s, 90); // −10
    expect(s.debt_tranches[0].principal).toBe(70); // senior fixed
    expect(s.debt_tranches[2].principal).toBe(10); // revolver untouched
    expect(s.debt_tranches[1].principal).toBe(10); // PIK (most junior) absorbs the −10
  });
});

describe('Clean-room — three-statement closes for an all-equity (no-debt) deal', () => {
  it('accumulates retained FCF as cash and balances, with no debt to absorb it', () => {
    const s = canonicalDeals[0].build();
    s.debt_tranches = []; // all-equity buyout
    const out = fullRecalc(s);
    expect(out.balance_sheet.closes).toBe(true);
    // Cash must roll forward (FCF has nowhere else to go without debt to sweep).
    const lastCash = out.debt_schedule.cash_balance_by_year[out.exit.holding_period - 1];
    expect(lastCash).toBeGreaterThan(0);
    expect(out.debt_schedule.net_debt_by_year[0]).toBe(0);
  });
});

describe('Bug 3 — recovery waterfall ignores EBITDA≤0 sentinel years', () => {
  it('selects a positive-EBITDA default year and does not collapse recovery to zero', () => {
    const s = canonicalDeals[0].build();
    // Compress margin below zero so late years have non-positive EBITDA (9999 leverage sentinel).
    s.margins.base_ebitda_margin = 0.05;
    s.margins.target_ebitda_margin = -0.10;
    s.margins.margin_by_year = [];
    const out = fullRecalc(s);
    expect(out.projections.years.some((y) => y.ebitda_adj <= 0)).toBe(true); // the sentinel case exists
    const dyi = (out.credit_analysis.recovery_default_year ?? 1) - 1;
    expect(out.projections.years[dyi].ebitda_adj).toBeGreaterThan(0); // chosen year is solvent
    expect(out.credit_analysis.recovery_stress_ev ?? 0).toBeGreaterThan(0); // not a sentinel-driven 0
  });
});

describe('engine unity: one solver, three callers (WS1)', () => {
  // fullRecalc (index.ts), the base scenario (scenarios.ts → runFullModel) and the
  // fragility base case (fragility.ts → quickCalc) all run the SAME convergence loop
  // in lib/engine/converge.ts. On identical assumptions they must produce identical
  // returns — not merely close. This is the guard that keeps the extracted solver
  // from silently diverging again.
  for (const deal of canonicalDeals) {
    describe(deal.name, () => {
      const full = fullRecalc(deal.build());
      const baseScenario = generateScenarios(deal.build()).find((sc) => sc.name === 'base')!;

      it('base scenario IRR/MOIC/exit-equity equal fullRecalc', () => {
        expect(Math.abs((baseScenario.irr ?? 0) - (full.returns.irr ?? 0))).toBeLessThan(1e-9);
        expect(Math.abs(baseScenario.moic - full.returns.moic)).toBeLessThan(1e-9);
        expect(Math.abs(baseScenario.exit_equity - full.returns.exit_equity)).toBeLessThan(1e-6);
      });

      it('fragility base IRR/MOIC equal fullRecalc', () => {
        expect(Math.abs((full.fragility.base_irr ?? 0) - (full.returns.irr ?? 0))).toBeLessThan(1e-9);
        expect(Math.abs(full.fragility.base_moic - full.returns.moic)).toBeLessThan(1e-9);
      });
    });
  }
});

describe('regression: simple bullet deal stays in a sane range', () => {
  const s = fullRecalc(canonicalDeals[0].build());
  it('IRR is positive and MOIC is plausible', () => {
    expect(s.returns.irr).not.toBeNull();
    expect(s.returns.irr!).toBeGreaterThan(0);
    expect(s.returns.moic).toBeGreaterThan(1);
    expect(s.returns.moic).toBeLessThan(6);
  });
});
