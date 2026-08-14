/**
 * engine2/fund.ts — the §19 fund/LP overlay [v1.4.0]: net-to-LP returns on a fund-of-one.
 * A POST-ENGINE layer (§19.7): reads ONLY sponsor-side outputs — the sponsor share of
 * §3-step-7 distributions (the ONE §9 pari-passu rule), `exit.sponsor_share`
 * (post-§10-promote), `sources_uses.{sponsor_equity, rollover_equity}`, and
 * `gp_fee_income` for the ILPA fee offset — and touches NO waterfall/tax/BS arithmetic.
 * Held to the adjudicated G7-FUND gospel (tests/goldens/G7FUND — two passes SIGNED, then the
 * full-precision reseed re-signed by two further blind passes) at the §15 bar, plus the
 * §19.10 directed fixtures for every golden-uncovered branch.
 *
 * Year-end event ORDER [§19.4, sign-off round-2 B8]: (1) ACCRUE pref on the PRE-DRAW
 * state; (2) DRAW fee_t (enters paid-in, and — 'european' only — the return-of-capital +
 * pref base; a fee first accrues pref the NEXT year-end); (3) APPLY the distribution.
 * The rejected draw-AFTER order silently gave fee_N the 'american' treatment and broke
 * the §19.6(d) 'european' bound by carry_pct × fee_N.
 */

import { irr } from './kernel/irr';
import type { FundOverlayAssumption, FundBlock, SourcesUses } from './types';

export interface FundOverlayInputs {
  /** §3 step 7 TOTAL equity distributions per year (the sponsor share is taken HERE via
   *  the one §9 rule — round-1 B1: rollover holders are not LPs of the fund-of-one). */
  distributions_paid: number[];
  /** §9/§22.7 [v1.7.0]: the sponsor's interim shares, selected by facade.ts's single
   *  predicate (§9 pari-passu when `sweet_equity` is null, else the §22.7 institutional
   *  split) — the LP fund is never credited with management's slice (§19.1 alt (c)). */
  sponsor_interim_shares: number[];
  /** §9 sponsor exit proceeds — post-§10-promote, post-rollover (exit.sponsor_share). */
  exit_sponsor_share: number;
  sources_uses: Pick<SourcesUses, 'sponsor_equity' | 'rollover_equity'>;
  /** §5 monitoring-fee income (null ⇒ offset 0 — §19.2). */
  gp_fee_income: { annual: number[]; termination: number } | null;
}

/** §16 input-gate rejections for the fund overlay — STRUCTURAL gates (domains +
 *  circularity). The committed-below-contributions rejection fires inside the walk where
 *  paid-in is already computed — one fee loop, no second path. */
export function validateFund(fund: FundOverlayAssumption): void {
  const bad = (msg: string): never => { throw new RangeError(`fund: ${msg} (SPEC §19.2/§16)`); };
  if (fund.committed_capital === null && fund.fee_basis === 'committed') {
    bad("committed_capital = null with fee_basis 'committed' is circular — the fee would depend on committed which depends on fees drawn");
  }
  // audit 2026-08-08 M3: NaN slipped BOTH committed gates (NaN < paidIn − 5e-3 is false) and
  // emitted an all-NaN block; out-of-union strings took the committed branch. Fail closed,
  // like the sibling !(x >= 0) gates.
  if (fund.committed_capital !== null && !Number.isFinite(fund.committed_capital)) {
    bad('committed_capital must be a finite number or null');
  }
  if (fund.fee_basis !== 'committed' && fund.fee_basis !== 'invested') bad("fee_basis must be 'committed' or 'invested'");
  if (fund.waterfall !== 'european' && fund.waterfall !== 'american') bad("waterfall must be 'european' or 'american'");
  if (!(fund.mgmt_fee_pct >= 0)) bad('mgmt_fee_pct must be ≥ 0');
  if (!(fund.carry_pct >= 0 && fund.carry_pct < 1)) bad('carry_pct must be in [0, 1)');
  if (!(fund.pref_rate >= 0)) bad('pref_rate must be ≥ 0');
  if (!(fund.catchup_pct === 0 || (fund.catchup_pct >= fund.carry_pct && fund.catchup_pct <= 1))) {
    bad('catchup_pct must be 0 (hard hurdle) or in [carry_pct, 1] — a share below carry_pct strands the waterfall below the hard-hurdle case');
  }
  if (!(fund.fee_offset_pct >= 0 && fund.fee_offset_pct <= 1)) bad('fee_offset_pct must be in [0, 1]');
}

/**
 * §19.3–§19.5: the fund-of-one walk. Mirrors the adjudicated reference derivation
 * (scripts/goldens/spec_calc.py fund_overlay) statement-for-statement.
 */
export function buildFundOverlay(fund: FundOverlayAssumption, x: FundOverlayInputs): FundBlock {
  const N = x.distributions_paid.length;
  const se = x.sources_uses.sponsor_equity;
  // §19.7/§9/§22.7 [v1.7.0]: the sponsor share comes through the ONE selected share rule —
  // never a local re-derivation (audit 2026-08-08 M2), and under a strip the §22.7
  // institutional split governs, selected upstream by facade.ts's single predicate.
  const inflow = [...x.sponsor_interim_shares];
  inflow[N - 1] += x.exit_sponsor_share;

  const basis = fund.fee_basis === 'invested' ? se : (fund.committed_capital as number);
  const c = fund.carry_pct;
  const q = fund.catchup_pct;

  const contributions: number[] = [se, ...Array.from({ length: N }, () => 0)];
  const lpDist = Array.from({ length: N }, () => 0);
  const gpCarry = Array.from({ length: N }, () => 0);
  const fees = Array.from({ length: N }, () => 0);
  const dpi = Array.from({ length: N }, () => 0);

  let unreturned = se;
  let pref = 0;
  let prefPaid = 0;
  let step3Paid = 0;
  let step4Lp = 0;
  let gpCum = 0;
  let cumD = 0;
  let cumC = se;
  let payback: number | null = null;

  for (let t = 1; t <= N; t++) {
    pref += fund.pref_rate * (unreturned + pref); // (1) accrue on the PRE-DRAW state

    let offset = 0; // (2) draw the fee, floored at zero (§19.3)
    if (x.gp_fee_income !== null) {
      offset = fund.fee_offset_pct * (x.gp_fee_income.annual[t - 1] + (t === N ? x.gp_fee_income.termination : 0));
    }
    const fee = Math.max(0, fund.mgmt_fee_pct * basis - offset);
    fees[t - 1] = fee;
    contributions[t] = fee;
    cumC += fee;
    if (fund.waterfall === 'european') unreturned += fee; // fees in the base — 'european' ONLY (§19.4/B3)

    let D = inflow[t - 1]; // (3) distribute
    let pay = Math.min(D, unreturned); // step 1 — return of capital
    unreturned -= pay; D -= pay; lpDist[t - 1] += pay;
    pay = Math.min(D, pref); // step 2 — preferred return
    pref -= pay; D -= pay; lpDist[t - 1] += pay; prefPaid += pay;
    if (D > 0 && q > 0) { // step 3 — GP catch-up to the §19.4 stop condition
      const rhs = prefPaid + step3Paid + step4Lp;
      const xNeeded = q - c <= 0 ? Infinity : Math.max(0, (c * rhs - gpCum) / (q - c));
      const xAmt = Math.min(D, xNeeded);
      gpCarry[t - 1] += q * xAmt; gpCum += q * xAmt;
      lpDist[t - 1] += (1 - q) * xAmt;
      step3Paid += xAmt; D -= xAmt;
    }
    if (D > 0) { // step 4 — TERMINAL carry split
      gpCarry[t - 1] += c * D; gpCum += c * D;
      lpDist[t - 1] += (1 - c) * D; step4Lp += (1 - c) * D;
      D = 0;
    }
    cumD += lpDist[t - 1];
    dpi[t - 1] = cumC > 0 ? cumD / cumC : 0; // ILPA to-date ratio (§19.5/B6)
    // interim-only (L-10); ALL of year N is excluded at this layer — the §14.16 merged
    // period-N flow makes year-N interim inseparable from exit here, unlike the sponsor row
    // (audit N2; mirrored by the reference).
    if (payback === null && t < N && cumD >= cumC - 1e-12) payback = t;
  }

  let paidIn = 0;
  for (const cn of contributions) paidIn += cn;
  if (fund.committed_capital !== null && fund.committed_capital < paidIn - 5e-3) {
    throw new RangeError(`fund: committed_capital ${fund.committed_capital} is below the required contributions ${paidIn} (SPEC §19.2/§16)`);
  }
  let lpTotal = 0;
  for (const d of lpDist) lpTotal += d;
  const flows = [-contributions[0], ...lpDist.map((d, i) => d - contributions[i + 1])];

  return {
    lp_contributions: contributions,
    lp_distributions: lpDist,
    gp_carry: gpCarry,
    mgmt_fees_net: fees,
    paid_in_total: paidIn,
    committed_capital: fund.committed_capital ?? paidIn, // derived-for-REPORTING only (§19.2)
    fund_lp_net: {
      irr: irr(flows),
      moic: paidIn > 0 ? lpTotal / paidIn : 0,
      dpi,
      payback_year: payback, // null when never reached (the pass-2 sentinel pin)
    },
  };
}
