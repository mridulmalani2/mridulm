/**
 * lib/engine2/merger/validate.ts — Build rejections (SPEC §29.8). Each is a RangeError whose message
 * the analyst can act on; nothing is defaulted or clamped silently.
 */
import type { CompanyYear0, MergerAssumptions, MergerFacts, StandaloneForecast } from './types';

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

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

export function validateMerger(facts: MergerFacts, a: MergerAssumptions): void {
  const n = a.horizon_years;
  need(Number.isInteger(n) && n >= 1 && n <= 10, 'The forecast must run between 1 and 10 years.');
  year0('Acquirer', facts.acquirer.year0);
  year0('Target', facts.target.year0);
  need(fin(facts.acquirer.shares) && facts.acquirer.shares > 0, 'Acquirer: shares outstanding are needed to compute earnings per share.');
  need(fin(facts.target.net_debt), 'Target: net debt is needed to bridge enterprise value and equity value.');
  forecast('Acquirer', a.standalone.acquirer, n);
  forecast('Target', a.standalone.target, n);

  const p = a.price;
  need(p.driver === 'enterprise_value' ? fin(p.enterprise_value) : fin(p.equity_value), 'Enter the price paid for the target.');
  const fa = a.fees.advisory;
  need(fin(fa.value) && fa.value >= 0, 'Advisory fees must be zero or more.');
  need(fa.treatment === 'not_recognised', 'This version carries advisory fees as a use of funds only.');

  const fu = a.funding;
  need(fin(fu.acquisition_debt.rate), 'Enter the cost of the acquisition debt.');
  need(fin(fu.issue_price) && fu.issue_price > 0, 'Enter the price the new acquirer shares are issued at.');
  need(fu.plug === 'equity', 'This version balances sources and uses with new equity.');
  if (fu.leverage_cap) {
    need(fin(fu.leverage_cap.max) && fu.leverage_cap.max > 0, 'The leverage cap must be above zero.');
    need(Number.isInteger(fu.leverage_cap.test_year) && fu.leverage_cap.test_year >= 0 && fu.leverage_cap.test_year <= n,
      `The leverage test year must be one of the model's years (0 to ${n}).`);
  }
  if (fu.solve === 'max_debt_at_cap') {
    need(fu.leverage_cap !== null, 'Sizing the debt to the leverage cap needs a leverage cap.');
  } else {
    need(fin(fu.acquisition_debt.amount) && fu.acquisition_debt.amount >= 0, 'Enter the acquisition debt raised, or size it to the leverage cap.');
  }

  need(fin(a.synergies.run_rate), 'Enter the run-rate synergies (zero if none).');
  need(a.synergies.phasing.length === n + 1 && a.synergies.phasing.every(fin),
    `Synergy phasing needs one value for each year, the pro forma year included (${n + 1} values).`);
  need(fin(a.adjustments_tax_rate) && a.adjustments_tax_rate >= 0 && a.adjustments_tax_rate < 1, 'The tax rate on the deal adjustments must be between 0% and 100%.');
  need(a.interest_on_impact_cash === null || fin(a.interest_on_impact_cash), 'The rate on deal cash must be a number, or none.');
  need(a.combined_dividends.ratio.length === n && a.combined_dividends.ratio.every(fin),
    `The combined payout ratio needs one value for each of the ${n} forecast years.`);
}
