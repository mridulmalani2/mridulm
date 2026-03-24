import React from 'react';

interface CategoryBadgeProps {
  category: string;
  size?: 'sm' | 'md';
}

const categoryColors: Record<string, string> = {
  'deal-analysis': 'bg-[#CC0000] text-white',
  'investment-memo': 'bg-[#111] text-white',
  'sector-analysis': 'bg-[#444] text-white',
  'short-note': 'bg-[#666] text-white',
};

const categoryLabels: Record<string, string> = {
  'deal-analysis': 'Deal Analysis',
  'investment-memo': 'Investment Memo',
  'sector-analysis': 'Sector Analysis',
  'short-note': 'Short Note',
};

const CategoryBadge: React.FC<CategoryBadgeProps> = ({ category, size = 'sm' }) => {
  const color = categoryColors[category] || 'bg-[#111] text-white';
  const label = categoryLabels[category] || category;

  return (
    <span
      className={`${color} font-mono tracking-widest uppercase inline-block ${
        size === 'sm' ? 'text-[9px] px-2 py-0.5' : 'text-[10px] px-3 py-1'
      }`}
    >
      {label}
    </span>
  );
};

export default CategoryBadge;
