import React from 'react';
import { motion } from 'framer-motion';

const AnimatedOrbs: React.FC = () => {
  const orbs = [
    {
      size: 400,
      color: 'rgba(245, 158, 11, 0.1)',
      initialX: '10%',
      initialY: '20%',
      duration: 20
    },
    {
      size: 300,
      color: 'rgba(147, 51, 234, 0.08)',
      initialX: '70%',
      initialY: '60%',
      duration: 25
    },
    {
      size: 350,
      color: 'rgba(59, 130, 246, 0.06)',
      initialX: '40%',
      initialY: '80%',
      duration: 30
    }
  ];

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {orbs.map((orb, index) => (
        <motion.div
          key={index}
          className="absolute rounded-full"
          style={{
            width: orb.size,
            height: orb.size,
            background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
            filter: 'blur(60px)',
            left: orb.initialX,
            top: orb.initialY,
          }}
          animate={{
            x: [0, 100, -50, 0],
            y: [0, -80, 60, 0],
            scale: [1, 1.2, 0.9, 1],
          }}
          transition={{
            duration: orb.duration,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
};

export default AnimatedOrbs;
