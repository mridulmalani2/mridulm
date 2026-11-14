/**
 * lib/engine2/merger/ppa.ts — purchase accounting, the opening and forecast combined balance sheet
 * (SPEC §29.14).
 */
import type { Amounts } from './rows';
import type { BalanceSheet, MergerAssumptions, MergerDeal, MergerFacts, MergerSide, PpaResult, PurchaseAccounting } from './types';

const BS_ASSETS = ['cash', 'nwc', 'fixed_assets', 'acquired_intangibles', 'goodwill', 'deferred_financing_fees', 'other_net_assets'] as const;
const BS_CLAIMS = ['debt', 'debt_fair_value', 'deferred_tax_liability', 'equity_parent', 'nci_equity'] as const;

export function totals(b: Omit<BalanceSheet, 'total_assets' | 'total_liabilities_and_equity'>): BalanceSheet {
  const total_assets = BS_ASSETS.reduce((s, k) => s + b[k], 0);
  const total_liabilities_and_equity = BS_CLAIMS.reduce((s, k) => s + b[k], 0);
  return { ...b, total_assets, total_liabilities_and_equity };
}

export function sideBalanceSheet(side: MergerSide): BalanceSheet {
  const b = side.balance!;
  return totals({
    cash: b.cash, nwc: b.nwc, fixed_assets: b.fixed_assets, acquired_intangibles: 0, goodwill: b.goodwill,
    deferred_financing_fees: 0, other_net_assets: b.other_net_assets,
    debt: side.year0.debt, debt_fair_value: 0, deferred_tax_liability: b.deferred_tax_liability,
    equity_parent: b.equity_parent, nci_equity: b.nci_equity,
  });
}

/** The tax saving on an expensed, deductible advisory fee: a receivable recovered in year 1 (§29.16). */
export function advisoryReceivable(a: MergerAssumptions, deal: MergerDeal): number {
  const fa = a.fees.advisory;
  return fa.treatment === 'expensed' && fa.tax_deductible ? deal.fees * a.adjustments_tax_rate : 0;
}

/** Straight line over `life`, × s, capped at what remains of `amount` after `done`. */
const straight = (amount: number, life: number, s: number, done: number): number => Math.max(0, Math.min((amount / life) * s, amount - done));

/** §29.14: goodwill and the per-year schedule of step-up D&A, fair value amortisation and deferred tax. */
export function purchaseAccounting(facts: MergerFacts, a: MergerAssumptions, deal: MergerDeal): PpaResult {
  const p = a.ppa as PurchaseAccounting;
  const n = a.horizon_years;
  const f = a.timing.fraction_of_year_1;
  const rate = a.adjustments_tax_rate;
  const tb = facts.target.balance!;
  const stock = p.structure === 'stock_purchase';
  const W = p.ppe_writeup;
  const I = p.intangibles.reduce((s, x) => s + x.amount, 0);
  const V = p.debt_fair_value_adjustment;
  const gwOff = p.writeoff_existing_goodwill ? tb.goodwill : 0;
  const newDtl = stock ? rate * (W + I - V) : 0;
  const dtlRemoved = stock ? 0 : tb.deferred_tax_liability;
  const ania = tb.equity_parent - gwOff + W + I - V - newDtl + dtlRemoved;
  const goodwill = deal.equity_value - ania;

  const indefinite = p.intangibles.filter((x) => x.life_years === null).reduce((s, x) => s + x.amount, 0);
  const taxBase = stock ? 0 : Math.max(0, goodwill) + indefinite;
  const done = { w: 0, i: p.intangibles.map(() => 0), v: 0, tax: 0 };
  const schedule: PpaResult['schedule'] = [];
  for (let t = 0; t <= n; t++) {
    const s = t === 1 ? f : 1;
    const view = t === 0; // the pro forma year shows a full year and is not counted against what remains
    const dep = straight(W, p.ppe_life_years, s, view ? 0 : done.w);
    const amorts = p.intangibles.map((x, k) => (x.life_years === null ? 0 : straight(x.amount, x.life_years, s, view ? 0 : done.i[k])));
    const am = amorts.reduce((x, y) => x + y, 0);
    const fv = V > 0 ? straight(V, p.debt_fv_years, s, view ? 0 : done.v) : 0;
    const taxAm = taxBase > 0 ? straight(taxBase, p.tax_goodwill_life_years as number, s, view ? 0 : done.tax) : 0;
    if (!view) {
      done.w += dep; amorts.forEach((x, k) => { done.i[k] += x; }); done.v += fv; done.tax += taxAm;
    }
    schedule.push({
      writeup_depreciation: dep, intangible_amortisation: am, fv_amortisation: fv, tax_amortisation: taxAm,
      deferred_tax: stock ? -rate * (dep + am - fv) : rate * taxAm,
    });
  }

  const acq = sideBalanceSheet(facts.acquirer);
  const tgt = sideBalanceSheet(facts.target);
  const refi = a.target_debt === 'refinance_all';
  const recv = advisoryReceivable(a, deal);
  const E = deal.equity_raised_for_cash;
  const adj = totals({
    cash: -deal.acquirer_cash_used - (refi ? tb.cash : 0),
    nwc: 0,
    fixed_assets: W,
    acquired_intangibles: I,
    goodwill: goodwill - gwOff,
    deferred_financing_fees: deal.financing_fees,
    other_net_assets: (refi ? deal.net_debt_used - facts.target.year0.debt + tb.cash : 0) + recv,
    debt: deal.debt_issued - (refi ? facts.target.year0.debt : 0),
    debt_fair_value: V,
    deferred_tax_liability: newDtl - dtlRemoved,
    equity_parent: -tb.equity_parent + deal.stock_to_target + E - deal.equity_issuance_fees - deal.fees + recv - deal.other_one_off,
    nci_equity: 0,
  });
  const combined = addSheets(addSheets(acq, tgt), adj);
  return {
    target_equity: tb.equity_parent, goodwill_written_off: gwOff, ppe_writeup: W, intangibles: I,
    debt_fair_value_adjustment: V, existing_dtl_removed: dtlRemoved, new_dtl: newDtl, adjusted_net_assets: ania, goodwill,
    opening: { acquirer: acq, target: tgt, adjustments: adj, combined },
    schedule,
  };
}

function addSheets(x: BalanceSheet, y: BalanceSheet): BalanceSheet {
  const out = {} as BalanceSheet;
  for (const k of Object.keys(x) as (keyof BalanceSheet)[]) out[k] = x[k] + y[k];
  return out;
}

/** §29.14: the forecast combined balance sheet, rolled from the opening one with COMBINED flows. */
export function rollBalanceSheet(opening: BalanceSheet, combined: Amounts[], ppa: PpaResult, feeAmortisation: number[], n: number): BalanceSheet[] {
  const out: BalanceSheet[] = [opening];
  for (let t = 1; t <= n; t++) {
    const p = out[t - 1];
    const c = combined[t];
    const sch = ppa.schedule[t];
    out.push(totals({
      cash: p.cash + c.cash_change,
      nwc: p.nwc - c.delta_nwc,
      fixed_assets: p.fixed_assets - c.capex + c.da + sch.intangible_amortisation,
      acquired_intangibles: p.acquired_intangibles - sch.intangible_amortisation,
      goodwill: p.goodwill,
      deferred_financing_fees: p.deferred_financing_fees - feeAmortisation[t],
      other_net_assets: p.other_net_assets - c.other_cash_items - c.other_items,
      debt: p.debt + c.debt_flow,
      debt_fair_value: p.debt_fair_value - sch.fv_amortisation,
      deferred_tax_liability: p.deferred_tax_liability + c.deferred_tax,
      equity_parent: p.equity_parent + c.net_income_group + c.dividends + c.equity_issuance,
      nci_equity: p.nci_equity - c.nci + c.nci_dividends,
    }));
  }
  return out;
}
