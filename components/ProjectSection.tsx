import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Project, ProjectSection as ProjectSectionData, ProjectCategory } from '../types';
import ProjectCard from './ProjectCard';

// One solid accent per category, matching the card headers.
const SECTION_ACCENT: Record<ProjectCategory, string> = {
  finance: '#2F4B7C',
  'path-ideas': '#A25600',
  hobby: '#1F6F5C',
};

interface ProjectSectionProps {
  section: ProjectSectionData;
  projects: Project[];
  defaultOpen?: boolean;
}

const ProjectSectionView: React.FC<ProjectSectionProps> = ({ section, projects, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `section-panel-${section.id}`;

  return (
    <div className="overflow-hidden rounded-3xl border border-ink/10 bg-white/70 backdrop-blur-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-4 p-6 text-left md:p-8"
      >
        <div className="flex items-center gap-4 md:gap-5">
          <span
            className="hidden h-12 w-12 shrink-0 rounded-2xl shadow-sm sm:block"
            style={{ background: SECTION_ACCENT[section.id] }}
            aria-hidden="true"
          />
          <div>
            <div className="font-montserrat text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
              {section.eyebrow}
            </div>
            <h3 className="font-display text-2xl font-bold text-ink md:text-3xl">{section.title}</h3>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <span className="hidden font-montserrat text-xs font-semibold uppercase tracking-wider text-muted sm:inline">
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </span>
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 text-ink transition-transform duration-500 ${
              open ? 'rotate-180' : ''
            }`}
          >
            <ChevronDown size={20} />
          </span>
        </div>
      </button>

      {/* CSS grid-rows expand — animates height with no JS/rAF dependency, and the
          open state renders fully even if the transition itself can't run. */}
      <div
        id={panelId}
        className={`grid transition-[grid-template-rows] duration-500 ease-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-6 pb-8 md:px-8">
            <p className="mb-8 max-w-3xl font-display text-lg italic leading-relaxed text-ink/70">
              {section.intro}
            </p>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project, i) => (
                <ProjectCard key={project.title} project={project} index={i} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectSectionView;
