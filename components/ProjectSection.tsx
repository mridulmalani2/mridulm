import React from 'react';
import { ArrowRight } from 'lucide-react';
import { ProjectSection as ProjectSectionData, ProjectCategory } from '../types';

/**
 * Minimal, posh artwork per card — geometric abstractions of the reference
 * boards rather than photoreal renders: a plinth and rising line for Finance,
 * a constellation of parked notes for Ideas, drifting curves for Hobby.
 * Drawn in the card's own accent at low opacity so nothing shouts.
 */
const Artwork: React.FC<{ id: ProjectCategory; accent: string }> = ({ id, accent }) => {
  if (id === 'finance') {
    return (
      <svg viewBox="0 0 260 260" className="h-full w-full" aria-hidden="true">
        {/* dotted field */}
        <g fill={accent} opacity="0.30">
          {Array.from({ length: 7 }, (_, r) =>
            Array.from({ length: 7 }, (_, c) => (
              <circle key={`${r}-${c}`} cx={18 + c * 13} cy={132 + r * 13} r="1.5" />
            ))
          )}
        </g>
        {/* arc */}
        <path
          d="M56 214 A 84 84 0 0 1 224 214"
          fill="none"
          stroke={accent}
          strokeWidth="1"
          opacity="0.28"
        />
        {/* rising line + node */}
        <path d="M6 246 L 254 26" stroke="#C9A227" strokeWidth="1.25" opacity="0.75" />
        <circle cx="150" cy="136" r="3.5" fill="#C9A227" opacity="0.9" />
        {/* fluted panel */}
        <g stroke={accent} strokeWidth="1" opacity="0.35">
          {Array.from({ length: 11 }, (_, i) => (
            <line key={i} x1={176 + i * 7} y1="112" x2={176 + i * 7} y2="206" />
          ))}
        </g>
        {/* plinth + cube */}
        <path d="M64 214 L 196 214 L 178 230 L 46 230 Z" fill={accent} opacity="0.14" />
        <rect x="96" y="150" width="66" height="64" fill={accent} opacity="0.20" />
        <path d="M96 150 L 112 138 L 178 138 L 162 150 Z" fill={accent} opacity="0.13" />
        <path d="M162 150 L 178 138 L 178 202 L 162 214 Z" fill={accent} opacity="0.26" />
        <circle cx="72" cy="221" r="8" fill="#C9A227" opacity="0.55" />
      </svg>
    );
  }

  if (id === 'path-ideas') {
    return (
      <svg viewBox="0 0 260 260" className="h-full w-full" aria-hidden="true">
        {/* constellation threads */}
        <g fill="none" stroke={accent} strokeWidth="1" strokeDasharray="2 6" opacity="0.42">
          <path d="M18 196 C 70 250, 120 150, 150 96 S 214 40, 244 58" />
          <path d="M34 96 C 90 60, 150 130, 206 108" />
          <path d="M60 240 C 120 210, 130 168, 210 178" />
        </g>
        {/* orbit */}
        <circle cx="132" cy="128" r="46" fill={accent} opacity="0.10" />
        <circle cx="132" cy="128" r="46" fill="none" stroke={accent} strokeWidth="1" opacity="0.25" />
        {/* nodes */}
        <g fill={accent} opacity="0.55">
          <circle cx="150" cy="96" r="3.5" />
          <circle cx="34" cy="96" r="3" />
          <circle cx="206" cy="108" r="3" />
          <circle cx="60" cy="240" r="3" />
        </g>
        {/* parked notes */}
        <g opacity="0.9">
          <rect x="176" y="34" width="60" height="56" rx="2" fill={accent} opacity="0.20" transform="rotate(6 206 62)" />
          <rect x="22" y="176" width="58" height="54" rx="2" fill={accent} opacity="0.14" transform="rotate(-7 51 203)" />
          <rect x="168" y="150" width="62" height="58" rx="2" fill={accent} opacity="0.17" transform="rotate(4 199 179)" />
        </g>
        {/* ruled lines on the notes */}
        <g stroke={accent} strokeWidth="1" opacity="0.35">
          <line x1="188" y1="56" x2="222" y2="52" />
          <line x1="188" y1="68" x2="214" y2="65" />
          <line x1="180" y1="172" x2="214" y2="170" />
          <line x1="180" y1="184" x2="206" y2="183" />
          <line x1="34" y1="198" x2="66" y2="194" />
        </g>
      </svg>
    );
  }

  // hobby
  return (
    <svg viewBox="0 0 260 260" className="h-full w-full" aria-hidden="true">
      {/* drifting ribbons */}
      <g fill="none" stroke={accent} strokeWidth="1.1" opacity="0.38">
        <path d="M2 168 C 66 120, 96 214, 168 168 S 246 92, 258 108" />
        <path d="M6 208 C 74 176, 110 246, 186 200 S 250 148, 258 158" />
        <path d="M20 100 C 78 58, 128 118, 190 74" opacity="0.7" />
      </g>
      {/* card */}
      <g transform="rotate(14 196 62)">
        <rect x="170" y="28" width="52" height="70" rx="4" fill={accent} opacity="0.16" />
        <rect x="170" y="28" width="52" height="70" rx="4" fill="none" stroke={accent} strokeWidth="1" opacity="0.4" />
        <path d="M196 48 C 205 60, 210 66, 202 72 L 190 72 C 182 66, 187 60, 196 48 Z" fill={accent} opacity="0.5" />
      </g>
      {/* mug */}
      <g opacity="0.9">
        <rect x="44" y="176" width="54" height="48" rx="7" fill={accent} opacity="0.16" />
        <path d="M98 190 h 12 a 12 12 0 0 1 0 24 h -12" fill="none" stroke={accent} strokeWidth="2.5" opacity="0.34" />
      </g>
      {/* pencil */}
      <g transform="rotate(38 196 196)">
        <rect x="186" y="160" width="9" height="66" rx="1.5" fill={accent} opacity="0.22" />
        <path d="M186 226 L 195 226 L 190.5 238 Z" fill={accent} opacity="0.45" />
      </g>
      {/* dots */}
      <g fill={accent} opacity="0.4">
        <circle cx="120" cy="104" r="3" />
        <circle cx="146" cy="140" r="2" />
        <circle cx="70" cy="132" r="2.5" />
      </g>
    </svg>
  );
};

interface ProjectSectionProps {
  section: ProjectSectionData;
  count: number;
  open: boolean;
  onToggle: () => void;
}

/**
 * A parallelogram card. The shell is skewed and the content counter-skewed by
 * the same amount, so the silhouette slants while every line of type stays
 * perfectly upright.
 *
 * The skew is desktop-only. A slanted card needs horizontal room proportional
 * to its own height (about 23px a side at mobile proportions), which is more
 * than the gutter allows — it pushed past the viewport and produced a
 * horizontal scrollbar. Stacked full-width, the slant reads as a glitch
 * anyway; it only means something in a row.
 *
 * Transforms live in classes, not inline styles, so the skew composes with the
 * hover lift instead of one overwriting the other.
 */
const ProjectSectionCard: React.FC<ProjectSectionProps> = ({ section, count, open, onToggle }) => (
  <button
    onClick={onToggle}
    aria-expanded={open}
    aria-controls="project-panel"
    className="group block w-full text-left focus-visible:outline-none"
  >
    <div
      className={`relative overflow-hidden border transition-all duration-500 ease-out md:skew-x-[-5deg] ${
        open ? '-translate-y-2' : 'hover:-translate-y-2'
      }`}
      style={{
        background: section.tint,
        borderColor: open ? `${section.accent}59` : 'rgba(26,26,34,0.10)',
        // raised bevel: soft drop shadow plus a lit top edge
        boxShadow: open
          ? `0 26px 54px -26px ${section.accent}66, inset 0 1px 0 rgba(255,255,255,0.95)`
          : '0 16px 38px -26px rgba(26,26,34,0.38), inset 0 1px 0 rgba(255,255,255,0.9)',
      }}
    >
      <div className="flex aspect-[9/13] flex-col p-7 md:skew-x-[5deg] md:p-8">
        {/* index */}
        <span className="font-montserrat text-[11px] font-semibold tracking-[0.2em] text-ink/35">
          {section.index}
        </span>

        {/* title */}
        <h3
          className="mt-5 font-display text-[2.1rem] font-normal leading-[1.05] tracking-tight md:text-[2.5rem]"
          style={{ color: section.accent }}
        >
          {section.title}
        </h3>

        {/* rule */}
        <span
          className="mt-4 block h-[2px] w-9 origin-left transition-all duration-500 group-hover:w-14"
          style={{ background: section.accent, opacity: 0.85 }}
        />

        {/* blurb */}
        <p className="mt-5 max-w-[15rem] text-[0.95rem] leading-relaxed text-ink/70">
          {section.blurb}
        </p>

        {/* artwork fills the middle */}
        <div className="pointer-events-none relative my-4 flex-1">
          <div className="absolute inset-0 flex items-center justify-center">
            <Artwork id={section.id} accent={section.accent} />
          </div>
        </div>

        {/* foot */}
        <div className="flex items-end justify-between gap-4">
          <span
            className="font-montserrat text-[10.5px] font-bold uppercase leading-relaxed tracking-[0.16em]"
            style={{ color: section.accent }}
          >
            {section.tagline}
          </span>
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-500 group-hover:translate-x-1"
            style={{
              color: section.accent,
              background: open ? `${section.accent}1A` : 'transparent',
            }}
          >
            <ArrowRight size={20} className={open ? 'rotate-90' : ''} />
          </span>
        </div>

        {/* count, quietly */}
        <span className="mt-3 font-montserrat text-[10px] uppercase tracking-[0.16em] text-ink/30">
          {count} {count === 1 ? 'project' : 'projects'}
        </span>
      </div>
    </div>
  </button>
);

export default ProjectSectionCard;
