import weft from '@weft-js/core/vite'
import { defineConfig } from 'vitest/config'
import { statSync } from 'node:fs'
import { createRequire } from 'node:module'

// Vitest's module cache keys on the lockfile only; compiled .tsx also depends on the compiler, so key the
// cache on it (packages/weft/vitest.config.ts does the same).
const native = createRequire(import.meta.url)('@weft-js/core/compiler').backend.file
const cacheKey = `${Math.round(statSync(native).mtimeMs)}`

export default defineConfig({
  plugins: [weft()],
  resolve: { alias: { '#adapter': new URL('./adapter.tsx', import.meta.url).pathname } },
  test: {
    fsModuleCachePath: `node_modules/.vitest-cache/${cacheKey}`,
    environment: 'jsdom',
    globals: true,
    include: ['.grade/**/*.test.tsx'],
    testTimeout: 10_000,
  },
})
