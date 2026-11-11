import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import kerf from '@kerf/core/vite'
export default defineConfig({ plugins: [kerf(), tailwindcss()] })
