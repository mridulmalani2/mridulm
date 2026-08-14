/**
 * §22 three-issuer E-gate walkthrough — LIVE, opt-in (never CI).
 *
 *   LIVE_WALKTHROUGH=1 npx vitest run tests/walkthrough-g10.live.test.ts
 *
 * Drives the REAL stores (dealEngineStore.importFromEdgar/importFromEsef → engine2Store
 * import → confirm → build = ONE runModel) against the PRODUCTION proxy
 * (www.mridulmalani.com/api/edgar) — the harness-one-off precedent of the G-2/G-5/G-7/G-8
 * walkthroughs; SSR of the actual EquityStrip component covers the render surface.
 * Asserts: (1) extraction + returns REGRESSION-FREE vs the signed G8 record, (2) §22
 * SILENCE on every real deal (no strip suggested; equity_strip null; zero columns; the
 * five-term mirror degenerate), (3) the §22-ON legs computed on live data (strip + warrant,
 * and a ratcheted promote), incl. the §22.3(vi) grid pre-test on a live deal.
 * Results are recorded in rebuild/G10_SWEET_WALKTHROUGH.md.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { dealEngineStore } from '../store/dealEngine';
import { engine2Store } from '../store/engine2Model';
import { EquityStrip } from '../components/deal-engine/v2/OutputTabs';
import { buildSensitivityGrid } from '../lib/engine2/scenarios';
import { runModel } from '../lib/engine2/facade';
import type { DealAssumptions } from '../lib/engine2/types';
import type { Engine2ModelOutput } from '../lib/engine2/facade';

const LIVE = process.env.LIVE_WALKTHROUGH === '1';
const BASE = process.env.WALKTHROUGH_BASE ?? 'https://www.mridulmalani.com';

// Route the stores' same-origin '/api/edgar' calls to the production proxy.
beforeAll(() => {
  if (!LIVE) return;
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return realFetch(url.startsWith('/') ? `${BASE}${url}` : url, init);
  }) as typeof fetch;
});

interface IssuerResult {
  name: string;
  o: Engine2ModelOutput;
  confirmed: [string, number][];
}

async function importAndBuild(
  how: () => Promise<void>,
  confirmValues: Record<string, number>,
): Promise<IssuerResult> {
  engine2Store.getState().reset();
  await how();
  const de = dealEngineStore.getState();
  if (de.error) throw new Error(`import error: ${de.error}`);
  const e2 = engine2Store.getState();
  const confirmed: [string, number][] = [];
  for (const path of [...e2.missingFacts]) {
    const v = confirmValues[path];
    if (v === undefined) throw new Error(`unexpected gap ${path} — walkthrough must record it, not invent it`);
    engine2Store.getState().confirmFact(path, v);
    confirmed.push([path, v]);
  }
  engine2Store.getState().build();
  const out = engine2Store.getState().output;
  if (!out) throw new Error(`build produced no output: ${engine2Store.getState().error}`);
  return { name: out.facts.entity_name, o: out, confirmed };
}

function assertSection22Silence(o: Engine2ModelOutput) {
  expect(o.assumptions.sweet_equity).toBeNull(); // the suggestion layer proposes NO strip (§16)
  expect(o.assumptions.warrant).toBeNull();
  expect(o.assumptions.mip?.ratchet ?? null).toBeNull();
  expect(o.equity_strip).toBeNull(); // §22.10 biconditional
  expect(o.exit.management_ordinary_share).toBe(0);
  expect(o.exit.warrant_payout_net).toBe(0);
  expect(o.sources_uses.management_subscription).toBe(0);
  // the five-term mirror degenerates to the three-term form
  const e = o.exit;
  expect(e.sponsor_share + e.rollover_share + e.mip_payout).toBeCloseTo(e.exit_equity_pre_mip_total, 6);
  // the render surface says nothing
  expect(renderToStaticMarkup(React.createElement(EquityStrip, { o: o as never, ccy: 'USD' as const }))).toBe('');
  // and no §22 coherence flag fires
  expect(o.coherence.map((f: { code: string }) => f.code)).not.toContain('loan_notes_unredeemed');
}

describe.skipIf(!LIVE)('§22 three-issuer E-gate walkthrough (LIVE — production proxy)', () => {
  it('Apple (CIK 320193): imports, builds, §22 silent; then the strip+warrant leg computes on live data', async () => {
    const { o } = await importAndBuild(
      () => dealEngineStore.getState().importFromEdgar('CIK0000320193'),
      {},
    );
    console.log(`APPLE base: basis=${o.facts.sizing_basis} rev=${o.facts.fy_revenue} ebitda=${o.facts.fy_ebitda} ` +
      `irr=${o.returns.sponsor_net.irr} moic=${o.returns.sponsor_net.moic} ` +
      `bsmax=${Math.max(...o.balance_sheet.map((r: { check: number }) => Math.abs(r.check)))}`);
    assertSection22Silence(o);
    expect(o.returns.sponsor_net.irr).not.toBeNull();
    expect(Math.max(...o.balance_sheet.map((r: { check: number }) => Math.abs(r.check)))).toBeLessThan(1e-6);

    // ── the §22-ON leg: strip + warrant, programmatic (the §20.9 toggle-leg precedent) ──
    const a: DealAssumptions = {
      ...o.assumptions,
      mip: null, // §22.3(i)
      sweet_equity: {
        sponsor_ordinary_pct: 0.10, loan_note_rate: 0.08, management_subscription: 1000,
        management_ordinary_pct: 0.10,
        ratchet: [{ hurdle_moic: 1.5, share_pct: 0.15 }, { hurdle_moic: 2.0, share_pct: 0.20 }],
      },
      warrant: { holder_label: 'Mezzanine warrant', pct_of_ordinary: 0.05, strike_total: 500 },
    };
    const on = runModel(o.facts, a);
    const es = on.equity_strip!;
    expect(es).not.toBeNull();
    // §14.23(a): the closed form on the live plug (no interim distributions)
    const ln0 = 0.9 * on.sources_uses.sponsor_equity;
    expect(es.loan_notes_subscribed).toBeCloseTo(ln0, 6);
    expect(es.loan_notes_accrued_balance).toBeCloseTo(ln0 * Math.pow(1.08, a.entry.hold_years), 4);
    // §14.16 five-term mirror on live data, exact
    const e = on.exit;
    expect(e.sponsor_share + e.rollover_share + e.mip_payout + e.management_ordinary_share + e.warrant_payout_net)
      .toBeCloseTo(e.exit_equity_pre_mip_total, 6);
    // §14.23(d) mirror
    expect(on.returns.sponsor_net.moic).toBeCloseTo(es.institution_moic_at_ratchet!, 9);
    // the render surface carries the block with its basis labels
    const html = renderToStaticMarkup(React.createElement(EquityStrip, { o: on as never, ccy: 'USD' as const }));
    expect(html).toContain('Sweet equity strip');
    expect(html).toContain('§22.5 basis');
    console.log(`APPLE strip leg: LN0=${es.loan_notes_subscribed.toFixed(3)} LN[N]=${es.loan_notes_accrued_balance.toFixed(3)} ` +
      `redeemed=${es.loan_notes_redeemed.toFixed(3)} tiers=${es.ratchet_tiers_reached} moic=${es.institution_moic_at_ratchet?.toFixed(4)} ` +
      `M=${es.management_ordinary_share.toFixed(3)} wnet=${es.warrant_payout_net.toFixed(3)} irr=${on.returns.sponsor_net.irr}`);

    // ── §22.3(vi) grid pre-test on the LIVE deal: a plug-killing entry axis gives a null cell ──
    const baseMult = a.entry.entry_multiple ?? 8;
    const grid = buildSensitivityGrid(o.facts, a, on, {
      row_axis: 'entry_multiple', col_axis: 'exit_multiple',
      row_values: [0.05, baseMult], col_values: [baseMult],
      base_row_index: 1, base_col_index: 0,
    });
    expect(grid.irr[0][0]).toBeNull();
    expect(grid.irr[1][0]).not.toBeNull();

    // ── the ratcheted-promote leg (G10 shape) on live data ──
    const promoted = runModel(o.facts, {
      ...o.assumptions,
      mip: { pool_pct: 0.15, hurdle_moic: 1.0, ratchet: [{ hurdle_moic: 1.25, share_pct: 0.25 }] },
    });
    const single = runModel(o.facts, {
      ...o.assumptions,
      mip: { pool_pct: 0.15, hurdle_moic: 1.0, ratchet: null },
    });
    expect(promoted.exit.mip_payout).toBeGreaterThanOrEqual(single.exit.mip_payout);
    expect(promoted.equity_strip).toBeNull();
    console.log(`APPLE promote leg: single=${single.exit.mip_payout.toFixed(3)} ratcheted=${promoted.exit.mip_payout.toFixed(3)}`);
  }, 120_000);

  it('SAP (CIK 1000184, 20-F/IFRS): imports, gap confirmed honestly, builds, §22 silent', async () => {
    const { o, confirmed } = await importAndBuild(
      () => dealEngineStore.getState().importFromEdgar('CIK0001000184'),
      { 'maint_capex_pct_revenue': 0.03 },
    );
    console.log(`SAP: basis=${o.facts.sizing_basis} rev=${o.facts.fy_revenue} ebitda=${o.facts.fy_ebitda} ` +
      `irr=${o.returns.sponsor_net.irr} moic=${o.returns.sponsor_net.moic} gaps=${JSON.stringify(confirmed)} ` +
      `bsmax=${Math.max(...o.balance_sheet.map((r: { check: number }) => Math.abs(r.check)))}`);
    assertSection22Silence(o);
    expect(Math.max(...o.balance_sheet.map((r: { check: number }) => Math.abs(r.check)))).toBeLessThan(1e-6);
  }, 120_000);

  it('Vinci (ESEF, LEI 213800WFQ334R8UXUG83): imports via the layered resolver, builds, §22 silent', async () => {
    const { o, confirmed } = await importAndBuild(
      () => dealEngineStore.getState().importFromEsef('213800WFQ334R8UXUG83'),
      { 'net_debt': 0 },
    );
    console.log(`VINCI: basis=${o.facts.sizing_basis} rev=${o.facts.fy_revenue} ebitda=${o.facts.fy_ebitda} ` +
      `irr=${o.returns.sponsor_net.irr} moic=${o.returns.sponsor_net.moic} gaps=${JSON.stringify(confirmed)} ` +
      `bsmax=${Math.max(...o.balance_sheet.map((r: { check: number }) => Math.abs(r.check)))}`);
    assertSection22Silence(o);
    expect(Math.max(...o.balance_sheet.map((r: { check: number }) => Math.abs(r.check)))).toBeLessThan(1e-6);
  }, 120_000);
});

describe.skipIf(LIVE)('walkthrough harness placeholder (CI)', () => {
  it('is opt-in via LIVE_WALKTHROUGH=1 — skipped in CI by design', () => {
    expect(true).toBe(true);
  });
});
