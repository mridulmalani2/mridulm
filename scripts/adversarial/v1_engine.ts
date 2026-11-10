/** Run each phase-1 variant through the ONE engine, entered as an analyst would enter the case. */
import { readFileSync, writeFileSync } from 'node:fs';
import { runModel } from '../../lib/engine2/facade';
import { G12_ASSUMPTIONS, G12_FACTS } from '../../tests/fixtures/g12-prof';
import type { DealAssumptions } from '../../lib/engine2/types';

const [varsPath, outPath] = process.argv.slice(2);
const variants = JSON.parse(readFileSync(varsPath, 'utf8'));
const out: Record<string, unknown> = {};
for (const v of variants) {
  const g4 = [v.g, v.g, v.g, v.g];
  const tr = G12_ASSUMPTIONS.structure.tranches[0];
  const a: DealAssumptions = {
    ...G12_ASSUMPTIONS,
    deal_name: v.id,
    entry: { ...G12_ASSUMPTIONS.entry, enterprise_value: v.ev },
    structure: {
      ...G12_ASSUMPTIONS.structure,
      tranches: v.debt > 0 ? [{ ...tr, size: { amount: v.debt }, pricing: { kind: 'fixed', rate: v.rate } } as typeof tr] : [],
      surplus_distribution: { payout_pct: 1, start: 'immediately' },
    },
    operations: {
      ...G12_ASSUMPTIONS.operations,
      lines: {
        revenue: { mode: 'not_modelled' },
        ebitda: { measure: 'ebit', mode: 'grown', year1: v.ebit1, growth: g4 },
        da: { mode: 'grown', year1: v.da1, growth: g4 },
        capex: { mode: 'pct_of_da', pct: 1 },
        delta_nwc: { mode: 'grown', year1: v.dnwc1, growth: g4 },
        year_n_plus_1_growth: v.g,
      },
    },
    tax: { ...G12_ASSUMPTIONS.tax, rate: v.tax },
    // the reference exits (a) at the ENTRY multiple: price ÷ year-1 EBITDA
    exit: { ...G12_ASSUMPTIONS.exit, multiple: v.ev / (v.ebit1 + v.da1) },
    valuation: { risk_free: v.rf, mrp: v.mrp, asset_beta: v.beta_a, debt_beta: 0, long_run_growth: v.g_lr, leverage_timing: 'end_of_year' },
  };
  try {
    const o = runModel(G12_FACTS, a);
    const t0 = o.tranches[0];
    const yr = (f: (t: number) => number) => [0, 1, 2, 3, 4].map(f);
    const val = o.valuation!;
    const fte = (c: typeof val.assumed | null) => c && ({
      E: c.equity_value, w: c.equity_weight, beta: c.beta_equity, re: c.cost_of_equity,
      npv: c.npv, vpd: c.value_per_dollar, req: c.required_return,
    });
    out[v.id] = {
      ebit: yr((t) => o.operating[t].ebit), da: yr((t) => o.operating[t].da), ebitda: yr((t) => o.operating[t].ebitda),
      capex: yr((t) => o.operating[t].maint_capex + o.operating[t].growth_capex), dnwc: yr((t) => o.operating[t].delta_nwc),
      debt_open: yr((t) => (t0 ? t0[t].beginning_balance : 0)), interest: yr((t) => o.waterfall[t].cash_interest_total),
      pbt: yr((t) => o.tax[t].taxable_before_nol), tax: yr((t) => o.tax[t].cash_tax),
      cash_avail: yr((t) => o.operating[t].fcf_pre_debt - o.waterfall[t].cash_interest_total),
      repaid: yr((t) => (t0 ? t0[t].mandatory_amort + t0[t].sweep_repayment : 0)),
      debt_close: yr((t) => (t0 ? t0[t].ending_balance : 0)), cfe: yr((t) => o.waterfall[t].distribution_paid),
      sponsor_equity: o.sources_uses.sponsor_equity, ru: val.r_unlevered,
      entry_mult: o.derived.entry_multiple, debt_exit: o.exit.debt_payoff_at_par_plus_pik,
      exit_ev_a: val.assumed.exit_ev, ufcf6: val.ufcf_n_plus_1, exit_ev_b: val.gordon_ev, exit_mult_b: val.gordon_implied_multiple,
      exit_eq_a: val.assumed.exit_equity_total, exit_eq_b: val.fundamentals?.exit_equity_total ?? null,
      moic_total_a: val.assumed.equity_moic, moic_total_b: val.fundamentals?.equity_moic ?? null,
      cf_a: val.assumed.equity_cashflows, cf_b: val.fundamentals?.equity_cashflows ?? null,
      irr_a: val.assumed.equity_irr, irr_b: val.fundamentals?.equity_irr ?? null,
      bridge_growth: o.bridge.ebitda_growth_at_entry_multiple,
      bridge_mult_b: val.fundamentals ? val.fundamentals.bridge.multiple_change_bar + val.fundamentals.bridge.interaction : null,
      bridge_paydown: o.bridge.net_debt_paydown,
      fte_a: fte(val.assumed), fte_b: fte(val.fundamentals),
      coherence: o.coherence.map((f) => f.code),
    };
  } catch (e) {
    out[v.id] = { error: String(e) };
  }
}
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log('engine ran', Object.keys(out).length);
