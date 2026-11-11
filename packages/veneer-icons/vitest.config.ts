import { defineConfig } from 'vitest/config'
import kerf from '@kerf-js/core/vite'

export default defineConfig({
  plugins: [kerf()],
  test: { globals: true, environment: 'jsdom' },
})
