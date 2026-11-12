import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fsModuleCachePath: 'node_modules/.vitest-cache',
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
