import React from 'react';
import { ProjectSection as ProjectSectionData } from '../types';

interface ProjectSectionProps {
  section: ProjectSectionData;
  count: number;
  open: boolean;
  onToggle: () => void;
}

/**
 * A section board, cropped to a parallelogram.
 *
 * The artwork is the supplied board image, untouched — the slant comes from a
 * clip-path on the frame rather than a skew, so nothing is distorted and the
 * board's own edge text stays inside the crop. The raise is a drop-shadow
 * filter on the wrapper, because clip-path would clip a box-shadow away.
 *
 * The board carries its own title and copy as pixels, so the accessible name
 * is supplied here for screen readers.
 */
const ProjectSectionCard: React.FC<ProjectSectionProps> = ({ section, count, open, onToggle }) => (
  <button
    onClick={onToggle}
    aria-expanded={open}
    aria-controls="project-panel"
    aria-label={`${section.title} — ${section.blurb} (${count} ${count === 1 ? 'project' : 'projects'})`}
    className="group block w-full text-left focus-visible:outline-none"
  >
    <div
      className={`transition-all duration-500 ease-out ${open ? '-translate-y-2' : 'hover:-translate-y-2'}`}
      style={{
        filter: open
          ? `drop-shadow(0 22px 34px ${section.accent}4D)`
          : 'drop-shadow(0 14px 26px rgba(26,26,34,0.22))',
      }}
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

        {/* wash in the section's accent, deepening when it's the open one */}
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            background: `linear-gradient(to top, ${section.accent}2E, transparent 46%)`,
            opacity: open ? 1 : 0.35,
          }}
        />

        {/* The board is a finished design — it already carries its own tagline
            and arrow along the foot. So the only thing added is the project
            count, in the empty top-right corner opposite the board's index. */}
        <span
          className="absolute right-4 top-4 rounded-full px-3 py-1.5 font-montserrat text-[10px] font-bold uppercase tracking-[0.16em] backdrop-blur-sm transition-all duration-500 md:right-6"
          style={{
            color: section.accent,
            background: open ? `${section.accent}24` : 'rgba(255,255,255,0.66)',
          }}
        >
          {count} {count === 1 ? 'project' : 'projects'}
        </span>
      </div>
    </div>
  </button>
);

export default ProjectSectionCard;
