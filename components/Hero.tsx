import React from 'react';
import { motion } from 'framer-motion';

const Hero: React.FC = () => {
  const profileImageUrl = "https://media.licdn.com/dms/image/v2/D4E03AQEAD7kxQrToiQ/profile-displayphoto-crop_800_800/B4EZsQwy85HcAI-/0/1765512786319?e=1769040000&v=beta&t=MB-WhYcAWtZqnjOdKAwSfKj7r-TEHMzajCEBr58Gyn0";

  return (
    <div className="page-container section-v-padding flex flex-col items-center justify-center relative overflow-hidden">
      {/* Main Content Container */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        className="text-center flex flex-col items-center w-full"
      >
        {/* Profile Image with Cinematic Glow */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 2, ease: "easeOut" }}
          className="relative mb-12 md:mb-16 group"
        >
          <div className="absolute inset-0 bg-amber-500/10 blur-[80px] rounded-full scale-150 group-hover:bg-amber-500/20 transition-all duration-1000" />
          <div className="relative z-10 w-36 h-36 sm:w-48 sm:h-48 md:w-64 md:h-64 rounded-full overflow-hidden border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
            <motion.img 
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              src={profileImageUrl} 
              alt="Mridul Malani" 
              className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-105"
            />
          </div>
          <div className="absolute inset-0 border border-amber-500/10 rounded-full scale-110 animate-[spin_40s_linear_infinite] pointer-events-none" />
        </motion.div>

        <h2 className="font-montserrat text-amber-500 tracking-[0.8em] text-[10px] md:text-xs font-black mb-6 md:mb-8 opacity-70 uppercase">
          PROLOGUE
        </h2>
        
        {/* RECALIBRATED COLOR BALANCE: Prominent Orange, Subtle White */}
        <h1 className="font-playfair text-fluid-title font-bold mb-10 md:mb-14 italic tracking-tighter w-full max-w-[15ch] mx-auto">
          <span className="text-white/20">Mridul</span> <br className="sm:hidden" />
          <span className="text-amber-500 drop-shadow-[0_0_40px_rgba(245,158,11,0.4)]">Malani</span>
        </h1>
        
        <div className="max-w-2xl mx-auto px-4">
          <p className="font-montserrat text-xs sm:text-sm md:text-base font-medium text-white/40 leading-loose uppercase tracking-[0.35em]">
            "In the short run, ideas get votes. <br className="hidden sm:block"/> In the long run, they get weighed. <br className="hidden sm:block"/> That’s why I put my work here - to have it weighed."
          </p>
        </div>
      </motion.div>

      {/* Navigation Indicator */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 1 }}
        className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center group cursor-pointer z-20"
        onClick={() => document.getElementById('projects')?.scrollIntoView({ behavior: 'smooth' })}
      >
        <span className="font-montserrat text-[9px] tracking-[0.6em] mb-6 opacity-30 group-hover:opacity-100 group-hover:text-amber-500 transition-all uppercase font-black text-white whitespace-nowrap">
          TURN THE PAGE
        </span>
        <div className="w-px h-16 md:h-24 bg-gradient-to-b from-amber-500/60 via-amber-500/10 to-transparent" />
      </motion.div>
    </div>
  );
};

export default Hero;