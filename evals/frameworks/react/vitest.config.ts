import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '#adapter': new URL('./adapter.tsx', import.meta.url).pathname } },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['.grade/**/*.test.tsx'],
    testTimeout: 10_000,
  },
})
