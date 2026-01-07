import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Activity, BarChart3 } from 'lucide-react';

interface MetricData {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
  icon: React.ReactNode;
}

const FinancialMetrics: React.FC = () => {
  const [activeMetric, setActiveMetric] = useState(0);

  const metrics: MetricData[] = [
    {
      label: 'Portfolio ROI',
      value: '+23.4%',
      change: '+2.3%',
      trend: 'up',
      icon: <TrendingUp size={16} />
    },
    {
      label: 'Deal Flow',
      value: '47',
      change: '+12',
      trend: 'up',
      icon: <Activity size={16} />
    },
    {
      label: 'AUM Analyzed',
      value: '$30M+',
      change: '+15%',
      trend: 'up',
      icon: <BarChart3 size={16} />
    }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveMetric((prev) => (prev + 1) % metrics.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute top-24 right-8 hidden lg:block z-10 pointer-events-none">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeMetric}
          initial={{ opacity: 0, x: 20, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -20, scale: 0.95 }}
          transition={{ duration: 0.5 }}
          className="bg-black/40 backdrop-blur-xl border border-amber-500/20 rounded-2xl p-6 min-w-[240px]"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2 rounded-lg ${metrics[activeMetric].trend === 'up' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              {metrics[activeMetric].icon}
            </div>
            <span className="font-montserrat text-[9px] tracking-widest text-white/60 uppercase font-bold">
              {metrics[activeMetric].label}
            </span>
          </div>

          <div className="flex items-end gap-3">
            <span className="font-montserrat text-3xl font-black text-white">
              {metrics[activeMetric].value}
            </span>
            <div className={`flex items-center gap-1 mb-1 ${metrics[activeMetric].trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
              {metrics[activeMetric].trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              <span className="font-montserrat text-xs font-bold">
                {metrics[activeMetric].change}
              </span>
            </div>
          </div>

          {/* Mini Sparkline */}
          <svg className="w-full h-8 mt-4" viewBox="0 0 100 20">
            <motion.path
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1, ease: "easeInOut" }}
              d="M 0 15 Q 25 10, 50 8 T 100 5"
              fill="none"
              stroke="url(#gradient)"
              strokeWidth="2"
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="1" />
              </linearGradient>
            </defs>
          </svg>

          {/* Progress Indicator */}
          <div className="flex gap-1.5 mt-4">
            {metrics.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                  i === activeMetric ? 'bg-amber-500' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default FinancialMetrics;
