/** Fragility engine — stress testing framework for IC-grade deal analysis. */

import type {
  ModelState,
  FragilityAnalysis,
  FragilityStressResult,
} from '../dealEngineTypes';
import { deriveEntryFields, ensureListLengths } from './modelState';
import { runConvergedModel } from './converge';
import { injectAddOns, stripSyntheticAddOnTranches } from './addOns';

function deepClone(state: ModelState): ModelState {
  return JSON.parse(JSON.stringify(state));
}

function quickCalc(state: ModelState): { irr: number | null; moic: number } {
  stripSyntheticAddOnTranches(state);
  deriveEntryFields(state);
  ensureListLengths(state);
  // Inject add-on revenue + acquisition debt so fragility is a true sensitivity on
  // the base case (which includes add-ons), not on a lower-revenue stripped model.
  const { originalTranches } = injectAddOns(state);

  // Single shared solver (lib/engine/converge.ts) — same loop as the base case, so
  // a fragility stress is a true sensitivity, not a differently-converged model.
  const { returns: ret } = runConvergedModel(state);

  state.debt_tranches = originalTranches;
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

  // Fragility score: IRR drop as a fraction of base IRR.
  // Guard against division by a very small base IRR — below 5% the ratio is
  // numerically unstable and misleading; use absolute bps drop for classification instead.
  const irrDrop = (baseIrr ?? 0) - (comb.irr ?? 0);
  const score = baseIrr != null && baseIrr >= 0.05 ? irrDrop / baseIrr : 0;

  // Classification thresholds:
  //   Relative (base ≥ 5%): score < 20% → Robust, ≤ 40% → Moderate, > 40% → Fragile
  //   Absolute fallback:     bps drop < 400 → Robust, ≤ 800 → Moderate, > 800 → Fragile
  let classification: 'Robust' | 'Moderate Risk' | 'Fragile';
  if (baseIrr != null && baseIrr >= 0.05) {
    if (score < 0.20) classification = 'Robust';
    else if (score <= 0.40) classification = 'Moderate Risk';
    else classification = 'Fragile';
  } else {
    const bpsDrop = irrDrop * 10000;
    if (bpsDrop < 400) classification = 'Robust';
    else if (bpsDrop <= 800) classification = 'Moderate Risk';
    else classification = 'Fragile';
  }

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
