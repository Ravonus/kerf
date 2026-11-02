import weft from '@weft-js/core/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [weft()],
  test: { environment: 'jsdom', globals: true, include: ['tests/**/*.test.tsx', 'src/**/*.test.tsx'] },
})
