
import React, { useEffect, useState } from 'react';
import { Project } from '../types';
import { fetchProjects } from '../services/csvService';
import ProjectCard from './ProjectCard';
import FluidProjectStrip from './FluidProjectStrip';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';

const Projects: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchProjects()
      .then(setProjects)
      .finally(() => setIsLoading(false));
  }, []);

  const highlightProjects = projects.slice(0, 3);

  if (isLoading) {
    return (
      <div className="relative h-screen bg-black flex items-center justify-center">
        <div className="flex gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="w-64 h-96 bg-white/5 animate-pulse rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="relative h-screen md:min-h-screen bg-black overflow-hidden flex flex-col">
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          <motion.div
            key="highlights"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="h-full w-full flex relative flex-col md:flex-row"
          >
            {highlightProjects.map((p, i) => (
              <FluidProjectStrip
                key={p.name}
                project={p}
                isHovered={hoveredIndex === i}
                onHover={() => setHoveredIndex(i)}
                onLeave={() => setHoveredIndex(null)}
              />
            ))}

            {/* Load More Trigger */}
            <div className="absolute bottom-12 left-0 right-0 z-30 flex justify-center px-6 pointer-events-none">
              <motion.button
                onClick={() => setIsExpanded(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex flex-col items-center gap-2 group cursor-pointer pointer-events-auto min-h-[48px]"
                aria-label="Explore more projects"
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="font-montserrat text-[11px] md:text-sm tracking-widest font-black text-white group-hover:text-amber-500 transition-colors uppercase drop-shadow-[0_4px_12px_rgba(0,0,0,1)] text-center">
                    EXPLORE MORE PROJECTS
                  </span>
                  <span className="font-montserrat text-[8px] md:text-[10px] tracking-widest font-medium text-white/60 group-hover:text-white/80 transition-colors uppercase drop-shadow-md text-center">
                    OR SCROLL TO CONTINUE
                  </span>
                </div>
                <ChevronDown className="text-white/60 group-hover:text-amber-500 transition-colors animate-bounce" size={20} />
              </motion.button>
            </div>

            {/* Section Label */}
            <div className="absolute top-28 md:top-36 left-0 right-0 md:left-12 md:right-auto z-30 pointer-events-none text-center md:text-left px-6">
              <h2 className="font-montserrat text-amber-500 tracking-widest text-[10px] md:text-[12px] font-black mb-2 uppercase drop-shadow-lg">FEATURED WORK</h2>
              <h3 className="font-playfair text-3xl md:text-5xl text-white italic opacity-95 drop-shadow-2xl">The Highlights</h3>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="grid"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="min-h-screen py-32 px-6 max-w-7xl mx-auto w-full flex flex-col"
          >
            <div className="mb-20 flex flex-col md:flex-row justify-between items-center md:items-end gap-10 text-center md:text-left">
              <div>
                <h2 className="font-montserrat text-amber-500/80 tracking-widest text-sm font-semibold mb-4 uppercase">All Projects</h2>
                <h3 className="font-playfair text-5xl md:text-7xl italic leading-tight">What I've Built</h3>
              </div>
              <motion.button
                onClick={() => {
                  setIsExpanded(false);
                  document.getElementById('projects')?.scrollIntoView({ behavior: 'smooth' });
                }}
                whileHover={{ x: -10 }}
                className="flex items-center gap-4 group mb-4 order-first md:order-last min-h-[48px]"
                aria-label="Return to highlights view"
              >
                <ChevronUp className="text-amber-500 group-hover:animate-bounce" />
                <span className="font-montserrat text-[10px] tracking-widest font-bold text-white/60 group-hover:text-white uppercase">Back to Highlights</span>
              </motion.button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
              {projects.map((p, i) => (
                <ProjectCard key={p.name} project={p} index={i} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default Projects;
