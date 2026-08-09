/**
 * §21.5b/§21.11(viii)(xi) — the comps band END TO END, through the REAL producer chain.
 *
 * Why this file exists: the step-3 accuracy audit found that EVERY threading mutant survived
 * the whole suite — `sector_comps: null` in factsAdapter, `sicCode: null` in either mapper,
 * `store/dealEngine` dropping the argument — because `comps-selection.test.ts` calls
 * `compsBucket`/`sectorCompsFor` DIRECTLY and nothing ran the chain
 * `mapCompanyFacts(...) → adaptRawHistoricals(...) → DealFacts.sector_comps`. The feature could
 * be amputated with CI green [audit B1/B2/B5]. These fixtures make that impossible.
 *
 * MUTANTS (each run RED, then reverted): T1 `mapCompanyFactsIfrs` → `sicCode: null`;
 * T2 `mapXbrl` → `sicCode: null`; T3 `factsAdapter` → `sic_code: null`; T4 `factsAdapter` →
 * `sector_comps: null`; T6 `factsAdapter` → `bucketOverride: null`; B2 `buildModel` dropping
 * `sectorBucket`.
 */
import { describe, it, expect } from 'vitest';
import { adaptRawHistoricals } from '../lib/engine2/factsAdapter';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import { mapCompanyFactsIfrs } from '../lib/edgar/mapCompanyFactsIfrs';
import { manualHistoricals } from '../lib/edgar/buildModel';
import type { CompanyFacts } from '../lib/edgar/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const M = 1_000_000;
const fy = (start: string, end: string, val: number, filed = '2026-02-15') => ({
  start, end, val: val * M, fy: Number(end.slice(0, 4)), fp: 'FY', form: '10-K', filed, accn: `a-${filed}`,
});
const inst = (end: string, val: number, filed = '2026-02-15') => ({
  end, val: val * M, fy: Number(end.slice(0, 4)), fp: 'FY', form: '10-K', filed, accn: `a-${filed}`,
});

/** A minimal but REAL companyfacts payload — the same shape the EDGAR route produces. */
const FIXTURE: CompanyFacts = {
  cik: 40, entityName: 'Wiring Test Inc',
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [fy('2025-01-01', '2025-12-31', 1020)] } },
      OperatingIncomeLoss: { units: { USD: [fy('2025-01-01', '2025-12-31', 200)] } },
      DepreciationDepletionAndAmortization: { units: { USD: [fy('2025-01-01', '2025-12-31', 40)] } },
      PropertyPlantAndEquipmentNet: { units: { USD: [inst('2025-12-31', 300)] } },
    },
  },
} as unknown as CompanyFacts;

describe('§21.5b — the EDGAR route carries the SIC end to end (the feature cannot be amputated silently)', () => {
  it('a REIT (SIC 6798) reaches DealFacts as the Real Estate band, through the real chain', () => {
    const { facts } = adaptRawHistoricals(mapCompanyFacts(FIXTURE, { sicCode: '6798', sicDescription: 'Real Estate Investment Trusts' }));
    expect(facts.sic_code).toBe('6798');            // T2/T3 kill: the code survives the mappers
    expect(facts.sector_comps).not.toBeNull();      // T4 kill: the band is actually attached
    expect(facts.sector_comps!.bucket).toBe('Real Estate');
    expect(facts.sector_comps!.region).toBe('US');
    expect([facts.sector_comps!.low, facts.sector_comps!.median, facts.sector_comps!.high]).toEqual([19.87, 19.87, 19.87]);
    // and `facts.sector` still carries the raw SIC DESCRIPTION, untouched (§21.5)
    expect(facts.sector).toBe('Real Estate Investment Trusts');
  });

  it('a manufacturer (SIC 3711) reaches the Industrials band — a DIFFERENT bucket, so the join is real', () => {
    const { facts } = adaptRawHistoricals(mapCompanyFacts(FIXTURE, { sicCode: '3711' }));
    expect(facts.sector_comps!.bucket).toBe('Industrials');
    expect([facts.sector_comps!.low, facts.sector_comps!.median, facts.sector_comps!.high]).toEqual([11.39, 15.61, 17.18]);
  });

  it('no SIC at all ⇒ sic_code null AND sector_comps null — the honest unavailable state', () => {
    const { facts } = adaptRawHistoricals(mapCompanyFacts(FIXTURE, {}));
    expect(facts.sic_code).toBeNull();
    expect(facts.sector_comps).toBeNull();
  });
});

describe('§21.11(viii) — the MANUAL route: the dropdown IS the bucket (audit B2 — this was a dead wire)', () => {
  const manual = (sector: string, currency: 'USD' | 'GBP' = 'USD') =>
    adaptRawHistoricals(manualHistoricals({
      dealName: 'Manual Co', sector, currency, basis: 'FY', ltm: null,
      years: [{ end: '2025-12-31', revenue: 1000, ebitda: 250, da: 40, capex: 30 }],
      nwc: 100, grossDebt: 0, cash: 0, netDebt: 0, netPpe: 200, taxRate: 0.25, nol: null,
    })).facts;

  it("the entry screen's dropdown value reaches the band without any SIC", () => {
    const facts = manual('Healthcare');
    expect(facts.sic_code).toBeNull();                     // manual deals have no SIC…
    expect(facts.sector_comps).not.toBeNull();             // …but they DO get a band
    expect(facts.sector_comps!.bucket).toBe('Healthcare');
    expect([facts.sector_comps!.low, facts.sector_comps!.median, facts.sector_comps!.high]).toEqual([15.25, 15.78, 19.78]);
  });

  it('the manual route honours the currency→region rule too (GBP ⇒ Europe)', () => {
    const facts = manual('Technology', 'GBP');
    expect(facts.sector_comps!.region).toBe('Europe');
    expect(facts.sector_comps!.median).toBe(17.27); // Europe Technology, not the US 24.48
  });
});

describe('§21.11(xi) — the §D6 IFRS-in-SEC route (a 20-F filer whose SIC EDGAR DOES publish)', () => {
  /** ifrs-full with no us-gaap — the branch `store/dealEngine` routes to `mapCompanyFactsIfrs`. */
  const ifrsFiler = (): CompanyFacts => ({
    cik: 41, entityName: 'Zwanzig-F AG',
    facts: {
      'ifrs-full': {
        Revenue: { units: { EUR: [fy('2025-01-01', '2025-12-31', 1000)] } },
        ProfitLossFromOperatingActivities: { units: { EUR: [fy('2025-01-01', '2025-12-31', 180)] } },
        DepreciationAndAmortisationExpense: { units: { EUR: [fy('2025-01-01', '2025-12-31', 50)] } },
        PropertyPlantAndEquipment: { units: { EUR: [inst('2025-12-31', 400)] } },
      },
    },
  } as unknown as CompanyFacts);

  it('the SIC survives the IFRS mapper and yields a EUROPE band — not the null "no sector information"', () => {
    // Before step 3 this route dropped the code EDGAR had already supplied one line earlier, so
    // a 20-F filer was told nothing was known about its sector. This fixture is what keeps the
    // threading honest: it fails the moment `mapCompanyFactsIfrs` or `store/dealEngine` stops
    // passing `sicCode` (audit T1/T5).
    const raw = mapCompanyFactsIfrs(ifrsFiler(), { sicDescription: 'Industrial machinery', sicCode: '3559' });
    expect(raw.sicCode).toBe('3559');
    const { facts } = adaptRawHistoricals(raw);
    expect(facts.sic_code).toBe('3559');
    expect(facts.sector_comps).not.toBeNull();
    expect(facts.sector_comps!.bucket).toBe('Industrials');
    expect(facts.sector_comps!.region).toBe('Europe'); // EUR filer ⇒ the Europe dataset
    expect([facts.sector_comps!.low, facts.sector_comps!.median, facts.sector_comps!.high]).toEqual([8.78, 11.01, 14.98]);
  });

  it('the same filer WITHOUT a SIC is honestly unavailable (the null is the reason, not a fallback)', () => {
    const { facts } = adaptRawHistoricals(mapCompanyFactsIfrs(ifrsFiler(), { sicDescription: 'Industrial machinery' }));
    expect(facts.sic_code).toBeNull();
    expect(facts.sector_comps).toBeNull();
  });
});

describe('§21.5b — the STORE call site passes the SIC on BOTH SEC branches (a source-scan guard)', () => {
  // `store/dealEngine.importFromEdgar` is network-driven, so a behavioural fixture cannot reach
  // its call site — but the defect the audit found (T5) lives exactly there: the store fetches
  // `submissions.sic` once and then forks, and the IFRS branch used to drop it. The repo already
  // solves this class with committed source scans rather than a reviewer's grep
  // (tests/governance-display-surface.test.ts), so the same instrument applies here.
  const src = readFileSync(join(__dirname, '..', 'store', 'dealEngine.ts'), 'utf8');

  it('both mapper calls receive sicCode — the us-gaap branch AND the §D6 IFRS branch', () => {
    expect(src, 'the store must still fetch the numeric SIC').toMatch(/sicCode\s*=\s*\(subs as[^)]*\)\.sic/);
    const ifrsCall = /mapCompanyFactsIfrs\(facts,\s*\{([^}]*)\}/.exec(src);
    expect(ifrsCall, 'mapCompanyFactsIfrs call not found').not.toBeNull();
    expect(ifrsCall![1], 'the §D6 IFRS branch dropped sicCode again — a 20-F filer would be told "no sector information exists" about a company whose SIC EDGAR published (SPEC §21.5b)').toContain('sicCode');
    const gaapCall = /mapCompanyFacts\(facts,\s*\{([^}]*)\}/.exec(src);
    expect(gaapCall, 'mapCompanyFacts call not found').not.toBeNull();
    expect(gaapCall![1], 'the us-gaap branch dropped sicCode').toContain('sicCode');
  });
});

describe('§21.5 — the entry screen\'s dropdown is BOUND to the band key set (no hand-kept list)', () => {
  it('every dropdown option resolves to a real band, and the sets are identical', async () => {
    const { SECTORS } = await import('../components/deal-engine/start/ManualFactsScreen');
    const bands = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'comps', 'bands.json'), 'utf8'));
    // PHASE_G names the hand-maintained list as its recurring enforcement failure: rename one
    // option and every manual deal of that sector silently shows "unavailable" while the code
    // still compiles. Bind the two by construction.
    expect([...SECTORS].sort()).toEqual(Object.keys(bands.US).sort());
    for (const s of SECTORS) expect(bands.US[s], s).not.toBeNull();
  });
});
