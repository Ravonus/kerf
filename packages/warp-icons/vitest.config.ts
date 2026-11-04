import { defineConfig } from 'vitest/config'
import weft from '@weft-js/core/vite'

export default defineConfig({
  plugins: [weft()],
  test: { globals: true, environment: 'jsdom' },
})
