/**
 * engine2/credit.ts vs SPEC §11 (Phase C7 gate, rebuild/PHASE_C_ENGINE.md build order #7).
 *
 * The goldens deliberately ship EMPTY credit arrays (cov-lite, metrics not adjudicated),
 * so this gate anchors on SPEC formulas applied to the GOSPEL golden columns — every
 * input below is a committed fixture value — plus hand fixtures for the §11 legs the
 * goldens don't reach (covenants, step-downs, springing, N/A semantics).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildCreditYear,
  covenantBreachYear,
  covenantLevel,
  type CreditYearInputs,
} from '../lib/engine2/credit';
import type { CovenantAssumption, CreditYear } from '../lib/engine2/types';

const ROOT = join(__dirname, '..');
const load = (n: string) => JSON.parse(readFileSync(join(ROOT, 'tests/goldens', n, 'expected.json'), 'utf8'));

const COV_LITE: CovenantAssumption = { leverage_max: null, dscr_min: null, fccr_min: null, springing: null };

/** §17 tranche types per golden (for the senior filter). */
const TYPES: Record<string, Record<string, string>> = {
  G1: {},
  G2: { TLB: 'senior' },
  G3: { Senior: 'senior', 'PIK Note': 'pik_note' },
  G4: { Unitranche: 'unitranche' },
  G5: { Senior: 'senior' },
};
const RCF_COMMITMENT: Record<string, number> = { G1: 0, G2: 55, G3: 0, G4: 0, G5: 20 };
const ENTRY_DEBT: Record<string, number> = { G1: 0, G2: 440, G3: 405, G4: 42, G5: 48 };

function inputsFromFixture(g: any, golden: string, y: number): CreditYearInputs {
  return {
    operating: g.operating[y],
    waterfall: g.waterfall[y],
    tranches: Object.entries(TYPES[golden]).map(([name, type]) => ({
      type,
      row: { ...g.tranches[name][y], name },
    })),
    revolver: g.revolver ? g.revolver[y] : null,
    revolver_commitment: RCF_COMMITMENT[golden],
    cash_tax: g.tax[y].cash_tax,
    entry_total_debt: ENTRY_DEBT[golden],
  };
}

describe('credit.ts — §11 formulas on the gospel golden columns (C7 gate)', () => {
  for (const golden of ['G2', 'G3', 'G4', 'G5']) {
    it(`${golden}: leverage (net, senior-by-TYPE), ICR, FCCR, DSCR on scheduled service, deleveraging subtotals — every year`, () => {
      const g = load(golden);
      for (let y = 0; y < g.waterfall.length; y++) {
        const c = buildCreditYear(COV_LITE, y, inputsFromFixture(g, golden, y));
        const ebitda = g.operating[y].ebitda_adj;
        const cash = g.waterfall[y].closing_cash;
        const gross =
          Object.keys(TYPES[golden]).reduce((s, n) => s + g.tranches[n][y].ending_balance, 0) +
          (g.revolver ? g.revolver[y].ending_drawn : 0);
        const seniorGross =
          Object.entries(TYPES[golden]).reduce(
            (s, [n, type]) => s + (type === 'senior' || type === 'unitranche' ? g.tranches[n][y].ending_balance : 0),
            0,
          ) + (g.revolver ? g.revolver[y].ending_drawn : 0);
        const service =
          g.waterfall[y].cash_interest_total + g.waterfall[y].commitment_fees + g.waterfall[y].mandatory_amort_total;
        const ctx = `${golden} Y${y + 1}`;

        expect(c.net_leverage, `${ctx} net leverage`).toBeCloseTo((gross - cash) / ebitda, 6);
        expect(c.senior_net_leverage, `${ctx} senior`).toBeCloseTo(Math.max(0, seniorGross - cash) / ebitda, 6);
        expect(c.icr, `${ctx} icr`).toBeCloseTo(ebitda / g.waterfall[y].cash_interest_total, 6);
        expect(c.fccr, `${ctx} fccr`).toBeCloseTo(
          (ebitda - g.operating[y].maint_capex - g.tax[y].cash_tax) / service,
          6,
        );
        expect(c.dscr, `${ctx} dscr`).toBeCloseTo(g.operating[y].fcf_pre_debt / service, 6);
        expect(c.fcf_conversion, `${ctx} conversion`).toBeCloseTo(g.operating[y].fcf_pre_debt / ebitda, 6);
        expect(c.cumulative_paydown_pct_of_entry_debt, `${ctx} paydown`).toBeCloseTo(
          (ENTRY_DEBT[golden] - gross) / ENTRY_DEBT[golden],
          6,
        );
        // cov-lite: no covenant ⇒ null headroom, never 0 or a sentinel
        expect(c.leverage_headroom).toBeNull();
        expect(c.dscr_headroom).toBeNull();
        expect(c.fccr_headroom).toBeNull();
        // senior ≤ total (domain: total ≥ 0 — §11/FINANCIAL_DEFINITIONS Bug 7)
        if (c.net_leverage! >= 0) expect(c.senior_net_leverage!).toBeLessThanOrEqual(c.net_leverage! + 1e-9);
      }
    });
  }

  it('G3: the PIK note is EXCLUDED from senior leverage by TYPE (never array position)', () => {
    const g = load('G3');
    const c = buildCreditYear(COV_LITE, 0, inputsFromFixture(g, 'G3', 0));
    const seniorOnly = g.tranches['Senior'][0].ending_balance;
    const withPik = seniorOnly + g.tranches['PIK Note'][0].ending_balance;
    expect(c.senior_net_leverage).toBeCloseTo(
      Math.max(0, seniorOnly - g.waterfall[0].closing_cash) / g.operating[0].ebitda_adj,
      6,
    );
    expect(c.net_leverage).toBeCloseTo(
      (withPik - g.waterfall[0].closing_cash) / g.operating[0].ebitda_adj,
      6,
    );
    expect(c.senior_net_leverage!).toBeLessThan(c.net_leverage!);
  });

  it('G1 N/A semantics (§11): no debt ⇒ ICR/FCCR/DSCR/paydown null, net leverage SIGNED negative (net cash) — no sentinels anywhere', () => {
    const g = load('G1');
    const c = buildCreditYear(COV_LITE, 0, inputsFromFixture(g, 'G1', 0));
    expect(c.icr).toBeNull();
    expect(c.fccr).toBeNull();
    expect(c.dscr).toBeNull();
    expect(c.cumulative_paydown_pct_of_entry_debt).toBeNull();
    expect(c.net_leverage).toBeLessThan(0); // net cash, signed — never clamped
    expect(c.senior_net_leverage).toBe(0); // floored per the carried senior definition
    expect(c.fcf_conversion).toBeGreaterThan(0);
    expect(c.springing_test_active).toBe(false);
  });
});

describe('credit.ts — covenant machinery (golden-uncovered: hand fixtures)', () => {
  const baseInputs = (): CreditYearInputs => {
    const g = load('G2');
    return inputsFromFixture(g, 'G2', 0); // Y1: net leverage ≈ (401.7 − 21.3)/116.6 ≈ 3.26x
  };

  it('scalar and step-down covenant resolution; headroom SIGNED (breach = negative)', () => {
    expect(covenantLevel(null, 3)).toBeNull();
    expect(covenantLevel(5, 3)).toBe(5);
    expect(covenantLevel([5.5, 5, 4.5], 1)).toBe(5);
    expect(covenantLevel([5.5, 5, 4.5], 4)).toBe(4.5); // step-downs plateau at the last level

    const tight = buildCreditYear({ ...COV_LITE, leverage_max: 3.0 }, 0, baseInputs());
    expect(tight.leverage_headroom).toBeLessThan(0); // breached: 3.26x vs 3.0x max
    const loose = buildCreditYear({ ...COV_LITE, leverage_max: 4.5 }, 0, baseInputs());
    expect(loose.leverage_headroom).toBeGreaterThan(1.2);
    const dscrCov = buildCreditYear({ ...COV_LITE, dscr_min: 1.2 }, 0, baseInputs());
    expect(dscrCov.dscr_headroom).toBeCloseTo(dscrCov.dscr! - 1.2, 9);
  });

  it('springing test: active only when drawn/commitment exceeds the trigger (§11)', () => {
    const springing: CovenantAssumption = {
      ...COV_LITE,
      springing: { metric: 'leverage', max: 3.0, revolver_draw_trigger_pct: 0.35 },
    };
    const inputs = baseInputs();
    // G2 revolver is undrawn — inactive
    expect(buildCreditYear(springing, 0, inputs).springing_test_active).toBe(false);
    // force a 40% draw — active
    const drawn: CreditYearInputs = {
      ...inputs,
      revolver: { ...inputs.revolver!, ending_drawn: 22 },
    };
    expect(buildCreditYear(springing, 0, drawn).springing_test_active).toBe(true);
  });

  it('covenantBreachYear: first year with negative headroom or an active springing test exceeded; null when clean', () => {
    const mk = (over: Partial<CreditYear>): CreditYear => ({
      net_leverage: 3, senior_net_leverage: 2, icr: 4, fccr: 2, dscr: 1.5,
      leverage_headroom: 1, dscr_headroom: 0.3, fccr_headroom: 0.8,
      springing_test_active: false, fcf_conversion: 0.6, cumulative_paydown_pct_of_entry_debt: 0.2,
      ...over,
    });
    expect(covenantBreachYear(COV_LITE, [mk({}), mk({})])).toBeNull();
    expect(covenantBreachYear(COV_LITE, [mk({}), mk({ dscr_headroom: -0.1 })])).toBe(2);
    expect(covenantBreachYear(COV_LITE, [mk({ leverage_headroom: -0.5 }), mk({ dscr_headroom: -0.1 })])).toBe(1);
    const springing: CovenantAssumption = {
      ...COV_LITE,
      springing: { metric: 'leverage', max: 2.5, revolver_draw_trigger_pct: 0.35 },
    };
    expect(covenantBreachYear(springing, [mk({ springing_test_active: true, net_leverage: 3 })])).toBe(1);
    expect(covenantBreachYear(springing, [mk({ springing_test_active: false, net_leverage: 3 })])).toBeNull();
  });
});
