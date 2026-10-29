import weft from 'weft/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [weft()],
  resolve: { alias: { '#adapter': new URL('./adapter.tsx', import.meta.url).pathname } },
  test: { environment: 'jsdom', globals: true, include: ['.grade/**/*.test.tsx'], testTimeout: 10_000 },
})
