import React, { useState, useEffect } from 'react';
import Background from './components/Background';
import Hero from './components/Hero';
import Projects from './components/Projects';
import VideoStory from './components/VideoStory';
import Resume from './components/Resume';
import Hobbies from './components/Hobbies';
import Contact from './components/Contact';
import Navbar from './components/Navbar';
import { motion, useScroll, useSpring, AnimatePresence } from 'framer-motion';

const App: React.FC = () => {
  const [isIntroFinished, setIsIntroFinished] = useState(false);
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  return (
    <div className="relative selection:bg-amber-500 selection:text-black min-h-screen bg-black">
      <AnimatePresence>
        {!isIntroFinished ? (
          <motion.div 
            key="intro"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="fixed inset-0 bg-[#020202] flex items-center justify-center z-[200] px-6"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1 }}
              className="text-center space-y-12 max-w-2xl"
            >
              <div className="font-montserrat text-amber-500/60 tracking-[0.3em] text-lg md:text-3xl font-light uppercase leading-relaxed drop-shadow-2xl">
                LEARN MORE ABOUT MY <br/>PROJECTS, IDEAS, WORK AND ME!
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsIntroFinished(true)}
                className="px-12 py-4 border border-amber-500/30 rounded-full font-montserrat text-[10px] tracking-[0.6em] text-amber-500 hover:text-white hover:border-amber-500 transition-all uppercase font-black"
              >
                DISCOVER
              </motion.button>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div 
            key="main-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
          >
            <Background />
            
            <motion.div 
              className="fixed top-0 left-0 right-0 h-1 bg-amber-500 origin-left z-[150] shadow-[0_0_20px_rgba(245,158,11,0.5)]" 
              style={{ scaleX }} 
            />

            <Navbar />

            <main className="relative perspective-main">
              <section id="hero" className="min-h-screen flex items-center justify-center">
                <Hero />
              </section>
              
              <section id="projects" className="min-h-screen flex flex-col justify-center bg-black/40">
                <Projects />
              </section>
              
              <section id="video-story" className="min-h-screen flex items-center justify-center">
                <VideoStory />
              </section>
              
              <section id="resume" className="min-h-screen flex flex-col justify-center">
                <Resume />
              </section>
              
              <section id="hobbies" className="min-h-screen flex flex-col justify-center">
                <Hobbies />
              </section>
              
              <section id="contact" className="min-h-screen flex flex-col justify-center">
                <Contact />
              </section>
            </main>

            <div className="fixed inset-0 pointer-events-none z-[100] ring-1 ring-white/5" />
            <div className="fixed inset-0 pointer-events-none z-[100] shadow-[inset_0_0_150px_rgba(0,0,0,0.4)]" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;