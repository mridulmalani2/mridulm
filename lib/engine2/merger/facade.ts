/**
 * lib/engine2/merger/facade.ts — THE entry point of the merger model (SPEC §29). Every displayed
 * merger number comes from `runMerger`.
 */
import { addBlocks, withRatios, type Amounts } from './rows';
import { impactRows } from './adjustments';
import { mergerDeal, totalUses } from './sourcesUses';
import { standaloneRows } from './standalone';
import { validateMerger } from './validate';
import type { MergerAssumptions, MergerBlock, MergerFacts, MergerFlag, MergerOutput, MergerYear } from './types';

interface Core {
  deal: ReturnType<typeof mergerDeal>;
  blocks: Record<MergerBlock, MergerYear[]>;
}

/** One pass of the model with the acquisition debt fixed at `debt`. No solver inside (SPEC §5). */
function core(facts: MergerFacts, a: MergerAssumptions, debt: number): Core {
  const n = a.horizon_years;
  const deal = mergerDeal(facts, a, debt);
  const acquirer = standaloneRows(facts.acquirer, a.standalone.acquirer, n, { debtFree: false, countShares: true });
  const target = standaloneRows(facts.target, a.standalone.target, n, { debtFree: a.target_debt === 'refinance_all', countShares: false });
  const impact = impactRows(a, deal, target, target.map((r) => r.dividends), n);
  const sum = addBlocks(acquirer, target);
  const combined: Amounts[] = addBlocks(sum, impact);
  return {
    deal,
    blocks: {
      acquirer: withRatios(acquirer, true),
      target: withRatios(target, false),
      sum: withRatios(sum, false),
      // the impact block's dividends include the target's income, so dividends / impact income is
      // not a payout ratio; the policy ratio is an input, shown as such (§29.6)
      impact: withRatios(impact, false).map((r) => ({ ...r, payout: null })),
      combined: withRatios(combined, true),
    },
  };
}

const capMetric = (c: Core, testYear: number): number | null => c.blocks.combined[testYear].nd_ebitda;

/**
 * §29.7: the largest acquisition debt that keeps combined net debt / EBITDA at the cap in the test
 * year. An OUTER deterministic bisection around the pure model pass: g(D) = metric(D) − cap is
 * continuous and increasing in D (more debt: more debt and more interest, less cash). Bracket
 * [0, total uses]; equity is the residual.
 */
export function sizeDebtToCap(facts: MergerFacts, a: MergerAssumptions): { debt: number; binding: boolean; iterations: number } {
  const cap = a.funding.leverage_cap!;
  const g = (d: number): number => {
    const m = capMetric(core(facts, a, d), cap.test_year);
    if (m === null) throw new RangeError('Combined EBITDA is zero in the leverage test year, so leverage has no meaning there.');
    return m - cap.max;
  };
  const hi0 = totalUses(facts, a);
  const gLo = g(0);
  const gHi = g(hi0);
  if (!(gHi > gLo)) throw new RangeError('Leverage does not rise with the debt raised, so the debt cannot be sized to the cap.');
  if (gLo > 0) return { debt: 0, binding: false, iterations: 0 };
  if (gHi <= 0) return { debt: hi0, binding: false, iterations: 0 };
  let lo = 0;
  let hi = hi0;
  let i = 0;
  while (hi - lo > 1e-10 * Math.max(1, hi0) && i < 200) {
    const mid = (lo + hi) / 2;
    if (g(mid) <= 0) lo = mid; else hi = mid;
    i++;
  }
  return { debt: (lo + hi) / 2, binding: true, iterations: i };
}

export function runMerger(facts: MergerFacts, a: MergerAssumptions): MergerOutput {
  validateMerger(facts, a);
  const n = a.horizon_years;
  const solve = a.funding.solve === 'max_debt_at_cap' ? sizeDebtToCap(facts, a) : null;
  const debt = solve ? solve.debt : (a.funding.acquisition_debt.amount as number);
  const c = core(facts, a, debt);
  const { blocks, deal } = c;

  const acqEps = blocks.acquirer.map((r) => r.eps);
  const combEps = blocks.combined.map((r) => r.eps);
  const accretion = combEps.map((e, t) => {
    const s = acqEps[t];
    return e === null || s === null || s <= 0 ? null : e / s - 1;
  });
  const acqDps = blocks.acquirer.map((r) => r.dps);
  const combDps = blocks.combined.map((r) => r.dps);

  const cap = a.funding.leverage_cap;
  const actual = cap ? capMetric(c, cap.test_year) : null;

  const flags: MergerFlag[] = [];
  if (cap && actual !== null && actual > cap.max + 1e-9) {
    flags.push({ code: 'leverage_cap_breached', severity: 'warn', message: `Combined net debt is ${actual.toFixed(2)}x EBITDA in the test year, above the ${cap.max.toFixed(2)}x cap${solve ? ', even with no acquisition debt' : ''}.` });
  }
  if (solve && !solve.binding && solve.debt > 0) {
    flags.push({ code: 'leverage_cap_not_binding', severity: 'warn', message: 'The deal can be funded entirely with debt and still stay under the leverage cap, so no new shares are issued.' });
  }
  if (acqEps.some((e) => e === null || e <= 0)) {
    flags.push({ code: 'acquirer_eps_not_positive', severity: 'warn', message: 'The acquirer does not earn a profit in every year, so accretion is not shown for those years.' });
  }
  if (blocks.combined.some((r) => r.pbt < 0)) {
    flags.push({ code: 'combined_loss_flat_tax', severity: 'warn', message: 'The combined company makes a pre-tax loss in at least one year; the tax credit is taken at the flat rate, with no loss carried forward.' });
  }

  return {
    facts,
    assumptions: a,
    years: Array.from({ length: n + 1 }, (_, t) => ({
      label: t === 0 ? `${facts.acquirer.fiscal_year}A pro forma` : `${facts.acquirer.fiscal_year + t}E`,
      fiscal_year: facts.acquirer.fiscal_year + t,
      kind: t === 0 ? 'pro_forma_actual' : 'forecast',
    })),
    deal,
    blocks,
    eps: { acquirer: acqEps, combined: combEps, accretion },
    dps: {
      acquirer: acqDps,
      combined: combDps,
      uplift: combDps.map((d, t) => (d === null || acqDps[t] === null ? null : d - (acqDps[t] as number))),
    },
    leverage: {
      cap: cap ? { max: cap.max, test_year: cap.test_year, actual, headroom: actual === null ? null : cap.max - actual } : null,
      solve,
    },
    checks: {
      sources_minus_uses: deal.total_sources - deal.total_uses,
      // §29.9 invariant 3: the combined block's cash, rolled line by line, equals the blocks to its left
      combined_cash: blocks.combined.map((r, t) => r.cash_begin + r.cash_change - (blocks.sum[t].cash_end + blocks.impact[t].cash_end)),
    },
    flags,
  };
}

