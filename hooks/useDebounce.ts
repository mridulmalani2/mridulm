import { useCallback, useRef } from 'react';

export function useDebounce<T extends (...args: any[]) => void>(fn: T, delay = 400): T {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return useCallback(
    (...args: any[]) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fn(...args), delay);
    },
    [fn, delay],
  ) as unknown as T;
}
