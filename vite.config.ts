import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

const sh = (c: string) => { try { return execSync(c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
// Stamp every build so "am I on the latest version?" is answerable from the sidebar footer.
const BUILD = `${process.env.COMMIT_REF?.slice(0, 7) || sh('git rev-parse --short HEAD') || 'dev'} · ${new Date().toISOString().slice(0, 10)}`;
// Local development / preview: forward /svc/ to the local document services (deploy/services) when SVC_TARGET is set, e.g. SVC_TARGET=http://127.0.0.1:8088
const svc = process.env.SVC_TARGET ? { '/svc': { target: process.env.SVC_TARGET, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/svc/, '') } } : undefined;
export default defineConfig({
  plugins: [react(), { name: 'version-json', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD, node: process.version }) }); } }],
  define: { __BUILD__: JSON.stringify(BUILD) },
  build: { chunkSizeWarningLimit: 1500 },
  server: { proxy: svc },
  preview: { proxy: svc },
});
