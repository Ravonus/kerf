import { defineConfig } from 'vitest/config'
import kerf from '@kerf/core/vite'

// `@kerf/start` is linked from outside this package's root, and jsdom's environment reads through Vite's file allowlist.
export default defineConfig({
  plugins: [kerf()],
  server: { fs: { allow: ['..'] } },
  test: { environment: 'node', globals: true },
})
