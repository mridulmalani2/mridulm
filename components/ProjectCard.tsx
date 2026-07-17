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

// Each category gets a pastel gradient + default icon. This is the CSS art that
// replaces the old hotlinked (and partly watermarked) project photos.
const CATEGORY_ART: Record<ProjectCategory, { from: string; to: string; icon: LucideIcon }> = {
  finance: { from: '#8EC5FF', to: '#B9A7FF', icon: TrendingUp }, // sky → lilac
  'path-ideas': { from: '#FFB56B', to: '#FFE580', icon: Compass }, // saffron → lemon
  hobby: { from: '#7FE6C4', to: '#FF9FB6', icon: Sparkles }, // mint → rose
};

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

  // Deterministic per-card variation so the fleet doesn't look identical.
  const angle = 115 + (index % 3) * 20;

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
      {/* CSS-art header */}
      <div
        className="relative h-40 overflow-hidden"
        style={{ background: `linear-gradient(${angle}deg, ${art.from}, ${art.to})` }}
      >
        {/* Rangoli-echo concentric rings */}
        <div
          className="absolute -right-10 -top-10 h-56 w-56 opacity-40"
          style={{
            background:
              'repeating-radial-gradient(circle at center, rgba(255,255,255,0.6) 0 1px, transparent 1px 16px)',
          }}
        />
        {/* Large watermark icon */}
        <Icon
          className="absolute -bottom-6 -left-4 text-white/30"
          size={128}
          strokeWidth={1.25}
          aria-hidden="true"
        />
        {/* Icon chip */}
        <div className="absolute left-5 top-5 flex h-11 w-11 items-center justify-center rounded-xl bg-white/70 backdrop-blur-sm shadow-sm">
          <Icon className="text-ink" size={20} strokeWidth={2} aria-hidden="true" />
        </div>
        {hasLink && (
          <div className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/70 backdrop-blur-sm opacity-0 -translate-y-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
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
