/** Fragility engine — stress testing framework for IC-grade deal analysis. */

import type {
  ModelState,
  FragilityAnalysis,
  FragilityStressResult,
} from '../dealEngineTypes';
import { deriveEntryFields, ensureListLengths } from './modelState';
import { buildProjections, updateProjectionsWithDebt } from './projections';
import { buildDebtSchedule } from './debtSchedule';
import { calculateReturns } from './returns';

function deepClone(state: ModelState): ModelState {
  return JSON.parse(JSON.stringify(state));
}

function quickCalc(state: ModelState): { irr: number | null; moic: number } {
  deriveEntryFields(state);
  ensureListLengths(state);
  const proj = buildProjections(state);
  const ds = buildDebtSchedule(state, proj);

  const hp = state.exit.holding_period;
  const pikByYear: number[] = [];
  for (let yrIdx = 0; yrIdx < hp; yrIdx++) {
    let pik = 0;
    if (ds.tranche_schedules.length) {
      for (let t = 0; t < ds.tranche_schedules.length; t++) {
        pik += ds.tranche_schedules[t][yrIdx].pik_accrual;
      }
    }
    pikByYear.push(pik);
  }

  const updatedProj = updateProjectionsWithDebt(
    proj, state, ds.total_cash_interest_by_year, pikByYear, ds.total_repayment_by_year,
  );
  const ret = calculateReturns(state, updatedProj, ds);
  return { irr: ret.irr, moic: ret.moic };
}

export function computeFragility(state: ModelState): FragilityAnalysis {
  const base = quickCalc(state);
  const baseIrr = base.irr;
  const baseMoic = base.moic;

  const stressResults: FragilityStressResult[] = [];

  // 1. Growth Shock: reduce all growth rates by 2%
  const growthShock = deepClone(state);
  growthShock.revenue.growth_rates = growthShock.revenue.growth_rates.map(
    (g) => Math.max(g - 0.02, -0.10),
  );
  growthShock.margins.margin_by_year = [];
  const gs = quickCalc(growthShock);
  stressResults.push({
    scenario: 'Growth Shock (-200bps)',
    irr: gs.irr,
    moic: gs.moic,
    delta_irr: (gs.irr ?? 0) - (baseIrr ?? 0),
    delta_moic: gs.moic - baseMoic,
  });

  // 2. Margin Shock: reduce EBITDA margin by 100bps
  const marginShock = deepClone(state);
  marginShock.margins.target_ebitda_margin = Math.max(
    marginShock.margins.target_ebitda_margin - 0.01, 0.01,
  );
  marginShock.margins.base_ebitda_margin = Math.max(
    marginShock.margins.base_ebitda_margin - 0.01, 0.01,
  );
  marginShock.margins.margin_by_year = [];
  const ms = quickCalc(marginShock);
  stressResults.push({
    scenario: 'Margin Shock (-100bps)',
    irr: ms.irr,
    moic: ms.moic,
    delta_irr: (ms.irr ?? 0) - (baseIrr ?? 0),
    delta_moic: ms.moic - baseMoic,
  });

  // 3. Multiple Shock: reduce exit multiple by 1.0x
  const multipleShock = deepClone(state);
  multipleShock.exit.exit_ebitda_multiple = Math.max(
    multipleShock.exit.exit_ebitda_multiple - 1.0, 1.0,
  );
  const mults = quickCalc(multipleShock);
  stressResults.push({
    scenario: 'Multiple Shock (-1.0x)',
    irr: mults.irr,
    moic: mults.moic,
    delta_irr: (mults.irr ?? 0) - (baseIrr ?? 0),
    delta_moic: mults.moic - baseMoic,
  });

  // 4. Combined Stress: all three simultaneously
  const combined = deepClone(state);
  combined.revenue.growth_rates = combined.revenue.growth_rates.map(
    (g) => Math.max(g - 0.02, -0.10),
  );
  combined.margins.target_ebitda_margin = Math.max(
    combined.margins.target_ebitda_margin - 0.01, 0.01,
  );
  combined.margins.base_ebitda_margin = Math.max(
    combined.margins.base_ebitda_margin - 0.01, 0.01,
  );
  combined.margins.margin_by_year = [];
  combined.exit.exit_ebitda_multiple = Math.max(
    combined.exit.exit_ebitda_multiple - 1.0, 1.0,
  );
  const comb = quickCalc(combined);
  stressResults.push({
    scenario: 'Combined Stress',
    irr: comb.irr,
    moic: comb.moic,
    delta_irr: (comb.irr ?? 0) - (baseIrr ?? 0),
    delta_moic: comb.moic - baseMoic,
  });

  // Fragility score
  const irrDrop = (baseIrr ?? 0) - (comb.irr ?? 0);
  const score = baseIrr && baseIrr > 0 ? irrDrop / baseIrr : 0;

  let classification: 'Robust' | 'Moderate Risk' | 'Fragile';
  if (score < 0.20) classification = 'Robust';
  else if (score <= 0.40) classification = 'Moderate Risk';
  else classification = 'Fragile';

  // Find dominant stress driver (largest individual IRR drop)
  const individualStresses = stressResults.slice(0, 3);
  const sorted = [...individualStresses].sort(
    (a, b) => Math.abs(b.delta_irr) - Math.abs(a.delta_irr),
  );
  const dominantDriver = sorted[0]?.scenario || 'N/A';

  // Generate IC-grade insights
  const insights: string[] = [];
  if (baseIrr != null && comb.irr != null) {
    insights.push(
      `IRR drops from ${(baseIrr * 100).toFixed(1)}% to ${(comb.irr * 100).toFixed(1)}% under combined mild stress`,
    );
  }
  if (sorted.length > 0) {
    const pctOfDrop = irrDrop > 0
      ? ((Math.abs(sorted[0].delta_irr) / irrDrop) * 100).toFixed(0)
      : '0';
    insights.push(
      `${pctOfDrop}% of downside driven by ${sorted[0].scenario.toLowerCase()}`,
    );
  }
  if (classification === 'Fragile') {
    insights.push('Deal is highly sensitive to assumption changes — requires conviction on base case');
  } else if (classification === 'Moderate Risk') {
    insights.push('Moderate sensitivity to stress — base case assumptions need to be well-supported');
  } else {
    insights.push('Returns are resilient under mild stress — structurally sound deal');
  }

  return {
    base_irr: baseIrr,
    base_moic: baseMoic,
    stress_results: stressResults,
    combined_irr: comb.irr,
    combined_moic: comb.moic,
    irr_drop: irrDrop,
    score,
    classification,
    dominant_stress_driver: dominantDriver,
    insights,
  };
}
