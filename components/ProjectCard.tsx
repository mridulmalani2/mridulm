import React from 'react';
import { motion } from 'framer-motion';
import { Project, ProjectCategory } from '../types';
import {
  ArrowUpRight,
  Calculator,
  LineChart,
  Bot,
  Globe,
  Plane,
  Gamepad2,
  TrendingUp,
  Compass,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

// One deep, serious accent per category — not a pastel gradient. Category is
// signalled by a single tone on the icon, the rule and a faint tonal wash, in
// the same graph-paper language as the hero.
const CATEGORY_ART: Record<ProjectCategory, { accent: string; icon: LucideIcon }> = {
  finance: { accent: '#2F4B7C', icon: TrendingUp }, // deep navy
  'path-ideas': { accent: '#A25600', icon: Compass }, // deep saffron (brand)
  hobby: { accent: '#1F6F5C', icon: Sparkles }, // deep teal
};

// Same lattice as the hero backdrop, at a tighter pitch for the card scale.
const CARD_GRID =
  'linear-gradient(to right, rgba(26,26,34,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(26,26,34,0.05) 1px, transparent 1px)';

const ICON_BY_TITLE: Record<string, LucideIcon> = {
  'Capital Budgeting Tool': Calculator,
  'Quant Aptitude Platform': LineChart,
  'Donna AI': Bot,
  'Experience India': Globe,
  TourWiseCo: Plane,
  'Judgement with Family': Gamepad2,
};

interface ProjectCardProps {
  project: Project;
  index: number;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, index }) => {
  const art = CATEGORY_ART[project.category];
  const Icon = ICON_BY_TITLE[project.title] ?? art.icon;
  const hasLink = !!project.link && project.link !== '#';

  const handleClick = () => {
    if (hasLink) window.open(project.link, '_blank', 'noopener,noreferrer');
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ delay: (index % 3) * 0.08, duration: 0.5 }}
      viewport={{ once: true, amount: 0.2 }}
      whileHover={hasLink ? { y: -6 } : undefined}
      onClick={handleClick}
      role={hasLink ? 'link' : undefined}
      tabIndex={hasLink ? 0 : undefined}
      onKeyDown={(e) => {
        if (hasLink && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={hasLink ? `${project.title} — open project` : project.title}
      className={`group flex flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm transition-shadow duration-300 ${
        hasLink ? 'cursor-pointer hover:shadow-xl' : ''
      }`}
    >
      {/* Header: graph paper, a single accent tone, no gradient */}
      <div className="relative h-36 overflow-hidden border-b border-ink/10 bg-canvas">
        <div
          className="absolute inset-0"
          style={{ backgroundImage: CARD_GRID, backgroundSize: '28px 28px' }}
        />
        {/* faint tonal wash so categories stay distinguishable at a glance */}
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(130% 110% at 12% 0%, ${art.accent}1A, transparent 68%)`,
          }}
        />
        {/* accent rule along the top edge */}
        <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: art.accent }} />
        {/* Large watermark icon */}
        <Icon
          className="absolute -bottom-7 -left-5"
          style={{ color: `${art.accent}1F` }}
          size={128}
          strokeWidth={1.25}
          aria-hidden="true"
        />
        {/* Icon chip */}
        <div className="absolute left-5 top-6 flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-ink/10">
          <Icon style={{ color: art.accent }} size={20} strokeWidth={2} aria-hidden="true" />
        </div>
        {hasLink && (
          <div className="absolute right-4 top-6 flex h-9 w-9 items-center justify-center rounded-full bg-white opacity-0 -translate-y-1 shadow-sm ring-1 ring-ink/10 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
            <ArrowUpRight className="text-ink" size={16} />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-6">
        {project.domain && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-2">
            {project.domain}
          </span>
        )}
        <h4 className="font-display text-xl font-bold text-ink leading-tight mb-2">
          {project.title}
        </h4>
        <p className="text-sm text-muted leading-relaxed mb-5">{project.story}</p>

        <div className="mt-auto flex flex-wrap gap-2">
          {project.tags?.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-ink/10 bg-canvas px-2.5 py-1 font-montserrat text-[10px] font-semibold uppercase tracking-wider text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </motion.article>
  );
};

export default ProjectCard;
