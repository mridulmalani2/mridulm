import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Background from './components/Background';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import { motion, useScroll, useSpring } from 'framer-motion';

const App: React.FC = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="relative selection:bg-amber-500 selection:text-black min-h-screen bg-black"
    >
      {/* Skip to main content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-black focus:rounded"
      >
        Skip to main content
      </a>

      <Background />

      {/* Progress bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-0.5 bg-amber-500 origin-left z-[150]"
        style={{ scaleX }}
      />

      <header>
        <Navbar />
      </header>

      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>

      <div className="fixed inset-0 pointer-events-none z-[100] ring-1 ring-white/5" />
    </motion.div>
  );
};

export default App;
