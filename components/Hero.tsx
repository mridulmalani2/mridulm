import React from 'react';
import { motion } from 'framer-motion';
import FinancialMetrics from './FinancialMetrics';
import LiveStatsTicker from './LiveStatsTicker';
import MiniCharts from './MiniCharts';

const Hero: React.FC = () => {
  return (
    <div className="page-container section-v-padding flex flex-col items-center justify-center relative min-h-screen">
      {/* Financial Metrics - Top Right */}
      <FinancialMetrics />

      {/* Mini Charts - Left Side */}
      <MiniCharts />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
        className="text-center flex flex-col items-center max-w-3xl relative z-20"
      >
        {/* Profile Image with Enhanced Ring */}
        <div className="relative mb-8 md:mb-12">
          <motion.div
            animate={{
              boxShadow: [
                '0 0 20px rgba(245, 158, 11, 0.3)',
                '0 0 40px rgba(245, 158, 11, 0.5)',
                '0 0 20px rgba(245, 158, 11, 0.3)',
              ]
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-2 border-amber-500/30 shadow-2xl relative"
          >
            <img
              src="/profile.jpg"
              alt="Mridul Malani"
              className="w-full h-full object-cover"
              loading="eager"
            />
          </motion.div>

          {/* Floating Ring Animation */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 w-32 h-32 md:w-40 md:h-40 rounded-full border border-amber-500/10"
            style={{ padding: '4px' }}
          />
        </div>

        {/* Clear Identity */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="font-playfair text-4xl md:text-6xl lg:text-7xl font-bold mb-4 text-white"
        >
          Mridul <span className="text-amber-500">Malani</span>
        </motion.h1>

        {/* Value Proposition - Immediately Clear */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="font-montserrat text-sm md:text-base tracking-widest text-amber-500/80 uppercase mb-6"
        >
          HEC Paris MiM '27 • Finance & Venture Capital
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="text-white/70 text-base md:text-lg max-w-xl leading-relaxed mb-10"
        >
          Building at the intersection of finance, technology, and entrepreneurship.
          Previously at Reliance Industries, IndiaMart, and Chanakya Wealth.
        </motion.p>

        {/* Clear CTAs with Enhanced Hover */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.8 }}
          className="flex flex-wrap gap-4 justify-center"
        >
          <motion.a
            href="#projects"
            whileHover={{ scale: 1.05, boxShadow: '0 10px 40px rgba(245, 158, 11, 0.3)' }}
            whileTap={{ scale: 0.98 }}
            className="px-6 py-3 bg-amber-500 text-black font-montserrat text-sm font-bold tracking-wider rounded hover:bg-amber-400 transition-colors min-h-[48px] flex items-center"
          >
            View Projects
          </motion.a>
          <motion.a
            href="#contact"
            whileHover={{ scale: 1.05, borderColor: 'rgba(245, 158, 11, 1)' }}
            whileTap={{ scale: 0.98 }}
            className="px-6 py-3 border border-white/20 text-white font-montserrat text-sm font-medium tracking-wider rounded hover:border-amber-500 hover:text-amber-500 transition-colors min-h-[48px] flex items-center"
          >
            Get in Touch
          </motion.a>
        </motion.div>
      </motion.div>

      {/* Live Stats Ticker */}
      <LiveStatsTicker />

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="flex flex-col items-center gap-2 text-white/40"
        >
          <span className="text-xs tracking-widest uppercase">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-white/40 to-transparent" />
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Hero;
