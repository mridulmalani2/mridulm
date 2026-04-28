/**
 * TraceGraphContext — provides traceModeActive and onOpenCard to output
 * components so they can attach trace targets without prop drilling.
 */

import React, { createContext, useContext } from 'react';

interface TraceGraphContextValue {
  traceModeActive: boolean;
  onOpenCard: (fieldPath: string) => void;
}

const TraceGraphContext = createContext<TraceGraphContextValue>({
  traceModeActive: false,
  onOpenCard: () => undefined,
});

export const TraceGraphProvider: React.FC<{
  traceModeActive: boolean;
  onOpenCard: (fieldPath: string) => void;
  children: React.ReactNode;
}> = ({ traceModeActive, onOpenCard, children }) => (
  <TraceGraphContext.Provider value={{ traceModeActive, onOpenCard }}>
    {children}
  </TraceGraphContext.Provider>
);

export function useTraceGraphContext(): TraceGraphContextValue {
  return useContext(TraceGraphContext);
}
