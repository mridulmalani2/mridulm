/**
 * OUT-OF-SAMPLE golden: the Electronic Arts take-private course model, a workbook the engine was
 * never built against (tests/fixtures/ea-oos.ts). Expected values are that workbook's own cells
 * as recalculated by LibreOffice on 2026-11-11 (sheet "LBO and FTE") — never produced by this
 * codebase. Lines stated BY YEAR, a negative ΔNWC, a 20% tax rate, 7.5% debt.
 */
import { describe, expect, it } from 'vitest';
import { runModel } from '../lib/engine2/facade';
import { EA_ASSUMPTIONS, EA_FACTS } from './fixtures/ea-oos';

const close = (a: number | null | undefined, b: number, what: string, tol = 1e-9) => {
  expect(a, what).not.toBeNull();
  expect(Math.abs((a as number) - b), `${what}: ${a} vs ${b}`).toBeLessThan(tol * Math.max(1, Math.abs(b)));
};

describe('EA out-of-sample — a workbook the engine never saw, reproduced cell for cell', () => {
  const o = runModel(EA_FACTS, EA_ASSUMPTIONS);

  it('debt schedule, interest and tax (rows 21–28)', () => {
    const closing = [16690, 14901.4, 12565.484, 9649.41304, 6118.3778224];
    const interest = [1350, 1251.75, 1117.605, 942.4113, 723.705978];
    const tax = [250, 369.65, 506.479, 651.51774, 805.2588044];
    for (let t = 0; t < 5; t++) {
      close(o.tranches[0][t].ending_balance, closing[t], `closing debt y${t + 1}`);
      close(o.tranches[0][t].cash_interest, interest[t], `interest y${t + 1}`);
      close(o.tax[t].cash_tax, tax[t], `cash tax y${t + 1}`);
    }
  });

  it('entry, exit at the entry multiple, and the sponsor return (rows 39–66)', () => {
    close(o.derived.entry_multiple, 17.741935483871, 'entry EV / FY2027 EBITDA', 1e-12);
    close(o.exit.exit_ev, 93145.1612903226, 'exit EV (memo multiple)');
    close(o.exit.exit_equity_pre_mip_total, 87026.7834679226, 'exit equity');
    close(o.returns.sponsor_net.moic, 2.35207522886277, 'money multiple');
    close(o.returns.sponsor_net.irr, 0.186561469439033, 'sponsor IRR');
  });

  it('credit statistics (rows 33–34)', () => {
    const lev = [5.38387096774194, 4.13927777777778, 3.02782746987952, 2.05306660425532, 1.16540529950476];
    const icr = [2.2962962962963, 2.87597363690833, 3.71329763198984, 4.98720675356928, 7.25432725387823];
    for (let t = 0; t < 5; t++) {
      close(o.credit[t].net_leverage, lev[t], `closing debt / EBITDA y${t + 1}`);
      close(o.credit[t].icr, icr[t], `EBITDA / interest y${t + 1}`);
    }
  });

  // SPEC §28 [v2.6.0]: the workbook states the terminal year in steady state — capex reset to
  // 1.0 × D&A (the forecast runs it at 0.5 ×) and ΔNWC −60 before growth. Before §28 the engine
  // could only grow year N's own lines (4,253.85 → NPV +313): the opposite verdict.
  it('fundamentals exit (b) with the terminal year stated: year-6 FCF, Gordon EV, returns (rows 46–66)', () => {
    const v = o.valuation!;
    close(v.ufcf_n_plus_1, 3995.1, 'year-6 normalised FCF (D46)');
    close(v.gordon_ev, 64645.6310679612, 'exit EV from fundamentals (D47)');
    close(v.gordon_implied_multiple, 12.3134535367545, 'implied exit multiple (D48)');
    close(v.fundamentals!.exit_equity_total, 58527.2532455612, 'exit equity (b)');
    close(v.fundamentals!.equity_moic, 1.58181765528544, 'money multiple (b)');
    close(v.fundamentals!.equity_irr, 0.0960523150662189, 'IRR (b)');
  });

  it('flow to equity, both exits: value path, leverage, beta, cost of equity, NPV, required return (rows 78–111)', () => {
    const b = o.valuation!.fundamentals!;
    const E = [34677.4546046936, 38799.4677742993, 43241.175074343, 48007.5310765028, 53102.1829798352, 58527.2532455612];
    const w = [0.65829784041243, 0.699222200726708, 0.743709321767283, 0.79255640512314, 0.846228404502255, 0.90535512266919];
    const beta = [1.3671623158237, 1.28714448577952, 1.21015022087033, 1.13556586532181, 1.06354265020136, 0.994085058409565];
    const re = [0.123428252001951, 0.118867235689432, 0.114478562589609, 0.110227254323343, 0.106121931061478, 0.102162848329345];
    for (let t = 0; t <= 5; t++) {
      close(b.equity_value![t], E[t], `E y${t}`);
      close(b.equity_weight![t], w[t], `E/(D+E) y${t}`);
      close(b.beta_equity![t], beta[t], `βE y${t}`);
      close(b.cost_of_equity![t], re[t], `rE y${t}`);
    }
    close(b.npv, -2322.54539530639, 'NPV (b)');
    close(b.value_per_dollar, 0.937228502829557, 'value per dollar (b)');
    close(b.required_return, 0.110355852876021, 'required return (b)');
    const a = o.valuation!.assumed;
    close(a.equity_value_at_entry, 52622.4761004049, 'equity value at entry (a)');
    close(a.npv, 15622.4761004049, 'NPV (a)');
    close(a.required_return, 0.105850275644587, 'required return (a)');
    // the verdict the memo turns on: the IRR falls short of the required return, and the NPV is negative
    expect(Math.sign(b.npv!)).toBe(-1);
    expect(Math.sign(b.excess_return!)).toBe(-1);
  });

  it('§28 is what moves it, and only it: without the terminal statement the engine carries year N (v2.0.0) and says so', () => {
    const carried = runModel(EA_FACTS, { ...EA_ASSUMPTIONS, valuation: { ...EA_ASSUMPTIONS.valuation!, terminal: null } });
    close(carried.valuation!.ufcf_n_plus_1, 4253.85, 'year-6 FCF carrying year N');
    expect(carried.valuation!.fundamentals!.npv!).toBeGreaterThan(0);
    // identical everywhere else: the terminal year touches nothing before the exit
    expect(carried.tranches).toEqual(o.tranches);
    expect(carried.returns).toEqual(o.returns);
    expect(carried.valuation!.assumed.npv).toBe(o.valuation!.assumed.npv);
    // and the unstated case is DISCLOSED: capex below D&A and an NWC inflow, for ever
    const warn = carried.coherence.find((f) => f.code === 'terminal_not_steady_state')!;
    expect(warn.severity).toBe('warn');
    expect(warn.message).toMatch(/capex \(250\.0\) is below D&A \(500\.0\)/);
    expect(warn.message).toMatch(/working capital releases cash/);
    // stated: capex = D&A clears the first; the workbook itself keeps the NWC inflow, so that one stays flagged
    const stated = o.coherence.find((f) => f.code === 'terminal_not_steady_state')!;
    expect(stated.message).not.toMatch(/below D&A/);
    expect(stated.message).toMatch(/working capital releases cash/);
  });

  it('terminal inputs are gated: a negative capex ratio or a non-finite NWC is rejected, never clamped', () => {
    const bad = (terminal: { capex_pct_of_da: number; delta_nwc_before_growth: number }) =>
      () => runModel(EA_FACTS, { ...EA_ASSUMPTIONS, valuation: { ...EA_ASSUMPTIONS.valuation!, terminal } });
    expect(bad({ capex_pct_of_da: -0.1, delta_nwc_before_growth: 0 })).toThrow(/§28\.1/);
    expect(bad({ capex_pct_of_da: 1, delta_nwc_before_growth: Number.NaN })).toThrow(/§28\.1/);
  });
});
