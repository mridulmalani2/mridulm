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
  
  // Production-grade font scaling: Adjusts based on character length and container width
  const charCount = project.name.length;
  // cqw = container query width units
  const fontScale = isHovered ? (85 / (charCount * 0.7)) : (45 / (charCount * 0.7));

  return (
    <motion.div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={handleClick}
      animate={{ 
        flex: isHovered ? 2.8 : 1,
      }}
      transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1.0] }}
      className="relative flex-1 h-full min-h-[33vh] md:min-h-0 overflow-hidden cursor-pointer group border-b md:border-b-0 md:border-r border-white/5 last:border-0"
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

      {/* Content Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 md:px-8">
        <motion.div
          animate={{ y: isHovered ? -15 : 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full h-full flex flex-col items-center justify-center"
        >
          {/* Dynamic Scaling Title */}
          <div className="w-full flex items-center justify-center mb-6 md:mb-12 min-h-[12vh] md:min-h-[18vh]">
            <motion.h3 
              className="font-montserrat font-black text-white uppercase drop-shadow-[0_10px_40px_rgba(0,0,0,1)] tracking-[0.05em] text-center whitespace-nowrap overflow-hidden text-ellipsis px-2"
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
                opacity: isHovered ? 1 : 0.3
              }}
              className="bg-white text-black font-montserrat text-[10px] tracking-[0.5em] font-black uppercase py-3 border border-white transition-all duration-300"
            >
              ENTER
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