// Production builds of each stack, plus each reactive core alone for reactive.mjs. `WEFT=<path>` builds a stack named
// `weft-base` from another copy of packages/weft: that's how the before and after share one bench.
import { dirname, join, resolve } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const base = process.env.WEFT && resolve(process.env.WEFT)
const pkg = base ?? join(here, '../../packages/weft')
const name = base ? 'weft-base' : 'weft'
const weft = (await import(join(pkg, 'vite.mjs'))).default
const alias = [{ find: /^weft\/dom$/, replacement: join(pkg, 'src/dom.ts') }, { find: /^weft$/, replacement: join(pkg, 'src/index.ts') }]
const define = { 'process.env.NODE_ENV': '"production"' }
const stacks = {
  [name]: { root: 'weft', plugins: [weft()], resolve: { alias } },
  ...(base ? {} : {
    solid: { root: 'solid', plugins: [(await import('vite-plugin-solid')).default()] },
    react: { root: 'react', plugins: [(await import('@vitejs/plugin-react')).default()] },
  }),
}
for (const [stack, c] of Object.entries(stacks)) {
  await build({
    ...c, root: join(here, c.root), base: `/${stack}/`, configFile: false, logLevel: 'warn', define,
    build: { outDir: join(here, 'dist', stack), emptyOutDir: true, assetsDir: '.', modulePreload: false, minify: !process.env.NOMIN },
  })
}
// The reactive core alone, for node.
const core = {
  [name]: `export { state, derived, effect, flush, createRoot, stats } from ${JSON.stringify(join(pkg, 'src/index.ts'))}`,
  ...(base ? {} : {
    solid: `export { createSignal, createMemo, createEffect, createRoot, batch } from ${JSON.stringify(join(here, 'node_modules/solid-js/dist/solid.js'))}`,
    alien: `export { signal, computed, effect, startBatch, endBatch } from 'alien-signals'`,
  }),
}
const scratch = join(here, 'dist/.core')
mkdirSync(scratch, { recursive: true })
for (const [lib, code] of Object.entries(core)) {
  const entry = join(scratch, `${lib}.mjs`)
  writeFileSync(entry, code + '\n')
  await build({
    root: here, configFile: false, logLevel: 'warn', define: { ...define, 'import.meta.env.DEV': 'false', 'import.meta.env': '{"DEV":false}' },
    build: { outDir: join(here, 'dist/reactive'), emptyOutDir: false, minify: true, lib: { entry, formats: ['es'], fileName: () => `${lib}.mjs` } },
  })
}
rmSync(scratch, { recursive: true, force: true })
