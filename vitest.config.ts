import { defineConfig } from 'vitest/config';

/** The public repository must test on its own, without discovering the private parent's config. */
export default defineConfig({
  cacheDir: 'node_modules/.vitest-oss',
  resolve: {
    alias: {
      '@pireel/studio-ui/': new URL('./packages/studio-ui/src/', import.meta.url).pathname,
      '@pireel/studio-engine/': new URL('./packages/studio-engine/src/', import.meta.url).pathname,
      '@pireel/ui/': new URL('./packages/ui/src/', import.meta.url).pathname,
      '@pireel/studio-kit/': new URL('./packages/studio-kit/src/', import.meta.url).pathname,
      '@pireel/studio-kit': new URL('./packages/studio-kit/src/index.ts', import.meta.url).pathname,
    },
  },
  test: { environment: 'node', include: ['packages/*/src/**/*.test.ts'] },
});
