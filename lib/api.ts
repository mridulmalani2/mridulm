/** Typed API client for all Deal Engine endpoints. */

import type { ModelState, SensitivityTable, ScenarioSet, AppliedDiff, AIAnalysis } from './dealEngineTypes';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

let sessionId: string | null = null;

function headers(apiKey?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionId) h['X-Session-ID'] = sessionId;
  if (apiKey) h['X-Anthropic-Key'] = apiKey;
  return h;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function initializeModel(inputs: {
  deal_name: string;
  revenue: number;
  ebitda_or_margin: number;
  entry_multiple: number;
  currency: string;
  sector: string;
}): Promise<{ session_id: string; model_state: ModelState }> {
  const res = await fetch(`${API_BASE}/api/model/initialize`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(inputs),
  });
  const data = await handleResponse<{ session_id: string; model_state: ModelState }>(res);
  sessionId = data.session_id;
  return data;
}

export async function updateField(path: string, value: unknown): Promise<{ model_state: ModelState }> {
  const res = await fetch(`${API_BASE}/api/model/update`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ field_path: path, value }),
  });
  return handleResponse(res);
}

export async function recalculate(state: ModelState): Promise<{ model_state: ModelState }> {
  const res = await fetch(`${API_BASE}/api/model/recalculate`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(state),
  });
  return handleResponse(res);
}

export async function sendChat(
  message: string,
  modelState: ModelState,
  chatHistory: { role: string; content: string }[],
  apiKey: string,
): Promise<{
  model_state: ModelState;
  ai_response: AIAnalysis;
  applied_diffs: AppliedDiff[];
  intent: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/api/ai/chat`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ message, model_state: modelState, chat_history: chatHistory }),
  });
  return handleResponse(res);
}

export async function generateAssumptions(
  toggledFields: string[],
  modelState: ModelState,
  apiKey: string,
): Promise<{ model_state: ModelState; rationale: string }> {
  const res = await fetch(`${API_BASE}/api/ai/generate-assumptions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ toggled_fields: toggledFields, model_state: modelState }),
  });
  return handleResponse(res);
}

export async function getScenarios(): Promise<{ scenarios: ScenarioSet[] }> {
  const res = await fetch(`${API_BASE}/api/model/scenarios`, { headers: headers() });
  return handleResponse(res);
}

export async function getSensitivity(tableId: number): Promise<{ table: SensitivityTable }> {
  const res = await fetch(`${API_BASE}/api/model/sensitivity/${tableId}`, { headers: headers() });
  return handleResponse(res);
}

export async function exportExcel(): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/export/excel`, {
    method: 'POST',
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res.blob();
}

export async function exportJson(): Promise<ModelState> {
  const res = await fetch(`${API_BASE}/api/model/export/json`, { headers: headers() });
  return handleResponse(res);
}

export async function importJson(state: ModelState): Promise<{ model_state: ModelState }> {
  const res = await fetch(`${API_BASE}/api/model/import/json`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(state),
  });
  const data = await handleResponse<{ session_id: string; model_state: ModelState }>(res);
  sessionId = data.session_id;
  return data;
}
