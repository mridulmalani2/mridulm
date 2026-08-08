/**
 * §20 PIK toggle — display surface (label/value provenance). The Debt tab marks each year's
 * ELECTION on a toggled pik_note and carries the §20 convention footnote; the fixed note
 * renders NEITHER (§20.6(c)'s "never a zero row" discipline applied to a label). The §20.8
 * disclosure row is pinned on BOTH methodology surfaces (the #115 precedent — the Excel twin
 * lives in engine2-excel-parity.test.ts). The `ahydo_shape` message reaches the user through
 * the generic coherence surfaces (Workbench banner + the downloaded memo); its normative
 * clauses are pinned in tests/engine2-pik-toggle.test.ts (v-c) where the flag is produced.
 *
 * NOTE: renderToStaticMarkup HTML-escapes — assertions use the escaped forms where relevant.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { Debt, Methodology } from '../components/deal-engine/v2/OutputTabs';
import { runModel } from '../lib/engine2/facade';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';
import { num } from '../lib/format';

const render = (golden: keyof typeof GOLDEN_DEALS) => {
  const { facts, assumptions } = GOLDEN_DEALS[golden];
  const o = runModel(facts, assumptions);
  return { o, html: renderToStaticMarkup(React.createElement(Debt, { o, ccy: 'USD' as const })) };
};

describe('§20 PIK toggle display surface — Debt tab', () => {
  it('G8-PIKT: every year carries its ELECTION marker, in schedule order, beside the elected leg', () => {
    const { o, html } = render('G8PIKT');
    // the marker set matches the committed schedule [pik,pik,cash,cash,pik] exactly
    expect(html).toContain('Y1 · PIK');
    expect(html).toContain('Y2 · PIK');
    expect(html).toContain('Y3 · cash');
    expect(html).toContain('Y4 · cash');
    expect(html).toContain('Y5 · PIK');
    // order pins the year→election mapping (a shifted schedule keeps every marker present but
    // reorders them — a plain toContain set would miss it)
    expect(html.indexOf('Y2 · PIK')).toBeLessThan(html.indexOf('Y3 · cash'));
    expect(html.indexOf('Y4 · cash')).toBeLessThan(html.indexOf('Y5 · PIK'));
    // value provenance: the marked leg is the one the ENGINE actually served that year
    const noteIdx = o.assumptions.structure.tranches.filter((t) => t.type !== 'revolver').findIndex((t) => t.type === 'pik_note');
    const rows = o.tranches[noteIdx];
    expect(rows[2].cash_interest).toBeGreaterThan(0); // the 'cash'-marked year pays cash…
    expect(rows[2].pik_accrual).toBe(0);              // …and accrues nothing
    expect(rows[0].pik_accrual).toBeGreaterThan(0);   // the 'PIK'-marked year is the mirror
    expect(rows[0].cash_interest).toBe(0);
    // and the displayed numbers are the named TrancheYear fields
    expect(html).toContain(num(rows[2].cash_interest, 2)); // 15.24
    expect(html).toContain(num(rows[4].pik_accrual, 2));   // 20.32
  });

  it('G8-PIKT: the §20 convention footnote states the WHOLE-coupon rule and the scenario freeze', () => {
    const { html } = render('G8PIKT');
    expect(html).toContain('PIK toggle (§20)');
    expect(html).toContain('WHOLE coupon');
    expect(html).toContain('Never both legs in one year');
    expect(html).toContain('frozen across scenarios');
  });

  it('G3 (FIXED note, elections null): NO election markers and NO §20 footnote — the fixed shape says nothing', () => {
    const { o, html } = render('G3');
    expect(html).not.toContain('· cash');
    expect(html).not.toContain('· PIK');
    expect(html).not.toContain('PIK toggle (§20)');
    // …while the note itself still runs BOTH legs, which is exactly why no marker is honest
    const noteIdx = o.assumptions.structure.tranches.filter((t) => t.type !== 'revolver').findIndex((t) => t.type === 'pik_note');
    expect(o.tranches[noteIdx][0].pik_accrual).toBeGreaterThan(0);
  });

  it('G2 (no pik_note at all): the toggle surface is absent entirely', () => {
    const { html } = render('G2');
    expect(html).not.toContain('PIK toggle');
    expect(html).not.toContain('· PIK');
  });
});

describe('§20.8 — the PIK-toggle disclosure row is on the Methodology surface (SPEC §15)', () => {
  it('the Disclosures table carries the row with its load-bearing clauses (label mutation-tested)', () => {
    const html = renderToStaticMarkup(React.createElement(Methodology));
    expect(html).toContain('PIK toggle (§20)');
    // the load-bearing clauses — a paraphrase drift reddens here
    expect(html).toContain('WHOLE-coupon election only');
    expect(html).toContain('frozen across scenarios');
    expect(html).toContain('deducted as ACCRUED');
    expect(html).toContain('AHYDO');
    expect(html).toContain('deliberately over-fires');
    expect(html).toContain('non-refinanceable');
  });
});
