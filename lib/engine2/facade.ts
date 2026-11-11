/**
 * engine2/facade.ts — `runModel(facts, assumptions)` (Phase C build order #5, completed
 * across C6–C9 as the downstream blocks landed).
 *
 * Pure assembly in the §5 order: runCore (operating/tax/debt/BS year loop) → §9 exit →
 * §9/§10 returns + GP-fee memo → §11 credit → §12 bridge → §19 fund overlay (when ON,
 * §19.7's slot) → §16 coherence → §13
 * scenarios/sensitivity (opt-in via `options`; every scenario is a FULL re-run with the
 * entry frozen). Nothing here computes finance — modules do; the facade wires them and
 * enforces the §14.16 single-source mirrors by construction (each block reads the same
 * upstream object, never a recomputation).
 *
 * ModelOutput.bridge is the canonical types.ts ValueBridge (the v1.0.3 contract);
 * Engine2ValueBridge survives only as a deprecated alias.
 *
 * No imports from lib/engine (boundary test).
 */

import { buildBridge, type Engine2ValueBridge } from './bridge';
import { runCoherence } from './check';
import { buildFundOverlay, validateFund } from './fund';
import { buildCreditYear, type CreditYearInputs } from './credit';
import { buildExitWaterfall, exitBasisValue, monitoringTermination, type ExitInputs } from './exit';
import { buildGpFeeIncome, buildReturns, sponsorShareOfDistributions } from './returns';
import { yearNPlus1Growth } from './operating';
import { runCore, stripInterimSplit, type EngineCore, type StripInterimSplit } from './sequence';
import type { CreditYear, DealAssumptions, DealFacts, EquityStripBlock, ExitBlock, FteCase, ModelOutput, ReturnStreams, SelldownBlock, ValuationAssumption, ValuationBlock } from './types';
import { fteRecursion, gordonEv, resolveTerminalYear, solveRoot, terminalSteadyStateIssues, terminalUfcf, unleveredCost, validateValuation } from './valuation';

export type Engine2ModelOutput = Omit<ModelOutput, 'bridge'> & { bridge: Engine2ValueBridge };

// Display-derivation helpers (entryMultipleDisplay / exitMultipleDisplay) live in `./display.ts`,
// OFF the engine-arithmetic path, so a facade.ts diff still means "engine arithmetic changed"
// (tier-governance sign-off round 4). facade.ts assembles the MODEL; display.ts formats it.

/**
 * §22.7 [v1.7.0]: THE single predicate selecting which interim share rule governs —
 * `sponsorShareOfDistributions` (§9 pari-passu) whenever `sweet_equity` is null, the §22.7
 * institutional split whenever it is not. The tautological partition (`sweet_equity ==
 * null`) is what makes the two rules disjoint; all three consumers (returns.ts, fund.ts,
 * the §12 bridge term) read THIS selection, so the engine never ships two competing
 * definitions of one number.
 */
/**
 * §23.2 [v2.2.0] the selldown valued at the END of its year — the §9 form at year t on the
 * core's own year-t figures (EBITDA_adj; §11 debt = par + accrued PIK + drawn revolver, less
 * closing cash), full precision, every quantity SIGNED. null ⇔ no event. The company path is
 * untouched by construction: nothing here feeds back into the core.
 */
export function selldownFromCore(core: EngineCore, assumptions: DealAssumptions): SelldownBlock | null {
  const sd = assumptions.structure.selldown;
  if (!sd) return null;
  const t = sd.year; // 1-indexed; validated 1..N−1 in runCore
  const ev = sd.event_multiple * core.operating[t - 1].ebitda_adj;
  const netDebt = core.balance_sheet[t].debt_at_par - core.waterfall[t - 1].closing_cash;
  const equity = ev - netDebt;
  // §9.1 [v2.3.0] limited liability applies to a stake as to the whole: a sale at a negative
  // implied equity fetches ZERO — the seller never pays a buyer to take the stake. The signed
  // implied equity stays on display (and fires selldown_below_cost).
  return { year: t, fraction: sd.fraction, implied_event_ev: ev, implied_event_equity: equity, selldown_proceeds: sd.fraction * Math.max(0, equity) };
}

export function selectInterimShares(
  core: EngineCore,
  assumptions: DealAssumptions,
): { shares: number[]; split: StripInterimSplit | null } {
  const sd = assumptions.structure.selldown;
  if (sd) {
    // §23.5 the partition's interim leg: every share STRICTLY AFTER the event year scales by
    // (1 − f); the year-t distribution is the SELLER's whole (the sale settles after the year's
    // flows — §23.2). A strip is rejected beside a selldown (§23.3), so the base rule here is
    // always §9's pari-passu share.
    const base = sponsorShareOfDistributions(core.distributions_paid, core.sources_uses.sponsor_equity, core.sources_uses.rollover_equity);
    return { shares: base.map((s, i) => (i + 1 > sd.year ? (1 - sd.fraction) * s : s)), split: null };
  }
  if (assumptions.sweet_equity) {
    const split = stripInterimSplit(
      assumptions.sweet_equity,
      core.sources_uses.sponsor_equity,
      core.distributions_paid,
    );
    return { shares: split.institution_share, split };
  }
  return {
    shares: sponsorShareOfDistributions(
      core.distributions_paid,
      core.sources_uses.sponsor_equity,
      core.sources_uses.rollover_equity,
    ),
    split: null,
  };
}

/** Assemble the §9/§22.7 exit waterfall from the core (shared by facade and scenarios.ts). */
export function exitWaterfallFromCore(
  core: EngineCore,
  assumptions: DealAssumptions,
): { exit: ExitBlock; equity_strip: EquityStripBlock | null; split: StripInterimSplit | null } {
  const N = assumptions.entry.hold_years;
  const { split } = selectInterimShares(core, assumptions);
  const inputs: ExitInputs = {
    exit_year_ebitda_adj: core.operating[N - 1].ebitda_adj,
    last_growth: yearNPlus1Growth(assumptions.operations, N),
    debt_payoff:
      core.final_debt_state.term_balances.reduce((a, b) => a + b, 0) + core.final_debt_state.revolver_drawn,
    closing_cash: core.waterfall[N - 1].closing_cash,
    unamortized_writeoff: core.exit_writeoff,
    invested_equity_total: core.sources_uses.sponsor_equity + core.sources_uses.rollover_equity,
    rollover_equity: core.sources_uses.rollover_equity,
    // §10 [v1.1.0]: the hurdle base takes the TOTAL paid, not the sponsor share — both
    // sides of the test are on a total-equity basis (§17 item (x): the two coincide only
    // at rollover 0, which is every golden, so a fixture cannot discriminate them).
    cumulative_distributions: core.distributions_paid.reduce((a, b) => a + b, 0),
    // §22.2 [v1.7.0]: the loan-note walk's outputs, computed ONCE in sequence.ts.
    loan_notes_subscribed: split?.loan_notes_subscribed ?? 0,
    loan_note_balance_at_exit: split?.loan_note_balance_at_exit ?? 0,
    institutional_interim_value: split ? split.institution_share.reduce((a, b) => a + b, 0) : 0,
    selldown_fraction: assumptions.structure.selldown?.fraction ?? 0,
  };
  return { ...buildExitWaterfall(assumptions, inputs), split };
}

/** The ExitBlock alone (pre-v1.7.0 surface; same single computation path). */
export function exitFromCore(core: EngineCore, assumptions: DealAssumptions): ExitBlock {
  return exitWaterfallFromCore(core, assumptions).exit;
}

/** Assemble §9/§10 returns from core + exit (shared by facade and scenarios.ts). */
export function returnsFromCore(
  core: EngineCore,
  exit: ExitBlock,
  assumptions: DealAssumptions,
): ReturnStreams {
  return buildReturns(assumptions, {
    sponsor_equity: core.sources_uses.sponsor_equity,
    rollover_equity: core.sources_uses.rollover_equity,
    management_subscription: core.sources_uses.management_subscription,
    enterprise_value: core.derived.enterprise_value,
    transaction_costs: core.sources_uses.transaction_costs,
    unlevered_fcf: core.unlevered_fcf,
    distributions_paid: core.distributions_paid,
    exit,
    hold_years: assumptions.entry.hold_years,
    sponsor_interim_shares: selectInterimShares(core, assumptions).shares,
    selldown: selldownArg(core, assumptions),
  });
}

/** The selldown as the returns and fund layers consume it — the ONE §23.2 valuation. */
function selldownArg(core: EngineCore, assumptions: DealAssumptions): { year: number; proceeds: number } | null {
  const b = selldownFromCore(core, assumptions);
  return b ? { year: b.year, proceeds: b.selldown_proceeds } : null;
}

/** Assemble §11 credit per year from the core (shared by facade and scenarios.ts). */
export function creditFromCore(core: EngineCore, assumptions: DealAssumptions): CreditYear[] {
  return core.waterfall.map((_, y) => {
    const inputs: CreditYearInputs = {
      operating: core.operating[y],
      waterfall: core.waterfall[y],
      tranches: core.sized.terms.map((t, i) => ({ type: t.assumption.type, row: core.tranches[i][y] })),
      revolver: core.revolver ? core.revolver[y] : null,
      revolver_commitment: core.sized.revolver?.commitment ?? 0,
      cash_tax: core.tax[y].cash_tax,
      entry_total_debt: core.derived.total_debt_at_par,
    };
    return buildCreditYear(assumptions.covenants, y, inputs);
  });
}

/** §12 bridge for ONE exit (shared by the base run and the §25 fundamentals case). */
export function bridgeFromCore(
  core: EngineCore,
  assumptions: DealAssumptions,
  exit: ExitBlock,
  sponsorInterim: number[],
  monitoringAnnualByYear: number[],
): Engine2ValueBridge {
  return buildBridge({
    entry_multiple: core.derived.entry_multiple,
    entry_ebitda: core.derived.enterprise_value / core.derived.entry_multiple,
    entry_net_debt: core.derived.total_debt_at_par - core.sources_uses.cash_to_balance_sheet,
    entry_costs:
      core.sources_uses.transaction_costs + core.sources_uses.financing_fees + core.sources_uses.oid_funded,
    // §12/§22.8 [v1.7.0]: every equity source counts — incl. the management subscription —
    // which is what keeps §14.9(a)'s frictionless identity exact.
    entry_equity_pre_promote_total:
      core.sources_uses.sponsor_equity +
      core.sources_uses.rollover_equity +
      core.sources_uses.management_subscription,
    exit_multiple: assumptions.exit.multiple,
    exit_ebitda: exit.exit_ebitda_basis_value,
    exit_net_debt: exit.debt_payoff_at_par_plus_pik - exit.cash_at_exit,
    exit_costs: exit.exit_fees + exit.monitoring_termination,
    exit_equity_pre_mip_total: exit.exit_equity_pre_mip_total,
    mip_payout: exit.mip_payout,
    rollover_share: exit.rollover_share,
    rollover_equity: core.sources_uses.rollover_equity,
    sponsor_share: exit.sponsor_share,
    sponsor_equity: core.sources_uses.sponsor_equity,
    monitoring_annual_total: monitoringAnnualByYear.reduce((a, b) => a + b, 0),
    // §12 [v1.1.0]: add back only the SPONSOR share — the rollover's slice left through the
    // same (smaller) paydown bar and is not sponsor money. Deliberately differs from §10's
    // hurdle base, which takes the total; §17 item (x) records that no rollover-0 fixture
    // can tell them apart, so this is the one place the distinction has to be written down.
    interim_distributions_sponsor: sponsorInterim.reduce((a, b) => a + b, 0),
    management_subscription: core.sources_uses.management_subscription,
    management_ordinary_share: exit.management_ordinary_share,
    warrant_payout_net: exit.warrant_payout_net,
    selldown_buyer_share: exit.selldown_buyer_share,
    debt_shortfall_at_exit: exit.debt_shortfall_at_exit,
    selldown_proceeds: selldownFromCore(core, assumptions)?.selldown_proceeds ?? 0,
  });
}

/** §28.2 [v2.6.0]: the terminal year in year-N terms, from the SAME core the valuation reads. */
function terminalYearFromCore(core: EngineCore, assumptions: DealAssumptions) {
  const lastOp = core.operating[assumptions.entry.hold_years - 1];
  return resolveTerminalYear(
    { ebitda: lastOp.ebitda, da: lastOp.da, capex: lastOp.maint_capex + lastOp.growth_capex, delta_nwc: lastOp.delta_nwc },
    assumptions.valuation?.terminal,
  );
}

/** §25.5 closing debt (par + accrued PIK, terms + drawn revolver) and cash, index 0..N. */
function debtAndCashPaths(core: EngineCore): { debt: number[]; cash: number[] } {
  const N = core.waterfall.length;
  const debt = [core.derived.total_debt_at_par + (core.revolver ? core.revolver[0].beginning_drawn : 0)];
  const cash = [core.sources_uses.cash_to_balance_sheet];
  for (let t = 0; t < N; t++) {
    debt.push(
      core.tranches.reduce((s, rows) => s + rows[t].ending_balance, 0) + (core.revolver ? core.revolver[t].ending_drawn : 0),
    );
    cash.push(core.waterfall[t].closing_cash);
  }
  return { debt, cash };
}

/**
 * §25 the flow-to-equity valuation block. Each exit case is the SAME §9/§10/§12 path on
 * the SAME frozen core with only `exit.multiple` changed (§25.3); break-evens move one
 * input and re-run only that exit step + the recursion (§25.7).
 */
export function buildValuation(
  core: EngineCore,
  assumptions: DealAssumptions,
  monitoringAnnualByYear: number[],
): ValuationBlock {
  const v = assumptions.valuation!;
  validateValuation(v);
  const N = assumptions.entry.hold_years;
  const paths = debtAndCashPaths(core);
  const lastOp = core.operating[N - 1];
  const gN1 = yearNPlus1Growth(assumptions.operations, N);
  if (gN1 === null) throw new RangeError('valuation: year N+1 growth is required (§24.3 R7)');
  // §28.2 [v2.6.0]: year N's lines, or the stated steady-state capex and ΔNWC — resolved ONCE.
  const terminalYear = terminalYearFromCore(core, assumptions);
  const ufcf = terminalUfcf(terminalYear, assumptions.tax.rate, gN1);

  const caseAt = (multiple: number, val: ValuationAssumption): FteCase => {
    const a: DealAssumptions = { ...assumptions, exit: { ...assumptions.exit, multiple }, valuation: val };
    const { exit } = exitWaterfallFromCore(core, a);
    const returns = returnsFromCore(core, exit, a);
    const sponsorInterim = selectInterimShares(core, a).shares;
    const pp = returns.pre_promote;
    const rec = fteRecursion(val, {
      ecf: core.distributions_paid,
      exit_equity: exit.exit_equity_pre_mip_total,
      debt: paths.debt,
      cash: paths.cash,
      invested: -pp.cashflows[0],
      equity_irr: pp.irr,
    });
    return {
      exit_multiple: multiple,
      exit_ev: exit.exit_ev,
      exit_equity_total: exit.exit_equity_pre_mip_total,
      equity_cashflows: pp.cashflows,
      equity_irr: pp.irr,
      equity_moic: pp.moic,
      equity_invested: -pp.cashflows[0],
      debt: paths.debt,
      cash: paths.cash,
      ...rec,
      bridge: bridgeFromCore(core, a, exit, sponsorInterim, monitoringAnnualByYear),
    };
  };

  const fundamentalsAt = (val: ValuationAssumption): { c: FteCase | null; ev: number | null; mult: number | null; reason: string | null } => {
    const g = gordonEv(ufcf, unleveredCost(val), val.long_run_growth);
    if (g.ev === null) return { c: null, ev: null, mult: null, reason: g.reason };
    // §25.2: implied multiple on the §9 exit basis — the SAME basis value the multiple applies to.
    const basisValue = exitBasisValue(lastOp.ebitda_adj, assumptions.exit.basis, gN1);
    const mult = g.ev / basisValue;
    return { c: caseAt(mult, val), ev: g.ev, mult, reason: null };
  };

  const assumed = caseAt(assumptions.exit.multiple, v);
  const fund = fundamentalsAt(v);
  const npvOr = (c: FteCase | null): number | null => (c === null ? null : c.npv);

  const beExit = solveRoot((m) => caseAt(m, v).npv, assumptions.exit.multiple, 0.25, 0, 1e4);
  const beBeta = solveRoot(
    (b) => npvOr(fundamentalsAt({ ...v, asset_beta: b }).c),
    v.asset_beta, 0.05, 0, 50,
  );
  const rU = unleveredCost(v);
  const beGrowth = solveRoot(
    (g) => npvOr(fundamentalsAt({ ...v, long_run_growth: g }).c),
    v.long_run_growth, 0.0025, -0.99, rU - 1e-9,
  );

  return {
    r_unlevered: rU,
    ufcf_n_plus_1: ufcf,
    g_n_plus_1: gN1,
    gordon_ev: fund.ev,
    gordon_implied_multiple: fund.mult,
    gordon_null_reason: fund.reason,
    assumed,
    fundamentals: fund.c,
    break_evens: {
      exit_multiple: { value: beExit.value, base: assumptions.exit.multiple, reason: beExit.reason },
      asset_beta: { value: fund.c ? beBeta.value : null, base: v.asset_beta, reason: fund.c ? beBeta.reason : fund.reason },
      long_run_growth: { value: fund.c ? beGrowth.value : null, base: v.long_run_growth, reason: fund.c ? beGrowth.reason : fund.reason },
    },
  };
}

/**
 * The base-case run. §13 scenario/sensitivity blocks are attached by scenarios.ts
 * (`runModelWithScenarios`) — scenarios call runModel per re-run, so the dependency
 * points one way and the facade stays acyclic.
 */
export function runModel(facts: DealFacts, assumptions: DealAssumptions): Engine2ModelOutput {
  const core = runCore(facts, assumptions);
  const { exit, equity_strip } = exitWaterfallFromCore(core, assumptions);
  const returns = returnsFromCore(core, exit, assumptions);
  const credit = creditFromCore(core, assumptions);
  // §22.7 [v1.7.0]: the ONE selected interim share array (see selectInterimShares).
  const sponsorInterim = selectInterimShares(core, assumptions).shares;

  const monitoringAnnualByYear = core.build.years.map((y) => y.monitoring_fee);
  const gpFeeIncome = buildGpFeeIncome(
    assumptions.fees.monitoring,
    monitoringAnnualByYear,
    monitoringTermination(assumptions.fees.monitoring),
  );

  const bridge = bridgeFromCore(core, assumptions, exit, sponsorInterim, monitoringAnnualByYear);

  // §19 [v1.4.0] — the fund-of-one overlay: a POST-ENGINE layer on sponsor-side outputs
  // only (the ONE §9 share rule + exit.sponsor_share + gp_fee_income); null ≡ OFF,
  // byte-identity. Runs after §9/§10 and BEFORE §16 coherence, in §19.7's stated order
  // (audit N3 aligned the code order with the sentence; no data dependence either way).
  let fund = null as import('./types').FundBlock | null;
  if (assumptions.fund) {
    const fi = {
      distributions_paid: core.distributions_paid,
      sponsor_interim_shares: sponsorInterim,
      exit_sponsor_share: exit.sponsor_share,
      sources_uses: core.sources_uses,
      gp_fee_income: gpFeeIncome,
      selldown: selldownArg(core, assumptions),
    };
    validateFund(assumptions.fund); // structural gates; the committed-floor throws in the walk
    fund = buildFundOverlay(assumptions.fund, fi);
  }

  const coherence = runCoherence({
    facts,
    assumptions,
    sources_uses: core.sources_uses,
    derived: core.derived,
    waterfall: core.waterfall,
    balance_sheet: core.balance_sheet,
    credit,
    covenants: assumptions.covenants,
    ppe_seeded_at_zero: core.ppe_seeded_at_zero,
    tranches: core.tranches, // §18.8 [v1.3.1] refi no-op flag reads named TrancheYear fields
    equity_strip, // §14.23(g) [v1.7.0] loan_notes_unredeemed WARN
    selldown: selldownFromCore(core, assumptions), // §14.24(f) [v2.2.0] selldown_below_cost WARN
    exit, // §9.1 [v2.3.0] exit_debt_shortfall WARN
  });

  // §24.5 / §28.4 [v2.6.0]: with the valuation ON, a terminal year that is not a steady state is
  // disclosed — the Gordon value capitalises it for ever. Reads the RESOLVED terminal year, so
  // stating a steady state (§28) is what clears it.
  if (assumptions.valuation) {
    const issues = terminalSteadyStateIssues(terminalYearFromCore(core, assumptions));
    if (issues.length) {
      coherence.push({
        code: 'terminal_not_steady_state',
        severity: 'warn',
        message: `Terminal value capitalises a year that is not a steady state: ${issues.join('; ')}. State the terminal year (capex ÷ D&A, increase in NWC) in the valuation inputs (§28)`,
      });
    }
  }

  const output: Engine2ModelOutput = {
    facts,
    assumptions,
    derived: core.derived,
    sources_uses: core.sources_uses,
    operating: core.operating,
    tax: core.tax,
    tranches: core.tranches,
    revolver: core.revolver,
    waterfall: core.waterfall,
    balance_sheet: core.balance_sheet,
    credit,
    exit,
    returns,
    gp_fee_income: gpFeeIncome,
    bridge,
    coherence,
    fund,
    equity_strip, // §22.10 [v1.7.0]
    selldown: selldownFromCore(core, assumptions), // §23.10 [v2.2.0]
    scenarios: null,
    sensitivity: null,
    valuation: assumptions.valuation ? buildValuation(core, assumptions, monitoringAnnualByYear) : null,
  };

  return output;
}
