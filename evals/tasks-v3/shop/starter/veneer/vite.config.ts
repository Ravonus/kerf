import kerf from '@kerf-js/core/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [kerf()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.tsx', 'src/**/*.test.tsx'],
  },
})
