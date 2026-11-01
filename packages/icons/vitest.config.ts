import { defineConfig } from 'vitest/config'
import weft from 'weft/vite'

export default defineConfig({
  plugins: [weft()],
  test: { globals: true, environment: 'jsdom' },
})
