
import React, { useState, useEffect } from 'react';
import Background from './components/Background';
import Hero from './components/Hero';
import Projects from './components/Projects';
import VideoStory from './components/VideoStory';
import Resume from './components/Resume';
import Hobbies from './components/Hobbies';
import Contact from './components/Contact';
import Navbar from './components/Navbar';
import { motion, useScroll, useSpring } from 'framer-motion';

const App: React.FC = () => {
  const [isIntroFinished, setIsIntroFinished] = useState(false);
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  if (!isIntroFinished) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center z-50 fixed">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="text-center space-y-12 px-6"
        >
          <div className="font-montserrat text-amber-500/50 tracking-[0.2em] text-xl md:text-3xl font-light animate-pulse uppercase max-w-2xl leading-relaxed">
            Learn More about my projects, ideas, work and me!
          </div>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsIntroFinished(true)}
            className="px-12 py-4 border border-white/20 rounded-full font-montserrat text-xs tracking-widest text-white/60 hover:text-white hover:border-white transition-all uppercase font-semibold"
          >
            DISCOVER
          </motion.button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative selection:bg-amber-500 selection:text-black">
      <Background />
      
      {/* Cinematic Progress Bar */}
      <motion.div 
        className="fixed top-0 left-0 right-0 h-1 bg-amber-500 origin-left z-[110] shadow-[0_0_20px_rgba(245,158,11,0.5)]" 
        style={{ scaleX }} 
      />

      <Navbar />

      <main className="relative perspective-3d">
        <section id="hero" className="relative z-10">
          <Hero />
        </section>
        
        <section id="projects" className="relative z-10 bg-black/40">
          <Projects />
        </section>
        
        <section id="video-story" className="relative z-10">
          <VideoStory />
        </section>
        
        <section id="resume" className="relative z-10">
          <Resume />
        </section>
        
        <section id="hobbies" className="relative z-10">
          <Hobbies />
        </section>
        
        <section id="contact" className="relative z-10">
          <Contact />
        </section>
      </main>

      {/* Aesthetic Overlays */}
      <div className="fixed inset-0 pointer-events-none z-[100] ring-1 ring-white/5" />
      <div className="fixed inset-0 pointer-events-none z-[100] shadow-[inset_0_0_150px_rgba(0,0,0,0.5)]" />
    </div>
  );
};

export default App;
