
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
      whileHover={{ scale: 1.02 }}
      onClick={handleClick}
      className="relative group cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm aspect-[4/5]"
    >
      {/* Background Image - Grayscale removed per user request */}
      <img 
        src={project.imageUrl} 
        alt={project.name} 
        className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-1000 group-hover:scale-110"
      />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent p-8 flex flex-col justify-end">
        
        {/* Tags Container */}
        <div className="flex flex-wrap gap-2 mb-4">
          {project.tags?.map((tag, i) => (
            <span 
              key={i} 
              className="px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[9px] font-montserrat font-bold text-amber-500/80 tracking-widest uppercase"
            >
              {tag}
            </span>
          ))}
        </div>

        <h3 className="font-playfair text-3xl md:text-4xl italic mb-3 text-white group-hover:text-amber-500 transition-colors duration-500">
          {project.name}
        </h3>
        
        <p className="text-white/70 text-sm font-montserrat font-light leading-relaxed line-clamp-3 mb-6">
          {project.story}
        </p>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <span className="font-montserrat text-[10px] tracking-[0.3em] font-bold text-amber-500 uppercase">
            EXPLORE
          </span>
          <ExternalLink size={12} className="text-amber-500" />
        </div>
      </div>

      {/* Subtle Frame Glow */}
      <div className="absolute inset-0 border border-amber-500/0 group-hover:border-amber-500/20 transition-all duration-700 pointer-events-none rounded-2xl" />
    </motion.div>
  );
};

export default ProjectCard;
