import { defineConfig } from 'vite'
import kerf from '@kerf-js/core/vite'

export default defineConfig({
  base: './',
  plugins: [kerf()],
  build: { rolldownOptions: { input: 'src/main.tsx', output: { entryFileNames: 'main.js' } } },
})
