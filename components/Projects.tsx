import React from 'react';
import { motion } from 'framer-motion';
import { PROJECTS, PROJECT_SECTIONS } from '../data/projects';
import ProjectSectionView from './ProjectSection';
import { FinanceMotif } from './AmbientMotifs';

const Projects: React.FC = () => {
  return (
    <div className="page-container section-v-padding relative">
      {/* Ambient motif — the finance thread, drawing itself upward */}
      <FinanceMotif className="right-4 top-16 hidden w-64 lg:block xl:w-80" />
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
          Three kinds of work — the finance tools, the ventures, and the things I make for
          the joy of it. Open a section to see what's inside.
        </p>
      </motion.header>

      {/* Expandable section cards */}
      <div className="flex flex-col gap-5">
        {PROJECT_SECTIONS.map((section, i) => (
          <ProjectSectionView
            key={section.id}
            section={section}
            projects={PROJECTS.filter((p) => p.category === section.id)}
            defaultOpen={i === 0}
          />
        ))}
      </div>
    </div>
  );
};

export default Projects;
