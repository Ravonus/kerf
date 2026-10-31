import { defineConfig } from 'vitest/config'
import weft from 'weft/vite'

// `@weft/start` is linked from outside this package's root, and jsdom's environment reads through Vite's file allowlist.
export default defineConfig({ plugins: [weft()], server: { fs: { allow: ['..'] } }, test: { environment: 'node', globals: true } })
