import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';
import { handleErcotQueueRequest } from './server/ercotProxy.mjs';
import { handleEiaElectricityRequest } from './server/eiaProxy.mjs';
import { handleAnalyzeEvidenceRequest } from './server/aiEvidenceProxy.mjs';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

function ercotQueueApiPlugin(): Plugin {
  return {
    name: 'safeloc-ercot-queue-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
        if (pathname !== '/api/ercot-queue') {
          next();
          return;
        }
        await handleErcotQueueRequest(req, res);
      });
    },
  };
}

function eiaElectricityApiPlugin(): Plugin {
  return {
    name: 'safeloc-eia-electricity-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
        if (pathname !== '/api/eia/electricity') {
          next();
          return;
        }
        await handleEiaElectricityRequest(req, res);
      });
    },
  };
}

function analyzeEvidenceApiPlugin(): Plugin {
  return {
    name: 'safeloc-analyze-evidence-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
        if (pathname !== '/api/analyze-evidence') {
          next();
          return;
        }
        await handleAnalyzeEvidenceRequest(req, res);
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    ercotQueueApiPlugin(),
    eiaElectricityApiPlugin(),
    analyzeEvidenceApiPlugin(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
