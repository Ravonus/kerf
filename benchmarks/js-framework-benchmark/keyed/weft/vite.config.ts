import { defineConfig } from 'vite'
import weft from '@weft-js/core/vite'

export default defineConfig({
  base: './',
  plugins: [weft()],
  build: { rolldownOptions: { input: 'src/main.tsx', output: { entryFileNames: 'main.js' } } },
})
