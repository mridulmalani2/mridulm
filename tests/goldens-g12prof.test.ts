/**
 * Golden G12-PROF (SPEC §24/§25.9): the Corporate Finance 2 "LBO and FTE" worked example,
 * entered EXACTLY as the case states it (EBIT / D&A / ΔNWC as amounts growing 3%, capex =
 * D&A, no historical year), run through the ONE engine, and compared cell-for-cell with the
 * reference workbook's own values as recalculated by LibreOffice (expected.json — never
 * produced by this codebase; scripts/goldens/extract_g12prof.py records the provenance).
 */
import { describe, expect, it } from 'vitest';
import { runModel } from '../lib/engine2/facade';
import { missingInputs } from '../lib/engine2/draft';
import expected from './goldens/G12PROF/expected.json';
import { G12_ASSUMPTIONS, G12_FACTS } from './fixtures/g12-prof';

const TOL = 1e-6;
const close = (a: number | null | undefined, b: number, what: string, tol = TOL) => {
  expect(a, what).not.toBeNull();
  expect(Math.abs((a as number) - b), `${what}: ${a} vs ${b}`).toBeLessThan(tol * Math.max(1, Math.abs(b)));
};

describe('G12-PROF: the reference LBO + flow-to-equity workbook, through the ONE engine', () => {
  const o = runModel(G12_FACTS, G12_ASSUMPTIONS);
  const v = o.valuation!;

  it('the case is COMPLETE as entered: the draft gate finds nothing missing (no driver it does not use is demanded)', () => {
    expect(missingInputs(G12_FACTS, G12_ASSUMPTIONS, [])).toEqual([]);
  });

  it('operating lines reproduce the case (EBIT + D&A = EBITDA, capex = D&A, ΔNWC grown): revenue is not modelled, never zero', () => {
    for (let t = 0; t < 5; t++) {
      close(o.operating[t].ebit, expected.operating.ebit[t], `EBIT y${t + 1}`);
      close(o.operating[t].da, expected.operating.da[t], `D&A y${t + 1}`);
      close(o.operating[t].ebitda, expected.operating.ebitda[t], `EBITDA y${t + 1}`);
      close(o.operating[t].maint_capex + o.operating[t].growth_capex, expected.operating.capex[t], `capex y${t + 1}`);
      close(o.operating[t].delta_nwc, expected.operating.delta_nwc[t], `ΔNWC y${t + 1}`);
      expect(o.operating[t].revenue).toBeNull();
      expect(o.operating[t].margin).toBeNull();
    }
  });

  it('debt schedule: interest on the opening balance, tax after interest, 100% sweep', () => {
    const rows = o.tranches[0];
    for (let t = 0; t < 5; t++) {
      close(rows[t].beginning_balance, expected.debt.opening[t], `opening y${t + 1}`);
      close(rows[t].cash_interest, expected.debt.interest[t], `interest y${t + 1}`);
      close(o.tax[t].cash_tax, expected.debt.tax[t], `tax y${t + 1}`);
      close(rows[t].sweep_repayment + rows[t].mandatory_amort, expected.debt.repaid[t], `repaid y${t + 1}`);
      close(rows[t].ending_balance, expected.debt.closing[t], `closing y${t + 1}`);
      close(o.waterfall[t].distribution_paid, 0, `no cash to equity y${t + 1}`);
    }
  });

  it('entry: price ÷ forecast year-1 EBITDA (§24.4); no LTM ⇒ no LTM leverage (null, never 0)', () => {
    close(o.derived.entry_multiple, expected.entry_multiple, 'entry multiple');
    close(o.derived.total_debt_at_par / o.derived.entry_ebitda_for_valuation, expected.opening_leverage_ntm, 'NTM leverage');
    expect(o.derived.entry_gross_leverage_fy).toBeNull();
    expect(o.derived.entry_ebitda_for_sizing).toBeNull();
  });

  it('exit (a) at the entry multiple and exit (b) from fundamentals', () => {
    close(o.exit.exit_ev, expected.exit_ev_a, 'exit EV (a)');
    close(v.ufcf_n_plus_1, expected.ufcf_n_plus_1, 'UFCF year 6');
    close(v.gordon_ev, expected.exit_ev_b, 'exit EV (b)');
    close(v.gordon_implied_multiple, expected.exit_multiple_b, 'implied multiple (b)');
    close(v.assumed.exit_equity_total, expected.exit_equity.a, 'exit equity (a)');
    close(v.fundamentals!.exit_equity_total, expected.exit_equity.b, 'exit equity (b)');
    close(v.assumed.equity_moic, expected.moic.a, 'MOIC (a)');
    close(v.fundamentals!.equity_moic, expected.moic.b, 'MOIC (b)');
    close(v.assumed.equity_irr, expected.irr.a, 'IRR (a)');
    close(v.fundamentals!.equity_irr, expected.irr.b, 'IRR (b)');
    // the sponsor IS the whole equity here, so the sponsor stream agrees with the FTE stream
    close(o.returns.sponsor_net.irr, expected.irr.a, 'sponsor IRR ≡ equity IRR (a)');
  });

  it('value bridge: the reference folds the cross term into "change in multiple"; the engine reports it as its own bar', () => {
    for (const k of ['a', 'b'] as const) {
      const b = (k === 'a' ? v.assumed : v.fundamentals!).bridge;
      const e = expected.bridge[k];
      close(b.ebitda_growth_at_entry_multiple, e.growth, `bridge (${k}) growth`);
      close(b.multiple_change_bar + b.interaction, e.multiple, `bridge (${k}) multiple + interaction`, 1e-5);
      close(b.net_debt_paydown, e.paydown, `bridge (${k}) paydown`);
    }
  });

  for (const k of ['a', 'b'] as const) {
    it(`flow to equity, exit (${k}): equity value path, leverage, beta, cost of equity, NPV, required return`, () => {
      const c = k === 'a' ? v.assumed : v.fundamentals!;
      const e = k === 'a' ? expected.fte_a : expected.fte_b;
      expect(c.recursion_null_reason).toBeNull();
      for (let t = 0; t <= 5; t++) {
        close(c.equity_value![t], e.equity_value[t], `E y${t}`);
        close(c.equity_weight![t], e.equity_weight[t], `E/(D+E) y${t}`);
        close(c.beta_equity![t], e.beta_equity[t], `βE y${t}`);
        close(c.cost_of_equity![t], e.cost_of_equity[t], `rE y${t}`);
      }
      close(c.npv, e.npv, 'NPV');
      close(c.value_per_dollar, e.value_per_dollar, 'value per $');
      close(c.required_return, e.required_return, 'required return');
      // §14.25: one statement made twice
      expect(Math.sign(c.npv!)).toBe(Math.sign(c.excess_return!));
    });
  }

  it('break-evens: exit multiple and asset beta match the reference Goal Seek; growth is the TRUE root (the reference typed 2.516% leaves NPV +3.57)', () => {
    close(v.break_evens.exit_multiple.value, expected.breakeven_reference_typed.exit_multiple, 'break-even exit multiple', 1e-6);
    close(v.break_evens.asset_beta.value, expected.breakeven_reference_typed.asset_beta, 'break-even asset beta', 1e-8);
    const g = v.break_evens.long_run_growth.value!;
    close(g, 0.024849631, 'break-even growth (true root)', 1e-6);
    expect(Math.abs(g - expected.breakeven_reference_typed.long_run_growth)).toBeGreaterThan(2e-4);
    // and at the reference's typed value the NPV is NOT zero — the discrepancy is real
    const atTyped = runModel(G12_FACTS, { ...G12_ASSUMPTIONS, valuation: { ...G12_ASSUMPTIONS.valuation!, long_run_growth: expected.breakeven_reference_typed.long_run_growth } });
    close(atTyped.valuation!.fundamentals!.npv, 3.568, 'NPV at the typed 2.516%', 1e-3);
  });

  it("start-of-year leverage convention: the reference's own note: about 231.9 for exit (b)", () => {
    const s = runModel(G12_FACTS, { ...G12_ASSUMPTIONS, valuation: { ...G12_ASSUMPTIONS.valuation!, leverage_timing: 'start_of_year' } });
    close(s.valuation!.fundamentals!.equity_value_at_entry, 231.9055403, 'E0 start-of-year (b)', 1e-8);
  });

  it('a debt beta lowers every cost of equity and raises the value (the reference: βD 0.3 ⇒ ≈ $309m)', () => {
    const d = runModel(G12_FACTS, { ...G12_ASSUMPTIONS, valuation: { ...G12_ASSUMPTIONS.valuation!, debt_beta: 0.3 } });
    expect(d.valuation!.fundamentals!.equity_value_at_entry!).toBeGreaterThan(308.5);
    expect(d.valuation!.fundamentals!.equity_value_at_entry!).toBeLessThan(309.5);
  });
});
