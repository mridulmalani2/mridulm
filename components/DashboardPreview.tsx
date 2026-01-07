import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, DollarSign, Users, PieChart } from 'lucide-react';

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  change: string;
  isPositive: boolean;
  delay: number;
}

const MetricCard: React.FC<MetricCardProps> = ({ icon, label, value, change, isPositive, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.6 }}
    viewport={{ once: true }}
    whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
    className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl border border-white/10 rounded-2xl p-6 relative overflow-hidden group"
  >
    {/* Glow effect on hover */}
    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/0 to-amber-500/0 group-hover:from-amber-500/10 group-hover:to-transparent transition-all duration-500" />

    <div className="relative z-10">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-500">
          {icon}
        </div>
        <div className={`text-xs font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
          {change}
        </div>
      </div>

      <div className="font-montserrat text-2xl font-black text-white mb-1">
        {value}
      </div>

      <div className="font-montserrat text-[9px] tracking-widest text-white/40 uppercase font-bold">
        {label}
      </div>
    </div>
  </motion.div>
);

const DashboardPreview: React.FC = () => {
  const [activeData, setActiveData] = useState(0);

  const datasets = [
    { value: 82, label: 'Q1' },
    { value: 65, label: 'Q2' },
    { value: 91, label: 'Q3' },
    { value: 78, label: 'Q4' }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveData((prev) => (prev + 1) % datasets.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full page-container py-20 relative">
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        transition={{ duration: 1 }}
        viewport={{ once: true }}
        className="space-y-12"
      >
        {/* Section Header */}
        <div className="text-center space-y-4 mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="font-montserrat text-amber-500 text-[10px] tracking-widest font-black uppercase"
          >
            Data-Driven Insights
          </motion.h2>
          <motion.h3
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            viewport={{ once: true }}
            className="font-playfair text-5xl md:text-6xl italic text-white"
          >
            Built for Impact
          </motion.h3>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <MetricCard
            icon={<DollarSign size={20} />}
            label="Portfolio Value"
            value="$2.4M"
            change="+12.5%"
            isPositive={true}
            delay={0}
          />
          <MetricCard
            icon={<TrendingUp size={20} />}
            label="Quarterly Growth"
            value="23.8%"
            change="+5.2%"
            isPositive={true}
            delay={0.1}
          />
          <MetricCard
            icon={<Users size={20} />}
            label="Active Deals"
            value="47"
            change="+8"
            isPositive={true}
            delay={0.2}
          />
          <MetricCard
            icon={<PieChart size={20} />}
            label="Success Rate"
            value="89%"
            change="+3%"
            isPositive={true}
            delay={0.3}
          />
        </div>

        {/* Interactive Chart */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          viewport={{ once: true }}
          className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl border border-white/10 rounded-3xl p-8 md:p-12"
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h4 className="font-montserrat text-[9px] tracking-widest text-white/60 uppercase font-bold mb-2">
                Performance Overview
              </h4>
              <p className="font-playfair text-3xl italic text-white">
                Quarterly Analysis
              </p>
            </div>
            <div className="text-right">
              <div className="font-montserrat text-3xl font-black text-amber-500">
                {datasets[activeData].value}%
              </div>
              <div className="font-montserrat text-[9px] tracking-widest text-white/40 uppercase font-bold">
                {datasets[activeData].label}
              </div>
            </div>
          </div>

          {/* Bar Chart */}
          <div className="flex items-end justify-between gap-4 h-48">
            {datasets.map((data, index) => (
              <motion.div
                key={data.label}
                className="flex-1 flex flex-col items-center gap-3 cursor-pointer group"
                onMouseEnter={() => setActiveData(index)}
              >
                <div className="w-full bg-white/5 rounded-t-xl overflow-hidden relative">
                  <motion.div
                    initial={{ height: 0 }}
                    whileInView={{ height: `${data.value}%` }}
                    transition={{ delay: 0.6 + index * 0.1, duration: 1, ease: "easeOut" }}
                    viewport={{ once: true }}
                    className={`w-full rounded-t-xl transition-all duration-300 ${
                      activeData === index
                        ? 'bg-gradient-to-t from-amber-500 to-amber-400'
                        : 'bg-gradient-to-t from-amber-500/40 to-amber-400/40'
                    }`}
                    style={{
                      boxShadow: activeData === index ? '0 -4px 20px rgba(245, 158, 11, 0.4)' : 'none'
                    }}
                  />
                </div>
                <div className={`font-montserrat text-xs font-bold transition-colors ${
                  activeData === index ? 'text-amber-500' : 'text-white/40'
                }`}>
                  {data.label}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default DashboardPreview;
