import { statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import weft from './vite.mjs'

const src = (f: string) => fileURLToPath(new URL(`./src/${f}`, import.meta.url))

// Vitest's module cache keys on the lockfile only. Compiled .tsx also depends on the compiler, so key the
// cache on it, or a rebuilt compiler gets served stale output.
const native = createRequire(import.meta.url)('./compiler.cjs').backend.file
const cacheKey = `${Math.round(statSync(native).mtimeMs)}`

export default defineConfig({
  plugins: [weft()],
  resolve: { alias: [{ find: /^@weft-js\/core\/dom$/, replacement: src('dom.ts') }, { find: /^@weft-js\/core\/ssr$/, replacement: src('ssr.ts') }, { find: /^@weft-js\/core\/head$/, replacement: src('head-client.ts') }, { find: /^@weft-js\/core\/surface$/, replacement: src('surface.tsx') }, { find: /^@weft-js\/core\/test\/plugins$/, replacement: src('test-plugins.ts') }, { find: /^@weft-js\/core\/test$/, replacement: src('test.ts') }, { find: /^@weft-js\/core\/persist$/, replacement: src('persist.ts') }, { find: /^@weft-js\/core\/history$/, replacement: src('history.ts') }, { find: /^@weft-js\/core\/hmr$/, replacement: src('hmr.ts') }, { find: /^@weft-js\/core\/browser$/, replacement: src('browser.ts') }, { find: /^@weft-js\/core\/devtools$/, replacement: src('devtools.ts') }, { find: /^@weft-js\/core\/agent$/, replacement: src('agent.ts') }, { find: /^@weft-js\/core\/style$/, replacement: src('style.ts') }, { find: /^@weft-js\/core\/media$/, replacement: src('media.tsx') }, { find: /^@weft-js\/core\/shape$/, replacement: src('shape.ts') }, { find: /^@weft-js\/core\/text$/, replacement: src('text.tsx') }, { find: /^@weft-js\/core$/, replacement: src('index.ts') }] },
  test: { globalSetup: ['test/oracle.setup.ts'], fsModuleCachePath: `node_modules/.vitest-cache/${cacheKey}`, environment: 'jsdom', globals: true, include: ['test/**/*.test.{ts,tsx}'] },
})
