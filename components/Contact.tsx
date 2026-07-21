import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Linkedin, Mail, ArrowUp, X } from 'lucide-react';
import { TravelMotif } from './AmbientMotifs';

const Contact: React.FC = () => {
  const [showEmailPopup, setShowEmailPopup] = useState(false);
  const year = new Date().getFullYear();

  return (
    <div className="w-full page-container min-h-[100svh] py-24 flex flex-col items-center justify-center text-center relative">
      {/* Ambient motif - the travel thread: a flight path arcing toward the corner */}
      <TravelMotif className="left-1/2 top-14 w-72 -translate-x-1/2 opacity-90 md:top-10 md:w-[26rem]" />
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        whileInView={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1 }}
        viewport={{ once: true }}
        className="space-y-8 md:space-y-10 max-w-2xl relative z-10"
      >
        <h2 className="font-montserrat text-[#A25600] tracking-[0.2em] text-[11px] md:text-xs font-bold uppercase">Get in touch</h2>
        <h3 className="font-display text-5xl md:text-7xl font-black text-ink">Let's connect.</h3>

        <p className="font-display italic text-lg md:text-2xl text-muted leading-relaxed">
          Interested in working together or just want to say hello?
          <br className="hidden sm:block" /> I'd love to hear from you.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10 pt-6">
          <a
            href="https://in.linkedin.com/in/mridulmalani"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 group border-b border-ink/15 pb-2 hover:border-[#A25600] transition-all duration-300 min-h-[48px]"
            aria-label="Connect on LinkedIn"
          >
            <Linkedin size={20} className="text-muted group-hover:text-[#A25600] transition-colors" />
            <span className="font-montserrat text-[11px] tracking-widest font-bold uppercase text-muted group-hover:text-ink">LinkedIn</span>
          </a>
          <button
            onClick={() => setShowEmailPopup(true)}
            className="flex items-center gap-3 group border-b border-ink/15 pb-2 hover:border-[#A25600] transition-all duration-300 min-h-[48px]"
            aria-label="Show email address"
          >
            <Mail size={20} className="text-muted group-hover:text-[#A25600] transition-colors" />
            <span className="font-montserrat text-[11px] tracking-widest font-bold uppercase text-muted group-hover:text-ink">Email me</span>
          </button>
        </div>
      </motion.div>

      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="absolute bottom-16 cursor-pointer flex flex-col items-center gap-3 text-muted hover:text-ink transition-all duration-300 group min-h-[48px]"
        aria-label="Back to top"
      >
        <ArrowUp size={22} className="text-[#A25600] group-hover:-translate-y-1 transition-transform" />
        <span className="font-montserrat text-[10px] tracking-widest uppercase font-bold">Back to top</span>
      </button>

      <div className="absolute bottom-6 left-0 right-0 text-center px-6">
        <p className="text-[11px] text-muted font-montserrat tracking-widest uppercase font-semibold">
          © {year} Mridul Malani
        </p>
      </div>

      {/* Email Popup */}
      {showEmailPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm"
          onClick={() => setShowEmailPopup(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white border border-ink/10 rounded-2xl p-8 max-w-md mx-4 relative shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowEmailPopup(false)}
              className="absolute top-4 right-4 text-muted hover:text-ink transition-colors"
              aria-label="Close popup"
            >
              <X size={24} />
            </button>
            <p className="text-ink text-lg text-center mt-2">
              You can reach me at<br />
              <a
                href="mailto:mridul.malani@alumni.ashoka.edu.in"
                className="text-[#A25600] hover:underline transition-colors font-montserrat mt-2 inline-block"
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
