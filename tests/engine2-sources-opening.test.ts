/**
 * engine2/sourcesUses.ts + openingBalance.ts vs SPEC §2/§8 and the golden t=0 columns
 * (Phase C2 gate, rebuild/PHASE_C_ENGINE.md build order #2).
 *
 * Fixtures: every golden's sources_uses block, derived block and balance_sheet[0].
 * Tolerance ±0.0075 (full-precision module vs 2dp fixture line).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import fc from 'fast-check';
import { buildOpeningBalance } from '../lib/engine2/openingBalance';
import { buildSourcesUses, deriveEntry, sizeStructure, trancheSize } from '../lib/engine2/sourcesUses';
import { nwcBalance } from '../lib/engine2/operating';
import type { DealAssumptions, OperationsAssumption, TrancheAssumption } from '../lib/engine2/types';

const ROOT = join(__dirname, '..');
const load = (n: string) => JSON.parse(readFileSync(join(ROOT, 'tests/goldens', n, 'expected.json'), 'utf8'));
const TOL = 0.0075;

/** SPEC §17 inputs per golden (entry/structure/fees; rollover 0, fees 2%/1.5% everywhere). */
interface GoldenSpec {
  fy_revenue: number;
  fy_ebitda: number;
  fy_margin: number;
  net_ppe: number;
  entry_multiple: number;
  min_cash: number;
  nwc: OperationsAssumption['nwc'];
  growth0: number;
  tranches: TrancheAssumption[];
}

const floating = (spread: number, floor = 0) =>
  ({ kind: 'floating', base_rate: 0.036, spread, floor }) as const;

const SPECS: Record<string, GoldenSpec> = {
  G1: {
    fy_revenue: 100, fy_ebitda: 25, fy_margin: 0.25, net_ppe: 20, entry_multiple: 8, min_cash: 5,
    nwc: { method: 'pct', pct_revenue: 0.1 }, growth0: 0, tranches: [],
  },
  G2: {
    fy_revenue: 500, fy_ebitda: 110, fy_margin: 0.22, net_ppe: 100, entry_multiple: 9, min_cash: 10,
    nwc: { method: 'pct', pct_revenue: 0.08 }, growth0: 0.06,
    tranches: [
      {
        name: 'TLB', type: 'senior', size: { x_ebitda: 4 }, pricing: floating(0.0375),
        amort_pct_of_face: 0.01, maturity_years: 7, oid_pct: 0, sweep: { participates: true, priority: 1 },
      },
      {
        name: 'Revolver', type: 'revolver', commitment: { x_ebitda: 0.5 }, pricing: floating(0.035),
        commitment_fee: 0.005, maturity_years: 5, drawn_at_close: 0,
      },
    ],
  },
  G3: {
    fy_revenue: 300, fy_ebitda: 90, fy_margin: 0.3, net_ppe: 70, entry_multiple: 8.5, min_cash: 8,
    nwc: { method: 'days', dso: 45, dio: 30, dpo: 40 }, growth0: 0.05,
    tranches: [
      {
        name: 'Senior', type: 'senior', size: { x_ebitda: 3 }, pricing: floating(0.045, 0.0075),
        amort_pct_of_face: 0.05, maturity_years: 7, oid_pct: 0, sweep: { participates: true, priority: 1 },
      },
      {
        name: 'PIK Note', type: 'pik_note', size: { x_ebitda: 1.5 }, cash_coupon: 0, pik_coupon: 0.12,
        amort_pct_of_face: 0, maturity_years: 8, oid_pct: 0.02, sweep: { participates: false, priority: 2 }, elections: null,
      },
    ],
  },
  G4: {
    fy_revenue: 200, fy_ebitda: 12, fy_margin: 0.06, net_ppe: 60, entry_multiple: 7, min_cash: 3,
    nwc: { method: 'pct', pct_revenue: 0.09 }, growth0: 0.02,
    tranches: [
      {
        name: 'Unitranche', type: 'unitranche', size: { x_ebitda: 3.5 }, pricing: floating(0.05, 0.0075),
        amort_pct_of_face: 0.01, maturity_years: 7, oid_pct: 0.025, sweep: { participates: true, priority: 1 },
      },
    ],
  },
  G5: {
    fy_revenue: 80, fy_ebitda: 16, fy_margin: 0.2, net_ppe: 15, entry_multiple: 7, min_cash: 4,
    nwc: { method: 'pct', pct_revenue: 0.12 }, growth0: 0.1,
    tranches: [
      {
        name: 'Senior', type: 'senior', size: { x_ebitda: 3 }, pricing: floating(0.0425),
        amort_pct_of_face: 0.1, maturity_years: 6, oid_pct: 0, sweep: { participates: true, priority: 1 },
      },
      {
        name: 'Revolver', type: 'revolver', commitment: { amount: 20 }, pricing: floating(0.04),
        commitment_fee: 0.005, maturity_years: 5, drawn_at_close: 0,
      },
    ],
  },
};

function derive(spec: GoldenSpec) {
  const entry = deriveEntry(
    { fy_ebitda: spec.fy_ebitda },
    {
      entry: { driver: 'multiple', entry_multiple: spec.entry_multiple, enterprise_value: null, basis: 'fy', hold_years: 5 },
      operations: { growth: [spec.growth0, 0, 0, 0, 0] } as OperationsAssumption,
    },
  );
  const structure: DealAssumptions['structure'] = {
    tranches: spec.tranches,
    min_cash: spec.min_cash,
    sweep: { base_pct: 0.5, grid: null },
    distributions: null,
    refinancing: null,
  };
  const sized = sizeStructure(structure, spec.fy_ebitda);
  const su = buildSourcesUses(entry, sized, {
    fees: { transaction_pct_of_ev: 0.02, financing_pct_of_commitments: 0.015, monitoring: null },
    structure,
    rollover_equity: 0,
  });
  return { entry, sized, su };
}

describe('sourcesUses.ts + openingBalance.ts reproduce the golden t=0 columns (C2 gate)', () => {
  for (const golden of ['G1', 'G2', 'G3', 'G4', 'G5']) {
    it(`${golden}: S&U block, derived block, opening balance sheet`, () => {
      const g = load(golden);
      const spec = SPECS[golden];
      const { entry, sized, su } = derive(spec);

      // derived block
      expect(Math.abs(entry.enterprise_value - g.derived.enterprise_value), 'EV').toBeLessThan(TOL);
      expect(Math.abs(su.sponsor_equity - g.derived.sponsor_equity), 'sponsor equity').toBeLessThan(TOL);
      expect(Math.abs(sized.total_par - g.derived.total_debt_at_par), 'total par').toBeLessThan(TOL);
      // §11 [v1.1.2]: entry leverage is GROSS — par ÷ FY EBITDA, deliberately NOT netted
      // against the funded min-cash. §2 does put min_cash on the t=0 balance sheet, so the
      // §11 net figure would be (par − cash_to_balance_sheet) ÷ EBITDA.
      if (spec.fy_ebitda > 0) {
        expect(Math.abs(sized.total_par / spec.fy_ebitda - g.derived.entry_gross_leverage_fy)).toBeLessThan(5e-5);
        // Pin the GAP itself, sourced from the model rather than test literals. The gap is
        // exactly cash_to_balance_sheet ÷ EBITDA, so this fires if the field ever drifts to
        // the net definition — unlike a bare `net < gross`, which reduces algebraically to
        // `min_cash > 0` and detects nothing (hostile review F2, 2026-07-24).
        const entryNet = (su.debt_at_par.reduce((s, d) => s + d.amount, 0) - su.cash_to_balance_sheet) / spec.fy_ebitda;
        expect(g.derived.entry_gross_leverage_fy - entryNet, `${golden} gross−net gap`)
          .toBeCloseTo(su.cash_to_balance_sheet / spec.fy_ebitda, 9);
        if (su.cash_to_balance_sheet > 0) expect(entryNet).toBeLessThan(g.derived.entry_gross_leverage_fy);
      }

      // sources & uses block
      expect(Math.abs(su.enterprise_value - g.sources_uses.enterprise_value)).toBeLessThan(TOL);
      expect(Math.abs(su.transaction_costs - g.sources_uses.transaction_costs)).toBeLessThan(TOL);
      expect(Math.abs(su.financing_fees - g.sources_uses.financing_fees)).toBeLessThan(TOL);
      expect(Math.abs(su.oid_funded - g.sources_uses.oid_funded)).toBeLessThan(TOL);
      expect(Math.abs(su.cash_to_balance_sheet - g.sources_uses.cash_to_balance_sheet)).toBeLessThan(TOL);
      expect(Math.abs(su.total_uses - g.sources_uses.total_uses)).toBeLessThan(TOL);
      expect(Math.abs(su.sponsor_equity - g.sources_uses.sponsor_equity)).toBeLessThan(TOL);
      expect(Math.abs(su.total_sources - g.sources_uses.total_sources)).toBeLessThan(TOL);
      expect(su.debt_at_par).toHaveLength(g.sources_uses.debt_at_par.length);
      for (let i = 0; i < su.debt_at_par.length; i++) {
        expect(su.debt_at_par[i].name).toBe(g.sources_uses.debt_at_par[i].name);
        expect(Math.abs(su.debt_at_par[i].amount - g.sources_uses.debt_at_par[i].amount)).toBeLessThan(TOL);
      }
      // §14.1 sources ≡ uses, exact
      expect(su.total_sources).toBeCloseTo(su.total_uses, 9);

      // opening balance sheet (fixture balance_sheet[0])
      const nwc0 = nwcBalance(spec.nwc, spec.fy_revenue, spec.fy_margin);
      const ob = buildOpeningBalance(su, nwc0, { net_ppe: spec.net_ppe }).row;
      const bs0 = g.balance_sheet[0];
      expect(Math.abs(ob.cash - bs0.cash), 'cash').toBeLessThan(TOL);
      expect(Math.abs(ob.operating_nwc - bs0.operating_nwc), 'nwc').toBeLessThan(TOL);
      expect(Math.abs(ob.ppe - bs0.ppe), 'ppe').toBeLessThan(TOL);
      expect(Math.abs(ob.deferred_financing_costs - bs0.deferred_financing_costs), 'dfc').toBeLessThan(TOL);
      expect(Math.abs(ob.goodwill - bs0.goodwill), 'goodwill').toBeLessThan(TOL);
      expect(Math.abs(ob.total_assets - bs0.total_assets), 'assets').toBeLessThan(0.015); // sum of 5 lines
      expect(Math.abs(ob.debt_at_par - bs0.debt_at_par), 'debt').toBeLessThan(TOL);
      expect(Math.abs(ob.equity - bs0.equity), 'equity').toBeLessThan(TOL);
      expect(Math.abs(ob.check), 'check ≡ 0 (§14.2)').toBeLessThan(1e-9);
    });
  }
});

describe('sourcesUses.ts + openingBalance.ts §2/§8 properties', () => {
  const money = (min: number, max: number) => fc.double({ min, max, noNaN: true });

  interface StructureCase {
    ebitda: number;
    multiple: number;
    minCash: number;
    rollover: number;
    txnPct: number;
    finPct: number;
    ppe: number | null;
    nwc0: number;
    revolverX: number | null;
    tranches: TrancheAssumption[];
  }

  const structureArb = fc
    .record({
      ebitda: money(5, 500),
      multiple: fc.double({ min: 4, max: 14, noNaN: true }),
      sizes: fc.array(fc.double({ min: 0, max: 4, noNaN: true }), { maxLength: 3 }),
      oids: fc.array(fc.double({ min: 0, max: 0.04, noNaN: true }), { minLength: 3, maxLength: 3 }),
      revolverX: fc.option(fc.double({ min: 0.1, max: 1, noNaN: true }), { nil: null }),
      minCash: money(0, 30),
      rollover: money(0, 50),
      txnPct: fc.double({ min: 0, max: 0.04, noNaN: true }),
      finPct: fc.double({ min: 0, max: 0.03, noNaN: true }),
      ppe: fc.option(money(0, 200), { nil: null }),
      nwc0: money(0, 100),
    })
    .map((r) => {
      const tranches: TrancheAssumption[] = r.sizes.map((x, i) => ({
        name: `T${i}`,
        type: 'senior' as const,
        size: { x_ebitda: x },
        pricing: { kind: 'fixed' as const, rate: 0.08 },
        amort_pct_of_face: 0.01,
        maturity_years: 7,
        oid_pct: r.oids[i],
        sweep: { participates: true, priority: 1 },
      }));
      if (r.revolverX !== null) {
        tranches.push({
          name: 'RCF',
          type: 'revolver' as const,
          commitment: { x_ebitda: r.revolverX },
          pricing: { kind: 'fixed' as const, rate: 0.07 },
          commitment_fee: 0.005,
          maturity_years: 5,
          drawn_at_close: 0,
        });
      }
      return { ...r, tranches };
    });

  function build(r: StructureCase) {
    const entry = deriveEntry(
      { fy_ebitda: r.ebitda },
      {
        entry: { driver: 'multiple', entry_multiple: r.multiple, enterprise_value: null, basis: 'fy', hold_years: 5 },
        operations: { growth: [0.05, 0, 0, 0, 0] } as OperationsAssumption,
      },
    );
    const structure: DealAssumptions['structure'] = {
      tranches: r.tranches,
      min_cash: r.minCash,
      sweep: { base_pct: 0.5, grid: null },
      distributions: null,
      refinancing: null,
    };
    const sized = sizeStructure(structure, r.ebitda);
    const su = buildSourcesUses(entry, sized, {
      fees: { transaction_pct_of_ev: r.txnPct, financing_pct_of_commitments: r.finPct, monitoring: null },
      structure,
      rollover_equity: r.rollover,
    });
    return { entry, sized, su };
  }

  it('§14.1: sources ≡ uses BY CONSTRUCTION for any structure; sponsor plug absorbs everything. Domain: any valid v1 structure', () => {
    fc.assert(
      fc.property(structureArb, (r) => {
        const { su } = build(r);
        expect(su.total_sources).toBeCloseTo(su.total_uses, 8);
        expect(su.sponsor_equity).toBeCloseTo(
          su.total_uses - su.debt_at_par.reduce((s, t) => s + t.amount, 0) - r.rollover,
          8,
        );
      }),
    );
  });

  it('§2: the financing-fee base INCLUDES the undrawn revolver commitment (DR-2 forgotten-revolver-fee flag)', () => {
    fc.assert(
      fc.property(structureArb, (r) => {
        fc.pre(r.revolverX !== null && r.finPct > 0);
        const withRcf = build(r);
        const withoutRcf = build({ ...r, tranches: r.tranches.filter((t: TrancheAssumption) => t.type !== 'revolver'), revolverX: null });
        const rcfCommitment = r.revolverX * r.ebitda;
        expect(withRcf.su.financing_fees - withoutRcf.su.financing_fees).toBeCloseTo(r.finPct * rcfCommitment, 8);
      }),
    );
  });

  it('§14.2: the opening BS closes EXACTLY for any structure — goodwill is the plug. Domain: any valid v1 structure', () => {
    fc.assert(
      fc.property(structureArb, (r) => {
        const { su } = build(r);
        const ob = buildOpeningBalance(su, r.nwc0, { net_ppe: r.ppe });
        expect(Math.abs(ob.row.check)).toBeLessThan(1e-9);
        expect(ob.ppe_seeded_at_zero).toBe(r.ppe === null);
        // a PP&E shift moves ONLY goodwill, dollar-for-dollar (plug semantics §8)
        const shifted = buildOpeningBalance(su, r.nwc0, { net_ppe: (r.ppe ?? 0) + 25 });
        expect(shifted.row.goodwill).toBeCloseTo(ob.row.goodwill - 25, 8);
        expect(Math.abs(shifted.row.check)).toBeLessThan(1e-9);
      }),
    );
  });

  it('§16 single-driver round trip: multiple → EV → multiple is the identity; sizing by amount bypasses EBITDA', () => {
    fc.assert(
      fc.property(money(5, 500), fc.double({ min: 4, max: 14, noNaN: true }), (ebitda, multiple) => {
        const byMultiple = deriveEntry(
          { fy_ebitda: ebitda },
          {
            entry: { driver: 'multiple', entry_multiple: multiple, enterprise_value: null, basis: 'fy', hold_years: 5 },
            operations: { growth: [0, 0, 0, 0, 0] } as OperationsAssumption,
          },
        );
        const byEv = deriveEntry(
          { fy_ebitda: ebitda },
          {
            entry: { driver: 'ev', entry_multiple: null, enterprise_value: byMultiple.enterprise_value, basis: 'fy', hold_years: 5 },
            operations: { growth: [0, 0, 0, 0, 0] } as OperationsAssumption,
          },
        );
        expect(byEv.entry_multiple).toBeCloseTo(multiple, 9);
        expect(trancheSize({ amount: 123.4 }, ebitda)).toBe(123.4);
        expect(trancheSize({ x_ebitda: 2 }, ebitda)).toBe(2 * ebitda);
      }),
    );
  });

  it('[v1.0.3] entry-NTM basis (C2 review F2): valuation EBITDA = fy × (1 + growth[0]); sizing stays FY under NTM', () => {
    const facts = { fy_ebitda: 100 };
    const ops = { growth: [0.08, 0.05, 0.05, 0.05, 0.05] } as OperationsAssumption;
    const ntm = deriveEntry(facts, {
      entry: { driver: 'multiple', entry_multiple: 9, enterprise_value: null, basis: 'ntm', hold_years: 5 },
      operations: ops,
    });
    // §9 [v1.0.3] symmetry: growth[0], NOT growth[N−1]
    expect(ntm.entry_ebitda_for_valuation).toBeCloseTo(108, 12);
    expect(ntm.enterprise_value).toBeCloseTo(9 * 108, 12);
    // §11: sizing ALWAYS uses FY even when the valuation basis is NTM
    expect(ntm.entry_ebitda_for_sizing).toBe(100);
    // EV-driver round-trip under NTM: implied multiple divides by the NTM EBITDA
    const byEv = deriveEntry(facts, {
      entry: { driver: 'ev', entry_multiple: null, enterprise_value: 972, basis: 'ntm', hold_years: 5 },
      operations: ops,
    });
    expect(byEv.entry_multiple).toBeCloseTo(9, 12);
    expect(byEv.entry_ebitda_for_sizing).toBe(100);
  });

  it('v1 input gates (C2 review F1/F4): drawn_at_close ≠ 0 and negative revolver commitment are rejected', () => {
    const rcf = (drawn: number, commitment = 10): TrancheAssumption => ({
      name: 'RCF', type: 'revolver', commitment: { amount: commitment }, pricing: { kind: 'fixed', rate: 0.07 },
      commitment_fee: 0.005, maturity_years: 6, drawn_at_close: drawn,
    });
    // §2 has no drawn-revolver source line — proceeds would vanish into the goodwill plug
    expect(() => sizeStructure({ tranches: [rcf(5)], min_cash: 0, sweep: { base_pct: 0, grid: null } , distributions: null, refinancing: null }, 100)).toThrow(/drawn_at_close/);
    expect(() => sizeStructure({ tranches: [rcf(0, -3)], min_cash: 0, sweep: { base_pct: 0, grid: null } , distributions: null, refinancing: null }, 100)).toThrow(/commitment/);
    // drawn_at_close = 0 stays valid
    expect(() => sizeStructure({ tranches: [rcf(0)], min_cash: 0, sweep: { base_pct: 0, grid: null } , distributions: null, refinancing: null }, 100)).not.toThrow();
  });

  it('v1 input gate (C5 review): duplicate tranche names are rejected — they key the write-off schedules and retirement reporting', () => {
    const term = (name: string): TrancheAssumption => ({
      name, type: 'senior', size: { amount: 50 }, pricing: { kind: 'fixed', rate: 0.08 },
      amort_pct_of_face: 0, maturity_years: 8, oid_pct: 0.01, sweep: { participates: true, priority: 1 },
    });
    expect(() =>
      sizeStructure({ tranches: [term('TL'), term('TL')], min_cash: 0, sweep: { base_pct: 0, grid: null } , distributions: null, refinancing: null }, 100),
    ).toThrow(/duplicate tranche name/);
    expect(() =>
      sizeStructure({ tranches: [term('TLA'), term('TLB')], min_cash: 0, sweep: { base_pct: 0, grid: null } , distributions: null, refinancing: null }, 100),
    ).not.toThrow();
  });

  it('guards: two revolvers, non-positive EBITDA, and missing driver values all throw', () => {
    const rcf = (name: string): TrancheAssumption => ({
      name, type: 'revolver', commitment: { amount: 10 }, pricing: { kind: 'fixed', rate: 0.07 },
      commitment_fee: 0.005, maturity_years: 5, drawn_at_close: 0,
    });
    expect(() => sizeStructure({ tranches: [rcf('A'), rcf('B')], min_cash: 0, sweep: { base_pct: 0, grid: null } , distributions: null, refinancing: null }, 100)).toThrow(RangeError);
    expect(() =>
      deriveEntry({ fy_ebitda: 0 }, {
        entry: { driver: 'multiple', entry_multiple: 8, enterprise_value: null, basis: 'fy', hold_years: 5 },
        operations: { growth: [0] } as unknown as OperationsAssumption,
      }),
    ).toThrow(RangeError);
    expect(() =>
      deriveEntry({ fy_ebitda: 100 }, {
        entry: { driver: 'multiple', entry_multiple: null, enterprise_value: null, basis: 'fy', hold_years: 5 },
        operations: { growth: [0] } as unknown as OperationsAssumption,
      }),
    ).toThrow(RangeError);
  });
});
