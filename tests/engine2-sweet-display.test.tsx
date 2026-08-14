/**
 * §22 sweet equity / ratchets / warrants — display surface (label/value provenance).
 * The Returns tab gains the EquityStrip block, rendered ONLY when `equity_strip` is
 * non-null (§22.10's biconditional — never a zero table); every cell reads a NAMED
 * EquityStripBlock field; the ONE sanctioned presentational derivation
 * (`sponsor_equity − loan_notes_subscribed`) is labelled as such; the tier count and the
 * ratchet MOIC are labelled by their BASIS (the §9 naming rule). The §22.11 disclosure row
 * is pinned on BOTH methodology surfaces (the #115 precedent — the Excel twin lives in
 * engine2-excel-parity.test.ts). NOTE: renderToStaticMarkup HTML-escapes.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { EquityStrip, Methodology, Returns } from '../components/deal-engine/v2/OutputTabs';
import { runModel } from '../lib/engine2/facade';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';
import { money, multiple } from '../lib/format';

const render = (golden: keyof typeof GOLDEN_DEALS) => {
  const { facts, assumptions } = GOLDEN_DEALS[golden];
  const o = runModel(facts, assumptions);
  return { o, html: renderToStaticMarkup(React.createElement(EquityStrip, { o, ccy: 'USD' as const })) };
};

describe('§22 display surface — the EquityStrip block (Returns tab)', () => {
  it('G9-SWEET: every displayed cell is a NAMED equity_strip field at its committed value', () => {
    const { o, html } = render('G9SWEET');
    const es = o.equity_strip!;
    // labels state their basis (§9 naming rule)
    expect(html).toContain('Sweet equity strip');
    expect(html).toContain('Loan notes subscribed (institutional strip)');
    expect(html).toContain('Loan notes accrued at exit (pre-redemption)');
    expect(html).toContain('Sweet-equity ratchet tiers reached (§22.5 basis');
    expect(html).toContain('REALIZED');
    // value provenance: the displayed strings are the named fields, formatted by lib/format
    expect(html).toContain(money(es.loan_notes_subscribed, 'USD'));   // 351.07
    expect(html).toContain(money(es.loan_notes_accrued_balance, 'USD')); // 515.83
    expect(html).toContain(money(es.management_ordinary_share, 'USD')); // 23.23
    expect(html).toContain(money(es.institution_ordinary_share, 'USD')); // 157.27
    expect(html).toContain(multiple(es.institution_moic_at_ratchet));  // 1.73x-form
    expect(html).toContain(`>${es.ratchet_tiers_reached}<`);           // the count cell, exact
    // the ONE sanctioned derivation, labelled as a derivation of named fields
    expect(html).toContain('Institutional ordinaries subscribed (= sponsor equity − loan notes)');
    expect(html).toContain(money(o.sources_uses.sponsor_equity - es.loan_notes_subscribed, 'USD')); // 39.01
    // warrant leg: exercised on G9, strike paid in
    expect(html).toContain('Warrant strike paid in');
    expect(html).toContain(money(es.warrant_payout_net, 'USD')); // 7.50
    // the §22.2 equity-treatment footnote and the headline-vs-realized caveat
    expect(html).toContain('Loan notes are EQUITY');
    expect(html).toContain('REALIZED MOIC');
  });

  it('G10-RATCHET and every v1 golden: the block is ABSENT (never a zero table) — §22.10 biconditional', () => {
    for (const g of ['G10RATCHET', 'G3', 'G2'] as const) {
      const { html } = render(g);
      expect(html, g).toBe('');
    }
    // and the Returns tab as a whole carries no §22 label on a strip-less deal
    const { facts, assumptions } = GOLDEN_DEALS.G3;
    const o = runModel(facts, assumptions);
    const returnsHtml = renderToStaticMarkup(React.createElement(Returns, { o, ccy: 'USD' as const }));
    expect(returnsHtml).not.toContain('Sweet equity strip');
    expect(returnsHtml).not.toContain('SPEC §22');
  });

  it('WARRANT-ONLY shape: headed "Warrant", loan-note and ratchet rows ABSENT, N/A never a sentinel', () => {
    const { facts, assumptions } = GOLDEN_DEALS.G9SWEET;
    const o = runModel(facts, { ...assumptions, sweet_equity: null });
    const html = renderToStaticMarkup(React.createElement(EquityStrip, { o, ccy: 'USD' as const }));
    expect(html).toContain('Warrant (SPEC §22)');
    expect(html).not.toContain('Loan notes subscribed');
    expect(html).not.toContain('ratchet tiers');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });

  it('the §22.5 N/A pin: management effective % renders N/A at a non-positive pot, never 0', () => {
    // an underwater strip: notes accrete past exit equity ⇒ pot ≤ 0 ⇒ the | null fields
    const { facts, assumptions } = GOLDEN_DEALS.G9SWEET;
    const o = runModel(facts, {
      ...assumptions,
      sweet_equity: { ...assumptions.sweet_equity!, loan_note_rate: 0.5 },
    });
    expect(o.equity_strip!.management_effective_ordinary_pct).toBeNull();
    const html = renderToStaticMarkup(React.createElement(EquityStrip, { o, ccy: 'USD' as const }));
    expect(html).toContain('Management effective ordinary % (N/A at a non-positive pot)');
    expect(html).toMatch(/N\/A/);
  });
});

describe('§22 display surface — the S&U tab (conformance B1 twin)', () => {
  it('the Sources table carries the subscription row on a strip deal and foots; absent when off', async () => {
    const { SU } = await import('../components/deal-engine/v2/OutputTabs');
    const { facts, assumptions } = GOLDEN_DEALS.G9SWEET;
    const o = runModel(facts, assumptions);
    const html = renderToStaticMarkup(React.createElement(SU, { o: o as never, ccy: 'USD' as const }));
    expect(html).toContain('Management subscription (sweet equity)');
    expect(html).toContain(money(o.sources_uses.management_subscription, 'USD'));
    const off = runModel(GOLDEN_DEALS.G3.facts, GOLDEN_DEALS.G3.assumptions);
    const offHtml = renderToStaticMarkup(React.createElement(SU, { o: off as never, ccy: 'USD' as const }));
    expect(offHtml).not.toContain('Management subscription');
  });
});

describe('§22 methodology surface (React) — the §15 row', () => {
  it('the §22.11 disclosure row is present and carries the load-bearing clauses', () => {
    const html = renderToStaticMarkup(React.createElement(Methodology));
    expect(html).toContain('Sweet equity / ratchets / warrants (§22)');
    for (const clause of [
      'EQUITY',                          // loan notes are equity, outside leverage
      'MARGINAL',                        // never cliffs
      'LOWER tier',                      // strict > at the boundary
      'DELIBERATELY DIFFERENT bases',    // the two ratchets
      'REDUCES THE SPONSOR',             // the §2 source line
      'may NOT coexist',                 // DR-2 double-count rejection
      'HEADLINE sponsor MOIC exceeds the realized one', // the §9 divergence disclosure
      'AT MOST ONE warrant',
      'at-the-money',
      'actually sweet',                  // independence of price and %
    ]) {
      expect(html, clause).toContain(clause);
    }
  });
});
