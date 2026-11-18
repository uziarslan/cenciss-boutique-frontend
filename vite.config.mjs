import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const releaseServiceWorker = (buildId) => ({
  name: 'cenciss-release-service-worker',
  apply: 'build',
  async closeBundle() {
    const workerPath = resolve(process.cwd(), 'build/sw.js');
    const worker = await readFile(workerPath, 'utf8');
    const token = '__CENCISS_BUILD_ID__';
    if (!worker.includes(token)) {
      throw new Error('The service-worker build ID placeholder is missing.');
    }
    await writeFile(workerPath, worker.replaceAll(token, buildId));
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // A different worker URL and cache name for every production build prevents
  // an open tab from mixing HTML from one release with chunks from another.
  // Deploy pipelines can provide APP_BUILD_ID for traceability; local builds
  // use a unique timestamp so the same update path is still exercised.
  const buildId = env.APP_BUILD_ID || env.VITE_APP_BUILD_ID || Date.now().toString(36);
  return {
    plugins: [react(), releaseServiceWorker(buildId)],
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
      'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
      'process.env.PUBLIC_URL': JSON.stringify(env.PUBLIC_URL || ''),
      'process.env.REACT_APP_API_URL': JSON.stringify(env.REACT_APP_API_URL || ''),
      'process.env.REACT_APP_SOCKET_URL': JSON.stringify(env.REACT_APP_SOCKET_URL || ''),
      'process.env.REACT_APP_OUTLET_CODE': JSON.stringify(env.REACT_APP_OUTLET_CODE || ''),
      'process.env.REACT_APP_ACCESS_TOKEN_LIFETIME_MS': JSON.stringify(
        env.REACT_APP_ACCESS_TOKEN_LIFETIME_MS || '',
      ),
    },
    build: {
      outDir: 'build',
      emptyOutDir: true,
      // The service worker reads this Vite manifest during installation and
      // does not activate until every generated JS/CSS chunk is available.
      manifest: 'asset-manifest.json',
    },
    server: {
      port: 3000,
      proxy: {
        '/api': 'http://localhost:4000',
      },
    },
    preview: {
      port: 3000,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/setupTests.js',
      css: true,
    },
  };
});
