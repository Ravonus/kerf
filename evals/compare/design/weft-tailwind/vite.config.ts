import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import weft from '@weft-js/core/vite'
export default defineConfig({ plugins: [weft(), tailwindcss()] })
