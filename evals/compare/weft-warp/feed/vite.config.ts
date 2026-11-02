import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import weft from '@weft-js/core/vite'

// What `text()` in weft.config.ts binds: the slim engine on the text.measure slot.
const engine = fileURLToPath(new URL('../../../../packages/text/dist/index.js', import.meta.url))
const slot = { name: 'measure', enforce: 'pre' as const, resolveId: (s: string) => (s === 'weft:slot/text.measure' ? '\0measure' : null), load: (i: string) => (i === '\0measure' ? `export const provider = 'slim'\nexport const load = () => import(${JSON.stringify(engine)}).then(m => m.loadTextEngine())\n` : null) }
export default defineConfig({ plugins: [slot, weft()] })
