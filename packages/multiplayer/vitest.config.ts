import { defineConfig } from 'vitest/config'
import weft from '@weft-js/core/vite'

// `@weft-js/start` is linked from outside this package's root, and jsdom's environment reads through Vite's file allowlist.
export default defineConfig({
  plugins: [weft()],
  server: { fs: { allow: ['..'] } },
  test: {
    fsModuleCachePath: 'node_modules/.vitest-cache',
    environment: 'node',
    globals: true,
  },
})
