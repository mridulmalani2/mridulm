
import React from 'react';
import { CHAPTERS } from '../constants';
import { motion } from 'framer-motion';

const ChapterIndicator: React.FC<{ activeChapterId: string }> = ({ activeChapterId }) => {
  const activeChapter = CHAPTERS.find(c => c.id === activeChapterId) || CHAPTERS[0];

  return (
    <div className="fixed left-8 top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col gap-12 pointer-events-none">
      <div className="flex flex-col gap-2">
        <span className="font-montserrat text-amber-500 text-[9px] font-bold tracking-[0.5em] origin-left rotate-90 whitespace-nowrap mb-8 uppercase">
          CURRENT CHAPTER
        </span>
        <div className="h-40 w-px bg-white/10 relative">
          <motion.div 
            layoutId="active-marker"
            className="absolute top-0 left-0 w-px bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]"
            animate={{ 
              height: `${((CHAPTERS.findIndex(c => c.id === activeChapterId) + 1) / CHAPTERS.length) * 100}%` 
            }}
          />
        </div>
      </div>
      
      <div className="space-y-1">
        <h4 className="font-montserrat text-amber-500 text-[11px] font-bold tracking-widest uppercase">{activeChapter.title}</h4>
        <p className="font-playfair text-white/40 text-lg italic">{activeChapter.subtitle}</p>
      </div>
    </div>
  );
};

export default ChapterIndicator;