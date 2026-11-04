import { statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'
import weft from '@weft-js/core/vite'

// compiled .tsx also depends on the compiler: key the module cache on it (packages/core does the same)
const native = createRequire(import.meta.url)('@weft-js/core/compiler').backend.file

export default defineConfig({
  plugins: [weft()],
  test: {
    fsModuleCachePath: `node_modules/.vitest-cache/${Math.round(statSync(native).mtimeMs)}`,
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.{ts,tsx,mjs}'],
  },
})
