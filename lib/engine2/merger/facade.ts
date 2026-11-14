/**
 * lib/engine2/merger/facade.ts — THE entry point of the merger model (SPEC §29). Every displayed
 * merger number comes from `runMerger`.
 */
import { addBlocks, ratio, withRatios, type Amounts } from './rows';
import { impactRows, type ImpactResult } from './adjustments';
import { purchaseAccounting, rollBalanceSheet } from './ppa';
import { maxSolvedDebt, mergerDeal } from './sourcesUses';
import { standaloneRows } from './standalone';
import { validateMerger } from './validate';
import type { MergerAssumptions, MergerBlock, MergerFacts, MergerFlag, MergerOutput, MergerYear, PpaResult } from './types';

interface Pass {
  deal: ReturnType<typeof mergerDeal>;
  ppa: PpaResult | null;
  impact: ImpactResult;
  raw: Record<MergerBlock, Amounts[]>;
}
interface Core extends Pass {
  blocks: Record<MergerBlock, MergerYear[]>;
}

/** One pass of the model's amounts with the open tranche fixed at `solvedDebt`. No solver inside
 *  (SPEC §5). Ratios are left to `core`, so the leverage solve does not pay for them on every step. */
function pass(facts: MergerFacts, a: MergerAssumptions, solvedDebt: number | null): Pass {
  const n = a.horizon_years;
  const deal = mergerDeal(facts, a, solvedDebt);
  const ppa = a.ppa ? purchaseAccounting(facts, a, deal) : null;
  // §29.14: with a balance sheet, every block's year 1 opens from the closing balance sheet
  const refi = a.target_debt === 'refinance_all';
  const acquirer = standaloneRows(facts.acquirer, a.standalone.acquirer, n, {
    debtFree: false, countShares: true, fraction1: 1, year1OpenCash: ppa ? facts.acquirer.balance!.cash : null,
  });
  const target = standaloneRows(facts.target, a.standalone.target, n, {
    debtFree: refi, countShares: false, fraction1: a.timing.fraction_of_year_1,
    year1OpenCash: ppa ? (refi ? 0 : facts.target.balance!.cash) : null,
  });
  const impact = impactRows(a, deal, acquirer, target, ppa, n);
  const sum = addBlocks(acquirer, target);
  const combined: Amounts[] = addBlocks(sum, impact.rows);
  return { deal, ppa, impact, raw: { acquirer, target, sum, impact: impact.rows, combined } };
}

function core(facts: MergerFacts, a: MergerAssumptions, solvedDebt: number | null): Core {
  const p = pass(facts, a, solvedDebt);
  // §29.17: in-block growth compares full years; under a part-year close the target and impact
  // year 1 are owned for f of the year, so their growth is read on the full-year run
  const f = a.timing.fraction_of_year_1;
  const fullYear = f < 1 ? pass(facts, { ...a, timing: { fraction_of_year_1: 1 } }, solvedDebt).raw : p.raw;
  const r = (b: MergerBlock, perShare: boolean) => withRatios(p.raw[b], perShare, fullYear[b]);
  return {
    ...p,
    blocks: {
      acquirer: r('acquirer', true),
      target: r('target', false),
      sum: r('sum', false),
      // the impact block's dividends include the target's income, so dividends / impact income is
      // not a payout ratio; the policy ratio is an input, shown as such (§29.6)
      impact: r('impact', false).map((x) => ({ ...x, payout: null })),
      combined: r('combined', true),
    },
  };
}

const capMetric = (c: Pass, testYear: number): number | null => {
  const y = c.raw.combined[testYear];
  return ratio(y.net_debt, y.ebitda);
};

/**
 * §29.7: the largest open-tranche debt that keeps combined net debt / EBITDA at the cap in the test
 * year. An OUTER deterministic bisection around the pure model pass: g(D) = metric(D) − cap is
 * continuous and increasing in D. Bracket [0, the debt that leaves no new equity]; equity is the residual.
 */
export function sizeDebtToCap(facts: MergerFacts, a: MergerAssumptions): { debt: number; binding: boolean; iterations: number } {
  const cap = a.funding.leverage_cap!;
  const g = (d: number): number => {
    const m = capMetric(pass(facts, a, d), cap.test_year);
    if (m === null) throw new RangeError('Combined EBITDA is zero in the leverage test year, so leverage has no meaning there.');
    return m - cap.max;
  };
  const hi0 = maxSolvedDebt(facts, a);
  const gLo = g(0);
  if (gLo > 0) return { debt: 0, binding: false, iterations: 0 };
  // no room for debt at all (the other sources cover the uses): zero is the only size
  if (hi0 <= 1e-9) return { debt: 0, binding: false, iterations: 0 };
  const gHi = g(hi0);
  if (!(gHi > gLo)) throw new RangeError('Leverage does not rise with the debt raised, so the debt cannot be sized to the cap.');
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
  const solvedDebt = solve ? solve.debt : null;
  const c = core(facts, a, solvedDebt);
  const { blocks, deal, ppa, impact } = c;
  const tr = a.adjustments_tax_rate;

  const acqEps = blocks.acquirer.map((r) => r.eps);
  const combEps = blocks.combined.map((r) => r.eps);
  const accr = (e: number | null, t: number): number | null => {
    const s = acqEps[t];
    return e === null || s === null || s <= 0 ? null : e / s - 1;
  };
  const accretion = combEps.map(accr);
  // §29.18: adjusted EPS adds back after-tax amortisation of acquired intangibles and one-offs
  const combAdj = blocks.combined.map((r, t) => {
    const am = ppa ? ppa.schedule[t].intangible_amortisation : 0;
    return ratio(r.net_income_group + (1 - tr) * (am - r.one_offs), r.shares);
  });
  const syn = a.synergies;
  const be = blocks.combined.map((r, t) => {
    const s = acqEps[t];
    if (s === null || s <= 0) return null;
    return (s * r.shares - r.net_income_group) / (1 - tr);
  });
  const costSyn = c.raw.impact.map((_, t) => syn.run_rate * syn.phasing[t] * (t === 1 ? a.timing.fraction_of_year_1 : 1));
  const breakeven = be.map((x, t) => (x === null ? null : costSyn[t] + x));
  const tgtCosts = blocks.target.map((r) => r.revenue - r.ebitda);

  let year1Full: MergerOutput['eps']['year1_full_year'] = null;
  if (a.timing.fraction_of_year_1 < 1) {
    const y1 = pass(facts, { ...a, timing: { fraction_of_year_1: 1 } }, solvedDebt).raw.combined[1];
    const e = ratio(y1.net_income_group, y1.shares);
    year1Full = { combined: e, accretion: accr(e, 1) };
  }

  const acqDps = blocks.acquirer.map((r) => r.dps);
  const combDps = blocks.combined.map((r) => r.dps);

  const cap = a.funding.leverage_cap;
  const actual = cap ? capMetric(c, cap.test_year) : null;

  const balance = ppa ? rollBalanceSheet(ppa.opening.combined, c.raw.combined, ppa, impact.feeAmortisation, n) : null;

  const flags: MergerFlag[] = [];
  if (cap && actual !== null && actual > cap.max + 1e-9) {
    flags.push({ code: 'leverage_cap_breached', severity: 'warn', message: `Combined net debt is ${actual.toFixed(2)}x EBITDA in the test year, above the ${cap.max.toFixed(2)}x cap${solve ? ', even with no acquisition debt' : ''}.` });
  }
  if (solve && !solve.binding && solve.debt > 0) {
    flags.push({ code: 'leverage_cap_not_binding', severity: 'warn', message: 'The deal can be funded entirely with debt and still stay under the leverage cap, so no new equity is raised.' });
  }
  if (acqEps.some((e) => e === null || e <= 0)) {
    flags.push({ code: 'acquirer_eps_not_positive', severity: 'warn', message: 'The acquirer does not earn a profit in every year, so accretion is not shown for those years.' });
  }
  if (blocks.combined.some((r) => r.pbt < 0)) {
    flags.push({ code: 'combined_loss_flat_tax', severity: 'warn', message: 'The combined company makes a pre-tax loss in at least one year; the tax credit is taken at the flat rate, with no loss carried forward.' });
  }
  if (ppa && ppa.goodwill < 0) {
    flags.push({ code: 'bargain_purchase', severity: 'warn', message: `The price is below the fair value of the net assets acquired, so goodwill is negative (${ppa.goodwill.toFixed(1)}). Check the write-ups and intangibles before relying on it.` });
  }
  if (deal.offer_per_share !== null && facts.target.securities.length === 0 && facts.target.reported_dilutive_increment) {
    flags.push({ code: 'dilution_from_reported_increment', severity: 'note', message: 'Diluted target shares use the dilutive increment the filing reports, measured at the average market price rather than the offer price. Enter the option table to measure it at the offer.' });
  }
  if (deal.converted_principal > 0) {
    flags.push({ code: 'convertible_converts', severity: 'note', message: `Convertibles with ${deal.converted_principal.toFixed(1)} of principal convert at the offer price, so they are paid as shares and leave net debt.` });
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
    eps: {
      acquirer: acqEps,
      combined: combEps,
      accretion,
      combined_adjusted: combAdj,
      accretion_adjusted: combAdj.map(accr),
      breakeven_synergies: breakeven,
      extra_synergies_needed: be.map((x) => (x === null ? null : Math.max(0, x))),
      breakeven_pct_target_costs: breakeven.map((x, t) => (x === null || Math.abs(tgtCosts[t]) < 1e-12 ? null : x / tgtCosts[t])),
      year1_full_year: year1Full,
    },
    dps: {
      acquirer: acqDps,
      combined: combDps,
      uplift: combDps.map((d, t) => (d === null || acqDps[t] === null ? null : d - (acqDps[t] as number))),
    },
    leverage: {
      cap: cap ? { max: cap.max, test_year: cap.test_year, actual, headroom: actual === null ? null : cap.max - actual } : null,
      solve,
    },
    debt: { tranches: impact.tranches },
    ppa,
    balance_sheet: balance,
    checks: {
      sources_minus_uses: deal.total_sources - deal.total_uses,
      // §29.9 invariant 3: the combined block's cash, rolled line by line, equals the blocks to its left
      combined_cash: blocks.combined.map((r, t) => r.cash_begin + r.cash_change - (blocks.sum[t].cash_end + blocks.impact[t].cash_end)),
      balance_sheet: balance ? balance.map((b) => b.total_assets - b.total_liabilities_and_equity) : null,
    },
    flags,
  };
}
