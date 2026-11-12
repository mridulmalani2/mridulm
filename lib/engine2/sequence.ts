/**
 * engine2/sequence.ts — the SPEC §5 evaluation order, year by year, NO solver
 * (Phase C build order #5).
 *
 * For each year t: rates → interest & fees (from OPENING balances, §4) → tax (§6,
 * interest now known) → FCF pre-debt (§7) → waterfall (§3) → closing balances/cash (§8)
 * → next year. There is no intra-year circular dependency under §4's beginning-balance
 * convention; this module contains no fixed-point iteration and no convergence flags.
 *
 * Also runs the §9 UNLEVERED stream alongside (same §6 kernel, zeroed finance lines) —
 * the two runs share the operating build so they cannot drift.
 *
 * Write-off events (§7/§9, SPEC v1.0.3):
 *  - Exit year: remaining unamortized OID + financing fees (after year-N scheduled
 *    amortization) are written off — known BEFORE the waterfall, so §5 stays sequential;
 *    the amount enters the year-N §6 UNCAPPED pool.
 *  - Full early retirement in year t < N: BOOK write-off in year t (BS/NI), tax deduction
 *    DEFERRED to the year t+1 uncapped pool (strict sequentiality — retirement is only
 *    known post-waterfall, after tax has run).
 *
 * No imports from lib/engine (boundary test).
 */

import { buildOpeningBalance } from './openingBalance';
import {
  buildOperating,
  fcfPreDebt,
  type AmortizingCostInput,
  type OperatingBuild,
} from './operating';
import {
  financeLines,
  openingDebtState,
  resolveSweepPct,
  runDebtYear,
  validatePikElections,
  validateRefinancing,
  validateStructureForHold,
  type DebtState,
} from './debt';
import { validateSweetEquity } from './exit';
import { validateForecastLines } from './valuation';
import { openingTaxState, runTaxYear, runUnleveredTaxYear } from './tax';
import { buildSourcesUses, deriveEntry, sizeStructure, stripPlugRejection, type SizedStructure } from './sourcesUses';
import type {
  BalanceSheetYear,
  DealAssumptions,
  DealFacts,
  ModelOutput,
  OperatingYear,
  RevolverYear,
  SourcesUses,
  TaxYear,
  TrancheYear,
  WaterfallYear,
} from './types';

/**
 * Everything the §5 year loop produces — the core every downstream block (§9 exit, §11
 * credit, §12 bridge, §13 scenarios) consumes. Field names match ModelOutput where the
 * block is final; the internal carries are for the C6–C9 modules.
 */
export interface EngineCore {
  derived: ModelOutput['derived'];
  sources_uses: SourcesUses;
  operating: OperatingYear[];
  tax: TaxYear[];
  tranches: TrancheYear[][]; // [tranche][year]
  revolver: RevolverYear[] | null;
  waterfall: WaterfallYear[];
  balance_sheet: BalanceSheetYear[]; // t0-anchored, length N+1
  /** §9 write-off actually recognized in year N (exit) — feeds ExitBlock. */
  exit_writeoff: number;
  /** §3 step 7 — TOTAL equity distributions actually PAID per year (feeds §9/§10/§12). */
  distributions_paid: number[];
  /** Interim unlevered FCF per year (§9 stream; exit flows added in returns.ts). */
  unlevered_fcf: number[];
  /** Closing debt state after year N — §9 payoff = Σ balances + drawn (par + accrued PIK). */
  final_debt_state: DebtState;
  sized: SizedStructure;
  build: OperatingBuild;
  ppe_seeded_at_zero: boolean;
}

export function runCore(facts: DealFacts, assumptions: DealAssumptions): EngineCore {
  const N = assumptions.entry.hold_years;
  // §24.4 [v2.0.0] order: debt sizing (LTM or amounts — never NTM) → operating build →
  // entry derivation (the NTM basis reads forecast year-1 EBITDA). No operating line
  // depends on EV, so there is no circularity.
  const sized = sizeStructure(assumptions.structure, facts.fy_ebitda);
  validateStructureForHold(sized, N);
  validateRefinancing(sized, assumptions.structure.refinancing, N); // §16/§18 input-gate rejections
  validatePikElections(sized, N); // §16/§20.2 input-gate rejections [v1.5.0]
  validateSweetEquity(assumptions); // §16/§22.3 input-gate rejections [v1.7.0]
  validateForecastLines(assumptions); // §24.3 R7 [v2.0.0]
  const surplusPolicy = validateSurplusDistribution(assumptions.structure); // §3.8 [v2.1.0]
  validateSelldown(assumptions); // §23.3 [v2.2.0]

  // §7 operating build (fee/OID amortization bases: par for terms, commitment for the revolver)
  const costInputs: AmortizingCostInput[] = [
    ...sized.terms.map((t) => ({
      name: t.assumption.name,
      commitment: t.par,
      maturity_years: t.assumption.maturity_years,
      oid_amount: t.oid_amount,
    })),
    ...(sized.revolver
      ? [
          {
            name: sized.revolver.assumption.name,
            commitment: sized.revolver.commitment,
            maturity_years: sized.revolver.assumption.maturity_years,
            oid_amount: 0,
          },
        ]
      : []),
  ];
  const build = buildOperating(facts, assumptions, costInputs);

  const entry = deriveEntry(facts, assumptions, build.years[0].ebitda);
  const su = buildSourcesUses(entry, sized, assumptions);
  // §22.3(vi) [v1.7.0]: the Build enforcement point (the grid pre-tests the same condition).
  const stripRejection = stripPlugRejection(su, assumptions);
  if (stripRejection !== null) throw new RangeError(stripRejection);

  const opening = buildOpeningBalance(su, build.nwc0, facts, sized.revolver?.assumption.drawn_at_close ?? 0);

  // mutable per-tranche unamortized balances (early retirement zeroes them — v1.0.3)
  const oidRemaining = build.cost_schedules.map((s) => s.oid_amount);
  const feeRemaining = build.cost_schedules.map((s) => s.fee_allocated);
  const scheduleIndex = new Map(build.cost_schedules.map((s, i) => [s.name, i]));

  // §18 refinancing state. A refi re-terms a tranche mid-hold (new pricing/maturity/amort/OID/
  // fee on the par-for-par base B). We NEVER mutate the caller's assumptions (scenarios re-run
  // runModel and must see the original terms) — instead a local CLONE of the sized structure and
  // the OID/fee schedule numerators carry the new incarnation for years ≥ R. The amort/interest
  // loops read these effective copies, so pre-v1.3.0 deals (empty refinancing) are byte-identical.
  const effectiveSized = { ...sized, terms: sized.terms.map((t) => ({ ...t })) };
  const effOidAmount = build.cost_schedules.map((s) => s.oid_amount);
  const effFeeAllocated = build.cost_schedules.map((s) => s.fee_allocated);
  const effMaturity = costInputs.map((c) => c.maturity_years);
  const termIndex = new Map(effectiveSized.terms.map((t, i) => [t.assumption.name, i]));

  let debtState = openingDebtState(sized);
  let taxState = openingTaxState(assumptions.tax);
  let unleveredTaxState = openingTaxState(assumptions.tax);
  let cash = su.cash_to_balance_sheet;
  let ppe = opening.row.ppe;
  let dfc = opening.row.deferred_financing_costs;
  let equity = opening.row.equity;
  const goodwill = opening.row.goodwill;
  // §7.1 [v2.4.0]: a SWEEP-driven early retirement deducts NEXT year (the retirement is the
  // year's own cash outcome — same-year would be circular), split by tax character
  let pendingRetirementInterest = 0; // unamortized OID → repurchase premium → capped
  let pendingRetirementNoninterest = 0; // unamortized debt-issuance costs → uncapped

  const operating: OperatingYear[] = [];
  const tax: TaxYear[] = [];
  const trancheRows: TrancheYear[][] = sized.terms.map(() => []);
  const revolverRows: RevolverYear[] | null = sized.revolver ? [] : null;
  const waterfall: WaterfallYear[] = [];
  const balanceSheet: BalanceSheetYear[] = [opening.row];
  const unleveredFcf: number[] = [];
  let exitWriteoff = 0;

  for (let t = 0; t < N; t++) {
    const exitYear = t === N - 1;
    const y = build.years[t];

    // ── §18 refinancing — applied at the START of year R = t+1, before interest accrues ──
    // Par-for-par retirement + origination: new face B = the tranche's beginning balance. The
    // rate switch takes effect for the whole of year R (§18.3); the old unamortized OID/DFC
    // write off (book, year R). §18.5 [v2.4.0]: the refinancing is SCHEDULED (known before year
    // R's tax), so its TAX deductions land in year R too — the old OID + the call premium as
    // repurchase premium (capped interest), the old debt-issuance costs uncapped. EXPLICIT
    // handling, never the early-retirement balance-crossing path (the tranche continues at B).
    let refiCashCostTotal = 0;
    let refiBookCharge = 0; // Σ (WO + call premium) — book loss on extinguishment (§18.6)
    let refiDfcDelta = 0; // Σ (new OID + new fees) − WO (BS deferred-cost adjustment)
    let refiDeductionInterest = 0; // old unamortized OID + call premium — capped, year R (§18.5)
    let refiDeductionNoninterest = 0; // old unamortized debt-issuance costs — uncapped, year R
    const refiThisYear = new Map<number, { cost: number; writeoff: number }>();
    for (const ev of assumptions.structure.refinancing ?? []) {
      if (ev.year !== t + 1) continue;
      const ti = termIndex.get(ev.tranche_name)!; // validated: exists + cash-pay term
      const ci = scheduleIndex.get(ev.tranche_name)!;
      const B = debtState.term_balances[ti]; // par-for-par: new face = beginning balance
      const WO = oidRemaining[ci] + feeRemaining[ci]; // §18.5 old unamortized OID + DFC
      refiDeductionInterest += oidRemaining[ci]; // read BEFORE the new incarnation overwrites them
      refiDeductionNoninterest += feeRemaining[ci];
      const premium = ev.call_premium_pct * B;
      const newOid = ev.new_oid_pct * B;
      const newFees = ev.new_financing_fee_pct * B; // §18.4 basis = new_fee_pct × B (NOT re-allocated)
      const asmt = effectiveSized.terms[ti].assumption;
      if (asmt.type === 'pik_note') throw new RangeError('unreachable: refi validated cash-pay only');
      // local clone only — the caller's assumptions object is never touched (scenario re-runs)
      effectiveSized.terms[ti].assumption = {
        ...asmt,
        pricing: ev.new_pricing,
        amort_pct_of_face: ev.new_amort_pct_of_face,
        maturity_years: ev.new_maturity_years,
      };
      effectiveSized.terms[ti].par = B; // amort face for the new incarnation (§14.15/§18.3)
      effMaturity[ci] = ev.new_maturity_years;
      effOidAmount[ci] = newOid; // stop OLD OID schedule, start NEW (§18.3)
      effFeeAllocated[ci] = newFees;
      oidRemaining[ci] = newOid;
      feeRemaining[ci] = newFees;
      refiCashCostTotal += premium + newOid + newFees;
      refiBookCharge += WO + premium;
      refiDfcDelta += newOid + newFees - WO;
      refiDeductionInterest += premium;
      refiThisYear.set(ti, { cost: premium + newOid + newFees, writeoff: WO });
    }

    // ── rates → interest & fees from opening balances (§4/§5; effectiveSized carries any refi) ──
    const lines = financeLines(effectiveSized, debtState, t); // §20: `t` selects the year's election
    // scheduled amortization this year, on the LIVE remaining balances (§7)
    // §18.3: after a refi the OID/fee numerators and the straight-line horizon are the NEW
    // incarnation's (effOidAmount/effFeeAllocated/effMaturity); pre-refi they equal the close-time
    // schedule, so non-refi deals are byte-identical.
    const oidAmort = effOidAmount.map((amt, i) =>
      amt > 0 ? Math.min(oidRemaining[i], amt / effMaturity[i]) : 0,
    );
    const feeAmort = effFeeAllocated.map((amt, i) =>
      amt > 0 ? Math.min(feeRemaining[i], amt / effMaturity[i]) : 0,
    );
    for (let i = 0; i < oidAmort.length; i++) {
      oidRemaining[i] -= oidAmort[i];
      feeRemaining[i] -= feeAmort[i];
    }
    const oidAmortTotal = oidAmort.reduce((a, b) => a + b, 0);
    const feeAmortTotal = feeAmort.reduce((a, b) => a + b, 0);
    // §9: the exit-year write-off (post year-N amortization) is deterministic pre-waterfall;
    // the exit repays every tranche at par, so the same character split applies (§7.1)
    const retirementInterest =
      (exitYear ? oidRemaining.reduce((a, b) => a + b, 0) : 0) + refiDeductionInterest + pendingRetirementInterest;
    const retirementNoninterest =
      (exitYear ? feeRemaining.reduce((a, b) => a + b, 0) : 0) + refiDeductionNoninterest + pendingRetirementNoninterest;
    pendingRetirementInterest = 0;
    pendingRetirementNoninterest = 0;

    // ── tax (§6) ──
    const taxResult = runTaxYear(assumptions.tax, taxState, {
      ebitda_adj: y.ebitda_adj,
      da: y.da,
      cash_interest_total: lines.cash_interest_total,
      pik_accrual_total: lines.pik_accrual_total,
      oid_amortization: oidAmortTotal,
      financing_fee_amortization: feeAmortTotal,
      commitment_fees: lines.commitment_fee,
      retirement_interest: retirementInterest,
      retirement_noninterest: retirementNoninterest,
    });
    taxState = taxResult.state_end;
    tax.push(taxResult.row);

    // ── FCF pre-debt (§7) ──
    const fcf = fcfPreDebt(y, taxResult.row.cash_tax);

    // ── waterfall (§3) ──
    const openingGross =
      debtState.term_balances.reduce((a, b) => a + b, 0) + debtState.revolver_drawn;
    const sweepPct = resolveSweepPct(assumptions.structure.sweep, openingGross, cash, y.ebitda_adj);
    const debtOut = runDebtYear(effectiveSized, debtState, lines, {
      opening_cash: cash,
      fcf_pre_debt: fcf,
      min_cash: assumptions.structure.min_cash,
      sweep_pct: sweepPct,
      // §3 step 7 / §3.7 — null schedule ≡ zeros ≡ feature off (byte-identical to pre-v1.1.0)
      distribution_request: assumptions.structure.distributions?.[t] ?? 0,
      rp_trap_level: assumptions.covenants.rp_trap?.level ?? null,
      // §3.8 [v2.1.0] the surplus-cash policy (null ≡ OFF ≡ byte-identical)
      surplus: surplusPolicy,
      ebitda_adj: y.ebitda_adj,
      // §3 step 2R / §18.4 — mandatory refi financing use (0 when no refi lands this year)
      refinancing_cash_cost: refiCashCostTotal,
    });
    // §18: stamp the refi columns on the refinanced tranche's row (debt.ts defaulted them off).
    debtOut.tranche_rows.forEach((row, i) => {
      const refi = refiThisYear.get(i);
      trancheRows[i].push(
        refi
          ? { ...row, refinanced: true, refinancing_cash_cost: refi.cost, unamortized_writeoff: refi.writeoff }
          : row,
      );
    });
    if (revolverRows && debtOut.revolver_row) revolverRows.push(debtOut.revolver_row);
    waterfall.push(debtOut.waterfall_row);

    // ── write-off events (§7/§9, v1.0.3) ──
    let bookWriteoff = 0;
    if (exitYear) {
      // the ExitBlock display amount = balances actually written off AT exit; any deferred
      // early-retirement deduction is already inside this year's §6 run
      bookWriteoff = oidRemaining.reduce((a, b) => a + b, 0) + feeRemaining.reduce((a, b) => a + b, 0);
      exitWriteoff = bookWriteoff;
      oidRemaining.fill(0);
      feeRemaining.fill(0);
    } else {
      for (const name of debtOut.fully_retired) {
        const i = scheduleIndex.get(name);
        if (i === undefined) continue;
        bookWriteoff += oidRemaining[i] + feeRemaining[i];
        pendingRetirementInterest += oidRemaining[i]; // tax deduction lands in year t+1 (§7.1)
        pendingRetirementNoninterest += feeRemaining[i];
        oidRemaining[i] = 0;
        feeRemaining[i] = 0;
      }
    }

    // ── operating row (fcf now known — §14.16 single source) ──
    operating.push({
      revenue: y.revenue,
      ebitda: y.ebitda,
      ebitda_adj: y.ebitda_adj,
      margin: y.margin,
      da: y.da,
      ebit: y.ebit,
      maint_capex: y.maint_capex,
      growth_capex: y.growth_capex,
      nwc_balance: y.nwc_balance,
      delta_nwc: y.delta_nwc,
      oid_amortization: oidAmortTotal,
      financing_fee_amortization: feeAmortTotal,
      fcf_pre_debt: fcf,
    });

    // ── §8 BS roll ──
    ppe = ppe + (y.maint_capex + y.growth_capex) - y.da;
    // §18.6: capitalize the new OID/fees and write off the old (refiDfcDelta), then the normal roll.
    dfc = dfc - oidAmortTotal - feeAmortTotal - bookWriteoff + refiDfcDelta;
    // §18.6: the refi book charge (old write-off + call premium) is an extinguishment loss in
    // year R — expensed via NI so the equity leg = −(WO + premium); the new OID/fees are
    // capitalized (they sit in DFC), NOT expensed. 0 in a non-refi year.
    const netIncome =
      y.ebit -
      (lines.cash_interest_total +
        lines.pik_accrual_total +
        oidAmortTotal +
        feeAmortTotal +
        lines.commitment_fee +
        bookWriteoff +
        refiBookCharge) -
      taxResult.row.cash_tax;
    // §8 [v1.1.1]: a paid distribution leaves as cash AND as book equity in the same year.
    // It is a return of capital, never an expense — it never touches NI, EBIT or tax; the
    // BS-close invariant (§14.2) is what forces this second leg.
    equity += netIncome - debtOut.waterfall_row.distribution_paid;
    const debtAtPar =
      debtOut.state_end.term_balances.reduce((a, b) => a + b, 0) + debtOut.state_end.revolver_drawn;
    cash = debtOut.waterfall_row.closing_cash;
    const assets = cash + y.nwc_balance + ppe + dfc + goodwill;
    balanceSheet.push({
      cash,
      operating_nwc: y.nwc_balance,
      ppe,
      deferred_financing_costs: dfc,
      goodwill,
      total_assets: assets,
      debt_at_par: debtAtPar,
      equity,
      check: assets - debtAtPar - equity,
    });
    debtState = debtOut.state_end;

    // ── §9 unlevered stream (tax base EBITDA, zero finance lines — tax.ts variant) ──
    const u = runUnleveredTaxYear(assumptions.tax, unleveredTaxState, { ebitda: y.ebitda, da: y.da });
    unleveredTaxState = u.state_end;
    unleveredFcf.push(y.ebitda - u.cash_tax - (y.maint_capex + y.growth_capex) - y.delta_nwc);
  }

  return {
    derived: {
      enterprise_value: entry.enterprise_value,
      entry_multiple: entry.entry_multiple,
      entry_ebitda_for_sizing: entry.entry_ebitda_for_sizing,
      total_debt_at_par: sized.total_par,
      sponsor_equity: su.sponsor_equity,
      // §11 [v1.1.2]: GROSS by convention — total par ÷ FY EBITDA, the quoted term-sheet
      // number and the basis §17 sizes every tranche on. Deliberately NOT netted against
      // the funded min-cash; §11 records the rejected alternative and the reason.
      // (The previous comment here justified this as "entry net debt ≡ par because min-cash
      // is new money" — a FALSE premise: §2 does put min_cash on the t=0 balance sheet, so
      // the §11 net figure would be (par − min_cash) ÷ EBITDA. The value is right; that
      // argument for it was not, and the field was misnamed `entry_net_leverage_fy`.)
      // §24.2 [v2.0.0]: null ⇔ no historical EBITDA (previously a silent `0` sentinel here,
      // which §11/§15 forbid — N/A, never a made-up number).
      entry_gross_leverage_fy: entry.entry_ebitda_for_sizing !== null ? sized.total_par / entry.entry_ebitda_for_sizing : null,
      entry_ebitda_for_valuation: entry.entry_ebitda_for_valuation,
    },
    sources_uses: su,
    operating,
    tax,
    tranches: trancheRows,
    revolver: revolverRows,
    waterfall,
    balance_sheet: balanceSheet,
    exit_writeoff: exitWriteoff,
    /** §3 step 7 — what was actually PAID per year (total equity), for §9/§10/§12. */
    distributions_paid: waterfall.map((w) => w.distribution_paid),
    unlevered_fcf: unleveredFcf,
    final_debt_state: debtState,
    sized,
    build,
    ppe_seeded_at_zero: opening.ppe_seeded_at_zero,
  };
}

/**
 * §22.7 [v1.7.0]: interim distributions under a strip — a §3-step-7 payment redeems accrued
 * loan-note yield and then principal, and only the remainder reaches the ordinary class,
 * split at the BASE share s₀ (the ratchet is struck ONCE, at exit — §10's committed rule
 * applied to the second instrument). This is THE definition of the sponsor's interim share
 * whenever `sweet_equity` is non-null; `sponsorShareOfDistributions` (§9 pari-passu)
 * remains THE definition whenever it is null. The two are selected by a single predicate
 * in facade.ts — that tautological partition is what keeps one number one path.
 * No year-0 accretion: the first accretion lands in year 1 (§22.2).
 */
export interface StripInterimSplit {
  /** LN[0] = (1 − sponsor_ordinary_pct) × the §2 plug (§22.2). */
  loan_notes_subscribed: number;
  /** Interim redemptions per year: min(grown balance, paid[t]). */
  redeemed: number[];
  /** redeemed[t] + (1 − s₀) × ords[t] — the institution's (sponsor's) slice. */
  institution_share: number[];
  /** s₀ × ords[t] — management's slice; excluded from the sponsor stream. */
  management_share: number[];
  /** LN[N] grown to exit, net of interim redemptions, BEFORE the exit redemption (§22.2). */
  loan_note_balance_at_exit: number;
}

export function stripInterimSplit(
  sweet: NonNullable<DealAssumptions['sweet_equity']>,
  sponsorEquity: number,
  distributionsPaid: number[],
): StripInterimSplit {
  const ln0 = (1 - sweet.sponsor_ordinary_pct) * sponsorEquity;
  const s0 = sweet.management_ordinary_pct;
  let balance = ln0;
  const redeemed: number[] = [];
  const institution: number[] = [];
  const management: number[] = [];
  for (const paid of distributionsPaid) {
    const grown = balance * (1 + sweet.loan_note_rate);
    const r = Math.min(grown, paid); // the ONE clamp: a redemption cannot exceed the balance
    balance = grown - r;
    const ords = paid - r;
    redeemed.push(r);
    institution.push(r + (1 - s0) * ords);
    management.push(s0 * ords);
  }
  return {
    loan_notes_subscribed: ln0,
    redeemed,
    institution_share: institution,
    management_share: management,
    loan_note_balance_at_exit: balance,
  };
}

/**
 * §3.8 [v2.1.0] Build rejections for the surplus-cash policy, and its kernel form. ONE
 * distribution policy per deal: a schedule and a surplus policy together are rejected (the
 * analyst picks which governs — the model never guesses which one wins).
 */
export function validateSurplusDistribution(
  structure: Pick<DealAssumptions['structure'], 'distributions' | 'surplus_distribution'>,
): { payout_pct: number; after_debt_repaid: boolean } | null {
  const sd = structure.surplus_distribution ?? null;
  if (!sd) return null;
  if (structure.distributions !== null) {
    throw new RangeError('distributions: choose ONE policy; a requested schedule or the surplus-cash policy, not both (SPEC §3.8)');
  }
  if (!(sd.payout_pct >= 0 && sd.payout_pct <= 1)) throw new RangeError('distributions: the surplus payout must be between 0% and 100% (SPEC §3.8)');
  if (sd.start !== 'immediately' && sd.start !== 'after_debt_repaid') throw new RangeError("distributions: the surplus policy starts 'immediately' or 'after_debt_repaid' (SPEC §3.8)");
  return { payout_pct: sd.payout_pct, after_debt_repaid: sd.start === 'after_debt_repaid' };
}

/**
 * §23.3 [v2.2.0] Build rejections for the selldown (input gates, the §22.3 style).
 */
export function validateSelldown(a: Pick<DealAssumptions, 'structure' | 'rollover_equity' | 'sweet_equity' | 'entry'>): void {
  const sd = a.structure.selldown;
  if (!sd) return;
  const bad = (msg: string): never => { throw new RangeError(`selldown: ${msg} (SPEC §23.3)`); };
  if (a.rollover_equity > 0) bad('a selldown cannot sit beside rollover equity in v1: how the buyer and the rollover holder rank is negotiated, with no defensible default');
  if (a.sweet_equity) bad('a selldown cannot sit beside a sweet-equity strip in v1: selling a strip position splits loan notes and ordinaries by negotiation');
  if (!(sd.fraction > 0 && sd.fraction < 1)) bad('the fraction sold must be strictly between 0% and 100% (0 is no event; 100% before the exit year contradicts the holding period)');
  const N = a.entry.hold_years;
  if (!(Number.isInteger(sd.year) && sd.year >= 1 && sd.year <= N - 1)) bad(`the selldown year must be a whole year from 1 to ${N - 1} (year ${N} is the exit itself)`);
  if (!(sd.event_multiple > 0)) bad('the selldown multiple must be greater than 0');
}
