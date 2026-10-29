import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import weft from './vite.mjs'

const src = (f: string) => fileURLToPath(new URL(`./src/${f}`, import.meta.url))

export default defineConfig({
  plugins: [weft()],
  resolve: { alias: [{ find: /^weft\/dom$/, replacement: src('dom.ts') }, { find: /^weft\/ssr$/, replacement: src('ssr.ts') }, { find: /^weft\/test$/, replacement: src('test.ts') }, { find: /^weft\/persist$/, replacement: src('persist.ts') }, { find: /^weft\/history$/, replacement: src('history.ts') }, { find: /^weft$/, replacement: src('index.ts') }] },
  test: { environment: 'jsdom', globals: true, include: ['test/**/*.test.{ts,tsx}'] },
})
