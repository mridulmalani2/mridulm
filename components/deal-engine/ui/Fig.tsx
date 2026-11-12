/**
 * A figure that can be traced: clicking it opens the trace panel on the row of the Excel model
 * that produces it. `label` is that row's label in the workbook; `year` picks the column of a
 * yearly row (0 = close).
 */
import React from 'react';
import { dealUiStore } from '../../../store/dealUi';

const Fig: React.FC<{ label: string; year?: number; sheet?: string; children: React.ReactNode; className?: string }> = ({ label, year, sheet, children, className }) => {
  const open = () => dealUiStore.getState().setTrace({ label, year, sheet });
  return (
    <span role="button" tabIndex={0} title="Show where this number comes from" className={`de-trace ${className ?? ''}`}
      onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}>
      {children}
    </span>
  );
};

export default Fig;
