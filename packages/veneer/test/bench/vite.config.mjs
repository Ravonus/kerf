// The bench: `npx vite --config test/bench/vite.config.mjs --port 3417`, then /bench/?expression=&theme= on the page.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import kerf from '@kerf-js/core/vite'

export default {
  root: join(dirname(fileURLToPath(import.meta.url)), '..'),
  plugins: [kerf()],
  logLevel: 'warn',
}
