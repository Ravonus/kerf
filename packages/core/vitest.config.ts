import { statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import kerf from './vite.mjs'

const src = (f: string) => fileURLToPath(new URL(`./src/${f}`, import.meta.url))

// Vitest's module cache keys on the lockfile only. Compiled .tsx also depends on the compiler, so key the
// cache on it, or a rebuilt compiler gets served stale output.
const native = createRequire(import.meta.url)('./compiler.cjs').backend.file
const cacheKey = `${Math.round(statSync(native).mtimeMs)}`

export default defineConfig({
  plugins: [kerf()],
  resolve: {
    alias: [
      { find: /^@kerf-js\/core\/internal$/, replacement: src('internal.ts') },
      { find: /^@kerf-js\/core\/dom$/, replacement: src('dom.ts') },
      { find: /^@kerf-js\/core\/ssr$/, replacement: src('ssr.ts') },
      { find: /^@kerf-js\/core\/head$/, replacement: src('head-client.ts') },
      { find: /^@kerf-js\/core\/surface$/, replacement: src('surface.tsx') },
      { find: /^@kerf-js\/core\/test\/plugins$/, replacement: src('test-plugins.ts') },
      { find: /^@kerf-js\/core\/test$/, replacement: src('test.ts') },
      { find: /^@kerf-js\/core\/persist$/, replacement: src('persist.ts') },
      { find: /^@kerf-js\/core\/history$/, replacement: src('history.ts') },
      { find: /^@kerf-js\/core\/hmr$/, replacement: src('hmr.ts') },
      { find: /^@kerf-js\/core\/browser$/, replacement: src('browser.ts') },
      { find: /^@kerf-js\/core\/devtools$/, replacement: src('devtools.ts') },
      { find: /^@kerf-js\/core\/agent$/, replacement: src('agent.ts') },
      { find: /^@kerf-js\/core\/style$/, replacement: src('style.ts') },
      { find: /^@kerf-js\/core\/media$/, replacement: src('media.tsx') },
      { find: /^@kerf-js\/core\/shape$/, replacement: src('shape.ts') },
      { find: /^@kerf-js\/core\/text$/, replacement: src('text.tsx') },
      { find: /^@kerf-js\/core$/, replacement: src('index.ts') },
    ],
  },
  test: {
    globalSetup: ['test/oracle.setup.ts'],
    fsModuleCachePath: `node_modules/.vitest-cache/${cacheKey}`,
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
  },
})
