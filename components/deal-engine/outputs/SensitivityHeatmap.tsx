import React, { useEffect } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { fmtPct, irrColor } from '../../../lib/formatters';

const TABLE_LABELS: Record<number, string> = {
  1: 'Growth × Exit Multiple',
  2: 'Growth × Margin',
  3: 'Entry × Exit Multiple',
  4: 'Leverage × Exit Multiple',
};

const irrCellBg = (irr: number | null | undefined): string => {
  if (irr == null) return 'rgba(17,17,17,0.04)';
  if (irr > 0.25) return '#dcfce7';
  if (irr >= 0.15) return '#fef3c7';
  return '#fee2e2';
};

const SensitivityHeatmap: React.FC = () => {
  const activeTable = useDealEngineStore((s) => s.activeSensitivityTable);
  const setActive = useDealEngineStore((s) => s.setActiveSensitivityTable);
  const loadSensitivity = useDealEngineStore((s) => s.loadSensitivity);
  const tables = useDealEngineStore((s) => s.sensitivityTables);
  const table = tables.find((t) => t.table_id === activeTable);

  useEffect(() => {
    if (!table) loadSensitivity(activeTable);
  }, [activeTable]);

  const toggleBtnStyle = (active: boolean) => ({
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: '0.08em',
    color: active ? '#CC0000' : 'rgba(17,17,17,0.4)',
    border: `1px solid ${active ? 'rgba(204,0,0,0.3)' : 'rgba(17,17,17,0.12)'}`,
    background: 'transparent',
  });

  return (
    <div className="p-5 mb-3" style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-medium tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
          Sensitivity
        </span>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((id) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className="text-xs px-2 py-0.5 transition-colors"
              style={toggleBtnStyle(activeTable === id)}
            >
              T{id}
            </button>
          ))}
        </div>
      </div>

      <div className="text-[10px] mb-3 tracking-wider" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
        {TABLE_LABELS[activeTable]}
      </div>

      {!table ? (
        <div className="grid grid-cols-9 gap-px">
          {Array.from({ length: 81 }, (_, i) => (
            <div key={i} className="h-6 animate-pulse" style={{ background: 'rgba(17,17,17,0.06)' }} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <thead>
              <tr>
                <th className="text-[10px] p-1" style={{ color: 'rgba(17,17,17,0.4)' }}></th>
                {table.col_values.map((cv, i) => (
                  <th key={i} className="text-[10px] p-1 text-center" style={{ color: 'rgba(17,17,17,0.4)' }}>
                    {table.col_variable.includes('multiple') || table.col_variable.includes('leverage')
                      ? `${cv.toFixed(1)}x`
                      : `${(cv * 100).toFixed(1)}%`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.row_values.map((rv, ri) => (
                <tr key={ri}>
                  <td className="text-[10px] p-1" style={{ color: 'rgba(17,17,17,0.4)' }}>
                    {table.row_variable.includes('multiple') || table.row_variable.includes('leverage')
                      ? `${rv.toFixed(1)}x`
                      : `${(rv * 100).toFixed(1)}%`}
                  </td>
                  {table.col_values.map((_, ci) => {
                    const irr = table.irr_matrix[ri]?.[ci];
                    const moic = table.moic_matrix[ri]?.[ci];
                    return (
                      <td
                        key={ci}
                        className="text-center p-1 text-[10px] cursor-default"
                        style={{ color: irrColor(irr), background: irrCellBg(irr), fontWeight: 600 }}
                        title={irr != null ? `IRR: ${fmtPct(irr)} | MOIC: ${moic?.toFixed(2)}x` : 'N/C'}
                      >
                        {irr != null ? fmtPct(irr) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SensitivityHeatmap;
