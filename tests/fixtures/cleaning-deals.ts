/**
 * Deals that came through the Clean step, for the workbook parity suite. Each is built through
 * the REAL stores (store/cleaning → store/engine2Model.applyCleaned), so the facts carry the
 * same `normalisation` record the app exports.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import type { CompanyFacts } from '../../lib/edgar/client';
import { mapCompanyFacts } from '../../lib/edgar/mapXbrl';
import { manualHistoricals } from '../../lib/edgar/buildModel';
import { buildStatementPack } from '../../lib/statements/pack';
import type { StatementPack } from '../../lib/statements/types';
import type { RawHistoricals } from '../../lib/edgar/types';
import { acceptCandidate, addAdjustment, fillNilElsewhere, setLeaseChoice, setOverride, updateAdjustment } from '../../lib/cleaning/ops';
import type { CleaningLedger } from '../../lib/cleaning/types';
import type { DealAssumptions, DealFacts } from '../../lib/engine2/types';
import { cleaningStore } from '../../store/cleaning';
import { engine2Store } from '../../store/engine2Model';
import { enteredAssumptions } from './entered-deal';

const FY = '2023-12-31';
const PRIOR = '2022-12-31';
const OPTS = { asOfDate: '2024-06-30', sicCode: '3711' };

const fact = (end: string, valM: number, duration: boolean) => ({
  ...(duration ? { start: `${end.slice(0, 4)}-01-01` } : {}),
  end, val: valM * 1e6, accn: `0001000000-${Number(end.slice(2, 4)) + 1}-000010`, fy: Number(end.slice(0, 4)), fp: 'FY', form: '10-K', filed: `${Number(end.slice(0, 4)) + 1}-02-15`,
});
export function richCompanyFacts(): CompanyFacts {
  const f: CompanyFacts = JSON.parse(readFileSync(join(__dirname, 'companyfacts-sample.json'), 'utf8'));
  const add = (tag: string, rows: [string, number][], duration: boolean) => {
    f.facts['us-gaap'][tag] = { units: { USD: rows.map(([end, v]) => fact(end, v, duration)) } };
  };
  add('RestructuringCharges', [[PRIOR, 10], [FY, 20]], true);
  add('ShareBasedCompensation', [[FY, 12]], true);
  add('GainLossOnDispositionOfAssets1', [[FY, 5]], true);
  add('FinanceLeaseLiabilityNoncurrent', [[FY, 30]], false);
  add('FinanceLeaseLiabilityCurrent', [[FY, 5]], false);
  add('OperatingLeaseLiability', [[FY, 60]], false);
  add('PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent', [[FY, 25]], false);
  add('RestrictedCashAndCashEquivalents', [[FY, 8]], false);
  return f;
}

function northwind(): { raw: RawHistoricals; pack: StatementPack } {
  const facts = richCompanyFacts();
  const raw = mapCompanyFacts(facts, OPTS);
  return { raw, pack: buildStatementPack({ raw, rawExLeases: mapCompanyFacts(facts, { ...OPTS, includeFinanceLeasesInDebt: false }), gaap: 'us-gaap', facts }) };
}
function manualLtm(): { raw: RawHistoricals; pack: StatementPack } {
  const raw = manualHistoricals({
    dealName: 'Manual LTM Co', sector: 'Industrials', currency: 'EUR', basis: 'LTM', ltm: { asOf: '2024-06-30', revenue: 1300, ebitda: 270 },
    years: [{ end: PRIOR, revenue: 1150, ebitda: 224.25, da: 57.5, capex: 46 }, { end: FY, revenue: 1250, ebitda: 250, da: 62.5, capex: 50 }],
    nwc: 105, grossDebt: 335, cash: 80, netDebt: null, netPpe: 400, taxRate: 0.25, nol: null,
  });
  return { raw, pack: buildStatementPack({ raw, rawExLeases: null, gaap: 'unknown' }) };
}

/** Run a deal through the stores and return the facts the model (and the export) reads. */
function through(src: { raw: RawHistoricals; pack: StatementPack }, edit: (l: CleaningLedger, pack: StatementPack) => CleaningLedger, asReported = false): DealFacts {
  cleaningStore.getState().load(src.raw, src.pack);
  cleaningStore.getState().edit((l) => stops(edit(l, src.pack)));
  if (asReported) cleaningStore.getState().useAsReported();
  else if (!cleaningStore.getState().confirmAdjusted()) {
    throw new Error(`cleaning fixture has open items: ${cleaningStore.getState().flags.filter((f) => f.severity === 'block').map((f) => f.message).join(' | ')}`);
  }
  const facts = engine2Store.getState().facts!;
  cleaningStore.getState().reset();
  engine2Store.getState().reset();
  return facts;
}

/** The analyst marks every EBITDA add-back not yet decided as a cost that STOPS (§27 'gone'). */
export const stops = (l: CleaningLedger): CleaningLedger =>
  ({ ...l, adjustments: l.adjustments.map((a) => (a.target === 'ebitda' && a.forecast === null ? { ...a, forecast: 'gone' as const } : a)) });

const row = (l: CleaningLedger, target: 'ebitda' | 'revenue', label: string, amounts: Record<string, number>) => {
  const next = addAdjustment(l, target);
  return updateAdjustment(next, next.adjustments[next.adjustments.length - 1].id, { label, amounts, category: 'pro_forma' });
};

export function cleaningCases(): Record<string, { facts: DealFacts; assumptions: DealAssumptions }> {
  const assumptions = (name: string) => enteredAssumptions(5, { deal_name: name });
  return {
    // several adjustments across categories, a restated cell, a revenue row, all leases as debt,
    // a debt-like and a cash-like item; FY2022 has an amount NOT ENTERED (must read n/a, not a number)
    CLEAN_ADJUSTED: {
      facts: through(northwind(), (l0, pack) => {
        let l = l0;
        for (const tag of ['RestructuringCharges', 'ShareBasedCompensation', 'GainLossOnDispositionOfAssets1', 'PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent', 'RestrictedCashAndCashEquivalents']) {
          l = acceptCandidate(l, pack.candidates.find((c) => c.tag === tag)!);
        }
        l = fillNilElsewhere(l, l.adjustments[0].id, pack); // restructuring: explicit nil in FY2021
        l = setOverride(l, 'operating_income', FY, 190, 'reclassified a one-off cost');
        l = row(l, 'revenue', 'Discontinued contract', { [FY]: -50, [PRIOR]: -40, '2021-12-31': -30 });
        return setLeaseChoice(l, 'all');
      }),
      assumptions: assumptions('Clean adjusted'),
    },
    // §27: share-based pay CONTINUES — in the price basis (282.0), not in the forecast base (270.0)
    CLEAN_CONTINUES: {
      facts: through(northwind(), (l0, pack) => {
        let l = acceptCandidate(l0, pack.candidates.find((c) => c.tag === 'RestructuringCharges')!);
        l = acceptCandidate(l, pack.candidates.find((c) => c.tag === 'ShareBasedCompensation')!);
        l = updateAdjustment(l, l.adjustments[1].id, { forecast: 'continues' });
        return setLeaseChoice(l, 'finance');
      }),
      assumptions: assumptions('Clean continues'),
    },
    // the analyst's explicit "use as reported": the sheet exists and says so
    CLEAN_AS_REPORTED: {
      facts: through(northwind(), (l) => row(l, 'ebitda', 'Ignored row', { [FY]: 40 }), true),
      assumptions: assumptions('Clean as reported'),
    },
    // LTM sizing: the model reads the LTM column, not the fiscal year
    CLEAN_LTM: {
      facts: through(manualLtm(), (l) => row(l, 'ebitda', 'Run-rate saving', { [FY]: 20, LTM: 15 })),
      assumptions: assumptions('Clean LTM'),
    },
  };
}
