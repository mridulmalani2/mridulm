import { defineConfig } from 'vitest/config';

// Engine tests are pure TypeScript (no DOM); component smoke tests SSR-render via
// react-dom/server (also DOM-free). Both run in a node environment.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
