import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fsModuleCachePath: 'node_modules/.vitest-cache',
    globals: true,
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
  },
})
