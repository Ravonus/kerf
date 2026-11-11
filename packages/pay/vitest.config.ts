import { defineConfig } from 'vitest/config'
import kerf from '@kerf/core/vite'

// `..`: @kerf/start and kerf are linked from next door, and start loads its realtime fake by a path Vite has to serve.
export default defineConfig({
  plugins: [kerf()],
  server: { fs: { allow: ['..'] } },
  test: { globals: true, include: ['test/**/*.test.{mjs,ts,tsx}'], testTimeout: 120_000 },
})
