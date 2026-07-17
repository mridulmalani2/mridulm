import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { CHAPTERS } from '../constants';
import { SHOW_RESEARCH, SHOW_DEAL_ENGINE_NAV, SHOW_VIDEO_STORY } from '../config/features';
import { Menu, X } from 'lucide-react';

const Navbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isResearch = location.pathname.startsWith('/research');

  // Research keeps the original dark chrome; the home page (and 404) are light.
  const isLight = !isResearch;

  // Theme-derived class fragments, so the JSX below stays readable.
  const logoText = isLight ? 'text-ink' : 'text-white';
  const logoAccent = isLight ? 'text-[#A25600]' : 'text-amber-500';
  const linkText = isLight
    ? 'text-ink/55 hover:text-ink hover:bg-ink/5'
    : 'text-white/60 hover:text-white hover:bg-white/10';
  const pillBg = isLight
    ? 'bg-ink/[0.04] border border-ink/10 shadow-lg'
    : 'bg-white/5 border border-white/10 shadow-lg';
  const toggleText = isLight ? 'text-ink/70 hover:text-ink' : 'text-white/60 hover:text-white';
  const mobileText = isLight
    ? 'text-ink/60 hover:text-[#A25600] border-ink/5'
    : 'text-white/60 hover:text-amber-500 border-white/5';

  // Keep CHAPTERS as the single source of truth; drop the video entry while the
  // section is hidden so flipping SHOW_VIDEO_STORY restores nav + section together.
  const visibleChapters = CHAPTERS.filter(
    (c) => c.id !== 'video-story' || SHOW_VIDEO_STORY
  );

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const scrollToId = () => {
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        return true;
      }
      return false;
    };

    if (location.pathname !== '/') {
      // Navigate home, then retry across frames until the section mounts —
      // a fixed timeout silently no-ops if the route renders slower than it.
      navigate('/');
      let frames = 0;
      const attempt = () => {
        if (scrollToId() || frames++ > 40) return;
        requestAnimationFrame(attempt);
      };
      requestAnimationFrame(attempt);
    } else {
      scrollToId();
    }
    setIsMobileMenuOpen(false);
  };

  const handleLogoClick = () => {
    if (location.pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate('/');
    }
  };

  const navChrome = isResearch
    ? isScrolled
      ? 'py-4 bg-black/95 backdrop-blur-xl border-b border-white/5'
      : 'py-4 md:py-6 bg-black/90 backdrop-blur-xl'
    : isScrolled
      ? 'py-4 bg-canvas/80 backdrop-blur-xl border-b border-ink/5'
      : 'py-8 md:py-12';

  return (
    <nav className={`fixed top-0 left-0 right-0 z-[160] transition-all duration-700 ${navChrome}`}>
      <div className="page-container flex justify-between items-center">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="cursor-pointer relative z-[170]"
          onClick={handleLogoClick}
        >
          <span className={`font-display text-2xl md:text-3xl font-bold ${logoText}`}>
            Mridul <span className={logoAccent}>Malani</span>
          </span>
        </motion.div>

        {/* Desktop Navigation */}
        <div className="hidden lg:flex items-center gap-3">
          <div className={`flex gap-1 p-1.5 rounded-full transition-all duration-700 ${isScrolled ? pillBg : 'bg-transparent'}`}>
            {visibleChapters.map((chapter) => (
              <button
                key={chapter.id}
                onClick={() => scrollToSection(chapter.id)}
                className={`px-6 py-2 rounded-full font-montserrat text-[10px] font-black tracking-widest transition-all uppercase whitespace-nowrap ${linkText}`}
              >
                {chapter.subtitle}
              </button>
            ))}
            {SHOW_RESEARCH && (
              <button
                onClick={() => navigate('/research')}
                className={`px-6 py-2 rounded-full font-montserrat text-[10px] font-black tracking-widest transition-all uppercase whitespace-nowrap ${isResearch ? 'text-white bg-white/10' : linkText}`}
              >
                Research
              </button>
            )}
            {SHOW_DEAL_ENGINE_NAV && (
              <button
                onClick={() => navigate('/deal-engine')}
                className={`px-6 py-2 rounded-full font-montserrat text-[10px] font-black tracking-widest transition-all uppercase whitespace-nowrap ${linkText}`}
              >
                Deal Engine
              </button>
            )}
          </div>
        </div>

        {/* Mobile Toggle */}
        <div className="lg:hidden relative z-[170]">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`p-3 transition-all active:scale-90 min-w-[48px] min-h-[48px] flex items-center justify-center ${toggleText}`}
            aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={isMobileMenuOpen}
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
            className={`fixed inset-0 backdrop-blur-3xl z-[165] flex flex-col justify-center items-center px-12 lg:hidden ${isLight ? 'bg-[rgba(253,252,250,0.92)]' : 'bg-black/98'}`}
          >
            <div className="flex flex-col gap-10 items-center w-full max-w-sm">
              {visibleChapters.map((chapter, i) => (
                <motion.button
                  key={chapter.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.08 }}
                  onClick={() => scrollToSection(chapter.id)}
                  className={`font-montserrat text-lg font-black tracking-widest transition-all uppercase w-full py-4 border-b text-center min-h-[48px] ${mobileText}`}
                >
                  {chapter.subtitle}
                </motion.button>
              ))}
              {SHOW_RESEARCH && (
                <motion.button
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + visibleChapters.length * 0.08 }}
                  onClick={() => { navigate('/research'); setIsMobileMenuOpen(false); }}
                  className={`font-montserrat text-lg font-black tracking-widest transition-all uppercase w-full py-4 border-b text-center min-h-[48px] ${mobileText}`}
                >
                  Research
                </motion.button>
              )}
              {SHOW_DEAL_ENGINE_NAV && (
                <motion.button
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + (visibleChapters.length + (SHOW_RESEARCH ? 1 : 0)) * 0.08 }}
                  onClick={() => { navigate('/deal-engine'); setIsMobileMenuOpen(false); }}
                  className={`font-montserrat text-lg font-black tracking-widest transition-all uppercase w-full py-4 border-b text-center min-h-[48px] ${mobileText}`}
                >
                  Deal Engine
                </motion.button>
              )}
            </div>
            <div className="absolute bottom-12 text-center w-full">
              <p className={`font-montserrat text-[11px] tracking-widest uppercase font-black ${isLight ? 'text-ink/40' : 'text-white/40'}`}>Mridul Malani • Portfolio</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
