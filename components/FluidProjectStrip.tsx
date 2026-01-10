import React from 'react';
import { motion } from 'framer-motion';
import { Project } from '../types';

interface FluidProjectStripProps {
  project: Project;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
}

const FluidProjectStrip: React.FC<FluidProjectStripProps> = ({ project, isHovered, onHover, onLeave }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (project.link) {
      window.open(project.link, '_blank', 'noopener,noreferrer');
    }
  };

  const displayImage = project.highlightImageUrl || project.imageUrl;
  
  // Adaptive font scaling: Ensures text fits in single line with 10% margins on each side
  const charCount = project.name.length;
  // Calculate font size to fit text in 80% width (10% margin each side)
  // More aggressive scaling for longer text to ensure single-line display
  const fontScale = isHovered ? (65 / (charCount * 0.55)) : (35 / (charCount * 0.55));

  return (
    <motion.div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={handleClick}
      role="article"
      aria-label={`Project: ${project.name}`}
      animate={{
        flex: isHovered ? 2.8 : 1,
      }}
      transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1.0] }}
      className="relative flex-1 h-full min-h-[280px] sm:min-h-[33vh] md:min-h-0 overflow-hidden cursor-pointer group border-b md:border-b-0 md:border-r border-white/5 last:border-0"
      style={{ containerType: 'inline-size' } as React.CSSProperties}
    >
      {/* Background Image - Cinematic Filter */}
      <motion.img
        src={displayImage}
        alt={project.name}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover"
        animate={{ 
          scale: isHovered ? 1.03 : 1,
          filter: isHovered ? "brightness(0.6)" : "brightness(0.3)" 
        }}
        transition={{ duration: 1.2 }}
      />

      {/* Content Overlay with 10% margins */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-[10%]">
        <motion.div
          animate={{ y: isHovered ? -15 : 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full h-full flex flex-col items-center justify-center"
        >
          {/* Dynamic Scaling Title - Single Line with Adaptive Font */}
          <div className="w-full flex items-center justify-center mb-4 sm:mb-6 md:mb-12 min-h-[80px] sm:min-h-[12vh] md:min-h-[18vh]">
            <motion.h3
              className="font-montserrat font-black text-white uppercase drop-shadow-[0_10px_40px_rgba(0,0,0,1)] tracking-[0.05em] text-center whitespace-nowrap px-2"
              animate={{
                fontSize: `clamp(0.85rem, ${fontScale}cqw, ${isHovered ? '10vh' : '4vh'})`,
                opacity: 1,
                lineHeight: 1
              }}
              transition={{ duration: 0.5, ease: "circOut" }}
            >
              {project.name}
            </motion.h3>
          </div>
          
          {/* Action Button */}
          <div className="relative">
            <motion.button
              animate={{
                scale: isHovered ? 1 : 0.8,
                paddingLeft: isHovered ? "2.5rem" : "1.5rem",
                paddingRight: isHovered ? "2.5rem" : "1.5rem",
                opacity: isHovered ? 1 : 0.5
              }}
              className="bg-white text-black font-montserrat text-[10px] tracking-widest font-black uppercase py-3 sm:py-3 border border-white transition-all duration-300 min-h-[44px] sm:min-h-[48px]"
            >
              View Project →
            </motion.button>
          </div>
        </motion.div>
      </div>

      {/* Visual Progress Bar */}
      <motion.div 
        className="absolute bottom-0 left-0 h-1 bg-amber-500/80 z-20"
        initial={{ width: 0 }}
        animate={{ width: isHovered ? '100%' : '0%' }}
        transition={{ duration: 0.6 }}
      />
    </motion.div>
  );
};

export default FluidProjectStrip;