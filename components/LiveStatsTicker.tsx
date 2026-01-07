import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Stat {
  value: number;
  label: string;
  suffix?: string;
  prefix?: string;
}

const LiveStatsTicker: React.FC = () => {
  const [stats, setStats] = useState<Stat[]>([
    { value: 0, label: 'Projects Delivered', suffix: '+' },
    { value: 0, label: 'AUM Analyzed', prefix: '$', suffix: 'M+' },
    { value: 0, label: 'Financial Models Built', suffix: '+' },
    { value: 0, label: 'Investment Memos', suffix: '+' }
  ]);

  const finalValues = [15, 30, 25, 12];

  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const interval = duration / steps;

    const timer = setInterval(() => {
      setStats(prevStats =>
        prevStats.map((stat, index) => {
          const final = finalValues[index];
          const increment = final / steps;
          const newValue = Math.min(stat.value + increment, final);
          return { ...stat, value: newValue };
        })
      );
    }, interval);

    const timeout = setTimeout(() => clearInterval(timer), duration);
    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div className="hidden md:flex absolute bottom-32 left-1/2 -translate-x-1/2 gap-8 lg:gap-12 pointer-events-none">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1, duration: 0.6 }}
          className="text-center"
        >
          <div className="font-montserrat text-3xl lg:text-4xl font-black text-amber-500 mb-1 tracking-tight">
            {stat.prefix}
            {Math.floor(stat.value)}
            {stat.suffix}
          </div>
          <div className="font-montserrat text-[9px] tracking-widest text-white/40 uppercase font-bold">
            {stat.label}
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default LiveStatsTicker;
