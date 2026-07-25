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
  validateStructureForHold,
  type DebtState,
} from './debt';
import { openingTaxState, runTaxYear, runUnleveredTaxYear } from './tax';
import { buildSourcesUses, deriveEntry, sizeStructure, type SizedStructure } from './sourcesUses';
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
  const su = buildSourcesUses(entry, sized, assumptions);

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

    // ── rates → interest & fees from opening balances (§4/§5) ──
    const lines = financeLines(sized, debtState);
    // scheduled amortization this year, on the LIVE remaining balances (§7)
    const oidAmort = build.cost_schedules.map((s, i) =>
      s.oid_amount > 0 ? Math.min(oidRemaining[i], s.oid_amount / costInputs[i].maturity_years) : 0,
    );
    const feeAmort = build.cost_schedules.map((s, i) =>
      s.fee_allocated > 0 ? Math.min(feeRemaining[i], s.fee_allocated / costInputs[i].maturity_years) : 0,
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
    const debtOut = runDebtYear(sized, debtState, lines, {
      opening_cash: cash,
      fcf_pre_debt: fcf,
      min_cash: assumptions.structure.min_cash,
      sweep_pct: sweepPct,
      // §3 step 7 / §3.7 — null schedule ≡ zeros ≡ feature off (byte-identical to pre-v1.1.0)
      distribution_request: assumptions.structure.distributions?.[t] ?? 0,
      rp_trap_level: assumptions.covenants.rp_trap?.level ?? null,
      ebitda_adj: y.ebitda_adj,
    });
    debtOut.tranche_rows.forEach((row, i) => trancheRows[i].push(row));
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
    dfc = dfc - oidAmortTotal - feeAmortTotal - bookWriteoff;
    const netIncome =
      y.ebit -
      (lines.cash_interest_total +
        lines.pik_accrual_total +
        oidAmortTotal +
        feeAmortTotal +
        lines.commitment_fee +
        bookWriteoff) -
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
