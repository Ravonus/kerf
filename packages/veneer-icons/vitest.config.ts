import { defineConfig } from 'vitest/config'
import kerf from '@kerf/core/vite'

export default defineConfig({
  plugins: [kerf()],
  test: { globals: true, environment: 'jsdom' },
})
