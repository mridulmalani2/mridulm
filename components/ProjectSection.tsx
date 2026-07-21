import React from 'react';
import { ArrowRight } from 'lucide-react';
import { ProjectSection as ProjectSectionData } from '../types';

interface ProjectSectionProps {
  section: ProjectSectionData;
  count: number;
  onOpen: () => void;
}

/**
 * A section board, cropped to a parallelogram.
 *
 * The artwork is the supplied board image, untouched — the slant comes from a
 * clip-path on the frame rather than a skew, so nothing is distorted and the
 * board's own edge text stays inside the crop. The raise is a drop-shadow
 * filter on the wrapper, because clip-path would clip a box-shadow away.
 *
 * Picking a board dissolves the trio and brings that section's gallery in —
 * so the hover states here lean into "enter": lift, an accent-tinted glow,
 * and an explicit Enter hint alongside the project count.
 *
 * The board carries its own title and copy as pixels, so the accessible name
 * is supplied here for screen readers.
 */
const ProjectSectionCard: React.FC<ProjectSectionProps> = ({ section, count, onOpen }) => (
  <button
    onClick={onOpen}
    aria-label={`${section.title} — ${section.blurb} (${count} ${count === 1 ? 'project' : 'projects'})`}
    className="group block w-full text-left focus-visible:outline-none"
  >
    <div
      className="transition-all duration-500 ease-out [filter:drop-shadow(0_14px_26px_rgba(26,26,34,0.22))] hover:-translate-y-2 hover:[filter:drop-shadow(0_22px_34px_var(--glow))] motion-reduce:transform-none"
      style={{ '--glow': `${section.accent}4D` } as React.CSSProperties}
    >
      <div className="parallelogram relative">
        {/* eager: these three boards are the section's whole visual and sit
            just under the fold, so lazy-loading only makes them pop in late */}
        <img
          src={`/sections/${section.id === 'path-ideas' ? 'parked' : section.id}.jpg`}
          alt=""
          className="block w-full"
          decoding="async"
        />

        {/* wash in the section's accent, deepening on hover */}
        <div
          className="absolute inset-0 opacity-35 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background: `linear-gradient(to top, ${section.accent}2E, transparent 46%)`,
          }}
        />

        {/* The board is a finished design — it already carries its own tagline
            and arrow along the foot. So the additions stay in the empty
            top-right corner: the count, joined on hover by the enter hint. */}
        <span
          className="absolute right-4 top-4 rounded-full bg-white/66 px-3 py-1.5 font-montserrat text-[10px] font-bold uppercase tracking-[0.16em] backdrop-blur-sm transition-all duration-500 md:right-6"
          style={{ color: section.accent }}
        >
          {count} {count === 1 ? 'project' : 'projects'}
        </span>
        <span
          className="absolute right-4 top-14 inline-flex translate-y-1 items-center gap-1.5 rounded-full px-3 py-1.5 font-montserrat text-[10px] font-bold uppercase tracking-[0.16em] text-white opacity-0 backdrop-blur-sm transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 md:right-6"
          style={{ background: `${section.accent}D9` }}
        >
          Enter <ArrowRight size={11} />
        </span>
      </div>
    </div>
  </button>
);

export default ProjectSectionCard;
