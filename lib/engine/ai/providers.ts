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
    model: 'claude-sonnet-4-20250514',
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
    model: 'gemini-2.0-flash',
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
