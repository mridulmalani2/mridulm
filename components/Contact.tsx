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
        <h2 className="font-montserrat text-amber-500/40 tracking-[1em] text-[10px] md:text-xs font-black uppercase">EPILOGUE</h2>
        <h3 className="font-playfair text-fluid-h2 italic text-white/95">Thank You!</h3>
        
        <p className="text-base md:text-2xl text-white/30 font-normal leading-relaxed tracking-tight">
          The story continues elsewhere. <br className="hidden sm:block"/> Let's write the next chapter together.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-8 md:gap-12 pt-12">
          <a 
            href="https://in.linkedin.com/in/mridulmalani" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-4 group border-b border-white/5 pb-2 hover:border-amber-500 transition-all duration-500"
          >
            <Linkedin size={20} className="text-white/20 group-hover:text-amber-500 transition-colors" />
            <span className="font-montserrat text-[10px] tracking-[0.4em] font-black uppercase text-white/40 group-hover:text-white">LINKEDIN</span>
          </a>
          <a 
            href="mailto:mridul.malani@alumni.ashoka.edu.in"
            className="flex items-center gap-4 group border-b border-white/5 pb-2 hover:border-amber-500 transition-all duration-500"
          >
            <Mail size={20} className="text-white/20 group-hover:text-amber-500 transition-colors" />
            <span className="font-montserrat text-[10px] tracking-[0.4em] font-black uppercase text-white/40 group-hover:text-white">EMAIL ME</span>
          </a>
        </div>
      </motion.div>

      <div 
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="absolute bottom-16 cursor-pointer flex flex-col items-center gap-4 opacity-20 hover:opacity-100 transition-all duration-500 group"
      >
        <ArrowUp size={24} className="text-amber-500 group-hover:-translate-y-2 transition-transform" />
        <span className="font-montserrat text-[9px] tracking-[0.6em] uppercase font-black text-white">TO THE BEGINNING</span>
      </div>

      <div className="absolute bottom-6 left-0 right-0 text-center px-6">
        <p className="text-[9px] text-white/5 font-montserrat tracking-[0.4em] uppercase font-black">
          © 2025 MRIDUL MALANI • DIGITAL IDENTITY
        </p>
      </div>
    </div>
  );
};

export default Contact;