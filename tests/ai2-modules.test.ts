/**
 * E4 — the AI modules against the new schema, LLM mocked (deterministic):
 * suggest (whitelist + clamps + AI badges + drop notes), redline parse + fallback,
 * memo skeleton (R&P order, engine numbers only), goal-seek (pure bisection over
 * TRUE inputs; N/A outside reach).
 */
import { describe, it, expect } from 'vitest';
import { applyAiSuggestions, buildSuggestPrompt } from '../lib/ai2/suggest';
import { parseRedline } from '../lib/ai2/redline';
import { memoSkeleton } from '../lib/ai2/memo';
import { solveForIrr } from '../lib/ai2/goalseek';
import { runModel } from '../lib/engine2/facade';
import { suggestAssumptions } from '../lib/engine2/suggest';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';

const { facts: g2facts, assumptions: g2a } = GOLDEN_DEALS.G2;

describe('E4 — AI-suggest guardrails', () => {
  it('applies whitelisted proposals with AI badges; clamps out-of-rail values WITH a note', () => {
    const raw = JSON.stringify({ suggestions: [
      { path: 'exit.multiple', value: 8.0, basis: 'trading anchor sits below entry' },
      { path: 'operations.target_margin', value: 0.95, basis: 'margin expansion story' }, // > rail 0.6
    ] });
    const r = applyAiSuggestions(g2a, raw);
    expect(r.assumptions.exit.multiple).toBe(8.0);
    expect(r.aiBasis['exit.multiple'].kind).toBe('ai');
    expect(r.assumptions.operations.target_margin).toBe(0.6); // clamped to the rail
    expect(r.applied.find((a) => a.path === 'operations.target_margin')!.basis).toContain('clamped');
  });

  it('drops non-whitelisted paths (a derived/output lever can never be applied) and basis-less items', () => {
    const raw = JSON.stringify({ suggestions: [
      { path: 'returns.sponsor_net.irr', value: 0.3, basis: 'wishful' },
      { path: 'entry.enterprise_value', value: 2000, basis: 'reprice' },
      { path: 'exit.multiple', value: 8.5 }, // no basis
    ] });
    const r = applyAiSuggestions(g2a, raw);
    expect(r.applied).toHaveLength(0);
    expect(r.dropped).toHaveLength(3);
    expect(r.assumptions).toEqual(g2a); // untouched
  });

  it('a full-hold growth array applies clamped per year; wrong length is dropped', () => {
    const ok = applyAiSuggestions(g2a, JSON.stringify({ suggestions: [
      { path: 'operations.growth', value: [0.5, 0.04, 0.04, 0.03, 0.03], basis: 'decelerating history' },
    ] }));
    expect(ok.assumptions.operations.growth[0]).toBe(0.35); // clamped from 0.5
    const bad = applyAiSuggestions(g2a, JSON.stringify({ suggestions: [
      { path: 'operations.growth', value: [0.04, 0.04], basis: 'short array' },
    ] }));
    expect(bad.applied).toHaveLength(0);
  });

  it('unparseable AI text applies NOTHING (never a partial guess)', () => {
    const r = applyAiSuggestions(g2a, 'sure! here are my thoughts...');
    expect(r.applied).toHaveLength(0);
    expect(r.assumptions).toEqual(g2a);
    expect(r.dropped[0]).toContain('unparseable');
  });

  it('the prompt NEVER carries a MISSING fact (taint rule)', () => {
    const { user } = buildSuggestPrompt({ ...g2facts, net_debt: 123.456 }, g2a, ['net_debt']);
    expect(user).not.toContain('123.456');
  });
});

describe('E4 — redline + memo', () => {
  it('parses strict-JSON challenges; degrades to a single raw-text item', () => {
    const items = parseRedline(JSON.stringify({ items: [{ path: 'exit.multiple', challenge: 'Why flat when the anchor is 15% lower?' }] }));
    expect(items).toEqual([{ path: 'exit.multiple', challenge: 'Why flat when the anchor is 15% lower?' }]);
    const fallback = parseRedline('The margin ramp looks aggressive.');
    expect(fallback[0].path).toBe('general');
  });

  it('memo skeleton follows the R&P panel order and carries only engine numbers', () => {
    const out = runModel(g2facts, g2a);
    const md = memoSkeleton(out, 'USD');
    const order = ['Purchase price & multiples', 'Sources & uses', 'Returns', 'Capitalization', 'Credit statistics', 'Free cash flow']
      .map((h) => md.indexOf(`## ${h}`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order); // R&P order preserved
    expect(md).not.toMatch(/\d\.\d{8,}/); // format boundary holds in the memo too
    expect(md).toContain('a range, not a point');
    // §11: FY entry ⇒ the price line says "FY EBITDA", never "NTM"
    expect(md).toContain('FY EBITDA');
    expect(md).not.toContain('NTM');
  });

  it('§11 memo NTM entry: the price line states NTM and adds the FY/LTM-canonical multiple (directed — NTM golden-uncovered)', () => {
    const ntm = { ...g2a, entry: { ...g2a.entry, basis: 'ntm' as const } };
    const md = memoSkeleton(runModel(g2facts, ntm), 'USD');
    const price = md.slice(md.indexOf('## Purchase price'), md.indexOf('## Sources'));
    expect(price).toContain('NTM EBITDA');          // the true basis
    expect(price).toContain('FY/LTM EBITDA');        // §11 "shows both, LTM canonical"
    expect(price).toContain('canonical sizing basis');
    // the false 'at X FY EBITDA' framing (multiple on NTM but labelled FY) must be gone
    expect(price).not.toMatch(/at \d[\d.]*x FY EBITDA/);
  });

  it('memo: leverage bases are labelled, the basis caveat sits in Caveats, and no imperative leaks into the deliverable (§11 v1.1.2)', () => {
    const md = memoSkeleton(runModel(g2facts, g2a), 'USD');
    const credit = md.slice(md.indexOf('## Credit statistics'), md.indexOf('## Free cash flow'));
    // Both bases labelled, and the old false label gone for good.
    expect(credit).toContain('Entry GROSS leverage');
    expect(credit).toContain('final-year NET leverage');
    expect(md).not.toContain('Entry net leverage');
    // memoSkeleton output is a DOWNLOADED DELIVERABLE, not a prompt — an instruction here
    // lands in the document handed to an IC, and MEMO_POLISH_SYSTEM would preserve it as
    // content rather than obey it. The basis disclosure belongs in Caveats (hostile F3).
    expect(credit).not.toMatch(/\bdo not present\b|\byou (must|should)\b|\bnote that\b/i);
    const caveats = md.slice(md.indexOf('## Caveats'));
    expect(caveats).toContain('Entry leverage is GROSS');
    expect(caveats).toContain('SPEC §11');
  });
});

describe('E4 — goal-seek (pure, true inputs only)', () => {
  const base = runModel(g2facts, g2a);

  it('solves entry multiple for a reachable target and verifies by re-run', () => {
    const target = base.returns.sponsor_net.irr! + 0.02; // 200bps above base ⇒ cheaper entry
    const r = solveForIrr(g2facts, g2a, 'entry_multiple', target)!;
    expect(r).not.toBeNull();
    expect(Math.abs(r.achieved_irr - target)).toBeLessThan(5e-5);
    expect(r.value).toBeLessThan(g2a.entry.entry_multiple!); // cheaper entry ⇒ higher IRR
  });

  it('solves the growth shift (operating lever, entry frozen by §13 semantics)', () => {
    const target = base.returns.sponsor_net.irr! - 0.015;
    const r = solveForIrr(g2facts, g2a, 'growth_shift', target)!;
    expect(r).not.toBeNull();
    expect(r.value).toBeLessThan(0); // lower IRR needs negative growth shift
    expect(Math.abs(r.achieved_irr - target)).toBeLessThan(5e-5);
  });

  it('an unreachable target returns null — N/A, never a clamped answer', () => {
    expect(solveForIrr(g2facts, g2a, 'exit_multiple', 5.0)).toBeNull(); // 500% IRR
  });

  it('the suggestion pipeline composes: D7 suggest → goal-seek on the suggested deal', () => {
    const LARGE: typeof g2facts = { ...g2facts, history: [] };
    const { assumptions } = suggestAssumptions(LARGE);
    const out = runModel(LARGE, assumptions);
    const r = solveForIrr(LARGE, assumptions, 'entry_multiple', out.returns.sponsor_net.irr! + 0.01);
    expect(r).not.toBeNull();
  });
});
