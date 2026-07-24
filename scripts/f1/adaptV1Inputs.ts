/**
 * PHASE F §F1.1 — input adapter: SPEC-v1.0 (engine2) golden inputs → old-engine ModelState.
 *
 * READ-ONLY with respect to lib/engine: this file only CONSTRUCTS old ModelState values and
 * calls the old engine's own factory — the frozen tree is never patched. The comparison set
 * is the golden regimes (tests/fixtures/engine2-golden-deals.ts), all of which are
 * expressible in the old schema; old-engine features with no v2 counterpart (add-ons,
 * partial exits, PIK elections, refis, monitoring fees, fund economics, distributions)
 * are simply never exercised — they are listed as exclusions in the report header.
 */

import { createDefaultModelState } from '../../lib/engine/modelState';
import type { DebtTranche, ModelState } from '../../lib/dealEngineTypes';
import type { DealAssumptions, DealFacts, TrancheAssumption } from '../../lib/engine2/types';

function toOldTranche(t: TrancheAssumption, fyEbitda: number, sweepBasePct: number): DebtTranche {
  const base: DebtTranche = {
    name: t.name,
    tranche_type: 'senior',
    principal: 0,
    interest_rate: 0,
    rate_type: 'floating',
    base_rate: 0,
    spread: 0,
    amortization_type: 'bullet',
    amortization_schedule: [],
    pik_rate: 0,
    cash_interest: true,
    commitment_fee: 0,
    floor: 0,
    cash_sweep_pct: 0,
  } as DebtTranche;

  if (t.type === 'revolver') {
    const commitment = 'x_ebitda' in t.commitment && t.commitment.x_ebitda !== undefined
      ? t.commitment.x_ebitda * fyEbitda
      : (t.commitment as { amount: number }).amount;
    return {
      ...base,
      tranche_type: 'revolver',
      principal: t.drawn_at_close, // v1 gate: 0 at close
      commitment,
      commitment_fee: t.commitment_fee,
      base_rate: t.pricing.kind === 'floating' ? t.pricing.base_rate : 0,
      spread: t.pricing.kind === 'floating' ? t.pricing.spread : 0,
      floor: t.pricing.kind === 'floating' ? t.pricing.floor : 0,
      rate_type: 'floating',
    };
  }

  if (t.type === 'pik_note') {
    const face = t.size.x_ebitda !== undefined ? t.size.x_ebitda * fyEbitda : (t.size as { amount?: number }).amount ?? 0;
    return {
      ...base,
      tranche_type: 'pik_note',
      principal: face,
      amortization_type: 'PIK',
      pik_rate: t.pik_coupon,
      cash_interest: false,
      oid_pct: t.oid_pct,
    } as DebtTranche;
  }

  // cash-pay term debt (senior / unitranche / mezzanine)
  const face = t.size.x_ebitda !== undefined ? t.size.x_ebitda * fyEbitda : (t.size as { amount?: number }).amount ?? 0;
  const amortPerYear = t.amort_pct_of_face * face; // old schedule = ABSOLUTE amounts per year
  const participates = t.sweep.participates;
  return {
    ...base,
    tranche_type: t.type === 'unitranche' ? 'unitranche' : 'senior',
    principal: face,
    rate_type: t.pricing.kind === 'floating' ? 'floating' : 'fixed',
    base_rate: t.pricing.kind === 'floating' ? t.pricing.base_rate : 0,
    spread: t.pricing.kind === 'floating' ? t.pricing.spread : 0,
    floor: t.pricing.kind === 'floating' ? t.pricing.floor : 0,
    interest_rate: t.pricing.kind === 'fixed' ? t.pricing.rate : 0,
    // old engine: sweep eligibility is the 'cash_sweep' amortization_type; mandatory amort
    // still reads amortization_schedule, so a 1%-amort + sweep TLB is expressible.
    amortization_type: participates ? 'cash_sweep' : (amortPerYear > 0 ? 'straight_line' : 'bullet'),
    amortization_schedule: Array.from({ length: 5 }, () => amortPerYear),
    cash_sweep_pct: participates ? sweepBasePct : 0,
    sweep_priority: t.sweep.priority,
    oid_pct: t.oid_pct,
  } as DebtTranche;
}

/** Build a complete old ModelState for a golden regime. Everything not expressible stays at
 *  the old factory's neutral value with the noisy features zeroed (no monitoring fee, no
 *  sweet equity, no distributions, covenants wide open). */
export function adaptToOldModelState(facts: DealFacts, a: DealAssumptions): ModelState {
  const s = createDefaultModelState();
  s.deal_name = a.deal_name;
  s.currency = 'USD';
  s.sector = 'test';

  s.revenue.base_revenue = facts.fy_revenue;
  s.revenue.growth_rates = [...a.operations.growth];
  s.revenue.organic_growth = [...a.operations.growth];
  s.revenue.acquisition_revenue = [0, 0, 0, 0, 0];
  s.revenue.churn_rate = 0;
  s.revenue_segments = [];
  s.add_on_acquisitions = [];

  s.margins.base_ebitda_margin = facts.fy_ebitda_margin;
  s.margins.target_ebitda_margin = a.operations.target_margin;
  s.margins.margin_trajectory = 'linear';
  s.margins.margin_by_year = [];
  s.margins.da_pct_revenue = a.operations.da_pct_revenue;
  s.margins.capex_pct_revenue = a.operations.maint_capex_pct_revenue;
  s.margins.growth_capex = [...a.operations.growth_capex];
  if (a.operations.nwc.method === 'pct') {
    s.margins.nwc_pct_revenue = a.operations.nwc.pct_revenue;
    s.margins.nwc_dso = undefined;
    s.margins.nwc_dio = undefined;
    s.margins.nwc_dpo = undefined;
  } else {
    s.margins.nwc_pct_revenue = 0;
    s.margins.nwc_dso = a.operations.nwc.dso;
    s.margins.nwc_dio = a.operations.nwc.dio;
    s.margins.nwc_dpo = a.operations.nwc.dpo;
  }
  s.margins.nwc_movement_method = 'pct_change';

  s.tax.tax_rate = a.tax.rate;
  s.tax.tax_shield_on_interest = a.tax.interest_deductible;
  s.tax.nol_carryforward = a.tax.nol.acquired_usable ? a.tax.nol.acquired_opening : 0;
  s.tax.minimum_tax_rate = a.tax.minimum_rate;
  s.tax.nol_is_pre_2017 = a.tax.nol.arose_pre_2018;
  s.tax.section_382_annual_limit = a.tax.nol.s382_annual_limit ?? undefined;
  s.tax.section_163j_enabled = a.tax.s163j.applies;
  s.tax.section_163j_ati_pct = a.tax.s163j.ati_pct;
  s.tax.section_163j_ati_basis = a.tax.s163j.ati_basis;
  s.tax.dtl_unwind_years = 0;

  s.entry.entry_valuation_driver = 'multiple';
  s.entry.entry_ebitda_multiple = a.entry.entry_multiple ?? 0;
  s.entry.entry_ebitda_basis = 'ltm'; // goldens price on FY (old label: ltm — D3/C-6 rename)
  s.entry.net_debt_at_entry = facts.net_debt;
  s.entry.min_cash_balance = a.structure.min_cash;

  s.debt_tranches = a.structure.tranches.map((t) => toOldTranche(t, facts.fy_ebitda, a.structure.sweep.base_pct));

  s.fees.entry_fee_pct = a.fees.transaction_pct_of_ev;
  s.fees.transaction_costs = 0;
  s.fees.financing_fee_pct = a.fees.financing_pct_of_commitments; // old BASE = drawn principal (C-21)
  s.fees.exit_fee_pct = a.exit.fees_pct;
  s.fees.monitoring_fee_annual = 0;

  s.mip.mip_pool_pct = a.mip?.pool_pct ?? 0;
  s.mip.hurdle_moic = a.mip?.hurdle_moic ?? 0;
  s.mip.sweet_equity_pct = 0; // C-13: sweet equity removed in v2 — keep the old leg silent
  s.mip.ratchet_tiers = undefined;

  s.exit.holding_period = a.entry.hold_years;
  s.exit.exit_ebitda_multiple = a.exit.multiple;

  // covenants wide open — covenant machinery must not perturb cash paths
  s.credit_covenants.leverage_covenant = 99;
  s.credit_covenants.dscr_covenant = 0;
  s.credit_covenants.fccr_covenant = 0;

  s.fund_assumptions = undefined;
  s.scenarios = [];
  s.sensitivity_tables = [];
  return s;
}
