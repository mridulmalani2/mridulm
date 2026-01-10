import React from 'react';
import { motion } from 'framer-motion';

const Hero: React.FC = () => {
  return (
    <div className="page-container section-v-padding flex flex-col items-center justify-center relative min-h-[100svh] md:min-h-screen px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
        className="text-center flex flex-col items-center max-w-3xl w-full"
      >
        {/* Profile Image */}
        <div className="relative mb-8 md:mb-12">
          <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-2 border-amber-500/20 shadow-2xl">
            <img
              src="https://media.licdn.com/dms/image/v2/D4E03AQEAD7kxQrToiQ/profile-displayphoto-crop_800_800/B4EZsQwy85HcAI-/0/1765512786319?e=1769644800&v=beta&t=Ak0vCYLDyjekeSrlZFSIRP31p4qxfG2BTbqAjkDuEvM"
              alt="Mridul Malani"
              className="w-full h-full object-cover"
              loading="eager"
            />
          </div>
        </div>

        {/* Clear Identity */}
        <h1 className="font-playfair text-4xl md:text-6xl lg:text-7xl font-bold mb-4 text-white">
          Mridul <span className="text-amber-500">Malani</span>
        </h1>

        {/* Value Proposition - Immediately Clear */}
        <p className="font-montserrat text-sm md:text-base tracking-widest text-amber-500/80 uppercase mb-6">
          HEC Paris MiM '27/28 • Corporate Finance and Private Markets
        </p>

        <p className="font-playfair italic text-white/70 text-base md:text-lg max-w-xl leading-relaxed mb-10">
          I learn by building, and I build by doing. Currently at the intersection of finance, technology and entrepreneurship.
        </p>

        {/* Clear CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center w-full sm:w-auto px-4 sm:px-0">
          <a
            href="#projects"
            className="px-6 py-4 bg-amber-500 text-black font-montserrat text-sm font-bold tracking-wider rounded hover:bg-amber-400 transition-colors min-h-[48px] flex items-center justify-center"
          >
            View Projects
          </a>
          <a
            href="#contact"
            className="px-6 py-4 border border-white/20 text-white font-montserrat text-sm font-medium tracking-wider rounded hover:border-amber-500 hover:text-amber-500 transition-colors min-h-[48px] flex items-center justify-center"
          >
            Get in Touch
          </a>
        </div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <div className="flex flex-col items-center gap-2 text-white/40">
          <span className="text-xs tracking-widest uppercase">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-white/40 to-transparent" />
        </div>
      </motion.div>
    </div>
  );
};

export default Hero;
