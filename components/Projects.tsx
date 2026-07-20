import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { PROJECTS, PROJECT_SECTIONS } from '../data/projects';
import { ProjectCategory } from '../types';
import ProjectSectionCard from './ProjectSection';
import ProjectCard from './ProjectCard';

const Projects: React.FC = () => {
  // One panel at a time, opened by whichever card was clicked. Null = closed.
  const [openId, setOpenId] = useState<ProjectCategory | null>(null);
  const openSection = PROJECT_SECTIONS.find((s) => s.id === openId) ?? null;
  const openProjects = openId ? PROJECTS.filter((p) => p.category === openId) : [];

  return (
    <div className="page-container section-v-padding relative">
      {/* Section header */}
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.6 }}
        className="mb-12 max-w-2xl md:mb-16"
      >
        <p className="mb-3 font-montserrat text-xs font-bold uppercase tracking-[0.25em] text-muted">
          Featured Work
        </p>
        <h2 className="font-display text-4xl font-black text-ink md:text-6xl">
          Things I've <span className="text-[#A25600]">built</span>
        </h2>
        <p className="mt-4 text-base text-muted md:text-lg">
          Three kinds of work — the finance tools, the ideas still cooking, and the things I
          make for the joy of it. Pick one to see what's inside.
        </p>
      </motion.header>

      {/* Three parallelogram cards. The x-padding gives the skewed corners room
          so they never clip against the container edge. */}
      <div className="grid grid-cols-1 gap-7 sm:grid-cols-2 md:px-5 lg:grid-cols-3 lg:gap-9">
        {PROJECT_SECTIONS.map((section, i) => (
          <motion.div
            key={section.id}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ delay: i * 0.09, duration: 0.55 }}
          >
            <ProjectSectionCard
              section={section}
              count={PROJECTS.filter((p) => p.category === section.id).length}
              open={openId === section.id}
              onToggle={() => setOpenId((cur) => (cur === section.id ? null : section.id))}
            />
          </motion.div>
        ))}
      </div>

      {/* Shared panel — opens below the row for whichever card is active */}
      <div
        id="project-panel"
        className={`grid transition-[grid-template-rows] duration-500 ease-out ${
          openSection ? 'mt-12 grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          {openSection && (
            <div
              className="rounded-2xl border border-ink/10 bg-white/70 p-6 backdrop-blur-sm md:p-9"
              style={{ borderTop: `3px solid ${openSection.accent}` }}
            >
              <div className="mb-8 flex items-start justify-between gap-6">
                <div>
                  <span
                    className="font-montserrat text-[11px] font-bold uppercase tracking-[0.2em]"
                    style={{ color: openSection.accent }}
                  >
                    {openSection.index} — {openSection.title}
                  </span>
                  <p className="mt-3 max-w-3xl font-display text-lg italic leading-relaxed text-ink/75">
                    {openSection.intro}
                  </p>
                </div>
                <button
                  onClick={() => setOpenId(null)}
                  aria-label="Close section"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/10 text-muted transition-colors hover:border-ink/30 hover:text-ink"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {openProjects.map((project, i) => (
                  <ProjectCard key={project.title} project={project} index={i} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Projects;
