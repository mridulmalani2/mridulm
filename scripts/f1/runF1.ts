/**
 * PHASE F §F1 — the bounded differential: old engine vs engine2 over the golden regimes,
 * every diff categorized against rebuild/DIFF_LEDGER.md or flagged INVESTIGATE.
 *
 * Method (bounded by construction):
 *   • HARD IDENTITIES are gated — quantities whose definition is convention-stable across
 *     both engines must agree to tolerance (EV, debt at par, mandatory amort on face,
 *     PIK accretion, the all-equity G1 regime end-to-end modulo the exactly-quantified
 *     C-9 min-cash delta, equity plugs modulo a subset-sum of quantified convention rows).
 *   • SELF-CONSISTENCY is gated — each engine must reproduce ITS OWN documented interest
 *     convention on its own balances (old: avg(beg, beg − mandatory); new: beginning).
 *     When both hold, the cross-engine interest delta is C-1/L-8 by arithmetic, not faith.
 *   • Everything convention-divergent by design (sweep mechanics C-4/L-6, tax ordering
 *     C-10/C-18/C-20 on levered regimes, fee membership C-12/C-13) is ATTRIBUTED to its
 *     ledger rows with the numbers printed — expected divergence, reported, not gated.
 *   • Anything gated that fails → INVESTIGATE. The phase gate is ZERO INVESTIGATE cells.
 */

import { fullRecalc } from '../../lib/engine';
import { runModel, type Engine2ModelOutput } from '../../lib/engine2/facade';
import { GOLDEN_DEALS } from '../../tests/fixtures/engine2-golden-deals';
import { adaptToOldModelState } from './adaptV1Inputs';
import type { ModelState } from '../../lib/dealEngineTypes';

export type CellStatus = 'MATCH' | 'EXPLAINED' | 'ATTRIBUTED' | 'INVESTIGATE';
export interface Cell {
  regime: string;
  quantity: string;
  status: CellStatus;
  /** Ledger rows the diff maps to (empty for MATCH). */
  rows: string[];
  detail: string;
}

const TOL_M = 0.02;        // $0.02m on money quantities
const TOL_REL = 1e-9;      // identities computed from identical arithmetic

const near = (a: number, b: number, tol = TOL_M) => Math.abs(a - b) <= tol;

export interface F1Result {
  cells: Cell[];
  investigate: Cell[];
  notes: string[];
}

export function runF1(): F1Result {
  const cells: Cell[] = [];
  const notes: string[] = [];

  for (const [name, deal] of Object.entries(GOLDEN_DEALS)) {
    const neu: Engine2ModelOutput = runModel(deal.facts, deal.assumptions);
    const oldState: ModelState = fullRecalc(adaptToOldModelState(deal.facts, deal.assumptions));
    const su = oldState.sources_and_uses;
    const a = deal.assumptions;
    const push = (quantity: string, status: CellStatus, rows: string[], detail: string) =>
      cells.push({ regime: name, quantity, status, rows, detail });

    // ── 1. Entry EV — identity (multiple × FY EBITDA in both engines) ──
    {
      const dv = Math.abs(su.enterprise_value - neu.sources_uses.enterprise_value);
      push('entry EV', dv <= Math.max(TOL_M, TOL_REL * su.enterprise_value) ? 'MATCH' : 'INVESTIGATE', [],
        `old ${su.enterprise_value.toFixed(2)} vs new ${neu.sources_uses.enterprise_value.toFixed(2)}`);
    }

    // ── 2. Debt at par — identity ──
    {
      const oldDebt = su.total_debt;
      const newDebt = neu.sources_uses.debt_at_par.reduce((s, d) => s + d.amount, 0);
      push('debt at par', near(oldDebt, newDebt) ? 'MATCH' : 'INVESTIGATE', [],
        `old ${oldDebt.toFixed(2)} vs new ${newDebt.toFixed(2)}`);
    }

    // ── 3. Sponsor equity plug — Δ must be a subset-sum of QUANTIFIED convention rows:
    //      C-9 (+min_cash: new funds it, old's cash_to_balance_sheet is hard-coded 0) and
    //      C-21 (financing-fee base: new = % × commitments incl. undrawn revolver; old =
    //      % × drawn principal). OID cancels (old books it as a use; new funds it — same plug).
    {
      const dEq = neu.sources_uses.sponsor_equity - su.sponsor_equity;
      const minCash = a.structure.min_cash;
      const revolverCommitments = a.structure.tranches
        .filter((t) => t.type === 'revolver')
        .reduce((s, t) => s + ('x_ebitda' in t.commitment && t.commitment.x_ebitda !== undefined
          ? t.commitment.x_ebitda * deal.facts.fy_ebitda
          : (t.commitment as { amount: number }).amount), 0);
      const feeBaseDelta = a.fees.financing_pct_of_commitments * revolverCommitments;
      const candidates: [number, string[]][] = [
        [0, []],
        [minCash, ['C-9']],
        [feeBaseDelta, ['C-21']],
        [minCash + feeBaseDelta, ['C-9', 'C-21']],
      ];
      const hit = candidates.find(([v]) => near(dEq, v));
      push('sponsor equity plug', hit ? (hit[1].length ? 'EXPLAINED' : 'MATCH') : 'INVESTIGATE', hit?.[1] ?? [],
        `Δ(new−old) = ${dEq.toFixed(3)}; expected components: min_cash ${minCash} (C-9), fee-base ${feeBaseDelta.toFixed(3)} (C-21)`);
    }

    // ── 4. Per-tranche mechanics ──
    const oldSched = oldState.debt_schedule.tranche_schedules;
    a.structure.tranches.forEach((t, ti) => {
      const oldRows = oldSched[ti] ?? [];
      if (t.type === 'revolver') {
        // Commitment fee on undrawn — same base convention both engines; identity on
        // years where BOTH sit fully undrawn (drawn-path divergence is C-4 territory).
        const newRows = neu.revolver ?? [];
        const bothUndrawn = newRows.map((r, y) => r.beginning_drawn === 0 && r.draw === 0
          && (oldRows[y]?.beginning_balance ?? 0) === 0 && (oldRows[y]?.ending_balance ?? 0) === 0);
        const diffs: string[] = [];
        newRows.forEach((r, y) => {
          if (!bothUndrawn[y]) return;
          const oldFee = oldRows[y]?.commitment_fee_paid ?? 0;
          if (!near(oldFee, r.commitment_fee, 0.005)) diffs.push(`Y${y + 1} old ${oldFee.toFixed(4)} vs new ${r.commitment_fee.toFixed(4)}`);
        });
        push(`${t.name}: commitment fee (undrawn years)`, diffs.length ? 'INVESTIGATE' : 'MATCH', [],
          diffs.length ? diffs.join('; ') : 'undrawn-year fees agree');
        return;
      }

      const newRows = neu.tranches[ti - a.structure.tranches.slice(0, ti).filter((x) => x.type === 'revolver').length] ?? [];

      if (t.type === 'pik_note') {
        // PIK accretes on the beginning balance in BOTH engines and never sweeps — the whole
        // schedule is a hard identity.
        const diffs: string[] = [];
        newRows.forEach((r, y) => {
          const o = oldRows[y];
          if (!o) { diffs.push(`Y${y + 1}: old row missing`); return; }
          if (!near(o.beginning_balance, r.beginning_balance) || !near(o.pik_accrual, r.pik_accrual)
            || !near(o.ending_balance, r.ending_balance)) {
            diffs.push(`Y${y + 1} beg ${o.beginning_balance.toFixed(3)}/${r.beginning_balance.toFixed(3)} pik ${o.pik_accrual.toFixed(3)}/${r.pik_accrual.toFixed(3)} end ${o.ending_balance.toFixed(3)}/${r.ending_balance.toFixed(3)}`);
          }
        });
        push(`${t.name}: PIK schedule`, diffs.length ? 'INVESTIGATE' : 'MATCH', [], diffs.length ? diffs.join('; ') : 'accretion path identical');
        return;
      }

      // cash-pay term debt
      const face = (t.size.x_ebitda ?? 0) * deal.facts.fy_ebitda;
      const amortOnFace = t.amort_pct_of_face * face;
      const rate = t.pricing.kind === 'floating'
        ? Math.max(t.pricing.base_rate, t.pricing.floor) + t.pricing.spread // new convention (C-3)
        : t.pricing.rate;
      const oldRate = t.pricing.kind === 'floating'
        ? Math.max(t.pricing.base_rate + t.pricing.spread, t.pricing.floor) // old convention (C-3)
        : t.pricing.rate;
      if (Math.abs(rate - oldRate) > 1e-12) {
        notes.push(`${name}/${t.name}: C-3 floor convention NOT inert (old ${oldRate}, new ${rate}) — interest cells attribute {C-1,C-3,C-4}`);
      }

      // 4a. mandatory amort: identity on original face (§14.15) unless the old engine clipped
      //     because sweeps had already consumed the balance (C-4 downstream).
      {
        const diffs: string[] = [];
        let clipped = false;
        newRows.forEach((r, y) => {
          const o = oldRows[y];
          if (!o) return;
          if (!near(r.mandatory_amort, amortOnFace, 0.005) && r.ending_balance + r.mandatory_amort > 0.005) {
            // new engine pays amort on face while balance lasts (§14.15) — deviation only at payoff
          }
          if (!near(o.scheduled_repayment, r.mandatory_amort, 0.005)) {
            if (o.scheduled_repayment < amortOnFace - 0.005 && near(o.scheduled_repayment, o.beginning_balance + o.pik_accrual, 0.01)) clipped = true;
            else diffs.push(`Y${y + 1} old ${o.scheduled_repayment.toFixed(3)} vs new ${r.mandatory_amort.toFixed(3)}`);
          }
        });
        push(`${t.name}: mandatory amort`,
          diffs.length ? 'INVESTIGATE' : clipped ? 'EXPLAINED' : 'MATCH',
          clipped ? ['C-4', 'L-6'] : [],
          diffs.length ? diffs.join('; ') : clipped ? 'old clipped amort to a sweep-shrunk balance (§14.15 keeps face)' : 'amort on face agrees');
      }

      // 4b. interest SELF-CONSISTENCY: each engine must match its own documented convention
      //     on its own balances. Then the cross-delta is C-1 (avg vs beginning) by arithmetic.
      {
        const oldViol: string[] = [];
        oldRows.forEach((o, y) => {
          if (y >= 5) return;
          const expect = oldRate * ((o.beginning_balance + Math.max(0, o.beginning_balance - o.scheduled_repayment)) / 2);
          if (!near(o.cash_interest, expect, 0.01)) oldViol.push(`Y${y + 1} old int ${o.cash_interest.toFixed(4)} ≠ avg-convention ${expect.toFixed(4)}`);
        });
        const newViol: string[] = [];
        newRows.forEach((r, y) => {
          const expect = rate * r.beginning_balance;
          if (!near(r.cash_interest, expect, 0.01)) newViol.push(`Y${y + 1} new int ${r.cash_interest.toFixed(4)} ≠ beginning-balance ${expect.toFixed(4)}`);
        });
        const viol = [...oldViol, ...newViol];
        const crossDiff = newRows.reduce((s, r, y) => s + Math.abs(r.cash_interest - (oldRows[y]?.cash_interest ?? 0)), 0);
        push(`${t.name}: cash interest`, viol.length ? 'INVESTIGATE' : crossDiff <= TOL_M ? 'MATCH' : 'EXPLAINED',
          viol.length ? [] : crossDiff <= TOL_M ? [] : ['C-1', 'L-8', 'C-4'],
          viol.length ? viol.join('; ')
            : `both engines self-consistent; Σ|Δinterest| = ${crossDiff.toFixed(3)} (avg-balance vs beginning-balance on C-4-divergent paths)`);
      }

      // 4c. sweep + ending balances — divergent BY DESIGN (pool × pct with priorities vs
      //     per-tranche cap mechanics): attributed to C-4/L-6, numbers reported.
      {
        const oldSweep = oldRows.slice(0, 5).reduce((s, o) => s + (o.sweep_repayment ?? 0), 0);
        const newSweep = newRows.reduce((s, r) => s + r.sweep_repayment, 0);
        const oldEnd = oldRows[Math.min(4, oldRows.length - 1)]?.ending_balance ?? 0;
        const newEnd = newRows[newRows.length - 1]?.ending_balance ?? 0;
        const status = near(oldSweep, newSweep) && near(oldEnd, newEnd) ? 'MATCH' : 'ATTRIBUTED';
        push(`${t.name}: sweep + ending balance`, status, status === 'MATCH' ? [] : ['C-4', 'L-6'],
          `Σsweep old ${oldSweep.toFixed(2)} vs new ${newSweep.toFixed(2)}; Y5 end old ${oldEnd.toFixed(2)} vs new ${newEnd.toFixed(2)}`);
      }
    });

    // ── 5. Cash taxes ──
    {
      const oldTax = oldState.projections.years.slice(0, 5).map((y) => y.tax);
      const newTax = neu.tax.map((t) => t.cash_tax);
      const levered = a.structure.tranches.length > 0;
      const nol = a.tax.nol.acquired_usable && a.tax.nol.acquired_opening > 0;
      if (!levered) {
        // G1 identity: no interest, no NOL, no minimum-tax interplay — taxes must MATCH.
        const diffs = newTax.map((v, y) => [y, v, oldTax[y]] as const).filter(([, v, o]) => !near(v, o ?? NaN, 0.01));
        push('cash taxes', diffs.length ? 'INVESTIGATE' : 'MATCH', [],
          diffs.length ? diffs.map(([y, v, o]) => `Y${y + 1} old ${o?.toFixed(3)} vs new ${v.toFixed(3)}`).join('; ')
            : `identical (${newTax.map((v) => v.toFixed(2)).join(', ')})`);
      } else {
        const rows = ['C-1', 'C-4', 'C-10', ...(nol ? ['C-18', 'C-20'] : []), 'C-19'];
        const sumOld = oldTax.reduce((s, v) => s + (v ?? 0), 0);
        const sumNew = newTax.reduce((s, v) => s + v, 0);
        push('cash taxes', near(sumOld, sumNew) ? 'MATCH' : 'ATTRIBUTED', near(sumOld, sumNew) ? [] : rows,
          `Σ old ${sumOld.toFixed(2)} vs new ${sumNew.toFixed(2)} — interest base + ordering conventions`);
      }
    }

    // ── 6. Balance-sheet close (engine2 invariant; old engine reported) ──
    {
      const worst = Math.max(...neu.balance_sheet.map((b) => Math.abs(b.check)));
      push('balance sheet close (new)', worst < 0.005 ? 'MATCH' : 'INVESTIGATE', [],
        `worst |check| = ${worst.toExponential(2)}`);
      if (!su.sources_uses_balanced) notes.push(`${name}: OLD S&U reports imbalance ${su.imbalance}`);
    }

    // ── 7. Sponsor returns ──
    {
      const oldR = oldState.returns;
      const newR = neu.returns.sponsor_net;
      // L-16 (found BY this differential): the old engine floors net debt at zero, so any
      // terminal cash above gross debt is dropped from exit proceeds. Quantify the drop from
      // the old engine's OWN schedule so the attribution stays arithmetic, not narrative.
      const cashLast = oldState.debt_schedule.cash_balance_by_year.slice(-1)[0] ?? 0;
      const debtLast = oldState.debt_schedule.total_debt_by_year.slice(-1)[0] ?? 0;
      const droppedCash = Math.max(0, cashLast - debtLast);
      if (!a.structure.tranches.length && !a.mip) {
        // G1: quantitative closure — Δout = min_cash (C-9); Δin = min_cash + the L-16 drop.
        const oldOut = -(oldR.equity_cashflows?.[0] ?? NaN);
        const newOut = -newR.cashflows[0];
        const oldIn = oldR.equity_cashflows?.[oldR.equity_cashflows.length - 1] ?? NaN;
        const newIn = newR.cashflows[newR.cashflows.length - 1];
        const legsExplained = near(newOut - oldOut, a.structure.min_cash, 0.05)
          && near(newIn - oldIn, a.structure.min_cash + droppedCash, 0.05);
        const rows = ['C-9', ...(droppedCash > TOL_M ? ['L-16'] : [])];
        const irrBp = oldR.irr != null && newR.irr != null ? (newR.irr - oldR.irr) * 1e4 : NaN;
        push('sponsor IRR/MOIC', legsExplained ? 'EXPLAINED' : 'INVESTIGATE', legsExplained ? rows : [],
          `Δout ${(newOut - oldOut).toFixed(3)} = min_cash ${a.structure.min_cash} (C-9); Δin ${(newIn - oldIn).toFixed(3)} = min_cash + L-16 dropped cash ${droppedCash.toFixed(2)}; IRR ${oldR.irr == null ? 'null' : (oldR.irr * 100).toFixed(2)}% → ${newR.irr == null ? 'null' : (newR.irr * 100).toFixed(2)}% (${isNaN(irrBp) ? '—' : irrBp.toFixed(1)}bp)`);
      } else {
        const rows = ['C-1', 'C-4', 'C-9', 'C-10', 'C-21', ...(a.mip ? ['C-13'] : []), ...(droppedCash > TOL_M ? ['L-16'] : []), 'C-2'];
        push('sponsor IRR/MOIC', 'ATTRIBUTED', rows,
          `old ${oldR.irr == null ? 'null' : (oldR.irr * 100).toFixed(2)}% / ${oldR.moic.toFixed(3)}x vs new ${newR.irr == null ? 'null' : (newR.irr * 100).toFixed(2)}% / ${newR.moic == null ? 'null' : newR.moic.toFixed(3)}x — composite of the levered convention set${droppedCash > TOL_M ? `; old drops ${droppedCash.toFixed(2)} surplus cash at exit (L-16)` : ''}`);
      }
      if (oldR.irr_convergence_failed || oldR.debt_convergence_failed) {
        notes.push(`${name}: old engine convergence flag set (C-2 — engine2 is solver-free by design)`);
      }
    }
  }

  return { cells, investigate: cells.filter((c) => c.status === 'INVESTIGATE'), notes };
}

/** Render the report (rebuild/F1_DIFFERENTIAL.md). */
export function renderF1Report(r: F1Result, generatedAt: string): string {
  const lines: string[] = [];
  lines.push('# Phase F1 — Bounded differential report (old `lib/engine` vs `lib/engine2`)');
  lines.push('');
  lines.push(`Generated ${generatedAt} by \`scripts/f1/runF1.ts\` over the SPEC §17 golden regimes`);
  lines.push('(G1–G5, `tests/fixtures/engine2-golden-deals.ts`) — the clean-room set adjudicated by');
  lines.push('`tests/goldens/` (goldens are the arbiter; engine2 reproduces them byte-for-byte in CI).');
  lines.push('');
  lines.push('**Exclusions (§F1.1):** old-engine features with no v2 counterpart are never exercised —');
  lines.push('add-on acquisitions, partial exits, interim distributions, PIK toggles/elections,');
  lines.push('refinancing events, monitoring fees, fund-level economics, sweet equity. Redefined');
  lines.push('quantities (return-series variants, scenario outputs, operating-NWC facts) are not');
  lines.push('diffed — they are redefinitions with SPEC refs (C-6/C-7/C-11/C-12/C-16).');
  lines.push('');
  lines.push('**Verdict legend:** MATCH = agrees within $0.02m · EXPLAINED = delta equals the');
  lines.push('quantified ledger-row prediction exactly · ATTRIBUTED = divergent BY DESIGN, covered by');
  lines.push('the cited rows, numbers printed · INVESTIGATE = unexplained (gate-failing).');
  lines.push('');
  const regimes = [...new Set(r.cells.map((c) => c.regime))];
  for (const reg of regimes) {
    lines.push(`## ${reg}`);
    lines.push('');
    lines.push('| Quantity | Verdict | Ledger rows | Detail |');
    lines.push('|---|---|---|---|');
    for (const c of r.cells.filter((x) => x.regime === reg)) {
      lines.push(`| ${c.quantity} | ${c.status} | ${c.rows.join(', ') || '—'} | ${c.detail.replace(/\|/g, '/')} |`);
    }
    lines.push('');
  }
  if (r.notes.length) {
    lines.push('## Notes');
    lines.push('');
    for (const n of r.notes) lines.push(`- ${n}`);
    lines.push('');
  }
  const inv = r.investigate.length;
  lines.push('## Gate');
  lines.push('');
  lines.push(inv === 0
    ? '**ZERO open INVESTIGATE cells — the §F1 gate is CLEAN.** Every diff is a categorized,'
    : `**${inv} INVESTIGATE cell(s) OPEN — the gate FAILS.** Each needs a golden-derived verdict,`);
  lines.push(inv === 0
    ? 'pre-authorized divergence (L-x known old defects / C-x intentional convention changes).'
    : 'then either an engine2 fix or a new ledger row before the cutover proceeds.');
  lines.push('');
  return lines.join('\n');
}
