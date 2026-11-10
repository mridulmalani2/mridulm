/** Run each challenger variant through the ONE engine, entered as an analyst would enter it. */
import { readFileSync, writeFileSync } from 'node:fs';
import { runModel } from '../../lib/engine2/facade';
import { GOLDEN_DEALS } from '../../tests/fixtures/engine2-golden-deals';
import type { DealAssumptions, DealFacts, TrancheAssumption } from '../../lib/engine2/types';

const [metaPath, outPath] = process.argv.slice(2);
const { variants } = JSON.parse(readFileSync(metaPath, 'utf8'));
const base = GOLDEN_DEALS.G2;
const out: Record<string, unknown> = {};
for (const v of variants) {
  const facts: DealFacts = { ...base.facts, fy_revenue: v.ltm_rev, fy_ebitda: v.ltm_ebitda, fy_ebitda_margin: v.ltm_ebitda / v.ltm_rev };
  const tranches: TrancheAssumption[] = [
    { name: 'A', type: 'senior', size: { amount: v.a_par }, pricing: { kind: 'floating', base_rate: v.a_base, floor: v.a_floor, spread: v.a_spread },
      amort_pct_of_face: v.a_amort, maturity_years: v.a_mat, oid_pct: v.a_oid, sweep: { participates: true, priority: 1 } },
  ];
  if (v.b_par > 0) tranches.push({ name: 'B', type: 'mezzanine', size: { amount: v.b_par }, pricing: { kind: 'fixed', rate: v.b_rate },
    amort_pct_of_face: v.b_amort, maturity_years: v.b_mat, oid_pct: v.b_oid, sweep: { participates: true, priority: 2 } });
  if (v.p_par > 0) tranches.push({ name: 'P', type: 'pik_note', size: { amount: v.p_par }, cash_coupon: v.p_cash, pik_coupon: v.p_pik,
    amort_pct_of_face: 0, maturity_years: v.p_mat, oid_pct: 0, sweep: { participates: false, priority: 3 }, elections: v.el.map((x: number) => (x === 1 ? 'pik' : 'cash')) });
  if (v.r_commit > 0) tranches.push({ name: 'RCF', type: 'revolver', commitment: { amount: v.r_commit },
    pricing: { kind: 'floating', base_rate: v.r_base, floor: v.r_floor, spread: v.r_spread }, commitment_fee: v.r_fee, maturity_years: v.r_mat, drawn_at_close: 0 });
  const a: DealAssumptions = {
    ...base.assumptions,
    deal_name: v.id,
    entry: { driver: 'multiple', entry_multiple: v.entry_mult, enterprise_value: null, basis: 'fy', hold_years: 5 },
    structure: { tranches, min_cash: v.min_cash, sweep: { base_pct: v.sweep, grid: v.grid_on === 1 ? { tiers: [{ above_net_leverage: v.g_hi_lev, pct: v.g_hi_pct }, { above_net_leverage: v.g_lo_lev, pct: v.g_lo_pct }], else_pct: v.g_else } : null }, distributions: v.dist, surplus_distribution: null, refinancing: null, selldown: null },
    operations: { growth: v.growth, target_margin: v.target_margin, margin_path: (['linear', 'front_loaded', 'back_loaded'] as const)[v.path], da_pct_revenue: v.da_pct,
      maint_capex_pct_revenue: v.capex_pct, growth_capex: [0, 0, 0, 0, 0], nwc: v.nwc_days === 1 ? { method: 'days', dso: v.dso, dio: v.dio, dpo: v.dpo } : { method: 'pct', pct_revenue: v.nwc_pct }, lines: null },
    tax: { rate: v.tax, interest_deductible: true, s163j: { applies: v.s163j === 1, ati_basis: 'ebitda', ati_pct: v.ati_pct },
      nol: { acquired_opening: v.nol_acq, acquired_usable: true, arose_pre_2018: false, s382_annual_limit: v.s382 }, minimum_rate: v.min_tax },
    fees: { transaction_pct_of_ev: v.txn_pct, financing_pct_of_commitments: v.fin_pct, monitoring: { annual: v.mon_annual, termination_years: v.mon_T, discount_rate: v.mon_r } },
    rollover_equity: v.rollover,
    exit: { multiple: v.exit_mult, basis: 'fy', fees_pct: v.exit_fee_pct },
    mip: { pool_pct: v.mip_s1, hurdle_moic: v.mip_h1, ratchet: [{ hurdle_moic: v.mip_h2, share_pct: v.mip_s2 }] }, sweet_equity: null, warrant: v.w_pct > 0 ? { holder_label: 'W', pct_of_ordinary: v.w_pct, strike_total: v.w_strike } : null, fund: null, valuation: null, mid_year_irr: false,
    covenants: { leverage_max: null, dscr_min: null, fccr_min: null, springing: null, rp_trap: { metric: 'net_leverage', level: v.rp_level } },
  };
  try {
    const o = runModel(facts, a);
    const ti = (n: string) => o.tranches.findIndex((rows) => rows[0]?.name === n);
    const tr = (n: string, f: (r: typeof o.tranches[0][0]) => number) => [0, 1, 2, 3, 4].map((t) => (ti(n) >= 0 ? f(o.tranches[ti(n)][t]) : 0));
    const rv = (f: (r: NonNullable<typeof o.revolver>[0]) => number) => [0, 1, 2, 3, 4].map((t) => (o.revolver ? f(o.revolver[t]) : 0));
    const yr = (f: (t: number) => number) => [0, 1, 2, 3, 4].map(f);
    out[v.id] = {
      rev: yr((t) => o.operating[t].revenue!), ebitda: yr((t) => o.operating[t].ebitda), da: yr((t) => o.operating[t].da),
      capex: yr((t) => o.operating[t].maint_capex + o.operating[t].growth_capex), dnwc: yr((t) => o.operating[t].delta_nwc),
      a_int: tr('A', (r) => r.cash_interest), b_int: tr('B', (r) => r.cash_interest), r_int: rv((r) => r.cash_interest), r_cfee: rv((r) => r.commitment_fee),
      a_mand: tr('A', (r) => r.mandatory_amort), b_mand: tr('B', (r) => r.mandatory_amort), r_repay: rv((r) => r.repayment),
      a_sweep: tr('A', (r) => r.sweep_repayment), b_sweep: tr('B', (r) => r.sweep_repayment), r_draw: rv((r) => r.draw),
      cash_close: yr((t) => o.waterfall[t].closing_cash), a_close: tr('A', (r) => r.ending_balance), b_close: tr('B', (r) => r.ending_balance), r_close: rv((r) => r.ending_drawn),
      taxable: yr((t) => o.tax[t].taxable_before_nol), nol_used: yr((t) => o.tax[t].postclose_nol_used), tax_paid: yr((t) => o.tax[t].cash_tax),
      oid_am: yr((t) => o.operating[t].oid_amortization), fee_am: yr((t) => o.operating[t].financing_fee_amortization),
      ev: o.sources_uses.enterprise_value, txn: o.sources_uses.transaction_costs, finfee: o.sources_uses.financing_fees, oid: o.sources_uses.oid_funded,
      sponsor: o.sources_uses.sponsor_equity, w_net: o.exit.warrant_payout_net, sweep_pct: yr((t) => o.waterfall[t].sweep_pct_applied), irr: o.returns.sponsor_net.irr, moic: o.returns.sponsor_net.moic,
      exit_ev: o.exit.exit_ev, exit_eq: o.exit.exit_equity_pre_mip_total, term: o.exit.monitoring_termination, mip: o.exit.mip_payout, sp_exit: o.exit.sponsor_share,
      inv: o.sources_uses.sponsor_equity + o.sources_uses.rollover_equity,
      p_cint: tr('P', (r) => r.cash_interest), p_pikacc: tr('P', (r) => r.pik_accrual), p_close: tr('P', (r) => r.ending_balance),
      ded: yr((t) => o.tax[t].deductible_capped_interest), cf_close: yr((t) => o.tax[t].s163j_carryforward_end), acq_used: yr((t) => o.tax[t].acquired_nol_used),
      reg_tax: yr((t) => o.tax[t].regular_tax), min_tax_amt: yr((t) => o.tax[t].minimum_tax), dist_paid: yr((t) => o.waterfall[t].distribution_paid),
      rp_cap: yr((t) => o.waterfall[t].rp_max ?? NaN), ebitda_adj: yr((t) => o.operating[t].ebitda_adj),
      flags: o.coherence.map((f) => f.code),
    };
  } catch (e) {
    out[v.id] = { error: String(e) };
  }
}
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log('engine ran', Object.keys(out).length);
