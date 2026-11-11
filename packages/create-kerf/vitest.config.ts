import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fsModuleCachePath: 'node_modules/.vitest-cache-create',
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
