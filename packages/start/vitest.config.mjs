import { defineConfig } from 'vitest/config'
import weft from '@weft-js/core/vite'

export default defineConfig({
  // .tsx tests (the server-function cache under @weft-js/core/test, jsdom) compile with weft's plugin.
  plugins: [weft()],
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.{mjs,ts,tsx}'],
    globalSetup: ['test/dev-server.setup.mjs'],
    // One dev server, one fixture database: a file's mutation shows up in another's DOM-write count.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
