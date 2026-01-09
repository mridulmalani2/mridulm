import React from 'react';
import { motion } from 'framer-motion';

const VideoStory: React.FC = () => {
  const VIDEO_EMBED_URL = "https://www.youtube.com/embed/TMJQhnNwm-E?si=XldR3Vg9Peq3Bnab";

  return (
    <div className="w-full page-container section-v-padding bg-neutral-900/10 backdrop-blur-sm">
      <div className="flex flex-col lg:flex-row items-center justify-center gap-16 lg:gap-24">

        {/* Text Content */}
        <div className="w-full lg:w-1/2 flex flex-col items-center lg:items-start text-center lg:text-left">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            viewport={{ once: true }}
            className="max-w-xl"
          >
            <h2 className="font-montserrat text-amber-500 text-[10px] md:text-xs tracking-widest font-black uppercase mb-8">
              VIDEO INTRODUCTION
            </h2>

            <h3 className="font-playfair text-fluid-h2 italic leading-tight mb-8 md:mb-12 text-white">
              My 3-Min <br className="hidden md:block" /> AI HireVue
            </h3>

            <p className="text-white/60 text-sm md:text-lg leading-relaxed font-normal font-montserrat tracking-wide">
              A 3-minute video overview of my background, current projects, and future goals.
              Created using AI tools to give you a quick introduction to who I am.
            </p>
          </motion.div>
        </div>

        {/* Video Player - Adaptive Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.2 }}
          viewport={{ once: true }}
          className="w-full lg:w-1/2 max-w-2xl"
        >
          <div className="relative aspect-video rounded-[2rem] overflow-hidden shadow-[0_20px_100px_rgba(0,0,0,0.6)] border border-white/5 group bg-black">
            <iframe
              src={VIDEO_EMBED_URL}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              title="Mridul Malani - Video Introduction"
            />
            {/* Cinematic Frame */}
            <div className="absolute inset-0 pointer-events-none border border-white/10 rounded-[2rem] transition-colors duration-1000 group-hover:border-amber-500/20" />
            <div className="absolute top-0 left-0 w-12 h-12 border-t border-l border-amber-500/30 rounded-tl-[2rem] pointer-events-none" />
          </div>
        </motion.div>

      </div>
    </div>
  );
};

export default VideoStory;
