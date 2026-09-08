import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { checkConnection } from './server/runcomfy.mjs';
import { handleStills } from './server/stills.mjs';
import { handleMotion } from './server/motion.mjs';
import { handleAssistant } from './server/assistant.mjs';
import { handleExplorations } from './server/explorations.mjs';
import { handleDeliveries } from './server/deliveries.mjs';

export default defineConfig({
  server: { fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/server/**', '**/api/**', '**/.local-data/**'] } },
  plugins: [react(), {
    name: 'local-runcomfy-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] === '/api/deliveries') {
          void handleDeliveries(req, res, { env: loadEnv(server.config.mode, server.config.envDir, '') }); return;
        }
        if (req.url?.split('?')[0] === '/api/explorations') {
          void handleExplorations(req, res, { env: loadEnv(server.config.mode, server.config.envDir, '') });
          return;
        }
        if (req.url?.includes('.local-data')) { res.statusCode = 403; res.end('Private application data.'); return; }
        if (req.url?.split('?')[0] === '/api/assistant') {
          const env = loadEnv(server.config.mode, server.config.envDir, '');
          void handleAssistant(req, res, { local: true, env });
          return;
        }
        if (req.url?.split('?')[0] === '/api/motion') {
          const env = loadEnv(server.config.mode, server.config.envDir, '');
          void handleMotion(req, res, { local: true, env });
          return;
        }
        if (req.url?.split('?')[0] === '/api/stills') {
          const env = loadEnv(server.config.mode, server.config.envDir, '');
          void handleStills(req, res, { local: true, env });
          return;
        }
        if (req.url?.split('?')[0] !== '/api/runcomfy/check') return next();
        const env = loadEnv(server.config.mode, server.config.envDir, 'RUNCOMFY_');
        void checkConnection(req, res, { local: true, apiKey: env.RUNCOMFY_API_KEY });
      });
    },
  }],
  build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
