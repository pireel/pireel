import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { localAssets } from './local-assets-plugin';

export default defineConfig({
  // Workspace packages export TS source. Native Vite tsconfig resolution follows
  // each importer to the app or workspace tsconfig, so aliases work in both scopes.
  resolve: { tsconfigPaths: true },
  // localAssets: disk-backed uploads (the local counterpart of the hosted R2+CDN provider).
  plugins: [react(), tailwindcss(), localAssets()],
});
