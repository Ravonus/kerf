import { statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import weft from 'weft/vite'

// compiled .tsx also depends on the native compiler: key the module cache on it (packages/weft does the same)
const native = fileURLToPath(new URL(`../weft/native/weft-compiler.${process.platform}-${process.arch}.node`, import.meta.url))

export default defineConfig({
  plugins: [weft()],
  test: { fsModuleCachePath: `node_modules/.vitest-cache/${Math.round(statSync(native).mtimeMs)}`, environment: 'jsdom', globals: true, include: ['test/**/*.test.{ts,tsx,mjs}'] },
})
