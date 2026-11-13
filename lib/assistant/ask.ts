/**
 * lib/assistant/ask.ts — a typed question, answered.
 *
 * With no AI key the answer is the model's own notes on the topic (lib/assistant/brief). With a
 * key, the same notes go to the language model with one job: say it the way a colleague would,
 * briefly. The prompt is sized for a free key (a few thousand tokens a minute): a short system
 * message, the notes that match the question, the last exchange, and a small answer.
 *
 * A language model can still write a figure that is not in the notes. `ungroundedFigures` finds
 * any such figure and the interface marks it, so a made-up number is never shown as the model's.
 * If the provider fails (a free key's limit, no network), the notes answer instead.
 */
import type { AiChatFn } from '../ai2/textCall';
import { answerFromNotes, selectNotes, type Note } from './brief';
import type { AssistStep, Rationale } from './types';

export interface Turn { who: 'you' | 'assistant'; text: string }

export interface Answer {
  text: string;
  /** 'notes' = the model's own notes, shown as they are; 'ai' = phrased by the connected model. */
  by: 'notes' | 'ai';
  /** Figures in an AI answer that appear nowhere in the notes it was given. */
  unverified: string[];
  /** Why the notes answered when a key is saved (the provider's limit, no connection). */
  fellBack?: string;
}

const FIGURE = /\d[\d,]*(?:\.\d+)?/g;
const plain = (n: string) => { const t = n.replace(/,/g, ''); return t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t; };

/**
 * Figures in `answer` that are not in `context`. A bare count up to ten ("two reasons", "3 years
 * in a row", a list number) is not a model figure and is let through; anything with a unit, a
 * decimal or more digits must appear in the context exactly.
 */
export function ungroundedFigures(answer: string, context: string): string[] {
  const known = new Set((context.match(FIGURE) ?? []).map(plain));
  const out: string[] = [];
  for (const m of answer.matchAll(FIGURE)) {
    const n = plain(m[0]);
    if (known.has(n)) continue;
    const after = answer.slice(m.index + m[0].length, m.index + m[0].length + 1);
    const unit = after === '%' || after === 'x' ? after : '';
    if (/^\d+$/.test(n) && Number(n) <= 10 && unit === '') continue;
    out.push(`${m[0]}${unit}`);
  }
  return [...new Set(out)];
}

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n).trimEnd()}…` : t);

export function buildAskPrompt(entity: string, question: string, history: Turn[], notes: Note[]): { system: string; turns: { role: 'user' | 'assistant'; content: string }[]; context: string } {
  const body = notes.map((n) => `[${n.title}] ${n.text}`).join('\n');
  const system = [
    `You are the analyst's assistant inside a leveraged buyout model of ${entity.replace(/\.$/, '')}. You explain and advise. You never change the model.`,
    'Answer from the NOTES below and nothing else.',
    '- Copy every figure exactly as it is written in the NOTES. Never calculate, round or estimate a new number.',
    '- Recommend a value only if the NOTES hold a sourced value for that input, and say where it comes from.',
    '- If the NOTES do not answer the question, say in one sentence what is missing.',
    '- Write two to four short sentences in plain English, the way one colleague talks to another. No headings, no bullet points unless asked for a list, no code, no field names, no long dashes.',
    '',
    'NOTES',
    body,
  ].join('\n');
  // the last exchange is enough to follow "and what about year 3?"
  const recent = history.slice(-2).map((t) => ({ role: t.who === 'you' ? 'user' as const : 'assistant' as const, content: clip(t.text, 500) }));
  const turns = [...recent, { role: 'user' as const, content: clip(question, 600) }];
  return { system, turns, context: `${body}\n${history.map((t) => t.text).join('\n')}\n${question}` };
}

// the long dashes, built from their code points so this file never carries one
const DASHES = String.fromCharCode(8212, 8211);
const LONG_DASH_SPACED = new RegExp(`\\s+[${DASHES}]\\s+`, 'g');
const LONG_DASH = new RegExp(DASHES[0], 'g');

/** Tidy what a small model tends to add: stray markdown headings, tables, long dashes. */
export function tidy(text: string): string {
  return text.replace(/\r/g, '').split('\n').filter((l) => !/^\s*\|?[-: |]{6,}\|?\s*$/.test(l)).join('\n')
    .replace(LONG_DASH_SPACED, ', ').replace(LONG_DASH, ', ').trim();
}

export async function ask(question: string, history: Turn[], notes: Note[], step: AssistStep, entity: string, ai: AiChatFn | null): Promise<Answer> {
  if (!ai) return { text: answerFromNotes(question, notes, step), by: 'notes', unverified: [] };
  const picked = selectNotes(question, notes, step);
  const { system, turns, context } = buildAskPrompt(entity, question, history, picked);
  try {
    const text = tidy(await ai(system, turns, { maxTokens: 450, temperature: 0.2 }));
    return { text, by: 'ai', unverified: ungroundedFigures(text, context) };
  } catch (e: unknown) {
    return { text: answerFromNotes(question, notes, step), by: 'notes', unverified: [], fellBack: (e as Error).message };
  }
}

/** A rationale as the note the reworder is given, and the check that it kept every figure. */
export function rationaleText(r: Rationale): string {
  return [`${r.subject}${r.value ? `: ${r.value}` : ''}.`, `${r.basis}.`, r.how, r.source ? `Source: ${r.source}` : '', ...r.notes.map((n) => `${n.heading}: ${n.text}`)].filter(Boolean).join(' ');
}

/**
 * The rationale in plain words, from the connected model. Returns null (keep the original) when
 * the rewording carries a figure the original does not: a reworded note may lose polish, never
 * accuracy.
 */
export async function plainWords(r: Rationale, ai: AiChatFn): Promise<string | null> {
  const note = rationaleText(r);
  const system = 'Rewrite the NOTE as three or four plain sentences an analyst would say to a colleague who asked "why this number?". Keep every figure, name and source exactly as written. Add no fact and no number that is not in the NOTE. No headings, no lists, no long dashes.';
  const text = tidy(await ai(system, [{ role: 'user', content: `NOTE\n${note}` }], { maxTokens: 300, temperature: 0.2 }));
  return ungroundedFigures(text, note).length ? null : text;
}
