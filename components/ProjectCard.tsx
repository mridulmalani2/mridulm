import React from 'react';
import { motion } from 'framer-motion';
import { Project } from '../types';
import { ArrowUpRight } from 'lucide-react';

interface ProjectCardProps {
  project: Project;
  index: number;
  /** Total in this section — drives the fan so the spread stays centred. */
  total: number;
}

/**
 * A project board, dealt into a fanned deck.
 *
 * Cards overlap and tilt away from centre like a hand of cards; hovering one
 * straightens it, lifts it and brings it to the front. The overlap and tilt
 * are desktop-only — stacked on a phone they'd just obscure each other.
 *
 * Each board carries its own copy as pixels, so the title and story are
 * supplied as the accessible name rather than relying on the image.
 */
const ProjectCard: React.FC<ProjectCardProps> = ({ project, index, total }) => {
  const hasLink = !!project.link && project.link !== '#';
  // fan out from the centre: leftmost leans left, rightmost leans right
  const mid = (total - 1) / 2;
  const offset = index - mid;
  const tilt = total > 1 ? offset * 2.4 : 0;
  const lift = Math.abs(offset) * 6;

  const Wrapper = hasLink ? 'a' : 'div';

  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ delay: index * 0.08, duration: 0.5 }}
      // `!z-50` is deliberate: the base z-index is an inline style (it varies
      // per card), and inline styles beat plain classes — without !important
      // the hovered card would scale up *behind* its neighbour.
      className="group relative flex-1 md:-ml-[5%] md:first:ml-0 md:hover:!z-50"
      style={{ zIndex: index }}
    >
      <Wrapper
        {...(hasLink
          ? { href: project.link, target: '_blank', rel: 'noopener noreferrer' }
          : {})}
        aria-label={`${project.title} — ${project.story}`}
        className="block focus-visible:outline-none"
      >
        {/* The fan is desktop-only. Driving it through CSS variables keeps it
            responsive — an inline transform would tilt the cards on mobile
            too, where they stack without overlap and a lean just reads as a
            mistake. Both rest and hover set `transform` outright rather than
            mixing with Tailwind's rotate/scale vars, which would fight it. */}
        <div
          className="relative origin-bottom transition-all duration-500 ease-out md:[transform:rotate(var(--tilt))_translateY(var(--lift))] md:group-hover:[transform:rotate(0deg)_translateY(0)_scale(1.05)]"
          style={
            {
              '--tilt': `${tilt}deg`,
              '--lift': `${lift}px`,
            } as React.CSSProperties
          }
        >
          {/* the board itself */}
          <div className="overflow-hidden rounded-xl shadow-[0_16px_34px_-20px_rgba(26,26,34,0.5)] ring-1 ring-ink/10 transition-shadow duration-500 group-hover:shadow-[0_30px_60px_-24px_rgba(26,26,34,0.55)]">
            {project.image ? (
              <img
                src={project.image}
                alt={`${project.title} — ${project.story}`}
                className="block w-full"
                loading="lazy"
              />
            ) : (
              // no board supplied yet — a text card in the same proportions so
              // the deck stays even rather than showing a gap
              <div className="flex aspect-[3/4] flex-col justify-end bg-[#15151C] p-6">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
                  {project.domain}
                </span>
                <h4 className="mt-2 font-display text-2xl font-bold text-white">{project.title}</h4>
                <p className="mt-3 text-sm leading-relaxed text-white/60">{project.story}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {project.tags?.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-white/15 px-2.5 py-1 font-montserrat text-[9px] font-semibold uppercase tracking-wider text-white/55"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* open affordance */}
          {hasLink && (
            <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-ink opacity-0 shadow-sm backdrop-blur-sm transition-all duration-300 group-hover:opacity-100">
              <ArrowUpRight size={16} />
            </span>
          )}
        </div>
      </Wrapper>
    </motion.div>
  );
};

export default ProjectCard;
