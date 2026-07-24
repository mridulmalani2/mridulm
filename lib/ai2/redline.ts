/**
 * lib/ai2/redline.ts — E4 /redline against the new schema: the model CHALLENGES the
 * current assumptions, reading the per-field basis badges and the run's own coherence
 * flags. Output is challenges only — it never edits anything (the user decides).
 */

import type { CoherenceFlag, DealAssumptions } from '../engine2/types';
import type { FieldBasis } from '../../store/engine2Model';
import type { AiTextFn } from './textCall';

export interface RedlineItem {
  path: string;
  challenge: string;
}

export function buildRedlinePrompt(
  assumptions: DealAssumptions,
  basis: Record<string, FieldBasis>,
  coherence: CoherenceFlag[],
): { system: string; user: string } {
  const basisLines = Object.entries(basis).map(([p, b]) => `${p}: [${b.kind}] ${b.detail}`).join('\n');
  return {
    system: `You are a hostile IC reviewer red-lining LBO assumptions. Respond with STRICT JSON only: {"items":[{"path":"<assumption path>","challenge":"<one hard, specific question>"}]}. Challenge weak bases hardest (template > convention > ai > history > facts > user). 3–6 items.`,
    user: `Assumptions: growth ${JSON.stringify(assumptions.operations.growth)}, target margin ${assumptions.operations.target_margin}, entry ${assumptions.entry.entry_multiple}x, exit ${assumptions.exit.multiple}x, hold ${assumptions.entry.hold_years}y, sweep ${assumptions.structure.sweep.base_pct}.\nField bases:\n${basisLines}\nEngine coherence flags:\n${coherence.length ? coherence.map((f) => `${f.severity}: ${f.message}`).join('\n') : 'none'}`,
  };
}

export function parseRedline(rawText: string): RedlineItem[] {
  try {
    const parsed = JSON.parse(rawText.slice(rawText.indexOf('{'))) as { items?: unknown };
    if (Array.isArray(parsed.items)) {
      return (parsed.items as Record<string, unknown>[])
        .filter((i) => typeof i.path === 'string' && typeof i.challenge === 'string')
        .map((i) => ({ path: i.path as string, challenge: i.challenge as string }));
    }
  } catch { /* fall through */ }
  // graceful degradation: surface the raw text as one item rather than losing it
  return rawText.trim() ? [{ path: 'general', challenge: rawText.trim().slice(0, 500) }] : [];
}

export async function runRedline(
  assumptions: DealAssumptions,
  basis: Record<string, FieldBasis>,
  coherence: CoherenceFlag[],
  aiText: AiTextFn,
): Promise<RedlineItem[]> {
  const { system, user } = buildRedlinePrompt(assumptions, basis, coherence);
  return parseRedline(await aiText(system, user));
}
