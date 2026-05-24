import { defineConfig } from 'vitest/config';

// Engine tests are pure TypeScript (no DOM), so run them in a node environment.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
