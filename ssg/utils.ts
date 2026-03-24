// SSR utility: guards Framer Motion initial state to prevent hydration mismatches.
// On the server, returns `false` (skip animation, render in final state).
// On the client, returns the provided initial value (animate normally).
export const isClient = typeof window !== 'undefined';

export function ssrInitial<T>(value: T): T | false {
  return isClient ? value : false;
}
