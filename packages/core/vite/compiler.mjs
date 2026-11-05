import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const { transform } = createRequire(
  join(dirname(dirname(fileURLToPath(import.meta.url))), 'vite.mjs'),
)('./compiler.cjs')
