import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { PROJECTS, PROJECT_SECTIONS } from '../data/projects';
import { Project, ProjectCategory } from '../types';
import ProjectSectionCard from './ProjectSection';
import ProjectCard from './ProjectCard';
import ProjectModal from './ProjectModal';

const CARD_RATIO = 3 / 4; // width / height
const GAP = 16;

/**
 * Given the box the gallery may occupy, find the card height that fits all
 * `n` cards the largest — trying every row count and keeping the roomiest
 * arrangement. Cards stay 3:4, so a taller card is a bigger card. Returns the
 * chosen height and the columns that go with it, so the row can be width-capped
 * to exactly that many (and any short last row centres cleanly).
 */
function fitLayout(n: number, W: number, H: number) {
  let best = { cardH: 0, cols: n };
  for (let rows = 1; rows <= n; rows++) {
    const cols = Math.ceil(n / rows);
    const hByRows = (H - (rows - 1) * GAP) / rows;
    let cardH = hByRows;
    const neededW = cols * (hByRows * CARD_RATIO) + (cols - 1) * GAP;
    if (neededW > W) cardH = (W - (cols - 1) * GAP) / cols / CARD_RATIO; // width-bound
    if (cardH > best.cardH) best = { cardH: Math.floor(cardH), cols };
  }
  return best;
}

/**
 * "Things I've built" — a single stage with two states.
 *
 * Overview shows the three section boards. Picking one dissolves the trio in
 * place and the section's project gallery fades in where they stood — no panel
 * unfolding below, no page jump. On a laptop the gallery sizes its cards to fit
 * the whole set on one screen (a clean, count-aware arrangement rather than a
 * grid that spills); on a phone it falls back to a scrollable two-up grid.
 * Clicking a project never redirects; it opens a popup.
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

  // Wide screens get the fit-to-viewport gallery; narrow ones scroll a 2-up grid.
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const sync = () => setIsWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Measure the gallery box and derive the card size that fits every card.
  // A callback ref (not useRef) so measurement fires when the node actually
  // mounts — AnimatePresence mode="wait" delays that past the state change.
  const [galleryEl, setGalleryEl] = useState<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<{ cardH: number; cols: number } | null>(null);
  useEffect(() => {
    if (!galleryEl || !openSection || !isWide) {
      setLayout(null);
      return;
    }
    const measure = () => {
      const W = galleryEl.clientWidth;
      const H = galleryEl.clientHeight;
      if (W > 0 && H > 0) setLayout(fitLayout(openProjects.length, W, H));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(galleryEl);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [galleryEl, openSection, isWide, openProjects.length]);

  const stageExit = prefersReduced
    ? { opacity: 0 }
    : { opacity: 0, scale: 0.985, filter: 'blur(6px)' };
  const stageEnter = prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 1.01 };

  const rowMaxW =
    layout && `${layout.cols * layout.cardH * CARD_RATIO + (layout.cols - 1) * GAP}px`;

  return (
    <div className="page-container relative w-full py-6">
      {/* Section header — steps aside when a section is open so the gallery
          gets the whole viewport (its own "01 — Finance" header keeps context). */}
      <AnimatePresence initial={false}>
        {!openSection && (
          <motion.header
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
            className="mb-7 max-w-2xl md:mb-9"
          >
            <p className="mb-2 font-montserrat text-xs font-bold uppercase tracking-[0.25em] text-muted">
              Featured Work
            </p>
            <h2 className="font-display text-4xl font-black text-ink md:text-5xl">
              Things I've <span className="text-[#A25600]">built</span>
            </h2>
            <p className="mt-3 text-base text-muted md:text-lg">
              Three kinds of work — the finance tools, the ideas still cooking, and the things
              I make for the joy of it. Pick one to see what's inside.
            </p>
          </motion.header>
        )}
      </AnimatePresence>

      {/* The stage — boards and gallery trade places here.
          min-height keeps the page from jumping during the hand-off. */}
      <div className="relative min-h-[360px]">
        <AnimatePresence mode="wait" initial={false}>
          {!openSection ? (
            /* ── Overview: the three section boards ─────────────────────── */
            <motion.div
              key="overview"
              initial={stageEnter}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={stageExit}
              transition={{ duration: 0.3, ease: [0.32, 0, 0.67, 0] }}
              className="mx-auto grid max-w-3xl grid-cols-3 gap-3 sm:gap-5"
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
              className="mx-auto flex h-[82vh] w-full max-w-5xl flex-col rounded-2xl p-5 md:p-6"
              style={{
                background: `linear-gradient(165deg, ${openSection.accent}14 0%, ${openSection.tint}99 45%, transparent 100%)`,
                boxShadow: `inset 0 0 0 1px ${openSection.accent}1F`,
              }}
            >
              <div className="mb-5 flex shrink-0 flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <button
                    onClick={() => setOpenId(null)}
                    className="mb-3 inline-flex items-center gap-2 font-montserrat text-[11px] font-bold uppercase tracking-[0.2em] text-muted transition-colors hover:text-ink"
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
                    <p className="mt-2 font-display text-base italic leading-relaxed text-ink/75 md:text-lg">
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

              {isWide ? (
                /* Laptop: cards sized so the whole set fits this box, rows
                   centred (a short last row too). */
                <div ref={setGalleryEl} className="relative min-h-0 flex-1">
                  <div
                    className="mx-auto flex h-full flex-wrap items-center justify-center content-center"
                    style={{ maxWidth: rowMaxW || undefined, gap: GAP }}
                  >
                    {layout &&
                      openProjects.map((project, i) => (
                        <ProjectCard
                          key={project.title}
                          project={project}
                          index={i}
                          accent={openSection.accent}
                          heightPx={layout.cardH}
                          onOpen={setActiveProject}
                        />
                      ))}
                  </div>
                </div>
              ) : (
                /* Phone: a clean two-up grid that scrolls if the set is large. */
                <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-y-auto pr-0.5">
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
              )}
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
