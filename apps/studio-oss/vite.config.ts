import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { localAssets } from './local-assets-plugin';

export default defineConfig({
  // tsconfigPaths: workspace packages export TS source (same idiom as the hosted app).
  // The root tsconfig is listed too: package files match ITS include, so imports
  // originating inside packages/* get path-mapped as well.
  // localAssets: disk-backed uploads (the local counterpart of the hosted R2+CDN provider).
  plugins: [tsconfigPaths({ projects: ['./tsconfig.json', '../../tsconfig.json'] }), react(), tailwindcss(), localAssets()],
});
