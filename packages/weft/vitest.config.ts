import { statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import weft from './vite.mjs'

const src = (f: string) => fileURLToPath(new URL(`./src/${f}`, import.meta.url))

// Vitest's module cache keys on the lockfile only. Compiled .tsx also depends on the native compiler, so key the
// cache on it, or a rebuilt compiler gets served stale output.
const native = fileURLToPath(new URL(`./native/weft-compiler.${process.platform}-${process.arch}.node`, import.meta.url))
const cacheKey = `${Math.round(statSync(native).mtimeMs)}`

export default defineConfig({
  plugins: [weft()],
  resolve: { alias: [{ find: /^weft\/dom$/, replacement: src('dom.ts') }, { find: /^weft\/ssr$/, replacement: src('ssr.ts') }, { find: /^weft\/head$/, replacement: src('head-client.ts') }, { find: /^weft\/surface$/, replacement: src('surface.tsx') }, { find: /^weft\/test\/plugins$/, replacement: src('test-plugins.ts') }, { find: /^weft\/test$/, replacement: src('test.ts') }, { find: /^weft\/persist$/, replacement: src('persist.ts') }, { find: /^weft\/history$/, replacement: src('history.ts') }, { find: /^weft\/linked$/, replacement: src('linked.ts') }, { find: /^weft\/hmr$/, replacement: src('hmr.ts') }, { find: /^weft\/browser$/, replacement: src('browser.ts') }, { find: /^weft\/devtools$/, replacement: src('devtools.ts') }, { find: /^weft\/agent$/, replacement: src('agent.ts') }, { find: /^weft\/style$/, replacement: src('style.ts') }, { find: /^weft\/media$/, replacement: src('media.tsx') }, { find: /^weft\/shape$/, replacement: src('shape.ts') }, { find: /^weft\/text$/, replacement: src('text.tsx') }, { find: /^weft$/, replacement: src('index.ts') }] },
  test: { globalSetup: ['test/oracle.setup.ts'], fsModuleCachePath: `node_modules/.vitest-cache/${cacheKey}`, environment: 'jsdom', globals: true, include: ['test/**/*.test.{ts,tsx}'] },
})
