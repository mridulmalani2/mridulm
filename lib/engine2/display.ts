/**
 * engine2/display.ts — the DISPLAY-DERIVATION single-source layer.
 *
 * Display-only derived numbers (the entry/exit multiples) computed ONCE here, so every render
 * surface (OutputTabs, excelExport, memo) imports the one definition instead of reconstructing it.
 * This module is OFF the ENGINE ARITHMETIC PATH by design (tier-governance sign-off round 4): it
 * does no engine arithmetic — it reads existing `ModelOutput` fields and formats a display value —
 * so a diff here never means "engine arithmetic changed," keeping the source-containment fence's
 * `facade.ts` signal clean. It is IN the DISPLAY-SURFACE SET (walked by the governance guard), and
 * is the single-source HOME the FORBIDDEN_INLINE registry points render surfaces at (they may not
 * reconstruct these ratios inline; they import from here). Provenance for each number is pinned by a
 * value-provenance test (engine2-facade-scenarios).
 */
import type { Engine2ModelOutput } from './facade';

/**
 * §11 display helper — the entry multiple's BASIS, and the FY/LTM-canonical figure to show
 * alongside it under an NTM entry. `derived.entry_multiple` is the multiple on the
 * VALUATION basis: EV ÷ FY EBITDA when `entry.basis === 'fy'`, but EV ÷ (FY × (1 + growth[0]))
 * when `basis === 'ntm'` (§9). Labelling it "(FY)" unconditionally is therefore FALSE for an
 * NTM entry — and §11 states that "leverage sizing and every covenant test use FY(LTM)
 * EBITDA even when the valuation basis is NTM … if entry is NTM-based the UI shows both, LTM
 * canonical." This returns the data every displayed surface needs to obey that: the basis
 * label, the valuation multiple, and the FY-canonical multiple (EV ÷ `entry_ebitda_for_sizing`,
 * the §1.1 FY(LTM) sizing basis) — `fy_canonical` is null under an FY entry, where the two
 * coincide and only one line is shown (byte-identical to before for every FY deal). Pure display
 * LOGIC, not arithmetic: both numbers are already fully determined by existing `derived` fields,
 * so this introduces no second calculation path for any engine value.
 */
/**
 * The SIZING basis label ('FY' or the §1.1 'LTM' quarter-stitch) — the ONE place this string is
 * decided, so no surface hardcodes "FY EBITDA" against a fact that is actually the LTM stitch (the
 * mislabel class that hit v1.1.2's "Entry net leverage" and v1.1.3's "Entry multiple (FY)"). Read
 * off `DealFacts.sizing_basis`; default 'FY' (manual entry / pre-G-2). Distinct from the VALUATION
 * basis (FY vs NTM) returned by `entryMultipleDisplay.basis_label`.
 */
export const sizingBasisLabel = (b?: 'FY' | 'LTM'): 'FY' | 'LTM' => (b === 'LTM' ? 'LTM' : 'FY');

export function entryMultipleDisplay(o: Pick<Engine2ModelOutput, 'derived' | 'assumptions' | 'facts'>): {
  basis_label: 'FY' | 'NTM';
  sizing_label: 'FY' | 'LTM';
  valuation: number;
  fy_canonical: number | null;
} {
  const ntm = o.assumptions.entry.basis === 'ntm';
  return {
    basis_label: ntm ? 'NTM' : 'FY',
    // the leverage / FY-canonical figures size on entry_ebitda_for_sizing = the §1.1 sizing basis
    sizing_label: sizingBasisLabel(o.facts.sizing_basis),
    valuation: o.derived.entry_multiple,
    // §24.2: a forecast-only case has no FY/LTM EBITDA, so no canonical figure — null, never a sentinel.
    fy_canonical: ntm && o.derived.entry_ebitda_for_sizing !== null ? o.derived.enterprise_value / o.derived.entry_ebitda_for_sizing : null,
  };
}

/**
 * The operating chart's series, decided by the DATA of the deal in front of it: revenue is drawn
 * whenever the deal carries any revenue figure (a sourced historical year, or a forecast revenue
 * line of any kind), and left out only when it has none at all (SPEC §24: a case may state EBIT /
 * EBITDA without revenue). One rule for every deal; nothing is keyed to a particular case.
 */
export function operatingChartSeries(o: Pick<Engine2ModelOutput, 'facts' | 'operating'>): {
  rows: { period: string; Revenue: number | null; EBITDA: number | null }[];
  has_revenue: boolean;
  has_history: boolean;
  title: 'Revenue and EBITDA' | 'EBITDA';
  note: string;
} {
  const history = o.facts.history.map((h) => ({ period: `FY${h.fiscal_year}`, Revenue: h.revenue, EBITDA: h.ebitda }));
  const forecast = o.operating.map((y, i) => ({ period: `Year ${i + 1}`, Revenue: y.revenue, EBITDA: y.ebitda }));
  const rows = [...history, ...forecast];
  const has_revenue = rows.some((r) => r.Revenue !== null && r.Revenue !== undefined);
  const has_history = history.length > 0;
  const span = has_history ? 'history as adjusted, then the forecast' : 'the forecast';
  return {
    rows, has_revenue, has_history,
    title: has_revenue ? 'Revenue and EBITDA' : 'EBITDA',
    note: has_revenue ? span : `${span} · revenue is not modelled in this deal`,
  };
}

/**
 * Entry GROSS leverage for the headline tiles. The §11 figure is debt at par ÷ the FY/LTM sizing
 * EBITDA (`derived.entry_gross_leverage_fy`). A forecast-only case (§24.2) has no historical
 * EBITDA, so that figure is null; such a case is necessarily priced on forecast year-1 EBITDA
 * (§24.3 R4), and the same debt over THAT EBITDA is shown instead, labelled as such. Both
 * operands are existing `derived` fields: no second calculation path, and never a sentinel.
 */
export function entryLeverageDisplay(o: Pick<Engine2ModelOutput, 'derived' | 'assumptions' | 'facts'>): {
  value: number | null;
  basis_label: 'FY' | 'LTM' | 'forecast year-1';
} {
  const fy = o.derived.entry_gross_leverage_fy;
  if (fy !== null) return { value: fy, basis_label: sizingBasisLabel(o.facts.sizing_basis) };
  if (o.assumptions.entry.basis === 'ntm' && o.derived.entry_ebitda_for_valuation > 0) {
    return { value: o.derived.total_debt_at_par / o.derived.entry_ebitda_for_valuation, basis_label: 'forecast year-1' };
  }
  return { value: null, basis_label: sizingBasisLabel(o.facts.sizing_basis) };
}

/**
 * §9 display helper — the exit EV/EBITDA multiple, single-sourced. `exit_ev` is built as
 * `assumptions.exit.multiple × exit_ebitda_basis_value` (exit.ts), so this ratio recovers the
 * exit multiple exactly; expressing it once here — rather than inline in OutputTabs, excelExport
 * AND memo (three copies before this) — removes the drift risk of a derived number reconstructed
 * on three surfaces. Its provenance is pinned by test (== `assumptions.exit.multiple`). Returns a
 * finite number for every well-formed model (basis EBITDA > 0 by §9); a degenerate ≤0 basis is an
 * upstream invariant breach, not something this display layer silently papers over.
 */
export function exitMultipleDisplay(o: Pick<Engine2ModelOutput, 'exit'>): number {
  return o.exit.exit_ev / o.exit.exit_ebitda_basis_value;
}

/**
 * A run carrying a BLOCK-severity coherence flag (a cash-floor breach with the revolver
 * exhausted, a non-positive sponsor plug) is not economically meaningful (§3 step 6, §2): every
 * HEADLINE return surface (the Summary tiles, the Build line, the IC memo) withholds its figures
 * as "N/M" and points at the warning; the detail tabs keep every number for diagnosis.
 */
export function headlineNotMeaningful(o: Pick<Engine2ModelOutput, 'coherence'>): boolean {
  return o.coherence.some((f) => f.severity === 'block');
}

/**
 * What the sellers receive, read off the purchase price: enterprise value less the net debt the
 * buyer takes on (the ADJUSTED net debt when the deal came through the Clean step). The engine
 * prices the enterprise, so net debt never moves the sponsor's returns — it moves this number.
 * Per-share and premium figures exist only when a verified quote is attached (a domestic USD
 * 10-K filer); otherwise they are null, never estimated. Display only.
 */
export function impliedEquityDisplay(o: Pick<Engine2ModelOutput, 'derived' | 'facts'>): {
  enterprise_value: number;
  net_debt: number | null;
  equity_value: number | null;
  per_share: number | null;
  /** equity value ÷ current market capitalisation − 1 */
  premium_to_market: number | null;
} {
  const nd = o.facts.net_debt;
  const equity = nd === null ? null : o.derived.enterprise_value - nd;
  const n = o.facts.normalisation ?? null;
  const shares = n?.shares_millions ?? null;
  const mcap = n?.market_cap ?? null;
  return {
    enterprise_value: o.derived.enterprise_value,
    net_debt: nd,
    equity_value: equity,
    per_share: equity !== null && shares !== null && shares > 0 ? equity / shares : null,
    premium_to_market: equity !== null && mcap !== null && mcap > 0 ? equity / mcap - 1 : null,
  };
}

/**
 * How far EBITDA can fall before a maximum-net-leverage covenant is breached, holding that
 * year's net debt as modelled: leverage is net debt ÷ EBITDA, so the test is met until EBITDA
 * falls by 1 − leverage ÷ level. Null when either figure is absent or not positive (a net-cash
 * year has no leverage to breach with). Display only; both operands are existing fields
 * (`credit[t].net_leverage` and the covenant level entered for that year).
 */
export function covenantEbitdaCushion(netLeverage: number | null, level: number | null): number | null {
  if (netLeverage === null || level === null || !(level > 0) || !(netLeverage > 0)) return null;
  return 1 - netLeverage / level;
}
