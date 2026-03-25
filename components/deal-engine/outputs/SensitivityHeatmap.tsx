import React, { useEffect } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { fmtPct, irrColor } from '../../../lib/formatters';

const TABLE_LABELS: Record<number, string> = {
  1: 'Growth × Exit Multiple',
  2: 'Growth × Margin',
  3: 'Entry × Exit Multiple',
  4: 'Leverage × Exit Multiple',
};

const SensitivityHeatmap: React.FC = () => {
  const activeTable = useDealEngineStore((s) => s.activeSensitivityTable);
  const setActive = useDealEngineStore((s) => s.setActiveSensitivityTable);
  const loadSensitivity = useDealEngineStore((s) => s.loadSensitivity);
  const tables = useDealEngineStore((s) => s.sensitivityTables);
  const isCalc = useDealEngineStore((s) => s.isCalculating);

  const table = tables.find((t) => t.table_id === activeTable);

  useEffect(() => {
    if (!table) loadSensitivity(activeTable);
  }, [activeTable]);

  return (
    <div className="p-4 mb-3" style={{ background: '#0f1420', border: '1px solid #1e2a3a' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium tracking-widest uppercase" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>
          Sensitivity
        </span>
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((id) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className="text-xs px-1.5 py-0.5"
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                color: activeTable === id ? '#00d4ff' : '#6b7a96',
                border: `1px solid ${activeTable === id ? '#00d4ff' : '#1e2a3a'}`,
              }}
            >
              T{id}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs mb-2" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>
        {TABLE_LABELS[activeTable]}
      </div>

      {!table ? (
        <div className="grid grid-cols-9 gap-px">
          {Array.from({ length: 81 }, (_, i) => (
            <div key={i} className="h-6 animate-pulse" style={{ background: '#1e2a3a' }} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            <thead>
              <tr>
                <th className="text-xs p-1" style={{ color: '#6b7a96' }}></th>
                {table.col_values.map((cv, i) => (
                  <th key={i} className="text-xs p-1 text-center" style={{ color: '#6b7a96' }}>
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
                  <td className="text-xs p-1" style={{ color: '#6b7a96' }}>
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
                        className="text-center p-1 text-xs cursor-default"
                        style={{ color: '#0a0d13', background: irrColor(irr), fontWeight: 600 }}
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
