/** AI Gateway — backwards-compatible wrapper delegating to multi-provider gateway. */

import type { ModelState } from '../dealEngineTypes';
import { callAI } from './ai/gateway';
import { buildProviderConfig } from './ai/providers';
import type { AIResult } from './ai/gateway';
import type { ProviderConfig } from './ai/providers';

export type { AIResult } from './ai/gateway';

/** Legacy entry point — defaults to Anthropic. Use callAI directly for other providers. */
export async function callAnthropic(
  message: string,
  modelState: ModelState,
  chatHistory: { role: string; content: string }[],
  apiKey: string,
): Promise<AIResult> {
  const config = buildProviderConfig('anthropic', apiKey);
  return callAI(message, modelState, chatHistory, config);
}

/** Multi-provider entry point. */
export async function callProvider(
  message: string,
  modelState: ModelState,
  chatHistory: { role: string; content: string }[],
  config: ProviderConfig,
): Promise<AIResult> {
  return callAI(message, modelState, chatHistory, config);
}

export { callAI, buildProviderConfig };
