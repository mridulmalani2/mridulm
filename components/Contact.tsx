import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Linkedin, Mail, ArrowUp, X } from 'lucide-react';

const Contact: React.FC = () => {
  const [showEmailPopup, setShowEmailPopup] = useState(false);

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
          <a
            href="https://in.linkedin.com/in/mridulmalani"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 group border-b border-white/10 pb-2 hover:border-amber-500 transition-all duration-500 min-h-[48px]"
            aria-label="Connect on LinkedIn"
          >
            <Linkedin size={20} className="text-white/60 group-hover:text-amber-500 transition-colors" />
            <span className="font-montserrat text-[10px] tracking-widest font-black uppercase text-white/60 group-hover:text-white">LINKEDIN</span>
          </a>
          <button
            onClick={() => setShowEmailPopup(true)}
            className="flex items-center gap-4 group border-b border-white/10 pb-2 hover:border-amber-500 transition-all duration-500 min-h-[48px]"
            aria-label="Show email address"
          >
            <Mail size={20} className="text-white/60 group-hover:text-amber-500 transition-colors" />
            <span className="font-montserrat text-[10px] tracking-widest font-black uppercase text-white/60 group-hover:text-white">EMAIL ME</span>
          </button>
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

      {/* Email Popup */}
      {showEmailPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowEmailPopup(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-zinc-900 border border-amber-500/20 rounded-lg p-8 max-w-md mx-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowEmailPopup(false)}
              className="absolute top-4 right-4 text-white/60 hover:text-amber-500 transition-colors"
              aria-label="Close popup"
            >
              <X size={24} />
            </button>
            <p className="text-white/90 text-lg text-center mt-2">
              You can reach me at<br />
              <a
                href="mailto:mridul.malani@alumni.ashoka.edu.in"
                className="text-amber-500 hover:text-amber-400 transition-colors font-montserrat mt-2 inline-block"
              >
                mridul.malani@alumni.ashoka.edu.in
              </a>
            </p>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Contact;
