/**
 * A FROZEN real filing set: Hasbro, Inc. (CIK 0000046080) companyfacts as served by SEC EDGAR on
 * 2026-11-10, trimmed to the concepts the mappers read (tests/fixtures/companyfacts-hasbro-frozen.json).
 * No network. The expected figures below were worked by hand from the facts in that file:
 *
 *   FY2025 (ended 2025-12-28, 10-K filed 2026-02-25)
 *     revenue 4,701.3 · operating income 11.1 (after a 1,021.9 goodwill impairment) · D&A 135.5
 *     EBITDA = 11.1 + 135.5 = 146.6
 *   LTM to 2026-09-27 = FY2025 + 9M 2026 − 9M 2025
 *     revenue  4,701.3 + 3,735.1 − 3,255.4 = 5,181.0
 *     op. inc.    11.1 + 1,040.1 − (−286.4) = 1,337.6
 *     D&A        135.5 +    94.2 −   107.1  =   122.6      EBITDA = 1,460.2
 *   Balance sheet at 2025-12-28
 *     borrowings 2,767.9 + 497.0 = 3,264.9 · cash 776.6 · net debt 2,488.3 · operating leases 131.4
 *
 * This filing is why three things in the data layer are the way they are — each pinned here.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { CompanyFacts } from '../lib/edgar/client';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import { buildStatementPack } from '../lib/statements/pack';
import { cellAt } from '../lib/statements/types';
import { applyCleaning } from '../lib/cleaning/apply';
import { blockers, cleaningChecks } from '../lib/cleaning/checks';
import { acceptCandidate, fillNilElsewhere, setAdjustmentAmount, setLeaseChoice } from '../lib/cleaning/ops';
import { emptyLedger } from '../lib/cleaning/types';
import { stops } from './fixtures/cleaning-deals';
import { adaptRawHistoricals } from '../lib/engine2/factsAdapter';

const FACTS: CompanyFacts = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'companyfacts-hasbro-frozen.json'), 'utf8'));
const OPTS = { asOfDate: '2026-11-10', sicCode: '3944' };
const FY = '2025-12-28';
const raw = mapCompanyFacts(FACTS, OPTS);
const pack = buildStatementPack({ raw, rawExLeases: mapCompanyFacts(FACTS, { ...OPTS, includeFinanceLeasesInDebt: false }), gaap: 'us-gaap', facts: FACTS });

describe('frozen filing: Hasbro FY2025 / LTM Q3 2026', () => {
  it('the sizing pair is the hand-worked LTM: revenue 5,181.0, EBITDA 1,460.2', () => {
    expect(raw.basis).toBe('LTM');
    expect(raw.as_of).toBe('2026-09-27');
    expect(raw.fy_revenue!.value).toBeCloseTo(5181.0, 6);
    expect(raw.fy_ebitda!.value).toBeCloseTo(1460.2, 6);
  });

  it('revenue is consolidated net revenues, not the larger pre-elimination `Revenues` segment total', () => {
    expect(cellAt(pack, 'revenue', FY)!.value).toBeCloseTo(4701.3, 6);
    expect(cellAt(pack, 'revenue', '2024-12-29')!.value).toBeCloseTo(4135.5, 6);
  });

  it('cash resolves although the filer switched cash concept: net debt is 3,264.9 − 776.6, not gross debt minus nothing', () => {
    expect(raw.gross_debt!.value).toBeCloseTo(3264.9, 6);
    expect(raw.cash!.value).toBeCloseTo(776.6, 6);
    expect(raw.net_debt!.value).toBeCloseTo(2488.3, 6);
    expect(raw.cash!.provenance.tag).toBe('CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents');
  });

  it('a loss year gives NO effective tax rate (pre-tax −102.0), not 0%, not 60%, not 21%', () => {
    expect(cellAt(pack, 'pretax_income', FY)!.value).toBeCloseTo(-102.0, 6);
    expect(raw.effective_tax_rate).toBeNull();
  });

  it('the grid is five fiscal years plus LTM, with balance-sheet lines reaching back the same five years', () => {
    expect(pack.periods.map((p) => p.key)).toEqual(['2021-12-26', '2022-12-25', '2023-12-31', '2024-12-29', FY, 'LTM']);
    expect(cellAt(pack, 'ebitda', FY)!.value).toBeCloseTo(146.6, 6);
    expect(cellAt(pack, 'receivables', '2021-12-26')).not.toBeNull();
    expect(cellAt(pack, 'operating_lease_liab', FY)!.value).toBeCloseTo(131.4, 6);
    expect(pack.lines.finance_lease_liab).toBeUndefined();
  });

  it('the goodwill impairment and share-based pay are proposed, with the filing’s own amounts', () => {
    const by = Object.fromEntries(pack.candidates.map((c) => [c.tag, c]));
    expect(by.GoodwillImpairmentLoss.amounts[FY]).toBeCloseTo(1021.9, 6);
    expect(by.ShareBasedCompensation.amounts[FY]).toBeCloseTo(80.4, 6);
    expect(by.GoodwillImpairmentLoss.amounts.LTM).toBeUndefined(); // tags are annual: LTM is the analyst's to enter
  });

  it('cleaning it: FY2025 EBITDA 146.6 + 1,021.9 impairment = 1,168.5; the LTM amount must be entered before the model can be sized', () => {
    let l = acceptCandidate(emptyLedger(), pack.candidates.find((c) => c.tag === 'GoodwillImpairmentLoss')!);
    l = stops(setLeaseChoice(l, 'none'));
    let cleaned = applyCleaning(raw, pack, l);
    expect(cleaned.bridges.ebitda.find((b) => b.period === FY)!.adjusted).toBeCloseTo(1168.5, 6);
    expect(cleaned.raw.fy_ebitda).toBeNull();
    expect(blockers(cleaningChecks(pack, l, cleaned, raw)).map((f) => f.code)).toEqual(['adjustment_amount']);
    // the impairment fell in H1 2025, outside the twelve months to Q3 2026: nil on the LTM basis
    l = fillNilElsewhere(setAdjustmentAmount(l, l.adjustments[0].id, 'LTM', 0), l.adjustments[0].id, pack);
    cleaned = applyCleaning(raw, pack, l);
    expect(blockers(cleaningChecks(pack, l, cleaned, raw))).toEqual([]);
    expect(cleaned.raw.fy_ebitda!.value).toBeCloseTo(1460.2, 6);
    expect(cleaned.raw.net_debt!.value).toBeCloseTo(2488.3, 6);
    expect(adaptRawHistoricals(cleaned.raw).facts.history.find((h) => h.period_end === FY)!.ebitda).toBeCloseTo(1168.5, 6);
  });
});

describe('frozen filing: operating NWC history (D7): one definition, every year', () => {
  const facts = adaptRawHistoricals(raw).facts;
  it('the anchor year of the history IS the anchor NWC, and earlier years are on the same assembly', () => {
    const rows = facts.history.filter((h) => h.operating_nwc !== null);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(facts.history.find((h) => h.period_end === FY)!.operating_nwc).toBe(raw.nwc!.value);
    // hand check, FY2025: (current assets − cash) − (current liabilities − current debt)
    const g = FACTS.facts['us-gaap'];
    const at = (tag: string) => g[tag].units.USD.filter((f) => f.end === FY).sort((a, b) => String(a.filed).localeCompare(String(b.filed))).pop()!.val / 1e6;
    const byHand = (at('AssetsCurrent') - at('CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents')) - (at('LiabilitiesCurrent') - at('LongTermDebtCurrent'));
    expect(raw.nwc!.value).toBeCloseTo(byHand, 6);
  });
});
