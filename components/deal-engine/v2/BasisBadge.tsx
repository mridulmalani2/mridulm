/**
 * v2 BasisBadge — the PHASE_E §E1 badge system. Every input surface names where its
 * number came from: FACT (filing) / SUGGESTED·HISTORY / SUGGESTED·CONVENTION /
 * TEMPLATE / AI / YOU / REQUIRED (missing — red). One component so the vocabulary
 * cannot drift per-surface.
 */
import React from 'react';
import type { FieldBasis } from '../../../store/engine2Model';

const mono = "'JetBrains Mono', 'SF Mono', Menlo, monospace";

export type BadgeKind = FieldBasis['kind'] | 'fact' | 'required' | 'ai';

const STYLE: Record<BadgeKind, { label: string; bg: string; fg: string }> = {
  fact: { label: 'FACT', bg: 'rgba(17,17,17,0.08)', fg: '#111' },
  history: { label: 'SUGGESTED · HISTORY', bg: 'rgba(21,93,252,0.10)', fg: '#1d4ed8' },
  convention: { label: 'SUGGESTED · CONVENTION', bg: 'rgba(21,93,252,0.10)', fg: '#1d4ed8' },
  facts: { label: 'FACT', bg: 'rgba(17,17,17,0.08)', fg: '#111' },
  template: { label: 'TEMPLATE', bg: 'rgba(180,120,0,0.12)', fg: '#92600a' },
  ai: { label: 'AI', bg: 'rgba(124,58,237,0.10)', fg: '#6d28d9' },
  user: { label: 'YOU', bg: 'rgba(22,130,73,0.12)', fg: '#166e45' },
  required: { label: 'REQUIRED', bg: 'rgba(204,0,0,0.10)', fg: '#b91c1c' },
};

const BasisBadge: React.FC<{ kind: BadgeKind; detail?: string }> = ({ kind, detail }) => {
  const s = STYLE[kind] ?? STYLE.template;
  return (
    <span
      title={detail}
      className="px-1.5 py-0.5 text-[8px] tracking-widest uppercase whitespace-nowrap"
      style={{ background: s.bg, color: s.fg, fontFamily: mono, letterSpacing: '0.1em' }}
    >
      {s.label}
    </span>
  );
};

export default BasisBadge;
