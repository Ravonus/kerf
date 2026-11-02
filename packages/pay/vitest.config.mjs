import { defineConfig } from 'vitest/config'
import weft from '@weft-js/core/vite'

// `..`: @weft-js/start and weft are linked from next door, and start loads its realtime fake by a path Vite has to serve.
export default defineConfig({ plugins: [weft()], server: { fs: { allow: ['..'] } }, test: { globals: true, include: ['test/**/*.test.{mjs,ts,tsx}'], testTimeout: 120_000 } })
