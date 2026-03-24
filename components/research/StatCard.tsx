import React from 'react';

interface StatCardProps {
  label: string;
  value: string;
  subtext?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, subtext }) => {
  return (
    <div className="border border-[#111]/10 p-4 md:p-5 transition-all duration-300 hover:shadow-[3px_3px_0px_#111111] hover:translate-x-[-1.5px] hover:translate-y-[-1.5px]">
      <p className="font-mono text-[10px] tracking-widest uppercase text-[#111]/40 mb-2">
        {label}
      </p>
      <p className="font-playfair text-2xl md:text-3xl font-bold text-[#111] leading-none">
        {value}
      </p>
      {subtext && (
        <p className="font-mono text-[10px] tracking-wide text-[#111]/40 mt-1.5">{subtext}</p>
      )}
    </div>
  );
};

export default StatCard;
