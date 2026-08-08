/**
 * §19 fund overlay — display surface (label/value provenance). The Returns tab renders the
 * FOURTH stream row "Net to LP — after fund fees & carry (fund-of-one overlay)" ONLY when
 * `ModelOutput.fund` is non-null (§19.6(c): ABSENT when OFF, never a zero row), with the
 * §19.5 verbatim label, the sanctioned returns-surface memo line ("less: fund fees & carry →
 * net to LP"), and the TVPI-≡-DPI annotation. This directed test pins the LABELS and proves
 * each displayed number equals its named FundBlock field (or the pinned scalar-on-named-
 * fields year-N net flow) — the gate-(c)/(b) discipline: a mislabel or a swapped field is
 * exactly what Tier A's display step must catch. The §19.8 disclosure row is pinned on BOTH
 * methodology surfaces (the #115 precedent) — the component here, the Excel twin in
 * engine2-excel-parity.test.ts. AssumptionsPanel input rows follow the Row/badge pattern and
 * are not string-pinned, per the refi/distributions precedent.
 *
 * NOTE: renderToStaticMarkup HTML-escapes '&' — assertions on '&'-bearing labels use the
 * escaped form ('&amp;').
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { Methodology, Returns } from '../components/deal-engine/v2/OutputTabs';
import { runModel } from '../lib/engine2/facade';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';
import { money, multiple, pct } from '../lib/format';

const render = (golden: keyof typeof GOLDEN_DEALS) => {
  const { facts, assumptions } = GOLDEN_DEALS[golden];
  const o = runModel(facts, assumptions);
  return { o, html: renderToStaticMarkup(React.createElement(Returns, { o, ccy: 'USD' as const })) };
};

describe('§19 fund display surface — Returns tab', () => {
  it('G7FUND: the net-to-LP row renders the §19.5 VERBATIM label with named-field values, in order, after the sponsor streams', () => {
    const { o, html } = render('G7FUND');
    const f = o.fund!;
    const N = f.lp_distributions.length;
    // the §19.5 verbatim label (mutating it reddens here — gate (c))
    expect(html).toContain('Net to LP — after fund fees &amp; carry (fund-of-one overlay)');
    // the fund row is the FOURTH stream — it renders after the three sponsor-side rows
    expect(html.indexOf('Net to LP')).toBeGreaterThan(html.indexOf('Sponsor net'));
    expect(html.indexOf('Net to LP')).toBeGreaterThan(html.indexOf('Unlevered'));
    // value provenance, order-pinned within the row slice: every cell is a NAMED FundBlock
    // field (the final inflow is the pinned scalar-on-named-fields year-N net flow).
    const row = html.slice(html.indexOf('Net to LP'));
    const outflow = money(-f.lp_contributions[0], 'USD');            // −$587.2m (t=0 draw)
    const finalNet = money(f.lp_distributions[N - 1] - f.mgmt_fees_net[N - 1], 'USD'); // $951.6m
    const irrStr = pct(f.fund_lp_net.irr);                           // 9.8%
    const moicStr = multiple(f.fund_lp_net.moic);                    // 1.5x
    expect(row).toContain(outflow);
    expect(row).toContain(finalNet);
    expect(row).toContain(irrStr);
    expect(row).toContain(moicStr);
    expect(row.indexOf(outflow)).toBeLessThan(row.indexOf(finalNet));
    expect(row.indexOf(finalNet)).toBeLessThan(row.indexOf(irrStr));
    // and the year-N net flow really is distribution − fee (recomputed from named fields):
    expect(f.lp_distributions[N - 1] - f.mgmt_fees_net[N - 1]).toBeCloseTo(951.608102, 4);
  });

  it('G7FUND: the footnote carries the §19.5 memo line, the TVPI-≡-DPI label, paid-in, and the interim-only payback sentinel', () => {
    const { o, html } = render('G7FUND');
    const f = o.fund!;
    expect(html).toContain('less: fund fees &amp; carry → net to LP (SPEC §19)');
    expect(html).toContain('TVPI (= DPI — fully realized)');
    expect(html).toContain(money(f.paid_in_total, 'USD'));       // $645.9m — the named field
    expect(html).toContain(money(f.committed_capital, 'USD'));   // ≡ paid-in on the null-committed golden
    // payback null on the golden (the pass-2 sentinel pin) → N/A with the interim-only basis stated
    expect(f.fund_lp_net.payback_year).toBeNull();
    expect(html).toContain('N/A');
    expect(html).toContain('interim');
  });

  it('fund OFF (G2DIST): NO net-to-LP row, NO memo line — the stream is ABSENT, never a zero row (§19.6(c))', () => {
    const { o, html } = render('G2DIST');
    expect(o.fund).toBeNull();
    expect(html).not.toContain('Net to LP');
    expect(html).not.toContain('fund-of-one');
    expect(html).not.toContain('less: fund fees');
    // the three sponsor-side streams still render
    for (const s of ['Sponsor net', 'Pre-promote', 'Unlevered']) expect(html).toContain(s);
  });
});

describe('§19.8 — the fund-overlay disclosure row is on the Methodology surface (SPEC §15)', () => {
  it('the Disclosures table carries the Fund/LP overlay row with the load-bearing clauses (label mutation-tested)', () => {
    const html = renderToStaticMarkup(React.createElement(Methodology));
    expect(html).toContain('Fund/LP overlay (§19)');
    // the load-bearing clauses of the §19.8 sentence — a paraphrase drift reddens here
    expect(html).toContain('NO fee-recovery tier');
    expect(html).toContain('NOT fund carry');
    expect(html).toContain('fee draws BEFORE the final distribution');
    expect(html).toContain('no clawback (nothing to claw back by construction)');
  });
});
