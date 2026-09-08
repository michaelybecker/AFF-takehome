import { runWorkspace } from './server/workspace.mjs';
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
        const services = { stills: handleStills, motion: handleMotion, assistant: handleAssistant, explorations: handleExplorations, deliveries: handleDeliveries, workspace: null };
        const service = req.url?.split('?')[0].replace('/api/', '') as keyof typeof services;
        if (Object.prototype.hasOwnProperty.call(services, service)) {
          void runWorkspace(req, res, services[service], {service, local: true, env: loadEnv(server.config.mode, server.config.envDir, '')}); return;
        }
        if (req.url?.includes('.local-data')) { res.statusCode = 403; res.end('Private application data.'); return; }
        if (req.url?.split('?')[0] !== '/api/runcomfy/check') return next();
        const env = loadEnv(server.config.mode, server.config.envDir, 'RUNCOMFY_');
        void checkConnection(req, res, { local: true, apiKey: env.RUNCOMFY_API_KEY });
      });
    },
  }],
  build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
