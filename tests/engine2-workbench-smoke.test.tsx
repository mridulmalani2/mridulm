/**
 * E1c — SSR render smoke for the v2 workbench tree against the REAL engine2 store
 * (no mocks): badges render, MISSING gates the button, no raw engine floats reach the
 * markup, coherence banner renders, history cells degrade to em-dashes.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Workbench from '../components/deal-engine/v2/Workbench';
import { useEngine2Model } from '../store/engine2Model';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import type { CompanyFacts } from '../lib/edgar/client';

const M = 1e6;
const fy = (start: string, end: string, val: number, filed = '2026-02-15') => ({
  start, end, val: val * M, fy: Number(end.slice(0, 4)), fp: 'FY', form: '10-K', filed, accn: `a-${filed}`,
});
const inst = (end: string, val: number, filed = '2026-02-15') => ({
  end, val: val * M, fy: Number(end.slice(0, 4)), fp: 'FY', form: '10-K', filed, accn: `a-${filed}`,
});
const FIXTURE: CompanyFacts = {
  cik: 60, entityName: 'Workbench Corp',
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [
        fy('2023-01-01', '2023-12-31', 900, '2024-02-15'),
        fy('2024-01-01', '2024-12-31', 960, '2025-02-15'),
        fy('2025-01-01', '2025-12-31', 1020),
      ] } },
      OperatingIncomeLoss: { units: { USD: [fy('2025-01-01', '2025-12-31', 200)] } },
      DepreciationDepletionAndAmortization: { units: { USD: [fy('2025-01-01', '2025-12-31', 40)] } },
      PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [fy('2025-01-01', '2025-12-31', -45)] } },
      AssetsCurrent: { units: { USD: [inst('2025-12-31', 400)] } },
      LiabilitiesCurrent: { units: { USD: [inst('2025-12-31', 250)] } },
      CashAndCashEquivalentsAtCarryingValue: { units: { USD: [inst('2025-12-31', 90)] } },
      LongTermDebtNoncurrent: { units: { USD: [inst('2025-12-31', 300)] } },
      IncomeTaxExpenseBenefit: { units: { USD: [fy('2025-01-01', '2025-12-31', 30)] } },
      IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: { units: { USD: [fy('2025-01-01', '2025-12-31', 125)] } },
    },
  },
} as unknown as CompanyFacts;

const importFixture = (mutate?: (f: CompanyFacts) => void, anchor?: number | null) => {
  const f: CompanyFacts = JSON.parse(JSON.stringify(FIXTURE));
  mutate?.(f);
  useEngine2Model.getState().importFromRaw(mapCompanyFacts(f, { sicCode: '3711' }), { trading_anchor: anchor ?? null });
};

beforeEach(() => useEngine2Model.getState().reset());

describe('v2 Workbench — SSR smoke on the real store', () => {
  it('renders the imported state: entity, history table, badges, Suggest CTA; Build enabled', () => {
    importFixture(undefined, 8.2);
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('Workbench Corp');
    expect(html).toContain('Filing history');
    expect(html).toContain('2025-12-31');
    expect(html).toContain('SUGGESTED · HISTORY'); // growth basis badge
    expect(html).toContain('SUGGESTED · CONVENTION');
    expect(html).toContain('Suggest everything');
    expect(html).toContain('trades at ~8.2x'); // the D5 read-only anchor line
    expect(html).not.toContain('disabled'); // no missing facts ⇒ Build live
  });

  it('after build: hero IRR/MOIC render FORMATTED (no raw engine floats in the DOM)', () => {
    importFixture();
    useEngine2Model.getState().build();
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).toMatch(/Sponsor IRR \d+\.\d%/); // exactly 1dp — the §15 boundary
    expect(html).toMatch(/MOIC \d+\.\dx/);
    // the raw-float class: no 10+-digit decimal runs anywhere in the markup
    expect(html).not.toMatch(/\d\.\d{8,}/);
    expect(html).not.toContain('9999');
  });

  it('MISSING facts gate the button and render the confirm bar; confirming unblocks', () => {
    importFixture((f) => { delete (f as any).facts['us-gaap'].LongTermDebtNoncurrent; });
    let html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('confirm to build');
    expect(html).toContain('REQUIRED');
    expect(html).toContain('net_debt');
    expect(html).toContain('disabled');
    useEngine2Model.getState().confirmFact('net_debt', 210);
    html = renderToStaticMarkup(<Workbench />);
    expect(html).not.toContain('confirm to build');
    expect(html).not.toContain('disabled');
  });

  it('a cheap trading anchor produces the coherence banner after build (warn glyph, message)', () => {
    importFixture(undefined, 6.0);
    useEngine2Model.getState().build();
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('▲'); // warn severity glyph
    expect(html).toContain('trading anchor');
  });

  it('history cells that are gaps render as em-dashes, never zeros', () => {
    importFixture(); // 2023/2024 have revenue only — EBITDA/capex cells are gaps
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('—');
    expect((html.match(/—/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});
