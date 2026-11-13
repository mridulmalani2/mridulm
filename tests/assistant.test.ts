/**
 * The assistant (lib/assistant): what it says on each step, how it answers, and the guards that
 * keep an AI model from putting a number of its own on screen.
 *
 * It suggests and explains; it never originates a figure. These tests pin that: every value on
 * offer is a catalogue proposal or a figure the filing reports, the field notes carry no figure
 * at all, an AI answer with a figure that is not in its notes is marked, and a failed provider
 * falls back to the model's own notes. They also pin the free-key budget of a question.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { CompanyFacts } from '../lib/edgar/client';
import { mapCompanyFacts } from '../lib/edgar/mapXbrl';
import { buildStatementPack } from '../lib/statements/pack';
import { applyCleaning } from '../lib/cleaning/apply';
import { cleaningChecks } from '../lib/cleaning/checks';
import { acceptCandidate, setLeaseChoice } from '../lib/cleaning/ops';
import { emptyLedger, type CleaningLedger } from '../lib/cleaning/types';
import { blankAssumptions, missingInputs, CHOICE_PATHS } from '../lib/engine2/draft';
import { holdSuggestion, suggestionsFor } from '../lib/engine2/suggest';
import { runModel } from '../lib/engine2/facade';
import { adviseAssumptions, adviseClean, adviseResults, fieldTitle, suggestionKeyFor, valueText, type AssumptionsState } from '../lib/assistant/advisor';
import { FIELD_NOTES, CLEAN_NOTES, noteFor } from '../lib/assistant/guidance';
import { answerFromNotes, buildNotes, selectNotes, starters } from '../lib/assistant/brief';
import { ask, buildAskPrompt, plainWords, tidy, ungroundedFigures } from '../lib/assistant/ask';
import { AiError, makeAiChat } from '../lib/ai2/textCall';
import { buildGoogleRequest } from '../lib/ai2/gateway/adapters/google';
import { buildProviderConfig } from '../lib/ai2/gateway/providers';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';

const { facts, assumptions: built } = GOLDEN_DEALS.G2;
const SECTION_ORDER = ['transaction', 'debt', 'operating', 'tax'];
const sectionOf = (p: string) => (p.startsWith('structure') ? 'debt' : p.startsWith('operations') ? 'operating' : p.startsWith('tax') ? 'tax' : 'transaction');

function sheet(focusPath: string | null = null): AssumptionsState {
  const assumptions = blankAssumptions('Test', 5);
  const pending = [...CHOICE_PATHS];
  return {
    assumptions, blanks: missingInputs(facts, assumptions, pending), missingFacts: [], suggestions: suggestionsFor(facts, 5, assumptions, pending),
    currency: 'USD', focusPath, live: null, sectionOf, sectionTitle: (id) => id, sectionOrder: SECTION_ORDER,
  };
}

describe('assistant: Assumptions', () => {
  it('before the sheet opens, the one move is the holding period, with the cited proposal', () => {
    const hold = holdSuggestion()!;
    const a = adviseAssumptions({ ...sheet(), assumptions: null, blanks: [], suggestions: { 'entry.hold_years': hold } });
    expect(a.next?.actions[0]).toEqual({ kind: 'accept', key: 'entry.hold_years', label: `Use ${hold.value} years` });
    expect(a.next?.why?.source).toBeTruthy();
    expect(a.more).toEqual([]);
  });

  it('every value on offer is a catalogue proposal: the value, the working and the action all come from it', () => {
    const s = sheet();
    const a = adviseAssumptions(s);
    const offers = [a.next!, ...a.more].filter((i) => i.actions.some((x) => x.kind === 'accept'));
    expect(offers.length).toBeGreaterThan(3);
    for (const item of offers) {
      const accept = item.actions.find((x) => x.kind === 'accept')!;
      const sug = s.suggestions[(accept as { key: string }).key];
      expect(sug, item.title).toBeDefined();
      expect(sug.basis.detail.toLowerCase()).toContain(item.why!.how.replace(/\.$/, '').toLowerCase().slice(0, 30));
    }
    // an input with no sourced value is never given one
    const yours = a.more.filter((i) => !i.actions.some((x) => x.kind === 'accept'));
    expect(yours.length).toBeGreaterThan(0);
    for (const item of yours) expect(item.value, item.title).toBeUndefined();
  });

  it('the count is the build gate’s own, and the first move follows the order of the sheet', () => {
    const s = sheet();
    const a = adviseAssumptions(s);
    expect(a.status).toContain(`${s.blanks.length} inputs still blank`);
    expect(sectionOf((a.next!.actions.find((x) => x.kind === 'jump') as { path: string }).path)).toBe('transaction');
  });

  it('inside a field, the move predicted is the blank that follows it, and the field itself is explained', () => {
    const base = adviseAssumptions(sheet());
    const first = (base.next!.actions.find((x) => x.kind === 'jump') as { path: string }).path;
    const a = adviseAssumptions(sheet(first));
    expect(a.here?.id).toBe(`here:${first}`);
    expect(a.here?.actions.some((x) => x.kind === 'jump')).toBe(false);
    expect(a.next?.id).not.toBe(`in:${first}`);
    expect(a.next?.id).toBe(base.more.length ? adviseAssumptions({ ...sheet(), blanks: sheet().blanks.filter((b) => b.path !== first) }).next?.id : a.next?.id);
  });

  it('with every input entered the move is Build, and the run’s own flags are listed, not invented', () => {
    const done = { ...sheet(), assumptions: built, blanks: [] };
    const clean = adviseAssumptions({ ...done, live: { ok: true, flags: [] } });
    expect(clean.next?.actions).toEqual([{ kind: 'build', label: 'Build model' }]);
    const flagged = adviseAssumptions({ ...done, live: { ok: true, flags: [{ severity: 'warn', message: 'Net PP&E rolls negative from year 4: D&A outruns capex' }] } });
    expect(flagged.more.map((m) => m.body)).toEqual(['Net PP&E rolls negative from year 4: D&A outruns capex']);
    const stuck = adviseAssumptions({ ...done, live: { ok: false, reason: 'Entry leverage needs historical EBITDA.' } });
    expect(stuck.next?.body).toBe('Entry leverage needs historical EBITDA.');
    expect(stuck.next?.actions).toEqual([]);
  });

  it('a group proposal serves its members; a facility field never takes the whole-structure template', () => {
    const cat = { 'operations.growth': { value: [0.03], basis: { kind: 'history' as const, detail: 'x' } }, 'structure.tranches': { value: [], basis: { kind: 'convention' as const, detail: 'x' } } };
    expect(suggestionKeyFor('operations.growth.2', cat)).toBe('operations.growth');
    expect(suggestionKeyFor('structure.tranches', cat)).toBe('structure.tranches');
    expect(suggestionKeyFor('structure.tranches.0.maturity_years', cat)).toBeNull();
  });

  it('names and values read as a person would say them, never as an internal path', () => {
    expect(fieldTitle('structure.tranches.0.pricing.base_rate', built)).toBe(`${built.structure.tranches[0].name}: base rate`);
    expect(fieldTitle('tax.s163j', null)).toBe('Interest deduction cap');
    for (const p of ['tax.s163j', 'operations.nwc', 'some.unknown_field', 'entry.entry_multiple', 'structure.min_cash']) expect(fieldTitle(p, null)).not.toMatch(/[a-z]\.[a-z]|_/);
    expect(valueText('entry.entry_multiple', 11.5, 'USD')).toBe('11.5x');
    expect(valueText('entry.hold_years', 5, 'USD')).toBe('5 years');
    expect(valueText('operations.growth', [0.03, 0.03], 'USD')).toBe('3% a year');
    expect(valueText('tax.interest_deductible', true, 'USD')).toBe('Yes');
    expect(valueText('entry.entry_multiple', Number.NaN, 'USD')).toBeNull();
  });
});

// ── Clean ──
const FIXTURE: CompanyFacts = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'companyfacts-sample.json'), 'utf8'));
const OPTS = { asOfDate: '2024-06-30', sicCode: '3711' };
const FY = '2023-12-31';
const row = (end: string, valM: number, duration: boolean) => ({
  ...(duration ? { start: `${end.slice(0, 4)}-01-01` } : {}),
  end, val: valM * 1e6, accn: `0001000000-${Number(end.slice(2, 4)) + 1}-000010`, fy: Number(end.slice(0, 4)), fp: 'FY', form: '10-K', filed: `${Number(end.slice(0, 4)) + 1}-02-15`,
});
function cleanState(edit: (l: CleaningLedger) => CleaningLedger = (l) => l, dismissed: string[] = []) {
  const f: CompanyFacts = JSON.parse(JSON.stringify(FIXTURE));
  const add = (tag: string, rows: [string, number][], duration: boolean) => { f.facts['us-gaap'][tag] = { units: { USD: rows.map(([end, v]) => row(end, v, duration)) } }; };
  add('RestructuringCharges', [['2022-12-31', 10], [FY, 20]], true);
  add('ShareBasedCompensation', [[FY, 12]], true);
  add('OperatingLeaseLiability', [[FY, 60]], false);
  const raw = mapCompanyFacts(f, OPTS);
  const pack = buildStatementPack({ raw, rawExLeases: mapCompanyFacts(f, { ...OPTS, includeFinanceLeasesInDebt: false }), gaap: 'us-gaap', facts: f });
  const ledger = edit(emptyLedger());
  const cleaned = applyCleaning(raw, pack, ledger);
  return { pack, ledger, flags: cleaningChecks(pack, ledger, cleaned, raw), dismissed };
}

describe('assistant: Clean', () => {
  it('the lease choice is proposed from the accounting framework, with the reason, and only proposed', () => {
    const s = cleanState();
    const a = adviseClean(s);
    expect(a.next?.id).toBe('lease');
    expect(a.next?.actions).toEqual([{ kind: 'lease', choice: 'finance', label: 'Use finance leases only' }]);
    expect(adviseClean({ ...s, pack: { ...s.pack, gaap: 'ifrs' } }).next?.actions[0]).toMatchObject({ choice: 'all' });
    // a source that does not state its framework gets an explanation and no proposal
    expect(adviseClean({ ...s, pack: { ...s.pack, gaap: 'unknown' } }).next?.actions).toEqual([]);
    expect(s.ledger.choices.leases_in_net_debt).toBeNull();
  });

  it('what the filing reports is offered with the filing’s own amounts and tag; set aside means gone', () => {
    const s = cleanState((l) => setLeaseChoice(l, 'finance'));
    const a = adviseClean(s);
    const items = [a.next!, ...a.more].filter((i) => i.id.startsWith('cand:'));
    expect(items.length).toBe(s.pack.candidates.length);
    for (const item of items) {
      const c = s.pack.candidates.find((x) => `cand:${x.id}` === item.id)!;
      expect(item.why!.source).toContain(c.tag);
      for (const v of Object.values(c.amounts)) expect(item.why!.how).toContain(v.toFixed(1));
    }
    const one = s.pack.candidates[0];
    const after = adviseClean({ ...s, dismissed: [one.id] });
    expect([after.next!, ...after.more].some((i) => i.id === `cand:${one.id}`)).toBe(false);
  });

  it('an added cost asks whether it stops or continues, with the usual answer for its kind', () => {
    const base = cleanState((l) => setLeaseChoice(l, 'finance'));
    const sbc = base.pack.candidates.find((c) => c.category === 'sbc')!;
    const restructuring = base.pack.candidates.find((c) => c.category === 'restructuring')!;
    const s = cleanState((l) => acceptCandidate(acceptCandidate(setLeaseChoice(l, 'finance'), sbc), restructuring));
    const a = adviseClean(s);
    const asks = [a.next!, ...a.more].filter((i) => i.id.startsWith('forecast:'));
    expect(asks.map((i) => i.actions[0])).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'forecast', choice: 'continues' }),
      expect.objectContaining({ kind: 'forecast', choice: 'gone' }),
    ]));
    // nothing was chosen for the analyst
    expect(s.ledger.adjustments.every((x) => x.forecast === null)).toBe(true);
  });

  it('with nothing open and nothing left to review, the move is to continue', () => {
    const s = cleanState((l) => setLeaseChoice(l, 'finance'));
    const a = adviseClean({ ...s, dismissed: s.pack.candidates.map((c) => c.id) });
    expect(a.next?.actions).toEqual([{ kind: 'continue', label: 'Continue with adjusted figures' }]);
  });
});

describe('assistant: Results', () => {
  const output = runModel(facts, built);
  it('every figure it states is one the built model shows', () => {
    const a = adviseResults({ output, currency: 'USD', casesSaved: 0 });
    const notes = buildNotes({ step: 'results', facts, assumptions: built, output, blanks: [], suggestions: {}, advice: a, focusPath: null, clean: null });
    const known = notes.filter((n) => !n.id.startsWith('field:') && n.id !== 'now').map((n) => n.text).join(' ');
    for (const item of [a.next!, ...a.more]) expect(ungroundedFigures(item.body, `${known} ${a.status}`), item.title).toEqual([]);
    expect(a.status).toMatch(/Sponsor IRR .*%, .*x money multiple/);
  });
});

describe('field notes: guidance in words, never a figure', () => {
  it('no note states a number (a number on screen must come from the filing or a cited source)', () => {
    for (const n of FIELD_NOTES) expect(`${n.what} ${n.how} ${n.watch ?? ''}`, n.title).not.toMatch(/\d/);
    for (const n of Object.values(CLEAN_NOTES)) expect(n.text.replace(/IFRS 16/g, ''), n.title).not.toMatch(/\d/);
  });
  it('the inputs with no cited source have a note that says where the number comes from', () => {
    for (const p of ['structure.min_cash', 'structure.tranches.0.maturity_years', 'exit.fees_pct', 'covenants.leverage_max', 'valuation.beta', 'operations.growth.3']) expect(noteFor(p), p).not.toBeNull();
    expect(noteFor('exit.basis')!.title).not.toBe(noteFor('exit.multiple')!.title);
  });
});

describe('questions: answered from notes, sized for a free key, figures checked', () => {
  const output = runModel(facts, built);
  const notes = buildNotes({ step: 'results', facts, assumptions: built, output, blanks: [], suggestions: {}, advice: adviseResults({ output, currency: 'USD', casesSaved: 0 }), focusPath: null, clean: null });

  it('a question carries the pinned notes and its best matches, inside the budget', () => {
    const picked = selectNotes('What drives the return in this deal?', notes, 'results');
    expect(picked.map((n) => n.id)).toEqual(expect.arrayContaining(['deal', 'now', 'bridge', 'returns']));
    expect(picked.length).toBeLessThanOrEqual(8);
    const { system, turns } = buildAskPrompt(facts.entity_name, 'What drives the return in this deal?', [], picked);
    // about four characters to a token: the whole request stays well under a free key's minute
    expect((system.length + JSON.stringify(turns).length) / 4).toBeLessThan(2200);
  });

  it('every starter question has an answer with no key', async () => {
    for (const step of ['clean', 'assumptions', 'results'] as const) {
      for (const q of starters(step, step === 'results')) {
        const a = await ask(q, [], notes, step, facts.entity_name, null);
        expect(a.by).toBe('notes');
        expect(a.text.length, q).toBeGreaterThan(40);
      }
    }
    expect(answerFromNotes('zzz qqq', notes.filter((n) => n.pin), 'source')).toContain('holds nothing under those words');
  });

  it('no note shows an internal field name', () => {
    const all = buildNotes({ step: 'assumptions', facts, assumptions: blankAssumptions('T', 5), output: null, blanks: sheet().blanks, suggestions: sheet().suggestions, advice: adviseAssumptions(sheet()), focusPath: 'tax.s163j.ati_pct', clean: null });
    for (const n of all) expect(`${n.title} ${n.text}`, n.id).not.toMatch(/\b[a-z]+_[a-z_]+\b|\b(operations|structure|entry|exit|tax|fees)\.[a-z]/);
  });

  it('a figure the notes do not hold is found; figures copied from them, and plain counts, are not', () => {
    const ctx = 'Sponsor net IRR is 21.2% and the money multiple is 2.61x. Paydown adds $3,803m. Net leverage 4.50x in 2025.';
    expect(ungroundedFigures('IRR is 21.2%, 2.61x money, with $3,803m from paydown in 2025.', ctx)).toEqual([]);
    expect(ungroundedFigures('There are two drivers and 3 steps. Leverage is 4.5x.', ctx)).toEqual([]);
    expect(ungroundedFigures('IRR is about 21% and paydown is 92% of the gain, or 3,800.', ctx)).toEqual(['21%', '92%', '3,800']);
    expect(ungroundedFigures('It returns 5x.', ctx)).toEqual(['5x']);
  });

  it('an AI answer is tidied and its unverified figures are reported', async () => {
    const ai = async () => 'Debt paydown is the main driver — roughly 77% of the gain.';
    const a = await ask('What drives the return?', [], notes, 'results', facts.entity_name, ai);
    expect(a.by).toBe('ai');
    expect(a.text).not.toContain('—');
    expect(a.unverified).toEqual(['77%']);
  });

  it('when the provider fails, the model’s own notes answer and the reason is kept', async () => {
    const ai = async () => { throw new AiError('limit', 'Groq\'s limit for this key is reached. It frees up in about 12 seconds.', 12); };
    const a = await ask('What drives the return?', [], notes, 'results', facts.entity_name, ai);
    expect(a.by).toBe('notes');
    expect(a.fellBack).toContain('12 seconds');
    expect(a.text).toContain('Where the return comes from');
  });

  it('a reworded rationale that changes a figure is thrown away', async () => {
    const r = adviseAssumptions(sheet()).next!.why!;
    expect(await plainWords(r, async () => `${r.subject} is set at ${r.value} for the reasons given.`)).toContain(r.value!);
    expect(await plainWords(r, async () => 'A typical value here is 9.9x.')).toBeNull();
  });

  it('tidy drops table rules and long dashes and leaves figures alone', () => {
    expect(tidy('IRR 21.2% — strong\n|---|---|\n-5.2% downside')).toBe('IRR 21.2%, strong\n-5.2% downside');
  });
});

describe('the AI call: built for a free key', () => {
  const respond = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
  const withFetch = async <T,>(impl: (url: string, init: RequestInit) => Response, run: () => Promise<T>): Promise<T> => {
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => impl(String(url), init ?? {})) as typeof fetch;
    try { return await run(); } finally { globalThis.fetch = real; }
  };

  it('asks for a small answer, and names a rate limit with its wait', async () => {
    let sent: Record<string, unknown> = {};
    const text = await withFetch((_u, init) => { sent = JSON.parse(String(init.body)); return respond(200, { choices: [{ message: { content: 'ok' } }] }); },
      () => makeAiChat('groq', 'gsk_x')('s', [{ role: 'user', content: 'q' }], { maxTokens: 450, temperature: 0.2 }));
    expect(text).toBe('ok');
    expect(sent.max_tokens).toBe(450);
    const err = await withFetch(() => respond(429, { error: { message: 'Rate limit reached. Please try again in 7.5s.' } }),
      () => makeAiChat('groq', 'gsk_x')('s', [{ role: 'user', content: 'q' }]).catch((e: unknown) => e));
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).kind).toBe('limit');
    expect((err as AiError).message).toContain('8 seconds');
  });

  it('a retired model name falls through to the next; a wrong key does not retry', async () => {
    const models: string[] = [];
    const text = await withFetch((_u, init) => { const m = String(JSON.parse(String(init.body)).model); models.push(m); return models.length === 1 ? respond(404, 'model not found') : respond(200, { choices: [{ message: { content: 'second' } }] }); },
      () => makeAiChat('groq', 'gsk_x')('s', [{ role: 'user', content: 'q' }]));
    expect(text).toBe('second');
    expect(new Set(models).size).toBe(2);
    let calls = 0;
    const err = await withFetch(() => { calls++; return respond(401, 'invalid api key'); }, () => makeAiChat('groq', 'bad')('s', [{ role: 'user', content: 'q' }]).catch((e: unknown) => e));
    expect((err as AiError).kind).toBe('key');
    expect(calls).toBe(1);
  });

  it('a Google key travels in a header, never in the address', () => {
    const req = buildGoogleRequest([{ role: 'user', content: 'q' }], 's', null, buildProviderConfig('google', 'AIzaSECRET'));
    expect(req.url).not.toContain('AIzaSECRET');
    expect(req.headers['x-goog-api-key']).toBe('AIzaSECRET');
  });
});
