/**
 * lib/cleaning/checks.ts — the Clean step's checks (plan §5). Pure.
 *
 * No numeric thresholds: a threshold would be a hardcoded opinion. Where size matters the
 * figure is SHOWN and the analyst judges it. A `block` stops "Continue with adjusted figures"
 * (and names what is open); a `warn` never does.
 */
import type { RawHistoricals } from '../edgar/types';
import { cellAt, type StatementPack } from '../statements/types';
import { ebitdaHasComponents, periodLabel, restatableAt, type CleanedHistoricals } from './apply';
import type { AdjustmentTarget, CleaningFlag, CleaningLedger, LineBridge } from './types';

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

/** `raw` = the figures as sourced (the base an operating-NWC row is added to). */
export function cleaningChecks(pack: StatementPack, ledger: CleaningLedger, cleaned: CleanedHistoricals, raw: Pick<RawHistoricals, 'nwc'> = { nwc: cleaned.raw.nwc }): CleaningFlag[] {
  const flags: CleaningFlag[] = [];
  if (ledger.as_reported) return flags; // nothing is applied, so nothing can be inconsistent
  const { bridges } = cleaned;
  const S = pack.sizing;
  const A = pack.anchor;
  const block = (code: string, message: string) => flags.push({ code, severity: 'block', message });
  const warn = (code: string, message: string) => flags.push({ code, severity: 'warn', message });

  // ── entries that are not finished ──
  for (const o of ledger.overrides) {
    if (!o.reason.trim()) block('override_reason', `Give a reason for restating ${o.line.replace(/_/g, ' ')} in ${periodLabel(pack, o.period)}.`);
    if (!restatableAt(pack, o.line, o.period)) {
      block('override_not_applicable', o.line === 'ebitda' && ebitdaHasComponents(pack, o.period)
        ? `EBITDA in ${periodLabel(pack, o.period)} is operating income + D&A: restate those cells, not the total.`
        : `${o.line.replace(/_/g, ' ')} in ${periodLabel(pack, o.period)} cannot be restated: the model does not read that cell.`);
    }
  }
  // C7: a restated figure the filing's own tagged lines contradict
  for (const o of ledger.overrides) {
    const v = (line: Parameters<typeof cellAt>[1]) => cellAt(pack, line, o.period)?.value ?? null;
    const differs = (x: number) => Math.abs(o.value - x) > 0.05; // half a unit in the last displayed decimal
    if (o.line === 'revenue' && v('cogs') !== null && v('gross_profit') !== null && differs(v('cogs')! + v('gross_profit')!)) {
      warn('override_contradicts', `Restated revenue for ${periodLabel(pack, o.period)} (${o.value.toFixed(1)}) no longer equals the filing’s cost of revenue plus gross profit (${(v('cogs')! + v('gross_profit')!).toFixed(1)}). If the restatement also changes those lines, the margin analysis below it is on the old basis.`);
    }
    if (o.line === 'cash' && v('st_investments') === null && v('cash') !== null && cleaned.raw.nwc && differs(v('cash')!)) {
      warn('override_contradicts', `Cash for ${periodLabel(pack, o.period)} is restated, but operating NWC was derived from current assets less the sourced cash figure. Check the NWC figure still means what you intend.`);
    }
  }
  const mustHave: Record<AdjustmentTarget, string | null> = { ebitda: S, revenue: S, da: A, capex: A, nwc: A };
  const baseOf = (t: Exclude<AdjustmentTarget, 'nwc'>, p: string): number | null =>
    bridges[t].find((b) => b.period === p)?.restated ?? null;
  for (const a of ledger.adjustments) {
    if (!a.included) continue;
    const name = a.label.trim() || 'an unnamed adjustment';
    if (!a.label.trim()) block('adjustment_label', 'Name every adjustment: an unnamed row cannot be reviewed.');
    if (a.target === 'ebitda' && a.forecast === null) {
      block('forecast_choice', `Say whether “${name}” stops or continues after the deal. A cost that continues is added back for the price, but stays in the forecast.`);
    }
    const p = mustHave[a.target];
    if (p === null) continue;
    if ((a.amounts[p] ?? null) === null) {
      block('adjustment_amount', `Enter the ${periodLabel(pack, p)} amount for “${name}”: that is the period the model reads.`);
    } else if (a.target === 'nwc' ? raw.nwc === null : baseOf(a.target, p) === null) {
      block('adjustment_no_base', `“${name}” adjusts ${a.target === 'da' ? 'D&A' : a.target === 'nwc' ? 'operating NWC' : a.target} in ${periodLabel(pack, p)}, but the source gives no figure there. Enter the reported figure in the grid first.`);
    }
    if (a.source.kind === 'filing' && !a.confirmed_in_operating_income) {
      const tag = a.source.tag;
      const cand = pack.candidates.find((c) => c.tag === tag && c.bridge === 'ebitda');
      if (cand?.caveat) warn('candidate_unconfirmed', `“${name}”: ${cand.caveat}`);
    }
  }
  for (const i of ledger.net_debt_items) {
    if (!i.included) continue;
    if (!i.label.trim()) block('net_debt_label', 'Name every net-debt item.');
    if (i.amount === null) block('net_debt_amount', `Enter the amount for “${i.label.trim() || 'an unnamed item'}”.`);
  }

  // ── leases: the choice, and whether it matches the EBITDA basis (plan §4.3) ──
  const nd = bridges.net_debt;
  if (nd && nd.leases.length) {
    if (nd.lease_choice === null) {
      block('lease_choice', 'Choose how lease liabilities are treated in net debt. There is no default: it has to match how rent is treated in EBITDA.');
    } else if (pack.gaap === 'us-gaap' && nd.lease_choice === 'all' && nd.leases.some((l) => l.line === 'operating_lease_liab')) {
      warn('lease_basis', 'US GAAP EBITDA is after operating-lease rent. Counting operating-lease liabilities as debt without adding the rent back to EBITDA counts the leases twice: add the rent as an EBITDA adjustment, or leave operating leases out.');
    } else if (pack.gaap === 'ifrs' && nd.lease_choice !== 'all') {
      warn('lease_basis', 'IFRS 16 EBITDA is before lease cost (it sits in depreciation and interest). Leaving lease liabilities out of debt understates leverage against that EBITDA.');
    }
  }
  if (nd && nd.adjusted === null && nd.lease_choice !== null && (nd.borrowings === null || nd.cash === null)) {
    block('net_debt_base', `Adjusted net debt cannot be worked out: the source gives no ${nd.borrowings === null ? 'borrowings' : 'cash'} figure. Enter it in the balance sheet grid.`);
  }

  // ── C4 bridge identity, recomputed independently of applyCleaning's own total ──
  const identity = (name: string, list: LineBridge[]) => {
    for (const b of list) {
      if (b.adjusted === null || b.restated === null) continue;
      const sum = b.rows.reduce((s, r) => s + (r.amount ?? Number.NaN), 0);
      if (!(Math.abs(b.restated + sum - b.adjusted) <= 1e-9 * Math.max(1, Math.abs(b.adjusted)))) {
        block('bridge_identity', `Internal error: the ${name} bridge for ${periodLabel(pack, b.period)} does not add up. Please report this.`);
      }
    }
  };
  identity('revenue', bridges.revenue);
  identity('EBITDA', bridges.ebitda);
  identity('D&A', bridges.da);
  identity('capex', bridges.capex);

  // ── the sourced D&A includes financing costs (D4) ──
  const daCell = cellAt(pack, 'da', A);
  if (daCell?.note && !ledger.overrides.some((o) => o.line === 'da' && o.period === A)) warn('da_alias', daCell.note);

  // ── size, shown not judged; and the engine's own EBITDA rule, said early ──
  const eb = S === null ? null : bridges.ebitda.find((b) => b.period === S) ?? null;
  if (eb && eb.rows.length && eb.adjusted !== null && eb.restated !== null) {
    const delta = eb.adjusted - eb.restated;
    flags.push({
      code: 'adjustment_share', severity: 'info',
      message: eb.restated > 0
        ? `Adjustments ${delta >= 0 ? 'add' : 'remove'} ${pct1(Math.abs(delta) / eb.restated)} of reported ${periodLabel(pack, S!)} EBITDA.`
        : `Adjustments move ${periodLabel(pack, S!)} EBITDA by ${delta.toFixed(1)}; reported EBITDA is not positive, so no percentage is shown.`,
    });
    const fc = cleaned.raw.forecast_ebitda;
    if (fc && fc.value !== eb.adjusted) {
      flags.push({
        code: 'forecast_base', severity: 'info',
        message: `The deal is priced and levered on adjusted EBITDA of ${eb.adjusted.toFixed(1)}, but the forecast starts from ${fc.value.toFixed(1)}: the add-backs marked “continues” keep costing cash, so they are not in forecast cash flow.`,
      });
    }
  }
  if (eb && eb.adjusted !== null && eb.adjusted <= 0) {
    warn('ebitda_not_positive', 'Adjusted EBITDA is not positive. The model cannot price a deal as a multiple of it: enter a purchase price directly on the Assumptions step.');
  }
  return flags;
}

export const blockers = (flags: CleaningFlag[]): CleaningFlag[] => flags.filter((f) => f.severity === 'block');
