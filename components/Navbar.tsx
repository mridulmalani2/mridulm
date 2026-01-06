import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CHAPTERS } from '../constants';
import { Menu, X } from 'lucide-react';

const Navbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <nav className={`fixed top-0 left-0 right-0 z-[160] transition-all duration-700 ${isScrolled ? 'py-4 bg-black/40 backdrop-blur-xl border-b border-white/5' : 'py-8 md:py-12'}`}>
      <div className="page-container flex justify-between items-center">
        {/* Logo */}
        <motion.div 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="cursor-pointer relative z-[170]"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <span className="font-playfair text-2xl md:text-3xl italic font-bold tracking-tighter text-white/90">
            Mridul <span className="text-amber-500">Malani</span>
          </span>
        </motion.div>

        {/* Desktop Navigation */}
        <div className="hidden lg:flex items-center">
          <div className={`flex gap-1 p-1.5 rounded-full transition-all duration-700 ${isScrolled ? 'bg-white/5 border border-white/10 shadow-lg' : 'bg-transparent'}`}>
            {CHAPTERS.map((chapter) => (
              <button
                key={chapter.id}
                onClick={() => scrollToSection(chapter.id)}
                className="px-6 py-2 rounded-full font-montserrat text-[10px] font-black tracking-[0.2em] text-white/30 hover:text-white hover:bg-white/10 transition-all uppercase whitespace-nowrap"
              >
                {chapter.subtitle}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Toggle */}
        <div className="lg:hidden relative z-[170]">
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-3 text-white/50 hover:text-white transition-all active:scale-90"
            aria-label="Toggle Menu"
          >
            {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 200 }}
            className="fixed inset-0 bg-black/98 backdrop-blur-3xl z-[165] flex flex-col justify-center items-center px-12 lg:hidden"
          >
            <div className="flex flex-col gap-10 items-center w-full max-w-sm">
              {CHAPTERS.map((chapter, i) => (
                <motion.button
                  key={chapter.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.08 }}
                  onClick={() => scrollToSection(chapter.id)}
                  className="font-montserrat text-lg font-black tracking-[0.5em] text-white/30 hover:text-amber-500 transition-all uppercase w-full py-4 border-b border-white/5 text-center"
                >
                  {chapter.subtitle}
                </motion.button>
              ))}
            </div>
            <div className="absolute bottom-12 text-center w-full">
               <p className="font-montserrat text-[9px] tracking-[0.5em] text-white/10 uppercase font-black">Digital Portfolio • 2025</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;