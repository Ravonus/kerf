import solid from 'vite-plugin-solid'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [solid({ hot: false })],
  resolve: {
    conditions: ['development', 'browser'],
    alias: { '#adapter': new URL('./adapter.tsx', import.meta.url).pathname },
  },
  test: {
    fsModuleCachePath: 'node_modules/.vitest-cache',
    environment: 'jsdom',
    globals: true,
    include: ['.grade/**/*.test.tsx'],
    testTimeout: 10_000,
  },
})
