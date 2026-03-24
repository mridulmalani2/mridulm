import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Background from './components/Background';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import FinanceX from './pages/FinanceX';
import ResearchIndex from './pages/ResearchIndex';
import ResearchArticle from './pages/ResearchArticle';
import { motion, useScroll, useSpring } from 'framer-motion';

const App: React.FC = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });
  const location = useLocation();
  const isResearch = location.pathname.startsWith('/research');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className={`relative min-h-screen ${isResearch ? 'bg-[#F9F9F7]' : 'selection:bg-amber-500 selection:text-black bg-black'}`}
    >
      {/* Skip to main content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-black focus:rounded"
      >
        Skip to main content
      </a>

      {!isResearch && <Background />}

      {/* Progress bar */}
      <motion.div
        className={`fixed top-0 left-0 right-0 h-0.5 origin-left z-[150] ${isResearch ? 'bg-[#CC0000]' : 'bg-amber-500'}`}
        style={{ scaleX }}
      />

      <header>
        <Navbar />
      </header>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/financex" element={<FinanceX />} />
        <Route path="/research" element={<ResearchIndex />} />
        <Route path="/research/:slug" element={<ResearchArticle />} />
      </Routes>

      {!isResearch && <div className="fixed inset-0 pointer-events-none z-[100] ring-1 ring-white/5" />}
    </motion.div>
  );
};

export default App;
