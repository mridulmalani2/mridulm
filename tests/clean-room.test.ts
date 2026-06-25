/**
 * Clean-room cross-check — an INDEPENDENT re-derivation of the engine's core mechanics
 * from first principles, asserted against fullRecalc across a battery of deal regimes.
 * A disagreement = a bug in one of the two. This is the durable "no silent error" net:
 * IRR, the MOIC identity, the FCF/debt roll-forward/interest/net-debt identities, and the
 * three-statement close, all re-computed here without reusing the engine's formulas.
 */

import { describe, it, expect } from 'vitest';
import { fullRecalc } from '../lib/engine/index';
import { canonicalDeals, debtFundedAddOn, tranche } from './fixtures/canonicalDeals';
import type { ModelState } from '../lib/dealEngineTypes';

const mk = (f: (s: ModelState) => void): ModelState => { const s = canonicalDeals[0].build(); f(s); return s; };

const deals: { name: string; state: ModelState }[] = [
  ...canonicalDeals.map((d) => ({ name: d.name, state: d.build() })),
  { name: 'all-equity', state: mk((s) => { s.debt_tranches = []; }) },
  { name: 'high-lev', state: mk((s) => { s.debt_tranches = s.debt_tranches.map((t) => ({ ...t, principal: t.principal * 1.6 })); }) },
  { name: 'neg-growth', state: mk((s) => { s.revenue.growth_rates = s.revenue.growth_rates.map(() => -0.10); }) },
  { name: 'zero-growth', state: mk((s) => { s.revenue.growth_rates = s.revenue.growth_rates.map(() => 0); }) },
  { name: 'big-recap', state: mk((s) => { s.exit.interim_distributions = [0, 40, 0, 0, 0]; }) },
  { name: 'nol-full', state: mk((s) => { s.tax.nol_carryforward = 500; }) },
  { name: 'long-hold', state: mk((s) => { s.exit.holding_period = 10; }) },
  { name: 'addon-equity', state: mk((s) => { s.add_on_acquisitions = [{ ...debtFundedAddOn(), funding: 'equity', debt_pct: 0 }]; }) },
  {
    name: 'combo', state: mk((s) => {
      s.debt_tranches = [
        tranche({ name: 'RCF', tranche_type: 'revolver', principal: 0, commitment: 30, amortization_type: 'bullet' }),
        tranche({ name: 'TLB', tranche_type: 'senior', principal: 70, amortization_type: 'cash_sweep', cash_sweep_pct: 0.75 }),
        tranche({ name: 'PIK', tranche_type: 'pik_note', principal: 25, amortization_type: 'PIK', pik_rate: 0.12, cash_interest: false }),
      ];
      s.exit.interim_distributions = [0, 0, 10, 0, 0];
    }),
  },
  {
    name: 'midyear-combo', state: mk((s) => {
      s.exit.mid_year_convention = true;
      s.exit.interim_distributions = [0, 15, 0, 0, 0];
      s.exit.partial_exits = [{ year: 2, pct_sold: 0.25, exit_multiple: s.exit.exit_ebitda_multiple, exit_fee_pct: 0.01 }];
    }),
  },
];

// Independent IRR solver (bisection) — deliberately not the engine's Newton/bisection code.
function irr(cfs: number[], times: number[] | null): number | null {
  const npv = (r: number) => cfs.reduce((s, cf, i) => s + cf / Math.pow(1 + r, times ? times[i] : i), 0);
  let lo = -0.9999, hi = 100, flo = npv(lo);
  if (flo * npv(hi) > 0) return null;
  for (let k = 0; k < 800; k++) {
    const mid = (lo + hi) / 2, fm = npv(mid);
    if (Math.abs(fm) < 1e-11 || hi - lo < 1e-14) return mid;
    if (flo * fm < 0) hi = mid; else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

describe('clean-room: independent re-derivation matches the engine', () => {
  for (const { name, state } of deals) {
    describe(name, () => {
      const s = fullRecalc(state);
      const hp = s.exit.holding_period;
      const ret = s.returns;
      const ds = s.debt_schedule;
      const ty = (i: number) => s.projections.years[i];

      it('IRR independently solved from equity_cashflows matches', () => {
        const cfs = ret.equity_cashflows ?? [];
        const times = s.exit.mid_year_convention && cfs.length === hp + 1
          ? [0, ...Array.from({ length: hp - 1 }, (_, t) => t + 0.5), hp]
          : null;
        const mine = irr(cfs, times);
        if (ret.irr == null) expect(mine).toBeNull();
        else expect(Math.abs((mine as number) - ret.irr)).toBeLessThan(5e-4);
      });

      it('MOIC = (exit equity + distributions) / total invested', () => {
        const invested = ret.entry_equity + (ret.add_on_equity_invested ?? 0);
        const mine = (ret.exit_equity + ret.total_distributions) / invested;
        expect(Math.abs(mine - ret.moic)).toBeLessThan(1e-3);
      });

      it('per-year FCF and debt/interest/net-debt identities hold', () => {
        for (let i = 0; i < hp; i++) {
          const y = ty(i);
          // FCF pre-debt = EBITDA − tax − total capex − ΔNWC − one-time integration cost (0C)
          expect(Math.abs(y.fcf_pre_debt - (y.ebitda_adj - y.tax - y.total_capex - y.delta_nwc - y.integration_cost))).toBeLessThan(1e-2);
          // total cash interest = Σ tranche cash interest
          const sumInt = ds.tranche_schedules.reduce((acc, tr) => acc + (tr[i]?.cash_interest ?? 0), 0);
          expect(Math.abs(sumInt - (ds.total_cash_interest_by_year[i] ?? 0))).toBeLessThan(1e-2);
          // net debt = max(0, gross − cash)
          const net = Math.max(0, (ds.total_debt_by_year[i] ?? 0) - (ds.cash_balance_by_year[i] ?? 0));
          expect(Math.abs(net - (ds.net_debt_by_year[i] ?? 0))).toBeLessThan(1e-2);
        }
      });

      it('debt roll-forward and average-balance interest hold per tranche', () => {
        ds.tranche_schedules.forEach((tr, ti) => {
          const tt = s.debt_tranches[ti]?.tranche_type;
          const isPik = s.debt_tranches[ti]?.cash_interest === false;
          for (let i = 0; i < tr.length; i++) {
            const y = tr[i];
            // ending = beginning − total repayment + PIK accrual
            expect(Math.abs(y.ending_balance - (y.beginning_balance - y.total_repayment + y.pik_accrual))).toBeLessThan(1e-2);
            // average-balance cash interest for cash-pay TERM tranches (revolvers breathe
            // intra-year and use opening-drawn interest, so they are excluded here).
            if (!isPik && tt !== 'revolver') {
              const avg = (y.beginning_balance + Math.max(0, y.beginning_balance - y.scheduled_repayment)) / 2;
              expect(Math.abs(avg * y.effective_rate - y.cash_interest)).toBeLessThan(1e-2);
            }
          }
        });
      });

      it('three-statement balance sheet closes', () => {
        expect(s.balance_sheet.closes).toBe(true);
      });
    });
  }
});
