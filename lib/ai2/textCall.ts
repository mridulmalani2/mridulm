/**
 * lib/ai2/textCall.ts — ONE thin text-in/text-out call, reusing the gateway adapters/providers.
 * Providers without a native adapter (mistral/groq) speak the OpenAI shape. No streaming, no
 * tools.
 *
 * Sized for a FREE key. Every call states a small answer budget, a failure is named in words the
 * analyst can act on (the key is wrong, the free limit is reached and for how long), and a model
 * name the provider has retired falls through to the next one in its list. Nothing here is called
 * in the background: a call happens when the analyst asks for one.
 */

import { buildProviderConfig, PROVIDER_DEFAULTS, PROVIDER_MODELS, type AIProvider } from './gateway/providers';
import { buildAnthropicRequest, extractAnthropicText } from './gateway/adapters/anthropic';
import { buildOpenAIRequest, extractOpenAIText } from './gateway/adapters/openai';
import { buildGoogleRequest, extractGoogleText } from './gateway/adapters/google';

export type AiTextFn = (system: string, user: string) => Promise<string>;
export interface AiCallOptions { maxTokens?: number; temperature?: number }
export type AiTurnMessage = { role: 'user' | 'assistant'; content: string };
export type AiChatFn = (system: string, turns: AiTurnMessage[], opts?: AiCallOptions) => Promise<string>;

export type AiFailure = 'key' | 'limit' | 'model' | 'network' | 'empty' | 'other';

/** A failed call, with a message written for the analyst. */
export class AiError extends Error {
  constructor(public kind: AiFailure, message: string, public retryAfterSeconds: number | null = null) { super(message); this.name = 'AiError'; }
}

/** The saved key/provider. Lives HERE so the engine2 store never imports another tree. */
export function savedAiConfig(): { provider: AIProvider; apiKey: string } | null {
  if (typeof window === 'undefined') return null;
  const apiKey = localStorage.getItem('deal-engine-api-key');
  if (!apiKey) return null;
  const provider = (localStorage.getItem('deal-engine-ai-provider') ?? 'anthropic') as AIProvider;
  return { provider, apiKey };
}

const name = (p: AIProvider) => PROVIDER_DEFAULTS[p].displayName.replace(/\s*\(.*\)$/, '');

/** Seconds to wait, from the provider's own headers or message ("try again in 7.5s"). */
function retryAfter(res: Response, body: string): number | null {
  const h = Number(res.headers.get('retry-after'));
  if (Number.isFinite(h) && h > 0) return Math.ceil(h);
  const m = /(?:try again|retry) in\s+(?:(\d+)m)?\s*([\d.]+)\s*s/i.exec(body);
  if (m) return Math.ceil(Number(m[1] ?? 0) * 60 + Number(m[2]));
  return null;
}

function failure(provider: AIProvider, res: Response, body: string): AiError {
  const who = name(provider);
  if (res.status === 401 || res.status === 403 || /api[_ ]key.*(invalid|not valid)|invalid.*api[_ ]key/i.test(body)) return new AiError('key', `${who} did not accept the key. Check that it was pasted in full, or change the provider.`);
  if (res.status === 429) {
    const wait = retryAfter(res, body);
    return new AiError('limit', wait !== null && wait <= 120 ? `${who}'s limit for this key is reached. It frees up in about ${wait} seconds.` : `${who}'s limit for this key is reached for now. Free keys allow a small number of questions a minute and a day.`, wait);
  }
  if (res.status === 404 || /model.*(not found|does not exist|decommissioned|not supported)/i.test(body)) return new AiError('model', `${who} no longer offers the model this page asks for.`);
  if (res.status >= 500) return new AiError('other', `${who} is having trouble answering (${res.status}). Try again in a moment.`);
  return new AiError('other', `${who} returned an error (${res.status}).`);
}

async function callOnce(provider: AIProvider, apiKey: string, model: string, system: string, turns: AiTurnMessage[], opts: AiCallOptions): Promise<string> {
  const config = { ...buildProviderConfig(provider, apiKey), model };
  const req =
    provider === 'anthropic' ? buildAnthropicRequest(turns, system, null, config)
    : provider === 'google' ? buildGoogleRequest(turns, system, null, config)
    : buildOpenAIRequest(turns, system, null, config);
  const maxTokens = opts.maxTokens ?? 600;
  if (provider === 'google') {
    // newer Gemini models spend part of the output budget thinking, so a tight cap can return
    // nothing; the brevity is asked for in the prompt and the cap is left with room
    req.body.generationConfig = { maxOutputTokens: maxTokens + 1500, ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}) };
  } else {
    req.body.max_tokens = maxTokens;
    if (opts.temperature !== undefined) req.body.temperature = opts.temperature;
  }
  let res: Response;
  try {
    res = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
  } catch {
    throw new AiError('network', `Could not reach ${name(provider)}. Check the connection.`);
  }
  if (!res.ok) throw failure(provider, res, await res.text().catch(() => ''));
  const data = (await res.json()) as Record<string, unknown>;
  const text =
    provider === 'anthropic' ? extractAnthropicText(data)
    : provider === 'google' ? extractGoogleText(data)
    : extractOpenAIText(data);
  if (!text || !text.trim()) throw new AiError('empty', `${name(provider)} returned an empty answer.`);
  return text;
}

/** A conversation call. A retired model name falls through to the provider's next one. */
export function makeAiChat(provider: AIProvider, apiKey: string): AiChatFn {
  return async (system, turns, opts = {}) => {
    const models = PROVIDER_MODELS[provider];
    let last: unknown = null;
    for (const model of models) {
      try { return await callOnce(provider, apiKey, model, system, turns, opts); }
      catch (e) { last = e; if (!(e instanceof AiError) || e.kind !== 'model') throw e; }
    }
    throw last;
  };
}

/** The single-message form the older helpers use. */
export function makeAiText(provider: AIProvider, apiKey: string): AiTextFn {
  const chat = makeAiChat(provider, apiKey);
  return (system, user) => chat(system, [{ role: 'user', content: user }], { maxTokens: 900 });
}

/** One very small call to see that the key works. Asked for by the analyst, never automatic. */
export async function testKey(provider: AIProvider, apiKey: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await makeAiChat(provider, apiKey)('Reply with the single word: ready', [{ role: 'user', content: 'ready?' }], { maxTokens: 8, temperature: 0 });
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, message: (e as Error).message };
  }
}
