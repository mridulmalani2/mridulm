import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ModelSheet } from '../../data/research/broadcom-vmware/model';

interface ModelViewerProps {
  sheets: ModelSheet[];
}

const ModelViewer: React.FC<ModelViewerProps> = ({ sheets }) => {
  const [activeTab, setActiveTab] = useState(0);
  const sheet = sheets[activeTab];

  return (
    <div className="my-12 md:my-16">
      {/* Section label */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-2 h-2 bg-[#CC0000]" />
        <span className="font-mono text-xs tracking-widest uppercase text-[#111]/50">
          Financial Model
        </span>
      </div>

      <div className="border border-[#111]/15">
        {/* Tab bar */}
        <div className="flex overflow-x-auto border-b border-[#111]/15 bg-[#F0F0EC]">
          {sheets.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveTab(i)}
              className={`px-4 py-3 font-mono text-[11px] tracking-wide whitespace-nowrap transition-colors duration-200 border-b-2 ${
                i === activeTab
                  ? 'border-[#CC0000] text-[#111] bg-[#F9F9F7]'
                  : 'border-transparent text-[#111]/50 hover:text-[#111]/80 hover:bg-[#F9F9F7]/50'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Sheet description */}
        <div className="px-4 py-3 border-b border-[#111]/10 bg-[#F9F9F7]">
          <p className="font-lora text-sm italic text-[#111]/60">{sheet.description}</p>
        </div>

        {/* Table */}
        <AnimatePresence mode="wait">
          <motion.div
            key={sheet.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-x-auto"
          >
            <table className="w-full text-sm border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-[#F0F0EC]">
                  {sheet.columns.map((col, ci) => (
                    <th
                      key={ci}
                      className={`px-4 py-2.5 font-mono text-[11px] tracking-wider uppercase text-[#111]/60 border-b border-[#111]/15 text-left ${
                        ci > 0 ? 'text-right' : ''
                      }`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row, ri) => {
                  if (!row.label && row.values.every((v) => !v)) {
                    return (
                      <tr key={ri}>
                        <td colSpan={sheet.columns.length} className="h-3" />
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={ri}
                      className={`
                        ${row.isHeader ? 'bg-[#F0F0EC]/60' : ''}
                        ${row.isTotal ? 'border-t-2 border-[#111]/20 bg-[#F0F0EC]/40' : 'border-b border-[#111]/5'}
                        hover:bg-[#F0F0EC]/40 transition-colors
                      `}
                    >
                      <td
                        className={`px-4 py-2 font-lora text-[13px] ${
                          row.isHeader
                            ? 'font-semibold text-[#111] text-xs tracking-wider uppercase font-mono pt-3'
                            : row.isBold || row.isTotal
                              ? 'font-semibold text-[#111]'
                              : 'text-[#111]/80'
                        }`}
                        style={{ paddingLeft: row.indent ? `${16 + row.indent * 16}px` : undefined }}
                      >
                        {row.label}
                      </td>
                      {row.values.map((val, vi) => (
                        <td
                          key={vi}
                          className={`px-4 py-2 text-right font-mono text-[12px] ${
                            row.isHeader
                              ? 'font-semibold text-[#111]'
                              : row.isBold || row.isTotal
                                ? 'font-medium text-[#111]'
                                : 'text-[#111]/70'
                          }`}
                        >
                          {val}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </motion.div>
        </AnimatePresence>

        {/* Mobile scroll hint */}
        <div className="md:hidden px-4 py-2 text-center">
          <span className="font-mono text-[10px] text-[#111]/30 tracking-wider">
            SCROLL HORIZONTALLY TO VIEW FULL TABLE
          </span>
        </div>
      </div>
    </div>
  );
};

export default ModelViewer;
