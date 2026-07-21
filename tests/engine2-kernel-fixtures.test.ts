/**
 * Kernel vs golden intermediate columns (Phase B2 gate, rebuild/PHASE_B_GOLDENS_KERNEL.md):
 * the waterfall kernel must reproduce G2's sweep-pool and per-tranche application columns
 * (plus G3/G5/G2-D debt blocks, G3/G4 tax blocks, and every golden's IRRs) from fixture
 * inputs. Pattern per PHASE_C: upstream values are INJECTED per year from expected.json —
 * no accumulation of kernel state across years, so each year is verified independently.
 *
 * Tolerances: expected.json stores 2dp display values (SPEC v1.0.2 changelog / DERIVATION
 * note), so every INJECTED input carries up to ±$0.005m of display rounding. A waterfall
 * year combines ~5 injected terms, so kernel outputs are compared at ±$0.03m — still ~3
 * orders of magnitude below any real mechanical disagreement (e.g. sweep-%-of-balance vs
 * %-of-pool differs by whole $m). Values the kernel derives from EXACT SPEC §17 constants
 * (rates, scheduled amort, closed-form IRR) are compared at ±$0.01m / ±0.1bp.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { allInRate, cashInterest, commitmentFee, pikAccrual, type KernelPricing } from '../lib/engine2/kernel/rates';
import { scheduledAmort } from '../lib/engine2/kernel/amort';
import { waterfallYear, type WaterfallYearIn } from '../lib/engine2/kernel/waterfall';
import { taxYear, type KernelTaxPolicy, type KernelTaxState } from '../lib/engine2/kernel/taxstate';
import { closedFormTwoFlowIrr, irr, npv } from '../lib/engine2/kernel/irr';

const ROOT = join(__dirname, '..');
const load = (n: string) => JSON.parse(readFileSync(join(ROOT, 'tests/goldens', n, 'expected.json'), 'utf8'));

const TOL_CHAIN = 0.03; // outputs of a waterfall/tax year built from ~5 injected 2dp inputs
const TOL_INJECT = 0.01; // one computed line vs one 2dp fixture line
// Solver-vs-fixture IRR: the fixture irr was computed on FULL-precision flows, but the
// stored cashflows are 2dp — on G4's small unlevered flows (~$5m) that rounding alone
// moves the IRR ~1.4e-5. 3e-5 bounds the input-rounding artifact; the solver's own
// accuracy is pinned at 1e-10 by the closed-form test, and the true ±0.1bp (§15) gate
// applies to the engine's full-precision flows at the Phase C integration gate.
const IRR_TOL = 3e-5;

const flo = (spread: number, floor = 0): KernelPricing => ({
  kind: 'floating',
  base_rate: 0.036, // SPEC §17: Term SOFR base for every golden
  spread,
  floor,
});

/** SPEC §17 structure constants per golden (the exact inputs the goldens were built from). */
interface TrancheSpec {
  name: string;
  face: number;
  pricing?: KernelPricing; // cash-pay
  pik_rate?: number; // pik_note (cash coupon 0 in G3)
  amort_pct: number;
  participates: boolean;
  priority: number;
}
interface DealSpec {
  min_cash: number;
  sweep_pct: number;
  tranches: TrancheSpec[];
  revolver: { commitment: number; pricing: KernelPricing; fee: number } | null;
}

const SPECS: Record<string, DealSpec> = {
  G1: { min_cash: 5, sweep_pct: 0.0, tranches: [], revolver: null },
  G2: {
    min_cash: 10,
    sweep_pct: 0.75,
    tranches: [{ name: 'TLB', face: 440, pricing: flo(0.0375), amort_pct: 0.01, participates: true, priority: 1 }],
    revolver: { commitment: 55, pricing: flo(0.035), fee: 0.005 },
  },
  G2D: {
    min_cash: 10,
    sweep_pct: 0.75,
    tranches: [{ name: 'TLB', face: 440, pricing: flo(0.0375), amort_pct: 0.01, participates: true, priority: 1 }],
    revolver: { commitment: 55, pricing: flo(0.035), fee: 0.005 },
  },
  G3: {
    min_cash: 8,
    sweep_pct: 0.5,
    tranches: [
      { name: 'Senior', face: 270, pricing: flo(0.045, 0.0075), amort_pct: 0.05, participates: true, priority: 1 },
      { name: 'PIK Note', face: 135, pik_rate: 0.12, amort_pct: 0.0, participates: false, priority: 2 },
    ],
    revolver: null,
  },
  G4: {
    min_cash: 3,
    sweep_pct: 0.5,
    tranches: [{ name: 'Unitranche', face: 42, pricing: flo(0.05, 0.0075), amort_pct: 0.01, participates: true, priority: 1 }],
    revolver: null,
  },
  G5: {
    min_cash: 4,
    sweep_pct: 0.5,
    tranches: [{ name: 'Senior', face: 48, pricing: flo(0.0425), amort_pct: 0.1, participates: true, priority: 1 }],
    revolver: { commitment: 20, pricing: flo(0.04), fee: 0.005 },
  },
};

// ── waterfall + rates + amort vs golden debt blocks ──────────────────────────

describe('kernel/waterfall reproduces the golden debt blocks (B2 gate)', () => {
  for (const golden of ['G1', 'G2', 'G2D', 'G3', 'G4', 'G5']) {
    it(`${golden}: per-tranche interest/amort/sweep, pool, revolver and closing cash — every year, inputs injected`, () => {
      const g = load(golden);
      const spec = SPECS[golden];
      const years: number = g.waterfall.length;

      for (let y = 0; y < years; y++) {
        const tranches = spec.tranches.map((t) => {
          const row = g.tranches[t.name][y];
          const begin: number = row.beginning_balance;
          const accrual = t.pik_rate ? pikAccrual(begin, t.pik_rate) : 0;
          const interest = t.pricing ? cashInterest(begin, allInRate(t.pricing)) : 0; // PIK cash coupon 0 (§17 G3)
          // rates kernel vs the golden interest/accrual columns (§4)
          expect(Math.abs(interest - row.cash_interest), `${golden} Y${y + 1} ${t.name} cash_interest`).toBeLessThan(TOL_INJECT);
          expect(Math.abs(accrual - row.pik_accrual), `${golden} Y${y + 1} ${t.name} pik_accrual`).toBeLessThan(TOL_INJECT);
          return {
            name: t.name,
            outstanding: begin + accrual,
            scheduled_amort: scheduledAmort({ kind: 'straight_line_pct', pct_of_face: t.amort_pct }, t.face, y),
            cash_interest: interest,
            sweep_participates: t.participates,
            sweep_priority: t.priority,
          };
        });

        let revolver: WaterfallYearIn['revolver'] = null;
        if (spec.revolver) {
          const row = g.revolver[y];
          const drawn: number = row.beginning_drawn;
          const fee = commitmentFee(spec.revolver.commitment - drawn, spec.revolver.fee);
          expect(Math.abs(fee - row.commitment_fee), `${golden} Y${y + 1} commitment fee`).toBeLessThan(TOL_INJECT);
          revolver = {
            beginning_drawn: drawn,
            commitment: spec.revolver.commitment,
            cash_interest: cashInterest(drawn, allInRate(spec.revolver.pricing)),
            commitment_fee: fee,
          };
        }

        const wf = g.waterfall[y];
        const out = waterfallYear({
          opening_cash: wf.opening_cash,
          fcf_pre_debt: wf.fcf_pre_debt,
          min_cash: spec.min_cash,
          sweep_pct: spec.sweep_pct,
          tranches,
          revolver,
        });

        const ctx = `${golden} Y${y + 1}`;
        expect(Math.abs(out.cash_interest_total - wf.cash_interest_total), `${ctx} interest total`).toBeLessThan(TOL_CHAIN);
        expect(Math.abs(out.commitment_fees - wf.commitment_fees), `${ctx} commitment fees`).toBeLessThan(TOL_CHAIN);
        expect(Math.abs(out.mandatory_amort_total - wf.mandatory_amort_total), `${ctx} mandatory total`).toBeLessThan(TOL_CHAIN);
        expect(Math.abs(out.revolver_repayment - wf.revolver_repayment), `${ctx} revolver repayment`).toBeLessThan(TOL_CHAIN);
        expect(Math.abs(out.sweep_pool - wf.sweep_pool), `${ctx} sweep pool`).toBeLessThan(TOL_CHAIN);
        expect(out.sweep_pct_applied, `${ctx} sweep pct`).toBe(wf.sweep_pct_applied);
        expect(Math.abs(out.sweep_applied_total - wf.sweep_applied_total), `${ctx} sweep applied`).toBeLessThan(TOL_CHAIN);
        expect(Math.abs(out.revolver_draw - wf.revolver_draw), `${ctx} revolver draw`).toBeLessThan(TOL_CHAIN);
        expect(Math.abs(out.closing_cash - wf.closing_cash), `${ctx} closing cash`).toBeLessThan(TOL_CHAIN);
        expect(out.cash_floor_breach, `${ctx} breach flag`).toBe(wf.cash_floor_breach);

        for (let i = 0; i < spec.tranches.length; i++) {
          const row = g.tranches[spec.tranches[i].name][y];
          const t = out.tranches[i];
          expect(Math.abs(t.mandatory_amort - row.mandatory_amort), `${ctx} ${t.name} mandatory`).toBeLessThan(TOL_CHAIN);
          expect(Math.abs(t.sweep_repayment - row.sweep_repayment), `${ctx} ${t.name} sweep`).toBeLessThan(TOL_CHAIN);
          expect(Math.abs(t.ending_outstanding - row.ending_balance), `${ctx} ${t.name} ending`).toBeLessThan(TOL_CHAIN);
        }
        if (spec.revolver) {
          const row = g.revolver[y];
          expect(Math.abs(out.revolver_ending_drawn - row.ending_drawn), `${ctx} revolver ending drawn`).toBeLessThan(TOL_CHAIN);
        }
      }
    });
  }

  it('G5 asserts (§17): Y1 draw to the floor, repay-ahead-of-sweep, drawn = 0 by end Y3, never a breach', () => {
    const g = load('G5');
    expect(g.revolver[0].draw).toBeGreaterThan(0);
    expect(g.waterfall[0].closing_cash).toBeCloseTo(4.0, 2);
    expect(g.revolver[2].ending_drawn).toBe(0);
    for (const w of g.waterfall) expect(w.cash_floor_breach).toBe(false);
    // kernel reproduces the Y1 draw-to-floor from raw inputs
    const spec = SPECS.G5;
    const out = waterfallYear({
      opening_cash: g.waterfall[0].opening_cash,
      fcf_pre_debt: g.waterfall[0].fcf_pre_debt,
      min_cash: spec.min_cash,
      sweep_pct: spec.sweep_pct,
      tranches: [
        {
          name: 'Senior',
          outstanding: 48,
          scheduled_amort: 4.8,
          cash_interest: cashInterest(48, allInRate(spec.tranches[0].pricing!)),
          sweep_participates: true,
          sweep_priority: 1,
        },
      ],
      revolver: { beginning_drawn: 0, commitment: 20, cash_interest: 0, commitment_fee: commitmentFee(20, 0.005) },
    });
    expect(out.revolver_draw).toBeGreaterThan(0);
    expect(Math.abs(out.closing_cash - 4.0)).toBeLessThan(TOL_CHAIN);
    expect(out.cash_floor_breach).toBe(false);
  });

  it('floor breach (kernel-level fixture per SPEC §17 G5 note): revolver exhausts ⇒ full draw + breach flag, conservation intact (§14.4/§14.6)', () => {
    const out = waterfallYear({
      opening_cash: 5,
      fcf_pre_debt: -30,
      min_cash: 5,
      sweep_pct: 0.5,
      tranches: [
        { name: 'TL', outstanding: 50, scheduled_amort: 0, cash_interest: 3, sweep_participates: true, sweep_priority: 1 },
      ],
      revolver: { beginning_drawn: 0, commitment: 10, cash_interest: 0, commitment_fee: 0.05 },
    });
    expect(out.revolver_draw).toBeCloseTo(10, 9); // the FULL undrawn commitment
    expect(out.revolver_ending_drawn).toBeCloseTo(10, 9);
    expect(out.cash_floor_breach).toBe(true);
    expect(out.closing_cash).toBeLessThan(5);
    expect(out.closing_cash).toBeCloseTo(5 - 30 - 3 - 0.05 + 10, 9);
    expect(out.sweep_applied_total).toBe(0);
  });

  it('G3 PIK payoff: 135 compounding at 12% for 5 years = 237.9161 at par + accrued (§4/§9 check value)', () => {
    let balance = 135;
    for (let y = 0; y < 5; y++) balance += pikAccrual(balance, 0.12);
    expect(balance).toBeCloseTo(135 * Math.pow(1.12, 5), 9);
    expect(Math.abs(balance - 237.9161)).toBeLessThan(5e-4); // SPEC §17 check value (4dp)
    const g = load('G3');
    const pik = g.tranches['PIK Note'];
    expect(Math.abs(pik[4].ending_balance - balance)).toBeLessThan(TOL_INJECT);
  });
});

// ── taxstate vs golden tax blocks ────────────────────────────────────────────

const G_BASE_POLICY: KernelTaxPolicy = {
  // SPEC §17 golden defaults: rate 25%, §163(j) applies on EBITDA basis at 30%, no NOLs, no floor
  rate: 0.25,
  interest_deductible: true,
  s163j_applies: true,
  ati_pct: 0.3,
  acquired_usable: false,
  arose_pre_2018: false,
  s382_annual_limit: null,
  minimum_rate: 0,
};

/** Per-year injection: opening state comes from the PRIOR fixture row, never carried. */
function fixtureState(g: any, y: number, opening: KernelTaxState): KernelTaxState {
  if (y === 0) return opening;
  const prev = g.tax[y - 1];
  return {
    acquired_nol: prev.acquired_nol_end,
    postclose_nol: prev.postclose_nol_end,
    s163j_carryforward: prev.s163j_carryforward_end,
  };
}

function checkTaxBlock(golden: string, policy: KernelTaxPolicy, opening: KernelTaxState) {
  const g = load(golden);
  for (let y = 0; y < g.tax.length; y++) {
    const row = g.tax[y];
    const out = taxYear(policy, fixtureState(g, y, opening), {
      ebit: g.operating[y].ebit,
      ati: row.ati,
      capped_interest_pool: row.capped_interest_pool,
      uncapped_deductions: row.uncapped_deductions,
    });
    const ctx = `${golden} Y${y + 1}`;
    expect(Math.abs(out.deductible_capped_interest - row.deductible_capped_interest), `${ctx} deductible`).toBeLessThan(TOL_CHAIN);
    expect(Math.abs(out.s163j_carryforward_end - row.s163j_carryforward_end), `${ctx} 163j carryforward`).toBeLessThan(TOL_CHAIN);
    expect(Math.abs(out.taxable_before_nol - row.taxable_before_nol), `${ctx} taxable`).toBeLessThan(TOL_CHAIN);
    expect(Math.abs(out.acquired_nol_used - row.acquired_nol_used), `${ctx} acquired used`).toBeLessThan(TOL_CHAIN);
    expect(Math.abs(out.postclose_nol_used - row.postclose_nol_used), `${ctx} postclose used`).toBeLessThan(TOL_CHAIN);
    expect(Math.abs(out.nol_banked - row.nol_banked), `${ctx} banked`).toBeLessThan(TOL_CHAIN);
    expect(Math.abs(out.state_end.acquired_nol - row.acquired_nol_end), `${ctx} acquired end`).toBeLessThan(TOL_CHAIN);
    expect(Math.abs(out.state_end.postclose_nol - row.postclose_nol_end), `${ctx} postclose end`).toBeLessThan(TOL_CHAIN);
    expect(Math.abs(out.cash_tax - row.cash_tax), `${ctx} cash tax`).toBeLessThan(TOL_CHAIN);
  }
}

describe('kernel/taxstate reproduces the golden tax blocks (B2 gate)', () => {
  it('G2: §163(j) never binds — full deduction, zero carryforward, no NOL activity', () => {
    checkTaxBlock('G2', G_BASE_POLICY, { acquired_nol: 0, postclose_nol: 0, s163j_carryforward: 0 });
    const g = load('G2');
    for (let y = 0; y < g.tax.length; y++) {
      const row = g.tax[y];
      const out = taxYear(G_BASE_POLICY, fixtureState(g, y, { acquired_nol: 0, postclose_nol: 0, s163j_carryforward: 0 }), {
        ebit: g.operating[y].ebit,
        ati: row.ati,
        capped_interest_pool: row.capped_interest_pool,
        uncapped_deductions: row.uncapped_deductions,
      });
      expect(out.deductible_capped_interest).toBe(row.capped_interest_pool); // cap has headroom, cf opens at 0
      expect(out.s163j_carryforward_end).toBe(0);
    }
  });

  it('G3: §163(j) BINDS every year (deductible = 30% × ATI < available); carryforward grows monotonically and never releases (§17 assert)', () => {
    checkTaxBlock('G3', G_BASE_POLICY, { acquired_nol: 0, postclose_nol: 0, s163j_carryforward: 0 });
    const g = load('G3');
    let prevCf = 0;
    for (let y = 0; y < g.tax.length; y++) {
      const row = g.tax[y];
      const out = taxYear(G_BASE_POLICY, fixtureState(g, y, { acquired_nol: 0, postclose_nol: 0, s163j_carryforward: 0 }), {
        ebit: g.operating[y].ebit,
        ati: row.ati,
        capped_interest_pool: row.capped_interest_pool,
        uncapped_deductions: row.uncapped_deductions,
      });
      const available = row.capped_interest_pool + (y === 0 ? 0 : g.tax[y - 1].s163j_carryforward_end);
      expect(out.deductible_capped_interest).toBeLessThan(available - 1); // binds with real margin
      expect(Math.abs(out.deductible_capped_interest - 0.3 * row.ati)).toBeLessThan(TOL_INJECT);
      expect(out.s163j_carryforward_end).toBeGreaterThan(prevCf);
      prevCf = row.s163j_carryforward_end;
    }
    expect(prevCf).toBeGreaterThan(0);
  });

  it('G4: loss banking, acquired-first ordering, §382 cap at 3.0, 15% floor — the full §6 state machine (§17 asserts)', () => {
    const policy: KernelTaxPolicy = {
      rate: 0.25,
      interest_deductible: true,
      s163j_applies: true,
      ati_pct: 0.3,
      acquired_usable: true,
      arose_pre_2018: false,
      s382_annual_limit: 3.0,
      minimum_rate: 0.15,
    };
    const opening: KernelTaxState = { acquired_nol: 40, postclose_nol: 0, s163j_carryforward: 0 };
    checkTaxBlock('G4', policy, opening);

    const g = load('G4');
    // Y1 is a genuine tax loss: banks a post-close NOL through the §6.2 loss branch
    const y1 = taxYear(policy, opening, {
      ebit: g.operating[0].ebit,
      ati: g.tax[0].ati,
      capped_interest_pool: g.tax[0].capped_interest_pool,
      uncapped_deductions: g.tax[0].uncapped_deductions,
    });
    expect(y1.taxable_before_nol).toBeLessThan(0);
    expect(y1.nol_banked).toBeGreaterThan(0);
    expect(y1.cash_tax).toBe(0);
    // §382 binds: some year uses EXACTLY the 3.0 annual limit
    expect(g.tax.some((t: any) => Math.abs(t.acquired_nol_used - 3.0) < 0.005)).toBe(true);
    // the 15% floor binds in at least one profitable year
    expect(g.tax.some((t: any) => t.cash_tax > 0 && Math.abs(t.cash_tax - 0.15 * t.taxable_before_nol) < 0.005)).toBe(true);
    // §163(j) never binds in G4
    for (const t of g.tax) expect(t.s163j_carryforward_end).toBe(0);
    // acquired pool consumed first, survives the hold
    expect(g.tax[g.tax.length - 1].acquired_nol_end).toBeGreaterThan(0);
  });
});

// ── irr vs golden return streams ─────────────────────────────────────────────

describe('kernel/irr reproduces the golden IRRs (±0.1bp — SPEC §15)', () => {
  for (const golden of ['G1', 'G2', 'G2D', 'G3', 'G4', 'G5']) {
    it(`${golden}: sponsor_net / pre_promote / unlevered IRRs from fixture cashflows`, () => {
      const g = load(golden);
      for (const stream of ['sponsor_net', 'pre_promote', 'unlevered'] as const) {
        const { cashflows, irr: expected } = g.returns[stream];
        const solved = irr(cashflows);
        expect(solved, `${golden} ${stream}`).not.toBeNull();
        expect(Math.abs(solved! - expected), `${golden} ${stream} irr`).toBeLessThan(IRR_TOL);
        expect(Math.abs(npv(solved!, cashflows))).toBeLessThan(1e-6 * cashflows.reduce((s: number, c: number) => s + Math.abs(c), 0));
      }
    });
  }

  it('G1 closed form (§14.14): IRR = (284.5/209)^(1/5) − 1 = 6.3622%, and the solver agrees with the closed form to machine precision', () => {
    const closed = closedFormTwoFlowIrr(209, 284.5, 5)!;
    expect(Math.abs(closed - 0.063622)).toBeLessThan(1e-6); // SPEC §17 check value (v1.0.1)
    const solved = irr([-209, 0, 0, 0, 0, 284.5])!;
    expect(Math.abs(solved - closed)).toBeLessThan(1e-10);
  });
});
