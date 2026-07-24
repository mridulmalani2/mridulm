/**
 * Compose a draft ModelState from extracted RawHistoricals + assumptions (Phase 1).
 *
 * This is the bridge between the auditable import flow and the engine. It seeds the FACTUAL
 * inputs from filings (each tagged with EDGAR provenance) and the FORWARD/STRUCTURE inputs from
 * sector defaults (tagged 'default', ready to be AI-suggested or user-edited on the review
 * screen). A field with no filing value is left at a neutral default and recorded so the review
 * screen can flag it — never silently treated as fact. The output is a ready-to-recalc draft;
 * the user reviews/edits it, then Build runs fullRecalc.
 */

import type { ModelState } from '../dealEngineTypes';
import { createDefaultModelState } from '../engine/modelState';
import type { RawHistoricals, SourcedValue, Provenance, ProvenanceMap } from './types';
import { missingProv } from './types';

/** Sector starting points for the FORWARD assumptions (not facts). */
export interface SectorDefault {
  entryMultiple: number;        // EV/EBITDA paid at entry (sector-typical)
  growthRates: number[];        // 5y revenue growth path
  marginExpansion: number;      // base → target EBITDA-margin lift over the hold
  leverage: number;             // entry net leverage (×EBITDA) → drives the tranche sizing
  seniorRate: number;           // senior coupon
  exitMultipleAdj: number;      // exit vs entry multiple delta
}

export const SECTOR_DEFAULTS: Record<string, SectorDefault> = {
  Technology:           { entryMultiple: 14, growthRates: [0.12, 0.10, 0.08, 0.07, 0.06], marginExpansion: 0.06, leverage: 4.5, seniorRate: 0.060, exitMultipleAdj:  0.0 },
  Healthcare:           { entryMultiple: 12, growthRates: [0.08, 0.07, 0.07, 0.06, 0.06], marginExpansion: 0.04, leverage: 4.0, seniorRate: 0.055, exitMultipleAdj: -0.5 },
  Industrials:          { entryMultiple: 9,  growthRates: [0.05, 0.05, 0.04, 0.04, 0.04], marginExpansion: 0.03, leverage: 3.5, seniorRate: 0.055, exitMultipleAdj: -1.0 },
  Consumer:             { entryMultiple: 10, growthRates: [0.06, 0.05, 0.05, 0.04, 0.04], marginExpansion: 0.03, leverage: 3.5, seniorRate: 0.055, exitMultipleAdj: -0.5 },
  'Financial Services': { entryMultiple: 10, growthRates: [0.07, 0.06, 0.06, 0.05, 0.05], marginExpansion: 0.03, leverage: 3.0, seniorRate: 0.065, exitMultipleAdj:  0.0 },
  'Real Estate':        { entryMultiple: 12, growthRates: [0.04, 0.04, 0.04, 0.03, 0.03], marginExpansion: 0.03, leverage: 5.0, seniorRate: 0.050, exitMultipleAdj:  0.0 },
  Energy:               { entryMultiple: 7,  growthRates: [0.04, 0.04, 0.03, 0.03, 0.03], marginExpansion: 0.02, leverage: 3.5, seniorRate: 0.065, exitMultipleAdj: -1.0 },
  'Business Services':  { entryMultiple: 11, growthRates: [0.08, 0.07, 0.07, 0.06, 0.05], marginExpansion: 0.04, leverage: 4.0, seniorRate: 0.055, exitMultipleAdj: -0.5 },
  Other:                { entryMultiple: 10, growthRates: [0.06, 0.06, 0.05, 0.05, 0.04], marginExpansion: 0.03, leverage: 4.0, seniorRate: 0.060, exitMultipleAdj: -0.5 },
};

export const sectorDefault = (sector: string): SectorDefault => SECTOR_DEFAULTS[sector] ?? SECTOR_DEFAULTS.Other;

/** Map an EDGAR `sicDescription` (free text) onto one of the engine's sector buckets. */
export function inferSector(sic?: string): string {
  if (!sic) return 'Other';
  const s = sic.toLowerCase();
  if (/(software|semiconductor|computer|internet|technolog|electronic)/.test(s)) return 'Technology';
  if (/(pharm|biotech|health|medical|hospital|drug)/.test(s)) return 'Healthcare';
  if (/(bank|insurance|financ|invest|capital|credit)/.test(s)) return 'Financial Services';
  if (/(real estate|reit|property)/.test(s)) return 'Real Estate';
  if (/(oil|gas|energy|petroleum|mining|coal)/.test(s)) return 'Energy';
  if (/(retail|consumer|food|beverage|apparel|restaurant)/.test(s)) return 'Consumer';
  if (/(service|consult|staffing|advertis)/.test(s)) return 'Business Services';
  if (/(manufactur|industrial|machinery|aerospace|construction|chemical)/.test(s)) return 'Industrials';
  return 'Other';
}

/** The factual inputs a user types on the manual-entry screen — the SAME surface the 10-K/EDGAR
 *  mapper extracts, just sourced by hand. Decimals for rates/margins. */
export interface ManualFactsInput {
  dealName: string;
  sector: string;
  currency: ModelState['currency'];
  ltmRevenue: number;
  ebitdaMargin: number;      // decimal (0.25 = 25%)
  daPctRevenue: number;      // decimal
  capexPctRevenue: number;   // decimal
  nwcPctRevenue: number;     // decimal
  netDebt: number;
  taxRate: number;           // decimal
  nol?: number;
}

/**
 * Build a RawHistoricals from manually-entered facts (Phase 1) — identical SHAPE to what
 * `mapCompanyFacts` produces, with every value tagged 'user' provenance. This is what unifies
 * the manual and EDGAR routes: both yield a RawHistoricals that flows through the SAME
 * draftModelFromHistoricals → assumptions review → model. Zero divergence.
 */
export function manualHistoricals(inp: ManualFactsInput): RawHistoricals {
  const userProv = (label: string): Provenance => ({ source: 'user', detail: `Manually entered — ${label}` });
  const sv = (value: number, label: string): SourcedValue => ({ value, provenance: userProv(label) });
  const rev = inp.ltmRevenue;
  return {
    entityName: inp.dealName,
    currency: inp.currency,
    basis: 'FY',
    fy_revenue: sv(rev, 'FY revenue'),
    fy_ebitda: sv(rev * inp.ebitdaMargin, 'EBITDA'),
    ebitda_margin: sv(inp.ebitdaMargin, 'EBITDA margin'),
    da: sv(rev * inp.daPctRevenue, 'D&A'),
    da_pct_revenue: sv(inp.daPctRevenue, 'D&A %'),
    capex: sv(rev * inp.capexPctRevenue, 'Capex'),
    capex_pct_revenue: sv(inp.capexPctRevenue, 'Capex %'),
    nwc: sv(rev * inp.nwcPctRevenue, 'NWC'),
    nwc_pct_revenue: sv(inp.nwcPctRevenue, 'NWC %'),
    gross_debt: null,
    cash: null,
    net_debt: sv(inp.netDebt, 'Net debt at entry'),
    net_ppe: null, // manual entry has no PP&E field — engine2 §8 seeds 0 with its disclosed note
    effective_tax_rate: sv(inp.taxRate, 'Effective tax rate'),
    nol_carryforward: inp.nol && inp.nol > 0 ? sv(inp.nol, 'NOL carryforward') : null,
    sector: { value: 0, provenance: userProv('Sector') },
    gaps: [],
    dso: null,
    dio: null,
    dpo: null,
    cogs: null,
    days_notes: [],
  };
}

export interface DraftOptions {
  dealName?: string;
  sector?: string;            // engine sector bucket (else inferred from raw.sector / Other)
  currency?: ModelState['currency'];  // default 'USD' (override on the review screen)
  holdingPeriod?: number;     // default 5
}

export interface DraftModel {
  state: ModelState;
  provenance: ProvenanceMap;
}

/** The factual ModelState fields that come from filings (everything else is an assumption). */
export const FACTUAL_FIELD_PATHS = [
  'revenue.base_revenue',
  'margins.base_ebitda_margin',
  'margins.da_pct_revenue',
  'margins.capex_pct_revenue',
  'margins.nwc_pct_revenue',
  'entry.net_debt_at_entry',
  'tax.tax_rate',
  'tax.nol_carryforward',
] as const;

const defaultProv = (detail: string): Provenance => ({ source: 'default', detail });

/**
 * Build a draft ModelState + provenance map from extracted historicals. Factual fields carry
 * their EDGAR provenance (or a 'user' gap when the filing was silent); forward/structure fields
 * carry 'default' (sector starting point) until edited or AI-suggested.
 */
export function draftModelFromHistoricals(raw: RawHistoricals, opts: DraftOptions = {}): DraftModel {
  const sector = opts.sector ?? inferSector(raw.sector?.provenance.detail) ?? 'Other';
  const sd = sectorDefault(sector);
  const hp = opts.holdingPeriod ?? 5;
  const s = createDefaultModelState();
  const prov: ProvenanceMap = {};

  s.deal_name = opts.dealName ?? raw.entityName ?? 'Imported Deal';
  // Reporting currency detected from the filing (USD for most EDGAR; EUR/GBP/… for foreign
  // filers), with a visible override on the review screen. Falls back to USD.
  s.currency = opts.currency ?? (raw.currency as ModelState['currency']) ?? 'USD';
  // D6 currency honesty: a real reporting currency OUTSIDE the modelled set BLOCKS Build
  // (the meta 'missing' entry trips the store gate) — never a silent USD fallback.
  if (raw.currency_unsupported) {
    prov['meta.currency_unsupported'] = {
      source: 'missing',
      detail: `Reporting currency ${raw.currency_unsupported} is not supported — the engine models USD, EUR, GBP, JPY, INR. Convert the inputs or wait for multi-currency (Phase G).`,
    };
  }
  s.sector = sector;
  s.company_description = `Imported from SEC EDGAR${raw.fiscalYear ? ` · FY${raw.fiscalYear}` : ''}.`;

  // ── Factual inputs (from filings) ──
  // A field the filing genuinely lacks gets a NEUTRAL placeholder in ModelState (so fullRecalc /
  // the live preview can still compute) but is tagged provenance 'missing' — the review screen
  // renders it as an EMPTY input with a red MISSING badge. It is NEVER tagged 'user' (which would
  // imply the user typed it) and the placeholder is never shown. Editing it flips the source to
  // 'user' via the store.
  const setFactual = (path: string, target: { set: (v: number) => void }, sv: SourcedValue | null, gapLabel: string, placeholder: number) => {
    if (sv) { target.set(sv.value); prov[path] = sv.provenance; }
    else { target.set(placeholder); prov[path] = missingProv(gapLabel); if (!raw.gaps.includes(gapLabel)) raw.gaps.push(gapLabel); }
  };

  setFactual('revenue.base_revenue', { set: (v) => { s.revenue.base_revenue = v; } }, raw.fy_revenue, 'FY revenue', 100);
  setFactual('margins.base_ebitda_margin', { set: (v) => { s.margins.base_ebitda_margin = v; } }, raw.ebitda_margin, 'EBITDA margin', 0.2);
  setFactual('margins.da_pct_revenue', { set: (v) => { s.margins.da_pct_revenue = v; } }, raw.da_pct_revenue, 'D&A %', 0.03);
  setFactual('margins.capex_pct_revenue', { set: (v) => { s.margins.capex_pct_revenue = v; } }, raw.capex_pct_revenue, 'Capex %', 0.03);
  setFactual('margins.nwc_pct_revenue', { set: (v) => { s.margins.nwc_pct_revenue = v; } }, raw.nwc_pct_revenue, 'NWC %', 0.1);
  setFactual('entry.net_debt_at_entry', { set: (v) => { s.entry.net_debt_at_entry = v; } }, raw.net_debt, 'Net debt at entry', 0);
  setFactual('tax.tax_rate', { set: (v) => { s.tax.tax_rate = v; } }, raw.effective_tax_rate, 'Effective tax rate', 0.25);
  if (raw.nol_carryforward) { s.tax.nol_carryforward = raw.nol_carryforward.value; prov['tax.nol_carryforward'] = raw.nol_carryforward.provenance; }
  else { s.tax.nol_carryforward = 0; prov['tax.nol_carryforward'] = defaultProv('No NOL disclosed → 0'); }

  // ── Forward / structure assumptions (sector defaults; provenance 'default') ──
  const baseMargin = s.margins.base_ebitda_margin;
  s.revenue.growth_rates = [...sd.growthRates].slice(0, hp);
  prov['revenue.growth_rates'] = defaultProv(`${sector} sector default growth path`);
  s.margins.target_ebitda_margin = Math.min(baseMargin + sd.marginExpansion, 0.6);
  prov['margins.target_ebitda_margin'] = defaultProv(`Base + ${(sd.marginExpansion * 100).toFixed(0)}pp ${sector} expansion`);
  s.margins.margin_trajectory = 'linear';
  prov['margins.margin_trajectory'] = defaultProv('Linear margin ramp');

  s.entry.entry_valuation_driver = 'multiple';
  s.entry.entry_ebitda_multiple = sd.entryMultiple;
  prov['entry.entry_ebitda_multiple'] = defaultProv(`${sector} sector-typical entry multiple`);
  s.entry.entry_ebitda_basis = 'ltm';

  // Capital structure from sector leverage: a 2-tranche default (TLA amortising + TLB sweep).
  const ebitda = s.revenue.base_revenue * baseMargin;
  const totalDebt = Math.max(0, ebitda * sd.leverage);
  s.entry.leverage_ratio = sd.leverage;
  s.debt_tranches = [
    { name: 'Senior Term Loan A', tranche_type: 'senior', principal: Math.round(totalDebt * 0.6 * 10) / 10, interest_rate: sd.seniorRate, rate_type: 'fixed', base_rate: 0, spread: 0, amortization_type: 'straight_line', amortization_schedule: [], pik_rate: 0, cash_interest: true, commitment_fee: 0, floor: 0, cash_sweep_pct: 0 },
    { name: 'Senior Term Loan B', tranche_type: 'senior', principal: Math.round(totalDebt * 0.4 * 10) / 10, interest_rate: sd.seniorRate + 0.02, rate_type: 'fixed', base_rate: 0, spread: 0, amortization_type: 'bullet', amortization_schedule: [], pik_rate: 0, cash_interest: true, commitment_fee: 0, floor: 0, cash_sweep_pct: 0.5 },
  ];
  prov['debt_tranches'] = defaultProv(`${sd.leverage.toFixed(1)}× ${sector} leverage, TLA/TLB split`);

  s.exit.holding_period = hp;
  prov['exit.holding_period'] = defaultProv('5-year hold');
  s.exit.exit_ebitda_multiple = Math.max(1, sd.entryMultiple + sd.exitMultipleAdj);
  prov['exit.exit_ebitda_multiple'] = defaultProv(`Entry ${sd.exitMultipleAdj >= 0 ? '+' : ''}${sd.exitMultipleAdj} turn(s) at exit`);
  s.exit.exit_ebitda_basis = 'ltm';
  s.exit.exit_method = 'secondary_buyout';

  prov['fees.entry_fee_pct'] = defaultProv('Standard 2% entry advisory fee');
  prov['fees.exit_fee_pct'] = defaultProv('Standard 1.5% exit fee');
  prov['fees.financing_fee_pct'] = defaultProv('Standard 2% financing fee');
  prov['mip.mip_pool_pct'] = defaultProv('15% management incentive pool');
  prov['credit_covenants.leverage_covenant'] = defaultProv('6.0× leverage covenant');

  return { state: s, provenance: prov };
}
