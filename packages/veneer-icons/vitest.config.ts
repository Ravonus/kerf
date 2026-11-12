import { defineConfig } from 'vitest/config'
import kerf from '@kerf-js/core/vite'

export default defineConfig({
  plugins: [kerf()],
  test: {
    fsModuleCachePath: 'node_modules/.vitest-cache',
    globals: true,
    environment: 'jsdom',
  },
})
