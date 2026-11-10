import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev only: serve /api/edgar from the SAME handler Vercel deploys (api/edgar.ts, an Edge
 * function taking a Web Request). Without this the dev server answers /api/* with index.html
 * and no filing import can be tried locally. Nothing here ships: `apply: 'serve'`.
 */
function edgarProxyDev(): Plugin {
  return {
    name: 'edgar-proxy-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/edgar', async (req, res) => {
        try {
          const mod = await server.ssrLoadModule('/api/edgar.ts');
          const response: Response = await mod.default(new Request(`http://localhost${req.originalUrl ?? req.url}`, { method: req.method, headers: { accept: 'application/json' } }));
          res.statusCode = response.status;
          response.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) res.setHeader(k, v); });
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          res.statusCode = 502;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: `dev proxy: ${(e as Error).message}` }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), edgarProxyDev()],
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
