/**
 * engine2/factsAdapter.ts — RawHistoricals (lib/edgar extraction) → DealFacts (engine2
 * Class A contract). PHASE_E §E1 store work.
 *
 * Rules: facts only — nothing here invents a number. A RawHistoricals gap stays a gap:
 * REQUIRED DealFacts fields that are absent are returned in `missing` (the store keeps
 * them 'missing'-badged and Build stays gated exactly as today); nullable DealFacts
 * fields pass null through. Money is already in millions on both sides; rates are
 * decimals on both sides. The D1 history series maps to HistoricalYear rows keyed by
 * period END date, with per-cell nulls preserved (no fake totals).
 */

import type { RawHistoricals } from '../edgar/types';
import type { DealFacts, HistoricalYear } from './types';
import type { Engine2Currency } from '../format';

export interface AdaptedFacts {
  facts: DealFacts;
  /** DealFacts field paths the extraction could not provide (REQUIRED ⇒ Build-gating). */
  missing: string[];
  /** Honest-degradation notes carried from extraction (days gating, FPI history, …). */
  notes: string[];
  /** Assumption paths whose FACT input was a statutory/placeholder default — the store
   *  downgrades their suggestion badge from 'facts' to 'template' with this detail (a
   *  defaulted value must never wear a "from the filing" basis — review 2026-07-24). */
  templateBases: Record<string, string>;
}

const MODELLED: ReadonlySet<string> = new Set(['USD', 'EUR', 'GBP', 'JPY', 'INR']);

export function adaptRawHistoricals(raw: RawHistoricals): AdaptedFacts {
  const missing: string[] = [];
  const notes: string[] = [...raw.days_notes];
  const templateBases: Record<string, string> = {};
  const req = (v: number | null | undefined, path: string, fallback: number): number => {
    if (v == null || !Number.isFinite(v)) {
      missing.push(path);
      return fallback; // neutral placeholder — NEVER shown; the 'missing' badge governs
    }
    return v;
  };

  if (raw.currency_unsupported) {
    notes.push(`currency ${raw.currency_unsupported} unsupported — Build blocked`);
  }

  // A statutory-default tax rate is a legitimate TEMPLATE input, but it must never wear a
  // "from the filing" badge (review 2026-07-24). The mappers mark their fallback with
  // provenance.source 'default'; a fully absent rate gets the same honest downgrade.
  if (raw.effective_tax_rate == null || raw.effective_tax_rate.provenance.source === 'default') {
    templateBases['tax.rate'] =
      'statutory default — the filing gave no derivable effective rate; review';
  }
  // The combined PP&E+ROU concept is a stated fallback — surface the statement (the v2
  // screens render notes; provenance detail alone never reaches the default surface).
  if (raw.net_ppe && /right-of-use|ROU/i.test(raw.net_ppe.provenance.detail ?? '')) {
    notes.push('net PP&E includes finance-lease right-of-use assets (combined concept — the filing does not tag the pure figure)');
  }

  // D1 history → HistoricalYear rows: union of period ends across series, per-cell nulls.
  const history: HistoricalYear[] = [];
  if (raw.history) {
    const at = (metric: 'revenue' | 'ebitda' | 'capex', end: string): number | null =>
      raw.history![metric].points.find((p) => p.end === end)?.value ?? null;
    const ends = [...new Set(raw.history.revenue.points.map((p) => p.end))].sort();
    for (const end of ends) {
      history.push({
        fiscal_year: Number(end.slice(0, 4)),
        period_end: end,
        revenue: at('revenue', end),
        ebitda: at('ebitda', end),
        capex: at('capex', end),
        operating_nwc: null, // balance-sheet history is a D-follow-up; never faked
      });
    }
  }

  const revenue = req(raw.fy_revenue?.value, 'fy_revenue', 100);
  const ebitda = req(raw.fy_ebitda?.value, 'fy_ebitda', 20);

  const facts: DealFacts = {
    entity_name: raw.entityName,
    source: raw.currency === 'USD' || raw.cik10 ? 'edgar' : 'esef',
    sector: raw.sector?.provenance.detail?.replace(/^SIC:\s*/, '') ?? 'Other',
    currency: (MODELLED.has(raw.currency) ? raw.currency : 'USD') as Engine2Currency & DealFacts['currency'],
    fiscal_year: raw.fiscalYear ?? 0,
    period_end: raw.periodEnd ?? '',
    fy_revenue: revenue,
    fy_ebitda: ebitda,
    fy_ebitda_margin: revenue > 0 ? ebitda / revenue : 0,
    // §1.1 sizing basis + as-of (Class-A provenance; the UI derives the staleness tier) [G-2]
    sizing_basis: raw.basis,
    sizing_as_of: raw.as_of ?? raw.periodEnd,
    da_pct_revenue: req(raw.da_pct_revenue?.value, 'da_pct_revenue', 0.03),
    maint_capex_pct_revenue: req(raw.capex_pct_revenue?.value, 'maint_capex_pct_revenue', 0.03),
    net_ppe: raw.net_ppe?.value ?? null, // absent in the filing ⇒ §8 seeds 0 with its disclosed WARN
    operating_nwc: raw.nwc?.value ?? null,
    nwc_pct_revenue: raw.nwc_pct_revenue?.value ?? null,
    dso: raw.dso?.value ?? null,
    dio: raw.dio?.value ?? null,
    dpo: raw.dpo?.value ?? null,
    gross_debt: raw.gross_debt?.value ?? null, // display-only; honest null, never a fabricated 0 (§15)
    cash: raw.cash?.value ?? null,
    net_debt: req(raw.net_debt?.value, 'net_debt', 0), // the sizing figure — Build-gated when absent
    effective_tax_rate: raw.effective_tax_rate?.value ?? 0.21,
    nol_carryforward_floor: raw.nol_carryforward?.value ?? null,
    implied_cost_of_debt: raw.implied_cost_of_debt?.value ?? null,
    implied_trading_ev_ebitda: null, // async D5 anchor (Finnhub) is injected at the store (engine2Model), not here — this synchronous adapter sees null; the coherence gate fires once the anchor resolves
    history,
  };

  // NWC needs at least ONE usable basis (days set or %) — else it is REQUIRED.
  if (facts.nwc_pct_revenue === null && (facts.dso === null || facts.dio === null || facts.dpo === null)) {
    if (!missing.includes('nwc_pct_revenue')) missing.push('nwc_pct_revenue');
  }
  if (raw.currency_unsupported) missing.push('currency_unsupported');

  return { facts, missing, notes, templateBases };
}
