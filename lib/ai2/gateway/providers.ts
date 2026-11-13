/** AI provider registry, types, and auto-detection. */

export type AIProvider = 'anthropic' | 'openai' | 'google' | 'mistral' | 'groq';

export interface ProviderConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  apiUrl: string;
  displayName: string;
}

export const PROVIDER_DEFAULTS: Record<AIProvider, Omit<ProviderConfig, 'apiKey'>> = {
  anthropic: {
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    apiUrl: 'https://api.anthropic.com/v1/messages',
    displayName: 'Anthropic (Claude)',
  },
  openai: {
    provider: 'openai',
    model: 'gpt-4o',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    displayName: 'OpenAI (ChatGPT)',
  },
  google: {
    provider: 'google',
    model: 'gemini-flash-latest',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    displayName: 'Google (Gemini)',
  },
  mistral: {
    provider: 'mistral',
    model: 'mistral-large-latest',
    apiUrl: 'https://api.mistral.ai/v1/chat/completions',
    displayName: 'Mistral',
  },
  groq: {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
    displayName: 'Groq',
  },
};

/**
 * The models tried for each provider, in order. The assistant's job is to phrase an answer from
 * notes the engine has already written, so a small, fast model is the right one, and it is the
 * one a free key includes. A name the provider has retired falls through to the next.
 */
export const PROVIDER_MODELS: Record<AIProvider, string[]> = {
  anthropic: ['claude-haiku-5-5', 'claude-sonnet-5-5'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
  google: ['gemini-flash-latest', 'gemini-flash-lite-latest'],
  mistral: ['mistral-small-latest', 'mistral-large-latest'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
};

/** Where a key for each provider is created. The first two have a free tier. */
export const PROVIDER_KEY_PAGES: Record<AIProvider, string> = {
  groq: 'console.groq.com/keys',
  google: 'aistudio.google.com/apikey',
  mistral: 'console.mistral.ai',
  anthropic: 'console.anthropic.com',
  openai: 'platform.openai.com',
};

export const PROVIDER_KEY_HINTS: Record<AIProvider, { prefix: string; placeholder: string }> = {
  anthropic: { prefix: 'sk-ant-', placeholder: 'sk-ant-...' },
  openai: { prefix: 'sk-', placeholder: 'sk-...' },
  google: { prefix: 'AI', placeholder: 'AIza...' },
  mistral: { prefix: '', placeholder: 'Your Mistral API key' },
  groq: { prefix: 'gsk_', placeholder: 'gsk_...' },
};

export function detectProvider(apiKey: string): AIProvider {
  const trimmed = apiKey.trim();
  if (trimmed.startsWith('sk-ant-')) return 'anthropic';
  if (trimmed.startsWith('gsk_')) return 'groq';
  if (trimmed.startsWith('AIza')) return 'google';
  // sk- prefix: could be OpenAI or Mistral — default to OpenAI
  if (trimmed.startsWith('sk-')) return 'openai';
  // Mistral keys don't have a consistent prefix
  return 'openai';
}

export function buildProviderConfig(provider: AIProvider, apiKey: string): ProviderConfig {
  return { ...PROVIDER_DEFAULTS[provider], apiKey };
}

export const ALL_PROVIDERS: AIProvider[] = ['anthropic', 'openai', 'google', 'mistral', 'groq'];
