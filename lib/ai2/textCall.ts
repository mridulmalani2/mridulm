/**
 * lib/ai2/textCall.ts — ONE thin text-in/text-out call for the E4 modules, reusing the
 * UNCHANGED gateway adapters/providers (PHASE_E §E4 rule). Providers without a native
 * adapter (mistral/groq) speak the OpenAI shape, as in the old gateway. No streaming,
 * no tools — the E4 modules parse strict JSON or markdown from plain text.
 */

import { buildProviderConfig, type AIProvider } from '../engine/ai/providers';
import { buildAnthropicRequest, extractAnthropicText } from '../engine/ai/adapters/anthropic';
import { buildOpenAIRequest, extractOpenAIText } from '../engine/ai/adapters/openai';
import { buildGoogleRequest, extractGoogleText } from '../engine/ai/adapters/google';

export type AiTextFn = (system: string, user: string) => Promise<string>;

/** The E4 modules reuse the OLD flow's saved key/provider (gateway unchanged — §E4).
 *  Lives HERE so the engine2 store never imports the old-engine tree (boundary rule). */
export function savedAiConfig(): { provider: AIProvider; apiKey: string } | null {
  if (typeof window === 'undefined') return null;
  const apiKey = localStorage.getItem('deal-engine-api-key');
  if (!apiKey) return null;
  const provider = (localStorage.getItem('deal-engine-ai-provider') ?? 'anthropic') as AIProvider;
  return { provider, apiKey };
}

export function makeAiText(provider: AIProvider, apiKey: string): AiTextFn {
  return async (system, user) => {
    const config = buildProviderConfig(provider, apiKey);
    const messages = [{ role: 'user', content: user }];
    const req =
      provider === 'anthropic' ? buildAnthropicRequest(messages, system, null, config)
      : provider === 'google' ? buildGoogleRequest(messages, system, null, config)
      : buildOpenAIRequest(messages, system, null, config);
    const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
    if (!res.ok) throw new Error(`AI provider error (${res.status})`);
    const data = (await res.json()) as Record<string, unknown>;
    const text =
      provider === 'anthropic' ? extractAnthropicText(data)
      : provider === 'google' ? extractGoogleText(data)
      : extractOpenAIText(data);
    if (!text) throw new Error('AI returned no text');
    return text;
  };
}
