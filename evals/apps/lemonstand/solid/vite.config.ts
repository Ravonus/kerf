import { solidStart } from '@solidjs/start/config'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    solidStart({ middleware: './src/middleware.ts' }),
    tailwindcss(),
    nitro({ compressPublicAssets: { gzip: true, brotli: true } }),
  ],
})
