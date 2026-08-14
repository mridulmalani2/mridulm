/**
 * SPEC §22 [v1.7.0] — sweet equity / MIP ratchets / warrants: the engine gate.
 *
 * 1. Engine-vs-fixture: `runModel` reproduces the ADJUDICATED G9-SWEET and G10-RATCHET
 *    goldens (both blind passes SIGNED — tests/goldens/DERIVATION.md).
 * 2. §22.13's golden-uncovered directed fixtures (i)–(xii), each designed so the mutant it
 *    names REDs (the documented-mutant discipline runs them by string-replace).
 * 3. The §14.23 invariants on the shapes the goldens cannot reach.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runModel } from '../lib/engine2/facade';
import { buildExitWaterfall, validateSweetEquity, type ExitInputs } from '../lib/engine2/exit';
import { buildSensitivityGrid } from '../lib/engine2/scenarios';
import { runCoherence } from '../lib/engine2/check';
import { stripInterimSplit } from '../lib/engine2/sequence';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';
import type { DealAssumptions } from '../lib/engine2/types';

const ROOT = join(__dirname, '..');
const load = (n: string) => JSON.parse(readFileSync(join(ROOT, 'tests/goldens', n, 'expected.json'), 'utf8'));
const TOL = 0.0075; // ±$0.005m display bar + fixture rounding headroom (§15)

/** Minimal synthetic ExitInputs — exit_year_ebitda_adj at multiple 1 / no fees drives E directly. */
const syntheticInputs = (over: Partial<ExitInputs>): ExitInputs => ({
  exit_year_ebitda_adj: 0, last_growth: 0, debt_payoff: 0, closing_cash: 0,
  unamortized_writeoff: 0, invested_equity_total: 100, rollover_equity: 0,
  cumulative_distributions: 0,
  loan_notes_subscribed: 0, loan_note_balance_at_exit: 0, institutional_interim_value: 0,
  ...over,
});
const syntheticAssumptions = (
  over: Partial<Pick<DealAssumptions, 'mip' | 'sweet_equity' | 'warrant'>>,
): Pick<DealAssumptions, 'exit' | 'mip' | 'fees' | 'sweet_equity' | 'warrant'> => ({
  exit: { multiple: 1, basis: 'fy', fees_pct: 0 },
  fees: { transaction_pct_of_ev: 0, financing_pct_of_commitments: 0, monitoring: null },
  mip: null, sweet_equity: null, warrant: null,
  ...over,
});

describe('§22 engine vs the adjudicated goldens (G9-SWEET / G10-RATCHET)', () => {
  const g9 = load('G9SWEET');
  const g10 = load('G10RATCHET');
  const runG9 = runModel(GOLDEN_DEALS.G9SWEET.facts, GOLDEN_DEALS.G9SWEET.assumptions);
  const runG10 = runModel(GOLDEN_DEALS.G10RATCHET.facts, GOLDEN_DEALS.G10RATCHET.assumptions);

  it('G9-SWEET: every exit key, every equity_strip key, S&U and returns at fixture precision', () => {
    for (const key of Object.keys(g9.exit)) {
      expect(Math.abs((runG9.exit as any)[key] - g9.exit[key]), `exit.${key}`).toBeLessThan(TOL);
    }
    expect(runG9.equity_strip).not.toBeNull();
    for (const key of Object.keys(g9.equity_strip)) {
      const mine = (runG9.equity_strip as any)[key];
      const theirs = g9.equity_strip[key];
      if (typeof theirs === 'boolean' || theirs === null) expect(mine, `equity_strip.${key}`).toBe(theirs);
      else if (key === 'ratchet_tiers_reached') expect(mine, key).toBe(theirs);
      else if (key === 'management_effective_ordinary_pct' || key === 'institution_moic_at_ratchet')
        expect(Math.abs(mine - theirs), key).toBeLessThan(1e-4);
      else expect(Math.abs(mine - theirs), `equity_strip.${key}`).toBeLessThan(TOL);
    }
    for (const key of ['sponsor_equity', 'management_subscription', 'total_sources', 'total_uses'] as const) {
      expect(Math.abs(runG9.sources_uses[key] - g9.sources_uses[key]), `su.${key}`).toBeLessThan(TOL);
    }
    expect(Math.abs(runG9.returns.sponsor_net.moic! - g9.returns.sponsor_net.moic)).toBeLessThan(1e-4);
    expect(Math.abs(runG9.returns.sponsor_net.irr! - g9.returns.sponsor_net.irr)).toBeLessThan(1e-5);
    expect(Math.abs(runG9.returns.pre_promote.moic! - g9.returns.pre_promote.moic)).toBeLessThan(1e-4);
  });

  it('G9-SWEET: the §14.23(d) mirror and the §14.16 five-term mirror, exact', () => {
    expect(runG9.returns.sponsor_net.moic).toBeCloseTo(runG9.equity_strip!.institution_moic_at_ratchet!, 9);
    const e = runG9.exit;
    expect(e.sponsor_share + e.rollover_share + e.mip_payout + e.management_ordinary_share + e.warrant_payout_net)
      .toBeCloseTo(e.exit_equity_pre_mip_total, 9);
    expect(runG9.equity_strip!.ratchet_tiers_reached).toBe(1);
  });

  it('G10-RATCHET: exit keys, promote, and NO equity_strip', () => {
    for (const key of Object.keys(g10.exit)) {
      expect(Math.abs((runG10.exit as any)[key] - g10.exit[key]), `exit.${key}`).toBeLessThan(TOL);
    }
    expect(runG10.equity_strip).toBeNull();
    expect(runG10.exit.mip_payout).toBeGreaterThan(17.36); // strictly above G3's single tier
    const e = runG10.exit;
    expect(e.sponsor_share + e.rollover_share + e.mip_payout + e.management_ordinary_share + e.warrant_payout_net)
      .toBeCloseTo(e.exit_equity_pre_mip_total, 9);
  });

  it('§22.12 coherence enumeration: each golden emits EXACTLY ONE ahydo_shape WARN and nothing else', () => {
    for (const run of [runG9, runG10]) {
      expect(run.coherence.map((f) => f.code)).toEqual(['ahydo_shape']);
    }
  });

  it('§14.9(a)/(b): the amended bridge reconciles to ~0 on BOTH goldens (§22.13(ix))', () => {
    expect(runG9.bridge.reconciliation_residual).toBeLessThan(1e-6);
    expect(runG10.bridge.reconciliation_residual).toBeLessThan(1e-6);
  });
});

describe('§22.13 directed fixtures — golden-uncovered by design', () => {
  it('(i) mip.ratchet [] ≡ null ≡ v1 §10; a length-1 UNREACHED tier is also v1-identical', () => {
    const g3 = GOLDEN_DEALS.G3;
    const base = runModel(g3.facts, g3.assumptions);
    const empty = runModel(g3.facts, {
      ...g3.assumptions,
      mip: { ...g3.assumptions.mip!, ratchet: [] },
    });
    const unreached = runModel(g3.facts, {
      ...g3.assumptions,
      // X ≈ 703.833238 on G3; T₁ = 10 × 392.075 is far above it, so the tier is UNREACHED.
      mip: { ...g3.assumptions.mip!, ratchet: [{ hurdle_moic: 10, share_pct: 0.99 }] },
    });
    expect(empty.exit).toEqual(base.exit);
    expect(empty.returns).toEqual(base.returns);
    expect(unreached.exit.mip_payout).toBeCloseTo(base.exit.mip_payout, 9);
  });

  it('(ii) the §22.4 exit-equity cap BINDS on a ratcheted promote and TRUNCATES it', () => {
    // huge banked distributions against a small exit residual: uncapped ≫ exit equity.
    const { exit } = buildExitWaterfall(
      syntheticAssumptions({ mip: { pool_pct: 0.3, hurdle_moic: 1.0, ratchet: [{ hurdle_moic: 2.0, share_pct: 0.5 }] } }),
      syntheticInputs({ exit_year_ebitda_adj: 10, invested_equity_total: 100, cumulative_distributions: 500 }),
    );
    // X = 10 + 500 = 510; uncapped = 0.3×(200−100) + 0.5×(510−200) = 30 + 155 = 185 ≫ 10.
    expect(exit.mip_payout).toBeCloseTo(10, 12); // capped at max(0, exit equity)
  });

  it('(iii) the §22.5 EXACT TIER BOUNDARY: count 0 (STRICT), money unchanged', () => {
    // I = 50, V₀ = 100 (banked interim), T₁ = 2.4×50 = 120, s₀ = 0.20, s₁ = 0.36, P = 25.
    const { exit, equity_strip } = buildExitWaterfall(
      syntheticAssumptions({
        sweet_equity: {
          sponsor_ordinary_pct: 1.0, loan_note_rate: 0, management_subscription: 0,
          management_ordinary_pct: 0.20, ratchet: [{ hurdle_moic: 2.4, share_pct: 0.36 }],
        },
      }),
      syntheticInputs({ exit_year_ebitda_adj: 25, invested_equity_total: 50, institutional_interim_value: 100 }),
    );
    // need = (120 − 100)/0.8 = 25 = P exactly: the pot is exhausted AT the threshold.
    expect(equity_strip!.management_ordinary_share).toBeCloseTo(5.0, 12);
    expect(equity_strip!.institution_moic_at_ratchet).toBeCloseTo(2.4, 12);
    expect(equity_strip!.ratchet_tiers_reached).toBe(0); // strict > — on the boundary takes the LOWER tier
    expect(exit.management_ordinary_share).toBeCloseTo(5.0, 12);
  });

  it('(iv) the cliff counterexample produces the MARGINAL answer — no cliff branch smuggled in', () => {
    // §22.5's no-fixed-point inputs: V₀ = 100, T = 120, P = 25, 20% below / 36% at-or-above.
    // A cliff has NO solution here; the marginal rule answers M = 5.0, count 0, continuously.
    const { equity_strip } = buildExitWaterfall(
      syntheticAssumptions({
        sweet_equity: {
          sponsor_ordinary_pct: 1.0, loan_note_rate: 0, management_subscription: 0,
          management_ordinary_pct: 0.20, ratchet: [{ hurdle_moic: 2.4, share_pct: 0.36 }],
        },
      }),
      syntheticInputs({ exit_year_ebitda_adj: 25, invested_equity_total: 50, institutional_interim_value: 100 }),
    );
    expect(equity_strip!.management_ordinary_share).toBeCloseTo(5.0, 12);
    expect(equity_strip!.ratchet_tiers_reached).toBe(0);
  });

  it('(v) loan_notes_unredeemed fires on E < LN[N] and NOT within the $0.005m band (§14.23(g))', () => {
    const sweet: NonNullable<DealAssumptions['sweet_equity']> = {
      sponsor_ordinary_pct: 0.10, loan_note_rate: 0, management_subscription: 0,
      management_ordinary_pct: 0.10, ratchet: null,
    };
    const mk = (E: number, ln: number) =>
      buildExitWaterfall(
        syntheticAssumptions({ sweet_equity: sweet }),
        syntheticInputs({ exit_year_ebitda_adj: E, loan_notes_subscribed: ln, loan_note_balance_at_exit: ln }),
      );
    // Underwater strip: E = 200 < LN 500 ⇒ shortfall 300, redeemed = 200, pot = 0.
    const under = mk(200, 500);
    expect(under.equity_strip!.loan_notes_redeemed).toBeCloseTo(200, 12);
    expect(under.equity_strip!.loan_notes_accrued_balance - under.equity_strip!.loan_notes_redeemed).toBeGreaterThan(0.005);
    expect(under.exit.sponsor_share).toBeCloseTo(200, 12); // sponsor_share ≡ E (§22.13(v))
    // Within the band: shortfall 0.004 ⇒ must NOT satisfy the flag condition.
    const near = mk(499.996, 500);
    expect(near.equity_strip!.loan_notes_accrued_balance - near.equity_strip!.loan_notes_redeemed).toBeLessThanOrEqual(0.005);
  });

  it('(v)(α) NEGATIVE E under a strip, V₀ = 0: sponsor ≡ E and institution_moic = E/I < 0', () => {
    const { exit, equity_strip } = buildExitWaterfall(
      syntheticAssumptions({
        sweet_equity: {
          sponsor_ordinary_pct: 1.0, loan_note_rate: 0, management_subscription: 0,
          management_ordinary_pct: 0.10, ratchet: [{ hurdle_moic: 0.8, share_pct: 0.15 }, { hurdle_moic: 0.9, share_pct: 0.2 }],
        },
      }),
      syntheticInputs({ exit_year_ebitda_adj: -25, invested_equity_total: 100 }),
    );
    expect(exit.sponsor_share).toBeCloseTo(-25, 12); // ≡ E
    expect(exit.management_ordinary_share).toBe(0);
    // THE discriminating assert: V_final = V₀ + P = −25, NOT V₀ = 0 — the V_final ← V₀ mutant reads 0.00.
    expect(equity_strip!.institution_moic_at_ratchet).toBeCloseTo(-0.25, 12);
    expect(equity_strip!.ratchet_tiers_reached).toBe(0);
    expect(equity_strip!.management_effective_ordinary_pct).toBeNull(); // P ≤ 0 (§14.23(e))
    // five-term mirror closes on the negative pot
    expect(exit.sponsor_share + exit.rollover_share + exit.mip_payout + exit.management_ordinary_share + exit.warrant_payout_net)
      .toBeCloseTo(exit.exit_equity_pre_mip_total, 12);
  });

  it('(v)(β) NEGATIVE E, sweet NULL, rollover > 0: the §9 pari-passu split, byte-identical to v1', () => {
    const { exit, equity_strip } = buildExitWaterfall(
      syntheticAssumptions({}),
      syntheticInputs({ exit_year_ebitda_adj: -25, invested_equity_total: 100, rollover_equity: 25 }),
    );
    expect(exit.sponsor_share).toBeCloseTo(-18.75, 12);
    expect(exit.rollover_share).toBeCloseTo(-6.25, 12); // the direct assert that catches the r1 clamp
    expect(equity_strip).toBeNull();
    expect(exit.sponsor_share + exit.rollover_share + exit.mip_payout + exit.management_ordinary_share + exit.warrant_payout_net)
      .toBeCloseTo(exit.exit_equity_pre_mip_total, 12);
  });

  it('(vi) warrant boundaries: ATM does NOT exercise (false/0/0); OTM; penny; warrant-only + rollover', () => {
    const w = { holder_label: 'w', pct_of_ordinary: 0.05, strike_total: 2.0 };
    // AT the money: P₀ = K(1−w)/w = 38 ⇒ strict > fails ⇒ false / 0 / 0 (the ≥ mutant reads true/2/2).
    const atm = buildExitWaterfall(syntheticAssumptions({ warrant: w }), syntheticInputs({ exit_year_ebitda_adj: 38 }));
    expect(atm.equity_strip!.warrant_exercised).toBe(false);
    expect(atm.equity_strip!.warrant_strike_paid).toBe(0);
    expect(atm.equity_strip!.warrant_payout_gross).toBe(0);
    expect(atm.equity_strip!.ordinary_pot).toBeCloseTo(38, 12);
    // OUT of the money.
    const otm = buildExitWaterfall(syntheticAssumptions({ warrant: w }), syntheticInputs({ exit_year_ebitda_adj: 20 }));
    expect(otm.equity_strip!.warrant_exercised).toBe(false);
    expect(otm.exit.warrant_payout_net).toBe(0);
    // PENNY warrant (K = 0): exercises on any positive pot; net = gross = w × P₀.
    const penny = buildExitWaterfall(
      syntheticAssumptions({ warrant: { ...w, strike_total: 0 } }),
      syntheticInputs({ exit_year_ebitda_adj: 100 }),
    );
    expect(penny.equity_strip!.warrant_exercised).toBe(true);
    expect(penny.equity_strip!.warrant_payout_net).toBeCloseTo(5, 12);
    // WARRANT-ONLY with a ROLLOVER: pari-passu dilution exercised; institution_ordinary_share ≡ sponsor_share.
    const ro = buildExitWaterfall(
      syntheticAssumptions({ warrant: w }),
      syntheticInputs({ exit_year_ebitda_adj: 100, invested_equity_total: 100, rollover_equity: 25 }),
    );
    const pot = 0.95 * (100 + 2);
    expect(ro.equity_strip!.ordinary_pot).toBeCloseTo(pot, 12);
    expect(ro.exit.rollover_share).toBeCloseTo(pot * 0.25, 12);
    expect(ro.exit.sponsor_share).toBeCloseTo(pot * 0.75, 12);
    expect(ro.equity_strip!.institution_ordinary_share).toBeCloseTo(ro.exit.sponsor_share, 12);
    expect(ro.equity_strip!.management_ordinary_share).toBe(0);
    expect(ro.equity_strip!.ratchet_tiers_reached).toBe(0);
    expect(ro.equity_strip!.management_effective_ordinary_pct).toBeNull();
    expect(ro.equity_strip!.institution_moic_at_ratchet).toBeNull();
  });

  it('(vii) the strip WITH interim distributions: redemption-first split, both branches, non-constant DPI fraction', () => {
    const sweet: NonNullable<DealAssumptions['sweet_equity']> = {
      sponsor_ordinary_pct: 0.5, loan_note_rate: 0.1, management_subscription: 0,
      management_ordinary_pct: 0.1, ratchet: null,
    };
    // plug 100 ⇒ LN[0] = 50. Year 1: grown 55, paid 60 EXCEEDS it ⇒ redeems 55, ords 5.
    // Year 2: grown 0, paid 10 ⇒ all ords. Year 3: paid 0.
    const split = stripInterimSplit(sweet, 100, [60, 10, 0]);
    expect(split.loan_notes_subscribed).toBeCloseTo(50, 12);
    expect(split.redeemed[0]).toBeCloseTo(55, 12);
    expect(split.institution_share[0]).toBeCloseTo(55 + 0.9 * 5, 12);
    expect(split.management_share[0]).toBeCloseTo(0.5, 12);
    expect(split.redeemed[1]).toBe(0);
    expect(split.institution_share[1]).toBeCloseTo(9, 12);
    expect(split.management_share[1]).toBeCloseTo(1, 12);
    expect(split.loan_note_balance_at_exit).toBe(0);
    // the sponsor fraction is NON-constant: 59.5/60 in year 1 vs 9/10 in year 2.
    expect(split.institution_share[0] / 60).not.toBeCloseTo(split.institution_share[1] / 10, 6);
    // conservation each year: institution + management ≡ paid
    expect(split.institution_share[0] + split.management_share[0]).toBeCloseTo(60, 12);
    expect(split.institution_share[1] + split.management_share[1]).toBeCloseTo(10, 12);
  });

  it('(viii) the SEVEN §22.3 rejections, one case each', () => {
    const sweet: NonNullable<DealAssumptions['sweet_equity']> = {
      sponsor_ordinary_pct: 0.1, loan_note_rate: 0.08, management_subscription: 2,
      management_ordinary_pct: 0.1, ratchet: null,
    };
    const v = (over: Parameters<typeof validateSweetEquity>[0]) => () => validateSweetEquity(over);
    // (i) promote ∧ strip
    expect(v({ sweet_equity: sweet, warrant: null, mip: { pool_pct: 0.15, hurdle_moic: 1.5, ratchet: null }, rollover_equity: 0 })).toThrow(/§22.3/);
    // (ii) strip ∧ rollover
    expect(v({ sweet_equity: sweet, warrant: null, mip: null, rollover_equity: 10 })).toThrow(/§22.3/);
    // (iii) domain violation: hurdle_moic ≤ 0
    expect(v({ sweet_equity: { ...sweet, ratchet: [{ hurdle_moic: 0, share_pct: 0.15 }] }, warrant: null, mip: null, rollover_equity: 0 })).toThrow(/§22.3/);
    // (iv) non-ascending hurdles / decreasing share / share = 1
    expect(v({ sweet_equity: { ...sweet, ratchet: [{ hurdle_moic: 2, share_pct: 0.15 }, { hurdle_moic: 2, share_pct: 0.2 }] }, warrant: null, mip: null, rollover_equity: 0 })).toThrow(/§22.3/);
    expect(v({ sweet_equity: { ...sweet, ratchet: [{ hurdle_moic: 1.5, share_pct: 0.2 }, { hurdle_moic: 2, share_pct: 0.15 }] }, warrant: null, mip: null, rollover_equity: 0 })).toThrow(/§22.3/);
    expect(v({ sweet_equity: { ...sweet, ratchet: [{ hurdle_moic: 1.5, share_pct: 1.0 }] }, warrant: null, mip: null, rollover_equity: 0 })).toThrow(/§22.3/);
    // the §22.4 side: a first tier NOT strictly above the base hurdle
    expect(v({ sweet_equity: null, warrant: null, mip: { pool_pct: 0.15, hurdle_moic: 1.5, ratchet: [{ hurdle_moic: 1.5, share_pct: 0.2 }] }, rollover_equity: 0 })).toThrow(/§22.3/);
    // (v) out-of-domain warrant
    expect(v({ sweet_equity: null, warrant: { holder_label: 'w', pct_of_ordinary: 1.5, strike_total: 2 }, mip: null, rollover_equity: 0 })).toThrow(/§22.3/);
    expect(v({ sweet_equity: null, warrant: { holder_label: 'w', pct_of_ordinary: 0.05, strike_total: -1 }, mip: null, rollover_equity: 0 })).toThrow(/§22.3/);
    // (vi) a subscription driving the plug ≤ 0 — thrown at Build inside sourcesUses
    expect(() =>
      runModel(GOLDEN_DEALS.G9SWEET.facts, {
        ...GOLDEN_DEALS.G9SWEET.assumptions,
        sweet_equity: { ...GOLDEN_DEALS.G9SWEET.assumptions.sweet_equity!, management_subscription: 1e6 },
      }),
    ).toThrow(/§22.3\(vi\)/);
    // (vii) a paid-for zero ordinary share
    expect(v({ sweet_equity: { ...sweet, management_ordinary_pct: 0, management_subscription: 2 }, warrant: null, mip: null, rollover_equity: 0 })).toThrow(/§22.3/);
    // legality guard: the all-institutional strip (zero share, ZERO subscription) stays legal
    expect(v({ sweet_equity: { ...sweet, management_ordinary_pct: 0, management_subscription: 0 }, warrant: null, mip: null, rollover_equity: 0 })).not.toThrow();
  });

  it('(ix) §12 walkdown carries sweet_equity_delta and warrant_payout_net; the UN-amended identity would read ≈$28.73m', () => {
    const run = runModel(GOLDEN_DEALS.G9SWEET.facts, GOLDEN_DEALS.G9SWEET.assumptions);
    const wd = run.bridge.walkdown;
    expect(wd.sweet_equity_delta).toBeCloseTo(run.exit.management_ordinary_share - 2.0, 9);
    expect(wd.warrant_payout_net).toBeCloseTo(run.exit.warrant_payout_net, 12);
    expect(run.bridge.reconciliation_residual).toBeLessThan(1e-6);
    // the discriminator: the three-term (un-amended) §14.9(b) residual is EXACTLY the two new
    // terms — ≈$28.73m on this shape — so the fixture fails against the old identity.
    expect(Math.abs(wd.sweet_equity_delta + wd.warrant_payout_net)).toBeGreaterThan(28);
    expect(Math.abs(wd.sweet_equity_delta + wd.warrant_payout_net)).toBeLessThan(29.5);
  });

  it('(x) §11 NON-contamination: with vs without the strip — credit/tranches/waterfall/tax/goodwill byte-identical', () => {
    const withStrip = runModel(GOLDEN_DEALS.G9SWEET.facts, GOLDEN_DEALS.G9SWEET.assumptions);
    const without = runModel(GOLDEN_DEALS.G9SWEET.facts, {
      ...GOLDEN_DEALS.G9SWEET.assumptions,
      sweet_equity: null,
      warrant: null,
    });
    expect(withStrip.credit).toEqual(without.credit);
    expect(withStrip.tranches).toEqual(without.tranches);
    expect(withStrip.waterfall).toEqual(without.waterfall);
    expect(withStrip.tax).toEqual(without.tax);
    // §22.8's own regression test: the §8 goodwill plug is IDENTICAL (equity line carries the
    // subscription; the mutant omitting it from openingBalance.ts must RED here).
    expect(withStrip.balance_sheet.map((r) => r.goodwill)).toEqual(without.balance_sheet.map((r) => r.goodwill));
    expect(withStrip.balance_sheet[0].equity).toBeCloseTo(without.balance_sheet[0].equity, 9);
  });

  it('(xi) §19.6(a) under a strip: the fund LP leg and the §12 interim term read the §22.7 institutional share', () => {
    // G9-SWEET + a distribution schedule + the fund overlay — with an ALL-ORDINARY strip
    // (sponsor_ordinary_pct 1.0 ⇒ LN₀ = 0), so distributions reach the ordinary class and
    // management's s₀ slice is REAL (with G9's own notes, every payment would redeem notes
    // and the two share rules would coincide, discriminating nothing).
    const a: DealAssumptions = {
      ...GOLDEN_DEALS.G9SWEET.assumptions,
      sweet_equity: { ...GOLDEN_DEALS.G9SWEET.assumptions.sweet_equity!, sponsor_ordinary_pct: 1.0 },
      structure: { ...GOLDEN_DEALS.G9SWEET.assumptions.structure, distributions: [20, 15, 0, 0, 0] },
      fund: {
        committed_capital: null, fee_basis: 'invested', mgmt_fee_pct: 0.02, pref_rate: 0.08,
        carry_pct: 0.2, catchup_pct: 1.0, waterfall: 'european', fee_offset_pct: 1.0,
      },
    };
    const run = runModel(GOLDEN_DEALS.G9SWEET.facts, a);
    const split = stripInterimSplit(
      a.sweet_equity!,
      run.sources_uses.sponsor_equity,
      run.waterfall.map((w) => w.distribution_paid),
    );
    const instTotal = split.institution_share.reduce((s, v) => s + v, 0);
    const paidTotal = run.waterfall.reduce((s, w) => s + w.distribution_paid, 0);
    // management's slice is real, so the institutional total is strictly below the paid total
    expect(instTotal).toBeLessThan(paidTotal - 1e-9);
    // facade's §12 term reads the INSTITUTIONAL share (mutant: pari-passu 1.0 must RED)
    expect(run.bridge.walkdown.interim_distributions_sponsor).toBeCloseTo(instTotal, 9);
    // §19.6(a): LP + GP ≡ the sponsor's inflows (institutional interims + exit share)
    const lp = run.fund!.lp_distributions.reduce((s, v) => s + v, 0);
    const gp = run.fund!.gp_carry.reduce((s, v) => s + v, 0);
    expect(lp + gp).toBeCloseTo(instTotal + run.exit.sponsor_share, 6);
    expect(run.returns.dpi[0]).toBeCloseTo(split.institution_share[0] / run.sources_uses.sponsor_equity, 9);
  });

  it('(xiii) [audit B1] the §22.3(vi) sensitivity-grid pre-test: a plug-killing entry axis renders a NULL cell, never destroys the grid', () => {
    const base = runModel(GOLDEN_DEALS.G9SWEET.facts, GOLDEN_DEALS.G9SWEET.assumptions);
    // entry_multiple 0.5 re-derives uses far below debt + subscription ⇒ plug ≤ 0 for that
    // cell; runModel would THROW (§22.3(vi)) and the loop has no try/catch. The pre-test
    // must test the gate's condition FIRST and emit null — the grid and its healthy cells
    // survive. (Mutant: drop the pre-test ⇒ this test sees the RangeError.)
    const grid = buildSensitivityGrid(GOLDEN_DEALS.G9SWEET.facts, GOLDEN_DEALS.G9SWEET.assumptions, base, {
      row_axis: 'entry_multiple', col_axis: 'exit_multiple',
      row_values: [0.5, 8.5], col_values: [8.5],
      base_row_index: 1, base_col_index: 0,
    });
    expect(grid.irr[0][0]).toBeNull(); // the rejected cell — N/A, never a sentinel
    expect(grid.moic[0][0]).toBeNull();
    expect(grid.irr[1][0]).not.toBeNull(); // the base cell survives
    expect(grid.moic[1][0]).toBeCloseTo(base.returns.sponsor_net.moic!, 9);
  });

  it('(xiv) [audit B2] loan_notes_unredeemed EMISSION: fires on an underwater strip, pinned to the $0.005m band', () => {
    // ENGINE-LEVEL firing arm: G9-SWEET with loan_note_rate 0.5 accretes past exit equity.
    const under = runModel(GOLDEN_DEALS.G9SWEET.facts, {
      ...GOLDEN_DEALS.G9SWEET.assumptions,
      sweet_equity: { ...GOLDEN_DEALS.G9SWEET.assumptions.sweet_equity!, loan_note_rate: 0.5 },
    });
    expect(under.equity_strip!.loan_notes_accrued_balance).toBeGreaterThan(
      under.equity_strip!.loan_notes_redeemed + 0.005,
    );
    expect(under.coherence.map((f) => f.code).sort()).toEqual(['ahydo_shape', 'loan_notes_unredeemed']);
    const flag = under.coherence.find((f) => f.code === 'loan_notes_unredeemed')!;
    expect(flag.severity).toBe('warn');
    // THRESHOLD pin, both sides of §14.23(g)'s band, on the same real run's inputs with only
    // equity_strip overridden (a widen-the-band or drop-the-emission mutant REDs here).
    const coherenceInputs = (shortfall: number) => ({
      facts: GOLDEN_DEALS.G9SWEET.facts,
      assumptions: GOLDEN_DEALS.G9SWEET.assumptions,
      sources_uses: under.sources_uses,
      derived: { entry_multiple: under.derived.entry_multiple },
      waterfall: under.waterfall,
      balance_sheet: under.balance_sheet,
      credit: under.credit,
      covenants: GOLDEN_DEALS.G9SWEET.assumptions.covenants,
      ppe_seeded_at_zero: false,
      tranches: under.tranches,
      equity_strip: {
        ...under.equity_strip!,
        loan_notes_accrued_balance: 100,
        loan_notes_redeemed: 100 - shortfall,
      },
    });
    expect(runCoherence(coherenceInputs(0.006)).map((f) => f.code)).toContain('loan_notes_unredeemed');
    expect(runCoherence(coherenceInputs(0.004)).map((f) => f.code)).not.toContain('loan_notes_unredeemed');
  });

  it('(xii) the §22.5 TOP-TIER REMAINDER branch: the pot survives every tier (rem > 0 at the trailing line)', () => {
    // I = 50, V₀ = 100, s₀ = 0.10, one tier {2.2 ⇒ T = 110, s₁ = 0.20}, P = 25.
    // need = (110−100)/0.9 = 11.1̄ < 25 ⇒ the trailing line takes rem = 13.8̄ at s₁.
    const { equity_strip } = buildExitWaterfall(
      syntheticAssumptions({
        sweet_equity: {
          sponsor_ordinary_pct: 1.0, loan_note_rate: 0, management_subscription: 0,
          management_ordinary_pct: 0.10, ratchet: [{ hurdle_moic: 2.2, share_pct: 0.20 }],
        },
      }),
      syntheticInputs({ exit_year_ebitda_adj: 25, invested_equity_total: 50, institutional_interim_value: 100 }),
    );
    const need = (110 - 100) / 0.9;
    const M = 0.1 * need + 0.2 * (25 - need);
    expect(equity_strip!.management_ordinary_share).toBeCloseTo(M, 12); // 3.8̄ — the delete-the-line mutant reads 1.1̄
    expect(equity_strip!.ratchet_tiers_reached).toBe(1); // V_final = 110 + 0.8×13.8̄ = 121.1̄ ⇒ moic 2.42̄ > 2.2
  });
});
