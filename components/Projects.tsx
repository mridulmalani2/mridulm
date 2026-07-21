import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { PROJECTS, PROJECT_SECTIONS } from '../data/projects';
import { Project, ProjectCategory } from '../types';
import ProjectSectionCard from './ProjectSection';
import ProjectCard from './ProjectCard';
import ProjectModal from './ProjectModal';

/**
 * "Things I've built" — a single stage with two states.
 *
 * Overview shows the three section boards. Picking one dissolves the trio in
 * place (quick fade + shrink + blur) and the section's project gallery fades
 * in where they stood — no panel unfolding below, no page jump. A back
 * control reverses it. Clicking a project never redirects; it opens a popup
 * with the story, the honest status, and the link out as a deliberate action.
 */
const Projects: React.FC = () => {
  const [openId, setOpenId] = useState<ProjectCategory | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const prefersReduced = useReducedMotion();

  const openSection = PROJECT_SECTIONS.find((s) => s.id === openId) ?? null;
  const openProjects = openId ? PROJECTS.filter((p) => p.category === openId) : [];
  const activeSection = activeProject
    ? PROJECT_SECTIONS.find((s) => s.id === activeProject.category) ?? null
    : null;

  // Reduced motion: plain crossfade. Otherwise a quick clean dissolve —
  // the outgoing state shrinks and blurs slightly as it fades.
  const stageExit = prefersReduced
    ? { opacity: 0 }
    : { opacity: 0, scale: 0.985, filter: 'blur(6px)' };
  const stageEnter = prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 1.01 };

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

      {/* The stage — boards and gallery trade places here.
          min-height keeps the page from jumping during the hand-off. */}
      <div className="relative min-h-[380px]">
        <AnimatePresence mode="wait" initial={false}>
          {!openSection ? (
            /* ── Overview: the three section boards ─────────────────────── */
            <motion.div
              key="overview"
              initial={stageEnter}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={stageExit}
              transition={{ duration: 0.3, ease: [0.32, 0, 0.67, 0] }}
              className="grid grid-cols-1 gap-7 sm:grid-cols-2 md:px-5 lg:grid-cols-3 lg:gap-9"
            >
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
                    onOpen={() => setOpenId(section.id)}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            /* ── Open: the section's project gallery, in the boards' place ─ */
            <motion.div
              key={openSection.id}
              initial={stageEnter}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={stageExit}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl p-6 md:p-9"
              style={{
                // a soft wash of the section's accent focuses the stage
                // without leaving the warm palette
                background: `linear-gradient(165deg, ${openSection.accent}14 0%, ${openSection.tint}99 45%, transparent 100%)`,
                boxShadow: `inset 0 0 0 1px ${openSection.accent}1F`,
              }}
            >
              <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
                <div className="max-w-3xl">
                  <button
                    onClick={() => setOpenId(null)}
                    className="mb-4 inline-flex items-center gap-2 font-montserrat text-[11px] font-bold uppercase tracking-[0.2em] text-muted transition-colors hover:text-ink"
                  >
                    <ArrowLeft size={13} /> All work
                  </button>
                  <div>
                    <span
                      className="font-montserrat text-[11px] font-bold uppercase tracking-[0.2em]"
                      style={{ color: openSection.accent }}
                    >
                      {openSection.index} — {openSection.title}
                    </span>
                    <p className="mt-3 font-display text-lg italic leading-relaxed text-ink/75">
                      {openSection.intro}
                    </p>
                  </div>
                </div>
                <span
                  className="mt-1 shrink-0 rounded-full px-3 py-1.5 font-montserrat text-[10px] font-bold uppercase tracking-[0.16em]"
                  style={{ color: openSection.accent, background: `${openSection.accent}1A` }}
                >
                  {openProjects.length} {openProjects.length === 1 ? 'project' : 'projects'}
                </span>
              </div>

              <div
                className={`grid grid-cols-1 gap-7 sm:grid-cols-2 ${
                  openProjects.length >= 3 ? 'lg:grid-cols-3' : ''
                }`}
              >
                {openProjects.map((project, i) => (
                  <ProjectCard
                    key={project.title}
                    project={project}
                    index={i}
                    accent={openSection.accent}
                    onOpen={setActiveProject}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* The project popup */}
      <AnimatePresence>
        {activeProject && activeSection && (
          <ProjectModal
            project={activeProject}
            section={activeSection}
            onClose={() => setActiveProject(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Projects;
