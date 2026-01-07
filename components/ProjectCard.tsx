
import React from 'react';
import { motion } from 'framer-motion';
import { Project } from '../types';
import { ExternalLink } from 'lucide-react';

interface ProjectCardProps {
  project: Project;
  index: number;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, index }) => {
  const handleClick = () => {
    if (project.link) {
      window.open(project.link, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.8 }}
      viewport={{ once: true }}
      whileHover={{
        scale: 1.02,
        y: -8,
        boxShadow: '0 20px 60px rgba(245, 158, 11, 0.2)',
        borderColor: 'rgba(245, 158, 11, 0.3)'
      }}
      onClick={handleClick}
      className="relative group cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm aspect-[4/5] transition-all duration-500"
    >
      {/* Background Image */}
      <motion.img
        src={project.imageUrl}
        alt={project.name}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
        initial={{ opacity: 0.6, scale: 1 }}
        whileHover={{ opacity: 1, scale: 1.1 }}
        transition={{ duration: 0.6 }}
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent p-8 flex flex-col justify-end">
        {/* Ambient Glow */}
        <div className="absolute inset-0 bg-gradient-to-t from-amber-500/0 via-transparent to-transparent opacity-0 group-hover:opacity-20 group-hover:from-amber-500/40 transition-all duration-500" />

        <div className="relative z-10">
          {/* Tags Container */}
          <div className="flex flex-wrap gap-2 mb-4">
            {project.tags?.map((tag, i) => (
              <motion.span
                key={i}
                whileHover={{ scale: 1.05 }}
                className="px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[9px] font-montserrat font-bold text-amber-500/80 tracking-widest uppercase backdrop-blur-sm"
              >
                {tag}
              </motion.span>
            ))}
          </div>

          <h3 className="font-playfair text-3xl md:text-4xl italic mb-3 text-white group-hover:text-amber-500 transition-colors duration-500">
            {project.name}
          </h3>

          <p className="text-white/70 text-sm font-montserrat font-light leading-relaxed line-clamp-3 mb-6 group-hover:text-white/90 transition-colors">
            {project.story}
          </p>

          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-500">
            <span className="font-montserrat text-[10px] tracking-[0.3em] font-bold text-amber-500 uppercase">
              EXPLORE
            </span>
            <motion.div
              animate={{ x: [0, 4, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <ExternalLink size={12} className="text-amber-500" />
            </motion.div>
          </div>
        </div>
      </div>

      {/* Subtle Frame Glow */}
      <div className="absolute inset-0 border border-amber-500/0 group-hover:border-amber-500/30 transition-all duration-700 pointer-events-none rounded-2xl" />

      {/* Corner Accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-500/0 to-transparent opacity-0 group-hover:opacity-30 transition-opacity duration-500 rounded-2xl" />
    </motion.div>
  );
};

export default ProjectCard;
