/**
 * engine2/facade.ts — `runModel(facts, assumptions)` (Phase C build order #5, completed
 * across C6–C9 as the downstream blocks landed).
 *
 * Pure assembly in the §5 order: runCore (operating/tax/debt/BS year loop) → §9 exit →
 * §9/§10 returns + GP-fee memo → §11 credit → §12 bridge → §16 coherence → §13
 * scenarios/sensitivity (opt-in via `options`; every scenario is a FULL re-run with the
 * entry frozen). Nothing here computes finance — modules do; the facade wires them and
 * enforces the §14.16 single-source mirrors by construction (each block reads the same
 * upstream object, never a recomputation).
 *
 * NOTE (v1.0.3 pending): ModelOutput.bridge is typed via Engine2ValueBridge until the
 * amendment PR lands the walkdown.exit_costs / multiple_change_bar contract in types.ts.
 *
 * No imports from lib/engine (boundary test).
 */

import { buildBridge, type Engine2ValueBridge } from './bridge';
import { runCoherence } from './check';
import { buildCreditYear, type CreditYearInputs } from './credit';
import { buildExit, monitoringTermination, type ExitInputs } from './exit';
import { buildGpFeeIncome, buildReturns } from './returns';
import { runCore, type EngineCore } from './sequence';
import type { CreditYear, DealAssumptions, DealFacts, ExitBlock, ModelOutput, ReturnStreams } from './types';

export type Engine2ModelOutput = Omit<ModelOutput, 'bridge'> & { bridge: Engine2ValueBridge };

/** Assemble the §9 exit block from the core (shared by facade and scenarios.ts). */
export function exitFromCore(core: EngineCore, assumptions: DealAssumptions): ExitBlock {
  const N = assumptions.entry.hold_years;
  const inputs: ExitInputs = {
    exit_year_ebitda_adj: core.operating[N - 1].ebitda_adj,
    last_growth: assumptions.operations.growth[N - 1],
    debt_payoff:
      core.final_debt_state.term_balances.reduce((a, b) => a + b, 0) + core.final_debt_state.revolver_drawn,
    closing_cash: core.waterfall[N - 1].closing_cash,
    unamortized_writeoff: core.exit_writeoff,
    invested_equity_total: core.sources_uses.sponsor_equity + core.sources_uses.rollover_equity,
    rollover_equity: core.sources_uses.rollover_equity,
  };
  return buildExit(assumptions, inputs);
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
    enterprise_value: core.derived.enterprise_value,
    transaction_costs: core.sources_uses.transaction_costs,
    unlevered_fcf: core.unlevered_fcf,
    exit,
    hold_years: assumptions.entry.hold_years,
  });
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

/**
 * The base-case run. §13 scenario/sensitivity blocks are attached by scenarios.ts
 * (`runModelWithScenarios`) — scenarios call runModel per re-run, so the dependency
 * points one way and the facade stays acyclic.
 */
export function runModel(facts: DealFacts, assumptions: DealAssumptions): Engine2ModelOutput {
  const core = runCore(facts, assumptions);
  const exit = exitFromCore(core, assumptions);
  const returns = returnsFromCore(core, exit, assumptions);
  const credit = creditFromCore(core, assumptions);

  const monitoringAnnualByYear = core.build.years.map((y) => y.monitoring_fee);
  const gpFeeIncome = buildGpFeeIncome(
    assumptions.fees.monitoring,
    monitoringAnnualByYear,
    monitoringTermination(assumptions.fees.monitoring),
  );

  const bridge = buildBridge({
    entry_multiple: core.derived.entry_multiple,
    entry_ebitda: core.derived.enterprise_value / core.derived.entry_multiple,
    entry_net_debt: core.derived.total_debt_at_par - core.sources_uses.cash_to_balance_sheet,
    entry_costs:
      core.sources_uses.transaction_costs + core.sources_uses.financing_fees + core.sources_uses.oid_funded,
    entry_equity_pre_promote_total: core.sources_uses.sponsor_equity + core.sources_uses.rollover_equity,
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
  });

  const coherence = runCoherence({
    facts,
    assumptions,
    sources_uses: core.sources_uses,
    derived: core.derived,
    waterfall: core.waterfall,
    balance_sheet: core.balance_sheet,
    credit,
    covenants: assumptions.covenants,
  });

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
    scenarios: null,
    sensitivity: null,
  };

  return output;
}
