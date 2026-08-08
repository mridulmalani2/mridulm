/**
 * §18 refinancing — the golden-uncovered branches (SPEC §18.11) as DIRECTED fixtures, plus the
 * §14.19 invariants. G6-REFI (the golden) covers the happy path; every branch it leaves
 * uncovered gets a directed test here, each DESIGNED so a specific engine mutation fails it
 * (the "watch for vacuous/golden-uncovered assertions" discipline — the mutants are named in
 * the comments and were run RED during development, then reverted).
 */
import { describe, it, expect } from 'vitest';
import { runCore } from '../lib/engine2/sequence';
import { runModel } from '../lib/engine2/facade';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';
import type { DealAssumptions, RefinancingEvent } from '../lib/engine2/types';

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

/** Clone a golden deal and attach a refinancing schedule (and optional tranche override). */
function withRefi(
  golden: keyof typeof GOLDEN_DEALS,
  refinancing: RefinancingEvent[],
  mutate?: (a: DealAssumptions) => void,
) {
  const d = clone(GOLDEN_DEALS[golden]);
  d.assumptions.structure.refinancing = refinancing;
  mutate?.(d.assumptions);
  return d;
}

const REFI = (over: Partial<RefinancingEvent> & Pick<RefinancingEvent, 'tranche_name' | 'year'>): RefinancingEvent => ({
  new_pricing: { kind: 'floating', base_rate: 0.036, spread: 0.0275, floor: 0 },
  call_premium_pct: 0.01,
  new_maturity_years: 6,
  new_oid_pct: 0.005,
  new_financing_fee_pct: 0.01,
  new_amort_pct_of_face: 0.01,
  ...over,
});

const bsCloses = (core: ReturnType<typeof runCore>) =>
  core.balance_sheet.every((r) => Math.abs(r.check) < 1e-9);

describe('§18.11(vi) — refi of a tranche with NON-ZERO unamortized OID (the sign-off blocking gap)', () => {
  // G6-REFI refis the OID=0 G2 TLB, so the OLD-OID write-off and OLD-OID-amortization-STOP
  // sub-paths run with all-zero inputs. This fixture gives the refinanced tranche old OID > 0
  // AND new OID > 0 with R+1 < N, so BOTH transitions are non-trivially exercised. Single term
  // tranche, no revolver, so the OID stream is isolated.
  const deal = withRefi('G2', [REFI({ tranche_name: 'TLB', year: 3, new_oid_pct: 0.01 })], (a) => {
    a.structure.tranches = [
      { name: 'TLB', type: 'senior', size: { x_ebitda: 4 }, pricing: { kind: 'floating', base_rate: 0.036, spread: 0.0375, floor: 0 }, amort_pct_of_face: 0.01, maturity_years: 8, oid_pct: 0.02, sweep: { participates: true, priority: 1 } },
    ];
  });
  const core = runCore(deal.facts, deal.assumptions);
  const tlb = core.tranches[0];
  const B = tlb[2].beginning_balance;

  it('the OLD OID amortization STOPS at the refi and the NEW one starts (no double-amortization)', () => {
    // old schedule: 0.02 × 440 / 8 = 1.10/yr (years 1–2); new schedule: 0.01 × B / 6 (years 3–5).
    const oid = core.operating.map((o) => o.oid_amortization);
    expect(oid[0]).toBeCloseTo(1.1, 6);
    expect(oid[1]).toBeCloseTo(1.1, 6);
    const newAnnual = (0.01 * B) / 6;
    expect(newAnnual).toBeCloseTo(0.582606, 5);
    // MUTANT (b) — "old OID schedule not stopped" would give old (1.10) or old+new (1.68) here.
    for (const y of [2, 3, 4]) expect(oid[y]).toBeCloseTo(newAnnual, 6);
    expect(oid[2]).not.toBeCloseTo(1.1, 2);
    expect(oid[2]).not.toBeCloseTo(1.1 + newAnnual, 2);
  });

  it('the OLD unamortized OID is WRITTEN OFF at the refi (part of the write-off column)', () => {
    // old OID remaining at refi = 8.8 − 2×1.10 = 6.60; old DFC remaining = 6.60 − 2×0.825 = 4.95.
    // MUTANT (a) — "old OID not written off" would report only the 4.95 DFC.
    expect(tlb[2].unamortized_writeoff).toBeCloseTo(6.6 + 4.95, 4);
    expect(tlb[2].unamortized_writeoff).not.toBeCloseTo(4.95, 2);
    expect(tlb[2].refinanced).toBe(true);
  });

  it('the full write-off + premium defers to year 4 UNCAPPED, and the BS closes every year', () => {
    // Y4 uncapped = new-fee amort (0.5826) + deferred (WO 11.55 + premium 0.01×B).
    const premium = 0.01 * B;
    expect(core.tax[3].uncapped_deductions).toBeCloseTo((0.01 * B) / 6 + 11.55 + premium, 3);
    // Y3 (the refi year) does NOT carry the deferral — only the ongoing amortization.
    expect(core.tax[2].uncapped_deductions).toBeCloseTo((0.01 * B) / 6, 4);
    expect(bsCloses(core)).toBe(true);
  });
});

describe('§18.11(i) — refi with R+1 = N: the deferred deduction merges into the exit-year pool', () => {
  const deal = withRefi('G2', [REFI({ tranche_name: 'TLB', year: 4 })]); // R=4, N=5 ⇒ deducts in year 5 (exit)
  const core = runCore(deal.facts, deal.assumptions);
  it('year 4 carries the refi flag/cost; the write-off+premium deduction lands in year 5, merged with the exit write-off', () => {
    expect(core.tranches[0][3].refinanced).toBe(true);
    expect(core.tranches[0][3].refinancing_cash_cost).toBeGreaterThan(0);
    const wo = core.tranches[0][3].unamortized_writeoff;
    expect(wo).toBeGreaterThan(0);
    // Year 5 uncapped is pinned EXACTLY (§6 composition: fee amortization + commitment fees +
    // retirement pool, where at exit the pool = exit write-off ⊕ the deferred WO + premium —
    // sequence.ts single-reads pendingRetirementDeduction into it). The former '>' bound let a
    // merge DOUBLE-COUNT mutant (2× deferral) live; equality kills it. Premium = call_premium_pct
    // × the year-R beginning balance (§18.4; REFI default 1%).
    const premium = 0.01 * core.tranches[0][3].beginning_balance;
    expect(core.tax[4].uncapped_deductions).toBeCloseTo(
      core.operating[4].financing_fee_amortization + core.waterfall[4].commitment_fees +
        core.exit_writeoff + wo + premium,
      9,
    );
    // and year 4's own uncapped does NOT carry the deferral (it is next year's by §18.5)
    expect(core.tax[3].uncapped_deductions).toBeCloseTo(
      core.operating[3].financing_fee_amortization + core.waterfall[3].commitment_fees,
      9,
    );
    expect(bsCloses(core)).toBe(true);
  });
});

describe('§18.11(ii) — refi under a BINDING §163(j)', () => {
  // G3 binds §163(j) every year (PIK compounding). Refi its Senior tranche (the PIK note is not
  // refinanceable). The refi's write-off/premium deduct UNCAPPED in R+1 — the corner where the
  // capped/uncapped simplification (§18.5) is NOT inert; here we just prove the path is coherent.
  const deal = withRefi('G3', [REFI({ tranche_name: 'Senior', year: 3, call_premium_pct: 0.02, new_oid_pct: 0.01, new_amort_pct_of_face: 0.05, new_pricing: { kind: 'floating', base_rate: 0.036, spread: 0.035, floor: 0.0075 } })]);
  const core = runCore(deal.facts, deal.assumptions);
  it('§163(j) still binds every year and the refi chain (defer to R+1, BS close) holds', () => {
    for (const t of core.tax) expect(t.s163j_carryforward_end).toBeGreaterThan(0);
    expect(core.tranches[0][2].refinanced).toBe(true);
    expect(core.tax[3].uncapped_deductions).toBeGreaterThan(core.tax[2].uncapped_deductions); // deferral lands Y4
    expect(bsCloses(core)).toBe(true);
  });
});

describe('§18.11(iii) — the refi cash cost forces a revolver draw', () => {
  // A large premium/OID/fee on G5 (which already draws in Y1) forces a further draw in the refi
  // year — §18.4's "senior to the sweep, can pull cash toward the floor" clause.
  const deal = withRefi('G5', [REFI({ tranche_name: 'Senior', year: 2, call_premium_pct: 0.2, new_oid_pct: 0.05, new_financing_fee_pct: 0.05, new_amort_pct_of_face: 0.1, new_pricing: { kind: 'floating', base_rate: 0.036, spread: 0.0425, floor: 0 } })]);
  const core = runCore(deal.facts, deal.assumptions);
  it('the refi year draws the revolver and stays at the floor; no breach; BS closes', () => {
    expect(core.tranches[0][1].refinancing_cash_cost).toBeGreaterThan(10);
    expect(core.revolver![1].draw).toBeGreaterThan(0); // year-2 draw caused by the refi cost
    expect(core.waterfall[1].closing_cash).toBeCloseTo(4.0, 2); // held at the min-cash floor
    for (const w of core.waterfall) expect(w.cash_floor_breach).toBe(false);
    expect(bsCloses(core)).toBe(true);
  });
});

describe('§18.11(iv) — refi + a live §3-step-7 distribution and RP trap compose', () => {
  // G2-DIST (distributions [25,25,25,10,8], trap 2.75) + a TLB refi at year 3. The refi cost is
  // senior to the distribution, so it shrinks year-3 distribution capacity; par-for-par leaves
  // gross_debt_end unchanged so the trap composes with no special handling (§18.7).
  const deal = withRefi('G2DIST', [REFI({ tranche_name: 'TLB', year: 3 })]);
  const core = runCore(deal.facts, deal.assumptions);
  const base = runCore(GOLDEN_DEALS.G2DIST.facts, GOLDEN_DEALS.G2DIST.assumptions);
  it('the refi cash cost reduces the year-3 distribution vs the no-refi base; the trap still binds Y1–Y2', () => {
    expect(core.tranches[0][2].refinancing_cash_cost).toBeGreaterThan(0);
    // Year 3 was cash-capped in G2-DIST (paid 15.34); the refi consumes cash first, so LESS is paid.
    expect(core.waterfall[2].distribution_paid).toBeLessThan(base.waterfall[2].distribution_paid);
    expect(core.waterfall[2].distribution_paid).toBeGreaterThan(0);
    // The trap still blocks Y1–Y2 (par-for-par leaves the pre-refi years untouched, §18.7).
    expect(core.waterfall[0].distribution_blocked).toBe(true);
    expect(core.waterfall[1].distribution_blocked).toBe(true);
    expect(bsCloses(core)).toBe(true);
  });
});

describe('§18.11(vii) — multiple independent refis accumulate additively', () => {
  const deal = withRefi(
    'G2',
    [REFI({ tranche_name: 'TLB', year: 2 }), REFI({ tranche_name: 'TLA', year: 3 })],
    (a) => {
      a.structure.tranches = [
        { name: 'TLB', type: 'senior', size: { x_ebitda: 3 }, pricing: { kind: 'floating', base_rate: 0.036, spread: 0.0375, floor: 0 }, amort_pct_of_face: 0.01, maturity_years: 8, oid_pct: 0.01, sweep: { participates: true, priority: 1 } },
        { name: 'TLA', type: 'senior', size: { x_ebitda: 1 }, pricing: { kind: 'floating', base_rate: 0.036, spread: 0.03, floor: 0 }, amort_pct_of_face: 0.01, maturity_years: 8, oid_pct: 0.01, sweep: { participates: true, priority: 1 } },
      ];
    },
  );
  const core = runCore(deal.facts, deal.assumptions);
  it('each tranche refis in its own year; both write-offs flow through and the BS closes', () => {
    expect(core.tranches[0].map((r) => r.refinanced)).toEqual([false, true, false, false, false]);
    expect(core.tranches[1].map((r) => r.refinanced)).toEqual([false, false, true, false, false]);
    expect(core.tranches[0][1].unamortized_writeoff).toBeGreaterThan(0);
    expect(core.tranches[1][2].unamortized_writeoff).toBeGreaterThan(0);
    expect(bsCloses(core)).toBe(true);
  });

  // Accuracy-audit coverage note (2026-07-27): two refis landing in the SAME year both sum into
  // that year's refiCashCostTotal / refiBookCharge / refiDeferral accumulators (`+=`). The SPEC
  // treats same-year as "covered by construction"; pin it directly so the accumulation is not
  // golden-uncovered.
  const sameYear = withRefi(
    'G2',
    [REFI({ tranche_name: 'TLB', year: 2 }), REFI({ tranche_name: 'TLA', year: 2 })],
    (a) => {
      a.structure.tranches = [
        { name: 'TLB', type: 'senior', size: { x_ebitda: 3 }, pricing: { kind: 'floating', base_rate: 0.036, spread: 0.0375, floor: 0 }, amort_pct_of_face: 0.01, maturity_years: 8, oid_pct: 0.01, sweep: { participates: true, priority: 1 } },
        { name: 'TLA', type: 'senior', size: { x_ebitda: 1 }, pricing: { kind: 'floating', base_rate: 0.036, spread: 0.03, floor: 0 }, amort_pct_of_face: 0.01, maturity_years: 8, oid_pct: 0.01, sweep: { participates: true, priority: 1 } },
      ];
    },
  );
  it('two refis in the SAME year accumulate additively (both cash costs + both deferrals)', () => {
    const c = runCore(sameYear.facts, sameYear.assumptions);
    // both tranches flag year 2, and each carries its own cash cost + write-off
    expect(c.tranches[0][1].refinanced).toBe(true);
    expect(c.tranches[1][1].refinanced).toBe(true);
    expect(c.tranches[0][1].refinancing_cash_cost).toBeGreaterThan(0);
    expect(c.tranches[1][1].refinancing_cash_cost).toBeGreaterThan(0);
    // year-3 uncapped carries the SUM of both write-offs + both premiums (both deferred to R+1=3)
    const woPlusPrem = (rows: typeof c.tranches[number]) => {
      const B = rows[1].beginning_balance;
      return rows[1].unamortized_writeoff + 0.01 * B; // WO + premium (call_premium_pct 0.01)
    };
    const bothDeferred = woPlusPrem(c.tranches[0]) + woPlusPrem(c.tranches[1]);
    // year-3 uncapped = ongoing fee amort + commitment fee + both deferrals; assert the deferral
    // component by differencing against year 4 (no deferral lands in year 4).
    expect(c.tax[2].uncapped_deductions).toBeGreaterThan(bothDeferred);
    expect(bsCloses(c)).toBe(true);
  });
});

describe('§18.11(v) / §16 — structural-gate REJECTIONS (input-gate throws, never computed defaults)', () => {
  const bad = (refinancing: RefinancingEvent[], mutate?: (a: DealAssumptions) => void) => () =>
    runCore(GOLDEN_DEALS.G2.facts, withRefi('G2', refinancing, mutate).assumptions);
  it('refi naming the revolver → throws', () => {
    expect(bad([REFI({ tranche_name: 'Revolver', year: 3 })])).toThrow(/not a term tranche/);
  });
  it('refi naming a pik_note → throws', () => {
    // add a PIK note and refi it
    expect(
      bad([REFI({ tranche_name: 'PIK', year: 3 })], (a) => {
        a.structure.tranches = [
          ...a.structure.tranches,
          { name: 'PIK', type: 'pik_note', size: { x_ebitda: 1 }, cash_coupon: 0, pik_coupon: 0.1, amort_pct_of_face: 0, maturity_years: 8, oid_pct: 0, sweep: { participates: false, priority: 2 }, elections: null },
        ];
      }),
    ).toThrow(/pik_note|not a term tranche/);
  });
  it('refi naming a non-existent tranche → throws', () => {
    expect(bad([REFI({ tranche_name: 'Nope', year: 3 })])).toThrow(/not a term tranche/);
  });
  it('refi in the exit year (year = hold_years) → throws', () => {
    expect(bad([REFI({ tranche_name: 'TLB', year: 5 })])).toThrow(/refi year must be/);
  });
  it('refi whose new maturity balloons inside the hold ((year−1)+new_maturity ≤ hold) → throws', () => {
    expect(bad([REFI({ tranche_name: 'TLB', year: 3, new_maturity_years: 2 })])).toThrow(/new maturity must exceed/);
  });
  it('refi with a NaN new maturity → throws at the gate (NaN passes < and ≤ checks — must not poison effMaturity)', () => {
    expect(bad([REFI({ tranche_name: 'TLB', year: 3, new_maturity_years: NaN })])).toThrow(/new maturity must exceed/);
  });
  it('two refis on the same tranche → throws', () => {
    expect(bad([REFI({ tranche_name: 'TLB', year: 2 }), REFI({ tranche_name: 'TLB', year: 3 })])).toThrow(/more than once/);
  });
  it('a negative percentage → throws', () => {
    expect(bad([REFI({ tranche_name: 'TLB', year: 3, call_premium_pct: -0.01 })])).toThrow(/must be ≥ 0/);
  });
});

describe('§14.19 — refinancing invariants (par-for-par, BS close, R+1 uncapped deferral, cash cost)', () => {
  // Applied across G6-REFI and the directed fixtures above.
  const cases: { name: string; deal: { facts: DealAssumptions extends never ? never : any; assumptions: DealAssumptions } }[] = [
    { name: 'G6-REFI', deal: GOLDEN_DEALS.G6REFI },
    { name: 'old-OID', deal: withRefi('G2', [REFI({ tranche_name: 'TLB', year: 3, new_oid_pct: 0.01 })], (a) => {
      a.structure.tranches = [{ name: 'TLB', type: 'senior', size: { x_ebitda: 4 }, pricing: { kind: 'floating', base_rate: 0.036, spread: 0.0375, floor: 0 }, amort_pct_of_face: 0.01, maturity_years: 8, oid_pct: 0.02, sweep: { participates: true, priority: 1 } }];
    }) },
  ];
  for (const { name, deal } of cases) {
    it(`${name}: §14.19(a) par-for-par at the refi — the refi moves no principal; (b) BS closes; (d) cash cost = premium+OID+fee`, () => {
      const core = runCore(deal.facts, deal.assumptions);
      const events = deal.assumptions.structure.refinancing ?? [];
      for (const ev of events) {
        const ti = core.tranches.findIndex((rows) => rows[0].name === ev.tranche_name);
        expect(ti).toBeGreaterThanOrEqual(0);
        const rows = core.tranches[ti];
        const R = ev.year - 1; // 0-indexed refi year
        // §14.19(a): the refi itself moves no principal — the new face equals the beginning
        // balance, so the ending balance in the refi year = begin − mandatory − sweep (the
        // ordinary year), with NO principal step from the swap.
        const expectedEnd = rows[R].beginning_balance - rows[R].mandatory_amort - rows[R].sweep_repayment;
        expect(rows[R].ending_balance).toBeCloseTo(expectedEnd, 6);
        // §14.19(d): the cash cost = premium + new OID + new fee on B (= beginning balance).
        const B = rows[R].beginning_balance;
        const expectedCost = (ev.call_premium_pct + ev.new_oid_pct + ev.new_financing_fee_pct) * B;
        expect(rows[R].refinancing_cash_cost).toBeCloseTo(expectedCost, 6);
        expect(rows[R].refinanced).toBe(true);
      }
      // §14.19(b): the balance sheet closes to machine epsilon every year.
      for (const bs of core.balance_sheet) expect(Math.abs(bs.check)).toBeLessThan(1e-9);
    });
  }
});

describe('§18.11(viii) — the retired-balance no-op raises the §18.8 refi_noop WARN [v1.3.1]', () => {
  // MUTANTS (each run RED during development, then reverted — the three directions §18.11(viii)
  // names): (a) drop the flags.push in check.ts → the two positive asserts below redden;
  // (b) drop the balance condition (flag every refi) → the G6-REFI negative + the C5
  // coherence==[] gate redden; (c) tighten ε to 1e-9 → the DUST case (balance 0.002 > 1e-9,
  // still ≤ RETIRED_TOL) reddens.

  it('a tranche fully swept to zero before its refi year: stamped no-op + refi_noop WARN naming tranche and year', () => {
    // Tiny 0.3x TLB + 100% sweep against G2 cash flows ⇒ swept to zero well before year 4.
    const deal = withRefi('G2', [{
      tranche_name: 'TLB', year: 4,
      new_pricing: { kind: 'floating', base_rate: 0.036, spread: 0.02, floor: 0 },
      call_premium_pct: 0.01, new_maturity_years: 6, new_oid_pct: 0, new_financing_fee_pct: 0,
      new_amort_pct_of_face: 0,
    }], (a) => {
      a.structure.tranches = [
        { name: 'TLB', type: 'senior', size: { x_ebitda: 0.3 }, pricing: { kind: 'floating', base_rate: 0.036, spread: 0.0375, floor: 0 }, amort_pct_of_face: 0.01, maturity_years: 8, oid_pct: 0, sweep: { participates: true, priority: 1 } },
      ];
      a.structure.sweep = { base_pct: 1, grid: null };
    });
    const o = runModel(deal.facts, deal.assumptions);
    const y4 = o.tranches[0][3];
    expect(y4.beginning_balance).toBeLessThanOrEqual(5e-3); // engine-retired before the refi year
    expect(y4.refinanced).toBe(true);                        // stamped — the §18.8 no-op contract
    expect(y4.refinancing_cash_cost).toBeLessThanOrEqual(0.01 * 5e-3); // ≤ pct × ε dust, zero new OID/fees
    expect(y4.unamortized_writeoff).toBe(0);                 // §7 zeroed the schedules at retirement
    const flags = o.coherence.filter((f) => f.code === 'refi_noop');
    expect(flags.length).toBe(1);
    expect(flags[0].severity).toBe('warn');
    // label discipline (gate (c)): tranche, year, and the ~0-costs statement are all in the message
    expect(flags[0].message).toContain('"TLB"');
    expect(flags[0].message).toContain('year 4');
    expect(flags[0].message).toContain('~0');
  });

  it('DUST case — engine-retired residual in (0, RETIRED_TOL]: the flag STILL fires (pins ε to the §7 tolerance)', () => {
    // Amortization leaves exactly ~0.002 outstanding entering year 4 (3 years × amort_pct
    // chosen so par·(1 − 3·pct) = 0.002); no sweep. The tranche crossed the §7 retired
    // threshold in year 3 (write-off taken, dust persists) — §18.8: its refi is the no-op class.
    const par = GOLDEN_DEALS.G2.facts.fy_ebitda; // x_ebitda 1 ⇒ par = FY-basis sizing EBITDA
    const deal = withRefi('G2', [{
      tranche_name: 'TLB', year: 4,
      new_pricing: { kind: 'floating', base_rate: 0.036, spread: 0.02, floor: 0 },
      call_premium_pct: 0.01, new_maturity_years: 6, new_oid_pct: 0, new_financing_fee_pct: 0,
      new_amort_pct_of_face: 0,
    }], (a) => {
      a.structure.tranches = [
        { name: 'TLB', type: 'senior', size: { x_ebitda: 1 }, pricing: { kind: 'floating', base_rate: 0.036, spread: 0.0375, floor: 0 }, amort_pct_of_face: (1 - 0.002 / par) / 3, maturity_years: 8, oid_pct: 0, sweep: { participates: false, priority: 1 } },
      ];
      a.structure.sweep = { base_pct: 0, grid: null };
    });
    const o = runModel(deal.facts, deal.assumptions);
    const y4 = o.tranches[0][3];
    expect(y4.beginning_balance).toBeGreaterThan(1e-9);      // genuinely NON-zero dust —
    expect(y4.beginning_balance).toBeLessThanOrEqual(5e-3);  // — inside the retired tolerance
    expect(y4.refinanced).toBe(true);
    const flags = o.coherence.filter((f) => f.code === 'refi_noop');
    expect(flags.length).toBe(1); // ε = RETIRED_TOL, not machine epsilon (mutant (c) reddens here)
  });

  it('NEGATIVE — a live-balance refi (G6-REFI) raises NO refi_noop', () => {
    const { facts, assumptions } = GOLDEN_DEALS.G6REFI;
    const o = runModel(facts, assumptions);
    expect(o.tranches[0][2].refinanced).toBe(true); // the refi genuinely ran…
    expect(o.coherence.some((f) => f.code === 'refi_noop')).toBe(false); // …and is not flagged
  });
});
