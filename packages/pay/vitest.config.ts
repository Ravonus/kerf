import { defineConfig } from 'vitest/config'
import kerf from '@kerf-js/core/vite'

// `..`: @kerf-js/start and kerf are linked from next door, and start loads its realtime fake by a path Vite has to serve.
export default defineConfig({
  plugins: [kerf()],
  server: { fs: { allow: ['..'] } },
  test: {
    fsModuleCachePath: 'node_modules/.vitest-cache',
    globals: true,
    include: ['test/**/*.test.{mjs,ts,tsx}'],
    testTimeout: 120_000,
  },
})
