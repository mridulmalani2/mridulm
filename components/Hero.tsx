
import React from 'react';
import { motion } from 'framer-motion';

const Hero: React.FC = () => {
  const profileImageUrl = "https://media.licdn.com/dms/image/v2/D4E03AQEAD7kxQrToiQ/profile-displayphoto-crop_800_800/B4EZsQwy85HcAI-/0/1765512786319?e=1769040000&v=beta&t=MB-WhYcAWtZqnjOdKAwSfKj7r-TEHMzajCEBr58Gyn0";

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden section-padding">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="relative z-10 w-full section-container flex flex-col items-center text-center"
      >
        {/* Profile Image - Optimized scaling */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className="relative mb-8 md:mb-16 group"
        >
          <div className="absolute inset-0 bg-amber-500/10 blur-3xl rounded-full scale-150 group-hover:bg-amber-500/20 transition-all duration-1000" />
          <div className="relative z-10 w-32 h-32 sm:w-40 sm:h-40 md:w-56 md:h-56 rounded-full overflow-hidden border border-white/10 shadow-2xl">
            <motion.img 
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              src={profileImageUrl} 
              alt="Mridul Malani" 
              className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-105"
            />
          </div>
          <div className="absolute inset-0 border border-amber-500/20 rounded-full scale-110 animate-[spin_40s_linear_infinite] pointer-events-none" />
        </motion.div>

        <h2 className="font-montserrat text-amber-500 tracking-[0.6em] text-[10px] md:text-xs font-black mb-6 uppercase drop-shadow-md">
          PROLOGUE
        </h2>
        
        {/* RECALIBRATED COLOR BALANCE */}
        <h1 className="font-playfair text-fluid-title font-bold mb-10 md:mb-16 italic tracking-tighter leading-[0.85] w-full max-w-[15ch] mx-auto">
          <span className="text-white/70">Mridul</span> <br className="sm:hidden" />
          <span className="text-amber-500 drop-shadow-[0_0_30px_rgba(245,158,11,0.2)]">Malani</span>
        </h1>
        
        <div className="max-w-2xl mx-auto">
          <p className="font-montserrat text-xs sm:text-sm md:text-base font-medium text-white/50 leading-relaxed uppercase tracking-[0.25em] px-4">
            "In the short run, ideas get votes. <br className="hidden sm:block"/> In the long run, they get weighed. <br className="hidden sm:block"/> That’s why I put my work here - to have it weighed."
          </p>
        </div>
      </motion.div>

      {/* Navigation Indicator - Refined for centered stability */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 1 }}
        className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-6 group cursor-pointer z-20"
        onClick={() => {
          const next = document.getElementById('projects');
          next?.scrollIntoView({ behavior: 'smooth' });
        }}
      >
        <span className="font-montserrat text-[9px] tracking-[0.6em] opacity-30 group-hover:opacity-100 group-hover:text-amber-500 transition-all uppercase font-black text-white whitespace-nowrap">
          OPEN THE ARCHIVE
        </span>
        <div className="w-px h-16 md:h-24 bg-gradient-to-b from-amber-500/60 via-amber-500/10 to-transparent" />
      </motion.div>
    </div>
  );
};

export default Hero;
