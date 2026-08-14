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
  const entry = deriveEntry(facts, assumptions);
  const sized = sizeStructure(assumptions.structure, entry.entry_ebitda_for_sizing);
  validateStructureForHold(sized, N);
  validateRefinancing(sized, assumptions.structure.refinancing, N); // §16/§18 input-gate rejections
  validatePikElections(sized, N); // §16/§20.2 input-gate rejections [v1.5.0]
  validateSweetEquity(assumptions); // §16/§22.3 input-gate rejections [v1.7.0]
  const su = buildSourcesUses(entry, sized, assumptions);
  // §22.3(vi) [v1.7.0]: the Build enforcement point (the grid pre-tests the same condition).
  const stripRejection = stripPlugRejection(su, assumptions);
  if (stripRejection !== null) throw new RangeError(stripRejection);

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
  let pendingRetirementDeduction = 0; // v1.0.3: early-retirement write-off deducts NEXT year

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
    // write off (book, year R) + the call premium defer their TAX deduction to year R+1's
    // UNCAPPED pool (§18.5) via `pendingRetirementDeduction` — EXPLICIT handling, never the
    // early-retirement balance-crossing path (the tranche does NOT retire — it continues at B).
    let refiCashCostTotal = 0;
    let refiBookCharge = 0; // Σ (WO + call premium) — book loss on extinguishment (§18.6)
    let refiDfcDelta = 0; // Σ (new OID + new fees) − WO (BS deferred-cost adjustment)
    let refiDeferral = 0; // this year's WO + premium — deducted NEXT year (§18.5)
    const refiThisYear = new Map<number, { cost: number; writeoff: number }>();
    for (const ev of assumptions.structure.refinancing ?? []) {
      if (ev.year !== t + 1) continue;
      const ti = termIndex.get(ev.tranche_name)!; // validated: exists + cash-pay term
      const ci = scheduleIndex.get(ev.tranche_name)!;
      const B = debtState.term_balances[ti]; // par-for-par: new face = beginning balance
      const WO = oidRemaining[ci] + feeRemaining[ci]; // §18.5 old unamortized OID + DFC
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
      refiDeferral += WO + premium;
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
    // §9: the exit-year write-off (post year-N amortization) is deterministic pre-waterfall
    const yearWriteoffForTax = exitYear
      ? oidRemaining.reduce((a, b) => a + b, 0) + feeRemaining.reduce((a, b) => a + b, 0) + pendingRetirementDeduction
      : pendingRetirementDeduction;
    pendingRetirementDeduction = 0;

    // ── tax (§6) ──
    const taxResult = runTaxYear(assumptions.tax, taxState, {
      ebitda_adj: y.ebitda_adj,
      da: y.da,
      cash_interest_total: lines.cash_interest_total,
      pik_accrual_total: lines.pik_accrual_total,
      oid_amortization: oidAmortTotal,
      financing_fee_amortization: feeAmortTotal,
      commitment_fees: lines.commitment_fee,
      retirement_writeoff: yearWriteoffForTax,
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
      // early-retirement deduction is already inside yearWriteoffForTax for the §6 run
      bookWriteoff = oidRemaining.reduce((a, b) => a + b, 0) + feeRemaining.reduce((a, b) => a + b, 0);
      exitWriteoff = bookWriteoff;
      oidRemaining.fill(0);
      feeRemaining.fill(0);
    } else {
      for (const name of debtOut.fully_retired) {
        const i = scheduleIndex.get(name);
        if (i === undefined) continue;
        const amount = oidRemaining[i] + feeRemaining[i];
        bookWriteoff += amount;
        pendingRetirementDeduction += amount; // tax deduction lands in year t+1 (v1.0.3)
        oidRemaining[i] = 0;
        feeRemaining[i] = 0;
      }
    }
    // §18.5: the refi write-off + call premium defer their tax deduction to next year's UNCAPPED
    // pool — the SAME bucket the early-retirement path above uses (merges into the exit deduction
    // when R+1 = N). 0 in a non-refi year and in the exit year (a refi is validated to year ≤ N−1).
    pendingRetirementDeduction += refiDeferral;

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
      entry_gross_leverage_fy: entry.entry_ebitda_for_sizing > 0 ? sized.total_par / entry.entry_ebitda_for_sizing : 0,
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
