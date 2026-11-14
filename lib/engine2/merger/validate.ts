/**
 * lib/engine2/merger/validate.ts — Build rejections (SPEC §29.8, §29.19). Each is a RangeError whose
 * message the analyst can act on; nothing is defaulted or clamped silently.
 */
import { standaloneRows } from './standalone';
import type { CompanyYear0, MergerAssumptions, MergerFacts, MergerSide, StandaloneForecast } from './types';

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const rate01 = (v: unknown): boolean => fin(v) && v >= 0 && v < 1;

function need(ok: boolean, msg: string): void {
  if (!ok) throw new RangeError(msg);
}

function year0(who: string, y: CompanyYear0): void {
  for (const [k, v] of Object.entries(y)) need(fin(v), `${who}: the last actual year is missing ${k.replace(/_/g, ' ')}.`);
}

function forecast(who: string, f: StandaloneForecast, n: number): void {
  need(fin(f.tax_rate) && f.tax_rate >= 0 && f.tax_rate < 1, `${who}: the tax rate must be between 0% and 100%.`);
  for (const [k, v] of Object.entries(f)) {
    if (k === 'tax_rate') continue;
    const arr = v as number[];
    need(Array.isArray(arr) && arr.length === n, `${who}: ${k.replace(/_/g, ' ')} needs one value for each of the ${n} forecast years.`);
    need(arr.every(fin), `${who}: ${k.replace(/_/g, ' ')} has a blank year.`);
  }
}

function balance(who: string, side: MergerSide): void {
  const b = side.balance;
  need(b !== null, `${who}: purchase accounting needs the balance sheet at the end of the last actual year.`);
  for (const [k, v] of Object.entries(b!)) need(fin(v), `${who}: the balance sheet is missing ${k.replace(/_/g, ' ')}.`);
  const gap = b!.cash + b!.nwc + b!.fixed_assets + b!.goodwill + b!.other_net_assets
    - (side.year0.debt + b!.deferred_tax_liability + b!.equity_parent + b!.nci_equity);
  need(Math.abs(gap) <= 0.01, `${who}: the balance sheet does not balance (assets less liabilities and equity is ${gap.toFixed(2)}).`);
}

const series = (arr: unknown, len: number, what: string): void => {
  need(Array.isArray(arr) && arr.length === len && arr.every(fin), `${what} needs ${len} values with no blanks.`);
};

export function validateMerger(facts: MergerFacts, a: MergerAssumptions): void {
  const n = a.horizon_years;
  need(Number.isInteger(n) && n >= 1 && n <= 10, 'The forecast must run between 1 and 10 years.');
  year0('Acquirer', facts.acquirer.year0);
  year0('Target', facts.target.year0);
  need(fin(facts.acquirer.shares) && facts.acquirer.shares > 0, 'Acquirer: shares outstanding are needed to compute earnings per share.');
  need(fin(facts.target.net_debt), 'Target: net debt is needed to bridge enterprise value and equity value.');
  forecast('Acquirer', a.standalone.acquirer, n);
  forecast('Target', a.standalone.target, n);

  // §29.11 price and securities
  const tgt = facts.target;
  need(tgt.shares === null || (fin(tgt.shares) && tgt.shares > 0), 'Target: shares outstanding must be above zero.');
  need(tgt.reported_dilutive_increment === null || (fin(tgt.reported_dilutive_increment) && tgt.reported_dilutive_increment >= 0), 'Target: the reported dilutive increment must be zero or more.');
  if (tgt.securities.length > 0) need(fin(tgt.shares), 'Target: dilutive securities need the basic share count.');
  for (const s of tgt.securities) {
    if (s.kind === 'option') need(fin(s.count) && s.count > 0 && fin(s.strike) && s.strike > 0, 'Target: each option line needs a count and a strike above zero.');
    else if (s.kind === 'rsu') need(fin(s.count) && s.count > 0, 'Target: each restricted share line needs a count above zero.');
    else need(fin(s.principal) && s.principal > 0 && fin(s.conversion_price) && s.conversion_price > 0, 'Target: each convertible needs a principal and a conversion price above zero.');
  }
  const p = a.price;
  if (p.driver === 'enterprise_value') need(fin(p.enterprise_value), 'Enter the price paid for the target.');
  else if (p.driver === 'equity_value') need(fin(p.equity_value), 'Enter the price paid for the target.');
  else if (p.driver === 'offer_per_share') {
    need(fin(p.offer_per_share) && p.offer_per_share > 0, 'Enter the offer price per share.');
    need(fin(tgt.shares), 'Target: an offer per share needs the share count.');
  } else {
    need(fin(p.premium) && p.premium > -1, 'Enter the premium offered.');
    need(fin(tgt.shares), 'Target: an offer at a premium needs the share count.');
    if (p.premium_to === 'current') need(fin(tgt.share_price) && tgt.share_price > 0, 'Target: a premium to the current price needs the current share price.');
    else need(fin(a.unaffected_price) && a.unaffected_price > 0, 'Enter the unaffected share price the premium is measured against.');
  }
  need(a.unaffected_price === null || (fin(a.unaffected_price) && a.unaffected_price > 0), 'The unaffected share price must be above zero.');

  // §29.12 consideration and fees
  need(fin(a.consideration.pct_stock) && a.consideration.pct_stock >= 0 && a.consideration.pct_stock <= 1, 'The share of the price paid in acquirer shares must be between 0% and 100%.');
  const fa = a.fees.advisory;
  need(fin(fa.value) && fa.value >= 0, 'Advisory fees must be zero or more.');
  need(rate01(a.fees.equity_issuance_pct), 'The equity issuance fee must be between 0% and 100%.');
  need(fin(a.fees.other_one_off) && a.fees.other_one_off >= 0, 'Other one-off costs must be zero or more.');

  // §29.13 funding
  const fu = a.funding;
  need(fin(fu.issue_price) && fu.issue_price > 0, 'Enter the price the new acquirer shares are issued at.');
  need(fu.tranches.length >= 1, 'Add at least one acquisition debt tranche (an amount of zero if there is no new debt).');
  for (const t of fu.tranches) {
    need(fin(t.rate) && t.rate >= 0, `${t.name}: enter its interest rate.`);
    need(t.amount === null || (fin(t.amount) && t.amount >= 0), `${t.name}: the amount must be zero or more.`);
    need(rate01(t.fee_pct), `${t.name}: the financing fee must be between 0% and 100%.`);
    need(fin(t.fee_years) && t.fee_years >= 1, `${t.name}: the fee is amortised over at least one year.`);
    series(t.repayment, n, `${t.name}: scheduled repayments`);
    need(t.repayment.every((x) => x >= 0), `${t.name}: scheduled repayments are entered as positive amounts.`);
  }
  const open = fu.tranches.filter((t) => t.amount === null).length;
  if (fu.plug === 'debt') {
    need(open === 1, 'When debt balances the table, leave exactly one tranche without an amount.');
    need(fu.solve === 'none', 'Debt cannot both balance the table and be sized to the leverage cap; balance with equity instead.');
    need(fin(fu.equity_raise) && fu.equity_raise >= 0, 'The equity raised must be zero or more.');
  } else {
    need(fin(fu.equity_raise) && fu.equity_raise === 0, 'When new equity balances the table, its amount is solved, so leave the equity raised at zero.');
    if (fu.solve === 'max_debt_at_cap') {
      need(fu.leverage_cap !== null, 'Sizing the debt to the leverage cap needs a leverage cap.');
      need(open === 1, 'Sizing the debt to the leverage cap needs exactly one tranche without an amount.');
    } else {
      need(open === 0, 'Enter every tranche amount, or size one to the leverage cap.');
    }
  }
  need(fin(fu.acquirer_cash_used) && fu.acquirer_cash_used >= 0, 'The acquirer cash used must be zero or more.');
  // the cash the acquirer has at the close: its balance sheet when given, else its year-0 cash roll
  const acqCash = facts.acquirer.balance && fin(facts.acquirer.balance.cash)
    ? facts.acquirer.balance.cash
    : standaloneRows(facts.acquirer, a.standalone.acquirer, n, { debtFree: false, countShares: true, fraction1: 1, year1OpenCash: null })[0].cash_end;
  need(fu.acquirer_cash_used <= acqCash + 1e-9, `The acquirer cannot use more cash than it has at the close (${acqCash.toFixed(1)}).`);
  if (fu.leverage_cap) {
    need(fin(fu.leverage_cap.max) && fu.leverage_cap.max > 0, 'The leverage cap must be above zero.');
    need(Number.isInteger(fu.leverage_cap.test_year) && fu.leverage_cap.test_year >= 0 && fu.leverage_cap.test_year <= n,
      `The leverage test year must be one of the model's years (0 to ${n}).`);
  }
  if (a.sweep) {
    need(fin(a.sweep.pct) && a.sweep.pct >= 0 && a.sweep.pct <= 1, 'The cash sweep must be between 0% and 100%.');
    need(fin(a.sweep.min_cash) && a.sweep.min_cash >= 0, 'The minimum cash for the sweep must be zero or more.');
  }

  // §29.15 synergies
  const syn = a.synergies;
  need(fin(syn.run_rate), 'Enter the run-rate synergies (zero if none).');
  series(syn.phasing, n + 1, 'Synergy phasing (the pro forma year included)');
  if (syn.revenue) {
    need(fin(syn.revenue.run_rate), 'Enter the run-rate revenue synergies.');
    series(syn.revenue.phasing, n + 1, 'Revenue synergy phasing (the pro forma year included)');
    need(fin(syn.revenue.flow_through_margin) && syn.revenue.flow_through_margin >= 0 && syn.revenue.flow_through_margin <= 1, 'The margin on revenue synergies must be between 0% and 100%.');
  }
  if (syn.cost_to_achieve) {
    series(syn.cost_to_achieve, n, 'Costs to achieve');
    need(syn.cost_to_achieve.every((x) => x <= 0), 'Costs to achieve are entered as negative amounts.');
  }
  if (syn.dis_synergies) {
    series(syn.dis_synergies, n + 1, 'Dis-synergies (the pro forma year included)');
    need(syn.dis_synergies.every((x) => x <= 0), 'Dis-synergies are entered as negative amounts.');
  }
  need(fin(a.adjustments_tax_rate) && a.adjustments_tax_rate >= 0 && a.adjustments_tax_rate < 1, 'The tax rate on the deal adjustments must be between 0% and 100%.');
  need(a.interest_on_impact_cash === null || fin(a.interest_on_impact_cash), 'The rate on deal cash must be a number, or none.');
  need(a.combined_dividends.ratio.length === n && a.combined_dividends.ratio.every(fin),
    `The combined payout ratio needs one value for each of the ${n} forecast years.`);

  // §29.17 timing
  const f = a.timing.fraction_of_year_1;
  need(fin(f) && f > 0 && f <= 1, 'The share of the first year after the close must be above 0% and at most 100%.');
  if (f < 1) need(!a.year0_cash_carried, 'A close part-way through the first year needs the pro forma year\'s cash left uncarried.');

  // §29.14, §29.16 purchase accounting
  if (a.ppa) {
    const pp = a.ppa;
    balance('Acquirer', facts.acquirer);
    balance('Target', facts.target);
    need(fa.treatment === 'expensed', 'With purchase accounting, advisory fees are expensed at the close.');
    need(!a.year0_cash_carried, 'Purchase accounting closes the deal at the end of the last actual year, so the pro forma year\'s cash is not carried.');
    need(fin(pp.ppe_writeup) && pp.ppe_writeup >= 0, 'The PP&E write-up must be zero or more.');
    need(fin(pp.ppe_life_years) && pp.ppe_life_years >= 1, 'The PP&E write-up needs a life of at least one year.');
    for (const x of pp.intangibles) {
      need(fin(x.amount) && x.amount >= 0, `${x.name}: the amount must be zero or more.`);
      need(x.life_years === null || (fin(x.life_years) && x.life_years >= 1), `${x.name}: the life must be at least one year, or indefinite.`);
    }
    need(fin(pp.debt_fair_value_adjustment) && pp.debt_fair_value_adjustment >= 0, 'The debt fair value adjustment must be zero or more.');
    if (pp.debt_fair_value_adjustment > 0) {
      need(a.target_debt === 'assume_all', 'A fair value adjustment applies only to target debt that is assumed.');
      need(fin(pp.debt_fv_years) && pp.debt_fv_years >= 1, 'The debt fair value adjustment needs at least one year to amortise over.');
    }
    if (pp.structure === 'asset_purchase') {
      need(fin(pp.tax_goodwill_life_years) && pp.tax_goodwill_life_years >= 1, 'An asset purchase needs the years over which goodwill is deducted for tax.');
    }
  } else {
    need(fa.treatment === 'not_recognised' || fa.treatment === 'expensed', 'Choose how advisory fees are treated.');
  }
}
