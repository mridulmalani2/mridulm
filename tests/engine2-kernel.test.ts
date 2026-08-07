/**
 * Kernel property tests (Phase B2, rebuild/PHASE_B_GOLDENS_KERNEL.md).
 *
 * Each test is tagged with the SPEC §14 invariant (or §-convention) it pins and states its
 * DOMAIN — properties only generate configurations inside their validity domain (SPEC §14).
 * Golden-column fixture checks live in tests/engine2-kernel-fixtures.test.ts.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { allInRate, cashInterest, commitmentFee, pikAccrual } from '../lib/engine2/kernel/rates';
import {
  amortScheduleYears,
  capAtOutstanding,
  scheduledAmort,
} from '../lib/engine2/kernel/amort';
import { closedFormTwoFlowIrr, irr, midYearTimes, npv } from '../lib/engine2/kernel/irr';
import { waterfallYear, type WaterfallYearIn } from '../lib/engine2/kernel/waterfall';
import { taxYear, type KernelTaxPolicy } from '../lib/engine2/kernel/taxstate';

const money = (min: number, max: number) => fc.double({ min, max, noNaN: true });
const pct = (max = 1) => fc.double({ min: 0, max, noNaN: true });

// ── rates (SPEC §4) ───────────────────────────────────────────────────────────

describe('kernel/rates — SPEC §4', () => {
  it('floating all-in = max(base, floor) + spread; the floor is a MAX, never an addition (DR-1 Item 4). Domain: rates ∈ [0, 25%]', () => {
    fc.assert(
      fc.property(pct(0.25), pct(0.25), pct(0.25), (base, floor, spread) => {
        const allIn = allInRate({ kind: 'floating', base_rate: base, spread, floor });
        expect(allIn).toBe(Math.max(base, floor) + spread);
        expect(allIn).toBeGreaterThanOrEqual(base + spread); // floor never reduces
        if (base >= floor) expect(allIn).toBe(base + spread); // inert floor adds NOTHING
      }),
    );
  });

  it('fixed pricing returns the rate; interest/PIK/fee are beginning-balance × rate. Domain: balance ∈ [0, 1e4], rates ∈ [0, 1]', () => {
    fc.assert(
      fc.property(money(0, 1e4), pct(1), (balance, rate) => {
        expect(allInRate({ kind: 'fixed', rate })).toBe(rate);
        expect(cashInterest(balance, rate)).toBe(balance * rate);
        expect(pikAccrual(balance, rate)).toBe(balance * rate);
        expect(commitmentFee(balance, rate)).toBe(balance * rate);
      }),
    );
  });

  it('PIK compounding over n years reproduces balance × (1+r)^n (§4). Domain: balance ∈ [1, 1e3], r ∈ [0, 30%], n ∈ [1, 12]', () => {
    fc.assert(
      fc.property(money(1, 1e3), pct(0.3), fc.integer({ min: 1, max: 12 }), (b0, r, n) => {
        let balance = b0;
        for (let i = 0; i < n; i++) balance += pikAccrual(balance, r);
        expect(balance).toBeCloseTo(b0 * Math.pow(1 + r, n), 6);
      }),
    );
  });
});

// ── amort (SPEC §3.3, invariant §14.15) ──────────────────────────────────────

describe('kernel/amort — SPEC §3.3 / §14.15', () => {
  it('§14.15: straight-line amort is % × ORIGINAL face — constant per year, never the declining balance. Domain: pct ∈ [0, 1], face ∈ [0, 1e4]', () => {
    fc.assert(
      fc.property(pct(1), money(0, 1e4), fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 20 }), (p, face, i, j) => {
        const s = { kind: 'straight_line_pct' as const, pct_of_face: p };
        expect(scheduledAmort(s, face, i)).toBe(p * face);
        expect(scheduledAmort(s, face, i)).toBe(scheduledAmort(s, face, j));
      }),
    );
  });

  it('bullet amortizes 0; custom reads its year and is 0 beyond the array. Domain: pcts ∈ [0, 1]', () => {
    fc.assert(
      fc.property(fc.array(pct(1), { maxLength: 8 }), money(0, 1e4), fc.integer({ min: 0, max: 12 }), (pcts, face, i) => {
        expect(scheduledAmort({ kind: 'bullet' }, face, i)).toBe(0);
        const expected = (pcts[i] ?? 0) * face;
        expect(scheduledAmort({ kind: 'custom', pct_of_face_by_year: pcts }, face, i)).toBe(expected);
      }),
    );
  });

  it('cap-at-outstanding: min(scheduled, max(0, outstanding)) — never negative, never exceeds either bound (§3.3)', () => {
    fc.assert(
      fc.property(money(0, 1e3), fc.double({ min: -100, max: 1e3, noNaN: true }), (s, o) => {
        const a = capAtOutstanding(s, o);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(s);
        expect(a).toBeLessThanOrEqual(Math.max(0, o));
        expect(a).toBe(Math.min(s, Math.max(0, o)));
      }),
    );
  });

  it('§14.5 (amort-only domain): a capped straight-line schedule never drives the balance negative and never retires more than face. Domain: no sweeps, pct ∈ [0, 1], years ≤ 15', () => {
    fc.assert(
      fc.property(pct(1), money(0.01, 1e3), fc.integer({ min: 1, max: 15 }), (p, face, years) => {
        const schedule = amortScheduleYears({ kind: 'straight_line_pct', pct_of_face: p }, face, years);
        let balance = face;
        let retired = 0;
        for (const scheduled of schedule) {
          const paid = capAtOutstanding(scheduled, balance);
          balance -= paid;
          retired += paid;
          expect(balance).toBeGreaterThanOrEqual(-1e-9);
        }
        expect(retired).toBeLessThanOrEqual(face + 1e-9);
      }),
    );
  });
});

// ── irr (SPEC §1, §14.14) ─────────────────────────────────────────────────────

describe('kernel/irr — SPEC §1 / §14.14', () => {
  it('§14.14: two-flow stream [−a, 0…, m·a at N] ⇒ IRR = m^(1/N) − 1 (closed form). Domain: a ∈ [1, 1e4], m ∈ [0.05, 8], N ∈ [1, 15]', () => {
    fc.assert(
      fc.property(money(1, 1e4), fc.double({ min: 0.05, max: 8, noNaN: true }), fc.integer({ min: 1, max: 15 }), (a, m, n) => {
        const cfs = [-a, ...Array(n - 1).fill(0), m * a];
        const closed = closedFormTwoFlowIrr(a, m * a, n)!;
        const solved = irr(cfs);
        expect(solved).not.toBeNull();
        expect(Math.abs(solved! - closed)).toBeLessThan(1e-8);
      }),
    );
  });

  it('NPV at the solved IRR is ~0 (root property). Domain: one sign change, root inside (−1, 10]', () => {
    fc.assert(
      fc.property(money(10, 1e3), fc.array(money(0, 500), { minLength: 1, maxLength: 10 }), (outflow, inflows) => {
        const cfs = [-outflow, ...inflows];
        const r = irr(cfs);
        fc.pre(r !== null);
        const scale = cfs.reduce((s, c) => s + Math.abs(c), 0);
        expect(Math.abs(npv(r!, cfs))).toBeLessThan(1e-6 * Math.max(1, scale));
      }),
    );
  });

  it('IRR is strictly increasing in the exit flow (§14.11 kernel analogue). Domain: exit equity > 0, IRR defined for both', () => {
    fc.assert(
      fc.property(money(10, 1e3), fc.array(money(0, 200), { minLength: 1, maxLength: 8 }), money(1, 500), (outflow, mids, bump) => {
        const base = [-outflow, ...mids.slice(0, -1), (mids[mids.length - 1] ?? 0) + 50];
        const bumped = [...base.slice(0, -1), base[base.length - 1] + bump];
        const r1 = irr(base);
        const r2 = irr(bumped);
        fc.pre(r1 !== null && r2 !== null);
        expect(r2!).toBeGreaterThan(r1! - 1e-12);
      }),
    );
  });

  it('§1 mid-year: interim flows shift to t−0.5, exit NEVER shifts — inert when interim flows are zero (the v1 UI statement)', () => {
    fc.assert(
      fc.property(money(10, 1e3), fc.double({ min: 0.1, max: 5, noNaN: true }), fc.integer({ min: 2, max: 10 }), (a, m, n) => {
        const cfs = [-a, ...Array(n - 1).fill(0), m * a];
        const standard = irr(cfs);
        const midYear = irr(cfs, midYearTimes(cfs.length));
        fc.pre(standard !== null && midYear !== null);
        expect(Math.abs(midYear! - standard!)).toBeLessThan(1e-9);
      }),
    );
  });

  it('§1 mid-year with POSITIVE interim flows raises IRR (flows pulled earlier). Domain: interim flows > 0, both IRRs defined', () => {
    fc.assert(
      fc.property(money(100, 1e3), fc.array(money(1, 100), { minLength: 1, maxLength: 8 }), (outflow, mids) => {
        const cfs = [-outflow, ...mids, outflow]; // exit at least returns capital
        const standard = irr(cfs);
        const midYear = irr(cfs, midYearTimes(cfs.length));
        fc.pre(standard !== null && midYear !== null);
        expect(midYear!).toBeGreaterThanOrEqual(standard! - 1e-12);
      }),
    );
  });

  it('midYearTimes: t=0 and the exit index never shift; interior flows sit at t − 0.5', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), (n) => {
        const times = midYearTimes(n);
        expect(times[0]).toBe(0);
        expect(times[n - 1]).toBe(n - 1);
        for (let i = 1; i < n - 1; i++) expect(times[i]).toBe(i - 0.5);
      }),
    );
  });

  it('numerics guards (2026-07-21 review): sub-economic magnitudes and NaN bracket endpoints are N/A — never the unsolved Newton seed or a bracket edge', () => {
    // Σ|cf| ≲ 1e-11 used to satisfy the npvTol floor AT the 10% Newton seed unsolved
    expect(irr([-1e-13, 2e-13])).toBeNull();
    expect(irr([-1e-160, 2e-160])).toBeNull();
    // t ≥ ~77 at the −0.9999 endpoint overflows into Inf − Inf = NaN for mixed-sign flows;
    // the NaN passed every sign test and the march returned RATE_HI (1000%) as an "IRR"
    expect(irr([-1, 1, -1, 1], [0, 77, 78, 79])).toBeNull();
    // a ±Inf endpoint keeps a usable sign and must STILL solve: −1 + 2(1+r)^−77 = 0
    const inf = irr([-1, 2], [0, 77]);
    expect(inf).not.toBeNull();
    expect(inf!).toBeCloseTo(Math.pow(2, 1 / 77) - 1, 10);
    // economic magnitudes are unaffected by the scale guard ($0.001m scale)
    const small = irr([-0.001, 0.0013]);
    expect(small).not.toBeNull();
    expect(small!).toBeCloseTo(0.3, 6);
  });

  it('N/A semantics (§11/§15): no sign change, degenerate or empty streams ⇒ null, never a sentinel', () => {
    expect(irr([])).toBeNull();
    expect(irr([-100])).toBeNull();
    expect(irr([100, 50, 25])).toBeNull();
    expect(irr([-100, -50, -25])).toBeNull();
    expect(irr([0, 0, 0])).toBeNull();
    expect(closedFormTwoFlowIrr(0, 100, 5)).toBeNull();
    expect(closedFormTwoFlowIrr(100, -1, 5)).toBeNull();
    expect(closedFormTwoFlowIrr(100, 100, 0)).toBeNull();
  });

  // ── MULTI-SIGN-CHANGE POLICY ──────────────────────────────────────────────
  // Required by the 2026-07-24 accuracy audit BEFORE SPEC §3 step-7 interim flows ship:
  // until G-1, every sponsor stream was [−outflow, 0, …, 0, +exit] — one sign change, so
  // Descartes guaranteed a unique IRR and the multi-root question never arose. irr.ts's
  // documented policy: ODD in-bracket root count ⇒ one root is returned (WHICH one is
  // unspecified); EVEN ⇒ invisible to the endpoint sign test ⇒ null. The product guarantee
  // is "missed, never wrong" — a returned number is ALWAYS a root.

  it('multi-root: an EVEN in-bracket root count returns null, never one of the roots', () => {
    // −100, +230, −132 has exact roots at 10% and 20% (132x² − 230x + 100 = 0, x = 1/(1+r)).
    // Both sit inside (−0.9999, 10], so the endpoint signs match and the bracket is blind.
    const cfs = [-100, 230, -132];
    expect(Math.abs(npv(0.1, cfs))).toBeLessThan(1e-9);
    expect(Math.abs(npv(0.2, cfs))).toBeLessThan(1e-9);
    expect(irr(cfs)).toBeNull(); // N/A — the honest answer when the IRR is ambiguous
  });

  it('multi-root: an ODD in-bracket root count returns a genuine root (NPV ≈ 0), not a bracket edge', () => {
    // −100, +400, −500, +250: three sign changes but only ONE real root — 250x³ − 500x² +
    // 400x − 100 has roots x = 0.4353208 and a complex pair, so r = 1/0.4353208 − 1 ≈ 129.71%.
    const cfs = [-100, 400, -500, 250];
    const r = irr(cfs);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(1 / 0.43532075 - 1, 6);
    const scale = cfs.reduce((s, c) => s + Math.abs(c), 0);
    expect(Math.abs(npv(r!, cfs))).toBeLessThan(1e-6 * scale); // well-conditioned here
    expect(r!).toBeGreaterThan(-0.9999);
    expect(r!).toBeLessThan(10);
  });

  it('multi-sign-change: a returned IRR always satisfies the solver contract — converged residual OR a bracketed sign change', () => {
    // The contract is a DISJUNCTION, and stating it as either half alone is false:
    //   (a) |NPV(r)| ≤ 1e-12 · Σ|cf|  — the solver's own convergence test (early return); or
    //   (b) r sits within ~1 ulp of a sign change — the bracket-exhaustion path.
    // (b) alone fails for streams that converge early on the residual (r is then accurate to
    // the residual tolerance, not to 1 ulp). (a) alone fails near the r → −1 pole, where the
    // discount factors (1 + r)^t blow up and the NPV curve goes near-vertical: measured over
    // 13,606 random multi-sign streams that returned an IRR, 14 showed |NPV| up to 6% of
    // scale, yet ALL 14 were bracketed within 1e-15 relative and ALL sat at r ∈ [−0.9997,
    // −0.976] — deep-loss rates against the search floor, not wrong answers.
    // What the disjunction rules out is the thing that would actually hurt: a bracket edge or
    // an unsolved Newton seed dressed up as an IRR.
    fc.assert(
      fc.property(fc.array(fc.double({ min: -500, max: 500, noNaN: true }), { minLength: 3, maxLength: 8 }), (cfs) => {
        const signs = cfs.filter((c) => c !== 0).map((c) => Math.sign(c));
        const changes = signs.reduce((n, s, i) => (i > 0 && s !== signs[i - 1] ? n + 1 : n), 0);
        fc.pre(changes >= 2); // the regime that only exists once interim flows can be non-zero
        const r = irr(cfs);
        if (r === null) return; // N/A is always an acceptable answer
        const scale = cfs.reduce((s, c) => s + Math.abs(c), 0);
        const converged = Math.abs(npv(r, cfs)) <= 1e-12 * Math.max(1, scale);
        const d = Math.max(Math.abs(r) * 1e-12, Number.MIN_VALUE);
        const bracketed =
          npv(Math.max(-0.9999, r - d), cfs) * npv(Math.min(10, r + d), cfs) <= 0;
        expect(converged || bracketed, `returned ${r} for ${JSON.stringify(cfs)}: neither converged nor bracketed`).toBe(true);
        expect(r).toBeGreaterThan(-1); // never the RATE_LO edge dressed up as an answer
      }),
      { numRuns: 1000 },
    );
  });

  it('§3 step 7 shape: distributions are ≥ 0 by construction, so a POSITIVE exit keeps the sponsor stream single-sign-change (unique IRR)', () => {
    // paid[t] = max(0, min(…)) — the engine can never emit a negative interim sponsor flow.
    // With a positive year-N flow the stream is [−out, ≥0, …, ≥0, +] : exactly one sign
    // change ⇒ Descartes gives at most one positive root ⇒ the multi-root policy never bites
    // on a solvent deal. This is the property that makes G-1 safe to ship.
    fc.assert(
      fc.property(
        money(50, 1e3),
        fc.array(money(0, 100), { minLength: 1, maxLength: 6 }),
        money(1, 2e3),
        (outflow, dists, exitFlow) => {
          const cfs = [-outflow, ...dists, exitFlow];
          const r = irr(cfs);
          fc.pre(r !== null);
          const scale = cfs.reduce((s, c) => s + Math.abs(c), 0);
          expect(Math.abs(npv(r!, cfs))).toBeLessThan(1e-6 * scale);
          // and mid-year (§1) solves on the same stream without changing that guarantee
          const m = irr(cfs, midYearTimes(cfs.length));
          if (m !== null) expect(Math.abs(npv(m, cfs, midYearTimes(cfs.length)))).toBeLessThan(1e-6 * scale);
        },
      ),
    );
  });

  it('§3 step 7 shape: a NEGATIVE year-N flow (value wipeout) after paid distributions is the one two-sign-change case — N/A, never a fabricated IRR', () => {
    // [−587.22, +12.09, +15.34, +10, −5] — distributions paid, then the exit wipes out.
    const cfs = [-587.22, 12.09, 15.34, 10, -5];
    const r = irr(cfs);
    if (r !== null) {
      const scale = cfs.reduce((s, c) => s + Math.abs(c), 0);
      expect(Math.abs(npv(r, cfs))).toBeLessThan(1e-6 * scale); // still a genuine root
    }
    // Either way the caller never receives a plausible-looking non-root.
    expect(r === null || Number.isFinite(r)).toBe(true);
  });
});

// ── waterfall (SPEC §3, invariants §14.3/4/5/15) ─────────────────────────────

const trancheArb = fc.record({
  name: fc.constantFrom('A', 'B', 'C', 'D'),
  outstanding: money(0, 500),
  scheduled_amort: money(0, 60),
  cash_interest: money(0, 40),
  sweep_participates: fc.boolean(),
  sweep_priority: fc.integer({ min: 1, max: 3 }),
});

const revolverArb = fc
  .record({
    commitment: money(0, 100),
    drawn_frac: pct(1),
    cash_interest: money(0, 10),
    commitment_fee: money(0, 2),
  })
  .map((r) => ({
    beginning_drawn: r.commitment * r.drawn_frac,
    commitment: r.commitment,
    cash_interest: r.cash_interest,
    commitment_fee: r.commitment_fee,
  }));

const waterfallArb: fc.Arbitrary<WaterfallYearIn> = fc.record({
  opening_cash: money(0, 200),
  fcf_pre_debt: fc.double({ min: -200, max: 300, noNaN: true }),
  min_cash: money(0, 50),
  sweep_pct: pct(1),
  // §3 step 7 / §3.7 — generated, not pinned off: the waterfall properties below (§14.3
  // conservation, §14.4 floor, §14.5 non-negative balances) must hold WITH a live
  // distribution and a live trap, not only with the feature off.
  distribution_request: money(0, 80),
  // §3 step 2R [v1.3.0]: generated, not pinned off — the same discipline the distribution
  // established (a cash cost that leaves the balance sheet must leave the waterfall too).
  refinancing_cash_cost: money(0, 40),
  rp_trap_level: fc.option(fc.double({ min: 0, max: 8, noNaN: true }), { nil: null }),
  ebitda_adj: fc.double({ min: -50, max: 300, noNaN: true }),
  tranches: fc.array(trancheArb, { maxLength: 4 }),
  revolver: fc.option(revolverArb, { nil: null }),
});

describe('kernel/waterfall — SPEC §3', () => {
  it('§14.3 running-cash conservation: closing = opening + FCF − interest − fees − amort − repay − sweep + draw − distribution, exact. Domain: any valid config', () => {
    fc.assert(
      fc.property(waterfallArb, (input) => {
        const out = waterfallYear(input);
        const identity =
          input.opening_cash +
          input.fcf_pre_debt -
          out.cash_interest_total -
          out.commitment_fees -
          out.mandatory_amort_total -
          out.revolver_repayment -
          out.sweep_applied_total -
          // §3 step 2R [v1.3.0]: the refi cash cost is a mandatory use inside the year and
          // enters the identity like every other step (omitting it is the same bug shape).
          (input.refinancing_cash_cost ?? 0) +
          out.revolver_draw -
          // §3 step 7 [v1.1.0]: the distribution is a real cash outflow and enters the
          // conservation identity like every other step. Omitting it here is the shape of
          // the bug where a payment leaves the balance sheet without leaving the waterfall.
          out.distribution_paid;
        const scale = Math.max(1, Math.abs(input.opening_cash) + Math.abs(input.fcf_pre_debt) + out.cash_interest_total + out.mandatory_amort_total + out.sweep_applied_total + out.distribution_paid + (input.refinancing_cash_cost ?? 0));
        expect(Math.abs(out.closing_cash - identity)).toBeLessThan(1e-9 * scale);
        // §14.18 under the same generated inputs (request, trap level and EBITDA_adj are
        // all generated by waterfallArb, INCLUDING EBITDA_adj ≤ 0 — normative per §3.7):
        expect(out.distribution_paid).toBeLessThanOrEqual(input.distribution_request + 1e-12);
        expect(out.distribution_paid).toBeGreaterThanOrEqual(0);
        // never revolver-funded: a payment can only spend cash ABOVE the floor
        if (out.distribution_paid > 0) {
          expect(out.closing_cash).toBeGreaterThanOrEqual(input.min_cash - 1e-9);
        }
        // the money form of the pro-forma test, for ALL EBITDA_adj including ≤ 0
        if (input.rp_trap_level !== null && out.distribution_paid > 0) {
          const grossEnd = out.tranches.reduce((a, t) => a + t.ending_outstanding, 0) + out.revolver_ending_drawn;
          const scale2 = Math.max(1, Math.abs(grossEnd) + Math.abs(out.closing_cash));
          expect(grossEnd - out.closing_cash).toBeLessThanOrEqual(input.rp_trap_level * input.ebitda_adj + 1e-9 * scale2);
        }
      }),
    );
  });

  it('§17 item (vii): the blocked FLAG uses min(request, cashCap), not cashCap alone — directed (accuracy audit C, 2026-07-25)', () => {
    // The property test can't reliably hit rp_max STRICTLY BETWEEN the request and the cash
    // cap, so a mutant `blocked = rpCap < max(0, cashCap)` (dropping the request term) went
    // undetected by 402 tests. This pins it: cash 60, floor 10 ⇒ cashCap 50; one un-swept
    // tranche of 100 ⇒ gross_debt_end 100; L 1 × EBITDA 70 ⇒ rp_max = 60 − (100 − 70) = 30,
    // strictly between request 10 and cashCap 50. paid = request-capped 10; blocked FALSE
    // (rp_max 30 ≥ min(10, 50) = 10). The mutant would read 30 < 50 = TRUE and mislabel it.
    const out = waterfallYear({
      opening_cash: 60, fcf_pre_debt: 0, min_cash: 10, sweep_pct: 0,
      tranches: [{ name: 'T', outstanding: 100, scheduled_amort: 0, cash_interest: 0, sweep_participates: false, sweep_priority: 1 }],
      revolver: null,
      distribution_request: 10, rp_trap_level: 1, ebitda_adj: 70,
    });
    expect(out.rp_max).toBeCloseTo(30, 12);
    expect(out.distribution_paid).toBeCloseTo(10, 12); // request-capped
    expect(out.distribution_blocked).toBe(false);       // the trap did NOT clip below the request
  });

  it('§14.18 / §3.7 at EBITDA_adj < 0 WITH a payment (net-cash regime) — directed (accuracy audit D, 2026-07-25)', () => {
    // The E ≤ 0 corner where a distribution still PAYS (net cash, so gross − cash < L·E even
    // for negative E) is only ~1% likely per CI run under the generator. Pinned directly:
    // no debt, cash 100, floor 10, E = −5, L 2 ⇒ rp_max = 100 − (0 − 2·(−5)) = 90; paid =
    // request-capped 50. The money form holds with BOTH sides negative.
    const out = waterfallYear({
      opening_cash: 100, fcf_pre_debt: 0, min_cash: 10, sweep_pct: 0,
      tranches: [], revolver: null,
      distribution_request: 50, rp_trap_level: 2, ebitda_adj: -5,
    });
    expect(out.rp_max).toBeCloseTo(90, 12);
    expect(out.distribution_paid).toBeCloseTo(50, 12);
    const grossEnd = 0; // no tranches, no revolver
    // §14.18 money form: post-payment net debt ≤ L × EBITDA_adj, both negative here
    expect(grossEnd - out.closing_cash).toBeLessThanOrEqual(2 * -5 + 1e-9); // −50 ≤ −10 ✓
    expect(out.distribution_blocked).toBe(false);
  });

  it('§3.7 at EBITDA_adj ≤ 0 with NO net-cash cushion is full lockdown (rp_max 0) — directed', () => {
    // The lender-intent case the ratio form would invert: levered and loss-making ⇒ paid 0.
    const out = waterfallYear({
      opening_cash: 50, fcf_pre_debt: 0, min_cash: 5, sweep_pct: 0,
      tranches: [{ name: 'T', outstanding: 200, scheduled_amort: 0, cash_interest: 0, sweep_participates: false, sweep_priority: 1 }],
      revolver: null,
      distribution_request: 30, rp_trap_level: 3, ebitda_adj: -10,
    });
    expect(out.rp_max).toBe(0);              // max(0, 50 − (200 − 3·(−10))) = max(0, 50 − 230) = 0
    expect(out.distribution_paid).toBe(0);
    expect(out.distribution_blocked).toBe(true); // cash alone (45 above floor) would have paid
  });

  it('§14.4: closing cash ≥ min_cash OR the floor-breach flag is set with the revolver exhausted. Domain: any valid config', () => {
    fc.assert(
      fc.property(waterfallArb, (input) => {
        const out = waterfallYear(input);
        if (out.closing_cash >= input.min_cash - 1e-9) {
          expect(out.cash_floor_breach).toBe(false);
        } else {
          expect(out.cash_floor_breach).toBe(true);
          // breach ⇒ nothing left to draw
          if (input.revolver) {
            expect(out.revolver_ending_drawn).toBeCloseTo(input.revolver.commitment, 9);
          }
        }
      }),
    );
  });

  it('§14.5: tranche balances never go negative; §14.15: mandatory = min(scheduled, outstanding). Domain: any valid config', () => {
    fc.assert(
      fc.property(waterfallArb, (input) => {
        const out = waterfallYear(input);
        for (let i = 0; i < input.tranches.length; i++) {
          const t = input.tranches[i];
          const o = out.tranches[i];
          expect(o.mandatory_amort).toBe(Math.min(t.scheduled_amort, Math.max(0, t.outstanding)));
          expect(o.ending_outstanding).toBeGreaterThanOrEqual(-1e-9);
          expect(o.sweep_repayment).toBeGreaterThanOrEqual(0);
          expect(o.sweep_repayment).toBeLessThanOrEqual(Math.max(0, t.outstanding - o.mandatory_amort) + 1e-9);
        }
      }),
    );
  });

  it('§3.5: sweep % applies to the POOL (max(0, cash − floor)) — total applied ≤ pct × pool; non-participating tranches never swept. Domain: any valid config', () => {
    fc.assert(
      fc.property(waterfallArb, (input) => {
        const out = waterfallYear(input);
        // recompute the pool FROM INPUTS (steps 1–4 re-derived) so this property stands
        // alone — an output-vs-output check would pass a self-consistently wrong pool
        // (2026-07-21 review, robustness note #5)
        const interest =
          input.tranches.reduce((a, t) => a + t.cash_interest, 0) +
          (input.revolver?.cash_interest ?? 0);
        const mandatory = input.tranches.reduce(
          (a, t) => a + Math.min(t.scheduled_amort, Math.max(0, t.outstanding)),
          0,
        );
        const afterStep3 =
          input.opening_cash + input.fcf_pre_debt - interest -
          (input.revolver?.commitment_fee ?? 0) - mandatory -
          // §3 step 2R [v1.3.0]: the refi cash cost is senior to the sweep — §18.7's
          // "the refi cost shrinks the sweep pool" is exactly what this property now proves
          (input.refinancing_cash_cost ?? 0);
        const repay = input.revolver
          ? Math.min(input.revolver.beginning_drawn, Math.max(0, afterStep3 - input.min_cash))
          : 0;
        const expectedPool = Math.max(0, afterStep3 - repay - input.min_cash);
        expect(out.sweep_pool).toBeCloseTo(expectedPool, 9);
        expect(out.sweepable).toBeCloseTo(input.sweep_pct * expectedPool, 9);
        expect(out.sweep_applied_total).toBeLessThanOrEqual(out.sweepable + 1e-9);
        for (let i = 0; i < input.tranches.length; i++) {
          if (!input.tranches[i].sweep_participates) expect(out.tranches[i].sweep_repayment).toBe(0);
        }
      }),
    );
  });

  it('§3.5 priority tiers: a junior tier receives cash only after every senior participating tranche is swept to capacity; pro-rata within a tier. Domain: any valid config', () => {
    fc.assert(
      fc.property(waterfallArb, (input) => {
        const out = waterfallYear(input);
        const capacity = (i: number) =>
          Math.max(0, input.tranches[i].outstanding - out.tranches[i].mandatory_amort);
        for (let j = 0; j < input.tranches.length; j++) {
          if (!input.tranches[j].sweep_participates || out.tranches[j].sweep_repayment <= 1e-9) continue;
          for (let i = 0; i < input.tranches.length; i++) {
            if (!input.tranches[i].sweep_participates) continue;
            if (input.tranches[i].sweep_priority < input.tranches[j].sweep_priority) {
              // senior tier saturated before junior j saw any cash
              expect(out.tranches[i].sweep_repayment).toBeCloseTo(capacity(i), 6);
            }
            // WITHIN a tier the split is pro-rata by capacity: cross-multiplied
            // proportionality (a sequential-fill mutant passed the old assertion —
            // 2026-07-21 review, surviving mutation #2)
            if (
              i !== j &&
              input.tranches[i].sweep_priority === input.tranches[j].sweep_priority
            ) {
              const lhs = out.tranches[i].sweep_repayment * capacity(j);
              const rhs = out.tranches[j].sweep_repayment * capacity(i);
              const scale = Math.max(1, capacity(i) * capacity(j));
              expect(Math.abs(lhs - rhs)).toBeLessThanOrEqual(1e-9 * scale);
            }
          }
        }
      }),
    );
  });

  it('§3.5 multi-tier + intra-tier pro-rata (directed): tier 1 pair splits 2:1 to capacity, the remainder cascades to tier 2 — hand-computed', () => {
    // pool = 0 + 190 − 0 − 0 − 0 = 190 above the 10 floor → 180; sweepable = 0.5 × 180 = 90.
    // Tier 1 capacity 40 + 20 = 60 < 90 → both retire EXACTLY; tier 2 gets 90 − 60 = 30 of 100.
    const out = waterfallYear({
      opening_cash: 0,
      fcf_pre_debt: 190,
      min_cash: 10,
      sweep_pct: 0.5,
      distribution_request: 0, rp_trap_level: null, ebitda_adj: 0,
      tranches: [
        { name: 'A', outstanding: 40, scheduled_amort: 0, cash_interest: 0, sweep_participates: true, sweep_priority: 1 },
        { name: 'B', outstanding: 20, scheduled_amort: 0, cash_interest: 0, sweep_participates: true, sweep_priority: 1 },
        { name: 'C', outstanding: 100, scheduled_amort: 0, cash_interest: 0, sweep_participates: true, sweep_priority: 2 },
      ],
      revolver: null,
    });
    expect(out.sweep_pool).toBeCloseTo(180, 12);
    expect(out.sweepable).toBeCloseTo(90, 12);
    expect(out.tranches[0].sweep_repayment).toBe(40); // exact retirement, no ulp residue
    expect(out.tranches[1].sweep_repayment).toBe(20);
    expect(out.tranches[2].sweep_repayment).toBeCloseTo(30, 12);
    expect(out.tranches[0].ending_outstanding).toBe(0);
    expect(out.tranches[1].ending_outstanding).toBe(0);
    expect(out.tranches[2].ending_outstanding).toBeCloseTo(70, 12);
    expect(out.sweep_applied_total).toBeCloseTo(90, 12);
    // partial-tier pro-rata: same tier-1 pair, sweepable 30 < capacity 60 → 20/10 split
    const partial = waterfallYear({
      opening_cash: 0,
      fcf_pre_debt: 70,
      min_cash: 10,
      sweep_pct: 0.5,
      distribution_request: 0, rp_trap_level: null, ebitda_adj: 0,
      tranches: [
        { name: 'A', outstanding: 40, scheduled_amort: 0, cash_interest: 0, sweep_participates: true, sweep_priority: 1 },
        { name: 'B', outstanding: 20, scheduled_amort: 0, cash_interest: 0, sweep_participates: true, sweep_priority: 1 },
      ],
      revolver: null,
    });
    expect(partial.tranches[0].sweep_repayment).toBeCloseTo(20, 12);
    expect(partial.tranches[1].sweep_repayment).toBeCloseTo(10, 12);
  });

  it('§3.4 revolver repaid FIRST, ahead of the sweep (DR-1 Item 2/3): a partially repaid revolver ⇒ zero sweep pool. Domain: revolver present', () => {
    fc.assert(
      fc.property(waterfallArb, (input) => {
        fc.pre(input.revolver !== null);
        const out = waterfallYear(input);
        if (out.revolver_repayment < input.revolver!.beginning_drawn - 1e-9) {
          expect(out.sweep_pool).toBeLessThanOrEqual(1e-9);
          expect(out.sweep_applied_total).toBeLessThanOrEqual(1e-9);
        }
      }),
    );
  });

  it('§3.6 draw: when cash dips below the floor and commitment remains, the draw restores EXACTLY the floor; draws never exceed the undrawn commitment. Domain: revolver present', () => {
    fc.assert(
      fc.property(waterfallArb, (input) => {
        fc.pre(input.revolver !== null);
        const out = waterfallYear(input);
        const undrawnAfterRepay =
          input.revolver!.commitment - (input.revolver!.beginning_drawn - out.revolver_repayment);
        expect(out.revolver_draw).toBeLessThanOrEqual(undrawnAfterRepay + 1e-9);
        if (out.revolver_draw > 0 && !out.cash_floor_breach) {
          expect(Math.abs(out.closing_cash - input.min_cash)).toBeLessThan(2e-9);
        }
        // draw and voluntary repayment never both happen (repay-first ordering)
        if (out.revolver_draw > 1e-9) expect(out.sweep_applied_total).toBeLessThanOrEqual(1e-9);
      }),
    );
  });
});

// ── waterfall ulp-exactness regressions (numerics review 2026-07-21) ─────────
// Both defects were 1-ulp float overshoots invisible to golden fixtures (state is
// re-injected per year there, never composed year-over-year): a fully swept tier could
// end microscopically NEGATIVE and a fully drawn revolver could end microscopically
// ABOVE the commitment — either poisons the next year's validator (§14.5 / drawn ≤
// commitment) with a RangeError.

describe('kernel/waterfall — ulp exactness (full retirement / full draw compose year-over-year)', () => {
  it('a tier retired by the sweep ends at EXACTLY 0 and re-injects without throwing (trigger: outstanding 108.18633402746718)', () => {
    const y1 = waterfallYear({
      opening_cash: 500,
      fcf_pre_debt: 0,
      min_cash: 0,
      sweep_pct: 1,
      distribution_request: 0, rp_trap_level: null, ebitda_adj: 0,
      tranches: [
        { name: 'TLB', outstanding: 108.18633402746718, scheduled_amort: 0, cash_interest: 0, sweep_participates: true, sweep_priority: 1 },
      ],
      revolver: null,
    });
    expect(y1.tranches[0].ending_outstanding).toBe(0); // exact, not ≈
    // composition: feeding the ending balance forward must not throw
    const y2 = waterfallYear({
      opening_cash: y1.closing_cash,
      fcf_pre_debt: 10,
      min_cash: 0,
      sweep_pct: 1,
      distribution_request: 0, rp_trap_level: null, ebitda_adj: 0,
      tranches: [
        { name: 'TLB', outstanding: y1.tranches[0].ending_outstanding, scheduled_amort: 0, cash_interest: 0, sweep_participates: true, sweep_priority: 1 },
      ],
      revolver: null,
    });
    expect(y2.tranches[0].ending_outstanding).toBe(0);
  });

  it('a two-tranche tier fully retired pro-rata ends both at EXACTLY 0 (trigger: tier total 450.89465099210724)', () => {
    const a = 450.89465099210724 * 0.37;
    const b = 450.89465099210724 - a;
    const out = waterfallYear({
      opening_cash: 2000,
      fcf_pre_debt: 0,
      min_cash: 0,
      sweep_pct: 1,
      distribution_request: 0, rp_trap_level: null, ebitda_adj: 0,
      tranches: [
        { name: 'A', outstanding: a, scheduled_amort: 0, cash_interest: 0, sweep_participates: true, sweep_priority: 1 },
        { name: 'B', outstanding: b, scheduled_amort: 0, cash_interest: 0, sweep_participates: true, sweep_priority: 1 },
      ],
      revolver: null,
    });
    expect(out.tranches[0].ending_outstanding).toBe(0);
    expect(out.tranches[1].ending_outstanding).toBe(0);
  });

  it('property: whenever the sweep can retire a whole tier, every tranche in it ends exactly ≥ 0 and re-injection never throws. Domain: 1–3 same-tier tranches, ample cash', () => {
    fc.assert(
      fc.property(
        fc.array(money(1e-3, 500), { minLength: 1, maxLength: 3 }),
        (balances) => {
          const out = waterfallYear({
            opening_cash: balances.reduce((s, x) => s + x, 0) * 2 + 10,
            fcf_pre_debt: 0,
            min_cash: 0,
            sweep_pct: 1,
            distribution_request: 0, rp_trap_level: null, ebitda_adj: 0,
            tranches: balances.map((outstanding, k) => ({
              name: `T${k}`,
              outstanding,
              scheduled_amort: 0,
              cash_interest: 0,
              sweep_participates: true,
              sweep_priority: 1,
            })),
            revolver: null,
          });
          for (const t of out.tranches) {
            expect(t.ending_outstanding).toBeGreaterThanOrEqual(0); // EXACT bound — no epsilon
            // re-injection is the real invariant (the validator throws on any negative)
            waterfallYear({
              opening_cash: 0,
              fcf_pre_debt: 0,
              min_cash: 0,
              sweep_pct: 0,
              distribution_request: 0, rp_trap_level: null, ebitda_adj: 0,
              tranches: [{ name: t.name, outstanding: t.ending_outstanding, scheduled_amort: 0, cash_interest: 0, sweep_participates: false, sweep_priority: 1 }],
              revolver: null,
            });
          }
        },
      ),
    );
  });

  it('a full revolver draw lands EXACTLY on the commitment and re-injects (trigger: commitment 54.1944762289961, drawn 20.550056167494116)', () => {
    const commitment = 54.1944762289961;
    const y1 = waterfallYear({
      opening_cash: 5,
      fcf_pre_debt: -500,
      min_cash: 5,
      sweep_pct: 0,
      distribution_request: 0, rp_trap_level: null, ebitda_adj: 0,
      tranches: [],
      revolver: { beginning_drawn: 20.550056167494116, commitment, cash_interest: 0, commitment_fee: 0 },
    });
    expect(y1.revolver_ending_drawn).toBe(commitment); // exact, not ≈
    expect(y1.cash_floor_breach).toBe(true);
    // composition (with a solvent opening — the post-breach opening-cash relaxation is a
    // separate v1.0.3 item): drawn === commitment must satisfy the validator
    const y2 = waterfallYear({
      opening_cash: 100,
      fcf_pre_debt: 0,
      min_cash: 5,
      sweep_pct: 0,
      distribution_request: 0, rp_trap_level: null, ebitda_adj: 0,
      tranches: [],
      revolver: { beginning_drawn: y1.revolver_ending_drawn, commitment, cash_interest: 0, commitment_fee: 0 },
    });
    expect(y2.revolver_ending_drawn).toBeLessThanOrEqual(commitment);
  });

  it('property: revolver ending drawn NEVER exceeds the commitment (exact bound) and always re-injects. Domain: any revolver config', () => {
    fc.assert(
      fc.property(waterfallArb, (input) => {
        fc.pre(input.revolver !== null);
        const out = waterfallYear(input);
        expect(out.revolver_ending_drawn).toBeLessThanOrEqual(input.revolver!.commitment); // no epsilon
        if (out.closing_cash >= 0) {
          waterfallYear({
            ...input,
            opening_cash: out.closing_cash,
            revolver: { ...input.revolver!, beginning_drawn: out.revolver_ending_drawn },
          });
        }
      }),
    );
  });

  it('§3.6 [v1.0.3] post-breach continuation: a negative closing cash re-injects as next year opening — conservation stays exact, the flag persists until cured', () => {
    // Y1: 5 + (−50) = −45; commitment 10 fully drawn → closing −35, breach.
    const y1 = waterfallYear({
      opening_cash: 5,
      fcf_pre_debt: -50,
      min_cash: 5,
      sweep_pct: 0,
      distribution_request: 0, rp_trap_level: null, ebitda_adj: 0,
      tranches: [],
      revolver: { beginning_drawn: 0, commitment: 10, cash_interest: 0, commitment_fee: 0 },
    });
    expect(y1.closing_cash).toBeCloseTo(-35, 12);
    expect(y1.cash_floor_breach).toBe(true);
    // Y2 runs on the inherited NEGATIVE opening cash (pre-v1.0.3 the kernel threw here;
    // the reference derivation computes it — B2 spec-review F2)
    const y2 = waterfallYear({
      opening_cash: y1.closing_cash,
      fcf_pre_debt: 10,
      min_cash: 5,
      sweep_pct: 0,
      distribution_request: 0, rp_trap_level: null, ebitda_adj: 0,
      tranches: [],
      revolver: { beginning_drawn: y1.revolver_ending_drawn, commitment: 10, cash_interest: 0, commitment_fee: 0 },
    });
    expect(y2.closing_cash).toBeCloseTo(-25, 12); // conservation: −35 + 10, nothing clamped
    expect(y2.cash_floor_breach).toBe(true); // still under the floor, commitment exhausted
    expect(y2.sweep_pool).toBe(0); // no pool below the floor
    // Y3 cures: enough FCF to clear the hole and the floor
    const y3 = waterfallYear({
      opening_cash: y2.closing_cash,
      fcf_pre_debt: 40,
      min_cash: 5,
      sweep_pct: 0,
      distribution_request: 0, rp_trap_level: null, ebitda_adj: 0,
      tranches: [],
      revolver: { beginning_drawn: y2.revolver_ending_drawn, commitment: 10, cash_interest: 0, commitment_fee: 0 },
    });
    expect(y3.closing_cash).toBeCloseTo(5, 12); // 15 above the hole − 10 revolver repay
    expect(y3.revolver_ending_drawn).toBe(0);
    expect(y3.cash_floor_breach).toBe(false);
  });
});

// ── taxstate (SPEC §6) ────────────────────────────────────────────────────────

const policyArb: fc.Arbitrary<KernelTaxPolicy> = fc.record({
  rate: pct(0.5),
  interest_deductible: fc.boolean(),
  s163j_applies: fc.boolean(),
  ati_pct: pct(1),
  acquired_usable: fc.boolean(),
  arose_pre_2018: fc.boolean(),
  s382_annual_limit: fc.option(money(0, 100), { nil: null }),
  minimum_rate: pct(0.3),
});

const taxStateArb = fc.record({
  acquired_nol: money(0, 300),
  postclose_nol: money(0, 300),
  s163j_carryforward: money(0, 100),
});

const taxYearArb = fc.record({
  ebit: fc.double({ min: -300, max: 500, noNaN: true }),
  ati: fc.double({ min: -300, max: 600, noNaN: true }),
  capped_interest_pool: money(0, 150),
  uncapped_deductions: money(0, 50),
});

describe('kernel/taxstate — SPEC §6', () => {
  it('§6.1 pool conservation: deductible + carryforward_end = capped pool + carryforward_open (when §163(j) applies and interest is deductible); cap = max(0, ati_pct × ATI). Domain: any valid config', () => {
    fc.assert(
      fc.property(policyArb, taxStateArb, taxYearArb, (p, s, y) => {
        const out = taxYear(p, s, y);
        if (!p.interest_deductible) {
          expect(out.deductible_capped_interest).toBe(0);
          expect(out.s163j_carryforward_end).toBe(0); // permanent disallowance: NOTHING accrues
        } else if (!p.s163j_applies) {
          expect(out.deductible_capped_interest).toBe(y.capped_interest_pool + s.s163j_carryforward);
          expect(out.s163j_carryforward_end).toBe(0); // fully released
        } else {
          const available = y.capped_interest_pool + s.s163j_carryforward;
          expect(out.deductible_capped_interest).toBeLessThanOrEqual(Math.max(0, p.ati_pct * y.ati) + 1e-12);
          // the negative-ATI floor: the deduction can never go NEGATIVE (a negative
          // "deduction" would silently RAISE taxable income — 2026-07-21 review, surviving
          // mutation #1)
          expect(out.deductible_capped_interest).toBeGreaterThanOrEqual(0);
          expect(out.deductible_capped_interest + out.s163j_carryforward_end).toBeCloseTo(available, 9);
          expect(out.s163j_carryforward_end).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });

  it('§6.1 negative-ATI floor (directed): ati ≤ 0 with §163(j) applying ⇒ ZERO deduction and the whole pool carries forward', () => {
    const p: KernelTaxPolicy = {
      rate: 0.25,
      interest_deductible: true,
      s163j_applies: true,
      ati_pct: 0.3,
      acquired_usable: false,
      arose_pre_2018: false,
      s382_annual_limit: null,
      minimum_rate: 0,
    };
    const s = { acquired_nol: 0, postclose_nol: 0, s163j_carryforward: 12.5 };
    for (const ati of [0, -1e-9, -50, -300]) {
      const out = taxYear(p, s, { ebit: -10, ati, capped_interest_pool: 40, uncapped_deductions: 5 });
      expect(out.deductible_capped_interest).toBe(0);
      expect(out.s163j_carryforward_end).toBeCloseTo(40 + 12.5, 12);
    }
  });

  it('§6.2 loss branch: taxable ≤ 0 ⇒ zero tax, zero NOL usage, the loss banks into the post-close pool. Domain: any valid config', () => {
    fc.assert(
      fc.property(policyArb, taxStateArb, taxYearArb, (p, s, y) => {
        const out = taxYear(p, s, y);
        if (out.taxable_before_nol <= 0) {
          expect(out.cash_tax).toBe(0);
          expect(out.acquired_nol_used).toBe(0);
          expect(out.postclose_nol_used).toBe(0);
          expect(out.nol_banked).toBe(-out.taxable_before_nol);
          expect(out.state_end.postclose_nol).toBeCloseTo(s.postclose_nol + out.nol_banked, 9);
          expect(out.state_end.acquired_nol).toBe(s.acquired_nol);
        } else {
          expect(out.nol_banked).toBe(0);
        }
      }),
    );
  });

  it('§6.3 pool accounting: usage ≤ opening pool, end = open − used, pools never negative. Domain: any valid config', () => {
    fc.assert(
      fc.property(policyArb, taxStateArb, taxYearArb, (p, s, y) => {
        const out = taxYear(p, s, y);
        expect(out.acquired_nol_used).toBeLessThanOrEqual(s.acquired_nol + 1e-12);
        expect(out.postclose_nol_used).toBeLessThanOrEqual(s.postclose_nol + 1e-12);
        expect(out.state_end.acquired_nol).toBeCloseTo(s.acquired_nol - out.acquired_nol_used, 9);
        expect(out.state_end.acquired_nol).toBeGreaterThanOrEqual(-1e-12);
        expect(out.state_end.postclose_nol).toBeGreaterThanOrEqual(-1e-12);
        if (!p.acquired_usable) expect(out.acquired_nol_used).toBe(0);
      }),
    );
  });

  it('§6.3 caps: acquired ≤ min(§382 limit, layer cap × taxable); post-2017 layers share the 80% aggregate; a pre-2018 acquired layer has its own 100% cap and leaves the 80% headroom intact. Domain: profitable years', () => {
    fc.assert(
      fc.property(policyArb, taxStateArb, taxYearArb, (p, s, y) => {
        const out = taxYear(p, s, y);
        fc.pre(out.taxable_before_nol > 0);
        const taxable = out.taxable_before_nol;
        const capPct = p.arose_pre_2018 ? 1.0 : 0.8;
        expect(out.acquired_nol_used).toBeLessThanOrEqual((p.s382_annual_limit ?? Infinity) + 1e-12);
        expect(out.acquired_nol_used).toBeLessThanOrEqual(capPct * taxable + 1e-9);
        if (p.arose_pre_2018) {
          expect(out.postclose_nol_used).toBeLessThanOrEqual(0.8 * taxable + 1e-9);
        } else {
          expect(out.acquired_nol_used + out.postclose_nol_used).toBeLessThanOrEqual(0.8 * taxable + 1e-9);
        }
      }),
    );
  });

  it('§6.3 [v1.0.3] aggregate bound: acquired + post-close usage NEVER exceeds taxable income — in BOTH pre-2018 and post-2017 branches. Domain: profitable years', () => {
    fc.assert(
      fc.property(policyArb, taxStateArb, taxYearArb, (p, s, y) => {
        const out = taxYear(p, s, y);
        fc.pre(out.taxable_before_nol > 0);
        expect(out.acquired_nol_used + out.postclose_nol_used).toBeLessThanOrEqual(
          out.taxable_before_nol + 1e-9,
        );
        expect(out.regular_tax).toBeGreaterThanOrEqual(-1e-12); // no negative pre-clamp tax
      }),
    );
  });

  it('§6.3 [v1.0.3] pre-2018 residual base (directed, the review trigger): taxable 100, pools 100/100 ⇒ acquired 100, post-close 0, tax 0, post-close pool PRESERVED', () => {
    const p: KernelTaxPolicy = {
      rate: 0.25,
      interest_deductible: true,
      s163j_applies: false,
      ati_pct: 0.3,
      acquired_usable: true,
      arose_pre_2018: true,
      s382_annual_limit: null,
      minimum_rate: 0,
    };
    const out = taxYear(
      p,
      { acquired_nol: 100, postclose_nol: 100, s163j_carryforward: 0 },
      { ebit: 100, ati: 100, capped_interest_pool: 0, uncapped_deductions: 0 },
    );
    expect(out.taxable_before_nol).toBe(100);
    expect(out.acquired_nol_used).toBe(100);
    expect(out.postclose_nol_used).toBe(0); // 0.8 × (100 − 100) — NOT 0.8 × 100
    expect(out.regular_tax).toBe(0);
    expect(out.cash_tax).toBe(0);
    expect(out.state_end.postclose_nol).toBe(100); // preserved for later years, not burned
    // partial pre-2018 layer: taxable 100, acquired 40 ⇒ post-close capped at 0.8 × 60 = 48
    const partial = taxYear(
      p,
      { acquired_nol: 40, postclose_nol: 100, s163j_carryforward: 0 },
      { ebit: 100, ati: 100, capped_interest_pool: 0, uncapped_deductions: 0 },
    );
    expect(partial.acquired_nol_used).toBe(40);
    expect(partial.postclose_nol_used).toBeCloseTo(48, 12);
    expect(partial.acquired_nol_used + partial.postclose_nol_used).toBeLessThanOrEqual(100);
  });

  it('§6.3 layer cap binds WITHOUT a §382 mask (directed: s382 = null): acquired usage = min(pool, cap_pct × taxable). Domain: profitable, usable, post-2017', () => {
    // policyArb draws a non-null s382 ~5/6 of the time and it almost always binds below the
    // 80% layer cap, masking it — dropping the layer cap survived 0/8 seeded property runs
    // (2026-07-21 review, robustness note #4). Pin the cap with the mask removed.
    fc.assert(
      fc.property(taxStateArb, taxYearArb, (s, y) => {
        const p: KernelTaxPolicy = {
          rate: 0.25,
          interest_deductible: true,
          s163j_applies: false,
          ati_pct: 0.3,
          acquired_usable: true,
          arose_pre_2018: false,
          s382_annual_limit: null,
          minimum_rate: 0,
        };
        const out = taxYear(p, s, y);
        fc.pre(out.taxable_before_nol > 0);
        expect(out.acquired_nol_used).toBeCloseTo(
          Math.min(s.acquired_nol, 0.8 * out.taxable_before_nol),
          9,
        );
      }),
    );
  });

  it('§6.4 floor on the PRE-NOL base: cash tax = max(regular, min_rate × taxable) ≥ 0; NOL usage is UNCHANGED by the floor (consumed in full — no usage optimization). Domain: profitable years', () => {
    fc.assert(
      fc.property(policyArb, taxStateArb, taxYearArb, pct(0.3), (p, s, y, altMinRate) => {
        const out = taxYear(p, s, y);
        fc.pre(out.taxable_before_nol > 0);
        expect(out.cash_tax).toBe(Math.max(out.regular_tax, out.minimum_tax));
        expect(out.minimum_tax).toBeCloseTo(p.minimum_rate * out.taxable_before_nol, 9);
        expect(out.cash_tax).toBeGreaterThanOrEqual(0);
        // the floor never alters NOL consumption
        const alt = taxYear({ ...p, minimum_rate: altMinRate }, s, y);
        expect(alt.acquired_nol_used).toBe(out.acquired_nol_used);
        expect(alt.postclose_nol_used).toBe(out.postclose_nol_used);
      }),
    );
  });

  it('multi-year chaining: feeding state_end forward keeps every pool finite and non-negative. Domain: 1–8 random years', () => {
    fc.assert(
      fc.property(policyArb, taxStateArb, fc.array(taxYearArb, { minLength: 1, maxLength: 8 }), (p, s0, years) => {
        let state = s0;
        for (const y of years) {
          const out = taxYear(p, state, y);
          state = out.state_end;
          expect(state.acquired_nol).toBeGreaterThanOrEqual(-1e-12);
          expect(state.postclose_nol).toBeGreaterThanOrEqual(-1e-12);
          expect(state.s163j_carryforward).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(state.postclose_nol)).toBe(true);
        }
      }),
    );
  });
});
