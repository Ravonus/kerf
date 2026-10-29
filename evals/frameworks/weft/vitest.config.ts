import weft from 'weft/vite'
import { defineConfig } from 'vitest/config'
import { statSync } from 'node:fs'

// Vitest's module cache keys on the lockfile only; compiled .tsx also depends on the native compiler and the back
// end (WEFT_BACKEND), so key the cache on both (packages/weft/vitest.config.ts does the same).
const native = new URL(`./node_modules/weft/native/weft-compiler.${process.platform}-${process.arch}.node`, import.meta.url).pathname
const cacheKey = `${process.env.WEFT_BACKEND ?? 'solid'}-${Math.round(statSync(native).mtimeMs)}`

export default defineConfig({
  plugins: [weft()],
  resolve: { alias: { '#adapter': new URL('./adapter.tsx', import.meta.url).pathname } },
  test: { fsModuleCachePath: `node_modules/.vitest-cache/${cacheKey}`, environment: 'jsdom', globals: true, include: ['.grade/**/*.test.tsx'], testTimeout: 10_000 },
})
