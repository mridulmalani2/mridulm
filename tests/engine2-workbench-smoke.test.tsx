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
import { enterDeal, enteredAssumptions } from './fixtures/entered-deal';

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

describe('v2 Workbench: SSR smoke on the real store', () => {
  it('imported state: facts and history render; the HOLD comes first; nothing is pre-filled and Build is disabled', () => {
    importFixture(undefined, 8.2);
    let html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('Workbench Corp');
    expect(html).toContain('Filing history');
    expect(html).toContain('2025-12-31');
    expect(html).toContain('The holding period sizes every per-year input');
    expect(html).toContain('disabled'); // no draft yet ⇒ Build gated
    useEngine2Model.getState().setHoldYears(5);
    html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('still blank. Nothing is assumed for you.');
    expect(html).toContain('data-suggested="true"'); // proposals are OFFERED inside their cells, in grey…
    expect(html).toMatch(/placeholder="[\d.]+"/); // …as a placeholder, never as the cell's value
    expect(html).toContain('Enter shows why, Enter again accepts'); // …with Excel's keys named for a screen reader
    expect(html).not.toContain('SUGGESTED · HISTORY'); // …and NOT applied (no badge on a blank field)
    expect(html).toContain('trades at ~8.2x'); // the D5 read-only anchor line
    expect(html).toContain('disabled');
    expect(html).not.toContain('Suggest everything'); // the bulk pre-fill button is gone
  });

  it('once every input is entered the blank list disappears, Build is live, and the gross-leverage preview states its basis', () => {
    importFixture();
    enterDeal(enteredAssumptions());
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).not.toContain('still blank');
    expect(html).not.toContain('disabled');
    // §11 [v1.1.2]: the preview reads GROSS total leverage across ALL term tranches and says so
    expect(html).toContain('Total leverage (gross, x FY EBITDA)');
    expect(html).toContain('>4.0x<');
    expect(html).toContain('data-basis="user"'); // entered values are marked as the analyst's own
  });

  it('after build: hero IRR/MOIC render FORMATTED (no raw engine floats in the DOM)', () => {
    importFixture();
    enterDeal(enteredAssumptions());
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
    enterDeal(enteredAssumptions());
    let html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('confirm to build');
    expect(html).toContain('REQUIRED');
    expect(html).toContain('Net debt at entry'); // a plain-language name — never the raw field path
    expect(html).toContain('disabled');
    useEngine2Model.getState().confirmFact('net_debt', 210);
    html = renderToStaticMarkup(<Workbench />);
    expect(html).not.toContain('confirm to build');
    expect(html).not.toContain('disabled');
  });

  it('an UNSUPPORTED filing currency (SEK) renders its ISO code in the history, never a borrowed $ symbol', () => {
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
    enterDeal(enteredAssumptions(5, { entry: { driver: 'multiple', entry_multiple: 12, enterprise_value: null, basis: 'fy', hold_years: 5 } }));
    useEngine2Model.getState().build();
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('▲'); // warn severity glyph
    expect(html).toContain('trading anchor');
  });

  it('E2a: output tabs render after build: summary hero, bridge rows, deleveraging footer text present; no sentinels', () => {
    importFixture();
    enterDeal(enteredAssumptions());
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

  it('E2b: buildWithExhibits populates scenarios (4 presets, entry frozen) + the 5×5 centered sensitivity; all three new tabs render', () => {
    importFixture();
    enterDeal(enteredAssumptions());
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

  it('history cells that are gaps render as dashes, never zeros', () => {
    importFixture(); // 2023/2024 have revenue only — EBITDA/capex cells are gaps
    const html = renderToStaticMarkup(<Workbench />);
    // an en dash since the UI upgrade (em dashes were taken out of the interface)
    expect((html.match(/<td>–<\/td>/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});

/**
 * SPEC §3 step 7 / §3.7 / §9 [v1.1.0] UI surfaces. The feature is default-OFF, so the two
 * halves of this are: with no schedule NOTHING new renders (a pre-v1.1.0 deal must look
 * exactly as it did), and with one the paid/blocked evidence and the de-degenerated
 * DPI/payback headline appear.
 */
describe('interim distributions: the v1.1.0 UI surfaces', () => {
  const withSchedule = (dists: number[] | null, trap: number | null) => {
    importFixture();
    enterDeal(enteredAssumptions());
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
    expect(html).not.toContain('Requested distribution'); // the per-year schedule appears only when switched on
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

  it('the inputs exist and start OFF: the suggestion layer proposes NEITHER (§16)', () => {
    importFixture();
    useEngine2Model.getState().setHoldYears(5);
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('Distributions to equity during the hold');
    expect(html).toContain('surplus cash (a % of cash above the minimum)'); // §3.8 policy offered
    expect(html).toContain('Restricted-payment cash trap');
    const a = useEngine2Model.getState().assumptions!;
    expect(a.structure.distributions).toBeNull();
    expect(a.structure.surplus_distribution).toBeNull();
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
    expect(html).toMatch(/does not carry forward/i);
  });
});

describe('every engine feature is enterable in the panel (sweep grid, covenant schedules, springing test, sweet ratchet, surplus policy)', () => {
  const draft = () => {
    importFixture();
    enterDeal(enteredAssumptions());
    return useEngine2Model.getState();
  };

  it('a sweep step-down grid replaces the flat %: the flat % is no longer demanded, every grid cell is', () => {
    const st = draft();
    const a = st.assumptions!;
    st.editAssumptions({ ...a, structure: { ...a.structure, sweep: { base_pct: Number.NaN, grid: { tiers: [{ above_net_leverage: 4.5, pct: 0.75 }, { above_net_leverage: Number.NaN, pct: 0.5 }], else_pct: 0 } } } }, ['structure.sweep.grid']);
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('Sweep step 2: when opening net leverage is above');
    expect(html).not.toContain('Cash sweep (% of cash above the minimum)');
    const missing = useEngine2Model.getState().missing().map((m) => m.path);
    expect(missing).toContain('structure.sweep.grid.tiers.1.above_net_leverage');
    expect(missing).not.toContain('structure.sweep.base_pct');
  });

  it('covenant levels by year, the springing test (with a revolver) and sweet ratchet tiers render as inputs', () => {
    const st = draft();
    const a = st.assumptions!;
    st.editAssumptions({
      ...a,
      mip: null,
      rollover_equity: 0,
      sweet_equity: { sponsor_ordinary_pct: 0.1, loan_note_rate: 0.08, management_subscription: 2, management_ordinary_pct: 0.1, ratchet: [{ hurdle_moic: 1.5, share_pct: 0.15 }] },
      covenants: { ...a.covenants, leverage_max: [5, 4.5, 4, 3.5, 3.5], springing: { metric: 'leverage', max: 5, revolver_draw_trigger_pct: 0.35 } },
    }, ['sweet_equity', 'covenants.leverage_max', 'covenants.springing']);
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('Max net leverage covenant by year');
    expect(html).toContain('Sweet ratchet tier 1: institution MOIC above');
    expect(a.structure.tranches.some((t) => t.type === 'revolver')).toBe(true); // the fixture carries an RCF
    expect(html).toContain('Springing test applies when drawn ÷ commitment exceeds');
  });

  it('the surplus policy arrives BLANK (payout share unset, timing an open choice) and gates Build until entered; then the model builds on it', () => {
    const st = draft();
    const a = st.assumptions!;
    // what choosing "surplus cash" in the panel does: nothing assumed for the analyst
    st.editWithChoices({ ...a, structure: { ...a.structure, distributions: null, surplus_distribution: { payout_pct: Number.NaN, start: 'immediately' } } },
      ['structure.distributions', 'structure.surplus_distribution'], ['structure.surplus_distribution.start'], ['structure.surplus_distribution']);
    const blank = useEngine2Model.getState().missing().map((m) => m.path);
    expect(blank).toContain('structure.surplus_distribution.payout_pct');
    expect(blank).toContain('structure.surplus_distribution.start');
    let html = renderToStaticMarkup(<Workbench />);
    expect(html).not.toContain('Pre-filled');
    expect(html).toContain('Share of surplus cash paid out');
    const b = useEngine2Model.getState().assumptions!;
    useEngine2Model.getState().editAssumptions({ ...b, structure: { ...b.structure, surplus_distribution: { payout_pct: 1, start: 'immediately' } } },
      ['structure.surplus_distribution.payout_pct', 'structure.surplus_distribution.start']);
    expect(useEngine2Model.getState().missing().map((m) => m.path).filter((x) => x.startsWith('structure.surplus_distribution'))).toEqual([]);
    useEngine2Model.getState().build();
    const out = useEngine2Model.getState().output!;
    expect(out).toBeTruthy();
    expect(out.waterfall.every((w) => w.distribution_requested >= 0)).toBe(true);
    html = renderToStaticMarkup(<Workbench />);
    expect(html).not.toContain('NaN');
  });
});

describe('§23 partial exit: the panel input', () => {
  it('offers the selldown, brings its three fields in BLANK, and Build is gated until they are entered', () => {
    importFixture();
    enterDeal(enteredAssumptions());
    const st = useEngine2Model.getState();
    const a = st.assumptions!;
    st.editAssumptions({ ...a, rollover_equity: 0, structure: { ...a.structure, selldown: { year: Number.NaN, fraction: Number.NaN, event_multiple: Number.NaN } } }, ['rollover_equity', 'structure.selldown']);
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('Partial exit before the final exit (secondary selldown)');
    expect(html).toContain('Partial exit: sale multiple');
    const missing = useEngine2Model.getState().missing().map((m) => m.path);
    expect(missing).toEqual(expect.arrayContaining(['structure.selldown.year', 'structure.selldown.fraction', 'structure.selldown.event_multiple']));
  });
  it('says why it is unavailable beside rollover equity instead of failing the Build', () => {
    importFixture();
    enterDeal(enteredAssumptions());
    const st = useEngine2Model.getState();
    const a = st.assumptions!;
    st.editAssumptions({ ...a, rollover_equity: 25 }, ['rollover_equity']);
    expect(renderToStaticMarkup(<Workbench />)).toContain('Unavailable while the deal has rollover equity.');
  });
});

describe('a run the engine calls not meaningful never headlines a return (adversarial review F1)', () => {
  // a deal that cannot service its debt: 8× senior at 12%, no revolver, a falling business
  const breaching = () => enteredAssumptions(5, {
    structure: {
      ...enteredAssumptions().structure,
      tranches: [{ name: 'TLB', type: 'senior', size: { x_ebitda: 8 }, pricing: { kind: 'fixed', rate: 0.12 }, amort_pct_of_face: 0.05, maturity_years: 7, oid_pct: 0, sweep: { participates: true, priority: 1 } }],
    },
    operations: { ...enteredAssumptions().operations, growth: [-0.1, -0.05, 0, 0, 0] },
  });

  it('a cash-floor breach: the headline IRR/MOIC read N/M and the ■ warning sits ABOVE the output tabs', () => {
    importFixture();
    enterDeal(breaching());
    useEngine2Model.getState().build();
    const out = useEngine2Model.getState().output!;
    expect(out.coherence.some((f) => f.severity === 'block')).toBe(true); // the premise
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).toContain('Sponsor IRR N/M');
    expect(html).toContain('not meaningful: see the ■ warning above');
    expect(html).not.toContain(`Sponsor IRR ${(out.returns.sponsor_net.irr! * 100).toFixed(1)}%`);
    const warn = html.indexOf('■ Cash floor breached');
    expect(warn).toBeGreaterThan(-1);
    expect(warn).toBeLessThan(html.indexOf('Value bridge')); // above the tabs, beside the headline
  });

  it('a healthy run still headlines its returns (the gate is the block flag, nothing broader)', () => {
    importFixture();
    enterDeal(enteredAssumptions());
    useEngine2Model.getState().build();
    const out = useEngine2Model.getState().output!;
    expect(out.coherence.some((f) => f.severity === 'block')).toBe(false);
    const html = renderToStaticMarkup(<Workbench />);
    expect(html).not.toContain('N/M');
    expect(html).toContain(`Sponsor IRR ${(out.returns.sponsor_net.irr! * 100).toFixed(1)}%`);
  });
});
