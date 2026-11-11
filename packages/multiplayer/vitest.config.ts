import { defineConfig } from 'vitest/config'
import kerf from '@kerf-js/core/vite'

// `@kerf-js/start` is linked from outside this package's root, and jsdom's environment reads through Vite's file allowlist.
export default defineConfig({
  plugins: [kerf()],
  server: { fs: { allow: ['..'] } },
  test: { environment: 'node', globals: true },
})
