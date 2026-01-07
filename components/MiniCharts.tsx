import React from 'react';
import { motion } from 'framer-motion';

const MiniCharts: React.FC = () => {
  // Generate realistic financial data points
  const generateDataPoints = (count: number, volatility: number = 10) => {
    const points: number[] = [];
    let value = 50;
    for (let i = 0; i < count; i++) {
      value += (Math.random() - 0.45) * volatility;
      value = Math.max(20, Math.min(80, value));
      points.push(value);
    }
    return points;
  };

  const chartData = [
    { label: 'Growth', data: generateDataPoints(12, 8), color: '#10b981' },
    { label: 'Returns', data: generateDataPoints(12, 12), color: '#f59e0b' },
    { label: 'Volume', data: generateDataPoints(12, 6), color: '#6366f1' }
  ];

  const createPath = (data: number[]) => {
    const width = 100;
    const height = 40;
    const step = width / (data.length - 1);

    return data
      .map((point, i) => {
        const x = i * step;
        const y = height - (point / 100) * height;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  return (
    <div className="absolute top-1/2 -translate-y-1/2 left-8 hidden xl:block pointer-events-none z-10">
      <div className="space-y-6">
        {chartData.map((chart, index) => (
          <motion.div
            key={chart.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 + index * 0.2, duration: 0.8 }}
            className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-xl p-4 w-40"
          >
            <div className="font-montserrat text-[8px] tracking-widest text-white/60 uppercase font-bold mb-3">
              {chart.label}
            </div>
            <svg viewBox="0 0 100 40" className="w-full h-10">
              {/* Grid lines */}
              <line x1="0" y1="10" x2="100" y2="10" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
              <line x1="0" y1="20" x2="100" y2="20" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
              <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />

              {/* Area fill */}
              <motion.path
                d={`${createPath(chart.data)} L 100 40 L 0 40 Z`}
                fill={`url(#gradient-${index})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.2 }}
                transition={{ delay: 0.8 + index * 0.2, duration: 1 }}
              />

              {/* Line */}
              <motion.path
                d={createPath(chart.data)}
                fill="none"
                stroke={chart.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.8 + index * 0.2, duration: 1.5, ease: "easeInOut" }}
              />

              <defs>
                <linearGradient id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chart.color} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={chart.color} stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default MiniCharts;
