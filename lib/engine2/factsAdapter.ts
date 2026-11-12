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

import { sectorCompsFor } from '../edgar/comps';
import type { RawHistoricals } from '../edgar/types';
import type { DealFacts, HistoricalYear } from './types';
import type { Engine2Currency } from '../format';

export interface AdaptedFacts {
  facts: DealFacts;
  /** DealFacts field paths the extraction could not provide (REQUIRED ⇒ Build-gating). */
  missing: string[];
  /** Honest-degradation notes carried from extraction (days gating, FPI history, …). */
  notes: string[];
}

const MODELLED: ReadonlySet<string> = new Set(['USD', 'EUR', 'GBP', 'JPY', 'INR']);

export function adaptRawHistoricals(raw: RawHistoricals): AdaptedFacts {
  const missing: string[] = [];
  const notes: string[] = [...raw.days_notes];
  // v2.0.0: a gap stays NULL in the object itself (the types allow it since §24.2) — no
  // stand-in number is ever written, even a "never shown" one. `missing` gates Build.
  const req = (v: number | null | undefined, path: string): number | null => {
    if (v == null || !Number.isFinite(v)) {
      missing.push(path);
      return null;
    }
    return v;
  };

  if (raw.currency_unsupported) {
    notes.push(`currency ${raw.currency_unsupported} unsupported: Build blocked`);
  }

  // The combined PP&E+ROU concept is a stated fallback — surface the statement (the v2
  // screens render notes; provenance detail alone never reaches the default surface).
  if (raw.net_ppe && /right-of-use|ROU/i.test(raw.net_ppe.provenance.detail ?? '')) {
    notes.push('net PP&E includes finance-lease right-of-use assets (combined concept: the filing does not tag the pure figure)');
  }

  // D1 history → HistoricalYear rows: union of period ends across series, per-cell nulls.
  const history: HistoricalYear[] = [];
  if (raw.history) {
    const at = (metric: 'revenue' | 'ebitda' | 'capex' | 'operating_nwc', end: string): number | null =>
      raw.history![metric]?.points.find((p) => p.end === end)?.value ?? null;
    const ends = [...new Set(raw.history.revenue.points.map((p) => p.end))].sort();
    for (const end of ends) {
      history.push({
        fiscal_year: Number(end.slice(0, 4)),
        period_end: end,
        revenue: at('revenue', end),
        ebitda: at('ebitda', end),
        capex: at('capex', end),
        operating_nwc: at('operating_nwc', end), // null where a component is untagged that year — never faked
      });
    }
  }

  const revenue = req(raw.fy_revenue?.value, 'fy_revenue');
  const ebitda = req(raw.fy_ebitda?.value, 'fy_ebitda');
  if (raw.fiscalYear == null) missing.push('fiscal_year');
  if (!raw.periodEnd) missing.push('period_end');

  const facts: DealFacts = {
    entity_name: raw.entityName,
    // Producers stamp their origin; the legacy currency/CIK heuristic survives only as a
    // fallback for origin-less payloads (it mislabelled USD manual deals as 'edgar').
    source: raw.origin ?? (raw.currency === 'USD' || raw.cik10 ? 'edgar' : 'esef'),
    sector: raw.sector?.provenance.detail?.replace(/^SIC:\s*/, '') ?? 'Other',
    // §21 [v1.6.0] — the comps bucket key (the NUMERIC SIC) and the adjudicated band. Both are
    // Class-A extraction facts: DISPLAYED only, read by no engine number and no coherence flag.
    sic_code: raw.sicCode ?? null,
    sector_comps: sectorCompsFor({
      currency: (MODELLED.has(raw.currency) ? raw.currency : 'USD') as 'USD' | 'EUR' | 'GBP' | 'JPY' | 'INR',
      sicCode: raw.sicCode ?? null,
      bucketOverride: raw.sectorBucket ?? null,
    }),
    currency: (MODELLED.has(raw.currency) ? raw.currency : 'USD') as Engine2Currency & DealFacts['currency'],
    fiscal_year: raw.fiscalYear ?? null, // gated via `missing` above when absent
    period_end: raw.periodEnd ?? null,
    fy_revenue: revenue,
    fy_ebitda: ebitda,
    // §27: the forecast margin starts from the cash-basis EBITDA when the Clean step set one
    // (an add-back that continues is in the price basis, not in forecast cash flow).
    fy_ebitda_margin: (() => {
      const base = raw.forecast_ebitda === undefined ? ebitda : raw.forecast_ebitda?.value ?? null;
      return revenue !== null && base !== null && revenue > 0 ? base / revenue : null;
    })(),
    // §1.1 sizing basis + as-of (Class-A provenance; the UI derives the staleness tier) [G-2]
    sizing_basis: raw.basis,
    sizing_as_of: raw.as_of ?? raw.periodEnd,
    da_pct_revenue: req(raw.da_pct_revenue?.value, 'da_pct_revenue'),
    maint_capex_pct_revenue: req(raw.capex_pct_revenue?.value, 'maint_capex_pct_revenue'),
    net_ppe: raw.net_ppe?.value ?? null, // absent in the filing ⇒ §8 seeds 0 with its disclosed WARN
    operating_nwc: raw.nwc?.value ?? null,
    nwc_pct_revenue: raw.nwc_pct_revenue?.value ?? null,
    dso: raw.dso?.value ?? null,
    dio: raw.dio?.value ?? null,
    dpo: raw.dpo?.value ?? null,
    gross_debt: raw.gross_debt?.value ?? null, // display-only; honest null, never a fabricated 0 (§15)
    cash: raw.cash?.value ?? null,
    net_debt: req(raw.net_debt?.value, 'net_debt'), // Build-gated when absent
    // A rate the filing does not give is NULL — no statutory stand-in (the mappers emit null).
    effective_tax_rate: raw.effective_tax_rate?.value ?? null,
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

  return { facts, missing, notes };
}
