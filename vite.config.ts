
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  // SSR build configuration used by `vite build --ssr entry-server.tsx`
  ssr: {
    noExternal: ['framer-motion', 'lucide-react'],
  },
});
