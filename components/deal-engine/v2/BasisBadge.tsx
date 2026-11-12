/**
 * v2 BasisBadge — the PHASE_E §E1 badge system. Every input surface names where its
 * number came from: FACT (filing) / SUGGESTED·HISTORY / SUGGESTED·CONVENTION /
 * TEMPLATE / AI / YOU / REQUIRED (missing — red). One component so the vocabulary
 * cannot drift per-surface.
 */
import React from 'react';
import type { FieldBasis } from '../../../store/engine2Model';


export type BadgeKind = FieldBasis['kind'] | 'fact' | 'required' | 'ai';

const STYLE: Record<BadgeKind, { label: string; bg: string; fg: string }> = {
  fact: { label: 'FACT', bg: 'var(--de-sunken)', fg: 'var(--de-ink-2)' },
  history: { label: 'SUGGESTED · HISTORY', bg: 'var(--de-input-soft)', fg: 'var(--de-input)' },
  convention: { label: 'SUGGESTED · CONVENTION', bg: 'var(--de-input-soft)', fg: 'var(--de-input)' },
  facts: { label: 'FACT', bg: 'var(--de-sunken)', fg: 'var(--de-ink-2)' },
  template: { label: 'TEMPLATE', bg: 'var(--de-warn-soft)', fg: 'var(--de-warn)' },
  ai: { label: 'AI', bg: 'var(--de-ai-soft)', fg: 'var(--de-ai)' },
  user: { label: 'YOU', bg: 'var(--de-pos-soft)', fg: 'var(--de-pos)' },
  required: { label: 'REQUIRED', bg: 'var(--de-accent-soft)', fg: 'var(--de-accent)' },
};

const BasisBadge: React.FC<{ kind: BadgeKind; detail?: string }> = ({ kind, detail }) => {
  const s = STYLE[kind] ?? STYLE.template;
  return (
    <span title={detail} className="inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium whitespace-nowrap" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
};

export default BasisBadge;
