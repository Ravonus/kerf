import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Pure tests (no Canvas): the per-engine break scans against upstream's, the lite tier's line counter and
// walker on synthetic handles, the alphabet and the detector. test/accuracy/ is the browser side.
export default defineConfig({
  resolve: { alias: { '@engine': path.resolve(import.meta.dirname, 'gen/blink') } },
  define: { __ENGINE__: '"blink"' },
  test: { include: ['test/*.test.{ts,mjs}'], environment: 'node', testTimeout: 30000 },
})
