/**
 * SPEC §26 / invariant §14.26 — the exported workbook is a LIVE formula model that agrees
 * with the ONE engine. Each deal is exported WITHOUT cached results (so nothing can pass by
 * echoing the engine's numbers back), recalculated by an independent spreadsheet engine
 * (LibreOffice, headless), and every parity-mapped cell must equal the engine's ModelOutput
 * value. CI installs LibreOffice; locally the suite is skipped only when it is absent, and it
 * says so loudly — it is never silently green.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it, beforeAll } from 'vitest';
import { runModel } from '../lib/engine2/facade';
import { buildFormulaWorkbook, formulaCoverageBlockers, type ParityCell } from '../lib/engine2/workbook';
import type { DealAssumptions, DealFacts } from '../lib/engine2/types';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';
import { G12_ASSUMPTIONS, G12_FACTS } from './fixtures/g12-prof';
import { EA_ASSUMPTIONS, EA_FACTS } from './fixtures/ea-oos';
import { cleaningCases } from './fixtures/cleaning-deals';

function findSoffice(): string | null {
  for (const p of ['/opt/homebrew/bin/soffice', '/usr/bin/soffice', '/usr/local/bin/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice']) {
    if (existsSync(p)) return p;
  }
  try {
    return execFileSync('which', ['soffice']).toString().trim() || null;
  } catch {
    return null;
  }
}

const VALUATION = { risk_free: 0.04, mrp: 0.06, asset_beta: 0.9, debt_beta: 0, long_run_growth: 0.025, leverage_timing: 'end_of_year' as const };

const CASES: Record<string, { facts: DealFacts; assumptions: DealAssumptions }> = {
  G1: GOLDEN_DEALS.G1,
  G2: GOLDEN_DEALS.G2,
  G3: GOLDEN_DEALS.G3,
  G4: GOLDEN_DEALS.G4,
  G5: GOLDEN_DEALS.G5,
  G12PROF: { facts: G12_FACTS, assumptions: G12_ASSUMPTIONS },
  // §28 [v2.6.0] terminal year stated: the out-of-sample EA case (lines by year, capex reset to D&A)
  EA_OOS: { facts: EA_FACTS, assumptions: EA_ASSUMPTIONS },
  // …and on a full driver-built LBO (revenue-driven lines, fees, floating debt, revolver)
  G2_VAL_TERMINAL: { facts: GOLDEN_DEALS.G2.facts, assumptions: { ...GOLDEN_DEALS.G2.assumptions, valuation: { ...VALUATION, terminal: { capex_pct_of_da: 1.1, delta_nwc_before_growth: 3 } } } },
  // the valuation layer on a full LBO (fees, OID, floating debt, revolver, min cash)
  G2_VAL: { facts: GOLDEN_DEALS.G2.facts, assumptions: { ...GOLDEN_DEALS.G2.assumptions, valuation: VALUATION } },
  // PIK + MIP + start-of-year leverage
  G3_VAL_SOY: { facts: GOLDEN_DEALS.G3.facts, assumptions: { ...GOLDEN_DEALS.G3.assumptions, valuation: { ...VALUATION, leverage_timing: 'start_of_year', debt_beta: 0.2 } } },
  // NTM on both ends + EV-driven entry + rollover (rollover is pari passu)
  G2_NTM_EV_ROLL: {
    facts: GOLDEN_DEALS.G2.facts,
    assumptions: {
      ...GOLDEN_DEALS.G2.assumptions,
      entry: { ...GOLDEN_DEALS.G2.assumptions.entry, driver: 'ev', entry_multiple: null, enterprise_value: 1050, basis: 'ntm' },
      exit: { ...GOLDEN_DEALS.G2.assumptions.exit, basis: 'ntm' },
      rollover_equity: 40,
    },
  },
  // structure features together: monitoring fee, distributions + a binding RP trap, a
  // leverage-based sweep grid, covenants incl. a springing test, a MIP with a ratchet tier,
  // a warrant beside it, and rollover equity
  FEATURES: {
    facts: GOLDEN_DEALS.G2.facts,
    assumptions: {
      ...GOLDEN_DEALS.G2.assumptions,
      rollover_equity: 30,
      fees: { ...GOLDEN_DEALS.G2.assumptions.fees, monitoring: { annual: 3, termination_years: 3, discount_rate: 0.08 } },
      structure: {
        ...GOLDEN_DEALS.G2.assumptions.structure,
        distributions: [15, 15, 25, 25, 25],
        sweep: { base_pct: 0.75, grid: { tiers: [{ above_net_leverage: 2.0, pct: 0.5 }, { above_net_leverage: 3.5, pct: 0.75 }], else_pct: 0.25 } },
      },
      covenants: { leverage_max: [5, 4.5, 4, 3.5, 3.5], dscr_min: 1.2, fccr_min: 1.0, springing: { metric: 'leverage', max: 5, revolver_draw_trigger_pct: 0.3 }, rp_trap: { metric: 'net_leverage', level: 3.2 } },
      mip: { pool_pct: 0.1, hurdle_moic: 1.3, ratchet: [{ hurdle_moic: 1.8, share_pct: 0.2 }] },
      warrant: { holder_label: 'Mezz lender', pct_of_ordinary: 0.04, strike_total: 10 },
    },
  },
  // §18 refinancing (the adjudicated golden): re-termed par for par, call premium, new OID/fees,
  // the old fees written off and deducted in the refinancing year (§18.5 [v2.4.0])
  G6REFI: GOLDEN_DEALS.G6REFI,
  // §7.1/§18.5 [v2.4.0] the tax CHARACTER of retired debt where it bites: a refinanced Senior that
  // carries OLD OID under a BINDING §163(j) (G3) — old OID + call premium join the capped pool in
  // the refinancing year, the old fees deduct uncapped — and the exit OID on the PIK note
  REFI_OID_BINDING: {
    facts: GOLDEN_DEALS.G3.facts,
    assumptions: {
      ...GOLDEN_DEALS.G3.assumptions,
      structure: {
        ...GOLDEN_DEALS.G3.assumptions.structure,
        tranches: GOLDEN_DEALS.G3.assumptions.structure.tranches.map((t) => (t.name === 'Senior' ? { ...t, oid_pct: 0.02 } : t)) as typeof GOLDEN_DEALS.G3.assumptions.structure.tranches,
        refinancing: [{ tranche_name: 'Senior', year: 3, new_pricing: { kind: 'floating', base_rate: 0.036, spread: 0.035, floor: 0.0075 }, call_premium_pct: 0.02, new_maturity_years: 6, new_oid_pct: 0.01, new_financing_fee_pct: 0.01, new_amort_pct_of_face: 0.05 }],
      },
    },
  },
  // §7.1 a sweep-driven early retirement of a tranche with OID: the unamortized OID deducts the
  // NEXT year in the capped pool, its fees in the uncapped pool
  EARLY_RETIRE_OID: {
    facts: GOLDEN_DEALS.G2.facts,
    assumptions: {
      ...GOLDEN_DEALS.G2.assumptions,
      structure: {
        ...GOLDEN_DEALS.G2.assumptions.structure,
        sweep: { base_pct: 1, grid: null },
        tranches: [
          { name: 'Stub TL', type: 'senior', size: { amount: 6 }, pricing: { kind: 'floating', base_rate: 0.036, spread: 0.05, floor: 0 }, amort_pct_of_face: 0, maturity_years: 6, oid_pct: 0.05, sweep: { participates: true, priority: 0 } },
          ...GOLDEN_DEALS.G2.assumptions.structure.tranches,
        ] as typeof GOLDEN_DEALS.G2.assumptions.structure.tranches,
      },
    },
  },
  // §20 PIK toggle: a whole-coupon cash/PIK election each year
  PIK_TOGGLE: {
    facts: GOLDEN_DEALS.G3.facts,
    assumptions: {
      ...GOLDEN_DEALS.G3.assumptions,
      structure: {
        ...GOLDEN_DEALS.G3.assumptions.structure,
        tranches: GOLDEN_DEALS.G3.assumptions.structure.tranches.map((t) => (t.type === 'pik_note' ? { ...t, cash_coupon: 0.08, pik_coupon: 0.12, elections: ['pik', 'pik', 'cash', 'cash', 'pik'] as ('cash' | 'pik')[] } : t)),
      },
    },
  },
  // tax coverage: early LOSSES banked into the post-close pool and used later (80% limit),
  // acquired NOLs that arose pre-2018 (100% cap) under a §382 limit, back-loaded margin
  TAX_NOL: {
    facts: { ...GOLDEN_DEALS.G1.facts, fy_revenue: 200, fy_ebitda: 24, fy_ebitda_margin: 0.12, net_ppe: 40 },
    assumptions: {
      ...GOLDEN_DEALS.G1.assumptions,
      entry: { ...GOLDEN_DEALS.G1.assumptions.entry, entry_multiple: 10 },
      exit: { ...GOLDEN_DEALS.G1.assumptions.exit, multiple: 10 },
      operations: { ...GOLDEN_DEALS.G1.assumptions.operations, growth: [0.2, 0.2, 0.15, 0.15, 0.1], target_margin: 0.24, margin_path: 'back_loaded', da_pct_revenue: 0.05, maint_capex_pct_revenue: 0.04 },
      structure: {
        ...GOLDEN_DEALS.G1.assumptions.structure, min_cash: 5, sweep: { base_pct: 0.5, grid: null },
        tranches: [{ name: 'Senior', type: 'senior', size: { amount: 200 }, pricing: { kind: 'fixed', rate: 0.14 }, amort_pct_of_face: 0, maturity_years: 7, oid_pct: 0.02, sweep: { participates: true, priority: 1 } }],
      },
      tax: { rate: 0.25, interest_deductible: true, s163j: { applies: false, ati_basis: 'ebitda', ati_pct: 0.3 }, nol: { acquired_opening: 30, acquired_usable: true, arose_pre_2018: true, s382_annual_limit: 4 }, minimum_rate: 0 },
    },
  },
  // tax coverage: a BINDING interest cap on EBIT-based ATI with a carryforward, a minimum tax,
  // and post-2018 acquired NOLs without a §382 limit
  TAX_CAP: {
    facts: { ...GOLDEN_DEALS.G1.facts, fy_revenue: 300, fy_ebitda: 45, fy_ebitda_margin: 0.15, net_ppe: 60 },
    assumptions: {
      ...GOLDEN_DEALS.G1.assumptions,
      operations: { ...GOLDEN_DEALS.G1.assumptions.operations, growth: [0.06, 0.06, 0.05, 0.05, 0.04], target_margin: 0.17, da_pct_revenue: 0.06, maint_capex_pct_revenue: 0.05 },
      structure: {
        ...GOLDEN_DEALS.G1.assumptions.structure, min_cash: 6, sweep: { base_pct: 1, grid: null },
        tranches: [
          { name: 'TLB', type: 'senior', size: { x_ebitda: 4 }, pricing: { kind: 'floating', base_rate: 0.045, spread: 0.0425, floor: 0.005 }, amort_pct_of_face: 0.01, maturity_years: 7, oid_pct: 0.01, sweep: { participates: true, priority: 1 } },
          { name: 'PIK', type: 'pik_note', size: { x_ebitda: 1 }, cash_coupon: 0.02, pik_coupon: 0.1, amort_pct_of_face: 0, maturity_years: 8, oid_pct: 0.01, sweep: { participates: false, priority: 2 }, elections: null },
        ],
      },
      tax: { rate: 0.25, interest_deductible: true, s163j: { applies: true, ati_basis: 'ebit', ati_pct: 0.3 }, nol: { acquired_opening: 15, acquired_usable: true, arose_pre_2018: false, s382_annual_limit: null }, minimum_rate: 0.15 },
    },
  },
  // tax coverage: pre-2018 acquired NOLs with NO §382 limit — the 100% cap (not 80%) binds
  TAX_PRE18: {
    facts: { ...GOLDEN_DEALS.G1.facts, fy_revenue: 300, fy_ebitda: 45, fy_ebitda_margin: 0.15, net_ppe: 60 },
    assumptions: {
      ...GOLDEN_DEALS.G1.assumptions,
      operations: { ...GOLDEN_DEALS.G1.assumptions.operations, growth: [0.05, 0.05, 0.05, 0.05, 0.05], target_margin: 0.15, da_pct_revenue: 0.04, maint_capex_pct_revenue: 0.04 },
      structure: { ...GOLDEN_DEALS.G1.assumptions.structure, min_cash: 5, sweep: { base_pct: 0.5, grid: null },
        tranches: [{ name: 'TL', type: 'senior', size: { x_ebitda: 3 }, pricing: { kind: 'fixed', rate: 0.08 }, amort_pct_of_face: 0.05, maturity_years: 7, oid_pct: 0, sweep: { participates: true, priority: 1 } }] },
      tax: { rate: 0.21, interest_deductible: true, s163j: { applies: false, ati_basis: 'ebitda', ati_pct: 0.3 }, nol: { acquired_opening: 500, acquired_usable: true, arose_pre_2018: true, s382_annual_limit: null }, minimum_rate: 0 },
    },
  },
  // §22 sweet-equity strip (the adjudicated golden): loan notes accrued to exit and redeemed in
  // full, an exercised warrant, one sweet ratchet tier reached
  G9SWEET: GOLDEN_DEALS.G9SWEET,
  // strip + interim distributions: the distributions first redeem the (small) loan notes, then
  // reach the ordinaries at the base share; three ratchet tiers, the walk stops inside the third
  SWEET_DIST: {
    facts: GOLDEN_DEALS.G3.facts,
    assumptions: {
      ...GOLDEN_DEALS.G3DIST.assumptions,
      mip: null,
      sweet_equity: {
        sponsor_ordinary_pct: 0.9, loan_note_rate: 0.1, management_subscription: 5, management_ordinary_pct: 0.1,
        ratchet: [{ hurdle_moic: 1.3, share_pct: 0.15 }, { hurdle_moic: 1.6, share_pct: 0.25 }, { hurdle_moic: 2.5, share_pct: 0.3 }],
      },
    },
  },
  // strip underwater: exit equity does not cover the accreted loan notes — the ordinary pot is
  // zero, management's sweet equity is worthless, the warrant stays out of the money
  SWEET_UNDER: {
    facts: GOLDEN_DEALS.G9SWEET.facts,
    assumptions: { ...GOLDEN_DEALS.G9SWEET.assumptions, exit: { ...GOLDEN_DEALS.G9SWEET.assumptions.exit, multiple: 6 } },
  },
  // strip wiped out: the exit does not cover the debt — limited liability floors equity at zero,
  // the lenders take the shortfall, no loan note is redeemed and the institution realizes nothing
  SWEET_WIPEOUT: {
    facts: GOLDEN_DEALS.G9SWEET.facts,
    assumptions: { ...GOLDEN_DEALS.G9SWEET.assumptions, exit: { ...GOLDEN_DEALS.G9SWEET.assumptions.exit, multiple: 1.5 } },
  },
  // strip home run: the institution clears EVERY ratchet threshold, so the walk finishes at the
  // top tier's share with pot still to allocate
  SWEET_TOP: {
    facts: GOLDEN_DEALS.G9SWEET.facts,
    assumptions: { ...GOLDEN_DEALS.G9SWEET.assumptions, exit: { ...GOLDEN_DEALS.G9SWEET.assumptions.exit, multiple: 11 } },
  },
  // §19 fund overlay (the adjudicated golden): european, fees on invested, 8% pref, full catch-up
  G7FUND: GOLDEN_DEALS.G7FUND,
  // american (deal-by-deal) waterfall on COMMITTED capital, a partial 50% catch-up, and the
  // monitoring-fee offset against the management fee (FEATURES carries a monitoring fee)
  FUND_AMER: {
    facts: GOLDEN_DEALS.G2.facts,
    assumptions: {
      ...GOLDEN_DEALS.G2.assumptions,
      rollover_equity: 30,
      fees: { ...GOLDEN_DEALS.G2.assumptions.fees, monitoring: { annual: 3, termination_years: 3, discount_rate: 0.08 } },
      structure: { ...GOLDEN_DEALS.G2.assumptions.structure, distributions: [15, 15, 25, 25, 25] },
      fund: { committed_capital: 600, mgmt_fee_pct: 0.015, fee_basis: 'committed', carry_pct: 0.2, pref_rate: 0.08, catchup_pct: 0.5, waterfall: 'american', fee_offset_pct: 0.8 },
    },
  },
  // the fund holding a sweet-equity strip: it is credited only with the INSTITUTION'S receipts;
  // catch-up share = carry (the unbounded catch-up branch); hard 6% pref
  FUND_STRIP: {
    facts: GOLDEN_DEALS.G3.facts,
    assumptions: {
      ...GOLDEN_DEALS.G3DIST.assumptions,
      mip: null,
      sweet_equity: { sponsor_ordinary_pct: 0.9, loan_note_rate: 0.1, management_subscription: 5, management_ordinary_pct: 0.1, ratchet: [{ hurdle_moic: 1.3, share_pct: 0.15 }] },
      fund: { committed_capital: null, mgmt_fee_pct: 0.02, fee_basis: 'invested', carry_pct: 0.2, pref_rate: 0.06, catchup_pct: 0.2, waterfall: 'european', fee_offset_pct: 1 },
    },
  },
  // a hard hurdle (no catch-up) with a 10% pref that the deal clears
  FUND_HARD: {
    facts: GOLDEN_DEALS.G2.facts,
    assumptions: {
      ...GOLDEN_DEALS.G2DIST.assumptions,
      fund: { committed_capital: null, mgmt_fee_pct: 0.02, fee_basis: 'invested', carry_pct: 0.2, pref_rate: 0.10, catchup_pct: 0, waterfall: 'european', fee_offset_pct: 1 },
    },
  },
  // the fund on a loss-making deal: the exit does not cover the debt, so the sponsor receives
  // nothing at exit (limited liability) and the LP gets back nothing beyond the interim flows
  FUND_LOSS: {
    facts: GOLDEN_DEALS.G9SWEET.facts,
    assumptions: {
      ...GOLDEN_DEALS.G9SWEET.assumptions,
      exit: { ...GOLDEN_DEALS.G9SWEET.assumptions.exit, multiple: 1.5 },
      fund: { committed_capital: null, mgmt_fee_pct: 0.02, fee_basis: 'invested', carry_pct: 0.2, pref_rate: 0.08, catchup_pct: 1, waterfall: 'european', fee_offset_pct: 1 },
    },
  },
  // §3.8 surplus-cash policy: 75% of the surplus every year under a binding trap (year 1
  // blocked, year 2 clipped); and 100% gated until the senior retires mid-hold
  G13SURPLUS: GOLDEN_DEALS.G13SURPLUS,
  G13SURPLUSGATED: GOLDEN_DEALS.G13SURPLUSGATED,
  // the reference leverage table: all-equity (every year's cash goes out) and $300m (repaid in
  // year 5, the rest paid out), with the flow-to-equity valuation on
  G12_ALLEQUITY: { facts: G12_FACTS, assumptions: { ...G12_ASSUMPTIONS, structure: { ...G12_ASSUMPTIONS.structure, tranches: [], surplus_distribution: { payout_pct: 1, start: 'immediately' } } } },
  G12_300: {
    facts: G12_FACTS,
    assumptions: {
      ...G12_ASSUMPTIONS,
      structure: { ...G12_ASSUMPTIONS.structure, tranches: G12_ASSUMPTIONS.structure.tranches.map((t) => ({ ...t, size: { amount: 300 } })) as typeof G12_ASSUMPTIONS.structure.tranches, surplus_distribution: { payout_pct: 1, start: 'after_debt_repaid' } },
    },
  },
  // §23 partial exits: the adjudicated golden (G2-DIST + a year-3 sale of 25% at 8.5×)
  G11SELL: GOLDEN_DEALS.G11SELL,
  // a sale beside a promote (taken AFTER it), a warrant and a monitoring fee — and the fund
  SELL_MIP_WARRANT_FUND: {
    facts: GOLDEN_DEALS.G2DIST.facts,
    assumptions: {
      ...GOLDEN_DEALS.G2DIST.assumptions,
      mip: { pool_pct: 0.15, hurdle_moic: 1.5, ratchet: [{ hurdle_moic: 2.0, share_pct: 0.25 }] },
      warrant: { holder_label: 'Mezz', pct_of_ordinary: 0.05, strike_total: 5 },
      fees: { ...GOLDEN_DEALS.G2DIST.assumptions.fees, monitoring: { annual: 2, termination_years: 3, discount_rate: 0.08 } },
      structure: { ...GOLDEN_DEALS.G2DIST.assumptions.structure, selldown: { year: 2, fraction: 0.3, event_multiple: 9.5 } },
      fund: { committed_capital: null, mgmt_fee_pct: 0.02, fee_basis: 'invested', carry_pct: 0.2, pref_rate: 0.08, catchup_pct: 1, waterfall: 'european', fee_offset_pct: 1 },
    },
  },
  // a sale large enough that the proceeds alone repay the cheque — payback reached in year 3
  SELL_PAYBACK: { facts: GOLDEN_DEALS.G2DIST.facts, assumptions: { ...GOLDEN_DEALS.G2DIST.assumptions, structure: { ...GOLDEN_DEALS.G2DIST.assumptions.structure, selldown: { year: 3, fraction: 0.9, event_multiple: 8.5 } } } },
  // an underwater sale (negative implied equity): the stake fetches zero, the warning shows
  SELL_UNDERWATER: { facts: GOLDEN_DEALS.G2DIST.facts, assumptions: { ...GOLDEN_DEALS.G2DIST.assumptions, structure: { ...GOLDEN_DEALS.G2DIST.assumptions.structure, selldown: { year: 2, fraction: 0.25, event_multiple: 2.0 } } } },
  // a sale with no distribution policy at all (the only interim sponsor flow is the sale)
  SELL_NODIST: { facts: GOLDEN_DEALS.G2.facts, assumptions: { ...GOLDEN_DEALS.G2.assumptions, structure: { ...GOLDEN_DEALS.G2.assumptions.structure, selldown: { year: 4, fraction: 0.4, event_multiple: 10 } } } },
  // everything at once: two senior tranches + a mezz + a PIK note under a toggle, a revolver
  // that DRAWS, an NTM exit, a leverage-grid sweep, distributions under the trap, covenants,
  // and the flow-to-equity valuation (start-of-year leverage)
  COMBO: {
    facts: GOLDEN_DEALS.G5.facts,
    assumptions: {
      ...GOLDEN_DEALS.G5.assumptions,
      exit: { ...GOLDEN_DEALS.G5.assumptions.exit, basis: 'ntm' },
      operations: { ...GOLDEN_DEALS.G5.assumptions.operations, margin_path: 'front_loaded', target_margin: 0.23, growth_capex: [14, 0, 0, 0, 0] },
      structure: {
        ...GOLDEN_DEALS.G5.assumptions.structure,
        sweep: { base_pct: 0.5, grid: { tiers: [{ above_net_leverage: 3.0, pct: 0.75 }], else_pct: 0.25 } },
        distributions: [0, 0, 2, 3, 3],
        tranches: [
          { name: 'A', type: 'senior', size: { x_ebitda: 1.5 }, pricing: { kind: 'fixed', rate: 0.07 }, amort_pct_of_face: 0.05, maturity_years: 7, oid_pct: 0.01, sweep: { participates: true, priority: 1 } },
          { name: 'B', type: 'senior', size: { x_ebitda: 1.0 }, pricing: { kind: 'floating', base_rate: 0.04, spread: 0.035, floor: 0.045 }, amort_pct_of_face: 0, maturity_years: 7, oid_pct: 0, sweep: { participates: true, priority: 1 } },
          { name: 'Mezz', type: 'mezzanine', size: { amount: 8 }, pricing: { kind: 'fixed', rate: 0.11 }, amort_pct_of_face: 0, maturity_years: 8, oid_pct: 0.02, sweep: { participates: true, priority: 2 } },
          { name: 'PIK', type: 'pik_note', size: { amount: 6 }, cash_coupon: 0.06, pik_coupon: 0.1, amort_pct_of_face: 0, maturity_years: 8, oid_pct: 0.01, sweep: { participates: false, priority: 3 }, elections: ['pik', 'pik', 'cash', 'pik', 'cash'] },
          { name: 'RCF', type: 'revolver', commitment: { amount: 10 }, pricing: { kind: 'fixed', rate: 0.06 }, commitment_fee: 0.005, maturity_years: 6, drawn_at_close: 0 },
        ],
      },
      covenants: { ...GOLDEN_DEALS.G5.assumptions.covenants, leverage_max: [6, 5.5, 5, 4.5, 4], rp_trap: { metric: 'net_leverage', level: 3.5 } },
      valuation: { ...VALUATION, leverage_timing: 'start_of_year', debt_beta: 0.15 },
    },
  },
  // two tranches sharing a sweep priority (pro rata) + a junior at priority 2, front-loaded margin
  G5_TIERS: {
    facts: GOLDEN_DEALS.G5.facts,
    assumptions: {
      ...GOLDEN_DEALS.G5.assumptions,
      operations: { ...GOLDEN_DEALS.G5.assumptions.operations, margin_path: 'front_loaded', target_margin: 0.23 },
      structure: {
        ...GOLDEN_DEALS.G5.assumptions.structure,
        sweep: { base_pct: 0.8, grid: null },
        tranches: [
          { name: 'A', type: 'senior', size: { x_ebitda: 1.5 }, pricing: { kind: 'fixed', rate: 0.07 }, amort_pct_of_face: 0.05, maturity_years: 7, oid_pct: 0.01, sweep: { participates: true, priority: 1 } },
          { name: 'B', type: 'senior', size: { x_ebitda: 1.0 }, pricing: { kind: 'floating', base_rate: 0.04, spread: 0.035, floor: 0.045 }, amort_pct_of_face: 0, maturity_years: 7, oid_pct: 0, sweep: { participates: true, priority: 1 } },
          { name: 'Mezz', type: 'mezzanine', size: { amount: 8 }, pricing: { kind: 'fixed', rate: 0.11 }, amort_pct_of_face: 0, maturity_years: 8, oid_pct: 0.02, sweep: { participates: true, priority: 2 } },
          { name: 'RCF', type: 'revolver', commitment: { amount: 10 }, pricing: { kind: 'fixed', rate: 0.06 }, commitment_fee: 0.005, maturity_years: 6, drawn_at_close: 0 },
        ],
      },
    },
  },
};

// Deals that came through the Clean step: the Normalisation sheet, and the Inputs cells that
// reference it (rebuild/CLEANING_AND_SUITE_PLAN.md §7).
Object.assign(CASES, cleaningCases());

const soffice = findSoffice();
const describeIfLo = soffice ? describe : describe.skip;
if (!soffice) {
  // eslint-disable-next-line no-console
  console.warn('[workbook parity] LibreOffice (soffice) not found — the §14.26 parity suite is SKIPPED locally. CI installs it and runs it.');
  if (process.env.CI) throw new Error('LibreOffice is required in CI for the workbook parity suite (§14.26)');
}

/** Recalculated cell values read straight from the sheet XML. (ExcelJS's reader drops a cached
 *  formula result of 0 — a falsy-value bug — so it cannot be trusted to read a recalculation.) */
type Recalc = (sheet: string, addr: string) => number | string | boolean | null;
function readRecalculated(path: string): Recalc {
  const zip = unzipSync(readFileSync(path));
  const text = (name: string) => strFromU8(zip[name]);
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
  const rels = text('xl/_rels/workbook.xml.rels');
  const sheets = new Map<string, Map<string, number | string | boolean | null>>();
  for (const m of text('xl/workbook.xml').matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`Target="([^"]+)"[^>]*Id="${m[2]}"`).exec(rels)![1];
    const xml = text(`xl/${target.replace(/^\/?xl\//, '')}`);
    const cells = new Map<string, number | string | boolean | null>();
    for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const t = /t="([^"]+)"/.exec(c[2])?.[1] ?? 'n';
      const vRaw = c[3] ? /<v>([\s\S]*?)<\/v>/.exec(c[3])?.[1] ?? null : null;
      if (vRaw === null) { cells.set(c[1], null); continue; }
      cells.set(c[1], t === 's' ? shared[Number(vRaw)] : t === 'b' ? vRaw === '1' : t === 'str' || t === 'e' || t === 'inlineStr' ? vRaw : Number(vRaw));
    }
    sheets.set(m[1], cells);
  }
  return (sheet, addr) => sheets.get(sheet)?.get(addr) ?? null;
}

describeIfLo('§26 formula workbook — LibreOffice recalculation equals the engine, cell by cell', () => {
  const recalculated = new Map<string, Recalc>();
  const parityMaps = new Map<string, ParityCell[]>();

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-parity-'));
    const out = join(dir, 'out');
    const files: string[] = [];
    for (const [name, { facts, assumptions }] of Object.entries(CASES)) {
      const o = runModel(facts, assumptions);
      expect(formulaCoverageBlockers(o), `${name} must be fully formula-covered`).toEqual([]);
      const { wb, parity } = buildFormulaWorkbook(o, { cachedResults: false });
      parityMaps.set(name, parity);
      const path = join(dir, `${name}.xlsx`);
      writeFileSync(path, Buffer.from(await wb.xlsx.writeBuffer()));
      files.push(path);
    }
    execFileSync(soffice!, [`-env:UserInstallation=file://${join(dir, 'profile')}`, '--headless', '--calc', '--convert-to', 'xlsx', '--outdir', out, ...files], { stdio: 'pipe', timeout: 180_000 });
    for (const file of readdirSync(out)) recalculated.set(file.replace(/\.xlsx$/, ''), readRecalculated(join(out, file)));
  }, 240_000);

  for (const name of Object.keys(CASES)) {
    it(`${name}: every mapped cell recalculates to the engine's value`, () => {
      const cell = recalculated.get(name)!;
      expect(cell, `${name} was recalculated`).toBeDefined();
      const parity = parityMaps.get(name)!;
      expect(parity.length).toBeGreaterThan(50);
      const failures: string[] = [];
      for (const p of parity) {
        const got = cell(p.sheet, p.addr);
        if (p.expected === null) {
          if (typeof got === 'number') failures.push(`${p.sheet}!${p.addr} ${p.label}: engine N/A but the cell is ${got}`);
          continue;
        }
        if (typeof got !== 'number' || !Number.isFinite(got)) {
          failures.push(`${p.sheet}!${p.addr} ${p.label}: expected ${p.expected}, got ${JSON.stringify(got)}`);
          continue;
        }
        const tol = 1e-6 * Math.max(1, Math.abs(p.expected));
        if (Math.abs(got - p.expected) > tol) failures.push(`${p.sheet}!${p.addr} ${p.label}: expected ${p.expected}, got ${got}`);
      }
      expect(failures.slice(0, 25), `${failures.length} mismatches`).toEqual([]);
    });
  }

  it('the Checks sheet totals zero on every deal', () => {
    for (const name of Object.keys(CASES)) {
      const totalCell = parityMaps.get(name)!.find((p) => p.sheet === 'Checks' && p.label.startsWith('Total'))!;
      expect(recalculated.get(name)!('Checks', totalCell.addr), `${name} checks total`).toBe(0);
    }
  });
});

describeIfLo('Normalisation sheet — the model is DRIVEN by the bridge, not pasted beside it', () => {
  const deal = CASES.CLEAN_ADJUSTED;
  const base = runModel(deal.facts, deal.assumptions);
  const sizingCol = 'F'; // FY2021 → D, FY2022 → E, FY2023 (the sizing year) → F
  let cell: Recalc;
  let parity: ParityCell[];

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-norm-'));
    const built = buildFormulaWorkbook(base, { cachedResults: false });
    parity = built.parity;
    // an analyst adds 10.0 to the restructuring add-back IN EXCEL
    const ws = built.wb.getWorksheet('Normalisation')!;
    let hit = 0;
    ws.eachRow((r, n) => {
      if (String(r.getCell(2).value ?? '').includes('Restructuring charges') && n > 0 && hit === 0) {
        const c = ws.getCell(`${sizingCol}${n}`);
        expect(c.value).toBe(20);
        c.value = 30;
        hit = n;
      }
    });
    expect(hit).toBeGreaterThan(0);
    const path = join(dir, 'edited.xlsx');
    writeFileSync(path, Buffer.from(await built.wb.xlsx.writeBuffer()));
    execFileSync(soffice!, [`-env:UserInstallation=file://${join(dir, 'profile')}`, '--headless', '--calc', '--convert-to', 'xlsx', '--outdir', join(dir, 'out'), path], { stdio: 'pipe', timeout: 180_000 });
    cell = readRecalculated(join(dir, 'out', 'edited.xlsx'));
  }, 240_000);

  it('the fixture is what it claims: 190.0 + 62.5 + 20 + 12 − 5 = 279.5 on revenue of 1,200.0', () => {
    expect(deal.facts.fy_ebitda).toBe(279.5);
    expect(deal.facts.fy_revenue).toBe(1200);
    expect(deal.facts.net_debt).toBe(383); // 335 + 35 + 60 + 25 − (80 − 8)
    const n = deal.facts.normalisation!;
    expect(n.ebitda.find((b) => b.period === '2022-12-31')!.adjusted).toBeNull(); // SBC not entered for FY2022
  });

  it('adding 10.0 to an add-back in Excel moves price, leverage and IRR exactly as the engine does', () => {
    const moved = runModel(
      { ...deal.facts, fy_ebitda: 289.5, fy_ebitda_margin: 289.5 / 1200 },
      deal.assumptions,
    );
    const at = (label: string) => parity.find((p) => p.sheet === 'Summary' && p.label.startsWith(label))!.addr;
    expect(cell('Summary', at('Purchase price'))).toBeCloseTo(moved.derived.enterprise_value, 6);
    expect(cell('Summary', at('Sponsor IRR'))).toBeCloseTo(moved.returns.sponsor_net.irr!, 8);
    expect(cell('Summary', at('Sponsor equity'))).toBeCloseTo(moved.sources_uses.sponsor_equity, 6);
    // and it is a real move, not the base case echoed back
    expect(Math.abs(moved.returns.sponsor_net.irr! - base.returns.sponsor_net.irr!)).toBeGreaterThan(1e-5);
    expect(moved.derived.enterprise_value - base.derived.enterprise_value).toBeCloseTo(90, 9); // 9.0x × 10.0
  });

  it('a period with an amount not entered reads "n/a" — a blank is never summed as zero', () => {
    const adj = parity.find((p) => p.sheet === 'Normalisation' && p.label.startsWith('Adjusted ebitda') && p.expected === null)!;
    expect(adj).toBeDefined();
    expect(cell('Normalisation', adj.addr)).toBe('n/a');
  });

  it('the Checks sheet still totals zero after the edit (the link is intact)', () => {
    const total = parity.find((p) => p.sheet === 'Checks' && p.label.startsWith('Total'))!;
    expect(cell('Checks', total.addr)).toBe(0);
  });
});

describe('Normalisation sheet — structure', () => {
  it('CLEAN_CONTINUES carries two EBITDA bases: priced on 282.0, forecast margin 270 ÷ 1,250, and the Inputs sheet links both', () => {
    const o = runModel(CASES.CLEAN_CONTINUES.facts, CASES.CLEAN_CONTINUES.assumptions);
    expect(o.facts.fy_ebitda).toBe(282);
    expect(o.facts.fy_ebitda_margin).toBeCloseTo(0.216, 12);
    expect(o.facts.normalisation!.forecast_ebitda).toBe(270);
    const { parity } = buildFormulaWorkbook(o, { cachedResults: true });
    expect(parity.some((p) => p.sheet === 'Inputs' && p.label.includes('forecast margin') && p.expected === 270)).toBe(true);
    expect(parity.some((p) => p.sheet === 'Normalisation' && p.label.startsWith('EBITDA base for the forecast margin'))).toBe(true);
  });
  it('a deal that did not come through the Clean step has no Normalisation sheet and plain inputs', () => {
    const o = runModel(CASES.G2.facts, CASES.G2.assumptions);
    const { wb } = buildFormulaWorkbook(o, { cachedResults: true });
    expect(wb.getWorksheet('Normalisation')).toBeUndefined();
  });
  it('the sheet sits between Inputs and Model; "as reported" is stated on it and in the methodology', () => {
    const o = runModel(CASES.CLEAN_AS_REPORTED.facts, CASES.CLEAN_AS_REPORTED.assumptions);
    const { wb } = buildFormulaWorkbook(o, { cachedResults: true });
    expect(wb.worksheets.map((w) => w.name).slice(0, 4)).toEqual(['Summary', 'Inputs', 'Normalisation', 'Model']);
    expect(o.facts.fy_ebitda).toBe(250); // the ignored row really is ignored
    const text = (name: string) => { const out: string[] = []; wb.getWorksheet(name)!.eachRow((r) => r.eachCell((c) => out.push(String(c.value)))); return out.join('\n'); };
    expect(text('Normalisation')).toContain('AS REPORTED');
    expect(text('Methodology')).toContain('modelled on the figures as reported');
  });
  it('the sizing EBITDA on Inputs is a formula on the Normalisation sheet, not a typed number', () => {
    const o = runModel(CASES.CLEAN_LTM.facts, CASES.CLEAN_LTM.assumptions);
    expect(o.facts.fy_ebitda).toBe(285); // LTM 270.0 + 15.0
    const { wb } = buildFormulaWorkbook(o, { cachedResults: true });
    let formula = '';
    wb.getWorksheet('Inputs')!.eachRow((r) => { if (String(r.getCell(2).value ?? '').startsWith('LTM EBITDA')) formula = (r.getCell(4).value as { formula: string }).formula; });
    expect(formula).toMatch(/^'Normalisation'!\$[A-Z]+\$\d+$/);
  });
});

describe('§26 coverage rule — every engine feature exports as live formulas', () => {
  it('no golden deal is blocked from export', () => {
    for (const [name, d] of Object.entries(GOLDEN_DEALS)) {
      expect(formulaCoverageBlockers(runModel(d.facts, d.assumptions)), name).toEqual([]);
    }
  });
});

describe('the parity deals genuinely exercise the paths they claim to cover (else a green run proves nothing)', () => {
  it('TAX_NOL banks losses, then uses post-close NOLs; acquired NOLs hit the §382 limit', () => {
    const o = runModel(CASES.TAX_NOL.facts, CASES.TAX_NOL.assumptions);
    expect(o.tax.some((y) => y.nol_banked > 0)).toBe(true);
    expect(o.tax.some((y) => y.postclose_nol_used > 0)).toBe(true);
    expect(o.tax.some((y) => Math.abs(y.acquired_nol_used - 4) < 1e-12)).toBe(true);
  });
  it('TAX_CAP binds the interest cap (carryforward > 0), accrues PIK, and the minimum tax binds in some year', () => {
    const o = runModel(CASES.TAX_CAP.facts, CASES.TAX_CAP.assumptions);
    expect(o.tax.some((y) => y.s163j_carryforward_end > 0)).toBe(true);
    expect(o.tranches[1].some((r) => r.pik_accrual > 0)).toBe(true);
    expect(o.tax.some((y) => y.minimum_tax > y.regular_tax && y.minimum_tax > 0)).toBe(true);
    expect(o.tax.some((y) => y.acquired_nol_used > 0)).toBe(true);
  });
  it('TAX_PRE18 uses acquired NOLs at the 100% cap (all taxable income sheltered, the pool never exhausted)', () => {
    const o = runModel(CASES.TAX_PRE18.facts, CASES.TAX_PRE18.assumptions);
    for (const y of o.tax) if (y.taxable_before_nol > 0) expect(y.acquired_nol_used).toBeCloseTo(y.taxable_before_nol, 9);
    expect(o.tax.some((y) => y.taxable_before_nol > 0)).toBe(true);
  });
  it('FEATURES exercises every switch: fee, distributions paid AND trap-blocked, more than one sweep %, promote above the ratchet, an exercised warrant', () => {
    const o = runModel(CASES.FEATURES.facts, CASES.FEATURES.assumptions);
    expect(o.operating.slice(0, -1).every((y) => y.ebitda - y.ebitda_adj === 3)).toBe(true);
    expect(o.exit.monitoring_termination).toBeGreaterThan(0);
    expect(o.waterfall.some((w) => w.distribution_paid > 0)).toBe(true);
    expect(o.waterfall.some((w) => w.distribution_blocked)).toBe(true);
    expect(new Set(o.waterfall.map((w) => w.sweep_pct_applied)).size).toBeGreaterThan(1);
    const proceeds = o.exit.exit_equity_pre_mip_total + o.waterfall.reduce((x, w) => x + w.distribution_paid, 0);
    expect(proceeds).toBeGreaterThan(1.8 * (o.sources_uses.sponsor_equity + o.sources_uses.rollover_equity)); // the ratchet tier is reached
    expect(o.exit.warrant_payout_net).toBeGreaterThan(0);
    expect(o.credit.some((c) => c.leverage_headroom !== null)).toBe(true);
  });
  it('G6REFI really refinances: a cash cost, a write-off, and the new rate from the refinancing year', () => {
    const o = runModel(CASES.G6REFI.facts, CASES.G6REFI.assumptions);
    expect(o.tranches.some((rows) => rows.some((r) => r.refinanced && r.refinancing_cash_cost > 0 && r.unamortized_writeoff > 0))).toBe(true);
  });
  it('REFI_OID_BINDING refinances a tranche carrying old OID while §163(j) binds every year', () => {
    const o = runModel(CASES.REFI_OID_BINDING.facts, CASES.REFI_OID_BINDING.assumptions);
    const sr = o.tranches[0][2];
    expect(sr.refinanced).toBe(true);
    expect(o.tax.every((t) => t.s163j_carryforward_end > 0)).toBe(true);
    const lines = (y: number) => o.waterfall[y].cash_interest_total + o.tranches.reduce((x, tr) => x + tr[y].pik_accrual, 0) + o.operating[y].oid_amortization;
    // the year-3 capped pool carries the call premium AND the old OID (not the premium alone)
    expect(o.tax[2].capped_interest_pool - lines(2)).toBeGreaterThan(0.02 * sr.beginning_balance + 0.01);
  });
  it('EARLY_RETIRE_OID retires the stub before the exit year, with OID left to deduct', () => {
    const o = runModel(CASES.EARLY_RETIRE_OID.facts, CASES.EARLY_RETIRE_OID.assumptions);
    const t = o.tranches[0].findIndex((r) => r.beginning_balance > 1e-9 && r.ending_balance <= 1e-9);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(o.tax.length - 2);
    const lines = (y: number) => o.waterfall[y].cash_interest_total + o.tranches.reduce((x, tr) => x + tr[y].pik_accrual, 0) + o.operating[y].oid_amortization;
    expect(o.tax[t + 1].capped_interest_pool - lines(t + 1)).toBeGreaterThan(0.01);
  });
  it('PIK_TOGGLE pays cash in the cash years and accrues in the PIK years', () => {
    const o = runModel(CASES.PIK_TOGGLE.facts, CASES.PIK_TOGGLE.assumptions);
    const rows = o.tranches[1];
    expect(rows[0].cash_interest).toBe(0); expect(rows[0].pik_accrual).toBeGreaterThan(0);
    expect(rows[2].cash_interest).toBeGreaterThan(0); expect(rows[2].pik_accrual).toBe(0);
  });
  it('G9SWEET redeems the loan notes in full, exercises the warrant and reaches a sweet ratchet tier', () => {
    const s = runModel(CASES.G9SWEET.facts, CASES.G9SWEET.assumptions).equity_strip!;
    expect(s.loan_notes_redeemed).toBeCloseTo(s.loan_notes_accrued_balance, 9);
    expect(s.warrant_exercised).toBe(true);
    expect(s.ratchet_tiers_reached).toBeGreaterThanOrEqual(1);
  });
  it('SWEET_DIST: distributions retire the loan notes, then reach the ordinaries; the walk ends inside a later tier', () => {
    const o = runModel(CASES.SWEET_DIST.facts, CASES.SWEET_DIST.assumptions);
    const s = o.equity_strip!;
    expect(s.loan_notes_accrued_balance).toBe(0); // fully redeemed by interim distributions
    const paid = o.waterfall.reduce((x, w) => x + w.distribution_paid, 0);
    expect(paid).toBeGreaterThan(s.loan_notes_subscribed * 1.1); // so ordinaries received interim cash
    expect(s.ratchet_tiers_reached).toBe(2);
    expect(s.management_effective_ordinary_pct!).toBeGreaterThan(0.1);
  });
  it('SWEET_UNDER: exit equity falls short of the accreted loan notes — pot zero, effective share N/A', () => {
    const s = runModel(CASES.SWEET_UNDER.facts, CASES.SWEET_UNDER.assumptions).equity_strip!;
    expect(s.loan_notes_redeemed).toBeLessThan(s.loan_notes_accrued_balance - 1);
    expect(s.ordinary_pot).toBe(0);
    expect(s.management_effective_ordinary_pct).toBeNull();
    expect(s.warrant_exercised).toBe(false);
  });
  it('SWEET_WIPEOUT: the exit does not cover the debt — equity floored at zero, lenders take the shortfall, nothing redeemed', () => {
    const o = runModel(CASES.SWEET_WIPEOUT.facts, CASES.SWEET_WIPEOUT.assumptions);
    expect(o.exit.exit_equity_pre_mip_total).toBe(0);
    expect(o.exit.debt_shortfall_at_exit).toBeGreaterThan(1);
    expect(o.equity_strip!.loan_notes_redeemed).toBe(0);
    expect(o.equity_strip!.ordinary_pot).toBe(0);
    expect(o.exit.sponsor_share).toBe(0);
    expect(o.coherence.map((f) => f.code)).toContain('exit_debt_shortfall');
  });
  it('fund deals reach carry; FUND_AMER offsets monitoring fees on committed capital; FUND_STRIP credits only the institution', () => {
    for (const k of ['G7FUND', 'FUND_AMER', 'FUND_STRIP', 'FUND_HARD'] as const) {
      const o = runModel(CASES[k].facts, CASES[k].assumptions);
      expect(o.fund!.gp_carry.reduce((x, y) => x + y, 0), `${k} carry`).toBeGreaterThan(0);
    }
    const amer = runModel(CASES.FUND_AMER.facts, CASES.FUND_AMER.assumptions);
    expect(amer.fund!.mgmt_fees_net[0]).toBeLessThan(0.015 * 600 - 1e-9); // the offset bites
    expect(amer.fund!.committed_capital).toBe(600);
    const strip = runModel(CASES.FUND_STRIP.facts, CASES.FUND_STRIP.assumptions);
    const paid = strip.waterfall.map((w) => w.distribution_paid);
    expect(strip.fund!.lp_distributions[0] + strip.fund!.gp_carry[0]).toBeLessThanOrEqual(paid[0] + 1e-9);
    expect(strip.returns.sponsor_net.cashflows.slice(1).reduce((x, y) => x + y, 0)).toBeCloseTo(
      strip.fund!.lp_distributions.reduce((x, y) => x + y, 0) + strip.fund!.gp_carry.reduce((x, y) => x + y, 0), 6);
  });
  it('FUND_LOSS: the sponsor receives nothing at exit — no flow after close is ever negative', () => {
    const o = runModel(CASES.FUND_LOSS.facts, CASES.FUND_LOSS.assumptions);
    expect(o.exit.debt_shortfall_at_exit).toBeGreaterThan(1);
    expect(o.returns.sponsor_net.cashflows[o.assumptions.entry.hold_years]).toBe(0);
    expect(o.returns.sponsor_net.cashflows.slice(1).every((c) => c >= 0)).toBe(true);
    expect(o.fund!.lp_distributions.every((d) => d >= 0)).toBe(true);
  });
  it('surplus deals: G13SURPLUS is trap-blocked then clipped; the gated deal pays nothing until the senior retires', () => {
    const a = runModel(CASES.G13SURPLUS.facts, CASES.G13SURPLUS.assumptions).waterfall;
    expect(a[0].distribution_blocked && a[0].distribution_paid === 0).toBe(true);
    expect(a[1].distribution_blocked && a[1].distribution_paid > 0).toBe(true);
    const g = runModel(CASES.G13SURPLUSGATED.facts, CASES.G13SURPLUSGATED.assumptions);
    const firstPaid = g.waterfall.findIndex((w) => w.distribution_paid > 0);
    expect(firstPaid).toBeGreaterThan(0);
    expect(g.tranches[0][firstPaid].ending_balance).toBeLessThanOrEqual(0.005);
    expect(g.tranches[0][firstPaid - 1].ending_balance).toBeGreaterThan(0.005);
  });
  it('selldown deals take the paths they claim: promote + warrant live, payback reached, an underwater sale, a sale with no distributions', () => {
    const mw = runModel(CASES.SELL_MIP_WARRANT_FUND.facts, CASES.SELL_MIP_WARRANT_FUND.assumptions);
    expect(mw.exit.mip_payout).toBeGreaterThan(0);
    expect(mw.exit.warrant_payout_net).toBeGreaterThan(0);
    expect(mw.fund!.gp_carry.some((x) => x > 0)).toBe(true);
    expect(runModel(CASES.SELL_PAYBACK.facts, CASES.SELL_PAYBACK.assumptions).returns.payback_year).toBe(3);
    const uw = runModel(CASES.SELL_UNDERWATER.facts, CASES.SELL_UNDERWATER.assumptions);
    expect(uw.selldown!.implied_event_equity).toBeLessThan(0);
    expect(uw.selldown!.selldown_proceeds).toBe(0); // a stake fetches zero, never a payment by the seller
    expect(uw.returns.dpi[1]).toBeGreaterThanOrEqual(uw.returns.dpi[0]);
    expect(uw.coherence.map((f) => f.code)).toContain('selldown_below_cost');
    const nd = runModel(CASES.SELL_NODIST.facts, CASES.SELL_NODIST.assumptions);
    expect(nd.waterfall.every((w) => w.distribution_paid === 0)).toBe(true);
    expect(nd.returns.dpi[3]).toBeGreaterThan(0);
  });
  it('COMBO really combines: a revolver draw, PIK accrual and cash-pay years, an NTM exit, valuation on', () => {
    const o = runModel(CASES.COMBO.facts, CASES.COMBO.assumptions);
    expect(o.waterfall.some((w) => w.revolver_draw > 0)).toBe(true);
    expect(o.tranches[3].some((r) => r.pik_accrual > 0)).toBe(true);
    expect(o.tranches[3].some((r) => r.cash_interest > 0)).toBe(true);
    expect(o.exit.exit_ebitda_basis_value).toBeGreaterThan(o.operating[4].ebitda_adj);
    expect(o.valuation).not.toBeNull();
  });
  it('SWEET_TOP clears every sweet ratchet tier (the walk ends at the top share)', () => {
    const a = CASES.SWEET_TOP.assumptions;
    expect(runModel(CASES.SWEET_TOP.facts, a).equity_strip!.ratchet_tiers_reached).toBe(a.sweet_equity!.ratchet!.length);
  });
  it('G5_TIERS splits a sweep pro rata inside priority 1 and reaches priority 2; the revolver draws', () => {
    const o = runModel(CASES.G5_TIERS.facts, CASES.G5_TIERS.assumptions);
    expect(o.tranches[0].some((r, t) => r.sweep_repayment > 0 && o.tranches[1][t].sweep_repayment > 0)).toBe(true);
    expect(o.tranches[2].some((r) => r.sweep_repayment > 0)).toBe(true);
  });
});

describe('§26 workbook layout — the sheets an analyst opens', () => {
  const o = runModel(GOLDEN_DEALS.G2DIST.facts, GOLDEN_DEALS.G2DIST.assumptions);
  const { wb } = buildFormulaWorkbook(o, { cachedResults: true });
  it('sheet order: Summary first, then Inputs, Model, Sensitivity, Checks, Methodology', () => {
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Inputs', 'Model', 'Sensitivity', 'Checks', 'Methodology']);
  });
  it('the Methodology sheet carries every §15 disclosure the app shows (one shared list)', async () => {
    const { DISCLOSURES } = await import('../lib/engine2/disclosures');
    const ws = wb.getWorksheet('Methodology')!;
    const names = new Set<string>();
    ws.eachRow((r) => names.add(String(r.getCell(2).value)));
    for (const [what] of DISCLOSURES) expect(names.has(what), what).toBe(true);
  });
  it('key inputs carry named ranges, every numeric row a unit, every tab a colour', () => {
    const model = wb.definedNames.model as unknown as { name: string; ranges: string[] }[];
    const named = new Set(model.map((d) => d.name));
    for (const n of ['Exit_Multiple', 'Entry_Multiple', 'Tax_Rate', 'Minimum_Cash', 'Hold_Years']) expect(named.has(n), n).toBe(true);
    const inputs = wb.getWorksheet('Inputs')!;
    let rateRow = 0;
    inputs.eachRow((r, i) => { if (String(r.getCell(2).value) === 'Tax rate') rateRow = i; });
    expect(inputs.getCell(`C${rateRow}`).value).toBe('%');
    for (const ws of wb.worksheets) expect(ws.properties.tabColor, ws.name).toBeDefined();
  });
  it('every IRR cell is seeded and guarded (deep losses converge; no rate ⇒ "N/A", never an error)', () => {
    const model = wb.getWorksheet('Model')!;
    let irrCells = 0;
    model.eachRow((r) => r.eachCell((c) => {
      const v = c.value as { formula?: string } | null;
      if (v && typeof v === 'object' && v.formula && /IRR\(/.test(v.formula)) {
        irrCells += 1;
        expect(v.formula.startsWith('IFERROR(IRR(')).toBe(true);
      }
    }));
    expect(irrCells).toBeGreaterThanOrEqual(3);
  });
});

describe('§26 Summary integrity rows — the workbook flags a deal the engine flags (adversarial review F1)', () => {
  it('the Summary carries live rows for a cash-floor breach and an uncovered exit, linked to the model', () => {
    const o = runModel(GOLDEN_DEALS.G2.facts, GOLDEN_DEALS.G2.assumptions);
    const { wb } = buildFormulaWorkbook(o, { cachedResults: true });
    const ws = wb.getWorksheet('Summary')!;
    const found: Record<string, string> = {};
    ws.eachRow((r) => {
      const label = String(r.getCell(2).value ?? '');
      const v = r.getCell(4).value as { formula?: string } | null;
      if (/Cash below the minimum/.test(label)) found.cash = v?.formula ?? '';
      if (/Debt the exit does not cover/.test(label)) found.short = v?.formula ?? '';
    });
    expect(found.cash).toMatch(/^'Checks'!\$D\$\d+$/);
    expect(found.short).toMatch(/^'Model'!\$D\$\d+$/);
  });
});
