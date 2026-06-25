import React from 'react';
import type { Provenance } from '../../../lib/edgar/types';

/**
 * Source badge for a populated input (Phase 1). Shows WHERE a value came from — EDGAR (with a
 * link to the filing), AI-suggested, user-edited, or a default — so every number on the
 * assumptions review and the model screen is auditable and nothing is silently assumed.
 */

const STYLES: Record<Provenance['source'], { label: string; color: string; border: string; bg: string }> = {
  edgar:   { label: 'EDGAR',   color: '#15803d', border: 'rgba(21,128,61,0.35)',  bg: 'rgba(21,128,61,0.06)' },
  ai:      { label: 'AI',      color: '#CC0000', border: 'rgba(204,0,0,0.30)',    bg: 'rgba(204,0,0,0.05)' },
  user:    { label: 'YOU',     color: '#111111', border: 'rgba(17,17,17,0.30)',   bg: 'rgba(17,17,17,0.04)' },
  default: { label: 'DEFAULT', color: '#b45309', border: 'rgba(180,83,9,0.30)',   bg: 'rgba(180,83,9,0.05)' },
};

const mono = "'JetBrains Mono', monospace";

const ProvenanceBadge: React.FC<{ provenance?: Provenance; showDetail?: boolean }> = ({ provenance, showDetail }) => {
  if (!provenance) return null;
  const s = STYLES[provenance.source];
  const chip = (
    <span
      className="inline-flex items-center px-1.5 py-[1px] text-[8px] tracking-widest uppercase"
      style={{ color: s.color, border: `1px solid ${s.border}`, background: s.bg, fontFamily: mono, letterSpacing: '0.08em' }}
      title={provenance.detail}
    >
      {s.label}
      {provenance.url && <span style={{ marginLeft: 3, opacity: 0.7 }}>↗</span>}
    </span>
  );

  return (
    <span className="inline-flex items-center gap-1.5">
      {provenance.url ? (
        <a href={provenance.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }} title={`Open filing — ${provenance.detail}`}>
          {chip}
        </a>
      ) : chip}
      {showDetail && (
        <span className="text-[9px] truncate" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: mono, maxWidth: 220 }}>
          {provenance.detail}
        </span>
      )}
    </span>
  );
};

export default ProvenanceBadge;
