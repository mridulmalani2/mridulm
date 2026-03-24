import React from 'react';
import { motion } from 'framer-motion';

interface ScenarioData {
  name: string;
  subtitle: string;
  probability: string;
  variant: 'base' | 'bull' | 'bear';
  body: string;
  drivers: string[];
  implication: string;
}

interface ScenarioCardProps {
  scenario: ScenarioData;
  index: number;
}

const variantStyles = {
  base: { border: 'border-t-[3px] border-t-[#111]', badge: 'bg-[#111] text-white' },
  bull: { border: 'border-t-[3px] border-t-[#1a7a3a]', badge: 'bg-[#1a7a3a] text-white' },
  bear: { border: 'border-t-[3px] border-t-[#CC0000]', badge: 'bg-[#CC0000] text-white' },
};

const ScenarioCard: React.FC<ScenarioCardProps> = ({ scenario, index }) => {
  const styles = variantStyles[scenario.variant];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className={`border border-[#111]/10 ${styles.border} flex flex-col`}
    >
      <div className="p-5 md:p-6 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h4 className="font-playfair text-lg md:text-xl font-bold text-[#111]">
              {scenario.name}
            </h4>
            <p className="font-lora text-sm text-[#111]/60 italic">{scenario.subtitle}</p>
          </div>
          <span className={`${styles.badge} font-mono text-[9px] tracking-widest uppercase px-2.5 py-1 whitespace-nowrap`}>
            {scenario.probability}
          </span>
        </div>

        {/* Body */}
        <p className="font-lora text-[14px] leading-relaxed text-[#111]/80 mb-5">
          {scenario.body}
        </p>

        {/* Drivers */}
        <div className="mb-5">
          <p className="font-mono text-[10px] tracking-widest uppercase text-[#111]/40 mb-2">
            Key Drivers
          </p>
          <ul className="space-y-1.5">
            {scenario.drivers.map((d, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-1 h-1 bg-[#111]/30 mt-2 shrink-0" />
                <span className="font-lora text-[13px] text-[#111]/70">{d}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Implication */}
        <div className="border-t border-[#111]/10 pt-4">
          <p className="font-mono text-[10px] tracking-widest uppercase text-[#111]/40 mb-2">
            Implication
          </p>
          <p className="font-lora text-[13px] leading-relaxed text-[#111]/70 italic">
            {scenario.implication}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default ScenarioCard;
