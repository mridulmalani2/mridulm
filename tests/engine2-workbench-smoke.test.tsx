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
    // §11 [v1.1.2]: the input field states its basis. It reads GROSS total leverage across
    // ALL term tranches — the same number the Summary tile reports — so an unqualified
    // "Total leverage" label is what let it disagree with the headline unnoticed.
    expect(html).toContain('Total leverage (gross, x FY EBITDA)');
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

  it('an UNSUPPORTED filing currency (SEK) renders its ISO code in the history — never a borrowed $ symbol', () => {
    importFixture((f) => {
      // re-key every unit map USD → SEK: anchor unit outside the modelled set ⇒ blocking badge
      for (const tag of Object.keys((f as any).facts['us-gaap'])) {
        const u = (f as any).facts['us-gaap'][tag].units;
        u.SEK = u.USD; delete u.USD;
      }
    });
    const s = useEngine2Model.getState();
    expect(s.missingFacts).toContain('currency_unsupported');
    expect(s.sourceCurrency).toBe('SEK');
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('SEK 1,020m');   // FY2025 revenue in ITS OWN currency code
    expect(html).not.toContain('$');         // the placeholder symbol never reaches the table
    expect(html).toContain('not supported'); // the D6 blocking line still shows
    expect(html).toContain('disabled');      // and Build stays gated
  });

  it('a cheap trading anchor produces the coherence banner after build (warn glyph, message)', () => {
    importFixture(undefined, 6.0);
    useEngine2Model.getState().build();
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('▲'); // warn severity glyph
    expect(html).toContain('trading anchor');
  });

  it('E2a — output tabs render after build: summary hero, bridge rows, deleveraging footer text present; no sentinels', () => {
    importFixture();
    useEngine2Model.getState().build();
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('Summary');
    expect(html).toContain('Value bridge');
    expect(html).toContain('Net-debt paydown');
    expect(html).toContain('FCF conversion');
    // §11 [v1.1.2]: the Summary tile's entry leverage is GROSS and must say so — the
    // per-year credit metrics on the Credit tab are NET, and an unlabelled pairing reads
    // as one deleveraging series. Labels were the actual defect and were untested
    // (hostile review F6, 2026-07-24).
    expect(html).toContain('Entry gross leverage');
    expect(html).not.toMatch(/Entry\s+net\s+leverage/i);
    // §11 [v1.1.3]: the entry-multiple tile is labelled by basis. The fixture is an FY
    // entry ⇒ "Entry (FY) → exit", never a bare "Entry → exit" that hides the basis.
    expect(html).toContain('Entry (FY) → exit');
    expect(html).not.toContain('9999');
    expect(html).not.toMatch(/\d\.\d{8,}/);
    // the §E2 removal list stays absent from the v2 tree
    for (const banned of ['Fragility', 'Reality Check', 'Fund economics']) expect(html).not.toContain(banned);
  });

  it('E2b — buildWithExhibits populates scenarios (4 presets, entry frozen) + the 5×5 centered sensitivity; all three new tabs render', () => {
    importFixture();
    useEngine2Model.getState().buildWithExhibits();
    const out = useEngine2Model.getState().output!;
    expect(out.scenarios).toHaveLength(4);
    for (const s of out.scenarios!) expect(s.returns.sponsor_net.irr).not.toBeNull();
    // §14.8: every preset is a downside — IRR ≤ base
    for (const s of out.scenarios!) expect(s.returns.sponsor_net.irr!).toBeLessThanOrEqual(out.returns.sponsor_net.irr! + 1e-12);
    const grid = out.sensitivity![0];
    expect(grid.irr).toHaveLength(5);
    expect(grid.irr[2][2]).toBe(out.returns.sponsor_net.irr); // §14.7 center ≡ base
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('Sensitivity');
    expect(html).toContain('Scenarios');
    expect(html).toContain('Methodology');
    expect(html).not.toMatch(/\d\.\d{8,}/); // exhibits also cross the format boundary
  });

  it('history cells that are gaps render as em-dashes, never zeros', () => {
    importFixture(); // 2023/2024 have revenue only — EBITDA/capex cells are gaps
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('—');
    expect((html.match(/—/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});

/**
 * SPEC §3 step 7 / §3.7 / §9 [v1.1.0] UI surfaces. The feature is default-OFF, so the two
 * halves of this are: with no schedule NOTHING new renders (a pre-v1.1.0 deal must look
 * exactly as it did), and with one the paid/blocked evidence and the de-degenerated
 * DPI/payback headline appear.
 */
describe('interim distributions — the v1.1.0 UI surfaces', () => {
  const withSchedule = (dists: number[] | null, trap: number | null) => {
    importFixture();
    const st = useEngine2Model.getState();
    const a = st.assumptions!;
    st.editAssumptions(
      {
        ...a,
        structure: { ...a.structure, distributions: dists },
        covenants: { ...a.covenants, rp_trap: trap === null ? null : { metric: 'net_leverage', level: trap } },
      },
      ['structure.distributions', 'covenants.rp_trap'],
    );
    useEngine2Model.getState().build();
    return renderToStaticMarkup(<Workbench />);
  };

  it('OFF by default: no distributions table, no DPI/payback headline (a pre-v1.1.0 deal is unchanged)', () => {
    const html = withSchedule(null, null);
    expect(html).not.toContain('Interim distributions');
    expect(html).not.toContain('DPI');
    expect(html).not.toContain('Payback');
  });

  it('ON: DPI + payback are headlined on Summary, and the paid rows reach ModelOutput', () => {
    const html = withSchedule([5, 5, 5, 5, 5], null);
    // Summary is the default tab, so these are genuinely in the rendered markup.
    expect(html).toContain('DPI');
    expect(html).toContain('Payback');
    expect(html).not.toContain('9999');
    expect(html).not.toMatch(/\d\.\d{8,}/);
    // The distributions TABLE lives on the Debt tab, which this default render does not
    // mount — so it is asserted where it is actually observable: on the output the tab
    // reads. Claiming a DOM assertion for markup that was never rendered would be the
    // vacuous-test pattern this suite has been burned by twice.
    const out = useEngine2Model.getState().output!;
    expect(out.waterfall.some((w) => w.distribution_requested > 0)).toBe(true);
    expect(out.waterfall.some((w) => w.distribution_paid > 0)).toBe(true);
    expect(out.waterfall.every((w) => w.rp_max === null)).toBe(true); // trap OFF ⇒ N/A
    expect(out.returns.dpi[out.returns.dpi.length - 1]).toBeGreaterThan(0);
  });

  it('the inputs live in Advanced and start empty — the suggestion layer proposes NEITHER (§16)', () => {
    importFixture();
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('Advanced — tax · fees · sweep · MIP · distributions');
    expect(html).toContain('Distributions / yr');
    expect(html).toContain('RP trap (net lev)');
    const a = useEngine2Model.getState().assumptions!;
    expect(a.structure.distributions).toBeNull();
    expect(a.covenants.rp_trap).toBeNull();
  });

  it('a BINDING trap raises the §3.7 coherence WARN, and it reaches the banner', () => {
    // a tight level against a levered opening balance sheet blocks the early years
    const html = withSchedule([40, 40, 40, 40, 40], 0.5);
    const out = useEngine2Model.getState().output!;
    const blocked = out.waterfall.filter((w) => w.distribution_blocked);
    expect(blocked.length).toBeGreaterThan(0);
    const flag = out.coherence.find((f) => f.code === 'distribution_blocked');
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe('warn');
    // the banner is tab-independent, so this part IS observable in the default render
    expect(html).toContain('Restricted-payment trap blocks distributions');
    expect(html).toContain('does not carry forward');
  });
});
