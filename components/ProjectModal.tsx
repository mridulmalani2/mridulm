import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, X } from 'lucide-react';
import { Project, ProjectSection, ProjectStatus } from '../types';

interface ProjectModalProps {
  project: Project;
  section: ProjectSection;
  onClose: () => void;
}

/** Chip copy + how strongly the link is offered, per status. */
const STATUS_META: Record<ProjectStatus, { label: string; dotClass: string }> = {
  live: { label: 'Live', dotClass: 'bg-emerald-500' },
  mvp: { label: 'MVP', dotClass: 'bg-sky-500' },
  parked: { label: 'Parked', dotClass: 'bg-amber-500' },
  building: { label: 'In progress', dotClass: 'bg-violet-500' },
};

/**
 * The project popup — opens instead of redirecting.
 *
 * Warm-canvas cousin of the deal engine's MemoModal: blurred cream backdrop,
 * click-outside and Esc to close, scroll locked underneath. The board image
 * (or its accent placeholder) heads the card; the body carries the story in
 * the owner's voice plus an honest status note where one exists. The link out
 * lives here, as a deliberate action rather than a surprise redirect.
 */
const ProjectModal: React.FC<ProjectModalProps> = ({ project, section, onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Esc to close + lock the page scroll + move focus in (and back out on unmount).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [onClose]);

  const status = project.status ? STATUS_META[project.status] : null;
  const hasLink = !!project.link && project.link !== '#';
  const mutedLink = project.status === 'parked';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
      style={{ background: 'rgba(253,252,250,0.82)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 26, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        role="dialog"
        aria-modal="true"
        aria-label={project.title}
        className="relative flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-[0_40px_90px_-30px_rgba(26,26,34,0.45)] ring-1 ring-ink/10"
        style={{ borderTop: `3px solid ${section.accent}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-muted shadow-sm backdrop-blur-sm transition-colors hover:text-ink"
        >
          <X size={16} />
        </button>

        <div className="overflow-y-auto">
          {/* Hero — the board itself, or its accent stand-in */}
          {project.image ? (
            <img
              src={project.image}
              alt=""
              className="block max-h-64 w-full object-cover object-top"
            />
          ) : (
            <div
              className="flex h-36 items-end p-6"
              style={{
                background: `linear-gradient(135deg, ${section.accent} 0%, ${section.accent}B8 60%, ${section.accent}8C 100%)`,
              }}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/70">
                {section.index} — {section.title}
              </span>
            </div>
          )}

          <div className="p-6 md:p-8">
            {/* Eyebrow: domain + status chip */}
            <div className="mb-3 flex flex-wrap items-center gap-3">
              {project.domain && (
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                  {project.domain}
                </span>
              )}
              {status && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-canvas px-2.5 py-1 font-montserrat text-[10px] font-bold uppercase tracking-[0.14em] text-ink/70">
                  <span className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`} />
                  {status.label}
                </span>
              )}
            </div>

            <h3 className="font-display text-2xl font-black text-ink md:text-3xl">
              {project.title}
            </h3>

            <p className="mt-4 font-lora text-[15px] leading-relaxed text-ink/80">
              {project.detail ?? project.story}
            </p>

            {project.statusNote && (
              <div
                className="mt-5 rounded-lg border-l-2 bg-canvas p-4"
                style={{ borderLeftColor: section.accent }}
              >
                <p className="text-sm leading-relaxed text-muted">{project.statusNote}</p>
              </div>
            )}

            {project.tags && project.tags.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {project.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-ink/10 px-2.5 py-1 font-montserrat text-[9px] font-semibold uppercase tracking-wider text-muted"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            {hasLink && (
              <div className="mt-7">
                {mutedLink ? (
                  <a
                    href={project.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 border-b border-ink/20 pb-0.5 font-montserrat text-xs font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:border-ink/50 hover:text-ink"
                  >
                    View anyway <ArrowUpRight size={13} />
                  </a>
                ) : (
                  <a
                    href={project.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-montserrat text-xs font-bold uppercase tracking-[0.14em] text-white transition-transform hover:-translate-y-0.5"
                    style={{ background: section.accent }}
                  >
                    Visit site <ArrowUpRight size={14} />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ProjectModal;
