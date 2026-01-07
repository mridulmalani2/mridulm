import React from 'react';
import { motion } from 'framer-motion';
import { Linkedin, Mail, ArrowUp } from 'lucide-react';

const Contact: React.FC = () => {
  return (
    <div className="w-full page-container section-v-padding flex flex-col items-center justify-center text-center relative">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        whileInView={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.5 }}
        viewport={{ once: true }}
        className="space-y-12 md:space-y-16 max-w-2xl"
      >
        <h2 className="font-montserrat text-amber-500/60 tracking-widest text-[10px] md:text-xs font-black uppercase">LET'S CONNECT</h2>
        <h3 className="font-playfair text-fluid-h2 italic text-white/95">Thank You!</h3>

        <p className="text-base md:text-2xl text-white/60 font-normal leading-relaxed tracking-tight">
          Interested in working together or just want to say hello?
          <br className="hidden sm:block" /> I'd love to hear from you.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-8 md:gap-12 pt-12">
          <motion.a
            href="https://in.linkedin.com/in/mridulmalani"
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-4 group border-b border-white/10 pb-2 hover:border-amber-500 transition-all duration-500 min-h-[48px]"
            aria-label="Connect on LinkedIn"
          >
            <Linkedin size={20} className="text-white/60 group-hover:text-amber-500 transition-colors" />
            <span className="font-montserrat text-[10px] tracking-widest font-black uppercase text-white/60 group-hover:text-white">LINKEDIN</span>
          </motion.a>
          <motion.a
            href="mailto:mridul.malani@alumni.ashoka.edu.in"
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-4 group border-b border-white/10 pb-2 hover:border-amber-500 transition-all duration-500 min-h-[48px]"
            aria-label="Send email"
          >
            <Mail size={20} className="text-white/60 group-hover:text-amber-500 transition-colors" />
            <span className="font-montserrat text-[10px] tracking-widest font-black uppercase text-white/60 group-hover:text-white">EMAIL ME</span>
          </motion.a>
        </div>
      </motion.div>

      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="absolute bottom-16 cursor-pointer flex flex-col items-center gap-4 opacity-60 hover:opacity-100 transition-all duration-500 group min-h-[48px]"
        aria-label="Back to top"
      >
        <ArrowUp size={24} className="text-amber-500 group-hover:-translate-y-2 transition-transform" />
        <span className="font-montserrat text-[9px] tracking-widest uppercase font-black text-white/60">Back to Top</span>
      </button>

      <div className="absolute bottom-6 left-0 right-0 text-center px-6">
        <p className="text-[9px] text-white/40 font-montserrat tracking-widest uppercase font-black">
          © 2025 Mridul Malani
        </p>
      </div>
    </div>
  );
};

export default Contact;
