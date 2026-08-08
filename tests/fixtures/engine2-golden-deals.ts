/**
 * SPEC §17 golden deal definitions as engine2 typed inputs — the EXACT facts/assumptions
 * the goldens were derived from (scripts/goldens/spec_calc.py GOLDENS). Shared by every
 * engine2 module gate from C5 on; kernel/module fixture tests keep their own §17
 * constants deliberately (transcription is part of what they test).
 */
import type { DealAssumptions, DealFacts, TrancheAssumption } from '../../lib/engine2/types';

const floating = (spread: number, floor = 0) =>
  ({ kind: 'floating', base_rate: 0.036, spread, floor }) as const;

function makeFacts(p: { revenue: number; ebitda: number; net_ppe: number }): DealFacts {
  return {
    entity_name: 'Golden', source: 'manual', sector: 'test', currency: 'USD',
    fiscal_year: 2025, period_end: '2025-12-31',
    fy_revenue: p.revenue, fy_ebitda: p.ebitda, fy_ebitda_margin: p.ebitda / p.revenue,
    da_pct_revenue: 0, maint_capex_pct_revenue: 0, net_ppe: p.net_ppe,
    operating_nwc: null, nwc_pct_revenue: null, dso: null, dio: null, dpo: null,
    gross_debt: 0, cash: 0, net_debt: 0, effective_tax_rate: 0.25,
    nol_carryforward_floor: null, implied_cost_of_debt: null, implied_trading_ev_ebitda: null,
    history: [],
  };
}

export const GOLDEN_BASE_TAX: DealAssumptions['tax'] = {
  rate: 0.25, interest_deductible: true,
  s163j: { applies: true, ati_basis: 'ebitda', ati_pct: 0.3 },
  nol: { acquired_opening: 0, acquired_usable: false, arose_pre_2018: false, s382_annual_limit: null },
  minimum_rate: 0,
};

function makeAssumptions(p: {
  multiple: number; tranches: TrancheAssumption[]; min_cash: number; sweep_pct: number;
  growth: number[]; target_margin: number; da_pct: number; maint_pct: number;
  growth_capex: number[]; nwc: DealAssumptions['operations']['nwc'];
  tax?: DealAssumptions['tax']; exit_multiple: number;
  mip?: DealAssumptions['mip'];
  distributions?: number[] | null;
  rp_trap?: DealAssumptions['covenants']['rp_trap'];
  refinancing?: DealAssumptions['structure']['refinancing'];
}): DealAssumptions {
  return {
    deal_name: 'golden',
    entry: { driver: 'multiple', entry_multiple: p.multiple, enterprise_value: null, basis: 'fy', hold_years: 5 },
    structure: { tranches: p.tranches, min_cash: p.min_cash, sweep: { base_pct: p.sweep_pct, grid: null }, distributions: p.distributions ?? null, refinancing: p.refinancing ?? null },
    operations: {
      growth: p.growth, target_margin: p.target_margin, margin_path: 'linear',
      da_pct_revenue: p.da_pct, maint_capex_pct_revenue: p.maint_pct,
      growth_capex: p.growth_capex, nwc: p.nwc,
    },
    tax: p.tax ?? GOLDEN_BASE_TAX,
    fees: { transaction_pct_of_ev: 0.02, financing_pct_of_commitments: 0.015, monitoring: null },
    rollover_equity: 0,
    exit: { multiple: p.exit_multiple, basis: 'fy', fees_pct: 0.015 },
    mip: p.mip ?? null,
    covenants: { leverage_max: null, dscr_min: null, fccr_min: null, springing: null, rp_trap: p.rp_trap ?? null },
    mid_year_irr: false,
    fund: null,
  };
}

export const GOLDEN_DEALS: Record<string, { facts: DealFacts; assumptions: DealAssumptions }> = {
  G1: {
    facts: makeFacts({ revenue: 100, ebitda: 25, net_ppe: 20 }),
    assumptions: makeAssumptions({
      multiple: 8, exit_multiple: 8, tranches: [], min_cash: 5, sweep_pct: 0,
      growth: [0, 0, 0, 0, 0], target_margin: 0.25, da_pct: 0.03, maint_pct: 0.03,
      growth_capex: [0, 0, 0, 0, 0], nwc: { method: 'pct', pct_revenue: 0.1 },
    }),
  },
  G2: {
    facts: makeFacts({ revenue: 500, ebitda: 110, net_ppe: 100 }),
    assumptions: makeAssumptions({
      multiple: 9, exit_multiple: 9, min_cash: 10, sweep_pct: 0.75,
      tranches: [
        { name: 'TLB', type: 'senior', size: { x_ebitda: 4 }, pricing: floating(0.0375), amort_pct_of_face: 0.01, maturity_years: 7, oid_pct: 0, sweep: { participates: true, priority: 1 } },
        { name: 'Revolver', type: 'revolver', commitment: { x_ebitda: 0.5 }, pricing: floating(0.035), commitment_fee: 0.005, maturity_years: 5, drawn_at_close: 0 },
      ],
      growth: [0.06, 0.05, 0.04, 0.04, 0.03], target_margin: 0.22, da_pct: 0.035, maint_pct: 0.03,
      growth_capex: [0, 0, 0, 0, 0], nwc: { method: 'pct', pct_revenue: 0.08 },
    }),
  },
  G3: {
    facts: makeFacts({ revenue: 300, ebitda: 90, net_ppe: 70 }),
    assumptions: makeAssumptions({
      multiple: 8.5, exit_multiple: 8.5, min_cash: 8, sweep_pct: 0.5,
      tranches: [
        { name: 'Senior', type: 'senior', size: { x_ebitda: 3 }, pricing: floating(0.045, 0.0075), amort_pct_of_face: 0.05, maturity_years: 7, oid_pct: 0, sweep: { participates: true, priority: 1 } },
        { name: 'PIK Note', type: 'pik_note', size: { x_ebitda: 1.5 }, cash_coupon: 0, pik_coupon: 0.12, amort_pct_of_face: 0, maturity_years: 8, oid_pct: 0.02, sweep: { participates: false, priority: 2 } },
      ],
      growth: [0.05, 0.04, 0.04, 0.03, 0.03], target_margin: 0.3, da_pct: 0.04, maint_pct: 0.035,
      growth_capex: [0, 0, 0, 0, 0], nwc: { method: 'days', dso: 45, dio: 30, dpo: 40 },
      mip: { pool_pct: 0.15, hurdle_moic: 1.5 },
    }),
  },
  G4: {
    facts: makeFacts({ revenue: 200, ebitda: 12, net_ppe: 60 }),
    assumptions: makeAssumptions({
      multiple: 7, exit_multiple: 7, min_cash: 3, sweep_pct: 0.5,
      tranches: [
        { name: 'Unitranche', type: 'unitranche', size: { x_ebitda: 3.5 }, pricing: floating(0.05, 0.0075), amort_pct_of_face: 0.01, maturity_years: 7, oid_pct: 0.025, sweep: { participates: true, priority: 1 } },
      ],
      growth: [0.02, 0.03, 0.04, 0.05, 0.05], target_margin: 0.16, da_pct: 0.07, maint_pct: 0.04,
      growth_capex: [0, 0, 0, 0, 0], nwc: { method: 'pct', pct_revenue: 0.09 },
      tax: {
        rate: 0.25, interest_deductible: true,
        s163j: { applies: true, ati_basis: 'ebitda', ati_pct: 0.3 },
        nol: { acquired_opening: 40, acquired_usable: true, arose_pre_2018: false, s382_annual_limit: 3 },
        minimum_rate: 0.15,
      },
    }),
  },
  G5: {
    facts: makeFacts({ revenue: 80, ebitda: 16, net_ppe: 15 }),
    assumptions: makeAssumptions({
      multiple: 7, exit_multiple: 7, min_cash: 4, sweep_pct: 0.5,
      tranches: [
        { name: 'Senior', type: 'senior', size: { x_ebitda: 3 }, pricing: floating(0.0425), amort_pct_of_face: 0.1, maturity_years: 6, oid_pct: 0, sweep: { participates: true, priority: 1 } },
        { name: 'Revolver', type: 'revolver', commitment: { amount: 20 }, pricing: floating(0.04), commitment_fee: 0.005, maturity_years: 5, drawn_at_close: 0 },
      ],
      growth: [0.1, 0.08, 0.06, 0.05, 0.04], target_margin: 0.2, da_pct: 0.04, maint_pct: 0.035,
      growth_capex: [6, 0, 0, 0, 0], nwc: { method: 'pct', pct_revenue: 0.12 },
    }),
  },
};

// ── SPEC §17 [v1.1.1] Phase G-1 distribution variants ────────────────────────
// Each holds its base golden constant and adds exactly two fields, so every difference
// from the base is attributable to §3 step 7 / §3.7 alone.
const G2_DIST_REQUESTS = [25, 25, 25, 10, 8];
const G2_DIST_TRAP = { metric: 'net_leverage' as const, level: 2.75 };

GOLDEN_DEALS.G2DIST = {
  facts: GOLDEN_DEALS.G2.facts,
  assumptions: {
    ...GOLDEN_DEALS.G2.assumptions,
    structure: { ...GOLDEN_DEALS.G2.assumptions.structure, distributions: G2_DIST_REQUESTS },
    covenants: { ...GOLDEN_DEALS.G2.assumptions.covenants, rp_trap: G2_DIST_TRAP },
  },
};
GOLDEN_DEALS.G3DIST = {
  facts: GOLDEN_DEALS.G3.facts,
  assumptions: {
    ...GOLDEN_DEALS.G3.assumptions,
    structure: { ...GOLDEN_DEALS.G3.assumptions.structure, distributions: [20, 15, 25, 22, 20] },
    covenants: { ...GOLDEN_DEALS.G3.assumptions.covenants, rp_trap: null },
  },
};
// §13: the request schedule and trap are structure/policy — FROZEN across scenarios. Only
// the operating case moves, and with it whether the trap BINDS.
GOLDEN_DEALS.G7FUND = {
  facts: GOLDEN_DEALS.G2.facts,
  assumptions: {
    ...GOLDEN_DEALS.G2DIST.assumptions,
    deal_name: 'G7-FUND',
    // §19.9: the adjudicated overlay — european, 2% on invested, 8% pref, 20% carry,
    // full catch-up; offset inert on this golden (G2-DIST carries no monitoring fees).
    fund: {
      committed_capital: null, mgmt_fee_pct: 0.02, fee_basis: 'invested',
      carry_pct: 0.20, pref_rate: 0.08, catchup_pct: 1.0,
      waterfall: 'european', fee_offset_pct: 1.0,
    },
  },
};

// §20.9 [v1.5.0]: G8-PIKT = G3 + the per-year election. Facts, entry structure, financing and
// operating case are IDENTICAL to G3; the ONLY changed fields are the note's two election rates
// and the schedule — so every difference from G3 is attributable to §20 alone.
GOLDEN_DEALS.G8PIKT = {
  facts: GOLDEN_DEALS.G3.facts,
  assumptions: {
    ...GOLDEN_DEALS.G3.assumptions,
    deal_name: 'G8-PIKT',
    structure: {
      ...GOLDEN_DEALS.G3.assumptions.structure,
      tranches: GOLDEN_DEALS.G3.assumptions.structure.tranches.map((t) =>
        t.type === 'pik_note'
          ? { ...t, cash_coupon: 0.09, pik_coupon: 0.12, elections: ['pik', 'pik', 'cash', 'cash', 'pik'] as ('cash' | 'pik')[] }
          : t,
      ),
    },
  },
};

GOLDEN_DEALS.G2DISTD = {
  facts: GOLDEN_DEALS.G2.facts,
  assumptions: {
    ...GOLDEN_DEALS.G2DIST.assumptions,
    operations: {
      ...GOLDEN_DEALS.G2DIST.assumptions.operations,
      growth: GOLDEN_DEALS.G2.assumptions.operations.growth.map((g) => g - 0.02),
    },
    exit: { ...GOLDEN_DEALS.G2DIST.assumptions.exit, multiple: 8.5 },
  },
};

// ── SPEC §17/§18 [v1.3.0] Phase G-5 refinancing golden ───────────────────────
// G6-REFI holds G2 constant and adds exactly one refinancing event on the TLB at year 3, so
// every difference from G2 is attributable to §18 alone (the DIST-variant discipline).
GOLDEN_DEALS.G6REFI = {
  facts: GOLDEN_DEALS.G2.facts,
  assumptions: {
    ...GOLDEN_DEALS.G2.assumptions,
    structure: {
      ...GOLDEN_DEALS.G2.assumptions.structure,
      refinancing: [
        {
          tranche_name: 'TLB',
          year: 3,
          new_pricing: { kind: 'floating', base_rate: 0.036, spread: 0.0275, floor: 0 },
          call_premium_pct: 0.01,
          new_maturity_years: 6,
          new_oid_pct: 0.005,
          new_financing_fee_pct: 0.01,
          new_amort_pct_of_face: 0.01,
        },
      ],
    },
  },
};

/** G2-D committed downside scenario (§13/§17): growth −200bps each year, exit 8.5x; ENTRY FROZEN. */
export function g2DownsideAssumptions(): DealAssumptions {
  const base = GOLDEN_DEALS.G2.assumptions;
  return {
    ...base,
    operations: { ...base.operations, growth: base.operations.growth.map((g) => g - 0.02) },
    exit: { ...base.exit, multiple: 8.5 },
  };
}
