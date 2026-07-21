import React, { useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Project, ProjectStatus } from '../types';

interface ProjectCardProps {
  project: Project;
  index: number;
  /** Section accent — drives the hover glow and the placeholder field. */
  accent: string;
  /** Open the detail popup for this project (cards never redirect). */
  onOpen: (project: Project) => void;
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
  live: 'Live',
  mvp: 'MVP',
  parked: 'Parked',
  building: 'In progress',
};

/**
 * A project tile in the depth gallery.
 *
 * Enters with a stagger — a small deal-tilt that settles flat, a nod to a hand
 * of cards without the old fan's overlap problems. Hover lifts it, deepens the
 * shadow into the section's accent, and tilts gently toward the pointer
 * (skipped for touch and reduced-motion users). Click opens the popup; the
 * link out lives there, never here.
 *
 * Boards carry their copy as pixels, so the accessible name is supplied on the
 * button. A board-less project renders an accent placeholder in the same
 * proportions, keeping the gallery even until its image lands.
 */
const ProjectCard: React.FC<ProjectCardProps> = ({ project, index, accent, onOpen }) => {
  const prefersReduced = useReducedMotion();
  const tiltRef = useRef<HTMLDivElement>(null);

  // Pointer-tracking tilt, written straight to the element so React never
  // re-renders on mousemove. Fine-pointer + motion-ok users only.
  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = tiltRef.current;
    if (!el || prefersReduced || window.matchMedia('(pointer: coarse)').matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-py * 5).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg) translateY(-6px)`;
  };
  const handleLeave = () => {
    const el = tiltRef.current;
    if (el) el.style.transform = '';
  };

  const statusLabel = project.status ? STATUS_LABEL[project.status] : null;

  return (
    <motion.div
      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 30, rotate: index % 2 ? 2 : -2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
      transition={{ delay: 0.08 + index * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <button
        type="button"
        onClick={() => onOpen(project)}
        aria-label={`${project.title} — ${project.story}`}
        aria-haspopup="dialog"
        className="group block w-full text-left focus-visible:outline-none"
      >
        <div
          ref={tiltRef}
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
          className="relative overflow-hidden rounded-xl shadow-[0_16px_34px_-20px_rgba(26,26,34,0.5)] ring-1 ring-ink/10 transition-[transform,box-shadow] duration-300 ease-out group-hover:shadow-[0_30px_60px_-22px_var(--glow)] motion-reduce:!transform-none"
          style={{ '--glow': `${accent}66` } as React.CSSProperties}
        >
          {project.image ? (
            <>
              <img
                src={project.image}
                alt={`${project.title} — ${project.story}`}
                className="block w-full transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:!transform-none"
                loading="lazy"
              />
              {/* hover scrim — surfaces the title + status over the board */}
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-ink/75 via-ink/10 to-transparent p-5 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                {statusLabel && (
                  <span className="mb-2 self-start rounded-full bg-white/85 px-2.5 py-1 font-montserrat text-[9px] font-bold uppercase tracking-[0.16em] text-ink backdrop-blur-sm">
                    {statusLabel}
                  </span>
                )}
                <span className="font-display text-xl font-bold text-white">{project.title}</span>
                <span className="mt-1 inline-flex items-center gap-1 font-montserrat text-[10px] font-semibold uppercase tracking-[0.16em] text-white/75">
                  <Plus size={11} /> Open
                </span>
              </div>
            </>
          ) : (
            // board still in the shop — an accent field in the same
            // proportions, so the gallery stays even until the image lands
            <div
              className="relative flex aspect-[3/4] flex-col justify-between p-6"
              style={{
                background: `linear-gradient(150deg, ${accent} 0%, ${accent}CC 55%, ${accent}99 100%)`,
              }}
            >
              {/* faint drafting grid — reads as "board coming", not "broken" */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.14]"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)',
                  backgroundSize: '28px 28px',
                }}
              />
              <span className="relative font-mono text-[10px] uppercase tracking-[0.2em] text-white/60">
                {project.domain}
              </span>
              <div className="relative">
                {statusLabel && (
                  <span className="mb-3 inline-block rounded-full bg-white/15 px-2.5 py-1 font-montserrat text-[9px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur-sm">
                    {statusLabel}
                  </span>
                )}
                <h4 className="font-display text-2xl font-bold leading-tight text-white">
                  {project.title}
                </h4>
                <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-white/70">
                  {project.story}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 font-montserrat text-[10px] font-semibold uppercase tracking-[0.16em] text-white/80 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Plus size={11} /> Open
                </span>
              </div>
            </div>
          )}
        </div>
      </button>
    </motion.div>
  );
};

export default ProjectCard;
