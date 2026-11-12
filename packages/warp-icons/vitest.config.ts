import { defineConfig } from 'vitest/config'
import weft from '@weft-js/core/vite'

export default defineConfig({
  plugins: [weft()],
  test: {
    fsModuleCachePath: 'node_modules/.vitest-cache',
    globals: true,
    environment: 'jsdom',
  },
})
